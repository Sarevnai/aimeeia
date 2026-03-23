import { Building2, ClipboardList, Repeat2 } from 'lucide-react';

export const AGENT_TYPES = {
  comercial: {
    key: 'comercial' as const,
    label: 'Comercial',
    description: 'Atende locação e vendas. Qualifica leads e busca imóveis via catálogo interno.',
    departments: ['locacao', 'vendas'],
    icon: Building2,
    color: 'hsl(250 70% 60%)',
    tools: [
      {
        name: 'buscar_imoveis',
        label: 'Buscar Imóveis',
        description: 'Busca semântica de imóveis no catálogo interno via embeddings',
        parameters: [
          { name: 'query', type: 'string', description: 'Texto descrevendo o que o cliente procura' },
        ],
      },
      {
        name: 'enviar_lead_c2s',
        label: 'Enviar Lead ao CRM',
        description: 'Transfere lead qualificado para corretor humano via C2S/CRM',
        parameters: [
          { name: 'summary', type: 'string', description: 'Resumo da qualificação do lead' },
          { name: 'score', type: 'number', description: 'Score de qualificação (0-100)' },
        ],
      },
    ],
  },
  admin: {
    key: 'admin' as const,
    label: 'Administrativo',
    description: 'Atende setor administrativo. Cria tickets de suporte e encaminha para atendentes humanos.',
    departments: ['administrativo'],
    icon: ClipboardList,
    color: 'hsl(38 92% 50%)',
    tools: [
      {
        name: 'criar_ticket',
        label: 'Criar Ticket',
        description: 'Cria chamado/ticket com categoria, prioridade e SLA automáticos',
        parameters: [
          { name: 'category', type: 'string', description: 'Categoria: Financeiro, Manutenção, Contrato, etc.' },
          { name: 'description', type: 'string', description: 'Descrição do problema' },
          { name: 'priority', type: 'string', description: 'Prioridade: alta, média, baixa' },
        ],
      },
      {
        name: 'encaminhar_humano',
        label: 'Encaminhar Humano',
        description: 'Transfere o atendimento para um operador humano do setor administrativo',
        parameters: [
          { name: 'reason', type: 'string', description: 'Motivo do encaminhamento' },
        ],
      },
    ],
  },
  remarketing: {
    key: 'remarketing' as const,
    label: 'Remarketing',
    description: 'Reengajamento VIP de leads arquivados. Anamnese personalizada + busca + handoff com dossiê.',
    departments: [] as string[],
    icon: Repeat2,
    color: 'hsl(142 71% 45%)',
    tools: [
      {
        name: 'buscar_imoveis',
        label: 'Buscar Imóveis',
        description: 'Busca semântica em modo VIP remarketing com contexto prévio do contato',
        parameters: [
          { name: 'query', type: 'string', description: 'Texto baseado na anamnese VIP' },
        ],
      },
      {
        name: 'enviar_lead_c2s',
        label: 'Enviar Lead VIP ao CRM',
        description: 'Transfere lead VIP com dossiê completo (prazo, finalidade, tipo, localização)',
        parameters: [
          { name: 'summary', type: 'string', description: 'Dossiê VIP completo' },
          { name: 'score', type: 'number', description: 'Score de qualificação (0-100)' },
        ],
      },
    ],
  },
} as const;

export type AgentTypeKey = keyof typeof AGENT_TYPES;

export const AGENT_TYPE_KEYS = Object.keys(AGENT_TYPES) as AgentTypeKey[];

export function isValidAgentType(value: string): value is AgentTypeKey {
  return value in AGENT_TYPES;
}

export const PROVIDERS = [
  {
    value: 'openai', label: 'OpenAI', models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini — Rápido e econômico' },
      { value: 'gpt-4o', label: 'GPT-4o — Alta performance' },
      { value: 'o3-mini', label: 'o3 Mini — Raciocínio avançado' },
    ]
  },
  {
    value: 'anthropic', label: 'Anthropic Claude', models: [
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku — Rápido' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet — Balanceado' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus — Alta capacidade' },
    ]
  },
  {
    value: 'google', label: 'Google Gemini', models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Rápido' },
      { value: 'gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking — Raciocínio' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — Alta capacidade' },
    ]
  },
];

export interface AgentConfig {
  id: string;
  tenant_id: string;
  agent_name: string;
  tone: string;
  greeting_message: string;
  fallback_message: string;
  ai_model: string;
  ai_provider: string;
  max_tokens: number;
  max_history_messages: number;
  custom_instructions: string | null;
  audio_enabled: boolean;
  audio_mode: string;
  audio_voice_id: string;
  audio_voice_stability: number;
  audio_voice_similarity: number;
  audio_max_chars: number;
  audio_channel_mirroring: boolean;
  emoji_intensity: string;
  has_api_key?: boolean;
}

export const defaultAgentConfig: Omit<AgentConfig, 'id' | 'tenant_id'> = {
  agent_name: 'Aimee',
  tone: 'friendly',
  greeting_message: '',
  fallback_message: '',
  ai_model: 'gpt-4o-mini',
  ai_provider: 'openai',
  max_tokens: 300,
  max_history_messages: 10,
  custom_instructions: null,
  audio_enabled: false,
  audio_mode: 'text_only',
  audio_voice_id: '',
  audio_voice_stability: 0.5,
  audio_voice_similarity: 0.75,
  audio_max_chars: 500,
  audio_channel_mirroring: false,
  emoji_intensity: 'low',
  has_api_key: false,
};
