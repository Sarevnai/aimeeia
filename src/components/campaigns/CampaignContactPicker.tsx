import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Users, Phone, CalendarIcon, X, Check, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusBadgeClass, STATUS_OPTIONS } from '@/lib/campaign-badges';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

export interface PickerContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  department_code: string | null;
  crm_status: string | null;
  crm_archive_reason: string | null;
  crm_natureza: string | null;
  crm_source: string | null;
  crm_neighborhood: string | null;
  crm_city: string | null;
  channel_source: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string | null;
}

type SortOrder = 'name_asc' | 'name_desc' | 'recent' | 'oldest';

interface Props {
  tenantId: string;
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  initialStatusFilter?: string;
}

const NATUREZA_OPTIONS_FALLBACK = ['venda', 'locacao', 'locação', 'temporada'];

/* ─── Multi-select via Popover + Command-ish list ─── */
const MultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
}> = ({ label, options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);

  if (options.length === 0) return null;

  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs justify-between gap-1.5 bg-muted/40 font-normal"
        >
          <span className="truncate max-w-[140px]">
            {selected.size === 0 ? (placeholder || label) : `${label}: ${selected.size}`}
          </span>
          <Filter className="h-3 w-3 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold">{label}</p>
          {selected.size > 0 && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onChange(new Set())}
            >
              Limpar
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[240px]">
          <div className="p-1">
            {options.map((opt) => {
              const active = selected.has(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={cn(
                    'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted',
                    active && 'bg-primary/5'
                  )}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0',
                      active ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                    )}
                  >
                    {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate flex-1">{opt || '—'}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

const CampaignContactPicker: React.FC<Props> = ({ tenantId, selectedIds, onChange, initialStatusFilter }) => {
  const [contacts, setContacts] = useState<PickerContact[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all');
  const [archiveReasons, setArchiveReasons] = useState<Set<string>>(new Set());
  const [naturezas, setNaturezas] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [neighborhoods, setNeighborhoods] = useState<Set<string>>(new Set());
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<Set<string>>(new Set());
  const [tagsFilter, setTagsFilter] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dateField, setDateField] = useState<'created_at' | 'updated_at'>('created_at');
  const [sort, setSort] = useState<SortOrder>('name_asc');

  /* Fetch all contacts (paginated, dnc=false, phone_valid!=false) */
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    (async () => {
      const PAGE = 1000;
      const all: PickerContact[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from('contacts')
          .select(
            'id, name, phone, email, department_code, crm_status, crm_archive_reason, crm_natureza, crm_source, crm_neighborhood, crm_city, channel_source, tags, created_at, updated_at, dnc, phone_valid'
          )
          .eq('tenant_id', tenantId)
          .eq('dnc', false)
          .neq('phone_valid', false)
          .order('name')
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as PickerContact[]));
        if (data.length < PAGE) break;
      }
      setContacts(all);
      setLoading(false);
    })();
  }, [tenantId]);

  /* Distinct option sets from loaded contacts */
  const distinct = useMemo(() => {
    const reasons = new Set<string>();
    const nats = new Set<string>();
    const srcs = new Set<string>();
    const hoods = new Set<string>();
    const cts = new Set<string>();
    const depts = new Set<string>();
    const tgs = new Set<string>();
    for (const c of contacts) {
      if (c.crm_archive_reason) reasons.add(c.crm_archive_reason);
      if (c.crm_natureza) nats.add(c.crm_natureza);
      if (c.crm_source) srcs.add(c.crm_source);
      if (c.channel_source) srcs.add(c.channel_source);
      if (c.crm_neighborhood) hoods.add(c.crm_neighborhood);
      if (c.crm_city) cts.add(c.crm_city);
      if (c.department_code) depts.add(c.department_code);
      if (Array.isArray(c.tags)) c.tags.forEach((t) => t && tgs.add(t));
    }
    const natsArr = Array.from(nats);
    return {
      reasons: Array.from(reasons).sort(),
      naturezas: natsArr.length ? natsArr.sort() : NATUREZA_OPTIONS_FALLBACK,
      sources: Array.from(srcs).sort(),
      neighborhoods: Array.from(hoods).sort(),
      cities: Array.from(cts).sort(),
      departments: Array.from(depts).sort(),
      tags: Array.from(tgs).sort(),
    };
  }, [contacts]);

  /* Filter + sort */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateRange?.from ? dateRange.from.getTime() : null;
    const toTs = dateRange?.to ? dateRange.to.getTime() + 86_400_000 - 1 : (fromTs ? fromTs + 86_400_000 - 1 : null);

    const out = contacts.filter((c) => {
      if (statusFilter === 'sem_status') {
        if (c.crm_status) return false;
      } else if (statusFilter !== 'all') {
        if (c.crm_status !== statusFilter) return false;
      }
      if (archiveReasons.size && !(c.crm_archive_reason && archiveReasons.has(c.crm_archive_reason))) return false;
      if (naturezas.size && !(c.crm_natureza && naturezas.has(c.crm_natureza))) return false;
      if (sources.size) {
        const hit = (c.crm_source && sources.has(c.crm_source)) || (c.channel_source && sources.has(c.channel_source));
        if (!hit) return false;
      }
      if (neighborhoods.size && !(c.crm_neighborhood && neighborhoods.has(c.crm_neighborhood))) return false;
      if (cities.size && !(c.crm_city && cities.has(c.crm_city))) return false;
      if (departments.size && !(c.department_code && departments.has(c.department_code))) return false;
      if (tagsFilter.size) {
        if (!Array.isArray(c.tags) || !c.tags.some((t) => tagsFilter.has(t))) return false;
      }
      if (fromTs !== null) {
        const raw = dateField === 'updated_at' ? c.updated_at : c.created_at;
        if (!raw) return false;
        const ts = new Date(raw).getTime();
        if (ts < fromTs || (toTs !== null && ts > toTs)) return false;
      }
      if (q) {
        const hay = `${(c.name || '').toLowerCase()} ${c.phone} ${(c.email || '').toLowerCase()}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    out.sort((a, b) => {
      if (sort === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      const ak = new Date(a.updated_at || a.created_at).getTime();
      const bk = new Date(b.updated_at || b.created_at).getTime();
      return sort === 'recent' ? bk - ak : ak - bk;
    });

    return out;
  }, [contacts, search, statusFilter, archiveReasons, naturezas, sources, neighborhoods, cities, departments, tagsFilter, dateRange, dateField, sort]);

  /* Selection helpers */
  const filteredSelectedCount = useMemo(
    () => filtered.reduce((n, c) => n + (selectedIds.has(c.id) ? 1 : 0), 0),
    [filtered, selectedIds]
  );
  const allFilteredSelected = filtered.length > 0 && filteredSelectedCount === filtered.length;
  const someFilteredSelected = filteredSelectedCount > 0 && !allFilteredSelected;

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const toggleAllFiltered = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      filtered.forEach((c) => next.delete(c.id));
    } else {
      filtered.forEach((c) => next.add(c.id));
    }
    onChange(next);
  };

  const invertFiltered = () => {
    const next = new Set(selectedIds);
    filtered.forEach((c) => {
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
    });
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setArchiveReasons(new Set());
    setNaturezas(new Set());
    setSources(new Set());
    setNeighborhoods(new Set());
    setCities(new Set());
    setDepartments(new Set());
    setTagsFilter(new Set());
    setDateRange(undefined);
    setSort('name_asc');
  };

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    archiveReasons.size +
    naturezas.size +
    sources.size +
    neighborhoods.size +
    cities.size +
    departments.size +
    tagsFilter.size +
    (dateRange?.from ? 1 : 0);

  /* Windowed rendering — render only the rows in the scroll viewport.
     Avoids react-window v2 sizing quirks while keeping 6k+ rows smooth. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const ROW_H = 60;
  const VIEWPORT_H = 420;
  const OVERSCAN = 6;
  const totalHeight = filtered.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN);
  const visibleRows = filtered.slice(startIdx, endIdx);

  return (
    <div className="space-y-3">
      {/* Top bar: search + status + sort */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, telefone ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/40 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[170px] h-9 text-sm bg-muted/40">
            <SelectValue placeholder="Status do lead" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOrder)}>
          <SelectTrigger className="sm:w-[160px] h-9 text-sm bg-muted/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Nome A-Z</SelectItem>
            <SelectItem value="name_desc">Nome Z-A</SelectItem>
            <SelectItem value="recent">Mais recente</SelectItem>
            <SelectItem value="oldest">Mais antigo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Motivo" options={distinct.reasons} selected={archiveReasons} onChange={setArchiveReasons} />
        <MultiSelect label="Natureza" options={distinct.naturezas} selected={naturezas} onChange={setNaturezas} />
        <MultiSelect label="Fonte" options={distinct.sources} selected={sources} onChange={setSources} />
        <MultiSelect label="Bairro" options={distinct.neighborhoods} selected={neighborhoods} onChange={setNeighborhoods} />
        <MultiSelect label="Cidade" options={distinct.cities} selected={cities} onChange={setCities} />
        <MultiSelect label="Depto" options={distinct.departments} selected={departments} onChange={setDepartments} />
        <MultiSelect label="Tags" options={distinct.tags} selected={tagsFilter} onChange={setTagsFilter} />

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 bg-muted/40 font-normal">
              <CalendarIcon className="h-3 w-3 opacity-60" />
              {dateRange?.from
                ? dateRange.to
                  ? `${format(dateRange.from, 'dd/MM/yy', { locale: ptBR })} → ${format(dateRange.to, 'dd/MM/yy', { locale: ptBR })}`
                  : format(dateRange.from, 'dd/MM/yy', { locale: ptBR })
                : 'Período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-2 border-b border-border flex items-center justify-between gap-2">
              <Select value={dateField} onValueChange={(v) => setDateField(v as 'created_at' | 'updated_at')}>
                <SelectTrigger className="h-7 text-xs w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Criação</SelectItem>
                  <SelectItem value="updated_at">Última atividade</SelectItem>
                </SelectContent>
              </Select>
              {dateRange && (
                <button
                  onClick={() => setDateRange(undefined)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} locale={ptBR} />
          </PopoverContent>
        </Popover>

        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" /> Limpar filtros ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Selection bar */}
      <div className="flex items-center justify-between gap-2 px-1 py-1.5 bg-muted/30 rounded-md border border-border">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
            onCheckedChange={toggleAllFiltered}
            disabled={filtered.length === 0}
          />
          <span className="text-xs">
            {filteredSelectedCount > 0 ? (
              <>
                <strong className="text-primary">{filteredSelectedCount.toLocaleString('pt-BR')}</strong>
                <span className="text-muted-foreground"> de {filtered.length.toLocaleString('pt-BR')} filtrados</span>
                {selectedIds.size !== filteredSelectedCount && (
                  <span className="text-muted-foreground"> · {selectedIds.size.toLocaleString('pt-BR')} no total</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                Nenhum selecionado · {filtered.length.toLocaleString('pt-BR')} filtrados
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {filtered.length > 0 && (
            <button onClick={invertFiltered} className="text-[11px] text-muted-foreground hover:text-foreground px-2">
              Inverter
            </button>
          )}
          {selectedIds.size > 0 && (
            <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground px-2">
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum contato corresponde aos filtros</p>
          <p className="text-xs text-muted-foreground mt-1">
            {contacts.length === 0 ? 'Este tenant ainda não tem contatos elegíveis.' : 'Ajuste os filtros acima.'}
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="rounded-lg border border-border bg-background overflow-auto"
          style={{ height: VIEWPORT_H }}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleRows.map((c, i) => {
              const checked = selectedIds.has(c.id);
              const top = (startIdx + i) * ROW_H;
              return (
                <div
                  key={c.id}
                  style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H, padding: '2px 4px' }}
                >
                  <button
                    type="button"
                    onClick={() => toggleOne(c.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg p-2.5 border text-left w-full h-full transition-colors',
                      checked ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/30'
                    )}
                  >
                    <Checkbox checked={checked} className="shrink-0 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                        {c.crm_neighborhood && <span className="truncate">· {c.crm_neighborhood}</span>}
                      </p>
                    </div>
                    {c.crm_natureza && (
                      <Badge variant="outline" className="text-[10px] shrink-0 hidden md:inline-flex">
                        {c.crm_natureza}
                      </Badge>
                    )}
                    {c.crm_status && (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] shrink-0 font-medium', statusBadgeClass(c.crm_status))}
                        title={c.crm_archive_reason ? `Motivo: ${c.crm_archive_reason}` : undefined}
                      >
                        {c.crm_status}
                      </Badge>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignContactPicker;
