/**
 * Gera o "PIX copia e cola" (BR Code estático, padrão EMV do Banco Central)
 * com valor fixo, pra chave PIX da própria empresa — sem gateway nenhum: o
 * dinheiro cai direto na conta dela. Usado pelo sinal de agendamento (ver
 * src/lib/deposit.ts). A mesma string vira o QR Code.
 *
 * Referência: Manual de Padrões para Iniciação do Pix (BCB), seção BR Code.
 */

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF), exigido no campo 63. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nome/cidade no BR Code: só ASCII, sem acento, com limite de tamanho. */
function sanitize(text: string, maxLength: number): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/**
 * Normaliza a chave como o PIX espera: e-mail em minúsculas, CPF/CNPJ só
 * dígitos, telefone no formato +55DDDNUMERO, chave aleatória como veio.
 * 11 dígitos é ambíguo (CPF ou celular) — decide pelo dígito verificador do
 * CPF. Devolve null se não parecer nenhum tipo válido.
 */
export function normalizePixKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) return null;
  if (key.includes("@")) return key.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.toLowerCase();
  }

  const digits = key.replace(/\D/g, "");
  if (key.startsWith("+")) return digits.length >= 12 ? `+${digits}` : null;
  if (digits.length === 14) return digits; // CNPJ
  if (digits.length === 11 && isValidCpf(digits)) return digits;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return null;
}

export function buildPixPayload(params: {
  pixKey: string;
  amountCents: number;
  merchantName: string;
  merchantCity: string;
  /** Identificador que aparece pra empresa no extrato (até 25 letras/números). */
  txid?: string;
}): string {
  const txid = (params.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const merchantAccount = field("00", "br.gov.bcb.pix") + field("01", params.pixKey);

  const payload =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (params.amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", sanitize(params.merchantName, 25) || "RECEBEDOR") +
    field("60", sanitize(params.merchantCity, 15) || "BRASIL") +
    field("62", field("05", txid)) +
    "6304";

  return payload + crc16(payload);
}
