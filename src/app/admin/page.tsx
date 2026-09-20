import type { Metadata } from "next";
import { Building2, Users, CalendarCheck, Wallet, ShieldCheck, ShieldX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Admin — Dashboard" };

export default async function AdminDashboardPage() {
  const [
    totalCompanies,
    activeCompanies,
    blockedCompanies,
    totalUsers,
    totalAppointments,
    activeSubscriptions,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.company.count({ where: { status: "BLOCKED" } }),
    prisma.user.count(),
    prisma.appointment.count(),
    prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      include: { plan: true },
    }),
  ]);

  const monthlyRevenueCents = activeSubscriptions.reduce((sum, sub) => sum + sub.plan.priceCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard da plataforma</h1>
        <p className="text-sm text-muted-foreground">Visão geral de todas as empresas do ReservaOn.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Empresas cadastradas" value={totalCompanies} icon={Building2} />
        <StatCard label="Empresas ativas" value={activeCompanies} icon={ShieldCheck} />
        <StatCard label="Empresas bloqueadas" value={blockedCompanies} icon={ShieldX} />
        <StatCard label="Usuários" value={totalUsers} icon={Users} />
        <StatCard label="Agendamentos (total)" value={totalAppointments} icon={CalendarCheck} />
        <StatCard
          label="Receita recorrente estimada (MRR)"
          value={formatCentsToBRL(monthlyRevenueCents)}
          icon={Wallet}
        />
      </div>
    </div>
  );
}
