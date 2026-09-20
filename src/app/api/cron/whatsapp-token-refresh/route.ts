import { NextResponse } from "next/server";
import {
  getWhatsappAccessToken,
  getWhatsappTokenExpiry,
  saveWhatsappAccessToken,
} from "@/lib/whatsapp-token-store";

/**
 * Roda 1x por dia (ver vercel.json). O token de acesso da WhatsApp Cloud API
 * é um long-lived user token (~60 dias). Antes de expirar, troca ele por um
 * novo via fb_exchange_token — chamada simples entre o app e o token atual,
 * sem passar pela verificação de conta/telefone que trava a geração de
 * token de system user pelo painel da Meta. Ver src/lib/whatsapp-token-store.ts:
 * o token renovado é salvo no banco (não só na env var), porque uma env var
 * trocada na Vercel só vale a partir do próximo deploy.
 */

const RENEW_IF_EXPIRING_WITHIN_DAYS = 10;
const GRAPH_API_VERSION = "v21.0";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "FACEBOOK_APP_ID/FACEBOOK_APP_SECRET não configurados." },
      { status: 500 },
    );
  }

  const currentToken = await getWhatsappAccessToken();
  if (!currentToken) {
    return NextResponse.json({ error: "Nenhum token de WhatsApp disponível." }, { status: 500 });
  }

  const expiresAt = await getWhatsappTokenExpiry();
  const daysUntilExpiry = expiresAt
    ? (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    : 0;

  if (expiresAt && daysUntilExpiry > RENEW_IF_EXPIRING_WITHIN_DAYS) {
    return NextResponse.json({
      renewed: false,
      reason: "Token ainda válido por mais tempo do que o limiar de renovação.",
      expiresAt,
      daysUntilExpiry: Math.round(daysUntilExpiry),
    });
  }

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", currentToken);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok || !body.access_token) {
    return NextResponse.json(
      { renewed: false, error: "Falha ao trocar o token na Meta.", details: body },
      { status: 502 },
    );
  }

  const newExpiresAt = new Date(Date.now() + body.expires_in * 1000);
  await saveWhatsappAccessToken(body.access_token, newExpiresAt);

  return NextResponse.json({ renewed: true, expiresAt: newExpiresAt });
}
