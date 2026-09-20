/**
 * Núcleo puro da checagem multi-tenant — sem dependência de Next.js/Auth.js,
 * para poder ser testado isoladamente (ver __tests__/tenant-guard.test.ts).
 * Reexportado por src/lib/guards.ts junto com os helpers de sessão.
 */

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Garante que o `companyId` da sessão é exatamente o esperado.
 * Use ao validar recursos aninhados (ex: /painel/clientes/[id]) para
 * confirmar que o registro pertence à empresa autenticada antes de expor
 * ou alterar dados — nunca confie apenas no fato de o ID ter sido encontrado.
 */
export function assertSameCompany(sessionCompanyId: string, resourceCompanyId: string) {
  if (sessionCompanyId !== resourceCompanyId) {
    throw new AuthError("Recurso não pertence à sua empresa.", 403);
  }
}
