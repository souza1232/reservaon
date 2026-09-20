import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOAuthState, exchangeCodeForTokens } from "@/lib/google-calendar";

/**
 * Callback do OAuth do Google Agenda — recebe `code`+`state` (state assinado
 * em .../connect/route.ts, contém o professionalId), troca o código pelos
 * tokens e grava/atualiza a GoogleCalendarConnection daquele profissional.
 * Sempre redireciona de volta pra /profissional/configuracoes, com sucesso
 * ou erro, nunca deixa o usuário preso numa tela de erro genérica do Next.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;

  const professionalId = verifyOAuthState(state);
  if (!code || !professionalId) {
    return NextResponse.redirect(`${appUrl}/profissional/configuracoes?google=erro`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await prisma.googleCalendarConnection.upsert({
      where: { professionalId },
      create: {
        professionalId,
        googleAccountEmail: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        googleAccountEmail: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    return NextResponse.redirect(`${appUrl}/profissional/configuracoes?google=conectado`);
  } catch (error) {
    console.error("[google-calendar-oauth] falha ao trocar código por tokens:", error);
    return NextResponse.redirect(`${appUrl}/profissional/configuracoes?google=erro`);
  }
}
