import { describe, expect, it } from 'vitest';
import {
  analyze, analyzeExact, EXACT_STATE_BUDGET, ExactStateBudgetError,
  freshCounts, handValue, hiLo, seededRandom, ShoeExhaustedError,
  type Analysis, type Rules,
} from './engine';

const S17: Rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };

function shoe(entries: Partial<Record<number, number>>): number[] {
  return Array.from({ length: 10 }, (_, i) => entries[i + 1] ?? 0);
}

function observed(cards: number[], up: number): number[] {
  const counts = freshCounts(6);
  for (const rank of [...cards, up]) counts[rank - 1] -= 1;
  return counts;
}

/** Intentionally separate small-shoe oracle: full card lists and explicit draw
 * trees, no memoization, engine hand evaluator, or engine probability helpers.
 * It solves the player's public state first and only then enumerates dealer
 * draws. Maximizing separately after revealing a dealer draw would be wrong.
 */
function enumerate(cards: number[], up: number, counts: number[], rules: Rules): Analysis['actions'] {
  function value(hand: number[]): { total: number; soft: boolean } {
    let total = hand.reduce((sum, rank) => sum + (rank === 1 ? 11 : rank), 0);
    let highAces = hand.filter(rank => rank === 1).length;
    while (total > 21 && highAces > 0) { total -= 10; highAces -= 1; }
    return { total, soft: highAces > 0 };
  }
  function draw(remaining: number[], f: (rank: number, rest: number[]) => number): number {
    const size = remaining.reduce((sum, n) => sum + n, 0);
    if (size === 0) throw new Error('Oracle fixture exhausted');
    return remaining.reduce((ev, n, i) => {
      if (!n) return ev;
      const rest = [...remaining];
      rest[i] -= 1;
      return ev + n / size * f(i + 1, rest);
    }, 0);
  }
  function settle(player: number[], dealer: number[], remaining: number[]): number {
    const p = value(player);
    const d = value(dealer);
    const playerNatural = player.length === 2 && p.total === 21;
    if (p.total > 21) return -1;
    if (dealer.length === 2 && d.total === 21) return playerNatural ? 0 : -1;
    if (dealer.length < 2 || d.total < 17 || (d.total === 17 && d.soft && rules.hitSoft17)) {
      return draw(remaining, (rank, rest) => settle(player, [...dealer, rank], rest));
    }
    if (playerNatural) return rules.blackjackPayout;
    return d.total > 21 ? 1 : Math.sign(p.total - d.total);
  }
  function play(player: number[], remaining: number[]): number {
    const stand = settle(player, [up], remaining);
    if (value(player).total >= 21) return stand;
    const hit = draw(remaining, (rank, rest) => play([...player, rank], rest));
    return Math.max(stand, hit);
  }
  const actions: Analysis['actions'] = { stand: settle(cards, [up], counts) };
  if (value(cards).total >= 21) return actions;
  actions.hit = draw(counts, (rank, rest) => play([...cards, rank], rest));
  if (cards.length === 2) {
    actions.double = draw(counts, (rank, rest) => 2 * settle([...cards, rank], [up], rest));
  }
  return actions;
}

describe('card utilities', () => {
  it.each([
    [[], 0, false], [[1], 11, true], [[1, 1], 12, true],
    [[1, 1, 1, 8], 21, true], [[1, 6, 10], 17, false],
    [[1, 1, 10], 12, false], [[1, 1, 1, 10, 8], 21, false],
    [[10, 10, 2], 22, false], [[1, 10], 21, true],
  ] as [number[], number, boolean][])('values %j', (cards, total, soft) => {
    expect(handValue(cards)).toEqual({ total, soft });
  });

  it('constructs independent rank-count arrays with aggregated tens', () => {
    const counts = freshCounts(2);
    expect(counts).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 8, 32]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(104);
    counts[0] = 0;
    expect(freshCounts(2)[0]).toBe(8);
    expect(() => freshCounts(0)).toThrow(RangeError);
    expect(() => freshCounts(1.5)).toThrow(RangeError);
  });

  it('scores every Hi-Lo rank', () => {
    expect(Array.from({ length: 10 }, (_, i) => hiLo(i + 1)))
      .toEqual([-1, 1, 1, 1, 1, 1, 0, 0, 0, -1]);
    expect(() => hiLo(11)).toThrow(RangeError);
  });

  it('reproduces uint32-seeded random sequences in [0, 1)', () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    expect(a()).toBe(0.6270739405881613);
    b();
    for (let i = 0; i < 1000; i += 1) {
      const next = a();
      expect(next).toBe(b());
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(1);
    }
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
    expect(seededRandom(0)()).toBe(seededRandom(2 ** 32)());
    expect(() => seededRandom(Infinity)).toThrow(RangeError);
  });
});

describe('frozen observed-composition replacement DP', () => {
  it.each([false, true])('normalizes all dealer upcards (H17=%s)', hitSoft17 => {
    for (let up = 1; up <= 10; up += 1) {
      const result = analyze([10, 6], up, observed([10, 6], up), { ...S17, hitSoft17 });
      expect(result.dealer).toHaveLength(7);
      expect(result.dealer.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(result.dealer.every(p => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
      expect(result.nodes).toBeGreaterThan(0);
      const counts = observed([10, 6], up);
      const expectedNatural = up === 1 ? counts[9] / 309 : up === 10 ? counts[0] / 309 : 0;
      expect(result.dealer[6]).toBeCloseTo(expectedNatural, 14);
    }
  });

  it('separates dealer blackjack from drawn 21', () => {
    expect(analyze([9, 9], 1, shoe({ 10: 1 }), S17).dealer)
      .toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(analyze([9, 9], 3, shoe({ 9: 1 }), S17).dealer)
      .toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it('honors soft 17 and repeatedly soft aces', () => {
    const counts = shoe({ 1: 1 });
    expect(analyze([10, 8], 6, counts, S17).dealer).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(analyze([10, 8], 6, counts, { ...S17, hitSoft17: true }).dealer)
      .toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(analyze([1, 1], 6, counts, S17).actions.hit).toBe(1);
  });

  it.each([1, 1.2, 1.5, 2])('pays a natural at %s except against dealer blackjack', blackjackPayout => {
    const rules = { ...S17, blackjackPayout };
    const result = analyze([1, 10], 10, shoe({ 1: 1, 10: 3 }), rules);
    expect(result.actions).toEqual({ stand: blackjackPayout * 0.75 });
    expect(result.best).toBe('stand');
    expect(analyze([1, 10], 6, freshCounts(1), rules).actions.stand).toBe(blackjackPayout);
    expect(analyze([1, 10], 1, shoe({ 10: 1 }), rules).actions.stand).toBe(0);
  });

  it('treats multi-card 21 as ordinary and settles a bust at -1', () => {
    const result = analyze([7, 7, 7], 3, shoe({ 9: 1 }), S17);
    expect(result.actions).toEqual({ stand: 0 });
    const bust = analyze([10, 10, 2], 6, freshCounts(1), S17);
    expect(bust.actions).toEqual({ stand: -1 });
    expect(bust.bustProbability).toBe(1);
  });

  it('loses every doubled and split unit against a dealer natural under ENHC', () => {
    const counts = shoe({ 1: 1 });
    const result = analyze([5, 6], 10, counts, S17);
    expect(result.actions.stand).toBe(-1);
    expect(result.actions.hit).toBe(-1);
    expect(result.actions.double).toBe(-2);
    expect(analyze([8, 8], 10, counts, S17).actions.split).toBe(-2);
  });

  it('adds two independent split expectations, with optional double after split', () => {
    const counts = shoe({ 9: 1 });
    const das = analyze([2, 2], 6, counts, S17);
    const noDas = analyze([2, 2], 6, counts, { ...S17, doubleAfterSplit: false });
    expect(das.actions.split).toBe(4);
    expect(das.best).toBe('split');
    expect(noDas.actions.split).toBe(2);
    expect(noDas.actions.double).toBe(2);
    expect(das.model).toMatch(/with replacement/);
    // A single observed nine can recur indefinitely in the surrogate.
    expect(counts).toEqual(shoe({ 9: 1 }));
  });

  it('gives split aces only one card, never resplits, and never pays a natural', () => {
    expect(analyze([1, 1], 6, shoe({ 1: 1 }), S17).actions.split).toBe(-2);
    expect(analyze([1, 1], 6, shoe({ 10: 1 }), S17).actions.split).toBe(2);
    expect(analyze([10, 10], 6, shoe({ 1: 1 }), S17).actions.split).toBe(2);
    expect(analyze([1, 1], 10, shoe({ 10: 1 }), S17).actions.split).toBe(2);
    expect(analyze([1, 1], 1, shoe({ 10: 1 }), S17).actions.split).toBe(-2);
  });

  it('gates double on two cards and split on an original two-card pair', () => {
    expect(Object.keys(analyze([8, 8], 6, freshCounts(1), S17).actions).sort())
      .toEqual(['double', 'hit', 'split', 'stand']);
    expect(analyze([8, 7], 6, freshCounts(1), S17).actions.split).toBeUndefined();
    expect(Object.keys(analyze([2, 3, 3], 6, freshCounts(1), S17).actions).sort())
      .toEqual(['hit', 'stand']);
  });

  it('matches split marginals to the public continuation context', () => {
    const counts = observed([8, 8], 10);
    const size = counts.reduce((a, b) => a + b, 0);
    for (const doubleAfterSplit of [false, true]) {
      const rules = { ...S17, doubleAfterSplit };
      let oneHand = 0;
      for (let rank = 1; rank <= 10; rank += 1) {
        const result = analyze([8, rank], 10, counts, rules, { split: true });
        oneHand += counts[rank - 1] / size * Math.max(...Object.values(result.actions));
      }
      expect(analyze([8, 8], 10, counts, rules).actions.split).toBeCloseTo(2 * oneHand, 13);
    }
  });

  it.each([
    [[10, 6], 10, 'hit'], [[5, 6], 6, 'double'], [[8, 8], 6, 'split'],
    [[10, 10], 6, 'stand'], [[1, 7], 9, 'hit'], [[10, 2], 4, 'stand'],
    [[5, 6], 10, 'hit'],
  ] as [number[], number, string][])('selects %s versus %s: %s', (cards, up, best) => {
    expect(analyze(cards, up, observed(cards, up), S17).best).toBe(best);
  });

  it('reports next-card bust risk from the observed composition', () => {
    const counts = shoe({ 1: 1, 5: 2, 6: 3, 10: 4 });
    expect(analyze([10, 6], 6, counts, S17).bustProbability).toBeCloseTo(0.7, 14);
    expect(analyze([1, 6], 6, counts, S17).bustProbability).toBe(0);
  });

  it('does not mutate cards, counts, or rules and is deterministic', () => {
    const cards = [8, 8];
    const counts = observed(cards, 6);
    const before = [...counts];
    Object.freeze(cards);
    Object.freeze(counts);
    const rules = Object.freeze({ ...S17 });
    const first = analyze(cards, 6, counts, rules);
    expect(analyze(cards, 6, counts, rules)).toEqual(first);
    expect(cards).toEqual([8, 8]);
    expect(counts).toEqual(before);
  });
});

describe('optional live-hand context', () => {
  it.each([analyze, analyzeExact])('does not pay a live split 21 as a natural', run => {
    const counts = shoe({ 1: 1, 10: 4 });
    expect(run([1, 10], 10, counts, S17).actions.stand).toBeCloseTo(1.2, 14);
    const split = run([1, 10], 10, counts, S17, { split: true });
    expect(Object.keys(split.actions)).toEqual(['stand']);
    expect(split.actions.stand).toBeCloseTo(0.6, 14);
    expect(run([10, 1], 10, counts, { ...S17, blackjackPayout: 9 }, { split: true }).actions.stand)
      .toBeCloseTo(0.6, 14);
    expect(run([1, 10], 1, shoe({ 10: 5 }), S17, { split: true }).actions).toEqual({ stand: -1 });
  });

  it.each([analyze, analyzeExact])('disables resplitting and enforces live DAS eligibility', run => {
    const counts = shoe({ 9: 6 });
    expect(run([2, 2], 6, counts, S17, { split: true }).actions.split).toBeUndefined();
    expect(run([2, 2], 6, counts, S17, { split: true, canSplit: true }).actions.split).toBeUndefined();
    expect(run([2, 9], 6, counts, S17, { split: true }).actions.double).toBe(2);
    expect(run([2, 9], 6, counts, { ...S17, doubleAfterSplit: false },
      { split: true, canDouble: true }).actions.double).toBeUndefined();
    expect(run([2, 9], 6, counts, S17, { canDouble: false }).actions.double).toBeUndefined();
    expect(run([2, 3, 6], 6, counts, S17, { canDouble: true }).actions.double).toBeUndefined();
  });

  it.each([analyze, analyzeExact])('stands after the one mandatory card on a split ace', run => {
    expect(run([1, 1], 6, shoe({ 10: 6 }), S17,
      { split: true, canDouble: true, canSplit: true }).actions).toEqual({ stand: 1 });
  });

  it('honors root eligibility flags without changing four-argument calls', () => {
    const counts = freshCounts(1);
    const normal = analyze([8, 8], 6, counts, S17);
    expect(analyze([8, 8], 6, counts, S17, {})).toEqual(normal);
    const limited = analyze([8, 8], 6, counts, S17, { canDouble: false, canSplit: false });
    expect(limited.actions).toEqual({ stand: normal.actions.stand, hit: normal.actions.hit });
    expect(analyze([8, 7], 6, counts, S17, { canSplit: true }).actions.split).toBeUndefined();
  });
});

describe('exact finite-shoe non-split DP', () => {
  const smallCases: [number[], number, number[], Rules][] = [
    [[10, 6], 10, shoe({ 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
    [[5, 6], 6, shoe({ 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
    [[1, 6], 6, shoe({ 1: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
    [[1, 6], 6, shoe({ 1: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), { ...S17, hitSoft17: true }],
    [[8, 8], 1, shoe({ 1: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
    [[1, 10], 10, shoe({ 1: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
    [[2, 3, 6], 2, shoe({ 6: 1, 7: 1, 8: 1, 9: 1, 10: 2 }), S17],
  ];

  it.each(smallCases)('matches independent enumeration for %j vs %s', (cards, up, counts, rules) => {
    const before = [...counts];
    const result = analyzeExact(cards, up, counts, rules);
    const expected = enumerate(cards, up, counts, rules);
    expect(Object.keys(result.actions).sort()).toEqual(Object.keys(expected).sort());
    for (const action of ['stand', 'hit', 'double'] as const) {
      if (expected[action] !== undefined) expect(result.actions[action]).toBeCloseTo(expected[action]!, 12);
    }
    expect(result.actions.split).toBeUndefined();
    expect(result.dealer.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(result.nodes).toBeLessThanOrEqual(EXACT_STATE_BUDGET);
    expect(result.model).toMatch(/Exact finite shoe, non-split/);
    expect(counts).toEqual(before);
  });

  it('matches a hand-enumerated dealer distribution without replacement', () => {
    // Dealer 10: 6->16->(6 bust or 10 bust); 10->20 immediately.
    const result = analyzeExact([1, 10], 10, shoe({ 6: 2, 10: 1 }), S17);
    expect(result.dealer[3]).toBeCloseTo(1 / 3, 14);
    expect(result.dealer[5]).toBeCloseTo(2 / 3, 14);
    expect(result.dealer.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
  });

  it('depletes observed cards before dealer play and preserves ENHC double losses', () => {
    const counts = shoe({ 1: 1, 10: 4 });
    const exact = analyzeExact([5, 6], 10, counts, S17);
    // Double: draw ace (1/5), finish on 12 and lose 2; or draw ten
    // (4/5), finish on 21, then natural 1/4 loses 2, ten 3/4 wins 2.
    expect(exact.actions.double).toBeCloseTo(0.4, 14);
    expect(exact.actions.double).toBeCloseTo(enumerate([5, 6], 10, counts, S17).double!, 14);
    expect(exact.actions.double).not.toBeCloseTo(analyze([5, 6], 10, counts, S17).actions.double!, 10);
  });

  it('lets a natural push against dealer blackjack with its original probability', () => {
    const counts = shoe({ 1: 1, 10: 3 });
    expect(analyzeExact([1, 10], 10, counts, S17).actions).toEqual({ stand: 1.125 });
  });

  it('throws on exhausted branches rather than inventing a draw or forced stand', () => {
    expect(() => analyzeExact([10, 6], 6, shoe({ 10: 1 }), S17)).toThrow(ShoeExhaustedError);
    expect(() => analyzeExact([10, 6], 6, shoe({}), S17)).toThrow(ShoeExhaustedError);
    expect(() => analyze([10, 6], 6, shoe({}), S17)).toThrow(ShoeExhaustedError);
  });

  it('stops at its documented state budget without returning an approximation', () => {
    try {
      analyzeExact([2, 2], 2, freshCounts(8), S17);
      throw new Error('Expected the exact solver to exceed its budget');
    } catch (error) {
      expect(error).toBeInstanceOf(ExactStateBudgetError);
      expect((error as ExactStateBudgetError).nodes).toBe(EXACT_STATE_BUDGET + 1);
      expect((error as ExactStateBudgetError).budget).toBe(EXACT_STATE_BUDGET);
    }
  });
});

describe('input contracts', () => {
  it.each([analyze, analyzeExact])('rejects malformed inputs', run => {
    expect(() => run([10], 6, freshCounts(1), S17)).toThrow(RangeError);
    expect(() => run([0, 6], 6, freshCounts(1), S17)).toThrow(RangeError);
    expect(() => run([5, 6], 11, freshCounts(1), S17)).toThrow(RangeError);
    expect(() => run([5, 6], 6, [1, 2], S17)).toThrow(RangeError);
    expect(() => run([5, 6], 6, shoe({ 1: -1 }), S17)).toThrow(RangeError);
    expect(() => run([5, 6], 6, shoe({ 1: 0.5 }), S17)).toThrow(RangeError);
    expect(() => run([5, 6], 6, freshCounts(1), { ...S17, blackjackPayout: NaN })).toThrow(RangeError);
    expect(() => run([5, 6], 6, freshCounts(1), { ...S17, blackjackPayout: -1 })).toThrow(RangeError);
  });
});
