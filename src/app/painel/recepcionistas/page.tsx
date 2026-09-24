import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReceptionistFormDialog } from "./receptionist-form-dialog";
import { DeleteReceptionistButton } from "./receptionist-row-actions";

export const metadata: Metadata = { title: "Recepcionistas" };

export default async function ReceptionistsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const receptionists = await prisma.user.findMany({
    where: { companyId, role: "RECEPTIONIST" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recepcionistas</h1>
          <p className="text-sm text-muted-foreground">
            Acessos pra quem cuida da recepção — vê e gerencia agenda e clientes da empresa
            inteira, sem ver faturamento, assinatura ou configurações.
          </p>
        </div>
        <ReceptionistFormDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          {receptionists.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma recepcionista cadastrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receptionists.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="flex justify-end">
                      <DeleteReceptionistButton id={r.id} />
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
