import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateShort } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompanyStatusButton } from "./company-status-button";

export const metadata: Metadata = { title: "Admin — Empresas" };

export default async function AdminCompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plan: true,
      _count: { select: { appointments: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Todas as empresas cadastradas na plataforma.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Agendamentos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/empresas/${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                  </TableCell>
                  <TableCell>{company.ownerName}</TableCell>
                  <TableCell>{company.plan?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={company.status === "ACTIVE" ? "default" : "destructive"}>
                      {company.status === "ACTIVE" ? "Ativa" : "Bloqueada"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateShort(company.createdAt)}</TableCell>
                  <TableCell>{company._count.appointments}</TableCell>
                  <TableCell className="text-right">
                    <CompanyStatusButton companyId={company.id} status={company.status} />
                  </TableCell>
                </TableRow>
              ))}
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma empresa cadastrada ainda.
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
