"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { companyProfileSchema, companySettingsSchema } from "@/lib/validations/company";
import { workingHourIntervalSchema } from "@/lib/validations/professional";
import { z } from "zod";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function updateCompanyProfileAction(input: unknown): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: {
      name: data.name,
      ownerName: data.ownerName,
      phone: data.phone || null,
      whatsapp: data.whatsapp,
      cnpj: data.cnpj || null,
      city: data.city,
      state: data.state,
      address: data.address || null,
      description: data.description || null,
      instagram: data.instagram || null,
      logoUrl: data.logoUrl || null,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      facebookPixelId: data.facebookPixelId || null,
      googleReviewUrl: data.googleReviewUrl || null,
    },
  });

  revalidatePath("/painel/configuracoes");
  return actionSuccess();
}

export async function updateCompanySettingsAction(input: unknown): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const parsed = companySettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  await prisma.companySettings.upsert({
    where: { companyId: session.user.companyId },
    update: data,
    create: { companyId: session.user.companyId, ...data },
  });

  revalidatePath("/painel/configuracoes");
  return actionSuccess();
}

const companyWorkingHoursSchema = z.array(workingHourIntervalSchema);

export async function updateCompanyWorkingHoursAction(input: unknown): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const parsed = companyWorkingHoursSchema.safeParse(input);
  if (!parsed.success) return actionError("Horários inválidos.");
  const hours = parsed.data;

  await prisma.$transaction([
    prisma.workingHour.deleteMany({
      where: { companyId: session.user.companyId, professionalId: null },
    }),
    prisma.workingHour.createMany({
      data: hours.map((h) => ({
        companyId: session.user.companyId,
        professionalId: null,
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
    }),
  ]);

  revalidatePath("/painel/configuracoes/horarios");
  return actionSuccess();
}
