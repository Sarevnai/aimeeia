/**
 * LandingTrustStrip — Faixa de credibilidade logo abaixo do hero.
 *
 * 4 pills horizontais com icone + texto curto, comunicando os
 * pilares de confianca: 24/7, PT-BR, LGPD, integracao a CRM.
 */
import { Clock, Languages, ShieldCheck, Plug } from "lucide-react";

const TRUST_ITEMS = [
  { icon: Clock, label: "Atendimento 24/7" },
  { icon: Languages, label: "PT-BR nativo" },
  { icon: ShieldCheck, label: "Conforme LGPD" },
  { icon: Plug, label: "Integra ao seu CRM" },
];

export default function LandingTrustStrip() {
  return (
    <section className="border-b border-border bg-muted/30 py-8">
      <div className="container mx-auto px-4 md:px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <Icon className="h-4 w-4 text-accent" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
