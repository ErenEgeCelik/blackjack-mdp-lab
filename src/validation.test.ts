import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as engine from './engine';
import type { AnalysisContext, Rules } from './engine';
import * as gameApi from './game';
import type { GameState } from './game';
import { experiment } from './simulation';
import App from './App';

/** Independent validation: do not use production hand totals, RNG, probabilities,
 * dealer logic, or settlement to generate the mathematical reference values.
 * The tests validate ENHC/all-bets-lost, not American peek blackjack.
 */
const S17: Rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };

function value(cards: readonly number[]): { total: number; soft: boolean } {
  // Enumerate the possible ace upgrades instead of the production incremental total.
  const low = cards.reduce((sum, card) => sum + card, 0);
  const aces = cards.filter(card => card === 1).length;
  const totals = Array.from({ length: aces + 1 }, (_, i) => low + 10 * i);
  const legal = totals.filter(total => total <= 21);
  const total = legal.length ? Math.max(...legal) : low;
  return { total, soft: total > low };
}

function countsOf(cards: readonly number[]): number[] {
  return Array.from({ length: 10 }, (_, i) => cards.filter(card => card === i + 1).length);
}

function observed(cards: number[], up: number): number[] {
  const counts = [24, 24, 24, 24, 24, 24, 24, 24, 24, 96];
  for (const card of [...cards, up]) counts[card - 1]--;
  return counts;
}

/** Park-Miller, deliberately different from production Mulberry32. */
function independentRandom(seed: number): () => number {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;
  return () => {
    state = state * 16_807 % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

/** A reference settlement for completed hands, including a shared dealer natural. */
function payoff(player: number[], dealer: number[], rules: Rules, split = false): number {
  const p = value(player).total;
  const d = value(dealer).total;
  const natural = !split && player.length === 2 && p === 21;
  if (p > 21) return -1;
  if (dealer.length === 2 && d === 21) return natural ? 0 : -1;
  if (natural) return rules.blackjackPayout;
  return d > 21 ? 1 : Math.sign(p - d);
}

function dealerRun(up: number, draw: () => number, rules: Rules): number[] {
  const cards = [up, draw()];
  for (;;) {
    const hand = value(cards);
    if (hand.total > 17 || (hand.total === 17 && (!hand.soft || !rules.hitSoft17))) return cards;
    cards.push(draw());
    if (cards.length > 32) throw new Error('Reference dealer failed to terminate');
  }
}

/** One iid replacement experiment: player draws precede the dealer's second card.
 * No production policy is invoked: stand and double have no policy continuation.
 */
function monteCarlo(
  cards: number[], up: number, counts: number[], rules: Rules,
  action: 'stand' | 'double', split: boolean, seed: number, trials = 500_000,
) {
  const random = independentRandom(seed);
  const size = counts.reduce((sum, count) => sum + count, 0);
  const draw = () => {
    const target = Math.floor(random() * size);
    let cumulative = 0;
    for (let i = 0; i < counts.length; i++) {
      cumulative += counts[i];
      if (target < cumulative) return i + 1;
    }
    throw new Error('Reference categorical draw out of range');
  };
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < trials; i++) {
    const player = action === 'double' ? [...cards, draw()] : cards;
    // Always resolve the dealer here, even after bust: iid draws make this
    // immaterial to payoff, and it also exercises the unconditional natural branch.
    const result = (action === 'double' ? 2 : 1) * payoff(player, dealerRun(up, draw, rules), rules, split);
    sum += result;
    sumSquares += result * result;
  }
  const mean = sum / trials;
  const variance = (sumSquares - sum * sum / trials) / (trials - 1);
  return { mean, se: Math.sqrt(Math.max(0, variance) / trials), trials };
}

/** All physical-card orders, retaining multiplicity for equal ranks. Seven
 * cards give 7! equally likely worlds. The oracle does not use rank weights.
 */
function permutations(cards: number[]): number[][] {
  if (!cards.length) return [[]];
  return cards.flatMap((card, i) => permutations(cards.filter((_, j) => i !== j))
    .map(rest => [card, ...rest]));
}

function orderPayoff(player: number[], up: number, order: number[], rules: Rules, split: boolean): number {
  if (value(player).total > 21) return -1;
  let index = 0;
  const draw = () => {
    if (index === order.length) throw new Error('Oracle fixture requires a longer shoe');
    return order[index++];
  };
  return payoff(player, dealerRun(up, draw, rules), rules, split);
}

/** Optimize only AFTER grouping worlds by the visible next rank. Taking the
 * maximum per full order would leak future cards and is intentionally avoided.
 */
function finiteOracle(cards: number[], up: number, shoe: number[], rules: Rules, context: AnalysisContext = {}) {
  const worlds = permutations(shoe);
  const stand = (player: number[], possible: number[][]) => possible.reduce((sum, order) =>
    sum + orderPayoff(player, up, order, rules, !!context.split), 0) / possible.length;
  function hit(player: number[], possible: number[][]): number {
    const groups = new Map<number, number[][]>();
    for (const order of possible) {
      if (!order.length) throw new Error('Oracle fixture exhausted during player play');
      const group = groups.get(order[0]) ?? [];
      group.push(order.slice(1));
      groups.set(order[0], group);
    }
    let result = 0;
    for (const [card, continuations] of groups) {
      const next = [...player, card];
      const hold = stand(next, continuations);
      const best = value(next).total >= 21 ? hold : Math.max(hold, hit(next, continuations));
      result += continuations.length / possible.length * best;
    }
    return result;
  }
  const actions: Partial<Record<'stand' | 'hit' | 'double', number>> = { stand: stand(cards, worlds) };
  if (value(cards).total >= 21 || (context.split && cards[0] === 1)) return actions;
  actions.hit = hit(cards, worlds);
  if (cards.length === 2 && context.canDouble !== false && (!context.split || rules.doubleAfterSplit)) {
    actions.double = worlds.reduce((sum, order) => sum +
      2 * orderPayoff([...cards, order[0]], up, order.slice(1), rules, !!context.split), 0) / worlds.length;
  }
  return actions;
}

afterEach(() => vi.restoreAllMocks());

describe('independent replacement Monte Carlo', () => {
  const fixtures = [
    { cards: [10, 6], up: 10, rules: S17 },
    { cards: [5, 6], up: 1, rules: S17 },
    { cards: [1, 6], up: 6, rules: S17 },
    { cards: [1, 6], up: 6, rules: { ...S17, hitSoft17: true } },
    { cards: [1, 1], up: 10, rules: { ...S17, hitSoft17: true } },
    { cards: [8, 3], up: 10, rules: S17, split: true },
  ];
  it.each(fixtures)('validates forced stand AND double for $cards vs $up / H17=$rules.hitSoft17', (fixture) => {
    const { cards, up, rules } = fixture;
    const split = !!fixture.split;
    const counts = observed(cards, up);
    const result = engine.analyze(cards, up, counts, rules, { split });
    for (const [index, action] of (['stand', 'double'] as const).entries()) {
      const sample = monteCarlo(cards, up, counts, rules, action, split,
        1_002_001 + up * 177 + cards[0] * 31 + index * 12_345 + (rules.hitSoft17 ? 777 : 0));
      // Predeclared five-SE regression envelope, NOT a claim of 95% coverage.
      // At 500k draws, worst-case double tolerance is below 0.0142 original units.
      const tolerance = 5 * sample.se + 1 / sample.trials;
      expect(tolerance).toBeLessThan(0.0143);
      expect(Math.abs(sample.mean - result.actions[action]!),
        `${action}: MC=${sample.mean}, DP=${result.actions[action]}, SE=${sample.se}`)
        .toBeLessThanOrEqual(tolerance);
    }
  }, 30_000);

  it.each([false, true])('checks a natural versus split 21 independently (split=%s)', split => {
    const cards = [10, 1]; // Split tens with an ace, not a locked split ace.
    const counts = countsOf([1, 1, 2, 6, 9, 10, 10, 10]);
    const rules = { ...S17, blackjackPayout: 1.2 };
    const sample = monteCarlo(cards, 10, counts, rules, 'stand', split, split ? 902 : 901);
    const result = engine.analyze(cards, 10, counts, rules, { split });
    expect(Math.abs(sample.mean - result.actions.stand!)).toBeLessThanOrEqual(5 * sample.se + 0.000002);
    if (!split) expect(result.actions.stand).toBeCloseTo(1.2 * 0.75, 12);
    else expect(result.actions.stand).toBeLessThan(0.75); // Dealer natural loses; drawn 21 pushes.
  }, 30_000);
});

describe('independent physical-order small-shoe oracle', () => {
  const shoe = [1, 6, 7, 8, 9, 10, 10];
  const fixtures = [
    { cards: [4, 7], up: 10, rules: S17 },
    { cards: [1, 4], up: 6, rules: S17 },
    { cards: [1, 4], up: 6, rules: { ...S17, hitSoft17: true } },
    { cards: [8, 8], up: 1, rules: S17, context: { split: true, canSplit: false } },
    { cards: [8, 3], up: 6, rules: { ...S17, doubleAfterSplit: false }, context: { split: true } },
    { cards: [10, 1], up: 10, rules: S17, context: { split: true } },
  ];
  it.each(fixtures)('matches all available values for $cards vs $up', ({ cards, up, rules, context }) => {
    const expected = finiteOracle(cards, up, shoe, rules, context);
    const actual = engine.analyzeExact(cards, up, countsOf(shoe), rules, context);
    expect(Object.keys(actual.actions).sort()).toEqual(Object.keys(expected).sort());
    for (const action of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(actual.actions[action], `${action}: physical order enumeration`).toBeCloseTo(expected[action]!, 11);
    }
    expect(actual.model).toMatch(/exact finite shoe/i);
    expect(engine.analyze(cards, up, countsOf(shoe), rules, context).model).toMatch(/approximation/i);
  });

  it('uses player-first depletion rather than conditioning actions on a future dealer card', () => {
    const shoe = [1, 10, 10, 10, 10];
    const expected = finiteOracle([4, 7], 10, shoe, S17);
    const finite = engine.analyzeExact([4, 7], 10, countsOf(shoe), S17);
    const frozen = engine.analyze([4, 7], 10, countsOf(shoe), S17);
    expect(expected.double).toBeCloseTo(0.4, 12);
    expect(finite.actions.double).toBeCloseTo(expected.double!, 12);
    expect(Math.abs(finite.actions.double! - frozen.actions.double!)).toBeGreaterThan(0.1);
  });
});

/** A coherent active public state, with physical order separately injectable. */
function activeState(cards: number[], up: number, physical: number[], options: {
  bankroll?: number; bet?: number; split?: boolean; rules?: Rules;
} = {}): GameState {
  const bet = options.bet ?? 10;
  const cash = options.bankroll ?? 80;
  return {
    ...gameApi.createGame(701, 6, cash + bet, options.rules ?? S17),
    phase: 'playing', round: 1, roundStartBankroll: cash + bet, bankroll: cash,
    playerHands: [{ cards: [...cards], bet, split: !!options.split, done: false }],
    dealer: [up], activeHand: 0, shoe: [...physical].reverse(), counts: countsOf(physical),
  };
}

describe('eligibility, funding, and observable-state integration', () => {
  it('a denied double/split restricts both solver backends; true flags cannot enable a resplit', () => {
    for (const analyze of [engine.analyze, engine.analyzeExact]) {
      const n = countsOf([1, 6, 7, 8, 9, 10, 10]);
      const denied = analyze([8, 8], 6, n, S17, { canDouble: false, canSplit: false });
      expect(Object.keys(denied.actions).sort()).toEqual(['hit', 'stand']);
      const postSplit = analyze([8, 8], 6, n, { ...S17, doubleAfterSplit: false },
        { split: true, canDouble: true, canSplit: true });
      expect(Object.keys(postSplit.actions).sort()).toEqual(['hit', 'stand']);
    }
  });

  it('distinguishes original natural, ordinary split 21, and mandatory one-card split aces', () => {
    const n = countsOf([1, 6, 7, 8, 9, 10, 10]);
    for (const analyze of [engine.analyze, engine.analyzeExact]) {
      const original = analyze([10, 1], 10, n, S17);
      const split = analyze([10, 1], 10, n, S17, { split: true });
      expect(original.actions.stand).toBeGreaterThan(split.actions.stand!);
      expect(Object.keys(split.actions)).toEqual(['stand']);
      expect(Object.keys(analyze([1, 6], 10, n, S17, { split: true }).actions)).toEqual(['stand']);
    }
  });

  it('keeps the funded live game nonnegative and scales results in ORIGINAL wager units', () => {
    for (const bet of [0.5, 10, 40]) {
      let game = activeState([4, 7], 10, [10, 1], { bet, bankroll: bet });
      game = gameApi.act(game, 'double'); // player 21; dealer natural loses both units.
      expect(game.bankroll).toBe(0);
      expect(game.history[0].profit / bet).toBe(-2);
      expect(game.history[0].profit / game.playerHands[0].bet).toBe(-1);
    }
  });

  it('exposes the difference between an unlimited-DAS split forecast and limited cash', () => {
    // Only one extra stake remains: splitting is funded but subsequent DAS is not.
    const initial = activeState([2, 2], 6, [9, 9, 9, 9], { bankroll: 10 });
    expect(gameApi.legalActions(initial)).toContain('split');
    const forecast = engine.analyze([2, 2], 6, initial.counts, S17,
      { canDouble: true, canSplit: true });
    let game = gameApi.act(initial, 'split');
    expect(game.bankroll).toBe(0);
    expect(gameApi.legalActions(game)).not.toContain('double');
    expect(gameApi.legalActions(game)).not.toContain('split');
    game = gameApi.act(game, 'stand');
    game = gameApi.act(game, 'stand');
    expect(game.history[0].profit / initial.playerHands[0].bet).toBe(2);
    expect(forecast.actions.split).toBe(4);
    // This is a documented model-scope gap, not a Monte Carlo discrepancy:
    // flags restrict the current decision; they do not budget future split DAS.
  });

  it('passes split identity and funded action restrictions from the live App to analysis', () => {
    const state = activeState([8, 8], 6, [7, 8, 9, 10], { split: true, bankroll: 0 });
    const create = vi.spyOn(gameApi, 'createGame').mockReturnValue(state);
    const analyze = vi.spyOn(engine, 'analyze');
    renderToStaticMarkup(createElement(App));
    expect(create).toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledTimes(1);
    const args = analyze.mock.calls[0];
    expect(args.slice(0, 4)).toEqual([state.playerHands[0].cards, 6, state.counts, state.rules]);
    expect(args[4]).toMatchObject({ split: true, canDouble: false, canSplit: false });
  });

  it('never passes future physical order or the shuffle seed to the live mover', () => {
    const first = activeState([10, 6], 10, [1, 6, 7, 8, 9, 10]);
    const second = { ...first, shoe: [...first.shoe].reverse(), seed: 999_999 };
    const create = vi.spyOn(gameApi, 'createGame');
    const analyze = vi.spyOn(engine, 'analyze');
    create.mockReturnValue(first);
    renderToStaticMarkup(createElement(App));
    const a = analyze.mock.calls[0];
    const aResult = analyze.mock.results[0].value;
    create.mockReturnValue(second);
    renderToStaticMarkup(createElement(App));
    expect(analyze.mock.calls[1]).toEqual(a);
    expect(analyze.mock.results[1].value).toEqual(aResult);
    expect(a[2]).toHaveLength(10);
  });
});

describe('independent session uncertainty audit', () => {
  it('reconstructs the t interval from session profits, retaining scheduled rounds after ruin', () => {
    // Deliberately adverse supported rules exercise stopped sessions. This is
    // an accounting/interval check, not a profitability benchmark or coverage study.
    const rounds = 1000;
    const result = experiment({ rounds, seed: 20261112, policy: 'hilo',
      rules: { ...S17, hitSoft17: true, blackjackPayout: 0 } });
    const rows = result.sessionResults as {
      completed: number; profit: number; endingBankroll: number; ruined: boolean; seed: number;
    }[];
    expect(rows).toHaveLength(20);
    expect(rows.some(row => row.completed < rounds)).toBe(true);
    expect(new Set(rows.map(row => row.seed)).size).toBe(20);
    const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
    const expectedMean = totalProfit / (20 * rounds);
    // Raw-profit second moment gives an independent algebraic reconstruction.
    const secondMoment = rows.reduce((sum, row) => sum + row.profit ** 2, 0);
    const varianceOfMean = (secondMoment - totalProfit ** 2 / 20) / (19 * 20 * rounds ** 2);
    const margin = 2.093024054408263 * Math.sqrt(varianceOfMean); // t_0.975,19
    expect(result.mean).toBeCloseTo(expectedMean, 12);
    expect(result.low).toBeCloseTo(expectedMean - margin, 10);
    expect(result.high).toBeCloseTo(expectedMean + margin, 10);
    expect(result.interval).toMatch(/scheduled round/i);
    expect(result.played).toBe(rows.reduce((sum, row) => sum + row.completed, 0));
    expect(result.played).toBeLessThan(20 * rounds);
    expect(result.mean).not.toBeCloseTo(totalProfit / result.played, 6);
    expect(result.ruined).toBe(rows.filter(row => row.ruined).length);
    expect(result.ruinRate).toBe(result.ruined / 20);
    for (const row of rows) {
      expect(row.endingBankroll).toBeGreaterThanOrEqual(0);
      expect(row.profit).toBeCloseTo(row.endingBankroll - 200, 12);
      expect(row.ruined).toBe(row.endingBankroll < 1);
    }
  }, 60_000);
});
