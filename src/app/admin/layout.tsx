import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LayoutDashboard, Building2, CreditCard } from "lucide-react";
import { auth } from "@/auth";
import { AppShell, type NavItem } from "@/components/dashboard/app-shell";

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/admin/empresas", label: "Empresas", icon: <Building2 className="h-4 w-4" /> },
  { href: "/admin/planos", label: "Planos", icon: <CreditCard className="h-4 w-4" /> },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/entrar");
  }

  return (
    <AppShell
      navItems={navItems}
      badgeLabel="Super Admin"
      title="Administração"
      userName={session.user.name ?? session.user.email}
    >
      {children}
    </AppShell>
  );
}
