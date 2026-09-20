import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAppointmentICS } from "@/lib/ics";
import { verifyAppointmentToken } from "@/lib/appointment-access-token";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");

  if (!verifyAppointmentToken(id, token)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { company: true, service: true, professional: true },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const ics = buildAppointmentICS({
    uid: appointment.id,
    title: `${appointment.service.name} — ${appointment.company.name}`,
    description: `Agendamento com ${appointment.professional.name} em ${appointment.company.name}.`,
    location: appointment.company.address ?? undefined,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="agendamento-${appointment.id}.ics"`,
    },
  });
}
