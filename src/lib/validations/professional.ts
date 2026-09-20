import { z } from "zod";

export const workingHourIntervalSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "O horário final deve ser depois do inicial.",
    path: ["endTime"],
  });

export type WorkingHourIntervalInput = z.infer<typeof workingHourIntervalSchema>;

export const professionalSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do profissional."),
  photoUrl: z.string().trim().url("Informe uma URL de imagem válida.").optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  specialty: z.string().trim().max(120).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  serviceIds: z.array(z.string()).default([]),
  workingHours: z.array(workingHourIntervalSchema).default([]),
  createLogin: z.boolean().default(false),
  loginPassword: z.string().min(6).optional().or(z.literal("")),
});

export type ProfessionalInput = z.infer<typeof professionalSchema>;
/** Forma dos valores no formulário antes da validação/coerção do zod. */
export type ProfessionalFormValues = z.input<typeof professionalSchema>;
