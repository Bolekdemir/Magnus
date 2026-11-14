// App shell: routing, settings, home, chess.com import, glossary tooltips.
import { Board } from './board.js?v=1a68508788';
import { mountReview, SAMPLE_PGN } from './review.js?v=1a68508788';
import { mountPlay } from './play.js?v=1a68508788';
import { icon } from './icons.js?v=1a68508788';
import { store } from './store.js?v=1a68508788';
import { termInfo } from './glossary.js?v=1a68508788';
import { staggerIn, EASE_OUT, canFade, canMove, installSprings, spring, installJelly, movePill } from './anim.js?v=1a68508788';
import { topPatterns } from './profile.js?v=1a68508788';
import { hapticsEnabled, setHaptics, haptic } from './haptics.js?v=1a68508788';
import { drawBackgroundPosition } from './bgposition.js?v=1a68508788';
import { engine } from './engine.js?v=1a68508788';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const root = document.documentElement;

// ---------- settings ----------
const settings = { theme: 'system', motion: 'full', glass: 'on', ...store.get('magnus.settings', {}) };
function applySettings() {
  if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
  root.dataset.motion = settings.motion;
  root.dataset.glass = settings.glass;
  store.set('magnus.settings', settings);
  installSprings();
}
applySettings();
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', installSprings);

// ---------- segmented controls: a pill slides to the chosen option ----------
function syncSeg(seg, animate = true) {
  const btn = seg.querySelector('button[aria-pressed="true"]');
  let pill = seg.querySelector('.seg-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'seg-pill still';
    pill.setAttribute('aria-hidden', 'true');
    seg.prepend(pill);
    animate = false;
  }
  if (!btn || !btn.offsetWidth) { pill.style.opacity = btn ? pill.style.opacity : '0'; return; }
  pill.style.opacity = '1';
  movePill(pill, btn, animate);
}
installJelly();
// focus rings only when navigating by keyboard
window.addEventListener('keydown', (e) => { if (e.key === 'Tab') root.dataset.input = 'key'; }, true);
window.addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; }, true);

// nav: the same sliding pill under the current page
const navEl = document.querySelector('.nav');
const navPill = document.createElement('span');
navPill.className = 'nav-pill still';
navPill.setAttribute('aria-hidden', 'true');
navEl.prepend(navPill);
function syncNav(animate) {
  const cur = navEl.querySelector('a[aria-current="page"]');
  navPill.style.opacity = cur ? '1' : '0';
  if (cur) movePill(navPill, cur, animate && navPill.dataset.x !== undefined);
}
window.addEventListener('resize', () => syncNav(false));
function syncAllSegs(animate = false) { document.querySelectorAll('.seg').forEach((s) => syncSeg(s, animate)); }
new MutationObserver((muts) => {
  const touched = new Set();
  for (const m of muts) {
    if (m.type === 'attributes') { const seg = m.target.closest?.('.seg'); if (seg) touched.add(seg); }
    else if (m.addedNodes.length) setTimeout(() => syncAllSegs(false), 0);
  }
  touched.forEach((seg) => syncSeg(seg, true));
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
window.addEventListener('resize', () => syncAllSegs(false));

document.querySelector('.tb-actions').innerHTML = `
  <button class="icon-btn" id="theme-btn" aria-label="Switch light or dark">${icon('moon')}</button>
  <button class="icon-btn" id="set-btn" aria-label="Settings" aria-expanded="false">${icon('motion')}</button>
  <div class="menu" id="set-menu" hidden>
    <div><h4>Animations</h4><div class="seg" role="group" aria-label="Animations">
      <button type="button" data-motion="full">Full</button><button type="button" data-motion="reduced">Reduced</button><button type="button" data-motion="off">Off</button></div>
      <p>Reduced keeps fades but drops movement. Your system's reduce-motion setting is respected too.</p></div>
    <div><h4>Theme</h4><div class="seg" role="group" aria-label="Theme">
      <button type="button" data-theme-opt="system">Auto</button><button type="button" data-theme-opt="light">Light</button><button type="button" data-theme-opt="dark">Dark</button></div></div>
    <div><h4>Glass</h4><div class="seg" role="group" aria-label="Frosted glass">
      <button type="button" data-glass-opt="on">Frosted</button><button type="button" data-glass-opt="off">Solid</button></div></div>
    <div><h4>Vibration</h4><div class="seg" role="group" aria-label="Vibration">
      <button type="button" data-hap="on">On</button><button type="button" data-hap="off">Off</button></div>
      <div class="row" style="margin-top:8px"><button type="button" class="btn btn-ghost btn-sm" id="hap-test">Test it</button></div>
      <p>A short buzz on each move. Android vibrates; iPhones (iOS 18+) give a light tap on your own moves.</p></div>
  </div>`;
function paintSettings() {
  document.querySelectorAll('[data-motion]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.motion === settings.motion)));
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === settings.theme)));
  document.querySelectorAll('[data-glass-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.glassOpt === settings.glass)));
  document.querySelectorAll('[data-hap]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.hap === 'on') === hapticsEnabled())));
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.getElementById('theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
}
paintSettings();
// Theme changes animate: a circle grows out of the button you pressed (crossfade where unsupported).
function setTheme(next, from) {
  if (next === settings.theme) return;
  const apply = () => { settings.theme = next; applySettings(); paintSettings(); };
  if (!canFade()) { apply(); return; }
  if (document.startViewTransition && canMove()) {
    const r = from?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth - 40;
    const y = r ? r.top + r.height / 2 : 30;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(apply);
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    return;
  }
  root.classList.add('theme-fade');
  apply();
  setTimeout(() => root.classList.remove('theme-fade'), 450);
}
document.getElementById('theme-btn').addEventListener('click', (e) => {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(dark ? 'light' : 'dark', e.currentTarget);
});
const menu = document.getElementById('set-menu');
const setBtn = document.getElementById('set-btn');
function toggleMenu(open = menu.hidden) {
  setBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    menu.hidden = false;
    syncAllSegs(false);
    if (canFade()) menu.animate([{ opacity: 0, transform: canMove() ? 'scale(0.96)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
  } else if (!menu.hidden) {
    if (canFade()) menu.animate([{ opacity: 1 }, { opacity: 0, transform: canMove() ? 'scale(0.97)' : 'none' }], { duration: 130, easing: EASE_OUT }).onfinish = () => (menu.hidden = true);
    else menu.hidden = true;
  }
}
setBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (!e.isTrusted) return; if (!menu.hidden && !e.target.closest('#set-menu')) toggleMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });
menu.addEventListener('click', (e) => {
  const m = e.target.closest('[data-motion]'); if (m) { settings.motion = m.dataset.motion; applySettings(); }
  const t = e.target.closest('[data-theme-opt]'); if (t) { setTheme(t.dataset.themeOpt, t); return; }
  const gl = e.target.closest('[data-glass-opt]'); if (gl) { settings.glass = gl.dataset.glassOpt; applySettings(); }
  const h = e.target.closest('[data-hap]'); if (h) { setHaptics(h.dataset.hap === 'on'); if (h.dataset.hap === 'on') haptic('success'); }
  if (e.target.closest('#hap-test')) { if (!hapticsEnabled()) { setHaptics(true); } haptic('success'); }
  paintSettings();
});

// ---------- glossary tooltips ----------
let tipEl = null;
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return; // ignore the hidden switch the haptics use on iPhone
  const t = e.target.closest('.term');
  if (!t) { hideTip(); return; }
  e.preventDefault();
  hideTip();
  const info = termInfo(t.dataset.term);
  if (!info) return;
  tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.innerHTML = `<b>${esc(info.term[0].toUpperCase() + info.term.slice(1))}</b>${esc(info.def)}`;
  document.body.appendChild(tipEl);
  const r = t.getBoundingClientRect();
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
  let y = r.top - h - 8;
  let origin = 'bottom center';
  if (y < 12) { y = r.bottom + 8; origin = 'top center'; }
  tipEl.style.left = x + 'px';
  tipEl.style.top = y + 'px';
  tipEl.style.transformOrigin = origin;
  if (canFade()) tipEl.animate([{ opacity: 0, transform: canMove() ? 'scale(0.97)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: EASE_OUT });
});
window.addEventListener('scroll', hideTip, { passive: true });

// ---------- views ----------
const views = {
  home: document.getElementById('v-home'),
  play: document.getElementById('v-play'),
  review: document.getElementById('v-review'),
  import: document.getElementById('v-import'),
};
const review = mountReview(views.review);
const play = mountPlay(views.play, {
  onReview: (pgn, side) => { go('review'); review.load(pgn, side); },
});

function go(name, { push = true } = {}) {
  if (!views[name]) name = 'home';
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  document.querySelectorAll('.nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.view === name));
  document.querySelectorAll('.nav a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  if (push) {
    const hash = name === 'home' ? '' : '#' + name;
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
  }
  if (name === 'home') renderHome();
  const el = views[name];
  document.querySelector('main').dataset.view = name;
  document.documentElement.dataset.view = name;
  // slide only: fading an ancestor would stop the frosted panels from seeing the background until it ends
  if (canMove()) { const s = spring(0.8, 0.42); el.animate([{ transform: 'translateY(14px)' }, { transform: 'none' }], { duration: s.duration, easing: s.easing }); }
  requestAnimationFrame(() => { syncAllSegs(false); syncNav(true); });
  hideTip();
}
document.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.view); }));
window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'home', { push: false }));

// ---------- home ----------
let demoBoard = null;
function renderHome() {
  const el = views.home;
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `
    <section class="hero">
      <div>
        <h1>See <em>why</em> a move works.</h1>
        <p class="lede">Play or paste a game. Magnus grades every move and tells you, in plain words, what it wins, what it costs and what to do instead.</p>
        <div class="hero-ctas"><a href="#play" class="btn btn-primary" data-view="play">${icon('play')}Play a game</a><a href="#review" class="btn btn-ghost" data-view="review">${icon('review')}Review a game</a></div>
      </div>
      <div class="hero-demo">
        <div id="demo-board"></div>
        <div class="panel demo-card"><div class="card" style="gap:10px">
          <div class="card-head"><span class="badge t-blunder"><i>??</i>Blunder</span><span class="card-move">3... Nf6</span><span class="card-eval">Example</span></div>
          <div class="sec why"><ul><li>It leaves f7 guarded only by the king. White plays <b class="mono">Qxf7#</b>, checkmate.</li></ul></div>
          <div class="sec gains"><h4>What to play instead: <span class="mono">Qe7</span></h4><ul><li>Guards f7, so the checkmate threat is gone.</li></ul></div>
        </div></div>
      </div>
    </section>
    <section class="ways">
      <a href="#play" class="way feature" data-view="play"><span class="ic-wrap">${icon('robot')}</span><h3>Play the bot</h3><p>Nine levels from Beginner (≈ 400) to Maximum (≈ 3200), with a safety net and live grades.</p><span class="go">Start playing ${icon('arrowRight')}</span></a>
      <a href="#review" class="way way-navy" data-view="review"><span class="ic-wrap">${icon('clip')}</span><h3>Paste a game</h3><p>Copy the PGN from chess.com or anywhere else and get a full breakdown.</p><span class="go">Review ${icon('arrowRight')}</span></a>
      <a href="#import" class="way way-sand" data-view="import"><span class="ic-wrap">${icon('import')}</span><h3>Import by username</h3><p>Pull your recent chess.com games and pick one to review.</p><span class="go">Import ${icon('arrowRight')}</span></a>
    </section>
    <section class="patterns" id="patterns"></section>
    <footer class="foot"><span>Engine: Stockfish 17.1 (GPLv3), running in your browser.</span><span>Pieces: Colin M.L. Burnett (cburnett).</span><span>Elo levels are approximate.</span></footer>`;
    el.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.view); }));
    demoBoard = new Board(el.querySelector('#demo-board'), { coords: false });
    demoBoard.setPosition('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', { animate: false });
    demoBoard.setMarks({ last: ['g8', 'f6'], bad: 'f7' });
    setTimeout(() => demoBoard.setArrows([{ from: 'h5', to: 'f7', kind: 'bad' }], { animate: true }), 500);
    staggerIn(el.querySelectorAll('.hero > div > *, .way'), { step: 45 });
  }
  const pat = el.querySelector('#patterns');
  const { list, games } = topPatterns(4);
  if (!games || !list.length) {
    pat.innerHTML = games ? `<div class="focus">${icon('check')}<div><b>No repeated mistakes yet</b>You've reviewed ${games} game${games === 1 ? '' : 's'} without a pattern showing up. Keep reviewing to build your profile.</div></div>` : '';
    return;
  }
  const top = list[0];
  pat.innerHTML = `<div class="page-head" style="margin:0"><h2 style="margin:0;font-size:22px;letter-spacing:-0.02em">Your patterns</h2><p>From ${games} reviewed game${games === 1 ? '' : 's'}. Fix the top one first.</p></div>
    <div class="focus">${icon('target')}<div><b>Focus for your next game: ${esc(top.label.toLowerCase())}</b>${esc(top.habit || '')}</div></div>
    <div class="pattern-grid">${list.map((p) => `<div class="pattern"><strong>${p.count}×</strong><span>${esc(p.label)}</span></div>`).join('')}</div>`;
}

// ---------- import ----------
function buildImport() {
  const el = views.import;
  el.innerHTML = `
    <div class="page-head"><h1>Import from chess.com</h1><p>Enter your username to load your recent games. Pick one to review it.</p></div>
    <div class="split">
      <div style="display:grid;gap:14px">
        <form class="panel panel-pad" id="imp-form" style="display:grid;gap:12px">
          <label class="field" for="imp-user">chess.com username
            <input type="text" id="imp-user" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="e.g. hikaru">
          </label>
          <p class="err" id="imp-err" hidden></p>
          <div class="row"><button type="submit" class="btn btn-primary">${icon('import')}Find my games</button></div>
          <p class="help">Games against chess.com's bots and Coach may not be listed by chess.com. If yours is missing, copy its PGN and use Review instead.</p>
        </form>
        <div class="games" id="imp-list"></div>
      </div>
      <div class="panel panel-pad" style="display:grid;gap:10px;align-content:start">
        <span class="eyebrow">Privacy</span>
        <p style="margin:0">Your username goes straight from your browser to chess.com's public games API. Nothing is stored anywhere else.</p>
      </div>
    </div>`;
  const input = el.querySelector('#imp-user');
  input.value = store.get('magnus.user', '');
  el.querySelector('#imp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = input.value.trim().toLowerCase();
    const err = el.querySelector('#imp-err');
    const list = el.querySelector('#imp-list');
    err.hidden = true;
    if (!/^[a-z0-9_-]{3,25}$/.test(user)) { err.textContent = 'Usernames are 3 to 25 letters, numbers, dashes or underscores.'; err.hidden = false; return; }
    store.set('magnus.user', user);
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const arch = await fetch(`https://api.chess.com/pub/player/${user}/games/archives`);
      if (arch.status === 404) throw new Error(`No chess.com player called "${user}".`);
      if (!arch.ok) throw new Error('chess.com didn\'t respond. Try again in a moment.');
      const { archives } = await arch.json();
      if (!archives?.length) throw new Error('This player has no finished games yet.');
      let games = [];
      for (const url of archives.slice(-2).reverse()) {
        const r = await fetch(url);
        if (r.ok) games = games.concat((await r.json()).games || []);
      }
      games = games.filter((g) => g.pgn && (!g.rules || g.rules === 'chess')).sort((a, b) => b.end_time - a.end_time).slice(0, 30);
      if (!games.length) throw new Error('No standard chess games in the last two months.');
      list.innerHTML = games.map((g, i) => {
        const side = g.white.username.toLowerCase() === user ? 'w' : 'b';
        const me = side === 'w' ? g.white : g.black;
        const opp = side === 'w' ? g.black : g.white;
        const res = me.result === 'win' ? 'w' : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(me.result) ? 'd' : 'l';
        const date = new Date(g.end_time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<button type="button" class="game-row" data-i="${i}"><span class="res ${res}">${{ w: 'W', l: 'L', d: '½' }[res]}</span><span style="min-width:0"><span class="opp">vs ${esc(opp.username)} <span class="muted mono" style="font-weight:500">${esc(opp.rating)}</span></span><br><span class="meta">${esc(g.time_class)} · you played ${side === 'w' ? 'White' : 'Black'} · ${esc(date)}</span></span>${icon('arrowRight')}</button>`;
      }).join('');
      staggerIn(list.children, { step: 30 });
      list.querySelectorAll('.game-row').forEach((b) => b.addEventListener('click', () => {
        const g = games[+b.dataset.i];
        const side = g.white.username.toLowerCase() === user ? 'w' : 'b';
        go('review');
        review.load(g.pgn, side);
      }));
    } catch (ex) {
      list.innerHTML = '';
      err.textContent = ex.message && !/fetch/i.test(ex.message) ? ex.message : 'Couldn\'t reach chess.com from here. Copy the game\'s PGN and use Review instead.';
      err.hidden = false;
    }
  });
}
buildImport();

drawBackgroundPosition(document.querySelector('.bg-pos'));
go(location.hash.slice(1) || 'home', { push: false });
// warm up the engine in the background so the first analysis starts instantly
setTimeout(() => engine().ready.catch(() => {}), 600);
void SAMPLE_PGN;
