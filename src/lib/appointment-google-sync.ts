import "server-only";
import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured, upsertCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";

/**
 * Espelha um agendamento como evento no Google Agenda do profissional
 * (sentido "push" da sincronização — ver plano em
 * C:\Users\Desktop\.claude\plans\fancy-swimming-waffle.md). Chamada nos
 * mesmos pontos onde notifyAppointmentByWhatsapp já é disparada (criação,
 * cancelamento, remarcação, confirmação de vaga da lista de espera), sempre
 * sem `await` bloqueante no fluxo principal — se o profissional não tiver
 * conectado a conta do Google, é um no-op silencioso, mesmo padrão de "sem
 * template configurado = no-op" já usado no resto do app.
 */
export async function syncAppointmentToGoogleCalendar(
  appointmentId: string,
  action: "upsert" | "delete",
): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        professional: { include: { googleCalendarConnection: true } },
        service: true,
        customer: true,
      },
    });
    if (!appointment) return;

    const connection = appointment.professional.googleCalendarConnection;
    if (!connection) return;

    if (action === "delete") {
      if (!appointment.googleEventId) return;
      await deleteCalendarEvent({ connection, eventId: appointment.googleEventId });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleEventId: null },
      });
      return;
    }

    const eventId = await upsertCalendarEvent({
      connection,
      eventId: appointment.googleEventId,
      summary: `${appointment.service.name} — ${appointment.customer.name}`,
      description: appointment.notes ?? undefined,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      appointmentId: appointment.id,
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { googleEventId: eventId },
    });
  } catch (error) {
    // Chamada sempre disparada com `void` (fire-and-forget) pelos pontos de
    // criação/cancelamento/remarcação — uma falha aqui (token revogado,
    // quota da API do Google, rede) nunca pode derrubar o fluxo de
    // agendamento em si, só fica registrada no log do servidor.
    console.error(`[google-calendar-sync] falha ao sincronizar agendamento ${appointmentId}:`, error);
  }
}
