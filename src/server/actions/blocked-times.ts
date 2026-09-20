"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanySession } from "@/lib/guards";
import { blockedTimeSchema } from "@/lib/validations/appointment";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createBlockedTimeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanySession();
  const parsed = blockedTimeSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const professionalId = data.professionalId || null;

  if (session.user.role === "PROFESSIONAL") {
    if (professionalId && professionalId !== session.user.professionalId) {
      return actionError("Você só pode bloquear horários na sua própria agenda.");
    }
    if (!professionalId) {
      return actionError("Você só pode bloquear horários na sua própria agenda.");
    }
  }

  if (professionalId) {
    const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
    if (!professional || professional.companyId !== session.user.companyId) {
      return actionError("Profissional inválido.");
    }
  }

  const blocked = await prisma.blockedTime.create({
    data: {
      companyId: session.user.companyId,
      professionalId,
      scope: data.scope,
      startAt: new Date(data.startAtISO),
      endAt: new Date(data.endAtISO),
      reason: data.reason || null,
    },
  });

  revalidatePath("/painel/agenda");
  revalidatePath("/profissional");
  return actionSuccess({ id: blocked.id });
}

export async function deleteBlockedTimeAction(blockedTimeId: string): Promise<ActionResult> {
  const session = await requireCompanySession();
  const existing = await prisma.blockedTime.findUnique({ where: { id: blockedTimeId } });
  if (!existing) return actionError("Bloqueio não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }
  if (
    session.user.role === "PROFESSIONAL" &&
    existing.professionalId !== session.user.professionalId
  ) {
    return actionError("Você só pode remover bloqueios da sua própria agenda.");
  }

  await prisma.blockedTime.delete({ where: { id: blockedTimeId } });
  revalidatePath("/painel/agenda");
  revalidatePath("/profissional");
  return actionSuccess();
}
