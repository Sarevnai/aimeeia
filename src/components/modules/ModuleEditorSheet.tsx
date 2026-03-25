import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AiModule {
  id?: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  prompt_instructions: string;
  activation_criteria: string;
  is_active: boolean;
  sort_order: number;
}

interface ModuleEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: AiModule | null;
  onSave: (module: AiModule) => void;
  isLoading?: boolean;
}

const CATEGORIES = [
  { value: 'general', label: 'Geral' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'admin', label: 'Administrativo' },
  { value: 'remarketing', label: 'Remarketing' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function ModuleEditorSheet({ open, onOpenChange, module, onSave, isLoading }: ModuleEditorSheetProps) {
  const [form, setForm] = useState<AiModule>({
    name: '',
    slug: '',
    description: '',
    category: 'comercial',
    prompt_instructions: '',
    activation_criteria: '',
    is_active: true,
    sort_order: 0,
  });
  const [autoSlug, setAutoSlug] = useState(true);

  useEffect(() => {
    if (module) {
      setForm(module);
      setAutoSlug(false);
    } else {
      setForm({
        name: '',
        slug: '',
        description: '',
        category: 'comercial',
        prompt_instructions: '',
        activation_criteria: '',
        is_active: true,
        sort_order: 0,
      });
      setAutoSlug(true);
    }
  }, [module, open]);

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      ...(autoSlug ? { slug: slugify(name) } : {}),
    }));
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.prompt_instructions.trim()) return;
    onSave(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{module ? 'Editar Módulo' : 'Novo Módulo'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ex: Qualificação - Aluguel"
            />
          </div>

          <div>
            <Label htmlFor="slug">Slug (identificador)</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={e => { setAutoSlug(false); setForm(prev => ({ ...prev, slug: e.target.value })); }}
              placeholder="qualificacao-aluguel"
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Breve descrição do propósito deste módulo"
            />
          </div>

          <div>
            <Label htmlFor="category">Categoria</Label>
            <Select value={form.category} onValueChange={v => setForm(prev => ({ ...prev, category: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="activation_criteria">Critério de Ativação</Label>
            <Textarea
              id="activation_criteria"
              value={form.activation_criteria}
              onChange={e => setForm(prev => ({ ...prev, activation_criteria: e.target.value }))}
              placeholder="Descreva quando o agente deve ativar este módulo. Ex: 'Quando o cliente demonstra interesse em alugar um imóvel'"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="prompt_instructions">Instruções do Prompt</Label>
            <Textarea
              id="prompt_instructions"
              value={form.prompt_instructions}
              onChange={e => setForm(prev => ({ ...prev, prompt_instructions: e.target.value }))}
              placeholder="As instruções detalhadas que o agente seguirá quando este módulo estiver ativo..."
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={v => setForm(prev => ({ ...prev, is_active: v }))}
            />
            <Label>Módulo ativo</Label>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isLoading || !form.name.trim() || !form.prompt_instructions.trim()}>
            {isLoading ? 'Salvando...' : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
