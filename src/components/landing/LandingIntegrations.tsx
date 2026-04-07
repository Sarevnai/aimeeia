/**
 * LandingIntegrations — 4 tiles de integracoes nativas.
 *
 * Sem logos reais (validacao juridica pendente). Usa monogramas
 * estilizados em circulo accent + nome + 1 linha de descricao.
 * Microcopy abaixo abre o demo sheet via "Outra integracao? Fale com
 * a gente."
 */
import { Card, CardContent } from "@/components/ui/card";
import { useDemoSheet } from "@/pages/LandingPage";

interface Integration {
  name: string;
  initials: string;
  description: string;
  accentClass: string;
}

const INTEGRATIONS: Integration[] = [
  {
    name: "Vista CRM",
    initials: "V",
    description: "Sincroniza imóveis e envia leads qualificados ao seu time.",
    accentClass: "bg-accent/10 text-accent",
  },
  {
    name: "C2S",
    initials: "C2",
    description: "Construtor de Vendas integrado para lançamentos e plantões.",
    accentClass: "bg-primary/10 text-primary",
  },
  {
    name: "Jetimob",
    initials: "J",
    description: "Catálogo unificado e distribuição automática de leads.",
    accentClass: "bg-success/10 text-success",
  },
  {
    name: "Meta WhatsApp",
    initials: "W",
    description: "Cloud API oficial para atendimento em escala e templates.",
    accentClass: "bg-accent/10 text-accent",
  },
];

export default function LandingIntegrations() {
  const { open: openDemo } = useDemoSheet();

  return (
    <section
      id="integrations"
      data-reveal
      className="border-b border-border bg-muted/20 py-20 md:py-28"
    >
      <div className="container mx-auto px-4 md:px-6">
        {/* Section header */}
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            Integrações
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Conecta no seu CRM, sem virar o jogo
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            A Aimee respeita seu fluxo. Os imóveis ficam no CRM que você já usa.
          </p>
        </div>

        {/* Integrations grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {INTEGRATIONS.map(({ name, initials, description, accentClass }) => (
            <Card
              key={name}
              className="border-border/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated"
            >
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div
                  className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold ${accentClass}`}
                >
                  {initials}
                </div>
                <h3 className="mb-2 text-base font-semibold">{name}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA microcopy */}
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Outra integração?{" "}
          <button
            type="button"
            onClick={openDemo}
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Fale com a gente
          </button>
          .
        </p>
      </div>
    </section>
  );
}
