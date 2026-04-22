// Regression guard for resolveContactNameForPrompt — incidente A-02 (20/04/2026):
// quando contactName era null, o fallback `contactName || 'cliente'` substituía
// {{CONTACT_NAME}} pelo literal "cliente" e o LLM passava a tratar isso como
// nome próprio, produzindo "Prazer em te conhecer, cliente!" e "cliente, que
// bom ter você aqui!". Este teste trava o contrato da função: nomes reais
// passam intactos; placeholders genéricos ou valores vazios viram string
// vazia, para que o prompt nunca injete "cliente" como vocativo.

import { describe, it, expect } from 'vitest';
import { resolveContactNameForPrompt } from '../../supabase/functions/_shared/utils';

describe('resolveContactNameForPrompt', () => {
  describe('returns real names untouched', () => {
    const names = ['Ian', 'Ian Veras', 'Maria da Silva', 'João', 'Ana Carolina de Avila'];
    it.each(names)('keeps "%s"', (name) => {
      expect(resolveContactNameForPrompt(name)).toBe(name);
    });
    it('trims surrounding whitespace', () => {
      expect(resolveContactNameForPrompt('  Ian  ')).toBe('Ian');
    });
  });

  describe('returns empty for missing/null/empty input', () => {
    const empties: Array<string | null | undefined> = [null, undefined, '', '   ', '\t\n'];
    it.each(empties)('returns "" for %p', (v) => {
      expect(resolveContactNameForPrompt(v)).toBe('');
    });
  });

  describe('returns empty for generic placeholders (root cause of A-02)', () => {
    const placeholders = ['cliente', 'Cliente', 'CLIENTE', 'customer', 'lead', 'Lead', 'usuário', 'usuario', 'Usuário'];
    it.each(placeholders)('rejects "%s"', (v) => {
      expect(resolveContactNameForPrompt(v)).toBe('');
    });
  });
});
