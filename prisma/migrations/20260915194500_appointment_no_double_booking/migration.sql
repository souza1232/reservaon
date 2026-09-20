-- Reforço a nível de banco contra dupla reserva: impede duas linhas de
-- Appointment ativas (fora de CANCELED/NO_SHOW) para o mesmo profissional no
-- mesmo horário de início, mesmo sob condições de corrida que a checagem em
-- aplicação (transação Serializable) não cubra.
CREATE UNIQUE INDEX "appointment_no_double_booking"
ON "Appointment" ("professionalId", "startAt")
WHERE "status" NOT IN ('CANCELED', 'NO_SHOW');
