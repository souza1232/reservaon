import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarRange, CalendarCheck, Wallet, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/server/queries/dashboard";
import { formatCentsToBRL, formatDateShort, formatTime } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { AppointmentsChart } from "@/components/dashboard/appointments-chart";
import { AppointmentStatusBadge } from "@/components/dashboard/appointment-status-badge";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { timezone: true, address: true, logoUrl: true },
  });

  const [data, serviceCount, professionalCount, workingHourCount] = await Promise.all([
    getDashboardData(companyId, company.timezone),
    prisma.service.count({ where: { companyId, isActive: true } }),
    prisma.professional.count({ where: { companyId, isActive: true } }),
    prisma.workingHour.count({ where: { companyId, professionalId: null } }),
  ]);

  const checklistItems = [
    {
      label: "Configurar horário de funcionamento",
      done: workingHourCount > 0,
      href: "/painel/configuracoes/horarios",
      cta: "Configurar",
    },
    {
      label: "Cadastrar pelo menos um serviço",
      done: serviceCount > 0,
      href: "/painel/servicos",
      cta: "Cadastrar",
    },
    {
      label: "Cadastrar pelo menos um profissional",
      done: professionalCount > 0,
      href: "/painel/profissionais",
      cta: "Cadastrar",
    },
    {
      label: "Completar dados da empresa (endereço e logo)",
      done: Boolean(company.address && company.logoUrl),
      href: "/painel/configuracoes",
      cta: "Completar",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua operação.</p>
      </div>

      <OnboardingChecklist items={checklistItems} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Agendamentos hoje" value={data.todayCount} icon={CalendarDays} />
        <StatCard label="Agendamentos na semana" value={data.weekCount} icon={CalendarRange} />
        <StatCard label="Agendamentos no mês" value={data.monthCount} icon={CalendarCheck} />
        <StatCard
          label="Faturamento estimado (mês)"
          value={formatCentsToBRL(data.estimatedRevenueCents)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Confirmados (mês)" value={data.confirmedCount} />
        <StatCard label="Pendentes (mês)" value={data.pendingCount} />
        <StatCard label="Cancelados (mês)" value={data.canceledCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agendamentos por dia (últimos 14 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentsChart data={data.chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Próximos agendamentos</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/painel/agenda">
              Ver agenda <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.upcoming.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum agendamento futuro no momento.
            </p>
          )}
          {data.upcoming.map((appt) => (
            <div
              key={appt.id}
              className="flex flex-col gap-2 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{appt.customer.name}</p>
                <p className="text-sm text-muted-foreground">
                  {appt.service.name} · {appt.professional.name}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {formatDateShort(appt.startAt, company.timezone)} às{" "}
                  {formatTime(appt.startAt, company.timezone)}
                </p>
                <AppointmentStatusBadge status={appt.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
