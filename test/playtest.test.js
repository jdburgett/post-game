const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const P = require('../tools/playtest.js');

test('a short run finishes and prints every section', () => {
  const out = P.format(P.run({ games: 20 }));
  for (const heading of ['Phase 1', 'POST race', 'Spec Sheets', 'Per player per game', 'Cards stuck in hand']) assert.match(out, new RegExp(heading));
});

test('the same options give the same result', () => {
  assert.equal(P.format(P.run({ games: 15 })), P.format(P.run({ games: 15 })));
});

test('a learner who misplaces parts fails more POST calls', () => {
  const careful = P.run({ games: 60, learnerError: 0 }), careless = P.run({ games: 60, learnerError: 0.8 });
  assert.ok(careless.seat0FailedCalls > careful.seat0FailedCalls, `${careless.seat0FailedCalls} vs ${careful.seat0FailedCalls}`);
});

test('unknown options are rejected', () => {
  assert.throws(() => P.parseArgs(['--speed', 'fast']), /Unknown option --speed/);
  assert.throws(() => P.parseArgs(['--opponent', 'robot']), /--opponent/);
});

test('the command line prints a report', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'playtest.js'), '--games', '5'], { encoding: 'utf8' });
  assert.match(out, /5 games/);
});
