/**
 * Testes de integração do webhook do Asaas. Mesmo gate de
 * tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true e um
 * Postgres real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";
const WEBHOOK_TOKEN = "test-asaas-webhook-token";

function asaasEvent(event: string, subscriptionId: string) {
  return JSON.stringify({
    event,
    payment: { subscription: subscriptionId, dueDate: "2026-11-01" },
  });
}

describe.skipIf(!RUN)("Webhook do Asaas (integração com banco real)", () => {
  let originalApiKey: string | undefined;
  let originalWebhookToken: string | undefined;
  let planId: string;
  let companyId: string;

  beforeAll(async () => {
    originalApiKey = process.env.ASAAS_API_KEY;
    originalWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    process.env.ASAAS_API_KEY = "test-key";
    process.env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;

    const plan = await prisma.plan.create({
      data: { name: "Teste Asaas", slug: `teste-asaas-${Date.now()}`, priceCents: 4990, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Asaas",
        ownerName: "Admin",
        email: `empresa-asaas-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-asaas-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
        status: "ACTIVE",
      },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    process.env.ASAAS_API_KEY = originalApiKey;
    process.env.ASAAS_WEBHOOK_TOKEN = originalWebhookToken;
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  beforeEach(async () => {
    await prisma.subscription.deleteMany({ where: { companyId } });
  });

  async function createSubscription(status: "PAST_DUE" | "ACTIVE") {
    return prisma.subscription.create({
      data: {
        companyId,
        planId,
        status,
        externalProvider: "asaas",
        externalCustomerId: "cus_teste",
        externalSubId: `sub_teste_${Date.now()}`,
      },
    });
  }

  it("PAYMENT_CONFIRMED ativa a assinatura e desbloqueia a empresa", async () => {
    const subscription = await createSubscription("PAST_DUE");
    await prisma.company.update({ where: { id: companyId }, data: { status: "BLOCKED" } });

    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const response = await POST(
      new Request("https://example.com/api/webhooks/asaas", {
        method: "POST",
        headers: { "asaas-access-token": WEBHOOK_TOKEN },
        body: asaasEvent("PAYMENT_CONFIRMED", subscription.externalSubId!),
      }),
    );
    expect(response.status).toBe(200);

    const updatedSub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    expect(updatedSub.status).toBe("ACTIVE");

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe("ACTIVE");
  });

  it("PAYMENT_OVERDUE bloqueia a empresa", async () => {
    const subscription = await createSubscription("ACTIVE");

    const { POST } = await import("@/app/api/webhooks/asaas/route");
    await POST(
      new Request("https://example.com/api/webhooks/asaas", {
        method: "POST",
        headers: { "asaas-access-token": WEBHOOK_TOKEN },
        body: asaasEvent("PAYMENT_OVERDUE", subscription.externalSubId!),
      }),
    );

    const updatedSub = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    expect(updatedSub.status).toBe("PAST_DUE");

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe("BLOCKED");
  });

  it("rejeita token inválido (400), sem alterar o banco", async () => {
    const subscription = await createSubscription("ACTIVE");

    const { POST } = await import("@/app/api/webhooks/asaas/route");
    const response = await POST(
      new Request("https://example.com/api/webhooks/asaas", {
        method: "POST",
        headers: { "asaas-access-token": "token-errado" },
        body: asaasEvent("PAYMENT_OVERDUE", subscription.externalSubId!),
      }),
    );
    expect(response.status).toBe(400);

    const unchanged = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    expect(unchanged.status).toBe("ACTIVE");
  });
});
