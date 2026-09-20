import "server-only";
import Stripe from "stripe";

/**
 * Cliente Stripe compartilhado. STRIPE_SECRET_KEY precisa ser obtida no
 * painel do Stripe (Developers → API keys) — não é algo que possa ser gerado
 * programaticamente, então precisa ser colada manualmente nas variáveis de
 * ambiente. Sem ela, as ações de cobrança retornam erro tratado (ver
 * billing.ts) em vez de quebrar a aplicação.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  if (!cachedClient) {
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cachedClient;
}
