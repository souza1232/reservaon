import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { WorkingHoursForm } from "./working-hours-form";

export const metadata: Metadata = { title: "Horários de funcionamento" };

export default async function WorkingHoursPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const hours = await prisma.workingHour.findMany({
    where: { companyId, professionalId: null },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: { dayOfWeek: true, startTime: true, endTime: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Defina os horários em que sua empresa está aberta para agendamentos. Cada profissional
          pode ter horários próprios em seu cadastro.
        </p>
      </div>
      <SettingsTabs active="/painel/configuracoes/horarios" />
      <WorkingHoursForm initial={hours} />
    </div>
  );
}
