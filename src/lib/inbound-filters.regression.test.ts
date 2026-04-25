// Regression guard for the DNC / opt-out / wrong-audience / auto-reply classifier
// used by supabase/functions/whatsapp-webhook to bypass the AI agent BEFORE the
// LLM sees a message. A-02 (20/04 12:11, ev. in comparative-analysis v2) was a
// live LGPD violation where Aimee replied "Prazer em te conhecer, cliente!" to
// a lead that said "Pode retirar meu contato" twice. The classifier was added
// later that day (commit 1471fa7). This test locks the behavior down so a
// future refactor doesn't silently re-open the hole.

import { describe, it, expect } from 'vitest';
import { classifyInbound } from '../../supabase/functions/_shared/inbound-filters';

describe('classifyInbound — DNC guardrail', () => {
  describe('opt_out (reputational/LGPD critical)', () => {
    const optOutCases: Array<[string, string]> = [
      // Literal strings from A-02 production incident
      ['Pode retirar meu contato', 'A-02 msg 1'],
      ['Retire meu contato de sua lista, nao tenho interesse em imoveis', 'A-02 msg 2'],
      ['Retire meu contato de sua lista, não tenho interesse em imóveis', 'A-02 msg 2 com acentos'],
      // Common Brazilian opt-out phrasings
      ['nao tenho interesse', 'sem acento'],
      ['não tenho interesse', 'com acento'],
      ['Obrigada não tenho mais interesse', 'dossiê §6 Lorien-like'],
      ['sem interesse', 'curto'],
      ['Pode tirar da lista', 'imperativo'],
      ['Remova meu cadastro', 'formal'],
      ['Por favor, não me mande mais mensagem', 'polido'],
      ['Pare de me mandar mensagem', 'imperativo direto'],
      ['nao me manda mais mensagem', 'coloquial'],
      ['nunca mais me mande mensagem', 'ênfase'],
      ['quero sair da lista', 'intenção'],
      ['desisti', 'uma palavra'],
      ['mudança de planos', 'polido indireto'],
    ];

    it.each(optOutCases)('classifies "%s" as opt_out (%s)', (input) => {
      const r = classifyInbound(input);
      expect(r.reason).toBe('opt_out');
      expect(r.matched).toBeTruthy();
    });
  });

  describe('wrong_audience (broker pitching, not a lead)', () => {
    const cases = [
      'Sou corretor e queria fazer parceria',
      'sou consultora imobiliaria',
      'Tenho CRECI e quero parceria',
      'Atuo com avaliação de imóveis',
    ];
    it.each(cases)('classifies "%s" as wrong_audience', (input) => {
      const r = classifyInbound(input);
      expect(r.reason).toBe('wrong_audience');
    });
  });

  describe('auto_reply (customer chatbot)', () => {
    const cases = [
      'Seja bem-vindo, retorno em breve',
      'Fora do horário de atendimento',
      'Obrigado pelo contato, retornarei em breve',
    ];
    it.each(cases)('classifies "%s" as auto_reply', (input) => {
      const r = classifyInbound(input);
      expect(r.reason).toBe('auto_reply');
    });
  });

  describe('no false positives on normal lead messages', () => {
    const normalCases = [
      'Olá, tudo bem?',
      'Oi',
      'Bom dia',
      'Quero comprar um apartamento no Centro',
      'Tem algum imóvel de 3 quartos em Jurerê?',
      'Qual o valor do condomínio?',
      'Aceita financiamento?',
      'Pode me passar mais detalhes do imóvel?',
      'Gostaria de agendar uma visita',
      'Estou buscando algo até 800 mil',
      'Sim, tenho interesse',
      'Quero ver as fotos',
      'pode ser',
      'ok',
      'sim',
      'não',
      'Não curti esse, tem outro?',
      'Tá caro pra mim',
      'Vou pensar e te retorno',
      'Preciso conversar com minha esposa antes',
    ];
    it.each(normalCases)('does NOT flag "%s"', (input) => {
      const r = classifyInbound(input);
      expect(r.reason).toBeNull();
    });
  });

  // Categorial rejection: lead is rejecting an attribute (type/region/price),
  // NOT the relationship. These MUST reach the AI agent so it can pivot the
  // search. The Terezinha incident (2026-04-25, conversation 146bc4bc) was
  // caused by "não quero Apartamento" being misclassified as opt_out.
  describe('categorial rejection — must NOT trigger opt_out (Terezinha guard)', () => {
    const categorialCases = [
      'Boa opção mais nao quero Apartamento 😉',
      'não quero apartamento',
      'não quero apartamento, prefiro casa',
      'não quero no Centro',
      'não quero acima de 3 milhões',
      'não quero gastar tanto',
      'não quero esse, tem outro?',
      'não me interessa esse aí, tem outro?',
      'agora não, mas semana que vem podemos voltar',
      'esse não, mas continua mandando opções',
      'desisti desse imóvel, vamos pra próximo',
      'não estou mais querendo apartamento, quero casa',
      'sem interesse nesse aqui, tem outro?',
    ];
    it.each(categorialCases)('does NOT flag "%s" as opt_out (categorial)', (input) => {
      const r = classifyInbound(input);
      expect(r.reason).toBeNull();
    });
  });

  describe('audio transcription prefix is stripped', () => {
    it('matches opt-out inside transcribed audio', () => {
      const r = classifyInbound('[Transcrição de áudio]: Pode retirar meu contato da lista por favor');
      expect(r.reason).toBe('opt_out');
    });
  });

  describe('empty/malformed input', () => {
    it('empty string returns null', () => {
      expect(classifyInbound('').reason).toBeNull();
    });
    it('null-ish returns null', () => {
      expect(classifyInbound(undefined as unknown as string).reason).toBeNull();
    });
  });
});
