import "server-only";
import { prisma } from "@/lib/prisma";
import { cancelAppointmentCore, offerNextWaitlistEntry } from "@/lib/appointment-mutations";
import { notifyAppointmentByWhatsapp } from "@/lib/appointment-notifications";

/**
 * Libera horários cujo sinal via PIX venceu sem a empresa confirmar o
 * pagamento (só nas empresas com "liberar automaticamente" ligado). O cron
 * da Vercel no plano Hobby só roda 1x/dia — por isso isto também é chamado
 * "sob demanda" antes de mostrar horários livres, antes de criar um
 * agendamento e ao abrir a agenda: assim um prazo de 2h é respeitado na
 * prática, sem depender do cron. Idempotente (só pega depositStatus PENDING).
 */
export async function expireOverdueDeposits(companyId?: string): Promise<{ expired: number }> {
  const overdue = await prisma.appointment.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      depositStatus: "PENDING",
      depositDueAt: { lt: new Date() },
      status: "PENDING",
      company: { settings: { depositAutoCancel: true } },
    },
    select: { id: true },
  });

  let expired = 0;
  for (const { id } of overdue) {
    // Marca antes de cancelar: se duas requisições chegarem juntas, só a
    // primeira passa por aqui (updateMany com o filtro de PENDING).
    const claimed = await prisma.appointment.updateMany({
      where: { id, depositStatus: "PENDING" },
      data: { depositStatus: "EXPIRED" },
    });
    if (claimed.count === 0) continue;

    const result = await cancelAppointmentCore(id);
    if (result.outcome === "ok") {
      expired++;
      void notifyAppointmentByWhatsapp(id, "CANCELLATION");
      void offerNextWaitlistEntry(result.appointment);
    }
  }
  return { expired };
}
