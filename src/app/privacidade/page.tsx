import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="prose prose-neutral mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Dados que coletamos</h2>
            <p>
              O ReservaOn coleta apenas os dados necessários para viabilizar o agendamento de
              serviços: nome, WhatsApp e, opcionalmente, e-mail e observações do cliente final;
              e nome, e-mail, telefone e dados profissionais das empresas e profissionais
              cadastrados na plataforma. Seguimos o princípio da minimização de dados previsto na
              Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">2. Finalidade do tratamento</h2>
            <p>
              Os dados coletados são utilizados exclusivamente para viabilizar o agendamento de
              serviços entre clientes e empresas, envio de confirmações e lembretes, e para as
              empresas gerenciarem sua própria operação (agenda, clientes e relatórios).
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">3. Compartilhamento de dados</h2>
            <p>
              Os dados de uma empresa e de seus clientes não são compartilhados com outras
              empresas cadastradas na plataforma. O acesso é isolado por conta (arquitetura
              multiempresa).
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">4. Direitos do titular</h2>
            <p>
              Você pode solicitar à empresa com quem agendou o serviço a confirmação da existência
              de tratamento, o acesso, a correção ou a eliminação dos seus dados pessoais. As
              empresas usuárias do ReservaOn possuem, em seu painel, a opção de anonimizar os
              dados de um cliente mediante solicitação.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">5. Contato</h2>
            <p>
              Em caso de dúvidas sobre esta política, entre em contato diretamente com a empresa
              onde você realizou o agendamento, responsável pelo tratamento dos seus dados como
              controladora.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
