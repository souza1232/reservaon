import type { AppointmentStatus } from "@prisma/client";

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const WEEKDAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-violet-100 text-violet-800 border-violet-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELED: "bg-red-100 text-red-800 border-red-200",
  NO_SHOW: "bg-neutral-200 text-neutral-700 border-neutral-300",
};

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const DEFAULT_COMPANY_SETTINGS = {
  slotIntervalMinutes: 30,
  minAdvanceMinutes: 60,
  maxFutureDays: 60,
  bufferBetweenMinutes: 0,
};

/**
 * Dados institucionais do ReservaOn (a plataforma em si, não uma empresa
 * cliente) — exibidos no rodapé do site e em /sobre pra dar credibilidade
 * (CNPJ real, canal de suporte humano). Não confundir com Company.cnpj
 * (esse aqui é o CNPJ de cada empresa cliente cadastrada).
 */
export const RESERVAON_SUPPORT_WHATSAPP = "73999032652";
export const RESERVAON_CNPJ = "66.173.608/0001-26";
