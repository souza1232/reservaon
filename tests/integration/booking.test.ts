/**
 * Testes de integração — precisam de um PostgreSQL real (o mesmo schema do
 * app) e são desabilitados por padrão para não quebrar `npm test` em quem
 * ainda não configurou um banco de desenvolvimento.
 *
 * Como rodar:
 *   1. Suba um Postgres de teste (ex: `docker compose up -d` usando um banco
 *      dedicado, nunca o de produção).
 *   2. DATABASE_URL apontando para esse banco + `npx prisma db push`.
 *   3. RUN_DB_TESTS=true npm test
 *
 * Cobre os cenários centrais pedidos no escopo: criar empresa/profissional/
 * serviço, gerar disponibilidade, criar agendamento, impedir agendamento em
 * horário ocupado/fora de expediente/no passado, liberar horário ao
 * cancelar, bloqueio de dia inteiro e isolamento multi-tenant.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, AvailabilityError } from "@/lib/availability";
import { createPublicAppointmentAction } from "@/server/actions/public-booking";

const TIMEZONE = "America/Sao_Paulo";
const RUN = process.env.RUN_DB_TESTS === "true";

/** Próxima data (yyyy-MM-dd) que cai no dia da semana informado, pelo menos `minDays` no futuro. */
function nextDateForWeekday(weekday: number, minDays: number): string {
  let candidate = addDays(new Date(), minDays);
  while (candidate.getDay() !== weekday) {
    candidate = addDays(candidate, 1);
  }
  return formatInTimeZone(candidate, TIMEZONE, "yyyy-MM-dd");
}

describe.skipIf(!RUN)("Disponibilidade e agendamento (integração com banco real)", () => {
  let planId: string;
  let companyA: { id: string; slug: string; timezone: string };
  let companyB: { id: string };
  let professionalA: { id: string };
  let serviceA: { id: string; durationMinutes: number };
  let serviceB: { id: string };

  const mondayISO = nextDateForWeekday(1, 3); // segunda-feira, com folga suficiente p/ antecedência mínima
  const sundayISO = nextDateForWeekday(0, 3); // domingo (empresa fechada)

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: { name: "Teste", slug: `teste-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste A",
        ownerName: "Admin A",
        email: `empresa-a-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-a-${Date.now()}`,
        timezone: TIMEZONE,
        planId,
        settings: { create: {} },
        workingHours: {
          create: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
          ],
        },
      },
    });
    companyA = { id: company.id, slug: company.slug, timezone: company.timezone };

    const professional = await prisma.professional.create({
      data: {
        companyId: companyA.id,
        name: "Profissional Teste",
        workingHours: {
          create: [
            { companyId: companyA.id, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
            { companyId: companyA.id, dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
            { companyId: companyA.id, dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
          ],
        },
      },
    });
    professionalA = { id: professional.id };

    const service = await prisma.service.create({
      data: {
        companyId: companyA.id,
        name: "Serviço Teste",
        priceCents: 10000,
        durationMinutes: 30,
        professionals: { create: [{ professionalId: professionalA.id }] },
      },
    });
    serviceA = { id: service.id, durationMinutes: service.durationMinutes };

    const otherCompany = await prisma.company.create({
      data: {
        name: "Empresa Teste B",
        ownerName: "Admin B",
        email: `empresa-b-${Date.now()}@example.com`,
        whatsapp: "11888888888",
        city: "Rio de Janeiro",
        state: "RJ",
        slug: `empresa-teste-b-${Date.now()}`,
        timezone: TIMEZONE,
        planId,
      },
    });
    companyB = { id: otherCompany.id };

    const serviceOfB = await prisma.service.create({
      data: {
        companyId: companyB.id,
        name: "Serviço da empresa B",
        priceCents: 5000,
        durationMinutes: 30,
      },
    });
    serviceB = { id: serviceOfB.id };
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyA.id } });
    await prisma.company.delete({ where: { id: companyB.id } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("gera horários dentro do expediente configurado", async () => {
    const slots = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: mondayISO,
    });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const label = slot.label;
      expect(label >= "09:00" && label < "17:00").toBe(true);
    }
  });

  it("não mostra nenhum horário em dia sem expediente (domingo)", async () => {
    const slots = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: sundayISO,
    });
    expect(slots).toEqual([]);
  });

  it("não permite consultar disponibilidade em data passada", async () => {
    const pastDate = formatInTimeZone(addDays(new Date(), -5), TIMEZONE, "yyyy-MM-dd");
    await expect(
      getAvailableSlots({
        companyId: companyA.id,
        serviceId: serviceA.id,
        professionalId: professionalA.id,
        dateISO: pastDate,
      }),
    ).rejects.toThrow(AvailabilityError);
  });

  it("impede acesso a serviço de outra empresa (isolamento multi-tenant)", async () => {
    await expect(
      getAvailableSlots({
        companyId: companyA.id,
        serviceId: serviceB.id, // serviço pertence à empresa B
        professionalId: professionalA.id,
        dateISO: mondayISO,
      }),
    ).rejects.toThrow(AvailabilityError);
  });

  it("cria um agendamento, remove o horário da disponibilidade e impede reserva duplicada", async () => {
    const before = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: mondayISO,
    });
    expect(before.length).toBeGreaterThan(0);
    const target = before[0];

    const created = await createPublicAppointmentAction(companyA.slug, {
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      startAtISO: target.startAt.toISOString(),
      customerName: "Cliente Teste",
      customerWhatsapp: "11977776666",
      customerEmail: "",
      notes: "",
    });
    expect(created.success).toBe(true);

    const after = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: mondayISO,
    });
    expect(after.some((s) => s.startAt.getTime() === target.startAt.getTime())).toBe(false);

    // Tentar reservar o mesmo horário de novo deve falhar.
    const duplicate = await createPublicAppointmentAction(companyA.slug, {
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      startAtISO: target.startAt.toISOString(),
      customerName: "Outro Cliente",
      customerWhatsapp: "11955554444",
      customerEmail: "",
      notes: "",
    });
    expect(duplicate.success).toBe(false);

    // Cancelar o agendamento libera o horário novamente.
    await prisma.appointment.updateMany({
      where: { companyId: companyA.id, startAt: target.startAt },
      data: { status: "CANCELED" },
    });
    const afterCancel = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: mondayISO,
    });
    expect(afterCancel.some((s) => s.startAt.getTime() === target.startAt.getTime())).toBe(true);
  });

  it("não mostra horários em dia com bloqueio de dia inteiro", async () => {
    const dateISO = nextDateForWeekday(2, 10); // uma terça-feira mais distante, sem conflito com os testes acima
    const dayStart = new Date(`${dateISO}T00:00:00.000-03:00`);
    const dayEnd = new Date(`${dateISO}T23:59:59.000-03:00`);

    await prisma.blockedTime.create({
      data: {
        companyId: companyA.id,
        professionalId: professionalA.id,
        scope: "FULL_DAY",
        startAt: dayStart,
        endAt: dayEnd,
        reason: "Feriado local (teste)",
      },
    });

    const slots = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO,
    });
    expect(slots).toEqual([]);
  });

  it("respeita o horário individual do profissional mesmo com a empresa aberta", async () => {
    // O profissional de teste só tem WorkingHour cadastrado para seg/ter/qua.
    const thursdayISO = nextDateForWeekday(4, 10);
    const slots = await getAvailableSlots({
      companyId: companyA.id,
      serviceId: serviceA.id,
      professionalId: professionalA.id,
      dateISO: thursdayISO,
    });
    expect(slots).toEqual([]);
  });
});
