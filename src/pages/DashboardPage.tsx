import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { MessageSquare, UserCheck, Clock, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, subtitle }) => (
  <div className="rounded-xl bg-card p-5 shadow-card border border-border animate-fade-in">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold font-display text-foreground">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="rounded-lg bg-accent/10 p-2.5 text-accent">{icon}</div>
    </div>
  </div>
);

const DashboardPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();
  const [activeConversations, setActiveConversations] = useState(0);
  const [leadsToday, setLeadsToday] = useState(0);
  const [chartData, setChartData] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchMetrics = async () => {
      // Active conversations
      let convQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      if (department !== 'all') convQuery = convQuery.eq('department_code', department);
      const { count: convCount } = await convQuery;
      setActiveConversations(convCount ?? 0);

      // Leads qualified today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let leadQuery = supabase
        .from('lead_qualification')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('started_at', todayStart.toISOString());
      const { count: leadCount } = await leadQuery;
      setLeadsToday(leadCount ?? 0);

      // Chart: conversations per day last 7 days
      const days: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        let q = supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());
        if (department !== 'all') q = q.eq('department_code', department);
        const { count } = await q;
        
        days.push({
          day: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
          count: count ?? 0,
        });
      }
      setChartData(days);
    };

    fetchMetrics();
  }, [tenantId, department]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral do atendimento</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Conversas Ativas"
          value={activeConversations}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <MetricCard
          title="Leads Hoje"
          value={leadsToday}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <MetricCard
          title="Tempo Médio"
          value="—"
          subtitle="Resposta"
          icon={<Clock className="h-5 w-5" />}
        />
        <MetricCard
          title="Conversão"
          value="—"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-xl bg-card p-5 shadow-card border border-border animate-fade-in">
        <h3 className="font-display text-sm font-semibold text-foreground mb-4">Conversas — últimos 7 dias</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
              <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" fill="hsl(207, 65%, 44%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
