import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Tag, Wrench, Activity, Database, AlertTriangle } from 'lucide-react';
import { PipelineTimeline } from './PipelineTimeline';
import { AnalysisPanel } from './AnalysisPanel';
import { ProductionTracker } from './ProductionTracker';

const TAG_COLORS: Record<string, string> = {
  'Interesse:': 'bg-blue-100 text-blue-800',
  'Tipo:': 'bg-purple-100 text-purple-800',
  'Bairro:': 'bg-green-100 text-green-800',
  'Quartos:': 'bg-orange-100 text-orange-800',
  'Orçamento:': 'bg-yellow-100 text-yellow-800',
  'Prazo:': 'bg-pink-100 text-pink-800',
};

const QUAL_LABELS: Record<string, string> = {
  detected_interest: 'Finalidade',
  detected_property_type: 'Tipo',
  detected_neighborhood: 'Bairro',
  detected_bedrooms: 'Quartos',
  detected_budget_max: 'Orçamento',
  detected_timeline: 'Prazo',
  qualification_score: 'Score',
};

interface SimuladorSidebarProps {
  analysis: {
    score: number | null;
    maxScore: number;
    criteria: any[];
    errors: any[];
    summary: string | null;
    loading: boolean;
  };
  productionRuns: Array<{ score: number; isPerfect: boolean; timestamp: Date }>;
  consecutivePerfect: number;
  triageStage: string | null;
  activeModule: { slug: string; name: string } | null;
  moduleHistory: Array<{ slug: string; name: string }>;
  handoffDetected: boolean;
  agentType: string;
  qualification: Record<string, any>;
  tags: string[];
  toolsExecuted: string[];
  conversationState: {
    pending_properties_count: number;
    current_property_index: number;
    awaiting_property_feedback: boolean;
    shown_property_ids: string[];
  };
  modelUsed: string | null;
  loopDetected: boolean;
  allErrors: Array<{ type: string; severity: string; description: string; suggestion: string; affected_file?: string }>;
}

export default function SimuladorSidebar({
  analysis,
  productionRuns,
  consecutivePerfect,
  triageStage,
  activeModule,
  moduleHistory,
  handoffDetected,
  agentType,
  qualification,
  tags,
  toolsExecuted,
  conversationState,
  modelUsed,
  loopDetected,
  allErrors,
}: SimuladorSidebarProps) {
  const qualEntries = Object.entries(qualification).filter(([_, v]) => v != null && v !== 0);
  const qualScore = qualification.qualification_score || 0;

  return (
    <div className="w-80 shrink-0 space-y-3 overflow-y-auto pr-1">
      {/* Analysis Panel */}
      <AnalysisPanel
        score={analysis.score}
        maxScore={analysis.maxScore}
        criteria={analysis.criteria}
        errors={analysis.errors}
        summary={analysis.summary}
        loading={analysis.loading}
      />

      {/* Production Tracker */}
      <ProductionTracker
        runs={productionRuns}
        consecutivePerfect={consecutivePerfect}
        targetPerfect={5}
      />

      {/* Pipeline */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <PipelineTimeline
            triageStage={triageStage}
            activeModule={activeModule}
            moduleHistory={moduleHistory}
            handoffDetected={handoffDetected}
            agentType={agentType}
          />
        </CardContent>
      </Card>

      {/* Qualification */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Qualificação
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {/* Score bar */}
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Score: {qualScore}/100</span>
              <span className="text-orange-600">Handoff: 65</span>
            </div>
            <div className="relative h-2 bg-muted rounded-full">
              <div
                className="absolute h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(qualScore, 100)}%`,
                  backgroundColor: qualScore >= 65 ? 'hsl(var(--success))' : 'hsl(var(--primary))',
                }}
              />
              {/* Threshold marker */}
              <div className="absolute top-0 h-full w-px bg-orange-500" style={{ left: '65%' }} />
            </div>
          </div>

          {qualEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aguardando dados...</p>
          ) : (
            <div className="space-y-1.5">
              {qualEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{QUAL_LABELS[key] || key}</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversation State */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Estado
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Triage</span>
            <Badge variant="outline" className="text-[10px]">{triageStage || 'N/A'}</Badge>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Imóveis na fila</span>
            <span className="font-medium">{conversationState.pending_properties_count}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Índice curadoria</span>
            <span className="font-medium">{conversationState.current_property_index}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Aguardando feedback</span>
            <span className="font-medium">{conversationState.awaiting_property_feedback ? 'Sim' : 'Não'}</span>
          </div>
          {conversationState.shown_property_ids.length > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Imóveis mostrados</span>
              <span className="font-medium">{conversationState.shown_property_ids.length}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma tag gerada</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {tags.map(tag => {
                const colorClass = Object.entries(TAG_COLORS).find(([prefix]) => tag.startsWith(prefix))?.[1] || 'bg-gray-100 text-gray-800';
                return (
                  <Badge key={tag} variant="outline" className={`text-[10px] ${colorClass}`}>
                    {tag}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tools Executed */}
      {toolsExecuted.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Tools ({toolsExecuted.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-1">
              {toolsExecuted.map((tool, i) => (
                <code key={i} className="block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {tool}
                </code>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Decisions */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Agente</span>
            <Badge variant="outline" className="text-[10px]">{agentType}</Badge>
          </div>
          {modelUsed && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Modelo</span>
              <span className="font-mono text-[10px]">{modelUsed.split('/').pop()}</span>
            </div>
          )}
          {handoffDetected && (
            <Badge className="text-[10px] bg-orange-100 text-orange-800">MC-1 Handoff</Badge>
          )}
          {loopDetected && (
            <Badge className="text-[10px] bg-red-100 text-red-800">Loop Detectado</Badge>
          )}
        </CardContent>
      </Card>

      {/* Accumulated Errors */}
      {allErrors.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              Erros ({allErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {allErrors.slice(-5).map((err, i) => (
              <div key={i} className="border rounded p-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`text-[9px] ${
                    err.severity === 'high' ? 'bg-red-100 text-red-800' :
                    err.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {err.severity}
                  </Badge>
                  <span className="text-[10px] font-medium">{err.type}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{err.description}</p>
                <p className="text-[10px] text-emerald-700">💡 {err.suggestion}</p>
                {err.affected_file && (
                  <code className="text-[9px] text-muted-foreground bg-muted px-1 rounded">{err.affected_file}</code>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
