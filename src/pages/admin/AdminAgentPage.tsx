import React, { useEffect, useState } from 'react';
import {
    Bot,
    Sparkles,
    MessageSquare,
    Mic,
    Brain,
    Smile,
    Save,
    RotateCcw,
    Settings,
    Zap,
    Loader2,
    Building2,
    Key,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    Cpu,
    TestTube,
    Trash2,
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TenantOption {
    id: string;
    company_name: string;
}

interface AgentConfig {
    id: string;
    tenant_id: string;
    agent_name: string;
    tone: string;
    greeting_message: string;
    fallback_message: string;
    ai_model: string;
    ai_provider: string;
    max_tokens: number;
    max_history_messages: number;
    custom_instructions: string | null;
    audio_enabled: boolean;
    audio_mode: string;
    emoji_intensity: string;
    vista_integration_enabled: boolean;
    // api_key_encrypted is never loaded to frontend (handled by edge function)
    has_api_key?: boolean;
}

const defaultConfig: Omit<AgentConfig, 'id' | 'tenant_id'> = {
    agent_name: 'Aimee',
    tone: 'friendly',
    greeting_message: '',
    fallback_message: '',
    ai_model: 'gpt-4o-mini',
    ai_provider: 'openai',
    max_tokens: 300,
    max_history_messages: 10,
    custom_instructions: null,
    audio_enabled: false,
    audio_mode: 'text_only',
    emoji_intensity: 'low',
    vista_integration_enabled: true,
    has_api_key: false,
};

const PROVIDERS = [
    {
        value: 'openai', label: 'OpenAI', models: [
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini — Rápido e econômico' },
            { value: 'gpt-4o', label: 'GPT-4o — Alta performance' },
            { value: 'o3-mini', label: 'o3 Mini — Raciocínio avançado' },
        ]
    },
    {
        value: 'anthropic', label: 'Anthropic Claude', models: [
            { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — Rápido e econômico' },
            { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 — Balanceado' },
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Recomendado' },
            { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 — Máxima capacidade' },
        ]
    },
    {
        value: 'google', label: 'Google Gemini', models: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Rápido' },
            { value: 'gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking — Raciocínio' },
            { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — Alta capacidade' },
        ]
    },
];

const capabilities = [
    { id: 'search_properties', name: 'Buscar Imoveis', description: 'Pesquisar catalogo de imoveis por filtros', icon: '\uD83C\uDFE0' },
    { id: 'schedule_visit', name: 'Agendar Visita', description: 'Criar agendamento de visita com corretor', icon: '📅' },
    { id: 'qualify_lead', name: 'Qualificar Lead', description: 'Coletar dados e qualificar automaticamente', icon: '✅' },
    { id: 'send_to_crm', name: 'Enviar ao CRM', description: 'Transferir lead qualificado ao CRM', icon: '📤' },
    { id: 'audio_messages', name: 'Audio / Voz', description: 'Processar e responder mensagens de audio', icon: '🎤' },
    { id: 'reengagement', name: 'Reengajamento', description: 'Retomar contato com leads inativos', icon: '🔄' },
    { id: 'sentiment_analysis', name: 'Analise de Sentimento', description: 'Detectar intencao e sentimento do lead', icon: '🧠' },
    { id: 'multi_language', name: 'Multi-idioma', description: 'Comunicar em ingles e espanhol', icon: '🌍' },
];

const AdminAgentPage: React.FC = () => {
    const { toast } = useToast();
    const [tenants, setTenants] = useState<TenantOption[]>([]);
    const [selectedTenantId, setSelectedTenantId] = useState<string>('');
    const [config, setConfig] = useState<AgentConfig | null>(null);
    const [originalConfig, setOriginalConfig] = useState<AgentConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [testingKey, setTestingKey] = useState(false);
    const [savingKey, setSavingKey] = useState(false);

    // Load tenants
    useEffect(() => {
        const loadTenants = async () => {
            const { data, error } = await supabase
                .from('tenants')
                .select('id, company_name')
                .order('company_name');
            if (error) {
                toast({ title: 'Erro ao carregar tenants', description: error.message, variant: 'destructive' });
                return;
            }
            setTenants(data || []);
            if (data && data.length > 0) {
                setSelectedTenantId(data[0].id);
            }
            setLoading(false);
        };
        loadTenants();
    }, []);

    // Load config when tenant changes
    useEffect(() => {
        if (!selectedTenantId) return;
        const loadConfig = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('ai_agent_config')
                .select('*')
                .eq('tenant_id', selectedTenantId)
                .maybeSingle();
            if (error) {
                toast({ title: 'Erro ao carregar config', description: error.message, variant: 'destructive' });
                setLoading(false);
                return;
            }
            if (data) {
                const cfg = { ...data, ai_provider: (data as any).ai_provider || 'openai', has_api_key: !!(data as any).api_key_encrypted } as AgentConfig;
                setConfig(cfg);
                setOriginalConfig(cfg);
            } else {
                // No config for this tenant yet
                const empty = { ...defaultConfig, id: '', tenant_id: selectedTenantId } as AgentConfig;
                setConfig(empty);
                setOriginalConfig(empty);
            }
            setLoading(false);
        };
        loadConfig();
    }, [selectedTenantId]);

    const handleSave = async () => {
        if (!config || !selectedTenantId) return;
        setSaving(true);
        const payload = {
            agent_name: config.agent_name,
            tone: config.tone,
            greeting_message: config.greeting_message,
            fallback_message: config.fallback_message,
            ai_model: config.ai_model,
            ai_provider: config.ai_provider,
            max_tokens: config.max_tokens,
            max_history_messages: config.max_history_messages,
            custom_instructions: config.custom_instructions,
            audio_enabled: config.audio_enabled,
            audio_mode: config.audio_mode,
            emoji_intensity: config.emoji_intensity,
            vista_integration_enabled: config.vista_integration_enabled,
            updated_at: new Date().toISOString(),
        };

        let error;
        if (config.id) {
            // Update existing
            ({ error } = await supabase
                .from('ai_agent_config')
                .update(payload)
                .eq('id', config.id));
        } else {
            // Insert new
            ({ error } = await supabase
                .from('ai_agent_config')
                .insert({ ...payload, tenant_id: selectedTenantId }));
        }

        if (error) {
            toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Configuracao salva', description: 'As alteracoes foram aplicadas com sucesso.' });
            setOriginalConfig(config);
        }
        setSaving(false);
    };

    const handleReset = () => {
        if (originalConfig) {
            setConfig(originalConfig);
            setApiKey('');
            setTestResult(null);
            toast({ title: 'Valores restaurados', description: 'Formulario revertido para a ultima versao salva.' });
        }
    };

    // Handle test key via edge function
    const handleTestKey = async () => {
        if (!apiKey.trim() || !config || !selectedTenantId) return;
        setTestingKey(true);
        setTestResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('manage-ai-key', {
                body: { action: 'test', tenant_id: selectedTenantId, provider: config.ai_provider, model: config.ai_model, api_key: apiKey },
            });
            if (error) { setTestResult({ ok: false, message: error.message }); }
            else { setTestResult(data as { ok: boolean; message: string }); }
        } catch (e: any) {
            setTestResult({ ok: false, message: e.message });
        }
        setTestingKey(false);
    };

    // Handle save API key securely via edge function
    const handleSaveKey = async () => {
        if (!apiKey.trim() || !config || !selectedTenantId) return;
        setSavingKey(true);
        try {
            const { error } = await supabase.functions.invoke('manage-ai-key', {
                body: { action: 'save', tenant_id: selectedTenantId, provider: config.ai_provider, model: config.ai_model, api_key: apiKey },
            });
            if (error) { toast({ title: 'Erro ao salvar chave', description: error.message, variant: 'destructive' }); }
            else {
                toast({ title: 'Chave salva com sucesso', description: 'A API key foi criptografada e armazenada.' });
                setConfig(prev => prev ? { ...prev, has_api_key: true } : prev);
                setApiKey('');
                setTestResult(null);
            }
        } catch (e: any) {
            toast({ title: 'Erro', description: e.message, variant: 'destructive' });
        }
        setSavingKey(false);
    };

    // Handle remove API key
    const handleRemoveKey = async () => {
        if (!selectedTenantId) return;
        await supabase.functions.invoke('manage-ai-key', {
            body: { action: 'clear', tenant_id: selectedTenantId },
        });
        setConfig(prev => prev ? { ...prev, has_api_key: false } : prev);
        setTestResult(null);
        toast({ title: 'Chave removida', description: 'O agente usará a chave global do ambiente.' });
    };

    const hasChanges = config && originalConfig && JSON.stringify(config) !== JSON.stringify(originalConfig);

    if (loading && !config) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display text-2xl font-bold text-foreground">Agente Aimee</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure o agente IA de cada tenant
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleReset}
                        disabled={!hasChanges}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5"
                        style={{ background: 'hsl(250 70% 60%)' }}
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar
                    </Button>
                </div>
            </div>

            {/* Tenant Selector */}
            <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                        <Label className="text-xs font-medium text-muted-foreground">Tenant</Label>
                        <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                            <SelectTrigger className="h-9 mt-1">
                                <SelectValue placeholder="Selecione um tenant" />
                            </SelectTrigger>
                            <SelectContent>
                                {tenants.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                        {t.company_name || t.id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : config ? (
                <>
                    {/* Motor de IA */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                                <Cpu className="h-4 w-4" />
                            </div>
                            <h2 className="text-sm font-semibold text-foreground">Motor de IA</h2>
                            {config.has_api_key && (
                                <span className="flex items-center gap-1 text-xs text-success ml-2">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Chave configurada
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* Provider */}
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Provedor</Label>
                                <Select
                                    value={config.ai_provider || 'openai'}
                                    onValueChange={(v) => {
                                        const prov = PROVIDERS.find(p => p.value === v);
                                        const firstModel = prov?.models[0]?.value || config.ai_model;
                                        setConfig({ ...config, ai_provider: v, ai_model: firstModel });
                                        setTestResult(null);
                                    }}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDERS.map(p => (
                                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Model */}
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Modelo</Label>
                                <Select
                                    value={config.ai_model}
                                    onValueChange={(v) => setConfig({ ...config, ai_model: v })}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(PROVIDERS.find(p => p.value === (config.ai_provider || 'openai'))?.models || []).map(m => (
                                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Key className="h-3.5 w-3.5" />
                                API Key {config.has_api_key ? '(substituir chave atual)' : '(não configurada — usando chave global do ambiente)'}
                            </Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type={showKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                                        placeholder={config.has_api_key ? '•••••••••••••••• (chave salva)' : 'sk-... ou AIza...'}
                                        className="h-9 pr-10 font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        onClick={() => setShowKey(s => !s)}
                                    >
                                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 shrink-0"
                                    onClick={handleTestKey}
                                    disabled={!apiKey.trim() || testingKey}
                                >
                                    {testingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                                    Testar
                                </Button>
                                <Button
                                    size="sm"
                                    className="gap-1.5 shrink-0"
                                    onClick={handleSaveKey}
                                    disabled={!apiKey.trim() || savingKey}
                                    style={{ background: 'hsl(250 70% 60%)' }}
                                >
                                    {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                                    Salvar Chave
                                </Button>
                                {config.has_api_key && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-destructive hover:text-destructive shrink-0"
                                        onClick={handleRemoveKey}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>

                            {/* Test result */}
                            {testResult && (
                                <div className={`flex items-center gap-2 text-xs mt-1 ${testResult.ok ? 'text-success' : 'text-destructive'}`}>
                                    {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                    {testResult.message}
                                </div>
                            )}

                            <p className="text-[11px] text-muted-foreground">
                                A chave é criptografada com AES-256 antes de ser armazenada. Nunca é exposta ao frontend.
                                Se não configurada, o agente usa a variável de ambiente global do servidor.
                            </p>
                        </div>
                    </div>

                    {/* Persona */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                                <Bot className="h-4 w-4" />
                            </div>
                            <h2 className="text-sm font-semibold text-foreground">Persona</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Nome do Agente</Label>
                                <Input
                                    value={config.agent_name}
                                    onChange={(e) => setConfig({ ...config, agent_name: e.target.value })}
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Tom</Label>
                                <Select value={config.tone} onValueChange={(v) => setConfig({ ...config, tone: v })}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="professional">Profissional</SelectItem>
                                        <SelectItem value="friendly">Amigavel</SelectItem>
                                        <SelectItem value="casual">Casual</SelectItem>
                                        <SelectItem value="formal">Formal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Intensidade de Emojis</Label>
                                <Select value={config.emoji_intensity} onValueChange={(v) => setConfig({ ...config, emoji_intensity: v })}>
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
                            <h2 className="text-sm font-semibold text-foreground">Instrucoes Customizadas</h2>
                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
                                Adicionado apos o prompt base
                            </span>
                        </div>
                        <Textarea
                            value={config.custom_instructions || ''}
                            onChange={(e) => setConfig({ ...config, custom_instructions: e.target.value || null })}
                            placeholder="Instrucoes adicionais para o agente deste tenant (ex: bairros que atende, regras especificas, horarios)..."
                            className="min-h-[200px] text-sm font-mono leading-relaxed"
                        />
                    </div>

                    {/* Messages */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="h-4 w-4" style={{ color: 'hsl(250 70% 60%)' }} />
                                <h3 className="text-sm font-semibold text-foreground">Saudacao Padrao</h3>
                            </div>
                            <Textarea
                                value={config.greeting_message}
                                onChange={(e) => setConfig({ ...config, greeting_message: e.target.value })}
                                className="min-h-[80px] text-sm"
                            />
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Smile className="h-4 w-4" style={{ color: 'hsl(38 92% 50%)' }} />
                                <h3 className="text-sm font-semibold text-foreground">Mensagem de Fallback</h3>
                            </div>
                            <Textarea
                                value={config.fallback_message}
                                onChange={(e) => setConfig({ ...config, fallback_message: e.target.value })}
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
                            <h2 className="text-sm font-semibold text-foreground">Parametros</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Max Tokens</Label>
                                <Input
                                    type="number"
                                    value={config.max_tokens}
                                    onChange={(e) => setConfig({ ...config, max_tokens: Number(e.target.value) })}
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Historico (msgs)</Label>
                                <Input
                                    type="number"
                                    value={config.max_history_messages}
                                    onChange={(e) => setConfig({ ...config, max_history_messages: Number(e.target.value) })}
                                    className="h-9"
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                                <div className="flex items-center gap-2">
                                    <Mic className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium text-foreground">Audio</span>
                                </div>
                                <Switch
                                    checked={config.audio_enabled}
                                    onCheckedChange={(v) => setConfig({ ...config, audio_enabled: v })}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium text-foreground">Vista CRM</span>
                                </div>
                                <Switch
                                    checked={config.vista_integration_enabled}
                                    onCheckedChange={(v) => setConfig({ ...config, vista_integration_enabled: v })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Capabilities (info-only, these are code-level features) */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
                                Funcionalidades do agente (configuradas via codigo)
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {capabilities.map((cap) => (
                                <div
                                    key={cap.id}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20"
                                >
                                    <span className="text-lg">{cap.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">{cap.name}</p>
                                        <p className="text-xs text-muted-foreground">{cap.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma configuracao encontrada para este tenant.</p>
                </div>
            )}
        </div>
    );
};

export default AdminAgentPage;
