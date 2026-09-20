import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AgendaView } from "@/components/dashboard/agenda-view";

export const metadata: Metadata = { title: "Minha agenda" };

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string }>;
}

export default async function ProfessionalAgendaPage({ searchParams }: PageProps) {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const professionalId = session!.user.professionalId!;
  const params = await searchParams;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { timezone: true },
  });

  const view = (params.view === "semana" || params.view === "mes" ? params.view : "dia") as
    | "dia"
    | "semana"
    | "mes";
  const dateISO = params.date || formatInTimeZone(new Date(), company.timezone, "yyyy-MM-dd");

  const [services, customers] = await Promise.all([
    prisma.service.findMany({
      where: { companyId, isActive: true, professionals: { some: { professionalId } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMinutes: true },
    }),
    prisma.customer.findMany({
      where: { companyId, appointments: { some: { professionalId } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, whatsapp: true },
    }),
  ]);

  return (
    <AgendaView
      basePath="/profissional"
      timezone={company.timezone}
      view={view}
      dateISO={dateISO}
      scope={{ companyId, professionalId }}
      services={services}
      professionals={[{ id: professionalId, name: session!.user.name! }]}
      customers={customers}
      lockedProfessionalId={professionalId}
    />
  );
}
