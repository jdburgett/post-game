/* POST — game UI. Vanilla JS. Human is always seat 0; the computer is seat 1. */
(function () {
'use strict';
const E = window.POST, B = window.POSTBots;
E.init(window.POST_DATA);
const $app = document.getElementById('app'), $modal = document.getElementById('modal');
const ME = 0;
const S = { screen: 'title', G: null, cfg: { profile: 'human', audit: 'named', p2Rounds: 5, speed: 'normal', seed: '' }, sel: [], busy: false,
  setup: { spec: null, board: null }, modal: null, modalResolve: null, keepSel: [], shownPhase: null, aids: window.POST_DATA.aids };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const realCard = c => (c && c.kitHalf ? c.kit : c);
const img = (c, cls) => `<img class="cardimg ${cls || ''}" src="${realCard(c).img}" alt="${esc(realCard(c).name)}" draggable="false">`;
const backImg = (deck, cls) => `<img class="cardimg ${cls || ''}" src="img/back-${deck}.webp" alt="${deck} deck" draggable="false">`;
const me = () => S.G.P[ME];
const opp = () => S.G.P[1 - ME];
const myTurn = () => S.G && !S.G.over && S.G.t && S.G.t.seat === ME && !S.busy;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const profName = { human: 'Apprentice', perfect: 'Expert' };

// ================================================================ rendering
function render() {
  const sc = {};
  document.querySelectorAll('[data-scroll]').forEach(e => { sc[e.dataset.scroll] = e.scrollLeft; });
  const y = window.scrollY;
  $app.innerHTML = ({ title: renderTitle, setup: renderSetup, game: renderGame, over: renderOver })[S.screen]();
  document.querySelectorAll('[data-scroll]').forEach(e => { if (sc[e.dataset.scroll] != null) e.scrollLeft = sc[e.dataset.scroll]; });
  window.scrollTo(0, y);
  renderModal();
  layoutGame();
}
function layoutGame() {
  const g = document.querySelector('.game'); if (!g) return;
  const a = document.querySelector('.actions');
  g.style.paddingBottom = ((a ? a.offsetHeight : 0) + 20) + 'px';
}

// ---- title ----
function radio(name, val, cur, title, desc) {
  return `<label class="${cur === val ? 'on' : ''}"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''} data-act="opt" data-k="${name}"><span><b>${title}</b><span class="muted small">${desc}</span></span></label>`;
}
function renderTitle() {
  const c = S.cfg;
  return `<div class="page">
    <div class="logo">POST</div>
    <div class="muted">The PC Build Card Game · CompTIA A+ Core 1 (220-1201) · playtest v0.5</div>
    <div class="card-panel">
      <p>You're a tech at a small computer shop. First race the computer to build a PC that <b>POSTs</b>. Then work service calls: install add-ons, finish Tasks and close Trouble Tickets. Best score wins.</p>
      <p class="muted small">Two players: you and a computer opponent. Your Spec Sheet is secret — and so is theirs.</p>
    </div>
    <div class="card-panel">
      <h3>Opponent</h3>
      <div class="opt">
        ${radio('profile', 'human', c.profile, 'Apprentice', 'Plays like a person: sometimes second-guesses, sometimes misreads a part.')}
        ${radio('profile', 'perfect', c.profile, 'Expert', 'Plans a play ahead and never misreads a part.')}
      </div>
      <h3>Audit when someone calls POST</h3>
      <div class="opt">
        ${radio('audit', 'named', c.audit, 'Automatic audit — fault named (default)', 'Anyone can place any part. If a call is faulty the audit tells you which part and why.')}
        ${radio('audit', 'hidden', c.audit, 'Automatic audit — fault hidden', 'Same, but it only says "something doesn\'t fit". You work out what.')}
        ${radio('audit', 'off', c.audit, 'Learning mode — no audits', 'Spec Sheets face-up, parts that don\'t fit are refused, and you can ask “Would this fit?”.')}
      </div>
      <h3>Phase 2 length</h3>
      <div class="opt">
        ${radio('p2', '5', String(c.p2Rounds), '5 rounds', 'The full game.')}
        ${radio('p2', '3', String(c.p2Rounds), '3 rounds', 'Class-period version.')}
      </div>
      <h3>Computer speed</h3>
      <div class="opt">
        ${radio('speed', 'normal', c.speed, 'Normal', 'Pauses so you can follow each move.')}
        ${radio('speed', 'fast', c.speed, 'Fast', 'Short pauses.')}
      </div>
      <div class="row wrap"><label class="muted small">Game number (optional, to replay a deal) <input id="seed" value="${esc(c.seed)}" inputmode="numeric" style="width:8em;padding:.35em;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--text)"></label></div>
    </div>
    <button class="primary" style="width:100%;font-size:1.1rem;padding:.9em" data-act="start">Start game</button>
    <p class="muted small center" style="margin-top:1rem"><a style="color:var(--accent)" href="POST_Rulebook_v0.5.pdf" target="_blank" rel="noopener">Rulebook (PDF)</a></p>
  </div>`;
}

// ---- setup: choose 1 of 3 Spec Sheets and 1 of 3 boards ----
function renderSetup() {
  const p = me(), d = p.dealt;
  const row = (items, kind) => `<div class="pick-row" data-scroll="pick-${kind}">${items.map(c => `<div class="pick ${S.setup[kind] === c.id ? 'on' : ''}" data-act="pick-${kind}" data-id="${c.id}">${img(c)}<span class="mag" data-act="zoom" data-id="${c.id}">🔍</span></div>`).join('')}</div>`;
  const specs = d.specs.map(id => E.byId(id)), boards = d.boards;
  const ok = S.setup.spec && S.setup.board;
  return `<div class="page">
    <h2>Set up your shop</h2>
    <p class="muted">Keep <b>1 Spec Sheet</b> (keep it secret!) and <b>1 Motherboard that can meet it</b>. The rest go back in the box.</p>
    <div class="card-panel"><h3>Your Spec Sheets</h3>${row(specs, 'spec')}</div>
    <div class="card-panel"><h3>Your Motherboards</h3>${row(boards, 'board')}
      <p class="muted small">Some sheets name a board (Server, Laptop, ITX, Micro Workstation, any board with TPM). For the others, check the Requirements against the board — for example 32 GB+ RAM needs a DDR4 or DDR5 desktop board.</p></div>
    <button class="primary" style="width:100%;font-size:1.05rem;padding:.85em" data-act="confirm-setup" ${ok ? '' : 'disabled'}>Keep these two</button>
  </div>`;
}

// ---- game ----
function thumb(c, size, extra) { return `<div class="thumb ${size}" data-act="zoom" data-id="${realCard(c).id}">${img(c)}${extra || ''}</div>`; }
function buildParts(p) {
  const c = p.core, r1 = [p.b];
  if (c.cpu) r1.push(c.cpu); if (p.cpu2) r1.push(p.cpu2); if (c.cooler) r1.push(c.cooler);
  if (p.kit) r1.push(p.kit); else if (c.ram) r1.push(c.ram);
  const ds = p.kit ? p.drives : (c.sto ? [c.sto].concat(p.drives) : p.drives);
  r1.push(...ds); if (p.raid) r1.push(p.raid); r1.push(...p.exp); if (c.psu) r1.push(c.psu);
  return { r1, r2: [].concat(p.dsp, p.adp, p.prn, p.per) };
}
const SLOTNAME = { cpu: 'CPU', cooler: 'Cooler', ram: 'RAM', sto: 'Storage', psu: 'PSU' };
function buildHtml(p, size, key, placeholders) {
  const { r1, r2 } = buildParts(p);
  let ph = '';
  if (placeholders) for (const s of E.required(p.b)) if (!p.core[s]) ph += `<div class="thumb ${size}"><div class="slotph">${SLOTNAME[s]}</div></div>`;
  return `<div class="rowlabel">Row 1 · inside the case</div>
    <div class="scroller" data-scroll="${key}-1">${r1.map(c => thumb(c, size)).join('')}${ph}</div>
    <div class="rowlabel">Row 2 · outside the case</div>
    <div class="scroller" data-scroll="${key}-2">${r2.length ? r2.map(c => thumb(c, size)).join('') : '<span class="muted small" style="padding:.4rem">Nothing yet</span>'}</div>`;
}
function pileHtml(deck, label) {
  const G = S.G, n = G.decks[deck].length, top = G.disc[deck][G.disc[deck].length - 1];
  const draw = `<div class="pile"><div class="stack">${n ? backImg(deck) : '<div class="empty">empty</div>'}</div><b>${n}</b>${label}</div>`;
  const dis = deck === 'task' ? '' : `<div class="pile click" data-act="view-disc" data-d="${deck}"><div class="stack">${top ? img(top) : '<div class="empty">—</div>'}</div><b>${G.disc[deck].length}</b>discard</div>`;
  return draw + dis;
}
function specBox() {
  const p = me(), st = E.specStatus(p), sp = E.byId(p.spec);
  return `<div class="spec"><div class="thumb" data-act="zoom" data-id="${sp.id}">${img(sp)}</div>
    <div class="checks"><h4>Requirements to POST</h4>${st.reqs.map(r => `<div class="${r.met ? 'ok' : 'no'}">${r.met ? '✔' : '☐'} ${esc(r.label)}</div>`).join('')}
    <h4>Bonus if you have it at the end</h4>${st.bonus.map(r => `<div class="${r.met ? 'ok' : 'no'}">${r.met ? '✔' : '☐'} ${esc(r.label)} <b>+${r.pts}</b></div>`).join('')}</div></div>`;
}
function taskThumb(t) {
  const p = me(); let bd;
  if (t.kind === 'task') { const s = E.taskStatus(p, t); const n = s.filter(Boolean).length; bd = E.taskMet(p, t) ? '<span class="bd good">✔ ready</span>' : `<span class="bd">${n}/${s.length}</span>`; }
  else bd = '<span class="bd warn">ticket</span>';
  return `<div class="thumb t" data-act="zoom" data-id="${t.id}">${img(t)}${bd}</div>`;
}
function oppPanel() {
  const o = opp(), G = S.G;
  const status = o.post !== null ? `<span class="chip good">POSTed · round ${o.post}</span>` : '<span class="chip warn">not POSTed</span>';
  const turn = G.t && G.t.seat === o.seat && !G.over ? '<span class="chip turn">their turn</span>' : '';
  const revealed = G.cfg.audit === 'off';
  return `<div class="panel"><h3>Computer <span class="chip">${profName[o.profile]}</span> ${status} ${turn}
    <span class="chip">${plural(o.hand.length, 'card')} in hand</span> <span class="chip">${o.done.length} done</span></h3>
    <div class="row" style="gap:.5rem;align-items:flex-start"><div class="thumb s" ${revealed ? `data-act="zoom" data-id="${o.spec}"` : ''}>${revealed ? img(E.byId(o.spec)) : backImg('spec')}</div>
    <div class="grow" style="min-width:0"><div class="scroller" data-scroll="opp">${(() => { const bp = buildParts(o); return bp.r1.concat(bp.r2).map(c => thumb(c, 's')).join(''); })()}</div></div></div></div>`;
}
function handHtml() {
  const p = me(), G = S.G, selOk = myTurn() && ['play', 'discard'].includes(G.t.step);
  return `<div class="panel"><h3>Your hand <span class="chip">${p.hand.length}/${G.cfg.handLimit}</span>${selOk ? '<span class="muted small">tap to select</span>' : ''}</h3>
    <div class="scroller" data-scroll="hand" style="padding-top:.5rem">${p.hand.map(c => `<div class="thumb h ${S.sel.includes(c.id) ? 'sel' : ''}" ${selOk ? `data-act="sel" data-id="${c.id}"` : `data-act="zoom" data-id="${c.id}"`}>${img(c)}<span class="mag" data-act="zoom" data-id="${c.id}">🔍</span></div>`).join('') || '<span class="muted small" style="padding:1rem">Empty hand</span>'}</div></div>`;
}
function phaseLabel() {
  const G = S.G;
  if (G.phase === 1) return `Phase 1 · POST race · round ${G.round}`;
  if (G.phase === 2) return `Phase 2 · service calls · round ${G.p2round}/${G.cfg.p2Rounds}`;
  return 'Game over';
}
function renderGame() {
  const G = S.G, p = me();
  const sc = E.scoreParts(p);
  const status = p.post !== null ? `<span class="chip good">POSTed · round ${p.post}</span>` : '<span class="chip warn">not POSTed</span>';
  const tasks = p.tasks;
  return `<div class="game">
    <div class="topbar"><div class="grow"><div class="phase">${phaseLabel()}</div><div class="turn">${G.t ? (G.t.seat === ME ? 'Your turn' : "Computer's turn") : ''} · Computer: ${opp().post !== null ? 'POSTed' : 'not POSTed'}, ${plural(opp().hand.length, 'card')} · #${G.cfg.seed}</div></div>
      <button class="ghost" data-act="log">Log</button><button class="ghost" data-act="menu">☰</button></div>
    <div class="col-opp">${oppPanel()}
      <div class="panel"><div class="piles">${pileHtml('comp', 'Components')}${pileHtml('addon', 'Add-ons')}${pileHtml('task', 'Tasks')}</div></div></div>
    <div class="col-me">
      <div class="panel"><h3>You ${status} <span class="chip">score now: ${sc.total}</span></h3>${specBox()}</div>
      <div class="panel"><h3>Your build</h3>${buildHtml(p, 'm', 'me', true)}</div>
      ${handHtml()}
      ${G.phase !== 1 || tasks.length ? `<div class="panel"><h3>Tasks &amp; Tickets <span class="chip">${p.done.length} done · ${E.taskPoints(p)} pts</span></h3>
        <div class="scroller" data-scroll="tasks">${tasks.map(taskThumb).join('') || '<span class="muted small" style="padding:.5rem">None — you draw one each turn.</span>'}</div></div>` : ''}
    </div>
    ${actionBar()}</div>`;
}

// ---- action bar ----
function tickerHtml() {
  return `<div class="ticker">${S.G.log.slice(-2).map(l => `<div class="${l.kind}">${esc(l.text)}</div>`).join('')}</div>`;
}
function selCards() { return S.sel.map(id => me().hand.find(c => c.id === id)).filter(Boolean); }
function actionBar() {
  const G = S.G, t = G.t, p = me();
  let prompt = '', btns = '';
  if (G.over) prompt = 'Game over';
  else if (!myTurn()) prompt = `<span class="thinking">${t && t.seat !== ME ? 'Computer is playing…' : 'Working…'}</span>`;
  else if (G.t.step === 'take') {
    prompt = 'Catch-up: you may take 1 card from the Components discard pile before you draw.';
    btns = `<button class="primary" data-act="take-open">Look at the discard pile</button><button data-act="take-skip">No thanks</button>`;
  } else if (t.step === 'deck') {
    prompt = 'Your turn — choose a deck to draw 3 from (keep 2).';
    btns = `<button class="primary" data-act="deck" data-d="comp">Components (${G.decks.comp.length})</button><button class="primary" data-act="deck" data-d="addon">Add-ons (${G.decks.addon.length})</button>`;
  } else if (t.step === 'draw') {
    prompt = t.kind === 'p1' ? 'Your turn — draw 3 Components and keep 2.' : `Draw 3 from ${t.deck === 'comp' ? 'Components' : 'Add-ons'} and keep 2.`;
    btns = `<button class="primary" data-act="draw">Draw 3 cards</button>`;
  } else if (t.step === 'keep') {
    prompt = 'Choose 2 cards to keep…';
  } else if (t.step === 'play') {
    const cs = selCards(), c = cs.length === 1 ? cs[0] : null;
    prompt = `Plays left: <b>${t.plays}</b> · ${t.kind === 'p2' ? 'install, close a ticket or recycle' : 'install parts, recycle, then call POST when ready'}`;
    const installable = c && c.kind !== 'fix' && c.kind !== 'prebuilt';
    if (installable) btns += `<button class="primary" data-act="install" ${t.plays <= 0 && c.kind !== 'adp' ? 'disabled' : ''}>Install</button>`;
    if (installable && G.cfg.audit === 'off') btns += `<button data-act="fit">Would this fit?</button>`;
    if (c && t.kind === 'p2') {
      for (const tk of p.tasks.filter(x => x.kind === 'ticket' && E.solves(c, x))) btns += `<button class="good" data-act="close" data-t="${tk.id}" ${t.plays <= 0 ? 'disabled' : ''}>Close “${esc(tk.name)}” +${E.solves(c, tk)}</button>`;
    }
    if (cs.length) btns += `<button data-act="recycle" ${t.plays <= 0 || cs.length > 3 ? 'disabled' : ''}>Recycle ${cs.length}</button>`;
    if (t.kind === 'p1') {
      const can = E.canCallPost(p);
      btns += `<button class="good" data-act="post" ${can ? '' : 'disabled'}>Call POST</button>`;
      if (!can) prompt += `<div class="muted small">${!E.slotsFilled(p) ? 'Fill every slot of your build first.' : 'Your Spec Sheet Requirements are not all met yet.'}</div>`;
    }
    btns += `<button class="${t.plays <= 0 ? 'primary' : 'ghost'}" data-act="end">End turn</button>`;
  } else if (t.step === 'discard') {
    const n = E.mustDiscard(G);
    prompt = `Discard down to ${G.cfg.handLimit} cards: select <b>${n}</b> to discard (${S.sel.length} selected).`;
    btns = `<button class="danger" data-act="discard-ok" ${S.sel.length >= n ? '' : 'disabled'}>Discard selected</button>`;
  }
  return `<div class="actions"><div class="inner">${tickerHtml()}<div class="prompt">${prompt}</div><div class="btns">${btns}</div></div></div>`;
}

// ---- modals ----
function renderModal() {
  const m = S.modal;
  if (!m) { $modal.classList.add('hidden'); $modal.innerHTML = ''; return; }
  $modal.classList.remove('hidden');
  let h = '';
  if (m.type === 'zoom') {
    const c = m.card;
    let extra = '';
    if (c.kind === 'task' && S.G && S.G.P[ME].tasks.includes(c)) {
      const st = E.taskStatus(me(), c); extra = `<div class="muted small center" style="margin-top:.5rem">${st.filter(Boolean).length} of ${st.length} needs met${E.taskMet(me(), c) ? ' — ready to claim' : ''}</div>`;
    }
    h = `<div data-act="close-modal" style="width:100%"><img class="zoomimg" src="${c.img}" alt="${esc(c.name)}">${extra}<p class="muted small center">Tap anywhere to close</p></div>`;
  } else if (m.type === 'msg') {
    h = `<div class="sheet result">${m.html}<div class="btns" style="margin-top:.8rem"><button class="primary" data-act="modal-ok">${m.btn || 'OK'}</button></div></div>`;
  } else if (m.type === 'keep') {
    const t = S.G.t;
    h = `<div class="sheet wide"><h3>Keep 2 of these 3</h3><p class="muted small">The card you don't keep goes face-up on the ${t.deck === 'comp' ? 'Components' : 'Add-ons'} discard pile.</p>
      <div class="grid g3">${t.look.map(c => `<div class="thumb ${S.keepSel.includes(c.id) ? 'sel' : ''}" style="width:auto" data-act="keep-toggle" data-id="${c.id}">${img(c)}<span class="mag" data-act="zoom" data-id="${c.id}">🔍</span></div>`).join('')}</div>
      <div class="btns" style="margin-top:.8rem"><button class="primary" data-act="keep-ok" ${S.keepSel.length === Math.min(2, t.look.length) ? '' : 'disabled'}>Keep ${S.keepSel.length}/${Math.min(2, t.look.length)}</button></div></div>`;
  } else if (m.type === 'disc') {
    const pile = S.G.disc[m.deck];
    h = `<div class="sheet wide"><h3>${m.deck === 'comp' ? 'Components' : 'Add-ons'} discard pile (${pile.length})</h3>
      ${m.pick ? '<p class="muted small">Tap a card to take it.</p>' : ''}<div class="grid">${pile.slice().reverse().map(c => `<div class="thumb" style="width:auto" data-act="${m.pick ? 'take-pick' : 'zoom'}" data-id="${c.id}">${img(c)}</div>`).join('') || '<span class="muted">Empty</span>'}</div>
      <div class="btns" style="margin-top:.8rem"><button data-act="close-modal">${m.pick ? 'Cancel' : 'Close'}</button></div></div>`;
  } else if (m.type === 'deckpick') {
    h = `<div class="sheet"><h3>Recycle: draw from which deck?</h3><div class="btns"><button class="primary" data-act="recycle-go" data-d="comp">Components</button><button class="primary" data-act="recycle-go" data-d="addon">Add-ons</button></div><div class="btns" style="margin-top:.5rem"><button data-act="close-modal">Cancel</button></div></div>`;
  } else if (m.type === 'log') {
    h = `<div class="sheet"><h3>Game log</h3><div class="logbox">${S.G.log.map(l => `<div class="${l.kind}">${esc(l.text)}</div>`).join('')}</div>
      <div class="btns" style="margin-top:.8rem"><button data-act="copylog">Copy log</button><button class="primary" data-act="close-modal">Close</button></div></div>`;
  } else if (m.type === 'menu') {
    h = `<div class="sheet"><h3>Menu</h3><div class="btns" style="flex-direction:column">
      <button data-act="show-aid">Player aids</button><button data-act="log">Game log</button><a style="text-align:center;padding:.65em 1em;background:var(--panel2);border-radius:10px;color:var(--text);text-decoration:none" href="POST_Rulebook_v0.5.pdf" target="_blank" rel="noopener">Rulebook (PDF)</a>
      <button class="danger" data-act="restart">Abandon game</button><button class="primary" data-act="close-modal">Back to game</button></div></div>`;
  } else if (m.type === 'aids') {
    const aids = ['AID-YT', 'AID-RS'].map(id => S.aids.find(a => a.id.startsWith(id)));   // the deck holds 3 copies of each
    h = `<div class="sheet wide"><h3>Player aids</h3><div class="grid g3">${aids.map(a =>`<div class="thumb" style="width:auto" data-act="zoom-src" data-src="${a.img}"><img class="cardimg" src="${a.img}" alt="aid"></div>`).join('')}</div>
      <div class="btns" style="margin-top:.8rem"><button class="primary" data-act="close-modal">Close</button></div></div>`;
  }
  $modal.innerHTML = h;
}
function showMsg(html, btn) { return new Promise(res => { S.modal = { type: 'msg', html, btn }; S.modalResolve = res; render(); }); }
function closeModal() { S.modal = null; if (S.modalResolve) { const r = S.modalResolve; S.modalResolve = null; r(); } render(); }

// ---- game over ----
function renderOver() {
  const G = S.G, r = G.result, [a, b] = G.P;
  const col = (p, s) => `<td>${s.bonus}</td>`;
  const row = (label, k) => `<tr><td>${label}</td><td>${r.scores[0][k]}</td><td>${r.scores[1][k]}</td></tr>`;
  const w = r.winner;
  const head = w === ME ? '🏆 You win!' : w === 1 - ME ? 'The computer wins this one' : "It's a tie!";
  const reveal = p => { const s = E.byId(p.spec); return `<div class="thumb" style="width:110px;margin:0 auto" data-act="zoom" data-id="${s.id}">${img(s)}</div>`; };
  void col;
  return `<div class="page"><h2>${head}</h2>
    <div class="card-panel"><table class="score"><tr><th></th><th>You</th><th>Computer</th></tr>
      ${row('POST bonus', 'bonus')}${row('Benchmark', 'bench')}${row('Spec Sheet', 'spec')}${row('Tasks &amp; Tickets', 'tasks')}
      <tr class="tot"><td>Total</td><td>${r.scores[0].total}</td><td>${r.scores[1].total}</td></tr></table>
      <p class="muted small">Ties go to the higher Benchmark. Benchmark and Spec Sheet only count if the build is still ONLINE after the final audit.</p></div>
    <div class="card-panel row" style="align-items:flex-start"><div class="grow center"><div class="muted small">Your Spec Sheet</div>${reveal(a)}</div><div class="grow center"><div class="muted small">Computer's Spec Sheet</div>${reveal(b)}</div></div>
    <div class="card-panel"><h3>Final builds</h3><div class="muted small">You</div>${buildHtml(a, 's', 'fa', false)}<div class="muted small">Computer</div>${buildHtml(b, 's', 'fb', false)}</div>
    <div class="btns"><button class="primary" data-act="again">Play again</button><button data-act="log">Game log</button><button data-act="copylog">Copy log</button></div>
    <p class="muted small center" style="margin-top:.8rem">Game #${G.cfg.seed} · ${profName[G.cfg.profile]} · audit: ${G.cfg.audit}</p></div>`;
}

// ================================================================== flow
function startGame() {
  const c = S.cfg, seed = parseInt(c.seed, 10);
  const G = E.newGame({ humanSeat: ME, profile: c.profile, audit: c.audit, p2Rounds: c.p2Rounds, seed: Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e6) });
  S.G = G; S.sel = []; S.keepSel = []; S.shownPhase = null; S.setup = { spec: null, board: null };
  B.setupBot(G, 1 - ME);
  S.screen = 'setup'; render();
}
const BOARD_WHY = {
  'SS-01': 'Gaming Rig needs a desktop board newer than DDR2 (16 GB+ RAM and a Tier 3 CPU).',
  'SS-02': 'Office Workstation needs a board with a TPM.', 'SS-08': 'Retail Counter needs a board with a TPM.',
  'SS-03': 'File Server needs a server board.', 'SS-05': 'Road Warrior needs a laptop board.', 'SS-06': 'Home Theater PC needs an ITX board.',
  'SS-09': 'Micro Workstation needs the Micro Workstation board.',
  'SS-04': 'Virtualization Host needs 32 GB+ RAM, so it needs a DDR4 or DDR5 desktop or server board.',
  'SS-07': 'Content Creator needs 32 GB+ RAM, so it needs a DDR4 or DDR5 desktop or server board.',
};
function confirmSetup() {
  const { spec, board } = S.setup, b = me().dealt.boards.find(x => x.id === board);
  if (!E.boardMeets(spec, b)) { showMsg(`<div class="big">That board can't meet that sheet</div><p>${esc(BOARD_WHY[spec])}</p><p class="muted small">Pick a different board or a different Spec Sheet.</p>`); return; }
  E.chooseSetup(S.G, me(), spec, board);
  E.finishSetup(S.G);
  S.screen = 'game';
  phaseBanner().then(proceed);
}
async function phaseBanner() {
  const G = S.G;
  if (S.shownPhase === G.phase) return;
  S.shownPhase = G.phase;
  if (G.phase === 1) await showMsg(`<div class="big">Phase 1 — the POST race</div><p>Each turn: <b>draw 3, keep 2</b>, make up to <b>2 plays</b> (install a part or recycle), then <b>call POST</b> if your build is ready.</p><p>Ready means every slot filled with parts that fit each other, enough PSU power, and every Requirement on your Spec Sheet met. ${G.cfg.audit === 'off' ? 'Learning mode: the game only lets fitting parts in.' : 'You can place any part — but the audit checks it when you call POST. Faults cost you a part and a turn.'}</p><p class="muted small">The round anyone POSTs is the last round of Phase 1. Everyone who POSTs in it earns +3.</p>`, 'Let\'s go');
  else if (G.phase === 2) await showMsg(`<div class="big">Phase 2 — service calls</div><p>${G.cfg.p2Rounds} rounds. You drew 3 Task cards. Each turn: draw a Task, <b>draw 3 and keep 2</b> from Components or Add-ons, make up to 2 plays (install, <b>close a Trouble Ticket</b>, or recycle). Tasks are claimed automatically when your ONLINE build meets them.</p><p class="muted small">Players who haven't POSTed yet keep taking Phase 1 turns, and may take 1 card from the Components discard pile first.</p>`, 'Continue');
}
async function proceed() {
  const G = S.G;
  S.busy = true; S.sel = []; render();
  while (!G.over) {
    await phaseBanner();
    if (S.G !== G) return;   // abandoned while we waited
    const t = E.startTurn(G);
    if (!t) break;
    const p = G.P[t.seat];
    if (p.human) { S.busy = false; render(); window.scrollTo(0, 0); return; }
    await botTurn(G);
    if (S.G !== G) return;
  }
  S.busy = false; S.screen = 'over'; render(); window.scrollTo(0, 0);
}
async function botTurn(G) {
  const delay = S.cfg.speed === 'fast' ? 140 : 700;
  render(); await sleep(delay);
  if (S.G !== G) return;
  const gen = B.botTurn(G);
  for (;;) {
    const r = gen.next();
    if (r.done) break;
    const ev = r.value; render();
    if (ev.type === 'post') {
      const res = ev.result;
      if (res.posted) await showMsg(`<div class="big">🖥️ The computer called POST</div><p>You audit its build… <b>no fault</b>. It POSTs!</p>`, 'Continue');
      else await showMsg(`<div class="big">🔍 You audited the computer's POST call</div><p>Fault found: <b>${esc(E.nm(res.fault.part))}</b>.</p>${S.G.cfg.audit === 'hidden' ? '' : `<p>${esc(res.fault.why)}</p>`}<p>It discards that part, misses its POST, and <b>you draw 2 Components</b>.</p>`, 'Continue');
    } else await sleep(delay);
    if (S.G !== G) return;
  }
  render(); await sleep(delay / 2);
}

// ---- human steps ----
function afterPlays() {
  const G = S.G; S.sel = [];
  E.endPlays(G);
  if (E.mustDiscard(G) === 0) { E.finishTurn(G); proceed(); } else render();
}
const ACTS = {
  start() { startGame(); },
  'pick-spec'(el) { S.setup.spec = el.dataset.id; render(); },
  'pick-board'(el) { S.setup.board = el.dataset.id; render(); },
  'confirm-setup'() { confirmSetup(); },
  opt(el) { const k = el.dataset.k, v = el.value; if (k === 'profile') S.cfg.profile = v; else if (k === 'audit') S.cfg.audit = v; else if (k === 'p2') S.cfg.p2Rounds = +v; else if (k === 'speed') S.cfg.speed = v; render(); },
  zoom(el) { const id = el.dataset.id; const c = E.byId(id) || S.G.disc.comp.concat(S.G.disc.addon).find(x => x.id === id); if (c) { S.modal = Object.assign({}, S.modal && S.modal.type === 'keep' ? S.modal : {}, { type: 'zoom', card: c, prev: S.modal }); render(); } },
  'zoom-src'(el) { S.modal = { type: 'zoom', card: { img: el.dataset.src, name: 'aid' } }; render(); },
  'close-modal'() { const m = S.modal; if (m && m.type === 'zoom' && m.prev) { S.modal = m.prev; render(); } else closeModal(); },
  'modal-ok'() { closeModal(); },
  sel(el) { const id = el.dataset.id, i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id); render(); },
  'take-open'() { S.modal = { type: 'disc', deck: 'comp', pick: true }; render(); },
  'take-pick'(el) { S.modal = null; E.takeFromDiscard(S.G, el.dataset.id); render(); },
  'take-skip'() { E.skipTake(S.G); render(); },
  deck(el) { E.chooseDeck(S.G, el.dataset.d); render(); },
  draw() { E.drawLook(S.G); S.keepSel = []; if (S.G.t.look.length === 0) { S.G.t.step = 'play'; } else S.modal = { type: 'keep' }; render(); },
  'keep-toggle'(el) { const id = el.dataset.id, i = S.keepSel.indexOf(id); if (i >= 0) S.keepSel.splice(i, 1); else if (S.keepSel.length < 2) S.keepSel.push(id); render(); },
  'keep-ok'() { E.keep(S.G, S.keepSel); S.keepSel = []; S.modal = null; S.sel = []; render(); },
  install() {
    const G = S.G, id = S.sel[0]; if (!id) return;
    const c = me().hand.find(x => x.id === id);
    const r = E.install(G, id);
    if (!r.ok) { showMsg(`<div class="big">Can't install that</div><p>${esc(r.err)}</p>`); return; }
    S.sel = []; if (G.t.kind === 'p2') E.claimTasks(G, me());
    void c; render();
  },
  fit() {
    const c = selCards()[0]; if (!c) return; const r = E.tryInstall(me(), c, {});
    showMsg(r.q ? `<div class="big">✅ Yes, it fits</div><p>${esc(E.nm(c))} can go in your build right now.</p>` : `<div class="big">❌ No</div><p>${esc(r.err)}</p>`);
  },
  close(el) {
    const G = S.G, c = selCards()[0]; if (!c) return;
    const r = E.closeTicket(G, c.id, el.dataset.t);
    if (!r.ok) { showMsg(`<div class="big">Can't close that ticket</div><p>${esc(r.err)}</p>`); return; }
    S.sel = []; E.claimTasks(G, me()); render();
  },
  recycle() {
    const G = S.G, ids = S.sel.slice(0, 3); if (!ids.length) return;
    if (G.t.kind === 'p2') { S.modal = { type: 'deckpick' }; render(); return; }
    const r = E.recycle(G, ids); if (!r.ok) showMsg(esc(r.err)); S.sel = []; render();
  },
  'recycle-go'(el) { const G = S.G; G.t.deck = el.dataset.d; const r = E.recycle(G, S.sel.slice(0, 3)); S.modal = null; S.sel = []; if (!r.ok) showMsg(esc(r.err)); else render(); },
  async post() {
    const res = E.callPost(S.G); render();
    if (res.posted) await showMsg(`<div class="big">🖥️ It POSTs!</div><p>${S.G.cfg.audit === 'off' ? 'Your build is ready.' : 'The audit found no fault.'} Phase 1 ends at the end of this round, and everyone who POSTs in it earns <b>+3</b>.</p>`, 'Continue');
    else await showMsg(`<div class="big">🔍 Fault found</div>${S.G.cfg.audit === 'hidden' ? `<p>The audit says something in your build doesn't fit, and it removed <b>${esc(E.nm(res.fault.part))}</b>.</p>` : `<p><b>${esc(E.nm(res.fault.part))}</b>: ${esc(res.fault.why)}</p>`}<p>That part is discarded, you don't POST this turn, and the computer draws 2 Components.</p>`, 'Continue');
    afterPlays();
  },
  end() { afterPlays(); },
  'discard-ok'() { const G = S.G; E.discardDown(G, S.sel); S.sel = []; if (E.mustDiscard(G) === 0) { E.finishTurn(G); proceed(); } else render(); },
  'view-disc'(el) { S.modal = { type: 'disc', deck: el.dataset.d, pick: false }; render(); },
  log() { S.modal = { type: 'log' }; render(); },
  menu() { S.modal = { type: 'menu' }; render(); },
  'show-aid'() { S.modal = { type: 'aids' }; render(); },
  copylog() { const txt = `POST v0.5 · game #${S.G.cfg.seed} · ${profName[S.G.cfg.profile]} · audit ${S.G.cfg.audit}\n` + S.G.log.map(l => `[${l.phase === 'over' ? 'end' : 'P' + l.phase} r${l.round}] ${l.text}`).join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => showMsg('Log copied.'), () => showMsg(`<div class="logbox" style="user-select:all">${esc(txt).replace(/\n/g, '<br>')}</div>`)); },
  restart() { S.modal = null; S.screen = 'title'; S.busy = false; S.G = null; render(); },
  again() { S.screen = 'title'; render(); },
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; if (el.tagName === 'INPUT') return;
  if (a !== 'opt' && ACTS[a]) { ev.preventDefault(); ACTS[a](el, ev); }
});
document.addEventListener('change', ev => { const el = ev.target; if (el.dataset && el.dataset.act === 'opt') ACTS.opt(el); });
document.addEventListener('input', ev => { if (ev.target.id === 'seed') S.cfg.seed = ev.target.value; });

// tiny extra styles for things created in JS
const st = document.createElement('style');
st.textContent = '.mag{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);font-size:.78rem;background:rgba(0,0,0,.72);border-radius:7px;padding:1px 6px;line-height:1.3;z-index:2}.slotph{aspect-ratio:2.75/4.75;border:2px dashed var(--line);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:.68rem;color:var(--dim);text-transform:uppercase;text-align:center}.pick .mag{bottom:6px}';
document.head.appendChild(st);

window.POSTUI = { S, render, ACTS };
render();
})();
