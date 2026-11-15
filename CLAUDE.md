# POST: project context

POST is a two-player PC-building card game that teaches **CompTIA A+ Core 1 (exam 220-1201)**. It's a static web app (`index.html`, `ui.js`, `engine.js`, `bots.js`, `data.js`) published by GitHub Pages straight from `main`. A merge to `main` is a release.

## People and decisions
- John (`jdburgett`) owns the repo, the rules (`POST_Rulebook_v0.5.pdf`) and the settings.
- Daniel (`d4vastu`) contributes.
- Never push, open a pull request or merge unless the person you're working with asks.
- Every change goes through a pull request.
- Rules, card text and balance are John's call. Code fixes can be proposed directly.

## Intentional design (not bugs)
- In Phase 1, with the audit `named` or `hidden`, the human player can install a Component that doesn't fit, with no warning. The Requirements checklist can then tick it. Calling POST fails the audit, and that failure is how the game teaches compatibility.
- Everywhere else, parts that don't fit are refused with a reason: Learning mode (audit `off`), all of Phase 2, and Add-on cards.
- Still bugs: a misfit accepted where it should be refused, a fitting part refused, the audit passing a misfit or failing a fit, and text that contradicts this behaviour.

## Where the facts live
- `POST_Rulebook_v0.5.pdf`: the rules. `pdftotext -layout POST_Rulebook_v0.5.pdf -` reads it.
- `engine.js`: rules code, including the SPEC, TASK_NEEDS and TICKETS tables.
- `bots.js`: the computer opponent. Apprentice is profile `human`, and Expert is `perfect`.
- `data.json` (with `data.js` generated from it): card data.
- `img/cards/*.webp`: card images, whose footers carry the exam objective codes, for example `A+ 220-1201 · 3.3 · 3.4`.
- `README.md`: rule assumptions waiting for John to confirm (section "Assumptions I made where the rulebook is silent").
- `reference/`: local-only CompTIA objectives PDF (see `reference/README.md`).

## Checks
- Node 22. `npm ci`, then `npm test` (runs `test/*.test.js`), `npm run lint` and `ruff check tools` (CI uses `pipx run ruff==0.8.6 check tools`).
- If `package.json` has a `test:e2e` script, `npm run test:e2e` runs the browser tests.
- `node tools/playtest.js [--games N] [--opponent apprentice|expert] [--audit named|hidden|off] [--learner-error R]` prints playability statistics.

## Workflow
- Use the Superpowers skills for any change: brainstorming before behaviour or rules changes, test-driven development, verification before claiming success, and code review before a PR.
- The agents in `.claude/agents/` (exam-content, game-completion, gameplay, ui, qa) investigate and report. They're instructed never to change tracked files (they have no Edit or Write tools, but they do have Bash).
