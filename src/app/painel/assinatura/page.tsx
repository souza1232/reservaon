import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { isAsaasConfigured } from "@/lib/asaas";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpgradeButton, ManageBillingButton, AsaasPixButton, AsaasCardButton } from "./billing-actions";

export const metadata: Metadata = { title: "Assinatura" };

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIAL: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function BillingPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [company, plans] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { subscription: true, plan: true },
    }),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
  ]);

  const stripeReady = isStripeConfigured();
  const asaasReady = isAsaasConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
        <p className="text-sm text-muted-foreground">Gerencie o plano e a cobrança da sua empresa.</p>
      </div>

      {status === "sucesso" && (
        <Alert>
          <AlertDescription>
            Pagamento confirmado! Pode levar alguns instantes para o plano atualizar aqui.
          </AlertDescription>
        </Alert>
      )}
      {status === "cancelado" && (
        <Alert variant="destructive">
          <AlertDescription>Checkout cancelado — nenhuma cobrança foi feita.</AlertDescription>
        </Alert>
      )}
      {!stripeReady && (
        <Alert variant="destructive">
          <AlertDescription>
            Cobrança online ainda não configurada nesta instalação (faltam as variáveis
            STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET). Os planos abaixo
            ficam visíveis, mas o botão de upgrade não funciona até isso ser configurado.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plano</span>
            <span className="font-medium">{company.plan?.name ?? "Nenhum"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={company.subscription?.status === "ACTIVE" ? "default" : "outline"}>
              {company.subscription
                ? (SUBSCRIPTION_STATUS_LABELS[company.subscription.status] ?? company.subscription.status)
                : "Sem assinatura"}
            </Badge>
          </div>
          {company.subscription?.renewalDate && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Próxima renovação</span>
              <span className="font-medium">{formatDateShort(company.subscription.renewalDate)}</span>
            </div>
          )}
          {company.subscription?.externalCustomerId && (
            <div className="pt-2">
              <ManageBillingButton />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
          const isCurrent = company.planId === plan.id;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {plan.name}
                  {isCurrent && <Badge>Atual</Badge>}
                </CardTitle>
                <p className="text-2xl font-bold">
                  {plan.priceCents === 0 ? "Grátis" : formatCentsToBRL(plan.priceCents)}
                  {plan.priceCents > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.priceCents > 0 && (
                  <div className="space-y-2">
                    {plan.stripePriceId && stripeReady && (
                      <UpgradeButton planId={plan.id} label={`Assinar ${plan.name} (cartão)`} />
                    )}
                    {asaasReady && (
                      <AsaasPixButton
                        planId={plan.id}
                        label={`Assinar ${plan.name} (PIX)`}
                        hasDocument={Boolean(company.cnpj)}
                      />
                    )}
                    {asaasReady && (
                      <AsaasCardButton
                        planId={plan.id}
                        label={`Assinar ${plan.name} (cartão)`}
                        hasDocument={Boolean(company.cnpj)}
                      />
                    )}
                    {!stripeReady && !asaasReady && (
                      <p className="text-xs text-muted-foreground">
                        Cobrança online indisponível no momento para este plano.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
