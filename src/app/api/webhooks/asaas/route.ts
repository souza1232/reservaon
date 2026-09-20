import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { isAsaasConfigured } from "@/lib/asaas";
import { syncCompanyAccess } from "@/lib/subscription-access";
import type { SubscriptionStatus } from "@prisma/client";

/**
 * Webhook do Asaas. Cadastre em Configurações → Integrações → Webhooks,
 * apontando para https://SEU_DOMINIO/api/webhooks/asaas, com o mesmo valor
 * de ASAAS_WEBHOOK_TOKEN no campo de token. Diferente do Stripe/Meta, o
 * Asaas não assina o corpo — ele só ecoa esse token fixo no header
 * asaas-access-token, então a checagem é uma comparação direta.
 */

function mapAsaasEvent(event: string): SubscriptionStatus | null {
  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") return "ACTIVE";
  if (event === "PAYMENT_OVERDUE") return "PAST_DUE";
  if (event.includes("DELETED") || event.includes("CANCEL")) return "CANCELED";
  return null;
}

function timingSafeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  if (!isAsaasConfigured() || !process.env.ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ received: false, reason: "not_configured" }, { status: 200 });
  }

  const token = req.headers.get("asaas-access-token");
  if (!token || !timingSafeTokenEqual(token, process.env.ASAAS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const body = await req.json();
  const status = mapAsaasEvent(body?.event);
  const asaasSubscriptionId: string | undefined = body?.payment?.subscription;

  if (status && asaasSubscriptionId) {
    const subscription = await prisma.subscription.findFirst({
      where: { externalSubId: asaasSubscriptionId },
      select: { companyId: true },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { companyId: subscription.companyId },
        data: {
          status,
          canceledAt: status === "CANCELED" ? new Date() : null,
          renewalDate: body?.payment?.dueDate ? new Date(body.payment.dueDate) : undefined,
        },
      });
      await syncCompanyAccess(subscription.companyId, status);
    }
  }

  return NextResponse.json({ received: true });
}
