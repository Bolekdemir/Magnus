// Chess terms, introduced gradually.
// Text markers look like [[key|plain phrase|pro phrase]] or [[key|phrase]].
// New players see the plain phrase with the term attached; once a term has been
// seen enough times, the pro phrase takes over. Tapping a term explains it.
import { store } from './store.js?v=9c8568e0e8';

export const TERMS = {
  hanging: { term: 'hanging', def: 'A piece is hanging when the opponent can capture it and you can\'t win anything back. Free material.' },
  fork: { term: 'fork', def: 'One piece attacks two or more enemy pieces at once. The opponent can usually save only one.' },
  pin: { term: 'pin', def: 'A piece can\'t move (or shouldn\'t) because a more valuable piece, often the king, sits behind it on the same line.' },
  skewer: { term: 'skewer', def: 'Like a pin in reverse: a valuable piece is attacked, and when it moves away, the piece behind it is lost.' },
  discovered: { term: 'discovered attack', def: 'Moving one piece out of the way reveals an attack from a piece behind it. Two threats in one move.' },
  development: { term: 'development', def: 'Getting knights and bishops off the back rank and into play. Early on, the side with more pieces out usually has the upper hand.' },
  center: { term: 'the center', def: 'The squares d4, e4, d5 and e5. Pieces placed or aimed there reach more of the board.' },
  castling: { term: 'castling', def: 'A special move: king two squares toward a rook, rook jumps over. It hides the king and activates the rook in one turn.' },
  kingsafety: { term: 'king safety', def: 'How hard it is to attack your king. Pawns in front of a castled king act as a shield.' },
  tempo: { term: 'tempo', def: 'A unit of time: one move. Wasting moves (moving the same piece repeatedly, getting chased) gives the opponent free tempi.' },
  exchange: { term: 'exchange', def: 'A series of captures on the same square. Count attackers and defenders to see who comes out ahead.' },
  threat: { term: 'threat', def: 'Something you\'ll do next move if your opponent doesn\'t stop it, like winning a piece or giving mate.' },
  sacrifice: { term: 'sacrifice', def: 'Giving up material on purpose for something better: an attack, time, or a bigger win later.' },
  doubled: { term: 'doubled pawns', def: 'Two pawns of the same color on one file. They can\'t protect each other and block each other.' },
  isolated: { term: 'isolated pawn', def: 'A pawn with no friendly pawns on the files next to it. Only pieces can defend it.' },
  passed: { term: 'passed pawn', def: 'A pawn with no enemy pawns in front of it or on neighbouring files. Nothing but pieces can stop it from promoting.' },
  bishoppair: { term: 'bishop pair', def: 'Having both bishops while your opponent doesn\'t. Together they cover both square colors and shine in open positions.' },
};

const SEEN_KEY = 'whymove.termsSeen';
const PRO_AFTER = 8;
let seen = store.get(SEEN_KEY, {});
let dirty = false;

function bump(key) {
  seen[key] = (seen[key] || 0) + 1;
  if (!dirty) {
    dirty = true;
    setTimeout(() => { store.set(SEEN_KEY, seen); dirty = false; }, 500);
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Render a marked-up string to HTML.
export function renderText(str) {
  return esc(str).replace(/\[\[([a-z]+)\|([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, key, plain, pro) => {
    const t = TERMS[key];
    if (!t) return plain;
    bump(key);
    const isPro = (seen[key] || 0) > PRO_AFTER && pro;
    if (isPro) return `<button type="button" class="term" data-term="${key}">${pro}</button>`;
    const sameWord = plain.toLowerCase().slice(0, 4) === t.term.toLowerCase().slice(0, 4);
    if (sameWord) return `<button type="button" class="term" data-term="${key}">${plain}</button>`;
    return `${plain} <button type="button" class="term term--chip" data-term="${key}">${t.term}</button>`;
  });
}

// Strip markers for plain contexts (aria labels, toasts).
export function plainText(str) {
  return str.replace(/\[\[([a-z]+)\|([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, k, plain) => plain);
}

export function termInfo(key) {
  return TERMS[key];
}
