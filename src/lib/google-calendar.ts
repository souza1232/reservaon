import "server-only";
import { google, type calendar_v3 } from "googleapis";
import { createHmac, timingSafeEqual } from "crypto";
import type { GoogleCalendarConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Cliente de baixo nível para OAuth + Google Calendar API. Mesmo espírito de
 * src/lib/whatsapp-api.ts: isola toda chamada HTTP externa aqui, nunca
 * chamada direto de server actions ou do cron. Se GOOGLE_CLIENT_ID/SECRET
 * não estiverem configurados, o recurso fica invisível/desligado — mesmo
 * padrão de degradação graciosa do resto do app.
 *
 * Marcador usado nos eventos criados por push (ver upsertCalendarEvent) pra
 * evitar loop de sincronização: o pull (listUpcomingEvents) ignora qualquer
 * evento que já tenha essa propriedade, senão o próprio agendamento pushado
 * voltaria como um bloqueio duplicado.
 */
const APPOINTMENT_MARKER_KEY = "reservaonAppointmentId";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/integrations/google-calendar/callback`;
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

/**
 * Assina/verifica o `state` do fluxo OAuth (contém o professionalId), mesmo
 * padrão HMAC de src/lib/appointment-access-token.ts, reaproveitando
 * AUTH_SECRET em vez de introduzir um segredo novo.
 */
export function signOAuthState(professionalId: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET não configurado.");
  const signature = createHmac("sha256", secret).update(professionalId).digest("hex").slice(0, 32);
  return `${professionalId}.${signature}`;
}

export function verifyOAuthState(state: string | null): string | null {
  if (!state) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const [professionalId, signature] = state.split(".");
  if (!professionalId || !signature) return null;

  const expected = createHmac("sha256", secret).update(professionalId).digest("hex").slice(0, 32);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return professionalId;
}

export function getGoogleAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token mesmo numa reconexão
    scope: [CALENDAR_SCOPE],
    state,
  });
}

interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}

export async function exchangeCodeForTokens(code: string): Promise<ExchangedTokens> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error("Resposta incompleta do Google ao trocar o código OAuth.");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;
  if (!email) throw new Error("Não foi possível obter o e-mail da conta do Google.");

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date),
    email,
  };
}

const REFRESH_IF_EXPIRING_WITHIN_MS = 5 * 60 * 1000;

/** Renova o access token via refresh_token se estiver perto de expirar, e salva no banco antes de retornar. */
async function getValidAccessToken(connection: GoogleCalendarConnection): Promise<string> {
  const expiringSoon = connection.expiresAt.getTime() - Date.now() < REFRESH_IF_EXPIRING_WITHIN_MS;
  if (!expiringSoon) return connection.accessToken;

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token || !credentials.expiry_date) {
    throw new Error("Falha ao renovar o access token do Google.");
  }

  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: { accessToken: credentials.access_token, expiresAt: new Date(credentials.expiry_date) },
  });

  return credentials.access_token;
}

async function getCalendarClient(connection: GoogleCalendarConnection) {
  const accessToken = await getValidAccessToken(connection);
  const client = createOAuthClient();
  client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: client });
}

interface UpsertEventParams {
  connection: GoogleCalendarConnection;
  eventId?: string | null;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  appointmentId: string;
}

/** Cria (sem eventId) ou atualiza (com eventId) um evento no calendário "primary" do profissional. */
export async function upsertCalendarEvent({
  connection,
  eventId,
  summary,
  description,
  startAt,
  endAt,
  appointmentId,
}: UpsertEventParams): Promise<string> {
  const calendar = await getCalendarClient(connection);

  const requestBody: calendar_v3.Schema$Event = {
    summary,
    description,
    start: { dateTime: startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
    extendedProperties: { private: { [APPOINTMENT_MARKER_KEY]: appointmentId } },
  };

  if (eventId) {
    const { data } = await calendar.events.update({
      calendarId: "primary",
      eventId,
      requestBody,
    });
    return data.id!;
  }

  const { data } = await calendar.events.insert({ calendarId: "primary", requestBody });
  return data.id!;
}

/** Idempotente: ignora 404/410 do Google (evento já não existe mais lá). */
export async function deleteCalendarEvent({
  connection,
  eventId,
}: {
  connection: GoogleCalendarConnection;
  eventId: string;
}): Promise<void> {
  const calendar = await getCalendarClient(connection);
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 410) return;
    throw error;
  }
}

export interface GoogleCalendarEvent {
  id: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Lista eventos no intervalo, filtrando os que já têm o marcador de
 * agendamento (ver APPOINTMENT_MARKER_KEY) — esses já existem como
 * Appointment no ReservaOn, então não devem virar bloqueio duplicado.
 * Ignora eventos de dia inteiro (sem `dateTime`) e cancelados.
 */
export async function listUpcomingEvents({
  connection,
  timeMin,
  timeMax,
}: {
  connection: GoogleCalendarConnection;
  timeMin: Date;
  timeMax: Date;
}): Promise<GoogleCalendarEvent[]> {
  const calendar = await getCalendarClient(connection);
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      pageToken,
    });

    for (const event of data.items ?? []) {
      if (event.status === "cancelled") continue;
      if (event.extendedProperties?.private?.[APPOINTMENT_MARKER_KEY]) continue;
      if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

      events.push({
        id: event.id,
        startAt: new Date(event.start.dateTime),
        endAt: new Date(event.end.dateTime),
      });
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}
