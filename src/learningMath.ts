export function naturalProbability(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  return n < 2 ? 0 : (2 * counts[0] * counts[9]) / (n * (n - 1));
}
export function payoffMoments(win: number, push: number, winReturn: number) {
  if (win < 0 || push < 0 || win + push > 1 || winReturn < 0)
    throw new RangeError('Invalid toy probabilities');
  const loss = 1 - win - push;
  const mean = win * winReturn - loss;
  const variance = win * winReturn ** 2 + loss - mean ** 2;
  return { loss, mean, variance, sd: Math.sqrt(Math.max(0, variance)) };
}
/** Fully declared two-stage teaching MDP, not a blackjack state. */
export function bellmanToy(p: number) {
  if (p < 0 || p > 1) throw new RangeError('Probability must be in [0,1]');
  const left = Math.max(0.2, 0.5);
  const right = Math.max(-0.4, -0.8);
  const hit = p * left + (1 - p) * right;
  return {
    left,
    right,
    hit,
    stand: -0.1,
    best: hit > -0.1 ? 'hit' : 'stand',
    value: Math.max(hit, -0.1),
  };
}
/** Binary even-money independent toy only; not a blackjack betting optimizer. */
export function binaryLogGrowth(p: number, fraction: number) {
  if (p < 0 || p > 1 || fraction < 0 || fraction >= 1) throw new RangeError('Invalid binary model');
  return p * Math.log1p(fraction) + (1 - p) * Math.log1p(-fraction);
}
