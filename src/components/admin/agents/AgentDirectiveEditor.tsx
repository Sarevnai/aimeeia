import React, { useState, useEffect } from 'react';
import { Save, Loader2, Eye, Code2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { saveDirective, type AgentDirective } from '@/hooks/useAgentData';
import { AGENT_TYPES, AgentTypeKey } from '@/lib/agent-constants';

interface AgentDirectiveEditorProps {
  agentType: AgentTypeKey;
  tenantId: string;
  directives: AgentDirective[];
  onSaved: () => void;
}

const AgentDirectiveEditor: React.FC<AgentDirectiveEditorProps> = ({
  agentType, tenantId, directives, onSaved,
}) => {
  const { toast } = useToast();
  const agent = AGENT_TYPES[agentType];
  const departments = agent.departments.length > 0 ? agent.departments : ['remarketing'];

  const [editState, setEditState] = useState<Record<string, {
    directiveContent: string;
    structuredConfig: string;
    originalDirective: AgentDirective | null;
  }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const state: typeof editState = {};
    departments.forEach(dept => {
      const dir = directives.find(d => d.department === dept);
      state[dept] = {
        directiveContent: dir?.directive_content || '',
        structuredConfig: dir?.structured_config ? JSON.stringify(dir.structured_config, null, 2) : '',
        originalDirective: dir || null,
      };
    });
    setEditState(state);
  }, [directives, agentType]);

  const handleSave = async (dept: string) => {
    const edit = editState[dept];
    if (!edit) return;

    setSaving(dept);

    let structuredConfig = null;
    if (edit.structuredConfig.trim()) {
      try {
        structuredConfig = JSON.parse(edit.structuredConfig);
      } catch {
        toast({ title: 'JSON inválido', description: 'O structured_config contém JSON inválido.', variant: 'destructive' });
        setSaving(null);
        return;
      }
    }

    const { error } = await saveDirective({
      id: edit.originalDirective?.id,
      tenant_id: tenantId,
      department: dept,
      directive_content: edit.directiveContent || null,
      structured_config: structuredConfig,
      version: edit.originalDirective?.version || 0,
    });

    if (error) {
      toast({ title: 'Erro ao salvar diretiva', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Diretiva salva', description: `Diretiva de ${dept} atualizada com sucesso.` });
      onSaved();
    }
    setSaving(null);
  };

  const hasChanges = (dept: string) => {
    const edit = editState[dept];
    if (!edit) return false;
    const orig = edit.originalDirective;
    if (!orig) return !!(edit.directiveContent.trim() || edit.structuredConfig.trim());
    return edit.directiveContent !== (orig.directive_content || '') ||
      edit.structuredConfig !== (orig.structured_config ? JSON.stringify(orig.structured_config, null, 2) : '');
  };

  return (
    <div className="space-y-4">
      {departments.length > 1 ? (
        <Tabs defaultValue={departments[0]}>
          <TabsList>
            {departments.map(dept => (
              <TabsTrigger key={dept} value={dept} className="capitalize">
                {dept}
              </TabsTrigger>
            ))}
          </TabsList>
          {departments.map(dept => (
            <TabsContent key={dept} value={dept}>
              <DepartmentDirectiveEditor
                dept={dept}
                edit={editState[dept]}
                onChange={(field, value) =>
                  setEditState(prev => ({
                    ...prev,
                    [dept]: { ...prev[dept], [field]: value },
                  }))
                }
                onSave={() => handleSave(dept)}
                saving={saving === dept}
                hasChanges={hasChanges(dept)}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <DepartmentDirectiveEditor
          dept={departments[0]}
          edit={editState[departments[0]]}
          onChange={(field, value) =>
            setEditState(prev => ({
              ...prev,
              [departments[0]]: { ...prev[departments[0]], [field]: value },
            }))
          }
          onSave={() => handleSave(departments[0])}
          saving={saving === departments[0]}
          hasChanges={hasChanges(departments[0])}
        />
      )}
    </div>
  );
};

interface DepartmentDirectiveEditorProps {
  dept: string;
  edit?: { directiveContent: string; structuredConfig: string; originalDirective: AgentDirective | null };
  onChange: (field: 'directiveContent' | 'structuredConfig', value: string) => void;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
}

const DepartmentDirectiveEditor: React.FC<DepartmentDirectiveEditorProps> = ({
  dept, edit, onChange, onSave, saving, hasChanges,
}) => {
  if (!edit) return null;

  return (
    <div className="space-y-4">
      {/* Directive content */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Diretiva ({dept})
            {edit.originalDirective && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full ml-1">
                v{edit.originalDirective.version}
              </span>
            )}
          </Label>
          <div className="flex items-center gap-2">
            {edit.directiveContent && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Preview da Diretiva — {dept}</DialogTitle>
                  </DialogHeader>
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 p-4 rounded-lg border border-border">
                    {edit.directiveContent}
                  </pre>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        <Textarea
          value={edit.directiveContent}
          onChange={(e) => onChange('directiveContent', e.target.value)}
          placeholder={`Instruções de comportamento para o departamento ${dept}...\nUse {{AGENT_NAME}}, {{COMPANY_NAME}}, {{CITY}}, {{CONTACT_NAME}} como variáveis.`}
          className="min-h-[250px] text-sm font-mono leading-relaxed"
        />
      </div>

      {/* Structured Config (JSON) */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5" />
          Structured Config (JSON)
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full ml-1">
            Opcional — sobrepõe diretiva quando presente
          </span>
        </Label>
        <Textarea
          value={edit.structuredConfig}
          onChange={(e) => onChange('structuredConfig', e.target.value)}
          placeholder='{"role": {"identity": "...", "essence": "..."}, "directives": [...], "phases": [...], "handoff": {...}}'
          className="min-h-[200px] text-sm font-mono leading-relaxed"
        />
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          style={{ background: 'hsl(250 70% 60%)' }}
          onClick={onSave}
          disabled={saving || !hasChanges}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar Diretiva
        </Button>
      </div>
    </div>
  );
};

export default AgentDirectiveEditor;
