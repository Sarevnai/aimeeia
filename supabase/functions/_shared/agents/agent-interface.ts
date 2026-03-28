// ========== AIMEE.iA v2 - AGENT INTERFACE ==========
// Common types and interface for all specialized agents.
// Each agent implements AgentModule to provide focused behavior.

import { Tenant, AIAgentConfig, AIBehaviorConfig, Region, QualificationData, ConversationMessage, StructuredConfig, AiModule } from '../types.ts';

export type AgentType = 'comercial' | 'admin' | 'remarketing';

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
  supabase: any;
}

// Contract that every agent module must implement
export interface AgentModule {
  buildSystemPrompt(ctx: AgentContext): string;
  getTools(ctx: AgentContext): any[];
  executeToolCall(ctx: AgentContext, toolName: string, args: any): Promise<string>;
  postProcess(ctx: AgentContext, aiResponse: string): Promise<string>;
}
