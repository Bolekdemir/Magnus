// explainAsync(ctx): explanation from a background worker, with a main-thread fallback.
import { explainMove } from './explain.js?v=5191e09630';

let worker = null;
let broken = false;
let seq = 0;
const pending = new Map();

function fallbackAll() {
  broken = true;
  for (const [id, p] of pending) {
    pending.delete(id);
    try { p.resolve(explainMove(p.ctx)); } catch (err) { p.reject(err); }
  }
}

function getWorker() {
  if (broken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./explain-worker.js?v=5191e09630', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.error) {
          try { p.resolve(explainMove(p.ctx)); } catch (err) { p.reject(err); }
        } else p.resolve(e.data.card);
      };
      worker.onerror = (e) => { e.preventDefault?.(); fallbackAll(); };
    } catch {
      broken = true;
      return null;
    }
  }
  return worker;
}

export function explainAsync(ctx) {
  const w = getWorker();
  if (!w) return new Promise((resolve, reject) => setTimeout(() => { try { resolve(explainMove(ctx)); } catch (err) { reject(err); } }, 0));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, ctx });
    w.postMessage({ id, ctx });
  });
}
