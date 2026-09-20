import type { Metadata } from "next";
import { AuthShell } from "@/components/site/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <AuthShell title="Crie uma nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
