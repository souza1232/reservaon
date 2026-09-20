"use server";

import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/slug";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { actionError, actionSuccess, type ActionResult } from "./types";

const TRIAL_DAYS = 14;
const RESET_TOKEN_TTL_MINUTES = 60;

export async function signupCompanyAction(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { companyName, ownerName, email, whatsapp, city, state, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [existingUser, existingCompanyEmail] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
    prisma.company.findUnique({ where: { email: normalizedEmail } }),
  ]);

  if (existingUser || existingCompanyEmail) {
    return actionError("Já existe uma conta cadastrada com este e-mail.");
  }

  const baseSlug = slugify(companyName) || "empresa";
  let slug = baseSlug;
  let attempt = 1;
  while (await prisma.company.findUnique({ where: { slug }, select: { id: true } })) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const defaultPlan =
    (await prisma.plan.findFirst({ where: { isDefault: true, isActive: true } })) ??
    (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { priceCents: "asc" } }));

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          ownerName,
          email: normalizedEmail,
          whatsapp,
          city,
          state,
          slug,
          planId: defaultPlan?.id,
          settings: { create: { ...DEFAULT_COMPANY_SETTINGS } },
        },
      });

      await tx.user.create({
        data: {
          name: ownerName,
          email: normalizedEmail,
          passwordHash,
          role: "COMPANY_ADMIN",
          companyId: company.id,
        },
      });

      if (defaultPlan) {
        await tx.subscription.create({
          data: {
            companyId: company.id,
            planId: defaultPlan.id,
            status: "TRIAL",
            startDate: new Date(),
            renewalDate: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      }
    });
  } catch {
    return actionError("Não foi possível concluir o cadastro. Tente novamente.");
  }

  return actionSuccess({ slug });
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Sempre retorna sucesso, exista ou não uma conta com esse e-mail — isso
 * evita que o formulário seja usado para descobrir quais e-mails têm conta
 * (enumeration attack). Se o e-mail não estiver configurado
 * (EMAIL_SERVER_*), o link de redefinição fica registrado mas não é
 * enviado de verdade; o usuário precisa contatar o suporte nesse caso.
 */
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const ip = await getClientIp();
  const allowed = await checkRateLimit({
    key: `password-reset:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) {
    return actionSuccess(
      undefined,
      "Se existir uma conta com esse e-mail, enviamos um link de redefinição.",
    );
  }

  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/redefinir-senha/${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: "Redefinir sua senha — ReservaOn",
      html: `
        <p>Olá, ${user.name}!</p>
        <p>Recebemos uma solicitação para redefinir sua senha no ReservaOn.</p>
        <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (válido por ${RESET_TOKEN_TTL_MINUTES} minutos).</p>
        <p>Se você não pediu isso, pode ignorar este e-mail.</p>
      `,
    });
  }

  return actionSuccess(undefined, "Se existir uma conta com esse e-mail, enviamos um link de redefinição.");
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const tokenHash = hashToken(parsed.data.token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return actionError("Este link de redefinição é inválido ou expirou. Solicite um novo.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return actionSuccess(undefined, "Senha redefinida com sucesso. Faça login com a nova senha.");
}
