"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { holidaySchema } from "@/lib/validations/appointment";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createHolidayAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanyAdmin();
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  try {
    const holiday = await prisma.holiday.create({
      data: {
        companyId: session.user.companyId,
        date: new Date(`${data.date}T00:00:00.000Z`),
        description: data.description || null,
      },
    });
    revalidatePath("/painel/configuracoes/feriados");
    return actionSuccess({ id: holiday.id });
  } catch {
    return actionError("Já existe um feriado cadastrado para esta data.");
  }
}

export async function deleteHolidayAction(holidayId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!existing) return actionError("Feriado não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  await prisma.holiday.delete({ where: { id: holidayId } });
  revalidatePath("/painel/configuracoes/feriados");
  return actionSuccess();
}
