// Sprint 6.2 — Coluna esquerda do cockpit: histórico completo do contato.
// Mostra: perfil do cliente, tickets passados, média de NPS, tags.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Phone, Mail, Tag, Clock, Star, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  contact_type: string | null;
  property_unit: string | null;
  crm_neighborhood?: string | null;
  crm_property_ref?: string | null;
  tags?: string[] | null;
}

interface PastTicket {
  id: string;
  title: string;
  category: string;
  stage: string;
  nps_score: number | null;
  created_at: string;
  resolved_at: string | null;
}

interface Props {
  contactId: string | null;
  tenantId: string | null;
  currentTicketId: string;
}

const STAGE_COLOR: Record<string, string> = {
  Novo: 'bg-blue-100 text-blue-700 border-blue-200',
  'Aguardando Contexto': 'bg-purple-100 text-purple-700 border-purple-200',
  'Em Atendimento': 'bg-amber-100 text-amber-700 border-amber-200',
  Resolvido: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Fechado: 'bg-slate-100 text-slate-700 border-slate-200',
};

const CONTACT_TYPE_LABEL: Record<string, string> = {
  inquilino: 'Inquilino',
  proprietario: 'Proprietário',
  lead: 'Lead',
};

export const TicketContactHistoryPanel: React.FC<Props> = ({ contactId, tenantId, currentTicketId }) => {
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [pastTickets, setPastTickets] = useState<PastTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!contactId || !tenantId) {
        setLoading(false);
        return;
      }
      const [{ data: c }, { data: tickets }] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, name, phone, email, contact_type, property_unit, crm_neighborhood, crm_property_ref, tags')
          .eq('id', contactId)
          .maybeSingle(),
        supabase
          .from('tickets')
          .select('id, title, category, stage, nps_score, created_at, resolved_at')
          .eq('tenant_id', tenantId)
          .eq('contact_id', contactId)
          .neq('id', currentTicketId)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      setContact(c as Contact | null);
      setPastTickets((tickets || []) as PastTicket[]);
      setLoading(false);
    };
    run();
  }, [contactId, tenantId, currentTicketId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Contato não vinculado a este chamado.
      </div>
    );
  }

  const resolvedWithNps = pastTickets.filter((t) => t.nps_score != null);
  const avgNps =
    resolvedWithNps.length > 0
      ? resolvedWithNps.reduce((s, t) => s + (t.nps_score || 0), 0) / resolvedWithNps.length
      : null;
  const totalResolved = pastTickets.filter((t) => t.resolved_at).length;

  const firstLetter = (contact.name?.[0] || contact.phone?.[0] || '?').toUpperCase();

  return (
    <div className="h-full overflow-y-auto">
      {/* Profile card */}
      <div className="p-4 border-b">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{firstLetter}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{contact.name || 'Sem nome'}</h3>
            {contact.contact_type && (
              <Badge variant="outline" className="text-[10px] mt-0.5">
                {CONTACT_TYPE_LABEL[contact.contact_type] || contact.contact_type}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" /> {contact.phone}
          </div>
          {contact.email && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail className="h-3 w-3" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
          {contact.property_unit && (
            <div className="flex items-center gap-1.5">
              <Home className="h-3 w-3" /> {contact.property_unit}
            </div>
          )}
          {contact.crm_neighborhood && (
            <div className="flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> {contact.crm_neighborhood}
            </div>
          )}
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {contact.tags.slice(0, 6).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Quick metrics */}
      <div className="p-4 border-b grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Chamados</p>
          <p className="text-lg font-bold">{pastTickets.length + 1}</p>
          <p className="text-[10px] text-muted-foreground">
            {totalResolved} resolvido{totalResolved === 1 ? '' : 's'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">NPS Médio</p>
          {avgNps == null ? (
            <p className="text-sm text-muted-foreground mt-1">Sem avaliações</p>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <Star className={cn('h-4 w-4', avgNps >= 4 ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
              <span className="text-lg font-bold">{avgNps.toFixed(1)}</span>
              <span className="text-[10px] text-muted-foreground">/5</span>
            </div>
          )}
        </div>
      </div>

      {/* Past tickets */}
      <div className="p-4">
        <p className="text-[10px] uppercase text-muted-foreground font-medium mb-2">Histórico de chamados</p>
        {pastTickets.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Este é o primeiro chamado deste contato.</p>
        ) : (
          <div className="space-y-2">
            {pastTickets.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/chamados/${t.id}`)}
                className="w-full text-left p-2.5 rounded-md border hover:bg-muted/40 transition group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium truncate flex-1 group-hover:text-primary">
                    {t.title}
                  </p>
                  {t.nps_score && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Star className={cn('h-3 w-3', t.nps_score >= 4 ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                      <span className="text-[10px] font-semibold">{t.nps_score}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', STAGE_COLOR[t.stage] || '')}>
                    {t.stage}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">{t.category}</span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketContactHistoryPanel;
