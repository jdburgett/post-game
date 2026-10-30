/* POST — computer opponent. A port of the playtest simulator's bot logic (post_sim_v05.py).
   profile 'human'  : plans one play at a time, sometimes plays/keeps its second-best card, sometimes misreads a part.
   profile 'perfect': looks one play ahead and never misreads.  Both take their turn through the same engine calls a person uses. */
(function (root) {
'use strict';
const E = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./engine.js') : root.POST;

const sum = E.sum;
function fitsAlone(b, c) {
  if (c.slot === 'kit') return c.fits.includes(b.id) && E.faultsOf(b, { ram: E.kitHalves(c)[0], sto: E.kitHalves(c)[1] }, null, [], null).length === 0;
  return E.faultsOf(b, { [c.slot]: c }, null, [], null).length === 0;
}

// how much would this card help unmet Tasks / Tickets / the Spec Sheet? (0 = not at all)
function wish(p, c) {
  let v = 0; const hs = E.halvesOf(c);
  for (const t of p.tasks) {
    if (t.kind === 'ticket') { v += E.solves(c, t); continue; }
    const needs = E.taskNeeds(t), unmet = needs.filter(j => !j.state(p));
    if (unmet.length && unmet.some(j => hs.some(h => j.card(h)))) v += t.pts / needs.length;
  }
  if (c.deck === 'comp' && !fitsAlone(p.b, c)) return v;
  const s = E.SPEC[p.spec];
  const unmet = s.reqs.filter(j => !j.state(p));
  for (const j of unmet) if (hs.some(h => j.card(h))) v += (E.specValue(p.spec) + 3) / Math.max(1, s.reqs.length);
  for (const [j, pts] of s.bonus) if (!j.state(p) && hs.some(h => j.card(h))) v += pts * 0.7;
  if ((c.kind === 'fix' || c.kind === 'prebuilt') && v === 0) v = 0.3;
  return v;
}
function p1Score(p) {
  if (!E.coreValid(p, true) || !E.powerOk(p)) return -1;
  const req = E.required(p.b);
  const filled = req.filter(s => p.core[s]).length;
  const q = ['cpu', 'ram', 'sto'].reduce((a, k) => a + (p.core[k] ? p.core[k].tier : 0), 0);
  const sp = E.SPEC[p.spec].reqs.filter(j => j.state(p)).length;
  return 1000 * filled + 10 * q + 800 * sp;
}
// what the owner BELIEVES the build is worth (ignores parts they misread)
function botTotal(p) {
  let sc = p.bonus + sum(p.done.map(x => x.pts));
  if (!E.onlineBelieved(p)) return sc;
  const core = p.core, cpu = core.cpu ? core.cpu.tier : p.b.lapCpuTier;
  let best = Math.max(...E.drives(p).map(d => d.tier));
  if (p.raid && (p.raid.level === 0 || p.raid.level === 10)) best = Math.min(5, best + 1);
  sc += cpu + core.ram.tier + best + E.gpuTier(p);
  const s = E.SPEC[p.spec];
  sc += E.specValue(p.spec) + sum(s.bonus.filter(([j]) => j.state(p)).map(([, pts]) => pts));
  sc += sum(p.tasks.filter(t => t.kind === 'task' && E.taskNeeds(t).every(j => j.state(p))).map(t => t.pts));
  return sc;
}
function cardValue(p, c, phase) {
  if (phase === 1 || !E.onlineBelieved(p)) {
    if (c.deck !== 'comp') return wish(p, c) * 0.5;
    const r = E.tryInstall(p, c, { cpu2NeedsOnline: true });
    const base = p1Score(p);
    let gain = r.q ? (p1Score(r.q) - base) / 100 : 0;
    if (!r.q) {
      const slots = c.slot === 'kit' ? ['ram', 'sto'] : [c.slot];
      if (slots.some(s => E.required(p.b).includes(s) && !p.core[s]) && fitsAlone(p.b, c)) gain = 2;
    }
    return Math.max(gain, 0) + wish(p, c) * 0.3;
  }
  let best = 0;
  if (c.kind === 'fix' || c.kind === 'prebuilt' || c.deck === 'comp') for (const t of p.tasks) if (t.kind === 'ticket') best = Math.max(best, E.solves(c, t));
  const r = E.tryInstall(p, c, {});
  if (r.q) best = Math.max(best, botTotal(r.q) - botTotal(p) + 0.25 * wish(p, c));
  return Math.max(best, 0) + 0.5 * wish(p, c);
}

// ---- setup: choose 1 Spec Sheet and 1 Board from the 3 + 3 dealt
function pickSetup(G, p) {
  const human = p.profile === 'human', rng = G.rng;
  const N = G.decks.comp.length;
  let best = null, bv = -1e9;
  for (const sid of p.dealt.specs) for (const b of p.dealt.boards) {
    const ok = E.boardMeets(sid, b);
    let Ex = 0;
    for (const slot of E.required(b)) {
      const n = G.decks.comp.filter(c => E.halvesOf(c).some(h => h.slot === slot) && fitsAlone(b, c)).length;
      Ex = Math.max(Ex, n ? N / n : 99);
    }
    const tmp = E.newPlayer(0, false, 't'); tmp.b = b; tmp.spec = sid;
    for (const j of E.SPEC[sid].reqs) {
      const n = G.decks.comp.filter(c => E.halvesOf(c).some(h => j.card(h)) && fitsAlone(b, c)).length;
      if (n) Ex = Math.max(Ex, N / n); else if (!j.state(tmp)) Ex = Math.max(Ex, 99);
    }
    let v = (ok ? E.specValue(sid) : -3) - 0.25 * Ex;
    if (human) v += (rng() * 5 - 2.5);
    if (v > bv) { bv = v; best = [sid, b.id]; }
  }
  return best;
}

function p2DeckChoice(G, p) {
  if (!E.onlineBelieved(p)) return 'comp';
  const rng = G.rng; let best = 'addon', bv = -1;
  for (const deck of ['comp', 'addon']) {
    const pile = G.decks[deck];
    const sample = []; const idx = pile.length <= 15 ? pile.map((_, i) => i) : E.shuffle(pile.map((_, i) => i), rng).slice(0, 15);
    for (const i of idx) sample.push(pile[i]);
    let v = sample.length ? sum(sample.map(c => cardValue(p, c, 2))) / sample.length : 0;
    if (p.profile === 'human') v *= 0.7 + rng() * 0.6;
    if (v > bv) { best = deck; bv = v; }
  }
  return best;
}

function bestP1Install(G, p, playsLeft) {
  const human = p.profile === 'human', rng = G.rng, mistakeP = G.cfg.audit === 'off' ? 0 : G.cfg.mistake;
  const best = p1Score(p);
  const cands = [];
  for (const c of p.hand) {
    if (c.deck !== 'comp') continue;
    let r = E.tryInstall(p, c, { cpu2NeedsOnline: true }), mis = false;
    if (!r.q && human && rng() < mistakeP) { r = E.tryInstall(p, c, { cpu2NeedsOnline: true, misread: true }); mis = !!r.q; }
    if (!r.q) continue;
    cands.push({ sc: p1Score(r.q), q: r.q, c, mis });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.sc - a.sc);
  let pick = cands[0];
  if (p.profile === 'perfect') {
    if (playsLeft >= 2) {
      for (const x of cands) for (const c2 of x.q.hand) {
        if (c2 === x.c || c2.deck !== 'comp') continue;
        const r2 = E.tryInstall(x.q, c2, { cpu2NeedsOnline: true });
        if (r2.q) { const s2 = p1Score(r2.q); if (s2 > pick.sc && s2 > cands[0].sc && x.sc >= best) pick = { sc: Math.max(x.sc, best + 1e-6), q: x.q, c: x.c, mis: x.mis }; }
      }
    }
  } else if (cands.length > 1 && rng() < 0.15 && cands[1].sc > best) pick = cands[1];
  if (pick.sc <= best) return null;
  return pick;
}

function* botTurn(G) {
  const t = G.t, p = G.P[t.seat], rng = G.rng, human = p.profile === 'human';
  const phase = t.kind === 'p2' ? 2 : 1;
  if (t.kind === 'p2') {
    E.chooseDeck(G, p2DeckChoice(G, p)); yield { type: 'deck', deck: t.deck };
  } else if (t.step === 'take') {
    let best = null, bv = 0.5;
    for (const c of G.disc.comp) { const v = cardValue(p, c, 1); if (v > bv) { bv = v; best = c; } }
    if (best) { E.takeFromDiscard(G, best.id); yield { type: 'take', card: best }; } else E.skipTake(G);
  }
  const look = E.drawLook(G).slice();
  yield { type: 'draw', n: look.length };
  const sorted = look.slice().sort((a, b) => cardValue(p, b, phase) - cardValue(p, a, phase) + (rng() - 0.5) * 1e-6);
  if (human && sorted.length === 3 && rng() < 0.2) [sorted[1], sorted[2]] = [sorted[2], sorted[1]];
  E.keep(G, sorted.slice(0, 2).map(c => c.id));
  yield { type: 'keep' };

  function* p1Plays() {
    while (t.plays > 0) {
      const pick = bestP1Install(G, p, t.plays);
      if (!pick) break;
      const res = E.install(G, pick.c.id, { cpu2NeedsOnline: true, misread: pick.mis });
      if (!res.ok) break;
      yield { type: 'install', card: pick.c };
    }
  }
  function* p2Plays() {
    while (t.plays > 0) {
      for (const c of p.hand.slice()) if (c.kind === 'adp') { const r = E.install(G, c.id); if (r.ok) yield { type: 'install', card: c }; }
      const acts = [];
      for (const c of p.hand) {
        for (const tk of p.tasks) if (tk.kind === 'ticket' && E.onlineBelieved(p)) { const pts = E.solves(c, tk); if (pts) acts.push({ v: pts, kind: 'ticket', c, tk }); }
        const r = E.tryInstall(p, c, {});
        if (r.q && c.kind !== 'adp') { const gain = botTotal(r.q) - botTotal(p) + 0.25 * wish(p, c); if (gain > 0.05) acts.push({ v: gain, kind: 'install', c }); }
      }
      if (!acts.length) break;
      acts.sort((a, b) => b.v - a.v);
      let pick = acts[0];
      if (human && acts.length > 1 && rng() < 0.2) pick = acts[1 + Math.floor(rng() * (acts.length - 1))];
      if (pick.kind === 'ticket') { const r = E.closeTicket(G, pick.c.id, pick.tk.id); if (!r.ok) break; yield { type: 'ticket', card: pick.c, ticket: pick.tk }; }
      else { const r = E.install(G, pick.c.id); if (!r.ok) break; yield { type: 'install', card: pick.c }; }
    }
  }
  const junkOf = () => p.hand.filter(c => cardValue(p, c, phase) <= 0.05).slice(0, 3);

  if (phase === 1) {
    yield* p1Plays();
    if (!E.ready(p, true) && t.plays > 0) {
      const junk = junkOf();
      if (junk.length >= 2) { E.recycle(G, junk.map(c => c.id)); yield { type: 'recycle', n: junk.length }; yield* p1Plays(); }
    }
    if (p.post === null && E.canCallPost(p) && E.ready(p, true)) { const r = E.callPost(G); yield { type: 'post', result: r }; }
  } else {
    yield* p2Plays();
    E.claimTasks(G, p);
    if (t.plays > 0) {
      const junk = junkOf();
      if (junk.length >= 2) { E.recycle(G, junk.map(c => c.id)); yield { type: 'recycle', n: junk.length }; yield* p2Plays(); }
    }
  }
  E.endPlays(G);
  // discard down to the hand limit: lowest value first
  if (p.hand.length > G.cfg.handLimit) {
    const order = p.hand.slice().sort((a, b) => cardValue(p, a, phase) - cardValue(p, b, phase) + (rng() - 0.5) * 1e-6);
    E.discardDown(G, order.map(c => c.id));
    yield { type: 'discard' };
  }
  E.finishTurn(G);
}

// ---- convenience for tests: play whole games
function setupBot(G, seat) { const p = G.P[seat]; const [sid, bid] = pickSetup(G, p); E.chooseSetup(G, p, sid, bid); }
function playAllBots(G) {
  for (const p of G.P) if (!p.spec) setupBot(G, p.seat);
  E.finishSetup(G);
  let guard = 0;
  while (!G.over && guard++ < 400) {
    const t = E.startTurn(G);
    if (!t) break;
    const p = G.P[t.seat];
    if (p.human) throw new Error('playAllBots needs bot seats');
    for (const _ of botTurn(G)) { /* run to completion */ }
  }
  return G;
}

root.POSTBots = { wish, p1Score, botTotal, cardValue, pickSetup, botTurn, setupBot, playAllBots, p2DeckChoice, fitsAlone };
if (typeof module !== 'undefined') module.exports = root.POSTBots;
})(typeof window !== 'undefined' ? window : globalThis);
