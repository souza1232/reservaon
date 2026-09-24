"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePaidPlanCompanySession } from "@/lib/guards";
import { isUploadConfigured, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES } from "@/lib/upload";
import { actionError, actionSuccess, type ActionResult } from "./types";

type CompanySession = Awaited<ReturnType<typeof requirePaidPlanCompanySession>>;

/**
 * Confirma que o cliente pertence à empresa da sessão e, conforme o papel de
 * quem chamou, aplica a checagem certa: COMPANY_ADMIN tem acesso total;
 * PROFESSIONAL só se já atendeu esse cliente alguma vez (mesmo filtro usado
 * em /profissional/clientes); qualquer outro papel (hoje, RECEPTIONIST) é
 * negado de propósito — prontuário é dado clínico sensível (LGPD), fora do
 * escopo de quem cuida da recepção. Negação explícita, não um fallthrough
 * implícito que algum papel futuro poderia herdar sem essa decisão ter sido
 * tomada de novo.
 */
async function assertCustomerAccess(session: CompanySession, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.companyId !== session.user.companyId) {
    return null;
  }
  if (session.user.role === "COMPANY_ADMIN") {
    return customer;
  }
  if (session.user.role === "PROFESSIONAL") {
    if (!session.user.professionalId) return null;
    const treated = await prisma.appointment.findFirst({
      where: { customerId, professionalId: session.user.professionalId },
      select: { id: true },
    });
    if (!treated) return null;
    return customer;
  }
  return null;
}

function revalidateCustomerPages(customerId: string) {
  revalidatePath(`/painel/clientes/${customerId}`);
  revalidatePath(`/profissional/clientes/${customerId}`);
}

export async function createClinicalRecordAction(
  customerId: string,
  note: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePaidPlanCompanySession();
  const trimmed = note.trim();
  if (!trimmed) return actionError("Escreva algo antes de salvar.");

  const customer = await assertCustomerAccess(session, customerId);
  if (!customer) return actionError("Cliente não encontrado.");

  const record = await prisma.clinicalRecord.create({
    data: {
      companyId: session.user.companyId,
      customerId,
      authorProfessionalId: session.user.professionalId,
      authorUserId: session.user.id,
      authorName: session.user.name,
      note: trimmed,
    },
  });

  revalidateCustomerPages(customerId);
  return actionSuccess({ id: record.id });
}

export async function updateAllergiesAction(
  customerId: string,
  allergies: string,
): Promise<ActionResult> {
  const session = await requirePaidPlanCompanySession();
  const customer = await assertCustomerAccess(session, customerId);
  if (!customer) return actionError("Cliente não encontrado.");

  await prisma.customer.update({
    where: { id: customerId },
    data: { allergies: allergies.trim() || null },
  });

  revalidateCustomerPages(customerId);
  return actionSuccess();
}

/**
 * Sobe a foto pro Vercel Blob mas NUNCA devolve a URL pro cliente — só o id
 * da linha criada. A foto é exibida depois via /api/prontuario/foto/[id],
 * que confere sessão/escopo antes de servir os bytes. Por isso não reusa
 * uploadImageAction (que devolve a URL direto): foto de paciente é dado
 * sensível (LGPD art. 5º, II), link do Blob vazado não pode virar exposição
 * permanente.
 */
export async function uploadClinicalPhotoAction(
  formData: FormData,
): Promise<ActionResult<{ photoId: string }>> {
  const session = await requirePaidPlanCompanySession();

  const clinicalRecordId = formData.get("clinicalRecordId");
  if (typeof clinicalRecordId !== "string" || !clinicalRecordId) {
    return actionError("Registro inválido.");
  }

  const record = await prisma.clinicalRecord.findUnique({ where: { id: clinicalRecordId } });
  if (!record || record.companyId !== session.user.companyId) {
    return actionError("Registro não encontrado.");
  }
  const customer = await assertCustomerAccess(session, record.customerId);
  if (!customer) return actionError("Cliente não encontrado.");

  if (!isUploadConfigured()) {
    return actionError("Upload de imagem não configurado nesta instalação.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return actionError("Nenhum arquivo enviado.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return actionError("Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return actionError("Imagem muito grande (máximo 5MB).");
  }

  const labelRaw = formData.get("label");
  const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : null;

  try {
    const extension = file.name.split(".").pop() || "jpg";
    const path = `reservaon/prontuario/${record.customerId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const blob = await put(path, file, { access: "public" });

    const photo = await prisma.clinicalRecordPhoto.create({
      data: {
        clinicalRecordId,
        url: blob.url,
        contentType: file.type,
        label,
      },
    });

    revalidateCustomerPages(record.customerId);
    return actionSuccess({ photoId: photo.id });
  } catch {
    return actionError("Não foi possível enviar a imagem. Tente novamente.");
  }
}

export async function deleteClinicalRecordPhotoAction(photoId: string): Promise<ActionResult> {
  const session = await requirePaidPlanCompanySession();

  const photo = await prisma.clinicalRecordPhoto.findUnique({
    where: { id: photoId },
    include: { clinicalRecord: true },
  });
  if (!photo || photo.clinicalRecord.companyId !== session.user.companyId) {
    return actionError("Foto não encontrada.");
  }
  const customer = await assertCustomerAccess(session, photo.clinicalRecord.customerId);
  if (!customer) return actionError("Foto não encontrada.");

  try {
    await del(photo.url);
  } catch {
    // Segue removendo o registro mesmo se o blob já não existir mais.
  }
  await prisma.clinicalRecordPhoto.delete({ where: { id: photoId } });

  revalidateCustomerPages(photo.clinicalRecord.customerId);
  return actionSuccess();
}
