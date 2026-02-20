import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { FieldGroup, Section } from './SettingsFormParts';
import { Loader2, Save, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import type { Tables, Json } from '@/integrations/supabase/types';

type Region = Tables<'regions'>;

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface BusinessHours {
  days: string[];
  start: string;
  end: string;
  timezone: string;
}

const SettingsIntegrationsTab: React.FC = () => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  // WhatsApp & CRM
  const [waForm, setWaForm] = useState({ wa_phone_number_id: '', wa_access_token: '', wa_verify_token: '', waba_id: '' });
  const [crmForm, setCrmForm] = useState({ crm_type: 'vista', crm_api_key: '', crm_api_url: '' });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingWa, setSavingWa] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);

  // Business hours
  const [hours, setHours] = useState<BusinessHours>({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '18:00', timezone: 'America/Sao_Paulo' });
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSettingId, setHoursSettingId] = useState<string | null>(null);

  // Regions
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionDialog, setRegionDialog] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [regionForm, setRegionForm] = useState({ region_key: '', region_name: '', neighborhoods: '' });
  const [savingRegion, setSavingRegion] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const [tenantRes, hoursRes, regionsRes] = await Promise.all([
        supabase.from('tenants').select('wa_phone_number_id, wa_access_token, wa_verify_token, waba_id, crm_type, crm_api_key, crm_api_url').eq('id', tenantId).single(),
        supabase.from('system_settings').select('*').eq('tenant_id', tenantId).eq('setting_key', 'business_hours').single(),
        supabase.from('regions').select('*').eq('tenant_id', tenantId).order('region_name'),
      ]);

      if (tenantRes.data) {
        const t = tenantRes.data as any;
        setWaForm({ wa_phone_number_id: t.wa_phone_number_id || '', wa_access_token: t.wa_access_token || '', wa_verify_token: t.wa_verify_token || '', waba_id: t.waba_id || '' });
        setCrmForm({ crm_type: t.crm_type || 'vista', crm_api_key: t.crm_api_key || '', crm_api_url: t.crm_api_url || '' });
      }
      if (hoursRes.data) {
        setHoursSettingId(hoursRes.data.id);
        const val = hoursRes.data.setting_value as any;
        if (val) setHours({ days: val.days || [], start: val.start || '08:00', end: val.end || '18:00', timezone: val.timezone || 'America/Sao_Paulo' });
      }
      setRegions(regionsRes.data ?? []);
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  const toggleToken = (key: string) => setShowTokens((p) => ({ ...p, [key]: !p[key] }));

  const saveWhatsApp = async () => {
    if (!tenantId) return;
    setSavingWa(true);
    const { error } = await supabase.from('tenants').update(waForm).eq('id', tenantId);
    setSavingWa(false);
    toast(error ? { title: 'Erro', description: error.message, variant: 'destructive' } : { title: 'WhatsApp salvo' });
  };

  const saveCRM = async () => {
    if (!tenantId) return;
    setSavingCrm(true);
    const { error } = await supabase.from('tenants').update(crmForm).eq('id', tenantId);
    setSavingCrm(false);
    toast(error ? { title: 'Erro', description: error.message, variant: 'destructive' } : { title: 'CRM salvo' });
  };

  const saveBusinessHours = async () => {
    if (!tenantId) return;
    setSavingHours(true);
    const value: Json = hours as unknown as Json;
    if (hoursSettingId) {
      await supabase.from('system_settings').update({ setting_value: value }).eq('id', hoursSettingId);
    } else {
      const { data } = await supabase.from('system_settings').insert({ tenant_id: tenantId, setting_key: 'business_hours', setting_value: value }).select('id').single();
      if (data) setHoursSettingId(data.id);
    }
    setSavingHours(false);
    toast({ title: 'Horário salvo' });
  };

  const toggleDay = (day: string) => {
    setHours((p) => ({ ...p, days: p.days.includes(day) ? p.days.filter((d) => d !== day) : [...p.days, day] }));
  };

  const openRegionDialog = (region?: Region) => {
    if (region) {
      setEditingRegion(region);
      setRegionForm({ region_key: region.region_key, region_name: region.region_name, neighborhoods: region.neighborhoods.join(', ') });
    } else {
      setEditingRegion(null);
      setRegionForm({ region_key: '', region_name: '', neighborhoods: '' });
    }
    setRegionDialog(true);
  };

  const saveRegion = async () => {
    if (!tenantId) return;
    setSavingRegion(true);
    const neighborhoods = regionForm.neighborhoods.split(',').map((n) => n.trim()).filter(Boolean);

    if (editingRegion) {
      await supabase.from('regions').update({ region_key: regionForm.region_key, region_name: regionForm.region_name, neighborhoods }).eq('id', editingRegion.id);
    } else {
      await supabase.from('regions').insert({ tenant_id: tenantId, region_key: regionForm.region_key, region_name: regionForm.region_name, neighborhoods });
    }

    const { data } = await supabase.from('regions').select('*').eq('tenant_id', tenantId).order('region_name');
    setRegions(data ?? []);
    setSavingRegion(false);
    setRegionDialog(false);
    toast({ title: editingRegion ? 'Região atualizada' : 'Região criada' });
  };

  const deleteRegion = async (id: string) => {
    if (!tenantId) return;
    await supabase.from('regions').delete().eq('id', id).eq('tenant_id', tenantId);
    setRegions((p) => p.filter((r) => r.id !== id));
    toast({ title: 'Região excluída' });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* WhatsApp */}
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup label="Phone Number ID" description="ID do número no WhatsApp Business API.">
            <Input value={waForm.wa_phone_number_id} onChange={(e) => setWaForm({ ...waForm, wa_phone_number_id: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="WABA ID" description="ID da conta WhatsApp Business (necessário para gerenciar templates).">
            <Input value={waForm.waba_id} onChange={(e) => setWaForm({ ...waForm, waba_id: e.target.value })} placeholder="Ex: 123456789012345" />
          </FieldGroup>
          <MaskedField label="Access Token" description="Token de acesso da Graph API." value={waForm.wa_access_token} onChange={(v) => setWaForm({ ...waForm, wa_access_token: v })} show={showTokens.wa_token} onToggle={() => toggleToken('wa_token')} />
          <MaskedField label="Verify Token" description="Token de verificação do webhook." value={waForm.wa_verify_token} onChange={(v) => setWaForm({ ...waForm, wa_verify_token: v })} show={showTokens.wa_verify} onToggle={() => toggleToken('wa_verify')} />
          <div className="flex justify-end">
            <Button onClick={saveWhatsApp} disabled={savingWa} size="sm">
              {savingWa ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CRM */}
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">CRM</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup label="Tipo de CRM">
            <Select value={crmForm.crm_type} onValueChange={(v) => setCrmForm({ ...crmForm, crm_type: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vista">Vista</SelectItem>
                <SelectItem value="jetimob">Jetimob</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </FieldGroup>
          <MaskedField label="API Key" value={crmForm.crm_api_key} onChange={(v) => setCrmForm({ ...crmForm, crm_api_key: v })} show={showTokens.crm_key} onToggle={() => toggleToken('crm_key')} />
          <FieldGroup label="API URL">
            <Input value={crmForm.crm_api_url} onChange={(e) => setCrmForm({ ...crmForm, crm_api_url: e.target.value })} placeholder="https://api.crm.com/v1" />
          </FieldGroup>
          <div className="flex justify-end">
            <Button onClick={saveCRM} disabled={savingCrm} size="sm">
              {savingCrm ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Business hours */}
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Horário Comercial</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup label="Dias da Semana">
            <div className="flex flex-wrap gap-2 mt-1">
              {DAY_KEYS.map((day, i) => (
                <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={hours.days.includes(day)} onCheckedChange={() => toggleDay(day)} />
                  <span className="text-sm">{DAYS[i]}</span>
                </label>
              ))}
            </div>
          </FieldGroup>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <FieldGroup label="Início">
              <Input type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Fim">
              <Input type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Timezone">
              <Select value={hours.timezone} onValueChange={(v) => setHours({ ...hours, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo</SelectItem>
                  <SelectItem value="America/Manaus">Manaus</SelectItem>
                  <SelectItem value="America/Recife">Recife</SelectItem>
                  <SelectItem value="America/Cuiaba">Cuiabá</SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveBusinessHours} disabled={savingHours} size="sm">
              {savingHours ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Regions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">Regiões / Bairros</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openRegionDialog()}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {regions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma região configurada.</p>
          ) : (
            <div className="space-y-3">
              {regions.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{r.region_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{r.region_key}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.neighborhoods.map((n) => (
                        <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRegionDialog(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRegion(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Region dialog */}
      <Dialog open={regionDialog} onOpenChange={setRegionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingRegion ? 'Editar Região' : 'Nova Região'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FieldGroup label="Chave" description="Identificador único (ex: centro, norte).">
              <Input value={regionForm.region_key} onChange={(e) => setRegionForm({ ...regionForm, region_key: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Nome da Região">
              <Input value={regionForm.region_name} onChange={(e) => setRegionForm({ ...regionForm, region_name: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="Bairros" description="Separados por vírgula.">
              <Input value={regionForm.neighborhoods} onChange={(e) => setRegionForm({ ...regionForm, neighborhoods: e.target.value })} placeholder="Centro, Trindade, Agronômica" />
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegionDialog(false)}>Cancelar</Button>
            <Button onClick={saveRegion} disabled={savingRegion || !regionForm.region_key || !regionForm.region_name}>
              {savingRegion ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {editingRegion ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MaskedField: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}> = ({ label, description, value, onChange, show, onToggle }) => (
  <FieldGroup label={label} description={description}>
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="pr-10" />
      <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={onToggle} type="button">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  </FieldGroup>
);

export default SettingsIntegrationsTab;
