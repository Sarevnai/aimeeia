import React, { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { saveDepartmentConfig, type AgentDepartmentConfig } from '@/hooks/useAgentData';
import { AGENT_TYPES, AgentTypeKey } from '@/lib/agent-constants';

interface AgentDepartmentConfigEditorProps {
  agentType: AgentTypeKey;
  tenantId: string;
  departmentConfigs: AgentDepartmentConfig[];
  onSaved: () => void;
}

const AgentDepartmentConfigEditor: React.FC<AgentDepartmentConfigEditorProps> = ({
  agentType, tenantId, departmentConfigs, onSaved,
}) => {
  const { toast } = useToast();
  const agent = AGENT_TYPES[agentType];
  const departments = agent.departments.length > 0 ? agent.departments : ['remarketing'];

  const [editState, setEditState] = useState<Record<string, {
    agentName: string;
    tone: string;
    greetingMessage: string;
    customInstructions: string;
    isActive: boolean;
    originalConfig: AgentDepartmentConfig | null;
  }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const state: typeof editState = {};
    departments.forEach(dept => {
      const cfg = departmentConfigs.find(dc => dc.department_code === dept);
      state[dept] = {
        agentName: cfg?.agent_name || '',
        tone: cfg?.tone || 'friendly',
        greetingMessage: cfg?.greeting_message || '',
        customInstructions: cfg?.custom_instructions || '',
        isActive: cfg?.is_active !== false,
        originalConfig: cfg || null,
      };
    });
    setEditState(state);
  }, [departmentConfigs, agentType]);

  const handleSave = async (dept: string) => {
    const edit = editState[dept];
    if (!edit) return;

    setSaving(dept);
    const { error } = await saveDepartmentConfig({
      id: edit.originalConfig?.id,
      tenant_id: tenantId,
      department_code: dept,
      agent_name: edit.agentName || null,
      tone: edit.tone || null,
      greeting_message: edit.greetingMessage || null,
      custom_instructions: edit.customInstructions || null,
      is_active: edit.isActive,
    });

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configuração salva', description: `Config do departamento ${dept} atualizada.` });
      onSaved();
    }
    setSaving(null);
  };

  const renderDeptEditor = (dept: string) => {
    const edit = editState[dept];
    if (!edit) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Sobrescreve configurações globais para o departamento <strong>{dept}</strong>.
            Deixe em branco para usar os valores globais.
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Ativo</Label>
            <Switch
              checked={edit.isActive}
              onCheckedChange={(v) =>
                setEditState(prev => ({
                  ...prev,
                  [dept]: { ...prev[dept], isActive: v },
                }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Nome do Agente</Label>
            <Input
              value={edit.agentName}
              onChange={(e) =>
                setEditState(prev => ({
                  ...prev,
                  [dept]: { ...prev[dept], agentName: e.target.value },
                }))
              }
              placeholder="Ex: Aimee (usar global)"
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Tom</Label>
            <Select
              value={edit.tone}
              onValueChange={(v) =>
                setEditState(prev => ({
                  ...prev,
                  [dept]: { ...prev[dept], tone: v },
                }))
              }
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional</SelectItem>
                <SelectItem value="friendly">Amigável</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Saudação</Label>
          <Textarea
            value={edit.greetingMessage}
            onChange={(e) =>
              setEditState(prev => ({
                ...prev,
                [dept]: { ...prev[dept], greetingMessage: e.target.value },
              }))
            }
            placeholder="Saudação específica para este departamento..."
            className="min-h-[60px] text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Instruções Customizadas</Label>
          <Textarea
            value={edit.customInstructions}
            onChange={(e) =>
              setEditState(prev => ({
                ...prev,
                [dept]: { ...prev[dept], customInstructions: e.target.value },
              }))
            }
            placeholder="Instruções adicionais para este departamento..."
            className="min-h-[100px] text-sm font-mono"
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            className="gap-1.5"
            style={{ background: 'hsl(250 70% 60%)' }}
            onClick={() => handleSave(dept)}
            disabled={saving === dept}
          >
            {saving === dept ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configurações de persona e comportamento específicas por departamento, que sobrepõem as configurações globais.
      </p>

      {departments.length > 1 ? (
        <Tabs defaultValue={departments[0]}>
          <TabsList>
            {departments.map(dept => (
              <TabsTrigger key={dept} value={dept} className="capitalize">{dept}</TabsTrigger>
            ))}
          </TabsList>
          {departments.map(dept => (
            <TabsContent key={dept} value={dept}>
              {renderDeptEditor(dept)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        renderDeptEditor(departments[0])
      )}
    </div>
  );
};

export default AgentDepartmentConfigEditor;
