import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/components/ui/use-toast';

interface BehaviorConfig {
  reengagement_hours: number;
  require_cpf_for_visit: boolean;
  send_cold_leads: boolean;
  functions: Record<string, boolean>;
}

const FuncoesTab: React.FC = () => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [configId, setConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Behavior flags
  const [reengagementHours, setReengagementHours] = useState(6);
  const [reengagementActive, setReengagementActive] = useState(true);
  const [sendColdLeads, setSendColdLeads] = useState(false);
  const [requireCpf, setRequireCpf] = useState(false);
  const [sendFullAddress, setSendFullAddress] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ai_behavior_config')
        .select('id, reengagement_hours, require_cpf_for_visit, send_cold_leads, functions')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (data) {
        setConfigId(data.id);
        setReengagementHours(data.reengagement_hours || 6);
        setReengagementActive((data.reengagement_hours || 0) > 0);
        setSendColdLeads(data.send_cold_leads || false);
        setRequireCpf(data.require_cpf_for_visit || false);
        const fns = (data.functions as Record<string, boolean>) || {};
        setSendFullAddress(fns.send_full_address || false);
      }
      setLoading(false);
    };

    load();
  }, [tenantId]);

  const handleSave = async () => {
    if (!configId) return;
    setSaving(true);

    const { error } = await supabase
      .from('ai_behavior_config')
      .update({
        reengagement_hours: reengagementActive ? reengagementHours : 0,
        require_cpf_for_visit: requireCpf,
        send_cold_leads: sendColdLeads,
        functions: {
          reengagement: reengagementActive,
          send_to_crm: true, // always on
          send_full_address: sendFullAddress,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo!', description: 'Configurações de funções atualizadas.' });
      setHasChanges(false);
    }
    setSaving(false);
  };

  const markChanged = () => setHasChanges(true);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const functions = [
    {
      name: 'Reengajamento',
      description: reengagementActive
        ? `A Aimee tentará reengajar o cliente após ${reengagementHours} horas sem resposta.`
        : 'A Aimee NÃO tentará reengajar clientes que pararam de responder.',
      active: reengagementActive,
      onToggle: () => { setReengagementActive(!reengagementActive); markChanged(); },
      extra: reengagementActive && (
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs text-muted-foreground">Horas:</Label>
          <Input
            type="number"
            value={reengagementHours}
            onChange={(e) => { setReengagementHours(Number(e.target.value) || 1); markChanged(); }}
            className="h-8 w-20 text-sm"
            min={1}
            max={72}
          />
        </div>
      ),
    },
    {
      name: 'Envio de leads ao CRM',
      description: 'A Aimee enviará leads qualificados para o CRM automaticamente.',
      active: true,
      onToggle: null, // always on
      locked: true,
    },
    {
      name: 'Envio de endereço completo',
      description: sendFullAddress
        ? 'A Aimee enviará o endereço completo do imóvel ao lead.'
        : 'A Aimee NÃO enviará o endereço completo do imóvel ao lead.',
      active: sendFullAddress,
      onToggle: () => { setSendFullAddress(!sendFullAddress); markChanged(); },
    },
    {
      name: 'Envio de leads frios ao CRM',
      description: sendColdLeads
        ? 'A Aimee enviará leads frios (não qualificados) ao CRM.'
        : 'A Aimee NÃO enviará leads frios (não qualificados) ao CRM.',
      active: sendColdLeads,
      onToggle: () => { setSendColdLeads(!sendColdLeads); markChanged(); },
    },
    {
      name: 'Exigir CPF para visita',
      description: requireCpf
        ? 'A Aimee exigirá o CPF do cliente antes de agendar uma visita.'
        : 'A Aimee NÃO exigirá CPF antes de agendar visitas.',
      active: requireCpf,
      onToggle: () => { setRequireCpf(!requireCpf); markChanged(); },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Save button */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar alterações
          </Button>
        </div>
      )}

      {functions.map((fn, i) => (
        <Card key={i}>
          <CardContent className="flex items-start justify-between p-5">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-foreground">{fn.name}</span>
                <Badge
                  className={cn(
                    'text-[10px] border-0',
                    fn.active
                      ? 'bg-success/15 text-success'
                      : 'bg-destructive/15 text-destructive'
                  )}
                >
                  {fn.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{fn.description}</p>
              {fn.extra}
            </div>
            <div className="shrink-0 ml-4">
              {fn.onToggle ? (
                <Switch checked={fn.active} onCheckedChange={fn.onToggle} />
              ) : (
                <Switch checked={fn.active} disabled className="opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FuncoesTab;
