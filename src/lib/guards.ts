import "server-only";
import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSameCompany } from "@/lib/tenant-guard";

export { AuthError, assertSameCompany };

/**
 * Camada central de autorização multi-tenant.
 *
 * Toda rota/API/server action que manipula dados de uma empresa DEVE passar
 * por uma destas funções antes de tocar no Prisma. Nunca aceite um
 * `companyId` vindo do cliente (body, query, params) sem confrontá-lo com o
 * `companyId` da sessão — é isso que impede uma empresa de acessar dados de
 * outra manipulando URLs ou IDs.
 */

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError("Não autenticado.", 401);
  }
  return session;
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    throw new AuthError("Sem permissão para esta ação.", 403);
  }
  return session;
}

/**
 * A sessão é um JWT: uma vez emitido, ele não sabe sozinho se a empresa foi
 * bloqueada depois (ex: assinatura ficou PAST_DUE/CANCELED — ver webhook do
 * Stripe). Por isso as duas funções abaixo confirmam `status` direto no
 * banco a cada chamada, em vez de confiar só no que veio no token.
 */
async function assertCompanyActive(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { status: true },
  });
  if (!company || company.status === "BLOCKED") {
    throw new AuthError("Empresa bloqueada ou inexistente.", 403);
  }
}

/** Admin, profissional ou recepcionista autenticado de uma empresa (qualquer papel de tenant). */
export async function requireCompanySession() {
  const session = await requireRole(["COMPANY_ADMIN", "PROFESSIONAL", "RECEPTIONIST"]);
  if (!session.user.companyId) {
    throw new AuthError("Usuário sem empresa vinculada.", 403);
  }
  await assertCompanyActive(session.user.companyId);
  return session as typeof session & { user: { companyId: string } };
}

/** Somente administrador da empresa. */
export async function requireCompanyAdmin() {
  const session = await requireRole(["COMPANY_ADMIN"]);
  if (!session.user.companyId) {
    throw new AuthError("Usuário sem empresa vinculada.", 403);
  }
  await assertCompanyActive(session.user.companyId);
  return session as typeof session & { user: { companyId: string } };
}

/** Somente super admin da plataforma. */
export async function requireSuperAdmin() {
  return requireRole(["SUPER_ADMIN"]);
}

/**
 * Admin da empresa, e a empresa precisa estar num plano pago
 * (`plan.priceCents > 0`) — primeira trava desse tipo no sistema. Recurso
 * atual: pacotes de sessões. Busca o plano fresco no banco a cada chamada,
 * pelo mesmo motivo de assertCompanyActive: a sessão (JWT) não sabe sozinha
 * se a empresa fez downgrade depois de emitido o token.
 */
export async function requirePaidPlan() {
  const session = await requireCompanyAdmin();
  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { plan: { select: { priceCents: true } } },
  });
  if (!company?.plan || company.plan.priceCents <= 0) {
    throw new AuthError("Este recurso está disponível apenas no plano pago.", 403);
  }
  return session;
}

/**
 * Admin ou profissional da empresa (qualquer papel de tenant), e a empresa
 * precisa estar em plano pago. Igual a requirePaidPlan, mas construído sobre
 * requireCompanySession em vez de requireCompanyAdmin — usado por recursos
 * que o profissional também precisa poder escrever (ex: prontuário), ao
 * contrário de Pacotes, que é exclusivo do admin.
 */
export async function requirePaidPlanCompanySession() {
  const session = await requireCompanySession();
  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { plan: { select: { priceCents: true } } },
  });
  if (!company?.plan || company.plan.priceCents <= 0) {
    throw new AuthError("Este recurso está disponível apenas no plano pago.", 403);
  }
  return session;
}
