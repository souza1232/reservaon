"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanySession, requireCompanyAdmin } from "@/lib/guards";
import { assertSlotAvailable, getAvailableSlots, AvailabilityError } from "@/lib/availability";
import { notifyAppointmentByWhatsapp } from "@/lib/appointment-notifications";
import { cancelAppointmentCore, offerNextWaitlistEntry } from "@/lib/appointment-mutations";
import { tryConsumePackageSession } from "@/lib/package-consumption";
import { syncAppointmentToGoogleCalendar } from "@/lib/appointment-google-sync";
import {
  manualAppointmentSchema,
  appointmentStatusSchema,
} from "@/lib/validations/appointment";
import { actionError, actionSuccess, type ActionResult } from "./types";

interface SlotOption {
  startAtISO: string;
  label: string;
}

/** Lista horários disponíveis para o painel (admin/profissional) montar um agendamento manual. */
export async function getInternalAvailableSlotsAction(
  serviceId: string,
  professionalId: string,
  dateISO: string,
): Promise<ActionResult<{ slots: SlotOption[] }>> {
  const session = await requireCompanySession();

  if (session.user.role === "PROFESSIONAL" && professionalId !== session.user.professionalId) {
    return actionError("Você só pode consultar sua própria agenda.");
  }

  try {
    const slots = await getAvailableSlots({
      companyId: session.user.companyId,
      serviceId,
      professionalId,
      dateISO,
    });
    return actionSuccess({
      slots: slots.map((s) => ({ startAtISO: s.startAt.toISOString(), label: s.label })),
    });
  } catch (error) {
    if (error instanceof AvailabilityError) {
      if (["DATE_IN_PAST", "DATE_TOO_FAR"].includes(error.code)) return actionSuccess({ slots: [] });
      return actionError(error.message);
    }
    throw error;
  }
}

/** Cria um agendamento manual pelo painel (admin da empresa ou profissional para sua própria agenda). */
export async function createManualAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireCompanySession();
  const parsed = manualAppointmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  if (session.user.role === "PROFESSIONAL" && data.professionalId !== session.user.professionalId) {
    return actionError("Você só pode criar agendamentos na sua própria agenda.");
  }

  if (!data.customerId && (!data.newCustomerName || !data.newCustomerWhatsapp)) {
    return actionError("Informe um cliente existente ou os dados de um novo cliente.");
  }

  const companyId = session.user.companyId;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return actionError("Empresa não encontrada.");

  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, companyId },
  });
  if (!service) return actionError("Serviço inválido.");

  const startAt = new Date(data.startAtISO);
  if (Number.isNaN(startAt.getTime())) return actionError("Horário inválido.");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        await assertSlotAvailable({
          companyId,
          serviceId: data.serviceId,
          professionalId: data.professionalId,
          startAt,
          timezone: company.timezone,
          client: tx,
        });

        let customerId = data.customerId;
        if (!customerId) {
          const customer = await tx.customer.upsert({
            where: {
              companyId_whatsapp: { companyId, whatsapp: data.newCustomerWhatsapp! },
            },
            update: { name: data.newCustomerName! },
            create: {
              companyId,
              name: data.newCustomerName!,
              whatsapp: data.newCustomerWhatsapp!,
            },
          });
          customerId = customer.id;
        } else {
          const customer = await tx.customer.findUnique({ where: { id: customerId } });
          if (!customer || customer.companyId !== companyId) {
            throw new Error("CUSTOMER_INVALID");
          }
        }

        const packageUsed = await tryConsumePackageSession(tx, {
          companyId,
          customerId,
          serviceId: data.serviceId,
        });

        return tx.appointment.create({
          data: {
            companyId,
            customerId,
            serviceId: data.serviceId,
            professionalId: data.professionalId,
            startAt,
            endAt,
            status: "CONFIRMED",
            notes: data.notes || null,
            priceCents: packageUsed ? 0 : service.priceCents,
            customerPackageId: packageUsed?.customerPackageId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    revalidatePath("/painel/agenda");
    void notifyAppointmentByWhatsapp(appointment.id, "CONFIRMATION");
    void syncAppointmentToGoogleCalendar(appointment.id, "upsert");
    return actionSuccess({ id: appointment.id });
  } catch (error) {
    if (error instanceof AvailabilityError) return actionError(error.message);
    if (error instanceof Error && error.message === "CUSTOMER_INVALID") {
      return actionError("Cliente inválido.");
    }
    if (isSerializationFailure(error)) {
      return actionError("Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.");
    }
    throw error;
  }
}

export async function updateAppointmentStatusAction(input: unknown): Promise<ActionResult> {
  const session = await requireCompanySession();
  const parsed = appointmentStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { appointmentId, status } = parsed.data;

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return actionError("Agendamento não encontrado.");
  if (appointment.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }
  if (
    session.user.role === "PROFESSIONAL" &&
    appointment.professionalId !== session.user.professionalId
  ) {
    return actionError("Você só pode alterar agendamentos da sua própria agenda.");
  }

  await prisma.appointment.update({ where: { id: appointmentId }, data: { status } });
  revalidatePath("/painel/agenda");
  revalidatePath("/profissional");
  return actionSuccess();
}

export async function cancelAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const session = await requireCompanySession();
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return actionError("Agendamento não encontrado.");
  if (appointment.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }
  if (
    session.user.role === "PROFESSIONAL" &&
    appointment.professionalId !== session.user.professionalId
  ) {
    return actionError("Você só pode cancelar agendamentos da sua própria agenda.");
  }

  const result = await cancelAppointmentCore(appointmentId);
  if (result.outcome === "not_found") return actionError("Agendamento não encontrado.");
  if (result.outcome === "invalid_status") {
    return actionError("Este agendamento não pode mais ser cancelado.");
  }

  revalidatePath("/painel/agenda");
  revalidatePath("/profissional");
  if (result.outcome === "ok") {
    void notifyAppointmentByWhatsapp(appointmentId, "CANCELLATION");
    void offerNextWaitlistEntry(result.appointment);
  }
  return actionSuccess();
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  newStartAtISO: string,
): Promise<ActionResult> {
  const session = await requireCompanySession();
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return actionError("Agendamento não encontrado.");
  if (appointment.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }
  if (
    session.user.role === "PROFESSIONAL" &&
    appointment.professionalId !== session.user.professionalId
  ) {
    return actionError("Você só pode remarcar agendamentos da sua própria agenda.");
  }

  const company = await prisma.company.findUnique({ where: { id: session.user.companyId } });
  if (!company) return actionError("Empresa não encontrada.");

  const newStartAt = new Date(newStartAtISO);
  if (Number.isNaN(newStartAt.getTime())) return actionError("Horário inválido.");
  const duration = appointment.endAt.getTime() - appointment.startAt.getTime();
  const newEndAt = new Date(newStartAt.getTime() + duration);

  try {
    await prisma.$transaction(
      async (tx) => {
        await assertSlotAvailable({
          companyId: appointment.companyId,
          serviceId: appointment.serviceId,
          professionalId: appointment.professionalId,
          startAt: newStartAt,
          timezone: company.timezone,
          ignoreAppointmentId: appointment.id,
          client: tx,
        });

        await tx.appointment.update({
          where: { id: appointmentId },
          data: { startAt: newStartAt, endAt: newEndAt },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    revalidatePath("/painel/agenda");
    revalidatePath("/profissional");
    void notifyAppointmentByWhatsapp(appointmentId, "RESCHEDULE");
    void syncAppointmentToGoogleCalendar(appointmentId, "upsert");
    return actionSuccess();
  } catch (error) {
    if (error instanceof AvailabilityError) return actionError(error.message);
    if (isSerializationFailure(error)) {
      return actionError("Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.");
    }
    throw error;
  }
}

function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2028")
  );
}

// Somente admin: exclusão definitiva não é exposta na UI (usa-se cancelamento), mas fica
// disponível para uso administrativo pontual.
export async function deleteAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const session = await requireCompanyAdmin();
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return actionError("Agendamento não encontrado.");
  if (appointment.companyId !== session.user.companyId) {
    return actionError("Recurso não pertence à sua empresa.");
  }
  await prisma.appointment.delete({ where: { id: appointmentId } });
  revalidatePath("/painel/agenda");
  return actionSuccess();
}
