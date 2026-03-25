import React, { useState, useEffect } from 'react';
import { Brain, Plus, MoreVertical, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ModuleEditorSheet from '@/components/modules/ModuleEditorSheet';

interface AiModule {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  prompt_instructions: string;
  activation_criteria: string | null;
  is_active: boolean;
  sort_order: number;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

interface Tenant {
  id: string;
  company_name: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-100 text-gray-800',
  comercial: 'bg-emerald-100 text-emerald-800',
  admin: 'bg-blue-100 text-blue-800',
  remarketing: 'bg-purple-100 text-purple-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral',
  comercial: 'Comercial',
  admin: 'Administrativo',
  remarketing: 'Remarketing',
};

export default function AdminModulosPage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loadingTenants, setLoadingTenants] = useState(true);

  const [modules, setModules] = useState<AiModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<AiModule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiModule | null>(null);

  // Fetch tenants
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

  const fetchModules = async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ai_modules' as any)
      .select('*')
      .eq('tenant_id', selectedTenantId)
      .order('sort_order', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao carregar módulos', description: error.message, variant: 'destructive' });
    } else {
      setModules((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedTenantId) {
      fetchModules();
    } else {
      setModules([]);
    }
  }, [selectedTenantId]);

  const handleSave = async (moduleData: any) => {
    if (!selectedTenantId) return;
    setSaving(true);

    const payload = {
      tenant_id: selectedTenantId,
      name: moduleData.name,
      slug: moduleData.slug,
      description: moduleData.description || null,
      category: moduleData.category,
      prompt_instructions: moduleData.prompt_instructions,
      activation_criteria: moduleData.activation_criteria || null,
      is_active: moduleData.is_active,
      sort_order: moduleData.sort_order || modules.length,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (moduleData.id) {
      ({ error } = await supabase
        .from('ai_modules' as any)
        .update(payload)
        .eq('id', moduleData.id));
    } else {
      ({ error } = await supabase
        .from('ai_modules' as any)
        .insert(payload));
    }

    if (error) {
      toast({ title: 'Erro ao salvar módulo', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: moduleData.id ? 'Módulo atualizado' : 'Módulo criado' });
      setEditorOpen(false);
      setEditingModule(null);
      await fetchModules();
    }
    setSaving(false);
  };

  const handleToggle = async (mod: AiModule) => {
    const { error } = await supabase
      .from('ai_modules' as any)
      .update({ is_active: !mod.is_active, updated_at: new Date().toISOString() })
      .eq('id', mod.id);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_active: !m.is_active } : m));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('ai_modules' as any)
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Módulo excluído' });
      setDeleteTarget(null);
      await fetchModules();
    }
  };

  const openEditor = (mod?: AiModule) => {
    setEditingModule(mod || null);
    setEditorOpen(true);
  };

  const selectedTenantName = tenants.find(t => t.id === selectedTenantId)?.company_name;

  return (
    <div className="space-y-6 p-6">
      {/* Header with Tenant Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Módulos de Inteligência
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie módulos de qualquer tenant
            </p>
          </div>
          <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder={loadingTenants ? 'Carregando tenants...' : 'Selecione um tenant'} />
            </SelectTrigger>
            <SelectContent>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTenantName && (
            <Badge variant="outline" className="text-xs">
              {modules.length} módulo{modules.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {selectedTenantId && (
          <Button onClick={() => openEditor()} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Módulo
          </Button>
        )}
      </div>

      {/* Content */}
      {!selectedTenantId ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Selecione um tenant para gerenciar seus módulos
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : modules.length === 0 ? (
        <Card className="p-12 text-center">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2">Nenhum módulo criado</h3>
          <p className="text-muted-foreground mb-4">
            Este tenant ainda não possui módulos de inteligência
          </p>
          <Button onClick={() => openEditor()} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar primeiro módulo
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(mod => (
            <Card key={mod.id} className={`relative transition-opacity ${!mod.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${CATEGORY_COLORS[mod.category] || CATEGORY_COLORS.general}`}>
                      {mod.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{mod.name}</h3>
                      <code className="text-[10px] text-muted-foreground">{mod.slug}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={mod.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {mod.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditor(mod)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(mod)}>
                          {mod.is_active ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteTarget(mod)} className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-3">
                  <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[mod.category] || ''}`}>
                    {CATEGORY_LABELS[mod.category] || mod.category}
                  </Badge>
                </div>

                {mod.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{mod.description}</p>
                )}

                {mod.activation_criteria && (
                  <p className="text-[10px] text-muted-foreground mt-1 italic line-clamp-1">
                    Ativar: {mod.activation_criteria}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Sheet */}
      <ModuleEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        module={editingModule}
        onSave={handleSave}
        isLoading={saving}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir módulo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o módulo "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
