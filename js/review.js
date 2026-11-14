// Game review: analyse every position, explain every move, replay lines, retry mistakes.
import { Chess } from '../vendor/chess.js?v=155f7bd6fe';
import { Board } from './board.js?v=155f7bd6fe';
import { engine } from './engine.js?v=155f7bd6fe';
import { winPct, scoreToCp, fmtScore, isBad, CAUSE_LABEL, moveFacts, classify, TONE } from './explain.js?v=155f7bd6fe';
import { explainAsync } from './explainer.js?v=155f7bd6fe';
import { renderCard, badge, steps } from './card.js?v=155f7bd6fe';
import { icon } from './icons.js?v=155f7bd6fe';
import { staggerIn, swapIn, shake, pop, wait, canMove, revealSections } from './anim.js?v=155f7bd6fe';
import { store } from './store.js?v=155f7bd6fe';
import { renderText } from './glossary.js?v=155f7bd6fe';
import { haptic } from './haptics.js?v=155f7bd6fe';
import { recordGame } from './profile.js?v=155f7bd6fe';
import { paintEval } from './evalbar.js?v=155f7bd6fe';

export const SAMPLE_PGN = `[Event "Casual game"]
[White "You"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountReview(root) {
  root.innerHTML = `
  <div class="rv-input">
    <div class="page-head"><h1>Review a game</h1><p>Paste a game in PGN format. Every move gets graded and explained: what it does, what it gives up, and what was better.</p></div>
    <div class="split">
      <div class="panel panel-pad" style="display:grid;gap:14px">
        <label class="field" for="pgn-in">Game (PGN)
          <textarea id="pgn-in" spellcheck="false" placeholder="1. e4 e5 2. Nf3 Nc6 ..."></textarea>
        </label>
        <p class="help">On chess.com: open the game, tap Share, then copy the PGN.</p>
        <div class="row">
          <span class="field" style="font-weight:560;font-size:13.5px">You played</span>
          <div class="seg" role="group" aria-label="Your color" style="min-width:180px">
            <button type="button" data-side="w" aria-pressed="true">White</button><button type="button" data-side="b" aria-pressed="false">Black</button>
          </div>
        </div>
        <p class="err" id="pgn-err" hidden></p>
        <div class="row"><button type="button" class="btn btn-primary" id="pgn-go">${icon('sparkle')}Analyze game</button><button type="button" class="btn btn-ghost" id="pgn-sample">Load a sample game</button></div>
      </div>
      <div class="panel panel-pad" style="display:grid;gap:10px">
        <span class="eyebrow">How it works</span>
        <p style="margin:0">Stockfish, a top chess engine, checks every position right in your browser. Magnus then reads the board to explain the reasons: pieces left hanging, forks, pins, threats you missed, and what each move costs you later.</p>
        <p class="muted" style="margin:0;font-size:14px">A 40-move game takes about a minute. Moves fill in as they're ready, so you can start reading right away.</p>
      </div>
    </div>
  </div>
  <div class="rv-main split" hidden>
    <div class="board-col">
      <div class="player" data-p="top"></div>
      <div class="board-frame"><div class="evalbar" aria-hidden="true"><div class="evalbar-w"></div><span class="evalbar-n"></span></div><div class="rv-board"></div></div>
      <div class="player" data-p="bottom"></div>
      <div class="rv-banner"></div>
      <div class="ctrls">
        <button class="ctrl" data-nav="first" aria-label="First move">${icon('first')}</button>
        <button class="ctrl" data-nav="prev" aria-label="Previous move">${icon('prev')}</button>
        <button class="ctrl" data-nav="next" aria-label="Next move">${icon('next')}</button>
        <button class="ctrl" data-nav="last" aria-label="Last move">${icon('last')}</button>
        <button class="ctrl" data-nav="flip" aria-label="Flip board">${icon('flip')}</button>
      </div>
    </div>
    <aside class="side">
      <div class="panel panel-pad summary" id="rv-summary"></div>
      <div class="panel" id="rv-card" aria-live="polite"></div>
      <div class="panel"><div class="moves" id="rv-moves"></div></div>
      <button type="button" class="btn btn-ghost" id="rv-new">${icon('clip')}Review another game</button>
    </aside>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const state = { side: 'w', game: null, idx: 0, token: null, mode: null };
  const board = new Board($('.rv-board'));
  const fenStart = new Chess().fen();
  board.setPosition(fenStart, { animate: false });

  root.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
    state.side = b.dataset.side;
    root.querySelectorAll('[data-side]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#pgn-sample').addEventListener('click', () => { $('#pgn-in').value = SAMPLE_PGN; state.side = 'w'; root.querySelectorAll('[data-side]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.side === 'w'))); });
  $('#pgn-go').addEventListener('click', () => {
    const err = $('#pgn-err');
    err.hidden = true;
    try {
      start($('#pgn-in').value, state.side);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      shake($('#pgn-in'));
    }
  });
  $('#rv-new').addEventListener('click', () => {
    cancel();
    $('.rv-main').hidden = true;
    $('.rv-input').hidden = false;
  });

  function cancel() {
    if (state.token) state.token.cancelled = true;
    stopPreview();
    state.mode = null;
  }

  // ---------- load ----------
  function parse(pgn) {
    const text = (pgn || '').trim();
    if (!text) throw new Error('Paste a game first. It should start with something like "1. e4".');
    const c = new Chess();
    try { c.loadPgn(text); } catch {
      throw new Error('That doesn\'t look like a valid game. Check that you copied the whole PGN, including all moves.');
    }
    const hist = c.history({ verbose: true });
    if (!hist.length) throw new Error('This game has no moves to review.');
    const headers = c.getHeaders ? c.getHeaders() : c.header();
    const replay = new Chess(hist[0].before);
    const fens = [hist[0].before];
    const moves = [];
    for (const m of hist) { const mm = replay.move(m.san); moves.push(mm); fens.push(replay.fen()); }
    return { headers, moves, fens, final: replay };
  }

  function start(pgn, side) {
    cancel();
    const g = parse(pgn);
    state.side = side;
    state.game = { ...g, analysis: [], cards: [], done: false };
    $('.rv-input').hidden = true;
    $('.rv-main').hidden = false;
    board.setOrientation(side);
    $('.evalbar').classList.toggle('flip', side === 'b');
    setPlayers();
    renderMoves();
    goto(0, false);
    renderSummary();
    window.scrollTo({ top: 0 });
    analyse();
  }

  function setPlayers() {
    const h = state.game.headers || {};
    const w = h.White && h.White !== '?' ? h.White : 'White';
    const b = h.Black && h.Black !== '?' ? h.Black : 'Black';
    const top = state.side === 'w' ? ['b', b] : ['w', w];
    const bot = state.side === 'w' ? ['w', w] : ['b', b];
    const tag = (c, n) => `<span class="avatar">${icon(c === state.side ? 'user' : 'robot')}</span><b>${esc(n)}</b><span class="muted">${c === 'w' ? 'White' : 'Black'}${c === state.side ? ' · you' : ''}</span>`;
    root.querySelector('[data-p="top"]').innerHTML = tag(...top);
    root.querySelector('[data-p="bottom"]').innerHTML = tag(...bot);
  }

  // ---------- analysis ----------
  async function analyse() {
    const g = state.game;
    const token = { cancelled: false };
    state.token = token;
    const eng = engine();
    try {
      await eng.ready;
    } catch (e) {
      $('#rv-summary').innerHTML = `<p class="err">The chess engine couldn't start in this browser (${esc(e.message)}). Try a recent Chrome, Safari or Firefox.</p>`;
      return;
    }
    await eng.newGame();
    const builds = [];
    for (let i = 0; i < g.fens.length; i++) {
      if (token.cancelled) return;
      const pos = new Chess(g.fens[i]);
      let res;
      if (pos.isGameOver()) res = { lines: [], terminal: true };
      else {
        try {
          res = await eng.analyze(g.fens[i], { depth: 14, multipv: 2, token });
          res.shallow = (await eng.analyze(g.fens[i], { depth: 4, multipv: 1, token })).bestmove;
        } catch { return; }
      }
      if (token.cancelled) return;
      g.analysis[i] = res;
      if (i > 0) builds.push(buildCard(i - 1));
      updateProgress(i + 1, g.fens.length);
    }
    await Promise.all(builds);
    if (token.cancelled) return;
    g.done = true;
    renderSummary();
    const yourMistakes = g.cards.filter((c, i) => c && g.moves[i].color === state.side && isBad(c.cls) && c.cls !== 'inaccuracy');
    recordGame(g.fens.length + ':' + g.moves.map((m) => m.san).join(''), yourMistakes.map((c) => c.cause).filter(Boolean), accuracyFor(state.side));
  }

  async function buildCard(i) {
    const g = state.game;
    const m = g.moves[i];
    try {
      const pm = g.moves[i - 1];
      g.cards[i] = await explainAsync({ fen: g.fens[i], uci: m.from + m.to + (m.promotion || ''), ply: i, before: g.analysis[i], after: g.analysis[i + 1], prevUci: pm ? pm.from + pm.to : null });
    } catch (e) {
      console.error(e);
      g.cards[i] = null;
    }
    if (state.game !== g) return;
    paintMove(i);
    if (state.idx === i + 1) renderCurrent(false);
  }

  function updateProgress(done, total) {
    const bar = root.querySelector('.progress > i');
    if (bar) bar.style.transform = `scaleX(${done / total})`;
    const lab = root.querySelector('#rv-prog-label');
    if (lab) lab.textContent = `Analyzing move ${Math.min(done, total - 1)} of ${total - 1}`;
    if (state.idx === 0 || !state.game.analysis[state.idx]) updateEval();
  }

  function accuracyFor(color) {
    const g = state.game;
    const a = g.cards.filter((c, i) => c && g.moves[i].color === color).map((c) => c.accuracy);
    if (!a.length) return null;
    // harmonic-ish blend so a few blunders hurt like they should
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(5, x), 0);
    return (mean + harm) / 2;
  }

  // ---------- summary ----------
  function renderSummary() {
    const g = state.game;
    const el = $('#rv-summary');
    if (!g.done) {
      el.innerHTML = `<div style="display:grid;gap:8px"><div class="row" style="justify-content:space-between"><b>Reviewing your game</b><span class="muted mono" id="rv-prog-label" style="font-size:12.5px">Starting the engine</span></div><div class="progress"><i></i></div><p class="muted" style="margin:0;font-size:13.5px">Tap any move to read about it while the rest is analyzed.</p></div>`;
      return;
    }
    const you = state.side, opp = you === 'w' ? 'b' : 'w';
    const acc = (c) => { const v = accuracyFor(c); return v == null ? '–' : v.toFixed(1); };
    const counts = {};
    g.cards.forEach((c, i) => { if (c && g.moves[i].color === you) counts[c.cls] = (counts[c.cls] || 0) + 1; });
    const order = ['great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
    const tally = order.filter((k) => counts[k]).map((k) => badge(k).replace('</span>', ` <span class="mono">×${counts[k]}</span></span>`)).join('');
    const worst = g.cards.map((c, i) => ({ c, i })).filter(({ c, i }) => c && g.moves[i].color === you && isBad(c.cls)).sort((a, b) => b.c.loss - a.c.loss).slice(0, 3);
    const moments = worst.length
      ? `<div class="sec"><h4>Your key moments</h4><div class="moments">${worst.map(({ c, i }) => `<button type="button" class="moment" data-goto="${i + 1}">${badge(c.cls)}<span class="mono">${moveNo(i)} ${esc(c.san)}</span><span class="muted">${esc(CAUSE_LABEL[c.cause] || '')}</span></button>`).join('')}</div></div>`
      : `<p class="empty-note">No mistakes from you in this game. Nicely played.</p>`;
    el.innerHTML = `<div class="acc-row"><div class="acc ${you === 'w' ? 'you' : ''}"><span>White accuracy</span><strong>${acc('w')}</strong></div><div class="acc ${you === 'b' ? 'you' : ''}"><span>Black accuracy</span><strong>${acc('b')}</strong></div></div><div class="tally">${tally}</div>${moments}`;
    staggerIn(el.children, { step: 50 });
    el.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', async () => { await revealBoard(); goto(+b.dataset.goto); }));
    void opp;
  }

  const moveNo = (i) => `${Math.floor(i / 2) + 1}.${i % 2 ? '..' : ''}`;

  // ---------- move list ----------
  function renderMoves() {
    const g = state.game;
    const el = $('#rv-moves');
    let html = '';
    g.moves.forEach((m, i) => {
      if (i % 2 === 0) html += `<span class="no">${i / 2 + 1}</span>`;
      html += `<button type="button" class="mv" data-i="${i + 1}">${esc(m.san)}</button>`;
    });
    if (g.moves.length % 2) html += '<span></span>';
    el.innerHTML = html;
    el.querySelectorAll('.mv').forEach((b) => b.addEventListener('click', async () => { await revealBoard(); goto(+b.dataset.i); }));
  }
  function paintMove(i) {
    const c = state.game.cards[i];
    const b = root.querySelector(`.mv[data-i="${i + 1}"]`);
    if (!b || !c) return;
    const tone = TONE[c.cls] || 'good';
    b.className = `mv t-${tone}`;
    const q = { magnus: 'M', brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??' }[c.cls];
    b.innerHTML = `${esc(c.san)}${q ? `<span class="q">${q}</span>` : ''}`;
    if (state.idx === i + 1) b.setAttribute('aria-current', 'true');
  }

  // ---------- navigation ----------
  function goto(idx, animate = true) {
    const g = state.game;
    if (!g) return;
    idx = Math.max(0, Math.min(g.moves.length, idx));
    stopPreview();
    if (state.mode === 'retry') endRetry();
    state.idx = idx;
    board.setInteractive(null);
    board.setPosition(g.fens[idx], { animate });
    const last = idx ? g.moves[idx - 1] : null;
    board.setMarks({ last: last ? [last.from, last.to] : null, good: null, bad: null });
    root.querySelectorAll('.mv').forEach((b) => b.toggleAttribute('aria-current', +b.dataset.i === idx));
    root.querySelectorAll('.mv[aria-current]').forEach((b) => b.setAttribute('aria-current', 'true'));
    const cur = root.querySelector('.mv[aria-current]');
    if (cur) { const box = $('#rv-moves'); const top = cur.offsetTop - box.clientHeight / 2; box.scrollTo({ top, behavior: canMove() ? 'smooth' : 'auto' }); }
    $('.rv-banner').innerHTML = '';
    renderCurrent(animate);
    updateEval();
    root.querySelector('[data-nav="prev"]').disabled = idx === 0;
    root.querySelector('[data-nav="first"]').disabled = idx === 0;
    root.querySelector('[data-nav="next"]').disabled = idx === g.moves.length;
    root.querySelector('[data-nav="last"]').disabled = idx === g.moves.length;
  }

  function updateEval() {
    const g = state.game;
    paintEval(root.querySelector('.evalbar'), g.fens[state.idx], g.analysis[state.idx], board.orientation === 'b');
  }

  function renderCurrent(animate) {
    const g = state.game;
    const el = $('#rv-card');
    const i = state.idx - 1;
    if (i < 0) {
      board.clearBadge();
      el.innerHTML = `<div class="card"><span class="eyebrow">Start</span><p style="margin:0">Use the arrows (or your keyboard's ← →) to step through the game. Each move gets a grade and an explanation.</p><p class="muted" style="margin:0;font-size:14px">Tip: jump straight to your key moments in the summary above.</p></div>`;
      board.setArrows([]);
      return;
    }
    const card = g.cards[i];
    if (!card) {
      board.clearBadge();
      el.innerHTML = `<div class="card"><div class="card-head"><span class="card-move">${moveNo(i)} ${esc(g.moves[i].san)}</span><span class="card-eval"><span class="thinking"><i></i><i></i><i></i></span></span></div><p class="empty-note">Analyzing this move…</p></div>`;
      board.setArrows([]);
      return;
    }
    board.setBadge(g.moves[i].to, card.cls, { animate, delay: animate ? 150 : 0 });
    const pos = new Chess(g.fens[i + 1]);
    const a = g.analysis[i + 1];
    let ev = '';
    if (pos.isCheckmate()) ev = 'Checkmate';
    else if (a?.lines?.[0]) ev = 'Eval ' + fmtScore(a.lines[0].score, pos.turn() === 'w' ? 1 : -1);
    el.innerHTML = `<div class="card">${renderCard(card, { moveLabel: `${moveNo(i)} ${card.san}`, evalText: ev, actions: { punish: true, better: true, retry: g.moves[i].color === state.side || true } })}</div>`;
    if (animate) revealSections(el);
    wireCard(el, i);
    // arrows: what was played, what was best, what the opponent threatens
    const m = g.moves[i];
    const arrows = [{ from: m.from, to: m.to, kind: isBad(card.cls) ? 'bad' : 'played' }];
    if (card.better && card.bestUci) arrows.push({ from: card.bestUci.slice(0, 2), to: card.bestUci.slice(2, 4), kind: 'best' });
    const reply = a?.lines?.[0]?.pv?.[0];
    if (isBad(card.cls) && reply) arrows.push({ from: reply.slice(0, 2), to: reply.slice(2, 4), kind: 'threat' });
    board.setArrows(arrows, { animate });
  }

  // On phones the card sits below the board; bring the board back into view for board actions.
  // Bring the board fully into view (below the sticky header), and resolve once scrolling has settled.
  function revealBoard() {
    return new Promise((resolve) => {
      const col = root.querySelector('.rv-main .board-col');
      if (!col) return resolve(false);
      const head = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
      const top = col.getBoundingClientRect().top;
      const boardBottom = $('.rv-board').getBoundingClientRect().bottom;
      if (top >= head - 2 && boardBottom <= innerHeight + 2) return resolve(false);
      window.scrollTo({ top: Math.max(0, scrollY + top - head - 8), behavior: canMove() ? 'smooth' : 'auto' });
      let last = -1, still = 0;
      const t0 = performance.now();
      const check = () => {
        const y = scrollY;
        still = Math.abs(y - last) < 1 ? still + 1 : 0;
        last = y;
        if (still >= 4 || performance.now() - t0 > 1000) resolve(true);
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  function wireCard(el, i) {
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      const card = state.game.cards[i];
      await revealBoard();
      if (state.idx !== i + 1 && act !== 'retry') return; // the user moved on while we scrolled
      if (act === 'punish') playLine(state.game.fens[i + 1], state.game.analysis[i + 1].lines[0].pv.slice(0, card.soon.steps.length), isBad(card.cls) ? 'The punishment' : 'Best play from here');
      if (act === 'better') playLine(state.game.fens[i], [card.bestUci, ...(state.game.analysis[i].lines[0].pv.slice(1, card.better.line.steps.length))], `What ${card.better.san} leads to`);
      if (act === 'retry') startRetry(i);
    }));
  }

  // ---------- line player: step back and forth through a line, or let it play ----------
  const START_DELAY = 1000;
  const STEP_DELAY = 1200;
  function stopPreview() {
    if (!state.preview) return;
    state.preview.cancelled = true;
    clearTimeout(state.preview.timer);
    state.preview = null;
  }

  function playLine(fen, pv, title) {
    stopPreview();
    const token = { cancelled: false, paused: false, k: 0, timer: null };
    state.preview = token;
    const banner = $('.rv-banner');
    board.setArrows([]);
    board.clearBadge();
    // every position along the line, so we can jump anywhere
    const c = new Chess(fen);
    const steps = [{ fen, move: null }];
    for (const u of pv) {
      let m;
      try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); } catch { break; }
      steps.push({ fen: c.fen(), move: m });
    }
    const total = steps.length - 1;
    const mover = new Chess(fen).turn();

    const paint = () => {
      const k = token.k;
      const playing = !token.paused && k < total;
      banner.innerHTML = `<div class="line-player">
        <div class="lp-head">${icon('play')}<b>${esc(title)}</b><span class="lp-count mono">${k}/${total}</span></div>
        <div class="lp-moves">${steps.slice(1).map((st, n) => `<button type="button" class="lp-mv ${st.move.color === mover ? 'theirs' : 'mine'}" data-k="${n + 1}" ${n + 1 === k ? 'aria-current="true"' : ''}>${esc(st.move.san)}</button>`).join('')}</div>
        <div class="lp-ctrls">
          <button type="button" class="ctrl" data-lp="prev" aria-label="Previous move in line" ${k === 0 ? 'disabled' : ''}>${icon('prev')}</button>
          <button type="button" class="ctrl" data-lp="play" aria-label="${playing ? 'Pause' : 'Play'}">${icon(playing ? 'pause' : 'play')}</button>
          <button type="button" class="ctrl" data-lp="next" aria-label="Next move in line" ${k === total ? 'disabled' : ''}>${icon('next')}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-exit>Back to game</button>
        </div></div>`;
      banner.querySelector('[data-exit]').addEventListener('click', () => { stopPreview(); goto(state.idx, false); });
      banner.querySelectorAll('[data-lp]').forEach((b) => b.addEventListener('click', () => control(b.dataset.lp)));
      banner.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { token.paused = true; clearTimeout(token.timer); show(+b.dataset.k); }));
    };
    const show = (k, animate = true) => {
      token.k = Math.max(0, Math.min(total, k));
      const st = steps[token.k];
      board.setPosition(st.fen, { animate });
      board.setMarks({ last: st.move ? [st.move.from, st.move.to] : null, good: null, bad: null });
      paint();
    };
    const tick = () => {
      if (token.cancelled || token.paused) return;
      if (token.k < total) show(token.k + 1);
      if (token.k < total) token.timer = setTimeout(tick, STEP_DELAY);
      else { token.paused = true; paint(); }
    };
    const control = (what) => {
      if (token.cancelled) return;
      clearTimeout(token.timer);
      if (what === 'prev') { token.paused = true; show(token.k - 1); }
      else if (what === 'next') { token.paused = true; show(token.k + 1); }
      else if (what === 'play') {
        if (!token.paused && token.k < total) { token.paused = true; paint(); return; }
        token.paused = false;
        if (token.k >= total) { show(0); token.timer = setTimeout(tick, START_DELAY * 0.7); }
        else { paint(); token.timer = setTimeout(tick, 450); }
      }
    };
    token.control = control;
    show(0, false);
    token.timer = setTimeout(tick, START_DELAY);
  }

  // ---------- retry: find a better move ----------
  function startRetry(i) {
    const g = state.game;
    stopPreview();
    state.mode = 'retry';
    state.retryIdx = i;
    const fen = g.fens[i];
    const color = g.moves[i].color;
    board.setOrientation(color);
    board.setArrows([]);
    board.clearBadge();
    board.setPosition(fen, { animate: true });
    board.setMarks({ last: null });
    const banner = $('.rv-banner');
    const setBanner = (html, cls = '') => {
      banner.innerHTML = `<div class="banner ${cls}">${html}<button type="button" class="btn btn-ghost btn-sm" data-exit>Done</button></div>`;
      banner.querySelector('[data-exit]').addEventListener('click', () => goto(i + 1, false));
    };
    setBanner(`${icon('target')}<span>Find a better move for <b>${color === 'w' ? 'White' : 'Black'}</b>. You played <span class="mono">${esc(g.moves[i].san)}</span>.</span>`);
    const chess = new Chess(fen);
    board.setInteractive({
      color,
      dests: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => m.to),
      onMove: async (from, to) => {
        let promo;
        const piece = chess.get(from);
        if (piece.type === 'p' && (to[1] === '8' || to[1] === '1')) promo = await board.askPromotion(to, color);
        const mv = chess.move({ from, to, promotion: promo });
        board.setPosition(chess.fen(), { animate: true });
        board.setMarks({ last: [from, to] });
        board.setInteractive(null);
        haptic('move');
        setBanner(`<span class="thinking"><i></i><i></i><i></i></span><span>Checking <span class="mono">${esc(mv.san)}</span>…</span>`);
        const uci = from + to + (promo || '');
        const before = g.analysis[i];
        let after;
        try { after = await engine().analyze(chess.fen(), { depth: 13, multipv: 1 }); } catch { return; }
        if (state.mode !== 'retry' || state.retryIdx !== i) return;
        const bestWp = winPct(scoreToCp(before.lines[0].score));
        const wp = chess.isCheckmate() ? 100 : 100 - winPct(scoreToCp(after.lines[0]?.score));
        const isBest = uci === before.lines[0].pv[0];
        const cls = classify({ bestWp, playedWp: wp, isBest, secondWp: null, legalCount: 2 });
        const pm = g.moves[i - 1];
        const card = await explainAsync({ fen, uci, ply: i, before, after, prevUci: pm ? pm.from + pm.to : null });
        const el = $('#rv-card');
        if (!isBad(cls)) {
          haptic('success');
          setBanner(`${icon('check')}<span><b>Yes! ${esc(mv.san)}</b> works. ${cls === 'best' || cls === 'great' ? 'That\'s the engine\'s top move.' : 'That\'s a good move too.'}</span>`, 'good');
          pop(banner.firstElementChild);
          celebrateSquare(to);
        } else {
          haptic('error');
          setBanner(`${icon('x')}<span><b>${esc(mv.san)}</b> isn't it either. Read why below, then try again.</span>`, 'bad');
          shake(banner.firstElementChild);
          setTimeout(() => {
            if (state.mode !== 'retry' || state.retryIdx !== i) return;
            board.setPosition(fen, { animate: true });
            board.setMarks({ last: null });
            chess.undo();
            board.setInteractive({ color, dests: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => m.to), onMove: board.interactiveLast });
          }, 1600);
        }
        el.innerHTML = `<div class="card">${renderCard(card, { moveLabel: `Your try: ${card.san}`, actions: {} })}${isBad(cls) ? `<div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-reveal>${icon('eye')}Show me the answer</button></div>` : ''}</div>`;
        swapIn(el.firstElementChild);
        el.querySelector('[data-reveal]')?.addEventListener('click', () => {
          const b = before.lines[0].pv[0];
          board.setPosition(fen, { animate: true });
          board.setArrows([{ from: b.slice(0, 2), to: b.slice(2, 4), kind: 'best' }]);
          setBanner(`${icon('eye')}<span>The answer: <b class="mono">${esc(g.cards[i].bestSan)}</b></span>`);
        });
      },
    });
    board.interactiveLast = board.interactive.onMove;
    $('#rv-card').innerHTML = `<div class="card"><span class="eyebrow">Your turn</span><p style="margin:0">Move a piece on the board. Magnus will check your idea and explain it.</p>${g.cards[i].why.length ? `<p class="muted" style="margin:0;font-size:14px">Hint: think about why ${esc(g.moves[i].san)} failed.</p>` : ''}</div>`;
    swapIn($('#rv-card').firstElementChild);
  }
  function endRetry() {
    state.mode = null;
    board.setInteractive(null);
    board.setOrientation(state.side);
  }
  function celebrateSquare(sq) {
    board.setMarks({ good: sq });
  }

  // ---------- controls ----------
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.nav;
    if (n === 'flip') { board.setOrientation(board.orientation === 'w' ? 'b' : 'w'); updateEval(); return; }
    const to = { first: 0, prev: state.idx - 1, next: state.idx + 1, last: state.game.moves.length }[n];
    goto(to, n === 'prev' || n === 'next');
  }));
  const onKey = (e) => {
    if (root.hidden || !state.game || $('.rv-main').hidden) return;
    if (e.target.closest('textarea, input')) return;
    if (state.preview?.control) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); state.preview.control('prev'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); state.preview.control('next'); return; }
      if (e.key === ' ') { e.preventDefault(); state.preview.control('play'); return; }
      if (e.key === 'Escape') { stopPreview(); goto(state.idx, false); return; }
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goto(state.idx - 1, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goto(state.idx + 1, true); }
    else if (e.key === 'Home') goto(0, false);
    else if (e.key === 'End') goto(state.game.moves.length, false);
  };
  window.addEventListener('keydown', onKey);

  return {
    load(pgn, side) { $('#pgn-in').value = pgn; start(pgn, side); },
    leave() { cancel(); },
  };
}

void moveFacts; void steps; void renderText; void store;
