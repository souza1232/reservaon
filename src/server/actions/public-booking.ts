"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, assertSlotAvailable, AvailabilityError } from "@/lib/availability";
import { publicBookingSchema } from "@/lib/validations/appointment";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyAppointmentByWhatsapp } from "@/lib/appointment-notifications";
import { tryConsumePackageSession } from "@/lib/package-consumption";
import { syncAppointmentToGoogleCalendar } from "@/lib/appointment-google-sync";
import { actionError, actionSuccess, type ActionResult } from "./types";

interface GetSlotsInput {
  slug: string;
  serviceId: string;
  professionalId: string;
  dateISO: string;
}

export async function getPublicAvailableSlotsAction(
  input: GetSlotsInput,
): Promise<ActionResult<{ slots: { startAtISO: string; label: string }[] }>> {
  const ip = await getClientIp();
  const allowed = await checkRateLimit({
    key: `public-slots:${ip}`,
    limit: 90,
    windowMs: 5 * 60 * 1000,
  });
  if (!allowed) {
    return actionError("Muitas consultas em pouco tempo. Aguarde um instante e tente de novo.");
  }

  const company = await prisma.company.findUnique({
    where: { slug: input.slug },
    select: { id: true, status: true },
  });
  if (!company || company.status !== "ACTIVE") {
    return actionError("Empresa não encontrada ou indisponível.");
  }

  try {
    const slots = await getAvailableSlots({
      companyId: company.id,
      serviceId: input.serviceId,
      professionalId: input.professionalId,
      dateISO: input.dateISO,
    });
    return actionSuccess({
      slots: slots.map((s) => ({ startAtISO: s.startAt.toISOString(), label: s.label })),
    });
  } catch (error) {
    if (error instanceof AvailabilityError) {
      // Datas fora da janela permitida retornam lista vazia em vez de erro visível ao cliente.
      if (["DATE_IN_PAST", "DATE_TOO_FAR"].includes(error.code)) {
        return actionSuccess({ slots: [] });
      }
      return actionError(error.message);
    }
    throw error;
  }
}

interface CreatePublicAppointmentResult {
  appointmentId: string;
}

export async function createPublicAppointmentAction(
  slug: string,
  input: unknown,
): Promise<ActionResult<CreatePublicAppointmentResult>> {
  const ip = await getClientIp();
  const allowed = await checkRateLimit({
    key: `public-booking:${ip}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return actionError(
      "Muitas tentativas de agendamento em pouco tempo. Aguarde alguns minutos e tente novamente.",
    );
  }

  const parsed = publicBookingSchema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company || company.status !== "ACTIVE") {
    return actionError("Empresa não encontrada ou indisponível.");
  }

  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, companyId: company.id, isActive: true },
  });
  if (!service) return actionError("Serviço inválido.");

  const startAt = new Date(data.startAtISO);
  if (Number.isNaN(startAt.getTime())) return actionError("Horário inválido.");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        await assertSlotAvailable({
          companyId: company.id,
          serviceId: data.serviceId,
          professionalId: data.professionalId,
          startAt,
          timezone: company.timezone,
          client: tx,
        });

        const customer = await tx.customer.upsert({
          where: {
            companyId_whatsapp: { companyId: company.id, whatsapp: data.customerWhatsapp },
          },
          update: {
            name: data.customerName,
            email: data.customerEmail || undefined,
          },
          create: {
            companyId: company.id,
            name: data.customerName,
            whatsapp: data.customerWhatsapp,
            email: data.customerEmail || null,
          },
        });

        const packageUsed = await tryConsumePackageSession(tx, {
          companyId: company.id,
          customerId: customer.id,
          serviceId: data.serviceId,
        });

        return tx.appointment.create({
          data: {
            companyId: company.id,
            customerId: customer.id,
            serviceId: data.serviceId,
            professionalId: data.professionalId,
            startAt,
            endAt,
            status: "PENDING",
            notes: data.notes || null,
            priceCents: packageUsed ? 0 : service.priceCents,
            customerPackageId: packageUsed?.customerPackageId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    void notifyAppointmentByWhatsapp(appointment.id, "CONFIRMATION");
    void syncAppointmentToGoogleCalendar(appointment.id, "upsert");
    return actionSuccess({ appointmentId: appointment.id });
  } catch (error) {
    if (error instanceof AvailabilityError) return actionError(error.message);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2028")
    ) {
      return actionError(
        "Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.",
      );
    }
    throw error;
  }
}

interface JoinWaitlistInput {
  serviceId: string;
  professionalId: string;
  startAtISO: string;
  customerName: string;
  customerWhatsapp: string;
}

/**
 * Entra na fila de espera de um horário específico já ocupado. Quando esse
 * exato agendamento (mesma empresa/serviço/profissional/horário) for
 * cancelado, o primeiro da fila é avisado automaticamente por WhatsApp — ver
 * offerNextWaitlistEntry em src/lib/appointment-mutations.ts.
 */
export async function joinWaitlistAction(
  slug: string,
  input: JoinWaitlistInput,
): Promise<ActionResult> {
  const ip = await getClientIp();
  const allowed = await checkRateLimit({
    key: `waitlist-join:${ip}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return actionError("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    include: { settings: true },
  });
  if (!company || company.status !== "ACTIVE") {
    return actionError("Empresa não encontrada ou indisponível.");
  }
  if (!company.settings?.waitlistEnabled) {
    return actionError("Lista de espera não está disponível para esta empresa.");
  }

  const startAt = new Date(input.startAtISO);
  if (Number.isNaN(startAt.getTime())) return actionError("Horário inválido.");
  if (startAt.getTime() < Date.now()) return actionError("Não é possível entrar na fila para um horário passado.");

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, companyId: company.id, isActive: true },
  });
  if (!service) return actionError("Serviço inválido.");

  const professional = await prisma.professional.findFirst({
    where: { id: input.professionalId, companyId: company.id, isActive: true },
  });
  if (!professional) return actionError("Profissional inválido.");

  const customer = await prisma.customer.upsert({
    where: {
      companyId_whatsapp: { companyId: company.id, whatsapp: input.customerWhatsapp },
    },
    update: { name: input.customerName },
    create: {
      companyId: company.id,
      name: input.customerName,
      whatsapp: input.customerWhatsapp,
    },
  });

  await prisma.waitlistEntry.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      serviceId: input.serviceId,
      professionalId: input.professionalId,
      startAt,
    },
  });

  return actionSuccess();
}
