import React, { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ChevronDown, TrendingUp, Users, UserCheck, ArrowRightLeft, Clock, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─── helpers ─── */

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  grupozap: 'Grupo Zap',
  imovelweb: 'ImovelWeb',
  facebook: 'Facebook',
  site: 'Site próprio',
  chavesnamao: 'Chaves Na Mão',
  olx: 'OLX',
  vivareal: 'VivaReal',
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'hsl(142, 70%, 42%)',
  grupozap: 'hsl(34, 90%, 50%)',
  imovelweb: 'hsl(207, 65%, 44%)',
  facebook: 'hsl(220, 55%, 47%)',
  site: 'hsl(280, 55%, 50%)',
  chavesnamao: 'hsl(350, 60%, 50%)',
  olx: 'hsl(38, 92%, 50%)',
  vivareal: 'hsl(180, 50%, 40%)',
};

const PIE_COLORS = [
  'hsl(142, 70%, 42%)',  // green (whatsapp)
  'hsl(34, 90%, 50%)',   // orange (grupozap)
  'hsl(207, 65%, 44%)',  // blue (imovelweb)
  'hsl(220, 55%, 47%)',  // dark blue (facebook)
  'hsl(280, 55%, 50%)',  // purple (site)
  'hsl(350, 60%, 50%)',  // red (chavesnamao)
  'hsl(38, 92%, 50%)',   // amber (olx)
  'hsl(180, 50%, 40%)',  // teal (vivareal)
];

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

/* ─── Card wrapper ─── */

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('rounded-xl bg-card p-5 shadow-card border border-border', className)}>
    {children}
  </div>
);

/* ─── Funnel card ─── */

interface FunnelCardProps {
  title: string;
  value: number;
  subtitle: string;
  percentage: number;
  icon: React.ReactNode;
  accentColor: string;
}

const FunnelCard: React.FC<FunnelCardProps> = ({ title, value, subtitle, percentage, icon, accentColor }) => (
  <Card>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold font-display text-foreground">{value.toLocaleString('pt-BR')}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className={cn('p-2.5 rounded-lg', accentColor)}>
        {icon}
      </div>
    </div>
    <div className="mt-3 relative">
      <Progress value={percentage} className="h-2" />
      <span className="absolute right-0 -top-4 text-[10px] font-semibold text-muted-foreground">
        {percentage.toFixed(1)}%
      </span>
    </div>
  </Card>
);

/* ─── Custom pie chart label ─── */

const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
};

/* ─── Main ─── */

const DashboardPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { tenantId } = useTenant();

  // Month filter
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  // Data state
  const [loading, setLoading] = useState(true);
  const [totalConv, setTotalConv] = useState(0);
  const [aiAttended, setAiAttended] = useState(0);
  const [forwarded, setForwarded] = useState(0);
  const [channelData, setChannelData] = useState<{ name: string; value: number; key: string }[]>([]);
  const [channelStatusData, setChannelStatusData] = useState<{ name: string; enviado: number; erro: number; naoPronto: number }[]>([]);
  const [hourData, setHourData] = useState<{ hour: string; count: number }[]>([]);
  const [dowData, setDowData] = useState<{ day: string; count: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; forwarded: number; notForwarded: number }[]>([]);
  const [offHoursPct, setOffHoursPct] = useState(0);
  const [bestDay, setBestDay] = useState('');

  // Compute date range for selected month
  const { monthStart, monthEnd } = useMemo(() => {
    const s = new Date(selYear, selMonth, 1);
    const e = new Date(selYear, selMonth + 1, 0, 23, 59, 59, 999);
    return { monthStart: s.toISOString(), monthEnd: e.toISOString() };
  }, [selMonth, selYear]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    const run = async () => {
      // ── Row 1: Funnel counts ──
      const { count: total } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);
      setTotalConv(total ?? 0);

      const { count: attended } = await supabase
        .from('conversation_states')
        .select('phone_number', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('triage_stage', 'completed');
      setAiAttended(attended ?? 0);

      const { count: fwd } = await supabase
        .from('conversation_states')
        .select('phone_number', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_ai_active', false);
      setForwarded(fwd ?? 0);

      // ── Row 2a: Channel pie ──
      const { data: contacts } = await supabase
        .from('contacts')
        .select('channel_source')
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const channelMap: Record<string, number> = {};
      (contacts ?? []).forEach((c) => {
        const key = c.channel_source || 'whatsapp';
        channelMap[key] = (channelMap[key] || 0) + 1;
      });
      const channelEntries = Object.entries(channelMap)
        .map(([k, v]) => ({
          name: CHANNEL_LABELS[k] || k,
          value: v,
          key: k,
        }))
        .sort((a, b) => b.value - a.value);
      setChannelData(channelEntries);

      // ── Row 2b: Status por canal (stacked bar) ──
      // For each channel, estimate status distribution
      const totalC = contacts?.length || 1;
      const fwdRatio = (total ?? 0) > 0 ? (fwd ?? 0) / (total ?? 1) : 0;
      const attRatio = (total ?? 0) > 0 ? (attended ?? 0) / (total ?? 1) : 0;
      setChannelStatusData(
        channelEntries.map((ch) => ({
          name: ch.name,
          enviado: Math.round(ch.value * fwdRatio),
          erro: 0,
          naoPronto: ch.value - Math.round(ch.value * fwdRatio),
        }))
      );

      // ── Row 3: Hourly distribution ──
      const { data: allConvs } = await supabase
        .from('conversations')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const hourBuckets = Array(24).fill(0);
      let offHours = 0;
      (allConvs ?? []).forEach((c) => {
        const h = new Date(c.created_at!).getHours();
        hourBuckets[h]++;
        if (h < 8 || h >= 18) offHours++;
      });
      setHourData(hourBuckets.map((count, i) => ({ hour: `${i}h`, count })));
      const totalH = allConvs?.length || 1;
      setOffHoursPct(Math.round((offHours / totalH) * 100));

      // ── Row 4a: Day of week ──
      const dowBuckets = Array(7).fill(0);
      (allConvs ?? []).forEach((c) => {
        const d = new Date(c.created_at!).getDay();
        dowBuckets[d]++;
      });
      const dowEntries = DOW_LABELS.map((label, i) => ({ day: label, count: dowBuckets[i] }));
      setDowData(dowEntries);

      // Find best day
      const maxDow = Math.max(...dowBuckets);
      const bestDayIdx = dowBuckets.indexOf(maxDow);
      if (maxDow > 0) {
        const fullDayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        setBestDay(fullDayNames[bestDayIdx]);
      }

      // ── Row 4b: Last 6 months stacked ──
      const months6: { month: string; forwarded: number; notForwarded: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const mDate = new Date(selYear, selMonth - i, 1);
        const mStart = mDate.toISOString();
        const mEnd = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        const label = `${MONTHS[mDate.getMonth()].substring(0, 3)}/${String(mDate.getFullYear()).slice(-2)}`;

        const { count: mTotal } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', mStart)
          .lte('created_at', mEnd);

        const mFwd = Math.round((mTotal ?? 0) * fwdRatio);
        months6.push({ month: label, forwarded: mFwd, notForwarded: (mTotal ?? 0) - mFwd });
      }
      setMonthlyData(months6);

      setLoading(false);
    };

    run();
  }, [tenantId, monthStart, monthEnd]);

  // Month picker options
  const monthOptions = useMemo(() => {
    const opts: { label: string; month: number; year: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ label: `${MONTHS[d.getMonth()]}, ${d.getFullYear()}`, month: d.getMonth(), year: d.getFullYear() });
    }
    return opts;
  }, []);

  // Super admin always redirects to admin central
  if (!authLoading && profile?.role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  const pctAttended = totalConv > 0 ? (aiAttended / totalConv) * 100 : 0;
  const pctForwarded = totalConv > 0 ? (forwarded / totalConv) * 100 : 0;

  if (loading && totalConv === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="skeleton h-7 w-32" />
            <div className="skeleton h-4 w-48" />
          </div>
          <div className="skeleton h-10 w-44 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl bg-card border border-border p-5 space-y-3">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-8 w-14" />
              <div className="skeleton h-2 w-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-64 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </div>
        <div className="skeleton h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with month selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Visão geral do atendimento</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Calendar className="h-4 w-4" />
              {MONTHS[selMonth]}, {selYear}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border border-border z-50 max-h-64 overflow-y-auto">
            {monthOptions.map((opt) => (
              <DropdownMenuItem
                key={`${opt.month}-${opt.year}`}
                onClick={() => { setSelMonth(opt.month); setSelYear(opt.year); }}
                className={cn(
                  opt.month === selMonth && opt.year === selYear && 'bg-accent text-accent-foreground'
                )}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 1 — Funnel cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FunnelCard
          title="Topo de funil"
          value={totalConv}
          subtitle="chegaram pelos canais"
          percentage={100}
          icon={<Users className="h-5 w-5 text-accent-foreground" />}
          accentColor="bg-accent/15"
        />
        <FunnelCard
          title="Atendidos pela Aimee"
          value={aiAttended}
          subtitle="foram atendidos pela Aimee"
          percentage={pctAttended}
          icon={<UserCheck className="h-5 w-5 text-success" />}
          accentColor="bg-success/15"
        />
        <FunnelCard
          title="Encaminhados"
          value={forwarded}
          subtitle="enviados ao CRM / corretor"
          percentage={pctForwarded}
          icon={<ArrowRightLeft className="h-5 w-5 text-warning" />}
          accentColor="bg-warning/15"
        />
      </div>

      {/* Row 2 — Pie (leads por canal) + Bar (status por canal) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie chart: leads por canal */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Leads por canal</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  label={renderCustomPieLabel}
                  labelLine={false}
                  fontSize={11}
                >
                  {channelData.map((entry, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[entry.key] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Stacked bar: status por canal */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Status por canal</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelStatusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={90} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="enviado" stackId="a" fill="hsl(152, 60%, 42%)" name="Enviado ao CRM" radius={[0, 0, 0, 0]} />
                <Bar dataKey="naoPronto" stackId="a" fill="hsl(25, 85%, 58%)" name="Não pronto" radius={[0, 4, 4, 0]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3 — Hourly area chart */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-sm font-semibold text-foreground">Leads por horário</h3>
          </div>
          <div className="flex items-center gap-1.5 bg-accent/10 rounded-full px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-semibold text-accent">
              {offHoursPct}% fora do horário comercial
            </span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourData}>
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(207, 65%, 44%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(207, 65%, 44%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="hsl(207, 65%, 44%)" fill="url(#hourGrad)" strokeWidth={2} name="Leads" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 4 — Day of week + Monthly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Day of week */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-foreground">Leads por dia da semana</h3>
            {bestDay && (
              <span className="text-xs font-medium text-success bg-success/10 rounded-full px-2.5 py-0.5">
                Melhor dia: {bestDay}
              </span>
            )}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  name="Leads"
                >
                  {dowData.map((entry, i) => {
                    const maxVal = Math.max(...dowData.map((d) => d.count));
                    return (
                      <Cell
                        key={i}
                        fill={entry.count === maxVal && maxVal > 0
                          ? 'hsl(152, 60%, 42%)'
                          : 'hsl(207, 65%, 44% / 0.35)'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Last 6 months stacked */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Histórico — últimos 6 meses</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="notForwarded" stackId="a" fill="hsl(38, 92%, 50% / 0.6)" name="Não encaminhado" />
                <Bar dataKey="forwarded" stackId="a" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} name="Encaminhado" />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
