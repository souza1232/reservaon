import type { Metadata } from "next";
import { AuthShell } from "@/components/site/auth-shell";
import { VerifyEmailButton } from "./verify-email-button";

export const metadata: Metadata = { title: "Confirmar e-mail" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function VerifyEmailPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <AuthShell
      title="Confirme seu e-mail"
      subtitle="Clique no botão abaixo para ativar sua conta no ReservaOn."
    >
      <VerifyEmailButton token={token} />
    </AuthShell>
  );
}
