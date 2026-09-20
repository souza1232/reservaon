import "server-only";
import { addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { AppointmentStatus } from "@prisma/client";

function dayRangeUtc(dateISO: string, timezone: string) {
  const start = fromZonedTime(`${dateISO}T00:00:00`, timezone);
  const end = fromZonedTime(`${dateISO}T00:00:00`, timezone);
  return { start, end: addDays(end, 1) };
}

interface AgendaScope {
  companyId: string;
  professionalId?: string;
}

export async function getDayAgenda(dateISO: string, timezone: string, scope: AgendaScope) {
  const { start, end } = dayRangeUtc(dateISO, timezone);

  const [appointments, blockedTimes] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: scope.companyId,
        professionalId: scope.professionalId,
        startAt: { gte: start, lt: end },
      },
      orderBy: { startAt: "asc" },
      include: { customer: true, service: true, professional: true },
    }),
    prisma.blockedTime.findMany({
      where: {
        companyId: scope.companyId,
        professionalId: scope.professionalId,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      include: { professional: true },
    }),
  ]);

  return { appointments, blockedTimes };
}

const ACTIVE_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

export async function getPeriodCounts(days: Date[], timezone: string, scope: AgendaScope) {
  if (days.length === 0) return new Map<string, number>();
  const start = fromZonedTime(`${formatInTimeZone(days[0], timezone, "yyyy-MM-dd")}T00:00:00`, timezone);
  const lastDay = days[days.length - 1];
  const end = fromZonedTime(
    `${formatInTimeZone(addDays(lastDay, 1), timezone, "yyyy-MM-dd")}T00:00:00`,
    timezone,
  );

  const appointments = await prisma.appointment.findMany({
    where: {
      companyId: scope.companyId,
      professionalId: scope.professionalId,
      startAt: { gte: start, lt: end },
      status: { in: ACTIVE_STATUSES },
    },
    select: { startAt: true },
  });

  const counts = new Map<string, number>();
  for (const day of days) counts.set(formatInTimeZone(day, timezone, "yyyy-MM-dd"), 0);
  for (const appt of appointments) {
    const key = formatInTimeZone(appt.startAt, timezone, "yyyy-MM-dd");
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function getWeekDays(dateISO: string): Date[] {
  const start = startOfWeek(new Date(`${dateISO}T12:00:00`), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthDays(dateISO: string): Date[] {
  const ref = new Date(`${dateISO}T12:00:00`);
  return eachDayOfInterval({ start: startOfMonth(ref), end: endOfMonth(ref) });
}
