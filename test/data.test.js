const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const { ROOT, read, loadData } = require('./helpers.js');

const D = loadData();
E.init(D);

test('deck sizes match the rulebook', () => {
  const sizes = Object.fromEntries(['spec', 'boards', 'comp', 'addon', 'task'].map(k => [k, D[k].length]));
  assert.deepEqual(sizes, { spec: 9, boards: 13, comp: 75, addon: 58, task: 40 });
});

test('data.js and data.json hold the same cards', () => {
  const json = JSON.parse(read('data.json'));
  for (const k of ['spec', 'boards', 'comp', 'addon', 'task']) assert.deepEqual(D[k], json[k], k);
});

test('card ids are unique', () => {
  const ids = ['spec', 'boards', 'comp', 'addon', 'task'].flatMap(k => D[k].map(c => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('every card image exists', () => {
  const cards = ['spec', 'boards', 'comp', 'addon', 'task', 'aids'].flatMap(k => D[k]);
  assert.deepEqual(cards.filter(c => !fs.existsSync(path.join(ROOT, c.img))).map(c => c.id), []);
});

test('every Spec Sheet has rules', () => {
  for (const s of D.spec) assert.ok(E.SPEC[s.id], s.id);
});

test('every Task has needs and every Ticket has a rule', () => {
  for (const t of D.task) assert.ok(t.kind === 'task' ? E.TASK_NEEDS[t.id] : E.TICKETS[t.name], t.id);
});

test('every Fix card closes a real Ticket', () => {
  for (const f of D.addon.filter(c => c.kind === 'fix')) assert.ok(E.TICKETS[f.fixes], f.id);
});
