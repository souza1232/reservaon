"use server";

import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/slug";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/constants";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { actionError, actionSuccess, type ActionResult } from "./types";

const TRIAL_DAYS = 14;
const RESET_TOKEN_TTL_MINUTES = 60;
const VERIFICATION_TOKEN_TTL_HOURS = 24;

export async function signupCompanyAction(
  input: unknown,
): Promise<ActionResult<{ slug: string; verificationEmailSent: boolean }>> {
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

  let newUser: { id: string; name: string; email: string };

  try {
    newUser = await prisma.$transaction(async (tx) => {
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

      const user = await tx.user.create({
        data: {
          name: ownerName,
          email: normalizedEmail,
          passwordHash,
          role: "COMPANY_ADMIN",
          companyId: company.id,
          // emailVerified fica null aqui de propósito — precisa confirmar
          // o e-mail antes de conseguir entrar (ver src/auth.ts), a menos
          // que EMAIL_SERVER_* não esteja configurado nesta instalação.
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

      return { id: user.id, name: user.name, email: user.email };
    });
  } catch {
    return actionError("Não foi possível concluir o cadastro. Tente novamente.");
  }

  const verificationEmailSent = isEmailConfigured()
    ? await sendVerificationEmail(newUser)
    : false;

  return actionSuccess({ slug, verificationEmailSent });
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Retorna `true` se o e-mail foi mesmo enviado (usado pela tela de cadastro pra decidir a mensagem). */
async function sendVerificationEmail(user: { id: string; name: string; email: string }): Promise<boolean> {
  const rawToken = randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/verificar-email/${rawToken}`;
  const result = await sendEmail({
    to: user.email,
    subject: "Confirme seu e-mail — ReservaOn",
    html: `
      <p>Olá, ${user.name}!</p>
      <p>Falta pouco para começar a usar o ReservaOn. Confirme seu e-mail para liberar o acesso à sua conta.</p>
      <p><a href="${verifyUrl}">Clique aqui para confirmar seu e-mail</a> (válido por ${VERIFICATION_TOKEN_TTL_HOURS} horas).</p>
      <p>Se você não fez este cadastro, pode ignorar este e-mail.</p>
    `,
  });

  return result.sent;
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

export async function verifyEmailAction(rawToken: string): Promise<ActionResult> {
  const tokenHash = hashToken(rawToken);
  const verificationToken = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt < new Date()) {
    return actionError("Este link de confirmação é inválido ou expirou. Solicite um novo.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return actionSuccess(undefined, "E-mail confirmado com sucesso! Faça login para continuar.");
}

/**
 * Sempre retorna sucesso, exista ou não a conta (mesmo raciocínio de
 * requestPasswordResetAction — evita enumeration attack). Também não
 * reenvia se a conta já estiver verificada ou se o e-mail não estiver
 * configurado nesta instalação.
 */
export async function resendVerificationEmailAction(input: unknown): Promise<ActionResult> {
  const generic = actionSuccess(
    undefined,
    "Se existir uma conta pendente de confirmação com esse e-mail, reenviamos o link.",
  );

  const ip = await getClientIp();
  const allowed = await checkRateLimit({
    key: `resend-verification:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!allowed) return generic;

  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  if (!isEmailConfigured()) return generic;

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) {
    await sendVerificationEmail({ id: user.id, name: user.name, email: user.email });
  }

  return generic;
}
