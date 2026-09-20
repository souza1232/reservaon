"use server";

import { put } from "@vercel/blob";
import { requireSession } from "@/lib/guards";
import { isUploadConfigured, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES } from "@/lib/upload";
import { actionError, actionSuccess, type ActionResult } from "./types";

/** Faz upload de uma imagem (logo, foto de profissional, imagem de serviço) e retorna a URL pública. */
export async function uploadImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();

  if (!isUploadConfigured()) {
    return actionError(
      "Upload de imagem não configurado nesta instalação. Cole uma URL de imagem já hospedada.",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return actionError("Nenhum arquivo enviado.");
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return actionError("Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return actionError("Imagem muito grande (máximo 5MB).");
  }

  try {
    const extension = file.name.split(".").pop() || "jpg";
    const path = `reservaon/${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const blob = await put(path, file, { access: "public" });
    return actionSuccess({ url: blob.url });
  } catch {
    return actionError("Não foi possível enviar a imagem. Tente novamente.");
  }
}
