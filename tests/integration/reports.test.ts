/**
 * Testa a página de Relatórios (getReportsData): faturamento soma
 * agendamento + pacote vendido, taxa de comparecimento bate com os status
 * simulados, ranking de serviço/profissional vem na ordem certa, e cliente
 * novo x recorrente é classificado certo. Mesmo gate de
 * tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod, getReportsData } from "@/server/queries/reports";

const RUN = process.env.RUN_DB_TESTS === "true";
const TIMEZONE = "America/Sao_Paulo";

describe.skipIf(!RUN)("Relatórios (integração com banco real)", () => {
  let planId: string;
  let companyId: string;
  let professionalAId: string;
  let professionalBId: string;
  let serviceExpensiveId: string;
  let serviceCheapId: string;
  let oldCustomerId: string; // criado antes do período — deve contar como "recorrente"
  let newCustomerId: string; // criado dentro do período — deve contar como "novo"

  // Período de teste: um intervalo fixo no passado, bem delimitado, pra não
  // colidir com "hoje" nem com dados de outros testes.
  const periodStart = new Date("2020-01-01T00:00:00.000Z");
  const periodEnd = new Date("2020-02-01T00:00:00.000Z");
  const insideStart = new Date("2020-01-10T12:00:00.000Z");

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: { name: "Teste Relatórios", slug: `teste-relatorios-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Relatórios",
        ownerName: "Admin",
        email: `empresa-relatorios-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-relatorios-${Date.now()}`,
        timezone: TIMEZONE,
        planId,
      },
    });
    companyId = company.id;

    const [profA, profB] = await Promise.all([
      prisma.professional.create({ data: { companyId, name: "Profissional A (mais rentável)" } }),
      prisma.professional.create({ data: { companyId, name: "Profissional B" } }),
    ]);
    professionalAId = profA.id;
    professionalBId = profB.id;

    const [svcExpensive, svcCheap] = await Promise.all([
      prisma.service.create({
        data: { companyId, name: "Serviço Caro", priceCents: 20000, durationMinutes: 60 },
      }),
      prisma.service.create({
        data: { companyId, name: "Serviço Barato", priceCents: 3000, durationMinutes: 30 },
      }),
    ]);
    serviceExpensiveId = svcExpensive.id;
    serviceCheapId = svcCheap.id;

    const oldCustomer = await prisma.customer.create({
      data: {
        companyId,
        name: "Cliente Antigo",
        whatsapp: "5511911111111",
        createdAt: new Date("2019-01-01T00:00:00.000Z"),
      },
    });
    oldCustomerId = oldCustomer.id;

    const newCustomer = await prisma.customer.create({
      data: { companyId, name: "Cliente Novo", whatsapp: "5511922222222", createdAt: insideStart },
    });
    newCustomerId = newCustomer.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  it("calcula faturamento (agendamento + pacote), comparecimento, rankings e clientes novos x recorrentes", async () => {
    // Agendamento caro, concluído, profissional A, cliente antigo (recorrente).
    await prisma.appointment.create({
      data: {
        companyId,
        customerId: oldCustomerId,
        serviceId: serviceExpensiveId,
        professionalId: professionalAId,
        startAt: insideStart,
        endAt: new Date(insideStart.getTime() + 60 * 60 * 1000),
        status: "COMPLETED",
        priceCents: 20000,
      },
    });

    // Agendamento barato, concluído, profissional B, cliente novo.
    await prisma.appointment.create({
      data: {
        companyId,
        customerId: newCustomerId,
        serviceId: serviceCheapId,
        professionalId: professionalBId,
        startAt: new Date(insideStart.getTime() + 2 * 60 * 60 * 1000),
        endAt: new Date(insideStart.getTime() + 2.5 * 60 * 60 * 1000),
        status: "COMPLETED",
        priceCents: 3000,
      },
    });

    // Falta (no-show) — conta pra taxa de comparecimento, não conta faturamento
    // porque status não está entre os "ativos" usados no cálculo de receita
    // (mesma regra do resto do app: CANCELED/NO_SHOW não geram faturamento).
    await prisma.appointment.create({
      data: {
        companyId,
        customerId: oldCustomerId,
        serviceId: serviceCheapId,
        professionalId: professionalAId,
        startAt: new Date(insideStart.getTime() + 4 * 60 * 60 * 1000),
        endAt: new Date(insideStart.getTime() + 4.5 * 60 * 60 * 1000),
        status: "NO_SHOW",
        priceCents: 3000,
      },
    });

    // Cancelado — não deve contar em lugar nenhum de faturamento/comparecimento positivo.
    await prisma.appointment.create({
      data: {
        companyId,
        customerId: newCustomerId,
        serviceId: serviceCheapId,
        professionalId: professionalBId,
        startAt: new Date(insideStart.getTime() + 6 * 60 * 60 * 1000),
        endAt: new Date(insideStart.getTime() + 6.5 * 60 * 60 * 1000),
        status: "CANCELED",
        priceCents: 3000,
      },
    });

    // Venda de pacote no período — deve entrar no faturamento total.
    const pkg = await prisma.package.create({
      data: {
        companyId,
        serviceId: serviceCheapId,
        name: "Pacote Teste",
        sessionsCount: 5,
        priceCents: 10000,
      },
    });
    await prisma.customerPackage.create({
      data: {
        companyId,
        customerId: oldCustomerId,
        packageId: pkg.id,
        serviceId: serviceCheapId,
        sessionsTotal: 5,
        sessionsRemaining: 5,
        pricePaidCents: 10000,
        purchasedAt: insideStart,
      },
    });

    // Fora do período — não deve aparecer em nenhuma métrica.
    await prisma.appointment.create({
      data: {
        companyId,
        customerId: oldCustomerId,
        serviceId: serviceExpensiveId,
        professionalId: professionalAId,
        startAt: new Date("2021-01-01T12:00:00.000Z"),
        endAt: new Date("2021-01-01T13:00:00.000Z"),
        status: "COMPLETED",
        priceCents: 99999,
      },
    });

    const range = {
      current: { start: periodStart, end: periodEnd },
      previous: { start: new Date("2019-12-01T00:00:00.000Z"), end: periodStart },
      label: "Teste",
    };

    const data = await getReportsData(companyId, range);

    // Faturamento: 20000 (caro) + 3000 (barato) + 10000 (pacote) = 33000. NO_SHOW e CANCELED não contam.
    expect(data.revenueCents).toBe(33000);
    expect(data.appointmentCount).toBe(2); // só os COMPLETED, não NO_SHOW/CANCELED

    expect(data.completedCount).toBe(2);
    expect(data.noShowCount).toBe(1);
    expect(data.canceledCount).toBe(1);
    // comparecimento = completed / (completed + noShow) = 2 / 3
    expect(data.attendanceRate).toBeCloseTo((2 / 3) * 100, 5);

    expect(data.topServices[0].id).toBe(serviceExpensiveId);
    expect(data.topServices[0].revenueCents).toBe(20000);
    expect(data.topProfessionals[0].id).toBe(professionalAId);
    expect(data.topProfessionals[0].revenueCents).toBe(20000);

    expect(data.newCustomersCount).toBe(1);
    expect(data.returningCustomersCount).toBe(1);
  });

  it("resolveReportPeriod calcula o período anterior com a mesma duração", () => {
    const range = resolveReportPeriod({ periodo: "30-dias" }, TIMEZONE);
    const currentDuration = range.current.end.getTime() - range.current.start.getTime();
    const previousDuration = range.previous.end.getTime() - range.previous.start.getTime();
    expect(previousDuration).toBe(currentDuration);
    expect(range.previous.end.getTime()).toBe(range.current.start.getTime());
  });
});
