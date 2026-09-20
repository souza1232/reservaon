import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp-webhook";
import { sendWhatsappTextMessage } from "@/lib/whatsapp-api";
import {
  confirmAppointmentCore,
  cancelAppointmentCore,
  claimWaitlistEntry,
  declineWaitlistEntry,
  offerNextWaitlistEntry,
  type MutationOutcome,
  type WaitlistClaimOutcome,
} from "@/lib/appointment-mutations";
import { formatDateShort, formatTime } from "@/lib/format";

/**
 * Webhook de mensagens inbound da WhatsApp Cloud API. Hoje só trata o toque
 * nos botões "Confirmar presença"/"Cancelar" do lembrete (ver
 * WHATSAPP_TEMPLATE_REMINDER_INTERACTIVE em appointment-notifications.ts) —
 * qualquer outro tipo de mensagem (texto livre, imagem, etc.) é ignorado.
 *
 * Configure em Painel do desenvolvedor → WhatsApp → Configuração → Webhook:
 *   URL: https://SEU_DOMINIO/api/webhooks/whatsapp
 *   Verify token: o mesmo valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *   Campo inscrito: messages
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

interface ButtonReplyMessage {
  from: string;
  id: string;
  interactive: { type: "button_reply"; button_reply: { id: string; title: string } };
}

function extractButtonReplies(payload: unknown): ButtonReplyMessage[] {
  const results: ButtonReplyMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return results;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const m = message as {
          from?: string;
          id?: string;
          type?: string;
          interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
        };
        if (
          m.type === "interactive" &&
          m.interactive?.type === "button_reply" &&
          m.from &&
          m.id &&
          m.interactive.button_reply?.id
        ) {
          results.push({
            from: m.from,
            id: m.id,
            interactive: {
              type: "button_reply",
              button_reply: { id: m.interactive.button_reply.id, title: m.interactive.button_reply.title ?? "" },
            },
          });
        }
      }
    }
  }
  return results;
}

function buildAckMessage(
  action: "confirm" | "cancel",
  result: MutationOutcome,
  timezone: string,
): string {
  if (result.outcome === "not_found") {
    return "Não encontramos esse agendamento. Se precisar de ajuda, entre em contato com a empresa.";
  }
  if (result.outcome === "invalid_status") {
    return "Esse agendamento não pode mais ser alterado — o status dele já mudou.";
  }

  const when = `${formatDateShort(result.appointment.startAt, timezone)} às ${formatTime(result.appointment.startAt, timezone)}`;

  if (action === "confirm") {
    return result.outcome === "already_in_state"
      ? `Sua presença em ${when} já estava confirmada. Até lá! ✅`
      : `Presença confirmada para ${when}. Te esperamos! ✅`;
  }
  return result.outcome === "already_in_state"
    ? `Esse agendamento já estava cancelado.`
    : `Agendamento de ${when} cancelado. Se quiser remarcar, é só agendar de novo pelo site. ❌`;
}

function buildWaitlistClaimAckMessage(result: WaitlistClaimOutcome, timezone: string): string {
  switch (result.outcome) {
    case "not_found":
      return "Não encontramos essa oferta de horário.";
    case "not_offered":
      return "Essa oferta já foi respondida antes.";
    case "expired":
      return "Essa oferta expirou. Fique de olho, você pode entrar na fila de novo pelo site.";
    case "slot_taken":
      return "Esse horário acabou de ser ocupado de outra forma. Avisamos o próximo da fila.";
    case "ok": {
      const when = `${formatDateShort(result.appointment.startAt, timezone)} às ${formatTime(result.appointment.startAt, timezone)}`;
      return `Agendamento confirmado para ${when}! Te esperamos. ✅`;
    }
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  for (const message of extractButtonReplies(payload)) {
    const [action, targetId] = message.interactive.button_reply.id.split(":");
    if (!targetId) continue;

    if (action === "confirm" || action === "cancel") {
      await handleAppointmentButton(action, targetId, message);
    } else if (action === "waitlist_claim" || action === "waitlist_decline") {
      await handleWaitlistButton(action, targetId, message);
    }
  }

  return NextResponse.json({ received: true });
}

/** Reserva o wamid antes de mutar — se já existir (reentrega da Meta), P2002
 * avisa que essa mensagem já foi processada; retorna false nesse caso. */
async function claimWamid(
  wamid: string,
  data: { companyId: string; appointmentId?: string; event: "CONFIRMATION" | "CANCELLATION" },
): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: { ...data, channel: "WHATSAPP", status: "PENDING", whatsappMessageId: wamid },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

async function handleAppointmentButton(
  action: "confirm" | "cancel",
  appointmentId: string,
  message: ButtonReplyMessage,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { company: true },
  });

  if (!appointment) {
    await sendWhatsappTextMessage({
      to: message.from,
      body: buildAckMessage(action, { outcome: "not_found" }, "America/Sao_Paulo"),
    });
    return;
  }

  const claimed = await claimWamid(message.id, {
    companyId: appointment.companyId,
    appointmentId: appointment.id,
    event: action === "confirm" ? "CONFIRMATION" : "CANCELLATION",
  });
  if (!claimed) return;

  const result =
    action === "confirm"
      ? await confirmAppointmentCore(appointment.id)
      : await cancelAppointmentCore(appointment.id);

  if (action === "cancel" && result.outcome === "ok") {
    void offerNextWaitlistEntry(result.appointment);
  }

  const ackBody = buildAckMessage(action, result, appointment.company.timezone);
  const sendResult = await sendWhatsappTextMessage({ to: message.from, body: ackBody });

  await prisma.notification.updateMany({
    where: { whatsappMessageId: message.id },
    data: {
      status: sendResult.sent ? "SENT" : "FAILED",
      error: sendResult.error ?? null,
      sentAt: sendResult.sent ? new Date() : null,
    },
  });
}

async function handleWaitlistButton(
  action: "waitlist_claim" | "waitlist_decline",
  entryId: string,
  message: ButtonReplyMessage,
) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: { company: true },
  });

  if (!entry) {
    await sendWhatsappTextMessage({
      to: message.from,
      body: buildWaitlistClaimAckMessage({ outcome: "not_found" }, "America/Sao_Paulo"),
    });
    return;
  }

  const claimed = await claimWamid(message.id, {
    companyId: entry.companyId,
    event: action === "waitlist_claim" ? "CONFIRMATION" : "CANCELLATION",
  });
  if (!claimed) return;

  if (action === "waitlist_claim") {
    const result = await claimWaitlistEntry(entry.id);
    const ackBody = buildWaitlistClaimAckMessage(result, entry.company.timezone);
    const sendResult = await sendWhatsappTextMessage({ to: message.from, body: ackBody });
    await prisma.notification.updateMany({
      where: { whatsappMessageId: message.id },
      data: {
        status: sendResult.sent ? "SENT" : "FAILED",
        error: sendResult.error ?? null,
        sentAt: sendResult.sent ? new Date() : null,
      },
    });
    return;
  }

  const result = await declineWaitlistEntry(entry.id);
  const ackBody =
    result.outcome === "ok"
      ? "Sem problema! Avisamos o próximo da fila."
      : "Essa oferta já não estava mais disponível.";
  const sendResult = await sendWhatsappTextMessage({ to: message.from, body: ackBody });
  await prisma.notification.updateMany({
    where: { whatsappMessageId: message.id },
    data: {
      status: sendResult.sent ? "SENT" : "FAILED",
      error: sendResult.error ?? null,
      sentAt: sendResult.sent ? new Date() : null,
    },
  });
}
