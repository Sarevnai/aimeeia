import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitBranch, MessageSquare, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DepartmentButton {
  id: string;
  title: string;
  department: string;
}

interface TriageConfig {
  greeting_message?: string;
  name_confirmation_template?: string;
  vip_intro?: string;
  department_prompt?: string;
  department_buttons?: DepartmentButton[];
  department_welcome?: Record<string, string>;
}

interface AgentConfig {
  tenant_id: string;
  agent_name: string;
  tone: string | null;
  triage_config: TriageConfig | null;
}

interface TriageStats {
  total_conversations: number;
  triage_completed: number;
  avg_triage_messages: number;
}

export default function LabTriagePage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [stats, setStats] = useState<TriageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    (async () => {
      // Load agent config with triage
      const { data: agentData } = await supabase
        .from('ai_agent_config')
        .select('tenant_id, agent_name, tone, triage_config')
        .not('triage_config', 'is', null)
        .limit(1)
        .maybeSingle();

      if (agentData) {
        setConfig(agentData as AgentConfig);

        // Load tenant name
        const { data: tenant } = await supabase
          .from('tenants')
          .select('company_name')
          .eq('id', agentData.tenant_id)
          .single();
        if (tenant) setTenantName(tenant.company_name);

        // Load basic triage stats
        const { count: totalConvs } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', agentData.tenant_id)
          .neq('source', 'simulation');

        const { count: triageCompleted } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', agentData.tenant_id)
          .neq('source', 'simulation')
          .not('department_code', 'is', null);

        setStats({
          total_conversations: totalConvs || 0,
          triage_completed: triageCompleted || 0,
          avg_triage_messages: 0,
        });
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!config || !config.triage_config) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Configuracao de Triage</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum tenant com triage_config encontrado. Configure via ai_agent_config.
          </CardContent>
        </Card>
      </div>
    );
  }

  const tc = config.triage_config;
  const triageRate = stats && stats.total_conversations > 0
    ? Math.round((stats.triage_completed / stats.total_conversations) * 100)
    : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <GitBranch className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Configuracao de Triage</h1>
        <Badge variant="outline" className="text-xs">{tenantName}</Badge>
        <Badge variant="secondary" className="text-xs">Agente: {config.agent_name}</Badge>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{stats.total_conversations}</p>
              <p className="text-xs text-muted-foreground">Conversas Totais</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{stats.triage_completed}</p>
              <p className="text-xs text-muted-foreground">Triage Concluida</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{triageRate}%</p>
              <p className="text-xs text-muted-foreground">Taxa de Conclusao</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Triage Flow Preview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Fluxo de Triage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Greeting */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-blue-100 text-blue-700">1</Badge>
              <span className="text-xs font-medium text-muted-foreground">Saudacao</span>
            </div>
            <div className="ml-6 p-2 bg-muted/30 rounded text-xs whitespace-pre-line">
              {tc.greeting_message || '(nao configurado)'}
            </div>
          </div>

          {/* Step 2: Name Confirmation */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-blue-100 text-blue-700">2</Badge>
              <span className="text-xs font-medium text-muted-foreground">Confirmacao de Nome</span>
            </div>
            <div className="ml-6 p-2 bg-muted/30 rounded text-xs">
              {tc.name_confirmation_template || '(nao configurado)'}
            </div>
          </div>

          {/* Step 3: VIP Intro (if exists) */}
          {tc.vip_intro && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="text-[10px] bg-purple-100 text-purple-700">VIP</Badge>
                <span className="text-xs font-medium text-muted-foreground">Intro VIP</span>
              </div>
              <div className="ml-6 p-2 bg-muted/30 rounded text-xs whitespace-pre-line">
                {tc.vip_intro}
              </div>
            </div>
          )}

          {/* Step 3/4: Department Selection */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-blue-100 text-blue-700">3</Badge>
              <span className="text-xs font-medium text-muted-foreground">Selecao de Departamento</span>
            </div>
            <div className="ml-6 p-2 bg-muted/30 rounded text-xs">
              <p className="mb-2">{tc.department_prompt || '(nao configurado)'}</p>
              <div className="flex flex-wrap gap-2">
                {(tc.department_buttons || []).map(btn => (
                  <Badge key={btn.id} variant="outline" className="text-xs">
                    {btn.title} <ArrowRight className="h-3 w-3 ml-1" /> {btn.department}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Step 4: Department Welcomes */}
          {tc.department_welcome && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="text-[10px] bg-blue-100 text-blue-700">4</Badge>
                <span className="text-xs font-medium text-muted-foreground">Mensagens de Boas-vindas por Departamento</span>
              </div>
              <div className="ml-6 space-y-2">
                {Object.entries(tc.department_welcome).map(([dept, msg]) => (
                  <div key={dept} className="p-2 bg-muted/30 rounded">
                    <Badge variant="secondary" className="text-[10px] mb-1">{dept}</Badge>
                    <p className="text-xs whitespace-pre-line">{msg}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
