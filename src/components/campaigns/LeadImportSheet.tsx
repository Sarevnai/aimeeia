import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  parseC2SObservacoes,
  toContactCrmColumns,
} from '@/lib/c2s-observacoes-parser';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

interface C2SRow {
  nome?: string;
  telefone?: string | number;
  email?: string;
  departamento?: string;
  tipo?: string;
  observacoes?: string;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && !digits.startsWith('55')) return '55' + digits;
  return digits;
};

const mapDepartment = (raw: string): 'vendas' | 'locacao' | 'administrativo' | null => {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('vend')) return 'vendas';
  if (lower.includes('loc') || lower.includes('alug')) return 'locacao';
  if (lower.includes('admin')) return 'administrativo';
  return null;
};

const BATCH_SIZE = 100;

const LeadImportSheet: React.FC<Props> = ({ open, onOpenChange, onImported }) => {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<C2SRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFileName('');
    setRows([]);
    setImporting(false);
    setProgress(0);
    setResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!importing) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<C2SRow>(sheet, { defval: '' });
        setRows(json);
      } catch (err) {
        toast({
          title: 'Erro ao ler arquivo',
          description: 'Verifique se o formato é .xlsx válido.',
          variant: 'destructive',
        });
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
    // permite re-selecionar o mesmo arquivo depois
    e.target.value = '';
  };

  const previewRows = useMemo(() => {
    return rows.slice(0, 5).map((row) => {
      const ctx = parseC2SObservacoes(String(row.observacoes || ''));
      return {
        nome: String(row.nome || '—'),
        telefone: String(row.telefone || '—'),
        motivo: ctx.motivo || '—',
        bairro: ctx.bairro || '—',
        preco: ctx.preco || '—',
      };
    });
  }, [rows]);

  const runImport = async () => {
    if (!tenantId || rows.length === 0) return;

    setImporting(true);
    setProgress(0);
    setResult(null);

    const skippedReasons: string[] = [];
    const errors: string[] = [];

    // Constrói payloads com parsing
    const payloads = rows
      .map((row, idx) => {
        const rawPhone = String(row.telefone ?? '').trim();
        const phone = normalizePhone(rawPhone);
        if (!phone || phone.length < 10) {
          skippedReasons.push(`Linha ${idx + 2}: telefone inválido "${rawPhone}"`);
          return null;
        }

        const rawObs = String(row.observacoes || '').trim();
        const ctx = parseC2SObservacoes(rawObs);
        const crmCols = toContactCrmColumns(ctx);
        const dept = mapDepartment(String(row.departamento || ''));

        return {
          tenant_id: tenantId,
          name: String(row.nome || '').trim() || null,
          phone,
          email: String(row.email || '').trim() || null,
          department_code: dept,
          // contact_type tem CHECK constraint (lead/proprietario/inquilino) — forçamos 'lead'
          // e marcamos a origem via channel_source + tags pra filtro futuro.
          contact_type: 'lead' as const,
          channel_source: 'remarketing_c2s',
          tags: ['remarketing_c2s'],
          notes: rawObs || null, // mantém blob original como fallback
          crm_natureza: dept ?? null, // redundância intencional
          ...crmCols,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (payloads.length === 0) {
      toast({
        title: 'Nenhum contato válido na planilha',
        variant: 'destructive',
      });
      setImporting(false);
      return;
    }

    let insertedTotal = 0;

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('contacts')
        .upsert(batch, { onConflict: 'phone,tenant_id', ignoreDuplicates: false })
        .select('id');

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        insertedTotal += data?.length || 0;
      }
      setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / payloads.length) * 100)));
    }

    const finalResult: ImportResult = {
      inserted: insertedTotal,
      skipped: skippedReasons.length,
      errors,
    };
    setResult(finalResult);
    setImporting(false);

    toast({
      title: 'Importação concluída',
      description: `${insertedTotal} contatos importados • ${skippedReasons.length} ignorados${errors.length > 0 ? ` • ${errors.length} erros` : ''}`,
      variant: errors.length > 0 ? 'destructive' : 'default',
    });

    if (insertedTotal > 0) onImported?.();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Lista C2S (Remarketing)
          </SheetTitle>
          <SheetDescription>
            Envie uma planilha exportada do C2S com as colunas{' '}
            <code className="text-xs">nome, telefone, email, departamento, tipo, observacoes</code>.
            A coluna <code className="text-xs">observacoes</code> será parseada automaticamente
            (motivo, status, imóvel, bairro, preço, fonte, obs) e cada campo vira um atributo
            que a Aimee vê durante o atendimento.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent transition-colors">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              {fileName || 'Nenhum arquivo selecionado'}
            </p>
            <label className="inline-block">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                disabled={importing}
              />
              <Button variant="outline" size="sm" asChild disabled={importing}>
                <span>Selecionar .xlsx</span>
              </Button>
            </label>
          </div>

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {rows.length} linhas detectadas • preview das 5 primeiras:
                </p>
              </div>
              <ScrollArea className="h-64 rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-medium">Nome</th>
                      <th className="p-2 text-left font-medium">Telefone</th>
                      <th className="p-2 text-left font-medium">Motivo</th>
                      <th className="p-2 text-left font-medium">Bairro</th>
                      <th className="p-2 text-left font-medium">Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.nome}</td>
                        <td className="p-2">{r.telefone}</td>
                        <td className="p-2 max-w-[140px] truncate">{r.motivo}</td>
                        <td className="p-2">{r.bairro}</td>
                        <td className="p-2">{r.preco}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Importando... {progress}%
              </AlertDescription>
            </Alert>
          )}

          {/* Result */}
          {result && (
            <Alert variant={result.errors.length > 0 ? 'destructive' : 'default'}>
              {result.errors.length > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-medium">Importação concluída</div>
                <div className="text-xs mt-1">
                  {result.inserted} contatos importados
                  {result.skipped > 0 && ` • ${result.skipped} ignorados (telefone inválido)`}
                  {result.errors.length > 0 && ` • ${result.errors.length} erros`}
                </div>
                {result.errors.length > 0 && (
                  <ul className="text-xs mt-2 list-disc list-inside">
                    {result.errors.slice(0, 3).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={importing}
            >
              {result ? 'Fechar' : 'Cancelar'}
            </Button>
            {rows.length > 0 && !result && (
              <Button onClick={runImport} disabled={importing || !tenantId}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>Importar {rows.length} contatos</>
                )}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LeadImportSheet;
