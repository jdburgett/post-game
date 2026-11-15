# Project Subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five report-only Claude Code subagents (exam content, game completion, gameplay, UI and QA), the shared project context they need, and a reusable playtest simulation.

**Architecture:**
- **Shared context:** a project `CLAUDE.md` holds what all agents need to know. Each `.claude/agents/*.md` file holds only its own focus, method and limits.
- **No editing tools:** agents get Read, Grep, Glob and Bash, and must leave tracked files unchanged.
- **Playtest tool:** `tools/playtest.js` runs bot games through the unchanged `engine.js` and `bots.js`, and prints playability statistics. It's tested like the rest of the code.

**Tech Stack:** Node 22 (node:test), ESLint 10 flat config, and Claude Code subagent Markdown files with YAML frontmatter.

**Spec:** `docs/superpowers/specs/2026-11-14-project-subagents-design.md`

---

## Files

| Path | Change | Responsibility |
| --- | --- | --- |
| `.gitignore` | Modify | Ignore `reference/*`, but track `reference/README.md` |
| `reference/README.md` | Create | Says which objectives PDF goes here |
| `reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf` | Local only, never committed | The official objectives |
| `tools/playtest.js` | Create | Runs the bot simulation and prints statistics |
| `test/playtest.test.js` | Create | Tests for the playtest tool |
| `eslint.config.mjs` | Modify | Lint `tools/**/*.js` as Node CommonJS |
| `CLAUDE.md` | Create | Shared project context |
| `.claude/agents/exam-content.md` | Create | Exam content agent |
| `.claude/agents/game-completion.md` | Create | Game completion agent |
| `.claude/agents/gameplay.md` | Create | Gameplay agent |
| `.claude/agents/ui.md` | Create | UI agent |
| `.claude/agents/qa.md` | Create | QA agent |
| `README.md` | Modify | Short "Claude agents" section |
| `docs/superpowers/specs/2026-11-14-project-subagents-design.md` | Modify | Mark the spec as approved |

---

### Task 0: Reference folder for the exam objectives

**Goal:** Add a git-ignored `reference/` folder with a tracked README, and put the objectives PDF there locally.

**Files:**
- Modify: `.gitignore`
- Create: `reference/README.md`
- Local only: `reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf`

**Acceptance Criteria:**
- [ ] `git check-ignore reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf` prints the path
- [ ] `git check-ignore reference/README.md` prints nothing and exits 1
- [ ] `pdftotext -l 2 reference/*.pdf -` contains `Exam Objectives Document Version 4.0`

**Verify:** `git status --short reference/` → shows only `?? reference/README.md` before the commit

**Steps:**

- [ ] **Step 1: Add the ignore rules.** Append to `.gitignore`:

```
reference/*
!reference/README.md
```

- [ ] **Step 2: Create `reference/README.md`**

```markdown
# Reference material (not committed)

Everything in this folder except this README is ignored by git. The repo is public, and these files belong to other people.

## CompTIA A+ Core 1 (220-1201) exam objectives

The `exam-content` agent checks cards against this file:

- **Save as:** `reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf`
- **Get it from:** CompTIA's free download on the A+ page at https://www.comptia.org/certifications/a
- **Version:** the 220-1201 V15 objectives, document version 4.0 or later. The version is printed on the first pages.

Without it, the agent still runs, but labels anything it says about the exam as unverified.
```

- [ ] **Step 3: Copy the PDF in, and check the ignore rules**

```bash
cp /tmp/claude-1000/-home-daniel-post-game/04263f1c-6ca7-4251-9a49-f4a157177254/scratchpad/dl-objectives/f1.pdf reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf
git check-ignore reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf
git check-ignore reference/README.md; echo "exit=$?"
pdftotext -l 2 reference/CompTIA-A-220-1201-V15-Exam-Objectives-4.0.pdf - | grep 'Version 4.0'
```

Expected: the PDF path is printed, then `exit=1`, then `Exam Objectives Document Version 4.0`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore reference/README.md
git commit -m "Add git-ignored reference folder for exam objectives"
```

---

### Task 1: Playtest simulation tool

**Goal:** `tools/playtest.js` runs a fixed range of bot games, then prints playability statistics. A learner-error option models a student who places parts that don't fit.

**Files:**
- Create: `tools/playtest.js`
- Create: `test/playtest.test.js`
- Modify: `eslint.config.mjs`

**Acceptance Criteria:**
- [ ] `node tools/playtest.js --games 20` exits 0 and prints the sections `Phase 1`, `POST race`, `Spec Sheets`, `Per player per game` and `Cards stuck in hand`
- [ ] The same options give the same output every run
- [ ] With 60 games, failed POST calls per game for `--learner-error 0.8` are higher than for `--learner-error 0`
- [ ] Unknown options exit with an error message
- [ ] `npm run lint` and `npm test` pass

**Verify:** `npm test 2>&1 | grep -E '^# (pass|fail)'` → `# fail 0`

**Steps:**

- [ ] **Step 1: Write the failing tests.** Create `test/playtest.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/playtest.test.js`
Expected: FAIL with `Cannot find module '../tools/playtest.js'`

- [ ] **Step 3: Write `tools/playtest.js`**

```js
#!/usr/bin/env node
/* POST — playability statistics from bot-vs-bot games, using engine.js and bots.js unchanged.
   node tools/playtest.js [--games N] [--opponent apprentice|expert] [--audit named|hidden|off] [--learner-error R]
   Seat 0 is an Apprentice. --learner-error sets how often seat 0 places a part that doesn't fit (the computer keeps 10%). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const B = require('../bots.js');

E.init(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8')));

const SEED0 = 100000;   // fixed seeds, so the same options always give the same games
const PROFILE = { apprentice: 'human', expert: 'perfect' };
const DEFAULT_MISTAKE = 0.10;

function parseArgs(argv) {
  const o = { games: 1000, opponent: 'apprentice', audit: 'named', learnerError: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--games') o.games = Number(v);
    else if (k === '--opponent') o.opponent = v;
    else if (k === '--audit') o.audit = v;
    else if (k === '--learner-error') o.learnerError = Number(v);
    else throw new Error(`Unknown option ${k}`);
  }
  if (!PROFILE[o.opponent]) throw new Error('--opponent must be apprentice or expert');
  if (!['named', 'hidden', 'off'].includes(o.audit)) throw new Error('--audit must be named, hidden or off');
  if (!(o.games > 0)) throw new Error('--games must be a positive number');
  if (o.learnerError !== null && !(o.learnerError >= 0 && o.learnerError <= 1)) throw new Error('--learner-error must be between 0 and 1');
  return o;
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
  return G;
}

function run(opts) {
  const o = Object.assign(parseArgs([]), opts);
  const st = { opts: o, games: 0, p1Rounds: [], capHit: 0, ties: 0, firstWins: 0, bonusGames: 0, bonusWins: 0, laterN: 0, laterWins: 0,
    seats: 0, neverPost: 0, spec: {}, recycles: 0, failedCalls: 0, tickets: 0, tasks: 0, seat0FailedCalls: 0, held: {}, stuck: {} };
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
      if (p.seat === 0) st.seat0FailedCalls += failed / o.games;
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
  if (o.learnerError !== null) lines.push(`  Seat 0 failed POST calls: ${st.seat0FailedCalls.toFixed(2)} per game.`);
  lines.push('', 'Cards stuck in hand (share of times a card sat in a hand for 3+ turns)');
  lines.push('  ' + Object.keys(st.held).sort().map(k => `${k} ${pct(st.stuck[k] || 0, st.held[k])}`).join(' · '));
  return lines.join('\n');
}

module.exports = { parseArgs, run, format };

if (require.main === module) {
  try { console.log(format(run(parseArgs(process.argv.slice(2))))); }
  catch (e) { console.error(e.message); process.exit(2); }
}
```

- [ ] **Step 4: Let ESLint treat `tools/` as Node code.** In `eslint.config.mjs`, change
`{ files: ['test/**/*.js'], ...` to `{ files: ['test/**/*.js', 'tools/**/*.js'], ...`. The globals in that block stay as they are.

- [ ] **Step 5: Run the tests and lint, and confirm they pass**

Run: `node --test test/playtest.test.js && npm run -s lint && npm test 2>&1 | grep -E '^# (pass|fail)'`
Expected: all playtest tests pass, lint prints nothing, and `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add tools/playtest.js test/playtest.test.js eslint.config.mjs
git commit -m "Add playtest tool for bot-game playability statistics"
```

---

### Task 2: Shared project context

**Goal:** Add `CLAUDE.md` with what every agent and session needs to know about POST.

**Files:**
- Create: `CLAUDE.md`

**Acceptance Criteria:**
- [ ] It names the exam (220-1201), the owner and contributor, and the intentional audit design
- [ ] It says where the facts live, the check commands, the playtest command and the PR workflow
- [ ] It's under 60 lines

**Verify:** `wc -l CLAUDE.md` → under 60; `grep -c '220-1201\|jdburgett\|intentional\|playtest' CLAUDE.md` → 4 or more

**Steps:**

- [ ] **Step 1: Create `CLAUDE.md`**

```markdown
# POST: project context

POST is a two-player PC-building card game that teaches **CompTIA A+ Core 1 (exam 220-1201)**. It's a static web app (`index.html`, `ui.js`, `engine.js`, `bots.js`, `data.js`) published by GitHub Pages straight from `main`. A merge to `main` is a release.

## People and decisions
- John (`jdburgett`) owns the repo, the rules (`POST_Rulebook_v0.5.pdf`) and the settings.
- Daniel (`d4vastu`) contributes.
- Every change goes through a pull request.
- Rules, card text and balance are John's call. Code fixes can be proposed directly.

## Intentional design (not bugs)
- In audit modes, a player can install a part that doesn't fit, with no warning.
- The Requirements checklist can tick a part that doesn't fit.
- Calling POST then fails the audit. That failure is how the game teaches compatibility.
- Learning mode (audit off) is the exception: there, parts that don't fit are refused.

## Where the facts live
- `POST_Rulebook_v0.5.pdf`: the rules. `pdftotext -layout POST_Rulebook_v0.5.pdf -` reads it.
- `engine.js`: rules code, including the SPEC, TASK_NEEDS and TICKETS tables.
- `bots.js`: the computer opponent. Apprentice is profile `human`, and Expert is `perfect`.
- `data.json` (with `data.js` generated from it): card data.
- `img/cards/*.webp`: card images, whose footers carry the exam objective codes, for example `A+ 220-1201 · 3.3 · 3.4`.
- `README.md`: 9 rule assumptions waiting for John to confirm.
- `reference/`: local-only CompTIA objectives PDF (see `reference/README.md`).

## Checks
- `npm ci`, then `npm test`, `npm run lint` and `ruff check tools`.
- `npm run test:e2e` runs browser tests, once that work is merged.
- `node tools/playtest.js [--games N] [--opponent apprentice|expert] [--audit named|hidden|off] [--learner-error R]` prints playability statistics.

## Workflow
- Use the Superpowers skills for any change: brainstorming before behaviour or rules changes, test-driven development, verification before claiming success, and code review before a PR.
- The agents in `.claude/agents/` (exam-content, game-completion, gameplay, ui, qa) investigate and report. They never change tracked files.
```

- [ ] **Step 2: Verify, then commit**

```bash
wc -l CLAUDE.md; grep -c '220-1201\|jdburgett\|intentional\|playtest' CLAUDE.md
git add CLAUDE.md
git commit -m "Add shared project context for Claude"
```

---

### Task 3: The five agents

**Goal:** Add the five report-only agent definitions.

**Files:**
- Create: `.claude/agents/exam-content.md`, `.claude/agents/game-completion.md`, `.claude/agents/gameplay.md`, `.claude/agents/ui.md`, `.claude/agents/qa.md`

**Acceptance Criteria:**
- [ ] Each file has frontmatter with `name`, `description` and `tools: Read, Grep, Glob, Bash`
- [ ] Each one says never to change, stage or commit tracked files
- [ ] Each one gives the shared report format
- [ ] Each one lists what's out of scope for it

**Verify:** `for f in .claude/agents/*.md; do head -5 $f | grep -c '^name:\|^description:\|^tools: Read, Grep, Glob, Bash$'; done` → five lines of `3`

**Steps:**

- [ ] **Step 1: Shared rules.** Every agent file ends with this block, word for word:

```markdown
## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 2: Create `.claude/agents/exam-content.md`**

```markdown
---
name: exam-content
description: Checks POST's cards against the CompTIA A+ Core 1 (220-1201) exam objectives. Use for card accuracy, terminology and objective coverage.
tools: Read, Grep, Glob, Bash
---

You review POST, a card game that teaches CompTIA A+ Core 1 (220-1201), for exam accuracy.

## Focus
- Card facts and terms are correct for the exam, for example RAM generations and pin counts, sockets, drive interfaces, PSU wattages, ports and printer types.
- Each card's footer objective codes (`A+ 220-1201 · 3.3 · 3.4`) match what the card teaches.
- Coverage: which objectives the game teaches, and which it misses.

## Method
1. Read `reference/README.md`, then the objectives PDF in `reference/` with `pdftotext -layout`. If it's missing, say so at the top and label every exam claim as unverified.
2. Read card data in `data.json`, and look at card images in `img/cards/` with the Read tool for text that's only on the image.
3. Compare, and report mistakes, outdated terms and wrong objective codes.
4. If asked for coverage, build a table of objective, cards that teach it, and gaps.

## Out of scope
Balance, fun, UI and code quality.

## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 3: Create `.claude/agents/game-completion.md`**

```markdown
---
name: game-completion
description: Checks that every rule in the POST rulebook is implemented and that every game can reach the score screen. Use for rule gaps, unimplemented variants and stuck states.
tools: Read, Grep, Glob, Bash
---

You check that POST implements its rulebook completely, and that games always finish.

## Focus
- Every rule in `POST_Rulebook_v0.5.pdf` maps to code in `engine.js`, `bots.js` or `ui.js`.
- Variants that aren't implemented (for example 3–4 players, hard mode and Help Desk teams) and the README's unconfirmed assumptions.
- States where a game can get stuck or never reach the score screen.

## Method
1. `pdftotext -layout POST_Rulebook_v0.5.pdf -` and go through it section by section.
2. For each rule, find the code that implements it (file:line), or mark it missing or different.
3. Run `npm test`, and run `node tools/playtest.js --games 300` for each audit mode, to look for games that don't finish or behave oddly.
4. Report a table of rule, status (implemented, missing or different) and where.

## Out of scope
Whether a rule is good or fun, card accuracy, and UI.

## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 4: Create `.claude/agents/gameplay.md`**

```markdown
---
name: gameplay
description: Measures whether POST games are fair, close and enjoyable, especially for students still learning the hardware. Use for balance, pacing and win-rate questions.
tools: Read, Grep, Glob, Bash
---

You judge POST's gameplay with simulation evidence. Players are often students studying for CompTIA A+, and they'll misplace parts while learning.

## Focus
- How decisive the POST race is, how often players never POST, and how long Phase 1 lasts.
- Spec Sheet balance (win rate, average score and POST round).
- Cards that sit unused in hands, and whether recycling feels like busywork.
- How a learner's mistakes change results: compare `--learner-error 0.1`, `0.3` and `0.5`.

## Method
1. Run `node tools/playtest.js` with the options the question needs. Use 1,000 or more games for any number you report, and say how many you ran.
2. Compare with the playtest notes at the end of `POST_Rulebook_v0.5.pdf`.
3. When you suggest a change, say whether it's a rules change (John's call) or app-only, such as a new opponent level. Don't present untested ideas as results.

## Out of scope
Card accuracy, UI and code quality.

## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 5: Create `.claude/agents/ui.md`**

```markdown
---
name: ui
description: Reviews POST's interface for phone usability, readability and accessibility. Use for screen layout, tap counts, text size and screen reader questions.
tools: Read, Grep, Glob, Bash
---

You review POST's interface. Most players use a phone.

## Focus
- Taps needed for common actions (draw and keep, install, end turn, discard).
- Readability at phone width (390×844), and no sideways scrolling.
- Accessibility: `div`s used as buttons, missing labels, focus handling in the modal, and contrast.

## Method
1. Serve the game with `python3 -m http.server <port>` from the repo root.
2. Take screenshots at 390×844. If `@playwright/test` is in `package.json`, use Playwright, and check WebKit too. Otherwise use Chrome headless (`google-chrome --headless=new --screenshot=<file> --window-size=390,844 <url>`). Look at every screenshot you cite with the Read tool.
3. Read `ui.js` and `style.css` for markup and accessibility problems.
4. Report problems. Propose a redesign only if the question asks for one.

## Out of scope
Rules, balance and card accuracy.

## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 6: Create `.claude/agents/qa.md`**

```markdown
---
name: qa
description: Verifies that a branch or PR works and breaks nothing. Use before opening or merging a PR, or after any change.
tools: Read, Grep, Glob, Bash
---

You are QA for POST. You check that changes work and break nothing. You don't suggest features.

## Focus
- Every check passes.
- The diff has no regressions.
- New behaviour has tests.
- A PR's description matches what it actually changes.

## Method
1. `npm ci`, then `npm run lint`, `npm test`, `ruff check tools`, and `npm run test:e2e` if `package.json` has it. Quote the pass and fail lines.
2. `git diff main...HEAD`, or `gh pr diff <n>` for a PR. Read every changed line, and look for broken callers, unhandled cases and dead code.
3. For each behaviour change, find the test that covers it, or report that it's missing.
4. For a PR, compare `gh pr view <n>` with the diff, and report any claim the code doesn't support.

## Out of scope
New features, rules opinions and redesigns.

## Rules
- Investigate and report only. Never edit, create, stage or commit tracked files. Use a folder from `mktemp -d` for anything temporary.
- Read `CLAUDE.md` first. The audit failing on a part that doesn't fit is intentional.
- Label anything you couldn't verify, and say what you couldn't check and why.

## Report format
Rank findings by impact. For each one, give:
1. **Finding:** one sentence.
2. **Evidence:** a file and line, command output, a screenshot path or a simulation number.
3. **Who decides:** "code fix" or "John's call" (rules, card text, balance).
4. **Next step:** what to do about it.
End with a line on what you didn't cover.
```

- [ ] **Step 7: Verify, then commit**

```bash
for f in .claude/agents/*.md; do head -5 $f | grep -c '^name:\|^description:\|^tools: Read, Grep, Glob, Bash$'; done
git add .claude/agents
git commit -m "Add five report-only Claude agents"
```

---

### Task 4: README and spec status

**Goal:** Document the agents and the playtest tool in the README, and mark the spec approved.

**Files:**
- Modify: `README.md` (after the `## Development` section)
- Modify: `docs/superpowers/specs/2026-11-14-project-subagents-design.md` (status line)

**Acceptance Criteria:**
- [ ] The README has a `## Claude agents` section naming all five agents and the playtest command
- [ ] The spec status line reads `approved 2026-11-14`

**Verify:** `grep -A8 '## Claude agents' README.md` shows all five agent names

**Steps:**

- [ ] **Step 1: Insert into `README.md`, before `## Rebuilding after card changes`:**

```markdown
## Claude agents
`.claude/agents/` has five report-only agents for Claude Code. Ask Claude to use one by name:
`exam-content` (cards against the 220-1201 objectives), `game-completion` (rulebook against code),
`gameplay` (balance and fun, from simulations), `ui` (phone usability and accessibility) and `qa` (checks and regressions).
`node tools/playtest.js` prints playability statistics from bot games. Shared context is in `CLAUDE.md`.
```

- [ ] **Step 2: In the spec, replace** `**Status:** approved in conversation, 2026-11-14. Spec review pending.` **with** `**Status:** approved 2026-11-14.`

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-14-project-subagents-design.md
git commit -m "Document the Claude agents and playtest tool"
```

---

### Task 5: Try each agent once

**Goal:** Run each agent once on a small real question, and confirm it reports in the shared format without changing tracked files.

**Files:** none changed

**Acceptance Criteria:**
- [ ] Each of the five agents returns findings with Finding, Evidence, Who decides and Next step
- [ ] `git status --short` is empty after all five runs, except for the ignored `reference/` PDF
- [ ] `exam-content` cites the objectives PDF, not memory

**Verify:** `git status --short` → no output

**Steps:**

- [ ] **Step 1: Run the five agents with these prompts, through the Agent tool's `subagent_type`.** New project agents may only load when a session starts. If a name isn't available yet, use `general-purpose` with the agent file's body pasted at the top of the prompt, and note that in the results.
  - `exam-content`: "Check the five Upgrade Kit cards (KIT-01 to KIT-05) for exam accuracy and correct objective codes."
  - `game-completion`: "Check the rulebook's Phase 2 section against the code."
  - `gameplay`: "How much does a learner who misplaces parts 30% of the time lose against Apprentice? Use 1,000 games per setting."
  - `ui`: "Count the taps needed for one full turn in Phase 1 on a phone, and report the biggest usability problem you see."
  - `qa`: "Verify the current branch against main."

- [ ] **Step 2: Check each report has the four parts, and check the tree is still clean**

```bash
git status --short
```

Expected: no output.

- [ ] **Step 3: Record the results.** No commit is needed if nothing changed. Summarise the five reports for Daniel.
