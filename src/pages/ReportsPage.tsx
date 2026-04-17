import React, { useEffect, useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, eachWeekOfInterval, getDay, getHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSessionState } from '@/hooks/useSessionState';
import {
  CalendarIcon, MessageSquare, UserCheck, Percent, ArrowRightCircle,
  Users, Clock, Building2, MapPin, TrendingUp, Eye, Phone, AlertTriangle,
  BarChart3, Home, DollarSign,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/* ─── Constants ─── */

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', grupozap: 'Grupo Zap', canal_pro: 'Canal Pro',
  imovelweb: 'ImovelWeb', facebook: 'Facebook', site: 'Site',
  chavesnamao: 'Chaves Na Mão', olx: 'OLX', vivareal: 'VivaReal',
  remarketing_c2s: 'Remarketing', c2s_import: 'Import C2S',
};

const PIE_COLORS = [
  'hsl(207, 65%, 44%)', 'hsl(142, 70%, 42%)', 'hsl(34, 90%, 50%)',
  'hsl(350, 60%, 50%)', 'hsl(270, 50%, 50%)', 'hsl(180, 50%, 40%)',
  'hsl(220, 55%, 47%)', 'hsl(38, 92%, 50%)',
];

const DOW_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PERIOD_MAP: Record<string, string> = { madrugada: 'Madrugada (0-5h)', manha: 'Manhã (6-11h)', tarde: 'Tarde (12-17h)', noite: 'Noite (18-23h)' };

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
  borderRadius: '8px', fontSize: '12px',
};

function getPeriod(hour: number): string {
  if (hour < 6) return 'madrugada';
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

function isBusinessHour(d: Date): boolean {
  const h = d.getHours();
  const dow = d.getDay();
  return dow >= 1 && dow <= 5 && h >= 8 && h < 18;
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function weekLabel(d: Date): string {
  return format(d, 'dd/MM', { locale: ptBR });
}

/* ─── Types ─── */

interface ConvRow { id: string; created_at: string | null; department_code: string | null; source: string | null; assigned_broker_id: string | null; c2s_lead_id: string | null; contact_id: string | null; }
interface ContactRow { id: string; phone: string; name: string | null; channel_source: string | null; crm_status: string | null; crm_funnel_status: string | null; detected_interest: string | null; detected_neighborhood: string | null; detected_budget_max: number | null; detected_property_type: string | null; phone_valid: boolean | null; }
interface MsgRow { id: string; conversation_id: string; direction: string; sender_type: string | null; created_at: string; }
interface PortalRow { id: string; phone: string; source: string | null; development_id: string | null; lead_type: string | null; temperature: string | null; transaction_type: string | null; created_at: string; }

/* ─── Main Page ─── */

const ReportsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const [dateFrom, setDateFrom] = useSessionState<Date>('rpt_from', subDays(new Date(), 45));
  const [dateTo, setDateTo] = useSessionState<Date>('rpt_to', new Date());
  const [activeSection, setActiveSection] = useSessionState('rpt_section', 'performance');
  const [loading, setLoading] = useState(false);

  // Raw data
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [portalLeads, setPortalLeads] = useState<PortalRow[]>([]);

  // Fetch all data
  useEffect(() => {
    if (!tenantId) return;
    const fetchAll = async () => {
      setLoading(true);
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      const [convRes, contactRes, msgRes, portalRes] = await Promise.all([
        supabase.from('conversations').select('id, created_at, department_code, source, assigned_broker_id, c2s_lead_id, contact_id')
          .eq('tenant_id', tenantId).gte('created_at', from).lte('created_at', to)
          .not('source', 'eq', 'simulation').order('created_at'),
        supabase.from('contacts').select('id, phone, name, channel_source, crm_status, crm_funnel_status, detected_interest, detected_neighborhood, detected_budget_max, detected_property_type, phone_valid')
          .eq('tenant_id', tenantId).not('phone', 'like', 'SIM-%'),
        supabase.from('messages').select('id, conversation_id, direction, sender_type, created_at')
          .eq('tenant_id', tenantId).gte('created_at', from).lte('created_at', to)
          .in('direction', ['inbound', 'outbound']).not('sender_type', 'eq', 'system').limit(10000),
        supabase.from('portal_leads_log').select('id, phone, source, development_id, lead_type, temperature, transaction_type, created_at')
          .eq('tenant_id', tenantId).gte('created_at', from).lte('created_at', to),
      ]);

      setConversations((convRes.data || []) as ConvRow[]);
      setContacts((contactRes.data || []) as ContactRow[]);
      setMessages((msgRes.data || []) as MsgRow[]);
      setPortalLeads((portalRes.data || []) as PortalRow[]);
      setLoading(false);
    };
    fetchAll();
  }, [tenantId, dateFrom, dateTo]);

  // ─── Derived metrics ───

  const contactById = useMemo(() => {
    const map = new Map<string, ContactRow>();
    contacts.forEach(c => map.set(c.id, c));
    return map;
  }, [contacts]);

  // Conversations with contact data enriched
  const enrichedConvs = useMemo(() => {
    return conversations.map(c => {
      const contact = c.contact_id ? contactById.get(c.contact_id) : null;
      return { ...c, contact };
    });
  }, [conversations, contactById]);

  const totalLeads = conversations.length;
  const convertedToCRM = conversations.filter(c => c.c2s_lead_id).length;
  const conversionRate = totalLeads > 0 ? (convertedToCRM / totalLeads * 100) : 0;
  const visitRequests = enrichedConvs.filter(c => c.contact?.crm_funnel_status && ['Scheduled visit', 'Done visit', 'Visita agendada', 'Visita realizada'].some(s => c.contact!.crm_funnel_status!.toLowerCase().includes(s.toLowerCase()))).length;
  const uniquePhones = new Set(conversations.map(c => enrichedConvs.find(e => e.id === c.id)?.contact?.phone).filter(Boolean)).size;
  const errorContacts = contacts.filter(c => c.phone_valid === false).length;
  const noResponseConvs = conversations.filter(c => {
    const convMsgs = messages.filter(m => m.conversation_id === c.id);
    return convMsgs.length > 0 && convMsgs.every(m => m.direction === 'outbound');
  }).length;

  // Channel distribution
  const channelDist = useMemo(() => {
    const map: Record<string, number> = {};
    enrichedConvs.forEach(c => {
      const ch = c.contact?.channel_source || c.source || 'whatsapp';
      map[ch] = (map[ch] || 0) + 1;
    });
    return Object.entries(map).map(([key, value]) => ({
      name: CHANNEL_LABELS[key] || key, value, key,
    })).sort((a, b) => b.value - a.value);
  }, [enrichedConvs]);

  // Weekly data
  const weeks = useMemo(() => {
    try {
      return eachWeekOfInterval({ start: dateFrom, end: dateTo }, { weekStartsOn: 1 });
    } catch { return []; }
  }, [dateFrom, dateTo]);

  const weeklyConvs = useMemo(() => {
    return weeks.map(weekStart => {
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekConvs = conversations.filter(c => {
        const d = new Date(c.created_at!);
        return d >= weekStart && d < weekEnd;
      });
      const converted = weekConvs.filter(c => c.c2s_lead_id).length;
      return {
        label: weekLabel(weekStart),
        total: weekConvs.length,
        converted,
        rate: weekConvs.length > 0 ? (converted / weekConvs.length * 100) : 0,
      };
    });
  }, [weeks, conversations]);

  // Hourly data
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${i}h`, count: 0, converted: 0 }));
    conversations.forEach(c => {
      if (!c.created_at) return;
      const h = getHours(new Date(c.created_at));
      hours[h].count++;
      if (c.c2s_lead_id) hours[h].converted++;
    });
    return hours;
  }, [conversations]);

  // Day of week data
  const dowData = useMemo(() => {
    const days = DOW_LABELS.map((label, i) => ({ label, dow: i, count: 0 }));
    conversations.forEach(c => {
      if (!c.created_at) return;
      const dow = getDay(new Date(c.created_at));
      days[dow].count++;
    });
    return days;
  }, [conversations]);

  // Off-hours / weekend
  const offHoursCount = conversations.filter(c => c.created_at && !isBusinessHour(new Date(c.created_at))).length;
  const weekendCount = conversations.filter(c => c.created_at && [0, 6].includes(getDay(new Date(c.created_at)))).length;

  // Average messages
  const avgMessages = useMemo(() => {
    const convMsgCounts = new Map<string, { assistant: number; user: number }>();
    messages.forEach(m => {
      const entry = convMsgCounts.get(m.conversation_id) || { assistant: 0, user: 0 };
      if (m.direction === 'outbound') entry.assistant++;
      else entry.user++;
      convMsgCounts.set(m.conversation_id, entry);
    });
    const entries = Array.from(convMsgCounts.values());
    if (entries.length === 0) return { assistant: 0, user: 0, total: 0 };
    const avgA = entries.reduce((s, e) => s + e.assistant, 0) / entries.length;
    const avgU = entries.reduce((s, e) => s + e.user, 0) / entries.length;
    return { assistant: +avgA.toFixed(1), user: +avgU.toFixed(1), total: +(avgA + avgU).toFixed(1) };
  }, [messages]);

  // Weekly average messages
  const weeklyAvgMsgs = useMemo(() => {
    return weeks.map(weekStart => {
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekMsgs = messages.filter(m => {
        const d = new Date(m.created_at);
        return d >= weekStart && d < weekEnd;
      });
      const convIds = new Set(weekMsgs.map(m => m.conversation_id));
      if (convIds.size === 0) return { label: weekLabel(weekStart), assistant: 0, user: 0 };
      const assistant = weekMsgs.filter(m => m.direction === 'outbound').length / convIds.size;
      const user = weekMsgs.filter(m => m.direction === 'inbound').length / convIds.size;
      return { label: weekLabel(weekStart), assistant: +assistant.toFixed(1), user: +user.toFixed(1) };
    });
  }, [weeks, messages]);

  // Neighborhoods (locação vs venda)
  const neighborhoodData = useMemo(() => {
    const locacao: Record<string, { count: number; avgValue: number; values: number[] }> = {};
    const venda: Record<string, { count: number; avgValue: number; values: number[] }> = {};
    contacts.forEach(c => {
      if (!c.detected_neighborhood) return;
      const target = c.detected_interest === 'locacao' ? locacao : venda;
      if (!target[c.detected_neighborhood]) target[c.detected_neighborhood] = { count: 0, avgValue: 0, values: [] };
      target[c.detected_neighborhood].count++;
      if (c.detected_budget_max) target[c.detected_neighborhood].values.push(c.detected_budget_max);
    });
    const calc = (map: typeof locacao) => Object.entries(map)
      .map(([name, d]) => ({ name, count: d.count, avgValue: d.values.length > 0 ? d.values.reduce((s, v) => s + v, 0) / d.values.length : 0 }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
    return { locacao: calc(locacao), venda: calc(venda) };
  }, [contacts]);

  // Top properties
  const topProperties = useMemo(() => {
    const map: Record<string, { code: string; count: number; type: string | null }> = {};
    portalLeads.forEach(p => {
      if (!p.development_id) return;
      if (!map[p.development_id]) map[p.development_id] = { code: p.development_id, count: 0, type: p.transaction_type };
      map[p.development_id].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [portalLeads]);

  // Period conversion
  const periodConversion = useMemo(() => {
    const periods: Record<string, { total: number; converted: number }> = {
      madrugada: { total: 0, converted: 0 }, manha: { total: 0, converted: 0 },
      tarde: { total: 0, converted: 0 }, noite: { total: 0, converted: 0 },
    };
    conversations.forEach(c => {
      if (!c.created_at) return;
      const p = getPeriod(getHours(new Date(c.created_at)));
      periods[p].total++;
      if (c.c2s_lead_id) periods[p].converted++;
    });
    return Object.entries(periods).map(([key, d]) => ({
      label: PERIOD_MAP[key] || key, total: d.total, converted: d.converted,
      rate: d.total > 0 ? +(d.converted / d.total * 100).toFixed(1) : 0,
    }));
  }, [conversations]);

  // Conversion by channel
  const channelConversion = useMemo(() => {
    const map: Record<string, { total: number; converted: number }> = {};
    enrichedConvs.forEach(c => {
      const ch = c.contact?.channel_source || c.source || 'whatsapp';
      if (!map[ch]) map[ch] = { total: 0, converted: 0 };
      map[ch].total++;
      if (c.c2s_lead_id) map[ch].converted++;
    });
    return Object.entries(map).map(([key, d]) => ({
      name: CHANNEL_LABELS[key] || key, key, total: d.total, converted: d.converted,
      rate: d.total > 0 ? +(d.converted / d.total * 100).toFixed(1) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [enrichedConvs]);

  // Weekly avg values (locação + venda)
  const weeklyValues = useMemo(() => {
    return weeks.map(weekStart => {
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekContacts = contacts.filter(c => {
        // Approximate by created_at if available, otherwise include all
        return c.detected_budget_max && c.detected_budget_max > 0;
      });
      const locValues = weekContacts.filter(c => c.detected_interest === 'locacao').map(c => c.detected_budget_max!);
      const vendaValues = weekContacts.filter(c => c.detected_interest !== 'locacao').map(c => c.detected_budget_max!);
      return {
        label: weekLabel(weekStart),
        avgLocacao: locValues.length > 0 ? locValues.reduce((s, v) => s + v, 0) / locValues.length : 0,
        avgVenda: vendaValues.length > 0 ? vendaValues.reduce((s, v) => s + v, 0) / vendaValues.length : 0,
      };
    });
  }, [weeks, contacts]);

  // Per-channel weekly breakdown (for section 5)
  const channelWeekly = useMemo(() => {
    const channels = [...new Set(enrichedConvs.map(c => c.contact?.channel_source || c.source || 'whatsapp'))];
    return channels.map(ch => {
      const chConvs = enrichedConvs.filter(c => (c.contact?.channel_source || c.source || 'whatsapp') === ch);
      const weeklyData = weeks.map(weekStart => {
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const wc = chConvs.filter(c => { const d = new Date(c.created_at!); return d >= weekStart && d < weekEnd; });
        const converted = wc.filter(c => c.c2s_lead_id).length;
        return {
          label: weekLabel(weekStart), total: wc.length, converted,
          rate: wc.length > 0 ? +(converted / wc.length * 100).toFixed(1) : 0,
        };
      });
      return { channel: ch, label: CHANNEL_LABELS[ch] || ch, total: chConvs.length, data: weeklyData };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  }, [enrichedConvs, weeks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center space-y-2">
          <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Análise de Resultados</h2>
          <p className="text-sm text-muted-foreground">Relatório completo de performance do atendimento</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker label="De" date={dateFrom} onSelect={setDateFrom} />
          <DatePicker label="Até" date={dateTo} onSelect={setDateTo} />
        </div>
      </div>

      {/* Section tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="performance" className="text-xs">Performance Geral</TabsTrigger>
          <TabsTrigger value="conversas" className="text-xs">Dados de Conversas</TabsTrigger>
          <TabsTrigger value="imoveis" className="text-xs">Dados de Imóveis</TabsTrigger>
          <TabsTrigger value="conversao" className="text-xs">Taxas de Conversão</TabsTrigger>
          <TabsTrigger value="canais" className="text-xs">Detalhes por Canal</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ═══════════════ SEÇÃO 1: PERFORMANCE GERAL ═══════════════ */}
      {activeSection === 'performance' && (
        <div className="space-y-4 animate-fade-in">
          {/* KPI Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI title="Total de Leads" value={totalLeads} icon={<Users className="h-5 w-5" />} color="blue" />
            <KPI title="Conversas Convertidas" value={convertedToCRM} subtitle={`${conversionRate.toFixed(1)}%`} icon={<ArrowRightCircle className="h-5 w-5" />} color="green" />
            <KPI title="Solicitações de Visita" value={visitRequests} icon={<Eye className="h-5 w-5" />} color="amber" />
            <KPI title="Conversas Reengajadas" value={0} icon={<MessageSquare className="h-5 w-5" />} color="purple" />
          </div>
          {/* KPI Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI title="Pessoas únicas" value={uniquePhones} icon={<UserCheck className="h-5 w-5" />} small />
            <KPI title="Únicas - Convertidas" value={convertedToCRM} icon={<ArrowRightCircle className="h-5 w-5" />} small />
            <KPI title="Únicas - Com visita" value={visitRequests} icon={<Eye className="h-5 w-5" />} small />
            <KPI title="Sem resposta" value={noResponseConvs} icon={<Clock className="h-5 w-5" />} small />
            <KPI title="Erros (tel. inválido)" value={errorContacts} icon={<AlertTriangle className="h-5 w-5" />} small />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar: conversas por origem */}
            <Card title="Conversas por Origem">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelDist} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="hsl(207, 65%, 55%)" radius={[0, 4, 4, 0]} name="Conversas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            {/* Pie: share por canal */}
            <Card title="Share de participação por canal">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={channelDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                      label={({ name, percent }) => `${(percent * 100).toFixed(1)}%`}>
                      {channelDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════ SEÇÃO 2: DADOS SOBRE CONVERSAS ═══════════════ */}
      {activeSection === 'conversas' && (
        <div className="space-y-4 animate-fade-in">
          {/* Consumo por semana */}
          <Card title="Consumo por Semana">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyConvs}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="total" stroke="hsl(207, 65%, 44%)" fill="hsl(207, 65%, 44%)" fillOpacity={0.15} strokeWidth={2} name="Conversas" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Nº médio de mensagens */}
          <Card title="Número médio de mensagens por conversa">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-accent/5">
                <p className="text-2xl font-bold text-foreground">{avgMessages.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-600">{avgMessages.assistant}</p>
                <p className="text-xs text-muted-foreground">Assistente</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-rose-50">
                <p className="text-2xl font-bold text-rose-600">{avgMessages.user}</p>
                <p className="text-xs text-muted-foreground">Usuário</p>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAvgMsgs}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="assistant" stackId="a" fill="hsl(207, 65%, 70%)" name="Assistente" />
                  <Bar dataKey="user" stackId="a" fill="hsl(350, 60%, 65%)" name="Usuário" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Consumo por hora */}
            <Card title="Consumo por Hora">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="hsl(207, 65%, 55%)" radius={[4, 4, 0, 0]} name="Conversas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Consumo por dia da semana */}
            <Card title="Consumo por Dia da Semana">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="hsl(207, 65%, 55%)" radius={[4, 4, 0, 0]} name="Conversas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Off-hours KPIs */}
          <div className="grid grid-cols-2 gap-4">
            <KPI title="Conversas fora do horário comercial" value={offHoursCount} icon={<Clock className="h-5 w-5" />} color="amber" />
            <KPI title="Conversas no final de semana" value={weekendCount} icon={<CalendarIcon className="h-5 w-5" />} color="purple" />
          </div>
        </div>
      )}

      {/* ═══════════════ SEÇÃO 3: DADOS DE IMÓVEIS ═══════════════ */}
      {activeSection === 'imoveis' && (
        <div className="space-y-4 animate-fade-in">
          {/* Top imóveis */}
          <Card title="Imóveis mais procurados">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Conversas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProperties.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sem dados de imóveis no período</TableCell></TableRow>
                ) : topProperties.map(p => (
                  <TableRow key={p.code}>
                    <TableCell className="font-mono text-sm">{p.code}</TableCell>
                    <TableCell><Badge variant="secondary">{p.type === 'venda' ? 'Venda' : p.type === 'locacao' ? 'Locação' : p.type || '—'}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{p.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Bairros */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Bairros Mais Procurados — Locação">
              <Table>
                <TableHeader><TableRow><TableHead>Bairro</TableHead><TableHead className="text-right">Conversas</TableHead><TableHead className="text-right">Valor médio</TableHead></TableRow></TableHeader>
                <TableBody>
                  {neighborhoodData.locacao.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sem dados</TableCell></TableRow>
                  ) : neighborhoodData.locacao.map(n => (
                    <TableRow key={n.name}><TableCell>{n.name}</TableCell><TableCell className="text-right">{n.count}</TableCell><TableCell className="text-right">{n.avgValue > 0 ? fmtCurrency(n.avgValue) : '—'}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card title="Bairros Mais Procurados — Venda">
              <Table>
                <TableHeader><TableRow><TableHead>Bairro</TableHead><TableHead className="text-right">Conversas</TableHead><TableHead className="text-right">Valor médio</TableHead></TableRow></TableHeader>
                <TableBody>
                  {neighborhoodData.venda.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sem dados</TableCell></TableRow>
                  ) : neighborhoodData.venda.map(n => (
                    <TableRow key={n.name}><TableCell>{n.name}</TableCell><TableCell className="text-right">{n.count}</TableCell><TableCell className="text-right">{n.avgValue > 0 ? fmtCurrency(n.avgValue) : '—'}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════ SEÇÃO 4: TAXAS DE CONVERSÃO ═══════════════ */}
      {activeSection === 'conversao' && (
        <div className="space-y-4 animate-fade-in">
          {/* Conversão frio → CRM por semana */}
          <Card title="Conversão (frio → CRM) por Semana">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyConvs}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Area type="monotone" dataKey="rate" stroke="hsl(34, 90%, 50%)" fill="hsl(34, 90%, 50%)" fillOpacity={0.15} strokeWidth={2} name="Conversão %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Conversão por período */}
            <Card title="Conversão por período do dia">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={periodConversion}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="total" fill="hsl(207, 65%, 70%)" name="Conversas" />
                    <Bar dataKey="converted" fill="hsl(34, 90%, 50%)" name="Convertidas" radius={[4, 4, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Conversão por hora */}
            <Card title="Conversão por hora">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData.map(h => ({ ...h, rate: h.count > 0 ? +(h.converted / h.count * 100).toFixed(1) : 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="rate" fill="hsl(34, 90%, 55%)" radius={[4, 4, 0, 0]} name="Conversão %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Conversão por canal */}
          <Card title="Conversão (frio → CRM) por canal">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Conversas</TableHead>
                  <TableHead className="text-right">Convertidas</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelConversion.map(ch => (
                  <TableRow key={ch.key}>
                    <TableCell className="font-medium">{ch.name}</TableCell>
                    <TableCell className="text-right">{ch.total}</TableCell>
                    <TableCell className="text-right">{ch.converted}</TableCell>
                    <TableCell className="text-right font-semibold">{ch.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ═══════════════ SEÇÃO 5: DETALHES POR CANAL ═══════════════ */}
      {activeSection === 'canais' && (
        <div className="space-y-6 animate-fade-in">
          {channelWeekly.length === 0 ? (
            <Card title="Sem dados"><p className="text-sm text-muted-foreground text-center py-8">Nenhum canal com dados no período</p></Card>
          ) : channelWeekly.map(ch => (
            <div key={ch.channel} className="space-y-4">
              <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                {ch.label}
                <Badge variant="secondary" className="text-xs">{ch.total} conversas</Badge>
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Consumo semanal */}
                <Card title={`Consumo por Semana — ${ch.label}`}>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ch.data}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area type="monotone" dataKey="total" stroke="hsl(207, 65%, 44%)" fill="hsl(207, 65%, 44%)" fillOpacity={0.15} strokeWidth={2} name="Conversas" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                {/* Conversão semanal */}
                <Card title={`Conversão por Semana — ${ch.label}`}>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ch.data}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                        <Area type="monotone" dataKey="rate" stroke="hsl(34, 90%, 50%)" fill="hsl(34, 90%, 50%)" fillOpacity={0.15} strokeWidth={2} name="Conversão %" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Sub-components ─── */

const KPI: React.FC<{ title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color?: string; small?: boolean }> = ({ title, value, subtitle, icon, color = 'blue', small }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="rounded-xl bg-card p-4 shadow-card border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn('mt-1 font-bold font-display text-foreground', small ? 'text-2xl' : 'text-3xl')}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn('rounded-lg p-2', colors[color] || colors.blue)}>{icon}</div>
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl bg-card p-5 shadow-card border border-border">
    <h3 className="font-display text-sm font-semibold text-foreground mb-4">{title}</h3>
    {children}
  </div>
);

const DatePicker: React.FC<{ label: string; date: Date; onSelect: (d: Date) => void }> = ({ label, date, onSelect }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className="justify-start text-left font-normal gap-2 text-sm">
        <CalendarIcon className="h-4 w-4" />
        {label}: {format(date, 'dd/MM/yy')}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="end">
      <Calendar mode="single" selected={date} onSelect={(d) => d && onSelect(d)} initialFocus className="p-3 pointer-events-auto" />
    </PopoverContent>
  </Popover>
);

export default ReportsPage;
