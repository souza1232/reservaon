import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Token de acesso para o link do .ics (e qualquer outro endpoint público que
 * sirva dados de um agendamento por ID). Sem isso, o ID do agendamento sozinho
 * — apesar de ser um cuid não sequencial — funcionava como um "capability
 * token" implícito, sem escopo nem revogação. Assina o ID com AUTH_SECRET
 * (já existente, usado pelo NextAuth) em vez de introduzir um segredo novo.
 */

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET não configurado.");
  return secret;
}

export function signAppointmentId(appointmentId: string): string {
  return createHmac("sha256", getSecret()).update(appointmentId).digest("hex").slice(0, 32);
}

export function verifyAppointmentToken(appointmentId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = signAppointmentId(appointmentId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
