/**
 * LandingHowItWorks — Tres passos do fluxo: integra -> Aimee atende -> corretor fecha.
 *
 * Layout: 3 colunas em desktop com linha conectora tracejada;
 * vertical em mobile.
 */
import { Plug, Sparkles, Handshake, type LucideIcon } from "lucide-react";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: Step[] = [
  {
    number: "01",
    icon: Plug,
    title: "Integra em minutos",
    description:
      "Conecte seu WhatsApp Business e seu CRM (Vista, C2S ou Jetimob) direto pelo painel — sem código.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Aimee atende e qualifica",
    description:
      "A IA recebe cada lead, qualifica intenção e busca imóveis do seu acervo que combinam com o perfil.",
  },
  {
    number: "03",
    icon: Handshake,
    title: "Corretor fecha",
    description:
      "Lead qualificado cai no pipeline com histórico completo. Seu corretor recebe pronto para fechar.",
  },
];

export default function LandingHowItWorks() {
  return (
    <section
      id="how"
      data-reveal
      className="relative border-b border-border bg-muted/20 py-20 md:py-28"
    >
      <div className="container mx-auto px-4 md:px-6">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            Como funciona
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Do primeiro oi à venda — em três etapas
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Sem fluxos complicados. A Aimee entra no seu jeito de trabalhar.
          </p>
        </div>

        {/* Steps */}
        <div className="relative mt-16">
          {/* Connector line (desktop only) */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-8 hidden h-px border-t border-dashed border-border lg:block"
            style={{ left: "16.6%", right: "16.6%" }}
          />

          <div className="grid gap-12 lg:grid-cols-3 lg:gap-8">
            {STEPS.map(({ number, icon: Icon, title, description }) => (
              <div
                key={number}
                className="relative flex flex-col items-center text-center"
              >
                {/* Numbered circle */}
                <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-accent text-lg font-bold text-accent-foreground shadow-elevated">
                  {number}
                </div>

                {/* Icon */}
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </div>

                {/* Title + description */}
                <h3 className="mb-2 text-xl font-semibold">{title}</h3>
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
