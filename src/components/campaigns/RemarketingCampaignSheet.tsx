import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Rocket,
  MessageSquare,
  Users,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

interface SegmentOption {
  motivo: string;
  count: number;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  crm_archive_reason: string | null;
  crm_natureza: string | null;
  neighborhood: string | null;
}

const SUGGESTED_MESSAGES: Record<string, string> = {
  'Falta de interação do usuário':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 😊 Passamos a falar sobre {{natureza}} de um imóvel, mas acabamos perdendo o contato. Você ainda está na busca? Adoraria te ajudar! 🏡',
  'Cliente não respondeu':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 😊 Passamos a falar sobre {{natureza}} de um imóvel, mas acabamos perdendo o contato. Você ainda está na busca? Adoraria te ajudar! 🏡',
  'Apenas pesquisando':
    'Oi, {{nome}}! Sou a Aimee da Smolka Imóveis 🔍 Você estava pesquisando imóveis para {{natureza}}{{bairro}}. Posso te mostrar as novidades? O mercado está com ótimas opções agora!',
  'Compra adiada':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 🏠 Você estava pensando em comprar um imóvel e precisou adiar. Como está esse plano? As condições melhoraram bastante — posso te ajudar a retomar a busca?',
  'Alugado':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 👋 Você alugou um imóvel há algum tempo. Se precisar de renovação ou de um novo imóvel no futuro, estamos aqui! Posso te ajudar em algo agora?',
  'Fechou negócio em outro lugar':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 😊 Ficamos sabendo que você fechou um negócio recentemente. Se precisar de um novo imóvel para {{natureza}} no futuro, conte conosco! Há algo que posso te ajudar agora?',
  '_default':
    'Oi, {{nome}}! Aqui é a Aimee da Smolka Imóveis 😊 Passamos a falar sobre {{natureza}} de um imóvel há algum tempo. Você ainda está buscando? Adoraria te ajudar a encontrar o lugar ideal! 🏡',
};

function renderMessage(template: string, contact: Contact): string {
  const natureza = contact.crm_natureza === 'Aluguel' ? 'aluguel'
    : contact.crm_natureza === 'Compra' ? 'compra'
    : 'busca de imóvel';
  const bairroStr = contact.neighborhood ? ` em ${contact.neighborhood}` : '';

  return template
    .replace(/\{\{nome\}\}/g, contact.name?.split(' ')[0] || 'você')
    .replace(/\{\{natureza\}\}/g, natureza)
    .replace(/\{\{bairro\}\}/g, bairroStr);
}

const RemarketingCampaignSheet: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [dispatchProgress, setDispatchProgress] = useState(0);
  const [dispatchTotal, setDispatchTotal] = useState(0);

  // Step 1
  const [name, setName] = useState('');
  const [naturezaFilter, setNaturezaFilter] = useState<'all' | 'Aluguel' | 'Compra'>('all');
  const [selectedMotivos, setSelectedMotivos] = useState<Set<string>>(new Set());
  const [allSegments, setAllSegments] = useState<SegmentOption[]>([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [loadingSegments, setLoadingSegments] = useState(false);

  // Step 2
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);

  // Step 3
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setName('');
      setNaturezaFilter('all');
      setSelectedMotivos(new Set());
      setMessage('');
      setTemplateName('');
      setCampaignId(null);
      setDispatchProgress(0);
    }
  }, [open]);

  // Load available segments (distinct crm_archive_reason with counts)
  useEffect(() => {
    if (!open || !tenantId) return;
    setLoadingSegments(true);
    supabase
      .from('contacts')
      .select('crm_archive_reason')
      .eq('tenant_id', tenantId)
      .eq('status', 'arquivado')
      .not('crm_archive_reason', 'is', null)
      .then(({ data }) => {
        const countMap = new Map<string, number>();
        for (const row of data || []) {
          const m = row.crm_archive_reason!;
          countMap.set(m, (countMap.get(m) || 0) + 1);
        }
        const segs = Array.from(countMap.entries())
          .map(([motivo, count]) => ({ motivo, count }))
          .sort((a, b) => b.count - a.count);
        setAllSegments(segs);
        // Pre-select all segments
        setSelectedMotivos(new Set(segs.map((s) => s.motivo)));
        setLoadingSegments(false);
      });
  }, [open, tenantId]);

  // Update eligible count when filters change
  useEffect(() => {
    if (!tenantId || selectedMotivos.size === 0) {
      setEligibleCount(0);
      return;
    }
    let q = supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'arquivado')
      .in('crm_archive_reason', Array.from(selectedMotivos));
    if (naturezaFilter !== 'all') {
      q = q.eq('crm_natureza', naturezaFilter);
    }
    q.then(({ count }) => setEligibleCount(count || 0));
  }, [tenantId, selectedMotivos, naturezaFilter]);

  // Load a preview contact when entering step 2
  useEffect(() => {
    if (step !== 2 || !tenantId || selectedMotivos.size === 0) return;
    supabase
      .from('contacts')
      .select('id, name, phone, crm_archive_reason, crm_natureza, neighborhood')
      .eq('tenant_id', tenantId)
      .eq('status', 'arquivado')
      .in('crm_archive_reason', Array.from(selectedMotivos))
      .not('name', 'is', null)
      .limit(1)
      .single()
      .then(({ data }) => setPreviewContact(data as Contact | null));
  }, [step, tenantId, selectedMotivos]);

  // Load contacts for step 3
  useEffect(() => {
    if (step !== 3 || !tenantId || selectedMotivos.size === 0) return;
    setLoadingContacts(true);
    let q = supabase
      .from('contacts')
      .select('id, name, phone, crm_archive_reason, crm_natureza, neighborhood')
      .eq('tenant_id', tenantId)
      .eq('status', 'arquivado')
      .in('crm_archive_reason', Array.from(selectedMotivos))
      .order('name');
    if (naturezaFilter !== 'all') {
      q = q.eq('crm_natureza', naturezaFilter);
    }
    q.then(({ data }) => {
      setContacts((data as Contact[]) || []);
      setLoadingContacts(false);
    });
  }, [step, tenantId, selectedMotivos, naturezaFilter]);

  const toggleMotivo = (motivo: string) => {
    setSelectedMotivos((prev) => {
      const next = new Set(prev);
      next.has(motivo) ? next.delete(motivo) : next.add(motivo);
      return next;
    });
  };

  const applySuggestedMessage = () => {
    const firstSelected = Array.from(selectedMotivos)[0];
    const template = SUGGESTED_MESSAGES[firstSelected] || SUGGESTED_MESSAGES['_default'];
    setMessage(template);
  };

  const handleCreate = async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: tenantId,
        name,
        status: 'draft',
        campaign_type: 'remarketing',
        template_name: templateName || null,
        sent_count: 0,
        target_audience: {
          motivos: Array.from(selectedMotivos),
          natureza: naturezaFilter,
          message_template: message,
        } as any,
      })
      .select('id')
      .single();

    if (error || !campaign) {
      toast({ title: 'Erro ao criar campanha', description: error?.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const results = contacts.map((c) => ({
      tenant_id: tenantId,
      campaign_id: campaign.id,
      contact_id: c.id,
      phone: c.phone,
      status: 'pending',
    }));

    if (results.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < results.length; i += CHUNK) {
        await supabase.from('campaign_results').insert(results.slice(i, i + CHUNK));
      }
    }

    setCampaignId(campaign.id);
    setDispatchTotal(contacts.length);
    setLoading(false);
    setStep(4); // Dispatch step
  };

  const handleDispatch = async () => {
    if (!campaignId || !tenantId) return;
    setDispatching(true);

    // Subscribe to real-time updates
    const sub = supabase
      .channel(`campaign-dispatch-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_results',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => setDispatchProgress((p) => p + 1),
      )
      .subscribe();

    const { error } = await supabase.functions.invoke('dispatch-campaign', {
      body: { campaign_id: campaignId, tenant_id: tenantId, message_template: message },
    });

    sub.unsubscribe();
    setDispatching(false);

    if (error) {
      toast({ title: 'Erro ao disparar campanha', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Campanha disparada!', description: `${contacts.length} mensagens enviadas.` });
      onCreated();
      onOpenChange(false);
    }
  };

  const canNext = () => {
    if (step === 1) return name.trim().length > 0 && selectedMotivos.size > 0 && eligibleCount > 0;
    if (step === 2) return message.trim().length > 0;
    if (step === 3) return contacts.length > 0;
    return false;
  };

  const stepTitles = [
    'Segmentação',
    'Mensagem',
    'Revisão',
    'Disparar',
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            {stepTitles.map((t, i) => (
              <React.Fragment key={t}>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    i + 1 === step
                      ? 'bg-accent text-accent-foreground'
                      : i + 1 < step
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t}
                </span>
                {i < stepTitles.length - 1 && (
                  <span className="text-muted-foreground text-xs">›</span>
                )}
              </React.Fragment>
            ))}
          </div>
          <SheetTitle className="font-display">
            {step === 1 && 'Campanha de Remarketing'}
            {step === 2 && 'Mensagem de Reaquecimento'}
            {step === 3 && 'Revisão Final'}
            {step === 4 && 'Disparar Campanha'}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {/* Step 1: Segmentation */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome da Campanha *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Remarketing Março 2026 — Locação"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Natureza da negociação</label>
                <Select
                  value={naturezaFilter}
                  onValueChange={(v) => setNaturezaFilter(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Compra + Aluguel</SelectItem>
                    <SelectItem value="Aluguel">Apenas Aluguel</SelectItem>
                    <SelectItem value="Compra">Apenas Compra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Motivos de arquivamento</label>
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={() =>
                      selectedMotivos.size === allSegments.length
                        ? setSelectedMotivos(new Set())
                        : setSelectedMotivos(new Set(allSegments.map((s) => s.motivo)))
                    }
                  >
                    {selectedMotivos.size === allSegments.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                </div>

                {loadingSegments ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  </div>
                ) : allSegments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>Nenhum lead arquivado importado.</p>
                    <p className="mt-1 text-xs">Use "Importar Lista CRM" primeiro.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {allSegments.map((seg) => (
                      <label
                        key={seg.motivo}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedMotivos.has(seg.motivo)}
                          onCheckedChange={() => toggleMotivo(seg.motivo)}
                        />
                        <span className="text-sm flex-1">{seg.motivo}</span>
                        <Badge variant="secondary" className="text-xs">
                          {seg.count}
                        </Badge>
                      </label>
                    ))}
                  </div>
                )}

                {eligibleCount > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg">
                    <Users className="h-4 w-4 text-accent shrink-0" />
                    <p className="text-sm font-medium text-accent">
                      {eligibleCount.toLocaleString('pt-BR')} contatos elegíveis
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Message */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Mensagem *</label>
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={applySuggestedMessage}
                  >
                    Usar sugestão de IA
                  </button>
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escreva a mensagem de reaquecimento..."
                  className="min-h-[140px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis: <code className="bg-muted px-1 rounded">{'{{nome}}'}</code>{' '}
                  <code className="bg-muted px-1 rounded">{'{{natureza}}'}</code>{' '}
                  <code className="bg-muted px-1 rounded">{'{{bairro}}'}</code>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Template WhatsApp (opcional)</label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nome do template aprovado pelo Meta"
                />
                <p className="text-xs text-muted-foreground">
                  Se informado, usa o template aprovado. Caso contrário, envia mensagem de texto
                  livre (apenas para conversas ativas).
                </p>
              </div>

              {/* Preview */}
              {previewContact && message && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Preview (1º contato)
                  </p>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-xs text-green-700 mb-2 font-medium">
                      Para: {previewContact.name || previewContact.phone}
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-green-900">
                      {renderMessage(message, previewContact)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <h4 className="font-semibold">Resumo da Campanha</h4>
                <div className="grid grid-cols-2 gap-y-1.5">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">Tipo:</span>
                  <span>
                    <Badge variant="outline" className="text-xs">Remarketing</Badge>
                  </span>
                  <span className="text-muted-foreground">Natureza:</span>
                  <span>{naturezaFilter === 'all' ? 'Compra + Aluguel' : naturezaFilter}</span>
                  <span className="text-muted-foreground">Segmentos:</span>
                  <span>{selectedMotivos.size}</span>
                  <span className="text-muted-foreground">Destinatários:</span>
                  <span className="font-bold text-accent">
                    {loadingContacts ? '...' : contacts.length.toLocaleString('pt-BR')} contatos
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Mensagem</p>
                <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap font-mono">
                  {message}
                </div>
              </div>

              {!loadingContacts && contacts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-muted-foreground">
                    Primeiros contatos
                  </p>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {contacts.slice(0, 10).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/50 text-sm"
                      >
                        <span className="font-medium truncate">{c.name || 'Sem nome'}</span>
                        <span className="text-muted-foreground text-xs ml-2 shrink-0">
                          {c.crm_archive_reason}
                        </span>
                      </div>
                    ))}
                    {contacts.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        + {(contacts.length - 10).toLocaleString('pt-BR')} mais
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Dispatch */}
          {step === 4 && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              {dispatching ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-accent" />
                  <div>
                    <p className="font-semibold text-lg">Enviando mensagens...</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {dispatchProgress} de {dispatchTotal} enviados
                    </p>
                    {dispatchTotal > 0 && (
                      <div className="w-48 h-2 bg-muted rounded-full mx-auto mt-3">
                        <div
                          className="h-2 bg-accent rounded-full transition-all"
                          style={{ width: `${(dispatchProgress / dispatchTotal) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Não feche esta janela. O processo pode levar alguns minutos para listas grandes.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                    <Rocket className="h-8 w-8 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Campanha criada!</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      <strong>{contacts.length.toLocaleString('pt-BR')}</strong> contatos
                      aguardando disparo.
                    </p>
                  </div>

                  {templateName ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 max-w-xs">
                      <CheckCircle2 className="h-4 w-4 inline mr-1" />
                      Template <strong>{templateName}</strong> será usado para o envio via WhatsApp Business API.
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 max-w-xs">
                      <strong>Atenção:</strong> Sem template aprovado, o envio funciona apenas para
                      contatos com conversa ativa (últimas 24h).
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="w-full max-w-xs"
                    onClick={handleDispatch}
                  >
                    <Rocket className="h-4 w-4 mr-2" />
                    Disparar para {contacts.length.toLocaleString('pt-BR')} contatos
                  </Button>
                </>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer navigation */}
        {step < 4 && (
          <div className="px-6 py-4 border-t bg-card flex justify-between">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                Próximo <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={loading || !canNext()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Criar Campanha
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default RemarketingCampaignSheet;
