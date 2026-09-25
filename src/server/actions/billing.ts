"use server";

import { prisma } from "@/lib/prisma";
import { requireCompanyAdmin } from "@/lib/guards";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";
import {
  isAsaasConfigured,
  createAsaasCustomer,
  createAsaasSubscription,
  createAsaasCheckoutSession,
  getFirstPaymentForSubscription,
  getPixQrCode,
} from "@/lib/asaas";
import { actionError, actionSuccess, type ActionResult } from "./types";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Cria uma sessão do Stripe Checkout para assinar/trocar de plano pago. */
export async function createCheckoutSessionAction(
  planId: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await requireCompanyAdmin();

  if (!isStripeConfigured()) {
    return actionError(
      "Pagamentos ainda não configurados nesta instalação (falta STRIPE_SECRET_KEY).",
    );
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) return actionError("Plano inválido.");
  if (!plan.stripePriceId) {
    return actionError("Este plano ainda não está configurado para cobrança online.");
  }

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    include: { subscription: true },
  });
  if (!company) return actionError("Empresa não encontrada.");

  const stripe = getStripeClient();

  try {
    let customerId = company.subscription?.externalCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.email,
        name: company.name,
        metadata: { companyId: company.id },
      });
      customerId = customer.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${appUrl()}/painel/assinatura?status=sucesso`,
      cancel_url: `${appUrl()}/painel/assinatura?status=cancelado`,
      metadata: { companyId: company.id, planId: plan.id },
      subscription_data: { metadata: { companyId: company.id, planId: plan.id } },
    });

    if (!checkoutSession.url) {
      return actionError("Não foi possível iniciar o checkout.");
    }

    return actionSuccess({ url: checkoutSession.url });
  } catch {
    return actionError("Não foi possível iniciar o checkout com o Stripe.");
  }
}

/** Cria uma sessão do Portal do Cliente Stripe (gerenciar cartão, cancelar, ver faturas). */
export async function createBillingPortalSessionAction(): Promise<ActionResult<{ url: string }>> {
  const session = await requireCompanyAdmin();

  if (!isStripeConfigured()) {
    return actionError("Pagamentos ainda não configurados nesta instalação.");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { companyId: session.user.companyId },
  });
  if (!subscription?.externalCustomerId) {
    return actionError("Esta empresa ainda não possui uma assinatura paga ativa.");
  }

  const stripe = getStripeClient();
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.externalCustomerId,
      return_url: `${appUrl()}/painel/assinatura`,
    });
    return actionSuccess({ url: portalSession.url });
  } catch {
    return actionError("Não foi possível abrir o portal de cobrança.");
  }
}

function normalizeCpfCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

interface PixCheckoutResult {
  qrCodeImage: string;
  copyPaste: string;
  expirationDate: string;
}

/**
 * Cria (ou reaproveita) o cliente e a assinatura no Asaas, e devolve o QR
 * Code da primeira cobrança — diferente do fluxo Stripe, não há URL de
 * redirecionamento: o cliente paga o PIX direto na tela (ver AsaasPixButton
 * em painel/assinatura/billing-actions.tsx). Assinaturas seguintes são
 * geradas automaticamente pelo próprio Asaas, sem cron nosso.
 */
export async function createAsaasSubscriptionAction(
  planId: string,
  cpfCnpj: string,
): Promise<ActionResult<PixCheckoutResult>> {
  const session = await requireCompanyAdmin();

  if (!isAsaasConfigured()) {
    return actionError("Pagamentos ainda não configurados nesta instalação (falta ASAAS_API_KEY).");
  }

  const normalizedDocument = normalizeCpfCnpj(cpfCnpj);
  if (normalizedDocument.length !== 11 && normalizedDocument.length !== 14) {
    return actionError("CPF ou CNPJ inválido.");
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) return actionError("Plano inválido.");

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    include: { subscription: true },
  });
  if (!company) return actionError("Empresa não encontrada.");

  try {
    if (company.cnpj !== normalizedDocument) {
      await prisma.company.update({
        where: { id: company.id },
        data: { cnpj: normalizedDocument },
      });
    }

    let customerId = company.subscription?.externalProvider === "asaas"
      ? company.subscription.externalCustomerId ?? undefined
      : undefined;
    if (!customerId) {
      const customer = await createAsaasCustomer({
        name: company.name,
        email: company.email,
        cpfCnpj: normalizedDocument,
      });
      customerId = customer.id;
    }

    const asaasSubscription = await createAsaasSubscription({
      customer: customerId,
      value: plan.priceCents / 100,
      companyId: company.id,
      planId: plan.id,
    });

    await prisma.subscription.upsert({
      where: { companyId: company.id },
      update: {
        planId: plan.id,
        status: "PAST_DUE", // vira ACTIVE quando o webhook confirmar o primeiro pagamento
        externalProvider: "asaas",
        externalCustomerId: customerId,
        externalSubId: asaasSubscription.id,
        externalPaymentMethod: "pix",
        startDate: new Date(),
        canceledAt: null,
      },
      create: {
        companyId: company.id,
        planId: plan.id,
        status: "PAST_DUE",
        externalProvider: "asaas",
        externalCustomerId: customerId,
        externalSubId: asaasSubscription.id,
        externalPaymentMethod: "pix",
      },
    });

    const payment = await getFirstPaymentForSubscription(asaasSubscription.id);
    const qrCode = await getPixQrCode(payment.id);

    return actionSuccess({
      qrCodeImage: qrCode.encodedImage,
      copyPaste: qrCode.payload,
      expirationDate: qrCode.expirationDate,
    });
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "Não foi possível criar a assinatura via PIX.",
    );
  }
}

interface CardCheckoutResult {
  url: string;
}

/**
 * Cria (ou reaproveita) o cliente no Asaas e devolve a URL do Checkout
 * hospedado pra pagamento por cartão — o número do cartão é digitado na
 * página do próprio Asaas, nunca passa pelo nosso servidor. Diferente do
 * PIX, a assinatura de verdade só existe no Asaas depois que o cliente
 * termina o checkout, então salvamos aqui um registro PENDENTE (sem
 * externalSubId ainda) pra o webhook conseguir achar a empresa certa pelo
 * externalCustomerId quando o pagamento for confirmado (ver
 * src/app/api/webhooks/asaas/route.ts — o campo externalReference do
 * Checkout não é propagado de forma confiável pelo Asaas até a assinatura
 * gerada, por isso não usamos ele pra esse vínculo).
 */
export async function createAsaasCardCheckoutAction(
  planId: string,
  cpfCnpj: string,
): Promise<ActionResult<CardCheckoutResult>> {
  const session = await requireCompanyAdmin();

  if (!isAsaasConfigured()) {
    return actionError("Pagamentos ainda não configurados nesta instalação (falta ASAAS_API_KEY).");
  }

  const normalizedDocument = normalizeCpfCnpj(cpfCnpj);
  if (normalizedDocument.length !== 11 && normalizedDocument.length !== 14) {
    return actionError("CPF ou CNPJ inválido.");
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) return actionError("Plano inválido.");

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    include: { subscription: true },
  });
  if (!company) return actionError("Empresa não encontrada.");

  try {
    if (company.cnpj !== normalizedDocument) {
      await prisma.company.update({
        where: { id: company.id },
        data: { cnpj: normalizedDocument },
      });
    }

    let customerId = company.subscription?.externalProvider === "asaas"
      ? company.subscription.externalCustomerId ?? undefined
      : undefined;
    if (!customerId) {
      const customer = await createAsaasCustomer({
        name: company.name,
        email: company.email,
        cpfCnpj: normalizedDocument,
      });
      customerId = customer.id;
    }

    const checkout = await createAsaasCheckoutSession({
      customer: customerId,
      value: plan.priceCents / 100,
      successUrl: `${appUrl()}/painel/assinatura?status=sucesso`,
      cancelUrl: `${appUrl()}/painel/assinatura?status=cancelado`,
      expiredUrl: `${appUrl()}/painel/assinatura?status=expirado`,
    });

    await prisma.subscription.upsert({
      where: { companyId: company.id },
      update: {
        planId: plan.id,
        status: "PAST_DUE",
        externalProvider: "asaas",
        externalCustomerId: customerId,
        externalSubId: null, // só o webhook preenche, quando o checkout for concluído
        externalPaymentMethod: "credit_card",
        startDate: new Date(),
        canceledAt: null,
      },
      create: {
        companyId: company.id,
        planId: plan.id,
        status: "PAST_DUE",
        externalProvider: "asaas",
        externalCustomerId: customerId,
        externalPaymentMethod: "credit_card",
      },
    });

    return actionSuccess({ url: checkout.link });
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "Não foi possível iniciar o checkout com cartão.",
    );
  }
}

/** Status atual da assinatura da empresa — usado pelo polling da tela de PIX. */
export async function getSubscriptionStatusAction(): Promise<ActionResult<{ status: string | null }>> {
  const session = await requireCompanyAdmin();
  const subscription = await prisma.subscription.findUnique({
    where: { companyId: session.user.companyId },
    select: { status: true },
  });
  return actionSuccess({ status: subscription?.status ?? null });
}
