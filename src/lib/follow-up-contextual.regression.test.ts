// Regression guard: follow-up contextual (P4 cutover 07/05).
//
// Mirror local da função buildContextualFollowUp (declarada em
// supabase/functions/follow-up-check/index.ts). O objetivo é travar os
// caminhos contextuais — pois o bug original era "todos os leads de venda
// caem no fallback genérico" porque o código só comparava department_code
// contra 'comercial' (que não existe no DB — o DB tem 'vendas' / 'locacao').
//
// Se alguém alterar a lógica em follow-up-check/index.ts, esses testes
// precisam ser atualizados junto. Drift vai falhar o CI e forçar revisão.

import { describe, it, expect } from 'vitest';

interface ConversationContext {
  departmentCode: string | null;
  moduleSlug: string | null;
  qualification: {
    neighborhood: string | null;
    propertyType: string | null;
    bedrooms: number | null;
    budgetMax: number | null;
    interest: string | null;
  };
  lastAssistantMessage: string | null;
  hadPropertySearch: boolean;
  contactName: string | null;
}

const GENERIC_FOLLOW_UPS = [
  'Ainda está por aí? Estou aqui caso precise de algo.',
  'Tudo bem? Se precisar de mais informações, é só me chamar.',
  'Vi que ficamos sem conversar. Posso te ajudar com mais alguma coisa?',
];

function buildContextualFollowUp(ctx: ConversationContext): string {
  const name = ctx.contactName ? ctx.contactName.split(' ')[0] : null;
  const greeting = name ? `Oi ${name}! ` : 'Oi! ';

  if (ctx.departmentCode === 'remarketing') {
    if (ctx.hadPropertySearch || ctx.moduleSlug === 'apresentacao_imovel') {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      if (location) {
        return `${greeting}Vi que você estava olhando opções de ${type} em ${location}. Conseguiu pensar sobre? Posso te mostrar mais opções ou tirar alguma dúvida!`;
      }
      return `${greeting}Você estava vendo algumas opções de imóveis comigo. Quer que eu continue a busca ou tem alguma dúvida?`;
    }
    if (ctx.moduleSlug === 'qualificacao' || ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      if (ctx.qualification.neighborhood) {
        return `${greeting}Estávamos conversando sobre ${interest} um imóvel na região de ${ctx.qualification.neighborhood}. Quer continuar de onde paramos?`;
      }
      return `${greeting}Estávamos conversando sobre o que você procura em um imóvel. Quer continuar? Estou aqui pra te ajudar a encontrar o lugar ideal!`;
    }
    return `${greeting}Vi que ficamos sem conversar. Lembra que estávamos vendo opções de imóveis pra você? Posso continuar te ajudando quando quiser!`;
  }

  if (ctx.departmentCode === 'vendas' || ctx.departmentCode === 'locacao' || ctx.departmentCode === 'comercial') {
    if (ctx.hadPropertySearch || ctx.moduleSlug === 'apresentacao_imovel') {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      const bedroomsText = ctx.qualification.bedrooms ? ` de ${ctx.qualification.bedrooms} quartos` : '';
      if (location) {
        return `${greeting}Estava te mostrando opções de ${type}${bedroomsText} em ${location}. Algum te interessou? Posso buscar mais alternativas!`;
      }
      return `${greeting}Estávamos vendo algumas opções de imóveis${bedroomsText}. Quer que eu continue a busca?`;
    }
    if (ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      const budget = ctx.qualification.budgetMax
        ? ` com orçamento de até R$ ${(ctx.qualification.budgetMax / 1000).toFixed(0)}mil`
        : '';
      const location = ctx.qualification.neighborhood ? ` em ${ctx.qualification.neighborhood}` : '';
      return `${greeting}Estávamos conversando sobre ${interest} um imóvel${location}${budget}. Posso continuar te ajudando?`;
    }
    return `${greeting}Vi que ficamos sem conversar. Ainda posso te ajudar a encontrar o imóvel ideal! É só me chamar.`;
  }

  if (ctx.departmentCode === 'atualizacao') {
    return `${greeting}Precisava confirmar alguns dados sobre seu imóvel. Consegue me dar um retorno quando puder? Se preferir, nosso Supervisor de Carteira fala com você diretamente.`;
  }

  if (ctx.moduleSlug === 'handoff') {
    return `${greeting}Já passei suas informações para um corretor. Em breve alguém da equipe vai entrar em contato com você!`;
  }

  if (ctx.qualification.neighborhood || ctx.qualification.propertyType) {
    const type = ctx.qualification.propertyType || 'imóvel';
    const location = ctx.qualification.neighborhood ? ` em ${ctx.qualification.neighborhood}` : '';
    return `${greeting}Estávamos conversando sobre ${type}${location}. Posso continuar te ajudando?`;
  }

  return GENERIC_FOLLOW_UPS[0]; // determinístico p/ teste
}

const baseCtx = (overrides: Partial<ConversationContext> = {}): ConversationContext => ({
  departmentCode: null,
  moduleSlug: null,
  qualification: {
    neighborhood: null,
    propertyType: null,
    bedrooms: null,
    budgetMax: null,
    interest: null,
  },
  lastAssistantMessage: null,
  hadPropertySearch: false,
  contactName: null,
  ...overrides,
});

describe('buildContextualFollowUp — P4 cobertura de departamentos', () => {
  describe('regressão principal: vendas/locacao NÃO caem no fallback', () => {
    it('dept=vendas com contexto → mensagem contextual', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'vendas',
        qualification: { neighborhood: 'Centro', propertyType: 'apartamento', bedrooms: 2, budgetMax: 800_000, interest: 'venda' },
        contactName: 'Ana Silva',
      }));
      expect(out).toContain('Ana');
      expect(out).toContain('comprar');
      expect(out).toContain('Centro');
      expect(out).toContain('800mil');
      expect(out).not.toMatch(/Ainda está por aí|Vi que ficamos sem/);
    });

    it('dept=locacao com contexto → mensagem contextual', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'locacao',
        qualification: { neighborhood: 'Jurerê', propertyType: 'casa', bedrooms: 3, budgetMax: 5000, interest: 'locacao' },
        contactName: 'Bruno',
      }));
      expect(out).toContain('Bruno');
      expect(out).toContain('alugar');
      expect(out).toContain('Jurerê');
    });

    it('vendas + property search apresentada → mensagem de "mostrando opções"', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'vendas',
        hadPropertySearch: true,
        qualification: { neighborhood: 'Campeche', propertyType: 'apartamento', bedrooms: 3, budgetMax: null, interest: 'venda' },
      }));
      expect(out).toContain('apartamento');
      expect(out).toContain('Campeche');
      expect(out).toContain('3 quartos');
    });
  });

  describe('remarketing (já funcionava)', () => {
    it('remarketing com property search → mensagem VIP', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'remarketing',
        hadPropertySearch: true,
        qualification: { neighborhood: 'Lagoa', propertyType: 'cobertura', bedrooms: null, budgetMax: null, interest: null },
      }));
      expect(out).toContain('Lagoa');
      expect(out).toContain('Conseguiu pensar sobre');
    });

    it('remarketing em qualificação com bairro', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'remarketing',
        moduleSlug: 'qualificacao',
        qualification: { neighborhood: 'Trindade', propertyType: null, bedrooms: null, budgetMax: null, interest: 'venda' },
      }));
      expect(out).toContain('Trindade');
      expect(out).toContain('comprar');
    });
  });

  describe('atualização (novo)', () => {
    it('dept=atualizacao → mensagem específica com Supervisor de Carteira', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'atualizacao',
        contactName: 'Carlos',
      }));
      expect(out).toContain('Carlos');
      expect(out).toContain('Supervisor de Carteira');
      expect(out).toContain('confirmar alguns dados');
    });
  });

  describe('handoff pending', () => {
    it('moduleSlug=handoff → mensagem de aguardo de corretor', () => {
      const out = buildContextualFollowUp(baseCtx({
        moduleSlug: 'handoff',
        contactName: 'Diego',
      }));
      expect(out).toContain('Diego');
      expect(out).toContain('corretor');
    });
  });

  describe('fallback genérico só quando sem contexto algum', () => {
    it('sem dept e sem qualification → genérico', () => {
      const out = buildContextualFollowUp(baseCtx());
      expect(out).toBe(GENERIC_FOLLOW_UPS[0]);
    });
  });

  describe('primeiro nome extraído corretamente', () => {
    it('"Ana Carolina de Avila" vira "Oi Ana!"', () => {
      const out = buildContextualFollowUp(baseCtx({
        departmentCode: 'vendas',
        contactName: 'Ana Carolina de Avila',
        qualification: { neighborhood: null, propertyType: null, bedrooms: null, budgetMax: null, interest: 'venda' },
      }));
      expect(out).toMatch(/^Oi Ana!/);
    });
  });
});
