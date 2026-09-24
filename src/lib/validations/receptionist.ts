import { z } from "zod";

export const receptionistSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
});

export type ReceptionistInput = z.infer<typeof receptionistSchema>;
