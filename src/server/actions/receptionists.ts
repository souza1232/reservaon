"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { receptionistSchema } from "@/lib/validations/receptionist";
import { actionError, actionSuccess, type ActionResult } from "./types";

/**
 * Cria login de recepcionista — mesmo padrão de criação de conta usado em
 * createProfessionalAction (src/server/actions/professionals.ts), mas sem
 * linha em Professional: recepcionista não atende, só gerencia agenda e
 * clientes da empresa inteira (ver guards.ts, requireCompanySession).
 */
export async function createReceptionistAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanyAdmin();
  const parsed = receptionistSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const emailLower = data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existingUser) return actionError("Já existe uma conta com este e-mail.");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: emailLower,
      passwordHash,
      role: "RECEPTIONIST",
      companyId: session.user.companyId,
      // Já nasce verificado — criado por um admin autenticado, não por
      // autocadastro público (mesma lógica de createProfessionalAction).
      emailVerified: new Date(),
    },
  });

  revalidatePath("/painel/recepcionistas");
  return actionSuccess({ id: user.id });
}

export async function deleteReceptionistAction(userId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.companyId !== session.user.companyId || user.role !== "RECEPTIONIST") {
    return actionError("Usuário não encontrado.");
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/painel/recepcionistas");
  return actionSuccess();
}
