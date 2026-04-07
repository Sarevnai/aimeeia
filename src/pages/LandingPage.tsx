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
      <main className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Aimee<span className="text-accent">.iA</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Landing em construcao — secoes serao adicionadas em commits seguintes.
          </p>
        </div>
      </main>
    </DemoSheetProvider>
  );
}
