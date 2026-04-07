/**
 * LandingDashboardShowcase — Mock estatico do dashboard interno.
 *
 * NAO usa screenshot real (PII risk). Constroi browser frame + 4 cards
 * de metricas + grafico ASCII-style usando puro div+tailwind.
 */
import { TrendingUp, Users, Zap, Clock } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

interface MetricCard {
  label: string;
  value: string;
  delta: string;
  icon: typeof TrendingUp;
}

const METRICS: MetricCard[] = [
  { label: "Leads hoje", value: "247", delta: "+18%", icon: Users },
  { label: "Atendidos pela Aimee", value: "94%", delta: "+6pp", icon: Zap },
  { label: "Taxa de qualificação", value: "62%", delta: "+11pp", icon: TrendingUp },
  { label: "SLA médio", value: "12s", delta: "-3s", icon: Clock },
];

// Fake bar chart heights — pretende ser "leads por hora"
const CHART_BARS = [30, 45, 28, 60, 75, 88, 95, 80, 65, 70, 55, 40];
const CHART_LABELS = ["8h", "9h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h"];

export default function LandingDashboardShowcase() {
  const revealRef = useReveal<HTMLElement>();
  return (
    <section
      ref={revealRef}
      id="showcase"
      data-reveal
      className="border-b border-border py-20 md:py-28"
    >
      <div className="container mx-auto px-4 md:px-6">
        {/* Section header */}
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            Painel
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Sua operação inteira em uma única tela
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Funil, canais, SLA e padrões temporais — tudo em tempo real, sem
            depender de planilha.
          </p>
        </div>

        {/* Browser frame */}
        <div className="relative mx-auto max-w-5xl">
          {/* Glow */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 translate-y-8 rounded-2xl bg-accent/20 blur-3xl"
          />

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-prominent">
            {/* Browser top bar */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <div className="ml-3 flex-1">
                <div className="mx-auto max-w-xs rounded-md bg-background px-3 py-1 text-center text-[11px] text-muted-foreground">
                  app.aimee.ia/dashboard
                </div>
              </div>
            </div>

            {/* Dashboard body */}
            <div className="space-y-6 bg-background p-6 md:p-8">
              {/* Title row */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Visão geral
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Últimos 7 dias · Atualizado agora
                  </p>
                </div>
                <div className="hidden gap-2 md:flex">
                  <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
                    7 dias
                  </div>
                  <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
                    Vendas
                  </div>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {METRICS.map(({ label, value, delta, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="h-4 w-4 text-accent" />
                      <span className="text-[10px] font-semibold text-success">
                        {delta}
                      </span>
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                      {value}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {/* Mock chart */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">
                    Leads por hora — hoje
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    Total: 247
                  </span>
                </div>
                <div className="flex h-32 items-end gap-1.5 md:gap-2">
                  {CHART_BARS.map((h, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-accent to-accent/60"
                        style={{ height: `${h}%` }}
                      />
                      <span className="mt-1 text-[9px] text-muted-foreground">
                        {CHART_LABELS[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
