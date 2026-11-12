import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { analyze, analyzeExact, freshCounts } = await server.ssrLoadModule('/src/engine.ts');
  const rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };
  const scenarios = [
    { id: 'six-deck-16-v-10', cards: [10, 6], up: 10 },
    { id: 'six-deck-11-v-6', cards: [5, 6], up: 6 },
    { id: 'six-deck-soft18-v-9', cards: [1, 7], up: 9 },
    { id: 'six-deck-88-v-6', cards: [8, 8], up: 6 },
  ].map((s) => {
    const counts = freshCounts(6);
    for (const r of [...s.cards, s.up]) counts[r - 1]--;
    return { ...s, counts, rules, result: analyze(s.cards, s.up, counts, rules) };
  });
  const toy = { cards: [10, 6], up: 10, counts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 4], rules };
  const output = {
    description:
      'Reproducible engine values for the Turkish tutorial. EV in initial stake units. Exact and approximate models explicitly separated.',
    scenarios,
    toy: {
      ...toy,
      exact: analyzeExact(toy.cards, toy.up, toy.counts, rules),
      frozen: analyze(toy.cards, toy.up, toy.counts, rules),
    },
    naturalOneDeck: 2 * (4 / 52) * (16 / 51),
    naturalSixDeck: 2 * (24 / 312) * (96 / 311),
  };
  await writeFile('docs/tutorial-examples.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await server.close();
}
