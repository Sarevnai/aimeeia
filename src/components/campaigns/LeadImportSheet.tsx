import React, { useCallback, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: (count: number) => void;
}

interface ParsedLead {
  crm_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  archive_reason: string;
  natureza: string;
  neighborhood: string;
  city: string;
  channel_source: string;
  department_code: string | null;
  team: string;
  property_code: string;
}

interface SegmentStat {
  motivo: string;
  count: number;
  aluguel: number;
  compra: number;
}

const INVALID_MOTIVOS = new Set([
  'Contato Inválido',
  'Lead duplicado',
  'De planilha',
  'Vendedor pesquisando produto',
  'Tratada sem qualificação',
  'Corretor Parceiro',
  'Faturado',
  'Já foi vendido',
  'DDD distante',
  'Não possui renda',
]);

const FONTE_MAP: Record<string, string> = {
  'Grupo Zap': 'grupozap',
  'Chaves na Mão': 'chavesnamao',
  'ImovelWeb': 'imovelweb',
  'WhatsApp': 'whatsapp',
  'Site Próprio': 'site',
  'Site Próprio (RM)': 'site',
};

const NATUREZA_TO_DEPT: Record<string, string | null> = {
  'Aluguel': 'locacao',
  'Compra': 'vendas',
  'Lançamento': 'vendas',
  'Indefinido': null,
};

function parseXLSX(buffer: ArrayBuffer): ParsedLead[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

  return rows.map((row) => ({
    crm_id: String(row['ID'] || ''),
    name: String(row['Nome do cliente'] || ''),
    email: String(row['E-mail'] || ''),
    phone: String(row['Telefone apenas dígitos'] || row['Telefone formatado'] || ''),
    status: String(row['Status'] || ''),
    archive_reason: String(row['Motivo de arquivamento'] || ''),
    natureza: String(row['Natureza da negociação'] || ''),
    neighborhood: String(row['Bairro'] || ''),
    city: String(row['Cidade'] || ''),
    channel_source: FONTE_MAP[String(row['Fonte'] || '')] || 'whatsapp',
    department_code: NATUREZA_TO_DEPT[String(row['Natureza da negociação'] || '')] ?? null,
    team: String(row['Equipe'] || ''),
    property_code: String(row['Código do Imóvel'] || ''),
  }));
}

function buildSegments(leads: ParsedLead[]): SegmentStat[] {
  const map = new Map<string, SegmentStat>();
  for (const l of leads) {
    if (l.status !== 'Arquivado' || !l.phone || INVALID_MOTIVOS.has(l.archive_reason)) continue;
    const existing = map.get(l.archive_reason) || {
      motivo: l.archive_reason,
      count: 0,
      aluguel: 0,
      compra: 0,
    };
    existing.count++;
    if (l.natureza === 'Aluguel') existing.aluguel++;
    if (l.natureza === 'Compra') existing.compra++;
    map.set(l.archive_reason, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

const LeadImportSheet: React.FC<Props> = ({ open, onOpenChange, onImported }) => {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [leads, setLeads] = useState<ParsedLead[]>([]);
  const [segments, setSegments] = useState<SegmentStat[]>([]);
  const [excludedMotivos, setExcludedMotivos] = useState<Set<string>>(new Set(INVALID_MOTIVOS));
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const totalLeads = leads.length;
  const archivedLeads = leads.filter((l) => l.status === 'Arquivado');
  const eligibleLeads = archivedLeads.filter(
    (l) => l.phone && !excludedMotivos.has(l.archive_reason),
  );

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseXLSX(e.target!.result as ArrayBuffer);
      setLeads(parsed);
      setSegments(buildSegments(parsed));
      setImportedCount(null);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const toggleMotivo = (motivo: string) => {
    setExcludedMotivos((prev) => {
      const next = new Set(prev);
      next.has(motivo) ? next.delete(motivo) : next.add(motivo);
      return next;
    });
  };

  const handleImport = async () => {
    if (!tenantId) return;
    setImporting(true);

    const toInsert = eligibleLeads.map((l) => ({
      tenant_id: tenantId,
      name: l.name || null,
      phone: l.phone,
      email: l.email || null,
      status: 'arquivado',
      crm_id: l.crm_id || null,
      crm_archive_reason: l.archive_reason || null,
      crm_natureza: l.natureza || null,
      neighborhood: l.neighborhood || null,
      city: l.city || null,
      channel_source: l.channel_source || null,
      department_code: (l.department_code as any) || null,
      tags: l.team ? [l.team] : null,
      notes: l.property_code ? `Imóvel C2S: ${l.property_code}` : null,
    }));

    // Batch in chunks of 500
    const CHUNK = 500;
    let total = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from('contacts')
        .upsert(chunk, { onConflict: 'tenant_id,phone', ignoreDuplicates: false })
        .select('id', { count: 'exact', head: true });

      if (error) {
        toast({ title: 'Erro ao importar', description: error.message, variant: 'destructive' });
        setImporting(false);
        return;
      }
      total += count || chunk.length;
    }

    setImportedCount(toInsert.length);
    setImporting(false);
    toast({ title: `${toInsert.length} leads importados`, description: 'Prontos para remarketing.' });
    onImported(toInsert.length);
  };

  const reset = () => {
    setLeads([]);
    setSegments([]);
    setImportedCount(null);
    setExcludedMotivos(new Set(INVALID_MOTIVOS));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="font-display">Importar Lista de Leads</SheetTitle>
          <SheetDescription>
            Suba um arquivo XLSX do CRM (C2S, Construtor de Vendas, etc). Apenas leads arquivados
            com telefone válido serão importados.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {/* Upload zone */}
          {leads.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-accent" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">Arraste o arquivo ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : importedCount !== null ? (
            /* Success state */
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500" />
              <div>
                <p className="text-xl font-bold">{importedCount} leads importados</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Prontos para criar uma campanha de remarketing.
                </p>
              </div>
              <Button variant="outline" onClick={reset}>
                Importar outro arquivo
              </Button>
            </div>
          ) : (
            /* Preview state */
            <div className="space-y-5">
              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{totalLeads.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-muted-foreground">Total no arquivo</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {archivedLeads.length.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-amber-600">Arquivados</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {eligibleLeads.length.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-green-600">Para importar</p>
                </div>
              </div>

              {/* Segments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Segmentos</p>
                  <p className="text-xs text-muted-foreground">
                    Desmarque para excluir da importação
                  </p>
                </div>
                <div className="space-y-1.5">
                  {segments.map((seg) => {
                    const excluded = excludedMotivos.has(seg.motivo);
                    return (
                      <label
                        key={seg.motivo}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={!excluded}
                          onCheckedChange={() => toggleMotivo(seg.motivo)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${excluded ? 'line-through text-muted-foreground' : ''}`}>
                            {seg.motivo}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {seg.aluguel > 0 && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                              Alug. {seg.aluguel}
                            </Badge>
                          )}
                          {seg.compra > 0 && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
                              Comp. {seg.compra}
                            </Badge>
                          )}
                          <span className="text-sm font-semibold w-8 text-right">{seg.count}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Invalid contacts notice */}
              {archivedLeads.filter((l) => !l.phone).length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    {archivedLeads.filter((l) => !l.phone).length} leads arquivados sem telefone
                    foram automaticamente excluídos.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  reset();
                  setTimeout(() => fileRef.current?.click(), 100);
                }}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Trocar arquivo
              </Button>
            </div>
          )}
        </ScrollArea>

        {leads.length > 0 && importedCount === null && (
          <div className="px-6 py-4 border-t bg-card">
            <Button
              className="w-full"
              onClick={handleImport}
              disabled={importing || eligibleLeads.length === 0}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Importar {eligibleLeads.length.toLocaleString('pt-BR')} leads arquivados
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default LeadImportSheet;
