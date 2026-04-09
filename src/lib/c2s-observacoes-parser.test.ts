import { describe, it, expect } from 'vitest';
import { parseC2SObservacoes, toContactCrmColumns } from './c2s-observacoes-parser';

describe('parseC2SObservacoes', () => {
  it('parseia o formato completo do C2S', () => {
    const raw = 'Motivo: Falta de interação do usuário | Status: Arquivado | Imóvel: [55766] Apartamento com 1 quarto Jurerê | Bairro: Jurerê | Preço: R$ 3.500,00 | Fonte: Chaves na Mão | Obs: Cliente busca kit net até 2 mil região central';
    const result = parseC2SObservacoes(raw);
    expect(result).toEqual({
      motivo: 'Falta de interação do usuário',
      status: 'Arquivado',
      imovel: '[55766] Apartamento com 1 quarto Jurerê',
      bairro: 'Jurerê',
      preco: 'R$ 3.500,00',
      fonte: 'Chaves na Mão',
      obs: 'Cliente busca kit net até 2 mil região central',
    });
  });

  it('tolera campos faltando', () => {
    const raw = 'Motivo: Apenas pesquisando | Status: Arquivado | Bairro: Centro';
    const result = parseC2SObservacoes(raw);
    expect(result.motivo).toBe('Apenas pesquisando');
    expect(result.status).toBe('Arquivado');
    expect(result.bairro).toBe('Centro');
    expect(result.imovel).toBeUndefined();
    expect(result.preco).toBeUndefined();
  });

  it('tolera ordem variável', () => {
    const raw = 'Bairro: Jurerê | Motivo: X | Preço: R$ 1.000,00';
    const result = parseC2SObservacoes(raw);
    expect(result.bairro).toBe('Jurerê');
    expect(result.motivo).toBe('X');
    expect(result.preco).toBe('R$ 1.000,00');
  });

  it('aceita variantes de case e acentos nas chaves', () => {
    const raw = 'MOTIVO: a | imovel: b | PRECO: c';
    const result = parseC2SObservacoes(raw);
    expect(result.motivo).toBe('a');
    expect(result.imovel).toBe('b');
    expect(result.preco).toBe('c');
  });

  it('preserva valores que contêm ":"', () => {
    const raw = 'Obs: Cliente disse: "quero algo barato"';
    const result = parseC2SObservacoes(raw);
    expect(result.obs).toBe('Cliente disse: "quero algo barato"');
  });

  it('retorna objeto vazio para input vazio/null', () => {
    expect(parseC2SObservacoes(null)).toEqual({});
    expect(parseC2SObservacoes(undefined)).toEqual({});
    expect(parseC2SObservacoes('')).toEqual({});
    expect(parseC2SObservacoes('   ')).toEqual({});
  });

  it('ignora chunks sem ":"', () => {
    const raw = 'texto solto | Motivo: X';
    const result = parseC2SObservacoes(raw);
    expect(result.motivo).toBe('X');
  });
});

describe('toContactCrmColumns', () => {
  it('mapeia C2SContext para colunas do contacts', () => {
    const ctx = {
      motivo: 'Apenas pesquisando',
      status: 'Arquivado',
      imovel: '[123] Apto',
      bairro: 'Centro',
      preco: 'R$ 500,00',
      fonte: 'Zap',
      obs: 'notas',
    };
    const cols = toContactCrmColumns(ctx);
    expect(cols).toEqual({
      crm_archive_reason: 'Apenas pesquisando',
      crm_status: 'Arquivado',
      crm_property_ref: '[123] Apto',
      crm_neighborhood: 'Centro',
      crm_price_hint: 'R$ 500,00',
      crm_source: 'Zap',
      crm_broker_notes: 'notas',
    });
  });

  it('retorna null para campos ausentes', () => {
    const cols = toContactCrmColumns({ motivo: 'X' });
    expect(cols.crm_archive_reason).toBe('X');
    expect(cols.crm_status).toBeNull();
    expect(cols.crm_property_ref).toBeNull();
  });
});
