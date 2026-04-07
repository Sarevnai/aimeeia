/**
 * LandingHero — Above the fold da landing publica.
 *
 * Layout:
 * - Esquerda: badge + h1 + subhead + 2 CTAs + microcopy
 * - Direita: phone-frame mock construido em puro div/tailwind (sem assets)
 *   com 4 bolhas de conversa hardcoded entre lead e Aimee
 * - Fundo: 3 blobs animados absolutos atras do conteudo
 *
 * Animacoes: usa animate-fade-in / animate-slide-up ja existentes em
 * src/index.css. Blobs usam animate-blob-drift (definido em
 * tailwind.config.ts no Step 9).
 */
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemoSheet } from "@/pages/LandingPage";

export default function LandingHero() {
  const { open: openDemo } = useDemoSheet();

  return (
    <section
      id="hero"
      className="relative overflow-hidden border-b border-border bg-background py-20 md:py-28 lg:py-32"
    >
      {/* Animated background blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl animate-blob-drift" />
        <div
          className="absolute right-0 top-40 h-96 w-96 rounded-full bg-primary/15 blur-3xl animate-blob-drift"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-success/15 blur-3xl animate-blob-drift"
          style={{ animationDelay: "-12s" }}
        />
      </div>

      <div className="container relative mx-auto px-4 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* ── Left: copy + CTAs ───────────────────────────────────── */}
          <div className="animate-fade-in space-y-6 text-center lg:text-left">
            <Badge
              variant="outline"
              className="inline-flex items-center gap-2 border-success/30 bg-success/10 px-3 py-1.5 text-success"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Novo: Campanhas de Remarketing v2
            </Badge>

            <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              A IA que atende, qualifica e entrega leads no seu{" "}
              <span className="text-accent">WhatsApp</span> 24 horas por dia.
            </h1>

            <p className="text-pretty text-base text-muted-foreground md:text-lg">
              Pare de perder cliente para o corretor que responde primeiro. A Aimee
              responde em segundos, qualifica intenção, busca imóveis no seu CRM e
              entrega o lead pronto para fechar.
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button
                size="lg"
                onClick={openDemo}
                className="group w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
              >
                Agendar demo
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="w-full sm:w-auto"
              >
                <a href="#how">Ver como funciona</a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Sem cartão de crédito · Onboarding guiado · Setup em minutos
            </p>
          </div>

          {/* ── Right: phone frame mock ─────────────────────────────── */}
          <div className="flex items-center justify-center lg:justify-end">
            <PhoneFrame />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Phone Frame Mock ────────────────────────────────────────────────────────
/**
 * Phone frame construido sem assets — apenas div + tailwind.
 * Renderiza um device portrait com notch + 4 bolhas de chat hardcoded.
 */
function PhoneFrame() {
  return (
    <div className="relative animate-slide-up">
      {/* Floating glow behind */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-br from-accent/30 to-primary/20 blur-2xl"
      />

      {/* Frame */}
      <div className="relative w-[280px] overflow-hidden rounded-[2.5rem] border-[10px] border-foreground/90 bg-card shadow-prominent sm:w-[320px]">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-foreground/90" />

        {/* Status bar */}
        <div className="flex items-center justify-between bg-muted px-6 pb-2 pt-3 text-[10px] font-medium text-muted-foreground">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Online
          </span>
        </div>

        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
            A
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Aimee</div>
            <div className="text-[10px] text-muted-foreground">
              Assistente da Imobiliária
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex h-[380px] flex-col gap-2 overflow-hidden bg-muted/40 px-4 py-4 sm:h-[420px]">
          <ChatBubble side="in" delay="0s">
            Boa tarde, vi um apto de 2 quartos no Centro
          </ChatBubble>
          <ChatBubble side="out" delay="0.3s">
            Olá! Sou a Aimee. Posso te ajudar agora — qual seu orçamento e prazo de
            mudança?
          </ChatBubble>
          <ChatBubble side="in" delay="0.6s">
            Até R$ 650 mil, queria mudar em 60 dias
          </ChatBubble>
          <ChatBubble side="out" delay="0.9s">
            Encontrei 4 opções que combinam. Vou enviar agora e já agendo a visita
            com o corretor.
          </ChatBubble>
        </div>

        {/* Composer (fake) */}
        <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-3">
          <div className="flex-1 rounded-full bg-muted px-4 py-2 text-[11px] text-muted-foreground">
            Mensagem
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
            <ArrowRight className="h-4 w-4 text-accent-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatBubbleProps {
  side: "in" | "out";
  delay: string;
  children: React.ReactNode;
}

function ChatBubble({ side, delay, children }: ChatBubbleProps) {
  const isOut = side === "out";
  return (
    <div
      className={`flex ${isOut ? "justify-end" : "justify-start"} animate-fade-in`}
      style={{ animationDelay: delay, animationFillMode: "both" }}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[12px] leading-snug shadow-card ${
          isOut
            ? "rounded-br-sm bg-accent text-accent-foreground"
            : "rounded-bl-sm bg-card text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
