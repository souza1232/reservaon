import { z } from "zod";
import { BRAZILIAN_STATES } from "@/lib/constants";

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa."),
  ownerName: z.string().trim().min(2, "Informe o nome do responsável."),
  phone: z.string().trim().optional().or(z.literal("")),
  whatsapp: z.string().trim().min(10, "Informe um WhatsApp válido com DDD."),
  cnpj: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.enum(BRAZILIAN_STATES),
  address: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  instagram: z.string().trim().optional().or(z.literal("")),
  logoUrl: z.string().trim().url("Informe uma URL de imagem válida.").optional().or(z.literal("")),
  seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(160).optional().or(z.literal("")),
  facebookPixelId: z
    .string()
    .trim()
    .regex(/^\d{10,20}$/, "Informe apenas os números do Pixel ID (ex: 123456789012345).")
    .optional()
    .or(z.literal("")),
  googleReviewUrl: z.string().trim().url("Informe uma URL válida.").optional().or(z.literal("")),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
export type CompanyProfileFormValues = z.input<typeof companyProfileSchema>;

export const companySettingsSchema = z.object({
  slotIntervalMinutes: z.coerce.number().int().min(5).max(120),
  minAdvanceMinutes: z.coerce.number().int().min(0).max(10080),
  maxFutureDays: z.coerce.number().int().min(1).max(365),
  bufferBetweenMinutes: z.coerce.number().int().min(0).max(120),
  notifyOnConfirmation: z.boolean().default(true),
  notifyOnReminder: z.boolean().default(false),
  notifyOnCancellation: z.boolean().default(true),
  notifyOnReschedule: z.boolean().default(true),
  waitlistEnabled: z.boolean().default(false),
  waitlistOfferWindowHours: z.coerce.number().int().min(1).max(72),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
export type CompanySettingsFormValues = z.input<typeof companySettingsSchema>;
