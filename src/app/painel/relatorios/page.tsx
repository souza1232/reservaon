import type { Metadata } from "next";
import { Wallet, CalendarCheck, UserCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod, getReportsData } from "@/server/queries/reports";
import { formatCentsToBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";
import { PeriodSelector } from "./period-selector";

export const metadata: Metadata = { title: "Relatórios" };

interface PageProps {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>;
}

/** "+12%" (verde) ou "-8%" (vermelho) comparado ao período anterior; null se não dá pra comparar (anterior = 0). */
function percentTrend(current: number, previous: number): { value: string; positive: boolean } | undefined {
  if (previous === 0) return undefined;
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change);
  return {
    value: `${rounded >= 0 ? "+" : ""}${rounded}% vs período anterior`,
    positive: rounded >= 0,
  };
}

function pointsTrend(current: number | null, previous: number | null): { value: string; positive: boolean } | undefined {
  if (current === null || previous === null) return undefined;
  const change = Math.round(current - previous);
  if (change === 0) return { value: "estável vs período anterior", positive: true };
  return {
    value: `${change > 0 ? "+" : ""}${change} p.p. vs período anterior`,
    positive: change >= 0,
  };
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const params = await searchParams;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { timezone: true },
  });

  const range = resolveReportPeriod(params, company.timezone);
  const data = await getReportsData(companyId, range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Números de gestão do seu negócio — {data.periodLabel.toLowerCase()}.
        </p>
      </div>

      <PeriodSelector
        basePath="/painel/relatorios"
        active={params.periodo ?? "este-mes"}
        inicio={params.inicio}
        fim={params.fim}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Faturamento"
          value={formatCentsToBRL(data.revenueCents)}
          icon={Wallet}
          trend={percentTrend(data.revenueCents, data.previousRevenueCents)}
        />
        <StatCard
          label="Agendamentos"
          value={data.appointmentCount}
          icon={CalendarCheck}
          trend={percentTrend(data.appointmentCount, data.previousAppointmentCount)}
        />
        <StatCard
          label="Taxa de comparecimento"
          value={data.attendanceRate === null ? "—" : `${Math.round(data.attendanceRate)}%`}
          icon={UserCheck}
          trend={pointsTrend(data.attendanceRate, data.previousAttendanceRate)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparecimento no período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concluídos</span>
              <span className="font-medium">{data.completedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Faltas (não compareceu)</span>
              <span className="font-medium">{data.noShowCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cancelados</span>
              <span className="font-medium">{data.canceledCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clientes no período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Novos</span>
              <span className="font-medium">{data.newCustomersCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recorrentes</span>
              <span className="font-medium">{data.returningCustomersCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serviços mais rentáveis</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.topServices.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum agendamento no período.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Qtd.</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topServices.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.count}</TableCell>
                      <TableCell className="text-right">{formatCentsToBRL(s.revenueCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profissionais mais rentáveis</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.topProfessionals.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum agendamento no período.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Qtd.</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topProfessionals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.count}</TableCell>
                      <TableCell className="text-right">{formatCentsToBRL(p.revenueCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
