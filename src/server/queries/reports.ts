import "server-only";
import { addDays, addMonths, startOfMonth, subDays, subMonths } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { AppointmentStatus } from "@prisma/client";
import { zonedRange } from "./dashboard";

/**
 * Página de Relatórios (/painel/relatorios) — complementa o Dashboard
 * (src/server/queries/dashboard.ts, só mês corrente/sem comparação) com
 * filtro de período e métricas de gestão: faturamento (agendamento +
 * pacote vendido, já que sessão de pacote sai com priceCents: 0 — ver
 * src/lib/package-consumption.ts), taxa de comparecimento, ranking de
 * serviço/profissional, cliente novo x recorrente, tudo comparado com o
 * período anterior de mesma duração.
 */

const ACTIVE_STATUS_FILTER = { notIn: ["CANCELED", "NO_SHOW"] as AppointmentStatus[] };

export interface ReportPeriod {
  start: Date;
  end: Date;
}

export interface ResolvedReportRange {
  current: ReportPeriod;
  previous: ReportPeriod;
  label: string;
}

/** Resolve os presets de período vindos da URL (?periodo=...&inicio=...&fim=...) em datas reais. */
export function resolveReportPeriod(
  params: { periodo?: string; inicio?: string; fim?: string },
  timezone: string,
): ResolvedReportRange {
  const now = new Date();
  const preset = params.periodo ?? "este-mes";

  let current: ReportPeriod;
  let label: string;

  if (preset === "personalizado" && params.inicio && params.fim) {
    const start = fromZonedTime(`${params.inicio}T00:00:00`, timezone);
    const endDay = fromZonedTime(`${params.fim}T00:00:00`, timezone);
    current = { start, end: addDays(endDay, 1) };
    label = "Personalizado";
  } else if (preset === "mes-passado") {
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = subMonths(thisMonthStart, 1);
    current = zonedRange(now, timezone, lastMonthStart, thisMonthStart);
    label = "Mês passado";
  } else if (preset === "30-dias") {
    current = { start: subDays(now, 30), end: now };
    label = "Últimos 30 dias";
  } else if (preset === "90-dias") {
    current = { start: subDays(now, 90), end: now };
    label = "Últimos 90 dias";
  } else {
    const thisMonthStart = startOfMonth(now);
    current = zonedRange(now, timezone, thisMonthStart, addMonths(thisMonthStart, 1));
    label = "Este mês";
  }

  const durationMs = current.end.getTime() - current.start.getTime();
  const previous: ReportPeriod = {
    start: new Date(current.start.getTime() - durationMs),
    end: current.start,
  };

  return { current, previous, label };
}

async function getPeriodRevenueAndCount(companyId: string, period: ReportPeriod) {
  const [apptAgg, appointmentCount, packageAgg] = await Promise.all([
    prisma.appointment.aggregate({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: ACTIVE_STATUS_FILTER },
      _sum: { priceCents: true },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: ACTIVE_STATUS_FILTER },
    }),
    prisma.customerPackage.aggregate({
      where: { companyId, purchasedAt: { gte: period.start, lt: period.end } },
      _sum: { pricePaidCents: true },
    }),
  ]);

  return {
    revenueCents: (apptAgg._sum.priceCents ?? 0) + (packageAgg._sum.pricePaidCents ?? 0),
    appointmentCount,
  };
}

async function getAttendanceStats(companyId: string, period: ReportPeriod) {
  const [completedCount, noShowCount, canceledCount] = await Promise.all([
    prisma.appointment.count({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: "COMPLETED" },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: "NO_SHOW" },
    }),
    prisma.appointment.count({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: "CANCELED" },
    }),
  ]);

  const denom = completedCount + noShowCount;
  const attendanceRate = denom > 0 ? (completedCount / denom) * 100 : null;

  return { completedCount, noShowCount, canceledCount, attendanceRate };
}

export interface ReportRanking {
  id: string;
  name: string;
  count: number;
  revenueCents: number;
}

async function getTopServices(companyId: string, period: ReportPeriod): Promise<ReportRanking[]> {
  const grouped = await prisma.appointment.groupBy({
    by: ["serviceId"],
    where: { companyId, startAt: { gte: period.start, lt: period.end }, status: ACTIVE_STATUS_FILTER },
    _sum: { priceCents: true },
    _count: { _all: true },
    orderBy: { _sum: { priceCents: "desc" } },
    take: 5,
  });
  if (grouped.length === 0) return [];

  const services = await prisma.service.findMany({
    where: { id: { in: grouped.map((g) => g.serviceId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(services.map((s) => [s.id, s.name]));

  return grouped.map((g) => ({
    id: g.serviceId,
    name: nameById.get(g.serviceId) ?? "Serviço removido",
    count: g._count._all,
    revenueCents: g._sum.priceCents ?? 0,
  }));
}

async function getTopProfessionals(companyId: string, period: ReportPeriod): Promise<ReportRanking[]> {
  const grouped = await prisma.appointment.groupBy({
    by: ["professionalId"],
    where: { companyId, startAt: { gte: period.start, lt: period.end }, status: ACTIVE_STATUS_FILTER },
    _sum: { priceCents: true },
    _count: { _all: true },
    orderBy: { _sum: { priceCents: "desc" } },
    take: 5,
  });
  if (grouped.length === 0) return [];

  const professionals = await prisma.professional.findMany({
    where: { id: { in: grouped.map((g) => g.professionalId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(professionals.map((p) => [p.id, p.name]));

  return grouped.map((g) => ({
    id: g.professionalId,
    name: nameById.get(g.professionalId) ?? "Profissional removido",
    count: g._count._all,
    revenueCents: g._sum.priceCents ?? 0,
  }));
}

async function getCustomerStats(companyId: string, period: ReportPeriod) {
  const [newCustomersCount, activeAppointments] = await Promise.all([
    prisma.customer.count({ where: { companyId, createdAt: { gte: period.start, lt: period.end } } }),
    prisma.appointment.findMany({
      where: { companyId, startAt: { gte: period.start, lt: period.end }, status: ACTIVE_STATUS_FILTER },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
  ]);

  const customerIds = activeAppointments.map((a) => a.customerId);
  const returningCustomersCount =
    customerIds.length === 0
      ? 0
      : await prisma.customer.count({
          where: { id: { in: customerIds }, createdAt: { lt: period.start } },
        });

  return { newCustomersCount, returningCustomersCount };
}

export interface ReportsData {
  periodLabel: string;
  revenueCents: number;
  previousRevenueCents: number;
  appointmentCount: number;
  previousAppointmentCount: number;
  completedCount: number;
  noShowCount: number;
  canceledCount: number;
  attendanceRate: number | null;
  previousAttendanceRate: number | null;
  topServices: ReportRanking[];
  topProfessionals: ReportRanking[];
  newCustomersCount: number;
  returningCustomersCount: number;
}

export async function getReportsData(companyId: string, range: ResolvedReportRange): Promise<ReportsData> {
  const [current, previous, attendance, previousAttendance, topServices, topProfessionals, customerStats] =
    await Promise.all([
      getPeriodRevenueAndCount(companyId, range.current),
      getPeriodRevenueAndCount(companyId, range.previous),
      getAttendanceStats(companyId, range.current),
      getAttendanceStats(companyId, range.previous),
      getTopServices(companyId, range.current),
      getTopProfessionals(companyId, range.current),
      getCustomerStats(companyId, range.current),
    ]);

  return {
    periodLabel: range.label,
    revenueCents: current.revenueCents,
    previousRevenueCents: previous.revenueCents,
    appointmentCount: current.appointmentCount,
    previousAppointmentCount: previous.appointmentCount,
    completedCount: attendance.completedCount,
    noShowCount: attendance.noShowCount,
    canceledCount: attendance.canceledCount,
    attendanceRate: attendance.attendanceRate,
    previousAttendanceRate: previousAttendance.attendanceRate,
    topServices,
    topProfessionals,
    newCustomersCount: customerStats.newCustomersCount,
    returningCustomersCount: customerStats.returningCustomersCount,
  };
}
