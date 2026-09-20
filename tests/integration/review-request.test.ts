/**
 * Testa a auto-conclusão de agendamentos vencidos + o pedido de avaliação no
 * Google disparado junto (ver autoCompleteDueAppointments em
 * src/lib/appointment-mutations.ts, chamada pelo cron diário de lembretes).
 * Mesmo gate de tests/integration/booking.test.ts — precisa de
 * RUN_DB_TESTS=true e um Postgres real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { autoCompleteDueAppointments } from "@/lib/appointment-mutations";

const RUN = process.env.RUN_DB_TESTS === "true";

vi.mock("@/lib/whatsapp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp-api")>();
  return {
    ...actual,
    sendWhatsappTemplateMessage: vi.fn().mockResolvedValue({ sent: true }),
  };
});

describe.skipIf(!RUN)("Auto-conclusão + pedido de avaliação (integração com banco real)", () => {
  let originalTemplate: string | undefined;
  let planId: string;
  let companyWithLink: { id: string };
  let companyWithoutLink: { id: string };
  let professionalWithLink: string;
  let professionalWithoutLink: string;
  let serviceWithLink: string;
  let serviceWithoutLink: string;
  let customerWithLink: string;
  let customerWithoutLink: string;

  const pastStartAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h atrás
  const pastEndAt = new Date(Date.now() - 90 * 60 * 1000); // 1h30 atrás

  beforeAll(async () => {
    originalTemplate = process.env.WHATSAPP_TEMPLATE_REVIEW_REQUEST;
    process.env.WHATSAPP_TEMPLATE_REVIEW_REQUEST = "agendamento_pedido_avaliacao";

    const plan = await prisma.plan.create({
      data: { name: "Teste Review", slug: `teste-review-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const withLink = await prisma.company.create({
      data: {
        name: "Empresa Com Link de Avaliação",
        ownerName: "Admin",
        email: `empresa-com-link-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-com-link-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
        googleReviewUrl: "https://g.page/r/exemplo/review",
      },
    });
    companyWithLink = { id: withLink.id };

    const withoutLink = await prisma.company.create({
      data: {
        name: "Empresa Sem Link de Avaliação",
        ownerName: "Admin",
        email: `empresa-sem-link-${Date.now()}@example.com`,
        whatsapp: "11988888888",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-sem-link-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
      },
    });
    companyWithoutLink = { id: withoutLink.id };

    const [profWithLink, profWithoutLink] = await Promise.all([
      prisma.professional.create({ data: { companyId: companyWithLink.id, name: "Prof A" } }),
      prisma.professional.create({ data: { companyId: companyWithoutLink.id, name: "Prof B" } }),
    ]);
    professionalWithLink = profWithLink.id;
    professionalWithoutLink = profWithoutLink.id;

    const [svcWithLink, svcWithoutLink] = await Promise.all([
      prisma.service.create({
        data: { companyId: companyWithLink.id, name: "Serviço A", priceCents: 5000, durationMinutes: 30 },
      }),
      prisma.service.create({
        data: { companyId: companyWithoutLink.id, name: "Serviço B", priceCents: 5000, durationMinutes: 30 },
      }),
    ]);
    serviceWithLink = svcWithLink.id;
    serviceWithoutLink = svcWithoutLink.id;

    const [custWithLink, custWithoutLink] = await Promise.all([
      prisma.customer.create({
        data: { companyId: companyWithLink.id, name: "Cliente A", whatsapp: "5511911111111" },
      }),
      prisma.customer.create({
        data: { companyId: companyWithoutLink.id, name: "Cliente B", whatsapp: "5511922222222" },
      }),
    ]);
    customerWithLink = custWithLink.id;
    customerWithoutLink = custWithoutLink.id;
  });

  afterAll(async () => {
    process.env.WHATSAPP_TEMPLATE_REVIEW_REQUEST = originalTemplate;
    await prisma.company.delete({ where: { id: companyWithLink.id } });
    await prisma.company.delete({ where: { id: companyWithoutLink.id } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("auto-conclui e envia pedido de avaliação quando a empresa tem o link cadastrado", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        companyId: companyWithLink.id,
        customerId: customerWithLink,
        serviceId: serviceWithLink,
        professionalId: professionalWithLink,
        startAt: pastStartAt,
        endAt: pastEndAt,
        status: "CONFIRMED",
        priceCents: 5000,
      },
    });

    const result = await autoCompleteDueAppointments();
    expect(result.completed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe("COMPLETED");

    const notification = await prisma.notification.findFirst({
      where: { appointmentId: appointment.id, event: "REVIEW_REQUEST" },
    });
    expect(notification).not.toBeNull();
    expect(notification?.status).toBe("SENT");
  });

  it("auto-conclui mas não envia pedido de avaliação quando a empresa não tem link cadastrado", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        companyId: companyWithoutLink.id,
        customerId: customerWithoutLink,
        serviceId: serviceWithoutLink,
        professionalId: professionalWithoutLink,
        startAt: pastStartAt,
        endAt: pastEndAt,
        status: "PENDING",
        priceCents: 5000,
      },
    });

    const result = await autoCompleteDueAppointments();
    expect(result.completed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.status).toBe("COMPLETED");

    const notification = await prisma.notification.findFirst({
      where: { appointmentId: appointment.id, event: "REVIEW_REQUEST" },
    });
    expect(notification).toBeNull();
  });

  it("não mexe em agendamento futuro", async () => {
    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 2.5 * 60 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        companyId: companyWithLink.id,
        customerId: customerWithLink,
        serviceId: serviceWithLink,
        professionalId: professionalWithLink,
        startAt: futureStart,
        endAt: futureEnd,
        status: "CONFIRMED",
        priceCents: 5000,
      },
    });

    await autoCompleteDueAppointments();

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(unchanged.status).toBe("CONFIRMED");
  });
});
