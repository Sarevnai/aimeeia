import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { saveBehaviorConfig, type AgentBehaviorConfig } from '@/hooks/useAgentData';

interface AgentBehaviorEditorProps {
  tenantId: string;
  behaviorConfig: AgentBehaviorConfig | null;
  onSaved: () => void;
}

interface EssentialQuestion {
  name: string;
  category?: string;
  isQualifying?: boolean;
  isActive?: boolean;
  isLocked?: boolean;
}

const DEFAULT_FUNCTIONS: Record<string, { label: string; description: string }> = {
  search_properties: { label: 'Buscar Imóveis', description: 'Busca semântica no catálogo' },
  schedule_visit: { label: 'Agendar Visita', description: 'Agendamento com corretor' },
  qualify_lead: { label: 'Qualificar Lead', description: 'Coleta de dados e qualificação' },
  send_to_crm: { label: 'Enviar ao CRM', description: 'Handoff para CRM/corretor' },
  audio_messages: { label: 'Áudio/Voz', description: 'Processamento de mensagens de áudio' },
  reengagement: { label: 'Reengajamento', description: 'Retomar leads inativos' },
  sentiment_analysis: { label: 'Análise de Sentimento', description: 'Detecção de intenção' },
  create_ticket: { label: 'Criar Ticket', description: 'Tickets de suporte' },
};

const AgentBehaviorEditor: React.FC<AgentBehaviorEditorProps> = ({
  tenantId, behaviorConfig, onSaved,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [questions, setQuestions] = useState<EssentialQuestion[]>([]);
  const [functions, setFunctions] = useState<Record<string, boolean>>({});
  const [reengagementHours, setReengagementHours] = useState(24);
  const [requireCpf, setRequireCpf] = useState(false);
  const [sendColdLeads, setSendColdLeads] = useState(false);

  useEffect(() => {
    if (behaviorConfig) {
      setQuestions(behaviorConfig.essential_questions || []);
      setFunctions(behaviorConfig.functions || {});
      setReengagementHours(behaviorConfig.reengagement_hours || 24);
      setRequireCpf(behaviorConfig.require_cpf_for_visit || false);
      setSendColdLeads(behaviorConfig.send_cold_leads || false);
    } else {
      setQuestions([]);
      setFunctions({});
      setReengagementHours(24);
      setRequireCpf(false);
      setSendColdLeads(false);
    }
  }, [behaviorConfig]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveBehaviorConfig({
      id: behaviorConfig?.id,
      tenant_id: tenantId,
      essential_questions: questions,
      functions,
      reengagement_hours: reengagementHours,
      require_cpf_for_visit: requireCpf,
      send_cold_leads: sendColdLeads,
    });
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Comportamento salvo', description: 'Configurações de comportamento atualizadas.' });
      onSaved();
    }
    setSaving(false);
  };

  const addQuestion = () => {
    setQuestions([...questions, { name: '', isActive: true, isQualifying: false }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof EssentialQuestion, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  return (
    <div className="space-y-6">
      {/* Essential Questions */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Perguntas Essenciais</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Perguntas que o agente faz durante a qualificação do lead
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addQuestion}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>

        {questions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma pergunta configurada. O agente usará as perguntas padrão do código.
          </p>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/10">
                <Input
                  value={q.name}
                  onChange={(e) => updateQuestion(i, 'name', e.target.value)}
                  placeholder="Ex: Qual o orçamento disponível?"
                  className="h-8 text-sm flex-1"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-[10px] text-muted-foreground">Ativa</Label>
                  <Switch
                    checked={q.isActive !== false}
                    onCheckedChange={(v) => updateQuestion(i, 'isActive', v)}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-[10px] text-muted-foreground">Qualifica</Label>
                  <Switch
                    checked={!!q.isQualifying}
                    onCheckedChange={(v) => updateQuestion(i, 'isQualifying', v)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeQuestion(i)}
                  disabled={q.isLocked}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Function Toggles */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Funcionalidades</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Ative ou desative capacidades específicas do agente
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(DEFAULT_FUNCTIONS).map(([key, { label, description }]) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={functions[key] !== false}
                onCheckedChange={(v) => setFunctions({ ...functions, [key]: v })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Other Settings */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Configurações Adicionais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Reengajamento (horas)</Label>
            <Input
              type="number"
              value={reengagementHours}
              onChange={(e) => setReengagementHours(Number(e.target.value))}
              className="h-9"
              min={1}
            />
            <p className="text-[10px] text-muted-foreground">Horas até reengajar leads inativos</p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
            <div>
              <p className="text-sm font-medium text-foreground">Exigir CPF</p>
              <p className="text-[10px] text-muted-foreground">Para agendamento de visita</p>
            </div>
            <Switch checked={requireCpf} onCheckedChange={setRequireCpf} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
            <div>
              <p className="text-sm font-medium text-foreground">Enviar Cold Leads</p>
              <p className="text-[10px] text-muted-foreground">Leads com score baixo</p>
            </div>
            <Switch checked={sendColdLeads} onCheckedChange={setSendColdLeads} />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          style={{ background: 'hsl(250 70% 60%)' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar Comportamento
        </Button>
      </div>
    </div>
  );
};

export default AgentBehaviorEditor;
