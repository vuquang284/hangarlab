// HangarLab UI: shared state, storage, units, form builders, charts and header.
// State lives in S; inputs bind with data-k (design path) or data-lib (library path).
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

const U = window.UAS;
const KEY = 'uas-workbench.v1'; // storage key kept from the old name so saved work still loads
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const fin = (v) => v != null && isFinite(v);
const fmt = (v, d = 1) => (fin(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const PRN = () => (S.lib.printer || { lineW: 0.45, layerH: 0.2 });
const SUBS = ['Structures', '3D printed', 'Propulsion', 'Power', 'Avionics', 'Sensors', 'Comms', 'Compute', 'Payload', 'Wiring', 'Hardware', 'Other'];
const RAILS = [['', '—'], ['VBAT', 'VBAT'], ['3.3V', '3.3 V'], ['5V', '5 V'], ['9V', '9 V'], ['12V', '12 V'], ['24V', '24 V'], ['Separate', 'Own supply']];
const RF_OPTS = [['', '—']].concat(Object.entries(U.BANDS).filter(([k]) => k !== 'gnss').map(([k, b]) => [k, b.label]));
const TYPE_LABEL = { multirotor: 'Multirotor', fixedwing: 'Fixed-wing', vtol: 'Hybrid VTOL' };

// subsystems: S.lib.subs = [{key, name, color}]. Designs store the key, so renaming never touches data.
// CORE_SUBS are used by the calculations (motors, pack, payload, airframe, printed parts): rename and recolor only.
const SUB_HUE = { Structures: 212, '3D printed': 84, Propulsion: 24, Power: 352, Avionics: 268, Sensors: 172, Comms: 196, Compute: 316, Payload: 140, Wiring: 50, Hardware: 32, Other: 220 };
const CORE_SUBS = ['Structures', '3D printed', 'Propulsion', 'Power', 'Payload', 'Other'];
const hueHex = (h, sat, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
const defaultSubColor = (key) => { let h = SUB_HUE[key]; if (h == null) { h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) % 360; } return hueHex(h, key === 'Other' ? 0.09 : key === 'Hardware' ? 0.26 : 0.66, 0.54); };
const subsOf = () => (S && S.lib && S.lib.subs) || SUBS.map((k) => ({ key: k, name: k, color: defaultSubColor(k) }));
const subFind = (sub) => { const l = subsOf(), t = String(sub ?? '').toLowerCase(); return l.find((x) => x.key === sub) || l.find((x) => x.name.toLowerCase() === t); };
const subName = (sub) => (subFind(sub) || {}).name || sub || 'Other';
const subKeys = () => subsOf().map((x) => x.key);
const subOrder = (sub) => { const i = subKeys().indexOf((subFind(sub) || {}).key); return i < 0 ? 99 : i; };
function subColor(sub) { const x = subFind(sub); return x ? x.color : defaultSubColor(sub); }
// name or key from a spreadsheet / paste → key; unknown names become new subsystems
function subKeyOf(v) {
  const t = String(v || '').trim();
  if (!t) return 'Other';
  const x = subFind(t);
  if (x) return x.key;
  S.lib.subs.push({ key: t, name: t, color: defaultSubColor(t) });
  return t;
}
const subTag = (sub) => `<span class="subtag" style="--sc:${subColor(sub)}">${esc(subName(sub))}</span>`;

// ---------- state ----------
let S;
const MISSION_DEF = {
  multirotor: [['climb', 60], ['cruise', 2, 'head'], ['loiter', 10], ['cruise', 2, 'tail'], ['descend', 60]],
  fixedwing: [['climb', 120], ['cruise', 10, 'head'], ['loiter', 15], ['cruise', 10, 'tail'], ['descend', 120]],
  vtol: [['hover', 30], ['transition', 1], ['climb', 100], ['cruise', 8, 'head'], ['loiter', 10], ['cruise', 8, 'tail'], ['descend', 100], ['transition', 1], ['hover', 30]],
};
function fixDesign(p) {
  if (!p.mission) p.mission = { wind: 0, reserve: 0, climb: 2, vMr: 0, segs: (MISSION_DEF[p.type] || MISSION_DEF.fixedwing).map(([type, v, dir]) => ({ type, v, dir: dir || 'none' })) };
  if (!p.cg) p.cg = { le: 0, mac: 0, pos: {} };
  if (p.mr && p.mr.lean == null) p.mr.lean = 30;
  if (p.vtol) { const vd = U.VTOL_DEF[p.vtol.kind] || U.VTOL_DEF.quadplane; if (p.vtol.accel == null) p.vtol.accel = vd.acc; if (p.vtol.hoverPen == null) p.vtol.hoverPen = vd.pen; if (p.vtol.transitions == null) p.vtol.transitions = 2; }
  if (!p.resFix) { if (p.mission.reserve === 20) p.mission.reserve = 0; if (p.vtol && p.vtol.reserve === 20) p.vtol.reserve = 0; p.resFix = 1; }
  return p;
}
function fresh() {
  const seed = clone(window.UAS_SEED);
  seed.projects.forEach(fixDesign);
  seed.lib.subs = SUBS.map((k) => ({ key: k, name: k, color: defaultSubColor(k) }));
  seed.lib.knownDefaults = LIB_KINDS.flatMap((k) => (seed.lib[k] || []).map((x) => `${k}:${x.id}`));
  return { v: 5, settings: migrate({ v: 5, projects: [], lib: {} }).settings, theme: 'dark', tab: 'design', libTab: 'motors', massView: 'edit', bomSel: [], active: seed.projects[0].id, projects: seed.projects, lib: seed.lib };
}
// v1 stored motor+prop+bench rows together as "sets"; v2 splits them and adds a payload field
function migrate(s) {
  if (s.v === 1) {
    const { motors, props, tests, map } = U.splitSets(s.lib.sets);
    Object.assign(s.lib, { motors, props, tests });
    delete s.lib.sets;
    for (const p of s.projects) {
      for (const o of [p.mr, p.fw]) { if (o && o.set && map[o.set]) [o.motor, o.prop] = map[o.set]; if (o) delete o.set; }
      const pay = (p.bom || []).filter((r) => r.sub === 'Payload' && /payload/i.test(r.name));
      p.payload = { name: pay.length ? pay.map((r) => r.name).join(' + ') : 'Payload', g: pay.reduce((a, r) => a + r.qty * r.g, 0) };
      p.bom = (p.bom || []).filter((r) => !pay.includes(r));
    }
    if (s.libTab === 'sets') s.libTab = 'motors';
    s.v = 2;
  }
  for (const pr of (s.lib && s.lib.props) || []) { const a = (window.UAS_APC || {})[pr.name]; if (a && !pr.data) pr.data = a.data; }
  if (s.v === 2) {
    // batteries become single packs with cells in parallel and a pack count
    const fix = (b) => { if (b.cellMah == null) { b.p = b.p || 1; b.cellMah = (+b.mah || 0) / b.p; } return b; };
    for (const p of s.projects) Object.assign(fix(p.batt), { packs: p.batt.packs || 1, conn: p.batt.conn || 'parallel' });
    (s.lib.batteries || []).forEach(fix);
    s.lib.printed = s.lib.printed || [];
    const seed = window.UAS_SEED.lib;
    for (const k of ['batteries', 'printed']) for (const x of seed[k]) if (!s.lib[k].some((y) => y.id === x.id)) s.lib[k].push(clone(x));
    s.lib.printer = s.lib.printer || clone(seed.printer);
    s.v = 3;
  }
  if (s.v === 3) {
    // printed parts: "wall share %" becomes wall count + top/bottom layers + surface area
    const fix = (x) => { if (x && x.walls == null) { x.walls = 3; x.tb = 4; x.area = x.area || 0; delete x.shell; } };
    s.lib.printer = s.lib.printer || { lineW: 0.45, layerH: 0.2 };
    for (const x of s.lib.printed || []) {
      fix(x);
      const m = U.MATERIALS.find((q) => q.id === x.mat);
      if (m) x.g = +U.partMass(x, m.rho, s.lib.printer).toFixed(1);
    }
    s.projects.forEach((p) => fix(p.mat));
    s.v = 4;
  }
  if (s.v === 4) {
    for (const p of s.projects) {
      if (p.fw.drag) continue;
      const b = +p.fw.span || 1, extras = [];
      if ((p.bom || []).some((r) => /gimbal|siyi|a8 mini|camera ball/i.test(r.name))) extras.push({ name: 'Gimbal camera', cda: 40, qty: 1 });
      const ant = (p.bom || []).filter((r) => r.rf && r.rf !== 'gnss').length;
      if (ant) extras.push({ name: 'Exposed antenna', cda: 5, qty: ant });
      const quadp = p.type === 'vtol' && p.vtol && p.vtol.kind === 'quadplane';
      p.fw.drag = { mode: 'buildup', fusL: +(0.7 * b).toFixed(2), fusD: +(0.09 * b).toFixed(3), tailPct: 22, tc: 0.12, booms: quadp ? { n: 2, L: +(0.55 * b).toFixed(2), d: 0.025 } : { n: 0, L: 0, d: 0 }, extras, misc: 15, eAuto: true };
    }
    s.v = 5;
  }
  for (const p of s.projects) if (p.fw && p.fw.drag && !p.fw.drag.finish) p.fw.drag.finish = 'foam';
  for (const p of s.projects) if (p.fw && p.fw.drag && !p.fw.drag.pods) p.fw.drag.pods = { mode: 'auto' };
  const hadSettings = !!s.settings && s.settings.detail == null && s.projects.length > 0; // existing users keep every input
  s.settings = Object.assign({ calc: { cons: 1.2, defK: 1.25, learn: true }, logs: { speed: 10, view: '3d' }, backups: { on: true }, quickstart: true, detail: 'simple', currency: '$', adv: { on: false, conns: '', wire: '' }, newDesign: { usable: 80, alt: 0, temp: 15 } }, s.settings || {});
  s.projects.forEach(fixDesign);
  for (const r of (s.lib.parts || []).concat(...s.projects.map((p) => p.bom || []))) if (r.rf === 'gnss') r.rf = '';
  const ad = s.settings.adv = s.settings.adv || { on: false };
  if (!ad.conns) ad.conns = U.CONNECTORS.map((c) => c.join(', ')).join('\n');
  if (!ad.wire) ad.wire = U.WIRE.map((w) => w.join(', ')).join('\n');
  if (!s.lib.subs) {
    const used = (s.lib.parts || []).map((x) => x.sub).concat(...s.projects.map((p) => (p.bom || []).map((r) => r.sub))).filter(Boolean);
    s.lib.subs = [...new Set(SUBS.concat(used))].map((k) => ({ key: k, name: k, color: defaultSubColor(k) }));
  }
  for (const p of s.projects) delete p.servos; // servo sizing was removed
  // the built-in example packs were trimmed to three; drop the retired ones once (designs keep their own pack values)
  if (!s.lib.batPruned) { const old = ['6s5000', '4s5000', '6s4000', 'p45b-6s2p', 'p45b-6s4p']; s.lib.batteries = (s.lib.batteries || []).filter((x) => !old.includes(x.id)); s.lib.batPruned = 1; }
  if (hadSettings) s.settings.detail = 'detailed';
  s.massView = s.massView || 'edit';
  s.bomSel = s.bomSel || [];
  return s;
}
// up to 2 automatic copies of the saved workspace: one per 12 h, and always before an upgrade changes it
const BKEY = KEY + '.backups';
const backups = () => { try { return JSON.parse(localStorage.getItem(BKEY) || '[]'); } catch (e) { return []; } };
function backup(raw, why) {
  try {
    const list = backups();
    if (why === 'daily' && list[0] && Date.now() - list[0].t < 12 * 3600e3) return;
    list.unshift({ t: Date.now(), why, raw });
    localStorage.setItem(BKEY, JSON.stringify(list.slice(0, 2)));
  } catch (e) { /* storage full: skip the backup rather than fail */ }
}
// library items shipped in a newer build reach existing users once; anything they already have or have deleted stays as is
const LIB_KINDS = ['motors', 'props', 'tests', 'batteries', 'parts', 'airframes', 'printed'];
let mergedNote = '';
function mergeDefaults(s) {
  const seed = window.UAS_SEED.lib, first = !Array.isArray(s.lib.knownDefaults);
  const known = new Set(s.lib.knownDefaults || []), all = [];
  let added = 0;
  for (const k of LIB_KINDS) {
    s.lib[k] = s.lib[k] || [];
    for (const x of seed[k] || []) {
      const key = `${k}:${x.id}`;
      all.push(key);
      if (first || known.has(key)) continue; // first run only records what this build ships
      const lc = (v) => String(v || '').toLowerCase();
      const have = s.lib[k].some((y) => y.id === x.id || (k === 'tests' ? y.motor === x.motor && y.prop === x.prop : lc(y.name) === lc(x.name)));
      const orphan = k === 'tests' && (!s.lib.motors.some((m) => m.id === x.motor) || !s.lib.props.some((p) => p.id === x.prop));
      if (!have && !orphan) { s.lib[k].push(clone(x)); added++; }
    }
  }
  s.lib.knownDefaults = [...new Set([...known, ...all])];
  if (added) mergedNote = `Added ${added} new library item${added > 1 ? 's' : ''} from this version.`;
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const old = JSON.parse(raw);
      if (old.v !== 5 || !(old.settings && old.settings.backups && old.settings.backups.on === false)) backup(raw, old.v !== 5 ? `before upgrade from v${old.v}` : 'daily');
      const s = migrate(old);
      if (s && s.v === 5 && s.projects && s.projects.length) { const before = JSON.stringify({ projects: s.projects, lib: s.lib, active: s.active }); mergeDefaults(s); if (mergedNote) undoStack.push(before); return s; }
    }
  } catch (e) { /* storage blocked or unreadable: run from seed */ }
  return fresh();
}
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (e && e.name === 'QuotaExceededError') toast('Browser storage is full. Export a backup and remove unused prop data.'); }
  }, 250);
}
const P = () => S.projects.find((p) => p.id === S.active) || S.projects[0];

function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, path, v) {
  const ks = path.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] = a[ks[i]] ?? {};
  a[ks[ks.length - 1]] = v;
}
// ---------- units: everything is stored in SI; imperial is display + input only ----------
const UCONV = { 'g>oz': 0.0352740, 'kg>lb': 2.20462, 'm>ft': 3.28084, 'm>in': 39.3701, 'm²>ft²': 10.7639, 'm/s>mph': 2.23694, 'km/h>mph': 0.621371, 'km>mi': 0.621371, 'cm³>in³': 0.0610237, 'cm²>in²': 0.155, 'mm>in': 0.0393701, 'kg/m²>oz/ft²': 3.27706, 'g/dm²>oz/ft²': 0.327706 };
const UDEF = { g: 'oz', kg: 'lb', m: 'ft', 'm²': 'ft²', 'm/s': 'mph', 'km/h': 'mph', km: 'mi', '°C': '°F', 'cm³': 'in³', 'cm²': 'in²', mm: 'in', 'kg/m²': 'oz/ft²', 'g/dm²': 'oz/ft²' };
const imperial = () => S.units === 'imperial';
const uKey = (si, imp) => (si in UDEF ? `${si}>${imp || UDEF[si]}` : null);
const toImp = (v, key) => (key.startsWith('°C') ? v * 1.8 + 32 : v * UCONV[key]);
const fromImp = (v, key) => (key.startsWith('°C') ? (v - 32) / 1.8 : v / UCONV[key]);
const uName = (key) => key.split('>')[1];
const fmtC = (x) => { const a = Math.abs(x); return fmt(x, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
const toDisp = (v, key) => (key && imperial() && fin(+v) && v !== '' ? +toImp(+v, key).toPrecision(6) : v);
// grams shown in running text: oz below a pound, lb above
function convNum(n, unit) {
  const key = uKey(unit);
  let x = toImp(n, key), u = uName(key);
  if (unit === 'g' && Math.abs(x) >= 16) { x /= 16; u = 'lb'; }
  return [x, u];
}
// convert "12.5 m/s", "1,360 g", "34–40 km" ... inside a text string
const U_RX = /(-?\d[\d,]*(?:\.\d+)?)(?:\s*[–-]\s*(-?\d[\d,]*(?:\.\d+)?))?([\s  ]*)(kg\/m²|g\/dm²|km\/h|m\/s|cm³|cm²|m²|mm|km|kg|°C|m|g)(?![\w/²³])/g;
function uText(str) {
  if (!imperial() || !str) return str;
  return String(str).replace(U_RX, (all, a, b, sp, unit) => {
    const n1 = parseFloat(a.replace(/,/g, '')), [x1, u] = convNum(n1, unit);
    if (b == null) return `${fmtC(x1)}${sp || ' '}${u}`;
    const [x2] = convNum(parseFloat(b.replace(/,/g, '')), unit);
    return `${fmtC(x1)}–${fmtC(x2)}${sp || ' '}${u}`;
  });
}
const HEAD_MAP = { 'Unit g': 'Unit oz', 'Total g': 'Total oz', 'Weight g': 'Weight oz', 'Pack g': 'Pack oz', 'Mass g': 'Mass oz', 'g': 'oz', 'Span m': 'Span in', 'Wing m²': 'Wing ft²', 'Length m': 'Length in', 'Volume cm³': 'Volume in³', 'Area cm²': 'Area in²', 'Motor g': 'Motor oz', 'Prop g': 'Prop oz', 'Max thrust g': 'Max thrust oz' };
// walk rendered text (not inputs, not raw log data) and convert units in place
function convertDom(root) {
  if (!imperial() || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.ro, .tree-msgs, .lv-params, textarea, script, style, .u-legend, [data-raw]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const t = n.nodeValue, head = n.parentElement.tagName === 'TH' && HEAD_MAP[t.trim()];
    const nv = head ? t.replace(t.trim(), head) : uText(t);
    if (nv !== t) n.nodeValue = nv;
  }
}

function readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number' || el.type === 'range' || el.dataset.num != null) {
    let x = parseFloat(el.value);
    if (!isFinite(x)) return 0;
    if (el.dataset.u && imperial()) x = +fromImp(x, el.dataset.u).toPrecision(6);
    return x;
  }
  return el.value;
}

function toast(msg, action) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.append(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.remove(); action.fn(); };
    t.append(b);
  }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), action ? 6000 : 2200);
}

// undo: snapshots of designs + library (not view state), newest last
const undoStack = [];
const snapNow = () => JSON.stringify({ projects: S.projects, lib: S.lib, active: S.active });
function snapshot(json) { undoStack.push(json || snapNow()); if (undoStack.length > 30) undoStack.shift(); }
function undo() {
  const j = undoStack.pop();
  if (!j) return toast('Nothing to undo.');
  Object.assign(S, JSON.parse(j));
  save(); render(); toast('Undone');
}
// delete/import helper: snapshot, act, offer undo
function withUndo(msg, fn) { snapshot(); fn(); save(); render(); toast(msg, { label: 'Undo', fn: undo }); }

let pendingSnap = null;
document.addEventListener('focusin', (e) => { if (e.target.dataset && (e.target.dataset.k || e.target.dataset.lib)) pendingSnap = snapNow(); });
document.addEventListener('change', (e) => { if (pendingSnap && e.target.dataset && (e.target.dataset.k || e.target.dataset.lib)) { if (pendingSnap !== snapNow()) snapshot(pendingSnap); pendingSnap = snapNow(); } });

// ---------- form builders ----------
const attrs = (o) => (o.rebuild ? ' data-rebuild' : '') + (o.min != null ? ` min="${o.min}"` : '') + (o.max != null ? ` max="${o.max}"` : '') + (o.step && o.min == null ? ` step="${o.step}"` : ' step="any"'); // with a min, a step would flag values off the step grid as invalid
const bindAttr = (k, o) => (o.st ? `data-s="${k}"` : o.lib ? `data-lib="${k}"` : `data-k="${k}"`);
const valOf = (k, o) => getPath(o.st ? S : o.lib ? S.lib : P(), k);
function num(k, label, o = {}) {
  const key = o.unit && uKey(o.unit, o.imp), imp = key && imperial();
  const unit = imp ? uName(key) : o.unit, v = imp ? toDisp(valOf(k, o), key) : valOf(k, o);
  const a = imp ? attrs(Object.assign({}, o, { min: o.min != null ? +toImp(o.min, key).toPrecision(4) : null })) : attrs(o);
  return `<label class="f${o.wide ? ' wide' : ''}"><span>${label}</span><span class="in"><input type="number" id="i-${k}" ${bindAttr(k, o)} value="${esc(v)}"${a}${key ? ` data-u="${key}"` : ''}>${unit ? `<em>${unit}</em>` : ''}</span></label>`;
}
function txt(k, label, o = {}) {
  return `<label class="f${o.wide ? ' wide' : ''}"><span>${label}</span><input type="text" id="i-${k}" ${bindAttr(k, o)} value="${esc(valOf(k, o))}"${o.rebuild ? ' data-rebuild' : ''}></label>`;
}
function sel(k, label, opts, o = {}) {
  const v = valOf(k, o);
  return `<label class="f${o.wide ? ' wide' : ''}"><span>${label}</span><select id="i-${k}" ${bindAttr(k, o)}${o.rebuild ? ' data-rebuild' : ''}${o.isNum ? ' data-num' : ''}>${opts.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select></label>`;
}
function chk(k, label, o = {}) {
  return `<label class="f check"><input type="checkbox" id="i-${k}" ${bindAttr(k, o)}${valOf(k, o) ? ' checked' : ''}${o.rebuild ? ' data-rebuild' : ''}> ${label}</label>`;
}
// info icon: hover or tap shows the explanation in a small bubble
const tip = (t) => `<button type="button" class="tip" data-tip="${esc(t)}" aria-label="More info: ${esc(t)}">i</button>`;
function tipShow(b, pin) {
  let pop = $('#tipPop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'tipPop'; pop.setAttribute('role', 'tooltip'); }
  const host = b.closest('dialog') || document.body; // inside a modal the bubble must live in the dialog to show above it
  if (pop.parentNode !== host) host.appendChild(pop);
  // **bold** marks key numbers, new lines break the text into rows
  pop.innerHTML = esc(b.dataset.tip).replace(/^\*\*(.+?)\*\*/gm, '<b class="tipnum tipkey">$1</b>').replace(/\*\*(.+?)\*\*/g, '<b class="tipnum">$1</b>').replace(/\n/g, '<br>'); pop.dataset.src = b.dataset.tip; pop.hidden = false; pop.dataset.pinned = pin ? '1' : '';
  const r = b.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 8, ph = pop.offsetHeight;
  pop.style.top = (below + ph > innerHeight - 8 ? r.top - ph - 8 : below) + 'px';
}
const tipHide = (force) => { const pop = $('#tipPop'); if (pop && (force || !pop.dataset.pinned)) pop.hidden = true; };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.tip');
  if (b) { e.preventDefault(); e.stopPropagation(); const pop = $('#tipPop'); if (pop && !pop.hidden && pop.dataset.pinned && pop.dataset.src === b.dataset.tip) tipHide(true); else tipShow(b, true); return; }
  if (!e.target.closest('#tipPop')) tipHide(true);
}, true);
document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.tip'); if (b) tipShow(b, false); });
document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.tip')) tipHide(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tipHide(true); });
window.addEventListener('scroll', () => tipHide(true), true);
const gKey = (title) => `${S.tab}:${String(title).replace(/<[^>]+>/g, '').trim()}`;
const group = (title, body, open = true) => {
  const k = gKey(title), st = (S.ui && S.ui.groups && S.ui.groups[k]);
  return `<details class="group" data-g="${esc(k)}"${(st ?? open) ? ' open' : ''}><summary>${title}</summary><div class="fields">${body}</div></details>`;
};
const sideTools = `<div class="side-tools"><button class="btn ghost sm" data-act="groups-open">Expand all</button><button class="btn ghost sm" data-act="groups-close">Collapse all</button></div>`;
const motorOpts = () => S.lib.motors.map((m) => [m.id, `${m.name}${m.kv ? ` · ${m.kv}KV` : ''}`]);
const propOpts = () => S.lib.props.map((x) => [x.id, `${x.name}${x.diam ? ` · ${x.diam}×${x.pitch}"` : ''}${x.data ? ' · data' : ''}`]);
// motor + prop pickers with a line saying where the thrust numbers come from
function propPick(base, V) {
  const o = getPath(P(), base);
  const c = U.combo(S.lib, o.motor, o.prop, V);
  const t = c && c.test;
  const dd = c && c.drive;
  const extra = !c || t ? '' : dd && dd.motorModel && dd.propData ? ' Static thrust and power are solved from the motor constants and prop data.' : ` Improve it with ${[!(dd && dd.propData) && 'prop data', !(dd && dd.motorModel) && 'motor Rm/I0', 'a thrust test'].filter(Boolean).join(', ')} in Library.`;
  const src = !c ? 'Pick a motor and a prop.' : t ? `<b>Bench data</b>: ${t.rows.length} point${t.rows.length > 1 ? 's' : ''} at ${t.v} V.${dd && dd.propData ? ' Prop data used for forward flight.' : ''}` : `<b>${esc(c.source)}</b>.${extra}`;
  return `${sel(base + '.motor', 'Motor', motorOpts(), { wide: true, rebuild: true })}${sel(base + '.prop', 'Prop', propOpts(), { wide: true, rebuild: true })}<p class="hint src${t || (c && c.drive && c.drive.motorModel && c.drive.propData) ? '' : ' est'}">${src}</p>`;
}

function ro(label, value, unit, sub, state, key) {
  if (imperial()) {
    const uk = unit && uKey(unit);
    if (uk) {
      let big = false;
      value = String(value).replace(/-?\d[\d,]*(?:\.\d+)?/g, (n) => { const [x, u] = convNum(parseFloat(n.replace(/,/g, '')), unit); if (u === 'lb' && unit === 'g') big = true; return fmtC(x); });
      unit = unit === 'g' && big ? 'lb' : uName(uk);
    }
    sub = uText(sub);
    if (sub && String(sub).replace(/<[^>]+>/g, '').trim() === `${value} ${unit}`) sub = ''; // metric sub-line that just repeats the converted value
  }
  const tt = `${label}: ${String(value).replace(/<[^>]+>/g, '')}${unit ? ' ' + unit : ''}${sub ? ' · ' + String(sub).replace(/<[^>]+>/g, '') : ''}`;
  return `<div class="ro ${state || ''}${key ? ' key' : ''}" title="${esc(tt)}"><div class="l">${label}</div><div class="v">${value}${unit ? `<small>${unit}</small>` : ''}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}
const lvl = (x, warnAt, critAt, lowBad) => (!fin(x) ? '' : lowBad ? (x < critAt ? 'crit' : x < warnAt ? 'warn' : 'good') : x > critAt ? 'crit' : x > warnAt ? 'warn' : 'good');

// ---------- charts ----------
const charts = {};
const ro_ = new ResizeObserver((ents) => {
  for (const e of ents) { const c = charts[e.target.id]; if (c && e.contentRect.width > 0) c.setSize({ width: e.contentRect.width, height: c.height }); }
});
function killCharts() { for (const k in charts) { charts[k].destroy(); delete charts[k]; } ro_.disconnect(); }

function axis(label, scale, side, grid = true) {
  return {
    scale, label, side, stroke: cssv('--muted'), labelSize: 18, size: 54,
    font: '11px "Roboto Mono", monospace', labelFont: '600 11px "Barlow", sans-serif',
    grid: { show: grid, stroke: cssv('--grid'), width: 1 }, ticks: { stroke: cssv('--line'), width: 1, size: 4 },
  };
}
function drawMarks(u, cfg) {
  const ctx = u.ctx, dpr = devicePixelRatio || 1, bb = u.bbox;
  ctx.save();
  ctx.font = `${11 * dpr}px "Barlow", sans-serif`;
  let lastX = -1e9, row = 0;
  for (const m of cfg.marks || []) {
    const x = u.valToPos(m.x, 'x', true);
    if (x < bb.left || x > bb.left + bb.width) continue;
    ctx.strokeStyle = m.color || cssv('--faint'); ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(x, bb.top); ctx.lineTo(x, bb.top + bb.height); ctx.stroke();
    row = x - lastX < 90 * dpr ? (row + 1) % 3 : 0; lastX = x;
    ctx.setLineDash([]); ctx.fillText(m.label, x + 4 * dpr, bb.top + (12 + row * 13) * dpr);
  }
  for (const p of cfg.points || []) {
    if (!fin(p.x) || !fin(p.y)) continue;
    const x = u.valToPos(p.x, 'x', true), y = u.valToPos(p.y, p.scale || 'y', true);
    ctx.fillStyle = p.color || cssv('--fg'); ctx.strokeStyle = cssv('--panel'); ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, 7); ctx.fill(); ctx.stroke();
    if (p.label) { ctx.fillStyle = cssv('--fg'); ctx.fillText(p.label, x + 8 * dpr, y - 8 * dpr); }
  }
  ctx.restore();
}
// cfg.u: unit of each data column [x, s1, s2, ...] (SI); converted here when imperial is on
const uLabel = (t) => (imperial() && t ? String(t).replace(/(\(|\s|^)(m\/s|km|kg|g|m)(?=\)|$)/g, (a, pre, u) => pre + UDEF[u]) : t);
function chartUnits(cfg) {
  if (!imperial() || !cfg.u) return cfg;
  const keys = cfg.u.map((u) => (u ? uKey(u) : null));
  const cv = (arr, k) => (k ? Array.from(arr, (v) => (v == null ? v : toImp(v, k))) : arr);
  const scaleKey = (sc) => { const i = cfg.series.findIndex((x) => (x.scale || 'y') === (sc || 'y')); return i >= 0 ? keys[i + 1] : null; };
  return Object.assign({}, cfg, {
    data: cfg.data.map((col, i) => cv(col, keys[i])),
    xLabel: uLabel(cfg.xLabel), yLabel: uLabel(cfg.yLabel),
    axes: cfg.axes && cfg.axes.map((a) => Object.assign({}, a, { label: uLabel(a.label) })),
    series: cfg.series.map((x) => Object.assign({}, x, { label: uLabel(x.label) })),
    marks: (cfg.marks || []).map((m) => Object.assign({}, m, { x: keys[0] ? toImp(m.x, keys[0]) : m.x })),
    points: (cfg.points || []).map((p) => { const yk = scaleKey(p.scale); return Object.assign({}, p, { x: keys[0] ? toImp(p.x, keys[0]) : p.x, y: yk ? toImp(p.y, yk) : p.y }); }),
  });
}
function chart(id, cfg) {
  cfg = chartUnits(cfg);
  const el = document.getElementById(id);
  if (!el || !window.uPlot) { if (el) el.innerHTML = '<p class="faint">Chart library did not load (offline?).</p>'; return null; }
  if (charts[id]) charts[id].destroy();
  el.innerHTML = '';
  const scales = { x: { time: false, distr: cfg.xLog ? 3 : 1 } };
  const axes = [axis(cfg.xLabel, 'x', 2)];
  (cfg.axes || [{ scale: 'y', label: cfg.yLabel }]).forEach((a, i) => {
    scales[a.scale] = a.range ? { range: a.range } : {};
    const ax = axis(a.label, a.scale, i % 2 ? 1 : 3, i === 0);
    if (a.color) ax.stroke = a.color;
    axes.push(ax);
  });
  for (const s of cfg.series) if (!scales[s.scale || 'y']) scales[s.scale || 'y'] = {};
  const opts = {
    width: el.clientWidth || 600, height: cfg.h || 250, padding: [14, 6, 0, 0],
    cursor: { drag: { x: true, y: false }, points: { size: 6 } },
    scales, axes,
    series: [{ label: cfg.xLabel, value: (u, v) => (v == null ? '—' : fmt(v, cfg.xDec ?? 1)) }].concat(cfg.series.map((s) => ({
      label: s.label, scale: s.scale || 'y', stroke: s.color, width: s.w || 2, dash: s.dash, fill: s.fill, spanGaps: true,
      points: { show: !!s.pts, size: 5, fill: s.color }, value: (u, v) => (v == null ? '—' : fmt(v, s.dec ?? 1)),
    }))),
    hooks: { drawAxes: cfg.under ? [cfg.under] : [], draw: [(u) => drawMarks(u, cfg)], setCursor: cfg.onCursor ? [cfg.onCursor] : [] },
  };
  const u = new uPlot(opts, cfg.data, el);
  charts[id] = u;
  ro_.observe(el);
  return u;
}

// ---------- header ----------
function renderHeader() {
  $('#projSel').innerHTML = S.projects.map((p) => `<option value="${p.id}"${p.id === S.active ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#typePill').textContent = TYPE_LABEL[P().type];
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === S.tab));
  const sb = $('#setBtn'); if (sb) sb.setAttribute('aria-pressed', S.tab === 'settings');
  document.documentElement.dataset.theme = S.theme;
  $('#themeBtn').innerHTML = S.theme === 'dark' ? '<svg class="i"><use href="#i-sun"/></svg>' : '<svg class="i"><use href="#i-moon"/></svg>';
  $('#themeBtn').title = S.theme === 'dark' ? 'Light theme' : 'Dark theme';
  document.querySelectorAll('[data-units]').forEach((b) => b.setAttribute('aria-pressed', (S.units || 'metric') === b.dataset.units));
  tabBadges();
}
// live counts on the tab bar
function tabBadges() {
  const p = P();
  let crit = 0, warn = 0;
  try { const R = U.compute(p, S.lib, { lite: true }); crit = R.checks.filter((c) => c.level === 'crit').length; warn = R.checks.filter((c) => c.level === 'warn').length; } catch (e) { /* half-filled design */ }
  const set = (tab, html) => { const b = document.querySelector(`#tabs [data-tab="${tab}"]`); if (!b) return; let x = b.querySelector('.badge'); if (!html) { if (x) x.remove(); return; } if (!x) { x = document.createElement('span'); b.append(x); } x.outerHTML = html; };
  set('design', crit ? `<span class="badge crit" title="${crit} to fix">${crit}</span>` : warn ? `<span class="badge warn" title="${warn} to check">${warn}</span>` : '');
  set('mass', `<span class="badge" title="BOM rows">${p.bom.length}</span>`);
  set('logs', LOG && !LOG.sample ? '<span class="badge dot good" title="Log loaded"></span>' : '');
}

// typical drag areas (Cd × frontal area) for things hanging in the airflow
const DRAG_ADDONS = [['Gimbal camera (A8 mini size)', 40], ['Large gimbal / EO-IR ball', 120], ['Fixed landing gear (pair + wheel)', 35], ['Skids', 20], ['Exposed antenna', 5], ['GPS mast', 6], ['Pitot / airspeed probe', 3], ['Cooling scoop', 8], ['External payload pod', 60]];
