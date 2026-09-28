/**
 * Sinal via PIX no agendamento público (ver src/lib/deposit.ts): cobra só em
 * plano pago com o recurso ligado, respeita "Exigir sinal" por serviço,
 * libera o horário quando o prazo vence e confirma quando a empresa marca
 * "Sinal recebido". Mesmo gate dos outros testes de integração
 * (RUN_DB_TESTS=true, rodar via `npm run test:db`).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/availability";

const RUN = process.env.RUN_DB_TESTS === "true";
const TIMEZONE = "America/Sao_Paulo";

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

function nextWeekday(weekday: number, minDays: number): string {
  let d = addDays(new Date(), minDays);
  while (d.getDay() !== weekday) d = addDays(d, 1);
  return formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
}

describe.skipIf(!RUN)("Sinal via PIX (integração com banco real)", () => {
  const stamp = Date.now();
  const mondayISO = nextWeekday(1, 3);
  let paidPlanId: string;
  let freePlanId: string;
  let company: { id: string; slug: string };
  let freeCompany: { id: string; slug: string };
  let professionalId: string;
  let freeProfessionalId: string;
  let serviceWithDeposit: string;
  let serviceWithoutDeposit: string;
  let freeService: string;

  async function createCompany(planId: string, suffix: string, depositEnabled: boolean) {
    const c = await prisma.company.create({
      data: {
        name: `Clínica Sinal ${suffix}`,
        ownerName: "Admin",
        email: `sinal-${suffix}-${stamp}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `clinica-sinal-${suffix}-${stamp}`,
        timezone: TIMEZONE,
        planId,
        settings: {
          create: {
            depositEnabled,
            depositPixKey: "contato@clinica.com",
            depositMode: "PERCENT",
            depositValue: 30,
            depositDeadlineMinutes: 120,
            depositAutoCancel: true,
          },
        },
        workingHours: { create: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }] },
      },
    });
    const p = await prisma.professional.create({
      data: {
        companyId: c.id,
        name: "Profissional",
        workingHours: { create: [{ companyId: c.id, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }] },
      },
    });
    return { company: { id: c.id, slug: c.slug }, professionalId: p.id };
  }

  async function createService(companyId: string, profId: string, requiresDeposit: boolean) {
    const s = await prisma.service.create({
      data: {
        companyId,
        name: requiresDeposit ? "Com sinal" : "Sem sinal",
        priceCents: 10000,
        durationMinutes: 30,
        requiresDeposit,
        professionals: { create: [{ professionalId: profId }] },
      },
    });
    return s.id;
  }

  async function book(slug: string, serviceId: string, profId: string, companyId: string, whatsapp: string) {
    const slots = await getAvailableSlots({ companyId, serviceId, professionalId: profId, dateISO: mondayISO });
    const { createPublicAppointmentAction } = await import("@/server/actions/public-booking");
    const result = await createPublicAppointmentAction(slug, {
      serviceId,
      professionalId: profId,
      startAtISO: slots[0].startAt.toISOString(),
      customerName: "Cliente Teste",
      customerWhatsapp: whatsapp,
    });
    expect(result.success).toBe(true);
    return prisma.appointment.findUniqueOrThrow({ where: { id: result.data!.appointmentId } });
  }

  beforeAll(async () => {
    paidPlanId = (await prisma.plan.create({
      data: { name: "Pago Sinal", slug: `pago-sinal-${stamp}`, priceCents: 4990, isActive: false },
    })).id;
    freePlanId = (await prisma.plan.create({
      data: { name: "Grátis Sinal", slug: `gratis-sinal-${stamp}`, priceCents: 0, isActive: false },
    })).id;

    const paid = await createCompany(paidPlanId, "pago", true);
    company = paid.company;
    professionalId = paid.professionalId;
    serviceWithDeposit = await createService(company.id, professionalId, true);
    serviceWithoutDeposit = await createService(company.id, professionalId, false);

    const free = await createCompany(freePlanId, "gratis", true);
    freeCompany = free.company;
    freeProfessionalId = free.professionalId;
    freeService = await createService(freeCompany.id, freeProfessionalId, true);

    mockCompanyId = company.id;
  }, 90_000); // branch efêmera recém-criada demora pra "acordar"


  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [company.id, freeCompany.id] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [paidPlanId, freePlanId] } } });
  }, 60_000);

  it("cobra 30% de sinal no plano pago, com prazo", async () => {
    const appt = await book(company.slug, serviceWithDeposit, professionalId, company.id, "11911110001");
    expect(appt.depositCents).toBe(3000);
    expect(appt.depositStatus).toBe("PENDING");
    expect(appt.depositDueAt).not.toBeNull();
    expect(appt.status).toBe("PENDING");
  });

  it("não cobra em serviço marcado como sem sinal", async () => {
    const appt = await book(company.slug, serviceWithoutDeposit, professionalId, company.id, "11911110002");
    expect(appt.depositStatus).toBeNull();
    expect(appt.depositCents).toBeNull();
  });

  it("não cobra em empresa do plano grátis, mesmo com o recurso ligado", async () => {
    const appt = await book(freeCompany.slug, freeService, freeProfessionalId, freeCompany.id, "11911110003");
    expect(appt.depositStatus).toBeNull();
  });

  it("prazo vencido libera o horário", async () => {
    const appt = await book(company.slug, serviceWithDeposit, professionalId, company.id, "11911110004");
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { depositDueAt: new Date(Date.now() - 60_000) },
    });

    const { expireOverdueDeposits } = await import("@/lib/deposit-expiry");
    const { expired } = await expireOverdueDeposits(company.id);
    expect(expired).toBe(1);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(after.status).toBe("CANCELED");
    expect(after.depositStatus).toBe("EXPIRED");

    const slots = await getAvailableSlots({
      companyId: company.id,
      serviceId: serviceWithDeposit,
      professionalId,
      dateISO: mondayISO,
    });
    expect(slots.some((s) => s.startAt.getTime() === appt.startAt.getTime())).toBe(true);
  });

  it("'Sinal recebido' confirma o agendamento", async () => {
    const appt = await book(company.slug, serviceWithDeposit, professionalId, company.id, "11911110005");
    const { confirmDepositAction } = await import("@/server/actions/appointments");
    const result = await confirmDepositAction(appt.id);
    expect(result.success).toBe(true);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(after.depositStatus).toBe("PAID");
    expect(after.status).toBe("CONFIRMED");

    // Pago não expira mais.
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { depositDueAt: new Date(Date.now() - 60_000) },
    });
    const { expireOverdueDeposits } = await import("@/lib/deposit-expiry");
    expect((await expireOverdueDeposits(company.id)).expired).toBe(0);
  });
});
