import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Lock, ChevronDown, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Question {
  name: string;
  category: string;
  isQualifying: boolean;
  isActive: boolean;
  isLocked?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Operacao': 'bg-accent/15 text-accent',
  'Informacoes do lead': 'bg-info/15 text-info',
  'Localizacao': 'bg-warning/15 text-warning',
  'Caracteristicas': 'bg-success/15 text-success',
};

const CATEGORIES = ['Operacao', 'Informacoes do lead', 'Localizacao', 'Caracteristicas'];

const FAQ_ITEMS = [
  {
    question: 'Como funciona?',
    answer: 'A Aimee coleta essas informações durante a conversa com o lead de forma natural, como uma atendente faria. Ela identifica as respostas mesmo quando não são dadas diretamente.',
  },
  {
    question: 'A pergunta será sempre feita?',
    answer: 'Não necessariamente. A Aimee usa detecção inteligente — se o lead já mencionou a informação em outra parte da conversa, ela não repete a pergunta.',
  },
  {
    question: 'O que são Perguntas qualificatórias?',
    answer: 'São perguntas obrigatórias antes de enviar o lead ao CRM/corretor. Garantem que o lead tem as informações mínimas para um atendimento eficiente.',
  },
];

const PerguntasTab: React.FC = () => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Caracteristicas');

  // Load from DB
  useEffect(() => {
    if (!tenantId) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_behavior_config')
        .select('id, essential_questions')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (data) {
        setConfigId(data.id);
        setQuestions((data.essential_questions as any as Question[]) || []);
      }
      setLoading(false);
    };

    load();
  }, [tenantId]);

  const handleSave = async () => {
    if (!configId) return;
    setSaving(true);

    const { error } = await supabase
      .from('ai_behavior_config')
      .update({ essential_questions: questions as any, updated_at: new Date().toISOString() })
      .eq('id', configId);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo!', description: 'Perguntas essenciais atualizadas.' });
      setEditing(false);
    }
    setSaving(false);
  };

  const handleToggleActive = (index: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, isActive: !q.isActive } : q))
    );
  };

  const handleToggleQualifying = (index: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, isQualifying: !q.isQualifying } : q))
    );
  };

  const handleRemove = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    setQuestions((prev) => [
      ...prev,
      { name: newName.trim(), category: newCategory, isQualifying: false, isActive: true, isLocked: false },
    ]);
    setNewName('');
  };

  const activeCount = questions.filter((q) => q.isActive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Question list */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Perguntas ativas ({activeCount} de {questions.length})
            </span>
            {editing ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
            )}
          </div>
          <div className="divide-y divide-border">
            {questions.map((q, i) => (
              <div key={i} className={cn('flex items-center justify-between px-5 py-3', !q.isActive && editing && 'opacity-50')}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {editing && (
                    <Switch
                      checked={q.isActive}
                      onCheckedChange={() => handleToggleActive(i)}
                      className="shrink-0"
                    />
                  )}
                  {q.isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className={cn('text-sm text-foreground truncate', !q.isActive && 'line-through')}>{q.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn('text-[10px] border-0', CATEGORY_COLORS[q.category] || 'bg-muted text-muted-foreground')}>
                    {q.category}
                  </Badge>
                  {q.isQualifying && (
                    <Badge className="text-[10px] bg-success/15 text-success border-0">
                      Qualificatória
                    </Badge>
                  )}
                  {editing && !q.isLocked && (
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleToggleQualifying(i)}
                      >
                        {q.isQualifying ? 'Remover Q' : 'Tornar Q'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add new question */}
          {editing && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
              <Input
                placeholder="Nova pergunta..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 h-9 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-9 gap-1" onClick={handleAdd} disabled={!newName.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Saiba mais</h4>
        {FAQ_ITEMS.map((item, i) => (
          <Collapsible key={i}>
            <Card>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-3 text-left">
                <span className="text-sm font-medium text-foreground">{item.question}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-4">
                  <p className="text-sm text-muted-foreground">{item.answer}</p>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};

export default PerguntasTab;
