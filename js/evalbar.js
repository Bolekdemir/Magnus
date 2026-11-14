// Paints an evaluation bar from an engine result for a position.
// The bar reads --wp (White's share, 0..1). CSS decides if it's vertical (desktop)
// or horizontal (phones); data-lead tells it which end the number sits on.
import { Chess } from '../vendor/chess.js?v=713fc9da38';
import { winPct, scoreToCp, fmtScore } from './explain.js?v=713fc9da38';

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
  bar.style.setProperty('--wp', Math.max(0.03, Math.min(0.97, whiteWp / 100)).toFixed(4));
  bar.dataset.lead = whiteWp >= 50 ? 'white' : 'black';
  bar.querySelector('.evalbar-n').textContent = txt;
}

export function resetEval(bar) {
  if (!bar) return;
  bar.style.setProperty('--wp', '0.5');
  bar.dataset.lead = 'white';
  bar.querySelector('.evalbar-n').textContent = '';
}
