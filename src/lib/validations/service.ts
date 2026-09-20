import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço."),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Informe um preço válido."),
  durationMinutes: z.coerce.number().int().min(5, "Duração mínima de 5 minutos."),
  imageUrl: z.string().trim().url("Informe uma URL de imagem válida.").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string()).min(1, "Selecione ao menos um profissional."),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
/** Forma dos valores no formulário antes da validação/coerção do zod. */
export type ServiceFormValues = z.input<typeof serviceSchema>;
