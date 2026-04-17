import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare, Users, ArrowRightCircle, Clock, Phone,
  Bot, UserCheck, TrendingUp, ChevronRight, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConvItem {
  id: string;
  phone_number: string;
  department_code: string | null;
  last_message_at: string | null;
  status: string | null;
  contact_name: string | null;
  is_ai_active: boolean | null;
}

const OperatorDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const { tenantId, tenant } = useTenant();
  const navigate = useNavigate();

  const [myBrokerId, setMyBrokerId] = useState<string | null>(null);
  const [myLeadsCount, setMyLeadsCount] = useState(0);
  const [myLeadsToday, setMyLeadsToday] = useState(0);
  const [activeConvs, setActiveConvs] = useState<ConvItem[]>([]);
  const [handoffCount, setHandoffCount] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Resolve broker ID
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('brokers')
      .select('id')
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setMyBrokerId(data?.id || null));
  }, [profile?.id]);

  // Fetch data
  useEffect(() => {
    if (!tenantId || !user?.id) return;
    const fetchAll = async () => {
      setLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      // My leads total (this month)
      if (myBrokerId) {
        const { count } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('assigned_broker_id', myBrokerId);
        setMyLeadsCount(count || 0);

        // My leads today
        const { count: todayCount } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('assigned_broker_id', myBrokerId)
          .gte('created_at', todayISO);
        setMyLeadsToday(todayCount || 0);
      }

      // Active conversations (mine or unassigned)
      let convQuery = supabase
        .from('conversations')
        .select('id, phone_number, department_code, last_message_at, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('last_message_at', { ascending: false })
        .limit(20);

      if (myBrokerId) {
        convQuery = convQuery.eq('assigned_broker_id', myBrokerId);
      }

      const { data: convData } = await convQuery;
      const convs = convData || [];

      // Enrich with contact name and AI state
      const enriched: ConvItem[] = [];
      for (const conv of convs.slice(0, 10)) {
        const [contactRes, stateRes] = await Promise.all([
          supabase.from('contacts').select('name').eq('phone', conv.phone_number).eq('tenant_id', tenantId).maybeSingle(),
          supabase.from('conversation_states').select('is_ai_active').eq('phone_number', conv.phone_number).eq('tenant_id', tenantId).maybeSingle(),
        ]);
        enriched.push({
          ...conv,
          contact_name: contactRes.data?.name || null,
          is_ai_active: stateRes.data?.is_ai_active ?? true,
        });
      }
      setActiveConvs(enriched);

      // Handoffs this month (conversations where I took over)
      const { count: handoffs } = await supabase
        .from('conversation_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('actor_id', user.id)
        .eq('event_type', 'operator_joined')
        .gte('created_at', monthStart);
      setHandoffCount(handoffs || 0);

      // Total messages I sent this month
      const { count: msgs } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('sender_id', user.id)
        .eq('sender_type', 'operator')
        .gte('created_at', monthStart);
      setTotalMessages(msgs || 0);

      setLoading(false);
    };
    fetchAll();
  }, [tenantId, user?.id, myBrokerId]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          {greeting}, {profile?.full_name?.split(' ')[0] || 'Corretor'}!
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {tenant?.company_name} — Aqui está o resumo do seu atendimento
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Meus Leads"
          value={myLeadsCount}
          subtitle={`${myLeadsToday} hoje`}
          icon={<Users className="h-5 w-5" />}
          color="blue"
        />
        <KPICard
          title="Conversas Ativas"
          value={activeConvs.length}
          subtitle={`${activeConvs.filter(c => !c.is_ai_active).length} comigo`}
          icon={<MessageSquare className="h-5 w-5" />}
          color="green"
        />
        <KPICard
          title="Takeovers (mês)"
          value={handoffCount}
          icon={<UserCheck className="h-5 w-5" />}
          color="amber"
        />
        <KPICard
          title="Msgs enviadas (mês)"
          value={totalMessages}
          icon={<ArrowRightCircle className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* Active Conversations */}
      <div className="rounded-xl bg-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">Minhas Conversas Ativas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Clique pra abrir o chat</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/inbox')} className="text-xs">
            Ver todas <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        {activeConvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma conversa ativa no momento</p>
            <p className="text-xs mt-1">Novos leads aparecerão aqui automaticamente</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/5 transition-colors"
              >
                {/* Status dot */}
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-accent">
                      {(conv.contact_name?.[0] || conv.phone_number[0] || '?').toUpperCase()}
                    </span>
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
                    conv.is_ai_active ? 'bg-emerald-500' : 'bg-amber-500'
                  )} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {conv.contact_name || conv.phone_number}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                      {conv.is_ai_active ? (
                        <><Bot className="h-2.5 w-2.5 mr-0.5" /> IA</>
                      ) : (
                        <><UserCheck className="h-2.5 w-2.5 mr-0.5" /> Você</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{conv.phone_number}</span>
                    {conv.department_code && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {conv.department_code === 'vendas' ? 'Venda' : conv.department_code === 'locacao' ? 'Locação' : conv.department_code}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">
                    {conv.last_message_at ? timeAgo(conv.last_message_at) : ''}
                  </p>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <QuickAction icon={<MessageSquare className="h-5 w-5" />} label="Ir para Inbox" onClick={() => navigate('/inbox')} />
        <QuickAction icon={<Users className="h-5 w-5" />} label="Meus Leads" onClick={() => navigate('/leads')} />
        <QuickAction icon={<Building2 className="h-5 w-5" />} label="Pipeline" onClick={() => navigate('/pipeline')} />
      </div>
    </div>
  );
};

/* ─── Helpers ─── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const KPICard: React.FC<{ title: string; value: number; subtitle?: string; icon: React.ReactNode; color: string }> = ({ title, value, subtitle, icon, color }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="rounded-xl bg-card p-4 shadow-card border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold font-display text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn('rounded-lg p-2', colors[color])}>{icon}</div>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card border border-border hover:bg-accent/5 transition-colors text-left"
  >
    <div className="rounded-lg bg-accent/10 p-2.5 text-accent">{icon}</div>
    <span className="text-sm font-medium text-foreground">{label}</span>
  </button>
);

export default OperatorDashboard;
