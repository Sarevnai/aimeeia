import React, { useEffect, useState } from 'react';
import {
  Bot, Save, RotateCcw, Loader2, Key, Eye, EyeOff,
  CheckCircle2, XCircle, Cpu, TestTube, Trash2,
  Brain, MessageSquare, Smile, Settings, Mic, Zap,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { PROVIDERS, AgentConfig, defaultAgentConfig } from '@/lib/agent-constants';
import TenantAgentSelector from '@/components/admin/agents/TenantAgentSelector';

const AgentGlobalSettingsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tenants, selectedTenantId, setSelectedTenantId, loading: tenantsLoading } = useAdminTenants();

  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

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
        const empty = { ...defaultAgentConfig, id: '', tenant_id: selectedTenantId } as AgentConfig;
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
      updated_at: new Date().toISOString(),
    };

    let error;
    if (config.id) {
      ({ error } = await supabase.from('ai_agent_config').update(payload).eq('id', config.id));
    } else {
      ({ error } = await supabase.from('ai_agent_config').insert({ ...payload, tenant_id: selectedTenantId }));
    }

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configuração salva', description: 'As alterações foram aplicadas com sucesso.' });
      setOriginalConfig(config);
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig(originalConfig);
      setApiKey('');
      setTestResult(null);
    }
  };

  const handleTestKey = async () => {
    if (!apiKey.trim() || !config || !selectedTenantId) return;
    setTestingKey(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-ai-key', {
        body: { action: 'test', tenant_id: selectedTenantId, provider: config.ai_provider, model: config.ai_model, api_key: apiKey },
      });
      if (error) setTestResult({ ok: false, message: error.message });
      else setTestResult(data as { ok: boolean; message: string });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    }
    setTestingKey(false);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim() || !config || !selectedTenantId) return;
    setSavingKey(true);
    try {
      const { error } = await supabase.functions.invoke('manage-ai-key', {
        body: { action: 'save', tenant_id: selectedTenantId, provider: config.ai_provider, model: config.ai_model, api_key: apiKey },
      });
      if (error) {
        toast({ title: 'Erro ao salvar chave', description: error.message, variant: 'destructive' });
      } else {
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

  if (tenantsLoading && !config) {
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/agents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Configurações Globais</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Motor de IA, persona, mensagens e parâmetros do agente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" className="gap-1.5" style={{ background: 'hsl(250 70% 60%)' }} onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Tenant Selector */}
      <TenantAgentSelector
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        onTenantChange={setSelectedTenantId}
        loading={tenantsLoading}
      />

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
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Modelo</Label>
                <Select value={config.ai_model} onValueChange={(v) => setConfig({ ...config, ai_model: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                API Key {config.has_api_key ? '(substituir chave atual)' : '(não configurada — usando chave global)'}
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
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(s => !s)}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleTestKey} disabled={!apiKey.trim() || testingKey}>
                  {testingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />} Testar
                </Button>
                <Button size="sm" className="gap-1.5 shrink-0" onClick={handleSaveKey} disabled={!apiKey.trim() || savingKey} style={{ background: 'hsl(250 70% 60%)' }}>
                  {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />} Salvar Chave
                </Button>
                {config.has_api_key && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive shrink-0" onClick={handleRemoveKey}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {testResult && (
                <div className={`flex items-center gap-2 text-xs mt-1 ${testResult.ok ? 'text-success' : 'text-destructive'}`}>
                  {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {testResult.message}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                A chave é criptografada com AES-256. Se não configurada, o agente usa a variável global do servidor.
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
                <Input value={config.agent_name} onChange={(e) => setConfig({ ...config, agent_name: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Tom</Label>
                <Select value={config.tone} onValueChange={(v) => setConfig({ ...config, tone: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                <Select value={config.emoji_intensity} onValueChange={(v) => setConfig({ ...config, emoji_intensity: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <h2 className="text-sm font-semibold text-foreground">Instruções Customizadas</h2>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-auto">
                Adicionado após o prompt base
              </span>
            </div>
            <Textarea
              value={config.custom_instructions || ''}
              onChange={(e) => setConfig({ ...config, custom_instructions: e.target.value || null })}
              placeholder="Instruções adicionais para o agente deste tenant..."
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
              <h2 className="text-sm font-semibold text-foreground">Parâmetros</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Max Tokens</Label>
                <Input type="number" value={config.max_tokens} onChange={(e) => setConfig({ ...config, max_tokens: Number(e.target.value) })} className="h-9" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Histórico (msgs)</Label>
                <Input type="number" value={config.max_history_messages} onChange={(e) => setConfig({ ...config, max_history_messages: Number(e.target.value) })} className="h-9" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Áudio</span>
                </div>
                <Switch checked={config.audio_enabled} onCheckedChange={(v) => setConfig({ ...config, audio_enabled: v })} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Triage Config</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {(config as any).triage_config ? 'Configurado' : 'Padrão'}
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma configuração encontrada para este tenant.</p>
        </div>
      )}
    </div>
  );
};

export default AgentGlobalSettingsPage;
