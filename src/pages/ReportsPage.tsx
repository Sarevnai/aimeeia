import React, { useEffect, useState, useMemo } from 'react';
import { format, eachDayOfInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, MessageSquare, UserCheck, Percent, ArrowRightCircle } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const PIE_COLORS = [
  'hsl(207, 65%, 44%)',
  'hsl(152, 60%, 42%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(270, 50%, 50%)',
  'hsl(180, 50%, 40%)',
  'hsl(330, 60%, 50%)',
  'hsl(60, 70%, 45%)',
];

interface ConversationRow {
  id: string;
  phone_number: string;
  department_code: string | null;
  created_at: string | null;
  stage_id: string | null;
  contact: { name: string | null } | null;
  stage: { name: string | null } | null;
}

const ReportsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();

  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [qualifiedLeads, setQualifiedLeads] = useState(0);
  const [transferredCount, setTransferredCount] = useState(0);
  const [leadsByNeighborhood, setLeadsByNeighborhood] = useState<{ name: string; value: number }[]>([]);
  const [qualScores, setQualScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      setLoading(true);
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      // Conversations
      let convQ = supabase
        .from('conversations')
        .select('id, phone_number, department_code, created_at, stage_id, contact:contacts(name), stage:conversation_stages(name)')
        .eq('tenant_id', tenantId)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });
      if (department !== 'all') convQ = convQ.eq('department_code', department);
      const { data: convData } = await convQ;
      setConversations((convData as unknown as ConversationRow[]) ?? []);

      // Qualified leads
      const { count: qualCount } = await supabase
        .from('lead_qualification')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gt('qualification_score', 0)
        .gte('started_at', from)
        .lte('started_at', to);
      setQualifiedLeads(qualCount ?? 0);

      // Qual scores by phone
      const { data: qualData } = await supabase
        .from('lead_qualification')
        .select('phone_number, qualification_score')
        .eq('tenant_id', tenantId)
        .gte('started_at', from)
        .lte('started_at', to);
      const scores: Record<string, number> = {};
      (qualData ?? []).forEach(q => { scores[q.phone_number] = q.qualification_score ?? 0; });
      setQualScores(scores);

      // Transferred to C2S (stages named 'Encaminhado C2S')
      if (convData) {
        const transferred = convData.filter((c: any) => c.stage?.name === 'Encaminhado C2S');
        setTransferredCount(transferred.length);
      }

      // Neighborhood distribution
      const { data: neighData } = await supabase
        .from('lead_qualification')
        .select('detected_neighborhood')
        .eq('tenant_id', tenantId)
        .not('detected_neighborhood', 'is', null)
        .gte('started_at', from)
        .lte('started_at', to);
      const neighMap: Record<string, number> = {};
      (neighData ?? []).forEach(n => {
        const key = n.detected_neighborhood || 'Não informado';
        neighMap[key] = (neighMap[key] || 0) + 1;
      });
      setLeadsByNeighborhood(
        Object.entries(neighMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      setLoading(false);
    };
    fetch();
  }, [tenantId, department, dateFrom, dateTo]);

  // Chart data: conversations per day
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateFrom, end: dateTo });
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const count = conversations.filter(c => c.created_at?.startsWith(dayStr)).length;
      return { day: format(day, 'dd/MM', { locale: ptBR }), count };
    });
  }, [conversations, dateFrom, dateTo]);

  // Chart data: by department
  const deptData = useMemo(() => {
    const map: Record<string, number> = {};
    conversations.forEach(c => {
      const dept = c.department_code || 'Sem depto';
      map[dept] = (map[dept] || 0) + 1;
    });
    const labels: Record<string, string> = { locacao: 'Locação', vendas: 'Vendas', administrativo: 'Administrativo' };
    return Object.entries(map).map(([key, value]) => ({ name: labels[key] || key, value }));
  }, [conversations]);

  const totalConversations = conversations.length;
  const qualRate = totalConversations > 0 ? ((qualifiedLeads / totalConversations) * 100).toFixed(1) : '0';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Relatórios</h2>
          <p className="text-sm text-muted-foreground">Análise de desempenho do atendimento</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker label="De" date={dateFrom} onSelect={setDateFrom} />
          <DatePicker label="Até" date={dateTo} onSelect={setDateTo} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Conversas" value={totalConversations} icon={<MessageSquare className="h-5 w-5" />} />
        <MetricCard title="Leads Qualificados" value={qualifiedLeads} icon={<UserCheck className="h-5 w-5" />} />
        <MetricCard title="Taxa Qualificação" value={`${qualRate}%`} icon={<Percent className="h-5 w-5" />} />
        <MetricCard title="Transferidos C2S" value={transferredCount} icon={<ArrowRightCircle className="h-5 w-5" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Line chart */}
        <div className="rounded-xl bg-card p-5 shadow-card border border-border">
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Conversas por dia</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="count" stroke="hsl(207, 65%, 44%)" strokeWidth={2} dot={{ r: 3 }} name="Conversas" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar chart */}
        <div className="rounded-xl bg-card p-5 shadow-card border border-border">
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Conversas por departamento</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" fill="hsl(207, 65%, 44%)" radius={[4, 4, 0, 0]} name="Conversas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart */}
        <div className="rounded-xl bg-card p-5 shadow-card border border-border lg:col-span-2">
          <h3 className="font-display text-sm font-semibold text-foreground mb-4">Distribuição por região</h3>
          <div className="h-72">
            {leadsByNeighborhood.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center justify-center h-full">Sem dados de região no período</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leadsByNeighborhood} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {leadsByNeighborhood.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card shadow-card border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="font-display text-sm font-semibold text-foreground">Conversas detalhadas</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {loading ? 'Carregando...' : 'Nenhuma conversa no período'}
                </TableCell>
              </TableRow>
            ) : (
              conversations.slice(0, 100).map((conv) => {
                const deptLabels: Record<string, string> = { locacao: 'Locação', vendas: 'Vendas', administrativo: 'Administrativo' };
                return (
                  <TableRow key={conv.id}>
                    <TableCell className="font-medium">{(conv.contact as any)?.name || conv.phone_number}</TableCell>
                    <TableCell>
                      {conv.department_code ? (
                        <Badge variant="secondary">{deptLabels[conv.department_code] || conv.department_code}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{(conv.stage as any)?.name || '—'}</TableCell>
                    <TableCell>{qualScores[conv.phone_number] ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {conv.created_at ? format(new Date(conv.created_at), 'dd/MM/yy HH:mm') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// Sub-components

const MetricCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="rounded-xl bg-card p-5 shadow-card border border-border">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold font-display text-foreground">{value}</p>
      </div>
      <div className="rounded-lg bg-accent/10 p-2.5 text-accent">{icon}</div>
    </div>
  </div>
);

const DatePicker: React.FC<{ label: string; date: Date; onSelect: (d: Date) => void }> = ({ label, date, onSelect }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className={cn('justify-start text-left font-normal gap-2 text-sm')}>
        <CalendarIcon className="h-4 w-4" />
        {label}: {format(date, 'dd/MM/yy')}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="end">
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => d && onSelect(d)}
        initialFocus
        className={cn('p-3 pointer-events-auto')}
      />
    </PopoverContent>
  </Popover>
);

export default ReportsPage;
