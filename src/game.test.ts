import { describe, expect, it } from 'vitest';
import { freshCounts, handValue, hiLo } from './engine';
import { act, createGame, deal, legalActions, newShoe } from './game';
import type { Action, GameState, Rules } from './game';

/** Put a known draw sequence on top of a physically complete one-deck shoe. */
function rig(draws: number[], bankroll = 100, rules: Partial<Rules> = {}): GameState {
  const state = createGame(42, 1, bankroll, rules);
  const remaining = [...state.shoe];
  for (const rank of draws) {
    const index = remaining.indexOf(rank);
    if (index === -1) throw new Error(`Fixture uses too many cards of rank ${rank}.`);
    remaining.splice(index, 1);
  }
  state.shoe = [...remaining, ...[...draws].reverse()];
  return state;
}

function expectCounts(state: GameState): void {
  const physical = Array<number>(10).fill(0);
  for (const card of state.shoe) physical[card - 1]++;
  expect(state.counts).toEqual(physical);
  expect(state.counts.reduce((sum, count) => sum + count, 0)).toBe(state.shoe.length);
  const full = freshCounts(state.decks);
  const exposedHiLo = full.reduce((sum, count, i) => sum + (count - physical[i]) * hiLo(i + 1), 0);
  expect(state.runningCount).toBe(exposedHiLo);
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('creation and shuffling', () => {
  it('creates a complete six-deck shoe and the default betting state', () => {
    const state = createGame();
    expect(state.shoe).toHaveLength(312);
    expect(state.counts).toEqual(freshCounts(6));
    expect(state).toMatchObject({
      phase: 'betting', bankroll: 1000, round: 0, runningCount: 0,
      activeHand: 0, playerHands: [], dealer: [], history: [], seed: 42, shoeNumber: 1,
      rules: { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true },
    });
    expect(legalActions(state)).toEqual([]);
    expectCounts(state);
  });

  it('reproduces the shuffle sequence while producing a fresh order each shoe', () => {
    const original = freeze(createGame(17, 2));
    expect(createGame(17, 2)).toEqual(original);
    expect(createGame(18, 2).shoe).not.toEqual(original.shoe);
    const second = newShoe(original);
    expect(second).toEqual(newShoe(createGame(17, 2)));
    expect(second.shoe).not.toEqual(original.shoe);
    expect(second.shoeNumber).toBe(2);
    const third = newShoe(second);
    expect(third).toEqual(newShoe(newShoe(createGame(17, 2))));
    expect(third.shoe).not.toEqual(second.shoe);
    expectCounts(second);
    expectCounts(third);
  });

  it('does not repeat successive shoes through rounding of a large safe integer seed', () => {
    const initial = createGame(Number.MAX_SAFE_INTEGER, 1);
    const second = newShoe(initial);
    const third = newShoe(second);
    expect(initial.shoe).toEqual(createGame(Number.MAX_SAFE_INTEGER >>> 0, 1).shoe);
    expect(second.shoe).not.toEqual(initial.shoe);
    expect(third.shoe).not.toEqual(second.shoe);
    expect(third).toEqual(newShoe(newShoe(createGame(Number.MAX_SAFE_INTEGER, 1))));
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid deck count %s', decks => {
    expect(() => createGame(42, decks)).toThrow();
  });

  it.each([-1, NaN, Infinity])('rejects invalid initial cash %s', bankroll => {
    expect(() => createGame(42, 1, bankroll)).toThrow();
  });

  it('accepts zero cash and validates seeds and rules', () => {
    expect(createGame(0, 1, 0).bankroll).toBe(0);
    expect(() => createGame(NaN)).toThrow();
    expect(() => createGame(1.5)).toThrow();
    for (const payout of [-1, Infinity, NaN]) {
      expect(() => createGame(42, 1, 100, { blackjackPayout: payout })).toThrow();
    }
    expect(() => createGame(42, 1, 100, { hitSoft17: undefined })).toThrow();
    expect(() => createGame(42, 1, 100, { doubleAfterSplit: undefined })).toThrow();
  });
});

describe('dealing and natural blackjacks', () => {
  it('deals player, visible dealer, player and immediately deducts exposed cards and stake', () => {
    const input = freeze(rig([10, 6, 7]));
    const before = structuredClone(input);
    const state = deal(input, 10);
    expect(state.playerHands).toEqual([{ cards: [10, 7], bet: 10, done: false, split: false }]);
    expect(state.dealer).toEqual([6]);
    expect(state.shoe).toHaveLength(49);
    expect(state).toMatchObject({ phase: 'playing', bankroll: 90, round: 1, runningCount: 0 });
    expect(state.history).toEqual([]);
    expect(legalActions(state)).toEqual(['hit', 'stand', 'double']);
    expect(input).toEqual(before);
    expectCounts(state);
  });

  it.each([0, -5, NaN, Infinity, 101])('rejects invalid bet %s without changing the input', bet => {
    const input = freeze(rig([10, 6, 7]));
    const before = structuredClone(input);
    expect(() => deal(input, bet)).toThrow();
    expect(input).toEqual(before);
  });

  it('rejects dealing or replacing the shoe during a live round', () => {
    const state = freeze(deal(rig([10, 6, 7]), 10));
    expect(() => deal(state, 10)).toThrow();
    expect(() => newShoe(state)).toThrow();
  });

  it('pays a natural immediately, revealing only the compulsory dealer second card', () => {
    const state = deal(rig([1, 6, 10, 10]), 10);
    expect(state.dealer).toEqual([6, 10]);
    expect(state.shoe).toHaveLength(48);
    expect(state.phase).toBe('settled');
    expect(state.bankroll).toBe(115);
    expect(state.history).toEqual([{ round: 1, bankroll: 115, profit: 15 }]);
    expect(state.playerHands[0].done).toBe(true);
    expect(legalActions(state)).toEqual([]);
    expectCounts(state);
  });

  it('pushes two naturals and returns the initial stake', () => {
    const state = deal(rig([1, 10, 10, 1]), 10);
    expect(state.dealer).toEqual([10, 1]);
    expect(state.bankroll).toBe(100);
    expect(state.history[0].profit).toBe(0);
    expectCounts(state);
  });

  it('uses a custom natural payout and owns its rule object', () => {
    const rules = { blackjackPayout: 1.2 };
    const input = rig([1, 8, 10, 9], 100, rules);
    rules.blackjackPayout = 2;
    const state = deal(input, 10);
    expect(state.bankroll).toBe(112);
    expect(state.history[0].profit).toBe(12);
    expect(state.rules.blackjackPayout).toBe(1.2);
  });
});

describe('player actions and ordinary settlement', () => {
  it.each([
    { cards: [10, 10, 9, 8], bankroll: 110, profit: 10, dealer: [10, 8] },
    { cards: [10, 10, 8, 9], bankroll: 90, profit: -10, dealer: [10, 9] },
    { cards: [10, 10, 8, 8], bankroll: 100, profit: 0, dealer: [10, 8] },
    { cards: [10, 6, 7, 10, 10], bankroll: 110, profit: 10, dealer: [6, 10, 10] },
  ])('settles a standing hand against $dealer', ({ cards, bankroll, profit, dealer }) => {
    const input = freeze(deal(rig(cards), 10));
    const before = structuredClone(input);
    const state = act(input, 'stand');
    expect(state.phase).toBe('settled');
    expect(state.bankroll).toBe(bankroll);
    expect(state.dealer).toEqual(dealer);
    expect(state.history).toEqual([{ round: 1, bankroll, profit }]);
    expect(input).toEqual(before);
    expectCounts(state);
  });

  it('leaves the dealer with only its upcard while the player can still act', () => {
    const input = freeze(deal(rig([2, 6, 3, 4]), 10));
    const state = act(input, 'hit');
    expect(state.playerHands[0].cards).toEqual([2, 3, 4]);
    expect(state.phase).toBe('playing');
    expect(state.bankroll).toBe(90);
    expect(state.dealer).toEqual([6]);
    expect(legalActions(state)).toEqual(['hit', 'stand']);
    expect(() => act(state, 'double')).toThrow();
    expectCounts(state);
  });

  it('automatically completes a three-card 21 and pays an ordinary win', () => {
    const state = act(deal(rig([5, 10, 6, 10, 9]), 10), 'hit');
    expect(state.playerHands[0].cards).toEqual([5, 6, 10]);
    expect(state.dealer).toEqual([10, 9]);
    expect(state.phase).toBe('settled');
    expect(state.bankroll).toBe(110);
    expectCounts(state);
  });

  it('settles a bust without unnecessarily drawing for the dealer', () => {
    const state = act(deal(rig([10, 6, 7, 10]), 10), 'hit');
    expect(state.phase).toBe('settled');
    expect(state.dealer).toEqual([6]);
    expect(state.bankroll).toBe(90);
    expect(state.history[0].profit).toBe(-10);
    expectCounts(state);
  });

  it('takes the extra double stake, draws once, and advances to settlement', () => {
    const state = act(deal(rig([5, 6, 6, 10, 10, 10]), 10), 'double');
    expect(state.playerHands[0]).toEqual({ cards: [5, 6, 10], bet: 20, done: true, split: false });
    expect(state.bankroll).toBe(120);
    expect(state.history[0].profit).toBe(20);
    expectCounts(state);
  });

  it('loses the entire doubled stake to a European dealer natural', () => {
    const input = deal(rig([5, 1, 6, 10, 10]), 10);
    expect(input.dealer).toEqual([1]);
    const state = act(input, 'double');
    expect(state.dealer).toEqual([1, 10]);
    expect(state.playerHands[0].cards).toEqual([5, 6, 10]);
    expect(state.bankroll).toBe(80);
    expect(state.history[0].profit).toBe(-20);
    expectCounts(state);
  });

  it('loses a doubled bust and records the round only once', () => {
    const state = act(deal(rig([10, 6, 7, 10]), 10), 'double');
    expect(state.bankroll).toBe(80);
    expect(state.history).toHaveLength(1);
    for (const action of ['hit', 'stand', 'double', 'split'] as Action[]) {
      expect(() => act(state, action)).toThrow();
    }
    expect(state.history).toHaveLength(1);
    expectCounts(state);
  });

  it('stands or hits soft 17 according to the dealer rule', () => {
    const cards = [10, 1, 8, 6, 2];
    const stand = act(deal(rig(cards, 100, { hitSoft17: false }), 10), 'stand');
    const hit = act(deal(rig(cards, 100, { hitSoft17: true }), 10), 'stand');
    expect(stand.dealer).toEqual([1, 6]);
    expect(stand.bankroll).toBe(110);
    expect(hit.dealer).toEqual([1, 6, 2]);
    expect(hit.bankroll).toBe(90);
    expectCounts(stand);
    expectCounts(hit);
  });

  it('always stands on hard 17, even with hitSoft17 enabled', () => {
    const state = act(deal(rig([10, 10, 8, 7], 100, { hitSoft17: true }), 10), 'stand');
    expect(state.dealer).toEqual([10, 7]);
    expect(state.bankroll).toBe(110);
  });
});

describe('splitting and legal actions', () => {
  it('requires sufficient cash for extra stakes but allows an all-in initial bet', () => {
    const input = deal(rig([8, 6, 8], 10), 10);
    expect(input.bankroll).toBe(0);
    expect(legalActions(input)).toEqual(['hit', 'stand']);
    expect(() => act(input, 'double')).toThrow();
    expect(() => act(input, 'split')).toThrow();
    const enough = deal(rig([8, 6, 8], 20), 10);
    expect(legalActions(enough)).toEqual(['hit', 'stand', 'double', 'split']);
  });

  it('splits only a pair, charges a stake, and plays hands in order without resplitting', () => {
    const input = freeze(deal(rig([8, 6, 8, 8, 3, 10, 10]), 10));
    const state = act(input, 'split');
    expect(state.bankroll).toBe(80);
    expect(state.playerHands).toEqual([
      { cards: [8, 8], bet: 10, done: false, split: true },
      { cards: [8, 3], bet: 10, done: false, split: true },
    ]);
    expect(state.activeHand).toBe(0);
    expect(state.dealer).toEqual([6]);
    expect(legalActions(state)).toEqual(['hit', 'stand', 'double']);
    expect(() => act(state, 'split')).toThrow();
    const second = act(freeze(state), 'stand');
    expect(second.activeHand).toBe(1);
    expect(second.phase).toBe('playing');
    expect(second.history).toHaveLength(0);
    expect(second.playerHands[0].done).toBe(true);
    const settled = act(second, 'stand');
    expect(settled.phase).toBe('settled');
    expect(settled.bankroll).toBe(120);
    expect(settled.history).toEqual([{ round: 1, bankroll: 120, profit: 20 }]);
    for (const step of [input, state, second, settled]) expectCounts(step);
  });

  it('rejects a split of unequal ranks and unsupported actions', () => {
    const state = deal(rig([8, 6, 9]), 10);
    expect(legalActions(state)).not.toContain('split');
    expect(() => act(state, 'split')).toThrow();
    for (const action of ['surrender', 'insurance', 'resplit']) {
      expect(() => act(state, action as Action)).toThrow();
    }
    expect(legalActions(createGame())).toEqual([]);
    expect(() => act(createGame(), 'hit')).toThrow();
  });

  it('honors doubleAfterSplit independently of the initial-hand double option', () => {
    const initial = deal(rig([8, 6, 8, 3, 2], 100, { doubleAfterSplit: false }), 10);
    expect(legalActions(initial)).toContain('double');
    const split = act(initial, 'split');
    expect(legalActions(split)).toEqual(['hit', 'stand']);
    expect(() => act(split, 'double')).toThrow();
    expect(legalActions(act(split, 'stand'))).toEqual(['hit', 'stand']);
  });

  it('can double each split hand and loses all four stakes to dealer blackjack', () => {
    let state = deal(rig([8, 1, 8, 3, 2, 10, 10, 10]), 10);
    state = act(state, 'split');
    state = act(state, 'double');
    expect(state.bankroll).toBe(70);
    expect(state.activeHand).toBe(1);
    expect(state.dealer).toEqual([1]);
    expect(state.history).toHaveLength(0);
    expectCounts(state);
    state = act(state, 'double');
    expect(state.playerHands.map(hand => hand.bet)).toEqual([20, 20]);
    expect(state.dealer).toEqual([1, 10]);
    expect(state.bankroll).toBe(60);
    expect(state.history[0].profit).toBe(-40);
    expectCounts(state);
  });

  it('gives split aces exactly one card each and pays split 21 at ordinary odds', () => {
    const state = act(deal(rig([1, 10, 1, 10, 9, 8]), 10), 'split');
    expect(state.playerHands).toEqual([
      { cards: [1, 10], bet: 10, done: true, split: true },
      { cards: [1, 9], bet: 10, done: true, split: true },
    ]);
    expect(state.dealer).toEqual([10, 8]);
    expect(state.bankroll).toBe(120);
    expect(legalActions(state)).toEqual([]);
    expectCounts(state);
  });

  it('does not allow hitting, doubling, or resplitting split aces even when they pair again', () => {
    const state = act(deal(rig([1, 10, 1, 1, 1, 7]), 10), 'split');
    expect(state.playerHands.map(hand => hand.cards)).toEqual([[1, 1], [1, 1]]);
    expect(state.phase).toBe('settled');
    expect(state.shoe).toHaveLength(46);
    expect(legalActions(state)).toEqual([]);
    expect(state.bankroll).toBe(80);
    expectCounts(state);
  });

  it('makes dealer blackjack beat split 21 and returns neither split stake', () => {
    const state = act(deal(rig([1, 10, 1, 10, 10, 1]), 10), 'split');
    expect(state.playerHands.map(hand => handValue(hand.cards).total)).toEqual([21, 21]);
    expect(state.dealer).toEqual([10, 1]);
    expect(state.bankroll).toBe(80);
    expect(state.history[0].profit).toBe(-20);
    expectCounts(state);
  });

  it('skips a completed non-ace split 21 and plays the remaining hand', () => {
    const state = act(deal(rig([10, 10, 10, 1, 8, 9]), 10), 'split');
    expect(state.playerHands[0].cards).toEqual([10, 1]);
    expect(state.playerHands[0].done).toBe(true);
    expect(state.activeHand).toBe(1);
    expect(state.phase).toBe('playing');
    const settled = act(state, 'stand');
    expect(settled.bankroll).toBe(100);
    expect(settled.history[0].profit).toBe(0);
    expectCounts(settled);
  });

  it('advances after a split hand bust and settles the two results together', () => {
    let state = act(deal(rig([8, 10, 8, 7, 10, 10, 8]), 10), 'split');
    state = act(state, 'hit');
    expect(state.activeHand).toBe(1);
    expect(state.bankroll).toBe(80);
    expect(state.dealer).toEqual([10]);
    expect(state.history).toEqual([]);
    state = act(state, 'stand');
    expect(state.bankroll).toBe(90);
    expect(state.history[0].profit).toBe(-10);
    expectCounts(state);
  });
});

describe('cut card, history, and immutability', () => {
  function keepNext(state: GameState, cards: number): GameState {
    state.shoe = state.shoe.slice(-cards);
    state.counts = Array<number>(10).fill(0);
    for (const rank of state.shoe) state.counts[rank - 1]++;
    state.runningCount = freshCounts(state.decks).reduce(
      (sum, count, i) => sum + (count - state.counts[i]) * hiLo(i + 1), 0,
    );
    return state;
  }

  it('reshuffles automatically before a deal below 25% and resets the running count', () => {
    const input = freeze(keepNext(rig([10, 6, 7]), 12));
    const state = deal(input, 10);
    expect(state.shoeNumber).toBe(2);
    expect(state.shoe.length).toBeGreaterThanOrEqual(48);
    expect(state.shoe.length).toBeLessThanOrEqual(49);
    expectCounts(state);
    expect(input.shoe).toHaveLength(12);
  });

  it('does not reshuffle at exactly 25% or when the cut card is crossed during a round', () => {
    const initial = keepNext(rig([2, 10, 3, 4, 8]), 13);
    let state = deal(initial, 10);
    expect(state.shoeNumber).toBe(1);
    expect(state.shoe).toHaveLength(10);
    state = act(state, 'hit');
    expect(state.shoeNumber).toBe(1);
    expect(state.playerHands[0].cards).toEqual([2, 3, 4]);
    expect(state.shoe).toHaveLength(9);
    state = act(state, 'stand');
    expect(state.shoeNumber).toBe(1);
    expect(state.dealer).toEqual([10, 8]);
    expectCounts(state);
    const nextRound = deal(state, 10);
    expect(nextRound.shoeNumber).toBe(2);
    expect(nextRound.round).toBe(2);
    expectCounts(nextRound);
  });

  it('rejects exhaustion during a hand without reshuffling or changing its input', () => {
    const input = deal(rig([10, 6, 7]), 10);
    input.shoe = [];
    input.counts = Array<number>(10).fill(0);
    const before = structuredClone(input);
    freeze(input);
    expect(() => act(input, 'hit')).toThrow(/exhausted/i);
    expect(() => act(input, 'stand')).toThrow(/exhausted/i);
    expect(input).toEqual(before);
  });

  it('keeps history and cash through a manual new shoe and the next round', () => {
    const settled = freeze(act(deal(rig([10, 10, 9, 8]), 10), 'stand'));
    const fresh = newShoe(settled);
    expect(fresh).toMatchObject({
      phase: 'betting', bankroll: 110, round: 1, runningCount: 0,
      playerHands: [], dealer: [], shoeNumber: 2,
      history: [{ round: 1, bankroll: 110, profit: 10 }],
    });
    expectCounts(fresh);
    const next = deal(fresh, 10);
    const finished = next.phase === 'playing' ? act(next, 'stand') : next;
    expect(finished.history).toHaveLength(2);
    expect(finished.history[1].round).toBe(2);
    expect(finished.history[1].profit).toBe(finished.bankroll - 110);
    expect(finished.history[0]).toEqual(settled.history[0]);
    expectCounts(finished);
  });

  it('returns independent nested objects from every state transition', () => {
    const initial = rig([8, 6, 8, 3, 2, 10, 10, 10]);
    const dealt = deal(initial, 10);
    const split = act(dealt, 'split');
    const doneFirst = act(split, 'stand');
    const settled = act(doneFirst, 'stand');
    const fresh = newShoe(settled);
    for (const [before, after] of [
      [initial, dealt], [dealt, split], [split, doneFirst], [doneFirst, settled], [settled, fresh],
    ]) {
      expect(after).not.toBe(before);
      for (const key of ['shoe', 'counts', 'playerHands', 'dealer', 'rules', 'history'] as const) {
        expect(after[key]).not.toBe(before[key]);
      }
      if (before.history.length && after.history.length) expect(after.history[0]).not.toBe(before.history[0]);
      if (before.playerHands.length && after.playerHands.length) {
        expect(after.playerHands[0]).not.toBe(before.playerHands[0]);
        expect(after.playerHands[0].cards).not.toBe(before.playerHands[0].cards);
      }
    }
    expect(legalActions(split)).toEqual(legalActions(split));
  });

  it('maintains physical counts and bankroll accounting over many deterministic rounds', () => {
    let state = createGame(123, 1, 10_000);
    for (let round = 1; round <= 100; round++) {
      const cashBefore = state.bankroll;
      state = deal(freeze(state), 10);
      expectCounts(state);
      let decisions = 0;
      while (state.phase === 'playing') {
        const options = legalActions(state);
        const total = handValue(state.playerHands[state.activeHand].cards).total;
        const action = options.includes('split') ? 'split'
          : options.includes('double') && total === 11 ? 'double'
            : total < 17 ? 'hit' : 'stand';
        state = act(freeze(state), action);
        expectCounts(state);
        expect(++decisions).toBeLessThan(60);
      }
      expect(state.round).toBe(round);
      expect(state.history).toHaveLength(round);
      expect(state.history.at(-1)?.profit).toBe(state.bankroll - cashBefore);
      expect(state.playerHands.every(hand => hand.done)).toBe(true);
      expect(legalActions(state)).toEqual([]);
    }
    expect(state.shoeNumber).toBeGreaterThan(1);
  });
});
