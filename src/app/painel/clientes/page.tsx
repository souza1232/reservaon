import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const customers = await prisma.customer.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: {
      appointments: {
        where: { status: { notIn: ["CANCELED", "NO_SHOW"] } },
        select: { startAt: true, priceCents: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Histórico e dados dos clientes que já agendaram com você.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado ainda. Clientes aparecem aqui automaticamente após o
              primeiro agendamento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Agendamentos</TableHead>
                  <TableHead>Último atendimento</TableHead>
                  <TableHead>Total gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => {
                  const total = customer.appointments.reduce((sum, a) => sum + a.priceCents, 0);
                  const last = customer.appointments.sort(
                    (a, b) => b.startAt.getTime() - a.startAt.getTime(),
                  )[0];
                  return (
                    <TableRow key={customer.id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <Link href={`/painel/clientes/${customer.id}`} className="hover:underline">
                          {customer.name}
                        </Link>
                      </TableCell>
                      <TableCell>{customer.whatsapp}</TableCell>
                      <TableCell>{customer.appointments.length}</TableCell>
                      <TableCell>{last ? formatDateShort(last.startAt) : "—"}</TableCell>
                      <TableCell>{formatCentsToBRL(total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
