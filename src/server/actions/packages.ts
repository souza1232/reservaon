"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePaidPlan } from "@/lib/guards";
import { packageSchema } from "@/lib/validations/package";
import { reaisToCents } from "@/lib/format";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createPackageAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requirePaidPlan();
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, companyId: session.user.companyId },
  });
  if (!service) return actionError("Serviço inválido.");

  const pkg = await prisma.package.create({
    data: {
      companyId: session.user.companyId,
      serviceId: data.serviceId,
      name: data.name,
      sessionsCount: data.sessionsCount,
      priceCents: reaisToCents(data.price),
      isActive: data.isActive,
    },
  });

  revalidatePath("/painel/pacotes");
  return actionSuccess({ id: pkg.id });
}

export async function updatePackageAction(
  packageId: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await requirePaidPlan();
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const existing = await prisma.package.findUnique({ where: { id: packageId } });
  if (!existing) return actionError("Pacote não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, companyId: session.user.companyId },
  });
  if (!service) return actionError("Serviço inválido.");

  await prisma.package.update({
    where: { id: packageId },
    data: {
      serviceId: data.serviceId,
      name: data.name,
      sessionsCount: data.sessionsCount,
      priceCents: reaisToCents(data.price),
      isActive: data.isActive,
    },
  });

  revalidatePath("/painel/pacotes");
  return actionSuccess();
}

export async function togglePackageActiveAction(
  packageId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requirePaidPlan();
  const existing = await prisma.package.findUnique({ where: { id: packageId } });
  if (!existing) return actionError("Pacote não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  await prisma.package.update({ where: { id: packageId }, data: { isActive } });
  revalidatePath("/painel/pacotes");
  return actionSuccess();
}

export async function deletePackageAction(packageId: string): Promise<ActionResult> {
  const session = await requirePaidPlan();
  const existing = await prisma.package.findUnique({ where: { id: packageId } });
  if (!existing) return actionError("Pacote não encontrado.");
  if (existing.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }

  const soldCount = await prisma.customerPackage.count({ where: { packageId } });
  if (soldCount > 0) {
    return actionError(
      "Este pacote já possui vendas registradas. Desative-o em vez de excluir.",
    );
  }

  await prisma.package.delete({ where: { id: packageId } });
  revalidatePath("/painel/pacotes");
  return actionSuccess();
}

/**
 * Registra a venda de um pacote pra um cliente — a empresa já recebeu o
 * pagamento por fora (ver contexto no plano técnico). Tira um snapshot dos
 * valores atuais do Package, então editar o modelo depois não afeta vendas
 * já feitas.
 */
export async function sellPackageToCustomerAction(
  customerId: string,
  packageId: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePaidPlan();

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.companyId !== session.user.companyId) {
    return actionError("Cliente inválido.");
  }

  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg || pkg.companyId !== session.user.companyId || !pkg.isActive) {
    return actionError("Pacote inválido.");
  }

  const customerPackage = await prisma.customerPackage.create({
    data: {
      companyId: session.user.companyId,
      customerId,
      packageId: pkg.id,
      serviceId: pkg.serviceId,
      sessionsTotal: pkg.sessionsCount,
      sessionsRemaining: pkg.sessionsCount,
      pricePaidCents: pkg.priceCents,
    },
  });

  revalidatePath(`/painel/clientes/${customerId}`);
  return actionSuccess({ id: customerPackage.id });
}
