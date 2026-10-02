import "server-only";
import { Prisma, type Appointment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsappTemplateMessage } from "@/lib/whatsapp-api";
import { formatDateShort, formatTime } from "@/lib/format";
import { assertSlotAvailable, AvailabilityError } from "@/lib/availability";
import { tryConsumePackageSession, creditBackPackageSession } from "@/lib/package-consumption";
import { notifyReviewRequest } from "@/lib/appointment-notifications";

/**
 * Núcleo das mutações de confirmar/cancelar agendamento, sem exigir sessão
 * logada — usado pelas Server Actions do painel (que fazem a checagem de
 * sessão/dono antes de chamar) E pelo webhook do WhatsApp
 * (src/app/api/webhooks/whatsapp/route.ts), que não tem usuário autenticado:
 * quem autentica a requisição ali é a assinatura HMAC da Meta, não um login.
 *
 * Idempotentes de propósito: a Meta reentrega webhooks, e o cliente pode
 * tocar o mesmo botão mais de uma vez — nenhuma dessas chamadas deve falhar
 * ou duplicar efeito colateral nesses casos, só informar o que já era.
 */

export type MutationOutcome =
  | { outcome: "not_found" }
  | { outcome: "invalid_status"; currentStatus: Appointment["status"] }
  | { outcome: "already_in_state"; appointment: Appointment }
  | { outcome: "ok"; appointment: Appointment };

export async function confirmAppointmentCore(appointmentId: string): Promise<MutationOutcome> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { outcome: "not_found" };

  if (appointment.status === "CONFIRMED") {
    return { outcome: "already_in_state", appointment };
  }
  if (appointment.status !== "PENDING") {
    return { outcome: "invalid_status", currentStatus: appointment.status };
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CONFIRMED" },
  });
  return { outcome: "ok", appointment: updated };
}

export async function cancelAppointmentCore(appointmentId: string): Promise<MutationOutcome> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { outcome: "not_found" };

  if (appointment.status === "CANCELED") {
    return { outcome: "already_in_state", appointment };
  }
  if (appointment.status === "COMPLETED" || appointment.status === "NO_SHOW") {
    return { outcome: "invalid_status", currentStatus: appointment.status };
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELED" },
  });

  if (appointment.customerPackageId) {
    await creditBackPackageSession(appointment.customerPackageId);
  }

  return { outcome: "ok", appointment: updated };
}

/**
 * Checa se alguém está esperando exatamente um horário específico (mesma
 * empresa/serviço/profissional/startAt) que acabou de ficar livre — por
 * cancelamento ou por alguém ter recusado a própria oferta — e, se sim,
 * oferece a vaga pro primeiro da fila via WhatsApp com botões. Ver
 * src/app/api/webhooks/whatsapp/route.ts para o toque de "Quero o
 * horário!"/"Não, obrigado", e src/app/api/cron/whatsapp-reminders/route.ts
 * para o avanço automático quando ninguém responde a tempo. Não é chamada
 * automaticamente por cancelAppointmentCore — cada chamador decide (ver
 * cancelAppointmentAction e o webhook) se dispara sem `await` bloqueante,
 * mesmo padrão de notifyAppointmentByWhatsapp.
 */
interface FreedSlot {
  companyId: string;
  serviceId: string;
  professionalId: string;
  startAt: Date;
}

export async function offerNextWaitlistEntry(appointment: FreedSlot): Promise<void> {
  const templateName = process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER;
  if (!templateName) return;

  const [company, entry] = await Promise.all([
    prisma.company.findUnique({
      where: { id: appointment.companyId },
      include: { settings: true },
    }),
    prisma.waitlistEntry.findFirst({
      where: {
        companyId: appointment.companyId,
        serviceId: appointment.serviceId,
        professionalId: appointment.professionalId,
        startAt: appointment.startAt,
        status: "WAITING",
      },
      orderBy: { createdAt: "asc" },
      include: { customer: true, service: true },
    }),
  ]);
  if (!company?.settings?.waitlistEnabled || !entry) return;

  const offerExpiresAt = new Date(
    Date.now() + company.settings.waitlistOfferWindowHours * 60 * 60 * 1000,
  );

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: "OFFERED", offerExpiresAt },
  });

  await sendWhatsappTemplateMessage({
    to: entry.customer.whatsapp,
    templateName,
    bodyParams: [
      entry.customer.name,
      entry.service.name,
      company.name,
      formatDateShort(entry.startAt, company.timezone),
      formatTime(entry.startAt, company.timezone),
    ],
    buttons: [
      { index: 0, payload: `waitlist_claim:${entry.id}` },
      { index: 1, payload: `waitlist_decline:${entry.id}` },
    ],
  });
}

export type WaitlistClaimOutcome =
  | { outcome: "not_found" }
  | { outcome: "not_offered" }
  | { outcome: "expired" }
  | { outcome: "slot_taken" }
  | { outcome: "ok"; appointment: Appointment };

/**
 * Toque em "Quero o horário!" — cria o agendamento de verdade pra quem foi
 * chamado da fila. Reusa a mesma transação serializável +
 * assertSlotAvailable do agendamento público como segurança extra (ainda
 * que, na prática, ninguém mais deveria estar de olho nesse horário exato).
 */
export async function claimWaitlistEntry(entryId: string): Promise<WaitlistClaimOutcome> {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: { service: true, company: true },
  });
  if (!entry) return { outcome: "not_found" };
  if (entry.status !== "OFFERED") return { outcome: "not_offered" };
  if (entry.offerExpiresAt && entry.offerExpiresAt.getTime() < Date.now()) {
    return { outcome: "expired" };
  }

  const endAt = new Date(entry.startAt.getTime() + entry.service.durationMinutes * 60_000);

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        await assertSlotAvailable({
          companyId: entry.companyId,
          serviceId: entry.serviceId,
          professionalId: entry.professionalId,
          startAt: entry.startAt,
          timezone: entry.company.timezone,
          client: tx,
        });

        const packageUsed = await tryConsumePackageSession(tx, {
          companyId: entry.companyId,
          customerId: entry.customerId,
          serviceId: entry.serviceId,
        });

        const created = await tx.appointment.create({
          data: {
            companyId: entry.companyId,
            customerId: entry.customerId,
            serviceId: entry.serviceId,
            professionalId: entry.professionalId,
            startAt: entry.startAt,
            endAt,
            status: "CONFIRMED",
            priceCents: packageUsed ? 0 : entry.service.priceCents,
            customerPackageId: packageUsed?.customerPackageId,
          },
        });

        await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "CLAIMED" } });

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { outcome: "ok", appointment };
  } catch (error) {
    if (
      error instanceof AvailabilityError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2028"))
    ) {
      // Alguém ocupou o horário por outro caminho — libera a vaga pro próximo da fila.
      await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: "DECLINED" } });
      await offerNextWaitlistEntry(entry);
      return { outcome: "slot_taken" };
    }
    throw error;
  }
}

export type WaitlistDeclineOutcome = { outcome: "not_found" } | { outcome: "not_offered" } | { outcome: "ok" };

/** Toque em "Não, obrigado" — libera a vaga pro próximo da fila, na hora. */
export async function declineWaitlistEntry(entryId: string): Promise<WaitlistDeclineOutcome> {
  const entry = await prisma.waitlistEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { outcome: "not_found" };
  if (entry.status !== "OFFERED") return { outcome: "not_offered" };

  await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: "DECLINED" } });
  await offerNextWaitlistEntry(entry);
  return { outcome: "ok" };
}

/**
 * Auto-conclui agendamentos cujo horário já passou e ainda estão
 * PENDING/CONFIRMED (a empresa nunca marca manualmente na maioria dos
 * casos), e dispara o pedido de avaliação no Google pra cada um (ver
 * notifyReviewRequest — é um no-op silencioso se a empresa não tiver
 * cadastrado o link). Chamada 1x por dia pelo cron de lembretes (ver
 * src/app/api/cron/whatsapp-reminders/route.ts) — o plano Hobby da Vercel
 * não permite um cron dedicado rodando com mais frequência, mesmo raciocínio
 * já usado ali pra varredura da lista de espera vencida.
 *
 * Trade-off aceito: um no-show também vira COMPLETED sozinho (a empresa pode
 * corrigir pra NO_SHOW manualmente depois se quiser; o pedido de avaliação
 * já terá sido disparado).
 */
export async function autoCompleteDueAppointments(): Promise<{ completed: number }> {
  const due = await prisma.appointment.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED"] }, endAt: { lt: new Date() } },
    select: { id: true },
  });
  if (due.length === 0) return { completed: 0 };

  await prisma.appointment.updateMany({
    where: { id: { in: due.map((a) => a.id) } },
    data: { status: "COMPLETED" },
  });

  for (const appointment of due) {
    await notifyReviewRequest(appointment.id);
  }

  return { completed: due.length };
}
