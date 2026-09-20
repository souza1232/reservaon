"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanySession } from "@/lib/guards";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function disconnectGoogleCalendarAction(): Promise<ActionResult> {
  const session = await requireCompanySession();
  if (session.user.role !== "PROFESSIONAL" || !session.user.professionalId) {
    return actionError("Apenas o próprio profissional pode desconectar a agenda.");
  }

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { professionalId: session.user.professionalId },
  });
  if (!connection) return actionError("Nenhuma conexão encontrada.");

  // A conexão vai ser apagada, então o próximo pull não teria mais como saber
  // quais BlockedTime remover — apaga de uma vez, na mesma operação, todo
  // bloqueio sincronizado (googleEventId não-nulo) ainda no futuro.
  await prisma.blockedTime.deleteMany({
    where: {
      professionalId: session.user.professionalId,
      googleEventId: { not: null },
      startAt: { gt: new Date() },
    },
  });

  await prisma.googleCalendarConnection.delete({ where: { id: connection.id } });

  revalidatePath("/profissional/configuracoes");
  return actionSuccess();
}
