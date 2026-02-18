import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from './SettingsFormParts';
import { Loader2, Save } from 'lucide-react';

const SettingsCompanyTab: React.FC = () => {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    city: '',
    state: '',
    phone_redirect: '',
  });

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from('tenants').select('company_name, city, state, phone_redirect').eq('id', tenantId).single();
      if (data) setForm({ company_name: data.company_name || '', city: data.city || '', state: data.state || '', phone_redirect: data.phone_redirect || '' });
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase.from('tenants').update(form).eq('id', tenantId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo com sucesso' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Dados da Empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FieldGroup label="Nome da Empresa" description="Nome exibido nos atendimentos.">
          <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
        </FieldGroup>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Estado">
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
          </FieldGroup>
        </div>
        <FieldGroup label="Telefone Redirect" description="Número para redirecionamento de ligações.">
          <Input value={form.phone_redirect} onChange={(e) => setForm({ ...form, phone_redirect: e.target.value })} placeholder="+5548999..." />
        </FieldGroup>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsCompanyTab;
