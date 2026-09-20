import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Duas chaves: por IP (contra varredura de várias contas) e por e-mail
        // (contra força bruta focada numa única conta, mesmo via IPs
        // diferentes/rotativos). Mesmo padrão usado no reset de senha e no
        // agendamento público (ver src/lib/rate-limit.ts).
        const ip = await getClientIp();
        const [ipAllowed, emailAllowed] = await Promise.all([
          checkRateLimit({ key: `login:ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 }),
          checkRateLimit({
            key: `login:email:${email.toLowerCase()}`,
            limit: 8,
            windowMs: 15 * 60 * 1000,
          }),
        ]);
        if (!ipAllowed || !emailAllowed) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: { professional: { select: { id: true } } },
        });
        if (!user) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // Empresa bloqueada não pode autenticar (exceto super admin, que não tem companyId).
        if (user.companyId) {
          const company = await prisma.company.findUnique({
            where: { id: user.companyId },
            select: { status: true },
          });
          if (!company || company.status === "BLOCKED") return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          professionalId: user.professional?.id ?? null,
        };
      },
    }),
  ],
});
