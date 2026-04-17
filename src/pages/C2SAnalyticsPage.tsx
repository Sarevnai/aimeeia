import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Loader2, TrendingUp, Archive, CheckCircle2, Users, Inbox, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* ─── helpers ─── */

type PeriodKey = '7' | '30' | '60' | '90' | '180' | '365';
const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: '365', label: 'Último ano' },
];

type DeptKey = 'all' | 'vendas' | 'locacao';
const DEPT_OPTIONS: { value: DeptKey; label: string }[] = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'vendas', label: 'Venda' },
  { value: 'locacao', label: 'Locação' },
];

const STATUS_COLORS: Record<string, string> = {
  'Novo': 'hsl(207, 65%, 44%)',
  'Em negociação': 'hsl(34, 90%, 50%)',
  'Negócio fechado': 'hsl(142, 70%, 42%)',
  'Arquivado': 'hsl(220, 10%, 60%)',
};

const PIE_PALETTE = [
  'hsl(207, 65%, 44%)',
  'hsl(34, 90%, 50%)',
  'hsl(142, 70%, 42%)',
  'hsl(280, 55%, 50%)',
  'hsl(350, 60%, 50%)',
  'hsl(38, 92%, 50%)',
  'hsl(180, 50%, 40%)',
  'hsl(220, 55%, 47%)',
  'hsl(220, 10%, 60%)',
];

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

/* ─── types ─── */

interface ContactRow {
  id: string;
  created_at: string | null;
  crm_status: string | null;
  crm_source: string | null;
  crm_natureza: string | null;
  channel_source: string | null;
  department_code: string | null;
  assigned_broker_id: string | null;
}

interface BrokerLookup { id: string; full_name: string | null }

/* ─── Card ─── */

const ChartCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  period?: PeriodKey;
  onPeriodChange?: (p: PeriodKey) => void;
  children: React.ReactNode;
  subtitle?: string;
}> = ({ title, icon, period, onPeriodChange, children, subtitle }) => (
  <div className="rounded-xl bg-card p-5 shadow-card border border-border">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {period && onPeriodChange && (
        <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
          <SelectTrigger className="h-7 w-[150px] text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
    <div className="h-[260px]">{children}</div>
  </div>
);

/* ─── Page ─── */

const C2SAnalyticsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { profile } = useAuth();

  const [globalPeriod, setGlobalPeriod] = useState<PeriodKey>('60');
  const [dept, setDept] = useState<DeptKey>('all');

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerLookup[]>([]);
  const [loading, setLoading] = useState(true);

  /* Fetch — puxa até 10k contatos C2S no maior período selecionável (ano).
     Cada gráfico reaproveita essa massa e filtra por seu próprio período. */
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);

      const contactsRes = await (supabase as any)
        .from('contacts')
        .select('id, created_at, crm_status, crm_source, crm_natureza, channel_source, department_code, assigned_broker_id')
        .eq('tenant_id', tenantId)
        .not('c2s_lead_id', 'is', null)
        .gte('created_at', since.toISOString())
        .limit(10000);

      const brokersRes = await (supabase as any)
        .from('brokers')
        .select('id, full_name')
        .eq('tenant_id', tenantId);

      setContacts((contactsRes.data as unknown as ContactRow[]) || []);
      setBrokers((brokersRes.data as unknown as BrokerLookup[]) || []);
      setLoading(false);
    })();
  }, [tenantId]);

  const brokerById = useMemo(() => {
    const m = new Map<string, string>();
    brokers.forEach((b) => { if (b.id) m.set(b.id, b.full_name || '—'); });
    return m;
  }, [brokers]);

  /* Pre-filtra por department e por período global */
  const scoped = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(globalPeriod, 10));
    return contacts.filter((c) => {
      if (!c.created_at) return false;
      if (new Date(c.created_at) < cutoff) return false;
      if (dept !== 'all') {
        if (dept === 'vendas' && c.department_code !== 'vendas') return false;
        if (dept === 'locacao' && c.department_code !== 'locacao') return false;
      }
      return true;
    });
  }, [contacts, globalPeriod, dept]);

  /* KPIs */
  const kpis = useMemo(() => {
    const total = scoped.length;
    const novo = scoped.filter((c) => c.crm_status === 'Novo').length;
    const emNeg = scoped.filter((c) => c.crm_status === 'Em negociação').length;
    const arq = scoped.filter((c) => c.crm_status === 'Arquivado').length;
    const fechado = scoped.filter((c) => c.crm_status === 'Negócio fechado').length;
    return { total, novo, emNeg, arq, fechado };
  }, [scoped]);

  /* Helpers de agregação */
  const groupBy = <T,>(rows: T[], keyFn: (r: T) => string | null): { name: string; value: number }[] => {
    const bucket = new Map<string, number>();
    rows.forEach((r) => {
      const k = keyFn(r) || 'Não informado';
      bucket.set(k, (bucket.get(k) || 0) + 1);
    });
    return [...bucket.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  const bySource = useMemo(() => groupBy(scoped, (c) => c.crm_source).slice(0, 12), [scoped]);
  const byChannel = useMemo(() => {
    // crm_source costuma ser "Internet/Telefone/Showroom" no C2S; fall-back pra channel_source
    return groupBy(scoped, (c) => c.crm_source || c.channel_source).slice(0, 10);
  }, [scoped]);

  const byBroker = useMemo(() => {
    return groupBy(scoped, (c) => c.assigned_broker_id ? (brokerById.get(c.assigned_broker_id) || '—') : '—').slice(0, 15);
  }, [scoped, brokerById]);

  const archivedByChannel = useMemo(() => {
    return groupBy(scoped.filter((c) => c.crm_status === 'Arquivado'), (c) => c.crm_source || c.channel_source).slice(0, 8);
  }, [scoped]);

  const closedByBroker = useMemo(() => {
    return groupBy(scoped.filter((c) => c.crm_status === 'Negócio fechado'), (c) => c.assigned_broker_id ? (brokerById.get(c.assigned_broker_id) || '—') : '—').slice(0, 15);
  }, [scoped, brokerById]);

  const closedBySource = useMemo(() => {
    return groupBy(scoped.filter((c) => c.crm_status === 'Negócio fechado'), (c) => c.crm_source).slice(0, 10);
  }, [scoped]);

  const pipelineStatus = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((c) => {
      const k = c.crm_status || 'Sem status';
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [scoped]);

  const dailyCreated = useMemo(() => {
    const days = parseInt(globalPeriod, 10);
    const map = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    scoped.forEach((c) => {
      if (!c.created_at) return;
      const key = new Date(c.created_at).toISOString().slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([k, v]) => ({
      date: k.slice(5),
      leads: v,
    }));
  }, [scoped, globalPeriod]);

  const conversionByBroker = useMemo(() => {
    const total = new Map<string, number>();
    const won = new Map<string, number>();
    scoped.forEach((c) => {
      const name = c.assigned_broker_id ? (brokerById.get(c.assigned_broker_id) || '—') : '—';
      total.set(name, (total.get(name) || 0) + 1);
      if (c.crm_status === 'Negócio fechado') won.set(name, (won.get(name) || 0) + 1);
    });
    return [...total.entries()]
      .map(([name, t]) => ({
        name,
        taxa: t > 0 ? Math.round(((won.get(name) || 0) / t) * 1000) / 10 : 0,
        leads: t,
      }))
      .filter((r) => r.leads >= 5) // só quem tem volume mínimo
      .sort((a, b) => b.taxa - a.taxa)
      .slice(0, 12);
  }, [scoped, brokerById]);

  if (profile?.role && !['admin', 'operator', 'super_admin'].includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Header + filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Dashboard C2S</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Análise dos leads espelhados do Construtor de Vendas.
          </p>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Período</label>
            <Select value={globalPeriod} onValueChange={(v) => setGlobalPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Tipo de negociação</label>
            <Select value={dept} onValueChange={(v) => setDept(v as DeptKey)}>
              <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard icon={<Inbox className="h-4 w-4" />} label="Total" value={kpis.total} color="text-foreground" />
            <KpiCard icon={<Zap className="h-4 w-4" />} label="Novos" value={kpis.novo} color="text-blue-600" />
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Em negociação" value={kpis.emNeg} color="text-amber-600" />
            <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Fechados" value={kpis.fechado} color="text-emerald-600" />
            <KpiCard icon={<Archive className="h-4 w-4" />} label="Arquivados" value={kpis.arq} color="text-muted-foreground" />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Leads recebidos por fonte" subtitle="Portal/origem que gerou o lead" icon={<Inbox className="h-4 w-4 text-muted-foreground" />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySource}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={55} interval={0} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Leads" fill="hsl(207, 65%, 44%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Leads recebidos por vendedor" subtitle="Distribuição por corretor responsável" icon={<Users className="h-4 w-4 text-muted-foreground" />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBroker} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={120} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Leads" fill="hsl(142, 70%, 42%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Leads arquivados por canal" subtitle={`${kpis.arq.toLocaleString('pt-BR')} arquivados no período`} icon={<Archive className="h-4 w-4 text-muted-foreground" />}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={archivedByChannel}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    labelLine={false}
                    label={({ percent, name }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                  >
                    {archivedByChannel.map((_, i) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Status atual do pipeline" subtitle="Snapshot da distribuição atual" icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipelineStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    labelLine={false}
                    label={({ percent, name }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                  >
                    {pipelineStatus.map((s, i) => <Cell key={i} fill={STATUS_COLORS[s.name] || PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Evolução diária de leads recebidos" subtitle={`Entradas por dia (${globalPeriod} dias)`} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyCreated}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={10} interval={Math.max(0, Math.floor(dailyCreated.length / 10))} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="leads" stroke="hsl(207, 65%, 44%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Leads com negócio fechado por vendedor" subtitle={`${kpis.fechado.toLocaleString('pt-BR')} fechados no período`} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closedByBroker}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={55} interval={0} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Fechados" fill="hsl(142, 70%, 42%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Leads com negócio fechado por fonte" subtitle="Origem dos leads que viraram negócio" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={closedBySource}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={55} interval={0} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Fechados" fill="hsl(280, 55%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Taxa de conversão por vendedor" subtitle="% de leads que viraram negócio (mín. 5 leads)" icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionByBroker} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={120} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, _n: string, entry: any) => [`${v}% (${entry.payload.leads} leads)`, 'Conversão']}
                  />
                  <Bar dataKey="taxa" fill="hsl(142, 70%, 42%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── KpiCard ─── */

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string }> = ({ icon, label, value, color }) => (
  <div className="rounded-xl bg-card p-4 border border-border">
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
      <span className={color}>{icon}</span>
      {label}
    </div>
    <p className={cn('mt-1.5 text-2xl font-bold font-display', color)}>{value.toLocaleString('pt-BR')}</p>
  </div>
);

export default C2SAnalyticsPage;
