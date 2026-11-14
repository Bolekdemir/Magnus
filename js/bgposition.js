// A random chess position drawn onto the background grid's own squares.
// Each load plays a plausible random opening, then lays the pieces out on the grid,
// centered near the top, where the grid's fade is strongest.
import { Chess } from '../vendor/chess.js?v=ad9937f2d8';


function randomPosition() {
  const c = new Chess();
  const plies = 16 + Math.floor(Math.random() * 17);
  for (let i = 0; i < plies; i++) {
    const moves = c.moves({ verbose: true });
    if (!moves.length) break;
    const weights = moves.map((m) => {
      const backRank = m.color === 'w' ? '1' : '8';
      if (m.flags.includes('k') || m.flags.includes('q')) return 6;           // castling
      if ('nb'.includes(m.piece) && m.from[1] === backRank) return 4;         // development
      if (m.piece === 'p' && 'cdef'.includes(m.from[0])) return 3;            // center pawns
      if (m.captured) return 2;
      if (m.piece === 'q' || m.piece === 'k') return 0.3;                     // keep it sensible
      return 1;
    });
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = moves[0];
    for (let k = 0; k < moves.length; k++) { x -= weights[k]; if (x <= 0) { pick = moves[k]; break; } }
    c.move(pick);
    if (c.isGameOver()) { c.undo(); break; }
  }
  return c;
}

export function drawBackgroundPosition(el) {
  if (!el) return;
  const bg = el.parentElement;
  const positions = new Map(); // board index -> position, kept stable across resizes
  const positionFor = (k) => { if (!positions.has(k)) positions.set(k, randomPosition()); return positions.get(k); };
  const place = () => {
    // fit one 8x8 board between the header and the bottom of the screen, centered
    const head = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 60;
    const sq = Math.floor(Math.min(window.innerWidth, window.innerHeight - head) / 8);
    const left = Math.round((window.innerWidth - sq * 8) / 2);
    const top = Math.round(head);
    // the grid lines up with the boards, so they continue as the background pattern
    bg.style.setProperty('--sq', sq + 'px');
    bg.style.setProperty('--gx', left + 'px');
    bg.style.setProperty('--gy', top + 'px');
    // on wide screens, more boards sit edge to edge so the whole width is filled
    const side = Math.max(0, Math.ceil(left / (sq * 8)));
    let html = '';
    for (let k = -side; k <= side; k++) {
      const x0 = left + k * sq * 8;
      positionFor(k).board().forEach((row, r) => row.forEach((p, f) => {
        if (!p) return;
        const x = x0 + f * sq;
        if (x + sq < 0 || x > window.innerWidth) return;
        html += `<span class="bg-pc pc-${p.color}${p.type.toUpperCase()}" style="left:${x}px;top:${top + r * sq}px"></span>`;
      }));
    }
    el.innerHTML = html;
  };
  place();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(place, 150); });
}
