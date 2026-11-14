// Turns engine numbers + board facts into plain-language explanations.
// Text uses glossary markers: [[key|plain phrase|pro phrase]] (see glossary.js).
import {
  Chess, VAL, NAME, other, seeOn, loosePieces, threatsBy, forkFrom, lineTacticFrom,
  discoveredAfter, features, playUci, balance, moveUci, uciToSan, attacksFrom,
} from './chessutil.js?v=9c0f86e500';

// ---------- scores ----------
export function scoreToCp(s) {
  if (!s) return 0;
  if (s.mate != null) return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  return s.cp;
}
export function winPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}
export function fmtScore(s, pov = 1) {
  if (!s) return '0.0';
  if (s.mate != null) {
    const m = s.mate * pov;
    return (m > 0 ? '+' : '-') + 'M' + Math.abs(m);
  }
  const v = (s.cp * pov) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

export const CLASSES = {
  magnus: { label: 'Magnus move', short: 'M', tone: 'magnus' },
  brilliant: { label: 'Brilliant', short: '!!', tone: 'brilliant' },
  great: { label: 'Great move', short: '!', tone: 'great' },
  best: { label: 'Best move', short: '★', tone: 'best' },
  excellent: { label: 'Excellent', short: '✓', tone: 'good' },
  good: { label: 'Good', short: '✓', tone: 'good' },
  inaccuracy: { label: 'Inaccuracy', short: '?!', tone: 'inacc' },
  mistake: { label: 'Mistake', short: '?', tone: 'mistake' },
  blunder: { label: 'Blunder', short: '??', tone: 'blunder' },
  forced: { label: 'Only legal move', short: '•', tone: 'good' },
  miss: { label: 'Miss', short: '✕', tone: 'mistake' },
};
// Which color family each class uses (for move lists and badges).
export const TONE = { magnus: 'magnus', brilliant: 'brilliant', great: 'great', best: 'best', excellent: 'good', good: 'good', forced: 'good', inaccuracy: 'inacc', mistake: 'mistake', miss: 'mistake', blunder: 'blunder' };

export function classify({ bestWp, playedWp, isBest, secondWp, legalCount }) {
  if (legalCount === 1) return 'forced';
  const loss = Math.max(0, bestWp - playedWp);
  if (isBest) {
    if (secondWp != null && bestWp - secondWp > 15 && bestWp > 35 && bestWp < 97) return 'great';
    return 'best';
  }
  if (loss <= 2) return 'excellent';
  if (loss <= 5) return 'good';
  if (loss <= 10) return 'inaccuracy';
  if (loss <= 20) return 'mistake';
  return 'blunder';
}

const BAD = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);
export const isBad = (cls) => BAD.has(cls);

// ---------- wording helpers ----------
const your = (p, sq) => `your ${NAME[p]} on ${sq}`;
const their = (p, sq) => `the ${NAME[p]} on ${sq}`;
const pts = (n) => `${n} point${n === 1 ? '' : 's'}`;
function worth(n) {
  if (n >= 9) return 'about a queen';
  if (n >= 5) return 'about a rook';
  if (n >= 3) return 'about a piece';
  if (n >= 2) return 'two pawns';
  return 'a pawn';
}
export function assess(wp) {
  if (wp >= 97) return 'winning outright';
  if (wp >= 80) return 'clearly better';
  if (wp >= 62) return 'a bit better';
  if (wp > 38) return 'about equal';
  if (wp > 20) return 'a bit worse';
  if (wp > 3) return 'clearly worse';
  return 'lost';
}

// ---------- facts about a single move ----------
// Returns {gains:[], costs:[], tags:Set, sacrifice:bool}
export function moveFacts(fenBefore, uci, plyIndex = 20, prevUci = null) {
  const before = new Chess(fenBefore);
  const c = before.turn();
  const opp = other(c);
  let move;
  const after = new Chess(fenBefore);
  try {
    move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  } catch {
    return { gains: [], costs: [], tags: new Set(), move: null };
  }
  const gains = [];
  const costs = [];
  const tags = new Set();
  let gavePiece = null;
  const moveNo = Math.floor(plyIndex / 2) + 1;

  if (after.isCheckmate()) {
    gains.push('Checkmate. The game is over.');
    tags.add('mate');
    return { gains, costs, tags, move, after };
  }

  // Captures and exchanges
  let sacrifice = false;
  if (move.captured) {
    const victim = VAL[move.captured] + (move.promotion ? VAL[move.promotion] - 1 : 0);
    const back = seeOn(after, move.to); // what the opponent wins back on that square
    const net = victim - back;
    const recapture = prevUci && prevUci.slice(2, 4) === move.to;
    if (recapture && back === 0) { gains.push(`Takes back on ${move.to}, finishing the trade.`); tags.add('trade'); tags.add('recapture'); }
    else if (net > 0 && back === 0) gains.push(`Wins ${their(move.captured, move.to)} for free.`), tags.add('wins-material');
    else if (net > 0) gains.push(`Takes ${their(move.captured, move.to)} and comes out ahead in the [[exchange|trade|exchange]] (+${net}).`), tags.add('wins-material');
    else if (net === 0) gains.push(`Trades: takes ${their(move.captured, move.to)}, and your opponent can take back.`), tags.add('trade');
    else { sacrifice = true; tags.add('sac'); }
  } else if (seeOn(after, move.to) >= 2 && move.piece !== 'p') {
    sacrifice = true; tags.add('sac');
  }

  if (move.flags.includes('k') || move.flags.includes('q')) {
    gains.push('[[castling|Castles]]: your king gets safer and a rook joins the game.');
    tags.add('castle');
  }
  if (move.promotion) gains.push(`Promotes the pawn to a ${NAME[move.promotion]}.`);

  if (after.inCheck()) { gains.push('Gives check, so your opponent has to deal with it right now.'); tags.add('check'); }

  // Development / center (opening only)
  const homeRank = c === 'w' ? '1' : '8';
  if ('nb'.includes(move.piece) && move.from[1] === homeRank && moveNo <= 15) {
    gains.push(`[[development|Brings out|Develops]] your ${NAME[move.piece]}, getting it into the game.`);
    tags.add('develop');
  }
  const fB = features(before, c);
  const fA = features(after, c);
  if (moveNo <= 15 && (['d4', 'e4', 'd5', 'e5'].includes(move.to) || fA.center - fB.center >= 2)) {
    gains.push('[[center|Fights for the middle of the board|Contests the center]], where pieces are strongest.');
    tags.add('center');
  }

  // Tactics created by the move
  const fork = forkFrom(after, move.to);
  if (fork) {
    const names = fork.map((t) => (t.piece === 'k' ? 'king' : `${NAME[t.piece]} on ${t.sq}`));
    gains.push(`[[fork|Attacks two things at once|Forks]] the ${names.join(' and the ')}. They can't save everything.`);
    tags.add('fork');
  }
  const line = lineTacticFrom(after, move.to);
  if (line) {
    const back = line.back.piece === 'k' ? 'king' : NAME[line.back.piece];
    if (line.kind === 'pin') gains.push(`[[pin|Pins]] ${their(line.front.piece, line.front.sq)}: if it moves, the ${back} behind it is exposed.`);
    else gains.push(`[[skewer|Skewers]] the ${line.front.piece === 'k' ? 'king' : NAME[line.front.piece]}: when it moves, the ${back} behind it can be taken.`);
    tags.add(line.kind);
  }
  const disc = discoveredAfter(before, after, move);
  if (disc.length) {
    const d = disc[0];
    gains.push(`[[discovered|Opens a line for your ${NAME[before.get(d.from).type]}|Discovered attack]]: moving out of the way lets your ${NAME[before.get(d.from).type]} on ${d.from} hit the ${d.piece === 'k' ? 'king' : NAME[d.piece]}.`);
    tags.add('discovered');
  }

  // New threats (what we'd do if they ignore us)
  const tB = threatsBy(before, c);
  const tA = threatsBy(after, c);
  if (tA.mate.length && !tB.mate.length && !after.inCheck()) {
    gains.push(`[[threat|Threatens checkmate|Creates a mate threat]] with ${tA.mate[0].san}.`);
    tags.add('mate-threat');
  }
  const prevWins = new Map(tB.wins.map((w) => [w.sq, w.gain]));
  const hits = new Set(attacksFrom(after, move.to));
  const newWin = tA.wins.find((w) => w.gain >= 2 && hits.has(w.sq) && !(prevWins.get(w.sq) >= w.gain) && w.sq !== move.to);
  if (newWin && !fork) {
    gains.push(`[[threat|Threatens|Threatens]] to win ${their(newWin.piece, newWin.sq)}.`);
    tags.add('threat');
  }

  // Did it fix a problem?
  const looseBefore = loosePieces(before, c);
  const looseAfter = loosePieces(after, c);
  const afterMap = new Map(looseAfter.map((l) => [l.sq, l.gain]));
  for (const l of after.inCheck() ? [] : looseBefore) {
    if (l.gain < 2) continue;
    if (l.sq === move.from) {
      if (!afterMap.has(move.to)) { gains.push(`Moves ${your(l.piece, l.sq)} to safety. It was [[hanging|under attack and could be lost|hanging]].`); tags.add('saves'); }
    } else if (!afterMap.has(l.sq)) {
      if (move.captured) gains.push(`Removes the piece that was attacking ${your(l.piece, l.sq)}.`);
      else gains.push(`Protects ${your(l.piece, l.sq)}, which [[hanging|could have been taken for free|was hanging]].`);
      tags.add('saves');
    }
    break;
  }
  const oT_B = threatsBy(before, opp);
  const oT_A = threatsBy(after, opp);
  if (oT_B.mate.length && !oT_A.mate.length) { gains.push('Stops a checkmate threat.'); tags.add('defends-mate'); }

  // Costs
  for (const l of looseAfter) {
    const was = looseBefore.find((x) => x.sq === l.sq);
    if (was && was.gain >= l.gain) continue;
    if (l.gain < 1) continue;
    if (l.sq === move.to && move.captured && VAL[move.captured] >= l.gain) continue; // just a trade
    if (l.sq === move.to && sacrifice) {
      costs.push(`Puts your ${NAME[l.piece]} where it can be taken. Giving material away only pays off if you get something bigger back ([[sacrifice|sacrifice]]).`);
    } else {
      costs.push(`Leaves ${your(l.piece, l.sq)} [[hanging|where it can be taken for free|hanging]] (worth ${pts(l.gain)}).`);
    }
    tags.add('hangs');
    if (l.gain >= 3) { tags.add('gives-piece'); gavePiece = l.piece; }
    break;
  }
  if (oT_A.mate.length && !oT_B.mate.length) { costs.push(`Allows your opponent a checkmate threat: ${oT_A.mate[0].san}.`); tags.add('allows-mate'); }
  if (move.piece === 'k' && !(move.flags.includes('k') || move.flags.includes('q')) && fB.canCastle && !fA.canCastle) {
    costs.push('Your king loses the right to [[castling|castle]] for the rest of the game.');
    tags.add('lost-castling');
  }
  if (fA.castled && fA.shield < fB.shield && move.piece === 'p') {
    costs.push('Pushes a pawn in front of your castled king, which leaves gaps the enemy can use. ([[kingsafety|King safety]])');
    tags.add('weakens-king');
  }
  if (fA.pawns.doubled > fB.pawns.doubled && !tags.has('trade')) { costs.push('Your pawns end up stacked on one file ([[doubled|doubled pawns]]), which makes them weaker.'); tags.add('doubled'); }
  if (fA.pawns.isolated > fB.pawns.isolated && !tags.has('trade')) { costs.push('Leaves a pawn with no friendly pawns next to it ([[isolated|isolated pawn]]), so only pieces can protect it.'); tags.add('isolated'); }
  if (fB.bishopPair && !fA.bishopPair) { costs.push('Gives up your two bishops ([[bishoppair|bishop pair]]), a small long-term edge.'); }
  if (moveNo <= 10 && move.piece === 'q' && fA.undeveloped >= 3 && !move.captured && !tags.has('threat') && !tags.has('mate-threat') && !tags.has('saves')) {
    costs.push('Brings your queen out early while other pieces are still at home. She can get chased around, costing you time ([[tempo|tempo]]).');
    tags.add('early-queen');
  }
  if (moveNo <= 12 && 'nb'.includes(move.piece) && move.from[1] !== homeRank && fA.undeveloped >= 2 && !move.captured && !tags.has('saves') && !fork) {
    costs.push(`Moves a piece that already moved while ${fA.undeveloped} others are still at home ([[tempo|loses time]]).`);
    tags.add('slow');
  }
  // Passed pawns are long-term assets
  if (fA.pawns.passed > fB.pawns.passed) { gains.push('Creates a [[passed|pawn nothing can stop except pieces|passed pawn]], a long-term asset.'); tags.add('passed'); }

  let offered = gavePiece;
  if (sacrifice && (!offered || VAL[move.piece] > VAL[offered])) offered = move.piece;
  return { gains, costs, tags, move, after, sacrifice, fB, fA, gavePiece: offered };
}

// Narrate a principal variation from `fen`. Returns {steps, net, mate, endFen}.
export function narrateLine(fen, pv, pov, maxPlies = 6) {
  const c = new Chess(fen);
  const startBal = balance(c, pov);
  const steps = [];
  let i = 0;
  for (; i < pv.length && i < 12; i++) {
    const u = pv[i];
    let m;
    try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); } catch { break; }
    const mine = m.color === pov;
    let note = '';
    if (c.isCheckmate()) note = 'checkmate';
    else if (m.captured) note = mine ? `takes the ${NAME[m.captured]}` : `takes your ${NAME[m.captured]}`;
    else if (m.promotion) note = 'promotes';
    else if (c.inCheck()) note = 'check';
    if (i < maxPlies) steps.push({ san: m.san, uci: u, note, mine });
    // keep going until the position is quiet so the material count is honest
    if (i >= maxPlies - 1 && !m.captured && !c.inCheck()) { i++; break; }
  }
  return { steps, net: balance(c, pov) - startBal, mate: c.isCheckmate(), endFen: c.fen(), plies: i };
}

// ---------- full explanation for a played move ----------
// ctx: {fen, uci, ply, before:{lines}, after:{lines}}
// before.lines are from the mover's view, after.lines from the opponent's view.
export function explainMove(ctx) {
  const { fen, uci, ply } = ctx;
  const pos = new Chess(fen);
  const mover = pos.turn();
  const legalCount = pos.moves().length;
  const bl = ctx.before?.lines || [];
  const al = ctx.after?.lines || [];
  const best = bl[0];
  const bestUci = best?.pv?.[0];
  const bestWp = winPct(scoreToCp(best?.score));
  const secondWp = bl[1] ? winPct(scoreToCp(bl[1].score)) : null;

  const facts = moveFacts(fen, uci, ply, ctx.prevUci);
  let playedWp;
  if (facts.after?.isCheckmate()) playedWp = 100;
  else if (facts.after && (facts.after.isStalemate() || facts.after.isDraw())) playedWp = 50;
  else playedWp = 100 - winPct(scoreToCp(al[0]?.score));
  const isBest = uci === bestUci;
  let cls = classify({ bestWp, playedWp: isBest ? bestWp : playedWp, isBest, secondWp, legalCount });
  if (cls === 'great' && facts.tags.has('recapture')) cls = 'best'; // an obvious recapture isn't a "find"
  const loss = isBest ? 0 : Math.max(0, bestWp - playedWp);
  let special = null;
  const quiet = facts.move && !facts.move.captured && !facts.after?.inCheck();

  // Brilliant (chess.com's rule): a good piece sacrifice. Best or nearly best, you're not worse
  // afterwards, and you weren't already completely winning without it.
  const gaveMaterial = facts.tags.has('sac') || facts.tags.has('gives-piece');
  const pieceSac = gaveMaterial && facts.move && (facts.move.piece !== 'p' || facts.tags.has('gives-piece'));
  if (pieceSac && loss <= 2 && playedWp >= 45 && !(secondWp != null && secondWp >= 85) && !facts.tags.has('recapture') && legalCount > 1) {
    cls = 'brilliant';
    const what = facts.gavePiece ? `your ${NAME[facts.gavePiece]}` : 'material';
    special = `A real sacrifice: you offer ${what} on purpose, and deeper calculation shows it pays off. Most players would never dare.`;
  }

  // Magnus: the engine's top move that a quick computer search overlooks. A quiet, hidden
  // move only deep calculation finds, and it clearly beats the "obvious" choice.
  const shallow = ctx.before?.shallow;
  if (isBest && shallow && shallow !== uci && quiet && bestWp >= 40 && bestWp < 92 && legalCount > 2) {
    const alt = bl.find((l) => l.pv?.[0] === shallow);
    const altWp = alt ? winPct(scoreToCp(alt.score)) : secondWp;
    if (altWp != null && bestWp - altWp >= 8) {
      cls = 'magnus';
      special = `A move only Magnus would find. A quick engine search picks ${uciToSan(fen, shallow)}, but deep calculation shows ${facts.move.san} is clearly stronger. Hidden, quiet and exact.`;
    }
  }

  // Great: critical to the outcome, usually the only good move.
  if (cls === 'great') special = 'The only good move here. Everything else lets the advantage slip or loses outright.';

  // Miss: your opponent slipped and you had a winning shot, but didn't take it.
  if ((cls === 'inaccuracy' || cls === 'mistake') && bestWp >= 80 && playedWp <= 65) cls = 'miss';

  const card = {
    cls, mover, san: facts.move?.san || uci, uci, loss, bestWp, playedWp,
    accuracy: moveAccuracy(loss),
    gains: facts.gains, costs: facts.costs, tags: facts.tags,
    why: [], soon: null, later: [], better: null, habit: null, cause: null,
    bestUci, bestSan: bestUci ? uciToSan(fen, bestUci) : null,
    special,
  };

  // Near future: opponent's best reply line after the move
  if (al[0]?.pv?.length && facts.after) {
    card.soon = narrateLine(facts.after.fen(), al[0].pv, mover);
  }

  // Why it fails / cause
  if (isBad(cls) && facts.after) card.cause = diagnose(card, facts, ctx, mover);

  // Better move
  if (!isBest && bestUci && cls !== 'forced') {
    const bf = moveFacts(fen, bestUci, ply);
    const bestLine = narrateLine(fen, best.pv, mover);
    card.better = {
      san: card.bestSan, uci: bestUci, gains: bf.gains, costs: bf.costs, line: bestLine,
      wp: bestWp,
    };
    if (!bf.gains.length) {
      card.better.gains = [describeQuiet(fen, bestUci, bf)];
    }
  }

  // Long-term picture
  card.later = longTerm(facts, card, mover);
  card.habit = habitFor(card.cause, cls);
  return card;
}

function describeQuiet(fen, uci, f) {
  const p = f.move?.piece;
  if (!p) return 'Keeps the position under control.';
  const fA = f.fA, fB = f.fB;
  if (fA && fB && fA.mobility - fB.mobility >= 4) return `Activates your ${NAME[p]}: it gets more useful squares to work from.`;
  if (fA && fB && fA.shield > fB.shield) return 'Improves your king\'s shelter.';
  return `A quiet improving move. It keeps your position solid without giving your opponent targets.`;
}

// Figure out the main reason a move went wrong.
function diagnose(card, facts, ctx, mover) {
  const opp = other(mover);
  const why = card.why;
  const soon = card.soon;
  const reply = soon?.steps?.[0];
  const afterFen = facts.after.fen();
  const al = ctx.after.lines || [];
  const bl = ctx.before.lines || [];
  const replyScore = al[0]?.score;

  // Allowed a forced mate
  if (replyScore?.mate > 0) {
    const how = reply?.note?.startsWith('takes your') ? `, which ${reply.note}` : '';
    why.push(`After this, your opponent has a forced checkmate in ${replyScore.mate}. It starts with ${reply?.san || 'a strong reply'}${how}.`);
    return 'allowed-mate';
  }
  // Missed a forced mate
  if (bl[0]?.score?.mate > 0 && !(replyScore?.mate < 0)) {
    why.push(`You had a forced checkmate in ${bl[0].score.mate}, starting with ${card.bestSan}.`);
    return 'missed-mate';
  }
  // Missed a bigger win: the best move won more than whatever went wrong after this one
  const loose = loosePieces(facts.after, mover);
  const bestUci0 = bl[0]?.pv?.[0];
  if (bestUci0 && bestUci0 !== ctx.uci) {
    const bpos = new Chess(ctx.fen);
    const bm = bpos.move({ from: bestUci0.slice(0, 2), to: bestUci0.slice(2, 4), promotion: bestUci0[4] || undefined });
    if (bm.captured) {
      const won = VAL[bm.captured] - seeOn(bpos, bm.to);
      const lost = loose[0]?.gain || 0;
      if (won >= 3 && won > lost) {
        why.push(`You missed ${card.bestSan}, which wins ${their(bm.captured, bm.to)} (${worth(won)}).`);
        if (lost >= 1 && reply?.note.startsWith('takes your')) why.push(`On top of that, ${your(loose[0].piece, loose[0].sq)} can now be taken with ${reply.san}.`);
        return 'missed-tactic';
      }
    }
  }
  // Hung a piece: the opponent's best reply takes it
  if (reply && reply.note.startsWith('takes your') && loose.length) {
    const target = loose.find((l) => al[0].pv[0].slice(2, 4) === l.sq) || loose[0];
    if (target.gain >= 2 || (soon && soon.net <= -2)) {
      why.push(`${cap(your(target.piece, target.sq))} [[hanging|can be taken for free|is hanging]]. Your opponent's best reply is ${reply.san}, winning ${worth(target.gain)}.`);
      if (soon && -soon.net > target.gain) why.push(`It gets worse from there: by the end of the line you are ${pts(-soon.net)} down (${worth(-soon.net)}).`);
      return 'hung-piece';
    }
  }
  // Allowed a tactic: does the reply create a fork/pin?
  if (reply) {
    const rf = moveFacts(afterFen, al[0].pv[0]);
    if (rf.tags.has('fork')) { why.push(`It allows ${reply.san}, which [[fork|attacks two of your pieces at once|forks your pieces]]. You can't save both.`); return 'allowed-fork'; }
    if (rf.tags.has('pin') || rf.tags.has('skewer')) { why.push(`It allows ${reply.san}, which [[pin|pins one of your pieces|creates a pin]] and wins material.`); return 'allowed-pin'; }
    if (rf.tags.has('discovered')) { why.push(`It allows ${reply.san}, a [[discovered|hidden attack from a piece behind|discovered attack]].`); return 'allowed-tactic'; }
    if (rf.tags.has('mate-threat')) { why.push(`It allows ${reply.san}, which threatens checkmate and forces you onto the back foot.`); return 'allowed-threat'; }
  }
  // Ignored an existing threat
  const before = new Chess(ctx.fen);
  const tB = threatsBy(before, opp);
  const stillLoose = loose[0];
  if (tB.wins.length && stillLoose && tB.wins.some((w) => w.sq === stillLoose.sq || w.sq === ctx.uci.slice(2, 4))) {
    why.push(`Your opponent was already attacking ${your(stillLoose.piece, stillLoose.sq)}, and this move doesn't deal with it.`);
    return 'ignored-threat';
  }
  // Missed winning material
  if (card.better || (bl[0]?.pv?.[0])) {
    const bf = moveFacts(ctx.fen, bl[0].pv[0]);
    if (bf.tags.has('wins-material') || bf.tags.has('fork') || bf.tags.has('pin') || bf.tags.has('skewer')) {
      why.push(`You missed ${card.bestSan}. ${bf.gains[0] || ''}`.trim());
      return 'missed-tactic';
    }
  }
  // Loses material over the line
  if (soon && soon.net <= -2) {
    why.push(`After best play you end up ${pts(-soon.net)} down (${worth(-soon.net)}) within ${soon.plies} moves.`);
    return 'loses-material';
  }
  // Positional
  if (facts.tags.has('weakens-king')) { why.push('It weakens your king\'s pawn cover, and your opponent can aim pieces at the gaps.'); return 'king-safety'; }
  if (facts.tags.has('early-queen') || facts.tags.has('slow')) { why.push('It spends time on a move that doesn\'t develop a new piece, so your opponent gets ahead in [[development|getting pieces into the game|development]].'); return 'development'; }
  if (facts.tags.has('lost-castling')) { why.push('Moving the king gives up castling, so your king stays stuck in the middle.'); return 'king-safety'; }
  why.push(`Nothing is lost right away, but the engine's choice ${card.bestSan} keeps a better position (you go from ${assess(card.bestWp)} to ${assess(card.playedWp)}). The difference is about long-term activity, which is harder to spell out.`);
  return 'positional';
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

function longTerm(facts, card, mover) {
  const out = [];
  const { fA, fB } = facts;
  if (fA && fB) {
    if (fA.castled && !fB.castled) out.push('Your king is now tucked away, so you can focus on attacking.');
    if (fA.undeveloped < fB.undeveloped && fA.undeveloped === 0) out.push('All your minor pieces are out. Next, connect your rooks and pick a plan.');
    if (fA.pawns.passed > fB.pawns.passed) out.push('A passed pawn grows stronger as pieces come off the board. Endgames will favor you.');
    if (fA.pawns.isolated > fB.pawns.isolated) out.push('An isolated pawn can become a target later, especially in the endgame.');
    if (fA.bishopPair && !fB.bishopPair) out.push('You now have the two bishops, which get stronger as the board opens up.');
  }
  if (card.soon) {
    const wpAfter = card.playedWp;
    out.push(`With best play from here, the engine rates your position as ${assess(wpAfter)}.`);
  }
  return out.slice(0, 3);
}

export const HABITS = {
  'hung-piece': 'Before you let go of a piece, ask: "What can capture it, and who defends it?" Count attackers and defenders.',
  'allowed-fork': 'Check every enemy knight jump and queen move after your move. Forks hit two undefended or bigger pieces.',
  'allowed-pin': 'Avoid lining up your king or queen behind another piece on the same line as an enemy bishop, rook or queen.',
  'allowed-tactic': 'After choosing a move, look at it from your opponent\'s side: what checks, captures and threats do they get?',
  'allowed-threat': 'Before each move, list your opponent\'s checks and captures. If they have a strong one, deal with it first.',
  'allowed-mate': 'Every move, look at your king: which enemy pieces can reach it, and which squares around it are covered?',
  'missed-mate': 'When your opponent\'s king looks weak, check every check you can give. Forcing moves first.',
  'ignored-threat': 'Start every move by asking: "What did my opponent\'s last move threaten?"',
  'missed-tactic': 'Scan all your captures and checks every move. Free material is easy to miss when you focus on a plan.',
  'loses-material': 'Before trading, count: how many attackers and defenders on that square? Take only when the count is on your side.',
  'king-safety': 'Keep the pawns in front of your castled king where they are unless you have a clear reason to move them.',
  'development': 'In the opening, bring out a new piece every move: knights and bishops first, castle early, queen later.',
  'positional': 'When nothing tactical is happening, improve your worst piece: find a better square for it.',
};
function habitFor(cause, cls) {
  if (cause && HABITS[cause]) return HABITS[cause];
  if (cls === 'great') return 'You found the only good move. Keep looking for forcing moves like this.';
  return null;
}

export const CAUSE_LABEL = {
  'hung-piece': 'Hung a piece',
  'allowed-fork': 'Walked into a fork',
  'allowed-pin': 'Walked into a pin',
  'allowed-tactic': 'Allowed a tactic',
  'allowed-threat': 'Allowed a big threat',
  'allowed-mate': 'Allowed checkmate',
  'missed-mate': 'Missed checkmate',
  'ignored-threat': 'Ignored a threat',
  'missed-tactic': 'Missed a win',
  'loses-material': 'Lost material in a trade',
  'king-safety': 'Weakened the king',
  'development': 'Fell behind in development',
  'positional': 'Positional slip',
};

export { moveUci, playUci };

// ---------- perspective: rewrite a card for a move the reader didn't make ----------
// Cards are written to the player who moved ("you", "your opponent"). For the bot's moves
// (or the opponent's moves in a review) the reader is that player's opponent, so:
// "your opponent" -> "you", and the mover's "you/your" -> "they/their".
const THEY_VERBS = /^(?:can|can't|cannot|missed|offer|let|have|had|go|get|focus|end|are|now|found|were|weren't|will|would|could|should|need|lose|win|keep|play|played|give|gave|took|take|make|made)\b/;
function flipPerspective(text) {
  if (!text) return text;
  const A = '\u0001', B = '\u0002'; // placeholders for the reader's "You"/"you"
  let s = text
    .replace(/\bYour opponent's\b/g, `${A}r`).replace(/\byour opponent's\b/g, `${B}r`)
    .replace(/\bYour opponent has\b/g, `${A} have`).replace(/\byour opponent has\b/g, `${B} have`)
    .replace(/\bYour opponent was\b/g, `${A} were`).replace(/\byour opponent was\b/g, `${B} were`)
    .replace(/\bYour opponent gets\b/g, `${A} get`).replace(/\byour opponent gets\b/g, `${B} get`)
    .replace(/\bYour opponent is\b/g, `${A} are`).replace(/\byour opponent is\b/g, `${B} are`)
    .replace(/\bYour opponent\b/g, A).replace(/\byour opponent\b/g, B);
  s = s
    .replace(/\bYou're\b/g, "They're").replace(/\byou're\b/g, "they're")
    .replace(/\bYou've\b/g, "They've").replace(/\byou've\b/g, "they've")
    .replace(/\bYour\b/g, 'Their').replace(/\byour\b/g, 'their')
    .replace(/\bYou\b/g, 'They')
    .replace(/\byou\b(\s+)(\S+)?/g, (m, sp, next) => (next && THEY_VERBS.test(next) ? `they${sp}${next}` : `them${sp}${next || ''}`));
  return s.split(A).join('You').split(B).join('you');
}
export function forOpponent(card) {
  if (!card || card.pov === 'them') return card;
  const f = flipPerspective;
  const line = (l) => l && { ...l, steps: l.steps.map((st) => ({ ...st, note: f(st.note) })) };
  return {
    ...card,
    pov: 'them',
    gains: card.gains.map(f), costs: card.costs.map(f), why: card.why.map(f), later: card.later.map(f),
    special: f(card.special), habit: null,
    soon: line(card.soon),
    better: card.better && { ...card.better, gains: card.better.gains.map(f), costs: (card.better.costs || []).map(f), line: line(card.better.line) },
  };
}
