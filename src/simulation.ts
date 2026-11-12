import { analyze, freshCounts, seededRandom, type Rules, type Action } from './engine';
import { createGame, deal, act, legalActions, newShoe } from './game';
export interface ExperimentConfig {
  rounds: number;
  seed: number;
  policy: 'flat' | 'hilo';
  rules: Rules;
}
/** Independent sessions, rather than hands, are the sampling units for uncertainty.
 * In ruin-stopped sessions the remaining scheduled rounds have zero profit.
 * The interval estimates profit per scheduled round for this finite-horizon policy.
 */
export function experiment(config: ExperimentConfig, progress?: (n: number) => void) {
  if (
    ![100, 1000, 5000].includes(config.rounds) ||
    !Number.isSafeInteger(config.seed) ||
    !['flat', 'hilo'].includes(config.policy)
  )
    throw new Error('Invalid experiment configuration.');
  const sessions = 20,
    startBankroll = 200,
    master = seededRandom(config.seed),
    means: number[] = [],
    trace: number[] = [startBankroll],
    sessionResults: {
      seed: number;
      completed: number;
      profit: number;
      endingBankroll: number;
      ruined: boolean;
    }[] = [];
  const cache = new Map<string, ReturnType<typeof analyze>>();
  let ruined = 0,
    played = 0,
    totalInitialWager = 0;
  for (let session = 0; session < sessions; session++) {
    const sessionSeed = Math.floor(master() * 4294967296);
    let game = createGame(sessionSeed, 6, startBankroll, config.rules);
    let completed = 0;
    for (let round = 0; round < config.rounds; round++) {
      if (game.bankroll < 1) break;
      // The cut card is applied BEFORE the counter chooses a bet.
      if (game.shoe.length < 78) game = newShoe(game);
      const tc = game.runningCount / (game.shoe.length / 52);
      const proposed = config.policy === 'flat' ? 1 : Math.min(8, Math.max(1, 2 * Math.floor(tc)));
      const wager = Math.min(proposed, Math.floor(game.bankroll));
      totalInitialWager += wager;
      game = deal(game, wager);
      while (game.phase === 'playing') {
        const hand = game.playerHands[game.activeHand];
        const allowed = legalActions(game);
        // This is a fresh-shoe policy baseline: exact current shoe is never used by the mover.
        const counts = freshCounts(6);
        for (const rank of [...hand.cards, game.dealer[0]]) counts[rank - 1]--;
        const key = `${hand.cards.join(',')}|${game.dealer[0]}|${hand.split}|${allowed.join(',')}`;
        let decision = cache.get(key);
        if (!decision) {
          decision = analyze(hand.cards, game.dealer[0], counts, config.rules, {
            split: hand.split,
            canDouble: allowed.includes('double'),
            canSplit: allowed.includes('split'),
          });
          cache.set(key, decision);
        }
        const action = Object.entries(decision.actions)
          .filter(([a]) => allowed.includes(a))
          .sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity))[0]?.[0] as Action | undefined;
        if (!action) throw new Error('No legal policy action for active state.');
        game = act(game, action);
      }
      completed++;
      played++;
      if (session === 0) trace.push(game.bankroll);
      // History is exported separately for the interactive game; do not clone O(n²) here.
      game.history = [];
    }
    if (game.bankroll < 1) ruined++;
    const profit = game.bankroll - startBankroll;
    means.push(profit / config.rounds);
    sessionResults.push({
      seed: sessionSeed,
      completed,
      profit,
      endingBankroll: game.bankroll,
      ruined: game.bankroll < 1,
    });
    progress?.((session + 1) / sessions);
  }
  const mean = means.reduce((a, b) => a + b, 0) / sessions;
  const variance = means.reduce((a, b) => a + (b - mean) ** 2, 0) / (sessions - 1),
    se = Math.sqrt(variance / sessions),
    margin = 2.093024054 * se;
  return {
    version: 1,
    config,
    sessions,
    startBankroll,
    playingPolicy: 'Fresh-shoe frozen-composition DP, best legal action; no count deviations',
    betPolicy:
      config.policy === 'flat'
        ? '1 unit'
        : 'min(8, max(1, 2 floor(true count))), capped by whole-unit available bankroll',
    mean,
    low: mean - margin,
    high: mean + margin,
    interval:
      'Approximate 95% Student t interval over independent session mean profits, df=19; per scheduled round including zero-profit rounds after ruin.',
    ruined,
    ruinRate: ruined / sessions,
    played,
    totalInitialWager,
    trace,
    sessionResults,
  };
}
