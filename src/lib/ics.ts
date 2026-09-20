function toICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeICSText(text: string): string {
  return text.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

interface BuildICSParams {
  uid: string;
  title: string;
  description: string;
  location?: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Gera um arquivo .ics simples (compatível com Google Calendar, Outlook e
 * Apple Calendar) para o botão "Adicionar ao calendário" da confirmação.
 * Estrutura pronta para, futuramente, ser trocada por integração direta com
 * a API do Google Calendar/Outlook sem alterar o restante do fluxo.
 */
export function buildAppointmentICS(params: BuildICSParams): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ReservaOn//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${params.uid}@reservaon`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(params.startAt)}`,
    `DTEND:${toICSDate(params.endAt)}`,
    `SUMMARY:${escapeICSText(params.title)}`,
    `DESCRIPTION:${escapeICSText(params.description)}`,
    params.location ? `LOCATION:${escapeICSText(params.location)}` : undefined,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}
