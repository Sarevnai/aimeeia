// ========== AIMEE.iA v2 - QUALIFICATION ==========
// Extracts and scores lead qualification data from conversation.
// Used by ai-agent to determine when a lead is ready for property search.

import { QualificationData, ExtractedQualificationData } from './types.ts';

// ========== QUALIFICATION SCORE ==========

export function calculateQualificationScore(data: QualificationData | null): number {
  if (!data) return 0;

  let score = 0;
  if (data.detected_neighborhood) score += 20;
  if (data.detected_property_type) score += 20;
  if (data.detected_bedrooms) score += 10;
  if (data.detected_budget_max) score += 25;
  if (data.detected_interest) score += 20;  // C3: Finalidade (venda/locação) agora pesa mais
  if (data.detected_timeline) score += 5;   // C3: Timeline de compra (bonus)

  return Math.min(score, 100);
}

export function isQualificationComplete(data: QualificationData | null): boolean {
  // C3-FIX: Qualificação mínima obrigatória antes de buscar imóveis:
  // Exige: finalidade (venda/locação) + tipo de imóvel + orçamento (OBRIGATÓRIO) + bairro (desejável)
  // Orçamento é obrigatório para evitar mostrar imóveis fora da faixa do cliente.
  if (!data) return false;
  if (!data.detected_interest) return false;
  if (!data.detected_property_type) return false;
  if (!data.detected_budget_max) return false;
  return calculateQualificationScore(data) >= 60;
}

// C3-FIX: Retorna quais dados obrigatórios ainda faltam para qualificação mínima
export function getMissingQualificationFields(data: QualificationData | null): string[] {
  const missing: string[] = [];
  if (!data?.detected_interest) missing.push('finalidade'); // venda ou locação
  if (!data?.detected_property_type) missing.push('tipo_imovel'); // casa, apto, etc
  if (!data?.detected_budget_max) missing.push('orcamento'); // obrigatório
  return missing;
}

export function getNextQualificationQuestion(
  data: QualificationData | null,
  department: string
): string | null {
  if (!data) return null;

  // Let the AI use its judgment instead of forcing a strict flow.
  // The system prompt should handle asking natural questions.
  return null;
}

// ========== EXTRACT QUALIFICATION FROM TEXT ==========

export function extractQualificationFromText(
  text: string,
  currentData: QualificationData | null,
  regions: Array<{ region_name: string; neighborhoods: string[] }>,
  lastAiMessage?: string | null
): ExtractedQualificationData {
  const lower = text.toLowerCase();
  const extracted: ExtractedQualificationData = {};
  const sources: Record<string, 'client_explicit'> = {};

  // C5: Always extract from text — allow updates to already-filled fields
  // when the client provides new/different values (implicit corrections).
  // The merge logic will handle overwriting.
  // F1: All extractions from user text are marked as client_explicit.

  // Neighborhood/Region detection
  const neighborhood = detectNeighborhood(lower, regions);
  if (neighborhood && neighborhood !== currentData?.detected_neighborhood) {
    extracted.detected_neighborhood = neighborhood;
    sources.detected_neighborhood = 'client_explicit';
  }

  // Property type detection
  const type = detectPropertyType(lower);
  if (type && type !== currentData?.detected_property_type) {
    extracted.detected_property_type = type;
    sources.detected_property_type = 'client_explicit';
  }

  // Bedrooms detection
  const bedrooms = detectBedrooms(lower, lastAiMessage);
  if (bedrooms && bedrooms !== currentData?.detected_bedrooms) {
    extracted.detected_bedrooms = bedrooms;
    sources.detected_bedrooms = 'client_explicit';
  }

  // Interest detection — always check, allow correction
  // NOTE: moved before budget so sanity check can use the freshly detected interest.
  const interest = detectInterest(lower);
  if (interest && interest !== currentData?.detected_interest) {
    extracted.detected_interest = interest;
    sources.detected_interest = 'client_explicit';
  }

  // Budget detection (sanity: interest vs faixa)
  // Em FLN não existe venda de imóvel < R$ 50k; também não existe aluguel > R$ 50k/mês
  // na prática. Se o número detectado cair fora da faixa esperada pra finalidade,
  // tenta corrigir multiplicando por 1000 (ex: cliente digitou "1,5 k" querendo dizer
  // "1,5 milhão") antes de desistir. Se mesmo assim não encaixar, descarta pra
  // evitar persistir orçamento absurdo.
  //
  // Anti-contamination v2: se a mensagem é DOMINANTEMENTE sobre RENDA (palavras
  // de renda/salário sem palavras de orçamento de imóvel) E já existe budget
  // salvo, não mexe — protege budget=4500 de ser sobrescrito quando cliente
  // diz "ganho 9k de renda".
  const incomeContext = /\b(renda|sal[aá]rio|gan(?:ho|ha|hamos)|recebo|fatur[oa]|ganhar)\b/i.test(lower);
  const budgetContext = /\b(or[cç]amento|alug(?:uel|o)|valor\s+(?:do\s+|de\s+|m[aá]ximo|mensal)|at[eé]|faixa|consigo\s+pagar|pago|teto|m[aá]ximo|cabe|pode\s+ser\s+at[eé])\b/i.test(lower);
  const isPureIncomeMessage = incomeContext && !budgetContext && currentData?.detected_budget_max;

  const effectiveInterest = interest || currentData?.detected_interest || null;
  let budget = isPureIncomeMessage ? null : detectBudget(lower);
  if (budget && effectiveInterest === 'venda' && budget < 50_000) {
    const rescued = budget * 1000;
    budget = (rescued >= 100_000 && rescued <= 50_000_000) ? rescued : null;
  } else if (budget && effectiveInterest === 'locacao' && budget > 50_000) {
    // Aluguel > 50k/mês é provavelmente valor de venda mal rotulado; descarta.
    budget = null;
  }
  if (budget && budget !== currentData?.detected_budget_max) {
    extracted.detected_budget_max = budget;
    sources.detected_budget_max = 'client_explicit';
  }

  // C3: Timeline detection (prazo de decisão)
  const timeline = detectTimeline(lower);
  if (timeline && timeline !== currentData?.detected_timeline) {
    extracted.detected_timeline = timeline;
    sources.detected_timeline = 'client_explicit';
  }

  // Locação v1: renda mensal aproximada
  const income = detectIncomeMonthly(lower, lastAiMessage);
  if (income && income !== currentData?.detected_income_monthly) {
    extracted.detected_income_monthly = income;
    sources.detected_income_monthly = 'client_explicit';
  }

  // Locação v1: pets (sim/não + tipo)
  const pets = detectPets(lower);
  if (pets && (pets.has_pets !== currentData?.detected_has_pets || (pets.pet_type && pets.pet_type !== currentData?.detected_pet_type))) {
    if (typeof pets.has_pets === 'boolean') {
      extracted.detected_has_pets = pets.has_pets;
      sources.detected_has_pets = 'client_explicit';
    }
    if (pets.pet_type) {
      extracted.detected_pet_type = pets.pet_type;
      sources.detected_pet_type = 'client_explicit';
    }
  }

  // Locação v1: data alvo de mudança (ISO)
  const moveIn = detectMoveInDate(lower);
  if (moveIn && moveIn !== currentData?.detected_move_in_date) {
    extracted.detected_move_in_date = moveIn;
    sources.detected_move_in_date = 'client_explicit';
  }

  // Caracteristicas qualitativas (caso Carolina turn 9, 2026-04-27): cliente disse
  // "perto da praia, aceita pet, pra moradia, bastante armário, marmita fitness, nao
  // preciso cozinha equipada" e nada disso cabia no schema. Helena perdeu tudo no
  // turno 10 e o handoff foi vazio. Slot dedicado, dedup, append-only por cliente.
  const features = detectFeatures(text);
  if (features.length > 0) {
    extracted.detected_features = features;
  }

  if (Object.keys(sources).length > 0) {
    extracted.field_sources = sources;
  }

  return extracted;
}

// Dicionario de caracteristicas qualitativas. Negativos vem antes pra ter precedencia
// sobre o positivo correspondente (ex: "nao precisa cozinha equipada" antes de "cozinha
// equipada"). Match case-insensitive contra texto puro (nao lowercased).
const FEATURE_PATTERNS: Array<{ regex: RegExp; canonical: string }> = [
  { regex: /\bn[ãa]o\s+(?:precis|quer)[oa]?\s+(?:de\s+)?cozinha\s+equipada\b|\bn[ãa]o\s+cozinho\b|\bn[ãa]o\s+cozinhamos\b/i, canonical: 'NÃO precisa cozinha equipada' },
  { regex: /\bn[ãa]o\s+(?:precis|quer)[oa]?\s+(?:de\s+)?(?:vaga|garagem)\b/i, canonical: 'NÃO precisa vaga' },
  { regex: /\bn[ãa]o\s+aceito\s+(?:di?vidir|conviver)/i, canonical: 'NÃO aceita dividir' },
  { regex: /\bsem\s+m[óo]vel|\bsem\s+mob[íi]lia\b/i, canonical: 'sem mobília' },
  { regex: /\b(perto|próxim[oa])\s+(d[oa]\s+)?praia\b|\bp[ée]\s+na\s+areia\b|\bbeira\s+mar\b/i, canonical: 'perto da praia' },
  { regex: /\bvista\s+(pro|para\s+o|do)?\s*mar\b/i, canonical: 'vista pro mar' },
  { regex: /\b(muit[oa]s?|bastante|bom|boa|grande|amplo|v[áa]rios?)\s+arm[áa]ri[oa]s?\b/i, canonical: 'bastante armário' },
  { regex: /\barm[áa]rios?\s+(planejad|embutid|sob\s+medida)/i, canonical: 'armários planejados' },
  { regex: /\b(aceit|permit|libera)[aoe]?(?:m)?\s+(animal|pet|c[ãa]o|cachorr|gato)/i, canonical: 'aceita pet' },
  { regex: /\bpet\s+friendly\b/i, canonical: 'aceita pet' },
  { regex: /\b(\d+)\s+vagas?\b/i, canonical: 'vagas (especificadas)' },
  { regex: /\b(garagem|vaga)\s+(coberta|fechada|individual)/i, canonical: 'garagem coberta' },
  { regex: /\bpiscina\b/i, canonical: 'piscina' },
  { regex: /\b(academia|fitness)\b(?!\s*(p[ée]|fora|longe))/i, canonical: 'academia/fitness' },
  { regex: /\bchurrasqueira\b/i, canonical: 'churrasqueira' },
  { regex: /\b(varanda|sacada)\s+(gourmet|grande|ampla)/i, canonical: 'varanda gourmet' },
  { regex: /\bvarand[ãa]o\b/i, canonical: 'varandão' },
  { regex: /\bsu[íi]te\b/i, canonical: 'suíte' },
  { regex: /\bcozinha\s+(americana|integrad)/i, canonical: 'cozinha americana' },
  { regex: /\bcozinha\s+(equipad|planej)/i, canonical: 'cozinha equipada' },
  { regex: /\bmobiliad[oa]\b/i, canonical: 'mobiliado' },
  { regex: /\bsemi[\s-]?mobiliad[oa]\b/i, canonical: 'semi-mobiliado' },
  { regex: /\bhome\s+office\b/i, canonical: 'home office' },
  { regex: /\b(marmita\s+fitness|alimenta[çc][ãa]o\s+saud[áa]vel|comida\s+natural)\b/i, canonical: 'estilo de vida fitness' },
  { regex: /\bp(?:r|ar)a\s+morar\b|\bmoradia\b|\bmoradia\s+fixa\b/i, canonical: 'pra moradia (não temporada)' },
  { regex: /\btempor[áa]da\b/i, canonical: 'temporada' },
  { regex: /\bsegur[áa]n[çc]a\s+24\s*h?\b/i, canonical: 'segurança 24h' },
  { regex: /\bportaria\s+24\s*h?\b/i, canonical: 'portaria 24h' },
  { regex: /\bsal[ãa]o\s+(de\s+)?festas?\b/i, canonical: 'salão de festas' },
  { regex: /\bplayground\b/i, canonical: 'playground' },
  { regex: /\bandar\s+alto\b|\bcobertura\b/i, canonical: 'andar alto' },
  { regex: /\b(perto|próxim[oa])\s+(d[oa]\s+|de\s+|à\s+)?(escola|col[ée]gio|metr[oô])/i, canonical: 'perto de escola/transporte' },
  { regex: /\b(perto|próxim[oa])\s+(d[oa]\s+|de\s+|à\s+)?(mercado|supermercado|shopping)/i, canonical: 'perto de mercado/shopping' },
];

function detectFeatures(text: string): string[] {
  const found = new Set<string>();
  for (const { regex, canonical } of FEATURE_PATTERNS) {
    if (regex.test(text)) found.add(canonical);
  }
  // Limpa redundancias: se pegou "NÃO precisa cozinha equipada", remove "cozinha equipada"
  if (found.has('NÃO precisa cozinha equipada')) found.delete('cozinha equipada');
  if (found.has('NÃO precisa vaga')) {
    found.delete('vagas (especificadas)');
    found.delete('garagem coberta');
  }
  return Array.from(found);
}

// Detect interest (venda/locação/ambos) from text
function detectInterest(lower: string): string | null {
  // Bugfix: \balug\b não bate em "alugar" (g→a sem word boundary). Usar stems
  // com \w* cobre alugar, alugando, alugaria, aluguel, alugue, alug, etc.
  // Mesma lógica pra comprar/investir/adquirir (comprando, compraria, investindo).
  const hasLocacao = /\b(alug\w*|locar|locaria|loca[çc][aã]o|arrend\w*)\b/i.test(lower);
  const hasVenda = /\b(compr\w*|investi\w*|adquir\w*)\b/i.test(lower);

  // Dual interest: "compra ou locação", "venda e locação", etc.
  if (hasLocacao && hasVenda) return 'ambos';
  if (hasLocacao) return 'locacao';
  if (hasVenda) return 'venda';
  return null;
}

// ========== MERGE QUALIFICATION DATA ==========

export function mergeQualificationData(
  current: QualificationData | null,
  extracted: ExtractedQualificationData
): QualificationData {
  const merged: QualificationData = { ...(current || {}) };

  // F1: Propagate field_sources — new extractions overwrite previous sources
  const currentSources = { ...(merged.field_sources || {}) };

  if (extracted.detected_neighborhood) merged.detected_neighborhood = extracted.detected_neighborhood;
  if (extracted.detected_property_type) merged.detected_property_type = extracted.detected_property_type;
  if (extracted.detected_bedrooms) merged.detected_bedrooms = extracted.detected_bedrooms;
  if (extracted.detected_budget_max) merged.detected_budget_max = extracted.detected_budget_max;
  if (extracted.detected_interest) merged.detected_interest = extracted.detected_interest;
  if (extracted.detected_timeline) merged.detected_timeline = extracted.detected_timeline;
  if (extracted.detected_income_monthly) merged.detected_income_monthly = extracted.detected_income_monthly;
  if (typeof extracted.detected_has_pets === 'boolean') merged.detected_has_pets = extracted.detected_has_pets;
  if (extracted.detected_pet_type) merged.detected_pet_type = extracted.detected_pet_type;
  if (extracted.detected_move_in_date) merged.detected_move_in_date = extracted.detected_move_in_date;

  if (extracted.detected_features && extracted.detected_features.length > 0) {
    const existing = Array.isArray(merged.detected_features) ? merged.detected_features : [];
    const unioned = Array.from(new Set([...existing, ...extracted.detected_features]));
    // Negativos sobrescrevem positivos correspondentes ao mesclar com historia previa
    const final = unioned.filter(f => {
      if (f === 'cozinha equipada' && unioned.includes('NÃO precisa cozinha equipada')) return false;
      if (f === 'vagas (especificadas)' && unioned.includes('NÃO precisa vaga')) return false;
      return true;
    });
    merged.detected_features = final.slice(0, 20);
  }

  if (extracted.field_sources) {
    Object.assign(currentSources, extracted.field_sources);
  }
  merged.field_sources = currentSources;

  merged.qualification_score = calculateQualificationScore(merged);
  merged.questions_answered = countAnswered(merged);

  return merged;
}

// ========== DETECT CORRECTIONS ==========

export function detectCorrections(
  text: string,
  currentData: QualificationData | null,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): { detected: boolean; corrections: ExtractedQualificationData } {
  const lower = text.toLowerCase();
  const corrections: ExtractedQualificationData = {};
  let detected = false;

  // C5: Expanded correction patterns — also match "mas eu queria", "isso é pra", "não, quero"
  const correctionPatterns = /na\s+verdade|mudei\s+de\s+ideia|prefiro|ao\s+inv[eé]s|quero\s+mudar|pode\s+ser|pensando\s+melhor|corrig|mas\s+(eu\s+)?quer|n[aã]o[,.]?\s+(eu\s+)?quer|isso\s+[eé]\s+pra|[eé]\s+pra\s+(comprar|alugar|locar|locação)/i;

  if (correctionPatterns.test(lower)) {
    // Re-extract everything and override
    const neighborhood = detectNeighborhood(lower, regions);
    if (neighborhood && neighborhood !== currentData?.detected_neighborhood) {
      corrections.detected_neighborhood = neighborhood;
      detected = true;
    }

    const type = detectPropertyType(lower);
    if (type && type !== currentData?.detected_property_type) {
      corrections.detected_property_type = type;
      detected = true;
    }

    const bedrooms = detectBedrooms(lower);
    if (bedrooms && bedrooms !== currentData?.detected_bedrooms) {
      corrections.detected_bedrooms = bedrooms;
      detected = true;
    }

    const budget = detectBudget(lower);
    if (budget && budget !== currentData?.detected_budget_max) {
      corrections.detected_budget_max = budget;
      detected = true;
    }

    // C5: Also detect interest corrections (was missing entirely)
    const interest = detectInterest(lower);
    if (interest && interest !== currentData?.detected_interest) {
      corrections.detected_interest = interest;
      detected = true;
    }
  }

  return { detected, corrections };
}

// ========== SEED FROM CRM (REMARKETING) ==========

// Caso Carolina (2026-04-27): C2S import populou contacts.crm_natureza="Aluguel",
// crm_neighborhood="Campeche", crm_price_hint="5000", tags=["Interesse: Locação", ...]
// — mas a lead_qualification começou vazia. Sem detected_interest preenchido,
// o buildContextSummary não emitiu a regra "NÃO pergunte alugar/comprar" e a Helena
// re-perguntou no turno 10 mesmo o cliente tendo dito 4 turnos antes. Isso seeda
// a qualification a partir do CRM no início da conversa de remarketing pra que o
// guardrail dispare desde o turno 1.
export function buildSeedFromContact(contact: {
  crm_natureza?: string | null;
  crm_neighborhood?: string | null;
  crm_price_hint?: string | null;
  tags?: string[] | null;
}): ExtractedQualificationData {
  const seed: ExtractedQualificationData = {};
  const sources: Record<string, 'crm_seed'> = {};

  const natureza = (contact.crm_natureza || '').toLowerCase().trim();
  if (natureza === 'aluguel' || natureza === 'locacao' || natureza === 'locação') {
    seed.detected_interest = 'locacao';
    sources.detected_interest = 'crm_seed';
  } else if (natureza === 'compra' || natureza === 'venda') {
    seed.detected_interest = 'venda';
    sources.detected_interest = 'crm_seed';
  }

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  for (const tag of tags) {
    const t = String(tag).toLowerCase();

    if (!seed.detected_interest && t.startsWith('interesse:')) {
      const v = t.replace('interesse:', '').trim();
      if (v.includes('loca')) {
        seed.detected_interest = 'locacao';
        sources.detected_interest = 'crm_seed';
      } else if (v.includes('venda') || v.includes('compra')) {
        seed.detected_interest = 'venda';
        sources.detected_interest = 'crm_seed';
      }
    }

    if (!seed.detected_property_type && t.startsWith('tipo:')) {
      const v = t.replace('tipo:', '').trim();
      const propType = v.includes('apto') || v.includes('apart') ? 'apartamento'
        : v.includes('casa') ? 'casa'
        : v.includes('terreno') ? 'terreno'
        : v.includes('cobertura') ? 'cobertura'
        : v.includes('sala') ? 'sala_comercial'
        : null;
      if (propType) {
        seed.detected_property_type = propType;
        sources.detected_property_type = 'crm_seed';
      }
    }
  }

  if (contact.crm_neighborhood && contact.crm_neighborhood.trim()) {
    seed.detected_neighborhood = contact.crm_neighborhood.trim();
    sources.detected_neighborhood = 'crm_seed';
  }

  // crm_price_hint vem em formatos heterogêneos: "5000", "R$ 5.000,00", "1.400.000,00",
  // "R$ 22.000,00", "R$ 2350.0", "0". Normaliza tirando R$, espaço, e tratando vírgula
  // como decimal pt-BR só quando aparece no fim (ex: "1.400.000,00" → 1400000).
  if (contact.crm_price_hint) {
    const raw = String(contact.crm_price_hint).trim();
    const cleaned = raw.replace(/r\$\s*/i, '').replace(/\s/g, '');
    const ptBr = cleaned.replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
    const parsed = parseFloat(ptBr);
    if (!isNaN(parsed) && parsed > 0) {
      seed.detected_budget_max = Math.round(parsed);
      sources.detected_budget_max = 'crm_seed';
    }
  }

  if (Object.keys(sources).length > 0) {
    seed.field_sources = sources as any;
  }

  return seed;
}

// Mescla seed do CRM em qualData existente APENAS onde campos estão vazios E não
// foram fixados pelo cliente (field_sources != 'client_explicit'). Devolve a
// qualification mesclada e um array dos campos que foram seedados (pra log/diff).
export function mergeSeedIntoQualification(
  current: QualificationData | null,
  seed: ExtractedQualificationData
): { merged: QualificationData; seeded: string[] } {
  const base: QualificationData = current ? { ...current } : {};
  const sources: Record<string, 'client_explicit' | 'inferred' | 'crm_seed'> = {
    ...(current?.field_sources || {}),
  };
  const seeded: string[] = [];

  const seedKeys: Array<keyof ExtractedQualificationData> = [
    'detected_interest',
    'detected_property_type',
    'detected_neighborhood',
    'detected_budget_max',
  ];

  for (const k of seedKeys) {
    const seedVal = (seed as any)[k];
    if (seedVal === undefined || seedVal === null || seedVal === '') continue;
    if (sources[k as string] === 'client_explicit') continue;
    if ((base as any)[k]) continue;
    (base as any)[k] = seedVal;
    sources[k as string] = 'crm_seed';
    seeded.push(k as string);
  }

  if (seeded.length > 0) {
    base.field_sources = sources;
    base.qualification_score = calculateQualificationScore(base);
  }

  return { merged: base, seeded };
}

// ========== SAVE TO DB ==========

export async function saveQualificationData(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  contactId: string | null,
  data: QualificationData,
  conversationId?: string | null
) {
  // Always recalculate score before persisting
  const freshScore = calculateQualificationScore(data);
  data.qualification_score = freshScore;

  // Save to lead_qualification (unique constraint: tenant_id + phone_number)
  const payload: Record<string, any> = {
    tenant_id: tenantId,
    phone_number: phoneNumber,
    detected_neighborhood: data.detected_neighborhood || null,
    detected_property_type: data.detected_property_type || null,
    detected_bedrooms: data.detected_bedrooms || null,
    detected_budget_max: data.detected_budget_max || null,
    detected_interest: data.detected_interest || null,
    detected_timeline: data.detected_timeline || null,
    detected_income_monthly: data.detected_income_monthly ?? null,
    detected_has_pets: typeof data.detected_has_pets === 'boolean' ? data.detected_has_pets : null,
    detected_pet_type: data.detected_pet_type || null,
    detected_move_in_date: data.detected_move_in_date || null,
    detected_features: Array.isArray(data.detected_features) ? data.detected_features : [],
    qualification_score: freshScore,
    field_sources: data.field_sources || {},
    updated_at: new Date().toISOString(),
  };
  if (conversationId) payload.conversation_id = conversationId;

  const { error } = await supabase.from('lead_qualification').upsert(payload, { onConflict: 'tenant_id,phone_number' });

  if (error) {
    console.error(`❌ saveQualificationData failed for ${phoneNumber}:`, error.message, error.details);
  } else {
    console.log(`✅ Qualification saved for ${phoneNumber} (score: ${freshScore})`);
  }
}

// ========== DEPARTMENT RECLASSIFICATION ==========

// Quando a IA detecta a finalidade (venda/locação) e ela diverge do department_code
// atual da conversa, realinha. Ex: conversa criada como 'vendas' (default do rewarm),
// cliente diz "alugar" → passa pra 'locacao'. Evita atendimento/handoff no departamento
// errado sem precisar do corretor corrigir manualmente.
export async function reclassifyConversationDepartment(
  supabase: any,
  tenantId: string,
  conversationId: string | null,
  phoneNumber: string,
  detectedInterest: string | null | undefined,
  currentDepartment: string | null | undefined
): Promise<string | null> {
  if (!conversationId || !detectedInterest) return null;

  // 'administrativo', 'remarketing', 'atualizacao' não sofrem reclassificação por
  // detected_interest — só a dupla vendas ↔ locacao (a IA comercial roda em ambos).
  const isCommercialDept = !currentDepartment || currentDepartment === 'vendas' || currentDepartment === 'locacao';
  if (!isCommercialDept) return null;

  const target = detectedInterest === 'locacao' ? 'locacao'
    : detectedInterest === 'venda' ? 'vendas'
    : null;
  if (!target || target === currentDepartment) return null;

  const { data: firstStage } = await supabase
    .from('conversation_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('department_code', target)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  const update: any = { department_code: target };
  if (firstStage?.id) update.stage_id = firstStage.id;

  await supabase.from('conversations').update(update).eq('id', conversationId);
  await supabase
    .from('contacts')
    .update({ department_code: target })
    .eq('tenant_id', tenantId)
    .eq('phone', phoneNumber);

  await supabase.from('conversation_events').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    event_type: 'department_reclassified',
    metadata: { from: currentDepartment || null, to: target, reason: 'detected_interest' },
  }).then(() => {}, () => {});

  console.log(`🔀 Dept reclassified ${currentDepartment || 'null'} → ${target} (interest=${detectedInterest}) for ${phoneNumber}`);
  return target;
}

// ========== PRIVATE HELPERS ==========

// Common abbreviations and aliases for neighborhoods in Florianópolis
const NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  'santo antônio de lisboa': ['santo antônio', 'santo antonio', 'sto antônio', 'sto antonio', 'sto. antônio', 'sto. antonio'],
  'ingleses do rio vermelho': ['ingleses', 'praia dos ingleses', 'centrinho dos ingleses'],
  'cachoeira do bom jesus': ['cachoeira', 'cachoeira do bom jesus'],
  'ponta das canas': ['ponta das canas'],
  'são joão do rio vermelho': ['são joão', 'sao joao'],
  'armação do pântano do sul': ['armação', 'armacao'],
  'lagoa da conceição': ['lagoa', 'lagoa da conceição', 'lagoa da conceicao'],
  'ribeirão da ilha': ['ribeirão', 'ribeirao'],
  'jurerê internacional': ['jurerê internacional', 'jurere internacional'],
  'jurerê tradicional': ['jurerê tradicional', 'jurere tradicional'],
  'jurerê': ['jurere', 'jurerê'],
  'canasvieiras': ['canasvieiras', 'canas vieiras', 'canasvierias', 'canas'],
  'saco dos limões': ['saco dos limões', 'saco dos limoes'],
  'costeira do pirajubaé': ['costeira', 'pirajubaé', 'pirajubae'],
  'vargem do bom jesus': ['vargem do bom jesus'],
  'balneário do estreito': ['balneário estreito'],
};

// Normalize accented characters for accent-insensitive matching
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectNeighborhood(
  lower: string,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): string | null {
  // Normalize input for accent-insensitive comparison
  const normalizedInput = removeAccents(lower);

  // Helper: find all matching neighborhoods in text
  function findAllMatches(text: string): string[] {
    const matches: string[] = [];
    for (const region of regions) {
      for (const neighborhood of region.neighborhoods) {
        const norm = removeAccents(neighborhood.toLowerCase());
        if (text.includes(norm)) {
          matches.push(neighborhood);
        }
      }
      const normRegion = removeAccents(region.region_name.toLowerCase());
      if (text.includes(normRegion)) {
        matches.push(region.region_name);
      }
    }
    // Also check aliases
    for (const region of regions) {
      for (const neighborhood of region.neighborhoods) {
        const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()];
        if (aliases) {
          for (const alias of aliases) {
            if (text.includes(removeAccents(alias))) {
              if (!matches.includes(neighborhood)) matches.push(neighborhood);
            }
          }
        }
      }
    }
    return matches;
  }

  const allMatches = findAllMatches(normalizedInput);

  // If only one match, return it directly
  if (allMatches.length <= 1) {
    return allMatches[0] || null;
  }

  // Multiple matches: use context to disambiguate
  // Patterns that indicate DESIRED neighborhood (higher priority)
  const desiredPatterns = [
    /(?:quero|gostaria|prefiro|busco|procuro|preciso|desejo)\s+(?:morar|um\s+im[oó]vel|uma?\s+casa|um\s+ap(?:to|artamento)?)\s+(?:em|no|na|n[oa]s?)\s+/i,
    /(?:morar|residir|viver)\s+(?:em|no|na)\s+/i,
    /(?:regiao|bairro|zona)\s+(?:de|do|da)\s+/i,
    /(?:gost[oa]|ador[oa]|curto)\s+(?:muito\s+)?(?:d[oa]|a\s+regiao)\s+/i,
  ];

  // Patterns that indicate WORKPLACE/non-desired context (lower priority)
  const workPatterns = [
    /(?:trabalh[oa]|atuo|fa[cç]o\s+est[aá]gio|emprego|escrit[oó]rio|servi[cç]o)\s+(?:em|no|na|n[oa]s?|pel[oa])\s+/i,
    /(?:meu\s+trabalho|minha\s+empresa|meu\s+escrit[oó]rio)\s+(?:[eé]|fica)\s+(?:em|no|na)\s+/i,
  ];

  // Check which neighborhoods appear in desired context
  const desiredContextMatches: string[] = [];
  for (const match of allMatches) {
    const normMatch = removeAccents(match.toLowerCase());
    for (const pattern of desiredPatterns) {
      const regex = new RegExp(pattern.source + '[^.!?]*' + normMatch, 'i');
      if (regex.test(normalizedInput)) {
        if (!desiredContextMatches.includes(match)) desiredContextMatches.push(match);
        break;
      }
    }
  }
  // If we found neighborhoods in desired context, use those (may be multiple)
  if (desiredContextMatches.length > 0) {
    return desiredContextMatches.join(', ');
  }

  // Filter out neighborhoods that only appear in work context
  const workContextMatches: string[] = [];
  for (const match of allMatches) {
    const normMatch = removeAccents(match.toLowerCase());
    for (const pattern of workPatterns) {
      const regex = new RegExp(pattern.source + '[^.!?]*' + normMatch, 'i');
      if (regex.test(normalizedInput)) {
        workContextMatches.push(match);
      }
    }
  }

  // Return all matches that are NOT in work context, joined by comma
  const nonWorkMatches = allMatches.filter(m => !workContextMatches.includes(m));
  if (nonWorkMatches.length > 0) {
    // Multiple desired neighborhoods: join them (e.g., "Centro, Agronômica")
    return nonWorkMatches.join(', ');
  }

  // Fallback: return first match
  return allMatches[0];
}

function detectPropertyType(lower: string): string | null {
  // Bugfix: `ap\b` não casa "apt" (t é word char). Adicionar apt/apto/apê/apes/apês.
  // Cobre também "aptos" e "apes" (plurais informais) + acentuações.
  if (/\b(apartamentos?|aptos?|ap[êe]s?|apts?)\b/i.test(lower)) return 'apartamento';
  if (/\bcasa\b/i.test(lower)) return 'casa';
  if (/cobertura/i.test(lower)) return 'cobertura';
  if (/terreno|lote/i.test(lower)) return 'terreno';
  if (/kitnet|kit\b|studio|est[uú]dio/i.test(lower)) return 'kitnet';
  if (/sobrado/i.test(lower)) return 'sobrado';
  if (/sala\s+comercial|comercial|loja/i.test(lower)) return 'comercial';
  return null;
}

function detectBedrooms(lower: string, lastAiMessage?: string | null): number | null {
  // Match "3 quartos", "3 dormitórios", "de 3 quartos", "com 3 quartos"
  // Also "3 quartos sendo 2 suítes" — always extract TOTAL bedrooms count
  const match = lower.match(/(?:de\s+|com\s+)?(\d+)\s*(?:quartos?|dormit[oó]rios?|dorms?)/i);
  if (match) return parseInt(match[1]);

  // Fallback: "2 suítes" without explicit quartos count — treat suítes as bedrooms hint
  const suitesMatch = lower.match(/(?:de\s+|com\s+)?(\d+)\s*su[ií]tes?/i);
  if (suitesMatch) return parseInt(suitesMatch[1]);

  // Word to number: "três quartos", "dois dormitórios"
  const wordMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tr[eê]s': 3, 'tres': 3,
    'quatro': 4, 'cinco': 5,
  };
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`(?:de\\s+|com\\s+)?${word}\\s*(?:quartos?|dormit|su[ií]tes?)`, 'i').test(lower)) return num;
  }

  // Context-aware: se a última mensagem da IA perguntou sobre quartos/dormitórios
  // e a resposta é curta + começa com número, trata como contagem de quartos.
  // Ex: IA pergunta "quantos quartos?" → cliente responde "2 ou mais" / "3" / "pelo menos 2".
  const aiAskedBedrooms = lastAiMessage && /\b(quartos?|dormit[oó]rios?|dorms?|quantos?\s+quartos?|c[oô]modos?)\b/i.test(lastAiMessage);
  if (aiAskedBedrooms && lower.length <= 40) {
    const shortNumMatch = lower.match(/\b(\d+)\s*(?:\+|ou\s*mais|pelo\s*menos|no\s*m[ií]nimo|m[ií]nimo\s*(?:de\s*)?|\s|$)/i);
    if (shortNumMatch) {
      const n = parseInt(shortNumMatch[1]);
      if (n >= 1 && n <= 10) return n;
    }
  }

  return null;
}

function detectBudget(lower: string): number | null {
  // -2. Compound addition: "X milhão e Y" / "X milhão e Y mil" → X*1M + Y*1k
  // Handles: "1 milhão e 200", "1 milhão e 200 mil", "2 milhões e 500 mil"
  const compoundAddPattern = /([\d.,]+)\s*milh[aãoõ][oe]?s?\s+e\s+([\d.,]+)\s*(?:mil|k)?/i;
  const compoundAddMatch = lower.match(compoundAddPattern);
  if (compoundAddMatch) {
    const millions = parseFloat(compoundAddMatch[1].replace(/\./g, '').replace(',', '.'));
    let additional = parseFloat(compoundAddMatch[2].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(millions) && !isNaN(additional)) {
      // "e 200 mil" → 200*1000; "e 200" (bare, <1000) → 200*1000 (contextual: milhão+small = thousands)
      if (additional < 1000) additional *= 1000;
      const total = millions * 1_000_000 + additional;
      if (total >= 100_000 && total <= 50_000_000) return total;
    }
  }

  // -1. Compound pattern: "X à vista + Y financiado" → SUM both values
  const compoundPattern = /([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:[aà]\s*vista|de\s*entrada).*?([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:financiad|parcelad)/i;
  const compoundMatch = lower.match(compoundPattern);
  if (compoundMatch) {
    const v1 = parseFloat(compoundMatch[1].replace(/\./g, '').replace(',', '.'));
    const v2 = parseFloat(compoundMatch[2].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(v1) && !isNaN(v2)) {
      const total = (v1 + v2) * 1_000_000;
      if (total >= 100_000 && total <= 50_000_000) return total;
    }
  }

  // 0. Range detection: "500 mil a 700 mil", "de 400k a 600k", "entre 300 e 500 mil"
  // Always take the UPPER bound of the range (detected_budget_max)
  const rangePatterns = [
    // "500 mil a 700 mil", "500k a 700k", "500 mil até 700 mil"
    /([\d.,]+)\s*(?:mil|k)\s*(?:a|até|e|ou)\s*([\d.,]+)\s*(?:mil|k)/i,
    // "de 500 a 700 mil", "entre 500 e 700 mil"
    /(?:de|entre)\s*([\d.,]+)\s*(?:a|até|e)\s*([\d.,]+)\s*(?:mil|k)/i,
    // "R$ 500.000 a R$ 700.000"
    /r\$\s*([\d.,]+)\s*(?:a|até|e)\s*r?\$?\s*([\d.,]+)/i,
    // "500 a 700 mil"
    /([\d.,]+)\s*(?:a|até|e)\s*([\d.,]+)\s*(?:mil|k)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = lower.match(pattern);
    if (match) {
      // Take the SECOND value (upper bound) as budget_max
      let rawMax = match[2].replace(/\./g, '').replace(',', '.');
      let numMax = parseFloat(rawMax);
      if (isNaN(numMax)) continue;

      // Apply "mil"/"k" multiplier
      if (/mil|k/i.test(match[0])) {
        if (numMax < 1000) numMax *= 1000;
      }

      if (numMax >= 100 && numMax <= 50_000_000) return numMax;
    }
  }

  // 1. Check "milhão/milhões" patterns (highest priority — natural speech)
  const milhaoPatterns = [
    /r?\$?\s*([\d.,]+)\s*milh[aãoõ][oe]?s?/i,           // "5 milhões", "R$ 2,5 milhões", "1 milhão"
    /([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:de\s+)?(?:reais)?/i, // "5 milhões de reais"
    /(\d+)[.,](\d+)\s*(?:mi|M)\b/i,                       // "2.3M", "1,5 mi"
    /(\d+)\s*(?:mi|M)\b/i,                                // "1M", "2M", "5 mi"
  ];

  for (const pattern of milhaoPatterns) {
    const match = lower.match(pattern);
    if (match) {
      let value = match[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(value);
      if (isNaN(num)) continue;
      num *= 1_000_000;
      if (num >= 100_000 && num <= 50_000_000) return num;
    }
  }

  // 2. Standard R$ patterns
  const patterns = [
    /r\$\s*([\d.,]+)\s*(?:mil|k)/i,
    /r\$\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:mil|k)\s*(?:reais)?/i,
    /at[eé]\s*r?\$?\s*([\d.,]+)/i,
    /([\d.,]+)\s*reais/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let value = match[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(value);
      if (isNaN(num)) continue;

      // "mil" / "k" multiplier
      if (/mil|k/i.test(lower.slice(match.index || 0, (match.index || 0) + match[0].length + 5))) {
        if (num < 1000) num *= 1000;
      }

      if (num >= 100 && num <= 50000000) return num;
    }
  }

  // 3. Bare numbers in Brazilian thousands format: "8.000", "22.000", "1.500.000"
  // Common when client replies just the number without R$, "mil", or "reais"
  const bareBrMatch = lower.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (bareBrMatch) {
    const num = parseFloat(bareBrMatch[1].replace(/\./g, ''));
    if (!isNaN(num) && num >= 500 && num <= 50_000_000) return num;
  }

  // 4. Plain bare numbers: "8000", "22000" (no thousands separator)
  const plainMatch = lower.match(/\b(\d{4,8})\b/);
  if (plainMatch) {
    const num = parseInt(plainMatch[1]);
    if (!isNaN(num) && num >= 500 && num <= 50_000_000) return num;
  }

  return null;
}

function countAnswered(data: QualificationData): number {
  let count = 0;
  if (data.detected_neighborhood) count++;
  if (data.detected_property_type) count++;
  if (data.detected_bedrooms) count++;
  if (data.detected_budget_max) count++;
  if (data.detected_interest) count++;
  if (data.detected_timeline) count++;
  // Locação v1: campos pré-visita contam quando preenchidos
  if (data.detected_income_monthly) count++;
  if (typeof data.detected_has_pets === 'boolean') count++;
  if (data.detected_move_in_date) count++;
  return count;
}

// ========== AUTO-TAGGING ==========

// Known prefixes for auto-generated tags (used to identify and replace them)
const AUTO_TAG_PREFIXES = ['Interesse:', 'Tipo:', 'Bairro:', 'Quartos:', 'Orçamento:', 'Prazo:'];

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatBudgetBucket(value: number, interest?: string | null): string {
  // Aluguel: valores mensais, buckets em R$ por mês.
  // Heurística: se interest=locacao OU valor < 50k (não tem venda de imóvel abaixo disso em FLN),
  // tratar como faixa de aluguel.
  const isLocacao = interest === 'locacao' || interest === 'ambos' && value < 50000 || (!interest && value < 50000);
  if (isLocacao) {
    if (value <= 1500) return 'até R$ 1.500/mês';
    if (value <= 2500) return 'R$ 1.500-2.500/mês';
    if (value <= 4000) return 'R$ 2.500-4.000/mês';
    if (value <= 6000) return 'R$ 4.000-6.000/mês';
    if (value <= 10000) return 'R$ 6.000-10.000/mês';
    if (value <= 20000) return 'R$ 10.000-20.000/mês';
    return 'acima de R$ 20.000/mês';
  }
  if (value <= 100000) return 'até 100k';
  if (value <= 300000) return '100k-300k';
  if (value <= 500000) return '300k-500k';
  if (value <= 1000000) return '500k-1M';
  if (value <= 2500000) return '1M-2.5M';
  if (value <= 5000000) return '2.5M-5M';
  return 'acima de 5M';
}

function formatTimeline(timeline: string): string {
  if (timeline === '0-3m') return 'Curto prazo';
  if (timeline === '3-6m') return 'Médio prazo';
  if (timeline === '6m+') return 'Longo prazo';
  return timeline;
}

/**
 * Converts qualification data into human-readable tags.
 * Tags use known prefixes (e.g., "Interesse:", "Bairro:") so they can be
 * identified and replaced on subsequent updates without touching manual tags.
 */
export function generateTagsFromQualification(data: QualificationData | null): string[] {
  if (!data) return [];

  const tags: string[] = [];
  if (data.detected_interest) {
    tags.push(`Interesse: ${data.detected_interest === 'locacao' ? 'Locação' : 'Venda'}`);
  }
  if (data.detected_property_type) {
    tags.push(`Tipo: ${capitalize(data.detected_property_type)}`);
  }
  if (data.detected_neighborhood) {
    tags.push(`Bairro: ${data.detected_neighborhood}`);
  }
  if (data.detected_bedrooms) {
    tags.push(`Quartos: ${data.detected_bedrooms}`);
  }
  if (data.detected_budget_max) {
    tags.push(`Orçamento: ${formatBudgetBucket(data.detected_budget_max, data.detected_interest)}`);
  }
  if (data.detected_timeline) {
    tags.push(`Prazo: ${formatTimeline(data.detected_timeline)}`);
  }
  return tags;
}

/**
 * Syncs auto-generated tags to contacts.tags without overwriting manual tags.
 * Removes old auto-tags (identified by known prefixes), merges new ones, preserves manual tags.
 */
export async function syncContactTags(
  supabase: any,
  contactId: string,
  newAutoTags: string[]
): Promise<void> {
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();

    const existingTags: string[] = contact?.tags || [];

    // Keep only manual tags (those that DON'T start with a known auto-prefix)
    const manualTags = existingTags.filter(
      (t: string) => !AUTO_TAG_PREFIXES.some(prefix => t.startsWith(prefix))
    );

    // Merge manual + new auto tags
    const mergedTags = [...manualTags, ...newAutoTags];

    await supabase
      .from('contacts')
      .update({ tags: mergedTags, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    console.log(`🏷️ Tags synced for contact ${contactId}: [${newAutoTags.join(', ')}]`);
  } catch (err) {
    console.error(`⚠️ Failed to sync tags for contact ${contactId}:`, err);
    // Non-blocking: tag sync failure should not break the conversation
  }
}

// ===== Locação v1: detectors específicos =====

// Renda mensal aproximada (R$/mês). Tolera "ganho 5k", "renda de 6 mil", "uns 8 mil por mês",
// "salário 4500", "tiro 7k mensais", "minha renda é uns 5,5 mil". Só extrai quando há
// CONTEXTO de renda — número solto não vira renda (já é budget/aluguel).
function detectIncomeMonthly(lower: string, lastAiMessage?: string | null): number | null {
  // Palavras EXPLÍCITAS de renda — não inclui "por mês"/"mensal" sozinhos pra evitar
  // confundir com valor de aluguel ("até 4500 por mês"). Income só dispara em contexto
  // claro de renda/salário/CLT/PJ ou quando AI perguntou diretamente sobre renda.
  const incomeContext = /\b(renda|sal[aá]rio|gan(?:ho|hamos|ha)|recebo|tiro|fatur[oa]|fonte\s+de\s+renda|clt|pj|aut[oô]nom[oa]|carteira\s+assinada|microempreend|mei|pessoa\s+jur[ií]dica|holerite|comprov(?:o|ar)\s+renda)\b/i;
  const aiAskedIncome = lastAiMessage && /\b(renda|sal[aá]rio|ganha|fatur[oa]|comprov(?:a|ante).{0,15}renda|clt|pj)\b/i.test(lastAiMessage);

  if (!incomeContext.test(lower) && !aiAskedIncome) return null;

  // Se a mensagem é PURAMENTE sobre aluguel (tem "aluguel"/"alug" + número + "mês"/"mensal" mas SEM
  // termo de renda forte), descarta — protege contra falso positivo em "até 4500 por mês".
  const isPureRentalMention = /\balug/i.test(lower) && !/\b(renda|sal[aá]rio|gan(?:ho|hamos|ha)|recebo|fatur[oa]|clt|pj)\b/i.test(lower);
  if (isPureRentalMention) return null;

  const patterns = [
    /([\d.,]+)\s*(?:mil|k)\s*(?:reais)?\b/i,
    /r\$\s*([\d.,]+)\s*(?:mil|k)?/i,
    /([\d.,]+)\s*reais\b/i,
    /\b([\d.,]+)\b/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let raw = match[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(raw);
      if (isNaN(num)) continue;
      // "X mil" / "Xk" → multiplica
      const matchedSlice = lower.slice(match.index || 0, (match.index || 0) + match[0].length + 5);
      if (/mil|k\b/i.test(matchedSlice)) {
        if (num < 1000) num *= 1000;
      }
      // Renda razoável: entre R$ 800 (CLT mínimo+) e R$ 200k/mês (alto padrão)
      if (num >= 800 && num <= 200_000) return num;
    }
  }
  return null;
}

// Pets: extrai sim/não + tipo. Cobre "tenho cachorro", "moramos com 2 gatos",
// "não tenho pet", "sem animais", "tenho um shih tzu", "cachorro grande".
function detectPets(lower: string): { has_pets?: boolean; pet_type?: string } | null {
  // Negativo explícito
  if (/\bn[aã]o\s+(tenho|temos|possu[oi]|moro\s+com)\s+(animal|animais|pet|cachorro|gato|bicho)\b/i.test(lower)) {
    return { has_pets: false };
  }
  if (/\bsem\s+(animal|animais|pet|bicho|cachorro|gato)\b/i.test(lower)) {
    return { has_pets: false };
  }

  // Positivo + tipo
  const result: { has_pets?: boolean; pet_type?: string } = {};
  const types: string[] = [];

  if (/\b(cachorr(?:o|a|os|as|inh[oa]s?)|c[aã]es?|dog|doguinho|vira-?lata|filhote|pet|cachorrinh[oa]s?|cachorr[oa]\s+pequen[oa]|lhasa|poodle|shih.?tzu|labrador|golden|bulldog|pinscher|spitz|maltes|yorkshire|chihuahua|dachshund|salsicha|pug|husky|pastor|border\s+collie|dálmata|dalmata|pitbull|boxer|rottweiler|beagle)\b/i.test(lower)) {
    types.push('cachorro');
    result.has_pets = true;
  }
  if (/\b(gat[oa]s?|gatinh[oa]s?|felin[oa]s?|persa|siames[ae])\b/i.test(lower)) {
    types.push('gato');
    result.has_pets = true;
  }
  if (/\b(p[aá]ssar[oa]s?|cal[oó]psita|periquito|papagaio)\b/i.test(lower)) {
    types.push('pássaro');
    result.has_pets = true;
  }
  if (/\b(coelh[oa]s?|h[aá]mster|porquinho.da.[ií]ndia|f[uú]ret)\b/i.test(lower)) {
    types.push('roedor/exótico');
    result.has_pets = true;
  }

  // Modificador de tamanho pra cachorro
  if (types.includes('cachorro')) {
    if (/\bgrande\b/i.test(lower)) result.pet_type = 'cachorro grande';
    else if (/\b(pequen[oa]|pequenin[oa]|porte\s+pequeno)\b/i.test(lower)) result.pet_type = 'cachorro pequeno';
    else if (/\b(m[eé]dio|porte\s+m[eé]dio)\b/i.test(lower)) result.pet_type = 'cachorro médio';
  }

  if (types.length > 0 && !result.pet_type) {
    result.pet_type = types.join(', ');
  }

  // Positivo genérico
  if (typeof result.has_pets !== 'boolean') {
    if (/\b(tenho|temos|possu[oi]|moro\s+com|mor[oa]mos\s+com|tenho\s+um\s+pet)\b.{0,30}\b(pet|animal|bicho|animais)\b/i.test(lower)) {
      result.has_pets = true;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// Move-in date: extrai data alvo de mudança em ISO YYYY-MM-DD.
// Cobre: "preciso mudar até 30/05", "mudança em maio", "quero entrar dia 15", "mês que vem",
// "começo de junho", "fim do mês", "antes do casamento" (este último ignorado).
function detectMoveInDate(lower: string): string | null {
  // Tem que ter contexto de mudança/entrada/disponibilidade
  const moveContext = /\b(mudar|mudan[cç]a|entrar|me\s+mudo|nos\s+mudamos|pra\s+morar|come[cç]ar\s+a\s+morar|disponibilidade|dispon[ií]vel|chave|entrega\s+das?\s+chaves?)\b/i;
  if (!moveContext.test(lower)) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Padrão DD/MM/YYYY ou DD/MM
  const fullDate = lower.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (fullDate) {
    const day = parseInt(fullDate[1]);
    const month = parseInt(fullDate[2]);
    let year = fullDate[3] ? parseInt(fullDate[3]) : currentYear;
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= currentYear && year <= currentYear + 2) {
      // Se o mês já passou neste ano e não veio ano explícito, assumir próximo ano
      if (!fullDate[3] && month < currentMonth) year = currentYear + 1;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Mês por nome
  const months: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'mar[cç]o': 3, 'abril': 4, 'maio': 5, 'junho': 6,
    'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
  };
  for (const [name, monthNum] of Object.entries(months)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      let year = currentYear;
      if (monthNum < currentMonth) year = currentYear + 1;
      // Padrão de dia: "dia 15 de maio", "15 de maio"
      const dayMatch = lower.match(new RegExp(`(?:dia\\s+)?(\\d{1,2})\\s*(?:de\\s+)?${name}`, 'i'));
      let day = dayMatch ? parseInt(dayMatch[1]) : 1; // default dia 1
      if (day < 1 || day > 31) day = 1;
      // Modificadores: "começo/início", "meio", "fim/final"
      if (!dayMatch) {
        if (/\b(in[ií]cio|come[cç]o)\s+(?:de\s+)?(?:[a-zçãé]+|m[eê]s)/i.test(lower)) day = 5;
        else if (/\bmeio\s+(?:de\s+)?(?:[a-zçãé]+|m[eê]s)/i.test(lower)) day = 15;
        else if (/\b(fim|final)\s+(?:de\s+)?(?:[a-zçãé]+|m[eê]s)/i.test(lower)) day = 28;
      }
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Relativo: "mês que vem", "próximo mês", "esse mês", "mês seguinte"
  if (/\b(m[eê]s\s+que\s+vem|pr[oó]ximo\s+m[eê]s|m[eê]s\s+seguinte)\b/i.test(lower)) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (/\b(esse\s+m[eê]s|este\s+m[eê]s|ainda\s+esse\s+m[eê]s)\b/i.test(lower)) {
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(Math.min(28, now.getDate() + 7)).padStart(2, '0')}`;
  }
  if (/\b(daqui\s+a\s+(\d+)\s*(?:meses|m[eê]s))\b/i.test(lower)) {
    const m = lower.match(/daqui\s+a\s+(\d+)\s*(?:meses|m[eê]s)/i);
    if (m) {
      const future = new Date(now.getFullYear(), now.getMonth() + parseInt(m[1]), 1);
      return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-01`;
    }
  }

  return null;
}

// C3: Detecta prazo de decisão/compra do cliente
function detectTimeline(lower: string): string | null {
  // Imediato / urgente / até 3 meses
  if (/\b(imediato|urgente|agora|j[aá]|o\s+mais\s+r[aá]pido|esse\s+m[eê]s|pr[oó]ximo\s+m[eê]s|1\s*m[eê]s|2\s*meses?|3\s*meses?|curto\s+prazo|nos\s+pr[oó]ximos\s+3)\b/i.test(lower)) {
    return '0-3m';
  }
  // 3 a 6 meses
  if (/\b(4\s*meses?|5\s*meses?|6\s*meses?|meio\s+ano|primeiro\s+semestre|m[eé]dio\s+prazo|3\s*a\s*6)\b/i.test(lower)) {
    return '3-6m';
  }
  // Acima de 6 meses / sem pressa
  if (/\b(sem\s+pressa|n[aã]o\s+tenho\s+pressa|longo\s+prazo|mais\s+de\s+6|acima\s+de\s+6|1\s*ano|pr[oó]ximo\s+ano|ano\s+que\s+vem|quando\s+achar|sem\s+urg[eê]ncia)\b/i.test(lower)) {
    return '6m+';
  }
  return null;
}
