import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Rate limiting simples baseado em banco de dados — funciona corretamente
 * entre múltiplas instâncias serverless (ao contrário de um contador em
 * memória), sem precisar de Redis/Upstash. Adequado para o volume de uma
 * página pública de agendamento; se o tráfego crescer muito, trocar por um
 * rate limiter dedicado (ex: Upstash Ratelimit) é uma migração isolada
 * nesta função, sem tocar nos chamadores.
 */

export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return h.get("x-real-ip") ?? "unknown";
  } catch {
    // `headers()` exige um escopo de requisição real (falta apenas ao chamar
    // a Server Action fora do runtime do Next, como em testes de integração).
    // Degrada para uma chave neutra em vez de derrubar a ação.
    return "unknown";
  }
}

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

/** Retorna `true` se a ação pode prosseguir, `false` se o limite foi atingido. */
export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  const count = await prisma.rateLimitHit.count({
    where: { key, createdAt: { gte: windowStart } },
  });
  if (count >= limit) return false;

  await prisma.rateLimitHit.create({ data: { key } });
  // Limpeza oportunista das batidas antigas desta chave, para não crescer sem limite.
  await prisma.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: windowStart } } });

  return true;
}
