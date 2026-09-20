import "server-only";
import nodemailer from "nodemailer";

/**
 * Envio de e-mail transacional de baixo nível (sem amarrar a uma empresa ou
 * a um agendamento — usado por autenticação e por notifications.ts). Se as
 * variáveis EMAIL_SERVER_* não estiverem configuradas, o sistema continua
 * funcionando normalmente: quem chamar trata `sent: false` sem quebrar o fluxo.
 */

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_SERVER_HOST &&
      process.env.EMAIL_SERVER_PORT &&
      process.env.EMAIL_SERVER_USER &&
      process.env.EMAIL_SERVER_PASSWORD &&
      process.env.EMAIL_FROM,
  );
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT),
    secure: Number(process.env.EMAIL_SERVER_PORT) === 465,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "E-mail não configurado (EMAIL_SERVER_*)." };
  }

  try {
    const transport = getTransport();
    await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao enviar e-mail.",
    };
  }
}
