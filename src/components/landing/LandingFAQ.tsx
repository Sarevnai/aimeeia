/**
 * LandingFAQ — Accordion shadcn com 6 perguntas frequentes.
 *
 * type="single" collapsible — apenas uma pergunta aberta por vez.
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Quanto tempo leva para implantar a Aimee na minha imobiliária?",
    answer:
      "O setup técnico (conexão do WhatsApp Business e CRM) é feito no mesmo dia. O onboarding completo, incluindo treinamento do time e calibragem do agente, leva entre 3 e 7 dias úteis dependendo do tamanho da sua operação.",
  },
  {
    question: "Meus leads de Grupo Zap, ImovelWeb e outros canais também são atendidos?",
    answer:
      "Sim. A Aimee recebe leads de todos os canais que apontam para o seu WhatsApp Business — incluindo Grupo Zap, ImovelWeb, OLX, Facebook, Instagram e do seu próprio site. Cada canal é identificado para análise no dashboard.",
  },
  {
    question: "A Aimee substitui o corretor?",
    answer:
      "Não. A Aimee faz o trabalho que o corretor não consegue fazer em escala: atender em segundos, qualificar todos os leads, buscar imóveis e organizar a fila. O corretor recebe o lead já pronto para fechar — o que aumenta a produtividade dele, não substitui.",
  },
  {
    question: "Como funciona a integração com Vista, C2S e Jetimob?",
    answer:
      "Você conecta seu CRM uma vez no painel administrativo informando suas credenciais. A Aimee passa a buscar imóveis em tempo real do seu acervo durante as conversas e envia os leads qualificados de volta para o CRM com todo o histórico.",
  },
  {
    question: "Os dados dos leads ficam onde? E a LGPD?",
    answer:
      "Todos os dados ficam armazenados no Brasil em infraestrutura Supabase com criptografia em repouso e em trânsito. Você é o controlador dos dados; nós somos operadores. O fluxo respeita LGPD com base legal de execução de contrato e legítimo interesse.",
  },
  {
    question: "Como funciona a cobrança? Tem cobrança por mensagem?",
    answer:
      "O modelo é por assinatura mensal baseada no volume da sua operação. Não há cobrança por mensagem enviada. O custo das mensagens template aprovadas pela Meta (WhatsApp Cloud API) é repassado pela própria Meta, fora da nossa cobrança.",
  },
];

export default function LandingFAQ() {
  return (
    <section
      id="faq"
      data-reveal
      className="border-b border-border py-20 md:py-28"
    >
      <div className="container mx-auto px-4 md:px-6">
        {/* Section header */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            FAQ
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            As dúvidas que mais aparecem antes da primeira conversa.
          </p>
        </div>

        {/* Accordion */}
        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="rounded-lg border border-border bg-card px-5 shadow-card"
              >
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
