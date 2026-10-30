# POST — digital playtest (web app), v0.5

Play: open `index.html` through any web host (or locally: `python3 -m http.server` in this folder, then visit http://localhost:8000).
It is plain static files — no server code, no accounts. Works in any modern browser; add to home screen on phones.

## Files
- `index.html, style.css, ui.js` — the interface
- `engine.js` — the rules (compatibility, install, POST + audit, Phase 2, Tasks, Tickets, scoring)
- `bots.js` — computer opponent (Apprentice = "human" profile, Expert = "perfect"), ported from post_sim_v05.py
- `data.js` / `data.json` — card data parsed from POST_Cards_v0.5_duplex.pdf; `img/` — card images cropped from that PDF
- `tools/` — the scripts that rebuilt the data and images from the PDF (extract.py, parse_cards*.py, gen_data.py, crop_cards.py, build.py)

## Rebuilding after card changes
New card PDF -> run tools in order: extract.py, parse_cards.py, parse_cards2.py, gen_data.py, crop_cards.py, build.py
(paths inside are for the original workspace; edit them). Rule changes live in engine.js (SPEC, TASK_NEEDS, TICKETS tables).

## Assumptions I made where the rulebook is silent (please confirm or correct)
1. An Upgrade Kit replaces BOTH your RAM and your main drive. Replacing the kit's RAM with a normal RAM card discards the whole kit.
2. On a server board, a CPU of the same tier as your first CPU goes in as the 2nd CPU.
3. In audit modes you can place any CORE part (CPU, cooler, RAM, drive, PSU) in Phase 1; the audit finds faults. Add-ons (cards, displays, printers, peripherals) and everything in Phase 2 are always checked when installed.
4. Only one POST call per turn, after your plays. A bad call: the first faulty part is discarded, you miss the POST, the other player draws 2.
5. Players who have not POSTed in Phase 2 do NOT draw a Task each turn (rulebook says they take Phase 1 turns). The simulator gave them one.
6. ONLINE requires having POSTed and still meeting the full ready list, including Spec Sheet Requirements.
7. Tasks are claimed automatically. TSK-08 ("connected by network") is not enforced; every laser/inkjet/MFD counts.
8. Safety cap (not in the rulebook): if nobody POSTs in 30 rounds, Phase 2 starts anyway with no POST bonus.
9. Bots audit-proof: audits are exact (the sim let 1 in 5 faults slip past until the final audit).

## Checked
- 600 computer-vs-computer games (Apprentice): 0 errors; first POST median round 5; Spec Sheet win rates 42-56%; first player wins 49%.
- 200 games each for Expert and all three audit modes: 0 errors.
- Scripted full playthrough in headless Chromium at phone size: 0 JavaScript errors.
- NOT tested: Safari/WebKit, real iPhones, screen readers.

## Publishing (GitHub Pages, no command line needed)
1. Make a free GitHub account, click "New repository", name it e.g. `post-game`, set it Public, tick "Add a README".
2. In the repo: "Add file" -> "Upload files", drag in everything from this folder EXCEPT the zip itself (keep the img folder structure), then "Commit changes".
3. Repo "Settings" -> "Pages" -> Source: "Deploy from a branch", Branch: main, folder: / (root) -> Save.
4. After a minute the page shows your public link: https://YOURNAME.github.io/post-game/
Tip: the upload page handles ~100 files at a time; img/cards has 216 files, so upload that folder in two batches if it refuses.
