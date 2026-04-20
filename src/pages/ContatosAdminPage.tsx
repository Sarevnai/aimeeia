// Sprint 6.2 — Contatos do setor administrativo.
// Lista dedicada de inquilinos + proprietários (NÃO leads de vendas).
// Filtros por tipo, busca, link pra abrir chamado.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Phone, Mail, Home, MessageSquare, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  contact_type: string | null;
  property_unit: string | null;
  crm_neighborhood: string | null;
  tags: string[] | null;
  created_at: string | null;
  ticket_count?: number;
  open_ticket_count?: number;
  last_ticket_at?: string | null;
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  inquilino: { label: 'Inquilino', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  proprietario: { label: 'Proprietário', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const ContatosAdminPage: React.FC = () => {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    if (!tenantId) return;
    const run = async () => {
      setLoading(true);

      const { data: contactRows } = await supabase
        .from('contacts')
        .select('id, name, phone, email, contact_type, property_unit, crm_neighborhood, tags, created_at')
        .eq('tenant_id', tenantId)
        .in('contact_type', ['inquilino', 'proprietario'])
        .order('created_at', { ascending: false })
        .limit(500);

      const rows = (contactRows || []) as AdminContact[];

      // Carrega tickets por contato pra métricas
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: ticketRows } = await supabase
          .from('tickets')
          .select('contact_id, resolved_at, created_at')
          .eq('tenant_id', tenantId)
          .in('contact_id', ids);

        const byContact: Record<string, { total: number; open: number; last: string | null }> = {};
        (ticketRows || []).forEach((t: any) => {
          if (!t.contact_id) return;
          const row = byContact[t.contact_id] || { total: 0, open: 0, last: null };
          row.total += 1;
          if (!t.resolved_at) row.open += 1;
          if (!row.last || t.created_at > row.last) row.last = t.created_at;
          byContact[t.contact_id] = row;
        });

        rows.forEach((r) => {
          const s = byContact[r.id] || { total: 0, open: 0, last: null };
          r.ticket_count = s.total;
          r.open_ticket_count = s.open;
          r.last_ticket_at = s.last;
        });
      }

      setContacts(rows);
      setLoading(false);
    };
    run();
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.property_unit?.toLowerCase().includes(q) ||
        c.crm_neighborhood?.toLowerCase().includes(q)
      );
    });
  }, [contacts, search, typeFilter]);

  const counts = useMemo(
    () => ({
      inquilino: contacts.filter((c) => c.contact_type === 'inquilino').length,
      proprietario: contacts.filter((c) => c.contact_type === 'proprietario').length,
    }),
    [contacts],
  );

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Contatos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inquilinos e proprietários sob administração.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, email, unidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({contacts.length})</SelectItem>
            <SelectItem value="inquilino">Inquilinos ({counts.inquilino})</SelectItem>
            <SelectItem value="proprietario">Proprietários ({counts.proprietario})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-60">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {contacts.length === 0
                ? 'Ainda não há inquilinos ou proprietários cadastrados neste tenant.'
                : 'Nenhum contato encontrado com esses filtros.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((c) => {
                const typeInfo = c.contact_type ? TYPE_LABEL[c.contact_type] : null;
                const initial = (c.name?.[0] || c.phone?.[0] || '?').toUpperCase();
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {initial}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.name || 'Sem nome'}</span>
                        {typeInfo && (
                          <Badge variant="outline" className={cn('text-[10px]', typeInfo.color)}>
                            {typeInfo.label}
                          </Badge>
                        )}
                        {c.open_ticket_count != null && c.open_ticket_count > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {c.open_ticket_count} chamado{c.open_ticket_count === 1 ? '' : 's'} aberto{c.open_ticket_count === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        )}
                        {c.property_unit && (
                          <span className="flex items-center gap-1">
                            <Home className="h-3 w-3" /> {c.property_unit}
                          </span>
                        )}
                        {c.crm_neighborhood && <span>{c.crm_neighborhood}</span>}
                      </div>
                    </div>

                    <div className="hidden md:block text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Chamados</p>
                      <p className="text-sm font-semibold">{c.ticket_count || 0}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver chamados deste contato"
                        onClick={() => navigate(`/chamados?contact_id=${c.id}`)}
                      >
                        <Ticket className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Abrir conversa"
                        onClick={() => navigate(`/inbox?phone=${encodeURIComponent(c.phone)}`)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ContatosAdminPage;
