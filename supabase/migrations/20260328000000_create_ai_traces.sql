-- ========== AI TRACES - Observabilidade de chamadas LLM ==========
-- Captura metricas de cada chamada ao modelo: latencia, tokens, custo, ferramentas.

CREATE TABLE public.ai_traces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  conversation_id uuid REFERENCES public.conversations(id),
  agent_type text,
  model text NOT NULL,
  provider text NOT NULL,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  latency_ms int NOT NULL,
  cost_usd numeric(10,6),
  tool_calls_count int DEFAULT 0,
  tool_names text[],
  iterations int DEFAULT 1,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Indices para queries de dashboard
CREATE INDEX idx_ai_traces_tenant_created ON public.ai_traces(tenant_id, created_at DESC);
CREATE INDEX idx_ai_traces_conversation ON public.ai_traces(conversation_id);
CREATE INDEX idx_ai_traces_created ON public.ai_traces(created_at DESC);

-- RLS
ALTER TABLE public.ai_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_ai_traces" ON public.ai_traces
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "tenant_read_own_traces" ON public.ai_traces
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- Service role pode inserir (Edge Functions usam SUPABASE_SERVICE_ROLE_KEY)
