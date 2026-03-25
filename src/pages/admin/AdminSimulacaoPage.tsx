import React, { useState, useRef, useEffect } from 'react';
import { MessageSquareText, Send, RotateCcw, Brain, Tag, Wrench, Loader2 } from 'lucide-react';
import { useSessionState, clearSimulationSession } from '@/hooks/useSessionState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SimMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  timestamp: Date;
}

interface SimMetadata {
  active_module: { slug: string; name: string } | null;
  qualification: Record<string, any>;
  tags: string[];
  tools_executed: string[];
  agent_type: string;
}

const TAG_COLORS: Record<string, string> = {
  'Interesse:': 'bg-blue-100 text-blue-800',
  'Tipo:': 'bg-purple-100 text-purple-800',
  'Bairro:': 'bg-green-100 text-green-800',
  'Quartos:': 'bg-orange-100 text-orange-800',
  'Orçamento:': 'bg-yellow-100 text-yellow-800',
  'Prazo:': 'bg-pink-100 text-pink-800',
};

const QUAL_LABELS: Record<string, string> = {
  detected_interest: 'Finalidade',
  detected_property_type: 'Tipo',
  detected_neighborhood: 'Bairro',
  detected_bedrooms: 'Quartos',
  detected_budget_max: 'Orçamento',
  detected_timeline: 'Prazo',
  qualification_score: 'Score',
};

interface Tenant {
  id: string;
  company_name: string;
}

export default function AdminSimulacaoPage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useSessionState<string>('admin_tenantId', '');
  const [loadingTenants, setLoadingTenants] = useState(true);

  const [messages, setMessages] = useSessionState<SimMessage[]>('admin_messages', []);
  const [input, setInput] = useState('');
  const [department, setDepartment] = useSessionState('admin_department', 'vendas');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useSessionState<string | null>('admin_conversationId', null);
  const [metadata, setMetadata] = useSessionState<SimMetadata>('admin_metadata', {
    active_module: null,
    qualification: {},
    tags: [],
    tools_executed: [],
    agent_type: 'comercial',
  });
  const [moduleHistory, setModuleHistory] = useSessionState<Array<{ slug: string; name: string }>>('admin_moduleHistory', []);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch tenants list
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, company_name')
        .eq('is_active', true)
        .order('company_name');
      setTenants(data || []);
      setLoadingTenants(false);
    })();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset conversation when tenant changes
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setMetadata({ active_module: null, qualification: {}, tags: [], tools_executed: [], agent_type: 'comercial' });
    setModuleHistory([]);
  }, [selectedTenantId]);

  const handleSend = async () => {
    if (!input.trim() || !selectedTenantId || loading) return;

    const userMessage: SimMessage = {
      id: `user-${Date.now()}`,
      direction: 'inbound',
      body: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-simulate', {
        body: {
          tenant_id: selectedTenantId,
          message_body: userMessage.body,
          department,
          conversation_id: conversationId,
        },
      });

      if (error) throw error;

      const aiMessage: SimMessage = {
        id: `ai-${Date.now()}`,
        direction: 'outbound',
        body: data.ai_response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setConversationId(data.conversation_id);

      setMetadata({
        active_module: data.active_module,
        qualification: data.qualification || {},
        tags: data.tags || [],
        tools_executed: data.tools_executed || [],
        agent_type: data.agent_type || 'comercial',
      });

      if (data.active_module) {
        setModuleHistory(prev => {
          const last = prev[prev.length - 1];
          if (last?.slug !== data.active_module.slug) {
            return [...prev, data.active_module];
          }
          return prev;
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro na simulação',
        description: err.message || 'Falha ao processar mensagem',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (conversationId) {
      await supabase
        .from('conversations')
        .update({ status: 'archived' })
        .eq('id', conversationId);
    }
    setMessages([]);
    setConversationId(null);
    setMetadata({ active_module: null, qualification: {}, tags: [], tools_executed: [], agent_type: 'comercial' });
    setModuleHistory([]);
    clearSimulationSession('sim_admin_');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const qualEntries = Object.entries(metadata.qualification).filter(([_, v]) => v != null && v !== 0);
  const selectedTenantName = tenants.find(t => t.id === selectedTenantId)?.company_name;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Tenant Selector Header */}
      <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Simulação</h1>
        </div>
        <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder={loadingTenants ? 'Carregando tenants...' : 'Selecione um tenant'} />
          </SelectTrigger>
          <SelectContent>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTenantName && (
          <Badge variant="outline" className="text-xs">
            {selectedTenantName}
          </Badge>
        )}
      </div>

      {!selectedTenantId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Selecione um tenant para iniciar a simulação
        </div>
      ) : (
        <div className="flex flex-1 gap-4 p-4 overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-background rounded-lg border">
            {/* Top Bar */}
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-3">
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="locacao">Locação</SelectItem>
                    <SelectItem value="remarketing">Remarketing</SelectItem>
                    <SelectItem value="administrativo">Administrativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Reiniciar
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Envie uma mensagem para iniciar a simulação
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    msg.direction === 'inbound'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    {msg.body}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Digitando...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-80 shrink-0 space-y-3 overflow-y-auto">
            {/* Active Module */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5" />
                  Módulo Ativo
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {metadata.active_module ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2">
                    <p className="font-semibold text-sm text-emerald-800">{metadata.active_module.name}</p>
                    <code className="text-[10px] text-emerald-600">{metadata.active_module.slug}</code>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum módulo ativo</p>
                )}

                {moduleHistory.length > 1 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Histórico</p>
                    {moduleHistory.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={`w-1.5 h-1.5 rounded-full ${i === moduleHistory.length - 1 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        {m.name}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Qualification */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Qualificação
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {qualEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aguardando dados...</p>
                ) : (
                  <div className="space-y-1.5">
                    {qualEntries.map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{QUAL_LABELS[key] || key}</span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {metadata.tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma tag gerada</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {metadata.tags.map(tag => {
                      const colorClass = Object.entries(TAG_COLORS).find(([prefix]) => tag.startsWith(prefix))?.[1] || 'bg-gray-100 text-gray-800';
                      return (
                        <Badge key={tag} variant="outline" className={`text-[10px] ${colorClass}`}>
                          {tag}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tools Executed */}
            {metadata.tools_executed.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    Tools Executadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1">
                    {metadata.tools_executed.map((tool, i) => (
                      <code key={i} className="block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {tool}
                      </code>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Agent Info */}
            <div className="text-[10px] text-muted-foreground text-center">
              Agente: {metadata.agent_type} | Dept: {department}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
