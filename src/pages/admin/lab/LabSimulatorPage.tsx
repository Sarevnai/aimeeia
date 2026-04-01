import React, { useState, useCallback } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SimuladorChat } from '@/components/lab/SimuladorChat';
import SimuladorSidebar from '@/components/lab/SimuladorSidebar';
import { useEffect } from 'react';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  company_name: string;
}

export default function LabSimulatorPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useSessionState<string>('lab_tenantId', '');
  const [loadingTenants, setLoadingTenants] = useState(true);

  // Metadata from SimuladorChat
  const [triageStage, setTriageStage] = useSessionState<string | null>('lab_triageStage', null);
  const [activeModule, setActiveModule] = useSessionState<{ slug: string; name: string } | null>('lab_activeModule', null);
  const [moduleHistory, setModuleHistory] = useSessionState<Array<{ slug: string; name: string }>>('lab_moduleHistory', []);
  const [qualification, setQualification] = useSessionState<Record<string, any>>('lab_qualification', {});
  const [tags, setTags] = useSessionState<string[]>('lab_tags', []);
  const [toolsExecuted, setToolsExecuted] = useSessionState<string[]>('lab_allTools', []);
  const [agentType, setAgentType] = useSessionState<string>('lab_agentType', 'comercial');
  const [conversationState, setConversationState] = useSessionState('lab_convState', {
    pending_properties_count: 0,
    current_property_index: 0,
    awaiting_property_feedback: false,
    shown_property_ids: [] as string[],
  });
  const [modelUsed, setModelUsed] = useSessionState<string | null>('lab_modelUsed', null);
  const [handoffDetected, setHandoffDetected] = useSessionState<boolean>('lab_handoff', false);
  const [loopDetected, setLoopDetected] = useSessionState<boolean>('lab_loop', false);

  // Analysis state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useSessionState<any>('lab_analysis', null);
  const [productionRuns, setProductionRuns] = useSessionState<Array<{ score: number; isPerfect: boolean; timestamp: Date }>>('lab_prodRuns', []);
  const [consecutivePerfect, setConsecutivePerfect] = useSessionState<number>('lab_consecutivePerfect', 0);
  const [allErrors, setAllErrors] = useSessionState<any[]>('lab_allErrors', []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, company_name')
        .eq('is_active', true)
        .order('company_name');
      setTenants(data || []);
      setLoadingTenants(false);
    })();
  }, []);

  const handleMetadataUpdate = useCallback((metadata: any) => {
    setTriageStage(metadata.triageStage);
    setActiveModule(metadata.activeModule);

    // Merge qualification: only overwrite fields with real values (skip nulls/zeros/empty)
    const incomingQual = metadata.qualification || {};
    const validIncomingQual = Object.fromEntries(
      Object.entries(incomingQual).filter(([, v]) => v != null && v !== 0 && v !== '')
    );
    if (Object.keys(validIncomingQual).length > 0) {
      setQualification(prev => ({ ...prev, ...validIncomingQual }));
    }

    // Merge tags: union — never drop existing tags, only add new ones
    const incomingTags = metadata.tags || [];
    if (incomingTags.length > 0) {
      setTags(prev => [...new Set([...prev, ...incomingTags])]);
    }

    setAgentType(metadata.agentType || 'comercial');
    setConversationState(metadata.conversationState || {
      pending_properties_count: 0,
      current_property_index: 0,
      awaiting_property_feedback: false,
      shown_property_ids: [],
    });
    setModelUsed(metadata.modelUsed || null);
    setHandoffDetected(prev => prev || metadata.handoffDetected || false);
    setLoopDetected(metadata.loopDetected || false);

    // Tools already accumulated in SimuladorChat, just set directly
    setToolsExecuted(metadata.toolsExecuted || []);

    // Track module history
    if (metadata.activeModule) {
      setModuleHistory(prev => {
        const last = prev[prev.length - 1];
        if (last?.slug !== metadata.activeModule.slug) {
          return [...prev, metadata.activeModule];
        }
        return prev;
      });
    }

    // Handle analysis
    if (metadata.analysis) {
      setCurrentAnalysis(metadata.analysis);
      setAnalysisLoading(false);

      // Track production runs
      const score = metadata.analysis.score ?? 0;
      const isPerfect = score >= 9.0;
      const newRun = { score, isPerfect, timestamp: new Date() };
      setProductionRuns(prev => [...prev, newRun]);

      if (isPerfect) {
        setConsecutivePerfect(prev => prev + 1);
      } else {
        setConsecutivePerfect(0);
      }

      // Accumulate errors
      if (metadata.analysis.errors?.length > 0) {
        setAllErrors(prev => [...prev, ...metadata.analysis.errors]);
      }
    } else if (metadata.analysis === undefined) {
      // Analysis is loading
      setAnalysisLoading(true);
    }
  }, []);

  const handleReset = useCallback(() => {
    setTriageStage(null);
    setActiveModule(null);
    setModuleHistory([]);
    setQualification({});
    setTags([]);
    setToolsExecuted([]);
    setAgentType('comercial');
    setConversationState({
      pending_properties_count: 0,
      current_property_index: 0,
      awaiting_property_feedback: false,
      shown_property_ids: [],
    });
    setModelUsed(null);
    setHandoffDetected(false);
    setLoopDetected(false);
    setCurrentAnalysis(null);
    setAllErrors([]);
    // Don't reset production runs/consecutivePerfect — those persist across conversations
  }, []);

  const [cleaningUp, setCleaningUp] = useState(false);

  const handleCleanupSimulations = useCallback(async () => {
    if (!confirm('Excluir TODAS as conversas e contatos de simulação do banco de dados?')) return;
    setCleaningUp(true);
    try {
      // Get all simulation conversation IDs first
      const { data: simConvs } = await supabase
        .from('conversations' as any)
        .select('id')
        .in('source', ['simulation', 'remarketing']);

      const convIds = (simConvs || []).map((c: any) => c.id);

      if (convIds.length > 0) {
        // Delete messages from simulation conversations
        await supabase.from('messages' as any).delete().in('conversation_id', convIds);
        // Delete simulation conversations
        await supabase.from('conversations' as any).delete().in('id', convIds);
      }

      // Delete simulation contacts (phone starts with SIM-)
      const { data: simContacts } = await supabase
        .from('contacts' as any)
        .select('id, phone')
        .like('phone', 'SIM-%');

      if (simContacts && simContacts.length > 0) {
        const simPhones = simContacts.map((c: any) => c.phone);
        // Delete related data
        await supabase.from('lead_qualification' as any).delete().in('phone_number', simPhones);
        await supabase.from('conversation_states' as any).delete().in('phone_number', simPhones);
        await supabase.from('contacts' as any).delete().in('id', simContacts.map((c: any) => c.id));
      }

      // Delete simulation analysis data
      await supabase.from('simulation_analyses' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');

      toast.success(`Limpeza concluída: ${convIds.length} conversas e ${simContacts?.length || 0} contatos removidos`);
    } catch (err) {
      toast.error('Erro ao limpar simulações');
      console.error(err);
    } finally {
      setCleaningUp(false);
    }
  }, []);

  const selectedTenantName = tenants.find(t => t.id === selectedTenantId)?.company_name;

  return (
    <div className="flex flex-col h-full">
      {/* Tenant Selector */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/20">
        <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
          <SelectTrigger className="w-72 h-8 text-xs">
            <SelectValue placeholder={loadingTenants ? 'Carregando...' : 'Selecione um tenant'} />
          </SelectTrigger>
          <SelectContent>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTenantName && (
          <Badge variant="outline" className="text-xs">{selectedTenantName}</Badge>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
          onClick={handleCleanupSimulations}
          disabled={cleaningUp}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {cleaningUp ? 'Limpando...' : 'Limpar Simulações'}
        </Button>
        {currentAnalysis?.score != null && (
          <Badge className={`text-xs ${
            currentAnalysis.score >= 9 ? 'bg-emerald-100 text-emerald-800' :
            currentAnalysis.score >= 7 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            Score: {currentAnalysis.score}/10
          </Badge>
        )}
      </div>

      {!selectedTenantId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Selecione um tenant para iniciar
        </div>
      ) : (
        <div className="flex flex-1 gap-3 p-3 overflow-hidden">
          {/* Chat */}
          <div className="flex-1 min-w-0">
            <SimuladorChat
              tenantId={selectedTenantId}
              onMetadataUpdate={handleMetadataUpdate}
              onReset={handleReset}
            />
          </div>

          {/* Sidebar */}
          <SimuladorSidebar
            analysis={{
              score: currentAnalysis?.score ?? null,
              maxScore: 10,
              criteria: currentAnalysis?.criteria || [],
              errors: currentAnalysis?.errors || [],
              summary: currentAnalysis?.summary || null,
              loading: analysisLoading,
            }}
            productionRuns={productionRuns}
            consecutivePerfect={consecutivePerfect}
            triageStage={triageStage}
            activeModule={activeModule}
            moduleHistory={moduleHistory}
            handoffDetected={handoffDetected}
            agentType={agentType}
            qualification={qualification}
            tags={tags}
            toolsExecuted={toolsExecuted}
            conversationState={conversationState}
            modelUsed={modelUsed}
            loopDetected={loopDetected}
            allErrors={allErrors}
          />
        </div>
      )}
    </div>
  );
}
