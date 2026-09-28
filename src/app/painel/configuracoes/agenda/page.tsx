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

  const [settings, company] = await Promise.all([
    prisma.companySettings.findUnique({ where: { companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { plan: { select: { priceCents: true } } } }),
  ]);
  const isPaidPlan = (company?.plan?.priceCents ?? 0) > 0;
  const depositMode = settings?.depositMode === "FIXED" ? "FIXED" : "PERCENT";

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
    depositEnabled: settings?.depositEnabled ?? false,
    depositPixKey: settings?.depositPixKey ?? "",
    depositMode,
    // No banco, FIXED fica em centavos; no formulário, em reais.
    depositValue:
      depositMode === "FIXED" ? (settings?.depositValue ?? 2000) / 100 : (settings?.depositValue ?? 30),
    depositDeadlineMinutes: settings?.depositDeadlineMinutes ?? 120,
    depositAutoCancel: settings?.depositAutoCancel ?? true,
    depositPolicyText: settings?.depositPolicyText ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      </div>
      <SettingsTabs active="/painel/configuracoes/agenda" />
      <AgendaSettingsForm defaultValues={defaultValues} isPaidPlan={isPaidPlan} />
    </div>
  );
}
