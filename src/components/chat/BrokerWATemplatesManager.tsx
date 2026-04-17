import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, GripVertical, Lock, Save, X } from 'lucide-react';

interface WATemplate {
  id: string;
  label: string;
  icon: string;
  text_template: string;
  sort_order: number;
  profile_id: string | null;
  is_active: boolean;
}

interface BrokerWATemplatesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BrokerWATemplatesManager({ open, onOpenChange }: BrokerWATemplatesManagerProps) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [templates, setTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editText, setEditText] = useState('');
  const [isNew, setIsNew] = useState(false);

  const fetchTemplates = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from('broker_wa_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`profile_id.is.null,profile_id.eq.${user?.id}`)
      .eq('is_active', true)
      .order('sort_order');
    setTemplates((data as WATemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, tenantId]);

  const startEdit = (t: WATemplate) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditIcon(t.icon);
    setEditText(t.text_template);
    setIsNew(false);
  };

  const startNew = () => {
    setEditingId('new');
    setEditLabel('');
    setEditIcon('💬');
    setEditText('');
    setIsNew(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel('');
    setEditIcon('');
    setEditText('');
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!tenantId || !user?.id || !editLabel.trim() || !editText.trim()) return;

    if (isNew) {
      await supabase.from('broker_wa_templates').insert({
        tenant_id: tenantId,
        profile_id: user.id,
        label: editLabel.trim(),
        icon: editIcon.trim() || '💬',
        text_template: editText.trim(),
        sort_order: templates.length + 1,
      });
    } else if (editingId) {
      await supabase.from('broker_wa_templates')
        .update({
          label: editLabel.trim(),
          icon: editIcon.trim() || '💬',
          text_template: editText.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);
    }

    cancelEdit();
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que quer excluir este modelo?')) return;
    await supabase.from('broker_wa_templates').delete().eq('id', id);
    fetchTemplates();
  };

  const isDefault = (t: WATemplate) => t.profile_id === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Meus Modelos de WhatsApp</DialogTitle>
          <DialogDescription>
            Gerencie seus modelos de mensagem para o WhatsApp.
            Use variáveis: {'{{lead_nome}}'}, {'{{corretor_nome}}'}, {'{{empresa}}'}, {'{{qualificacao}}'}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : (
            <>
              {templates.map((t) => (
                <div key={t.id} className="rounded-lg border border-border p-3">
                  {editingId === t.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={editIcon}
                          onChange={(e) => setEditIcon(e.target.value)}
                          className="w-14 text-center"
                          maxLength={4}
                        />
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Nome do modelo"
                          className="flex-1"
                        />
                      </div>
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Texto da mensagem..."
                        rows={4}
                        className="text-sm resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={!editLabel.trim() || !editText.trim()}>
                          <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{t.label}</p>
                          {isDefault(t) && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> Padrão
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.text_template}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!isDefault(t) && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {editingId === 'new' && (
                <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={editIcon}
                      onChange={(e) => setEditIcon(e.target.value)}
                      className="w-14 text-center"
                      maxLength={4}
                      placeholder="💬"
                    />
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Nome do modelo"
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Ex: Olá {{lead_nome}}! Sou {{corretor_nome}} da {{empresa}}..."
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!editLabel.trim() || !editText.trim()}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          {editingId !== 'new' && (
            <Button variant="outline" size="sm" onClick={startNew} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Criar novo modelo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
