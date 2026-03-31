import { useRef, useEffect, useCallback, useState } from "react";
import { Send, RotateCcw, Loader2, FileText, MessageSquareText, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSessionState } from "@/hooks/useSessionState";
import { supabase } from "@/integrations/supabase/client";
import { PropertyCard } from "./PropertyCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  timestamp: Date;
  action?: string;
  propertyCards?: any[];
  templateRendered?: any;
}

interface SimMetadata {
  action: string;
  triageStage: string;
  activeModule: { slug: string; name: string } | null;
  moduleHistory: Array<{ slug: string; name: string }>;
  qualification: Record<string, any>;
  tags: string[];
  toolsExecuted: string[];
  agentType: string;
  propertyCards: any[];
  conversationState: any;
  modelUsed: string;
  handoffDetected: boolean;
  loopDetected: boolean;
  analysis: any | null;
  conversationHistory: Array<{ role: string; content: string }>;
}

interface SimuladorChatProps {
  tenantId: string;
  onMetadataUpdate?: (metadata: SimMetadata) => void;
  onReset?: () => void;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  { value: "vendas", label: "Vendas" },
  { value: "locacao", label: "Locacao" },
  { value: "administrativo", label: "Administrativo" },
  { value: "remarketing", label: "Remarketing" },
] as const;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INITIAL_METADATA: SimMetadata = {
  action: "",
  triageStage: "",
  activeModule: null,
  moduleHistory: [],
  qualification: {},
  tags: [],
  toolsExecuted: [],
  agentType: "",
  propertyCards: [],
  conversationState: null,
  modelUsed: "",
  handoffDetected: false,
  loopDetected: false,
  analysis: null,
  conversationHistory: [],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SimuladorChat({ tenantId, onMetadataUpdate, onReset }: SimuladorChatProps) {
  // Persisted state (survives navigation / refresh)
  const [messages, setMessages] = useSessionState<SimMessage[]>("lab_messages", []);
  const [conversationId, setConversationId] = useSessionState<string | null>("lab_conversationId", null);
  const [department, setDepartment] = useSessionState<string>("lab_department", "vendas");
  const [metadata, setMetadata] = useSessionState<SimMetadata>("lab_metadata", INITIAL_METADATA);
  const [moduleHistory, setModuleHistory] = useSessionState<Array<{ slug: string; name: string }>>(
    "lab_moduleHistory",
    []
  );

  // Ephemeral state
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [clientNameInput, setClientNameInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ------- Auto-scroll -------
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ------- Emit metadata to parent whenever it changes -------
  useEffect(() => {
    onMetadataUpdate?.(metadata);
  }, [metadata, onMetadataUpdate]);

  // ------- Fetch templates -------
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_templates" as any)
        .select("id, name, status")
        .eq("tenant_id", tenantId)
        .eq("status", "APPROVED");

      if (!error && data) {
        setTemplates(data as WhatsAppTemplate[]);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingTemplates(false);
    }
  }, [tenantId]);

  // ------- Process AI response (with staggered message delivery) -------
  const processAiResponse = useCallback(
    (responseData: any) => {
      // The Edge Function may return a compound response separated by ___
      const rawReply: string = responseData?.ai_response ?? responseData?.reply ?? responseData?.message ?? "";
      const parts = rawReply.split("___").map((p: string) => p.trim()).filter(Boolean);

      const action: string = responseData?.action ?? "";
      const propertyCards: any[] = responseData?.property_cards ?? responseData?.propertyCards ?? [];
      const templateRendered = responseData?.template_rendered ?? null;

      // Build all messages
      const aiMessages: SimMessage[] = [];
      for (const part of parts) {
        aiMessages.push({
          id: generateId(),
          direction: "outbound",
          body: part,
          timestamp: new Date(),
          action,
          propertyCards: parts.indexOf(part) === parts.length - 1 ? propertyCards : [],
          templateRendered: parts.indexOf(part) === parts.length - 1 ? templateRendered : undefined,
        });
      }

      // If nothing was split, still add a single message
      if (aiMessages.length === 0 && rawReply) {
        aiMessages.push({
          id: generateId(),
          direction: "outbound",
          body: rawReply,
          timestamp: new Date(),
          action,
          propertyCards,
          templateRendered,
        });
      }

      // Stagger message delivery to simulate human typing rhythm
      if (aiMessages.length <= 1) {
        // Single message — deliver immediately
        setMessages((prev) => [...prev, ...aiMessages]);
      } else {
        // Multiple messages — deliver with random delays (1-3s between each)
        setMessages((prev) => [...prev, aiMessages[0]]);
        let cumulativeDelay = 0;
        for (let i = 1; i < aiMessages.length; i++) {
          const delay = 1000 + Math.random() * 2000; // 1s to 3s
          cumulativeDelay += delay;
          const msg = aiMessages[i];
          setTimeout(() => {
            setMessages((prev) => [...prev, msg]);
          }, cumulativeDelay);
        }
      }

      // Build updated module history
      const activeModule = responseData?.active_module ?? responseData?.activeModule ?? null;
      const newModuleHistory = [...moduleHistory];
      if (activeModule && !newModuleHistory.some((m) => m.slug === activeModule.slug)) {
        newModuleHistory.push(activeModule);
      }
      setModuleHistory(newModuleHistory);

      // Build conversation history for metadata
      const newConvHistory = [
        ...metadata.conversationHistory,
        { role: "user", content: inputText || "(template)" },
        { role: "assistant", content: rawReply },
      ];

      // Merge qualification: only overwrite fields that have real values (skip nulls/zeros/empty)
      const incomingQual = responseData?.qualification || {};
      const validIncomingQual = Object.fromEntries(
        Object.entries(incomingQual).filter(([, v]) => v != null && v !== 0 && v !== '')
      );
      const mergedQualification = Object.keys(validIncomingQual).length > 0
        ? { ...metadata.qualification, ...validIncomingQual }
        : metadata.qualification;

      // Merge tags: union — never drop existing tags, only add new ones
      const incomingTags = responseData?.tags || [];
      const mergedTags = incomingTags.length > 0
        ? [...new Set([...metadata.tags, ...incomingTags])]
        : metadata.tags;

      // Merge tools: accumulate, don't replace
      const incomingTools = responseData?.tools_executed ?? responseData?.toolsExecuted ?? [];
      const mergedTools = incomingTools.length > 0
        ? [...metadata.toolsExecuted, ...incomingTools]
        : metadata.toolsExecuted;

      const updatedMeta: SimMetadata = {
        action,
        triageStage: responseData?.triage_stage ?? responseData?.triageStage ?? metadata.triageStage,
        activeModule,
        moduleHistory: newModuleHistory,
        qualification: mergedQualification,
        tags: mergedTags,
        toolsExecuted: mergedTools,
        agentType: responseData?.agent_type ?? responseData?.agentType ?? metadata.agentType,
        propertyCards,
        conversationState: responseData?.conversation_state ?? responseData?.conversationState ?? metadata.conversationState,
        modelUsed: responseData?.model_used ?? responseData?.modelUsed ?? metadata.modelUsed,
        handoffDetected: responseData?.handoff_detected ?? responseData?.handoffDetected ?? metadata.handoffDetected,
        loopDetected: responseData?.loop_detected ?? responseData?.loopDetected ?? false,
        analysis: metadata.analysis,
        conversationHistory: newConvHistory,
      };

      setMetadata(updatedMeta);

      // Store conversation_id if returned
      if (responseData?.conversation_id) {
        setConversationId(responseData.conversation_id);
      }

      return { updatedMeta, rawReply };
    },
    [metadata, moduleHistory, inputText, setMessages, setMetadata, setModuleHistory, setConversationId]
  );

  // ------- Run analysis after AI response -------
  const runAnalysis = useCallback(
    async (meta: SimMetadata, userMessage: string, aiResponse: string) => {
      try {
        const { data: analysisData } = await supabase.functions.invoke("ai-agent-analyze", {
          body: {
            tenant_id: tenantId,
            conversation_id: conversationId,
            conversation_history: meta.conversationHistory || [],
            current_turn: {
              user_message: userMessage,
              ai_response: aiResponse,
              action: meta.action,
              active_module: meta.activeModule,
              triage_stage: meta.triageStage,
              qualification: meta.qualification,
              tools_executed: meta.toolsExecuted,
              property_cards: meta.propertyCards,
            },
            flow_type: department || 'vendas',
            turn_number: messages.length,
          },
        });

        if (analysisData) {
          const withAnalysis = { ...meta, analysis: analysisData };
          setMetadata(withAnalysis);
          onMetadataUpdate?.({ ...withAnalysis });
        }
      } catch {
        // analysis is best-effort
      }
    },
    [tenantId, conversationId, department, messages.length, setMetadata, onMetadataUpdate]
  );

  // ------- Send user message -------
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    // Add user message
    const userMsg: SimMessage = {
      id: generateId(),
      direction: "inbound",
      body: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-agent-simulate", {
        body: {
          tenant_id: tenantId,
          message_body: text,
          department,
          conversation_id: conversationId,
        },
      });

      if (error) throw error;

      const { updatedMeta, rawReply } = processAiResponse(data);
      await runAnalysis(updatedMeta, text, rawReply || data?.ai_response || '');
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          direction: "outbound",
          body: `Erro ao processar mensagem: ${err instanceof Error ? err.message : "erro desconhecido"}`,
          timestamp: new Date(),
          action: "error",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [inputText, isLoading, tenantId, department, conversationId, setMessages, processAiResponse, runAnalysis]);

  // ------- Send template -------
  const handleTemplateSend = useCallback(
    async (template: WhatsAppTemplate, clientName?: string) => {
      setTemplateDialogOpen(false);
      setPendingTemplate(null);
      setClientNameInput("");
      setIsLoading(true);

      const displayName = clientName?.trim() || "Cliente";

      // Add placeholder user message
      const userMsg: SimMessage = {
        id: generateId(),
        direction: "inbound",
        body: `[Template: ${template.name}] → ${displayName}`,
        timestamp: new Date(),
        action: "template_sent",
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const { data, error } = await supabase.functions.invoke("ai-agent-simulate", {
          body: {
            tenant_id: tenantId,
            department,
            conversation_id: conversationId,
            simulate_template: {
              template_name: template.name,
              client_name: clientName?.trim() || undefined,
            },
          },
        });

        if (error) throw error;

        const { updatedMeta, rawReply } = processAiResponse(data);
        await runAnalysis(updatedMeta, `[Template: ${template.name}]`, rawReply || data?.ai_response || '');
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            direction: "outbound",
            body: `Erro ao enviar template: ${err instanceof Error ? err.message : "erro desconhecido"}`,
            timestamp: new Date(),
            action: "error",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, department, conversationId, setMessages, processAiResponse, runAnalysis]
  );

  // ------- Reset -------
  const handleReset = useCallback(async () => {
    // Archive conversation and clear DB state
    if (conversationId) {
      try {
        await supabase
          .from("conversations" as any)
          .update({ status: "archived" } as any)
          .eq("id", conversationId);
      } catch {
        // best effort
      }
    }
    // Clear conversation_states and reset contact name to prevent context leaking
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const simPhone = `SIM-${user.id.slice(0, 8)}`;
        await supabase
          .from("conversation_states" as any)
          .delete()
          .eq("tenant_id", tenantId)
          .eq("phone_number", simPhone);
        // Reset contact name so previous persona doesn't carry over
        await supabase
          .from("contacts" as any)
          .update({ name: "Cliente" } as any)
          .eq("tenant_id", tenantId)
          .eq("phone", simPhone);
      }
    } catch {
      // best effort
    }

    setMessages([]);
    setConversationId(null);
    setDepartment("vendas");
    setMetadata(INITIAL_METADATA);
    setModuleHistory([]);
    setInputText("");
    // Clear only chat-specific state, NOT tenant selection or parent state
    const chatKeys = [
      "sim_lab_messages", "sim_lab_conversationId", "sim_lab_department",
      "sim_lab_metadata", "sim_lab_moduleHistory",
    ];
    chatKeys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    onReset?.();
    inputRef.current?.focus();
  }, [conversationId, setMessages, setConversationId, setDepartment, setMetadata, setModuleHistory, onReset]);

  // ------- Keyboard handling -------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ------- Render helpers -------

  const renderActionBadge = (action?: string) => {
    if (!action) return null;
    switch (action) {
      case "triage":
        return (
          <Badge className="mb-1 bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
            Triage
          </Badge>
        );
      case "handoff_direct":
        return (
          <Badge className="mb-1 bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">
            Handoff
          </Badge>
        );
      case "ai_response":
        return (
          <Badge className="mb-1 bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
            IA
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderMessage = (msg: SimMessage) => {
    const isInbound = msg.direction === "inbound";

    return (
      <div
        key={msg.id}
        className={`flex flex-col ${isInbound ? "items-end" : "items-start"} mb-3`}
      >
        {/* Action badge */}
        {!isInbound && renderActionBadge(msg.action)}

        {/* Bubble */}
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isInbound
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          }`}
        >
          {msg.body}
        </div>

        {/* Template info badge (no raw JSON) */}
        {msg.action === "template_sent" && msg.templateRendered && (
          <div className="mt-1 max-w-[85%]">
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
              Template: {typeof msg.templateRendered === "string"
                ? msg.templateRendered
                : msg.templateRendered?.name || "enviado"}
            </Badge>
          </div>
        )}

        {/* Property cards */}
        {msg.propertyCards && msg.propertyCards.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 max-w-[85%]">
            {msg.propertyCards.map((card: any, idx: number) => (
              <PropertyCard
                key={`${msg.id}-card-${idx}`}
                codigo={card.codigo ?? card.property_code ?? ""}
                tipo={card.tipo ?? card.property_type ?? ""}
                bairro={card.bairro ?? card.neighborhood ?? ""}
                cidade={card.cidade ?? card.city}
                preco_formatado={card.preco_formatado ?? card.formatted_price}
                foto_url={card.foto_url ?? card.photo_url}
                caption={card.caption}
                link={card.link}
                quartos={card.quartos ?? card.bedrooms}
                suites={card.suites}
                vagas={card.vagas ?? card.parking}
                area_util={card.area_util ?? card.useful_area}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {msg.timestamp instanceof Date
            ? msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  };

  // ------- Main render -------

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      {/* -------- Top bar -------- */}
      <div className="flex items-center gap-2 p-3 border-b bg-card">
        <MessageSquareText className="w-4 h-4 text-muted-foreground shrink-0" />

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d.value} value={d.value} className="text-xs">
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Template dialog */}
        <Dialog open={templateDialogOpen} onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) { setPendingTemplate(null); setClientNameInput(""); }
        }}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => {
                fetchTemplates();
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              Enviar Template
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pendingTemplate ? "Nome do cliente" : "Selecionar Template"}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              {pendingTemplate ? (
                /* Step 2: Input de nome do cliente */
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Template: <span className="font-medium text-foreground">{pendingTemplate.name}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Nome do cliente (ex: Mariana)"
                      value={clientNameInput}
                      onChange={(e) => setClientNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && clientNameInput.trim()) {
                          handleTemplateSend(pendingTemplate, clientNameInput);
                        }
                      }}
                      autoFocus
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setPendingTemplate(null);
                        setClientNameInput("");
                      }}
                    >
                      Voltar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleTemplateSend(pendingTemplate)}
                    >
                      Pular
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={!clientNameInput.trim()}
                      onClick={() => handleTemplateSend(pendingTemplate, clientNameInput)}
                    >
                      Enviar
                    </Button>
                  </div>
                </div>
              ) : loadingTemplates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum template aprovado encontrado.
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="flex flex-col gap-1 pr-3">
                    {templates.map((t) => (
                      <Button
                        key={t.id}
                        variant="ghost"
                        className="justify-start text-sm h-auto py-2 px-3 whitespace-normal text-left"
                        onClick={() => setPendingTemplate(t)}
                      >
                        <FileText className="w-4 h-4 mr-2 shrink-0 text-muted-foreground" />
                        {t.name}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
          onClick={handleReset}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reiniciar
        </Button>
      </div>

      {/* -------- Chat area -------- */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-4 flex flex-col">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="text-center text-muted-foreground">
                <MessageSquareText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Simulador de Conversa</p>
                <p className="text-xs mt-1">
                  Envie uma mensagem para iniciar a simulacao com a IA.
                </p>
              </div>
            </div>
          )}

          {messages.map(renderMessage)}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-start mb-3">
              <div className="bg-muted rounded-lg rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Digitando...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* -------- Input area -------- */}
      <div className="border-t p-3 bg-card">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[38px] max-h-[120px]"
            disabled={isLoading}
            style={{ fieldSizing: "content" } as any}
          />
          <Button
            size="icon"
            className="h-[38px] w-[38px] shrink-0"
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
