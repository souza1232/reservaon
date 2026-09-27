import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="prose prose-neutral mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Sobre o serviço</h2>
            <p>
              O ReservaOn é uma plataforma de agendamentos online que permite que empresas
              disponibilizem uma página pública para que seus clientes marquem horários. Ao criar
              uma conta, a empresa concorda com estes termos.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">2. Responsabilidades da empresa</h2>
            <p>
              A empresa é responsável pela veracidade dos dados cadastrados, pelo atendimento aos
              agendamentos confirmados e pelo tratamento adequado dos dados pessoais de seus
              clientes, atuando como controladora desses dados nos termos da LGPD.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">3. Planos e cobrança</h2>
            <p>
              O ReservaOn oferece um plano gratuito com limites de uso e planos pagos com recursos
              adicionais. Os valores e limites de cada plano são definidos pela administração da
              plataforma e podem ser consultados na página de planos antes da contratação.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">4. Disponibilidade</h2>
            <p>
              Envidamos esforços para manter a plataforma disponível 24 horas por dia, mas não
              garantimos disponibilidade ininterrupta e não nos responsabilizamos por perdas
              decorrentes de indisponibilidade temporária.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">5. Suspensão de conta</h2>
            <p>
              Contas que violem estes termos, pratiquem uso abusivo da plataforma ou deixem de
              honrar pagamentos de planos pagos poderão ser suspensas pela administração da
              plataforma.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
