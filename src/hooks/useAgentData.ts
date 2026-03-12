import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AgentTypeKey, AGENT_TYPES, AgentConfig, defaultAgentConfig } from '@/lib/agent-constants';

export interface AgentDirective {
  id: string;
  tenant_id: string;
  department: string;
  directive_content: string | null;
  structured_config: any;
  context: string | null;
  is_active: boolean;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentBehaviorConfig {
  id: string;
  tenant_id: string;
  essential_questions: any[];
  functions: Record<string, boolean>;
  reengagement_hours: number;
  require_cpf_for_visit: boolean;
  send_cold_leads: boolean;
  visit_schedule: any;
}

export interface AgentDepartmentConfig {
  id: string;
  tenant_id: string;
  department_code: string;
  agent_name: string | null;
  tone: string | null;
  greeting_message: string | null;
  custom_instructions: string | null;
  is_active: boolean;
  services: any;
  created_at: string | null;
}

export interface AgentError {
  id: string;
  tenant_id: string;
  agent_name: string | null;
  error_type: string | null;
  error_message: string | null;
  context: any;
  conversation_id: string | null;
  phone_number: string | null;
  created_at: string;
}

// Overview data for all 3 agents
export function useAgentOverviewData(tenantId: string) {
  const { toast } = useToast();
  const [aiConfig, setAiConfig] = useState<AgentConfig | null>(null);
  const [directives, setDirectives] = useState<AgentDirective[]>([]);
  const [departmentConfigs, setDepartmentConfigs] = useState<AgentDepartmentConfig[]>([]);
  const [errors, setErrors] = useState<AgentError[]>([]);
  const [errorCounts, setErrorCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [configRes, directivesRes, deptRes, errorsRes] = await Promise.all([
      supabase.from('ai_agent_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('ai_directives').select('*').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('ai_department_configs').select('*').eq('tenant_id', tenantId),
      supabase.from('ai_error_log').select('*').eq('tenant_id', tenantId).gte('created_at', twentyFourHoursAgo).order('created_at', { ascending: false }).limit(20),
    ]);

    if (configRes.data) {
      const d = configRes.data as any;
      setAiConfig({
        ...d,
        ai_provider: d.ai_provider || 'openai',
        has_api_key: !!d.api_key_encrypted,
      });
    } else {
      setAiConfig({ ...defaultAgentConfig, id: '', tenant_id: tenantId } as AgentConfig);
    }

    setDirectives((directivesRes.data as any[]) || []);
    setDepartmentConfigs((deptRes.data as any[]) || []);
    setErrors((errorsRes.data as any[]) || []);

    // Count errors by agent
    const counts: Record<string, number> = { comercial: 0, admin: 0, remarketing: 0 };
    ((errorsRes.data as any[]) || []).forEach((e: any) => {
      const name = (e.agent_name || '').toLowerCase();
      if (name.includes('remarketing')) counts.remarketing++;
      else if (name.includes('admin')) counts.admin++;
      else counts.comercial++;
    });
    setErrorCounts(counts);

    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  return { aiConfig, directives, departmentConfigs, errors, errorCounts, loading, reload: load };
}

// Detail data for a specific agent
export function useAgentDetailData(tenantId: string, agentType: AgentTypeKey) {
  const { toast } = useToast();
  const agent = AGENT_TYPES[agentType];
  const [directives, setDirectives] = useState<AgentDirective[]>([]);
  const [behaviorConfig, setBehaviorConfig] = useState<AgentBehaviorConfig | null>(null);
  const [departmentConfigs, setDepartmentConfigs] = useState<AgentDepartmentConfig[]>([]);
  const [errors, setErrors] = useState<AgentError[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const departments = agent.departments.length > 0 ? agent.departments : ['remarketing'];

    const [directivesRes, behaviorRes, deptRes, errorsRes] = await Promise.all([
      supabase.from('ai_directives').select('*').eq('tenant_id', tenantId).in('department', departments),
      supabase.from('ai_behavior_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('ai_department_configs').select('*').eq('tenant_id', tenantId).in('department_code', departments),
      supabase.from('ai_error_log').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
    ]);

    setDirectives((directivesRes.data as any[]) || []);
    setBehaviorConfig((behaviorRes.data as any) || null);
    setDepartmentConfigs((deptRes.data as any[]) || []);

    // Filter errors by agent name
    const allErrors = (errorsRes.data as any[]) || [];
    const filtered = allErrors.filter((e: any) => {
      const name = (e.agent_name || '').toLowerCase();
      if (agentType === 'remarketing') return name.includes('remarketing');
      if (agentType === 'admin') return name.includes('admin');
      return !name.includes('remarketing') && !name.includes('admin');
    });
    setErrors(filtered);

    setLoading(false);
  }, [tenantId, agentType]);

  useEffect(() => { load(); }, [load]);

  return { directives, behaviorConfig, departmentConfigs, errors, loading, reload: load };
}

// Save directive
export async function saveDirective(directive: Partial<AgentDirective> & { id?: string; tenant_id: string; department: string }) {
  if (directive.id) {
    const { error } = await supabase
      .from('ai_directives')
      .update({
        directive_content: directive.directive_content,
        structured_config: directive.structured_config,
        is_active: directive.is_active ?? true,
        version: (directive.version || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', directive.id);
    return { error };
  } else {
    const { error } = await supabase
      .from('ai_directives')
      .insert({
        tenant_id: directive.tenant_id,
        department: directive.department,
        directive_content: directive.directive_content,
        structured_config: directive.structured_config,
        context: directive.context || 'atendimento_completo',
        is_active: true,
        version: 1,
      });
    return { error };
  }
}

// Save behavior config
export async function saveBehaviorConfig(config: Partial<AgentBehaviorConfig> & { tenant_id: string }) {
  if (config.id) {
    const { error } = await supabase
      .from('ai_behavior_config')
      .update({
        essential_questions: config.essential_questions,
        functions: config.functions as any,
        reengagement_hours: config.reengagement_hours,
        require_cpf_for_visit: config.require_cpf_for_visit,
        send_cold_leads: config.send_cold_leads,
        visit_schedule: config.visit_schedule,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);
    return { error };
  } else {
    const { error } = await supabase
      .from('ai_behavior_config')
      .insert({
        tenant_id: config.tenant_id,
        essential_questions: config.essential_questions as any,
        functions: config.functions as any,
        reengagement_hours: config.reengagement_hours ?? 24,
        require_cpf_for_visit: config.require_cpf_for_visit ?? false,
        send_cold_leads: config.send_cold_leads ?? false,
      });
    return { error };
  }
}

// Save department config
export async function saveDepartmentConfig(config: Partial<AgentDepartmentConfig> & { tenant_id: string; department_code: string }) {
  if (config.id) {
    const { error } = await supabase
      .from('ai_department_configs')
      .update({
        agent_name: config.agent_name,
        tone: config.tone,
        greeting_message: config.greeting_message,
        custom_instructions: config.custom_instructions,
        is_active: config.is_active ?? true,
        services: config.services,
      })
      .eq('id', config.id);
    return { error };
  } else {
    const { error } = await supabase
      .from('ai_department_configs')
      .insert({
        tenant_id: config.tenant_id,
        department_code: config.department_code as any,
        agent_name: config.agent_name,
        tone: config.tone,
        greeting_message: config.greeting_message,
        custom_instructions: config.custom_instructions,
        is_active: true,
      });
    return { error };
  }
}
