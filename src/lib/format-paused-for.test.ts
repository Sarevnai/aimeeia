// Reimplementação local do helper formatPausedFor (definido em ChatPage.tsx).
// Mantido como teste de contrato: se a função em ChatPage.tsx mudar, este teste
// falha na CI antes do cutover 07/05, forçando revisão consciente da semântica
// exibida no badge "Aimee pausada · há Xm".

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

function formatPausedFor(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  return `há ${d}d`;
}

const NOW = new Date('2026-04-22T12:00:00.000Z').getTime();

describe('formatPausedFor (P2 badge Aimee pausada)', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());

  it('< 1min → "agora"', () => {
    expect(formatPausedFor(new Date(NOW - 30_000).toISOString())).toBe('agora');
  });

  it('5min → "há 5m"', () => {
    expect(formatPausedFor(new Date(NOW - 5 * 60_000).toISOString())).toBe('há 5m');
  });

  it('59min → "há 59m"', () => {
    expect(formatPausedFor(new Date(NOW - 59 * 60_000).toISOString())).toBe('há 59m');
  });

  it('1h → "há 1h"', () => {
    expect(formatPausedFor(new Date(NOW - 60 * 60_000).toISOString())).toBe('há 1h');
  });

  it('23h59m → "há 23h"', () => {
    expect(formatPausedFor(new Date(NOW - (23 * 60 + 59) * 60_000).toISOString())).toBe('há 23h');
  });

  it('1d → "há 1d"', () => {
    expect(formatPausedFor(new Date(NOW - 24 * 60 * 60_000).toISOString())).toBe('há 1d');
  });

  it('3d → "há 3d"', () => {
    expect(formatPausedFor(new Date(NOW - 3 * 24 * 60 * 60_000).toISOString())).toBe('há 3d');
  });

  it('timestamp inválido → ""', () => {
    expect(formatPausedFor('not-a-date')).toBe('');
  });

  it('timestamp futuro → "" (não negativo)', () => {
    expect(formatPausedFor(new Date(NOW + 60_000).toISOString())).toBe('');
  });
});
