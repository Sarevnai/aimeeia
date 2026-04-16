import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowRight, ArrowLeft, Send, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

interface Template {
  id: string;
  name: string;
  category: string | null;
  components: any;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  department_code: string | null;
  tags: string[] | null;
  crm_status: string | null;
  crm_archive_reason: string | null;
}

const DEPARTMENTS = [
  { code: 'locacao', label: 'Locação' },
  { code: 'vendas', label: 'Vendas' },
  { code: 'administrativo', label: 'Administrativo' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'Novo', label: 'Novo' },
  { value: 'Em negociação', label: 'Em negociação' },
  { value: 'Negócio fechado', label: 'Negócio fechado' },
  { value: 'Arquivado', label: 'Arquivado' },
  { value: 'sem_status', label: 'Sem status' },
] as const;

const statusBadgeClass = (status: string | null): string => {
  switch (status) {
    case 'Novo':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'Em negociação':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'Negócio fechado':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    case 'Arquivado':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted/50 text-muted-foreground border-border';
  }
};

const NewCampaignDialog: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);

  // Step 2
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [contactDeptFilter, setContactDeptFilter] = useState('all');
  const [contactStatusFilter, setContactStatusFilter] = useState('all');
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setName('');
      setDeptCode('');
      setTemplateId('');
      setSelected(new Set());
      setContactSearch('');
      return;
    }
    if (tenantId) {
      supabase
        .from('whatsapp_templates')
        .select('id, name, category, components')
        .eq('tenant_id', tenantId)
        .eq('status', 'APPROVED')
        .then(({ data }) => setTemplates(data || []));
    }
  }, [open, tenantId]);

  useEffect(() => {
    if (step === 2 && tenantId) {
      setLoadingContacts(true);
      (async () => {
        const PAGE = 1000;
        const all: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from('contacts')
            .select('id, name, phone, department_code, tags, crm_status, crm_archive_reason, phone_valid, quality_issues')
            .eq('tenant_id', tenantId)
            .neq('phone_valid', false)
            .order('name')
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < PAGE) break;
        }
        setContacts(all);
        setLoadingContacts(false);
      })();
    }
  }, [step, tenantId]);

  const filteredContacts = contacts.filter((c) => {
    const matchSearch = !contactSearch ||
      (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone.includes(contactSearch);
    const matchDept = contactDeptFilter === 'all' || c.department_code === contactDeptFilter;
    const matchStatus =
      contactStatusFilter === 'all' ||
      (contactStatusFilter === 'sem_status' ? !c.crm_status : c.crm_status === contactStatusFilter);
    return matchSearch && matchDept && matchStatus;
  });

  const toggleContact = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredContacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const handleSend = async () => {
    if (!tenantId || !selectedTemplate) return;
    setSending(true);

    const templateName = selectedTemplate.name;

    // 1. Create campaign with status 'sending'
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: tenantId,
        name,
        department_code: (deptCode || null) as any,
        template_name: templateName,
        status: 'sending',
        sent_count: 0,
      })
      .select('id')
      .single();

    if (error || !campaign) {
      toast({ title: 'Erro ao criar campanha', description: error?.message, variant: 'destructive' });
      setSending(false);
      return;
    }

    const selectedContacts = contacts.filter((c) => selected.has(c.id));

    // 2. Create campaign_results with status 'pending'
    const results = selectedContacts.map((c) => ({
      tenant_id: tenantId,
      campaign_id: campaign.id,
      contact_id: c.id,
      phone: c.phone,
      status: 'pending',
    }));

    if (results.length > 0) {
      await supabase.from('campaign_results').insert(results);
    }

    // 3. Dispatch templates via Edge Function
    let sentCount = 0;
    for (const contact of selectedContacts) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('send-wa-template', {
          body: {
            tenant_id: tenantId,
            phone_number: contact.phone,
            template_name: templateName,
            language_code: 'pt_BR',
            campaign_id: campaign.id,
            contact_id: contact.id,
          },
        });

        if (fnError) {
          console.error(`Falha ao enviar para ${contact.phone}:`, fnError);
        } else if (data?.error) {
          console.error(`Falha ao enviar para ${contact.phone}:`, data.error);
        } else {
          sentCount++;
        }
      } catch (err) {
        console.error(`Falha ao enviar para ${contact.phone}:`, err);
      }
    }

    // 4. Update campaign status
    await supabase.from('campaigns').update({
      status: 'sent',
      sent_count: sentCount,
    }).eq('id', campaign.id);

    setSending(false);
    toast({
      title: 'Campanha enviada',
      description: `${sentCount} de ${selectedContacts.length} mensagens enviadas`,
      variant: sentCount === 0 ? 'destructive' : 'default',
    });
    onOpenChange(false);
    onCreated();
  };

  const canNext = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return selected.size > 0;
    if (step === 3) return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            Nova Campanha — Etapa {step} de 3
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome da Campanha *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção Janeiro" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Departamento</label>
                <Select value={deptCode} onValueChange={setDeptCode}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Template WhatsApp</label>
                <p className="text-xs text-muted-foreground">Apenas templates aprovados.</p>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nenhum template aprovado encontrado.</p>
                ) : (
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um template..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Buscar contato..."
                    className="pl-9"
                  />
                </div>
                <Select value={contactDeptFilter} onValueChange={setContactDeptFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos deptos</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={contactStatusFilter} onValueChange={setContactStatusFilter}>
                  <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status do lead" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between text-sm">
                <button onClick={toggleAll} className="text-accent hover:underline">
                  {selected.size === filteredContacts.length && filteredContacts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
                <span className="text-muted-foreground">{selected.size} selecionado(s)</span>
              </div>

              {loadingContacts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
              ) : filteredContacts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhum contato encontrado.</p>
              ) : (
                <ScrollArea className="max-h-[40vh]">
                  <div className="space-y-1">
                    {filteredContacts.length > 200 && (
                      <p className="text-[11px] text-muted-foreground px-1 pb-1 sticky top-0 bg-background/95 backdrop-blur z-10">
                        Mostrando 200 de {filteredContacts.length} — use busca/filtro de status para refinar. <strong>Selecionar todos</strong> marca os {filteredContacts.length} filtrados.
                      </p>
                    )}
                    {filteredContacts.slice(0, 200).map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggleContact(c.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
                        </div>
                        {c.crm_status && (
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] shrink-0 font-medium', statusBadgeClass(c.crm_status))}
                            title={c.crm_archive_reason ? `Motivo: ${c.crm_archive_reason}` : undefined}
                          >
                            {c.crm_status}
                          </Badge>
                        )}
                        {c.department_code && (
                          <Badge variant="outline" className="text-xs">{c.department_code}</Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-2">
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">Resumo</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Campanha:</span>
                  <span>{name}</span>
                  <span className="text-muted-foreground">Departamento:</span>
                  <span>{deptCode || '—'}</span>
                  <span className="text-muted-foreground">Template:</span>
                  <span>{selectedTemplate?.name || '(nenhum)'}</span>
                  <span className="text-muted-foreground">Destinatários:</span>
                  <span className="font-semibold">{selected.size} contato(s)</span>
                </div>
              </div>

              {selectedTemplate?.components && (
                <div className="space-y-1.5">
                  <h4 className="font-medium text-sm">Preview do Template</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                    {JSON.stringify(selectedTemplate.components, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
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
            <Button onClick={handleSend} disabled={sending || !canNext()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar Campanha
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewCampaignDialog;
