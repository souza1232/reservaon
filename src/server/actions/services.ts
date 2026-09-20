"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { serviceSchema } from "@/lib/validations/service";
import { reaisToCents } from "@/lib/format";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createServiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanyAdmin();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const professionals = await prisma.professional.findMany({
    where: { id: { in: data.professionalIds }, companyId: session.user.companyId },
    select: { id: true },
  });
  if (professionals.length !== data.professionalIds.length) {
    return actionError("Um ou mais profissionais selecionados são inválidos.");
  }

  const service = await prisma.service.create({
    data: {
      companyId: session.user.companyId,
      name: data.name,
      description: data.description || null,
      priceCents: reaisToCents(data.price),
      durationMinutes: data.durationMinutes,
      imageUrl: data.imageUrl || null,
      isActive: data.isActive,
      professionals: {
        create: data.professionalIds.map((professionalId) => ({ professionalId })),
      },
    },
  });

  revalidatePath("/painel/servicos");
  return actionSuccess({ id: service.id });
}

export async function updateServiceAction(
  serviceId: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) return actionError("Serviço não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  const professionals = await prisma.professional.findMany({
    where: { id: { in: data.professionalIds }, companyId: session.user.companyId },
    select: { id: true },
  });
  if (professionals.length !== data.professionalIds.length) {
    return actionError("Um ou mais profissionais selecionados são inválidos.");
  }

  await prisma.$transaction([
    prisma.serviceProfessional.deleteMany({ where: { serviceId } }),
    prisma.service.update({
      where: { id: serviceId },
      data: {
        name: data.name,
        description: data.description || null,
        priceCents: reaisToCents(data.price),
        durationMinutes: data.durationMinutes,
        imageUrl: data.imageUrl || null,
        isActive: data.isActive,
        professionals: {
          create: data.professionalIds.map((professionalId) => ({ professionalId })),
        },
      },
    }),
  ]);

  revalidatePath("/painel/servicos");
  return actionSuccess();
}

export async function toggleServiceActiveAction(
  serviceId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) return actionError("Serviço não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  await prisma.service.update({ where: { id: serviceId }, data: { isActive } });
  revalidatePath("/painel/servicos");
  return actionSuccess();
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) return actionError("Serviço não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  const appointmentsCount = await prisma.appointment.count({ where: { serviceId } });
  if (appointmentsCount > 0) {
    return actionError(
      "Este serviço já possui agendamentos vinculados. Desative-o em vez de excluir.",
    );
  }

  await prisma.service.delete({ where: { id: serviceId } });
  revalidatePath("/painel/servicos");
  return actionSuccess();
}
