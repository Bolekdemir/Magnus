// Runs move explanations off the main thread so animations never stutter.
import { explainMove } from './explain.js?v=4ff97de7db';

self.onmessage = (e) => {
  const { id, ctx } = e.data;
  try {
    self.postMessage({ id, card: explainMove(ctx) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
