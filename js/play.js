// Play against Stockfish at a chosen strength, with optional coaching.
import { Chess } from '../vendor/chess.js?v=5191e09630';
import { Board } from './board.js?v=5191e09630';
import { engine } from './engine.js?v=5191e09630';
import { scoreToCp, isBad, moveFacts, TONE, winPct, assess, forOpponent } from './explain.js?v=5191e09630';
import { explainAsync } from './explainer.js?v=5191e09630';
import { loosePieces, threatsBy, NAME, other } from './chessutil.js?v=5191e09630';
import { renderCard, badge } from './card.js?v=5191e09630';
import { renderText } from './glossary.js?v=5191e09630';
import { icon } from './icons.js?v=5191e09630';
import { staggerIn, swapIn, pop, shake, wait, canMove, canFade, spring, EASE_OUT, revealSections } from './anim.js?v=5191e09630';
import { store } from './store.js?v=5191e09630';
import { haptic } from './haptics.js?v=5191e09630';
import { topPatterns } from './profile.js?v=5191e09630';
import { paintEval, resetEval } from './evalbar.js?v=5191e09630';

// Elo numbers are approximate. Up to Intermediate the bot is weakened by hand
// (shallow search + picking among several candidate moves, with occasional
// slips); from Intermediate II up, Stockfish's own strength limiter is used.
export const LEVELS = [
  { id: 'beginner', name: 'Beginner', elo: 400, depth: 1, mpv: 10, temp: 260, slip: 0.22 },
  { id: 'novice', name: 'Novice', elo: 700, depth: 3, mpv: 8, temp: 150, slip: 0.12 },
  { id: 'inter', name: 'Intermediate', elo: 1000, depth: 6, mpv: 6, temp: 70, slip: 0.06 },
  { id: 'inter2', name: 'Intermediate II', elo: 1300, uci: 1320, movetime: 400 },
  { id: 'adv', name: 'Advanced', elo: 1600, uci: 1600, movetime: 500 },
  { id: 'expert', name: 'Expert', elo: 2000, uci: 2000, movetime: 600 },
  { id: 'master', name: 'Master', elo: 2400, uci: 2400, movetime: 800 },
  { id: 'gm', name: 'Grandmaster', elo: 2800, uci: 2800, movetime: 1000 },
  { id: 'max', name: 'Maximum', elo: 3200, movetime: 1500 },
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SET_KEY = 'magnus.play';

export function mountPlay(root, { onReview }) {
  const saved = store.get(SET_KEY, { level: 'novice', color: 'w', safety: true, grades: true });
  const st = { ...saved, chess: null, busy: false, token: null, grades: saved.grades, hintStage: 0, turnAnalysis: null, history: [], over: false };

  root.innerHTML = `
  <div class="pl-setup">
    <div class="page-head"><h1>Play</h1><p>Pick an opponent. Magnus coaches you as you go: it warns you before you hang a piece and grades every move.</p></div>
    <div class="split">
      <div class="setup">
        <div class="sec"><h4>Opponent strength <span class="muted" style="font-weight:500">(Elo is approximate)</span></h4><div class="levels" id="levels"></div></div>
        <div class="sec"><h4>Your color</h4><div class="seg" role="group" aria-label="Your color" id="colors" style="max-width:360px">
          <button type="button" data-c="w">White</button><button type="button" data-c="r">Random</button><button type="button" data-c="b">Black</button></div></div>
        <div class="sec"><h4>Coaching</h4><div class="toggles">
          <label class="toggle" for="opt-safety"><input type="checkbox" class="switch" role="switch" id="opt-safety"><div><b>Safety net</b><span>Before a move that hangs a piece or allows mate, you get a warning and a chance to take it back.</span></div></label>
          <label class="toggle" for="opt-grades"><input type="checkbox" class="switch" role="switch" id="opt-grades"><div><b>Live grades</b><span>Every move you make is graded and explained right after you play it.</span></div></label>
        </div></div>
        <div class="row"><button type="button" class="btn btn-primary" id="pl-start">${icon('play')}Start game</button></div>
      </div>
      <div class="panel panel-pad" style="display:grid;gap:10px;align-content:start">
        <span class="eyebrow">Tips</span>
        <p style="margin:0">Pick a level where you win about half your games. Too easy teaches bad habits; too hard just hurts.</p>
        <p class="muted" style="margin:0;font-size:14px">When a game ends, tap "Review this game" for a full breakdown of every move.</p>
      </div>
    </div>
  </div>
  <div class="pl-game split split3 left-last" hidden>
    <div class="board-col">
      <div class="player" data-p="top"></div>
      <div class="board-frame"><div class="evalbar" aria-hidden="true"><div class="evalbar-w"></div><span class="evalbar-n"></span></div><div class="pl-board"></div></div>
      <div class="player" data-p="bottom"></div>
      <div class="pl-banner"></div>
      <div class="ctrls">
        <button class="ctrl" id="pl-back" aria-label="Previous position (doesn't undo)">${icon('prev')}</button>
        <button class="ctrl" id="pl-fwd" aria-label="Next position">${icon('next')}</button>
        <button class="ctrl" id="pl-hint" aria-label="Hint">${icon('hint')}<span class="lbl">Hint</span></button>
        <button class="ctrl" id="pl-undo" aria-label="Undo">${icon('undo')}<span class="lbl">Undo</span></button>
        <button class="ctrl" id="pl-flip" aria-label="Flip board">${icon('flip')}</button>
        <button class="ctrl" id="pl-resign" aria-label="Resign">${icon('flag')}<span class="lbl">Resign</span></button>
      </div>
      <button type="button" class="scroll-hint" aria-label="Scroll for the explanation"><span>Scroll for the explanation</span>${icon('down')}</button>
    </div>
    <aside class="side">
      <div class="panel" id="pl-coach" aria-live="polite"></div>
      <div class="panel opp-line" id="pl-opp" hidden></div>
      <div class="panel"><div class="moves" id="pl-moves"></div></div>
      <button type="button" class="btn btn-ghost" id="pl-new">New game</button>
    </aside>
    <aside class="side-left">
      <div class="panel panel-pad" id="pl-match"></div>
      <div class="panel panel-pad" id="pl-stats"></div>
      <div class="panel panel-pad" id="pl-focus"></div>
    </aside>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const board = new Board($('.pl-board'));
  board.setPosition(new Chess().fen(), { animate: false });

  // ----- setup -----
  const LV_PC = ['wP', 'wP', 'wN', 'wB', 'wR', 'wR', 'wQ', 'wK', 'bK'];
  $('#levels').innerHTML = LEVELS.map((l, i) => `<button type="button" class="level" data-l="${l.id}" aria-pressed="${l.id === st.level}"><span class="lv-pc pc-${LV_PC[i]}"></span><b>${l.name}</b><span>≈ ${l.elo}</span><span class="meter" aria-hidden="true">${LEVELS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span></button>`).join('');
  root.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
    st.level = b.dataset.l;
    root.querySelectorAll('[data-l]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    save();
  }));
  const paintColors = () => root.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.c === st.color)));
  paintColors();
  root.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { st.color = b.dataset.c; paintColors(); save(); }));
  $('#opt-safety').checked = st.safety;
  $('#opt-grades').checked = st.grades;
  $('#opt-safety').addEventListener('change', (e) => { st.safety = e.target.checked; save(); });
  $('#opt-grades').addEventListener('change', (e) => { st.grades = e.target.checked; save(); });
  function save() { store.set(SET_KEY, { level: st.level, color: st.color, safety: st.safety, grades: st.grades }); }

  $('#pl-start').addEventListener('click', startGame);
  $('#pl-new').addEventListener('click', () => { cancelAll(); $('.pl-game').hidden = true; $('.pl-setup').hidden = false; staggerIn(root.querySelectorAll('.level'), { step: 25 }); });
  $('#pl-flip').addEventListener('click', () => board.setOrientation(board.orientation === 'w' ? 'b' : 'w'));

  const level = () => LEVELS.find((l) => l.id === st.level) || LEVELS[1];

  function cancelAll() {
    if (st.token) st.token.cancelled = true;
    st.token = { cancelled: false };
    return st.token;
  }

  // ----- game -----
  async function startGame() {
    const token = cancelAll();
    st.user = st.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : st.color;
    st.chess = new Chess();
    st.grades_ = [];
    st.over = false;
    st.lastWp = null;
    st.view = null;
    st.live = null;
    $('.pl-banner').innerHTML = '';
    $('.pl-setup').hidden = true;
    $('.pl-game').hidden = false;
    board.setOrientation(st.user);
    board.setArrows([]);
    board.setPosition(st.chess.fen(), { animate: false });
    board.setMarks({ last: null, good: null, bad: null });
    board.clearBadge();
    $('#pl-opp').hidden = true;
    resetEval(evalEl());
    setPlayers();
    renderFocus();
    renderMoves();
    coach(`<div class="card"><span class="eyebrow">Game on</span><p style="margin:0">You're playing ${st.user === 'w' ? 'White' : 'Black'} against <b>${esc(level().name)}</b> (≈ ${level().elo}). ${st.user === 'w' ? 'Your move.' : 'The bot moves first.'}</p></div>`);
    window.scrollTo({ top: 0 });
    try { await engine().ready; } catch (e) { coach(`<div class="card"><p class="err">The chess engine couldn't start in this browser (${esc(e.message)}).</p></div>`); return; }
    await engine().newGame();
    if (token.cancelled) return;
    if (st.chess.turn() === st.user) userTurn(); else botTurn();
  }

  const evalEl = () => root.querySelector('.pl-game .evalbar');
  // deep analysis plus a quick shallow search (used to spot "Magnus" moves)
  async function analyzeFull(fen) {
    const a = await engine().analyze(fen, { depth: 12, multipv: 2 });
    try { a.shallow = (await engine().analyze(fen, { depth: 4, multipv: 1 })).bestmove; } catch { /* optional */ }
    return a;
  }
  function showEval(fen, analysis) {
    paintEval(evalEl(), fen, analysis, st.user === 'b');
    const top = analysis?.lines?.[0];
    if (top) {
      const pos = new Chess(fen);
      const moverWp = winPct(scoreToCp(top.score));
      st.lastWp = pos.turn() === st.user ? moverWp : 100 - moverWp;
    }
    refreshLeft();
  }

  // ----- left column: match, live stats, focus -----
  function refreshLeft() {
    if (!st.chess) return;
    const L = level();
    const li = LEVELS.indexOf(L);
    const h = st.chess.history();
    const status = st.over ? 'Game over' : st.chess.turn() === st.user ? 'Your move' : 'Bot is thinking';
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let you = 0, bot = 0;
    for (const row of st.chess.board()) for (const p of row) if (p) { if (p.color === st.user) you += val[p.type]; else bot += val[p.type]; }
    const diff = you - bot;
    const material = diff === 0 ? 'Even material' : diff > 0 ? `You're up ${diff}` : `Bot is up ${-diff}`;
    const verdict = st.lastWp == null ? 'Even start' : cap(assess(st.lastWp));
    const share = st.lastWp == null ? 50 : Math.round(st.lastWp);
    $('#pl-match').innerHTML = `
      <div class="m-head"><span class="eyebrow">Match</span><span class="m-status ${st.over ? '' : st.chess.turn() === st.user ? 'is-you' : 'is-bot'}">${esc(status)}</span></div>
      <div class="m-opp"><span class="lv-pc pc-${LV_PC[li]}"></span><div><b>${esc(L.name)}</b><span class="muted mono">≈ ${L.elo}</span></div><span class="m-move mono">Move ${Math.floor(h.length / 2) + 1}</span></div>
      <div class="m-rows">
        <div><span class="muted">Position</span><b>${esc(verdict)}</b></div>
        <div><span class="muted">Material</span><b>${esc(material)}</b></div>
      </div>
      <div class="m-share" aria-label="Your winning chances ${share}%"><i style="width:${share}%"></i></div>
      <div class="m-share-l"><span>You ${share}%</span><span>Bot ${100 - share}%</span></div>`;
    const mine = [], theirs = [];
    (st.grades_ || []).forEach((c) => { if (!c) return; (c.mover === st.user ? mine : theirs).push(c); });
    const acc = (list) => list.length ? (list.reduce((s, c) => s + c.accuracy, 0) / list.length).toFixed(1) : '–';
    const counts = {};
    mine.forEach((c) => { counts[c.cls] = (counts[c.cls] || 0) + 1; });
    const order = ['magnus', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'miss', 'mistake', 'blunder'];
    const tally = order.filter((k) => counts[k]).map((k) => badge(k).replace('</span>', ` <span class="mono">×${counts[k]}</span></span>`)).join('');
    $('#pl-stats').innerHTML = `
      <span class="eyebrow">Live stats</span>
      <div class="acc-row"><div class="acc you"><span>Your accuracy</span><strong>${acc(mine)}</strong></div><div class="acc"><span>Bot accuracy</span><strong>${acc(theirs)}</strong></div></div>
      <div class="tally">${tally || '<p class="empty-note">Your move grades will collect here.</p>'}</div>`;
  }
  function renderFocus() {
    const { list } = topPatterns(1);
    const top = list[0];
    $('#pl-focus').innerHTML = `
      <span class="eyebrow">Before every move</span>
      <ol class="checklist">
        <li><b>Checks</b><span>Can either side give check?</span></li>
        <li><b>Captures</b><span>What can be taken, and is it defended?</span></li>
        <li><b>Threats</b><span>What did their last move attack?</span></li>
      </ol>
      ${top ? `<div class="focus-note">${icon('target')}<div><b>Your focus: ${esc(top.label.toLowerCase())}</b><span>${esc(top.habit || '')}</span></div></div>` : ''}`;
  }
  const cap = (t) => t[0].toUpperCase() + t.slice(1);

  function setPlayers() {
    const L = level();
    $('[data-p="top"]').innerHTML = `<span class="avatar">${icon('robot')}</span><b>Magnus bot</b><span class="muted">${esc(L.name)} · ≈ ${L.elo}</span><span class="captured" id="cap-top"></span>`;
    $('[data-p="bottom"]').innerHTML = `<span class="avatar">${icon('user')}</span><b>You</b><span class="muted">${st.user === 'w' ? 'White' : 'Black'}</span><span class="captured" id="cap-bot"></span>`;
  }

  function coach(html, animate = true) {
    const el = $('#pl-coach');
    el.innerHTML = html;
    if (animate) revealSections(el);
    wireTerms(el);
  }
  function wireTerms() { /* term taps are handled globally in main.js */ }

  function userTurn() {
    if (st.over) return;
    const fen = st.chess.fen();
    st.hintStage = 0;
    st.turnAnalysis = analyzeFull(fen).catch(() => null);
    const token = st.token;
    st.turnAnalysis.then((a) => {
      if (!a || token.cancelled || st.chess.fen() !== fen) return;
      showEval(fen, a);
      if (st.pendingBot) gradeBot(st.pendingBot, a);
      st.pendingBot = null;
    });
    st.live = {
      color: st.user,
      dests: (sq) => st.chess.moves({ square: sq, verbose: true }).map((m) => m.to),
      onMove: (from, to) => onUserMove(from, to),
    };
    if (st.view == null) board.setInteractive(st.live);
    $('#pl-hint').disabled = false;
    $('#pl-undo').disabled = st.chess.history().length < 2;
  }

  async function onUserMove(from, to) {
    const token = st.token;
    const fenBefore = st.chess.fen();
    let promo;
    const piece = st.chess.get(from);
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) promo = await board.askPromotion(to, st.user);
    let m;
    try { m = st.chess.move({ from, to, promotion: promo }); } catch { board.setPosition(fenBefore, { animate: true }); return; }
    board.setInteractive(null);
    board.setPosition(st.chess.fen(), { animate: true });
    board.setMarks({ last: [from, to], good: null, bad: null });
    board.setArrows([]);
    board.clearBadge();
    st.movedAt = performance.now();
    haptic(m.captured ? 'capture' : 'move');

    // Safety net
    if (st.safety && !st.chess.isGameOver()) {
      let danger = dangerOf(fenBefore, m);
      // The quick rule only spots pieces that look loose. Ask the engine whether the move really loses.
      if (danger && !(await engineAgreesItsBad(fenBefore, from + to + (promo || '')))) danger = null;
      if (token.cancelled) return;
      if (danger) {
        const ok = await confirmDanger(danger, m);
        if (token.cancelled) return;
        if (!ok) {
          st.chess.undo();
          board.clearBadge();
          board.setPosition(fenBefore, { animate: true });
          board.setMarks({ last: lastMoveSquares(), bad: null });
          st.movedAt = null;
          coach(`<div class="card"><span class="eyebrow">Taken back</span><p style="margin:0">Good call. Look for a move that keeps your pieces safe.</p></div>`);
          userTurn();
          return;
        }
      }
    }
    renderMoves();
    updateCaptured();
    if (await checkEnd()) return;
    const uci = from + to + (promo || '');
    const ply = st.chess.history().length - 1;
    await gradeMove(fenBefore, uci, ply, token);
    if (token.cancelled || st.over) return;
    botTurn();
  }

  function lastMoveSquares() {
    const h = st.chess.history({ verbose: true });
    const l = h[h.length - 1];
    return l ? [l.from, l.to] : null;
  }

  async function engineAgreesItsBad(fenBefore, uci) {
    const before = await st.turnAnalysis;
    const lines = before?.lines || [];
    if (!lines.length) return true;
    const bestWp = winPct(scoreToCp(lines[0].score));
    // the engine's own top choices are never "blunders"
    if (lines.some((l) => l.pv?.[0] === uci && bestWp - winPct(scoreToCp(l.score)) < 6)) return false;
    let after;
    try { after = await engine().analyze(st.chess.fen(), { depth: 11, multipv: 1 }); } catch { return true; }
    const wp = 100 - winPct(scoreToCp(after.lines[0]?.score));
    return bestWp - wp >= 8;
  }

  function dangerOf(fenBefore, m) {
    const after = new Chess(st.chess.fen());
    const opp = other(st.user);
    const mates = threatsBy(after, opp).mate;
    if (mates.length) return { kind: 'mate', text: `This lets your opponent checkmate you with ${mates[0].san}.` };
    const before = new Chess(fenBefore);
    const looseB = new Map(loosePieces(before, st.user).map((l) => [l.sq, l.gain]));
    for (const l of loosePieces(after, st.user)) {
      if (l.gain < 3) continue;
      if ((looseB.get(l.sq) || 0) >= l.gain) continue;
      if (l.sq === m.to && m.captured && ({ p: 1, n: 3, b: 3, r: 5, q: 9 }[m.captured] >= l.gain)) continue;
      return { kind: 'hang', sq: l.sq, text: `Your ${NAME[l.piece]} on ${l.sq} can be taken, and you'd lose about ${l.gain} points.` };
    }
    return null;
  }

  function confirmDanger(danger, m) {
    return new Promise((resolve) => {
      if (danger.sq) board.setMarks({ bad: danger.sq });
      haptic('error');
      coach(`<div class="card"><div class="warn-box"><div class="row" style="gap:8px">${icon('shield')}<b>Safety net</b></div><p>${esc(danger.text)}</p><div class="row"><button type="button" class="btn btn-primary btn-sm" data-a="back">${icon('undo')}Take it back</button><button type="button" class="btn btn-ghost btn-sm" data-a="go">Play ${esc(m.san)} anyway</button></div></div></div>`);
      shake($('#pl-coach .warn-box'));
      $('#pl-coach [data-a="back"]').addEventListener('click', () => resolve(false));
      $('#pl-coach [data-a="go"]').addEventListener('click', () => { board.setMarks({ bad: null }); resolve(true); });
    });
  }

  async function gradeMove(fenBefore, uci, ply, token) {
    if (st.grades) coach(`<div class="card"><div class="card-head"><span class="card-move">Checking your move</span><span class="card-eval"><span class="thinking"><i></i><i></i><i></i></span></span></div></div>`, false);
    const before = await st.turnAnalysis;
    if (!before || token.cancelled) return;
    let after;
    const fenAfter = st.chess.fen();
    try { after = await analyzeFull(fenAfter); } catch { return; }
    if (token.cancelled) return;
    st.afterUser = { fen: fenAfter, analysis: after };
    showEval(fenAfter, after);
    const hist = st.chess.history({ verbose: true });
    const pm = hist[hist.length - 2];
    let card;
    try { card = await explainAsync({ fen: fenBefore, uci, ply, before, after, prevUci: pm ? pm.from + pm.to : null }); } catch { return; }
    if (token.cancelled) return;
    st.grades_[ply] = card;
    refreshLeft();
    if (!st.grades) return;
    paintGrade(ply, card);
    board.setBadge(uci.slice(2, 4), card.cls, { delay: 60 });
    if (isBad(card.cls)) haptic('error');
    const short = isBad(card.cls) ? (card.why[0] || '') : (card.gains[0] || 'A solid, quiet move.');
    coach(`<div class="card"><div class="card-head">${badge(card.cls)}<span class="card-move">${esc(card.san)}</span></div><p style="margin:0">${renderText(short)}</p><div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-more>${icon('book')}Explain fully</button></div></div>`);
    $('#pl-coach [data-more]').addEventListener('click', () => {
      coach(`<div class="card">${renderCard(card, { actions: {} })}</div>`);
    });
    if (isBad(card.cls)) shake($('#pl-coach .badge'));
  }

  async function gradeBot(p, after) {
    if (!st.grades) return;
    const token = st.token;
    const hist = st.chess.history({ verbose: true });
    const pm = hist[hist.length - 2];
    let card;
    try { card = await explainAsync({ fen: p.fen, uci: p.uci, ply: p.ply, before: p.before, after, prevUci: pm ? pm.from + pm.to : null }); } catch { return; }
    if (token.cancelled || st.chess.history().length !== p.ply + 1) return;
    card = forOpponent(card); // written from your side: "they" is the bot
    st.grades_[p.ply] = card;
    paintGrade(p.ply, card);
    refreshLeft();
    board.setBadge(p.uci.slice(2, 4), card.cls, { delay: 40 });
    const opp = $('#pl-opp');
    opp.hidden = false;
    opp.innerHTML = `<div class="opp-row"><span class="avatar">${icon('robot')}</span><span>Bot played <b class="mono">${esc(card.san)}</b></span>${badge(card.cls)}<button type="button" class="btn btn-ghost btn-sm" data-why>Why?</button></div>`;
    swapIn(opp.firstElementChild);
    opp.querySelector('[data-why]').addEventListener('click', () => coach(`<div class="card">${renderCard(card, { moveLabel: 'Bot: ' + card.san, actions: {} })}</div>`));
  }

  async function botTurn() {
    const token = st.token;
    $('#pl-hint').disabled = true;
    $('#pl-undo').disabled = true;
    const status = document.createElement('div');
    $('[data-p="top"] .muted').insertAdjacentHTML('afterend', '<span class="thinking" id="bot-think" style="margin-left:4px"><i></i><i></i><i></i></span>');
    const t0 = performance.now();
    let uci;
    try { uci = await pickMove(st.chess.fen()); } catch { return; }
    // feel human: think for roughly 0.5 to 1.5 seconds
    const thinkFor = 500 + Math.random() * 1000;
    const elapsed = performance.now() - Math.min(t0, st.movedAt ?? t0);
    if (elapsed < thinkFor) await wait(thinkFor - elapsed);
    $('#bot-think')?.remove();
    void status;
    if (token.cancelled || st.over) return;
    let m;
    try { m = st.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); } catch { return; }
    if (st.view != null) leaveView(false);
    st.live = null;
    board.setPosition(st.chess.fen(), { animate: true });
    board.setMarks({ last: [m.from, m.to], good: null, bad: null });
    board.clearBadge();
    haptic('opponent');
    if (st.afterUser) st.pendingBot = { fen: st.afterUser.fen, before: st.afterUser.analysis, uci, ply: st.chess.history().length - 1 };
    renderMoves();
    updateCaptured();
    if (await checkEnd()) return;
    userTurn();
  }

  async function pickMove(fen) {
    const L = level();
    const eng = engine();
    if (L.uci) return (await eng.analyze(fen, { depth: null, movetime: L.movetime, elo: L.uci })).bestmove;
    if (!L.depth) return (await eng.analyze(fen, { depth: null, movetime: L.movetime })).bestmove;
    const r = await eng.analyze(fen, { depth: L.depth, multipv: L.mpv });
    const pos = new Chess(fen);
    const legal = pos.moves({ verbose: true });
    if (Math.random() < L.slip && legal.length > 1) {
      // an occasional human-looking slip: a random legal move, but never a pointless king walk
      const pool = legal.filter((m) => m.piece !== 'k') || legal;
      const m = pool[Math.floor(Math.random() * pool.length)] || legal[0];
      return m.from + m.to + (m.promotion || '');
    }
    const lines = r.lines.filter((l) => l.pv?.length);
    if (!lines.length) return r.bestmove;
    const top = Math.max(...lines.map((l) => scoreToCp(l.score)));
    const w = lines.map((l) => Math.exp((scoreToCp(l.score) - top) / L.temp));
    const sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum;
    for (let i = 0; i < lines.length; i++) { x -= w[i]; if (x <= 0) return lines[i].pv[0]; }
    return lines[0].pv[0];
  }

  // ----- look back: browse earlier positions without taking anything back -----
  function viewAt(n) {
    if (!st.chess) return;
    const hist = st.chess.history({ verbose: true });
    n = Math.max(0, Math.min(hist.length, n));
    if (n === hist.length) { if (st.view != null) leaveView(true); return; }
    st.view = n;
    const c = new Chess();
    for (const mv of hist.slice(0, n)) c.move(mv.san);
    board.setInteractive(null);
    board.setArrows([]);
    board.setPosition(c.fen(), { animate: true });
    const last = hist[n - 1];
    board.setMarks({ last: last ? [last.from, last.to] : null, good: null, bad: null });
    const g = st.grades_?.[n - 1];
    if (g && last) board.setBadge(last.to, g.cls, { delay: 120 }); else board.clearBadge();
    paintView(hist);
  }
  function paintView(hist) {
    const el = $('.pl-banner');
    const n = st.view;
    const total = hist.length;
    const at = n === 0 ? 'the starting position' : `after <b>${Math.ceil(n / 2)}.${n % 2 ? '' : '..'} ${esc(hist[n - 1].san)}</b>`;
    el.innerHTML = `<div class="banner">${icon('eye')}<span>Looking back: ${at} <span style="opacity:.7">(${n}/${total})</span></span><button type="button" class="btn btn-ghost btn-sm" data-live>Back to live</button></div>`;
    el.querySelector('[data-live]').addEventListener('click', () => leaveView(true));
    root.querySelectorAll('#pl-moves .mv').forEach((b) => b.toggleAttribute('aria-current', +b.dataset.ply === n - 1));
    root.querySelectorAll('#pl-moves .mv[aria-current]').forEach((b) => b.setAttribute('aria-current', 'true'));
    $('#pl-back').disabled = n === 0;
    $('#pl-fwd').disabled = false;
  }
  function leaveView(animate) {
    st.view = null;
    $('.pl-banner').innerHTML = '';
    const hist = st.chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    board.setPosition(st.chess.fen(), { animate });
    board.setMarks({ last: last ? [last.from, last.to] : null, good: null, bad: null });
    const g = st.grades_?.[hist.length - 1];
    if (g && last && st.grades) board.setBadge(last.to, g.cls, { animate: false }); else board.clearBadge();
    if (st.live && !st.over && st.chess.turn() === st.user) board.setInteractive(st.live);
    syncBrowse();
    renderMoves();
  }
  function syncBrowse() {
    const len = st.chess ? st.chess.history().length : 0;
    $('#pl-back').disabled = len === 0 || st.view === 0;
    $('#pl-fwd').disabled = st.view == null;
  }
  $('#pl-back').addEventListener('click', () => viewAt((st.view ?? st.chess.history().length) - 1));
  $('#pl-fwd').addEventListener('click', () => { if (st.view != null) viewAt(st.view + 1); });
  window.addEventListener('keydown', (e) => {
    if (root.hidden || $('.pl-game').hidden || !st.chess || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); $('#pl-back').click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('#pl-fwd').click(); }
    else if (e.key === 'Escape' && st.view != null) leaveView(true);
  });

  // ----- hint -----
  $('#pl-hint').addEventListener('click', async () => {
    if (st.view != null) leaveView(true);
    if (st.chess.turn() !== st.user || st.over) return;
    const a = await st.turnAnalysis;
    if (!a?.lines?.[0]) return;
    const best = a.lines[0].pv[0];
    const piece = st.chess.get(best.slice(0, 2));
    st.hintStage++;
    if (st.hintStage === 1) {
      board.setMarks({ good: best.slice(0, 2) });
      coach(`<div class="card"><span class="eyebrow">Hint 1 of 2</span><p style="margin:0">Look at your <b>${NAME[piece.type]}</b> on ${best.slice(0, 2)}. What can it do?</p><p class="muted" style="margin:0;font-size:14px">Tap Hint again to see the move.</p></div>`);
    } else {
      board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), kind: 'hint' }]);
      const f = moveFacts(st.chess.fen(), best, st.chess.history().length);
      const san = f.move?.san || best;
      coach(`<div class="card"><span class="eyebrow">Hint 2 of 2</span><div class="card-head"><span class="card-move">${esc(san)}</span></div><div class="sec gains"><ul>${(f.gains.length ? f.gains : ['A quiet move that keeps everything protected.']).map((t) => `<li>${renderText(t)}</li>`).join('')}</ul></div></div>`);
    }
  });

  // ----- take back -----
  $('#pl-undo').addEventListener('click', () => {
    if (st.view != null) leaveView(false);
    if (st.over || st.chess.turn() !== st.user || st.chess.history().length < 2) return;
    cancelAll();
    st.chess.undo(); st.chess.undo();
    st.pendingBot = null; st.afterUser = null;
    board.clearBadge();
    board.setArrows([]);
    board.setPosition(st.chess.fen(), { animate: true });
    board.setMarks({ last: lastMoveSquares(), good: null, bad: null });
    renderMoves();
    updateCaptured();
    coach(`<div class="card"><span class="eyebrow">Taken back</span><p style="margin:0">Your move again.</p></div>`);
    userTurn();
  });

  $('#pl-resign').addEventListener('click', () => {
    if (st.over) return;
    cancelAll();
    endGame(st.user === 'w' ? '0-1' : '1-0', 'You resigned');
  });

  // ----- moves + captured -----
  function renderMoves() {
    const h = st.chess.history();
    let html = '';
    h.forEach((san, i) => {
      if (i % 2 === 0) html += `<span class="no">${i / 2 + 1}</span>`;
      html += `<button type="button" class="mv" data-ply="${i}" ${i === h.length - 1 ? 'aria-current="true"' : ''}>${esc(san)}</button>`;
    });
    if (h.length % 2) html += '<span></span>';
    const el = $('#pl-moves');
    el.innerHTML = html || '<p class="empty-note" style="grid-column:1/-1;padding:8px">Moves will appear here.</p>';
    st.grades_?.forEach((c, i) => c && paintGrade(i, c));
    if (st.view == null) el.scrollTop = el.scrollHeight;
    refreshLeft();
    syncBrowse();
    el.querySelectorAll('.mv').forEach((b) => b.addEventListener('click', () => {
      viewAt(+b.dataset.ply + 1);
      const c = st.grades_?.[+b.dataset.ply];
      if (c) coach(`<div class="card">${renderCard(c, { actions: {} })}</div>`);
    }));
  }
  function paintGrade(ply, c) {
    const b = root.querySelector(`.mv[data-ply="${ply}"]`);
    if (!b) return;
    const tone = TONE[c.cls] || 'good';
    b.classList.add(`t-${tone}`);
    const q = { magnus: 'M', brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??' }[c.cls];
    if (q && !b.querySelector('.q')) b.insertAdjacentHTML('beforeend', `<span class="q">${q}</span>`);
  }
  function updateCaptured() {
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const row of st.chess.board()) for (const p of row) if (p && p.type !== 'k') count[p.color][p.type]++;
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const mat = (c) => Object.entries(count[c]).reduce((s, [t, n]) => s + n * val[t], 0);
    const glyph = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
    const lost = (c) => Object.keys(start).map((t) => glyph[t].repeat(Math.max(0, start[t] - count[c][t]))).join('');
    const diff = mat(st.user) - mat(other(st.user));
    const bot = other(st.user);
    $('#cap-bot').textContent = lost(bot) + (diff > 0 ? ` +${diff}` : '');
    $('#cap-top').textContent = lost(st.user) + (diff < 0 ? ` +${-diff}` : '');
  }

  // ----- end -----
  async function checkEnd() {
    const c = st.chess;
    if (!c.isGameOver()) return false;
    let result = '1/2-1/2', why = 'Draw';
    if (c.isCheckmate()) { result = c.turn() === 'w' ? '0-1' : '1-0'; why = 'Checkmate'; }
    else if (c.isStalemate()) why = 'Stalemate';
    else if (c.isThreefoldRepetition()) why = 'Draw by repetition';
    else if (c.isInsufficientMaterial()) why = 'Draw: not enough material to mate';
    else why = 'Draw by the 50-move rule';
    await wait(500);
    endGame(result, why);
    return true;
  }

  function pgn(result) {
    const L = level();
    const c = new Chess();
    for (const san of st.chess.history()) c.move(san);
    const setH = (k, v) => (c.setHeader ? c.setHeader(k, v) : c.header(k, v));
    setH('Event', 'Magnus practice game');
    setH('White', st.user === 'w' ? 'You' : `Magnus bot (${L.name})`);
    setH('Black', st.user === 'b' ? 'You' : `Magnus bot (${L.name})`);
    setH('Result', result);
    let out = c.pgn();
    if (!/ (1-0|0-1|1\/2-1\/2|\*)\s*$/.test(out)) out += ' ' + result;
    return out;
  }

  function endGame(result, why) {
    st.over = true;
    refreshLeft();
    board.setInteractive(null);
    $('#pl-hint').disabled = true;
    $('#pl-undo').disabled = true;
    const won = (result === '1-0' && st.user === 'w') || (result === '0-1' && st.user === 'b');
    const draw = result === '1/2-1/2';
    const title = won ? 'You won' : draw ? 'Draw' : 'Good fight';
    const kingCode = draw ? 'wK' : won ? `${st.user}K` : `${other(st.user)}K`;
    const sub = won ? `${why}. Nicely done against ${level().name}.` : draw ? why + '.' : `${why}. Review the game to see where it turned.`;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="panel result" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="crown"><div class="pc pc-${kingCode}"></div></div><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="row"><button type="button" class="btn btn-primary" data-r="review">${icon('review')}Review this game</button><button type="button" class="btn btn-ghost" data-r="again">Play again</button><button type="button" class="btn btn-ghost" data-r="close">Close</button></div></div>`;
    document.body.appendChild(ov);
    const panel = ov.firstElementChild;
    if (canFade()) {
      ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT });
      const s = spring(0.75, 0.5);
      panel.animate([{ opacity: 0, transform: canMove() ? 'scale(0.94) translateY(10px)' : 'none' }, { opacity: 1, transform: 'none' }], { duration: canMove() ? s.duration : 220, easing: canMove() ? s.easing : EASE_OUT });
    }
    if (won) { haptic('success'); confetti(); }
    const close = () => {
      if (canFade()) ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE_OUT }).onfinish = () => ov.remove();
      else ov.remove();
    };
    ov.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (e.target === ov) return close();
      if (!r) return;
      close();
      if (r === 'review') onReview(pgn(result), st.user);
      if (r === 'again') startGame();
    });
    coach(`<div class="card"><span class="eyebrow">Game over</span><p style="margin:0"><b>${esc(title)}.</b> ${esc(sub)}</p><div class="card-actions"><button type="button" class="btn btn-primary btn-sm" data-rv>${icon('review')}Review this game</button></div></div>`);
    $('#pl-coach [data-rv]').addEventListener('click', () => onReview(pgn(result), st.user));
  }

  return { leave() {} };
}

// A short burst of confetti in the palette colors. Rare moment, so it gets the delight budget.
function confetti() {
  if (!canMove()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#76B7A6', '#A9D7C8', '#EBCFB1', '#3F6A5E', '#1F2C4A', '#FFF3DD'];
  const parts = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.42,
    vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 13 - 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const tick = (t) => {
    const dt = t - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - dt / 1900);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (dt < 1900) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}

void pop; void scoreToCp;
