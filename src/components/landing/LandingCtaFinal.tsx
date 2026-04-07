/**
 * LandingCtaFinal — Bloco final full-width com CTA unico para demo.
 *
 * Usa gradient-primary (utilitario ja existente em index.css:154)
 * para um bloco escuro de alto contraste.
 */
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoSheet } from "@/components/landing/demo-sheet-context";

export default function LandingCtaFinal() {
  const { open: openDemo } = useDemoSheet();

  return (
    <section
      data-reveal
      className="relative overflow-hidden bg-primary py-20 text-primary-foreground md:py-28"
    >
      {/* Decorative blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-accent/15 blur-3xl"
      />

      <div className="container relative mx-auto px-4 text-center md:px-6">
        <h2 className="mx-auto max-w-3xl text-balance text-3xl font-bold tracking-tight md:text-5xl">
          Pronto para parar de perder leads?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base text-primary-foreground/80 md:text-lg">
          Em 15 minutos a gente mostra como a Aimee atende, qualifica e entrega
          clientes prontos no seu pipeline.
        </p>
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={openDemo}
            className="group bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Agendar demo
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
        <p className="mt-4 text-xs text-primary-foreground/60">
          Demonstração ao vivo · Sem compromisso · 100% personalizada
        </p>
      </div>
    </section>
  );
}
