-- WikiLLM Fase 1: tabela wiki_pages — knowledge base consultável em runtime pela Aimee.
--
-- Dois escopos coexistem na mesma tabela:
--   tenant_id NOT NULL → wiki operacional do tenant (bairros, empreendimentos,
--                        corretores, objeções, políticas, leads).
--   tenant_id NULL     → wiki global Aimee (arquitetura, integrações cross-tenant).
--
-- Busca: tsvector GIN em portuguese, com peso A=título, B=conteúdo, C=related.
-- Acesso: edge function `wiki-search` (BM25/ts_rank + ts_headline) e `wiki-read` (slug direto).
-- Espelho markdown em `docs/wiki/` é fonte humana / template; produção é esta tabela.

CREATE TABLE IF NOT EXISTS public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_type text NOT NULL CHECK (page_type IN (
    'bairro','empreendimento','corretor','objecao','politica','lead',
    'arquitetura','produto','competicao','estrategia','operacao','integracao'
  )),
  slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  sources text[] NOT NULL DEFAULT '{}',
  related text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  metadata jsonb NOT NULL DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('portuguese', array_to_string(coalesce(related, '{}'::text[]), ' ')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wiki_pages_tenant_type_slug_uniq
  ON public.wiki_pages (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), page_type, slug);

CREATE INDEX IF NOT EXISTS wiki_pages_search_idx
  ON public.wiki_pages USING gin(search_vector);

CREATE INDEX IF NOT EXISTS wiki_pages_tenant_type_idx
  ON public.wiki_pages (tenant_id, page_type);

CREATE INDEX IF NOT EXISTS wiki_pages_global_type_idx
  ON public.wiki_pages (page_type) WHERE tenant_id IS NULL;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_wiki_pages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wiki_pages_touch_updated_at ON public.wiki_pages;
CREATE TRIGGER wiki_pages_touch_updated_at
  BEFORE UPDATE ON public.wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_wiki_pages_updated_at();

-- RLS
ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wiki_pages_select ON public.wiki_pages;
CREATE POLICY wiki_pages_select ON public.wiki_pages
  FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    OR tenant_id IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS wiki_pages_admin_write ON public.wiki_pages;
CREATE POLICY wiki_pages_admin_write ON public.wiki_pages
  FOR ALL
  USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS wiki_pages_super_admin ON public.wiki_pages;
CREATE POLICY wiki_pages_super_admin ON public.wiki_pages
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wiki_pages TO authenticated;

-- ========== SEED: 5 páginas iniciais da Smolka (espelho de docs/wiki/tenants/smolka/pages/) ==========
DO $seed$
DECLARE
  smolka_id uuid;
BEGIN
  SELECT id INTO smolka_id FROM public.tenants WHERE company_name = 'Smolka Imóveis' LIMIT 1;
  IF smolka_id IS NULL THEN
    RAISE NOTICE 'Tenant Smolka não encontrado — seed do wiki pulado.';
    RETURN;
  END IF;

  INSERT INTO public.wiki_pages (tenant_id, page_type, slug, title, content, sources, related, confidence) VALUES
  (smolka_id, 'bairro', 'trindade', 'Trindade',
$page$Bairro residencial de Florianópolis, vizinho à UFSC. Perfil comprador típico: famílias, professores universitários, servidores públicos, pós-graduandos com renda consolidada.

## Preço médio (carteira Smolka, venda)
- 2 quartos: ~R$ 1.100.000
- 3 quartos: ~R$ 1.200.000

Gap 2q→3q pequeno comparado ao Centro (R$ 1,2M → R$ 1,9M). Sinaliza que 3q na Trindade tem melhor custo-benefício pra quem pode flexibilizar localização.

## Âncoras
- UFSC (Universidade Federal de Santa Catarina)
- Escolas: Autonomia, Energia, Waldorf
- Comércio consolidado na Lauro Linhares e Madre Benvenuta

## Perfil típico de lead
- Família com 1-2 filhos em idade escolar
- Orçamento R$ 900k – R$ 1,3M
- Prioriza proximidade de escola e universidade
- Alta sensibilidade a ruído (pedir apto em rua interna / andar alto)

## Objeções comuns
- "Preço alto pra metragem" → responder com valorização histórica e proximidade UFSC
- Para política de desconto, ver objeção desconto-tabela$page$,
    ARRAY['dados Vista agregados', 'stress-test Mariana Sprint 3'],
    ARRAY['centro', 'desconto-tabela'],
    'medium'),

  (smolka_id, 'bairro', 'centro', 'Centro (Florianópolis)',
$page$Núcleo urbano da ilha. Alta liquidez, bom pra investimento e pra quem trabalha em órgãos públicos / escritórios centrais.

## Preço médio (carteira Smolka, venda)
- 2 quartos: ~R$ 1.200.000
- 3 quartos: ~R$ 1.900.000

Gap 2q→3q grande (R$ 700k). 3q no Centro é produto escasso e premium.

## Perfil típico de lead
- Servidores públicos (TJ, TRF, Alesc)
- Investidor pra locação
- Casal sem filhos ou filhos adultos
- Orçamento 2q ~R$ 1,0-1,3M; 3q ~R$ 1,7-2,2M

## Objeções comuns
- Barulho, trânsito, estacionamento → destacar vagas escrituradas e andar alto
- Para política de desconto, ver objeção desconto-tabela$page$,
    ARRAY['dados Vista agregados'],
    ARRAY['trindade', 'desconto-tabela'],
    'medium'),

  (smolka_id, 'objecao', 'desconto-tabela', 'Objeção: "Dá pra baixar o preço?"',
$page$Resposta padrão da Aimee:
- Nunca negociar preço no chat. Aimee não tem autonomia pra aprovar desconto.
- Reconhecer: "Entendo, valor é um ponto importante."
- Redirecionar pra visita + conversa com corretor: "A negociação acontece com o corretor depois da visita — aí dá pra discutir condições reais."
- Se lead insistir, fazer handoff: ver política handoff-corretor.

(placeholder — precisa ser validado com Smolka: política real de desconto, até quantos %, quem aprova)$page$,
    ARRAY[]::text[],
    ARRAY['handoff-corretor'],
    'low'),

  (smolka_id, 'politica', 'handoff-corretor', 'Política: Handoff pro corretor',
$page$## Quando transferir
- Lead qualificado (interest + neighborhood + budget preenchidos) + demonstrou interesse em imóvel específico
- Lead pediu explicitamente falar com humano
- Objeção complexa que exige autoridade (ver objeção desconto-tabela)

## Como anunciar
- Usar label setorial explícito: "nosso Consultor" / "nosso Atendente" / "o Setor X" (commit 31bc5ef).
- Nunca usar label genérico ("um humano", "alguém da equipe").
- Nome do corretor vem de contacts.assigned_broker_id → brokers.name.

## Exemplo
"Perfeito, Mariana! Vou passar seu contato pro nosso Consultor de Vendas da Trindade, o João. Ele te chama em instantes pra agendar a visita."

## Ver também
- aimee-pos-handoff — Aimee não some depois do handoff$page$,
    ARRAY['commit 31bc5ef HandoffLabel_SetorExplicito'],
    ARRAY['aimee-pos-handoff', 'desconto-tabela'],
    'high'),

  (smolka_id, 'politica', 'aimee-pos-handoff', 'Política: Aimee permanece ativa após handoff',
$page$Decisão tomada na call Smolka de 2026-04-14: após handoff pro corretor, NÃO desativar is_ai_active. A Aimee continua no atendimento.

## Por quê
- Corretor pode demorar a responder (fora do horário, ocupado em visita).
- Lead não pode ficar no vácuo.
- Aimee assume papel de "secretária" — confirma horário, tira dúvidas simples, mantém engajamento até corretor entrar.

## Implementação
- Edge Function c2s-create-lead atualizada: captura seller_id + lead_id, NÃO flipa is_ai_active pra false.
- Commit: 1c47422 (Sprint 5).

## Comportamento esperado da Aimee pós-handoff
- Tom muda: de qualificadora → suporte administrativo.
- Não insistir em vender / qualificar de novo.
- Se lead fizer pergunta técnica nova (preço, condição), responder "vou confirmar com o João e te retorno" em vez de chutar.$page$,
    ARRAY['transcrição call Smolka 2026-04-14', 'commit 1c47422'],
    ARRAY['handoff-corretor'],
    'high')
  ON CONFLICT (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), page_type, slug) DO NOTHING;

  RAISE NOTICE 'Wiki Smolka seed concluído (5 páginas).';
END
$seed$;

COMMENT ON TABLE public.wiki_pages IS 'WikiLLM: knowledge base consultável em runtime pelo ai-agent (tools wiki_search/wiki_read_lead). tenant_id NULL = wiki global Aimee.';
