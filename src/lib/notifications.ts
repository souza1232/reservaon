import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendWhatsappTemplateMessage } from "@/lib/whatsapp-api";
import type { NotificationEvent, NotificationChannel } from "@prisma/client";

/**
 * Estrutura preparada para envio de e-mail (novo agendamento, confirmação,
 * cancelamento, alteração, lembrete), registrando cada tentativa como
 * Notification. Se as variáveis EMAIL_SERVER_* não estiverem configuradas em
 * .env, o sistema continua funcionando normalmente: a notificação fica
 * registrada com status SKIPPED em vez de falhar ou travar o agendamento.
 */

interface SendEmailNotificationParams {
  companyId: string;
  appointmentId?: string;
  event: NotificationEvent;
  to?: string | null;
  subject: string;
  html: string;
}

export async function sendEmailNotification({
  companyId,
  appointmentId,
  event,
  to,
  subject,
  html,
}: SendEmailNotificationParams) {
  const channel: NotificationChannel = "EMAIL";

  if (!to) {
    return prisma.notification.create({
      data: {
        companyId,
        appointmentId,
        event,
        channel,
        status: "SKIPPED",
        payload: { subject, reason: "Sem e-mail do destinatário" },
      },
    });
  }

  const result = await sendEmail({ to, subject, html });

  if (!result.sent) {
    return prisma.notification.create({
      data: {
        companyId,
        appointmentId,
        event,
        channel,
        status: result.error?.startsWith("E-mail não configurado") ? "SKIPPED" : "FAILED",
        payload: { subject, to },
        error: result.error,
      },
    });
  }

  return prisma.notification.create({
    data: {
      companyId,
      appointmentId,
      event,
      channel,
      status: "SENT",
      payload: { subject, to },
      sentAt: new Date(),
    },
  });
}

interface SendWhatsappNotificationParams {
  companyId: string;
  appointmentId?: string;
  event: NotificationEvent;
  to?: string | null;
  templateName: string;
  bodyParams: string[];
  buttons?: { index: number; payload: string }[];
}

export async function sendWhatsappNotification({
  companyId,
  appointmentId,
  event,
  to,
  templateName,
  bodyParams,
  buttons,
}: SendWhatsappNotificationParams) {
  const channel: NotificationChannel = "WHATSAPP";

  if (!to) {
    return prisma.notification.create({
      data: {
        companyId,
        appointmentId,
        event,
        channel,
        status: "SKIPPED",
        payload: { templateName, reason: "Sem WhatsApp do destinatário" },
      },
    });
  }

  const result = await sendWhatsappTemplateMessage({ to, templateName, bodyParams, buttons });

  if (!result.sent) {
    return prisma.notification.create({
      data: {
        companyId,
        appointmentId,
        event,
        channel,
        status: result.error?.startsWith("WhatsApp API não configurada") ? "SKIPPED" : "FAILED",
        payload: { templateName, to, bodyParams },
        error: result.error,
      },
    });
  }

  return prisma.notification.create({
    data: {
      companyId,
      appointmentId,
      event,
      channel,
      status: "SENT",
      payload: { templateName, to, bodyParams },
      sentAt: new Date(),
    },
  });
}
