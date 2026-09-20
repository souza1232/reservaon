import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { DEFAULT_TIMEZONE } from "./constants";

export function formatCentsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function reaisToCents(value: number): number {
  return Math.round(value * 100);
}

export function formatDateLong(date: Date, timezone = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatDateShort(date: Date, timezone = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, "dd/MM/yyyy");
}

export function formatTime(date: Date, timezone = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, "HH:mm");
}

export function formatDateTime(date: Date, timezone = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(date, timezone, "dd/MM/yyyy 'às' HH:mm");
}

/**
 * Formata uma data-calendário pura (sem horário/fuso), como as armazenadas
 * em Holiday.date (@db.Date, sempre meia-noite UTC). Nunca use
 * formatDateShort aqui: converter para o fuso da empresa deslocaria a data
 * exibida em um dia para trás.
 */
export function formatCalendarDate(date: Date): string {
  return formatInTimeZone(date, "UTC", "dd/MM/yyyy");
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${rest}min`;
}

/** Normaliza um telefone brasileiro para o formato usado em links wa.me (só dígitos, com DDI 55). */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}
