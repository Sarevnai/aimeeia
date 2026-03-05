import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Loader2, ChevronLeft, ChevronRight, Check,
    Megaphone, Home, Wifi, WifiOff, MessageSquare,
    Calendar, Clock, Users, FileText, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

/* ─── Types ─── */
interface Tenant {
    id: string;
    company_name: string;
    wa_phone_number_id: string | null;
    waba_id: string | null;
    is_active: boolean;
}

interface WhatsappTemplate {
    id: string;
    name: string;
    category: string | null;
    language: string | null;
    components: Json | null;
}

interface TemplateComponent {
    type: string;
    format?: string;
    text?: string;
    buttons?: { type: string; text: string }[];
}

type CampaignType = 'marketing' | 'atualizacao';
type Step = 1 | 2 | 3 | 4 | 5;

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onCreated: () => void;
    preselectedTenantId?: string | null;
}

/* ─── Template Preview ─── */
const TemplatePreview: React.FC<{ components: Json | null }> = ({ components }) => {
    if (!components || !Array.isArray(components)) return null;
    const comps = components as unknown as TemplateComponent[];
    const body = comps.find((c) => c.type === 'BODY');
    const header = comps.find((c) => c.type === 'HEADER');
    const footer = comps.find((c) => c.type === 'FOOTER');

    return (
        <div className="bg-[#e5ddd5] rounded-xl p-3 max-w-xs">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden text-sm">
                {header?.text && <div className="p-3 pb-0 font-bold">{header.text}</div>}
                {body?.text && <div className="p-3 whitespace-pre-wrap leading-relaxed">{body.text}</div>}
                {footer?.text && <div className="px-3 pb-2 text-[11px] text-muted-foreground">{footer.text}</div>}
            </div>
        </div>
    );
};

/* ─── Step indicator ─── */
const STEPS_MARKETING = ['Tipo', 'Tenant', 'Template', 'Audiência', 'Agendar'];
const STEPS_ATUALIZACAO = ['Tipo', 'Tenant', 'Mensagem', 'Audiência', 'Agendar'];

/* ─── Main Component ─── */
const AdminNewCampaignSheet: React.FC<Props> = ({ open, onOpenChange, onCreated, preselectedTenantId }) => {
    const { toast } = useToast();

    const [step, setStep] = useState<Step>(1);
    const [submitting, setSubmitting] = useState(false);

    // Step 1
    const [campaignType, setCampaignType] = useState<CampaignType>('marketing');

    // Step 2
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loadingTenants, setLoadingTenants] = useState(false);
    const [selectedTenantId, setSelectedTenantId] = useState<string>('');

    // Step 3 — marketing only
    const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

    // Step 3 — atualizacao only
    const [customMessage, setCustomMessage] = useState('');

    // Step 4
    const [campaignName, setCampaignName] = useState('');
    const [campaignDesc, setCampaignDesc] = useState('');

    // Step 5
    const [scheduleDate, setScheduleDate] = useState('');
    const [schedulePeriod, setSchedulePeriod] = useState('');

    const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    const steps = campaignType === 'marketing' ? STEPS_MARKETING : STEPS_ATUALIZACAO;

    /* ── Reset on open ── */
    useEffect(() => {
        if (!open) return;
        setStep(1);
        setCampaignType('marketing');
        setSelectedTenantId(preselectedTenantId || '');
        setSelectedTemplateId('');
        setCustomMessage('');
        setCampaignName('');
        setCampaignDesc('');
        setScheduleDate('');
        setSchedulePeriod('');
    }, [open, preselectedTenantId]);

    /* ── Fetch tenants ── */
    useEffect(() => {
        if (!open || step !== 2) return;
        setLoadingTenants(true);
        supabase
            .from('tenants')
            .select('id, company_name, wa_phone_number_id, waba_id, is_active')
            .eq('is_active', true)
            .order('company_name')
            .then(({ data }) => {
                setTenants((data as Tenant[]) ?? []);
                setLoadingTenants(false);
            });
    }, [open, step]);

    /* ── Fetch templates when step 3 (marketing) ── */
    useEffect(() => {
        if (!open || step !== 3 || campaignType !== 'marketing' || !selectedTenantId) return;
        setLoadingTemplates(true);
        supabase
            .from('whatsapp_templates')
            .select('id, name, category, language, components')
            .eq('tenant_id', selectedTenantId)
            .eq('status', 'APPROVED')
            .order('name')
            .then(({ data }) => {
                setTemplates(data ?? []);
                setLoadingTemplates(false);
            });
    }, [open, step, campaignType, selectedTenantId]);

    /* ── Validation per step ── */
    const canNext = () => {
        if (step === 1) return true;
        if (step === 2) return !!selectedTenantId;
        if (step === 3) {
            if (campaignType === 'marketing') return !!selectedTemplateId;
            return customMessage.trim().length > 10;
        }
        if (step === 4) return campaignName.trim().length > 0;
        return !!scheduleDate && !!schedulePeriod;
    };

    const next = () => setStep((s) => Math.min(s + 1, 5) as Step);
    const back = () => setStep((s) => Math.max(s - 1, 1) as Step);

    /* ── Submit ── */
    const handleSubmit = async () => {
        if (!selectedTenantId) return;
        setSubmitting(true);

        if (campaignType === 'marketing') {
            const templateName = selectedTemplate?.name || null;
            const { error } = await supabase.from('campaigns').insert({
                tenant_id: selectedTenantId,
                name: campaignName.trim(),
                template_name: templateName,
                status: 'draft',
                sent_count: 0,
                delivered_count: 0,
            });
            if (error) {
                toast({ title: 'Erro ao criar campanha', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: '✅ Campanha criada!', description: `"${campaignName}" agendada para ${scheduleDate}.` });
                onOpenChange(false);
                onCreated();
            }
        } else {
            const { error } = await supabase.from('owner_update_campaigns').insert({
                tenant_id: selectedTenantId,
                name: campaignName.trim(),
                description: campaignDesc.trim() || null,
                message_template: customMessage.trim() || null,
                status: 'draft',
                scheduled_date: scheduleDate || null,
            });
            if (error) {
                toast({ title: 'Erro ao criar pedido', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: '✅ Pedido de atualização criado!', description: `"${campaignName}" agendado para ${scheduleDate}.` });
                onOpenChange(false);
                onCreated();
            }
        }

        setSubmitting(false);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                    <SheetTitle className="font-display flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Megaphone className="h-4 w-4 text-primary" />
                        </div>
                        Nova Campanha
                    </SheetTitle>
                    {/* Step bar */}
                    <div className="flex items-center gap-1.5 pt-3">
                        {steps.map((label, i) => (
                            <React.Fragment key={i}>
                                <div className={cn(
                                    'flex items-center gap-1.5 text-xs font-medium',
                                    i + 1 === step ? 'text-foreground' : i + 1 < step ? 'text-primary' : 'text-muted-foreground'
                                )}>
                                    <div className={cn(
                                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                                        i + 1 < step ? 'bg-primary text-primary-foreground' :
                                            i + 1 === step ? 'border-2 border-primary text-primary' :
                                                'border border-muted-foreground/40 text-muted-foreground'
                                    )}>
                                        {i + 1 < step ? <Check className="h-3 w-3" /> : i + 1}
                                    </div>
                                    <span className="hidden sm:block">{label}</span>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className={cn('flex-1 h-px', i + 1 < step ? 'bg-primary' : 'bg-border')} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </SheetHeader>

                {/* Content */}
                <div className="flex-1 overflow-auto px-6 py-6 space-y-5">

                    {/* STEP 1 — Campaign type */}
                    {step === 1 && (
                        <div className="animate-fade-in space-y-4">
                            <div>
                                <h3 className="text-lg font-display font-bold text-foreground mb-1">Tipo de campanha</h3>
                                <p className="text-sm text-muted-foreground">Escolha o objetivo desta campanha.</p>
                            </div>
                            <div className="grid gap-3">
                                {[
                                    {
                                        value: 'marketing' as CampaignType,
                                        icon: <Megaphone className="h-5 w-5" />,
                                        title: 'Marketing',
                                        desc: 'Envio em massa com templates Meta aprovados para leads e contatos.',
                                    },
                                    {
                                        value: 'atualizacao' as CampaignType,
                                        icon: <Home className="h-5 w-5" />,
                                        title: 'Atualização de Carteira',
                                        desc: 'Contata proprietários para atualizar status e disponibilidade dos imóveis.',
                                    },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setCampaignType(opt.value)}
                                        className={cn(
                                            'flex items-start gap-4 rounded-xl p-4 border text-left transition-all',
                                            campaignType === opt.value
                                                ? 'border-primary bg-primary/5 shadow-sm'
                                                : 'border-border hover:border-primary/40 hover:bg-muted/30'
                                        )}
                                    >
                                        <div className={cn(
                                            'p-2 rounded-lg shrink-0',
                                            campaignType === opt.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                        )}>
                                            {opt.icon}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                        </div>
                                        {campaignType === opt.value && (
                                            <Check className="h-4 w-4 text-primary ml-auto shrink-0 mt-0.5" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 2 — Tenant */}
                    {step === 2 && (
                        <div className="animate-fade-in space-y-4">
                            <div>
                                <h3 className="text-lg font-display font-bold text-foreground mb-1">Tenant / WABA</h3>
                                <p className="text-sm text-muted-foreground">A campanha será disparada via o número WABA configurado.</p>
                            </div>
                            {loadingTenants ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : (
                                <div className="space-y-2">
                                    {tenants.map((t) => {
                                        const hasWABA = !!t.wa_phone_number_id;
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => hasWABA && setSelectedTenantId(t.id)}
                                                disabled={!hasWABA}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-xl p-3.5 border text-left w-full transition-all',
                                                    selectedTenantId === t.id ? 'border-primary bg-primary/5' :
                                                        hasWABA ? 'border-border hover:border-primary/40 hover:bg-muted/30' :
                                                            'border-border opacity-50 cursor-not-allowed'
                                                )}
                                            >
                                                <div className="p-2 rounded-lg bg-muted shrink-0">
                                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-foreground truncate">{t.company_name}</p>
                                                    {hasWABA ? (
                                                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                                            #{t.wa_phone_number_id}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-destructive mt-0.5">WABA não configurado</p>
                                                    )}
                                                </div>
                                                {hasWABA ? (
                                                    <Wifi className="h-4 w-4 text-success shrink-0" />
                                                ) : (
                                                    <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
                                                )}
                                                {selectedTenantId === t.id && (
                                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3 — Template (marketing) or Custom message (atualizacao) */}
                    {step === 3 && campaignType === 'marketing' && (
                        <div className="animate-fade-in space-y-4">
                            <div>
                                <h3 className="text-lg font-display font-bold text-foreground mb-1">Template Meta</h3>
                                <p className="text-sm text-muted-foreground">Templates aprovados de <strong>{selectedTenant?.company_name}</strong>.</p>
                            </div>
                            {loadingTemplates ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : templates.length === 0 ? (
                                <div className="flex flex-col items-center py-10 text-center">
                                    <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                                    <p className="text-sm font-medium">Sem templates aprovados</p>
                                    <p className="text-xs text-muted-foreground mt-1">Crie e aguarde aprovação da Meta em Modelos → Tenant.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {templates.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTemplateId(t.id)}
                                            className={cn(
                                                'flex items-start gap-3 rounded-xl p-3.5 border text-left w-full transition-all',
                                                selectedTemplateId === t.id
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:border-primary/40 hover:bg-muted/30'
                                            )}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold font-mono text-foreground">{t.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {t.category && (
                                                        <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                                                    )}
                                                    {t.language && (
                                                        <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {selectedTemplateId === t.id && (
                                                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedTemplate && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
                                    <TemplatePreview components={selectedTemplate.components} />
                                </div>
                            )}
                        </div>
                    )}

                    {step === 3 && campaignType === 'atualizacao' && (
                        <div className="animate-fade-in space-y-4">
                            <div>
                                <h3 className="text-lg font-display font-bold mb-1">Mensagem da Aimee</h3>
                                <p className="text-sm text-muted-foreground">Instrução base para o agente ao contactar proprietários.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Mensagem / Instruções *</Label>
                                <Textarea
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    rows={6}
                                    placeholder={`Ex: Olá {{nome}}, gostaria de confirmar a disponibilidade do imóvel {{codigo}} para locação. Ainda está disponível?`}
                                    className="text-sm bg-muted/40 resize-none"
                                />
                                <p className="text-[11px] text-muted-foreground">Use {'{{nome}}'}, {'{{codigo}}'} como variáveis.</p>
                            </div>
                        </div>
                    )}

                    {/* STEP 4 — Name / Audience */}
                    {step === 4 && (
                        <div className="animate-fade-in space-y-4">
                            <div>
                                <h3 className="text-lg font-display font-bold mb-1">Detalhes da campanha</h3>
                                <p className="text-sm text-muted-foreground">Nomeie e descreva a campanha.</p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Nome da campanha *</Label>
                                    <Input
                                        value={campaignName}
                                        onChange={(e) => setCampaignName(e.target.value)}
                                        placeholder="Ex: Promoção Março 2026"
                                        className="bg-muted/40"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Descrição (opcional)</Label>
                                    <Textarea
                                        value={campaignDesc}
                                        onChange={(e) => setCampaignDesc(e.target.value)}
                                        placeholder="Contexto ou objetivo da campanha..."
                                        className="bg-muted/40 resize-none"
                                        rows={3}
                                    />
                                </div>
                            </div>

                            {/* Summary card */}
                            <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-2 text-sm">
                                <p className="font-semibold text-foreground text-xs uppercase tracking-wide text-muted-foreground">Resumo</p>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tipo</span>
                                    <Badge variant="outline">{campaignType === 'marketing' ? 'Marketing' : 'Atualização'}</Badge>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tenant</span>
                                    <span className="font-medium">{selectedTenant?.company_name}</span>
                                </div>
                                {campaignType === 'marketing' && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Template</span>
                                        <span className="font-mono text-xs">{selectedTemplate?.name || '—'}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 5 — Schedule */}
                    {step === 5 && (
                        <div className="animate-fade-in space-y-5">
                            <div>
                                <h3 className="text-lg font-display font-bold mb-1">Agendamento</h3>
                                <p className="text-sm text-muted-foreground">Quando a Aimee deve iniciar os disparos?</p>
                            </div>
                            <div className="space-y-4 bg-card border border-border rounded-xl p-4 shadow-sm">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Data de disparo *</Label>
                                    <Input
                                        type="date"
                                        value={scheduleDate}
                                        onChange={(e) => setScheduleDate(e.target.value)}
                                        className="bg-muted/40"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Período *</Label>
                                    <Select value={schedulePeriod} onValueChange={setSchedulePeriod}>
                                        <SelectTrigger className="bg-muted/40">
                                            <SelectValue placeholder="Selecione o período..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="morning">Manhã (08h às 12h)</SelectItem>
                                            <SelectItem value="afternoon">Tarde (13h às 18h)</SelectItem>
                                            <SelectItem value="night">Noite (19h às 21h)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-foreground">
                                <p className="font-semibold mb-1">⚠️ Atenção</p>
                                <p className="opacity-90">A campanha será criada como <strong>rascunho</strong>. O disparo real requer integração WABA ativa e template aprovado.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between gap-3">
                    {step > 1 ? (
                        <Button variant="ghost" onClick={back} className="gap-1.5">
                            <ChevronLeft className="h-4 w-4" /> Voltar
                        </Button>
                    ) : <div />}

                    {step < 5 ? (
                        <Button onClick={next} disabled={!canNext()} className="gap-1.5 px-6">
                            Próximo <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={handleSubmit} disabled={submitting || !canNext()} className="gap-1.5 px-6">
                            {submitting ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                            ) : (
                                <><Send className="h-4 w-4" /> Criar Campanha</>
                            )}
                        </Button>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default AdminNewCampaignSheet;
