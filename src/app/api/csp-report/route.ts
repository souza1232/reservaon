import { NextResponse } from "next/server";

/**
 * Recebe os relatórios de violação da CSP em modo Report-Only (ver
 * next.config.ts) — nada é bloqueado ainda, só registrado no log do
 * servidor (visível no dashboard da Vercel). O objetivo é revisar aqui
 * antes de trocar pra `Content-Security-Policy` de verdade (bloqueando).
 * Navegadores mandam `Content-Type: application/csp-report` (formato
 * antigo, ainda o mais usado) ou `application/reports+json` (Reporting API
 * nova) — aceita os dois sem validar o schema, é só log.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.warn("[csp-report]", JSON.stringify(body));
  } catch {
    // Corpo vazio ou não-JSON — ignora, não é o que importa aqui.
  }
  return new NextResponse(null, { status: 204 });
}
