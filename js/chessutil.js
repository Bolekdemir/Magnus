// Chess logic helpers: material, exchanges, threats, tactical patterns, structure.
// Everything here is deterministic and works on chess.js positions.
import { Chess } from '../vendor/chess.js?v=ea1982871d';

export { Chess };

export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

export const sqName = (f, r) => FILES[f] + (r + 1);
export const fileOf = (sq) => sq.charCodeAt(0) - 97;
export const rankOf = (sq) => +sq[1] - 1;
export const other = (c) => (c === 'w' ? 'b' : 'w');
export const colorName = (c) => (c === 'w' ? 'White' : 'Black');

export function pieceAt(chess, sq) {
  return chess.get(sq) || null;
}

export function material(chess) {
  const m = { w: 0, b: 0 };
  for (const row of chess.board()) for (const p of row) if (p) m[p.color] += VAL[p.type];
  return m;
}

// Material balance from one color's point of view.
export function balance(chess, color) {
  const m = material(chess);
  return m[color] - m[other(color)];
}

export function pieces(chess, color) {
  const out = [];
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push(p);
  return out;
}

// Same position, other side to move. Returns null when that would be illegal
// (side to move is in check, so passing is impossible).
export function flipped(chess) {
  if (chess.inCheck()) return null;
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const c = new Chess(parts.join(' '));
    return c;
  } catch {
    return null;
  }
}

// Static exchange on a square, for the side to move.
// Returns the material the side to move can win by starting captures there (>= 0).
// Uses real legal moves, so pins and x-rays are handled naturally.
export function seeOn(chess, sq, depth = 0) {
  if (depth > 12) return 0;
  const target = chess.get(sq);
  if (!target) return 0;
  const caps = chess.moves({ verbose: true }).filter((m) => m.to === sq && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => (a.piece === 'k' ? 99 : VAL[a.piece]) - (b.piece === 'k' ? 99 : VAL[b.piece]));
  const m = caps[0];
  const victim = VAL[target.type];
  chess.move(m);
  const reply = seeOn(chess, sq, depth + 1);
  chess.undo();
  return Math.max(0, victim - reply);
}

// Pieces of `color` that the opponent can win material from right now
// (assuming the opponent is to move). Returns [{sq, piece, gain}].
export function loosePieces(chess, color) {
  let pos = chess;
  if (chess.turn() === color) {
    pos = flipped(chess);
    if (!pos) return [];
  }
  const out = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const gain = seeOn(pos, p.square);
      if (gain > 0) out.push({ sq: p.square, piece: p.type, gain });
    }
  }
  out.sort((a, b) => b.gain - a.gain);
  return out;
}

// Is the piece on sq defended by its own side at all?
export function isDefended(chess, sq) {
  const p = chess.get(sq);
  if (!p) return false;
  return chess.attackers(sq, p.color).length > 0;
}

// Moves that give checkmate for the side to move.
export function mateInOne(chess) {
  const out = [];
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    if (chess.isCheckmate()) out.push(m);
    chess.undo();
  }
  return out;
}

// What would `color` threaten if it were their turn again?
// {mate: [moves], wins: [{sq, piece, gain}]}
export function threatsBy(chess, color) {
  let pos = chess;
  if (chess.turn() !== color) {
    pos = flipped(chess);
    if (!pos) return { mate: [], wins: [] };
  }
  const mate = mateInOne(pos);
  const wins = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color === color || p.type === 'k') continue;
      const gain = seeOn(pos, p.square);
      if (gain > 0) wins.push({ sq: p.square, piece: p.type, gain });
    }
  }
  wins.sort((a, b) => b.gain - a.gain);
  return { mate, wins };
}

// Squares a single piece attacks (pseudo-legal, ignores pins), computed geometrically.
export function attacksFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p) return [];
  const f = fileOf(sq), r = rankOf(sq);
  const out = [];
  const add = (ff, rr) => { if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) out.push(sqName(ff, rr)); };
  const ray = (df, dr) => {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
      const s = sqName(ff, rr);
      out.push(s);
      if (chess.get(s)) break;
      ff += df; rr += dr;
    }
  };
  switch (p.type) {
    case 'p': { const d = p.color === 'w' ? 1 : -1; add(f - 1, r + d); add(f + 1, r + d); break; }
    case 'n': for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(f + a, r + b); break;
    case 'k': for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) add(f + a, r + b); break;
    case 'b': ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); break;
    case 'r': ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break;
    case 'q': ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break;
  }
  return out;
}

// Fork: the piece on sq attacks two or more enemy targets that are each "worth hitting"
// (the king, something more valuable than the attacker, or something undefended).
export function forkFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p) return null;
  const targets = [];
  for (const s of attacksFrom(chess, sq)) {
    const t = chess.get(s);
    if (!t || t.color === p.color) continue;
    if (t.type === 'k') targets.push({ sq: s, piece: 'k' });
    else if (VAL[t.type] > VAL[p.type] || !isDefended(chess, s)) {
      if (t.type === 'p' && p.type !== 'p') continue; // pawn targets rarely make a real fork
      targets.push({ sq: s, piece: t.type });
    }
  }
  return targets.length >= 2 ? targets : null;
}

// Pin / skewer created by a slider on sq. Returns {kind, front, back} or null.
export function lineTacticFrom(chess, sq) {
  const p = chess.get(sq);
  if (!p || !'brq'.includes(p.type)) return null;
  const dirs = [];
  if (p.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  if (p.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  let best = null;
  for (const [df, dr] of dirs) {
    let f = fileOf(sq) + df, r = rankOf(sq) + dr;
    let front = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const s = sqName(f, r);
      const t = chess.get(s);
      if (t) {
        if (t.color === p.color) break;
        if (!front) front = { sq: s, piece: t.type };
        else {
          const back = { sq: s, piece: t.type };
          const fv = front.piece === 'k' ? 100 : VAL[front.piece];
          const bv = back.piece === 'k' ? 100 : VAL[back.piece];
          let res = null;
          if (bv > fv && bv > VAL[p.type] && front.piece !== 'p') res = { kind: 'pin', front, back };
          else if (fv > bv && fv > VAL[p.type] && back.piece !== 'p' && front.piece !== 'p') res = { kind: 'skewer', front, back };
          if (res && (!best || bv + fv > best.score)) best = { ...res, score: bv + fv };
          break;
        }
      }
      f += df; r += dr;
    }
  }
  return best;
}

// Enemy pieces newly attacked by `color`'s sliders (other than the moved piece) after a move.
export function discoveredAfter(before, after, move) {
  const color = move.color;
  const out = [];
  for (const row of after.board()) {
    for (const p of row) {
      if (!p || p.color !== color || !'brq'.includes(p.type) || p.square === move.to) continue;
      const prev = before.get(p.square);
      if (!prev || prev.type !== p.type || prev.color !== p.color) continue; // e.g. the rook that just castled
      const nowHits = attacksFrom(after, p.square);
      const wasHits = new Set(before.get(p.square) ? attacksFrom(before, p.square) : []);
      for (const s of nowHits) {
        if (wasHits.has(s)) continue;
        const t = after.get(s);
        if (t && t.color !== color && (t.type === 'k' || VAL[t.type] >= 3)) out.push({ from: p.square, sq: s, piece: t.type });
      }
    }
  }
  return out;
}

// ---------- Structure / long-term features ----------

export function pawnInfo(chess, color) {
  const files = Array.from({ length: 8 }, () => []);
  const enemy = Array.from({ length: 8 }, () => []);
  for (const row of chess.board()) for (const p of row) {
    if (!p || p.type !== 'p') continue;
    (p.color === color ? files : enemy)[fileOf(p.square)].push(rankOf(p.square));
  }
  let doubled = 0, isolated = 0, passed = 0, islands = 0;
  const passedSquares = [];
  let inIsland = false;
  for (let f = 0; f < 8; f++) {
    if (files[f].length) { if (!inIsland) islands++; inIsland = true; } else inIsland = false;
    if (files[f].length > 1) doubled += files[f].length - 1;
    const neighbours = (files[f - 1] || []).length + (files[f + 1] || []).length;
    if (files[f].length && !neighbours) isolated += files[f].length;
    for (const r of files[f]) {
      const ahead = (rr) => (color === 'w' ? rr > r : rr < r);
      let blocked = false;
      for (const ff of [f - 1, f, f + 1]) if (ff >= 0 && ff < 8 && enemy[ff].some(ahead)) blocked = true;
      if (!blocked) { passed++; passedSquares.push(sqName(f, r)); }
    }
  }
  return { doubled, isolated, passed, islands, passedSquares };
}

const HOME_MINORS = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] };

export function features(chess, color) {
  const king = pieces(chess, color).find((p) => p.type === 'k');
  const kf = king ? fileOf(king.square) : 4;
  const kr = king ? rankOf(king.square) : 0;
  let shield = 0;
  const dir = color === 'w' ? 1 : -1;
  for (let f = kf - 1; f <= kf + 1; f++) for (const d of [1, 2]) {
    if (f < 0 || f > 7) continue;
    const rr = kr + d * dir;
    if (rr < 0 || rr > 7) continue;
    const p = chess.get(sqName(f, rr));
    if (p && p.type === 'p' && p.color === color) shield++;
  }
  const homeRank = color === 'w' ? 0 : 7;
  const castled = king && kr === homeRank && (kf >= 6 || kf <= 2);
  let undeveloped = 0;
  for (const s of HOME_MINORS[color]) {
    const p = chess.get(s);
    if (p && p.color === color && (p.type === 'n' || p.type === 'b')) undeveloped++;
  }
  let center = 0;
  for (const s of ['d4', 'e4', 'd5', 'e5']) {
    center += chess.attackers(s, color).length;
    const p = chess.get(s);
    if (p && p.color === color) center += 1;
  }
  const bishops = pieces(chess, color).filter((p) => p.type === 'b').length;
  // mobility: count legal moves as if it were this side's turn
  let mobility = 0;
  const pos = chess.turn() === color ? chess : flipped(chess);
  if (pos) mobility = pos.moves().length;
  const castleRights = chess.getCastlingRights ? chess.getCastlingRights(color) : null;
  return {
    shield, castled, undeveloped, center, bishopPair: bishops >= 2, mobility,
    canCastle: castleRights ? castleRights.k || castleRights.q : null,
    pawns: pawnInfo(chess, color),
    kingSq: king ? king.square : null,
  };
}

// Plays a list of UCI moves on a copy of `fen`. Stops at the first illegal move.
export function playUci(fen, ucis, max = 99) {
  const c = new Chess(fen);
  const moves = [];
  for (const u of ucis.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
      moves.push(m);
    } catch {
      break;
    }
  }
  return { chess: c, moves };
}

export function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }).san;
  } catch {
    return uci;
  }
}

export const moveUci = (m) => m.from + m.to + (m.promotion || '');
