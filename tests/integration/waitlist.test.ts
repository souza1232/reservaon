/**
 * Testes de integração da lista de espera automática. Mesmo gate de
 * tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true e um
 * Postgres real. O envio de WhatsApp (sendWhatsappTemplateMessage/
 * sendWhatsappTextMessage) é mockado: o que se testa aqui é a lógica de
 * fila (quem é avisado, em que ordem, idempotência), não a chamada de rede.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import {
  cancelAppointmentCore,
  claimWaitlistEntry,
  declineWaitlistEntry,
  offerNextWaitlistEntry,
} from "@/lib/appointment-mutations";

const RUN = process.env.RUN_DB_TESTS === "true";

vi.mock("@/lib/whatsapp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp-api")>();
  return {
    ...actual,
    sendWhatsappTemplateMessage: vi.fn().mockResolvedValue({ sent: true }),
    sendWhatsappTextMessage: vi.fn().mockResolvedValue({ sent: true }),
  };
});

describe.skipIf(!RUN)("Lista de espera (integração com banco real)", () => {
  let originalTemplate: string | undefined;
  let planId: string;
  let companyId: string;
  let serviceId: string;
  let professionalId: string;
  let customerAId: string; // dona do agendamento original
  let customerBId: string; // primeira da fila
  let customerCId: string; // segunda da fila
  // Alinhado à grade de slots de 30min gerada a partir de "00:00" (padrão
  // DEFAULT_COMPANY_SETTINGS.slotIntervalMinutes) — assertSlotAvailable só
  // aceita um startAt que bate exatamente com um horário gerado.
  const dateISO = formatInTimeZone(addDays(new Date(), 3), "America/Sao_Paulo", "yyyy-MM-dd");
  const startAt = new Date(`${dateISO}T10:00:00.000-03:00`);

  beforeAll(async () => {
    originalTemplate = process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER;
    process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER = "agendamento_vaga_disponivel";

    const plan = await prisma.plan.create({
      data: { name: "Teste Waitlist", slug: `teste-waitlist-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const allDays = [0, 1, 2, 3, 4, 5, 6];

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Waitlist",
        ownerName: "Admin",
        email: `empresa-waitlist-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-waitlist-${Date.now()}`,
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

    const [customerA, customerB, customerC] = await Promise.all([
      prisma.customer.create({ data: { companyId, name: "Cliente A", whatsapp: "5511911111111" } }),
      prisma.customer.create({ data: { companyId, name: "Cliente B", whatsapp: "5511922222222" } }),
      prisma.customer.create({ data: { companyId, name: "Cliente C", whatsapp: "5511933333333" } }),
    ]);
    customerAId = customerA.id;
    customerBId = customerB.id;
    customerCId = customerC.id;
  });

  afterAll(async () => {
    process.env.WHATSAPP_TEMPLATE_WAITLIST_OFFER = originalTemplate;
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("avisa o primeiro da fila quando o horário libera, e ele confirma a vaga", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        companyId,
        customerId: customerAId,
        serviceId,
        professionalId,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: "CONFIRMED",
        priceCents: 5000,
      },
    });

    const entryB = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerBId, serviceId, professionalId, startAt },
    });
    const entryC = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerCId, serviceId, professionalId, startAt },
    });

    const cancelResult = await cancelAppointmentCore(appointment.id);
    expect(cancelResult.outcome).toBe("ok");
    if (cancelResult.outcome === "ok") {
      await offerNextWaitlistEntry(cancelResult.appointment);
    }

    const offeredB = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryB.id } });
    expect(offeredB.status).toBe("OFFERED");
    expect(offeredB.offerExpiresAt).not.toBeNull();

    const stillWaitingC = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryC.id } });
    expect(stillWaitingC.status).toBe("WAITING");

    const claimResult = await claimWaitlistEntry(entryB.id);
    expect(claimResult.outcome).toBe("ok");
    if (claimResult.outcome === "ok") {
      expect(claimResult.appointment.status).toBe("CONFIRMED");
      expect(claimResult.appointment.customerId).toBe(customerBId);
      expect(claimResult.appointment.startAt.getTime()).toBe(startAt.getTime());
    }

    const claimedB = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryB.id } });
    expect(claimedB.status).toBe("CLAIMED");
  });

  it("quando o primeiro da fila recusa, avisa o segundo em seguida", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        companyId,
        customerId: customerAId,
        serviceId,
        professionalId,
        startAt: new Date(startAt.getTime() + 60 * 60 * 1000), // horário diferente do teste anterior
        endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
        status: "CONFIRMED",
        priceCents: 5000,
      },
    });

    const entryB = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerBId, serviceId, professionalId, startAt: appointment.startAt },
    });
    const entryC = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerCId, serviceId, professionalId, startAt: appointment.startAt },
    });

    const cancelResult = await cancelAppointmentCore(appointment.id);
    if (cancelResult.outcome === "ok") {
      await offerNextWaitlistEntry(cancelResult.appointment);
    }

    const declineResult = await declineWaitlistEntry(entryB.id);
    expect(declineResult.outcome).toBe("ok");

    const declinedB = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryB.id } });
    expect(declinedB.status).toBe("DECLINED");

    const offeredC = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryC.id } });
    expect(offeredC.status).toBe("OFFERED");
  });

  it("recusar uma oferta que já não está mais OFFERED não faz nada (idempotente)", async () => {
    const entry = await prisma.waitlistEntry.create({
      data: { companyId, customerId: customerBId, serviceId, professionalId, startAt, status: "CLAIMED" },
    });

    const result = await declineWaitlistEntry(entry.id);
    expect(result.outcome).toBe("not_offered");

    const unchanged = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(unchanged.status).toBe("CLAIMED");
  });
});
