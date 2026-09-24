import { getTranslations } from "next-intl/server";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MessageCircleOff,
  ShieldCheck,
  Smartphone,
  Users,
  Scissors,
  Stethoscope,
  Dumbbell,
  Sparkles,
  MessageCircle,
  BellRing,
  UserPlus,
  Star,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

// Renderizado sob demanda (não estático): os planos exibidos são
// configurados pelo Super Admin e podem mudar a qualquer momento.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [plans, t] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
    getTranslations("Home"),
  ]);

  const benefitIcons = [MessageCircleOff, Clock, ShieldCheck, Smartphone, Users, CalendarClock] as const;
  const audienceIcons = [Scissors, Stethoscope, Dumbbell, Sparkles] as const;
  const whatsappIcons = [MessageCircle, BellRing, UserPlus, Star] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              {t("hero.titleStart")} <span className="text-primary">{t("hero.titleHighlight")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/cadastro">{t("hero.ctaPrimary")}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/empresa/clinica-exemplo">{t("hero.ctaSecondary")}</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("hero.note")}</p>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section id="como-funciona" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("howItWorks.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              {t("howItWorks.subtitle")}
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(["1", "2", "3", "4"] as const).map((step) => (
                <div key={step} className="rounded-xl border bg-background p-6">
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {step}
                  </div>
                  <h3 className="font-semibold">{t(`howItWorks.steps.${step}.title`)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t(`howItWorks.steps.${step}.desc`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHATSAPP — recurso mais forte, merece seção própria em destaque */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366]/10">
                <MessageCircle className="h-6 w-6 text-[#25D366]" />
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">{t("whatsapp.title")}</h2>
              <p className="mt-3 text-muted-foreground">{t("whatsapp.subtitle")}</p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(["1", "2", "3", "4"] as const).map((step, i) => {
                const Icon = whatsappIcons[i];
                return (
                  <div key={step} className="rounded-xl border bg-background p-6">
                    <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/10">
                      <Icon className="h-4 w-4 text-[#25D366]" />
                    </div>
                    <h3 className="font-semibold">{t(`whatsapp.steps.${step}.title`)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{t(`whatsapp.steps.${step}.desc`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* BENEFÍCIOS */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("benefits.title")}</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(["1", "2", "3", "4", "5", "6"] as const).map((item, i) => {
                const Icon = benefitIcons[i];
                return (
                  <Card key={item}>
                    <CardHeader>
                      <Icon className="h-8 w-8 text-primary" />
                      <CardTitle className="mt-2">{t(`benefits.items.${item}.title`)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {t(`benefits.items.${item}.desc`)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* RECURSOS */}
        <section id="recursos" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("features.title")}</h2>
            <div className="mx-auto mt-12 grid max-w-3xl gap-x-12 gap-y-4 sm:grid-cols-2">
              {(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const).map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t(`features.items.${item}`)}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PARA QUEM É */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("audience.title")}</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(["1", "2", "3", "4"] as const).map((item, i) => {
                const Icon = audienceIcons[i];
                return (
                  <div key={item} className="rounded-xl border p-6 text-center">
                    <Icon className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-3 font-medium">{t(`audience.items.${item}`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* DEMONSTRAÇÃO */}
        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">{t("demo.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("demo.subtitle")}</p>
            <Button size="lg" className="mt-6" asChild>
              <Link href="/empresa/clinica-exemplo">{t("demo.cta")}</Link>
            </Button>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" className="py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("plans.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">{t("plans.subtitle")}</p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {plans.map((plan) => {
                const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
                return (
                  <Card key={plan.id} className={plan.isDefault ? "" : "border-primary shadow-lg"}>
                    <CardHeader>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <p className="text-3xl font-bold">
                        {plan.priceCents === 0 ? t("plans.free") : formatCentsToBRL(plan.priceCents)}
                        {plan.priceCents > 0 && (
                          <span className="text-sm font-normal text-muted-foreground">{t("plans.perMonth")}</span>
                        )}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          {plan.maxProfessionals
                            ? t("plans.maxProfessionals", { count: plan.maxProfessionals })
                            : t("plans.unlimitedProfessionals")}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          {plan.maxAppointmentsPerMonth
                            ? t("plans.maxAppointments", { count: plan.maxAppointmentsPerMonth })
                            : t("plans.unlimitedAppointments")}
                        </li>
                        {features.map((f) => (
                          <li key={f} className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button className="w-full" variant={plan.isDefault ? "outline" : "default"} asChild>
                        <Link href="/cadastro">{t("plans.cta")}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
              {plans.length === 0 && (
                <p className="col-span-2 text-center text-sm text-muted-foreground">{t("plans.empty")}</p>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">{t("faq.title")}</h2>
            <div className="mt-10 space-y-6">
              {(["1", "2", "3", "4"] as const).map((item) => (
                <div key={item} className="rounded-lg border bg-background p-5">
                  <p className="font-medium">{t(`faq.items.${item}.q`)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`faq.items.${item}.a`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl rounded-2xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
            <h2 className="text-3xl font-bold tracking-tight">{t("finalCta.title")}</h2>
            <p className="mx-auto mt-3 max-w-lg opacity-90">{t("finalCta.subtitle")}</p>
            <Button size="lg" variant="secondary" className="mt-6" asChild>
              <Link href="/cadastro">{t("finalCta.cta")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
