import "server-only";
import { prisma } from "@/lib/prisma";
import type { SubscriptionStatus } from "@prisma/client";

/**
 * PAST_DUE/CANCELED bloqueiam o acesso da empresa automaticamente (decisão
 * de negócio: sem tolerância, bloqueia assim que o provedor de pagamento
 * reporta falha) — e reativa sozinho quando a assinatura volta a ficar em
 * dia. Compartilhada por qualquer webhook de cobrança (Stripe, Asaas, ...) —
 * só depende do nosso próprio enum de status, nunca de algo específico do
 * provedor. Isso também reverte um bloqueio manual feito por um super admin
 * por outro motivo (ex: abuso), caso a assinatura dessa empresa esteja em
 * dia — não existe hoje um campo para distinguir a origem do bloqueio.
 */
export async function syncCompanyAccess(companyId: string, status: SubscriptionStatus): Promise<void> {
  const shouldBlock = status === "PAST_DUE" || status === "CANCELED";
  await prisma.company.update({
    where: { id: companyId },
    data: { status: shouldBlock ? "BLOCKED" : "ACTIVE" },
  });
}
