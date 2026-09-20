"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { professionalSchema } from "@/lib/validations/professional";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createProfessionalAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanyAdmin();
  const parsed = professionalSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  if (data.serviceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: data.serviceIds }, companyId: session.user.companyId },
      select: { id: true },
    });
    if (services.length !== data.serviceIds.length) {
      return actionError("Um ou mais serviços selecionados são inválidos.");
    }
  }

  let userId: string | undefined;
  if (data.createLogin) {
    if (!data.email) return actionError("Informe um e-mail para criar o acesso do profissional.");
    if (!data.loginPassword) return actionError("Informe uma senha para o acesso do profissional.");
    const emailLower = data.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingUser) return actionError("Já existe uma conta com este e-mail.");

    const passwordHash = await bcrypt.hash(data.loginPassword, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: emailLower,
        passwordHash,
        role: "PROFESSIONAL",
        companyId: session.user.companyId,
      },
    });
    userId = user.id;
  }

  const professional = await prisma.professional.create({
    data: {
      companyId: session.user.companyId,
      userId,
      name: data.name,
      photoUrl: data.photoUrl || null,
      email: data.email || null,
      phone: data.phone || null,
      specialty: data.specialty || null,
      isActive: data.isActive,
      services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      workingHours: {
        create: data.workingHours.map((wh) => ({
          companyId: session.user.companyId,
          dayOfWeek: wh.dayOfWeek,
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
      },
    },
  });

  revalidatePath("/painel/profissionais");
  return actionSuccess({ id: professional.id });
}

export async function updateProfessionalAction(
  professionalId: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const parsed = professionalSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const existing = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!existing) return actionError("Profissional não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  if (data.serviceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: data.serviceIds }, companyId: session.user.companyId },
      select: { id: true },
    });
    if (services.length !== data.serviceIds.length) {
      return actionError("Um ou mais serviços selecionados são inválidos.");
    }
  }

  await prisma.$transaction([
    prisma.serviceProfessional.deleteMany({ where: { professionalId } }),
    prisma.workingHour.deleteMany({ where: { professionalId } }),
    prisma.professional.update({
      where: { id: professionalId },
      data: {
        name: data.name,
        photoUrl: data.photoUrl || null,
        email: data.email || null,
        phone: data.phone || null,
        specialty: data.specialty || null,
        isActive: data.isActive,
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
        workingHours: {
          create: data.workingHours.map((wh) => ({
            companyId: session.user.companyId,
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/painel/profissionais");
  revalidatePath(`/painel/profissionais/${professionalId}`);
  return actionSuccess();
}

export async function toggleProfessionalActiveAction(
  professionalId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!existing) return actionError("Profissional não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  await prisma.professional.update({ where: { id: professionalId }, data: { isActive } });
  revalidatePath("/painel/profissionais");
  return actionSuccess();
}

export async function deleteProfessionalAction(professionalId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const existing = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!existing) return actionError("Profissional não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  const appointmentsCount = await prisma.appointment.count({ where: { professionalId } });
  if (appointmentsCount > 0) {
    return actionError(
      "Este profissional já possui agendamentos vinculados. Desative-o em vez de excluir.",
    );
  }

  await prisma.professional.delete({ where: { id: professionalId } });
  revalidatePath("/painel/profissionais");
  return actionSuccess();
}
