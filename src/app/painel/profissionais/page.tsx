import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isUploadConfigured } from "@/lib/upload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfessionalFormDialog } from "./professional-form-dialog";
import { ProfessionalActiveToggle, DeleteProfessionalButton } from "./professional-row-actions";

export const metadata: Metadata = { title: "Profissionais" };

export default async function ProfessionalsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [professionals, services] = await Promise.all([
    prisma.professional.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        services: { select: { serviceId: true } },
        workingHours: { select: { dayOfWeek: true, startTime: true, endTime: true } },
        user: { select: { id: true } },
      },
    }),
    prisma.service.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const uploadEnabled = isUploadConfigured();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
          <p className="text-sm text-muted-foreground">Gerencie sua equipe e horários de trabalho.</p>
        </div>
        <ProfessionalFormDialog services={services} uploadEnabled={uploadEnabled} />
      </div>

      <Card>
        <CardContent className="p-0">
          {professionals.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum profissional cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {professionals.map((professional) => (
                  <TableRow key={professional.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={professional.photoUrl ?? undefined} />
                        <AvatarFallback>{professional.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {professional.name}
                    </TableCell>
                    <TableCell>{professional.specialty ?? "—"}</TableCell>
                    <TableCell>
                      <ProfessionalActiveToggle id={professional.id} isActive={professional.isActive} />
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <ProfessionalFormDialog
                        services={services}
                        uploadEnabled={uploadEnabled}
                        professional={{
                          id: professional.id,
                          name: professional.name,
                          photoUrl: professional.photoUrl,
                          email: professional.email,
                          phone: professional.phone,
                          specialty: professional.specialty,
                          isActive: professional.isActive,
                          serviceIds: professional.services.map((s) => s.serviceId),
                          workingHours: professional.workingHours,
                          hasLogin: Boolean(professional.user),
                        }}
                      />
                      <DeleteProfessionalButton id={professional.id} />
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
