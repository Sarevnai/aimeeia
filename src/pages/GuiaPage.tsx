import React, { useState } from 'react';
import { BookOpen, MessageSquare, Settings, Users, BarChart3, Search, ChevronRight, Megaphone, Radar, Kanban } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ─── Guide sections ─── */

interface GuideSection {
    id: string;
    icon: React.ElementType;
    title: string;
    description: string;
    articles: {
        title: string;
        summary: string;
    }[];
}

const SECTIONS: GuideSection[] = [
    {
        id: 'getting-started',
        icon: BookOpen,
        title: 'Primeiros Passos',
        description: 'Comece a usar a Aimee IA em poucos minutos',
        articles: [
            { title: 'Como configurar a sua conta', summary: 'Aprenda a configurar a sua conta e link com o WhatsApp Business.' },
            { title: 'Configurando a Aimee', summary: 'Personalize o comportamento da IA, tom de voz e perguntas essenciais.' },
            { title: 'Adicionando colaboradores', summary: 'Convide membros da equipe e defina permissões de acesso.' },
        ],
    },
    {
        id: 'conversations',
        icon: MessageSquare,
        title: 'Conversas',
        description: 'Gerencie conversas entre a IA e seus leads',
        articles: [
            { title: 'Como funciona o inbox', summary: 'Conheça as abas "Todas" e "Minhas" e como filtrar conversas.' },
            { title: 'Assumir uma conversa', summary: 'Aprenda a transferir o atendimento da IA para um operador humano.' },
            { title: 'Devolver conversa para a IA', summary: 'Como reativar a IA para continuar um atendimento.' },
        ],
    },
    {
        id: 'leads',
        icon: Users,
        title: 'Leads',
        description: 'Organize e acompanhe seus leads qualificados',
        articles: [
            { title: 'Visualizando leads', summary: 'Como usar a tabela com filtros, busca e paginação.' },
            { title: 'Ações em lote', summary: 'Exporte leads, envie ao CRM ou programe remarketing em massa.' },
            { title: 'Canais de origem', summary: 'Entenda como funciona o rastreamento por canal de captação.' },
        ],
    },
    {
        id: 'pipeline',
        icon: Kanban,
        title: 'Pipeline',
        description: 'Organize seus leads no pipeline de vendas',
        articles: [
            { title: 'Como usar o Pipeline Kanban', summary: 'Organize leads em colunas personalizáveis de venda.' },
            { title: 'Movendo leads entre etapas', summary: 'Arraste e solte para atualizar o status de cada lead.' },
        ],
    },
    {
        id: 'captacao',
        icon: Radar,
        title: 'Captação',
        description: 'Oportunidades identificadas automaticamente pela IA',
        articles: [
            { title: 'Como funciona a Captação', summary: 'A Aimee identifica leads com intenção de venda ou troca de imóvel.' },
            { title: 'Acompanhando oportunidades', summary: 'Como visualizar e agir sobre notificações de captação.' },
        ],
    },
    {
        id: 'campaigns',
        icon: Megaphone,
        title: 'Campanhas',
        description: 'Envie mensagens em massa para seus leads',
        articles: [
            { title: 'Criando uma campanha', summary: 'Como criar e enviar campanhas de WhatsApp.' },
            { title: 'Acompanhando resultados', summary: 'Veja métricas de entrega, leitura e resposta.' },
        ],
    },
    {
        id: 'reports',
        icon: BarChart3,
        title: 'Relatórios',
        description: 'Analise o desempenho do seu atendimento',
        articles: [
            { title: 'Dashboard e funil', summary: 'Entenda o funil de conversão e métricas por canal.' },
            { title: 'Leads por horário e dia', summary: 'Descubra os horários e dias com maior volume de leads.' },
            { title: 'Histórico mensal', summary: 'Acompanhe a evolução dos seus resultados mês a mês.' },
        ],
    },
    {
        id: 'settings',
        icon: Settings,
        title: 'Configurações',
        description: 'Personalize a Aimee para o seu negócio',
        articles: [
            { title: 'Perguntas essenciais', summary: 'Defina as perguntas que a IA faz para qualificar os leads.' },
            { title: 'Funções da IA', summary: 'Ative funções como consulta de IPTU e agendamento de visitas.' },
            { title: 'Regras de negócio', summary: 'Configure regras para venda e locação de imóveis.' },
        ],
    },
];

/* ─── Main ─── */

const GuiaPage: React.FC = () => {
    const [search, setSearch] = useState('');
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const filteredSections = search.trim()
        ? SECTIONS.map((s) => ({
            ...s,
            articles: s.articles.filter(
                (a) =>
                    a.title.toLowerCase().includes(search.toLowerCase()) ||
                    a.summary.toLowerCase().includes(search.toLowerCase())
            ),
        })).filter((s) => s.articles.length > 0)
        : SECTIONS;

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="h-5 w-5 text-accent" />
                    <h2 className="font-display text-2xl font-bold text-foreground">Guia da Aimee</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Encontre tudo o que você precisa saber para aproveitar ao máximo a Aimee IA
                </p>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar no guia..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                />
            </div>

            {/* Sections grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSections.map((section) => {
                    const isExpanded = expandedSection === section.id;
                    const Icon = section.icon;

                    return (
                        <div
                            key={section.id}
                            className={cn(
                                'rounded-xl bg-card border border-border shadow-card overflow-hidden transition-all',
                                isExpanded && 'md:col-span-2'
                            )}
                        >
                            {/* Section header */}
                            <button
                                className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/50 transition-colors"
                                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                            >
                                <div className="p-2 rounded-lg bg-accent/10 shrink-0">
                                    <Icon className="h-5 w-5 text-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                                </div>
                                <ChevronRight
                                    className={cn(
                                        'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                                        isExpanded && 'rotate-90'
                                    )}
                                />
                            </button>

                            {/* Articles */}
                            {isExpanded && (
                                <div className="border-t border-border divide-y divide-border animate-fade-in">
                                    {section.articles.map((article, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                                        >
                                            <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">{article.title}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{article.summary}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GuiaPage;
