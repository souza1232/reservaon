import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/constants";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { AgendaSettingsForm } from "./settings-form";
import type { CompanySettingsInput } from "@/lib/validations/company";

export const metadata: Metadata = { title: "Configurações de agenda" };

export default async function AgendaSettingsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const settings = await prisma.companySettings.findUnique({ where: { companyId } });

  const defaultValues: CompanySettingsInput = {
    slotIntervalMinutes: settings?.slotIntervalMinutes ?? DEFAULT_COMPANY_SETTINGS.slotIntervalMinutes,
    minAdvanceMinutes: settings?.minAdvanceMinutes ?? DEFAULT_COMPANY_SETTINGS.minAdvanceMinutes,
    maxFutureDays: settings?.maxFutureDays ?? DEFAULT_COMPANY_SETTINGS.maxFutureDays,
    bufferBetweenMinutes: settings?.bufferBetweenMinutes ?? DEFAULT_COMPANY_SETTINGS.bufferBetweenMinutes,
    notifyOnConfirmation: settings?.notifyOnConfirmation ?? true,
    notifyOnReminder: settings?.notifyOnReminder ?? false,
    notifyOnCancellation: settings?.notifyOnCancellation ?? true,
    notifyOnReschedule: settings?.notifyOnReschedule ?? true,
    waitlistEnabled: settings?.waitlistEnabled ?? false,
    waitlistOfferWindowHours: settings?.waitlistOfferWindowHours ?? 6,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      </div>
      <SettingsTabs active="/painel/configuracoes/agenda" />
      <AgendaSettingsForm defaultValues={defaultValues} />
    </div>
  );
}
