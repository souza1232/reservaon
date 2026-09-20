import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@prisma/client";

/**
 * Configuração "leve" do Auth.js — sem providers, sem Prisma, sem bcrypt.
 * Usada pelo middleware (roda no Edge Runtime, com limite de tamanho de
 * bundle). A configuração completa (com o Credentials provider) fica em
 * src/auth.ts, usada apenas no runtime Node.js (rotas de API e Server
 * Components), que não tem essa restrição.
 */

declare module "next-auth" {
  interface User {
    role: UserRole;
    companyId: string | null;
    professionalId: string | null;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      companyId: string | null;
      professionalId: string | null;
    };
  }
}

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/entrar",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        return {
          ...token,
          role: user.role,
          companyId: user.companyId,
          professionalId: user.professionalId,
        };
      }
      return token;
    },
    session: async ({ session, token }) => {
      const extra = token as typeof token & {
        role?: UserRole;
        companyId?: string | null;
        professionalId?: string | null;
      };
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = extra.role as UserRole;
        session.user.companyId = extra.companyId ?? null;
        session.user.professionalId = extra.professionalId ?? null;
      }
      return session;
    },
  },
};
