// Mistake profile: which kinds of mistakes you make most, across reviewed games.
import { store } from './store.js?v=713fc9da38';
import { CAUSE_LABEL, HABITS } from './explain.js?v=713fc9da38';

const KEY = 'magnus.profile';

export function getProfile() {
  return store.get(KEY, { games: {}, causes: {} });
}

export function recordGame(id, causes, accuracy) {
  const p = getProfile();
  if (p.games[id]) return; // already counted this game
  p.games[id] = { at: Date.now(), accuracy, mistakes: causes.length };
  for (const c of causes) p.causes[c] = (p.causes[c] || 0) + 1;
  store.set(KEY, p);
}

export function topPatterns(n = 4) {
  const p = getProfile();
  const total = Object.values(p.causes).reduce((s, x) => s + x, 0);
  const list = Object.entries(p.causes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([cause, count]) => ({ cause, count, label: CAUSE_LABEL[cause] || cause, share: total ? count / total : 0, habit: HABITS[cause] }));
  return { list, total, games: Object.keys(p.games).length };
}
