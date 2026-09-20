import { normalizeWhatsappNumber, formatCentsToBRL, formatDateShort, formatTime } from "./format";

interface AppointmentWhatsappData {
  customerName: string;
  companyName: string;
  serviceName: string;
  professionalName: string;
  startAt: Date;
  priceCents: number;
  timezone: string;
}

/**
 * Gera o link wa.me com a mensagem de confirmação pronta, endereçada ao
 * número informado. Solução v1 (sem custo, sem API paga) pedida no escopo —
 * não depende de credenciais. Quando a WhatsApp Business API oficial for
 * integrada (ver WHATSAPP_API_TOKEN em .env.example), o envio pode passar a
 * ser automático sem alterar o restante do fluxo de agendamento.
 *
 * Uso típico: no painel, a empresa usa este link com o WhatsApp do CLIENTE
 * para enviar a confirmação manualmente; na página pública, o mesmo texto
 * pode ser aberto com o WhatsApp da EMPRESA como destino.
 */
export function buildAppointmentConfirmationWhatsappLink(
  targetWhatsapp: string,
  data: AppointmentWhatsappData,
): string {
  const message = [
    `Olá, ${data.customerName}!`,
    "",
    "Seu agendamento foi confirmado.",
    "",
    `Empresa: ${data.companyName}`,
    `Serviço: ${data.serviceName}`,
    `Profissional: ${data.professionalName}`,
    `Data: ${formatDateShort(data.startAt, data.timezone)}`,
    `Horário: ${formatTime(data.startAt, data.timezone)}`,
    `Valor: ${formatCentsToBRL(data.priceCents)}`,
    "",
    "Até lá!",
  ].join("\n");

  const number = normalizeWhatsappNumber(targetWhatsapp);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
