import { analyze, analyzeExact } from './engine';
self.onmessage = (e: MessageEvent) => {
  try {
    const { cards, up, counts, rules, exact } = e.data;
    self.postMessage({ result: (exact ? analyzeExact : analyze)(cards, up, counts, rules) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
