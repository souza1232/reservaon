import "server-only";
import { parseISO, differenceInCalendarDays, addDays, formatISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/constants";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type Interval,
  type BusyRange,
  intersectIntervals,
  minutesToTime,
  timeToMinutes,
  generateSlotStartMinutes,
  isRangeBusy,
} from "@/lib/availability-core";

export interface AvailableSlot {
  startAt: Date;
  endAt: Date;
  label: string; // "HH:mm" no fuso da empresa
}

export class AvailabilityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Cliente Prisma "normal" ou o cliente de uma transação (`tx`). Aceitar os
 * dois permite que a checagem de disponibilidade rode DENTRO da mesma
 * transação Serializable que cria o agendamento — isso é o que de fato
 * impede a dupla reserva sob concorrência (ver assertSlotAvailable).
 */
type DbClient = PrismaClient | Prisma.TransactionClient;

interface GetAvailableSlotsParams {
  companyId: string;
  serviceId: string;
  professionalId: string;
  dateISO: string; // "yyyy-MM-dd", data local da empresa
  /** Ao validar um reagendamento, ignore o próprio agendamento no cálculo de conflitos. */
  ignoreAppointmentId?: string;
  /** Cliente Prisma a usar nas consultas — passe o `tx` ao validar dentro de uma transação. */
  client?: DbClient;
}

export async function getAvailableSlots({
  companyId,
  serviceId,
  professionalId,
  dateISO,
  ignoreAppointmentId,
  client = prisma,
}: GetAvailableSlotsParams): Promise<AvailableSlot[]> {
  const company = await client.company.findUnique({
    where: { id: companyId },
    include: { settings: true },
  });
  if (!company || company.status !== "ACTIVE") {
    throw new AvailabilityError("COMPANY_UNAVAILABLE", "Empresa indisponível para agendamentos.");
  }

  const service = await client.service.findFirst({
    where: { id: serviceId, companyId, isActive: true },
  });
  if (!service) {
    throw new AvailabilityError("SERVICE_NOT_FOUND", "Serviço não encontrado.");
  }

  const professional = await client.professional.findFirst({
    where: { id: professionalId, companyId, isActive: true },
    include: { services: { where: { serviceId } } },
  });
  if (!professional) {
    throw new AvailabilityError("PROFESSIONAL_NOT_FOUND", "Profissional não encontrado.");
  }
  if (professional.services.length === 0) {
    throw new AvailabilityError(
      "SERVICE_NOT_OFFERED",
      "Este profissional não realiza o serviço selecionado.",
    );
  }

  const timezone = company.timezone;
  const settings = company.settings ?? DEFAULT_COMPANY_SETTINGS;

  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const daysFromToday = differenceInCalendarDays(parseISO(dateISO), parseISO(today));
  if (daysFromToday < 0) {
    throw new AvailabilityError("DATE_IN_PAST", "Não é possível agendar em uma data passada.");
  }
  if (daysFromToday > settings.maxFutureDays) {
    throw new AvailabilityError(
      "DATE_TOO_FAR",
      `Agendamentos podem ser feitos com até ${settings.maxFutureDays} dias de antecedência.`,
    );
  }

  const holiday = await client.holiday.findFirst({
    where: { companyId, date: parseISO(dateISO) },
  });
  if (holiday) return [];

  // Domingo = 0 ... Sábado = 6 — independe de fuso, pois dateISO é uma data-calendário pura.
  const dayOfWeek = parseISO(dateISO).getUTCDay();

  const [companyHours, professionalHours] = await Promise.all([
    client.workingHour.findMany({
      where: { companyId, professionalId: null, dayOfWeek },
    }),
    client.workingHour.findMany({
      where: { companyId, professionalId, dayOfWeek },
    }),
  ]);

  if (companyHours.length === 0 || professionalHours.length === 0) {
    return []; // empresa fechada ou profissional não trabalha neste dia
  }

  const companyIntervals: Interval[] = companyHours.map((h) => ({
    startMin: timeToMinutes(h.startTime),
    endMin: timeToMinutes(h.endTime),
  }));
  const professionalIntervals: Interval[] = professionalHours.map((h) => ({
    startMin: timeToMinutes(h.startTime),
    endMin: timeToMinutes(h.endTime),
  }));

  const openIntervals = intersectIntervals(companyIntervals, professionalIntervals);
  if (openIntervals.length === 0) return [];

  const dayStartUtc = fromZonedTime(`${dateISO}T00:00:00`, timezone);
  const dayEndUtc = fromZonedTime(
    `${formatISO(addDays(parseISO(dateISO), 1), { representation: "date" })}T00:00:00`,
    timezone,
  );

  const [appointments, blockedTimes] = await Promise.all([
    client.appointment.findMany({
      where: {
        companyId,
        professionalId,
        status: { notIn: ["CANCELED", "NO_SHOW"] },
        startAt: { lt: dayEndUtc },
        endAt: { gt: dayStartUtc },
        ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
      },
      select: { startAt: true, endAt: true },
    }),
    client.blockedTime.findMany({
      where: {
        companyId,
        OR: [{ professionalId }, { professionalId: null }],
        startAt: { lt: dayEndUtc },
        endAt: { gt: dayStartUtc },
      },
    }),
  ]);

  if (blockedTimes.some((b) => b.scope === "FULL_DAY")) {
    return [];
  }

  const bufferMs = settings.bufferBetweenMinutes * 60_000;
  const busyRanges: BusyRange[] = [
    ...appointments.map((a) => ({ start: a.startAt, end: new Date(a.endAt.getTime() + bufferMs) })),
    ...blockedTimes.map((b) => ({ start: b.startAt, end: new Date(b.endAt.getTime() + bufferMs) })),
  ];

  const now = new Date();
  const minStartAt = new Date(now.getTime() + settings.minAdvanceMinutes * 60_000);

  const candidateStarts = generateSlotStartMinutes(
    openIntervals,
    service.durationMinutes,
    settings.slotIntervalMinutes,
  );

  const slots: AvailableSlot[] = [];
  for (const t of candidateStarts) {
    const startLocal = minutesToTime(t);
    const endLocal = minutesToTime(t + service.durationMinutes);
    const startAt = fromZonedTime(`${dateISO}T${startLocal}:00`, timezone);
    const endAt = fromZonedTime(`${dateISO}T${endLocal}:00`, timezone);

    if (startAt < minStartAt) continue;
    if (isRangeBusy(startAt, endAt, busyRanges)) continue;

    slots.push({ startAt, endAt, label: startLocal });
  }

  return slots;
}

interface AssertSlotAvailableParams {
  companyId: string;
  serviceId: string;
  professionalId: string;
  startAt: Date;
  timezone: string;
  ignoreAppointmentId?: string;
  /**
   * Cliente Prisma a usar. SEMPRE passe o `tx` da transação que também vai
   * criar/atualizar o agendamento: se a leitura acontecer fora da
   * transação, o isolamento Serializable não tem como detectar o conflito
   * entre duas reservas concorrentes para o mesmo horário.
   */
  client?: DbClient;
}

/** Revalida no backend se um horário específico ainda está disponível — sempre chamado antes de criar/remarcar um agendamento, dentro da mesma transação da escrita. */
export async function assertSlotAvailable({
  companyId,
  serviceId,
  professionalId,
  startAt,
  timezone,
  ignoreAppointmentId,
  client = prisma,
}: AssertSlotAvailableParams): Promise<void> {
  const dateISO = formatInTimeZone(startAt, timezone, "yyyy-MM-dd");
  const slots = await getAvailableSlots({
    companyId,
    serviceId,
    professionalId,
    dateISO,
    ignoreAppointmentId,
    client,
  });

  const match = slots.some((s) => s.startAt.getTime() === startAt.getTime());
  if (!match) {
    throw new AvailabilityError(
      "SLOT_UNAVAILABLE",
      "Este horário não está mais disponível. Escolha outro horário.",
    );
  }
}
