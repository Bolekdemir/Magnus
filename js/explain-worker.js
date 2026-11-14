// Runs move explanations off the main thread so animations never stutter.
import { explainMove } from './explain.js?v=1a68508788';

self.onmessage = (e) => {
  const { id, ctx } = e.data;
  try {
    self.postMessage({ id, card: explainMove(ctx) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
