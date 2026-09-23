import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateShort } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Meus clientes" };

export default async function ProfessionalCustomersPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const professionalId = session!.user.professionalId!;

  const customers = await prisma.customer.findMany({
    where: { companyId, appointments: { some: { professionalId } } },
    orderBy: { name: "asc" },
    include: {
      appointments: {
        where: { professionalId, status: { notIn: ["CANCELED", "NO_SHOW"] } },
        select: { startAt: true, priceCents: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meus clientes</h1>
        <p className="text-sm text-muted-foreground">Clientes que você já atendeu.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente atendido ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Atendimentos</TableHead>
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
                        <Link
                          href={`/profissional/clientes/${customer.id}`}
                          className="hover:underline"
                        >
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
