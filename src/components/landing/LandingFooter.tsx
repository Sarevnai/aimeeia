/**
 * LandingFooter — Footer institucional minimo da landing page.
 *
 * 3 colunas em desktop (brand + tagline | produto | institucional)
 * + linha inferior com copyright.
 */
import { Link } from "react-router-dom";

const PRODUTO_LINKS = [
  { href: "#features", label: "Recursos" },
  { href: "#how", label: "Como funciona" },
  { href: "#integrations", label: "Integrações" },
  { href: "#faq", label: "FAQ" },
];

const INSTITUCIONAL_LINKS = [
  { href: "#", label: "Termos de uso" },
  { href: "#", label: "Política de privacidade" },
  { href: "mailto:contato@aimee.ia", label: "Contato" },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12 md:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand + tagline */}
          <div className="space-y-3">
            <div className="text-xl font-bold tracking-tight">
              Aimee<span className="text-accent">.iA</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Assistente Inteligente Imobiliária. Atendimento por WhatsApp 24/7,
              qualificação com IA e integração ao seu CRM.
            </p>
          </div>

          {/* Produto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Produto
            </h3>
            <ul className="space-y-2">
              {PRODUTO_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/auth"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Entrar
                </Link>
              </li>
            </ul>
          </div>

          {/* Institucional */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Institucional
            </h3>
            <ul className="space-y-2">
              {INSTITUCIONAL_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Aimee.iA. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
