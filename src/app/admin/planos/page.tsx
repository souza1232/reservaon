import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanFormDialog } from "./plan-form-dialog";

export const metadata: Metadata = { title: "Admin — Planos" };

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { priceCents: "asc" },
    include: { _count: { select: { companies: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planos</h1>
          <p className="text-sm text-muted-foreground">
            Configure os planos e valores exibidos na landing page.
          </p>
        </div>
        <PlanFormDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Profissionais</TableHead>
                <TableHead>Agendamentos/mês</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    {plan.name} {plan.isDefault && <Badge className="ml-2">Padrão</Badge>}
                  </TableCell>
                  <TableCell>{formatCentsToBRL(plan.priceCents)}</TableCell>
                  <TableCell>{plan.maxProfessionals ?? "Ilimitado"}</TableCell>
                  <TableCell>{plan.maxAppointmentsPerMonth ?? "Ilimitado"}</TableCell>
                  <TableCell>{plan._count.companies}</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? "default" : "outline"}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PlanFormDialog
                      plan={{
                        id: plan.id,
                        name: plan.name,
                        slug: plan.slug,
                        priceCents: plan.priceCents,
                        maxProfessionals: plan.maxProfessionals,
                        maxAppointmentsPerMonth: plan.maxAppointmentsPerMonth,
                        features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
                        isActive: plan.isActive,
                        isDefault: plan.isDefault,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum plano cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
