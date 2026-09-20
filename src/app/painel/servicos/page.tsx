import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isUploadConfigured } from "@/lib/upload";
import { formatCentsToBRL, formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServiceFormDialog } from "./service-form-dialog";
import { ServiceActiveToggle, DeleteServiceButton } from "./service-row-actions";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: { professionals: { select: { professionalId: true } } },
    }),
    prisma.professional.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const uploadEnabled = isUploadConfigured();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os serviços oferecidos pela sua empresa.
          </p>
        </div>
        <ServiceFormDialog professionals={professionals} uploadEnabled={uploadEnabled} />
      </div>

      <Card>
        <CardContent className="p-0">
          {services.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum serviço cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>{formatDuration(service.durationMinutes)}</TableCell>
                    <TableCell>{formatCentsToBRL(service.priceCents)}</TableCell>
                    <TableCell>
                      <ServiceActiveToggle id={service.id} isActive={service.isActive} />
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <ServiceFormDialog
                        professionals={professionals}
                        uploadEnabled={uploadEnabled}
                        service={{
                          id: service.id,
                          name: service.name,
                          description: service.description,
                          priceCents: service.priceCents,
                          durationMinutes: service.durationMinutes,
                          imageUrl: service.imageUrl,
                          isActive: service.isActive,
                          professionalIds: service.professionals.map((p) => p.professionalId),
                        }}
                      />
                      <DeleteServiceButton id={service.id} />
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
