import { z } from "zod";

export const publicBookingSchema = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1),
  startAtISO: z.string().min(1, "Selecione um horário."),
  customerName: z.string().trim().min(2, "Informe seu nome."),
  customerWhatsapp: z.string().trim().min(10, "Informe um WhatsApp válido com DDD."),
  customerEmail: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

export const manualAppointmentSchema = z.object({
  customerId: z.string().min(1).optional(),
  newCustomerName: z.string().trim().min(2).optional(),
  newCustomerWhatsapp: z.string().trim().min(10).optional(),
  serviceId: z.string().min(1, "Selecione um serviço."),
  professionalId: z.string().min(1, "Selecione um profissional."),
  startAtISO: z.string().min(1, "Selecione um horário."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ManualAppointmentInput = z.infer<typeof manualAppointmentSchema>;

export const appointmentStatusSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"]),
});

export const blockedTimeSchema = z
  .object({
    professionalId: z.string().optional().or(z.literal("")),
    scope: z.enum(["SPECIFIC_TIME", "PERIOD", "FULL_DAY"]),
    startAtISO: z.string().min(1),
    endAtISO: z.string().min(1),
    reason: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((v) => new Date(v.startAtISO) < new Date(v.endAtISO), {
    message: "O horário final deve ser depois do inicial.",
    path: ["endAtISO"],
  });

export type BlockedTimeInput = z.infer<typeof blockedTimeSchema>;

export const holidaySchema = z.object({
  date: z.string().min(1, "Selecione uma data."),
  description: z.string().trim().max(200).optional().or(z.literal("")),
});

export type HolidayInput = z.infer<typeof holidaySchema>;
