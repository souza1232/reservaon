import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyAppointmentByWhatsapp } from "@/lib/appointment-notifications";
import {
  offerNextWaitlistEntry,
  autoCompleteDueAppointments,
  syncGoogleCalendarBlocks,
} from "@/lib/appointment-mutations";

/**
 * Disparado 1x por dia pelo Vercel Cron (ver vercel.json — plano Hobby só
 * permite cron diário; num plano Pro dá pra rodar com mais frequência e usar
 * uma janela menor). Varre agendamentos que começam dentro da janela de
 * lembrete (padrão: 24h à frente, configurável via
 * WHATSAPP_REMINDER_LEAD_HOURS) e ainda não receberam um lembrete, e manda
 * um por empresa que tiver "lembrete por WhatsApp" habilitado em
 * Configurações. Idempotente entre execuções: cada tentativa fica
 * registrada em Notification, então um agendamento já processado (mesmo
 * sem sucesso) não é reprocessado.
 *
 * Também aproveita essa mesma execução diária pra varrer ofertas de lista de
 * espera vencidas (ninguém respondeu "Confirmar"/"Não, obrigado" a tempo) e
 * avançar pro próximo da fila, pra auto-concluir agendamentos cujo horário
 * já passou (disparando o pedido de avaliação no Google — ver
 * autoCompleteDueAppointments em src/lib/appointment-mutations.ts), e pro
 * sentido "pull" da sincronização com o Google Agenda dos profissionais
 * conectados (ver syncGoogleCalendarBlocks, mesmo arquivo) — em vez de criar
 * mais crons, que o plano Hobby não permitiria rodar com mais frequência
 * mesmo assim.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const leadHours = Number(process.env.WHATSAPP_REMINDER_LEAD_HOURS) || 24;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { gte: now, lte: windowEnd },
      company: { settings: { notifyOnReminder: true } },
      notifications: { none: { event: "REMINDER" } },
    },
    select: { id: true },
  });

  for (const appointment of appointments) {
    await notifyAppointmentByWhatsapp(appointment.id, "REMINDER");
  }

  const expiredOffers = await prisma.waitlistEntry.findMany({
    where: { status: "OFFERED", offerExpiresAt: { lt: now } },
    select: { id: true, companyId: true, serviceId: true, professionalId: true, startAt: true },
  });

  for (const offer of expiredOffers) {
    await prisma.waitlistEntry.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
    await offerNextWaitlistEntry(offer);
  }

  const { completed: autoCompleted } = await autoCompleteDueAppointments();
  const { synced: googleSynced } = await syncGoogleCalendarBlocks();

  return NextResponse.json({
    processed: appointments.length,
    waitlistExpired: expiredOffers.length,
    autoCompleted,
    googleSynced,
  });
}
