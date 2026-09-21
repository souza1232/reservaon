import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content Security Policy em modo Report-Only — nada é bloqueado ainda, só
 * registrado em /api/csp-report (visível no log da Vercel). Levantamento do
 * que a aplicação de fato carrega no navegador (nenhum widget/iframe do
 * Stripe ou Asaas roda aqui — Stripe é redirect puro, e o QR Code do PIX é
 * uma imagem data: gerada no servidor; fontes via next/font são
 * self-hosted, sem chamada externa):
 *   - script: só o Facebook Pixel (connect.facebook.net), via next/script
 *   - connect: o beacon do próprio Pixel (facebook.com/tr)
 *   - img: qualquer https (mesma política já usada em images.remotePatterns)
 *     + data: (QR Code do PIX, avatares como data URI)
 * Depois de revisar os relatórios por um tempo sem achar nada inesperado,
 * trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy`
 * pra passar a bloquear de verdade.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // Empresas informam URLs livres para logo, fotos de profissionais e
    // imagens de serviços (não há upload de arquivo nesta versão — ver
    // README, seção "Limitações conhecidas"). Por isso liberamos qualquer
    // host https em vez de manter uma allowlist fixa de domínios.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
