import type { Metadata } from "next";
import { Building2, Wallet, Gift } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Admin — Dashboard" };

// A empresa de demonstração da home não é cliente de verdade.
const DEMO_COMPANY_SLUG = "clinica-exemplo";

/**
 * Painel do dono do ReservaOn, de propósito enxuto: quantos clientes
 * (empresas) pagam, quantos estão no grátis e quanto entra por mês.
 */
export default async function AdminDashboardPage() {
  const [paying, totalCompanies] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        plan: { priceCents: { gt: 0 } },
        company: { slug: { not: DEMO_COMPANY_SLUG } },
      },
      select: { plan: { select: { priceCents: true } } },
    }),
    prisma.company.count({ where: { slug: { not: DEMO_COMPANY_SLUG } } }),
  ]);

  const monthlyRevenueCents = paying.reduce((sum, sub) => sum + sub.plan.priceCents, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Seus clientes</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Clientes pagando" value={paying.length} icon={Building2} />
        <StatCard label="No plano grátis" value={totalCompanies - paying.length} icon={Gift} />
        <StatCard label="Você recebe por mês" value={formatCentsToBRL(monthlyRevenueCents)} icon={Wallet} />
      </div>
    </div>
  );
}
