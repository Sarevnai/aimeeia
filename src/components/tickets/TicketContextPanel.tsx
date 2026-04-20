// Sprint 6.1 — Painel de Contexto Vista
// Operador alimenta os campos que a Aimee pediu. Dados ficam em ticket_context_fields
// e são injetados no prompt da Aimee no próximo turno.

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ContextTemplateField {
  key: string;
  label: string;
  required?: boolean;
}

interface ContextFieldRow {
  id: string;
  field_key: string;
  field_value: string | null;
  filled_by: string | null;
  filled_at: string | null;
  requested_by_aimee: boolean;
}

interface TicketCategoryRow {
  id: string;
  name: string;
  context_template: ContextTemplateField[] | null;
  risk_level: 'baixo' | 'medio' | 'alto' | null;
  aimee_can_resolve: boolean;
}

interface Props {
  ticketId: string;
  categoryId: string | null;
}

export const TicketContextPanel: React.FC<Props> = ({ ticketId, categoryId }) => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [template, setTemplate] = useState<ContextTemplateField[]>([]);
  const [category, setCategory] = useState<TicketCategoryRow | null>(null);
  const [fields, setFields] = useState<Record<string, ContextFieldRow>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId || !ticketId) return;
    setLoading(true);

    const [{ data: cat }, { data: rows }] = await Promise.all([
      categoryId
        ? supabase
            .from('ticket_categories')
            .select('id, name, context_template, risk_level, aimee_can_resolve')
            .eq('id', categoryId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('ticket_context_fields')
        .select('id, field_key, field_value, filled_by, filled_at, requested_by_aimee')
        .eq('ticket_id', ticketId),
    ]);

    const catRow = cat as TicketCategoryRow | null;
    setCategory(catRow);
    const tpl = (catRow?.context_template || []) as ContextTemplateField[];
    setTemplate(Array.isArray(tpl) ? tpl : []);

    const byKey: Record<string, ContextFieldRow> = {};
    const draftMap: Record<string, string> = {};
    (rows || []).forEach((r: any) => {
      byKey[r.field_key] = r;
      draftMap[r.field_key] = r.field_value || '';
    });
    setFields(byKey);
    setDrafts(draftMap);
    setLoading(false);
  }, [tenantId, ticketId, categoryId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`ticket_ctx_${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_context_fields',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, ticketId]);

  const saveField = async (fieldKey: string) => {
    const value = drafts[fieldKey]?.trim() ?? '';
    if (!tenantId || !user?.id) return;

    setSavingKey(fieldKey);
    const existing = fields[fieldKey];

    const { error } = await supabase
      .from('ticket_context_fields')
      .upsert(
        {
          tenant_id: tenantId,
          ticket_id: ticketId,
          field_key: fieldKey,
          field_value: value || null,
          filled_by: value ? user.id : null,
          filled_at: value ? new Date().toISOString() : null,
          requested_by_aimee: existing?.requested_by_aimee ?? true,
        },
        { onConflict: 'ticket_id,field_key' },
      );

    setSavingKey(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
      return;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allFieldKeys = [
    ...template.map((t) => t.key),
    ...Object.keys(fields).filter((k) => !template.find((t) => t.key === k)),
  ];

  if (allFieldKeys.length === 0) {
    return (
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Contexto do Vista
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Esta categoria não exige contexto estruturado do Vista.
        </p>
      </div>
    );
  }

  const filledCount = allFieldKeys.filter((k) => fields[k]?.field_value).length;
  const totalCount = allFieldKeys.length;
  const allFilled = filledCount === totalCount;
  const isAltoRisco = category?.risk_level === 'alto' || category?.aimee_can_resolve === false;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-purple-500" />
          Contexto do Vista
        </label>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            allFilled ? 'border-green-500 text-green-700' : 'border-amber-500 text-amber-700',
          )}
        >
          {filledCount}/{totalCount} preenchidos
        </Badge>
      </div>

      {isAltoRisco && (
        <div className="mb-3 p-2 rounded-md bg-red-50 border border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800">
            Categoria de <strong>alto risco</strong>. Aimee não tenta resolver sozinha — um gerente assume.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mb-3">
        A Aimee está aguardando estes dados para responder o cliente. Consulte no Vista Office e preencha aqui.
      </p>

      <div className="space-y-2.5">
        {allFieldKeys.map((key) => {
          const tpl = template.find((t) => t.key === key);
          const row = fields[key];
          const label = tpl?.label || key.replace(/_/g, ' ');
          const required = tpl?.required;
          const isFilled = !!row?.field_value;
          const draft = drafts[key] ?? '';
          const dirty = draft !== (row?.field_value || '');

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium text-foreground/80">
                  {label}
                  {required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {isFilled && <Check className="h-3 w-3 text-green-600" />}
                {row?.requested_by_aimee && !isFilled && (
                  <Sparkles className="h-3 w-3 text-purple-500" title="Aimee está pedindo" />
                )}
              </div>
              <div className="flex gap-1">
                <Input
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  onBlur={() => {
                    if (dirty) saveField(key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (dirty) saveField(key);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder={`Cole do Vista…`}
                  className={cn(
                    'h-8 text-xs',
                    isFilled && !dirty && 'bg-green-50 border-green-200',
                    dirty && 'border-amber-400',
                  )}
                />
                {savingKey === key && <Loader2 className="h-3 w-3 animate-spin self-center" />}
              </div>
            </div>
          );
        })}
      </div>

      {allFilled && (
        <div className="mt-3 p-2 rounded-md bg-green-50 border border-green-200 text-[11px] text-green-800">
          ✓ Todos os dados foram confirmados. A Aimee usará estes valores no próximo turno com o cliente.
        </div>
      )}
    </div>
  );
};

export default TicketContextPanel;
