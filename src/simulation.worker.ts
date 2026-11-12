import { experiment } from './simulation';
self.onmessage = (e: MessageEvent) => {
  try {
    self.postMessage({ result: experiment(e.data, (progress) => self.postMessage({ progress })) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
