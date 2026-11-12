import { describe, it, expect } from 'vitest';
import { naturalProbability, payoffMoments, bellmanToy, binaryLogGrowth } from './learningMath';
import { freshCounts } from './engine';
describe('teaching examples and model boundaries', () => {
  it('matches direct unordered-card counting for a single-deck natural', () => {
    expect(naturalProbability(freshCounts(1))).toBeCloseTo((4 * 16) / ((52 * 51) / 2), 14);
  });
  it('distinguishes identical Hi-Lo removals with different natural probabilities', () => {
    const a = freshCounts(1),
      t = freshCounts(1);
    a[0]--;
    t[9]--;
    expect(naturalProbability(a)).not.toBe(naturalProbability(t));
    expect(naturalProbability(a)).toBeCloseTo(96 / 2550, 14);
  });
  it('separates win rate, expected return and variance', () => {
    const a = payoffMoments(0.45, 0.05, 1);
    expect(a.mean).toBeCloseTo(-0.05);
    expect(a.variance).toBeCloseTo(0.9475);
    expect(payoffMoments(0.45, 0.05, 1.5).mean).toBeCloseTo(0.175);
  });
  it('uses maxima at decisions and averages at chance nodes', () => {
    const a = bellmanToy(0.5);
    expect(a.left).toBe(0.5);
    expect(a.right).toBe(-0.4);
    expect(a.hit).toBeCloseTo(0.05);
    expect(a.best).toBe('hit');
    expect(bellmanToy(0.2).best).toBe('stand');
  });
  it('binary toy growth peaks near the declared Kelly fraction', () => {
    const p = 0.55,
      f = 2 * p - 1;
    expect(binaryLogGrowth(p, f)).toBeGreaterThan(binaryLogGrowth(p, 0.05));
    expect(binaryLogGrowth(p, f)).toBeGreaterThan(binaryLogGrowth(p, 0.2));
    expect(binaryLogGrowth(p, 0.4)).toBeLessThan(0);
  });
});
