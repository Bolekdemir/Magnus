// Chessboard view: animated pieces, drag + click moves, arrows, square marks.
import { Chess } from '../vendor/chess.js?v=9c8568e0e8';
import { spring, canMove, canFade, EASE_OUT } from './anim.js?v=9c8568e0e8';
import { icon } from './icons.js?v=9c8568e0e8';

// Move-quality badge glyphs and tones (shown on the destination square).
export const BADGE = {
  magnus: ['M', 'magnus'], brilliant: ['!!', 'brilliant'], miss: ['✕', 'mistake'],
  great: ['!', 'great'], best: ['★', 'best'], excellent: ['✓', 'good'], good: ['✓', 'good'], forced: ['•', 'good'],
  inaccuracy: ['?!', 'inacc'], mistake: ['?', 'mistake'], blunder: ['??', 'blunder'],
};

const FILES = 'abcdefgh';

export class Board {
  constructor(root, { orientation = 'w', coords = true } = {}) {
    this.root = root;
    this.orientation = orientation;
    this.pieces = []; // {el, sq, code}
    this.interactive = null;
    this.selected = null;
    this.marks = {};
    root.classList.add('board');
    root.innerHTML = `<div class="b-sqs"></div><div class="b-pcs"></div><svg class="b-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div class="b-badges"></div><div class="b-pop" hidden></div>`;
    this.badgeLayer = root.querySelector('.b-badges');
    this.sqLayer = root.querySelector('.b-sqs');
    this.pcLayer = root.querySelector('.b-pcs');
    this.svg = root.querySelector('.b-arrows');
    this.popEl = root.querySelector('.b-pop');
    this.coords = coords;
    this._buildSquares();
    root.addEventListener('pointerdown', (e) => this._down(e));
    root.setAttribute('role', 'img');
  }

  // ----- geometry -----
  _cell(sq) {
    const f = FILES.indexOf(sq[0]);
    const r = +sq[1] - 1;
    return this.orientation === 'w' ? { col: f, row: 7 - r } : { col: 7 - f, row: r };
  }
  _sqAt(clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const f = this.orientation === 'w' ? col : 7 - col;
    const r = this.orientation === 'w' ? 7 - row : row;
    return FILES[f] + (r + 1);
  }
  _place(el, sq) {
    const { col, row } = this._cell(sq);
    el.style.translate = `${col * 100}% ${row * 100}%`;
  }

  _buildSquares() {
    this.sqLayer.innerHTML = '';
    this.sqEls = {};
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const f = this.orientation === 'w' ? col : 7 - col;
        const r = this.orientation === 'w' ? 7 - row : row;
        const sq = FILES[f] + (r + 1);
        const d = document.createElement('div');
        d.className = 'sq ' + ((f + r) % 2 ? 'sq-l' : 'sq-d');
        d.dataset.sq = sq;
        d.style.setProperty('--c', col);
        d.style.setProperty('--r', row);
        if (this.coords) {
          if (row === 7) d.insertAdjacentHTML('beforeend', `<span class="co co-f">${FILES[f]}</span>`);
          if (col === 0) d.insertAdjacentHTML('beforeend', `<span class="co co-r">${r + 1}</span>`);
        }
        this.sqLayer.appendChild(d);
        this.sqEls[sq] = d;
      }
    }
    this._applyMarks();
  }

  setOrientation(c) {
    if (c === this.orientation) return;
    this.orientation = c;
    this._buildSquares();
    for (const p of this.pieces) { this._noAnim(p.el); this._place(p.el, p.sq); }
    this._drawArrows(this.arrows || [], false);
    if (this.badge) this.setBadge(this.badge.sq, this.badge.cls, { animate: false });
  }

  _noAnim(el) {
    el.classList.add('pc-still');
    // force style flush so the next transform change is instant
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.remove('pc-still'));
  }

  // ----- position -----
  setPosition(fen, { animate = true } = {}) {
    this.fen = fen;
    const chess = new Chess(fen);
    const next = [];
    for (const row of chess.board()) for (const p of row) if (p) next.push({ sq: p.square, code: p.color + p.type.toUpperCase() });
    const anim = animate && canMove();
    const old = this.pieces.slice();
    const kept = [];
    const used = new Set();
    const pending = [];
    // 1. same square, same piece
    for (const n of next) {
      const i = old.findIndex((o, k) => !used.has(k) && o.sq === n.sq && o.code === n.code);
      if (i >= 0) { used.add(i); kept.push(old[i]); } else pending.push(n);
    }
    // 2. same piece type, nearest leftover: these slide
    const create = [];
    for (const n of pending) {
      let bi = -1, bd = 99;
      old.forEach((o, k) => {
        if (used.has(k) || o.code !== n.code) return;
        const a = this._cell(o.sq), b = this._cell(n.sq);
        const d = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        if (d < bd) { bd = d; bi = k; }
      });
      if (bi >= 0) {
        used.add(bi);
        const p = old[bi];
        p.sq = n.sq;
        if (anim) {
          p.el.style.zIndex = 3;
          const done = (ev) => {
            if (ev.propertyName !== 'translate') return;
            p.el.removeEventListener('transitionend', done);
            p.el.style.zIndex = '';
          };
          p.el.addEventListener('transitionend', done);
        } else this._noAnim(p.el);
        this._place(p.el, n.sq);
        kept.push(p);
      } else create.push(n);
    }
    // 3. leftovers disappear
    old.forEach((o, k) => {
      if (used.has(k)) return;
      if (animate && canFade()) {
        o.el.classList.add('pc-out');
        setTimeout(() => o.el.remove(), 220);
      } else o.el.remove();
    });
    // 4. new pieces appear
    for (const n of create) {
      const el = document.createElement('div');
      el.className = `pc pc-${n.code}`;
      el.classList.add('pc-still');
      this._place(el, n.sq);
      this.pcLayer.appendChild(el);
      if (animate && canFade() && old.length) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE_OUT });
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('pc-still')));
      kept.push({ el, sq: n.sq, code: n.code });
    }
    this.pieces = kept;
    this.selected = null;
    this.marks.select = null;
    this.marks.dests = null;
    const turn = chess.turn();
    this.marks.check = chess.inCheck() ? chess.board().flat().find((p) => p && p.type === 'k' && p.color === turn)?.square : null;
    this._applyMarks();
    this.root.setAttribute('aria-label', 'Chess position ' + fen);
  }

  // ----- marks -----
  setMarks(m) {
    Object.assign(this.marks, m);
    this._applyMarks();
  }
  _applyMarks() {
    if (!this.sqEls) return;
    const m = this.marks;
    const origin = m.select ? this._cell(m.select) : null;
    for (const [sq, el] of Object.entries(this.sqEls)) {
      if (origin && m.dests && m.dests.includes(sq)) {
        const c = this._cell(sq);
        const dist = Math.max(Math.abs(c.col - origin.col), Math.abs(c.row - origin.row));
        el.style.setProperty('--dd', Math.min(140, (dist - 1) * 28) + 'ms');
      }
      el.classList.toggle('m-last', !!(m.last && m.last.includes(sq)));
      el.classList.toggle('m-sel', m.select === sq);
      el.classList.toggle('m-check', m.check === sq);
      const dest = m.dests && m.dests.includes(sq);
      el.classList.toggle('m-dest', !!dest && !this._pieceOn(sq));
      el.classList.toggle('m-cap', !!dest && !!this._pieceOn(sq));
      el.classList.toggle('m-good', m.good === sq);
      el.classList.toggle('m-bad', m.bad === sq);
    }
  }
  _pieceOn(sq) {
    return this.pieces.find((p) => p.sq === sq);
  }

  // ----- arrows -----
  setArrows(list, { animate = true } = {}) {
    const key = JSON.stringify(list);
    if (key === this._arrowKey) return;
    this._arrowKey = key;
    this.arrows = list;
    this._drawArrows(list, animate);
  }
  _drawArrows(list, animate) {
    const ns = 'http://www.w3.org/2000/svg';
    this.svg.innerHTML = '';
    for (const a of list) {
      const A = this._cell(a.from), B = this._cell(a.to);
      const x1 = A.col * 100 + 50, y1 = A.row * 100 + 50, x2 = B.col * 100 + 50, y2 = B.row * 100 + 50;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const head = 34;
      const sx = x1 + ux * 18, sy = y1 + uy * 18;
      const ex = x2 - ux * head, ey = y2 - uy * head;
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', `arrow arrow-${a.kind || 'best'}`);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', sx); line.setAttribute('y1', sy); line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      const px = -uy, py = ux;
      const tipX = x2 - ux * 8, tipY = y2 - uy * 8;
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', `${tipX},${tipY} ${ex + px * 24},${ey + py * 24} ${ex - px * 24},${ey - py * 24}`);
      g.append(line, poly);
      this.svg.appendChild(g);
      if (animate && canMove()) {
        const L = Math.hypot(ex - sx, ey - sy);
        line.style.strokeDasharray = L;
        line.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 260, easing: EASE_OUT });
        poly.animate([{ opacity: 0 }, { opacity: 0 , offset: 0.55 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT });
      } else if (animate && canFade()) {
        g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      }
    }
  }

  // ----- interaction -----
  // opts: {color, dests(sq) -> [sq], onMove(from, to) }
  setInteractive(opts) {
    this.interactive = opts;
    this.root.classList.toggle('is-live', !!opts);
    if (!opts) this._deselect();
  }
  _select(sq) {
    const dests = this.interactive.dests(sq);
    this.selected = sq;
    for (const p of this.pieces) p.el.classList.toggle('pc-lift', p.sq === sq);
    this.setMarks({ select: sq, dests });
  }
  _deselect() {
    this.selected = null;
    for (const p of this.pieces) p.el.classList.remove('pc-lift');
    this.setMarks({ select: null, dests: null });
  }

  _down(e) {
    if (!this.interactive || e.button > 0 || e.target.closest('.b-pop')) return;
    const sq = this._sqAt(e.clientX, e.clientY);
    if (!sq) return;
    const piece = this._pieceOn(sq);
    const mine = piece && piece.code[0] === this.interactive.color;
    // click-to-move onto a destination
    if (this.selected && this.selected !== sq && (this.marks.dests || []).includes(sq)) {
      const from = this.selected;
      this._deselect();
      this.interactive.onMove(from, sq);
      return;
    }
    if (!mine) { this._deselect(); return; }
    const dests = this.interactive.dests(sq);
    if (!dests.length) { this._deselect(); return; }
    e.preventDefault();
    const wasSelected = this.selected === sq;
    this._select(sq);
    this._startDrag(e, piece, wasSelected);
  }

  _startDrag(e, piece, wasSelected) {
    const el = piece.el;
    const rect = this.root.getBoundingClientRect();
    const size = rect.width / 8;
    const home = this._cell(piece.sq);
    const homeX = home.col * size, homeY = home.row * size;
    const grabX = e.clientX - rect.left - homeX;
    const grabY = e.clientY - rect.top - homeY;
    let dragging = false;
    let x = homeX, y = homeY;
    const target = this.root;
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      if (!dragging) {
        dragging = true;
        el.classList.add('pc-drag');
      }
      x = ev.clientX - rect.left - grabX;
      y = ev.clientY - rect.top - grabY;
      el.style.translate = `${x}px ${y}px`;
      const over = this._sqAt(ev.clientX, ev.clientY);
      this.setMarks({ hover: over });
      for (const [s, sqEl] of Object.entries(this.sqEls)) sqEl.classList.toggle('m-hover', s === over && (this.marks.dests || []).includes(s));
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      for (const sqEl of Object.values(this.sqEls)) sqEl.classList.remove('m-hover');
      if (!dragging) {
        if (wasSelected) this._deselect();
        return;
      }
      el.classList.remove('pc-drag');
      const to = this._sqAt(ev.clientX, ev.clientY);
      const from = piece.sq;
      if (to && to !== from && (this.marks.dests || []).includes(to)) {
        this._noAnim(el);
        this._place(el, to);
        piece.sq = to; // provisional: the next setPosition confirms it
        this._deselect();
        this.interactive.onMove(from, to);
      } else {
        // spring back home from where it was dropped
        const s = spring(0.85, 0.32);
        const fromT = `${x}px ${y}px`;
        this._noAnim(el);
        this._place(el, from);
        if (canMove()) el.animate([{ translate: fromT }, { translate: `${homeX}px ${homeY}px` }], { duration: s.duration, easing: s.easing });
        if (to === from) return; // dropped back: keep selection for click-to-move
        this._deselect();
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  // ----- move-quality badge -----
  setBadge(sq, cls, { animate = true, delay = 0 } = {}) {
    const g = BADGE[cls];
    this.badgeLayer.innerHTML = '';
    this.badge = sq && g ? { sq, cls } : null;
    if (!this.badge) return;
    const { col, row } = this._cell(sq);
    const cell = document.createElement('div');
    cell.className = 'b-badge-cell';
    cell.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
    const glyph = cls === 'magnus' ? icon('crown') : g[0];
    cell.innerHTML = `<span class="b-badge t-${g[1]}" title="${cls}">${glyph}</span>`;
    this.badgeLayer.appendChild(cell);
    const b = cell.firstElementChild;
    if (animate && canMove()) {
      const s = spring(0.55, 0.42);
      if (cls === 'magnus' || cls === 'brilliant') b.classList.add('b-badge-special');
      b.animate([{ transform: 'scale(0.2) rotate(-25deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: s.duration, easing: s.easing, delay, fill: 'backwards' });
    } else if (animate && canFade()) {
      b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay, fill: 'backwards' });
    }
  }
  clearBadge() { this.setBadge(null); }

  // Promotion chooser anchored to the target square. Resolves with 'q','r','b','n'.
  askPromotion(sq, color) {
    return new Promise((resolve) => {
      const { col, row } = this._cell(sq);
      const pop = this.popEl;
      const down = row === 0;
      pop.innerHTML = ['q', 'r', 'b', 'n'].map((p) => `<button type="button" class="pc-opt pc pc-${color}${p.toUpperCase()}" data-p="${p}" aria-label="Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]}"></button>`).join('');
      pop.style.left = `${col * 12.5}%`;
      pop.style.top = down ? `${row * 12.5}%` : `${(row - 3) * 12.5}%`;
      pop.style.transformOrigin = down ? 'top center' : 'bottom center';
      pop.classList.toggle('b-pop-up', !down);
      pop.hidden = false;
      if (canFade()) pop.animate([{ opacity: 0, transform: canMove() ? 'scale(0.94)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
      const pick = (e) => {
        const b = e.target.closest('[data-p]');
        if (!b) return;
        pop.hidden = true;
        pop.removeEventListener('click', pick);
        resolve(b.dataset.p);
      };
      pop.addEventListener('click', pick);
    });
  }
}
