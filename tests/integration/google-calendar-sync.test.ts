/**
 * Testa a sincronização com o Google Agenda (push e pull) sem chamar a API
 * real do Google — mocka src/lib/google-calendar.ts inteiro, mesmo espírito
 * de mockar sendWhatsappTemplateMessage nos outros testes de integração.
 * Mesmo gate de tests/integration/booking.test.ts — precisa de
 * RUN_DB_TESTS=true e um Postgres real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";

const mockUpsertCalendarEvent = vi.fn();
const mockDeleteCalendarEvent = vi.fn();
const mockListUpcomingEvents = vi.fn();

vi.mock("@/lib/google-calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-calendar")>();
  return {
    ...actual,
    isGoogleCalendarConfigured: () => true,
    upsertCalendarEvent: (...args: unknown[]) => mockUpsertCalendarEvent(...args),
    deleteCalendarEvent: (...args: unknown[]) => mockDeleteCalendarEvent(...args),
    listUpcomingEvents: (...args: unknown[]) => mockListUpcomingEvents(...args),
  };
});

describe.skipIf(!RUN)("Sincronização com Google Agenda (integração com banco real)", () => {
  let planId: string;
  let companyId: string;
  let professionalId: string; // sem conexão
  let professionalWithConnId: string; // com conexão
  let serviceId: string;
  let customerId: string;

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: { name: "Teste Google Calendar", slug: `teste-gcal-${Date.now()}`, priceCents: 0, isActive: true },
    });
    planId = plan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Google Calendar",
        ownerName: "Admin",
        email: `empresa-gcal-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-gcal-${Date.now()}`,
        timezone: "America/Sao_Paulo",
        planId,
      },
    });
    companyId = company.id;

    const [profA, profB] = await Promise.all([
      prisma.professional.create({ data: { companyId, name: "Profissional Sem Conexão" } }),
      prisma.professional.create({ data: { companyId, name: "Profissional Com Conexão" } }),
    ]);
    professionalId = profA.id;
    professionalWithConnId = profB.id;

    await prisma.googleCalendarConnection.create({
      data: {
        professionalId: professionalWithConnId,
        googleAccountEmail: "profissional@example.com",
        accessToken: "fake-access-token",
        refreshToken: "fake-refresh-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const service = await prisma.service.create({
      data: { companyId, name: "Serviço Teste", priceCents: 5000, durationMinutes: 30 },
    });
    serviceId = service.id;

    const customer = await prisma.customer.create({
      data: { companyId, name: "Cliente Teste", whatsapp: "5511911111111" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: planId } });
  });

  beforeEach(() => {
    mockUpsertCalendarEvent.mockReset();
    mockDeleteCalendarEvent.mockReset();
    mockListUpcomingEvents.mockReset();
  });

  describe("push — syncAppointmentToGoogleCalendar", () => {
    it("é no-op quando o profissional não tem conexão", async () => {
      const { syncAppointmentToGoogleCalendar } = await import("@/lib/appointment-google-sync");

      const appointment = await prisma.appointment.create({
        data: {
          companyId,
          customerId,
          serviceId,
          professionalId,
          startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 24.5 * 60 * 60 * 1000),
          status: "CONFIRMED",
          priceCents: 5000,
        },
      });

      await syncAppointmentToGoogleCalendar(appointment.id, "upsert");

      expect(mockUpsertCalendarEvent).not.toHaveBeenCalled();
      const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(unchanged.googleEventId).toBeNull();
    });

    it("cria o evento e grava o googleEventId quando o profissional está conectado", async () => {
      mockUpsertCalendarEvent.mockResolvedValue("evt-123");
      const { syncAppointmentToGoogleCalendar } = await import("@/lib/appointment-google-sync");

      const appointment = await prisma.appointment.create({
        data: {
          companyId,
          customerId,
          serviceId,
          professionalId: professionalWithConnId,
          startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 24.5 * 60 * 60 * 1000),
          status: "CONFIRMED",
          priceCents: 5000,
        },
      });

      await syncAppointmentToGoogleCalendar(appointment.id, "upsert");

      expect(mockUpsertCalendarEvent).toHaveBeenCalledTimes(1);
      const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(updated.googleEventId).toBe("evt-123");

      mockDeleteCalendarEvent.mockResolvedValue(undefined);
      await syncAppointmentToGoogleCalendar(appointment.id, "delete");

      expect(mockDeleteCalendarEvent).toHaveBeenCalledTimes(1);
      const afterDelete = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(afterDelete.googleEventId).toBeNull();
    });
  });

  describe("pull — syncGoogleCalendarBlocks", () => {
    it("cria, atualiza e remove BlockedTime conforme a listagem do Google muda", async () => {
      const { syncGoogleCalendarBlocks } = await import("@/lib/appointment-mutations");

      const staleBlock = await prisma.blockedTime.create({
        data: {
          companyId,
          professionalId: professionalWithConnId,
          scope: "SPECIFIC_TIME",
          startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
          reason: "Sincronizado do Google Agenda",
          googleEventId: "g-stale",
        },
      });

      const oldStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const staleTimesBlock = await prisma.blockedTime.create({
        data: {
          companyId,
          professionalId: professionalWithConnId,
          scope: "SPECIFIC_TIME",
          startAt: oldStart,
          endAt: new Date(oldStart.getTime() + 60 * 60 * 1000),
          reason: "Sincronizado do Google Agenda",
          googleEventId: "g-existing",
        },
      });

      const manualBlock = await prisma.blockedTime.create({
        data: {
          companyId,
          professionalId: professionalWithConnId,
          scope: "SPECIFIC_TIME",
          startAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 9 * 60 * 60 * 1000),
          reason: "Bloqueio manual",
        },
      });

      const newEventStart = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // horário mudou pro "g-existing"
      const brandNewEventStart = new Date(Date.now() + 10 * 60 * 60 * 1000);
      mockListUpcomingEvents.mockResolvedValue([
        {
          id: "g-existing",
          startAt: newEventStart,
          endAt: new Date(newEventStart.getTime() + 60 * 60 * 1000),
        },
        {
          id: "g-new",
          startAt: brandNewEventStart,
          endAt: new Date(brandNewEventStart.getTime() + 60 * 60 * 1000),
        },
      ]);

      const result = await syncGoogleCalendarBlocks();
      expect(result.synced).toBeGreaterThanOrEqual(2);

      // g-stale sumiu da listagem e estava no futuro → removido.
      const stale = await prisma.blockedTime.findUnique({ where: { id: staleBlock.id } });
      expect(stale).toBeNull();

      // g-existing continua, mas com o horário atualizado.
      const updated = await prisma.blockedTime.findUniqueOrThrow({ where: { id: staleTimesBlock.id } });
      expect(updated.startAt.getTime()).toBe(newEventStart.getTime());

      // g-new é novo → criado.
      const created = await prisma.blockedTime.findFirst({
        where: { professionalId: professionalWithConnId, googleEventId: "g-new" },
      });
      expect(created).not.toBeNull();

      // Bloqueio manual (googleEventId nulo) nunca é tocado.
      const manual = await prisma.blockedTime.findUniqueOrThrow({ where: { id: manualBlock.id } });
      expect(manual.reason).toBe("Bloqueio manual");

      const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({
        where: { professionalId: professionalWithConnId },
      });
      expect(connection.lastSyncedAt).not.toBeNull();
    });

    it("não mexe em profissional sem conexão", async () => {
      const { syncGoogleCalendarBlocks } = await import("@/lib/appointment-mutations");
      mockListUpcomingEvents.mockResolvedValue([]);

      await syncGoogleCalendarBlocks();

      const blocks = await prisma.blockedTime.findMany({ where: { professionalId } });
      expect(blocks).toEqual([]);
    });
  });
});
