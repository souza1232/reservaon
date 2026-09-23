import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePaidPlanCompanySession, AuthError } from "@/lib/guards";

/**
 * Serve uma foto de prontuário só pra quem tem sessão autenticada e escopo
 * pra ver aquele cliente (empresa +, se profissional, já ter atendido). A
 * URL real do Vercel Blob (armazenada em ClinicalRecordPhoto.url, "public"
 * porque o Blob não tem outro modo) nunca é enviada ao navegador — este
 * handler busca os bytes no servidor e faz o streaming de volta, então um
 * link vazado desta rota não serve pra nada sem a sessão certa.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;

  try {
    const session = await requirePaidPlanCompanySession();

    const photo = await prisma.clinicalRecordPhoto.findUnique({
      where: { id: photoId },
      include: { clinicalRecord: true },
    });
    if (!photo || photo.clinicalRecord.companyId !== session.user.companyId) {
      return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
    }

    if (session.user.role === "PROFESSIONAL") {
      if (!session.user.professionalId) {
        return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
      }
      const treated = await prisma.appointment.findFirst({
        where: {
          customerId: photo.clinicalRecord.customerId,
          professionalId: session.user.professionalId,
        },
        select: { id: true },
      });
      if (!treated) {
        return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
      }
    }

    const blobResponse = await fetch(photo.url);
    if (!blobResponse.ok || !blobResponse.body) {
      return NextResponse.json({ error: "Imagem indisponível." }, { status: 502 });
    }

    return new NextResponse(blobResponse.body, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
