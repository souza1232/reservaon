import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PackageFormDialog } from "./package-form-dialog";
import { PackageActiveToggle, DeletePackageButton } from "./package-row-actions";

export const metadata: Metadata = { title: "Pacotes" };

export default async function PackagesPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { plan: { select: { priceCents: true } } },
  });
  const isPaidPlan = Boolean(company.plan && company.plan.priceCents > 0);

  if (!isPaidPlan) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacotes</h1>
          <p className="text-sm text-muted-foreground">
            Venda pacotes de sessões fechados (ex: "10 sessões por R$800") e deixe o sistema
            controlar o saldo automaticamente.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-10 w-10 text-primary" />
            <p className="font-medium">Recurso exclusivo do plano pago</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Faça upgrade para o plano Profissional para cadastrar pacotes de sessões e vendê-los
              para seus clientes.
            </p>
            <Button asChild>
              <Link href="/painel/assinatura">Ver planos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [packages, services] = await Promise.all([
    prisma.package.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: { service: { select: { name: true } }, _count: { select: { customerPackages: true } } },
    }),
    prisma.service.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacotes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre pacotes de sessões e venda-os na ficha do cliente.
          </p>
        </div>
        <PackageFormDialog services={services} />
      </div>

      <Card>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum pacote cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Sessões</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Vendidos</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell>{pkg.service.name}</TableCell>
                    <TableCell>{pkg.sessionsCount}</TableCell>
                    <TableCell>{formatCentsToBRL(pkg.priceCents)}</TableCell>
                    <TableCell>{pkg._count.customerPackages}</TableCell>
                    <TableCell>
                      <PackageActiveToggle id={pkg.id} isActive={pkg.isActive} />
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <PackageFormDialog
                        services={services}
                        pkg={{
                          id: pkg.id,
                          name: pkg.name,
                          serviceId: pkg.serviceId,
                          sessionsCount: pkg.sessionsCount,
                          priceCents: pkg.priceCents,
                          isActive: pkg.isActive,
                        }}
                      />
                      <DeletePackageButton id={pkg.id} disabled={pkg._count.customerPackages > 0} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
