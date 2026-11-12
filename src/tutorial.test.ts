import { describe, it, expect } from 'vitest';
import fixtures from '../docs/tutorial-examples.json';
import { analyze, analyzeExact, type Rules } from './engine';
const rules: Rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };
describe('published Turkish textbook numerical examples', () => {
  it.each(fixtures.scenarios)('reproduces published $id values from the declared input', (s) => {
    const result = analyze(s.cards, s.up, s.counts, s.rules);
    expect(result.best).toBe(s.result.best);
    for (const [action, value] of Object.entries(s.result.actions)) {
      expect(result.actions[action as keyof typeof result.actions]).toBeCloseTo(value!, 12);
    }
  });
  it('reproduces the same-state exact versus frozen decision reversal', () => {
    const s = fixtures.toy;
    const exact = analyzeExact(s.cards, s.up, s.counts, s.rules),
      fast = analyze(s.cards, s.up, s.counts, s.rules);
    expect(exact.best).toBe('stand');
    expect(fast.best).toBe('hit');
    for (const a of ['hit', 'stand', 'double'] as const)
      expect(exact.actions[a]).toBeCloseTo(s.exact.actions[a], 12);
  });
  it('matches the fully drawn three-card dealer tree', () => {
    const c = Array(10).fill(0);
    c[4] = 1;
    c[9] = 2;
    const r = analyzeExact([10, 8], 6, c, rules);
    expect(r.dealer[4]).toBeCloseTo(2 / 3, 12);
    expect(r.dealer[5]).toBeCloseTo(1 / 3, 12);
    expect(r.actions.stand).toBeCloseTo(-1 / 3, 12);
  });
  it('checks the worked betting covariance and split covariance arithmetic', () => {
    expect(0.8 * -0.006 + 0.2 * 0.015).toBeCloseTo(-0.0018);
    expect(0.8 * -0.006 + 0.2 * 4 * 0.015).toBeCloseTo(0.0072);
    const outcomes = [-2, 2];
    expect(outcomes.reduce((s, x) => s + (x * x) / 2, 0)).toBe(4);
  });
  it('checks the binary growth, uncertainty and ruin numbers', () => {
    expect(0.55 * Math.log(1.1) + 0.45 * Math.log(0.9)).toBeCloseTo(0.005008366846, 11);
    expect(0.55 * Math.log(1.4) + 0.45 * Math.log(0.6)).toBeCloseTo(-0.044811800553, 11);
    expect((2.093024054 * 0.04) / Math.sqrt(20)).toBeCloseTo(0.018720576253, 11);
    expect((0.45 / 0.55) ** 20).toBeCloseTo(0.018071595021, 11);
    expect(((1.96 * 1.15) / 0.01) ** 2).toBeCloseTo(50805.16, 6);
  });
});
