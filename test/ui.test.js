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
