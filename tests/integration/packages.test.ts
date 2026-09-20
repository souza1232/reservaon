/**
 * Testes de integração do pacote de sessões. Mesmo gate de
 * tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true e um
 * Postgres real. `@/auth` é mockado (aqui não há sessão de verdade), com o
 * companyId trocado por teste conforme a empresa (plano pago x plano
 * grátis) que cada cenário precisa simular.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { createPublicAppointmentAction } from "@/server/actions/public-booking";
import {
  createPackageAction,
  deletePackageAction,
  sellPackageToCustomerAction,
} from "@/server/actions/packages";

const TIMEZONE = "America/Sao_Paulo";
const RUN = process.env.RUN_DB_TESTS === "true";

let mockSession: { companyId: string; role: "COMPANY_ADMIN"; professionalId: null } | null = null;

// As server actions de pacotes chamam revalidatePath, que exige o contexto de
// uma requisição Next.js real (inexistente aqui fora do App Router).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// createPublicAppointmentAction dispara a notificação de confirmação sem
// aguardar (`void`, ver public-booking.ts) — sem mockar, ela grava em
// Notification depois que o teste já terminou e o afterAll já apagou a
// empresa, derrubando a constraint de FK. Não é o que este arquivo testa
// (mesmo raciocínio de tests/integration/waitlist.test.ts).
vi.mock("@/lib/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...actual, sendWhatsappNotification: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () =>
    mockSession
      ? {
          user: {
            id: "admin-test",
            name: "Admin Teste",
            email: "admin-teste@example.com",
            role: mockSession.role,
            companyId: mockSession.companyId,
            professionalId: mockSession.professionalId,
          },
        }
      : null,
  ),
}));

describe.skipIf(!RUN)("Pacotes de sessões (integração com banco real)", () => {
  let freePlanId: string;
  let paidPlanId: string;
  let companyPaid: { id: string; slug: string };
  let companyFree: { id: string };
  let professionalId: string;
  let serviceId: string;
  let customerId: string;

  beforeAll(async () => {
    const [freePlan, paidPlan] = await Promise.all([
      prisma.plan.create({
        data: { name: "Grátis Teste", slug: `gratis-teste-${Date.now()}`, priceCents: 0, isActive: true },
      }),
      prisma.plan.create({
        data: { name: "Pago Teste", slug: `pago-teste-${Date.now()}`, priceCents: 4990, isActive: true },
      }),
    ]);
    freePlanId = freePlan.id;
    paidPlanId = paidPlan.id;

    const allDays = [0, 1, 2, 3, 4, 5, 6];

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Pacotes",
        ownerName: "Admin",
        email: `empresa-pacotes-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-pacotes-${Date.now()}`,
        timezone: TIMEZONE,
        planId: paidPlanId,
        settings: { create: {} },
        workingHours: {
          create: allDays.map((dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "23:59" })),
        },
      },
    });
    companyPaid = { id: company.id, slug: company.slug };

    const professional = await prisma.professional.create({
      data: {
        companyId: companyPaid.id,
        name: "Profissional Teste",
        workingHours: {
          create: allDays.map((dayOfWeek) => ({
            companyId: companyPaid.id,
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
        companyId: companyPaid.id,
        name: "Sessão de depilação",
        priceCents: 8000,
        durationMinutes: 30,
        professionals: { create: [{ professionalId }] },
      },
    });
    serviceId = service.id;

    const customer = await prisma.customer.create({
      data: { companyId: companyPaid.id, name: "Cliente Pacote", whatsapp: "5511944443333" },
    });
    customerId = customer.id;

    const freeCompany = await prisma.company.create({
      data: {
        name: "Empresa Teste Grátis",
        ownerName: "Admin Grátis",
        email: `empresa-gratis-${Date.now()}@example.com`,
        whatsapp: "11988887777",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-gratis-${Date.now()}`,
        timezone: TIMEZONE,
        planId: freePlanId,
      },
    });
    companyFree = { id: freeCompany.id };
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyPaid.id } });
    await prisma.company.delete({ where: { id: companyFree.id } });
    await prisma.plan.delete({ where: { id: freePlanId } });
    await prisma.plan.delete({ where: { id: paidPlanId } });
    // createPublicAppointmentAction usa a chave global "public-booking:unknown"
    // fora de um request real (ver getClientIp em src/lib/rate-limit.ts) — o
    // mesmo bucket de tests/integration/booking.test.ts. Limpa o que este
    // arquivo inseriu pra não empurrar o outro arquivo pro limite quando
    // rodam em paralelo.
    await prisma.rateLimitHit.deleteMany({ where: { key: "public-booking:unknown" } });
  });

  it("requirePaidPlan bloqueia empresa no plano grátis e permite no plano pago", async () => {
    mockSession = { companyId: companyFree.id, role: "COMPANY_ADMIN", professionalId: null };
    await expect(
      createPackageAction({
        name: "Pacote bloqueado",
        serviceId,
        sessionsCount: 5,
        price: 100,
        isActive: true,
      }),
    ).rejects.toThrow();

    mockSession = { companyId: companyPaid.id, role: "COMPANY_ADMIN", professionalId: null };
    const created = await createPackageAction({
      name: "Pacote permitido",
      serviceId,
      sessionsCount: 5,
      price: 100,
      isActive: true,
    });
    expect(created.success).toBe(true);
  });

  it("consome sessão ao agendar, devolve ao cancelar, e mantém consumida ao concluir", async () => {
    mockSession = { companyId: companyPaid.id, role: "COMPANY_ADMIN", professionalId: null };

    const pkg = await createPackageAction({
      name: "3 sessões de depilação",
      serviceId,
      sessionsCount: 3,
      price: 240,
      isActive: true,
    });
    expect(pkg.success).toBe(true);
    const packageId = pkg.data!.id;

    const sold = await sellPackageToCustomerAction(customerId, packageId);
    expect(sold.success).toBe(true);
    const customerPackageId = sold.data!.id;

    const afterSale = await prisma.customerPackage.findUniqueOrThrow({
      where: { id: customerPackageId },
    });
    expect(afterSale.sessionsRemaining).toBe(3);

    const dateISO = formatInTimeZone(addDays(new Date(), 5), TIMEZONE, "yyyy-MM-dd");
    const startAt = new Date(`${dateISO}T10:00:00.000-03:00`);

    const booked = await createPublicAppointmentAction(companyPaid.slug, {
      serviceId,
      professionalId,
      startAtISO: startAt.toISOString(),
      customerName: "Cliente Pacote",
      customerWhatsapp: "5511944443333",
      customerEmail: "",
      notes: "",
    });
    expect(booked.success).toBe(true);
    const appointmentId = booked.data!.appointmentId;

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.priceCents).toBe(0);
    expect(appointment.customerPackageId).toBe(customerPackageId);

    const afterBooking = await prisma.customerPackage.findUniqueOrThrow({
      where: { id: customerPackageId },
    });
    expect(afterBooking.sessionsRemaining).toBe(2);

    // Cancelar devolve a sessão — cancelAppointmentCore é o núcleo usado tanto
    // pela server action do painel quanto pelo webhook do WhatsApp.
    const { cancelAppointmentCore } = await import("@/lib/appointment-mutations");
    const cancelResult = await cancelAppointmentCore(appointmentId);
    expect(cancelResult.outcome).toBe("ok");

    const afterCancel = await prisma.customerPackage.findUniqueOrThrow({
      where: { id: customerPackageId },
    });
    expect(afterCancel.sessionsRemaining).toBe(3);

    // Agendar de novo e concluir: saldo permanece descontado (sem devolução).
    const booked2 = await createPublicAppointmentAction(companyPaid.slug, {
      serviceId,
      professionalId,
      startAtISO: startAt.toISOString(),
      customerName: "Cliente Pacote",
      customerWhatsapp: "5511944443333",
      customerEmail: "",
      notes: "",
    });
    expect(booked2.success).toBe(true);
    const appointmentId2 = booked2.data!.appointmentId;

    await prisma.appointment.update({ where: { id: appointmentId2 }, data: { status: "COMPLETED" } });

    const afterComplete = await prisma.customerPackage.findUniqueOrThrow({
      where: { id: customerPackageId },
    });
    expect(afterComplete.sessionsRemaining).toBe(2);

    // Excluir um pacote com venda ativa deve ser bloqueado.
    const deleteResult = await deletePackageAction(packageId);
    expect(deleteResult.success).toBe(false);
  });
});
