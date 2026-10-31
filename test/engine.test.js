const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const { loadData } = require('./helpers.js');

E.init(loadData());
const card = E.byId;
const drive = kind => ({ kind });

function player(boardId, specId = 'SS-08') {
  const p = E.newPlayer(0, true, 'You');
  p.b = card(boardId); p.spec = specId;
  return p;
}
function phase2Turn(plays) {
  const G = E.newGame({ seed: 1, humanSeat: 0 });
  const p = G.P[0];
  delete p.dealt; p.b = card('MB-05'); p.spec = 'SS-08';
  G.phase = 2; G.t = { seat: 0, kind: 'p2', plays, installs: 0, deck: 'addon' };
  return { G, p };
}

test('an adapter can be attached with no plays left', () => {
  const { G, p } = phase2Turn(0);
  p.hand = [card('ADP-01')];
  assert.equal(E.install(G, 'ADP-01').ok, true);
  assert.deepEqual(p.adp.map(c => c.id), ['ADP-01']);
  assert.equal(G.t.plays, 0);
});

test('attaching an adapter does not spend a play', () => {
  const { G, p } = phase2Turn(2);
  p.hand = [card('ADP-01')];
  E.install(G, 'ADP-01');
  assert.equal(G.t.plays, 2);
});

test('other cards need a play', () => {
  const { G, p } = phase2Turn(0);
  p.hand = [card('EXP-06')];
  assert.deepEqual(E.install(G, 'EXP-06'), { ok: false, err: 'No plays left.' });
});

test('3.5" drives move to SAS so a 2.5" drive can use SATA', () => {
  const ds = [...Array(4).fill(drive('sata35')), drive('sata25')];
  assert.equal(E.storageFits(card('MB-09'), ds), true);
});

test('a 2.5" drive uses the bay so a 3.5" drive can use SATA', () => {
  const b = { sata: 1, sas: 0, m2: 0, m2sata: false, bay25: 1, msata: 0 };
  assert.equal(E.storageFits(b, [drive('sata25'), drive('sata35')]), true);
});

test('storage is refused once the ports run out', () => {
  assert.equal(E.storageFits(card('MB-06'), Array(3).fill(drive('sata35'))), false);
  assert.equal(E.storageFits(card('MB-13'), [drive('sata35')]), false);
});

test('a CPU must match the socket', () => {
  const lga = card('CPU-07');
  assert.equal(E.faultsOf(card('MB-02'), { cpu: lga }, null, [], null).length, 0);
  assert.equal(E.faultsOf(card('MB-01'), { cpu: lga }, null, [], null).length, 1);
});

test('a video card PSU kit raises the PSU limit', () => {
  const psu = { cap: 6 };
  assert.equal(E.psuCap(psu, []), 6);
  assert.equal(E.psuCap(psu, [card('EXP-01')]), 9);
});

test('a Refurb Prebuilt closes internal tickets for 1 point only', () => {
  const pc = card('PB-01'), laptop = card('PB-03');
  assert.equal(E.solves(pc, card('TT-04')), 1);
  assert.equal(E.solves(pc, card('TT-11')), 0);
  assert.equal(E.solves(pc, card('TT-10')), 0);
  assert.equal(E.solves(laptop, card('TT-10')), 1);
});

test('a laptop needs only RAM and storage', () => {
  assert.deepEqual(E.required(player('MB-11').b), ['ram', 'sto']);
});

test('an offline build scores no Benchmark or Spec Sheet points', () => {
  const p = player('MB-05');
  p.bonus = 3;
  assert.deepEqual(E.scoreParts(p), { bonus: 3, bench: 0, spec: 0, tasks: 0, total: 3 });
});

test('the same seed deals the same game', () => {
  const deal = () => E.newGame({ seed: 42, humanSeat: 0 }).decks.comp.map(c => c.id);
  assert.deepEqual(deal(), deal());
});

test('every game deals the human a legal Spec Sheet and board', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const { specs, boards } = E.newGame({ seed, humanSeat: 0 }).P[0].dealt;
    assert.ok(specs.some(s => boards.some(b => E.boardMeets(s, b))), `seed ${seed}`);
  }
});
