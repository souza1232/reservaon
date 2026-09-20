import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyStatusButton } from "../company-status-button";

export const metadata: Metadata = { title: "Detalhes da empresa" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCompanyDetailPage({ params }: PageProps) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      plan: true,
      subscription: true,
      users: true,
      _count: { select: { appointments: true, professionals: true, services: true, customers: true } },
    },
  });

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/empresa/${company.slug}`} className="hover:underline" target="_blank">
              /empresa/{company.slug}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={company.status === "ACTIVE" ? "default" : "destructive"}>
            {company.status === "ACTIVE" ? "Ativa" : "Bloqueada"}
          </Badge>
          <CompanyStatusButton companyId={company.id} status={company.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Responsável" value={company.ownerName} />
            <Row label="E-mail" value={company.email} />
            <Row label="WhatsApp" value={company.whatsapp} />
            <Row label="Cidade/UF" value={`${company.city}/${company.state}`} />
            <Row label="Cadastro" value={formatDateShort(company.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plano" value={company.plan?.name ?? "—"} />
            <Row
              label="Valor"
              value={company.plan ? formatCentsToBRL(company.plan.priceCents) : "—"}
            />
            <Row label="Status assinatura" value={company.subscription?.status ?? "—"} />
            <Row
              label="Renovação"
              value={
                company.subscription?.renewalDate
                  ? formatDateShort(company.subscription.renewalDate)
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Agendamentos" value={String(company._count.appointments)} />
            <Row label="Profissionais" value={String(company._count.professionals)} />
            <Row label="Serviços" value={String(company._count.services)} />
            <Row label="Clientes" value={String(company._count.customers)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {company.users.map((user) => (
            <div key={user.id} className="flex items-center justify-between border-b py-2 last:border-0">
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Badge variant="outline">{user.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
