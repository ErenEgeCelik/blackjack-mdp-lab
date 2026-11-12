import { freshCounts, handValue, hiLo, seededRandom } from './engine';
import type { Rules } from './engine';

export type { Rules } from './engine';

export type Action = 'hit' | 'stand' | 'double' | 'split';
export type Phase = 'betting' | 'playing' | 'settled';

export interface PlayerHand {
  cards: number[];
  bet: number;
  done: boolean;
  split: boolean;
}

export interface HistoryEntry {
  round: number;
  bankroll: number;
  profit: number;
}

export interface GameState {
  /** Cards are drawn from the end of the array with pop(). */
  shoe: number[];
  /** Undrawn cards, indexed by rank minus one, including all ten-valued cards. */
  counts: number[];
  playerHands: PlayerHand[];
  activeHand: number;
  dealer: number[];
  phase: Phase;
  bankroll: number;
  runningCount: number;
  round: number;
  message: string;
  rules: Rules;
  history: HistoryEntry[];
  seed: number;
  decks: number;
  /** Number of shoes generated, including the current shoe. */
  shoeNumber: number;
  /** Cash before any stakes in the current round were deducted. */
  roundStartBankroll: number;
}

const DEFAULT_RULES: Rules = {
  hitSoft17: false,
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
};

function clone(state: GameState): GameState {
  return {
    ...state,
    shoe: [...state.shoe],
    counts: [...state.counts],
    playerHands: state.playerHands.map(hand => ({ ...hand, cards: [...hand.cards] })),
    dealer: [...state.dealer],
    rules: { ...state.rules },
    history: state.history.map(entry => ({ ...entry })),
  };
}

/** Mutates only a freshly created state or a private clone. */
function shuffle(state: GameState): void {
  state.counts = freshCounts(state.decks);
  state.shoe = [];
  for (let rank = 1; rank <= 10; rank++) {
    for (let i = 0; i < state.counts[rank - 1]; i++) state.shoe.push(rank);
  }
  const random = seededRandom(((state.seed >>> 0) + state.shoeNumber) >>> 0);
  for (let i = state.shoe.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [state.shoe[i], state.shoe[j]] = [state.shoe[j], state.shoe[i]];
  }
  state.shoeNumber++;
  state.runningCount = 0;
}

/** Every draw is exposed: observed remaining counts are physical undrawn counts. */
function draw(state: GameState): number {
  const card = state.shoe.pop();
  if (card === undefined) throw new Error('Shoe exhausted; cards cannot be reshuffled during a hand.');
  if (!Number.isInteger(card) || card < 1 || card > 10 || state.counts[card - 1] <= 0) {
    throw new Error('Shoe and counts are inconsistent.');
  }
  state.counts[card - 1]--;
  state.runningCount += hiLo(card);
  return card;
}

function natural(cards: number[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

function settle(state: GameState): void {
  const dealerTotal = handValue(state.dealer).total;
  const dealerNatural = natural(state.dealer);
  const results: string[] = [];
  for (const hand of state.playerHands) {
    const total = handValue(hand.cards).total;
    const playerNatural = !hand.split && natural(hand.cards);
    let returned = 0;
    let result: string;
    if (total > 21) {
      result = 'Bust';
    } else if (dealerNatural) {
      returned = playerNatural ? hand.bet : 0;
      result = playerNatural ? 'Push' : 'Dealer blackjack';
    } else if (playerNatural) {
      returned = hand.bet * (1 + state.rules.blackjackPayout);
      result = 'Blackjack';
    } else if (dealerTotal > 21 || total > dealerTotal) {
      returned = hand.bet * 2;
      result = 'Win';
    } else if (total === dealerTotal) {
      returned = hand.bet;
      result = 'Push';
    } else {
      result = 'Loss';
    }
    state.bankroll += returned;
    hand.done = true;
    results.push(result);
  }
  state.phase = 'settled';
  state.activeHand = state.playerHands.length - 1;
  const profit = state.bankroll - state.roundStartBankroll;
  state.history.push({ round: state.round, bankroll: state.bankroll, profit });
  state.message = `${results.join(' / ')}. Round profit: ${profit >= 0 ? '+' : ''}${profit}.`;
}

function finishDealer(state: GameState): void {
  // A dealer need not draw when every player hand has already busted.
  if (state.playerHands.some(hand => handValue(hand.cards).total <= 21)) {
    state.dealer.push(draw(state));
    let value = handValue(state.dealer);
    while (value.total < 17 || (value.total === 17 && value.soft && state.rules.hitSoft17)) {
      state.dealer.push(draw(state));
      value = handValue(state.dealer);
    }
  }
  settle(state);
}

function advance(state: GameState): void {
  const next = state.playerHands.findIndex(hand => !hand.done);
  if (next === -1) {
    finishDealer(state);
  } else {
    state.activeHand = next;
    state.message = `Playing hand ${next + 1}.`;
  }
}

/** Creates a deterministic, shuffled finite shoe. Invalid arguments throw. */
export function createGame(
  seed = 42,
  decks = 6,
  bankroll = 1000,
  rules: Partial<Rules> = {},
): GameState {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Seed must be a safe integer.');
  if (!Number.isSafeInteger(decks) || decks < 1) throw new RangeError('Decks must be a positive integer.');
  if (!Number.isFinite(bankroll) || bankroll < 0) throw new RangeError('Bankroll must be finite and nonnegative.');
  const resolvedRules = { ...DEFAULT_RULES, ...rules };
  if (typeof resolvedRules.hitSoft17 !== 'boolean' || typeof resolvedRules.doubleAfterSplit !== 'boolean'
    || !Number.isFinite(resolvedRules.blackjackPayout) || resolvedRules.blackjackPayout < 0) {
    throw new RangeError('Rules must contain boolean flags and a finite, nonnegative blackjack payout.');
  }
  const state: GameState = {
    shoe: [], counts: [], playerHands: [], activeHand: 0, dealer: [], phase: 'betting',
    bankroll, runningCount: 0, round: 0, message: 'Place a bet.', rules: resolvedRules,
    history: [], seed, decks, shoeNumber: 0, roundStartBankroll: bankroll,
  };
  shuffle(state);
  return state;
}

/** Starts a round, taking its initial stake from cash. Deal order is player, dealer, player. */
export function deal(state: GameState, bet: number): GameState {
  if (state.phase === 'playing') throw new Error('Finish the current round before dealing.');
  if (!Number.isFinite(bet) || bet <= 0 || bet > state.bankroll) {
    throw new RangeError('Bet must be positive, finite, and no greater than available cash.');
  }
  const next = clone(state);
  if (next.shoe.length < next.decks * 52 * 0.25) shuffle(next);
  next.roundStartBankroll = next.bankroll;
  next.bankroll -= bet;
  next.round++;
  next.phase = 'playing';
  next.activeHand = 0;
  next.dealer = [];
  next.playerHands = [{ cards: [], bet, done: false, split: false }];
  const hand = next.playerHands[0];
  hand.cards.push(draw(next));
  next.dealer.push(draw(next));
  hand.cards.push(draw(next));
  next.message = 'Playing hand 1.';
  if (natural(hand.cards)) {
    // ENHC: a player natural reveals the dealer's second card immediately.
    next.dealer.push(draw(next));
    settle(next);
  }
  return next;
}

/** Actions available for the active hand. Dealing and shoe changes are separate operations. */
export function legalActions(state: GameState): string[] {
  if (state.phase !== 'playing') return [];
  const hand = state.playerHands[state.activeHand];
  if (!hand || hand.done || handValue(hand.cards).total >= 21) return [];
  const actions: Action[] = ['hit', 'stand'];
  if (hand.cards.length === 2 && state.bankroll >= hand.bet) {
    if (!hand.split || state.rules.doubleAfterSplit) actions.push('double');
    if (state.playerHands.length === 1 && !hand.split && hand.cards[0] === hand.cards[1]) actions.push('split');
  }
  return actions;
}

/** Applies one legal player action. Invalid actions throw without altering the input. */
export function act(state: GameState, action: Action): GameState {
  if (!legalActions(state).includes(action)) throw new Error(`Illegal action: ${action}.`);
  const next = clone(state);
  const hand = next.playerHands[next.activeHand];
  switch (action) {
    case 'hit':
      hand.cards.push(draw(next));
      hand.done = handValue(hand.cards).total >= 21;
      break;
    case 'stand':
      hand.done = true;
      break;
    case 'double':
      next.bankroll -= hand.bet;
      hand.bet *= 2;
      hand.cards.push(draw(next));
      hand.done = true;
      break;
    case 'split': {
      next.bankroll -= hand.bet;
      const aces = hand.cards[0] === 1;
      next.playerHands = hand.cards.map(card => {
        const cards = [card, draw(next)];
        return { cards, bet: hand.bet, split: true, done: aces || handValue(cards).total === 21 };
      });
      break;
    }
  }
  advance(next);
  return next;
}

/** Replaces the shoe only between rounds, retaining cash, rules, round number, and history. */
export function newShoe(state: GameState): GameState {
  if (state.phase === 'playing') throw new Error('Cannot replace a shoe during a round.');
  const next = clone(state);
  shuffle(next);
  next.playerHands = [];
  next.dealer = [];
  next.activeHand = 0;
  next.phase = 'betting';
  next.roundStartBankroll = next.bankroll;
  next.message = 'New shoe. Place a bet.';
  return next;
}
