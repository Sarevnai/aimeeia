import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
    ArrowLeft, Bot, UserCheck, Phone, MapPin, Home, DollarSign, Bed, Target, Play, Ban, Copy, Search, ThumbsUp, ThumbsDown, MessageSquare, ExternalLink, Calendar, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

type Message = Tables<'messages'>;
type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;
type ConversationState = Tables<'conversation_states'>;
type LeadQualification = Tables<'lead_qualification'>;

const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatCurrency = (val: number | null) => {
    if (!val) return 'Não informado';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
};

const HistoryPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { tenantId } = useTenant();
    const { toast } = useToast();

    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [contact, setContact] = useState<Contact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [convState, setConvState] = useState<ConversationState | null>(null);
    const [leadQual, setLeadQual] = useState<LeadQualification | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id || !tenantId) return;

        const fetchData = async () => {
            setLoading(true);
            const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).eq('tenant_id', tenantId).single();

            if (!conv) {
                setLoading(false);
                return;
            }
            setConversation(conv);

            const [contactRes, msgsRes, stateRes, qualRes] = await Promise.all([
                conv.contact_id ? supabase.from('contacts').select('*').eq('id', conv.contact_id).single() : Promise.resolve({ data: null }),
                supabase.from('messages').select('*').eq('conversation_id', id).eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(500),
                supabase.from('conversation_states').select('*').eq('phone_number', conv.phone_number).eq('tenant_id', tenantId).maybeSingle(),
                supabase.from('lead_qualification').select('*').eq('phone_number', conv.phone_number).eq('tenant_id', tenantId).maybeSingle(),
            ]);

            setContact(contactRes.data as Contact | null);
            setMessages((msgsRes.data as Message[]) ?? []);
            setConvState(stateRes.data as ConversationState | null);
            setLeadQual(qualRes.data as LeadQualification | null);
            setLoading(false);
        };

        fetchData();
    }, [id, tenantId]);

    const copyPhone = () => {
        if (conversation?.phone_number) {
            navigator.clipboard.writeText(conversation.phone_number);
            toast({ title: 'Telefone copiado!' });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!conversation) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="text-center space-y-3">
                    <p className="text-muted-foreground">Conversa não encontrada</p>
                    <Button variant="outline" onClick={() => navigate('/leads')}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-muted/10 overflow-hidden">

            {/* Left Column Profile / Info Panels */}
            <div className="w-full md:w-[320px] lg:w-[380px] bg-white border-r border-border overflow-y-auto shrink-0 flex flex-col p-5 space-y-5">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground shrink-0" onClick={() => navigate('/leads')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h2 className="font-semibold text-lg leading-tight flex items-center gap-2">{contact?.name || 'Cliente'} {convState?.is_ai_active && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Lais Ativa</Badge>}</h2>
                        <p className="text-sm text-muted-foreground">{conversation.phone_number}</p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-2 text-xs h-9 font-medium" onClick={copyPhone}>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2 text-xs h-9 font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                        <Ban className="h-3.5 w-3.5" /> Bloquear
                    </Button>
                </div>

                <Card className="shadow-sm border-border">
                    <CardContent className="p-4 space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Perfil do Cliente</h3>
                        <div className="space-y-3 pt-1 border-t border-border/50">
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5"><Target className="h-3 w-3" /> Objetivo</span>
                                <span className="text-sm font-medium text-foreground">{leadQual?.detected_interest || "Não informado"}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Localização</span>
                                <span className="text-sm font-medium text-foreground">{leadQual?.detected_neighborhood || "Não informada"}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Orçamento</span>
                                <span className="text-sm font-medium text-foreground">{formatCurrency(leadQual?.detected_budget_max)}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5"><Home className="h-3 w-3" /> Especificidades</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {leadQual?.detected_property_type ? <Badge variant="secondary" className="font-normal">{leadQual.detected_property_type}</Badge> : null}
                                    {leadQual?.detected_bedrooms ? <Badge variant="secondary" className="font-normal">{leadQual.detected_bedrooms} Quartos</Badge> : null}
                                    {!leadQual?.detected_property_type && !leadQual?.detected_bedrooms && <span className="text-sm">Não informadas</span>}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-border bg-gradient-to-br from-primary/5 to-transparent">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Solicitação de Visita</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{contact?.status === 'visit_requested' || convState?.operator_takeover_at ? 'O cliente demonstrou interesse avançado em conhecer o imóvel.' : 'Nenhuma visita agendada até o momento.'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Source info */}
                <div className="p-4 bg-muted/50 rounded-xl space-y-2 border border-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</h3>
                    <p className="text-sm">O cliente chegou através de <b>{contact?.channel_source || 'WhatsApp'}</b>.</p>
                </div>
            </div>

            {/* Right Column Conversation Logs */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA]">
                {/* Top bar rating */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white shadow-sm shrink-0">
                    <div>
                        <h2 className="font-semibold text-foreground">Histórico da Conversa</h2>
                        <p className="text-[12px] text-muted-foreground">Registros capturados em tempo real</p>
                    </div>

                    <div className="flex items-center gap-3 bg-muted/30 p-1.5 rounded-lg border border-border">
                        <span className="text-xs font-medium text-muted-foreground px-2">Avaliar atuação da IA:</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm hover:text-success hover:bg-success/10"><ThumbsUp className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Atendimento excelente</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm hover:text-destructive hover:bg-destructive/10"><ThumbsDown className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Houve erros de contexto</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-sm hover:text-primary hover:bg-primary/10"><MessageSquare className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Deixar anotação/feedback</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                {/* View logs */}
                <div className="flex-1 overflow-auto p-6 space-y-6">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                            <Search className="h-10 w-10 text-muted-foreground/30 mb-4" />
                            <p className="text-muted-foreground">Nenhuma mensagem registrada no histórico.</p>
                        </div>
                    ) : (
                        messages.map((msg, index) => {
                            const isAI = msg.direction === 'outbound';
                            const isFirstInGroup = index === 0 || messages[index - 1].direction !== msg.direction;

                            return (
                                <div key={msg.id} className={cn("flex flex-col", isAI ? "items-start" : "items-end", isFirstInGroup ? "mt-4" : "mt-1")}>
                                    {isFirstInGroup && (
                                        <span className="text-[11px] font-medium text-muted-foreground mb-1.5 ml-1 mr-1">
                                            {isAI ? "Aimee Inteligência Artificial" : (contact?.name || conversation.phone_number)}
                                        </span>
                                    )}
                                    <div
                                        className={cn(
                                            "relative max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 text-[14px] shadow-sm",
                                            isAI
                                                ? "bg-[#6345ED] text-white rounded-tl-sm" // Purple Lais color for the AI
                                                : "bg-white text-[#1F2937] border border-border rounded-tr-sm" // Greyish white for the user
                                        )}
                                    >
                                        <p className="whitespace-pre-wrap break-words format-links">{msg.body}</p>
                                        <div className={cn("text-[10px] mt-1.5 flex justify-end opacity-70", isAI ? "text-white/80" : "text-muted-foreground")}>
                                            {formatTime(msg.created_at)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default HistoryPage;
