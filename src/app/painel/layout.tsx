import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LayoutDashboard, CalendarDays, Scissors, Users, UserCircle, UserCog, Settings, CreditCard, Package, BarChart3 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell, type NavItem } from "@/components/dashboard/app-shell";

const navItems: NavItem[] = [
  { href: "/painel", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/painel/agenda", label: "Agenda", icon: <CalendarDays className="h-4 w-4" /> },
  { href: "/painel/relatorios", label: "Relatórios", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/painel/servicos", label: "Serviços", icon: <Scissors className="h-4 w-4" /> },
  { href: "/painel/pacotes", label: "Pacotes", icon: <Package className="h-4 w-4" /> },
  { href: "/painel/profissionais", label: "Profissionais", icon: <UserCircle className="h-4 w-4" /> },
  { href: "/painel/recepcionistas", label: "Recepcionistas", icon: <UserCog className="h-4 w-4" /> },
  { href: "/painel/clientes", label: "Clientes", icon: <Users className="h-4 w-4" /> },
  { href: "/painel/assinatura", label: "Assinatura", icon: <CreditCard className="h-4 w-4" /> },
  { href: "/painel/configuracoes", label: "Configurações", icon: <Settings className="h-4 w-4" /> },
];

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
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
      badgeLabel={company?.name ?? "Painel da empresa"}
      title="Painel"
      userName={session.user.name ?? session.user.email}
    >
      {children}
    </AppShell>
  );
}
