import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Loader2, ChevronDown } from 'lucide-react';
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

const DEPT_LABELS: Record<string, string> = {
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Admin',
};

const PIE_COLORS = [
  'hsl(207, 65%, 44%)',  // accent blue
  'hsl(152, 60%, 42%)',  // success green
  'hsl(38, 92%, 50%)',   // warning amber
  'hsl(280, 55%, 50%)',  // purple
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
  color: string;
}

const FunnelCard: React.FC<FunnelCardProps> = ({ title, value, subtitle, percentage, color }) => (
  <Card>
    <p className="text-sm font-medium text-muted-foreground">{title}</p>
    <p className="mt-2 text-3xl font-bold font-display text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    <div className="mt-3 relative">
      <Progress value={percentage} className="h-2" />
      <span className="absolute right-0 -top-4 text-[10px] font-semibold text-muted-foreground">
        {percentage.toFixed(1)}%
      </span>
    </div>
  </Card>
);

/* ─── Main ─── */

const DashboardPage: React.FC = () => {
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
  const [deptData, setDeptData] = useState<{ name: string; value: number }[]>([]);
  const [hourData, setHourData] = useState<{ hour: string; count: number }[]>([]);
  const [dowData, setDowData] = useState<{ day: string; count: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; forwarded: number; notForwarded: number }[]>([]);
  const [offHoursPct, setOffHoursPct] = useState(0);

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

      // ── Row 2a: Dept pie ──
      const { data: convs } = await supabase
        .from('conversations')
        .select('department_code')
        .eq('tenant_id', tenantId)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const deptMap: Record<string, number> = {};
      (convs ?? []).forEach((c) => {
        const key = c.department_code || 'sem_dept';
        deptMap[key] = (deptMap[key] || 0) + 1;
      });
      setDeptData(
        Object.entries(deptMap).map(([k, v]) => ({
          name: DEPT_LABELS[k] || 'Outros',
          value: v,
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
      setDowData(DOW_LABELS.map((label, i) => ({ day: label, count: dowBuckets[i] })));

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

        // rough approximation: forwarded ratio from current state
        const fwdRatio = (total ?? 0) > 0 ? (fwd ?? 0) / (total ?? 1) : 0;
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

  const pctAttended = totalConv > 0 ? (aiAttended / totalConv) * 100 : 0;
  const pctForwarded = totalConv > 0 ? (forwarded / totalConv) * 100 : 0;

  if (loading && totalConv === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
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
          color="accent"
        />
        <FunnelCard
          title="Atendidos pela Aimee"
          value={aiAttended}
          subtitle="foram atendidos pela Aimee"
          percentage={pctAttended}
          color="success"
        />
        <FunnelCard
          title="Encaminhados"
          value={forwarded}
          subtitle="enviados ao CRM / corretor"
          percentage={pctForwarded}
          color="warning"
        />
      </div>

      {/* Row 2 — Pie + Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie chart: leads por canal */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Leads por canal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={11}
                >
                  {deptData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Stacked bar: status por departamento */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Status por departamento</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData.map((d) => ({
                name: d.name,
                qualificado: Math.round(d.value * pctForwarded / 100),
                atendimento: Math.round(d.value * pctAttended / 100) - Math.round(d.value * pctForwarded / 100),
                novo: d.value - Math.round(d.value * pctAttended / 100),
              }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="novo" stackId="a" fill="hsl(207, 65%, 44%)" radius={[0, 0, 0, 0]} name="Novo" />
                <Bar dataKey="atendimento" stackId="a" fill="hsl(38, 92%, 50%)" name="Em atendimento" />
                <Bar dataKey="qualificado" stackId="a" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} name="Qualificado" />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3 — Hourly area chart */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm font-semibold text-foreground">Leads por horário</h3>
          <span className="text-xs font-medium text-accent">
            {offHoursPct}% atendidos fora do horário comercial
          </span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Day of week */}
        <Card>
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Leads por dia da semana</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  name="Leads"
                >
                  {dowData.map((entry, i) => {
                    const maxVal = Math.max(...dowData.map((d) => d.count));
                    return (
                      <Cell
                        key={i}
                        fill={entry.count === maxVal && maxVal > 0
                          ? 'hsl(207, 65%, 44%)'
                          : 'hsl(207, 65%, 44% / 0.4)'}
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
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Leads nos últimos 6 meses</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="notForwarded" stackId="a" fill="hsl(38, 92%, 50%)" name="Não encaminhado" />
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
