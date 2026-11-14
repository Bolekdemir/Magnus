// Paints an evaluation bar from an engine result for a position.
import { Chess } from '../vendor/chess.js';
import { winPct, scoreToCp, fmtScore } from './explain.js';

export function paintEval(bar, fen, analysis, flipped) {
  if (!bar) return;
  const pos = new Chess(fen);
  let whiteWp, txt;
  if (pos.isCheckmate()) { whiteWp = pos.turn() === 'w' ? 0 : 100; txt = '#'; }
  else if (pos.isGameOver()) { whiteWp = 50; txt = '½'; }
  else if (analysis?.lines?.[0]) {
    const pov = pos.turn() === 'w' ? 1 : -1;
    whiteWp = winPct(scoreToCp(analysis.lines[0].score) * pov);
    txt = fmtScore(analysis.lines[0].score, pov).replace(/^[+-]/, '');
  } else return;
  bar.classList.toggle('flip', !!flipped);
  bar.querySelector('.evalbar-w').style.transform = `scaleY(${Math.max(0.03, Math.min(0.97, whiteWp / 100))})`;
  const n = bar.querySelector('.evalbar-n');
  n.textContent = txt;
  const whiteAhead = whiteWp >= 50;
  const atBottom = whiteAhead !== !!flipped;
  n.style.top = atBottom ? 'auto' : '5px';
  n.style.bottom = atBottom ? '5px' : 'auto';
  n.style.color = whiteAhead ? '#243031' : '#F7F1E4';
}
