import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, Send, CheckCheck, Eye, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const resultStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'Enviado', variant: 'secondary' },
  delivered: { label: 'Entregue', variant: 'default' },
  read: { label: 'Lido', variant: 'outline' },
  replied: { label: 'Respondeu', variant: 'default' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

interface CampaignResult {
  id: string;
  phone: string;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  error_message: string | null;
}

const CampaignDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [results, setResults] = useState<CampaignResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !tenantId) return;

    const fetchData = async () => {
      setLoading(true);
      const [campRes, resultsRes] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', id).eq('tenant_id', tenantId).single(),
        supabase.from('campaign_results').select('*').eq('campaign_id', id).eq('tenant_id', tenantId).order('sent_at', { ascending: true }),
      ]);
      if (campRes.data) setCampaign(campRes.data);
      if (resultsRes.data) setResults(resultsRes.data);
      setLoading(false);
    };
    fetchData();

    // Realtime subscription for results
    const channel = supabase
      .channel(`campaign-results-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaign_results',
        filter: `campaign_id=eq.${id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setResults((prev) => [...prev, payload.new as CampaignResult]);
        } else if (payload.eventType === 'UPDATE') {
          setResults((prev) => prev.map((r) => r.id === (payload.new as any).id ? payload.new as CampaignResult : r));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, tenantId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center py-12 gap-3">
        <p className="text-muted-foreground">Campanha não encontrada.</p>
        <Button variant="outline" onClick={() => navigate('/campanhas')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const sentCount = results.length;
  const deliveredCount = results.filter((r) => r.delivered_at).length;
  const readCount = results.filter((r) => r.read_at).length;
  const repliedCount = results.filter((r) => r.replied_at).length;

  const metrics = [
    { label: 'Enviados', value: sentCount, icon: Send, color: 'text-blue-600' },
    { label: 'Entregues', value: deliveredCount, icon: CheckCheck, color: 'text-green-600' },
    { label: 'Lidos', value: readCount, icon: Eye, color: 'text-amber-600' },
    { label: 'Responderam', value: repliedCount, icon: MessageSquare, color: 'text-purple-600' },
  ];

  const fmtDate = (d: string | null) => d ? format(new Date(d), 'dd/MM HH:mm', { locale: ptBR }) : '—';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/campanhas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold text-foreground">{campaign.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={campaign.status === 'sent' ? 'outline' : 'secondary'}>
              {campaign.status === 'sent' ? 'Enviado' : campaign.status === 'sending' ? 'Enviando' : 'Rascunho'}
            </Badge>
            {campaign.created_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(campaign.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <m.icon className={`h-5 w-5 ${m.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Results table */}
        {results.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum resultado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Entregue</TableHead>
                <TableHead>Lido</TableHead>
                <TableHead>Respondeu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => {
                const st = resultStatusMap[r.status || 'sent'] || resultStatusMap.sent;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.phone}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.sent_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.delivered_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.read_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(r.replied_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default CampaignDetailPage;
