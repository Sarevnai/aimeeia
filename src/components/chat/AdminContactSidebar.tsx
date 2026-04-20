// Sprint 6.2 — sidebar do ChatPage específico pro setor administrativo.
// Substitui a seção de Qualificação (que é de lead) por info do cliente:
// tipo (inquilino/proprietário), unidade, bairro, chamados abertos com link.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, Tag, Ticket, Star, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  tenantId: string;
  contactId: string;
  contactType: string | null;
  propertyUnit: string | null;
  neighborhood: string | null;
}

interface OpenTicket {
  id: string;
  title: string;
  category: string;
  stage: string;
  priority: string;
  created_at: string;
}

const STAGE_COLOR: Record<string, string> = {
  Novo: 'bg-blue-100 text-blue-700 border-blue-200',
  'Aguardando Contexto': 'bg-purple-100 text-purple-700 border-purple-200',
  'Em Atendimento': 'bg-amber-100 text-amber-700 border-amber-200',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgente: 'text-red-600',
  alta: 'text-orange-600',
  media: 'text-yellow-600',
  baixa: 'text-green-600',
};

export const AdminContactSidebar: React.FC<Props> = ({ tenantId, contactId, contactType, propertyUnit, neighborhood }) => {
  const navigate = useNavigate();
  const [openTickets, setOpenTickets] = useState<OpenTicket[]>([]);
  const [stats, setStats] = useState<{ total: number; avgNps: number | null }>({ total: 0, avgNps: null });

  useEffect(() => {
    if (!tenantId || !contactId) return;
    const run = async () => {
      const { data: rows } = await supabase
        .from('tickets')
        .select('id, title, category, stage, priority, nps_score, resolved_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);

      const all = rows || [];
      setOpenTickets(all.filter((t: any) => !t.resolved_at).slice(0, 3) as OpenTicket[]);
      const scored = all.filter((t: any) => t.nps_score != null);
      const avg = scored.length > 0 ? scored.reduce((s: number, t: any) => s + t.nps_score, 0) / scored.length : null;
      setStats({ total: all.length, avgNps: avg });
    };
    run();
  }, [tenantId, contactId]);

  const typeLabel = contactType === 'inquilino' ? 'Inquilino' : contactType === 'proprietario' ? 'Proprietário' : 'Cliente';
  const typeColor = contactType === 'proprietario'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <div className="p-4 border-b border-border space-y-4">
      <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente Administrativo</h4>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[10px]', typeColor)}>{typeLabel}</Badge>
      </div>

      <div className="space-y-1.5 text-xs">
        {propertyUnit && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Home className="h-3 w-3" /> {propertyUnit}
          </div>
        )}
        {neighborhood && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Tag className="h-3 w-3" /> {neighborhood}
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-4 pt-1 border-t">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Chamados</p>
          <p className="text-sm font-semibold">{stats.total}</p>
        </div>
        {stats.avgNps != null && (
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">NPS médio</p>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-sm font-semibold">{stats.avgNps.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Open tickets */}
      <div>
        <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5">Chamados abertos</p>
        {openTickets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">Nenhum aberto agora.</p>
        ) : (
          <div className="space-y-1.5">
            {openTickets.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/chamados/${t.id}`)}
                className="w-full text-left p-2 rounded-md border hover:bg-muted/40 transition group"
              >
                <div className="flex items-start gap-1.5">
                  <Ticket className={cn('h-3 w-3 shrink-0 mt-0.5', PRIORITY_COLOR[t.priority] || 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate group-hover:text-primary">{t.title}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', STAGE_COLOR[t.stage] || '')}>
                        {t.stage}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminContactSidebar;
