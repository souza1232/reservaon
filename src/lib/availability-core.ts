/**
 * Núcleo puro (sem I/O, sem Prisma) do cálculo de disponibilidade.
 * Mantido separado de availability.ts para ser testável com testes unitários
 * simples, sem precisar de um banco de dados real.
 */

export interface Interval {
  startMin: number;
  endMin: number;
}

export interface BusyRange {
  start: Date;
  end: Date;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Interseção de dois conjuntos de intervalos (em minutos desde a meia-noite). */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const ia of a) {
    for (const ib of b) {
      const start = Math.max(ia.startMin, ib.startMin);
      const end = Math.min(ia.endMin, ib.endMin);
      if (start < end) result.push({ startMin: start, endMin: end });
    }
  }
  return result;
}

/** Dois intervalos [start,end) se sobrepõem. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Gera os horários de início candidatos (em minutos desde a meia-noite) dentro dos intervalos abertos. */
export function generateSlotStartMinutes(
  openIntervals: Interval[],
  durationMinutes: number,
  stepMinutes: number,
): number[] {
  const starts: number[] = [];
  for (const interval of openIntervals) {
    for (
      let t = interval.startMin;
      t + durationMinutes <= interval.endMin;
      t += stepMinutes
    ) {
      starts.push(t);
    }
  }
  return starts;
}

export function isRangeBusy(start: Date, end: Date, busyRanges: BusyRange[]): boolean {
  return busyRanges.some((b) => rangesOverlap(start, end, b.start, b.end));
}
