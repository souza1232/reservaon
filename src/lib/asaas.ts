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
