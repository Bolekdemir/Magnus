// Renders an explanation card (from explain.js) to HTML.
import { CLASSES, isBad, assess, TONE } from './explain.js?v=9c8568e0e8';
import { renderText } from './glossary.js?v=9c8568e0e8';
import { icon } from './icons.js?v=9c8568e0e8';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function badge(cls) {
  const c = CLASSES[cls] || CLASSES.good;
  const glyph = cls === 'magnus' ? icon('crown') : c.short;
  return `<span class="badge t-${c.tone}"><i>${glyph}</i>${c.label}</span>`;
}

function list(items, cls, title, ic) {
  if (!items || !items.length) return '';
  return `<div class="sec ${cls}"><h4>${ic ? icon(ic) : ''}${title}</h4><ul>${items.map((t) => `<li>${renderText(t)}</li>`).join('')}</ul></div>`;
}

export function steps(line) {
  if (!line || !line.steps.length) return '';
  return `<div class="line-steps">${line.steps
    .map((s) => `<span class="step ${s.mine ? 'mine' : 'theirs'}"><b>${esc(s.san)}</b>${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>`)
    .join('')}</div>`;
}

// opts: {moveLabel, evalText, actions: {punish, better, retry}}
export function renderCard(card, opts = {}) {
  const bad = isBad(card.cls);
  let html = `<div class="card-head">${badge(card.cls)}<span class="card-move">${esc(opts.moveLabel || card.san)}</span>${opts.evalText ? `<span class="card-eval">${esc(opts.evalText)}</span>` : ''}</div>`;

  if (card.special) {
    html += `<div class="special-box t-${(CLASSES[card.cls] || {}).tone || 'great'}">${icon(card.cls === 'magnus' ? 'crown' : card.cls === 'brilliant' ? 'lightning' : 'star')}<p>${renderText(card.special)}</p></div>`;
  }
  if (bad && card.why.length) {
    html += `<div class="why-box sec why"><h4>${icon('warn')}Why it doesn't work</h4><ul>${card.why.map((t) => `<li>${renderText(t)}</li>`).join('')}</ul></div>`;
  }
  if (card.better && (bad || card.cls === 'good' || card.cls === 'excellent')) {
    const title = bad ? 'What to play instead' : 'The engine\'s top choice';
    html += `<div class="better-box"><div class="sec gains"><h4>${icon('check')}${title}: <span class="san mono">${esc(card.better.san)}</span></h4><ul>${card.better.gains.slice(0, 3).map((t) => `<li>${renderText(t)}</li>`).join('')}</ul></div>${steps(card.better.line)}</div>`;
  }
  html += list(card.gains, 'gains', 'What this move does', null) || (card.cls !== 'forced' ? `<div class="sec gains"><h4>What this move does</h4><p class="empty-note">No direct threat or capture. It's a quiet move.</p></div>` : '');
  html += list(card.costs, 'costs', 'What it gives up', null);
  if (card.soon && card.soon.steps.length) {
    let tail = '';
    const who = card.pov === 'them' ? 'they' : 'you';
    if (card.soon.mate) tail = 'This line ends in checkmate.';
    else if (card.soon.net <= -1) tail = `In this line ${who} end up ${-card.soon.net} point${card.soon.net === -1 ? '' : 's'} down.`;
    else if (card.soon.net >= 1) tail = `In this line ${who} end up ${card.soon.net} point${card.soon.net === 1 ? '' : 's'} up.`;
    html += `<div class="sec"><h4>Next few moves (best play)</h4>${steps(card.soon)}${tail ? `<p class="empty-note">${tail}</p>` : ''}</div>`;
  }
  html += list(card.later, 'later', 'Long term', null);
  if (card.habit) html += `<div class="habit">${icon('target')}<div><b>Habit to build</b>${renderText(card.habit)}</div></div>`;
  const a = opts.actions || {};
  const btns = [];
  if (a.retry && bad) btns.push(`<button type="button" class="btn btn-primary btn-sm" data-act="retry">${icon('target')}Find a better move</button>`);
  if (a.punish && card.soon?.steps.length) btns.push(`<button type="button" class="btn btn-ghost btn-sm" data-act="punish">${icon('play')}${bad ? 'Show the punishment' : 'Play the line'}</button>`);
  if (a.better && card.better) btns.push(`<button type="button" class="btn btn-ghost btn-sm" data-act="better">${icon('eye')}Show ${esc(card.better.san)}</button>`);
  if (btns.length) html += `<div class="card-actions">${btns.join('')}</div>`;
  return html;
}

export { assess };
