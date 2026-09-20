import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Cliente Prisma "normal" ou o cliente de uma transação (`tx`) — mesmo padrão de src/lib/availability.ts. */
type DbClient = PrismaClient | Prisma.TransactionClient;

interface ConsumePackageParams {
  companyId: string;
  customerId: string;
  serviceId: string;
}

/**
 * Se o cliente tiver um pacote com saldo para este serviço, desconta 1 sessão
 * e retorna o id do CustomerPackage — o chamador deve gravar esse id em
 * `Appointment.customerPackageId` e usar `priceCents: 0` (a sessão já foi
 * paga na hora da venda do pacote). Retorna `null` se não houver pacote com
 * saldo, e o agendamento segue cobrando o preço normal do serviço.
 *
 * SEMPRE chame dentro da mesma transação que cria o agendamento — pra evitar
 * que duas reservas concorrentes descontem a mesma última sessão restante.
 * Usa o pacote mais antigo primeiro (FIFO).
 */
export async function tryConsumePackageSession(
  client: DbClient,
  { companyId, customerId, serviceId }: ConsumePackageParams,
): Promise<{ customerPackageId: string } | null> {
  const customerPackage = await client.customerPackage.findFirst({
    where: { companyId, customerId, serviceId, sessionsRemaining: { gt: 0 } },
    orderBy: { purchasedAt: "asc" },
  });
  if (!customerPackage) return null;

  await client.customerPackage.update({
    where: { id: customerPackage.id },
    data: { sessionsRemaining: { decrement: 1 } },
  });

  return { customerPackageId: customerPackage.id };
}

/** Devolve 1 sessão ao saldo — chamado quando um agendamento descontado de um pacote é cancelado. */
export async function creditBackPackageSession(customerPackageId: string): Promise<void> {
  await prisma.customerPackage.update({
    where: { id: customerPackageId },
    data: { sessionsRemaining: { increment: 1 } },
  });
}
