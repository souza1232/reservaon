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

const NON_LOCALIZED_PAGES = [
  "/esqueci-senha",
  "/redefinir-senha",
  "/verificar-email",
];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
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

  // Páginas públicas que não ficam sob [locale] — se passarem pelo next-intl
  // ele reescreve pra /pt/<página>, que não existe, e dá 404. (Páginas que
  // usam SiteHeader/SiteFooter precisam ficar sob [locale], por causa do
  // contexto de tradução — ex.: /sobre, /termos, /privacidade.)
  if (NON_LOCALIZED_PAGES.some((page) => path === page || path.startsWith(`${page}/`))) {
    return NextResponse.next();
  }

  // Todo o restante (home, /empresa/*, /entrar, /cadastro) passa pelo
  // roteamento de idioma do next-intl.
  return handleI18nRouting(req);
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
