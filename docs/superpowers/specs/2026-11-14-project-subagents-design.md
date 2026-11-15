# Project subagents: design

**Status:** approved 2026-11-14.

## Changes after approval

Reviews during implementation changed these details. Where this list and the text below disagree, this list wins.

- **Intentional design is narrower than written below.** Only the human player, in Phase 1, with the audit `named` or `hidden`, can install a Component that doesn't fit. Learning mode, all of Phase 2 and Add-on cards refuse misfits (see `CLAUDE.md`).
- **The playtest's opponent rate is fixed.** The opponent keeps a fixed 10% misplace rate as an Apprentice, and never misplaces as Expert. `--learner-error` is rejected with `--audit off`, where bots never misplace. Options are validated in one place, and a game that never finishes stops the run with exit code 2.
- **The playtest also prints seat 0's own results.** These are win rate, average score, never-POST rate and failed POST calls per game.
- **The agents' rules are stricter.** They also never create files in the repo, and never push, open, comment on or merge PRs or issues, even if asked. Each description says "Reports findings only; never edits files." The report format adds a closing line on what wasn't covered.
- **exam-content uses the objectives PDF for topics and codes only.** It doesn't treat the PDF as a source of technical facts. Technical details are labelled "general knowledge, not in the objectives". It reads card images deck by deck, and checks that `data.json` values match the images.
- **game-completion runs more of the playtest.** It runs all three audit modes against both opponents, and watches for exit code 2.
- **ui falls back to reading the code.** It opens `index.html` over `file://`. Without Playwright, it reports tap counts read from code, labelled as not observed.
- **qa avoids reinstalling and checks the right branch.** It runs `npm ci` only when needed. It diffs against `origin/main`, and doesn't switch branches to check a PR.
- **Other files changed too.** `.gitignore` also ignores `.claude/worktrees/`, and `eslint.config.mjs` lints `tools/**/*.js` as Node code.

## Goal

Five Claude Code subagents, each focused on one part of making POST a good teaching game: exam content, game completion, gameplay, UI and QA. Each one investigates and reports. None of them changes the game.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Can agents edit code? | No. They investigate and report. | Changes go through one reviewed path (the Superpowers workflow: brainstorm, test first, fix, PR), and agents never edit the same file at the same time. |
| Shared context | A project `CLAUDE.md`, loaded by every agent and every Claude session in the repo | The background is written once, and John's Claude gets it too. |
| Exam objectives source | CompTIA's 220-1201 objectives PDF, saved locally in `reference/` (git-ignored) | The repo is public, so committing the PDF would republish CompTIA's copyrighted document. |
| Simulation tool | Commit `tools/playtest.js` | The gameplay agent reuses one tested script instead of writing a new simulation every run. |

## Files

| Path | Purpose |
| --- | --- |
| `CLAUDE.md` | Shared project context for agents and sessions |
| `.claude/agents/exam-content.md` | Exam content agent |
| `.claude/agents/game-completion.md` | Game completion agent |
| `.claude/agents/gameplay.md` | Gameplay agent |
| `.claude/agents/ui.md` | UI agent |
| `.claude/agents/qa.md` | QA agent |
| `tools/playtest.js` | Bot simulation that prints playability statistics |
| `test/playtest.test.js` | Tests for `tools/playtest.js` |
| `.gitignore` | Adds `reference/*` and `!reference/README.md`, so only the README in that folder is tracked |
| `reference/README.md` | Says which file to download and where to put it |
| `README.md` | Short section listing the agents and the playtest command |

## Shared context (`CLAUDE.md`)

- **What the game is:** POST teaches CompTIA A+ Core 1 (220-1201). It's a static web app on GitHub Pages, published from `main`, with rules from `POST_Rulebook_v0.5.pdf`.
- **Who decides:** John (`jdburgett`) owns the repo, the rules and the settings. Daniel (`d4vastu`) contributes. Every change goes through a pull request.
- **Intentional design, not bugs:**
  - In audit modes, a player can place a part that doesn't fit, with no warning.
  - The Requirements checklist can tick a part that doesn't fit.
  - Calling POST then fails the audit. That failure is the lesson.
- **Where facts live:**
  - `engine.js` holds the rules, in the SPEC, TASK_NEEDS and TICKETS tables.
  - `data.json` and `data.js` hold card data, and `img/cards/*.webp` holds the card images, including objective codes in each card's footer.
  - The README lists 9 unconfirmed rule assumptions.
- **Checks:** `npm test`, `npm run lint`, `ruff check tools`, plus `npm run test:e2e` once the browser tests are merged.
- **Workflow:** use the Superpowers skills for any change.

## Common rules for all five agents

- **Tools:** Read, Grep, Glob and Bash. They don't get Edit or Write.
- **No changes:** never change, stage or commit tracked files. Anything temporary goes in a folder from `mktemp -d`.
- **Report format:** findings ranked by impact. Each finding has:
  - **Evidence:** a file and line, command output, a screenshot path or a simulation number.
  - **Who decides:** "code fix" or "John's call", for rules and content.
  - **Next step:** a suggested action.
- **Honesty:** label anything unverified, and say what couldn't be checked and why.

## The five agents

### exam-content
- **Focus:** card facts are accurate against the 220-1201 objectives, and the game covers them.
- **Method:**
  - Read the card data and images, including each footer's objective codes.
  - Check facts and terms against `reference/` (the objectives PDF).
  - Map which objectives the game covers and which it misses.
  - If the PDF is missing, say so, and label anything from memory as unverified.
- **Out of scope:** balance and fun.

### game-completion
- **Focus:** every rule in the rulebook is implemented, and every game can reach the score screen.
- **Method:**
  - Go through the rulebook section by section and match each rule to `engine.js`, `bots.js` or `ui.js`.
  - List variants that aren't implemented.
  - Track the README's unconfirmed assumptions.
  - Look for states that can get stuck, using the existing tests and bot games.
- **Out of scope:** whether a rule is good.

### gameplay
- **Focus:** games are fair, close and fun, especially for students who are still learning.
- **Method:** run `node tools/playtest.js` and read the statistics: race decisiveness, players who never POST, Spec Sheet win rates, cards stuck in hand, and how a learner's mistakes affect results. Compare the numbers with the rulebook's playtest notes.
- **Out of scope:** card accuracy.

### ui
- **Focus:** the game is easy to use and read on a phone, and accessible.
- **Method:**
  - Take screenshots at phone size, with Playwright where it's available and headless Chrome otherwise.
  - Count taps per action.
  - Check accessibility: `div`s used as buttons, missing labels and focus handling.
- **Out of scope:** rules. It reports problems, and proposes redesigns only when asked.

### qa
- **Focus:** changes work and don't break anything.
- **Method:**
  - Run every check.
  - Read the branch's changes against `main` and look for regressions.
  - Check a PR's description against what it actually changes, and confirm new behaviour has tests.
- **Out of scope:** feature ideas.

## `tools/playtest.js`

- **Command:** `node tools/playtest.js [--games N] [--opponent apprentice|expert] [--audit named|hidden|off] [--learner-error R]`
- **Defaults:** 1,000 games, Apprentice against Apprentice, audit `named`. A fixed seed range makes results repeatable.
- **`--learner-error R`:** sets seat 0's misread rate to R, while the computer keeps the configured `mistake` rate.
- **Output:** plain text covering:
  - how long Phase 1 lasts
  - how often the first player wins
  - the win rate of the POST-bonus earner, and of a player who POSTs later
  - how often a player never POSTs
  - win rate, average score and median POST round for each Spec Sheet
  - recycles, failed POST calls, closed tickets and claimed tasks per player
  - how often each kind of card sits in a hand for 3 or more turns
- **Uses only** `engine.js` and `bots.js` as they are, with no changes to either.

## Testing

- `test/playtest.test.js` checks that a small run, about 20 games:
  - finishes
  - prints every section
  - gives the same output for the same seed
  - makes failed POST calls go up as `--learner-error` goes up
- Agent files are checked by reading them. After the change, each agent is invoked once on a small real question to confirm it reports in the required format and leaves `git status` clean.

## Out of scope

- An orchestrator agent that runs all five.
- Agents that edit code.
- Any fix to issues the agents find. Those go through their own brainstorm, test and PR.
