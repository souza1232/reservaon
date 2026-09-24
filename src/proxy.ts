import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createMiddleware from "next-intl/middleware";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";

// Usa a config "leve" (sem Credentials/Prisma/bcrypt) para manter o bundle
// do proxy dentro do limite de tamanho do Edge Runtime.
const { auth } = NextAuth(authConfig);
const handleI18nRouting = createMiddleware(routing);

/**
 * Proteção de rotas em nível de proxy — primeira barreira de defesa.
 * A checagem definitiva (multi-tenant, ownership de recurso) sempre acontece
 * de novo no server (ver src/lib/guards.ts); nunca confie somente nisto aqui.
 */
function areaForRole(role?: string): string {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "PROFESSIONAL") return "/profissional";
  if (role === "RECEPTIONIST") return "/recepcao";
  if (role === "COMPANY_ADMIN") return "/painel";
  return "/entrar";
}

// /painel, /admin e /profissional ainda não são localizados (fase 2) — essa
// função ignora um eventual prefixo de idioma nessas áreas, mas hoje elas
// nunca são acessadas com prefixo.
function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(en|es)(\/.*|$)/);
  return match ? match[2] || "/" : pathname;
}

export default auth((req) => {
  const { nextUrl } = req;
  const path = stripLocalePrefix(nextUrl.pathname);
  const isLoggedIn = !!req.auth?.user;
  const role = req.auth?.user?.role;

  const isAdminArea = path.startsWith("/admin");
  const isPainelArea = path.startsWith("/painel");
  const isProfissionalArea = path.startsWith("/profissional");
  const isRecepcaoArea = path.startsWith("/recepcao");
  const isAuthPage = path === "/entrar" || path === "/cadastro";

  // Áreas autenticadas: comportamento inalterado, sem passar pelo roteamento
  // de idioma do next-intl.
  if (isAdminArea || isPainelArea || isProfissionalArea || isRecepcaoArea) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/entrar", nextUrl));

    const expectedRole = isAdminArea
      ? "SUPER_ADMIN"
      : isPainelArea
        ? "COMPANY_ADMIN"
        : isProfissionalArea
          ? "PROFESSIONAL"
          : "RECEPTIONIST";
    if (role !== expectedRole) {
      return NextResponse.redirect(new URL(areaForRole(role), nextUrl));
    }
    return NextResponse.next();
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL(areaForRole(role), nextUrl));
  }

  // Todo o restante (home, /empresa/*, /entrar, /cadastro) passa pelo
  // roteamento de idioma do next-intl.
  return handleI18nRouting(req);
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
