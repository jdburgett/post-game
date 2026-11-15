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
