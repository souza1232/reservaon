import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CalendarDays, Users, Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell, type NavItem } from "@/components/dashboard/app-shell";

const navItems: NavItem[] = [
  { href: "/profissional", label: "Minha agenda", icon: <CalendarDays className="h-4 w-4" />, exact: true },
  { href: "/profissional/clientes", label: "Meus clientes", icon: <Users className="h-4 w-4" /> },
  { href: "/profissional/configuracoes", label: "Google Agenda", icon: <Settings className="h-4 w-4" /> },
];

export default async function ProfissionalLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "PROFESSIONAL" || !session.user.companyId) {
    redirect("/entrar");
  }

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { name: true, status: true },
  });

  // Sessão é JWT e não sabe sozinha se a empresa foi bloqueada depois do
  // login (ex: assinatura ficou PAST_DUE/CANCELED — ver webhook do Stripe).
  if (company?.status === "BLOCKED") {
    redirect("/entrar?motivo=bloqueado");
  }

  return (
    <AppShell
      navItems={navItems}
      badgeLabel={company?.name ?? "Área do profissional"}
      title="Minha agenda"
      userName={session.user.name ?? session.user.email}
    >
      {children}
    </AppShell>
  );
}
