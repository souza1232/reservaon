/**
 * Teste de integração da criação do checkout de cartão via Asaas. Mesmo
 * gate de tests/integration/asaas-webhook.test.ts — precisa de
 * RUN_DB_TESTS=true e um Postgres real. `@/lib/asaas` é mockado pra não
 * bater na API de verdade (a rodada completa contra o sandbox real do
 * Asaas é um passo manual separado, não substituído por este teste — ver
 * plano técnico).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockCompanyId: string | null = null;

vi.mock("@/auth", () => ({
  auth: vi.fn(async () =>
    mockCompanyId
      ? {
          user: {
            id: "admin-teste",
            name: "Admin Teste",
            email: "admin-teste@example.com",
            role: "COMPANY_ADMIN",
            companyId: mockCompanyId,
            professionalId: null,
          },
        }
      : null,
  ),
}));

vi.mock("@/lib/asaas", () => ({
  isAsaasConfigured: () => true,
  createAsaasCustomer: vi.fn(async () => ({ id: "cus_checkout_mock" })),
  createAsaasCheckoutSession: vi.fn(async () => ({
    id: "checkout_mock",
    link: "https://sandbox.asaas.com/checkoutSession/show/checkout_mock",
  })),
  // Não usadas neste fluxo, mas importadas pelo mesmo módulo em billing.ts.
  createAsaasSubscription: vi.fn(),
  getFirstPaymentForSubscription: vi.fn(),
  getPixQrCode: vi.fn(),
}));

describe.skipIf(!RUN)("Checkout de cartão via Asaas (integração com banco real)", () => {
  let planId: string;
  let companyId: string;

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: { name: "Teste Cartão Asaas", slug: `teste-cartao-asaas-${Date.now()}`, priceCents: 4990, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Cartão Asaas",
        ownerName: "Admin",
        email: `empresa-cartao-asaas-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-cartao-asaas-${Date.now()}`,
        planId,
      },
    });
    companyId = company.id;
    mockCompanyId = companyId;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("cria checkout, devolve a URL e salva registro pendente (sem externalSubId ainda)", async () => {
    const { createAsaasCardCheckoutAction } = await import("@/server/actions/billing");

    const result = await createAsaasCardCheckoutAction(planId, "12345678900");
    expect(result.success).toBe(true);
    expect(result.data?.url).toBe("https://sandbox.asaas.com/checkoutSession/show/checkout_mock");

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { companyId } });
    expect(subscription.externalProvider).toBe("asaas");
    expect(subscription.externalPaymentMethod).toBe("credit_card");
    expect(subscription.externalCustomerId).toBe("cus_checkout_mock");
    expect(subscription.externalSubId).toBeNull();
    expect(subscription.status).toBe("PAST_DUE");
  });
});
