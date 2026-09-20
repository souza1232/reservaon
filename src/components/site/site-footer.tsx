import { getTranslations } from "next-intl/server";
import PlainLink from "next/link";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <p className="font-medium">{t("product.title")}</p>
              <PlainLink href="#como-funciona" className="block text-muted-foreground hover:text-foreground">
                {t("product.comoFunciona")}
              </PlainLink>
              <PlainLink href="#planos" className="block text-muted-foreground hover:text-foreground">
                {t("product.planos")}
              </PlainLink>
              <Link href="/cadastro" className="block text-muted-foreground hover:text-foreground">
                {t("product.criarConta")}
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{t("company.title")}</p>
              <Link href="/entrar" className="block text-muted-foreground hover:text-foreground">
                {t("company.entrar")}
              </Link>
              <Link href="/empresa/clinica-exemplo" className="block text-muted-foreground hover:text-foreground">
                {t("company.demo")}
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{t("legal.title")}</p>
              <PlainLink href="/privacidade" className="block text-muted-foreground hover:text-foreground">
                {t("legal.privacidade")}
              </PlainLink>
              <PlainLink href="/termos" className="block text-muted-foreground hover:text-foreground">
                {t("legal.termos")}
              </PlainLink>
            </div>
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
