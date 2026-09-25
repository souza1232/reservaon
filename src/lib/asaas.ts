import "server-only";

/**
 * Cliente para a API REST do Asaas (não existe SDK oficial pra Node, é HTTP
 * puro). ASAAS_API_KEY precisa ser obtida no painel do Asaas (Configurações
 * → Integrações → Chave de API) — diferente por ambiente (sandbox começa
 * com $aact_hmlg_, produção com $aact_prod_). ASAAS_ENV escolhe qual host
 * chamar; sem configuração, os fluxos de cobrança retornam erro tratado (ver
 * server/actions/billing.ts) em vez de quebrar a aplicação.
 */

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function getBaseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      "User-Agent": "ReservaOn",
      ...init?.headers,
    },
  });

  const body = await response.json();
  if (!response.ok) {
    const message =
      Array.isArray(body?.errors) && body.errors[0]?.description
        ? body.errors[0].description
        : `Asaas API (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

interface AsaasCustomer {
  id: string;
}

export async function createAsaasCustomer(params: {
  name: string;
  email: string;
  cpfCnpj: string;
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

interface AsaasSubscription {
  id: string;
}

export async function createAsaasSubscription(params: {
  customer: string;
  value: number;
  companyId: string;
  planId: string;
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: params.customer,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: params.value,
      nextDueDate: new Date().toISOString().slice(0, 10),
      description: "Assinatura ReservaOn",
      externalReference: params.companyId,
    }),
  });
}

interface AsaasPayment {
  id: string;
}

/**
 * A primeira cobrança de uma assinatura recém-criada às vezes leva um
 * instante pra aparecer — algumas tentativas curtas antes de desistir.
 */
export async function getFirstPaymentForSubscription(subscriptionId: string): Promise<AsaasPayment> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await asaasFetch<{ data: AsaasPayment[] }>(
      `/payments?subscription=${subscriptionId}&limit=1`,
    );
    if (result.data[0]) return result.data[0];
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Não foi possível localizar a cobrança gerada para a assinatura.");
}

interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return asaasFetch<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`);
}

interface AsaasCheckoutSession {
  id: string;
  link: string; // URL da página hospedada do Asaas pra onde o cliente é redirecionado
}

/**
 * Cria uma sessão do Checkout hospedado do Asaas (não a API de tokenização
 * direta) — o número do cartão é digitado na página do próprio Asaas, nunca
 * passa pelo nosso servidor. Separada de createAsaasSubscription porque a
 * resposta é outra forma (link de redirecionamento, não assinatura+cobrança
 * criadas na hora) — a assinatura real só existe depois que o cliente paga,
 * confirmada via webhook (ver src/app/api/webhooks/asaas/route.ts).
 */
export async function createAsaasCheckoutSession(params: {
  customer: string;
  value: number;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}): Promise<AsaasCheckoutSession> {
  return asaasFetch<AsaasCheckoutSession>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      customer: params.customer,
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: new Date().toISOString().slice(0, 10),
      },
      items: [
        { name: "Assinatura ReservaOn", description: "Assinatura ReservaOn", quantity: 1, value: params.value },
      ],
      callback: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        expiredUrl: params.expiredUrl,
      },
      minutesToExpire: 60,
    }),
  });
}
