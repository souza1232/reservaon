import { describe, it, expect } from "vitest";
import { crc16, buildPixPayload, normalizePixKey } from "../pix";
import { computeDepositCents, requiredDepositCents, depositDueAt } from "../deposit";

describe("PIX (BR Code)", () => {
  it("calcula o CRC do exemplo oficial do Banco Central", () => {
    const semCrc =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(semCrc)).toBe("1D3D");
  });

  it("monta o copia e cola com valor, nome sem acento e txid", () => {
    const payload = buildPixPayload({
      pixKey: "contato@clinica.com",
      amountCents: 3000,
      merchantName: "Clínica Estética São João Ltda",
      merchantCity: "Vitória da Conquista",
      txid: "cmabc-123",
    });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("0014br.gov.bcb.pix0119contato@clinica.com");
    expect(payload).toContain("540530.00");
    expect(payload).toContain("5925Clinica Estetica Sao Joao"); // cortado em 25
    expect(payload).toContain("6015Vitoria da Conq");
    expect(payload).toContain("0508cmabc123");
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it("normaliza os tipos de chave", () => {
    expect(normalizePixKey(" Contato@Clinica.com ")).toBe("contato@clinica.com");
    expect(normalizePixKey("529.982.247-25")).toBe("52998224725"); // CPF válido
    expect(normalizePixKey("(73) 99903-2652")).toBe("+5573999032652"); // celular
    expect(normalizePixKey("66.173.608/0001-26")).toBe("66173608000126");
    expect(normalizePixKey("123e4567-e12b-12d1-a456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
    expect(normalizePixKey("abc")).toBeNull();
  });
});

describe("Sinal do agendamento", () => {
  const settings = { depositEnabled: true, depositPixKey: "x@y.com", depositMode: "PERCENT", depositValue: 30 };

  it("calcula porcentagem e valor fixo, sem passar do preço", () => {
    expect(computeDepositCents({ depositMode: "PERCENT", depositValue: 30 }, 10000)).toBe(3000);
    expect(computeDepositCents({ depositMode: "FIXED", depositValue: 2000 }, 10000)).toBe(2000);
    expect(computeDepositCents({ depositMode: "FIXED", depositValue: 20000 }, 10000)).toBe(10000);
  });

  it("só cobra quando tudo está ligado", () => {
    const base = { isPaidPlan: true, settings, serviceRequiresDeposit: true, priceCents: 10000 };
    expect(requiredDepositCents(base)).toBe(3000);
    expect(requiredDepositCents({ ...base, isPaidPlan: false })).toBe(0);
    expect(requiredDepositCents({ ...base, settings: { ...settings, depositEnabled: false } })).toBe(0);
    expect(requiredDepositCents({ ...base, settings: { ...settings, depositPixKey: null } })).toBe(0);
    expect(requiredDepositCents({ ...base, serviceRequiresDeposit: false })).toBe(0);
    expect(requiredDepositCents({ ...base, priceCents: 0 })).toBe(0);
  });

  it("prazo nunca passa do horário marcado", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(depositDueAt(now, new Date("2026-10-05T10:00:00Z"), 120).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(depositDueAt(now, new Date("2026-10-01T11:00:00Z"), 120).toISOString()).toBe("2026-10-01T11:00:00.000Z");
  });
});
