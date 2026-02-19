// ========== AIMEE.iA v2 - TYPES ==========
// Clean types, no hardcoded defaults (defaults come from DB)

export type DepartmentType = 'locacao' | 'vendas' | 'administrativo' | 'marketing' | null;
export type TriageStage = 'greeting' | 'awaiting_name' | 'awaiting_triage' | 'completed' | null;
export type ConversationStatus = 'active' | 'closed' | 'archived';
export type MessageDirection = 'inbound' | 'outbound';

// ========== TENANT ==========

export interface Tenant {
  id: string;
  company_name: string;
  city: string;
  state: string;
  phone_redirect: string | null;
  crm_type: 'vista' | 'jetimob' | 'custom' | 'none';
  crm_api_key: string | null;
  crm_api_url: string | null;
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  wa_verify_token: string | null;
  theme_config: Record<string, any>;
  is_active: boolean;
}

// ========== REGION (from DB, not hardcoded) ==========

export interface Region {
  id: string;
  tenant_id: string;
  region_key: string;
  region_name: string;
  neighborhoods: string[];
}

// ========== AI CONFIG ==========

export interface AIAgentConfig {
  id: string;
  tenant_id: string;
  agent_name: string;
  tone: string;
  greeting_message: string;
  fallback_message: string;
  ai_model: string;
  max_tokens: number;
  max_history_messages: number;
  humanize_responses: boolean;
  fragment_long_messages: boolean;
  message_delay_ms: number;
  emoji_intensity: string;
  use_customer_name: boolean;
  audio_enabled: boolean;
  audio_voice_id: string;
  audio_voice_name: string;
  audio_mode: string;
  audio_channel_mirroring: boolean;
  audio_max_chars: number;
  custom_instructions: string;
  vista_integration_enabled: boolean;
}

export interface AudioConfig {
  audio_enabled: boolean;
  audio_voice_id: string;
  audio_voice_name: string;
  audio_mode: string;
  audio_max_chars: number;
  audio_channel_mirroring: boolean;
}

// ========== CONVERSATIONS ==========

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  phone_number: string;
  tenant_id: string;
  triage_stage: TriageStage;
  is_ai_active: boolean;
  operator_id: string | null;
  operator_takeover_at: string | null;
  pending_properties: any[];
  current_property_index: number;
  awaiting_property_feedback: boolean;
  last_search_params: Record<string, any> | null;
  suggested_price_max: number | null;
  last_ai_messages: string[];
  last_ai_message_at: string | null;
  negotiation_pending: boolean;
}

// ========== QUALIFICATION ==========

export interface QualificationData {
  detected_neighborhood?: string | null;
  detected_property_type?: string | null;
  detected_bedrooms?: number | null;
  detected_budget_min?: number | null;
  detected_budget_max?: number | null;
  detected_interest?: string | null;
  qualification_score?: number;
  questions_answered?: number;
}

export interface ExtractedQualificationData {
  detected_neighborhood?: string;
  detected_property_type?: string;
  detected_bedrooms?: number;
  detected_budget_max?: number;
  detected_interest?: string;
}

// ========== PROPERTY ==========

export interface PropertyResult {
  codigo: string;
  tipo: string;
  bairro: string;
  cidade: string;
  endereco?: string;
  preco: number;
  preco_formatado: string;
  quartos: number;
  suites?: number;
  vagas?: number;
  area_util?: number;
  descricao?: string;
  foto_destaque?: string;
  fotos?: string[];
  link: string;
  caracteristicas?: string[];
  valor_condominio?: number;
  valor_iptu?: number;
  finalidade?: string;
}

// ========== DEVELOPMENT (Portal Leads) ==========

export interface Development {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  neighborhood: string;
  city: string;
  description: string;
  price_from: number;
  hero_image_url: string;
  is_active: boolean;
}

// ========== WEBHOOK PAYLOADS ==========

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        audio?: { id: string; mime_type: string };
        image?: { id: string; caption?: string };
        document?: { id: string; filename: string };
        interactive?: {
          type: string;
          button_reply?: { id: string; title: string };
          list_reply?: { id: string; title: string };
        };
        button?: { text: string; payload: string };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: string;
  }>;
}

// ========== MAKE WEBHOOK (Coexistence Mode) ==========

export interface MakeWebhookRequest {
  phone_number: string;
  message_body: string;
  message_type?: string;
  contact_name?: string;
  wa_message_id?: string;
  wa_phone_number_id?: string;
  media_id?: string;
  media_url?: string;
  button_id?: string;
  button_text?: string;
  timestamp?: string;
}
