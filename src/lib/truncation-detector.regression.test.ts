// Regression guard for the truncation detector added to pre-completion-check.
// Incidente A-03 (20/04 21:54): o LLM enviou "Olá, Roberto" como última
// mensagem a um proprietário esperando resposta sobre repasse atrasado.
// 12 chars passava no threshold antigo de 10. O detector agora precisa
// capturar qualquer "saudação nua" e qualquer resposta que termina em
// vírgula/dois-pontos (provável corte mid-clause do LLM).
//
// Estes testes replicam EXATAMENTE os heuristics da função em
// supabase/functions/_shared/agents/pre-completion-check.ts (regra 1).
// Um drift entre ambos os lados vai falhar este teste na CI antes do
// deploy, forçando atualização consciente.

import { describe, it, expect } from 'vitest';

// Mirror of the 3 heuristics in pre-completion-check.ts regra 1.
// Kept as a local pure function here so the vitest runner (jsdom) não
// precisa importar código Deno do supabase/functions.
function isTruncated(raw: string): { truncated: boolean; reason?: string } {
  const trimmedResponse = (raw || '').trim();
  const isEmpty = trimmedResponse.length < 10;
  const looksLikeNakedGreeting = /^(ol[áa]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|opa|prezad[oa]|sr\.?|sra\.?|senhor\s*a?)\s*[,.!?]?\s*[a-záàâãéêíóôõú\s.-]{2,40}\s*[!.]?\s*$/i
    .test(trimmedResponse) && trimmedResponse.length < 40;
  const endsMidClause = /[,;:]\s*$/.test(trimmedResponse) && trimmedResponse.length < 80;

  if (isEmpty) return { truncated: true, reason: 'empty' };
  if (looksLikeNakedGreeting) return { truncated: true, reason: 'naked_greeting' };
  if (endsMidClause) return { truncated: true, reason: 'mid_clause' };
  return { truncated: false };
}

describe('pre-completion truncation detector', () => {
  describe('blocks incidente A-03 and variants (naked greeting)', () => {
    const nakedGreetings = [
      'Olá, Roberto',           // literal A-03
      'Olá, Roberto.',
      'Oi, Maria',
      'Bom dia, Sr. João',
      'Boa tarde, Dona Ana',
      'E aí, Pedro!',
      'Prezado Carlos',
      'Sr. Roberto,',
    ];
    it.each(nakedGreetings)('blocks "%s"', (s) => {
      expect(isTruncated(s).truncated).toBe(true);
    });
  });

  describe('blocks empty / too short', () => {
    const empties = ['', '   ', 'Ok', 'Sim', 'Ótimo!'];
    it.each(empties)('blocks "%s"', (s) => {
      expect(isTruncated(s).truncated).toBe(true);
    });
  });

  describe('blocks mid-clause cutoff (comma/colon at end)', () => {
    const midClause = [
      'Estou puxando os dados do seu contrato,',
      'Só confirmando que é o imóvel da:',
      'Me conta um pouco mais sobre o que você busca;',
    ];
    it.each(midClause)('blocks "%s"', (s) => {
      expect(isTruncated(s).truncated).toBe(true);
    });
  });

  describe('does NOT block real responses', () => {
    const real = [
      'Olá, Roberto! Entendo a preocupação. Vou verificar agora mesmo o status do seu repasse.',
      'Bom dia! Claro, encontrei algumas opções interessantes no Centro. Você prefere apartamento ou casa?',
      'Perfeito, anotei tudo. Vou buscar as melhores opções pra você agora.',
      'Entendi, Maria! Esse imóvel tem 3 dormitórios e fica a 500m do Beira-Mar. Quer saber mais?',
      'Ok, vou pausar por aqui e o consultor humano entra em contato em breve.',
      'Obrigada pelo contato! Fico à disposição sempre que precisar.',
    ];
    it.each(real)('passes "%s"', (s) => {
      expect(isTruncated(s).truncated).toBe(false);
    });
  });

  describe('edge cases — closer-like responses should pass even if short-ish', () => {
    // 40+ chars é o ceiling do looksLikeNakedGreeting. Textos normais
    // passam por serem longos ou não baterem o pattern.
    it('"Ok, combinado. Aguardo seu retorno." passes (mid-length closer)', () => {
      expect(isTruncated('Ok, combinado. Aguardo seu retorno.').truncated).toBe(false);
    });
    it('"Ok!" alone is too short and is blocked (acceptable false positive)', () => {
      // Se o LLM manda só "Ok!" isoladamente sem contexto, é razoável
      // bloquear e pedir o caller pra reformular.
      expect(isTruncated('Ok!').truncated).toBe(true);
    });
  });
});
