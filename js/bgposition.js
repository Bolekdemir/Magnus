// A random chess position drawn onto the background grid's own squares.
// Each load plays a plausible random opening, then lays the pieces out on the grid,
// centered near the top, where the grid's fade is strongest.
import { Chess } from '../vendor/chess.js?v=382b44f93b';

const SQ = 36; // must match the background grid's square size (.bg-grid background-size / 2)

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
  const pos = randomPosition();
  const place = () => {
    const startCol = Math.max(0, Math.round(window.innerWidth / 2 / SQ) - 4);
    const startRow = 2;
    let html = '';
    pos.board().forEach((row, r) => row.forEach((p, f) => {
      if (!p) return;
      html += `<span class="bg-pc pc-${p.color}${p.type.toUpperCase()}" style="left:${(startCol + f) * SQ}px;top:${(startRow + r) * SQ}px"></span>`;
    }));
    el.innerHTML = html;
  };
  place();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(place, 150); });
}
