/**
 * LandingPage — Pagina publica B2B da Aimee.iA
 *
 * Rota: /landing (publica, fora de AppLayout — sem auth guard).
 * Composta por secoes em src/components/landing/*.
 *
 * Estado de abertura do DemoRequestSheet vive aqui e e exposto via
 * DemoSheetContext (definido inline abaixo) para evitar prop drilling.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import LandingTrustStrip from "@/components/landing/LandingTrustStrip";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingDashboardShowcase from "@/components/landing/LandingDashboardShowcase";
import LandingIntegrations from "@/components/landing/LandingIntegrations";
import LandingFAQ from "@/components/landing/LandingFAQ";
import LandingCtaFinal from "@/components/landing/LandingCtaFinal";
import LandingFooter from "@/components/landing/LandingFooter";

// ── Demo Sheet Context ──────────────────────────────────────────────────────
interface DemoSheetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const DemoSheetContext = createContext<DemoSheetContextValue | null>(null);

export function useDemoSheet() {
  const ctx = useContext(DemoSheetContext);
  if (!ctx) {
    throw new Error("useDemoSheet deve ser usado dentro de <LandingPage>");
  }
  return ctx;
}

function DemoSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <DemoSheetContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </DemoSheetContext.Provider>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Deep link hash (#features etc) — scroll suave no load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    // pequeno delay pra DOM montar
    const t = setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <DemoSheetProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <LandingNavbar />
        <main className="flex-1">
          <LandingHero />
          <LandingTrustStrip />
          <LandingFeatures />
          <LandingHowItWorks />
          <LandingDashboardShowcase />
          <LandingIntegrations />
          <LandingFAQ />
          <LandingCtaFinal />
        </main>
        <LandingFooter />
      </div>
    </DemoSheetProvider>
  );
}
