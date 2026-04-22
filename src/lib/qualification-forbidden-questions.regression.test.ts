// Regression guard: Mone (A-01, 09/04 18:24-18:25) — a LLM recebia
// "🎯 Objetivo: venda e locação" no <lead_data> e MESMO ASSIM re-perguntava
// "você está buscando para alugar ou para comprar?", frustrando a lead
// ("Como eu disse a vc..."). O fix em prompts.ts injeta um bloco
// "🚫 PERGUNTAS PROIBIDAS NESTE TURNO" explicitando qual pergunta está
// fechada por campo já preenchido. Este teste valida que o bloco é gerado
// corretamente para cada combinação de campos.

import { describe, it, expect } from 'vitest';
import { buildContextSummary } from '../../supabase/functions/_shared/prompts';

// Helper — montar QualificationData mínimo
const q = (overrides: Record<string, unknown> = {}) => ({
  detected_interest: null,
  detected_property_type: null,
  detected_neighborhood: null,
  detected_bedrooms: null,
  detected_budget_max: null,
  detected_timeline: null,
  ...overrides,
});

describe('buildContextSummary — PERGUNTAS PROIBIDAS', () => {
  it('incidente Mone (A-01): interesse=ambos proíbe "alugar ou comprar?"', () => {
    const out = buildContextSummary(q({ detected_interest: 'ambos' }) as never, 'Mone');
    expect(out).toContain('PERGUNTAS PROIBIDAS');
    expect(out).toContain('AMBOS (venda E locação)');
    expect(out).toMatch(/NÃO pergunte "é para alugar ou comprar/);
  });

  it('interesse=venda proíbe "alugar ou comprar" com contexto correto', () => {
    const out = buildContextSummary(q({ detected_interest: 'venda' }) as never, 'Ian');
    expect(out).toContain('cliente já disse que quer comprar');
    expect(out).not.toContain('AMBOS');
  });

  it('interesse=locacao proíbe "alugar ou comprar" com contexto correto', () => {
    const out = buildContextSummary(q({ detected_interest: 'locacao' }) as never, 'Ian');
    expect(out).toContain('cliente já disse que quer alugar');
  });

  it('tipo preenchido proíbe "casa ou apartamento"', () => {
    const out = buildContextSummary(q({ detected_property_type: 'apartamento' }) as never, 'Ian');
    expect(out).toMatch(/NÃO pergunte "casa ou apartamento/);
    expect(out).toContain('apartamento');
  });

  it('bairro preenchido proíbe "em que bairro"', () => {
    const out = buildContextSummary(q({ detected_neighborhood: 'Centro' }) as never, 'Ian');
    expect(out).toMatch(/NÃO pergunte "em que bairro/);
    expect(out).toContain('Centro');
  });

  it('quartos preenchido proíbe "quantos quartos"', () => {
    const out = buildContextSummary(q({ detected_bedrooms: 3 }) as never, 'Ian');
    expect(out).toMatch(/NÃO pergunte "quantos quartos/);
    expect(out).toContain('3');
  });

  it('orçamento preenchido proíbe "qual seu orçamento"', () => {
    const out = buildContextSummary(q({ detected_budget_max: 800000 }) as never, 'Ian');
    expect(out).toMatch(/NÃO pergunte "qual seu orçamento/);
    // currency format pt-BR
    expect(out).toMatch(/R\$\s*800/);
  });

  it('múltiplos campos geram múltiplas proibições', () => {
    const out = buildContextSummary(
      q({
        detected_interest: 'venda',
        detected_property_type: 'casa',
        detected_neighborhood: 'Jurerê',
        detected_budget_max: 2000000,
      }) as never,
      'Ian',
    );
    const matches = (out.match(/NÃO pergunte/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(4);
  });

  it('campo vazio NÃO gera proibição', () => {
    const out = buildContextSummary(q({ detected_interest: 'venda' }) as never, 'Ian');
    // só 1 proibição (interesse). Não deve proibir perguntas sobre tipo/bairro/orçamento.
    expect(out).not.toMatch(/NÃO pergunte "casa ou apartamento/);
    expect(out).not.toMatch(/NÃO pergunte "em que bairro/);
    expect(out).not.toMatch(/NÃO pergunte "qual seu orçamento/);
  });

  it('quando nenhum campo preenchido, bloco de proibições não aparece', () => {
    // NOTA: buildContextSummary retorna '' quando collected.length === 0.
    // Então passamos ao menos o name pra garantir que collected não está vazio.
    const out = buildContextSummary(q() as never, 'Ian');
    // collected inclui só o nome → output não é vazio, mas não deve ter PERGUNTAS PROIBIDAS
    expect(out).not.toContain('PERGUNTAS PROIBIDAS');
  });
});
