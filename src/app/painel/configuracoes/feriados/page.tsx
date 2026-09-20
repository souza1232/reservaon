import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { HolidaysManager } from "./holidays-manager";

export const metadata: Metadata = { title: "Feriados" };

export default async function HolidaysPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const holidays = await prisma.holiday.findMany({
    where: { companyId },
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Datas em que sua empresa não atende — nenhum horário será exibido nesses dias.
        </p>
      </div>
      <SettingsTabs active="/painel/configuracoes/feriados" />
      <HolidaysManager
        holidays={holidays.map((h) => ({
          id: h.id,
          date: h.date.toISOString(),
          description: h.description,
        }))}
      />
    </div>
  );
}
