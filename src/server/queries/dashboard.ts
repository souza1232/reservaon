import "server-only";
import { startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths, subDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { AppointmentStatus } from "@prisma/client";

const EXCLUDED_STATUSES: AppointmentStatus[] = ["CANCELED", "NO_SHOW"];

function zonedRange(now: Date, timezone: string, start: Date, end: Date) {
  const startISO = formatInTimeZone(start, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  const endISO = formatInTimeZone(end, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  return { start: fromZonedTime(startISO, timezone), end: fromZonedTime(endISO, timezone) };
}

export async function getDashboardData(companyId: string, timezone: string) {
  const now = new Date();
  const todayLocalMidnight = startOfDay(now);
  const today = zonedRange(now, timezone, todayLocalMidnight, addDays(todayLocalMidnight, 1));
  const weekStartLocal = startOfWeek(now, { weekStartsOn: 1 });
  const week = zonedRange(now, timezone, weekStartLocal, addWeeks(weekStartLocal, 1));
  const monthStartLocal = startOfMonth(now);
  const month = zonedRange(now, timezone, monthStartLocal, addMonths(monthStartLocal, 1));

  const activeStatusFilter = { notIn: EXCLUDED_STATUSES };

  const [
    todayCount,
    weekCount,
    monthCount,
    confirmedCount,
    pendingCount,
    canceledCount,
    revenueAgg,
    upcoming,
    monthAppointments,
  ] = await Promise.all([
    prisma.appointment.count({
      where: { companyId, startAt: { gte: today.start, lt: today.end }, status: activeStatusFilter },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: week.start, lt: week.end }, status: activeStatusFilter },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: month.start, lt: month.end }, status: activeStatusFilter },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: month.start, lt: month.end }, status: "CONFIRMED" },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: month.start, lt: month.end }, status: "PENDING" },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: month.start, lt: month.end }, status: "CANCELED" },
    }),
    prisma.appointment.aggregate({
      where: { companyId, startAt: { gte: month.start, lt: month.end }, status: activeStatusFilter },
      _sum: { priceCents: true },
    }),
    prisma.appointment.findMany({
      where: { companyId, startAt: { gte: now }, status: activeStatusFilter },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { customer: true, service: true, professional: true },
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        startAt: { gte: zonedRange(now, timezone, subDays(todayLocalMidnight, 13), addDays(todayLocalMidnight, 1)).start, lt: today.end },
        status: activeStatusFilter,
      },
      select: { startAt: true },
    }),
  ]);

  const chartMap = new Map<string, number>();
  for (let i = 13; i >= 0; i -= 1) {
    const day = formatInTimeZone(subDays(now, i), timezone, "dd/MM");
    chartMap.set(day, 0);
  }
  for (const appt of monthAppointments) {
    const day = formatInTimeZone(appt.startAt, timezone, "dd/MM");
    if (chartMap.has(day)) chartMap.set(day, (chartMap.get(day) ?? 0) + 1);
  }

  return {
    todayCount,
    weekCount,
    monthCount,
    confirmedCount,
    pendingCount,
    canceledCount,
    estimatedRevenueCents: revenueAgg._sum?.priceCents ?? 0,
    upcoming,
    chartData: Array.from(chartMap.entries()).map(([day, total]) => ({ day, total })),
  };
}
