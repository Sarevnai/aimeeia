import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';

type Development = Tables<'developments'>;

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  lancamento: { label: 'Lançamento', variant: 'default' },
  em_obras: { label: 'Em obras', variant: 'secondary' },
  pronto: { label: 'Pronto', variant: 'outline' },
};

const DevelopmentsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('developments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setDevelopments(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Empreendimentos</h2>
          <p className="text-sm text-muted-foreground">Gerencie seus empreendimentos imobiliários</p>
        </div>
        <Button onClick={() => navigate('/empreendimentos/novo')} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Empreendimento
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : developments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">Nenhum empreendimento cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {developments.map((dev) => {
            const st = statusLabels[dev.status ?? ''] ?? { label: dev.status, variant: 'secondary' as const };
            return (
              <div
                key={dev.id}
                onClick={() => navigate(`/empreendimentos/${dev.id}/editar`)}
                className="rounded-xl bg-card border border-border shadow-card overflow-hidden cursor-pointer hover:shadow-elevated transition-shadow"
              >
                {dev.hero_image ? (
                  <img src={dev.hero_image} alt={dev.name} className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-muted flex items-center justify-center">
                    <Building2 className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-semibold text-foreground leading-tight">{dev.name}</h3>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  {dev.developer && <p className="text-xs text-muted-foreground">{dev.developer}</p>}
                  {dev.neighborhood && (
                    <p className="text-xs text-muted-foreground">{dev.neighborhood}, {dev.city}</p>
                  )}
                  {dev.starting_price && (
                    <p className="text-sm font-semibold text-foreground">
                      A partir de R$ {Number(dev.starting_price).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DevelopmentsPage;
