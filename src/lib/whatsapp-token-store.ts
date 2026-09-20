import "server-only";
import { prisma } from "./prisma";

/**
 * Fonte da verdade para o token de acesso da WhatsApp Cloud API.
 * O token vive no banco (renovado pelo cron /api/cron/whatsapp-token-refresh)
 * em vez de só na env var, porque trocar uma env var na Vercel não afeta
 * invocações já em execução sem um novo deploy — gravando no banco, a
 * próxima chamada já enxerga o token novo. WHATSAPP_API_TOKEN no ambiente
 * continua servindo como valor inicial/fallback (primeiro boot, ou se o
 * banco ainda não tiver a linha).
 */

const PROVIDER = "whatsapp";

export async function getWhatsappAccessToken(): Promise<string | null> {
  const row = await prisma.integrationToken.findUnique({
    where: { provider: PROVIDER },
  });
  if (row?.accessToken) return row.accessToken;
  return process.env.WHATSAPP_API_TOKEN || null;
}

export async function getWhatsappTokenExpiry(): Promise<Date | null> {
  const row = await prisma.integrationToken.findUnique({
    where: { provider: PROVIDER },
  });
  return row?.expiresAt ?? null;
}

export async function saveWhatsappAccessToken(
  accessToken: string,
  expiresAt: Date,
): Promise<void> {
  await prisma.integrationToken.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, accessToken, expiresAt },
    update: { accessToken, expiresAt },
  });
}
