import type { Metadata } from "next";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin — Clientes" };

// A empresa de demonstração da home não é cliente de verdade.
const DEMO_COMPANY_SLUG = "clinica-exemplo";

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  detail: string;
};

/**
 * Painel do dono do ReservaOn, de propósito enxuto: as empresas divididas em
 * três grupos — pagando, não renovaram (pagamento atrasado/cancelado) e em
 * período de teste.
 */
export default async function AdminDashboardPage() {
  const companies = await prisma.company.findMany({
    where: { slug: { not: DEMO_COMPANY_SLUG } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          startDate: true,
          renewalDate: true,
          canceledAt: true,
          plan: { select: { name: true, priceCents: true } },
        },
      },
    },
  });

  const active: Row[] = [];
  const lapsed: Row[] = [];
  const trial: Row[] = [];
  let monthlyRevenueCents = 0;

  const LAPSED: SubscriptionStatus[] = ["PAST_DUE", "CANCELED", "EXPIRED"];

  for (const c of companies) {
    const sub = c.subscription;
    const base = { id: c.id, name: c.name, city: c.city, state: c.state };
    if (sub?.status === "ACTIVE" && sub.plan.priceCents > 0) {
      monthlyRevenueCents += sub.plan.priceCents;
      active.push({ ...base, detail: `${sub.plan.name} · ${formatCentsToBRL(sub.plan.priceCents)} · desde ${formatDateShort(sub.startDate)}` });
    } else if (sub && LAPSED.includes(sub.status)) {
      const when = sub.canceledAt ?? sub.renewalDate;
      lapsed.push({
        ...base,
        detail: `${sub.status === "PAST_DUE" ? "Pagamento atrasado" : "Cancelou"}${when ? ` · ${formatDateShort(when)}` : ""}`,
      });
    } else {
      // TRIAL, plano grátis ou sem assinatura: ainda não pagou nada.
      trial.push({
        ...base,
        detail: sub?.renewalDate
          ? `Teste até ${formatDateShort(sub.renewalDate)}`
          : `Cadastrou em ${formatDateShort(c.createdAt)}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seus clientes</h1>
        <p className="text-sm text-muted-foreground">
          Você recebe {formatCentsToBRL(monthlyRevenueCents)} por mês
        </p>
      </div>

      <Group title="Pagando" rows={active} empty="Nenhuma empresa pagando ainda." />
      <Group title="Não renovaram" rows={lapsed} empty="Ninguém deixou de pagar." />
      <Group title="Em período de teste / plano grátis" rows={trial} empty="Nenhuma empresa em teste." />
    </div>
  );
}

function Group({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {rows.length === 0 && <p className="px-6 pb-4 text-sm text-muted-foreground">{empty}</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-muted-foreground">
                {r.city}/{r.state}
              </p>
            </div>
            <p className="text-sm">{r.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
