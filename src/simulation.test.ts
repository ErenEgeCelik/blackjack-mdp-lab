import { describe, it, expect } from 'vitest';
import { experiment } from './simulation';
const rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };
describe('reproducible finite-horizon experiment', () => {
  it('uses independent seeded sessions, coherent summaries, and reproducible results', () => {
    const config = { rounds: 100, seed: 71, policy: 'flat' as const, rules };
    const a = experiment(config),
      b = experiment(config);
    expect(a).toEqual(b);
    const rows = a.sessionResults as { profit: number; completed: number; seed: number }[];
    expect(new Set(rows.map((r) => r.seed)).size).toBe(20);
    expect(a.mean).toBeCloseTo(rows.reduce((n, r) => n + r.profit, 0) / 2000, 12);
    expect(a.played).toBe(rows.reduce((n, r) => n + r.completed, 0));
    expect(a.low).toBeLessThanOrEqual(a.mean);
    expect(a.high).toBeGreaterThanOrEqual(a.mean);
    expect(a.trace.at(-1)).toBeCloseTo(200 + rows[0].profit);
  });
  it('rejects malformed experiment requests', () => {
    expect(() => experiment({ rounds: 0, seed: 1, policy: 'flat', rules })).toThrow();
  });
});
