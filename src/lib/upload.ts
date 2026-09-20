import "server-only";

/**
 * Upload de imagens via Vercel Blob. Sem BLOB_READ_WRITE_TOKEN configurado
 * (criado automaticamente ao ligar um "Blob Store" ao projeto na Vercel),
 * o sistema continua funcionando normalmente — os campos de imagem aceitam
 * apenas URL colada manualmente.
 */
export function isUploadConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
