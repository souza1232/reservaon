import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { normalizeWhatsappNumber } from "@/lib/format";
import { RESERVAON_SUPPORT_WHATSAPP, RESERVAON_CNPJ } from "@/lib/constants";

export const metadata: Metadata = { title: "Sobre o ReservaOn" };

const supportWhatsappLink = `https://wa.me/${normalizeWhatsappNumber(RESERVAON_SUPPORT_WHATSAPP)}?text=${encodeURIComponent("Olá! Preciso de ajuda com o ReservaOn.")}`;

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Sobre o ReservaOn</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Missão, visão, valores e nossa política de atendimento.
        </p>

        <div className="prose prose-neutral mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-lg font-semibold">Quem somos</h2>
            <p>
              O ReservaOn nasceu para resolver um problema simples e cansativo: negócios que vivem
              de agenda — clínicas, salões, barbearias, consultórios, estúdios — perdendo tempo (e
              clientes) trocando mensagem no WhatsApp só para marcar um horário. Construímos uma
              plataforma de agendamento online completa, para que o dono do negócio foque em
              atender bem, não em administrar agenda.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Missão</h2>
            <p>
              Dar a qualquer negócio local — do consultório de um profissional autônomo à rede com
              vários profissionais — as mesmas ferramentas de agendamento, automação e relacionamento
              com cliente que só grandes empresas costumavam ter, de forma simples e acessível.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Visão</h2>
            <p>
              Ser a plataforma de agendamento de referência para negócios locais no Brasil,
              reconhecida por tirar trabalho manual da rotina de quem atende e colocar tempo de
              volta no bolso de quem empreende.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Valores</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Simplicidade antes de tudo.</strong> Se uma funcionalidade exige manual de
                instruções, ela está errada — refazemos até caber num clique.
              </li>
              <li>
                <strong>O dado é do dono do negócio.</strong> Cada empresa é responsável e dona dos
                dados dos próprios clientes; a plataforma existe para servir esse relacionamento,
                nunca para se apropriar dele.
              </li>
              <li>
                <strong>Transparência na cobrança.</strong> Sem taxa escondida, sem letra miúda —
                o que está no plano é o que é cobrado.
              </li>
              <li>
                <strong>Confiabilidade em primeiro lugar.</strong> Agenda é coisa séria: um
                agendamento perdido ou uma notificação que não chega custa dinheiro de verdade pra
                quem usa a plataforma no dia a dia.
              </li>
              <li>
                <strong>Evoluir com quem usa.</strong> As funcionalidades da plataforma nascem de
                necessidade real de quem está no balcão todo dia, não de suposição.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Nossa política de atendimento</h2>
            <p>
              Tratamos cada empresa cadastrada como parceira, não como número de assinatura.
              Buscamos responder dúvidas de suporte com agilidade, comunicar com antecedência
              qualquer mudança que afete o uso diário da plataforma, e nunca desativar ou limitar o
              acesso de uma empresa sem aviso prévio, exceto em casos de inadimplência prolongada ou
              uso que viole nossos{" "}
              <a href="/termos" className="underline">
                Termos de Uso
              </a>
              . O tratamento de dados pessoais segue nossa{" "}
              <a href="/privacidade" className="underline">
                Política de Privacidade
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Contato</h2>
            <p>
              Dúvida, sugestão ou problema? Fala com a gente direto pelo WhatsApp.
            </p>
            <a
              href={supportWhatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary underline"
            >
              <MessageCircle className="h-4 w-4" />
              Falar com o suporte
            </a>
            <p className="mt-4 text-xs text-muted-foreground">CNPJ {RESERVAON_CNPJ}</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
