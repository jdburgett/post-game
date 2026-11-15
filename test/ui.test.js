const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('./helpers.js');

const el = () => ({ classList: { add() {}, remove() {} }, innerHTML: '', style: {} });
const app = el(), modal = el();
globalThis.window = globalThis;
window.scrollTo = () => {};
globalThis.document = { getElementById: id => (id === 'app' ? app : modal), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: el, head: { appendChild() {} } };
for (const file of ['data.js', 'engine.js', 'bots.js', 'ui.js']) vm.runInThisContext(read(file), { filename: file });

const { S, ACTS } = window.POSTUI, E = window.POST;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function reachComputerTurn() {
  S.cfg.speed = 'fast'; S.cfg.seed = '7';
  ACTS.start();
  const { specs, boards } = S.G.P[0].dealt;
  const spec = specs.find(s => boards.some(b => E.boardMeets(s, b)));
  S.setup = { spec, board: boards.find(b => E.boardMeets(spec, b)).id };
  ACTS['confirm-setup']();
  await wait(5);
  ACTS['modal-ok']();
  await wait(5);
  assert.equal(S.G.t.seat, 1, 'seed 7 should start with the computer');
}

test('player aids show each aid once', () => {
  ACTS['show-aid']();
  const shown = modal.innerHTML.match(/AID-[A-Z]+-\d/g).filter((src, i, all) => all.indexOf(src) === i);
  assert.equal(shown.filter(id => id.startsWith('AID-RS')).length, 1);
  assert.equal(shown.filter(id => id.startsWith('AID-YT')).length, 1);
  ACTS['close-modal']();
});

test('abandoning during the computer\'s turn stops that turn', async () => {
  const errors = [];
  const onError = e => errors.push(e.message);
  process.on('unhandledRejection', onError);
  await reachComputerTurn();
  ACTS.restart();
  await wait(600);
  process.off('unhandledRejection', onError);
  assert.deepEqual(errors, []);
  assert.equal(S.screen, 'title');
  assert.equal(S.modal, null);
});

const tapCard = (id, offer) => ACTS.zoom({ dataset: { id, offer } });

async function reachMyDraw() {
  let seed = 0;
  while (E.newGame({ seed, humanSeat: 0 }).first !== 0) seed++;
  S.cfg.speed = 'fast'; S.cfg.seed = String(seed);
  ACTS.start();
  const { specs, boards } = S.G.P[0].dealt;
  const spec = specs.find(s => boards.some(b => E.boardMeets(s, b)));
  S.setup = { spec, board: boards.find(b => E.boardMeets(spec, b)).id };
  ACTS['confirm-setup']();
  await wait(5);
  ACTS['modal-ok']();
  await wait(5);
  assert.equal(S.G.t.seat, 0);
}

test('tapping a Spec Sheet in setup opens it with a Choose button', () => {
  ACTS.start();
  assert.doesNotMatch(app.innerHTML, /🔍/);
  assert.match(app.innerHTML, /data-offer="pick-spec"/);
  const id = S.G.P[0].dealt.specs[0];
  tapCard(id, 'pick-spec');
  assert.match(modal.innerHTML, /Choose this Spec Sheet/);
  ACTS['pick-spec']({ dataset: { id } });
  assert.equal(S.setup.spec, id);
  assert.equal(S.modal, null);
  ACTS.restart();
});

test('tapping a drawn card opens it with a Keep button', async () => {
  await reachMyDraw();
  ACTS.draw();
  assert.doesNotMatch(modal.innerHTML, /🔍/);
  assert.match(modal.innerHTML, /data-offer="keep-toggle"/);
  const id = S.G.t.look[0].id;
  tapCard(id, 'keep-toggle');
  assert.match(modal.innerHTML, />Keep</);
  ACTS['keep-toggle']({ dataset: { id } });
  assert.deepEqual(S.keepSel, [id]);
  assert.equal(S.modal.type, 'keep');
  ACTS.restart();
});

test('tapping a card in your hand opens it with a Select button', async () => {
  await reachMyDraw();
  ACTS.draw();
  ACTS['keep-ok']();
  assert.doesNotMatch(app.innerHTML, /🔍/);
  assert.match(app.innerHTML, /data-offer="sel"/);
  const id = S.G.P[0].hand[0].id;
  tapCard(id, 'sel');
  assert.match(modal.innerHTML, />Select</);
  ACTS.sel({ dataset: { id } });
  assert.deepEqual(S.sel, [id]);
  assert.equal(S.modal, null);
  ACTS.restart();
});
