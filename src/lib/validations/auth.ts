import { z } from "zod";

// Fica em 6 aqui de propósito, mesmo com signup/redefinição exigindo 8+
// agora — contas antigas podem ter senha de 6/7 caracteres, e login não é
// o lugar de forçar troca (bumpar esse mínimo bloquearia login de quem já
// tem conta, mesmo com a senha certa).
export const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa."),
  ownerName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().email("Informe um e-mail válido."),
  whatsapp: z
    .string()
    .trim()
    .min(10, "Informe um WhatsApp válido com DDD.")
    .max(20, "Número inválido."),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.string().trim().length(2, "Use a sigla do estado (ex: SP)."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
