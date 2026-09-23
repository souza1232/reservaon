"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function updateCustomerNotesAction(
  customerId: string,
  notes: string,
): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) return actionError("Cliente não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  await prisma.customer.update({ where: { id: customerId }, data: { notes: notes || null } });
  revalidatePath(`/painel/clientes/${customerId}`);
  return actionSuccess();
}

/**
 * Exclusão de dados a pedido do titular (LGPD, art. 18). Anonimiza os dados
 * pessoais em vez de apagar o histórico de agendamentos, que a empresa pode
 * ter necessidade legítima de manter para fins contábeis/operacionais.
 */
export async function eraseCustomerDataAction(customerId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) return actionError("Cliente não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  // Prontuário é dado clínico sensível (LGPD art. 5º, II) sem o mesmo motivo
  // contábil/operacional que justifica manter o histórico de agendamentos —
  // por isso aqui é exclusão de verdade (registro + fotos no Blob), não
  // anonimização.
  const photos = await prisma.clinicalRecordPhoto.findMany({
    where: { clinicalRecord: { customerId } },
    select: { url: true },
  });
  await Promise.all(
    photos.map((photo) =>
      del(photo.url).catch(() => {
        // Segue removendo os registros mesmo se o blob já não existir mais.
      }),
    ),
  );
  await prisma.clinicalRecord.deleteMany({ where: { customerId } });

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: "Cliente removido (LGPD)",
      whatsapp: `removido-${customerId}`,
      email: null,
      notes: null,
      allergies: null,
    },
  });

  revalidatePath("/painel/clientes");
  revalidatePath(`/painel/clientes/${customerId}`);
  return actionSuccess();
}
