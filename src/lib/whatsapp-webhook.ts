import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Confere o header X-Hub-Signature-256 que a Meta envia em todo webhook
 * (HMAC-SHA256 do corpo bruto, usando o App Secret) — é essa assinatura que
 * garante que a requisição realmente veio da Meta antes de confiarmos em
 * qualquer coisa do corpo, inclusive o appointmentId embutido no payload do
 * botão. Sem isso, qualquer um poderia forjar um POST pro webhook e mudar
 * status de agendamento de qualquer empresa.
 */
export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
