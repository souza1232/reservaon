"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/guards";
import { reaisToCents } from "@/lib/format";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function setCompanyStatusAction(
  companyId: string,
  status: "ACTIVE" | "BLOCKED",
): Promise<ActionResult> {
  await requireSuperAdmin();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return actionError("Empresa não encontrada.");

  await prisma.company.update({ where: { id: companyId }, data: { status } });
  revalidatePath("/admin/empresas");
  revalidatePath(`/admin/empresas/${companyId}`);
  return actionSuccess();
}

const planSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  price: z.coerce.number().min(0),
  maxProfessionals: z.coerce.number().int().min(1).nullable(),
  maxAppointmentsPerMonth: z.coerce.number().int().min(1).nullable(),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function createPlanAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  if (data.isDefault) {
    await prisma.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const plan = await prisma.plan.create({
    data: {
      name: data.name,
      slug: data.slug,
      priceCents: reaisToCents(data.price),
      maxProfessionals: data.maxProfessionals,
      maxAppointmentsPerMonth: data.maxAppointmentsPerMonth,
      features: data.features,
      isActive: data.isActive,
      isDefault: data.isDefault,
    },
  });

  revalidatePath("/admin/planos");
  return actionSuccess({ id: plan.id });
}

export async function updatePlanAction(planId: string, input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  if (data.isDefault) {
    await prisma.plan.updateMany({
      where: { isDefault: true, id: { not: planId } },
      data: { isDefault: false },
    });
  }

  await prisma.plan.update({
    where: { id: planId },
    data: {
      name: data.name,
      slug: data.slug,
      priceCents: reaisToCents(data.price),
      maxProfessionals: data.maxProfessionals,
      maxAppointmentsPerMonth: data.maxAppointmentsPerMonth,
      features: data.features,
      isActive: data.isActive,
      isDefault: data.isDefault,
    },
  });

  revalidatePath("/admin/planos");
  return actionSuccess();
}
