#!/usr/bin/env node
/* POST — playability statistics from bot-vs-bot games, using engine.js and bots.js unchanged.
   node tools/playtest.js [--games N] [--opponent apprentice|expert] [--audit named|hidden|off] [--learner-error R]
   Seat 0 is an Apprentice. --learner-error sets how often seat 0 places a part that doesn't fit (an Apprentice opponent keeps 10%; Expert never misplaces parts).
   --audit named and hidden play identically for bots; hidden only changes the wording of fault messages a human sees. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const B = require('../bots.js');

E.init(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8')));

const SEED0 = 100000;   // fixed seeds, so the same options always give the same games
const PROFILE = { apprentice: 'human', expert: 'perfect' };
const DEFAULT_MISTAKE = 0.10;

const DEFAULTS = { games: 1000, opponent: 'apprentice', audit: 'named', learnerError: null };

function check(o) {
  if (!PROFILE[o.opponent]) throw new Error('--opponent must be apprentice or expert');
  if (!['named', 'hidden', 'off'].includes(o.audit)) throw new Error('--audit must be named, hidden or off');
  if (!Number.isInteger(o.games) || o.games < 1) throw new Error('--games must be a positive whole number');
  if (o.learnerError !== null && !(o.learnerError >= 0 && o.learnerError <= 1)) throw new Error('--learner-error must be between 0 and 1');
  if (o.audit === 'off' && o.learnerError !== null) throw new Error('--learner-error has no effect with --audit off (the bots never misplace parts there)');
  return o;
}

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--games') o.games = Number(v);
    else if (k === '--opponent') o.opponent = v;
    else if (k === '--audit') o.audit = v;
    else if (k === '--learner-error') o.learnerError = Number(v);
    else throw new Error(`Unknown option ${k}`);
  }
  return check(o);
}

const kindOf = c => (c.kind === 'fix' ? 'Fix cards' : c.kind === 'prebuilt' ? 'Refurb Prebuilts' : c.deck === 'comp' ? 'Components' : 'Other add-ons');
const isFailedCall = (l, seat) => l.seat === seat && l.kind === 'fault' && !/^Final audit/.test(l.text);

function playGame(seed, o, st) {
  const G = E.newGame({ seed, humanSeat: null, profile: 'human', audit: o.audit });
  G.P[1].profile = PROFILE[o.opponent];
  const mistake = [o.learnerError === null ? DEFAULT_MISTAKE : o.learnerError, DEFAULT_MISTAKE];
  for (const p of G.P) B.setupBot(G, p.seat);
  E.finishSetup(G);
  const age = [new Map(), new Map()];
  for (let guard = 0; !G.over && guard < 400; guard++) {
    const t = E.startTurn(G); if (!t) break;
    const p = G.P[t.seat], before = p.hand.slice();
    G.cfg.mistake = mistake[t.seat];
    for (const _ of B.botTurn(G)) { /* run the turn to the end */ }
    const a = age[p.seat];
    for (const c of p.hand) {
      const n = before.includes(c) ? (a.get(c) || 0) + 1 : 1;
      if (n === 1) st.held[kindOf(c)] = (st.held[kindOf(c)] || 0) + 1;
      if (n === 3) st.stuck[kindOf(c)] = (st.stuck[kindOf(c)] || 0) + 1;
      a.set(c, n);
    }
    for (const c of [...a.keys()]) if (!p.hand.includes(c)) a.delete(c);
  }
  if (!G.result) throw new Error(`game ${seed} did not finish`);
  return G;
}

function run(opts) {
  const o = check(Object.assign({ ...DEFAULTS }, opts));
  const st = { opts: o, games: 0, p1Rounds: [], capHit: 0, ties: 0, firstWins: 0, bonusGames: 0, bonusWins: 0, laterN: 0, laterWins: 0,
    seats: 0, neverPost: 0, spec: {}, recycles: 0, failedCalls: 0, tickets: 0, tasks: 0, seat0FailedCalls: 0, seat0Wins: 0, seat0Score: 0, seat0Never: 0, held: {}, stuck: {} };
  for (let i = 0; i < o.games; i++) {
    const G = playGame(SEED0 + i, o, st), r = G.result;
    st.games++; st.p1Cap = G.cfg.p1Cap;
    st.p1Rounds.push(G.firstPostRound === null ? G.cfg.p1Cap : G.firstPostRound);
    if (G.firstPostRound === null) st.capHit++;
    if (r.winner === -1) st.ties++; else if (r.winner === G.first) st.firstWins++;
    const bonus = G.P.filter(p => p.bonus === 3);
    if (bonus.length === 1) { st.bonusGames++; if (r.winner === bonus[0].seat) st.bonusWins++; }
    for (const p of G.P) {
      const won = r.winner === p.seat, mine = G.log.filter(l => l.seat === p.seat);
      st.seats++;
      if (p.post !== null && p.bonus === 0) { st.laterN++; if (won) st.laterWins++; }
      if (p.post === null) st.neverPost++;
      const s = st.spec[p.spec] = st.spec[p.spec] || { seats: 0, wins: 0, score: 0, posts: [], never: 0 };
      s.seats++; if (won) s.wins++; s.score += r.scores[p.seat].total;
      if (p.post === null) s.never++; else s.posts.push(p.post);
      st.recycles += mine.filter(l => /recycled/.test(l.text)).length;
      st.tickets += mine.filter(l => /closed "/.test(l.text)).length;
      st.tasks += mine.filter(l => /completed "/.test(l.text)).length;
      const failed = G.log.filter(l => isFailedCall(l, p.seat)).length;
      st.failedCalls += failed;
      if (p.seat === 0) { st.seat0FailedCalls += failed; st.seat0Wins += won ? 1 : 0; st.seat0Score += r.scores[0].total; if (p.post === null) st.seat0Never++; }
    }
  }
  return st;
}

const pct = (n, d) => (d ? `${Math.round(1000 * n / d) / 10}%` : '-');
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : '-'; };
const per = (n, d) => (d ? (n / d).toFixed(1) : '-');

function format(st) {
  const o = st.opts, decided = st.games - st.ties, lines = [];
  lines.push(`POST playtest: ${st.games} games, Apprentice vs ${o.opponent === 'expert' ? 'Expert' : 'Apprentice'}, audit ${o.audit}` +
    (o.learnerError === null ? '' : `, seat 0 misplaces parts ${Math.round(o.learnerError * 100)}% of the time`));
  lines.push('', 'Phase 1');
  lines.push(`  Median length ${median(st.p1Rounds)} rounds. Nobody POSTs within ${st.p1Cap} rounds in ${pct(st.capHit, st.games)} of games.`);
  lines.push('', 'POST race');
  lines.push(`  First player wins ${pct(st.firstWins, decided)} of decided games. Ties ${pct(st.ties, st.games)}.`);
  lines.push(`  The only POST-bonus earner wins ${pct(st.bonusWins, st.bonusGames)}. A player who POSTs later wins ${pct(st.laterWins, st.laterN)}.`);
  lines.push(`  Players who never POST: ${pct(st.neverPost, st.seats)}.`);
  lines.push('', 'Spec Sheets (seats, win rate, average score, median POST round, never POSTed)');
  for (const id of Object.keys(st.spec).sort()) {
    const s = st.spec[id];
    lines.push(`  ${id} ${E.byId(id).name.padEnd(20)} ${String(s.seats).padStart(5)} ${pct(s.wins, s.seats).padStart(6)} ${(s.score / s.seats).toFixed(1).padStart(5)} ${String(median(s.posts)).padStart(3)} ${pct(s.never, s.seats).padStart(6)}`);
  }
  lines.push('', 'Per player per game');
  lines.push(`  Recycles ${per(st.recycles, st.seats)}, failed POST calls ${per(st.failedCalls, st.seats)}, tickets closed ${per(st.tickets, st.seats)}, tasks claimed ${per(st.tasks, st.seats)}.`);
  lines.push(`  Seat 0 (the learner): wins ${pct(st.seat0Wins, st.games)}, average score ${(st.seat0Score / st.games).toFixed(1)}, never POSTs ${pct(st.seat0Never, st.games)}, failed POST calls ${(st.seat0FailedCalls / st.games).toFixed(2)} per game.`);
  lines.push('', 'Cards stuck in hand (share of times a card sat in a hand for 3+ turns)');
  lines.push('  ' + Object.keys(st.held).sort().map(k => `${k} ${pct(st.stuck[k] || 0, st.held[k])}`).join(' · '));
  return lines.join('\n');
}

module.exports = { parseArgs, run, format };

if (require.main === module) {
  try { console.log(format(run(parseArgs(process.argv.slice(2))))); }
  catch (e) { console.error(e.message); process.exit(2); }
}
