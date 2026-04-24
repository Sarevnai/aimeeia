import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import CampaignContactPicker from '@/components/campaigns/CampaignContactPicker';

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

interface DispatchContact {
  id: string;
  phone: string;
}

const DEPARTMENTS = [
  { code: 'locacao', label: 'Locação' },
  { code: 'vendas', label: 'Vendas' },
  { code: 'administrativo', label: 'Administrativo' },
];

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

  // Step 2 (IDs only; picker owns the list)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setStep(1);
      setName('');
      setDeptCode('');
      setTemplateId('');
      setSelected(new Set());
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

    const idList = Array.from(selected);
    const selectedContacts: DispatchContact[] = [];
    const CHUNK = 500;
    for (let i = 0; i < idList.length; i += CHUNK) {
      const { data } = await supabase
        .from('contacts')
        .select('id, phone')
        .in('id', idList.slice(i, i + CHUNK));
      if (data) selectedContacts.push(...(data as DispatchContact[]));
    }

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

          {step === 2 && tenantId && (
            <div className="space-y-3 py-2">
              <CampaignContactPicker
                tenantId={tenantId}
                selectedIds={selected}
                onChange={setSelected}
              />
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
