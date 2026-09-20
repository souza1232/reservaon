import type { Metadata } from "next";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DisconnectGoogleCalendarButton } from "./google-calendar-actions";

export const metadata: Metadata = { title: "Google Agenda" };

interface PageProps {
  searchParams: Promise<{ google?: string }>;
}

export default async function ProfessionalGoogleCalendarPage({ searchParams }: PageProps) {
  const { google } = await searchParams;
  const session = await auth();
  const professionalId = session!.user.professionalId!;

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { professionalId },
  });

  const configured = isGoogleCalendarConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Google Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua conta do Google pra sincronizar sua agenda nos dois sentidos: seus
          agendamentos do ReservaOn aparecem no seu Google Agenda, e compromissos que você criar
          direto no Google bloqueiam aquele horário aqui.
        </p>
      </div>

      {google === "conectado" && (
        <Alert>
          <AlertDescription>Google Agenda conectado com sucesso!</AlertDescription>
        </Alert>
      )}
      {google === "erro" && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível conectar sua conta do Google. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {!configured ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Integração com Google Agenda ainda não configurada nesta instalação.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Conexão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {connection ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Conectado como <span className="font-medium">{connection.googleAccountEmail}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Última sincronização:{" "}
                  {connection.lastSyncedAt ? formatDateTime(connection.lastSyncedAt) : "ainda não rodou"}
                  {" "}(1x por dia)
                </p>
                <DisconnectGoogleCalendarButton />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Você ainda não conectou sua conta do Google.
                </p>
                <Button asChild>
                  <a href="/api/integrations/google-calendar/connect">Conectar Google Agenda</a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
