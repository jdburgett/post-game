/* POST — rules engine (v0.5). Pure rules: no DOM, no bots. Works in browsers (window.POST) and node. */
(function (root) {
'use strict';

// ===================================================================== data
let DATA = null, BYID = {};
function init(data) {
  DATA = data; BYID = {};
  for (const k of ['boards', 'comp', 'addon', 'task', 'spec']) for (const c of data[k]) BYID[c.id] = c;
}
const byId = id => BYID[id];

// ============================================================ small helpers
const sum = a => a.reduce((x, y) => x + y, 0);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const nm = c => c.sub && !/^(FIXES|Card|Pads|Fan|PSU|SODIMM|RPM)$/.test(c.sub) ? `${c.name} (${c.sub})` : c.name;

// ======================================================== board / parts rules
function required(b) { return b.type === 'Laptop' ? ['ram', 'sto'] : b.type === 'Micro' ? ['cpu', 'ram', 'sto'] : ['cpu', 'cooler', 'ram', 'sto', 'psu']; }
const hasPsu = b => b.type !== 'Laptop' && b.type !== 'Micro';

function stoOk(b, kind) {
  switch (kind) {
    case 'nvme': return b.m2 > 0;
    case 'm2sata': return b.m2 > 0 && b.m2sata;
    case 'msata': return b.msata > 0;
    case 'sas': return b.sas > 0;
    case 'sata35': return b.sata > 0 || b.sas > 0;
    default: return b.sata > 0 || b.bay25 > 0;   // sata25
  }
}
function storageFits(b, ds) {
  const cap = { sata: b.sata, sas: b.sas, m2: b.m2, bay25: b.bay25, msata: b.msata };
  // SATA is the only port two drive kinds compete for, so it is each kind's last choice
  const opts = { nvme: ['m2'], m2sata: b.m2sata ? ['m2'] : [], msata: ['msata'], sas: ['sas'], sata35: ['sas', 'sata'], sata25: ['bay25', 'sata'] };
  const order = ds.slice().sort((x, y) => opts[x.kind].length - opts[y.kind].length);
  for (const d of order) {
    let placed = false;
    for (const o of opts[d.kind]) if (cap[o] > 0) { cap[o]--; placed = true; break; }
    if (!placed) return false;
  }
  return true;
}
// kits are installed as two "halves" so every rule can treat them as a RAM card and a drive
function kitHalves(k) {
  return [
    { id: k.id, deck: 'comp', slot: 'ram', key: k.ramKey, gb: k.ramGb, tier: k.ramTier, kitHalf: true, kit: k, name: k.name, img: k.img },
    { id: k.id, deck: 'comp', slot: 'sto', kind: k.drvKind, tb: k.drvTb, tier: k.drvTier, ssd: true, hdd: false, kitHalf: true, kit: k, name: k.name, img: k.img },
  ];
}
const halvesOf = c => (c.slot === 'kit' ? kitHalves(c) : [c]);

function psuCap(psu, exp) { return Math.max(psu.cap, ...(exp || []).map(c => c.kit || 0)); }
function powerNeed(b, cpu, cool, cpu2, exp) {
  return b.power + (cpu ? cpu.power : 0) + (cool ? cool.power : 0) + (cpu2 ? cpu2.power : 0) + sum((exp || []).map(c => c.power || 0));
}
// returns array of {part, why}; one entry per problem found in the CORE build
function faultsOf(b, inst, cpu2, exp, kit) {
  const out = [];
  const { cpu, cooler: cool, ram, sto, psu } = inst;
  if (cpu) {
    if (b.type === 'Laptop') out.push({ part: cpu, why: 'A laptop has its CPU built in — there is no CPU socket.' });
    else if (cpu.socket !== b.socket) out.push({ part: cpu, why: `This is a ${cpu.socket} CPU but the board has a ${b.socket} socket.` });
  }
  if (cool) {
    if (!hasPsu(b)) out.push({ part: cool, why: 'This board has its cooling built in.' });
    else if (cool.serverOnly && b.type !== 'Server') out.push({ part: cool, why: 'A server heat sink only fits server boards.' });
    else if (cpu && cool.rating < cpu.tier) out.push({ part: cool, why: `The cooler is rated for CPU Tier ${cool.rating} but the CPU is Tier ${cpu.tier}. It will overheat.` });
  }
  if (ram && ram.key !== b.ram) out.push({ part: ram.kitHalf ? ram.kit : ram, why: `This is ${ram.key.replace('-', ' ')} memory but the board takes ${b.ram.replace('-', ' ')}.` });
  if (sto && !stoOk(b, sto.kind)) out.push({ part: sto.kitHalf ? sto.kit : sto, why: `The board has no port or slot for this drive type (${({ nvme: 'M.2 NVMe', m2sata: 'M.2 SATA', msata: 'mSATA', sas: 'SAS', sata35: '3.5" SATA', sata25: '2.5" SATA' })[sto.kind]}).` });
  if (psu) {
    if (!hasPsu(b)) out.push({ part: psu, why: 'This board has its power built in.' });
    else if (psu.serverOnly && b.type !== 'Server') out.push({ part: psu, why: 'A redundant server PSU only fits server boards.' });
    else {
      const need = powerNeed(b, cpu, cool, cpu2, exp), cap = psuCap(psu, exp);
      if (need > cap) out.push({ part: psu, why: `The build needs ⚡${need} but this PSU only supplies ⚡${cap}.` });
    }
  }
  if (cpu2 && (b.type !== 'Server' || !cpu || cpu2.tier !== cpu.tier)) out.push({ part: cpu2, why: b.type !== 'Server' ? 'Only server boards take a second CPU.' : 'A second CPU must be the same tier as the first.' });
  if (kit && !kit.fits.includes(b.id)) out.push({ part: kit, why: `This kit only fits ${kit.fits.join(', ')}, not ${b.id}.` });
  return out;
}

// ===================================================================== player
function newPlayer(seat, human, name) {
  return { seat, human, name, b: null, spec: null, core: {}, cpu2: null, drives: [], raid: null, exp: [], dsp: [], adp: [], prn: [], per: [],
    hand: [], tasks: [], done: [], post: null, bonus: 0, kit: null, bad: new Set(), profile: 'human' };
}
function clone(p) {
  const q = Object.assign({}, p);
  for (const k of ['drives', 'exp', 'dsp', 'adp', 'prn', 'per', 'hand', 'tasks', 'done']) q[k] = p[k].slice();
  q.core = Object.assign({}, p.core); q.bad = new Set(p.bad);
  return q;
}
const lap = p => p.b.type === 'Laptop';
const drives = p => (p.core.sto ? [p.core.sto] : []).concat(p.drives);
const totalTb = p => sum(drives(p).map(d => d.tb));
function ramGb(p) { const r = p.core.ram; if (!r) return 0; const cpu = p.core.cpu; return cpu && cpu.x86 ? Math.min(r.gb, 4) : r.gb; }
const gpuTier = p => Math.max(0, ...p.exp.filter(c => c.gpu).map(c => c.tier));
function installed(p) {
  const o = Object.values(p.core); if (p.cpu2) o.push(p.cpu2);
  return o.concat(p.drives, p.raid ? [p.raid] : [], p.exp, p.dsp, p.adp, p.prn, p.per);
}
const has = (p, f) => installed(p).some(f);
const perHas = (p, k) => p.per.some(c => c.ptype === k);
const dspHas = (p, f) => p.dsp.some(f);

// ======================================================= build state checks
function faults(p) {
  const f = faultsOf(p.b, p.core, p.cpu2, p.exp, p.kit);
  // extra drives must also fit
  if (!storageFits(p.b, drives(p))) {
    const extra = p.drives[p.drives.length - 1];
    if (extra) f.push({ part: extra, why: 'There is no free port or slot for this drive.' });
  }
  return f;
}
function coreValid(p, believed) {
  // believed: ignore parts the owner misread (they think those fit)
  const inst = {}; for (const [k, v] of Object.entries(p.core)) if (!believed || !p.bad.has(v.id)) inst[k] = v;
  return faultsOf(p.b, inst, believed && p.cpu2 && p.bad.has(p.cpu2.id) ? null : p.cpu2, p.exp, believed && p.kit && p.bad.has(p.kit.id) ? null : p.kit).length === 0;
}
function powerOk(p) {
  if (!hasPsu(p.b)) return true;
  const psu = p.core.psu; if (!psu) return true;
  return powerNeed(p.b, p.core.cpu, p.core.cooler, p.cpu2, p.exp) <= psuCap(psu, p.exp);
}
function slotsFilled(p) { return required(p.b).every(s => p.core[s]); }

// ================================================================ add-on rules
function slotsFit(b, cards) {
  const cap = Object.assign({}, b.slots);
  const order = { PCI: ['PCI'], x16: ['x16'], x4: ['x4', 'x16'], x1: ['x1', 'x4', 'x16'] };
  const rank = { PCI: 0, x16: 1, x4: 2, x1: 3 };
  for (const c of cards.slice().sort((a, b2) => rank[a.slotSize] - rank[b2.slotSize])) {
    let ok = false;
    for (const o of order[c.slotSize]) if ((cap[o] || 0) > 0) { cap[o]--; ok = true; break; }
    if (!ok) return false;
  }
  return true;
}
function usbOk(p) {
  let ports = p.b.usb;
  if (lap(p)) ports += 3 * p.per.filter(c => c.ptype === 'dock').length + 2 * p.per.filter(c => c.ptype === 'replicator').length;
  ports += p.adp.filter(c => c.id === 'ADP-03').length;
  let used = p.per.filter(c => c.ptype !== 'dock' && c.ptype !== 'replicator').length;
  used += p.prn.filter(c => !c.net).length;
  return used <= ports;
}
function videoOuts(p) {
  const outs = p.b.outs.slice();
  for (const c of p.exp) outs.push(...c.outs);
  for (const c of p.per) { if (c.ptype === 'dock') outs.push('HDMI', 'DP'); if (c.ptype === 'replicator') outs.push('HDMI'); }
  return outs;
}
function displayOk(p) {
  const ds = p.dsp, outs = videoOuts(p), adps = p.adp.map(a => a.id);
  const can = (d, o, a) => {
    const ins = new Set(d.ins);
    if (ins.has(o)) return true;
    if (a === 'ADP-01' && (ins.has('HDMI') || ins.has('DVI')) && (o === 'HDMI' || o === 'DVI')) return true;
    if (a === 'ADP-02' && ins.has('VGA') && o === 'DP') return true;
    if (a === 'ADP-03' && (ins.has('HDMI') || ins.has('VGA')) && o === 'USB-C') return true;
    return false;
  };
  function rec(i, usedO, usedA) {
    if (i === ds.length) return true;
    for (let j = 0; j < outs.length; j++) {
      if (usedO.has(j)) continue;
      if (can(ds[i], outs[j], null) && rec(i + 1, new Set([...usedO, j]), usedA)) return true;
      for (let k = 0; k < adps.length; k++) {
        if (usedA.has(k)) continue;
        if (can(ds[i], outs[j], adps[k]) && rec(i + 1, new Set([...usedO, j]), new Set([...usedA, k]))) return true;
      }
    }
    return false;
  }
  return rec(0, new Set(), new Set());
}

// ================================================================== install
// Returns {q, olds, err}. q is a NEW player state with c installed.
// opts.lenient: core parts may be placed even if they don't fit (the audit will catch them)
// opts.misread: (bot) like lenient but only for an empty slot, and remembers the part in p.bad
// opts.cpu2NeedsOnline: bots only add a 2nd CPU when the first build is believed complete
function tryInstall(p, c, opts) {
  opts = opts || {};
  const q = clone(p), b = q.b; const olds = [];
  const fail = err => ({ q: null, olds: [], err });
  const k = c.deck === 'addon' ? c.kind : 'comp';
  if (k === 'fix' || k === 'prebuilt') return fail('That card closes Trouble Tickets — it is not installed.');
  if (k === 'comp') {
    const dropKit = () => { if (q.kit) { for (const s of ['ram', 'sto']) if (q.core[s] && q.core[s].kitHalf) delete q.core[s]; olds.push(q.kit); q.kit = null; } };
    let placedAs;
    if (c.slot === 'kit') {
      if (!required(b).includes('ram') || !required(b).includes('sto')) return fail('This board has no RAM or storage slots.');
      if (q.core.ram && q.core.ram.kitHalf) dropKit();
      if (q.core.ram) olds.push(q.core.ram);
      if (q.core.sto) olds.push(q.core.sto);
      const [rh, dh] = kitHalves(c);
      q.core.ram = rh; q.core.sto = dh; q.kit = c; placedAs = 'kit';
    } else {
      const s = c.slot;
      if (!required(b).includes(s)) return fail(b.type === 'Laptop' ? 'A laptop has its CPU, cooling and power built in.' : 'A Micro Workstation has its cooling and power built in.');
      if (s === 'cpu' && b.type === 'Server' && q.core.cpu && !q.cpu2 && c.tier === q.core.cpu.tier && (!opts.cpu2NeedsOnline || onlineBelieved(p))) {
        q.cpu2 = c; placedAs = 'cpu2';
      } else if (s === 'sto' && q.core.sto) {
        if (!storageFits(b, drives(q).concat([c]))) return fail('There is no free port or slot for another drive on this board.');
        q.drives.push(c); placedAs = 'drive';
      } else {
        if (s === 'ram' && q.core.ram && q.core.ram.kitHalf) dropKit();
        const old = q.core[s];
        if (old) { if (q.bad.has(old.id)) q.bad.delete(old.id); olds.push(old); }
        q.core[s] = c; placedAs = s;
      }
    }
    if (!opts.lenient) {
      const chk = {}; for (const [kk, v] of Object.entries(q.core)) if (!(q.bad.has(v.id) && v !== c)) chk[kk] = v;
      const f = faultsOf(b, chk, q.cpu2, q.exp, q.kit);
      if (f.length || !storageFits(b, drives(q))) {
        if (opts.misread && !olds.length && placedAs !== 'drive' && placedAs !== 'cpu2') {
          q.bad.add(c.id);
          if (!coreValid(q, true)) return fail('misread-blocked');
        } else {
          const why = f.length ? f[0].why : 'There is no free port or slot for this drive.';
          return fail(why);
        }
      }
      if (!powerOk(q)) return fail('The build would need more power than the PSU supplies.');
    }
    return { q, olds, err: null };
  }
  if (k === 'exp') {
    if (!b.slots || (b.slots.x16 + b.slots.x4 + b.slots.x1 + b.slots.PCI) === 0) return fail('This board has no expansion slots.');
    if (!slotsFit(b, q.exp.concat([c]))) return fail(`No free ${c.slotSize === 'PCI' ? 'PCI' : 'PCIe ' + c.slotSize} slot (a bigger PCIe slot also works for smaller cards).`);
    q.exp.push(c);
    if (!powerOk(q)) return fail('The PSU cannot power this card. Replace it with a bigger one first.');
    return { q, olds, err: null };
  }
  if (k === 'raid') {
    if (q.raid) return fail('You already have a RAID card installed.');
    if (drives(q).length < c.min) return fail(`RAID ${c.level} needs at least ${c.min} drives installed.`);
    q.raid = c; return { q, olds, err: null };
  }
  if (k === 'dsp') { q.dsp.push(c); return displayOk(q) ? { q, olds, err: null } : fail('No free video output matches this display\'s inputs. An adapter might bridge the gap.'); }
  if (k === 'adp') { q.adp.push(c); return { q, olds, err: null }; }
  if (k === 'prn') { q.prn.push(c); return usbOk(q) ? { q, olds, err: null } : fail('No free USB port for this device.'); }
  if (k === 'per') {
    if ((c.ptype === 'dock' || c.ptype === 'replicator') && !lap(q)) return fail('Docks and port replicators only work with laptops.');
    q.per.push(c); return usbOk(q) ? { q, olds, err: null } : fail('No free USB port for this device.');
  }
  return fail('That card can\'t be installed.');
}

// ============================================================ Spec Sheets
const J = (card, state) => ({ card, state: state || (p => has(p, card)) });
const isk = k => c => c.kind === k;
const isp = (...ks) => c => c.kind === 'prn' && ks.includes(c.ptype);
const isper = k => c => c.kind === 'per' && c.ptype === k;
const ise = r => c => c.kind === 'exp' && c.role === r;
const isram = gb => c => c.slot === 'ram' && c.gb >= gb;
const webcamHeadset = J(c => c.kind === 'per' && (c.ptype === 'webcam' || c.ptype === 'headset'), p => (perHas(p, 'webcam') || p.b.webcam) && perHas(p, 'headset'));
const boardIs = f => J(() => false, p => f(p.b));
const raid1 = c => c.kind === 'raid' && [1, 5, 6, 10].includes(c.level);
const gpu3 = J(c => c.kind === 'exp' && c.gpu && c.tier >= 3, p => gpuTier(p) >= 3);
const nvmeDrive = J(c => c.kind === 'nvme', p => drives(p).some(d => d.kind === 'nvme'));
const finger = J(isper('finger'), p => perHas(p, 'finger') || p.b.finger);
const twoDsp = J(isk('dsp'), p => p.dsp.length >= 2);
const eccRam = c => c.slot === 'ram' && c.key.endsWith('ECC');

const SPEC = {
  'SS-01': { reqs: [J(isram(16), p => ramGb(p) >= 16), J(c => c.slot === 'cpu' && c.tier >= 3)],
    bonus: [[gpu3, 3], [J(c => c.kind === 'dsp' && c.hz >= 144), 2], [nvmeDrive, 1], [J(isper('headset')), 1]],
    labels: ['16 GB+ RAM', 'CPU Tier 3+'], bonusLabels: ['Video card Tier 3+', 'Display 144 Hz or faster', 'NVMe drive', 'USB headset'] },
  'SS-02': { reqs: [boardIs(b => b.tpm), J(c => c.slot === 'sto' && c.ssd)],
    bonus: [[J(isp('laser', 'mfd')), 2], [twoDsp, 2], [webcamHeadset, 1]],
    labels: ['Board with TPM', 'Any SSD'], bonusLabels: ['Laser printer or Laser MFD', 'Two displays', 'Webcam + USB headset'] },
  'SS-03': { reqs: [boardIs(b => b.type === 'Server'), J(eccRam), J(c => c.slot === 'sto', p => drives(p).length >= 2)],
    bonus: [[J(raid1), 3], [J(c => c.slot === 'psu' && c.redundant), 2], [J(c => c.slot === 'cpu', p => !!p.cpu2), 2], [J(ise('nic')), 2]],
    labels: ['Server board', 'ECC RAM', '2 or more drives'], bonusLabels: ['RAID 1, 5, 6 or 10', 'Redundant PSU', 'Two CPUs', '10 GbE Fiber NIC'] },
  'SS-04': { reqs: [J(c => c.slot === 'cpu' && c.vm && c.cores >= 8), J(isram(32), p => ramGb(p) >= 32)],
    bonus: [[J(eccRam), 2], [J(isk('raid')), 1], [J(ise('nic')), 2]],
    labels: ['8+ core CPU with virtualization', '32 GB+ RAM'], bonusLabels: ['ECC RAM', 'Any RAID', '10 GbE Fiber NIC'] },
  'SS-05': { reqs: [boardIs(b => b.type === 'Laptop'), J(c => c.slot === 'sto' && ['nvme', 'm2sata', 'msata'].includes(c.kind)), J(isram(8), p => ramGb(p) >= 8)],
    bonus: [[J(isper('dock')), 2], [finger, 1], [J(isper('headset')), 1]],
    labels: ['Laptop board', 'M.2 or mSATA SSD', '8 GB+ RAM'], bonusLabels: ['Docking station', 'Fingerprint login', 'USB headset'] },
  'SS-06': { reqs: [boardIs(b => b.itx), J(c => c.slot === 'sto', p => totalTb(p) >= 4)],
    bonus: [[J(c => c.kind === 'dsp' && ['OLED', 'VA', 'Mini-LED'].includes(c.panel)), 2], [J(isper('speakers')), 2], [J(isper('optical')), 1],
      [J(c => c.slot === 'psu' && c.cap <= 9, p => !!p.core.psu && p.core.psu.cap <= 9), 1]],
    labels: ['ITX board', '4 TB+ total storage'], bonusLabels: ['OLED, VA or Mini-LED display', 'Desktop speakers', 'Optical drive', 'PSU 450 W or less'] },
  'SS-07': { reqs: [J(isram(32), p => ramGb(p) >= 32), J(c => c.slot === 'sto', p => totalTb(p) >= 8)],
    bonus: [[J(ise('capture')), 3], [J(c => c.kind === 'dsp' && ['IPS', 'OLED'].includes(c.panel)), 2], [J(isper('drawpad')), 1], [webcamHeadset, 1]],
    labels: ['32 GB+ RAM', '8 TB+ total storage'], bonusLabels: ['Capture card', 'IPS or OLED display', 'Drawing pad', 'Webcam + USB headset'] },
  'SS-08': { reqs: [boardIs(b => b.tpm)],
    bonus: [[J(isp('thermal')), 2], [finger, 2], [J(isp('impact')), 1], [J(isp('mfd')), 1]],
    labels: ['Board with TPM'], bonusLabels: ['Thermal printer', 'Fingerprint reader', 'Impact printer', 'Laser MFD'] },
  'SS-09': { reqs: [boardIs(b => b.type === 'Micro'), J(c => c.slot === 'sto' && c.ssd)],
    bonus: [[twoDsp, 2], [webcamHeadset, 1], [nvmeDrive, 1]],
    labels: ['Micro Workstation board', 'Any SSD'], bonusLabels: ['Two displays', 'Webcam + USB headset', 'NVMe drive'] },
};
const specValue = id => byId(id).value;
function boardMeets(specId, b) {
  switch (specId) {
    case 'SS-03': return b.type === 'Server';
    case 'SS-05': return b.type === 'Laptop';
    case 'SS-06': return b.itx;
    case 'SS-09': return b.type === 'Micro';
    case 'SS-02': case 'SS-08': return b.tpm;
    case 'SS-04': case 'SS-07': return (b.type === 'Desktop' || b.type === 'Server') && /^DDR[45]/.test(b.ram);
    default: return b.type !== 'Laptop' && !/^DDR2/.test(b.ram);   // SS-01 Gaming Rig
  }
}
const specReqsMet = p => SPEC[p.spec].reqs.every(j => j.state(p));
function specStatus(p) {
  const s = SPEC[p.spec];
  return { reqs: s.reqs.map((j, i) => ({ label: s.labels[i], met: !!j.state(p) })), bonus: s.bonus.map(([j, pts], i) => ({ label: s.bonusLabels[i], pts, met: !!j.state(p) })) };
}

// ================================================================ Tasks / tickets
const TASK_NEEDS = {
  'TSK-01': [J(isp('laser', 'mfd'))], 'TSK-02': [J(isp('inkjet'))], 'TSK-03': [J(isp('thermal'))], 'TSK-04': [J(isp('impact'))],
  'TSK-05': [J(isp('mfd'))], 'TSK-06': [J(isp('inkjet', 'mfd'))], 'TSK-07': [J(isp('mfd'))], 'TSK-08': [J(isp('laser', 'inkjet', 'mfd'))],
  'TSK-09': [J(isper('webcam'), p => perHas(p, 'webcam') || p.b.webcam), J(isper('headset'))],
  'TSK-10': [J(ise('capture')), J(isper('webcam'), p => perHas(p, 'webcam') || p.b.webcam), J(isper('headset'))],
  'TSK-11': [J(c => c.kind === 'dsp' && c.hz >= 144), J(c => c.kind === 'exp' && c.gpu && c.tier >= 3, p => gpuTier(p) >= 3)],
  'TSK-12': [J(c => c.kind === 'dsp' && ['IPS', 'OLED'].includes(c.panel))],
  'TSK-13': [J(c => c.kind === 'dsp' && ['OLED', 'VA'].includes(c.panel)), J(isper('speakers'))],
  'TSK-14': [J(isper('drawpad'))],
  'TSK-15': [J(() => false, p => lap(p)), J(isper('dock'))],
  'TSK-16': [J(isper('finger'), p => perHas(p, 'finger') || p.b.finger)],
  'TSK-17': [J(isper('sd'))], 'TSK-18': [J(isper('optical'))], 'TSK-19': [J(isper('flash'))],
  'TSK-20': [J(raid1)],
  'TSK-21': [J(c => c.slot === 'psu' && c.redundant)],
  'TSK-22': [J(c => c.slot === 'cpu' && c.vm), J(isram(32), p => ramGb(p) >= 32)],
  'TSK-23': [J(ise('hsm'), p => p.b.tpm || has(p, ise('hsm')))],
  'TSK-24': [J(ise('wifi'), p => lap(p) || has(p, ise('wifi')))],
  'TSK-25': [J(ise('nic'))],
  'TSK-26': [J(c => ['ADP-02', 'ADP-03'].includes(c.id), p => p.b.outs.includes('VGA') || p.adp.some(a => ['ADP-02', 'ADP-03'].includes(a.id)))],
};
const TICKETS = {
  'Overheating': { part: 'cooler', pb: true }, 'POST Beeps': { part: 'ram', pb: true }, 'Capacitor Swelling': { part: null, pb: true },
  'Wrong Date & Time': { part: null, pb: true }, 'S.M.A.R.T. Failure': { part: 'sto', pb: true }, 'Grinding & Clicking': { part: 'sto', pb: true },
  'Bootable Device Not Found': { part: 'sto', pb: true }, 'Burning Smell': { part: 'psu', pb: true }, 'Swollen Battery': { part: null, pb: 'laptop' },
  'Screen Burn-In': { part: 'dsp', pb: false }, 'Paper Jam': { part: 'prn', pb: false }, 'External Interference': { part: null, pb: false },
  'Intermittent Connectivity': { part: 'nic', pb: false },
};
// points earned if `card` closes ticket t (0 = it can't)
function solves(card, t) {
  if (t.kind !== 'ticket') return 0;
  if (card.kind === 'fix') return card.fixes === t.name ? t.pts : 0;
  if (card.kind === 'prebuilt') {
    const pb = TICKETS[t.name].pb;
    return (pb === true || (pb === 'laptop' && card.laptop)) ? 1 : 0;
  }
  const part = TICKETS[t.name].part; if (!part) return 0;
  if (['cooler', 'ram', 'sto', 'psu'].includes(part)) {
    if (card.slot === part) return t.pts;
    if (card.slot === 'kit' && (part === 'ram' || part === 'sto')) return t.pts;
    return 0;
  }
  if (part === 'dsp') return card.kind === 'dsp' ? t.pts : 0;
  if (part === 'prn') return card.kind === 'prn' ? t.pts : 0;
  if (part === 'nic') return card.id === 'EXP-12' ? t.pts : 0;
  return 0;
}
const taskNeeds = t => TASK_NEEDS[t.id];
const taskMet = (p, t) => t.kind === 'task' && online(p) && taskNeeds(t).every(j => j.state(p));
function taskStatus(p, t) { return taskNeeds(t).map(j => !!j.state(p)); }

// ============================================================ ready / online
// ready-to-POST: all required slots, no faults (or, 'believed': ignoring misreads), power, and every Spec Sheet Requirement
function ready(p, believed) {
  if (!slotsFilled(p)) return false;
  if (believed ? !coreValid(p, true) : faults(p).length) return false;
  if (!powerOk(p)) return false;
  return specReqsMet(p);
}
const online = p => p.post !== null && ready(p, false);
const onlineBelieved = p => p.post !== null && ready(p, true);

function benchmark(p) {
  if (!online(p)) return 0;
  const core = p.core;
  const cpu = core.cpu ? core.cpu.tier : p.b.lapCpuTier;
  let best = Math.max(...drives(p).map(d => d.tier));
  if (p.raid && (p.raid.level === 0 || p.raid.level === 10)) best = Math.min(5, best + 1);
  return cpu + core.ram.tier + best + gpuTier(p);
}
function specPoints(p) {
  if (!online(p)) return 0;
  const s = SPEC[p.spec];
  return specValue(p.spec) + sum(s.bonus.filter(([j]) => j.state(p)).map(([, pts]) => pts));
}
const taskPoints = p => sum(p.done.map(x => x.pts));
function totalScore(p) { return p.bonus + benchmark(p) + specPoints(p) + taskPoints(p); }
function scoreParts(p) { return { bonus: p.bonus, bench: benchmark(p), spec: specPoints(p), tasks: taskPoints(p), total: totalScore(p) }; }

// ================================================================== the game
function newGame(cfg) {
  cfg = Object.assign({ seed: Date.now() % 1e9, humanSeat: 0, audit: 'named', p2Rounds: 5, p1Cap: 30, profile: 'human', plays: 2, handLimit: 5, mistake: 0.10 }, cfg || {});
  const rng = mulberry32(cfg.seed);
  const G = { cfg, rng, log: [], phase: 'setup', round: 0, p2round: 0, over: false, firstPostRound: null,
    decks: { comp: shuffle(DATA.comp.slice(), rng), addon: shuffle(DATA.addon.slice(), rng), task: shuffle(DATA.task.slice(), rng) },
    disc: { comp: [], addon: [], task: [] }, boardPool: shuffle(DATA.boards.slice(), rng), specPool: shuffle(DATA.spec.map(s => s.id), rng),
    P: [], t: null, setup: null };
  for (let i = 0; i < 2; i++) {
    const human = cfg.humanSeat === i;
    const p = newPlayer(i, human, human ? 'You' : (cfg.humanSeat === null ? 'Bot ' + (i + 1) : 'Computer'));
    p.profile = cfg.profile; G.P.push(p);
  }
  G.first = cfg.first !== undefined ? cfg.first : (rng() < 0.5 ? 0 : 1);
  for (const p of G.P) { p.dealt = { specs: [G.specPool.pop(), G.specPool.pop(), G.specPool.pop()], boards: [] }; dealBoards(G, p); }
  return G;
}
function dealBoards(G, p) {
  // 3 boards that can meet at least one dealt Spec Sheet (otherwise reshuffle and redraw)
  for (let tries = 0; tries < 50; tries++) {
    if (G.boardPool.length < 3) break;
    const bs = [G.boardPool.pop(), G.boardPool.pop(), G.boardPool.pop()];
    if (bs.some(b => p.dealt.specs.some(s => boardMeets(s, b)))) { p.dealt.boards = bs; return; }
    G.boardPool.push(...bs); shuffle(G.boardPool, G.rng);
  }
  p.dealt.boards = G.boardPool.splice(0, 3);
}
function L(G, seat, text, kind) { G.log.push({ seat, text, kind: kind || 'info', round: G.round, phase: G.phase }); }

function draw(G, deck) {
  const pile = G.decks[deck];
  if (!pile.length) { const d = G.disc[deck]; if (!d.length) return null; shuffle(d, G.rng); pile.push(...d); d.length = 0; }
  return pile.pop();
}
function give(p, c) { p.hand.push(c); }
function discardFromHand(G, p, c) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); G.disc[c.deck].push(c); }

function chooseSetup(G, p, specId, boardId) {
  p.spec = specId; p.b = byId(boardId);
  const rest = p.dealt.boards.filter(b => b.id !== boardId);   // returned to the box
  void rest;
  delete p.dealt;
  L(G, p.seat, `${p.name} picked a Spec Sheet and a board.`);
}
function finishSetup(G) {
  for (const p of G.P) for (let i = 0; i < 3; i++) { const c = draw(G, 'comp'); if (c) give(p, c); }
  G.phase = 1; G.round = 0;
  L(G, null, `Phase 1 — the POST race! ${G.P[G.first].name} goes first.`, 'phase');
}

// ---- turn state machine --------------------------------------------------
// G.t = {seat, kind:'p1'|'p2', step:'take'|'deck'|'keep'|'play'|'discard'|'done', look:[], deck, plays, posted, recycled}
function beginRound(G) {
  G.round++; G.order = [G.first, 1 - G.first]; G.ti = 0;
  if (G.phase === 2) G.p2round++;
}
function startTurn(G) {
  if (G.over) return null;
  if (!G.order || G.ti >= G.order.length) beginRound(G);
  const p = G.P[G.order[G.ti]];
  const phase2Play = G.phase === 2 && p.post !== null;
  const t = G.t = { seat: p.seat, kind: phase2Play ? 'p2' : 'p1', step: 'draw', look: [], deck: 'comp', plays: G.cfg.plays, posted: false, claimed: 0, called: false, installs: 0 };
  if (phase2Play) {
    const tk = draw(G, 'task'); if (tk) { p.tasks.push(tk); L(G, p.seat, `${p.name} drew a ${tk.kind === 'ticket' ? 'Trouble Ticket' : 'Task'}: ${tk.name}.`); }
    t.step = 'deck';
  } else if (G.phase === 2 && G.disc.comp.length) { t.step = 'take'; }
  return t;
}
function takeFromDiscard(G, cardId) {
  const p = G.P[G.t.seat], d = G.disc.comp, i = d.findIndex(c => c.id === cardId);
  if (i >= 0) { const [c] = d.splice(i, 1); give(p, c); L(G, p.seat, `${p.name} took ${nm(c)} from the Components discard pile.`); }
  G.t.step = 'draw';
}
function skipTake(G) { G.t.step = 'draw'; }
function chooseDeck(G, deck) { G.t.deck = deck; G.t.step = 'draw'; }
function drawLook(G) {
  const t = G.t, p = G.P[t.seat];
  const deck = t.kind === 'p2' ? t.deck : 'comp';
  t.deck = deck; t.look = [];
  for (let i = 0; i < 3; i++) { const c = draw(G, deck); if (c) t.look.push(c); }
  t.step = 'keep';
  L(G, p.seat, `${p.name} drew 3 from ${deck === 'comp' ? 'Components' : 'Add-ons'}.`);
  return t.look;
}
function keep(G, ids) {
  const t = G.t, p = G.P[t.seat];
  const want = Math.min(2, t.look.length);
  const kept = [];
  for (const id of ids) { const c = t.look.find(x => x.id === id && !kept.includes(x)); if (c && kept.length < want) kept.push(c); }
  for (const c of t.look) if (!kept.includes(c) && kept.length < want) kept.push(c);
  for (const c of t.look) { if (kept.includes(c)) give(p, c); else G.disc[t.deck].push(c); }
  t.look = []; t.step = 'play';
}
// which cards could the current player install this instant? -> {c: err|null}
function installCheck(G, p, c) {
  const strict = G.t && (G.t.kind === 'p2' || G.cfg.audit === 'off' || p.profile === 'perfect' || !p.human && G.cfg.audit === 'off');
  return tryInstall(p, c, { lenient: !strict && p.human && c.deck === 'comp' });
}
function applyInstall(G, p, c, r) {
  const q = r.q;
  for (const k of ['core', 'cpu2', 'drives', 'raid', 'exp', 'dsp', 'adp', 'prn', 'per', 'bad', 'kit']) p[k] = q[k];
  const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1);
  for (const o of r.olds) G.disc[o.deck].push(o);
}
function install(G, cardId, opts) {
  const t = G.t, p = G.P[t.seat], c = p.hand.find(x => x.id === cardId);
  if (!c) return { ok: false, err: 'Card not in hand.' };
  const free = c.kind === 'adp';
  if (t.plays <= 0 && !free) return { ok: false, err: 'No plays left.' };
  const strictHuman = t.kind === 'p2' || G.cfg.audit === 'off';
  const r = tryInstall(p, c, Object.assign({ lenient: p.human && !strictHuman && c.deck === 'comp' }, opts || {}));
  if (!r.q) return { ok: false, err: r.err };
  applyInstall(G, p, c, r);
  if (!free) t.plays--;
  t.installs++;
  L(G, p.seat, `${p.name} installed ${nm(c)}${r.olds.length ? ` (replacing ${r.olds.map(nm).join(', ')})` : ''}.`, 'play');
  return { ok: true, olds: r.olds };
}
function recycle(G, ids) {
  const t = G.t, p = G.P[t.seat];
  if (t.plays <= 0) return { ok: false, err: 'No plays left.' };
  const cs = ids.map(id => p.hand.find(x => x.id === id)).filter(Boolean).slice(0, 3);
  if (!cs.length) return { ok: false, err: 'Pick up to 3 cards to recycle.' };
  const deck = t.kind === 'p2' ? t.deck : 'comp';
  for (const c of cs) discardFromHand(G, p, c);
  for (let i = 0; i < cs.length; i++) { const x = draw(G, deck); if (x) give(p, x); }
  t.plays--;
  L(G, p.seat, `${p.name} recycled ${cs.length} card${cs.length > 1 ? 's' : ''}.`, 'play');
  return { ok: true };
}
function closeTicket(G, cardId, ticketId) {
  const t = G.t, p = G.P[t.seat];
  const c = p.hand.find(x => x.id === cardId), tk = p.tasks.find(x => x.id === ticketId);
  if (!c || !tk) return { ok: false, err: 'Missing card or ticket.' };
  if (t.plays <= 0) return { ok: false, err: 'No plays left.' };
  if (!online(p)) return { ok: false, err: 'Your build must be ONLINE to close a ticket.' };
  const pts = solves(c, tk);
  if (!pts) return { ok: false, err: `${nm(c)} can't close ${tk.name}.` };
  discardFromHand(G, p, c);
  p.tasks.splice(p.tasks.indexOf(tk), 1); p.done.push({ card: tk, pts });
  t.plays--;
  L(G, p.seat, `${p.name} closed "${tk.name}" with ${nm(c)} (+${pts}).`, 'score');
  return { ok: true, pts };
}
function claimTasks(G, p) {
  let n = 0;
  for (const tk of p.tasks.slice()) if (taskMet(p, tk)) { p.tasks.splice(p.tasks.indexOf(tk), 1); p.done.push({ card: tk, pts: tk.pts }); n++; L(G, p.seat, `${p.name} completed "${tk.name}" (+${tk.pts}).`, 'score'); }
  return n;
}
// ---- POST call & audit ----
function canCallPost(p) { return slotsFilled(p) && specReqsMet(p) && p.post === null; }
function callPost(G) {
  const t = G.t, p = G.P[t.seat], opp = G.P[1 - p.seat];
  t.called = true;
  const fl = (G.cfg.audit === 'off') ? [] : faults(p).concat(powerOk(p) ? [] : []);
  if (!fl.length) {
    p.post = G.round; t.posted = true;
    L(G, p.seat, `${p.name} called POST — ${G.cfg.audit === 'off' ? 'it POSTs!' : 'audit clear. It POSTs!'}`, 'post');
    if (G.phase === 1 && G.firstPostRound === null) G.firstPostRound = G.round;
    return { ok: true, posted: true };
  }
  const f = fl[0];
  // remove the faulty part
  removePart(G, p, f.part);
  for (let i = 0; i < 2; i++) { const x = draw(G, 'comp'); if (x) give(opp, x); }
  L(G, p.seat, `${p.name} called POST but the audit found a fault: ${nm(f.part)} — ${G.cfg.audit === 'hidden' ? 'something doesn\'t fit' : f.why} ${opp.name} draws 2 Components.`, 'fault');
  return { ok: true, posted: false, fault: f };
}
function removePart(G, p, part) {
  if (part === p.kit) { for (const s of ['ram', 'sto']) if (p.core[s] && p.core[s].kitHalf) delete p.core[s]; G.disc.comp.push(p.kit); p.kit = null; return; }
  for (const [s, v] of Object.entries(p.core)) if (v === part) { delete p.core[s]; p.bad.delete(part.id); G.disc[part.deck].push(part); return; }
  if (p.cpu2 === part) { p.cpu2 = null; G.disc.comp.push(part); return; }
  const i = p.drives.indexOf(part); if (i >= 0) { p.drives.splice(i, 1); G.disc.comp.push(part); }
}
// ---- end of turn ----
function endPlays(G) {
  const t = G.t, p = G.P[t.seat];
  if (t.kind === 'p2') t.claimed = claimTasks(G, p);
  t.step = 'discard';
  return t;
}
function mustDiscard(G) { const p = G.P[G.t.seat]; return Math.max(0, p.hand.length - G.cfg.handLimit); }
function discardDown(G, ids) {
  const t = G.t, p = G.P[t.seat];
  for (const id of ids) { const c = p.hand.find(x => x.id === id); if (c && p.hand.length > G.cfg.handLimit) discardFromHand(G, p, c); }
  return p.hand.length <= G.cfg.handLimit;
}
function finishTurn(G) {
  const t = G.t, p = G.P[t.seat];
  if (p.hand.length > G.cfg.handLimit) return { ok: false, err: 'Discard down to ' + G.cfg.handLimit + ' cards first.' };
  t.step = 'done';
  G.ti++;
  if (G.ti >= G.order.length) return endRound(G);
  return { ok: true };
}
function endRound(G) {
  if (G.phase === 1) {
    const posted = G.P.filter(p => p.post === G.round);
    if (posted.length || G.round >= G.cfg.p1Cap) {
      for (const p of posted) { p.bonus = 3; }
      if (posted.length) L(G, null, `Phase 1 ends. POST bonus (+3) to ${posted.map(p => p.name).join(' and ')}.`, 'phase');
      else L(G, null, `Nobody POSTed in ${G.cfg.p1Cap} rounds, so the shop moves on to service calls (no POST bonus).`, 'phase');
      G.phase = 2; G.p2round = 0;
      for (const p of G.P) for (let i = 0; i < 3; i++) { const tk = draw(G, 'task'); if (tk) p.tasks.push(tk); }
      L(G, null, 'Phase 2 — service calls. Everyone drew 3 Task cards.', 'phase');
    }
  } else if (G.phase === 2 && G.p2round >= G.cfg.p2Rounds) {
    finalAudit(G); return { ok: true, over: true };
  }
  return { ok: true, roundEnd: true };
}
function finalAudit(G) {
  for (const p of G.P) {
    const fl = faults(p);
    for (const f of fl) { removePart(G, p, f.part); L(G, p.seat, `Final audit: ${p.name}'s ${nm(f.part)} is faulty and removed. ${f.why}`, 'fault'); }
    for (const part of [...p.bad]) p.bad.delete(part);
  }
  G.over = true; G.phase = 'over';
  const [a, b] = G.P, sa = scoreParts(a), sb = scoreParts(b);
  G.result = { scores: [sa, sb], winner: sa.total === sb.total ? (sa.bench === sb.bench ? -1 : (sa.bench > sb.bench ? 0 : 1)) : (sa.total > sb.total ? 0 : 1) };
  L(G, null, 'Game over — final audit complete.', 'phase');
}

root.POST = {
  init, byId, newGame, required, hasPsu, stoOk, storageFits, kitHalves, halvesOf, tryInstall, faults, faultsOf, coreValid, powerOk, powerNeed, psuCap, slotsFilled,
  slotsFit, usbOk, displayOk, videoOuts, lap, drives, totalTb, ramGb, gpuTier, installed, has, perHas, dspHas, clone, newPlayer, mulberry32, shuffle, sum, nm,
  J, isk, isp, isper, ise, isram, SPEC, specValue, boardMeets, specReqsMet, specStatus, TASK_NEEDS, TICKETS, solves, taskMet, taskStatus, taskNeeds,
  ready, online, onlineBelieved, benchmark, specPoints, taskPoints, totalScore, scoreParts, draw, give, discardFromHand, chooseSetup, finishSetup,
  startTurn, takeFromDiscard, skipTake, chooseDeck, drawLook, keep, installCheck, applyInstall, install, recycle, closeTicket, claimTasks, canCallPost,
  callPost, removePart, endPlays, mustDiscard, discardDown, finishTurn, endRound, finalAudit, L, dealBoards,
};
if (typeof module !== 'undefined') module.exports = root.POST;
})(typeof window !== 'undefined' ? window : globalThis);
