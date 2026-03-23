import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FieldGroup, Section } from './SettingsFormParts';
import { Loader2, Save, Eye, RefreshCw, Volume2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  preview_url: string | null;
}

interface AIConfig {
  agent_name: string;
  tone: string;
  greeting_message: string;
  fallback_message: string;
  emoji_intensity: string;
  ai_model: string;
  max_tokens: number;
  max_history_messages: number;
  audio_enabled: boolean;
  audio_voice_id: string;
  audio_mode: string;
  audio_channel_mirroring: boolean;
  audio_max_chars: number;
  audio_voice_stability: number;
  audio_voice_similarity: number;
  custom_instructions: string;
}

const DEFAULT_CONFIG: AIConfig = {
  agent_name: 'Aimee',
  tone: 'friendly',
  greeting_message: '',
  fallback_message: '',
  emoji_intensity: 'low',
  ai_model: 'gpt-4o-mini',
  max_tokens: 300,
  max_history_messages: 10,
  audio_enabled: false,
  audio_voice_id: '',
  audio_mode: 'text_only',
  audio_channel_mirroring: false,
  audio_max_chars: 500,
  audio_voice_stability: 0.5,
  audio_voice_similarity: 0.75,
  custom_instructions: '',
};

const DEPARTMENTS = [
  { code: 'locacao', label: 'Locação' },
  { code: 'vendas', label: 'Vendas' },
  { code: 'administrativo', label: 'Administrativo' },
] as const;

const SettingsAITab: React.FC = () => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AIConfig>(DEFAULT_CONFIG);
  const [directives, setDirectives] = useState<Record<string, { id: string | null; content: string; version: number }>>({
    locacao: { id: null, content: '', version: 1 },
    vendas: { id: null, content: '', version: 1 },
    administrativo: { id: null, content: '', version: 1 },
  });
  const [savingDirective, setSavingDirective] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDept, setPreviewDept] = useState('locacao');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voicesError, setVoicesError] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const fetchVoices = async () => {
    setLoadingVoices(true);
    setVoicesError(false);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voices');
      if (error) throw error;
      setVoices(data?.voices || []);
    } catch {
      setVoicesError(true);
    } finally {
      setLoadingVoices(false);
    }
  };

  const playVoicePreview = (previewUrl: string | null, voiceId: string) => {
    if (!previewUrl) return;
    setPreviewingVoice(voiceId);
    const audio = new Audio(previewUrl);
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
    audio.play();
  };

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const [configRes, directivesRes] = await Promise.all([
        supabase.from('ai_agent_config').select('*').eq('tenant_id', tenantId).single(),
        supabase.from('ai_directives').select('*').eq('tenant_id', tenantId).eq('context', 'atendimento_completo').eq('is_active', true),
      ]);

      if (configRes.data) {
        const d = configRes.data;
        setForm({
          agent_name: d.agent_name || 'Aimee',
          tone: d.tone || 'friendly',
          greeting_message: d.greeting_message || '',
          fallback_message: d.fallback_message || '',
          emoji_intensity: d.emoji_intensity || 'low',
          ai_model: d.ai_model || 'gpt-4o-mini',
          max_tokens: d.max_tokens || 300,
          max_history_messages: d.max_history_messages || 10,
          audio_enabled: d.audio_enabled || false,
          audio_voice_id: d.audio_voice_id || '',
          audio_mode: d.audio_mode || 'text_only',
          audio_voice_stability: d.audio_voice_stability ?? 0.5,
          audio_voice_similarity: d.audio_voice_similarity ?? 0.75,
          custom_instructions: d.custom_instructions || '',
        });
      }

      if (directivesRes.data) {
        const map: typeof directives = { locacao: { id: null, content: '', version: 1 }, vendas: { id: null, content: '', version: 1 }, administrativo: { id: null, content: '', version: 1 } };
        directivesRes.data.forEach((dir) => {
          map[dir.department] = { id: dir.id, content: dir.directive_content, version: dir.version || 1 };
        });
        setDirectives(map);
      }
      setLoading(false);
    };
    fetch();
    fetchVoices();
  }, [tenantId]);

  const handleSaveConfig = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase.from('ai_agent_config').update({
      agent_name: form.agent_name,
      tone: form.tone,
      greeting_message: form.greeting_message,
      fallback_message: form.fallback_message,
      emoji_intensity: form.emoji_intensity,
      ai_model: form.ai_model,
      max_tokens: form.max_tokens,
      max_history_messages: form.max_history_messages,
      audio_enabled: form.audio_enabled,
      audio_voice_id: form.audio_voice_id || null,
      audio_mode: form.audio_mode,
      audio_channel_mirroring: form.audio_channel_mirroring,
      audio_max_chars: form.audio_max_chars,
      audio_voice_stability: form.audio_voice_stability,
      audio_voice_similarity: form.audio_voice_similarity,
      custom_instructions: form.custom_instructions || null,
    }).eq('tenant_id', tenantId);
    setSaving(false);
    toast(error ? { title: 'Erro', description: error.message, variant: 'destructive' } : { title: 'Configuração salva' });
  };

  const handleSaveDirective = async (dept: string) => {
    if (!tenantId) return;
    setSavingDirective(dept);
    const d = directives[dept];

    if (d.id) {
      await supabase.from('ai_directives').update({
        directive_content: d.content,
        version: d.version + 1,
        updated_by: user?.id || null,
      }).eq('id', d.id);
      setDirectives((prev) => ({ ...prev, [dept]: { ...prev[dept], version: prev[dept].version + 1 } }));
    } else {
      const { data } = await supabase.from('ai_directives').insert({
        tenant_id: tenantId,
        department: dept as any,
        context: 'atendimento_completo',
        directive_content: d.content,
        updated_by: user?.id || null,
      }).select('id').single();
      if (data) setDirectives((prev) => ({ ...prev, [dept]: { ...prev[dept], id: data.id } }));
    }

    setSavingDirective(null);
    toast({ title: `Diretiva ${dept} salva` });
  };

  const buildPreview = () => {
    const dir = directives[previewDept];
    return `# Configuração do Agente: ${form.agent_name}
Tom: ${form.tone} | Emoji: ${form.emoji_intensity}
Modelo: ${form.ai_model} | Max tokens: ${form.max_tokens}

## Greeting
${form.greeting_message || '(não definido)'}

## Fallback
${form.fallback_message || '(não definido)'}

## Instruções Customizadas
${form.custom_instructions || '(nenhuma)'}

## Diretiva (${previewDept})
${dir.content || '(nenhuma diretiva configurada)'}
`;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* General + Model + Audio + Instructions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">Configuração da AI</CardTitle>
          <div className="flex gap-2">
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1" /> Visualizar Prompt</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="font-display">Preview do Prompt</DialogTitle>
                </DialogHeader>
                <div className="mb-3">
                  <Select value={previewDept} onValueChange={setPreviewDept}>
                    <SelectTrigger className="w-48 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ScrollArea className="max-h-[50vh]">
                  <pre className="text-xs text-foreground bg-muted p-4 rounded-lg whitespace-pre-wrap font-mono">{buildPreview()}</pre>
                </ScrollArea>
              </DialogContent>
            </Dialog>
            <Button onClick={handleSaveConfig} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <Section title="Geral">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Nome do Agente" description="Como a AI se apresenta.">
                <Input value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} />
              </FieldGroup>
              <FieldGroup label="Tom de Voz">
                <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="friendly">Amigável</SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>
            <FieldGroup label="Mensagem de Saudação" description="Primeira mensagem enviada ao cliente. Use {agent_name} e {company_name}.">
              <Textarea value={form.greeting_message} onChange={(e) => setForm({ ...form, greeting_message: e.target.value })} rows={3} />
            </FieldGroup>
            <FieldGroup label="Mensagem de Fallback" description="Enviada quando a AI não consegue responder.">
              <Textarea value={form.fallback_message} onChange={(e) => setForm({ ...form, fallback_message: e.target.value })} rows={2} />
            </FieldGroup>
            <FieldGroup label="Intensidade de Emojis">
              <Select value={form.emoji_intensity} onValueChange={(v) => setForm({ ...form, emoji_intensity: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>
          </Section>

          <Section title="Modelo">
            <FieldGroup label="Modelo de AI">
              <Select value={form.ai_model} onValueChange={(v) => setForm({ ...form, ai_model: v })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>
            <FieldGroup label={`Max Tokens: ${form.max_tokens}`} description="Limite de tokens na resposta da AI.">
              <Slider value={[form.max_tokens]} onValueChange={([v]) => setForm({ ...form, max_tokens: v })} min={100} max={500} step={10} className="max-w-sm" />
            </FieldGroup>
            <FieldGroup label={`Histórico: ${form.max_history_messages} msgs`} description="Quantidade de mensagens anteriores enviadas como contexto.">
              <Slider value={[form.max_history_messages]} onValueChange={([v]) => setForm({ ...form, max_history_messages: v })} min={3} max={20} step={1} className="max-w-sm" />
            </FieldGroup>
          </Section>

          <Section title="Áudio (ElevenLabs)">
            <div className="flex items-center gap-3">
              <Switch checked={form.audio_enabled} onCheckedChange={(v) => setForm({ ...form, audio_enabled: v })} />
              <span className="text-sm text-foreground">Áudio habilitado</span>
            </div>
            {form.audio_enabled && (
              <div className="space-y-4 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Voz do Agente" description="Selecione uma voz da sua conta ElevenLabs.">
                    <div className="flex gap-2">
                      {loadingVoices ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Carregando vozes...
                        </div>
                      ) : voicesError || voices.length === 0 ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={form.audio_voice_id}
                            onChange={(e) => setForm({ ...form, audio_voice_id: e.target.value })}
                            placeholder="Cole o Voice ID do ElevenLabs"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {voicesError ? 'Erro ao carregar vozes.' : 'Nenhuma voz encontrada.'}
                            </span>
                            <Button variant="ghost" size="sm" onClick={fetchVoices} className="h-6 px-2 text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex gap-2">
                          <Select
                            value={form.audio_voice_id}
                            onValueChange={(v) => setForm({ ...form, audio_voice_id: v })}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Selecione uma voz" />
                            </SelectTrigger>
                            <SelectContent>
                              {voices.map((v) => (
                                <SelectItem key={v.voice_id} value={v.voice_id}>
                                  {v.name} {v.category ? `(${v.category})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(() => {
                            const selectedVoice = voices.find((v) => v.voice_id === form.audio_voice_id);
                            if (!selectedVoice?.preview_url) return null;
                            return (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => playVoicePreview(selectedVoice.preview_url, selectedVoice.voice_id)}
                                disabled={previewingVoice === selectedVoice.voice_id}
                                title="Ouvir preview"
                              >
                                {previewingVoice === selectedVoice.voice_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Volume2 className="h-4 w-4" />
                                )}
                              </Button>
                            );
                          })()}
                          <Button variant="ghost" size="icon" onClick={fetchVoices} disabled={loadingVoices} title="Recarregar vozes">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Modo de Áudio">
                    <Select value={form.audio_mode} onValueChange={(v) => setForm({ ...form, audio_mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text_only">Apenas Texto</SelectItem>
                        <SelectItem value="audio_only">Apenas Áudio</SelectItem>
                        <SelectItem value="text_and_audio">Texto + Áudio</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label={`Estabilidade: ${form.audio_voice_stability.toFixed(2)}`} description="Mais alto = voz mais consistente, menos expressiva.">
                    <Slider
                      value={[form.audio_voice_stability]}
                      onValueChange={([v]) => setForm({ ...form, audio_voice_stability: v })}
                      min={0} max={1} step={0.05}
                      className="max-w-sm"
                    />
                  </FieldGroup>
                  <FieldGroup label={`Similaridade: ${form.audio_voice_similarity.toFixed(2)}`} description="Mais alto = mais fiel à voz original.">
                    <Slider
                      value={[form.audio_voice_similarity]}
                      onValueChange={([v]) => setForm({ ...form, audio_voice_similarity: v })}
                      min={0} max={1} step={0.05}
                      className="max-w-sm"
                    />
                  </FieldGroup>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Limite de caracteres" description="Textos maiores que esse limite enviam apenas texto.">
                    <Input type="number" value={form.audio_max_chars} onChange={(e) => setForm({ ...form, audio_max_chars: Number(e.target.value) })} />
                  </FieldGroup>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={form.audio_channel_mirroring} onCheckedChange={(v) => setForm({ ...form, audio_channel_mirroring: v })} />
                  <span className="text-sm text-foreground">Espelhar canal (responde em áudio apenas se o lead enviou áudio)</span>
                </div>
              </div>
            )}
          </Section>

          <Section title="Instruções Customizadas">
            <FieldGroup label="Instruções" description="Instruções adicionais enviadas em todas as interações.">
              <Textarea value={form.custom_instructions} onChange={(e) => setForm({ ...form, custom_instructions: e.target.value })} rows={6} className="font-mono text-xs" />
            </FieldGroup>
          </Section>
        </CardContent>
      </Card>

      {/* Directives per department */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Diretivas por Departamento</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="locacao">
            <TabsList>
              {DEPARTMENTS.map((d) => <TabsTrigger key={d.code} value={d.code}>{d.label}</TabsTrigger>)}
            </TabsList>
            {DEPARTMENTS.map((d) => (
              <TabsContent key={d.code} value={d.code} className="space-y-3 mt-4">
                <FieldGroup label={`Diretiva — ${d.label}`} description="Instruções específicas para este departamento. Versão atual: v${directives[d.code].version}">
                  <Textarea
                    value={directives[d.code].content}
                    onChange={(e) => setDirectives((prev) => ({ ...prev, [d.code]: { ...prev[d.code], content: e.target.value } }))}
                    rows={10}
                    className="font-mono text-xs"
                  />
                </FieldGroup>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => handleSaveDirective(d.code)} disabled={savingDirective === d.code}>
                    {savingDirective === d.code ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar Diretiva
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsAITab;
