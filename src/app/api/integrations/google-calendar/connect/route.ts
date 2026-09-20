import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured, getGoogleAuthUrl, signOAuthState } from "@/lib/google-calendar";

/**
 * Início do fluxo OAuth de conexão do Google Agenda — só o próprio
 * profissional conecta a própria conta (ver decisão no plano técnico:
 * cada um conecta individualmente, nunca uma conta única da empresa).
 * Redireciona pra tela de consentimento do Google; o retorno cai em
 * .../callback/route.ts.
 */
export async function GET() {
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { error: "Integração com Google Agenda não configurada nesta instalação." },
      { status: 501 },
    );
  }

  const session = await auth();
  if (!session?.user || session.user.role !== "PROFESSIONAL" || !session.user.professionalId) {
    return NextResponse.json(
      { error: "Apenas um profissional autenticado pode conectar a própria agenda." },
      { status: 403 },
    );
  }

  // Sessão é JWT e não sabe sozinha se a empresa foi bloqueada depois do
  // login — mesma checagem feita em requireCompanySession (src/lib/guards.ts).
  if (session.user.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: { status: true },
    });
    if (!company || company.status === "BLOCKED") {
      return NextResponse.json({ error: "Empresa bloqueada ou inexistente." }, { status: 403 });
    }
  }

  const state = signOAuthState(session.user.professionalId);
  return NextResponse.redirect(getGoogleAuthUrl(state));
}
