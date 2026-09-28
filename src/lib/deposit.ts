/**
 * Regras do sinal via PIX na hora de agendar (recurso do plano pago,
 * desligado por padrão — a empresa liga em Configurações → Agenda). O PIX
 * cai direto na chave da empresa (ver src/lib/pix.ts); o sistema não sabe
 * sozinho que o dinheiro chegou, então a empresa confirma manualmente
 * ("Sinal recebido" na agenda) e, se o prazo vencer sem confirmação, o
 * horário é liberado (ver src/lib/deposit-expiry.ts).
 */

export interface DepositSettings {
  depositEnabled: boolean;
  depositPixKey: string | null;
  depositMode: string;
  depositValue: number;
}

/** Valor do sinal em centavos pra um serviço de `priceCents`. Nunca passa do preço. */
export function computeDepositCents(
  settings: Pick<DepositSettings, "depositMode" | "depositValue">,
  priceCents: number,
): number {
  const raw =
    settings.depositMode === "FIXED"
      ? settings.depositValue
      : Math.round((priceCents * settings.depositValue) / 100);
  return Math.max(0, Math.min(raw, priceCents));
}

/**
 * Quanto de sinal um agendamento deve exigir — 0 quando não se aplica:
 * empresa fora do plano pago, recurso desligado, sem chave PIX, serviço
 * marcado como "não exige sinal" ou agendamento de valor zero (ex.: sessão
 * de pacote, já paga antes).
 */
export function requiredDepositCents(params: {
  isPaidPlan: boolean;
  settings: DepositSettings | null;
  serviceRequiresDeposit: boolean;
  priceCents: number;
}): number {
  const { isPaidPlan, settings, serviceRequiresDeposit, priceCents } = params;
  if (!isPaidPlan || !settings?.depositEnabled || !settings.depositPixKey) return 0;
  if (!serviceRequiresDeposit || priceCents <= 0) return 0;
  return computeDepositCents(settings, priceCents);
}

/**
 * Prazo pra pagar o sinal: `deadlineMinutes` a partir de agora, mas nunca
 * depois do próprio horário marcado.
 */
export function depositDueAt(now: Date, startAt: Date, deadlineMinutes: number): Date {
  const due = new Date(now.getTime() + deadlineMinutes * 60_000);
  return due < startAt ? due : startAt;
}
