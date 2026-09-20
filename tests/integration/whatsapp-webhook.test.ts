/**
 * Testes de integração do webhook inbound do WhatsApp (botões de
 * confirmar/cancelar). Mesmo gate de tests/integration/booking.test.ts —
 * precisa de RUN_DB_TESTS=true e um Postgres real. O envio da confirmação
 * de volta (sendWhatsappTextMessage) é mockado: o que se testa aqui é a
 * mutação do agendamento e a deduplicação, não a chamada de rede real à Meta.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";

vi.mock("@/lib/whatsapp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp-api")>();
  return { ...actual, sendWhatsappTextMessage: vi.fn().mockResolvedValue({ sent: true }) };
});

function signBody(body: string): string {
  const secret = process.env.FACEBOOK_APP_SECRET!;
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function buttonReplyPayload(buttonId: string, wamid: string) {
  return JSON.stringify({
    entry: [
      {
        id: "waba-id",
        changes: [
          {
            value: {
              messages: [
                {
                  from: "5573999999999",
                  id: wamid,
                  type: "interactive",
                  interactive: { type: "button_reply", button_reply: { id: buttonId, title: "x" } },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe.skipIf(!RUN)("Webhook inbound do WhatsApp (integração com banco real)", () => {
  let planId: string;
  let companyId: string;
  let customerId: string;
  let serviceId: string;
  let professionalId: string;

  beforeAll(async () => {
    if (!process.env.FACEBOOK_APP_SECRET) {
      throw new Error("FACEBOOK_APP_SECRET precisa estar configurado para rodar este teste.");
    }

    const plan = await prisma.plan.create({
      data: { name: "Teste WA", slug: `teste-wa-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste WA",
        ownerName: "Admin",
        email: `empresa-wa-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-wa-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
      },
    });
    companyId = company.id;

    const professional = await prisma.professional.create({
      data: { companyId, name: "Profissional Teste" },
    });
    professionalId = professional.id;

    const service = await prisma.service.create({
      data: { companyId, name: "Serviço Teste", priceCents: 5000, durationMinutes: 30 },
    });
    serviceId = service.id;

    const customer = await prisma.customer.create({
      data: { companyId, name: "Cliente Teste", whatsapp: "5573999999999" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  async function createAppointment(status: "PENDING" | "CONFIRMED" | "COMPLETED") {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return prisma.appointment.create({
      data: {
        companyId,
        customerId,
        serviceId,
        professionalId,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status,
        priceCents: 5000,
      },
    });
  }

  it("confirma um agendamento PENDING ao tocar o botão de confirmar", async () => {
    const appointment = await createAppointment("PENDING");
    const wamid = `wamid.confirm-${appointment.id}`;
    const body = buttonReplyPayload(`confirm:${appointment.id}`, wamid);

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("https://example.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody(body) },
        body,
      }),
    );
    expect(response.status).toBe(200);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe("CONFIRMED");

    const notification = await prisma.notification.findUnique({ where: { whatsappMessageId: wamid } });
    expect(notification?.status).toBe("SENT");
  });

  it("cancela um agendamento CONFIRMED ao tocar o botão de cancelar", async () => {
    const appointment = await createAppointment("CONFIRMED");
    const wamid = `wamid.cancel-${appointment.id}`;
    const body = buttonReplyPayload(`cancel:${appointment.id}`, wamid);

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    await POST(
      new Request("https://example.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody(body) },
        body,
      }),
    );

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe("CANCELED");
  });

  it("ignora reentrega do mesmo wamid (idempotência) sem duplicar processamento", async () => {
    const appointment = await createAppointment("PENDING");
    const wamid = `wamid.dup-${appointment.id}`;
    const body = buttonReplyPayload(`confirm:${appointment.id}`, wamid);
    const signature = signBody(body);

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    await POST(new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body,
    }));

    // Confirma manualmente pra outro status antes da reentrega chegar —
    // se a reentrega reprocessasse, isso seria sobrescrito.
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELED" } });

    await POST(new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body,
    }));

    const afterRedelivery = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(afterRedelivery.status).toBe("CANCELED"); // não voltou a CONFIRMED

    const notifications = await prisma.notification.count({ where: { whatsappMessageId: wamid } });
    expect(notifications).toBe(1);
  });

  it("rejeita toque num botão de agendamento já COMPLETED sem alterar o status", async () => {
    const appointment = await createAppointment("COMPLETED");
    const wamid = `wamid.stale-${appointment.id}`;
    const body = buttonReplyPayload(`cancel:${appointment.id}`, wamid);

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    await POST(new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": signBody(body) },
      body,
    }));

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  it("rejeita requisição com assinatura inválida (400), sem tocar no banco", async () => {
    const appointment = await createAppointment("PENDING");
    const body = buttonReplyPayload(`confirm:${appointment.id}`, `wamid.badsig-${appointment.id}`);

    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await POST(
      new Request("https://example.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000" },
        body,
      }),
    );
    expect(response.status).toBe(400);

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(unchanged.status).toBe("PENDING");
  });
});
