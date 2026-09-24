import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/dashboard/appointment-status-badge";
import { CustomerNotesForm } from "@/app/painel/clientes/[id]/customer-actions";
import { SellPackageDialog } from "@/app/painel/clientes/[id]/sell-package-dialog";

export const metadata: Metadata = { title: "Cliente" };

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha do cliente pro lado da recepção — igual à de /painel/clientes/[id],
 * exceto que NÃO mostra Prontuário (dado clínico sensível, fora do escopo
 * dessa função) nem o botão de exclusão LGPD (só o admin faz isso). Por
 * isso a query nem inclui clinicalRecords.
 */
export default async function ReceptionCustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const companyId = session!.user.companyId!;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      appointments: {
        orderBy: { startAt: "desc" },
        include: { service: true, professional: true },
      },
      customerPackages: {
        orderBy: { purchasedAt: "desc" },
        include: { package: { include: { service: { select: { name: true } } } } },
      },
    },
  });

  if (!customer || customer.companyId !== companyId) notFound();

  const totalSpent = customer.appointments
    .filter((a) => a.status !== "CANCELED" && a.status !== "NO_SHOW")
    .reduce((sum, a) => sum + a.priceCents, 0);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: { select: { priceCents: true } } },
  });
  const isPaidPlan = Boolean(company?.plan && company.plan.priceCents > 0);

  const availablePackages = isPaidPlan
    ? await prisma.package.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: "asc" },
        include: { service: { select: { name: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">{customer.whatsapp}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de agendamentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.appointments.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>
              )}
              {customer.appointments.map((appt) => (
                <div
                  key={appt.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{appt.service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {appt.professional.name} · {formatDateTime(appt.startAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium">{formatCentsToBRL(appt.priceCents)}</p>
                    <AppointmentStatusBadge status={appt.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-mail</span>
                <span>{customer.email ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de agendamentos</span>
                <span>{customer.appointments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total gasto</span>
                <span className="font-medium">{formatCentsToBRL(totalSpent)}</span>
              </div>
            </CardContent>
          </Card>

          {isPaidPlan && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Pacotes ativos</CardTitle>
                <SellPackageDialog
                  customerId={customer.id}
                  packages={availablePackages.map((p) => ({
                    id: p.id,
                    name: p.name,
                    sessionsCount: p.sessionsCount,
                    priceCents: p.priceCents,
                    serviceName: p.service.name,
                  }))}
                />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {customer.customerPackages.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum pacote vendido ainda.</p>
                ) : (
                  customer.customerPackages.map((cp) => (
                    <div
                      key={cp.id}
                      className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">{cp.package.name}</p>
                        <p className="text-xs text-muted-foreground">{cp.package.service.name}</p>
                      </div>
                      <p className="font-medium">
                        {cp.sessionsRemaining}/{cp.sessionsTotal} sessões
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerNotesForm customerId={customer.id} notes={customer.notes ?? ""} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
