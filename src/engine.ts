/** Blackjack net-profit EVs per original unit wager (a win is +1, a loss -1).
 * Ranks are 1 (ace) through 10 (all ten-valued cards). Counts have ten entries,
 * indexed by rank - 1, and describe the observed shoe AFTER removing the player's
 * cards and dealer upcard. There is no hidden/removed dealer hole card (ENHC).
 */
export interface Rules {
  hitSoft17: boolean;
  /** Net profit on a player natural, e.g. 1.5 for 3:2. */
  blackjackPayout: number;
  doubleAfterSplit: boolean;
}

export type Action = 'hit' | 'stand' | 'double' | 'split';

/** Optional live-hand eligibility. Flags only restrict otherwise legal actions;
 * true cannot override two-card/pair eligibility, DAS, or the no-resplit rule.
 * split marks a hand produced by the original split, AFTER its mandatory card;
 * cards[0] must remain the original split rank (cards are in deal order).
 * Such a hand has no natural, and a split ace cannot hit or double.
 */
export interface AnalysisContext {
  split?: boolean;
  canDouble?: boolean;
  canSplit?: boolean;
}

export interface Analysis {
  actions: Partial<Record<Action, number>>;
  best: string;
  /** Dealer distribution if play passes immediately to the dealer, before any
   * further player draws: 17, 18, 19, 20, non-natural 21, bust, blackjack.
   * The dealer plays out even if the current player hand is already bust.
   */
  dealer: number[];
  /** Probability the very next player draw busts the current hand; 1 if bust. */
  bustProbability: number;
  model: string;
  /** Number of distinct evaluated dealer/player DP states, including terminals. */
  nodes: number;
}

interface Hand {
  total: number;
  soft: boolean;
}

/** The exact solver never falls back to a replacement model. Its budget covers
 * all memoized states evaluated in one call, across all candidate actions.
 */
export const EXACT_STATE_BUDGET = 100_000;

export class ExactStateBudgetError extends Error {
  readonly budget = EXACT_STATE_BUDGET;
  constructor(readonly nodes: number) {
    super(`Exact finite-shoe state budget (${EXACT_STATE_BUDGET}) exceeded.`);
    this.name = 'ExactStateBudgetError';
  }
}

/** Exhaustion has no universal blackjack settlement rule. Reject an exact
 * calculation that reaches a positive-probability branch requiring another
 * card, instead of inventing a reshuffle, standing early, or renormalizing it.
 */
export class ShoeExhaustedError extends Error {
  constructor() {
    super('The finite shoe is exhausted on a branch that requires another card.');
    this.name = 'ShoeExhaustedError';
  }
}

function checkRank(rank: number): void {
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
    throw new RangeError('Ranks must be integers from 1 through 10.');
  }
}

/** Best ace-adjusted total. Soft means exactly one ace is currently worth 11. */
export function handValue(cards: number[]): Hand {
  let total = 0;
  let ace = false;
  for (const rank of cards) {
    checkRank(rank);
    total += rank;
    ace ||= rank === 1;
  }
  const soft = ace && total + 10 <= 21;
  return { total: total + (soft ? 10 : 0), soft };
}

export function freshCounts(decks: number): number[] {
  if (!Number.isSafeInteger(decks) || decks <= 0 || decks > Number.MAX_SAFE_INTEGER / 52) {
    throw new RangeError('decks must be a positive safe integer with a safe card count.');
  }
  return Array.from({ length: 10 }, (_, i) => (i === 9 ? 16 : 4) * decks);
}

export function hiLo(rank: number): number {
  checkRank(rank);
  return rank >= 2 && rank <= 6 ? 1 : rank === 1 || rank === 10 ? -1 : 0;
}

/** Deterministic Mulberry32 PRNG in [0, 1). Seeds are coerced to uint32;
 * this is for reproducible simulations, not cryptographic use.
 */
export function seededRandom(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new RangeError('seed must be finite.');
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addCard(hand: Hand, rank: number): Hand {
  let total = hand.total + rank;
  let soft = hand.soft;
  if (rank === 1 && !soft && total + 10 <= 21) {
    total += 10;
    soft = true;
  }
  if (soft && total > 21) {
    total -= 10;
    soft = false;
  }
  return { total, soft };
}

function validate(cards: number[], up: number, counts: number[], rules: Rules, context: AnalysisContext): void {
  if (cards.length < 2) throw new RangeError('The player must have at least two cards.');
  cards.forEach(checkRank);
  checkRank(up);
  if (counts.length !== 10 || Array.from(counts).some(n => !Number.isSafeInteger(n) || n < 0)
    || !Number.isSafeInteger(counts.reduce((a, b) => a + b, 0))) {
    throw new RangeError('counts must contain ten nonnegative safe integers with a safe sum.');
  }
  if (typeof rules.hitSoft17 !== 'boolean' || typeof rules.doubleAfterSplit !== 'boolean'
    || !Number.isFinite(rules.blackjackPayout) || rules.blackjackPayout < 0) {
    throw new RangeError('Rules require boolean flags and a finite nonnegative blackjack payout.');
  }
  if ([context.split, context.canDouble, context.canSplit]
    .some(flag => flag !== undefined && typeof flag !== 'boolean')) {
    throw new RangeError('Context flags must be boolean when provided.');
  }
}

function unitDistribution(index: number): number[] {
  const result = Array<number>(7).fill(0);
  result[index] = 1;
  return result;
}

function solve(
  cards: number[], up: number, inputCounts: number[], rules: Rules,
  finite: boolean, context: AnalysisContext,
): Analysis {
  validate(cards, up, inputCounts, rules, context);
  // Own all arrays; callers may reuse their shoe unchanged after analysis.
  const counts = inputCounts.slice();
  if (counts.every(n => n === 0)) throw new ShoeExhaustedError();
  const dealerCache = new Map<string, number[]>();
  const playerCache = new Map<string, number>();
  let nodes = 0;
  const visit = () => {
    nodes += 1;
    if (finite && nodes > EXACT_STATE_BUDGET) throw new ExactStateBudgetError(nodes);
  };
  const key = (hand: Hand, shoe: number[]) =>
    `${hand.total}:${+hand.soft}${finite ? ':' + shoe.join(',') : ''}`;

  function draws(shoe: number[], evaluate: (rank: number, next: number[], p: number) => void): void {
    const size = shoe.reduce((a, b) => a + b, 0);
    if (size === 0) throw new ShoeExhaustedError();
    for (let i = 0; i < 10; i += 1) {
      if (shoe[i] === 0) continue;
      const next = finite ? shoe.slice() : shoe;
      if (finite) next[i] -= 1;
      evaluate(i + 1, next, shoe[i] / size);
    }
  }

  // needsSecond distinguishes the compulsory second card and dealer naturals
  // from later 21s. No draw occurs until all player decisions are finished.
  function dealerPlay(hand: Hand, shoe: number[], needsSecond: boolean): number[] {
    const cacheKey = `${+needsSecond}:${key(hand, shoe)}`;
    const cached = dealerCache.get(cacheKey);
    if (cached !== undefined) return cached;
    visit();
    let result: number[];
    if (!needsSecond && hand.total > 21) {
      result = unitDistribution(5);
    } else if (!needsSecond && hand.total >= 17
      && !(hand.total === 17 && hand.soft && rules.hitSoft17)) {
      result = unitDistribution(hand.total - 17);
    } else {
      result = Array<number>(7).fill(0);
      draws(shoe, (rank, next, p) => {
        const drawn = addCard(hand, rank);
        const branch = needsSecond && drawn.total === 21
          ? unitDistribution(6) : dealerPlay(drawn, next, false);
        for (let i = 0; i < 7; i += 1) result[i] += p * branch[i];
      });
    }
    dealerCache.set(cacheKey, result);
    return result;
  }

  const upHand = handValue([up]);
  const dealerAt = (shoe: number[]) => dealerPlay(upHand, shoe, true);

  function stand(hand: Hand, shoe: number[]): number {
    if (hand.total > 21) return -1;
    const distribution = dealerAt(shoe);
    let ev = distribution[5] - distribution[6];
    for (let i = 0; i < 5; i += 1) {
      ev += distribution[i] * Math.sign(hand.total - (17 + i));
    }
    return ev;
  }

  function hit(hand: Hand, shoe: number[]): number {
    let ev = 0;
    draws(shoe, (rank, next, p) => { ev += p * optimal(addCard(hand, rank), next); });
    return ev;
  }

  // Continuations after hitting cannot double or split. The remaining shoe is
  // public information; no policy is conditioned on a dealer second card.
  function optimal(hand: Hand, shoe: number[]): number {
    const cacheKey = key(hand, shoe);
    const cached = playerCache.get(cacheKey);
    if (cached !== undefined) return cached;
    visit();
    const ev = hand.total >= 21 ? stand(hand, shoe) : Math.max(stand(hand, shoe), hit(hand, shoe));
    playerCache.set(cacheKey, ev);
    return ev;
  }

  function double(hand: Hand, shoe: number[]): number {
    let ev = 0;
    // ENHC: a dealer natural loses the full doubled wager, not just its base.
    draws(shoe, (rank, next, p) => { ev += p * 2 * stand(addCard(hand, rank), next); });
    return ev;
  }

  const hand = handValue(cards);
  const dealer = dealerAt(counts).slice();
  const natural = !context.split && cards.length === 2 && hand.total === 21;
  const splitAce = context.split && cards[0] === 1;
  const actions: Analysis['actions'] = {
    stand: natural ? rules.blackjackPayout * (1 - dealer[6]) : stand(hand, counts),
  };
  // All 21s, busted hands, and completed split aces are terminal.
  if (!natural && !splitAce && hand.total < 21) {
    actions.hit = hit(hand, counts);
    if (cards.length === 2 && context.canDouble !== false
      && (!context.split || rules.doubleAfterSplit)) actions.double = double(hand, counts);
    if (!finite && !context.split && context.canSplit !== false
      && cards.length === 2 && cards[0] === cards[1]) {
      let oneHand = 0;
      const splitBase = handValue([cards[0]]);
      draws(counts, (rank, next, p) => {
        const splitHand = addCard(splitBase, rank);
        // Each split ace receives one card only. Split 21 pays an ordinary
        // unit win, including when the split base is a ten or an ace.
        const ev = cards[0] === 1 || splitHand.total === 21 ? stand(splitHand, next)
          : Math.max(optimal(splitHand, next),
            rules.doubleAfterSplit ? double(splitHand, next) : -Infinity);
        oneHand += p * ev;
      });
      // With replacement the hands have identical marginal distributions.
      // Linearity of expectation holds despite their shared dealer outcome;
      // dealer blackjack loses both wagers and all extra doubles. No resplits.
      actions.split = 2 * oneHand;
    }
  }
  let bustProbability = hand.total > 21 ? 1 : 0;
  if (hand.total <= 21) {
    draws(counts, (rank, _next, p) => {
      if (addCard(hand, rank).total > 21) bustProbability += p;
    });
  }
  // Stable tie preference: stand, hit, double, split (no extra wager on ties).
  let best: Action = 'stand';
  for (const action of ['hit', 'double', 'split'] as const) {
    if (actions[action] !== undefined && actions[action]! > actions[best]!) best = action;
  }
  return {
    actions, best, dealer, bustProbability, nodes,
    model: finite ? 'Exact finite shoe, non-split, ENHC'
      : 'Frozen observed composition, with replacement, ENHC (finite-shoe approximation)',
  };
}

/** Exact DP WITHIN the frozen observed-composition replacement surrogate.
 * Every future draw uses counts[rank - 1] / sum(counts), unchanged by draws.
 * This approximates a finite shoe. Hit/stand continuations are optimal; double
 * is two-card only, split is a two-card pair only, once, with optional DAS.
 * Split aces receive exactly one card each; split 21 is never a natural.
 * No surrender, insurance, peek, or hole card. Dealer natural loses ALL wagers,
 * except an original player natural pushes; otherwise naturals earn the payout.
 * Optional context identifies live split hands and further restricts actions;
 * context.split means a mandatory post-split card has already been dealt.
 */
export function analyze(
  cards: number[], up: number, counts: number[], rules: Rules, context: AnalysisContext = {},
): Analysis {
  return solve(cards, up, counts, rules, false, context);
}

/** Exhaustive finite-shoe SINGLE-HAND DP without splitting (split is omitted
 * even for pairs). Other hands' future draws are not part of this state/API.
 * context.split marks this hand's provenance only; it does not enable a
 * multi-hand finite-shoe calculation. Use it only when no other player hands
 * remain to draw before the dealer, if finite-shoe exactness is required.
 * Each observed player draw depletes the shoe BEFORE the next player decision;
 * dealer draws begin only after player play ends. Thus no hidden information
 * enters the policy. Stand, hit, and eligible double EVs are exact, with optimal
 * hit/stand continuation. Budget/exhaustion errors propagate, never approximate.
 * All other contracts, units, natural rules, and output fields match analyze.
 */
export function analyzeExact(
  cards: number[], up: number, counts: number[], rules: Rules, context: AnalysisContext = {},
): Analysis {
  return solve(cards, up, counts, rules, true, context);
}
