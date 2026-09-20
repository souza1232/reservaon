import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const t = await getTranslations("Nav");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#como-funciona" className="hover:text-foreground">
            {t("comoFunciona")}
          </a>
          <a href="#recursos" className="hover:text-foreground">
            {t("recursos")}
          </a>
          <a href="#planos" className="hover:text-foreground">
            {t("planos")}
          </a>
          <a href="#faq" className="hover:text-foreground">
            {t("faq")}
          </a>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" asChild>
            <Link href="/entrar">{t("entrar")}</Link>
          </Button>
          <Button asChild>
            <Link href="/cadastro">{t("comecarAgora")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
