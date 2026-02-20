import React, { useState } from 'react';
import {
    Bot,
    Sparkles,
    MessageSquare,
    Mic,
    Brain,
    Smile,
    Save,
    RotateCcw,
    CheckCircle2,
    Settings,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// ── Mock data ─────────────────────────────────────────────────────────

const baseAgentConfig = {
    name: 'Aimee',
    tone: 'professional',
    model: 'gpt-4o',
    maxTokens: 2048,
    maxHistory: 20,
    emojiIntensity: 'moderate',
    greeting: 'Olá! Sou a Aimee, assistente virtual. Como posso ajudar?',
    fallback: 'Desculpe, não consegui entender. Posso transferir para um atendente humano se preferir.',
    instructions: `Você é a Aimee, uma assistente de IA especializada no mercado imobiliário brasileiro.

Suas responsabilidades:
1. Receber leads de portais imobiliários, WhatsApp e site
2. Fazer triagem inicial identificando interesse (locação/vendas)
3. Qualificar o lead coletando nome, cidade, bairro, tipo de imóvel, faixa de preço
4. Apresentar imóveis compatíveis do portfólio
5. Agendar visitas quando o lead demonstrar interesse
6. Encaminhar leads qualificados ao CRM/corretor responsável

Regras:
- Sempre ser cordial e profissional
- Nunca inventar informações sobre imóveis
- Respeitar o horário comercial do tenant
- Usar o catálogo de imóveis real da imobiliária`,
    audioEnabled: true,
    audioMode: 'transcribe',
    vistaEnabled: true,
};

const capabilities = [
    {
        id: 'search_properties',
        name: 'Buscar Imóveis',
        description: 'Pesquisar catálogo de imóveis por filtros',
        enabled: true,
        icon: '🏠',
    },
    {
        id: 'schedule_visit',
        name: 'Agendar Visita',
        description: 'Criar agendamento de visita com corretor',
        enabled: true,
        icon: '📅',
    },
    {
        id: 'qualify_lead',
        name: 'Qualificar Lead',
        description: 'Coletar dados e qualificar automaticamente',
        enabled: true,
        icon: '✅',
    },
    {
        id: 'send_to_crm',
        name: 'Enviar ao CRM',
        description: 'Transferir lead qualificado ao CRM',
        enabled: true,
        icon: '📤',
    },
    {
        id: 'audio_messages',
        name: 'Áudio / Voz',
        description: 'Processar e responder mensagens de áudio',
        enabled: true,
        icon: '🎤',
    },
    {
        id: 'reengagement',
        name: 'Reengajamento',
        description: 'Retomar contato com leads inativos',
        enabled: false,
        icon: '🔄',
    },
    {
        id: 'sentiment_analysis',
        name: 'Análise de Sentimento',
        description: 'Detectar intenção e sentimento do lead',
        enabled: false,
        icon: '🧠',
    },
    {
        id: 'multi_language',
        name: 'Multi-idioma',
        description: 'Comunicar em inglês e espanhol',
        enabled: false,
        icon: '🌍',
    },
];

// ── Component ─────────────────────────────────────────────────────────

const AdminAgentPage: React.FC = () => {
    const [config, setConfig] = useState(baseAgentConfig);
    const [caps, setCaps] = useState(capabilities);

    const toggleCapability = (id: string) => {
        setCaps(caps.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
    };

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display text-2xl font-bold text-foreground">Agente Aimee</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure o agente base que é replicado para cada tenant
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                    <Button size="sm" className="gap-1.5" style={{ background: 'hsl(250 70% 60%)' }}>
                        <Save className="h-3.5 w-3.5" />
                        Salvar
                    </Button>
                </div>
            </div>

            {/* Persona */}
            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                        <Bot className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">Persona Base</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Nome do Agente</Label>
                        <Input
                            value={config.name}
                            onChange={(e) => setConfig({ ...config, name: e.target.value })}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Modelo IA</Label>
                        <Select value={config.model} onValueChange={(v) => setConfig({ ...config, model: v })}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Tom</Label>
                        <Select value={config.tone} onValueChange={(v) => setConfig({ ...config, tone: v })}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="professional">Profissional</SelectItem>
                                <SelectItem value="friendly">Amigável</SelectItem>
                                <SelectItem value="casual">Casual</SelectItem>
                                <SelectItem value="formal">Formal</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Intensidade de Emojis</Label>
                        <Select value={config.emojiIntensity} onValueChange={(v) => setConfig({ ...config, emojiIntensity: v })}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                <SelectItem value="low">Baixo</SelectItem>
                                <SelectItem value="moderate">Moderado</SelectItem>
                                <SelectItem value="high">Alto</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                        <Brain className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">Instruções Base</h2>
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
                        Injetado em todos os tenants
                    </span>
                </div>
                <Textarea
                    value={config.instructions}
                    onChange={(e) => setConfig({ ...config, instructions: e.target.value })}
                    className="min-h-[200px] text-sm font-mono leading-relaxed"
                />
            </div>

            {/* Messages */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="h-4 w-4" style={{ color: 'hsl(250 70% 60%)' }} />
                        <h3 className="text-sm font-semibold text-foreground">Saudação Padrão</h3>
                    </div>
                    <Textarea
                        value={config.greeting}
                        onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
                        className="min-h-[80px] text-sm"
                    />
                </div>
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Smile className="h-4 w-4" style={{ color: 'hsl(38 92% 50%)' }} />
                        <h3 className="text-sm font-semibold text-foreground">Mensagem de Fallback</h3>
                    </div>
                    <Textarea
                        value={config.fallback}
                        onChange={(e) => setConfig({ ...config, fallback: e.target.value })}
                        className="min-h-[80px] text-sm"
                    />
                </div>
            </div>

            {/* Parameters */}
            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                        <Settings className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">Parâmetros</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Max Tokens</Label>
                        <Input
                            type="number"
                            value={config.maxTokens}
                            onChange={(e) => setConfig({ ...config, maxTokens: Number(e.target.value) })}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">Histórico (msgs)</Label>
                        <Input
                            type="number"
                            value={config.maxHistory}
                            onChange={(e) => setConfig({ ...config, maxHistory: Number(e.target.value) })}
                            className="h-9"
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Áudio</span>
                        </div>
                        <Switch
                            checked={config.audioEnabled}
                            onCheckedChange={(v) => setConfig({ ...config, audioEnabled: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">Vista CRM</span>
                        </div>
                        <Switch
                            checked={config.vistaEnabled}
                            onCheckedChange={(v) => setConfig({ ...config, vistaEnabled: v })}
                        />
                    </div>
                </div>
            </div>

            {/* Capabilities */}
            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
                        {caps.filter((c) => c.enabled).length}/{caps.length} ativas
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {caps.map((cap) => (
                        <div
                            key={cap.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${cap.enabled ? 'border-border bg-muted/20' : 'border-border/50 opacity-60'
                                }`}
                            onClick={() => toggleCapability(cap.id)}
                        >
                            <span className="text-lg">{cap.icon}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{cap.name}</p>
                                <p className="text-xs text-muted-foreground">{cap.description}</p>
                            </div>
                            <Switch checked={cap.enabled} onCheckedChange={() => toggleCapability(cap.id)} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminAgentPage;
