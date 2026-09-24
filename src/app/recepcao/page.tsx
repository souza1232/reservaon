import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AgendaView } from "@/components/dashboard/agenda-view";

export const metadata: Metadata = { title: "Agenda" };

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string }>;
}

export default async function ReceptionAgendaPage({ searchParams }: PageProps) {
  const session = await auth();
  const companyId = session!.user.companyId!;
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

  const [services, professionals, customers] = await Promise.all([
    prisma.service.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMinutes: true },
    }),
    prisma.professional.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, whatsapp: true },
    }),
  ]);

  return (
    <AgendaView
      basePath="/recepcao"
      timezone={company.timezone}
      view={view}
      dateISO={dateISO}
      scope={{ companyId }}
      services={services}
      professionals={professionals}
      customers={customers}
    />
  );
}
