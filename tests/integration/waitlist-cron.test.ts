/**
 * Testa a varredura de ofertas de lista de espera vencidas, dentro do cron
 * diário de lembrete (src/app/api/cron/whatsapp-reminders/route.ts). Mesmo
 * gate de tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";

vi.mock("@/lib/whatsapp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp-api")>();
  return {
    ...actual,
    sendWhatsappTemplateMessage: vi.fn().mockResolvedValue({ sent: true }),
  };
});

describe.skipIf(!RUN)("Varredura de ofertas vencidas (cron diário)", () => {
  let originalCronSecret: string | undefined;
  let originalTemplate: string | undefined;
  let planId: string;
  let companyId: string;
  let serviceId: string;
  let professionalId: string;
  let customerBId: string;
  let customerCId: string;

  beforeAll(async () => {
    originalCronSecret = process.env.CRON_SECRET;
    originalTemplate = process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER;
    delete process.env.CRON_SECRET; // não é o alvo deste teste
    process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER = "agendamento_vaga_disponivel";

    const plan = await prisma.plan.create({
      data: { name: "Teste Cron Waitlist", slug: `teste-cron-waitlist-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Cron Waitlist",
        ownerName: "Admin",
        email: `empresa-cron-waitlist-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-cron-waitlist-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
        settings: { create: { waitlistEnabled: true, waitlistOfferWindowHours: 6 } },
        workingHours: {
          create: allDays.map((dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "23:59" })),
        },
      },
    });
    companyId = company.id;

    const professional = await prisma.professional.create({
      data: {
        companyId,
        name: "Profissional Teste",
        workingHours: {
          create: allDays.map((dayOfWeek) => ({
            companyId,
            dayOfWeek,
            startTime: "00:00",
            endTime: "23:59",
          })),
        },
      },
    });
    professionalId = professional.id;

    const service = await prisma.service.create({
      data: {
        companyId,
        name: "Serviço Teste",
        priceCents: 5000,
        durationMinutes: 30,
        professionals: { create: [{ professionalId }] },
      },
    });
    serviceId = service.id;

    const [customerB, customerC] = await Promise.all([
      prisma.customer.create({ data: { companyId, name: "Cliente B", whatsapp: "5511922222222" } }),
      prisma.customer.create({ data: { companyId, name: "Cliente C", whatsapp: "5511933333333" } }),
    ]);
    customerBId = customerB.id;
    customerCId = customerC.id;
  });

  afterAll(async () => {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER = originalTemplate;
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("expira ofertas vencidas e avisa o próximo da fila", async () => {
    const dateISO = formatInTimeZone(addDays(new Date(), 3), "America/Sao_Paulo", "yyyy-MM-dd");
    const startAt = new Date(`${dateISO}T14:00:00.000-03:00`);

    const entryB = await prisma.waitlistEntry.create({
      data: {
        companyId,
        customerId: customerBId,
        serviceId,
        professionalId,
        startAt,
        status: "OFFERED",
        offerExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // venceu há 1h
      },
    });
    const entryC = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerCId, serviceId, professionalId, startAt },
    });

    const { GET } = await import("@/app/api/cron/whatsapp-reminders/route");
    const response = await GET(new Request("https://example.com/api/cron/whatsapp-reminders"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.waitlistExpired).toBeGreaterThanOrEqual(1);

    const expiredB = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryB.id } });
    expect(expiredB.status).toBe("EXPIRED");

    const offeredC = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryC.id } });
    expect(offeredC.status).toBe("OFFERED");
  });
});
