import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthShell } from "@/components/site/auth-shell";
import { SignupForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.signup");
  return { title: t("metaTitle") };
}

export default async function SignupPage() {
  const t = await getTranslations("Auth.signup");

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("hasAccount")}{" "}
          <Link href="/entrar" className="font-medium text-primary hover:underline">
            {t("login")}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
