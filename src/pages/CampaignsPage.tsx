import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import NewCampaignDialog from '@/components/campaigns/NewCampaignDialog';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  sending: { label: 'Enviando', variant: 'default' },
  sent: { label: 'Enviado', variant: 'outline' },
};

const deptColors: Record<string, string> = {
  locacao: 'bg-blue-100 text-blue-800',
  vendas: 'bg-green-100 text-green-800',
  administrativo: 'bg-amber-100 text-amber-800',
};

interface Campaign {
  id: string;
  name: string;
  department_code: string | null;
  status: string | null;
  sent_count: number | null;
  delivered_count: number | null;
  template_name: string | null;
  created_at: string | null;
}

const CampaignsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchCampaigns = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, name, department_code, status, sent_count, delivered_count, template_name, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao carregar campanhas', description: error.message, variant: 'destructive' });
    } else {
      setCampaigns(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, [tenantId]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Campanhas</h2>
          <p className="text-sm text-muted-foreground">Envio em massa via WhatsApp</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Campanha
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma campanha criada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Entregues</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const st = statusMap[c.status || 'draft'] || statusMap.draft;
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/campanhas/${c.id}`)}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      {c.department_code && (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${deptColors[c.department_code] || ''}`}>
                          {c.department_code}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.sent_count || 0}</TableCell>
                    <TableCell className="text-right">{c.delivered_count || 0}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.created_at ? format(new Date(c.created_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <NewCampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchCampaigns}
      />
    </div>
  );
};

export default CampaignsPage;
