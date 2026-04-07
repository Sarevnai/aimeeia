/**
 * DemoSheetContext — Estado de abertura do DemoRequestSheet da landing.
 *
 * Extraido pra arquivo proprio (em vez de viver dentro de LandingPage)
 * pra evitar circular import: as secoes da landing importam o hook
 * useDemoSheet, e LandingPage importa as secoes. Manter o context aqui
 * quebra esse ciclo e tambem permite que o Fast Refresh do Vite
 * reconheca corretamente os boundaries de HMR.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

interface DemoSheetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const DemoSheetContext = createContext<DemoSheetContextValue | null>(null);

export function useDemoSheet() {
  const ctx = useContext(DemoSheetContext);
  if (!ctx) {
    throw new Error("useDemoSheet deve ser usado dentro de <DemoSheetProvider>");
  }
  return ctx;
}

export function DemoSheetProvider({ children }: { children: ReactNode }) {
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
