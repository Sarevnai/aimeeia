/**
 * LandingFeatures — Grid de 6 cards com features verificadas no codigo.
 *
 * Layout: grid responsivo (1 col mobile, 2 tablet, 3 desktop).
 * Cada card usa shadcn Card com icone lucide colorido + titulo + descricao.
 */
import {
  MessageCircle,
  Brain,
  Search,
  KanbanSquare,
  BarChart3,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: MessageCircle,
    title: "WhatsApp 24/7",
    description:
      "Atendimento contínuo via Meta Cloud API. Recebe leads de Grupo Zap, ImovelWeb, Facebook e OLX no mesmo lugar.",
  },
  {
    icon: Brain,
    title: "Qualificação com IA",
    description:
      "Extrai intenção, bairro, tipo, quartos, orçamento e prazo em conversa natural — sem formulário.",
  },
  {
    icon: Search,
    title: "Busca semântica de imóveis",
    description:
      "Encontra imóveis do seu CRM (Vista, C2S, Jetimob) que combinam com o perfil real do cliente.",
  },
  {
    icon: KanbanSquare,
    title: "Pipeline visual",
    description:
      "Kanban drag-and-drop com etapas configuráveis por departamento (vendas, locação).",
  },
  {
    icon: BarChart3,
    title: "Dashboard granular",
    description:
      "Funil completo, canais de origem, SLA, padrões por hora e dia da semana — tudo em tempo real.",
  },
  {
    icon: Megaphone,
    title: "Campanhas de remarketing",
    description:
      "Disparo em massa para segmentos com templates aprovados no Meta. Reaqueça leads frios.",
  },
];

export default function LandingFeatures() {
  return (
    <section
      id="features"
      data-reveal
      className="border-b border-border py-20 md:py-28"
    >
      <div className="container mx-auto px-4 md:px-6">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            Recursos
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Tudo o que sua imobiliária precisa para parar de perder leads
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Da primeira mensagem no WhatsApp até o handoff para o corretor — em
            uma única plataforma.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="border-border/70 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-elevated"
            >
              <CardHeader>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
