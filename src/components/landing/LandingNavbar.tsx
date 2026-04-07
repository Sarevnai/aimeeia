/**
 * LandingNavbar — Sticky navigation publica da landing page.
 *
 * - Esquerda: wordmark Aimee.iA (mesmo padrao do AppSidebar)
 * - Centro (>= md): links ancora para secoes da pagina
 * - Direita: botao "Entrar" (link /auth) + CTA "Agendar demo" (abre sheet)
 *
 * No mobile (< md), so wordmark + CTA principal (sem hamburger no v1).
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDemoSheet } from "@/components/landing/demo-sheet-context";

const NAV_LINKS = [
  { href: "#features", label: "Recursos" },
  { href: "#how", label: "Como funciona" },
  { href: "#integrations", label: "Integrações" },
  { href: "#faq", label: "FAQ" },
];

export default function LandingNavbar() {
  const { open: openDemo } = useDemoSheet();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        {/* Brand */}
        <Link to="/landing" className="flex items-center text-xl font-bold tracking-tight">
          Aimee<span className="text-accent">.iA</span>
        </Link>

        {/* Center nav (desktop only) */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button
            size="sm"
            onClick={openDemo}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Agendar demo
          </Button>
        </div>
      </div>
    </header>
  );
}
