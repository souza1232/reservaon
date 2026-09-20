import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  intersectIntervals,
  rangesOverlap,
  generateSlotStartMinutes,
  isRangeBusy,
} from "@/lib/availability-core";

describe("timeToMinutes / minutesToTime", () => {
  it("converte HH:mm para minutos desde a meia-noite", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("08:00")).toBe(480);
    expect(timeToMinutes("18:30")).toBe(1110);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("faz o caminho inverso corretamente", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(480)).toBe("08:00");
    expect(minutesToTime(1110)).toBe("18:30");
    expect(minutesToTime(1439)).toBe("23:59");
  });
});

describe("intersectIntervals", () => {
  it("intersecta o horário da empresa com o do profissional (profissional mais restrito)", () => {
    const company = [{ startMin: timeToMinutes("08:00"), endMin: timeToMinutes("18:00") }];
    const professional = [{ startMin: timeToMinutes("09:00"), endMin: timeToMinutes("17:00") }];
    expect(intersectIntervals(company, professional)).toEqual([
      { startMin: timeToMinutes("09:00"), endMin: timeToMinutes("17:00") },
    ]);
  });

  it("retorna vazio quando não há sobreposição (profissional fora do horário da empresa)", () => {
    const company = [{ startMin: timeToMinutes("08:00"), endMin: timeToMinutes("12:00") }];
    const professional = [{ startMin: timeToMinutes("14:00"), endMin: timeToMinutes("18:00") }];
    expect(intersectIntervals(company, professional)).toEqual([]);
  });

  it("respeita intervalo de almoço da empresa (dois intervalos) intersectado com o profissional", () => {
    const company = [
      { startMin: timeToMinutes("08:00"), endMin: timeToMinutes("12:00") },
      { startMin: timeToMinutes("13:00"), endMin: timeToMinutes("18:00") },
    ];
    const professional = [{ startMin: timeToMinutes("10:00"), endMin: timeToMinutes("16:00") }];
    expect(intersectIntervals(company, professional)).toEqual([
      { startMin: timeToMinutes("10:00"), endMin: timeToMinutes("12:00") },
      { startMin: timeToMinutes("13:00"), endMin: timeToMinutes("16:00") },
    ]);
  });

  it("não considera contato apenas nas bordas (10:00-12:00 e 12:00-14:00) como sobreposição", () => {
    const a = [{ startMin: timeToMinutes("10:00"), endMin: timeToMinutes("12:00") }];
    const b = [{ startMin: timeToMinutes("12:00"), endMin: timeToMinutes("14:00") }];
    expect(intersectIntervals(a, b)).toEqual([]);
  });
});

describe("rangesOverlap", () => {
  const d = (h: number, m = 0) => new Date(2026, 0, 1, h, m, 0);

  it("detecta sobreposição parcial", () => {
    expect(rangesOverlap(d(10), d(11), d(10, 30), d(11, 30))).toBe(true);
  });

  it("detecta quando um intervalo contém o outro", () => {
    expect(rangesOverlap(d(9), d(12), d(10), d(11))).toBe(true);
  });

  it("não considera sobreposição quando os intervalos apenas se tocam (fim = início)", () => {
    expect(rangesOverlap(d(9), d(10), d(10), d(11))).toBe(false);
  });

  it("não considera sobreposição quando são completamente distintos", () => {
    expect(rangesOverlap(d(8), d(9), d(14), d(15))).toBe(false);
  });
});

describe("generateSlotStartMinutes", () => {
  it("gera horários respeitando a duração do serviço e o passo configurado", () => {
    const open = [{ startMin: timeToMinutes("08:00"), endMin: timeToMinutes("09:00") }];
    // Serviço de 30min, passo de 30min, janela de 1h -> exatamente 2 horários (08:00 e 08:30)
    const starts = generateSlotStartMinutes(open, 30, 30);
    expect(starts.map(minutesToTime)).toEqual(["08:00", "08:30"]);
  });

  it("não ultrapassa o fim do intervalo (serviço não cabe além do limite)", () => {
    const open = [{ startMin: timeToMinutes("08:00"), endMin: timeToMinutes("08:45") }];
    // Serviço de 30min, passo 30min: 08:00 cabe (termina 08:30), 08:30 não cabe (terminaria 09:00 > 08:45)
    const starts = generateSlotStartMinutes(open, 30, 30);
    expect(starts.map(minutesToTime)).toEqual(["08:00"]);
  });

  it("cobre múltiplos intervalos abertos (ex: manhã e tarde) de forma independente", () => {
    const open = [
      { startMin: timeToMinutes("08:00"), endMin: timeToMinutes("09:00") },
      { startMin: timeToMinutes("14:00"), endMin: timeToMinutes("15:00") },
    ];
    const starts = generateSlotStartMinutes(open, 30, 30);
    expect(starts.map(minutesToTime)).toEqual(["08:00", "08:30", "14:00", "14:30"]);
  });

  it("retorna vazio quando o serviço é mais longo que qualquer intervalo aberto", () => {
    const open = [{ startMin: timeToMinutes("08:00"), endMin: timeToMinutes("08:20") }];
    expect(generateSlotStartMinutes(open, 30, 15)).toEqual([]);
  });
});

describe("isRangeBusy", () => {
  const d = (h: number, m = 0) => new Date(2026, 0, 1, h, m, 0);

  it("marca como ocupado quando o horário coincide com um agendamento existente", () => {
    const busy = [{ start: d(10), end: d(10, 30) }];
    expect(isRangeBusy(d(10), d(10, 30), busy)).toBe(true);
  });

  it("permite reservar um horário que já foi cancelado (fora da lista de ocupados)", () => {
    // Simula que agendamentos CANCELED/NO_SHOW já foram filtrados antes de chegar aqui.
    const busy: { start: Date; end: Date }[] = [];
    expect(isRangeBusy(d(10), d(10, 30), busy)).toBe(false);
  });

  it("libera o horário exatamente adjacente a um bloqueio (sem sobreposição real)", () => {
    const busy = [{ start: d(9), end: d(10) }];
    expect(isRangeBusy(d(10), d(10, 30), busy)).toBe(false);
  });

  it("bloqueia horário dentro da janela de buffer entre atendimentos", () => {
    // Agendamento das 10:00-10:30 com 15min de buffer -> ocupado até 10:45.
    const bufferMs = 15 * 60_000;
    const busy = [{ start: d(10), end: new Date(d(10, 30).getTime() + bufferMs) }];
    expect(isRangeBusy(d(10, 30), d(11), busy)).toBe(true);
    expect(isRangeBusy(d(10, 45), d(11, 15), busy)).toBe(false);
  });
});
