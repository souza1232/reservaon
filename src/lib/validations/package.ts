import { z } from "zod";

export const packageSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do pacote."),
  serviceId: z.string().min(1, "Selecione um serviço."),
  sessionsCount: z.coerce.number().int().min(1, "Informe ao menos 1 sessão."),
  price: z.coerce.number().min(0, "Informe um preço válido."),
  isActive: z.boolean().default(true),
});

export type PackageInput = z.infer<typeof packageSchema>;
/** Forma dos valores no formulário antes da validação/coerção do zod. */
export type PackageFormValues = z.input<typeof packageSchema>;
