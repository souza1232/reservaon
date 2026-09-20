import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDateShort, formatTime } from "@/lib/format";
import { sendWhatsappNotification } from "@/lib/notifications";

type AppointmentNotificationEvent = "CONFIRMATION" | "CANCELLATION" | "RESCHEDULE" | "REMINDER";

const EVENT_CONFIG: Record<
  AppointmentNotificationEvent,
  {
    settingsKey: "notifyOnConfirmation" | "notifyOnCancellation" | "notifyOnReschedule" | "notifyOnReminder";
    templateEnvVar: string;
    defaultEnabled: boolean;
  }
> = {
  CONFIRMATION: {
    settingsKey: "notifyOnConfirmation",
    templateEnvVar: "WHATSAPP_TEMPLATE_CONFIRMATION",
    defaultEnabled: true,
  },
  CANCELLATION: {
    settingsKey: "notifyOnCancellation",
    templateEnvVar: "WHATSAPP_TEMPLATE_CANCELLATION",
    defaultEnabled: true,
  },
  RESCHEDULE: {
    settingsKey: "notifyOnReschedule",
    templateEnvVar: "WHATSAPP_TEMPLATE_RESCHEDULE",
    defaultEnabled: true,
  },
  REMINDER: {
    settingsKey: "notifyOnReminder",
    templateEnvVar: "WHATSAPP_TEMPLATE_REMINDER",
    defaultEnabled: false,
  },
};

/**
 * Ponto único chamado sempre que um agendamento muda de estado (criado,
 * cancelado, remarcado) ou precisa de lembrete. Decide sozinho se deve
 * enviar (respeitando a preferência da empresa em Configurações e se o
 * template correspondente está configurado) e registra a tentativa na
 * tabela Notification independentemente do resultado.
 *
 * Sem nenhuma credencial/template configurado, é um no-op silencioso — nunca
 * lança erro nem atrasa a resposta ao usuário (sempre chame com `void` ou
 * sem `await` bloqueante no fluxo principal).
 */
export async function notifyAppointmentByWhatsapp(
  appointmentId: string,
  event: AppointmentNotificationEvent,
): Promise<void> {
  const config = EVENT_CONFIG[event];
  const templateName = process.env[config.templateEnvVar];
  if (!templateName) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      company: { include: { settings: true } },
      customer: true,
    },
  });
  if (!appointment) return;

  const enabled = appointment.company.settings
    ? appointment.company.settings[config.settingsKey]
    : config.defaultEnabled;
  if (!enabled) return;

  // No lembrete, se o template com botões "Confirmar presença"/"Cancelar"
  // já estiver aprovado na Meta (WHATSAPP_TEMPLATE_REMINDER_INTERACTIVE),
  // usa ele em vez do texto simples — o cliente responde direto pelo
  // WhatsApp (ver src/app/api/webhooks/whatsapp/route.ts). Sem essa
  // variável configurada, continua exatamente como antes.
  const interactiveTemplate =
    event === "REMINDER" ? process.env.WHATSAPP_TEMPLATE_REMINDER_INTERACTIVE : undefined;

  await sendWhatsappNotification({
    companyId: appointment.companyId,
    appointmentId: appointment.id,
    event,
    to: appointment.customer.whatsapp,
    templateName: interactiveTemplate || templateName,
    bodyParams: [
      appointment.customer.name,
      appointment.company.name,
      formatDateShort(appointment.startAt, appointment.company.timezone),
      formatTime(appointment.startAt, appointment.company.timezone),
    ],
    buttons: interactiveTemplate
      ? [
          { index: 0, payload: `confirm:${appointment.id}` },
          { index: 1, payload: `cancel:${appointment.id}` },
        ]
      : undefined,
  });
}

/**
 * Pedido de avaliação no Google, disparado pelo cron de auto-conclusão (ver
 * src/app/api/cron/whatsapp-reminders/route.ts) quando um agendamento vira
 * COMPLETED sozinho. Separado de notifyAppointmentByWhatsapp porque o
 * "ligado/desligado" aqui não vem de CompanySettings — vem de a empresa ter
 * cadastrado `Company.googleReviewUrl` em Configurações (sem link = recurso
 * desligado pra ela) — e o corpo da mensagem tem uma variável a mais (o
 * link), diferente do padrão de 4 variáveis dos outros templates.
 */
export async function notifyReviewRequest(appointmentId: string): Promise<void> {
  const templateName = process.env.WHATSAPP_TEMPLATE_REVIEW_REQUEST;
  if (!templateName) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { company: true, customer: true },
  });
  if (!appointment) return;
  if (!appointment.company.googleReviewUrl) return;

  await sendWhatsappNotification({
    companyId: appointment.companyId,
    appointmentId: appointment.id,
    event: "REVIEW_REQUEST",
    to: appointment.customer.whatsapp,
    templateName,
    bodyParams: [
      appointment.customer.name,
      appointment.company.name,
      appointment.company.googleReviewUrl,
    ],
  });
}
