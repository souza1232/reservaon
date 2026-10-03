import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin — Clientes" };

// A empresa de demonstração da home não é cliente de verdade.
const DEMO_COMPANY_SLUG = "clinica-exemplo";

/**
 * Painel do dono do ReservaOn, de propósito enxuto: só as empresas que
 * estão pagando a assinatura, e quanto isso dá por mês.
 */
export default async function AdminDashboardPage() {
  const paying = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      plan: { priceCents: { gt: 0 } },
      company: { slug: { not: DEMO_COMPANY_SLUG } },
    },
    orderBy: { startDate: "desc" },
    select: {
      startDate: true,
      plan: { select: { name: true, priceCents: true } },
      company: { select: { id: true, name: true, city: true, state: true } },
    },
  });

  const monthlyRevenueCents = paying.reduce((sum, sub) => sum + sub.plan.priceCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas que pagam</h1>
        <p className="text-sm text-muted-foreground">
          {paying.length} {paying.length === 1 ? "empresa" : "empresas"} · {formatCentsToBRL(monthlyRevenueCents)} por mês
        </p>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {paying.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma empresa pagando ainda.
            </p>
          )}
          {paying.map((sub) => (
            <div key={sub.company.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{sub.company.name}</p>
                <p className="text-sm text-muted-foreground">
                  {sub.company.city}/{sub.company.state} · assina desde {formatDateShort(sub.startDate)}
                </p>
              </div>
              <p className="text-sm font-medium">
                {sub.plan.name} · {formatCentsToBRL(sub.plan.priceCents)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
