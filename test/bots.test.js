const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const B = require('../bots.js');
const { loadData } = require('./helpers.js');

E.init(loadData());

for (const profile of ['human', 'perfect']) {
  test(`${profile} bots only keep a legal Spec Sheet and board`, () => {
    for (let seed = 0; seed < 3000; seed++) {
      const G = E.newGame({ seed, humanSeat: null, profile });
      for (const p of G.P) {
        B.setupBot(G, p.seat);
        assert.ok(E.boardMeets(p.spec, p.b), `seed ${seed} seat ${p.seat}: ${p.spec} on ${p.b.id}`);
      }
    }
  });
}

test('a bot attaches an adapter when it has no plays', () => {
  const G = E.newGame({ seed: 3, humanSeat: null, plays: 0 });
  for (const p of G.P) B.setupBot(G, p.seat);
  E.finishSetup(G);
  G.phase = 2; G.P[G.first].post = 0;
  const p = G.P[E.startTurn(G).seat], adapter = E.byId('ADP-01');
  G.decks.addon = G.decks.addon.filter(c => c !== adapter);
  p.hand.push(adapter);
  for (const _ of B.botTurn(G)) { /* run to completion */ }
  assert.deepEqual(p.adp, [adapter]);
});

for (const audit of ['named', 'hidden', 'off']) {
  for (const profile of ['human', 'perfect']) {
    test(`bot games finish (${profile}, audit ${audit})`, () => {
      for (let seed = 0; seed < 40; seed++) {
        const G = B.playAllBots(E.newGame({ seed, humanSeat: null, profile, audit }));
        assert.equal(G.over, true, `seed ${seed}`);
      }
    });
  }
}
