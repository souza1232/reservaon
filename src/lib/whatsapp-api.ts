import "server-only";
import { normalizeWhatsappNumber } from "./format";
import { getWhatsappAccessToken } from "./whatsapp-token-store";

/**
 * Cliente de baixo nível para a WhatsApp Business Platform (Cloud API) da
 * Meta. `sendWhatsappTemplateMessage` manda mensagens de template (o único
 * tipo permitido para iniciar contato, já que o cliente agenda pelo site,
 * não pelo WhatsApp — não existe uma janela de conversa de 24h aberta até
 * ele mandar algo primeiro). `sendWhatsappTextMessage` manda texto livre, e
 * só deve ser usada dentro dessa janela de 24h que a Meta abre quando o
 * cliente manda uma mensagem (ex: toca um botão do lembrete) — ver
 * src/app/api/webhooks/whatsapp/route.ts. Se as variáveis WHATSAPP_* não
 * estiverem configuradas, o sistema continua funcionando normalmente — quem
 * chamar trata `sent: false` sem quebrar o fluxo de agendamento. Ver
 * notifications.ts para o ponto de entrada usado pelo resto do app, e
 * .env.example para o texto sugerido de cada template a submeter no Meta
 * Business Manager.
 */

const GRAPH_API_VERSION = "v21.0";

export function isWhatsappApiConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_API_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  );
}

/** payload é o dado que a Meta devolve em interactive.button_reply.id quando o cliente toca o botão. */
interface QuickReplyButton {
  index: number;
  payload: string;
}

interface SendWhatsappTemplateParams {
  to: string;
  templateName: string;
  bodyParams: string[];
  languageCode?: string;
  buttons?: QuickReplyButton[];
}

export async function sendWhatsappTemplateMessage({
  to,
  templateName,
  bodyParams,
  languageCode,
  buttons,
}: SendWhatsappTemplateParams): Promise<{ sent: boolean; error?: string }> {
  if (!isWhatsappApiConfigured()) {
    return { sent: false, error: "WhatsApp API não configurada (WHATSAPP_*)." };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = await getWhatsappAccessToken();
  const language = languageCode || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR";

  if (!token) {
    return { sent: false, error: "Token de acesso do WhatsApp indisponível." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizeWhatsappNumber(to),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
              ...(buttons ?? []).map((button) => ({
                type: "button",
                sub_type: "quick_reply",
                index: button.index,
                parameters: [{ type: "payload", payload: button.payload }],
              })),
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return { sent: false, error: `Meta API (${response.status}): ${body}` };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao enviar WhatsApp.",
    };
  }
}

interface SendWhatsappTextParams {
  to: string;
  body: string;
}

/**
 * Texto livre — só funciona dentro da janela de 24h que a Meta abre quando
 * o cliente manda uma mensagem (não serve para iniciar contato). Usada hoje
 * só para confirmar, no mesmo fluxo, o toque num botão do lembrete
 * (src/app/api/webhooks/whatsapp/route.ts).
 */
export async function sendWhatsappTextMessage({
  to,
  body,
}: SendWhatsappTextParams): Promise<{ sent: boolean; error?: string }> {
  if (!isWhatsappApiConfigured()) {
    return { sent: false, error: "WhatsApp API não configurada (WHATSAPP_*)." };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = await getWhatsappAccessToken();
  if (!token) {
    return { sent: false, error: "Token de acesso do WhatsApp indisponível." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizeWhatsappNumber(to),
          type: "text",
          text: { body },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return { sent: false, error: `Meta API (${response.status}): ${errorBody}` };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao enviar WhatsApp.",
    };
  }
}
