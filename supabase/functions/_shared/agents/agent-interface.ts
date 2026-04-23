// ========== AIMEE.iA v2 - AGENT INTERFACE ==========
// Common types and interface for all specialized agents.
// Each agent implements AgentModule to provide focused behavior.

import { Tenant, AIAgentConfig, AIBehaviorConfig, Region, QualificationData, ConversationMessage, StructuredConfig, AiModule } from '../types.ts';

export type AgentType = 'comercial' | 'admin' | 'remarketing' | 'atualizacao';

// Context bundle passed from Router to Agent (loaded once, reused by all agent methods)
export interface AgentContext {
  tenantId: string;
  phoneNumber: string;
  conversationId: string;
  contactId: string;
  tenant: Tenant;
  aiConfig: AIAgentConfig;
  behaviorConfig: AIBehaviorConfig | null;
  regions: Region[];
  department: string | null;
  conversationSource: string; // 'organic' | 'remarketing' | 'portal'
  contactName: string | null;
  qualificationData: QualificationData;
  conversationHistory: ConversationMessage[];
  directive: any | null;
  structuredConfig: StructuredConfig | null;
  remarketingContext: string | null;
  isReturningLead: boolean;               // C4: Lead retornante com dados de sessão anterior
  previousQualificationData: QualificationData | null; // C4: Dados da sessão anterior (para revalidação)
  tenantApiKey: string | undefined;
  tenantProvider: string;
  lastAiMessages: string[];
  toolsExecuted: string[];               // MC-5: Track which tools were called this turn
  userMessage: string;                    // Current user message (for pre-completion checks)
  activeModules: AiModule[];              // Intelligence modules for this tenant
  currentModuleSlug: string | null;       // Currently active module slug
  _loopDetected?: boolean;                // Set by postProcess to signal loop to caller
  _qualChangedThisTurn?: boolean;         // Fix B: true when qualification data was extracted this turn
  _moduleChangedThisTurn?: boolean;       // Fix B: true when module changed this turn
  simulate?: boolean;                      // F4: true in simulator — skip WhatsApp/CRM side effects
  isFirstTurn?: boolean;                   // True when conversationHistory is empty — agent should self-introduce + respond to intent in the same turn
  contactType?: 'lead' | 'proprietario' | 'inquilino' | null; // Sprint 6.1: admin usa pra adaptar tom
  activeTicket?: ActiveTicketContext | null; // Sprint 6.1: admin usa pra saber se já tem ticket aberto + contexto do operador
  activeUpdateEntry?: ActiveUpdateEntryContext | null; // Sprint 6.2: setor atualização — contexto do imóvel sendo verificado
  portalPropertyCode?: string | null;     // Canal Pro ZAP / VivaReal / OLX — código do imóvel que veio pré-selecionado no lead
  supabase: any;
}

// Sprint 6.2 — contexto da entry ativa na fila de atualização (setor atualização)
// Integrado às tabelas owner_* existentes (UI /atualizacao).
export interface ActiveUpdateEntryContext {
  resultId: string;                // owner_update_results.id
  campaignId: string;              // owner_update_campaigns.id
  ownerContactId: string;          // owner_contacts.id
  ownerName: string;
  ownerPhone: string;
  propertyCode: string;            // owner_contacts.property_code (Vista code)
  propertyAddress: string | null;
  propertyType: string | null;
  neighborhood: string | null;
  propertyRef: string;             // Referência curta pro prompt (ex: "Apto 3 dorm. no Centro")
  // Vista snapshot — opcional, vem de properties cache se existir
  currentStatus: string | null;
  currentValorVenda: number | null;
  currentValorLocacao: number | null;
  propertyIdLocal: string | null;  // properties.id se existir no cache local
  tenantAutoExecute: boolean;      // Kill-switch: se false, Aimee conversa + registra intenção, não executa no Vista
}

// Sprint 6.1 — estado do ticket ativo pra conversa (setor administrativo)
export interface ActiveTicketContext {
  id: string;
  category: string;
  category_id: string | null;
  risk_level: 'baixo' | 'medio' | 'alto' | null;
  aimee_can_resolve: boolean;
  stage: string;
  stage_id: string | null;
  created_at: string;
  context_fields: Array<{
    field_key: string;
    field_value: string | null;
    filled_by: string | null;
    requested_by_aimee: boolean;
  }>;
  context_template: Array<{
    key: string;
    label: string;
    required?: boolean;
  }>;
}

// Contract that every agent module must implement
export interface AgentModule {
  buildSystemPrompt(ctx: AgentContext): string;
  getTools(ctx: AgentContext): any[];
  executeToolCall(ctx: AgentContext, toolName: string, args: any): Promise<string>;
  postProcess(ctx: AgentContext, aiResponse: string): Promise<string>;
}
