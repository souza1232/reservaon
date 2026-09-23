import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/dashboard/appointment-status-badge";
import { ClinicalRecordCard } from "@/components/dashboard/clinical-record-card";

export const metadata: Metadata = { title: "Cliente" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfessionalCustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const companyId = session!.user.companyId!;
  const professionalId = session!.user.professionalId!;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      appointments: {
        where: { professionalId },
        orderBy: { startAt: "desc" },
        include: { service: true, professional: true },
      },
      clinicalRecords: {
        orderBy: { createdAt: "desc" },
        include: { photos: { select: { id: true, label: true } } },
      },
    },
  });

  // Um profissional só pode ver a ficha de um cliente que ele já atendeu —
  // se filtrar appointments por professionalId e não sobrar nenhum, ou o
  // cliente é de outra empresa, ou nunca foi atendido por essa pessoa.
  if (!customer || customer.companyId !== companyId || customer.appointments.length === 0) {
    notFound();
  }

  const totalSpent = customer.appointments
    .filter((a) => a.status !== "CANCELED" && a.status !== "NO_SHOW")
    .reduce((sum, a) => sum + a.priceCents, 0);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: { select: { priceCents: true } } },
  });
  const isPaidPlan = Boolean(company?.plan && company.plan.priceCents > 0);

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
              <CardTitle className="text-base">Histórico de agendamentos com você</CardTitle>
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
                    <p className="text-sm text-muted-foreground">{formatDateTime(appt.startAt)}</p>
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
                <span className="text-muted-foreground">Atendimentos com você</span>
                <span>{customer.appointments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total (com você)</span>
                <span className="font-medium">{formatCentsToBRL(totalSpent)}</span>
              </div>
            </CardContent>
          </Card>

          {isPaidPlan && (
            <ClinicalRecordCard
              customerId={customer.id}
              allergies={customer.allergies ?? ""}
              records={customer.clinicalRecords.map((r) => ({
                id: r.id,
                note: r.note,
                authorName: r.authorName,
                createdAt: r.createdAt,
                photos: r.photos,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
