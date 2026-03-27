import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, TrendingUp, TrendingDown, Minus, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface PromptVersion {
  id: string;
  department: string;
  version: number;
  changes_description: string | null;
  files_changed: { file: string; diff_summary: string }[] | null;
  triggered_by_report_id: string | null;
  score_before: number | null;
  score_after: number | null;
  status: string;
  created_at: string;
}

interface PromptVersionTrackerProps {
  tenantId: string;
  conversationId: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
  improved: { label: 'Melhorou', color: 'bg-green-100 text-green-700' },
  regressed: { label: 'Piorou', color: 'bg-red-100 text-red-700' },
  no_change: { label: 'Sem mudanca', color: 'bg-gray-100 text-gray-700' },
};

export default function PromptVersionTracker({ tenantId, conversationId }: PromptVersionTrackerProps) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [department, setDepartment] = useState('vendas');
  const [description, setDescription] = useState('');
  const [filesChanged, setFilesChanged] = useState('');
  const [saving, setSaving] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    setVersions((data || []) as PromptVersion[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) loadVersions();
  }, [tenantId, loadVersions]);

  // Get latest report for the conversation (to link as trigger)
  const getLatestReportId = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase
      .from('analysis_reports')
      .select('id, avg_score')
      .eq('conversation_id', conversationId)
      .order('version', { ascending: false })
      .limit(1);

    return data?.[0]?.id || null;
  }, [conversationId]);

  const getLatestReportScore = useCallback(async (): Promise<number | null> => {
    const { data } = await supabase
      .from('analysis_reports')
      .select('avg_score')
      .eq('conversation_id', conversationId)
      .order('version', { ascending: false })
      .limit(1);

    return data?.[0]?.avg_score || null;
  }, [conversationId]);

  const handleSave = useCallback(async () => {
    if (!description.trim()) {
      toast({ title: 'Descreva a mudanca', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const reportId = await getLatestReportId();
    const scoreBefore = await getLatestReportScore();

    // Parse files changed
    const files = filesChanged.trim()
      ? filesChanged.split('\n').map(line => {
          const [file, ...rest] = line.split(':');
          return { file: file.trim(), diff_summary: rest.join(':').trim() || 'alterado' };
        })
      : [];

    // Get next version number
    const { data: existing } = await supabase
      .from('prompt_versions')
      .select('version')
      .eq('tenant_id', tenantId)
      .eq('department', department)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;

    const { error } = await supabase.from('prompt_versions').insert({
      tenant_id: tenantId,
      department,
      version: nextVersion,
      changes_description: description,
      files_changed: files,
      triggered_by_report_id: reportId,
      score_before: scoreBefore,
      status: 'pending',
    });

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Versao v${nextVersion} registrada` });
      setShowForm(false);
      setDescription('');
      setFilesChanged('');
      await loadVersions();
    }
    setSaving(false);
  }, [tenantId, department, description, filesChanged, getLatestReportId, getLatestReportScore, loadVersions, toast]);

  // Update status after re-analysis
  const updateStatus = useCallback(async (versionId: string) => {
    const version = versions.find(v => v.id === versionId);
    if (!version) return;

    const scoreAfter = await getLatestReportScore();
    if (scoreAfter == null) {
      toast({ title: 'Re-analise a conversa primeiro', variant: 'destructive' });
      return;
    }

    let status = 'no_change';
    if (version.score_before != null) {
      const delta = scoreAfter - version.score_before;
      if (delta > 0.3) status = 'improved';
      else if (delta < -0.3) status = 'regressed';
    }

    await supabase
      .from('prompt_versions')
      .update({ score_after: scoreAfter, status })
      .eq('id', versionId);

    toast({ title: `Status atualizado: ${statusLabels[status].label}` });
    await loadVersions();
  }, [versions, getLatestReportScore, loadVersions, toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historico de Correcoes de Prompt</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Registrar Correcao
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="locacao">Locacao</SelectItem>
              <SelectItem value="administrativo">Administrativo</SelectItem>
              <SelectItem value="remarketing">Remarketing</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            placeholder="O que foi alterado no prompt? (ex: Removido instrucao de repetir nome, adicionado guardrail de preco...)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs min-h-[60px]"
          />

          <Input
            placeholder="Arquivos alterados (1 por linha: arquivo.ts: descricao)"
            value={filesChanged}
            onChange={(e) => setFilesChanged(e.target.value)}
            className="text-xs h-7"
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-7 text-xs">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Versions list */}
      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando...</div>
      ) : versions.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          Nenhuma correcao registrada ainda
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map(v => {
            const st = statusLabels[v.status] || statusLabels.pending;
            const delta = v.score_after != null && v.score_before != null
              ? v.score_after - v.score_before
              : null;

            return (
              <div key={v.id} className="border rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 h-4">{v.department}</Badge>
                    <span className="font-medium">v{v.version}</span>
                    <Badge className={cn('text-[10px] px-1 h-4', st.color)}>{st.label}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <p className="text-muted-foreground">{v.changes_description}</p>

                {v.files_changed && (v.files_changed as any[]).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(v.files_changed as any[]).map((f: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px] px-1 h-4 gap-0.5">
                        <FileCode className="h-2.5 w-2.5" />
                        {f.file}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {v.score_before != null && (
                    <span className="text-muted-foreground">Antes: <span className="font-mono">{v.score_before.toFixed(1)}</span></span>
                  )}
                  {v.score_after != null && (
                    <span className="text-muted-foreground">Depois: <span className="font-mono">{v.score_after.toFixed(1)}</span></span>
                  )}
                  {delta != null && (
                    <span className="flex items-center gap-0.5">
                      {delta > 0 ? <TrendingUp className="h-3 w-3 text-green-500" /> :
                       delta < 0 ? <TrendingDown className="h-3 w-3 text-red-500" /> :
                       <Minus className="h-3 w-3 text-muted-foreground" />}
                      <span className={cn('font-mono', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : '')}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                      </span>
                    </span>
                  )}

                  {v.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(v.id)}
                      className="h-5 text-[10px] px-2 ml-auto"
                    >
                      Atualizar Status
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
