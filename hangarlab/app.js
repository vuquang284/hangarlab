// HangarLab UI. State lives in S; inputs bind with data-k (design path) or data-lib (library path).
(function () {
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
    vtol: [['hover', 30], ['climb', 100], ['cruise', 8, 'head'], ['loiter', 10], ['cruise', 8, 'tail'], ['descend', 100], ['hover', 30]],
  };
  function fixDesign(p) {
    if (!p.mission) p.mission = { wind: 0, reserve: 0, climb: 2, vMr: 0, segs: (MISSION_DEF[p.type] || MISSION_DEF.fixedwing).map(([type, v, dir]) => ({ type, v, dir: dir || 'none' })) };
    if (!p.cg) p.cg = { le: 0, mac: 0, pos: {} };
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
    s.settings = Object.assign({ calc: { cons: 1.2, defK: 1.25, learn: true }, logs: { speed: 10, view: '3d' }, backups: { on: true }, quickstart: true, currency: '$', adv: { on: false, conns: '', wire: '' }, newDesign: { usable: 80, alt: 0, temp: 15 } }, s.settings || {});
    s.projects.forEach(fixDesign);
    for (const r of (s.lib.parts || []).concat(...s.projects.map((p) => p.bom || []))) if (r.rf === 'gnss') r.rf = '';
    const ad = s.settings.adv = s.settings.adv || { on: false };
    if (!ad.conns) ad.conns = U.CONNECTORS.map((c) => c.join(', ')).join('\n');
    if (!ad.wire) ad.wire = U.WIRE.map((w) => w.join(', ')).join('\n');
    if (!s.lib.subs) {
      const used = (s.lib.parts || []).map((x) => x.sub).concat(...s.projects.map((p) => (p.bom || []).map((r) => r.sub))).filter(Boolean);
      s.lib.subs = [...new Set(SUBS.concat(used))].map((k) => ({ key: k, name: k, color: defaultSubColor(k) }));
    }
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
  const tip = (t) => `<span class="tip" title="${esc(t)}" aria-label="${esc(t)}">i</span>`;
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

  // ---------- DESIGN ----------
  function designInputs() {
    const p = P(), t = p.type;
    const bat = U.battery(p.batt);
    let h = '';
    h += group('Vehicle', `
      ${txt('name', 'Design name', { wide: true })}
      <div class="f wide"><span>Configuration</span><div class="seg" role="group">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button data-settype="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div></div>
      ${t === 'vtol' ? sel('vtol.kind', 'VTOL type', [['quadplane', 'Quadplane (separate lift + cruise)'], ['tiltrotor', 'Tilt-rotor (shared motors)'], ['tailsitter', 'Tailsitter (shared motors)']], { wide: true, rebuild: true }) : ''}`);
    h += group('Environment', `${num('env.alt', 'Field altitude', { unit: 'm' })}${num('env.temp', 'Air temperature', { unit: '°C' })}<p class="hint" id="rhoHint"></p>`);
    h += group('Battery', `
      ${sel('_batPreset', 'Load from library', [['', 'Choose a pack…']].concat(S.lib.batteries.map((b) => [b.id, b.name])), { wide: true })}
      ${p.batt.ref ? `<p class="hint wide"><span class="libpill" style="cursor:default">LIB</span> Linked to the library pack: edits here update it. <a href="#" data-act="bat-unlink">Unlink</a></p>` : ''}
      ${txt('batt.name', 'Pack label', { wide: true })}
      ${sel('batt.chem', 'Chemistry', Object.entries(U.CELL).map(([k, c]) => [k, `${c.label} (${c.nom} V nom, ${c.max} V full)`]), { wide: true })}
      ${num('batt.s', 'Cells in series', { unit: 'S', min: 1, step: 1 })}
      ${num('batt.p', 'Cells in parallel', { unit: 'P', min: 1, step: 1 })}
      ${num('batt.cellMah', 'Cell capacity', { unit: 'mAh', step: 100, min: 1 })}
      ${num('batt.g', 'Weight per pack', { unit: 'g', min: 1 })}
      ${num('batt.c', 'Continuous C', { unit: 'C' })}
      ${num('batt.cPeak', `Peak C ${tip('Burst rating from the datasheet (usually for ~10 s). Leave 0 if unknown: full throttle is then checked against the continuous rating.')}`, { unit: 'C', min: 0 })}
      ${num('batt.usable', 'Usable capacity', { unit: '%', min: 10, max: 100 })}
      ${num('batt.packs', 'Packs on board', { min: 1, step: 1 })}
      ${sel('batt.conn', 'Packs wired in', [['parallel', 'Parallel (more capacity)'], ['series', 'Series (more voltage)']])}
      <p class="hint" id="batHint"></p>`);
    h += group('Payload', `
      ${txt('payload.name', 'Payload', { wide: true })}
      ${num('payload.g', 'Payload mass', { unit: 'g', min: 0 })}
      <label class="f wide" style="margin-top:-6px"><input type="range" id="paySlide" data-k="payload.g" min="0" max="${Math.max(2000, Math.ceil(((+p.payload.g || 0) * 2) / 500) * 500)}" step="10" value="${+p.payload.g || 0}" aria-label="Payload mass (g)"></label>
      <p class="hint" id="payHint"></p>`);
    if (t === 'multirotor' || t === 'vtol') {
      h += group(t === 'vtol' ? 'Lift propulsion' : 'Propulsion', `
        ${sel('mr.layout', 'Frame layout', Object.entries(U.LAYOUTS).map(([k, l]) => [k, l.label]), { rebuild: true })}
        ${num('mr.n', 'Motors', { step: 1, min: 1 })}
        ${propPick('mr', bat.V)}
        ${num('mr.escA', 'ESC rating', { unit: 'A' })}
        ${num('mr.maxThr', `Payload limit ${tip('Extra payload is counted until hover throttle reaches this value.')}`, { unit: '% thr' })}
        ${t === 'multirotor' ? num('mr.cda', 'Frame drag area CdA', { unit: 'm²', step: 0.01 }) : ''}
`);
    }
    if (t === 'fixedwing' || t === 'vtol') {
      const shared = t === 'vtol' && p.vtol.kind !== 'quadplane';
      h += group('Wing & aero', `
        ${sel('_airframe', 'Load airframe', [['', 'Choose an airframe…']].concat(S.lib.airframes.map((a) => [a.id, a.name + (a.area ? '' : ' (no area)')])), { wide: true })}
        ${num('fw.span', 'Wingspan', { unit: 'm', imp: 'in', step: 0.01, min: 0.05 })}
        ${num('fw.area', 'Wing area', { unit: 'm²', step: 0.001, min: 0.005 })}
        ${sel('fw.drag.mode', 'Parasite drag', [['buildup', 'Build up from geometry'], ['cd0', 'Fixed CD0']], { wide: true, rebuild: true })}
        ${(p.fw.drag || {}).mode === 'buildup' ? `
          ${sel('fw.drag.finish', 'Construction / surface', Object.entries(U.FINISH).map(([k, v]) => [k, v.label]), { wide: true })}
          ${sel('fw.drag.mount', 'Cruise motor placement', [['auto', 'Auto (2+ motors on wing, 1 in nose)'], ['wing', 'Tractor on wing'], ['nose', 'Tractor in nose'], ['pusher', 'Pusher']], { wide: true })}
          ${sel('fw.drag.pods.mode', 'Motor pods', [['auto', 'Auto from motor size'], ['manual', 'Enter size'], ['none', 'None']], { rebuild: true })}
          ${((p.fw.drag.pods || {}).mode === 'manual') ? `${num('fw.drag.pods.n', 'Pods', { step: 1, min: 0 })}${num('fw.drag.pods.d', 'Pod diameter', { unit: 'm', imp: 'in', step: 0.001 })}${num('fw.drag.pods.L', 'Pod length', { unit: 'm', imp: 'in', step: 0.005 })}` : '<span></span>'}
          ${num('fw.drag.fusL', 'Fuselage length', { unit: 'm', imp: 'in', step: 0.01 })}${num('fw.drag.fusD', 'Fuselage width', { unit: 'm', imp: 'in', step: 0.005 })}
          ${num('fw.drag.tailPct', 'Tail area', { unit: '% wing' })}${num('fw.drag.tc', 'Airfoil thickness t/c', { step: 0.01 })}
          ${num('fw.drag.booms.n', 'Tail booms', { step: 1, min: 0 })}${num('fw.drag.booms.L', 'Boom length', { unit: 'm', imp: 'in', step: 0.01 })}
          ${num('fw.drag.booms.d', 'Boom diameter', { unit: 'm', imp: 'in', step: 0.001 })}${num('fw.drag.misc', 'Misc drag', { unit: '%' })}
          <div class="f wide"><span>Add-ons sticking into the airflow (drag area each, cm²)</span>
            ${(p.fw.drag.extras || []).map((x, j) => `<div class="in" style="margin-top:4px"><input type="text" data-k="fw.drag.extras.${j}.name" value="${esc(x.name)}"><input type="number" data-k="fw.drag.extras.${j}.qty" value="${x.qty || 1}" step="1" style="width:48px" aria-label="Count"><input type="number" data-k="fw.drag.extras.${j}.cda" value="${x.cda}" step="any" style="width:64px" aria-label="cm² each"><button class="btn ghost sm danger" data-act="drag-del" data-i="${j}" aria-label="Remove">×</button></div>`).join('')}
            <select id="dragAdd" style="margin-top:6px"><option value="">Add an add-on…</option>${DRAG_ADDONS.map(([n, c], j) => `<option value="${j}">${n} · ${c} cm²</option>`).join('')}</select></div>
          ${chk('fw.drag.eAuto', 'Estimate Oswald e from aspect ratio', { rebuild: true })}
          ${p.fw.drag.eAuto === false ? num('fw.e', 'Oswald efficiency e', { step: 0.01 }) : ''}
          <p class="hint" id="dragHint"></p>` : `${num('fw.cd0', 'Parasite drag CD0', { step: 0.001 })}${num('fw.e', 'Oswald efficiency e', { step: 0.01 })}`}
        ${num('fw.clmax', 'CL max', { step: 0.05 })}
        ${num('fw.vc', 'Cruise speed', { unit: 'm/s', min: 1 })}
        ${num('fw.etaP', 'Prop efficiency', { unit: '%' })}
        ${num('fw.etaD', 'Motor + ESC eff.', { unit: '%' })}
        ${t === 'fixedwing' ? num('fw.vsMax', 'Max stall speed', { unit: 'm/s' }) : ''}
        ${(p.fw.drag || {}).mode === 'buildup' ? '' : '<p class="hint">Typical CD0: glider 0.02, FPV wing 0.03, ISR plane 0.05–0.07.</p>'}`);
      if (!shared) h += group('Cruise propulsion', `${propPick('fw', bat.V)}${num('fw.n', 'Cruise motors', { step: 1, min: 1 })}${chk('fw.propOther', 'My actual prop differs from this data (−15 % prop efficiency)')}`);
      h += group('Calibrate from flight', `
        ${chk('fw.cal.on', 'Scale the drag model to a measured cruise point', { rebuild: true })}
        ${p.fw.cal.on ? `${chk('fw.cal.learn', 'Real measurement of this aircraft: use it to improve estimates for other designs')}${num('fw.cal.v', 'Measured airspeed', { unit: 'm/s' })}${num('fw.cal.a', 'Propulsion current', { unit: 'A' })}${num('fw.cal.g', 'Weight at test', { unit: 'g' })}<p class="hint" id="calHint"></p>` : '<p class="hint">Optional: anchor the model to a measured cruise point.</p>'}`, p.fw.cal.on);
    }
    if (t === 'vtol') {
      h += group('VTOL mission', `
        ${num('vtol.hoverS', 'Hover time per sortie', { unit: 's' })}
        ${num('vtol.reserve', `Extra reserve ${tip('On top of the battery usable capacity, which already keeps a landing reserve. Usually 0.')}`, { unit: '%', min: 0 })}
        ${p.vtol.kind === 'quadplane' ? num('vtol.dcd0', 'Stopped-rotor ΔCD0', { step: 0.001 }) : ''}
        <p class="hint">Hover time covers takeoff, transitions and landing.</p>`);
    }
    {
      const M = p.mission, mu = (u) => (u === 'm' ? 'm>ft' : u === 'km' ? 'km>mi' : '');
      const dirs = [['none', 'Still air'], ['head', 'Headwind'], ['tail', 'Tailwind'], ['cross', 'Crosswind']];
      h += group('Mission & wind', `
        ${num('mission.wind', 'Wind speed', { unit: 'm/s', min: 0 })}
        ${num('mission.reserve', `Extra reserve ${tip('On top of the battery usable capacity, which already keeps a landing reserve. Usually 0.')}`, { unit: '%', min: 0, max: 90 })}
        ${num('mission.climb', 'Climb rate', { unit: 'm/s', min: 0.1 })}
        ${t === 'multirotor' ? num('mission.vMr', `Cruise speed ${tip('0 = best-range speed from the forward-flight model')}`, { unit: 'm/s', min: 0 }) : '<span></span>'}
        <div class="f wide"><span>Segments, flown in order</span>
          ${M.segs.map((sg, j) => { const u = (U.SEG[sg.type] || ['', ''])[1], key = mu(u); return `<div class="in segrow" style="margin-top:4px">
            <select data-k="mission.segs.${j}.type" data-rebuild aria-label="Segment type">${Object.entries(U.SEG).map(([k2, [l]]) => `<option value="${k2}"${k2 === sg.type ? ' selected' : ''}>${l}</option>`).join('')}</select>
            <input type="number" data-k="mission.segs.${j}.v"${key ? ` data-u="${key}"` : ''} value="${key ? toDisp(sg.v, key) : sg.v}" step="any" min="0" style="width:64px" aria-label="Amount"><em>${key && imperial() ? uName(key) : u}</em>
            ${sg.type === 'cruise' ? `<select data-k="mission.segs.${j}.dir" aria-label="Wind direction">${dirs.map(([k2, l]) => `<option value="${k2}"${k2 === (sg.dir || 'none') ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}
            <button class="btn ghost sm" data-act="seg-up" data-i="${j}" aria-label="Move up"${j ? '' : ' disabled'}>↑</button><button class="btn ghost sm danger" data-act="seg-del" data-i="${j}" aria-label="Remove">×</button></div>`; }).join('')}
          <button class="btn sm" data-act="seg-add" style="margin-top:6px">+ Add segment</button></div>
        <p class="hint">Climb and descend are in metres of height. Energy available = battery usable capacity (its unused part is the landing reserve), minus any extra reserve.</p>`, false);
    }
    h += group('Electronics', `${num('becEff', 'BEC / regulator efficiency', { unit: '%' })}<p class="hint" id="avHint"></p>`, false);
    return h;
  }

  // full-throttle current: green under continuous, amber within the burst rating (or burst unknown), red over burst
  const ampState = (i, b) => (!fin(i) ? '' : i <= b.iMaxCont ? 'good' : b.peakSet && i <= b.iMaxPeak ? 'warn' : b.peakSet ? 'crit' : 'warn');
  function designReadouts(p, R) {
    const t = p.type;
    let h = '';
    h += ro('All-up weight', fmt(R.Wg / 1000, 2), 'kg', `${fmt(R.Wg, 0)} g`, '', true);
    if (t !== 'fixedwing' && R.h) {
      h += ro(t === 'vtol' ? 'Hover T/W' : 'Thrust / weight', fmt(R.h.tw, 2), '', `${fmt(R.h.tmaxTot / 1000, 1)} kg max thrust`, lvl(R.h.tw, t === 'vtol' ? 1.5 : 2, 1.4, true), true);
      h += ro('Hover throttle', fmt(R.h.thr, 0), '%', R.h.set.physics ? 'physics estimate' : R.h.c.hasThr ? 'from bench table' : 'estimated', lvl(R.h.thr, 65, 80));
      h += ro('Hover power', fmt(R.hoverP, 0), 'W', `${fmt(R.hoverI, 1)} A at ${fmt(R.bat.V, 1)} V`);
      h += ro(t === 'vtol' ? 'Hover-only time' : 'Hover time', fmt(R.hoverMin, 1), 'min', `${fmt(R.bat.usableWh, 0)} Wh usable`, t === 'multirotor' ? lvl(R.hoverMin, 10, 5, true) : '', t === 'multirotor');
    }
    if (t === 'multirotor') {
      if (R.bestRange) h += ro('Max range', fmt(R.bestRange.km, 1), 'km', `at ${fmt(R.bestRange.V, 1)} m/s, ${fmt(R.bestRange.minutes, 1)} min`, '', true);
      if (R.vmax != null) h += ro('Top speed (est.)', fmt(R.vmax, 1), 'm/s', `${fmt(R.vmax * 3.6, 0)} km/h, 85% thrust`);
      h += ro('Extra payload', fmt(R.payloadG, 0), 'g', `before ${p.mr.maxThr}% hover throttle`, lvl(R.payloadG, 500, 0, true));
      if (R.diskLoad) h += ro('Disk loading', fmt(R.diskLoad, 1), 'kg/m²', `${fmt(p.mr.n)}× ${R.h.set.diam}" props`);
      h += ro('Peak current', fmt(R.maxI, 0), 'A', `pack ${fmt(R.bat.iMaxCont, 0)} A cont.${R.bat.peakSet ? ` · ${fmt(R.bat.iMaxPeak, 0)} A peak` : ''}`, ampState(R.maxI, R.bat));
    }
    if (t === 'fixedwing' || t === 'vtol') {
      h += ro('Wing loading', fmt(R.wingLoad * 10, 1), 'g/dm²', `${fmt(R.wingLoad, 2)} kg/m² · AR ${fmt(R.AR, 1)}`);
      h += ro('Stall speed', fmt(R.vs, 1), 'm/s', `CLmax ${p.fw.clmax}`);
      if (t === 'fixedwing') h += ro('Static T/W', fmt(R.staticTW, 2), '', R.pitchSpeed ? `pitch speed ${fmt(R.pitchSpeed, 1)} m/s` : '', lvl(R.staticTW, 0.5, 0.3, true));
      h += ro('Cruise power', fmt(R.cruise.P, 0), 'W', `${fmt(R.cruise.I, 1)} A at ${p.fw.vc} m/s${fin(R.cruise.consP) ? ` · up to ${fmt(R.cruise.consP / R.bat.V, 1)} A` : ''}`);
      if (fin(R.cruise.etaP)) h += ro('Prop efficiency', fmt(R.cruise.etaP * 100, 0), '%', `${fmt(R.cruise.thr, 0)}% throttle · ${fmt(R.cruise.rpm, 0)} rpm`, lvl(R.cruise.etaP * 100, 55, 40, true));
      if (t === 'fixedwing') {
        h += ro('Endurance', fmt(R.cruise.minutes, 1), 'min', fin(R.cruise.consMinutes) ? `conservative ${fmt(R.cruise.consMinutes, 0)} min · at ${p.fw.vc} m/s` : `calibrated · at ${p.fw.vc} m/s`, '', true);
        h += ro('Range', fin(R.cruise.consKm) ? `${fmt(R.cruise.consKm, 0)}–${fmt(R.cruise.km, 0)}` : fmt(R.cruise.km, 1), 'km', fin(R.cruise.consKm) ? 'conservative – nominal, still air' : `calibrated · best ${fmt(R.bestRange.km, 1)} km at ${fmt(R.bestRange.V, 1)} m/s`, '', true);
        h += ro('Max endurance', fmt(R.bestEnd.minutes, 1), 'min', `at ${fmt(R.bestEnd.V, 1)} m/s`);
        if (R.vmaxLevel) h += ro('Top speed (est.)', fmt(R.vmaxLevel, 1), 'm/s', `${fmt(R.vmaxLevel * 3.6, 0)} km/h`);
        h += ro('Best climb', fmt(R.maxRoc, 1), 'm/s', 'full throttle');
        if (fin(R.payloadG)) h += ro('Payload margin', fmt(R.payloadG, 0), 'g', `before stall > ${p.fw.vsMax} m/s`, lvl(R.payloadG, 200, 0, true));
      }
    }
    if (t === 'vtol' && R.mission) {
      h += ro('Mission range', fin(R.mission.consKm) && !R.calK ? `${fmt(R.mission.consKm, 0)}–${fmt(R.mission.km, 0)}` : fmt(R.mission.km, 1), 'km', `${p.vtol.hoverS} s hover${+p.vtol.reserve ? `, +${p.vtol.reserve}% extra reserve` : ''}`, R.mission.km > 0 ? 'good' : 'crit', true);
      h += ro('Cruise time', fmt(R.mission.minutes, 1), 'min', `at ${p.fw.vc} m/s`, '', true);
      h += ro('Hover energy', fmt(R.mission.eHover, 0), 'Wh', `of ${fmt(R.mission.eAvail, 0)} Wh available`);
    }
    return h;
  }

  const SEG_HUE = { hover: 352, climb: 24, cruise: 212, loiter: 140, descend: 172 };
  // straight-line range and out-and-back radius in wind, from the endurance at the cruise speed
  function missionReadouts(p, R, mp) {
    let h = '';
    if (mp) {
      const st = misStatus(mp);
      h += ro('Mission energy', `${fmt(mp.total, 0)} / ${fmt(mp.avail, 0)}`, 'Wh', `${st.pill}: ${leftTxt(mp.avail - mp.total, mp.avail)} · ${fmt(mp.km, 1)} km, ${fmt(mp.minutes, 0)} min${mp.consK > 1 ? ` · conservative ${fmt(mp.totalCons, 0)} Wh` : ''}`, st.st, true);
    }
    const w = +p.mission.wind || 0;
    const base = p.type === 'multirotor' ? R.bestRange && { V: +p.mission.vMr > 0 ? +p.mission.vMr : R.bestRange.V, min: R.bestRange.minutes }
      : p.type === 'fixedwing' ? R.cruise && { V: p.fw.vc, min: fin(R.cruise.consMinutes) ? R.cruise.consMinutes : R.cruise.minutes }
      : R.mission && { V: p.fw.vc, min: fin(R.mission.consMinutes) && !R.calK ? R.mission.consMinutes : R.mission.minutes };
    if (w > 0 && base && fin(base.min)) {
      if (p.type === 'multirotor' && mp) { const r = mp.rows.find((x) => x.type === 'cruise' && x.P); if (r) base.min = (R.bat.usableWh / r.P) * 60; }
      const t = base.min * 60, V = base.V;
      const head = Math.max(0, (t * (V - w)) / 1000), radius = V > w ? (t * (V * V - w * w)) / (2 * V) / 1000 : 0;
      h += ro('Radius in wind', fmt(radius, 1), 'km', `out and back in ${fmt(w, 0)} m/s · ${fmt(head, 1)} km straight into it, ${fmt((t * (V + w)) / 1000, 1)} km downwind`, V > w * 1.5 ? '' : 'warn');
    }
    return h;
  }
  // energy left at landing, worded as "left" or "short" instead of a negative spare
  const leftTxt = (left, avail) => (left >= 0 ? `${fmt(left, 0)} Wh left (${fmt((left / (avail || 1)) * 100, 0)} %)` : `${fmt(-left, 0)} Wh short`);
  function misStatus(mp) {
    const cons = mp.consK > 1, lN = mp.avail - mp.total, lC = mp.avail - mp.totalCons, err = mp.rows.some((r) => r.err);
    if (err) return { st: 'crit', pill: 'Cannot fly', text: 'a segment is impossible (see the table)' };
    if (mp.ok) return { st: 'good', pill: 'Fits', text: `${leftTxt(cons ? lC : lN, mp.avail)} at landing${cons ? ', even with conservative power' : ''}` };
    if (mp.okNominal) return { st: 'warn', pill: 'Tight', text: `${leftTxt(lN, mp.avail)} at landing; ${fmt(-lC, 0)} Wh short if power is ${fmt((mp.consK - 1) * 100, 0)} % higher than modelled` };
    return { st: 'crit', pill: 'Does not fit', text: `${leftTxt(lN, mp.avail)}: shorten the mission, fly slower or add battery` };
  }
  function missionCard(p, mp) {
    const el = $('#mission'), note = $('#misNote');
    if (!el) return;
    if (!mp) { el.innerHTML = '<p class="faint">No segments. Add some under Mission &amp; wind.</p>'; return; }
    const cons = mp.consK > 1, scale = Math.max(mp.totalCons, mp.avail) || 1;
    const col = (t) => `hsl(${SEG_HUE[t] ?? 220} ${S.theme === 'dark' ? 62 : 55}% ${S.theme === 'dark' ? 58 : 45}%)`;
    const fmtT = (x) => (x >= 90 ? `${fmt(x / 60, 1)} min` : `${fmt(x, 0)} s`);
    const leftCell = (left) => `<td class="n${left < 0 ? ' bad' : ''}">${left >= 0 ? `${fmt(left, 0)} Wh · ${fmt((left / (mp.avail || 1)) * 100, 0)} %` : `short ${fmt(-left, 0)} Wh`}</td>`;
    const st = misStatus(mp);
    let cum = 0;
    el.innerHTML = `<div class="misbar">${mp.rows.map((r) => `<span title="${r.label}: ${fmt(r.E, 1)} Wh" style="width:${(r.E / scale) * 100}%;background:${col(r.type)}"></span>`).join('')}<i style="left:${(mp.avail / scale) * 100}%" title="Usable energy: ${fmt(mp.avail, 0)} Wh"></i></div>
      <p class="hint" style="margin:-4px 0 10px">Bar: energy per segment. White line: usable energy, ${fmt(mp.avail, 0)} Wh (battery usable capacity${+p.mission.reserve ? ` minus ${p.mission.reserve} % extra reserve` : ''}).</p>
      <div class="tbl-wrap"><table class="mis"><thead><tr><th>Segment</th><th class="n">Amount</th><th class="n">Ground speed</th><th class="n">Time</th><th class="n">Power</th><th class="n">Energy</th><th class="n">Usable energy left</th></tr></thead><tbody>
      ${mp.rows.map((r) => { cum += r.E; return `<tr><td><i class="dot" style="background:${col(r.type)}"></i>${r.label}${r.dir && r.dir !== 'none' ? ` <span class="faint">${r.dir}wind</span>` : ''}${r.err ? `<div class="hint" style="color:var(--crit)">${esc(r.err)}</div>` : ''}</td><td class="n">${fmt(r.v, r.unit === 'km' ? 1 : 0)} ${r.unit}</td><td class="n">${r.gs != null ? `${fmt(r.gs, 1)} m/s` : ''}</td><td class="n">${fmtT(r.t)}</td><td class="n">${fmt(r.P, 0)} W</td><td class="n">${fmt(r.E, 1)} Wh</td>${leftCell(mp.avail - cum)}</tr>`; }).join('')}
      <tr class="total"><td>Total</td><td class="n">${fmt(mp.km, 1)} km</td><td></td><td class="n">${fmtT(mp.minutes * 60)}</td><td></td><td class="n">${fmt(mp.total, 0)} Wh</td>${leftCell(mp.avail - mp.total)}</tr>
      ${cons ? `<tr class="total"><td colspan="5">Conservative (propulsion power +${fmt((mp.consK - 1) * 100, 0)} %)</td><td class="n">${fmt(mp.totalCons, 0)} Wh</td>${leftCell(mp.avail - mp.totalCons)}</tr>` : ''}</tbody></table></div>
      ${fin(p.mission.logWh) && p.mission.logWh > 0 ? `<p class="hint"><b>Logged flight</b> (${esc(p.mission.logName || 'log')}): the pack gave <b>${fmt(p.mission.logWh, 0)} Wh</b>; this plan predicts ${fmt(mp.total, 0)} Wh (${mp.total >= p.mission.logWh ? '+' : ''}${fmt((mp.total / p.mission.logWh - 1) * 100, 0)} %). Edit any segment to clear this comparison.</p>` : ''}
      <p class="hint">Power per segment comes from the same model as the readouts above; climb and descent are estimates within ~10 %. ${cons ? 'The conservative row covers the usual gap between a model and real flight until you calibrate from a flight log.' : ''}</p>`;
    if (note) note.innerHTML = `<span class="pill ${st.st}">${st.pill}</span> ${st.text}`;
  }
  function renderDesign(el) {
    el.innerHTML = `<div class="bench"><aside class="side">${sideTools}${designInputs()}</aside>
      <section class="stack">
        <div class="readouts" id="readouts"></div>
        <div class="card"><div class="card-h"><h2>Checks</h2><p id="chkCount">Updated as you type</p></div><div class="checks" id="checks"></div></div>
        <div class="card"><div class="card-h"><h2>Mission profile</h2><p id="misNote">Set segments under Mission &amp; wind</p></div><div id="mission"></div></div>
        <div class="charts">
          <div class="card"><div class="card-h"><h2 id="spTitle">Power vs airspeed</h2><p id="spNote"></p></div><div class="chart" id="chSpeed"></div></div>
          <div class="card"><div class="card-h"><h2>Payload trade</h2><p id="payNote"></p></div><div class="chart" id="chPay"></div></div>
          <div class="card"><div class="card-h"><h2>Battery size trade</h2><p>Pack weight scales with capacity</p></div><div class="chart" id="chBatt"></div></div>
          <div class="card"><div class="card-h"><h2>Motor bench curve</h2><p id="motNote"></p></div><div class="chart" id="chMotor"></div></div>
          <div class="card"><div class="card-h"><h2>Numbers</h2><p>For reports</p></div><dl class="kv" id="numbers"></dl></div>
        </div>
      </section></div>`;
    liveDesign();
  }

  function liveDesign() {
    const p = P(), R = U.compute(p, S.lib);
    const mp = U.missionPlan(p, S.lib, R);
    $('#readouts').innerHTML = designReadouts(p, R) + missionReadouts(p, R, mp);
    missionCard(p, mp);
    const nBad = R.checks.filter((c) => c.level === 'crit').length, nWarn = R.checks.filter((c) => c.level === 'warn').length;
    $('#chkCount').textContent = nBad || nWarn ? `${nBad} to fix · ${nWarn} to check` : 'All clear';
    $('#checks').innerHTML = R.checks.map((c) => `<div class="chk"><span class="pill ${c.level}">${{ good: 'OK', warn: 'Check', crit: 'Fix', info: 'Note' }[c.level]}</span><span>${esc(c.msg)}</span></div>`).join('');
    const rh = $('#rhoHint'); if (rh) rh.innerHTML = `Air density <b>${fmt(R.rho, 3)} kg/m³</b> (σ = ${fmt(R.sigma, 3)}).`;
    const bh = $('#batHint'); if (bh) bh.innerHTML = `Each pack ${p.batt.s}S${p.batt.p || 1}P, ${fmt(R.bat.packMah, 0)} mAh. On board: <b>${R.bat.S}S${R.bat.P}P · ${fmt(R.bat.mah, 0)} mAh · ${fmt(R.bat.V, 1)} V</b> (${fmt(R.bat.vMin, 1)}–${fmt(R.bat.vMax, 1)} V), <b>${fmt(R.bat.Wh, 0)} Wh</b>, ${fmt(R.bat.g, 0)} g, ${fmt(R.bat.iMaxCont, 0)} A continuous${R.bat.peakSet ? `, ${fmt(R.bat.iMaxPeak, 0)} A peak` : ''}. A ${R.bat.chem.label} pack this size typically weighs ~${fmt(R.bat.estG, 0)} g.`;
    const ah = $('#avHint'); if (ah) ah.innerHTML = `Electronics draw <b>${fmt(R.pAv, 1)} W</b> from the flight pack (from BOM rails).`;
    const ch = $('#calHint'); if (ch) ch.innerHTML = R.calK ? `Model scaled by <b>×${fmt(R.calK, 2)}</b> to match the measured point.` : 'Fill all three values.';
    const dh = $('#dragHint');
    const kTxt = R.kSource === 'calibrated' ? `Calibrated: drag ×${fmt(R.kUsed, 2)} vs the model.` : R.kSource === 'learned' ? `Drag ×${fmt(R.kUsed, 2)}, learned from ${(S.lib.fleetFrom || []).length} calibrated flight${(S.lib.fleetFrom || []).length > 1 ? 's' : ''} (${(S.lib.fleetFrom || []).map((x) => esc(x[0])).join(', ')}).` : `Drag ×${fmt(U.DEFAULT_K, 2)}: default theory-to-flight correction until you calibrate a real flight. Conservative numbers add 20 % power on top.`;
    if (dh && R.drag) dh.innerHTML = `<b>${kTxt}</b> Model before correction: CD0 <b>${fmt(R.cd0, 4)}</b> at ${p.fw.vc} m/s (drag area ${fmt(R.drag.f * 1e4, 0)} cm²) · e ${fmt(R.e, 2)} · mean chord ${fmt(R.chord * 1000, 0)} mm · cruise L/D <b>${fmt(R.LDcruise, 1)}</b>. Breakdown: ${R.drag.parts.map((x) => `${esc(x.name)} ${fmt((x.cda / R.drag.f) * 100, 0)}%`).join(', ')}.`;
    const ph = $('#payHint');
    if (ph) ph.innerHTML = `${fmt(((+p.payload.g || 0) / R.Wg) * 100, 0)} % of AUW.` + (fin(R.payloadG) ? ` Room for <b>${fmt(R.payloadG, 0)} g</b> more ${p.type === 'fixedwing' ? `before stall passes ${p.fw.vsMax} m/s` : `before hover throttle passes ${p.mr.maxThr}%`}.` : '');
    const kv = [];
    const add = (k, v) => kv.push(`<dt>${k}</dt><dd>${v}</dd>`);
    add('AUW', `${fmt(R.Wg, 0)} g`);
    add('Battery', `${R.bat.packs}× pack · ${R.bat.S}S${R.bat.P}P ${fmt(R.bat.mah, 0)} mAh · ${fmt(R.bat.Wh, 0)} Wh · ${fmt(R.bat.g, 0)} g`);
    add('Battery mass fraction', `${fmt((R.bat.g / R.Wg) * 100, 0)} %`);
    add('Payload fraction', `${fmt(((+p.payload.g || 0) / R.Wg) * 100, 0)} %`);
    add('Electronics power', `${fmt(R.pAv, 1)} W`);
    if (R.h) {
      add('Thrust per motor (hover)', `${fmt(R.h.tPer, 0)} g`);
      add('Hover current per motor', `${fmt(R.h.pMotors / p.mr.n / R.bat.V, 2)} A`);
      add('Full-throttle current / motor', `${fmt(R.h.iMaxMotor, 1)} A`);
      add('Hover efficiency', `${fmt(R.Wg / R.h.pMotors, 2)} g/W`);
    }
    if (R.cruise) {
      add('Cruise CL', fmt(R.cruise.CL, 3));
      add('Best endurance speed', `${fmt(R.bestEnd.V, 1)} m/s`);
      add('Best range speed', `${fmt(R.bestRange.V, 1)} m/s`);
      add('L/D at cruise', fmt(R.LDcruise, 1));
      add('Max L/D', fmt(R.LDmax, 1));
      add('CD0 at cruise', fmt(R.cd0, 4));
      add('Oswald e', fmt(R.e, 2));
      if (R.drag) for (const x of R.drag.parts) add(`Drag · ${esc(x.name)}`, `${fmt(x.cda * 1e4, 1)} cm²`);
    }
    $('#numbers').innerHTML = kv.join('');

    // speed / power
    const acc = cssv('--c1'), cy = cssv('--c2');
    if (p.type === 'multirotor' && R.ff && R.ff.length) {
      $('#spNote').textContent = 'Momentum theory + frame drag';
      chart('chSpeed', {
        xLabel: 'Airspeed (m/s)', u: ['m/s', null, 'km'], data: [R.ff.map((x) => x.V), R.ff.map((x) => x.P), R.ff.map((x) => x.km)],
        axes: [{ scale: 'y', label: 'Electrical power (W)' }, { scale: 'km', label: 'Range (km)' }],
        series: [{ label: 'Power W', color: acc, dec: 0 }, { label: 'Range km', color: cy, scale: 'km', dec: 2 }],
        points: [{ x: R.bestRange.V, y: R.bestRange.km, scale: 'km', color: cy, label: 'best range' }],
      });
    } else if (R.fwCurve) {
      $('#spNote').textContent = R.calK ? 'Calibrated drag polar' : 'Drag polar';
      chart('chSpeed', {
        xLabel: 'Airspeed (m/s)', u: ['m/s', null, 'km', 'm/s'], data: [R.fwCurve.map((x) => x.V), R.fwCurve.map((x) => x.P), R.fwCurve.map((x) => (p.type === 'vtol' ? null : x.km)), R.fwCurve.map((x) => x.roc)],
        axes: [{ scale: 'y', label: 'Electrical power (W)' }, { scale: 'km', label: imperial() ? 'Range (mi) · climb (mph)' : 'Range (km) · climb (m/s)' }],
        series: [{ label: 'Power W', color: acc, dec: 0 }, { label: 'Range km', color: cy, scale: 'km' }, { label: 'Climb m/s', color: cssv('--c3'), scale: 'km', dash: [5, 4], w: 1.5 }],
        marks: [{ x: R.vs, label: 'stall', color: cssv('--crit') }, { x: p.fw.vc, label: 'cruise', color: acc }],
        points: [{ x: R.bestEnd.V, y: R.bestEnd.P, color: acc, label: 'min power' }],
      });
    } else $('#chSpeed').innerHTML = '<p class="faint">Set a prop diameter to model forward flight.</p>';

    // battery sweep
    const sw = U.batterySweep(p, S.lib);
    chart('chBatt', {
      xLabel: 'Capacity (mAh)', xDec: 0, u: [null, null, 'kg'], data: [sw.map((x) => x.mah), sw.map((x) => x.minutes), sw.map((x) => x.auw / 1000)],
      axes: [{ scale: 'y', label: p.type === 'multirotor' ? 'Hover time (min)' : 'Cruise time (min)' }, { scale: 'kg', label: 'AUW (kg)' }],
      series: [{ label: 'Minutes', color: acc }, { label: 'AUW kg', color: cy, scale: 'kg', dash: [5, 4], dec: 2 }],
      marks: [{ x: R.bat.mah, label: 'current', color: cssv('--muted') }],
    });

    // payload trade
    const ps = U.payloadSweep(p, S.lib);
    const lift = p.type !== 'fixedwing';
    $('#payNote').textContent = lift ? 'Endurance and hover throttle vs payload' : 'Endurance and range vs payload';
    chart('chPay', {
      xLabel: 'Payload (g)', xDec: 0, u: ['g', null, lift ? null : 'km'], data: [ps.map((x) => x.g), ps.map((x) => x.minutes), ps.map((x) => (lift ? x.thr : x.km))],
      axes: [{ scale: 'y', label: p.type === 'multirotor' ? 'Hover time (min)' : 'Cruise time (min)' }, { scale: 'y2', label: lift ? 'Hover throttle (%)' : 'Range (km)' }],
      series: [{ label: 'Minutes', color: acc }, { label: lift ? 'Throttle %' : 'Range km', color: cy, scale: 'y2', dash: [5, 4], dec: lift ? 0 : 1 }],
      marks: [{ x: +p.payload.g || 0, label: 'current', color: cssv('--muted') }],
    });

    // motor curve
    const set = p.type === 'fixedwing' ? U.combo(S.lib, p.fw.motor, p.fw.prop, R.bat.V) : R.h && R.h.set;
    if (set && set.rows.length) {
      const c = U.curve(set, R.bat.V);
      const rows = c.rows.map((r) => ({ t: r.thr ?? c.throttleAt(r.g * (c.tmax / c.rows[c.rows.length - 1].g)), g: r.g * (c.tmax / c.rows[c.rows.length - 1].g), a: r.a * (c.imax / c.rows[c.rows.length - 1].a) })).sort((a, b) => a.t - b.t);
      $('#motNote').textContent = `${set.name} · ${set.physics ? 'physics estimate' : c.estimated ? 'estimated' : 'bench data'} · at ${fmt(R.bat.V, 1)} V`;
      const hp = R.h ? [{ x: R.h.thr, y: R.h.tPer / R.sigma, color: acc, label: 'hover' }] : [];
      chart('chMotor', {
        xLabel: 'Throttle (%)', xDec: 0, u: [null, 'g', null], data: [rows.map((r) => r.t), rows.map((r) => r.g), rows.map((r) => r.a)],
        axes: [{ scale: 'y', label: 'Thrust (g)' }, { scale: 'A', label: 'Current (A)' }],
        series: [{ label: 'Thrust g', color: acc, dec: 0, pts: true }, { label: 'Current A', color: cy, scale: 'A', pts: true }],
        points: p.type === 'fixedwing' ? [] : hp,
      });
    } else $('#chMotor').innerHTML = '<p class="faint">Pick a motor and prop with kV and prop size, or add bench data.</p>';
  }

  // ---------- library links: BOM rows and the flight pack mirror their library item ----------
  const LINKED = { parts: ['name', 'sub', 'g', 'rail', 'w', 'pw', 'rf', 'link', 'buy', 'cost'], printed: ['g', 'link', 'buy', 'cost'] };
  for (const k of ['airframes', 'motors', 'props', 'batteries']) LINKED[k] = ['name', 'g', 'link', 'buy', 'cost'];
  const BAT_LINKED = ['name', 'chem', 's', 'p', 'cellMah', 'g', 'c', 'cPeak', 'link', 'buy', 'cost'];
  const NUMF = new Set(['g', 'w', 'pw', 'cost', 's', 'p', 'cellMah', 'c', 'cPeak']);
  const printedName = (x) => `${x.name} (${(U.MATERIALS.find((m) => m.id === x.mat) || {}).name || x.mat})`;
  const splitRef = (ref) => { const i = String(ref || '').indexOf(':'); return i < 0 ? [] : [ref.slice(0, i), ref.slice(i + 1)]; };
  const refItem = (ref) => { const [k, id] = splitRef(ref); return k && LINKED[k] ? (S.lib[k] || []).find((x) => x.id === id) : null; };
  const empty = (v) => v == null || v === '' || v === 0;
  function syncLib() {
    const lc = (v) => String(v || '').toLowerCase().trim();
    for (const p of S.projects) {
      for (const r of p.bom || []) {
        if (!r.ref && !r.unlinked) { // rows added before linking existed: match by name, and fill library gaps from the row
          for (const k of Object.keys(LINKED)) {
            const x = (S.lib[k] || []).find((y) => lc(y.name) === lc(r.name) || (k === 'printed' && lc(printedName(y)) === lc(r.name)));
            if (!x) continue;
            r.ref = `${k}:${x.id}`;
            for (const f of LINKED[k]) if (empty(x[f]) && !empty(r[f]) && !(k === 'printed' && f === 'g')) x[f] = r[f];
            break;
          }
        }
        if (!r.ref) continue;
        const [k] = splitRef(r.ref), x = refItem(r.ref);
        if (!x) { delete r.ref; continue; }
        for (const f of LINKED[k]) r[f] = x[f] ?? (NUMF.has(f) ? 0 : '');
        if (k === 'printed') { r.name = printedName(x); r.sub = '3D printed'; }
      }
      const b = p.batt;
      if (!b.ref && !b.unlinked) { const x = S.lib.batteries.find((y) => lc(y.name) === lc(b.name)); if (x) { b.ref = x.id; for (const f of ['link', 'buy', 'cost']) if (empty(x[f]) && !empty(b[f])) x[f] = b[f]; } }
      if (b.ref) { const x = S.lib.batteries.find((y) => y.id === b.ref); if (!x) delete b.ref; else for (const f of BAT_LINKED) b[f] = x[f] ?? (f === 'p' ? 1 : NUMF.has(f) ? 0 : ''); }
    }
  }
  const money = (v, d = 2) => (fin(v) && v ? `${esc(S.settings.currency || '$')}${fmt(v, d)}` : '<span class="faint">—</span>');
  const libPill = (i) => `<button class="libpill" data-act="bom-unlink" data-i="${i}" title="Linked to the library: values come from the library item, and edits here update it (and every design that uses it). Click to unlink this row.">LIB</button>`;

  // ---------- MASS & BOM ----------
  const LIB_PICK = [['parts', 'Components'], ['printed', '3D printed parts'], ['airframes', 'Airframes'], ['motors', 'Motors'], ['props', 'Props'], ['batteries', 'Battery packs']];
  function libToBom(kind, x) {
    const base = { id: 'b' + uid(), ref: `${kind}:${x.id}`, name: x.name, sub: 'Other', qty: 1, g: +x.g || 0, rail: '', w: 0, pw: 0, rf: '', link: x.link || '', buy: x.buy || '', cost: +x.cost || 0 };
    if (kind === 'parts') return Object.assign(base, { sub: x.sub, rail: x.rail, w: x.w, pw: x.pw, rf: x.rf });
    if (kind === 'printed') return Object.assign(base, { name: printedName(x), sub: '3D printed' });
    return Object.assign(base, { sub: { airframes: 'Structures', motors: 'Propulsion', props: 'Propulsion', batteries: 'Power' }[kind] });
  }
  function renderMass(el) {
    const p = P();
    const view = S.massView;
    el.innerHTML = `<div class="stack">
      <div class="readouts" id="massRo"></div>
      <div class="card"><div class="card-h"><h2>Mass by subsystem</h2><p>Motors, props, pack and payload come from the Performance tab</p></div><div id="massBar"></div></div>
      <div class="card"><div class="card-h"><h2>Balance</h2><p>Fill the X column: distance aft of a datum (${p.type === 'multirotor' ? 'frame centre, forward is negative' : 'the nose'}), in ${imperial() ? 'inches' : 'mm'}</p></div>
        ${p.type === 'multirotor' ? '' : `<div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:8px">${num('cg.le', 'Wing leading edge (at root)', { unit: 'mm', imp: 'in' })}${num('cg.mac', `Mean chord ${tip('0 = wing area ÷ span. For a tapered or swept wing enter the MAC and the leading edge where the MAC sits.')}`, { unit: 'mm', imp: 'in', min: 0 })}</div>`}
        <div id="cgOut"></div></div>
      <div class="row"><div class="seg" role="group" aria-label="BOM view">
        <button data-massview="edit" aria-pressed="${view === 'edit'}">Edit BOM</button>
        <button data-massview="report" aria-pressed="${view === 'report'}">Full BOM report</button></div>
        <span class="note">${view === 'edit' ? 'Rails feed the Electrical tab; RF bands feed the Radio Link tab.' : 'Tick several designs for one combined purchase list.'}</span></div>
      <div id="bomArea"></div></div>`;
    if (view === 'edit') {
      $('#bomArea').innerHTML = `<div class="card">
        <div class="card-h"><h2>Bill of materials</h2>
          <div class="row">
            <select id="libPick" aria-label="Library component" style="width:auto;max-width:300px"><option value="">Add from library…</option>${LIB_PICK.map(([k, label]) => (S.lib[k] || []).length ? `<optgroup label="${label}">${S.lib[k].map((x) => `<option value="${k}:${x.id}">${esc(x.name)}${x.g ? ` · ${x.g} g` : ''}</option>`).join('')}</optgroup>` : '').join('')}</select>
            <button class="btn sm" data-act="bom-add">Add row</button>
            <button class="btn sm" data-act="bom-paste">Paste from spreadsheet</button>
            <button class="btn sm ghost" data-act="bom-sort">Sort by subsystem</button>
          </div>
        </div>
        <div class="tbl-wrap"><table class="bom">
          <thead><tr><th>Item</th><th>Subsystem</th><th class="n">Qty</th><th class="n">Unit g</th><th class="n">Total g</th><th>Rail</th><th class="n">Avg W</th><th class="n">Peak W</th><th>RF Freq</th><th class="n" title="Distance aft of the datum, for the balance (CG) calculation">X mm</th><th class="n">Unit cost</th><th>Link</th><th>Buy</th><th></th></tr></thead>
          <tbody id="bomBody">${bomRows(p)}</tbody>
        </table></div>
        
      </div>`;
    } else $('#bomArea').innerHTML = bomReport();
    liveMass();
  }
  function bomRows(p) {
    const xIn = (k, v) => `<input type="number" data-k="${k}" data-u="mm>in" value="${v === '' || v == null ? '' : toDisp(v, 'mm>in')}" step="any" placeholder="—" style="width:64px" aria-label="X position">`;
    const a = (u, label) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${label}</a>` : '');
    const auto = U.autoRows(p, S.lib).map((r) => `<tr class="auto" style="--sc:${subColor(r.sub)}"><td>${esc(r.name)}</td><td>${subTag(r.sub)}</td><td class="n">${r.qty}</td><td class="n">${fmt(toDisp(r.g, 'g>oz'), 1)}</td><td class="n">${fmt(toDisp(r.qty * r.g, 'g>oz'), 1)}</td><td colspan="4" class="faint">set on the Performance tab</td><td class="n">${xIn(`cg.pos.${r.key}`, (p.cg.pos || {})[r.key])}</td><td class="n">${r.auto === 'payload' ? '' : money(r.cost)}</td><td>${a(r.link, 'open')}</td><td>${a(r.buy, 'buy')}</td><td></td></tr>`).join('');
    const opt = (list, v) => list.map(([x, y]) => `<option value="${x}"${x === (v || '') ? ' selected' : ''}>${y}</option>`).join('');
    const rows = p.bom.map((r, i) => {
      const pr = splitRef(r.ref)[0] === 'printed', roA = pr ? ' readonly title="Set by the printed part in Parts Library"' : '';
      return `<tr style="--sc:${subColor(r.sub)}" id="br${i}">
      <td><div class="row" style="flex-wrap:nowrap;gap:6px">${r.ref ? libPill(i) : ''}<input type="text" data-k="bom.${i}.name" value="${esc(r.name)}" aria-label="Item" style="min-width:190px"${roA}></div></td>
      <td>${subTag(r.sub)}</td>
      <td class="n"><input type="number" data-k="bom.${i}.qty" value="${r.qty}" step="1" style="width:58px"></td>
      <td class="n"><input type="number" data-k="bom.${i}.g" data-u="g>oz" value="${toDisp(r.g, 'g>oz')}" step="any" style="width:78px"${roA}></td>
      <td class="n" id="bt${i}">${fmt(toDisp(r.qty * r.g, 'g>oz'), 1)}</td>
      <td><select data-k="bom.${i}.rail" aria-label="Rail">${opt(RAILS, r.rail)}</select></td>
      <td class="n"><input type="number" data-k="bom.${i}.w" value="${r.w || 0}" step="any" style="width:64px"></td>
      <td class="n"><input type="number" data-k="bom.${i}.pw" value="${r.pw || 0}" step="any" style="width:64px"></td>
      <td><select data-k="bom.${i}.rf" aria-label="RF band">${opt(RF_OPTS, r.rf)}</select></td>
      <td class="n">${xIn(`bom.${i}.x`, r.x)}</td>
      <td class="n"><input type="number" data-k="bom.${i}.cost" value="${r.cost || ''}" step="any" placeholder="0" style="width:72px" aria-label="Unit cost"></td>
      <td><input type="text" data-k="bom.${i}.link" value="${esc(r.link || '')}" placeholder="Datasheet URL" style="width:90px"></td>
      <td><input type="text" data-k="bom.${i}.buy" value="${esc(r.buy || '')}" placeholder="Shop URL" style="width:90px"></td>
      <td><button class="btn ghost sm danger" data-act="bom-del" data-i="${i}" aria-label="Delete row">×</button></td></tr>`;
    }).join('');
    return auto + rows + '<tr class="total"><td colspan="4">Total</td><td class="n" id="bomTotal"></td><td colspan="5"></td><td class="n" id="bomCost"></td><td colspan="3"></td></tr>';
  }

  // grouped report for one design, or a combined purchase list for several
  function bomSelection() {
    const ids = S.bomSel.filter((id) => S.projects.some((p) => p.id === id));
    return (ids.length ? ids : [S.active]).map((id) => S.projects.find((p) => p.id === id));
  }
  function bomReport() {
    const ps = bomSelection();
    const rows = U.consolidate(ps, S.lib);
    const subs = [...new Set(rows.map((r) => r.sub))].sort((a, b) => subOrder(a) - subOrder(b));
    const multi = ps.length > 1;
    const lnk = (u, t) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : '');
    const head = `<tr><th>Item</th>${multi ? ps.map((p) => `<th class="n">${esc(p.name)}</th>`).join('') + '<th class="n">Total qty</th>' : '<th class="n">Qty</th>'}<th class="n">Unit g</th><th class="n">Total g</th><th class="n">Avg W</th><th class="n">Unit cost</th><th class="n">Total cost</th><th>Link</th><th>Buy</th></tr>`;
    const cols = (multi ? ps.length + 1 : 1) + 8;
    let body = '', grand = 0;
    for (const s of subs) {
      const rs = rows.filter((r) => r.sub === s);
      const q = (r) => r.qty.reduce((x, y) => x + y, 0);
      const g = rs.reduce((a, r) => a + r.g * q(r), 0), c = rs.reduce((a, r) => a + r.cost * q(r), 0);
      grand += c;
      body += `<tr class="grp" style="--sc:${subColor(s)}"><td colspan="${cols}">${subTag(s)} <span class="faint num">${rs.length} item${rs.length > 1 ? 's' : ''} · ${fmt(g, 0)} g${c ? ` · ${money(c)}` : ''}</span></td></tr>`;
      body += rs.map((r) => `<tr style="--sc:${subColor(s)}"><td>${esc(r.name)}</td>${multi ? r.qty.map((x) => `<td class="n">${x || '<span class="faint">–</span>'}</td>`).join('') : ''}<td class="n">${q(r)}</td><td class="n">${fmt(toDisp(r.g, 'g>oz'), 1)}</td><td class="n">${fmt(toDisp(r.g * q(r), 'g>oz'), 1)}</td><td class="n">${r.w ? fmt(r.w * q(r), 1) : ''}</td><td class="n">${money(r.cost)}</td><td class="n">${money(r.cost * q(r))}</td><td>${lnk(r.link, 'open')}</td><td>${lnk(r.buy, 'buy')}</td></tr>`).join('');
    }
    const auw = ps.map((p) => U.massOf(p, S.lib).total);
    body += `<tr class="total"><td>All-up weight</td>${multi ? auw.map((g) => `<td class="n">${fmt(g, 0)} g</td>`).join('') + '<td></td>' : '<td></td>'}<td></td><td class="n">${multi ? '' : `${fmt(auw[0], 1)} g`}</td><td colspan="2"></td><td class="n">${money(grand)}</td><td colspan="2"></td></tr>`;
    const noBuy = rows.filter((r) => !r.buy && r.sub !== 'Payload').length;
    return `<div class="card">
      <div class="card-h"><h2>Full BOM report</h2><div class="row">
        ${S.projects.map((p) => `<label class="f check" style="grid-column:auto"><input type="checkbox" data-bomsel="${p.id}"${ps.includes(p) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}
        <button class="btn sm" data-act="bom-copy">Copy for Excel</button><button class="btn sm" data-act="bom-csv">Download CSV</button></div></div>
      <div class="tbl-wrap"><table class="bom"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      ${noBuy ? `<p class="hint" style="margin-top:8px">${noBuy} item${noBuy > 1 ? 's have' : ' has'} no purchase link. Add them in Parts Library (Buy link column) or in the BOM.</p>` : ''}</div>`;
  }
  function bomTableRows() {
    const ps = bomSelection(), rows = U.consolidate(ps, S.lib);
    const out = [['Subsystem', 'Item'].concat(ps.length > 1 ? ps.map((p) => p.name) : [], ['Total qty', 'Unit g', 'Total g', 'Avg W', 'Unit cost', 'Total cost', 'Link', 'Buy link'])];
    rows.sort((a, b) => subOrder(a.sub) - subOrder(b.sub));
    for (const r of rows) { const q = r.qty.reduce((x, y) => x + y, 0); out.push([subName(r.sub), r.name].concat(ps.length > 1 ? r.qty : [], [q, r.g, +(r.g * q).toFixed(2), +(r.w * q).toFixed(2), r.cost || '', r.cost ? +(r.cost * q).toFixed(2) : '', r.link, r.buy || ''])); }
    return out;
  }

  function liveMass() {
    const p = P(), R = U.compute(p, S.lib, { lite: true }), m = R.mass;
    p.bom.forEach((r, i) => {
      const c = $('#bt' + i); if (c) c.textContent = fmt(toDisp(r.qty * r.g, 'g>oz'), 1);
      const tr = $('#br' + i); if (tr) tr.style.setProperty('--sc', subColor(r.sub));
    });
    const tot = $('#bomTotal'); if (tot) tot.textContent = `${fmt(m.total, 1)} g`;
    const cost = U.costOf(p, S.lib), bc = $('#bomCost'); if (bc) bc.innerHTML = money(cost);
    const cg = U.cgOf(p, S.lib), fwCg = p.type !== 'multirotor';
    const cgState = cg.x == null ? '' : fwCg ? (cg.pct >= 25 && cg.pct <= 33 ? 'good' : cg.pct >= 18 && cg.pct <= 38 ? 'warn' : 'crit') : Math.abs(cg.x) <= 10 ? 'good' : Math.abs(cg.x) <= 25 ? 'warn' : 'crit';
    const co = $('#cgOut');
    if (co) co.innerHTML = cg.x == null ? '<p class="faint">No positions yet. Enter X for the heavy items first: battery, motors, payload, airframe.</p>'
      : `<div class="cgbar${fwCg ? '' : ' mr'}">${fwCg ? `<i class="win" style="left:${(25 / 60) * 100}%;width:${(8 / 60) * 100}%"></i><b style="left:${Math.min(100, Math.max(0, ((cg.pct + 10) / 60) * 100))}%"></b>` : `<i class="win" style="left:${50 - 10}%;width:20%"></i><b style="left:${Math.min(100, Math.max(0, 50 + cg.x))}%"></b>`}</div>
        <p class="hint">${fwCg ? `CG <b>${fmt(cg.pct, 1)} % MAC</b> (${fmt(cg.x - (+p.cg.le || 0), 0)} mm behind the leading edge, MAC ${fmt(cg.mac, 0)} mm). Most planes fly well at 25–33 %; start near 25 % for the first flight.` : `CG <b>${fmt(cg.x, 0)} mm</b> ${cg.x > 0 ? 'aft of' : cg.x < 0 ? 'ahead of' : 'at'} the frame centre. Keep it within ~10 mm so no motor works much harder than the others.`}
        ${cg.missing ? ` <b>${cg.missing} item${cg.missing > 1 ? 's' : ''} without X</b> (${fmt((1 - cg.g / m.total) * 100, 0)} % of the weight) not counted.` : ''}</p>`;
    const payload = m.bySub.Payload || 0;
    const subs = Object.entries(m.bySub).sort((a, b) => b[1] - a[1]);
    $('#massRo').innerHTML = ro('All-up weight', fmt(m.total / 1000, 3), 'kg', imperial() ? `${fmt(m.total, 0)} g` : `${fmt(m.total, 0)} g · ${fmt(m.total / 453.592, 2)} lb`, '', true)
      + ro('Payload', fmt(payload, 0), 'g', `${fmt((payload / m.total) * 100, 0)} % of AUW`)
      + ro('Battery fraction', fmt((R.bat.g / m.total) * 100, 0), '%', 'multirotors 25–40 %, planes 30–45 %')
      + ro('Empty weight', fmt((m.total - payload - R.bat.g) / 1000, 2), 'kg', 'no payload, no pack')
      + ro('Parts cost', cost ? `${esc(S.settings.currency || '$')}${fmt(cost, 0)}` : '—', '', cost ? `${U.fullBom(p, S.lib).filter((r) => !r.cost && r.auto !== 'payload').length} items without a price` : 'add costs in Parts Library or the BOM')
      + ro('Balance', cg.x == null ? '—' : fwCg ? fmt(cg.pct, 0) : fmt(cg.x, 0), cg.x == null ? '' : fwCg ? '% MAC' : 'mm', cg.x == null ? 'enter X positions' : fwCg ? 'aim 25–33 %' : 'from frame centre', cgState)
      + ro('Items', String(p.bom.length + m.auto.length), '', `${subs.length} subsystems`);
    $('#massBar').innerHTML = `<div class="massbar">${subs.map(([s, g]) => `<span title="${esc(subName(s))}: ${fmt(g, 0)} g" style="width:${(g / m.total) * 100}%;background:${subColor(s)}"></span>`).join('')}</div>
      <div class="legend">${subs.map(([s, g]) => `<span><i style="background:${subColor(s)}"></i>${esc(subName(s))} <span class="faint num">${fmt(g, 0)} g · ${fmt((g / m.total) * 100, 1)}%</span></span>`).join('')}</div>`;
  }

  function pasteDialog() {
    openDlg('Paste rows from a spreadsheet', `
      <p class="note">Copy rows from Excel or Google Sheets and paste. Columns in your "Weight Breakdown" order are recognised: <b>Component, Unit g, Qty, Total, Link, Subsystem</b>. Shorter rows work too: <b>Component, Unit g, Qty, Subsystem</b>. Header rows are skipped. Starting from scratch? <a href="#" data-act="tpl-download">Download the component template</a>.</p>
      <textarea id="pasteBox" rows="10" placeholder="Cube Orange+ Mini\t53\t1\t53\thttps://…\tAvionics"></textarea>`,
      `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="paste-go">Add rows</button>`);
  }
  function parsePaste(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const c = line.split(line.includes('\t') ? '\t' : ',').map((s) => s.trim());
      const g = parseFloat(c[1]);
      if (!c[0] || !isFinite(g)) continue;
      const qty = parseFloat(c[2]) || 1;
      const six = c.length >= 6;
      out.push({ id: 'b' + uid(), name: c[0].replace(/^\*/, ''), g, qty, sub: subKeyOf(six ? c[5] : c[3]), link: six && /^https?:/.test(c[4]) ? c[4] : '', rail: '', w: 0, pw: 0, rf: '' });
    }
    return out;
  }

  // ---------- POWER ----------
  function renderPower(el) {
    const p = P(), R = U.compute(p, S.lib), pl = U.powerPlan(p, S.lib, R), b = R.bat;
    const railTag = (r) => (r.rail === 'VBAT' ? 'VBAT' : r.rail === 'Separate' ? 'Own' : r.rail);
    const tree = `<div class="tree">
      <div class="node batt"><b>${b.packs > 1 ? `${b.packs}× ` : ''}${esc(p.batt.name || 'Flight pack')}</b><small>${b.S}S${b.P}P ${b.chem.label} · ${fmt(b.vMin, 1)}–${fmt(b.vMax, 1)} V · ${fmt(b.iMaxCont, 0)} A cont.${b.peakSet ? ` / ${fmt(b.iMaxPeak, 0)} A peak` : ''}</small></div>
      <div class="vline"></div>
      <div class="node"><b>PDB / main bus</b><small>${pl.mainConn[0]} · ${pl.mainWire[0]} AWG · peak ${fmt(pl.totalPk, 0)} A</small></div>
      <div class="branches">
        ${pl.motorSets.map((m) => `<div class="branch"><div class="node"><b>${m.label} ×${m.n}</b><small>${fmt(m.iMax, 1)} A max · ${fmt(m.iHover, 1)} A ${m.label.startsWith('Lift') ? 'hover' : 'cruise'}</small></div><ul><li>${U.pickWire(m.iMax)[0]} AWG leads</li></ul></div>`).join('')}
        ${pl.rails.filter((r) => r.rail !== 'Separate').map((r) => `<div class="branch"><div class="node"><b>${railTag(r)} · ${r.kind}</b><small>${r.rail === 'VBAT' ? 'direct' : `${r.rec} A rated`} · ${fmt(r.avgW, 1)} W avg</small></div><ul>${r.items.map((i) => `<li>${esc(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ''}</li>`).join('')}</ul></div>`).join('')}
      </div></div>`;
    const railCards = pl.rails.map((r) => `<div class="card">
      <div class="card-h"><div><div class="rail-v">${r.rail === 'VBAT' ? `${fmt(b.V, 1)} V` : r.rail === 'Separate' ? 'Own' : r.rail.replace('V', ' V')}</div><span class="muted">${r.rail === 'VBAT' ? 'Battery bus' : r.kind}</span></div>
        ${r.rail === 'VBAT' || r.rail === 'Separate' ? '' : `<span class="pill ${r.kind.startsWith('Buck-boost') ? 'warn' : 'good'}">${r.rec} A regulator</span>`}</div>
      <dl class="kv">
        <dt>Average load</dt><dd>${fmt(r.avgW, 1)} W · ${fmt(r.iAvg, 2)} A</dd>
        <dt>Peak load</dt><dd>${fmt(r.peakW, 1)} W · ${fmt(r.iPk, 2)} A</dd>
        ${r.lossW ? `<dt>Regulator heat</dt><dd>${fmt(r.lossW, 1)} W</dd>` : ''}
      </dl>
      <ul class="note" style="padding-left:18px;margin:10px 0 0">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="chips">${r.items.map((i) => `<span class="chip">${esc(i.name)} · ${fmt(i.qty * i.w, 1)} W</span>`).join('')}</div></div>`).join('');
    el.innerHTML = `<div class="stack">
      <div class="readouts">
        ${ro('Pack voltage', fmt(b.V, 1), 'V', `${fmt(b.vMin, 1)} empty · ${fmt(b.vMax, 1)} full`, '', true)}
        ${ro('Peak bus current', fmt(pl.totalPk, 0), 'A', `motors ${fmt(pl.motorsI, 0)} A + electronics ${fmt(pl.railsI, 1)} A · pack ${fmt(b.iMaxCont, 0)} A cont.${b.peakSet ? ` / ${fmt(b.iMaxPeak, 0)} A peak` : ''}`, ampState(pl.totalPk, b), true)}
        ${ro('PDB rating', fmt(pl.pdbRating, 0), 'A', 'peak + 20 %')}
        ${ro('Main connector', pl.mainConn[0], '', `${pl.mainConn[1]} A continuous${pl.connAuto ? '' : ' · your pick'}`, pl.mainConn[1] < pl.totalPk ? 'crit' : '')}
        ${ro('Main leads', pl.mainWire[0], 'AWG', `${pl.mainWire[1]} A silicone, short run${pl.wireAuto ? '' : ' · your pick'}`, pl.mainWire[1] < pl.totalPk ? 'crit' : '')}
        ${ro('Electronics', fmt(R.pAv, 1), 'W', `${fmt(R.pAv / b.V, 2)} A from the pack`)}
      </div>
      ${S.lib.pwr ? `<div class="card"><div class="card-h"><h2>Advanced: main connector &amp; leads</h2><p>Auto picks the smallest rated for ${fmt(pl.totalPk, 0)} A peak</p></div><div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
        ${sel('power.conn', 'Main connector', [['', 'Auto']].concat(pl.conns.map((c) => [c[0], `${c[0]} · ${c[1]} A`])), { rebuild: true })}
        ${sel('power.awg', 'Main leads', [['', 'Auto']].concat(pl.wires.map((w) => [String(w[0]), `${w[0]} AWG · ${w[1]} A`])), { rebuild: true })}</div></div>` : ''}
      <div class="card"><div class="card-h"><h2>Power tree</h2><p>Set each item's rail on the Parts &amp; Weight tab</p></div>${tree}</div>
      <div><h3 style="margin:0 0 10px">Rails &amp; regulators</h3><div class="rails">${railCards || '<p class="faint">No powered items yet. Assign rails on the Parts &amp; Weight tab.</p>'}</div></div>
      <p class="note">Regulators: peak load × 1.25, next stock size. Wire and connectors assume short silicone runs with airflow.</p>
    </div>`;
  }

  // ---------- RF ----------
  function rfLinks(p) {
    p.rf.links = p.rf.links || {};
    p.rf.manual = p.rf.manual || [];
    const list = [];
    for (const r of p.bom) {
      if (!r.rf || r.rf === 'gnss') continue;
      const b = U.BANDS[r.rf];
      const l = p.rf.links[r.id] || (p.rf.links[r.id] = { mhz: b.mhz, tx: b.tx, txG: 2, rxG: 2, loss: 1, sens: b.sens, pol: 'same' });
      list.push({ key: `rf.links.${r.id}`, name: r.name, band: r.rf, l });
    }
    p.rf.manual.forEach((l, i) => list.push({ key: `rf.manual.${i}`, name: l.name, band: l.band, l, manual: i }));
    return list;
  }
  function renderRF(el) {
    const p = P(), links = rfLinks(p);
    const linkCard = (x) => {
      const k = x.key;
      return `<div class="card" data-link="${k}">
        <div class="card-h"><div class="row">${x.manual != null ? `<input type="text" data-k="${k}.name" value="${esc(x.name)}" style="width:200px">` : `<h2>${esc(x.name)}</h2>`}<span class="pill mute">${esc((U.BANDS[x.band] || {}).label || 'custom')}</span></div>
          <span class="pill" id="${k}-pill"></span></div>
        <div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));padding:0">
          ${num(`${k}.mhz`, 'Frequency', { unit: 'MHz' })}${num(`${k}.tx`, 'TX power', { unit: 'dBm' })}
          ${num(`${k}.txG`, 'TX antenna', { unit: 'dBi' })}${num(`${k}.rxG`, 'RX antenna', { unit: 'dBi' })}
          ${num(`${k}.loss`, 'Cable + connector', { unit: 'dB' })}${num(`${k}.sens`, 'RX sensitivity', { unit: 'dBm' })}
          ${sel(`${k}.pol`, 'Polarization', Object.entries(U.POL).map(([a, b]) => [a, b.label]))}
        </div>
        <dl class="kv" style="margin-top:12px" id="${k}-out"></dl>
        <p class="note" id="${k}-ant" style="margin:10px 0 0"></p>
        ${x.manual != null ? `<button class="btn ghost sm danger" data-act="rf-del" data-i="${x.manual}" style="margin-top:8px">Remove link</button>` : ''}
      </div>`;
    };
    const conf = U.rfConflicts(p.bom.filter((r) => r.rf).map((r) => r.rf).concat(p.bom.some((r) => /gps|gnss|here\s?\d|rtk/i.test(r.name)) ? ['gnss'] : []));
    el.innerHTML = `<div class="bench"><aside class="side">${sideTools}
        ${group('Mission geometry', `${num('rf.dist', 'Ground distance', { unit: 'km' })}${num('rf.alt', 'Drone altitude AGL', { unit: 'm' })}${num('rf.gndH', 'Ground antenna height', { unit: 'm' })}${num('rf.fade', 'Required fade margin', { unit: 'dB' })}<p class="hint" id="rfGeo"></p>`)}
        <div class="card"><h3>Sensitivity cheat sheet</h3><dl class="kv" style="margin-top:8px;font-size:12px">
          <dt>ELRS 2.4 500 Hz / 150 Hz / 50 Hz</dt><dd>−105 / −112 / −115</dd><dt>ELRS 900 200 Hz / 50 Hz</dt><dd>−112 / −123</dd>
          <dt>RFD900x 64 kbps</dt><dd>−121</dd><dt>TBS Crossfire 150 Hz</dt><dd>−117</dd><dt>Analog 5.8 GHz video</dt><dd>≈ −90</dd><dt>Wi-Fi bridge (MCS0)</dt><dd>≈ −94</dd></dl>
          <p class="hint" style="margin-top:8px">Use datasheet values for your radio and air rate.</p></div>
        <button class="btn" data-act="rf-add">Add a link manually</button>
      </aside>
      <section class="stack">
        <div class="card"><div class="card-h"><h2>Link margin vs distance</h2><p>Dashed line is your required fade margin</p></div><div class="chart" id="chRF"></div></div>
        ${conf.length ? `<div class="card"><h2 style="margin-bottom:8px">Interference checks</h2><div class="checks">${conf.map((c) => `<div class="chk"><span class="pill warn">Check</span><span>${esc(c)}</span></div>`).join('')}</div></div>` : ''}
        ${links.length ? links.map(linkCard).join('') : '<div class="card empty">No radios yet. Set an RF band on BOM items (Parts &amp; Weight tab) or add a link manually.</div>'}
      </section></div>`;
    liveRF();
  }
  function liveRF() {
    const p = P(), links = rfLinks(p), d = p.rf;
    const hor = U.radioHorizonKm(d.alt, d.gndH);
    $('#rfGeo').innerHTML = `Slant range <b>${fmt(Math.hypot(d.dist, (d.alt - d.gndH) / 1000), 2)} km</b>. Radio horizon <b>${fmt(hor, 1)} km</b>${d.dist > hor ? ' — <b>beyond it, no line of sight</b>' : ''}.`;
    const xs = [];
    for (let k = 0; k <= 60; k++) xs.push(0.05 * Math.pow(10, k / 20)); // 50 m .. 50 km
    const ser = [], data = [xs];
    links.forEach((x, i) => {
      const r = U.link(x.l, d);
      const state = r.margin >= d.fade ? 'good' : r.margin >= 0 ? 'warn' : 'crit';
      const pill = document.getElementById(`${x.key}-pill`);
      if (pill) { pill.className = `pill ${state}`; pill.textContent = `${fmt(r.margin, 1)} dB margin`; }
      const out = document.getElementById(`${x.key}-out`);
      if (out) out.innerHTML = `<dt>Free-space path loss</dt><dd>${fmt(r.loss, 1)} dB</dd><dt>Received level</dt><dd>${fmt(r.eirp + x.l.rxG - r.polDb - r.loss, 1)} dBm</dd>
        <dt>Max range at ${d.fade} dB margin</dt><dd>${fmt(r.maxKm, r.maxKm < 10 ? 2 : 1)} km</dd><dt>60 % Fresnel radius (midpoint)</dt><dd>${fmt(r.fres60, 1)} m</dd>
        <dt>λ/4 monopole · λ/2 dipole</dt><dd>${fmt(r.quarterMm, 1)} · ${fmt(r.halfMm, 1)} mm</dd>`;
      const ant = document.getElementById(`${x.key}-ant`);
      if (ant) ant.innerHTML = `<b>Antenna:</b> ${esc(r.ant)}${r.fres60 > d.gndH ? ` Fresnel zone (${fmt(r.fres60, 1)} m) is larger than the ground antenna height; raise it or expect ground losses.` : ''}`;
      data.push(xs.map((km) => U.link(x.l, { dist: km, alt: d.alt, gndH: d.gndH, fade: d.fade }).margin));
      ser.push({ label: x.name, color: cssv(`--c${(i % 8) + 1}`) });
    });
    if (!links.length) { $('#chRF').innerHTML = '<p class="faint">No links to plot.</p>'; return; }
    data.push(xs.map(() => d.fade));
    ser.push({ label: 'Required', color: cssv('--faint'), dash: [5, 5], w: 1 });
    chart('chRF', { xLabel: 'Distance (km)', u: ['km'], xLog: true, xDec: 2, data, yLabel: 'Link margin (dB)', series: ser, marks: [{ x: d.dist, label: 'mission', color: cssv('--accent') }], h: 280 });
  }

  // ---------- MATERIALS ----------
  function renderMaterials(el) {
    el.innerHTML = `<div class="bench"><aside class="side">${sideTools}
      ${group('Where the part lives', `
        ${num('mat.amb', 'Max ambient', { unit: '°C' })}
        ${sel('mat.printer', 'Your printer', [['open', 'Open frame'], ['enclosed', 'Enclosed'], ['hightemp', 'High-temp (PEI/PEEK)']])}
        ${chk('mat.sun', 'Sits in direct sun (+20 °C)')}${chk('mat.heat', 'Near motor, ESC or battery (+25 °C)')}
        ${chk('mat.uv', 'Long outdoor UV exposure')}${chk('mat.wet', 'Rain, humidity or water landings')}
        ${chk('mat.crash', 'Takes impacts or hard landings')}${chk('mat.fuel', 'Fuel, oil or solvents nearby')}
        ${chk('mat.flex', 'Part must flex (bumpers, mounts, pads)')}`)}
      ${group('Priorities', `
        <label class="f wide"><span>Stiffness</span><input type="range" min="0" max="10" data-k="mat.stiff" value="${P().mat.stiff}"></label>
        <label class="f wide"><span>Low weight</span><input type="range" min="0" max="10" data-k="mat.light" value="${P().mat.light}"></label>
        <label class="f wide"><span>Cost sensitivity</span><input type="range" min="0" max="10" data-k="mat.budget" value="${P().mat.budget}"></label>`)}
      ${group('Part mass estimate', `
        <div class="f wide"><div class="row"><label class="btn sm primary">Load STL<input type="file" id="stl-mat" accept=".stl,.STL" hidden></label>
          <select id="stl-unit" aria-label="STL units" style="width:auto">${['mm', 'cm', 'in'].map((u) => `<option${(P().mat.stlUnit || 'mm') === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
          <span class="hint" style="margin:0">${P().mat.stlName ? `${esc(P().mat.stlName)}` : 'Fills volume and areas from the mesh'}</span></div></div>
        ${stlMesh ? `<div class="stl3d">
          <div class="row stl-tools">
            <div class="seg">${[['iso', 'Iso'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side']].map(([v, l]) => `<button data-stlview="${v}">${l}</button>`).join('')}</div>
            <button class="btn sm" data-stlrot="x" title="Rotate 90° about X">⟳ X</button><button class="btn sm" data-stlrot="y" title="Rotate 90° about Y">⟳ Y</button>
            <label class="f check" style="grid-column:auto;font-size:12px"><input type="checkbox" data-s="settings.overhang" data-rebuild${S.settings.overhang !== false ? ' checked' : ''}> Overhangs</label>
          </div>
          <div id="stlView" class="stl-host"></div>
          <div class="row" style="justify-content:space-between;margin-top:6px"><span class="hint" id="stlInfo" style="margin:0"></span>
            <select data-s="settings.plate" data-rebuild aria-label="Build plate" style="width:auto;font-size:12px">${Object.entries(PLATES).map(([k, v]) => `<option value="${k}"${(S.settings.plate || 'bambu') === k ? ' selected' : ''}>${v[2]}</option>`).join('')}</select></div>
          <p class="hint" style="margin-top:4px">Drag to orbit · right-drag or Shift-drag to pan · scroll to zoom</p>
        </div>` : ''}
        ${num('mat.vol', 'Part volume', { unit: 'cm³' })}${num('mat.area', 'Surface area', { unit: 'cm²' })}
        ${num('mat.walls', 'Walls (perimeters)', { step: 1, min: 0 })}${num('mat.tb', 'Top + bottom layers', { step: 1, min: 0 })}
        ${num('mat.infill', 'Infill', { unit: '%' })}
        ${num('printer.lineW', 'Line width', { unit: 'mm', lib: true, step: 0.01 })}${num('printer.layerH', 'Layer height', { unit: 'mm', lib: true, step: 0.01 })}
        <label class="f"><span>Part name</span><input type="text" id="partName" data-k="mat.partName" value="${esc(P().mat.partName || 'Printed part')}"></label>
        <p class="hint" id="partOut"></p>
        <div class="row" style="grid-column:1/-1"><button class="btn sm" data-act="part-add">Add to BOM</button><button class="btn sm" data-act="part-lib">Save to library</button></div>
        <p class="hint">Walls and skins print solid, the rest at infill. Area 0 = estimate ${tip('Shell = side area × walls × line width + top/bottom area × layers × layer height. Load an STL for measured areas. Line width and layer height apply to every printed part.')}</p>`)}
      </aside>
      <section class="stack"><div class="card"><div class="card-h"><h2>Ranked materials</h2><p id="matTemp"></p></div><div id="matList"></div></div></section></div>`;
    liveMaterials();
  }
  function liveMaterials() {
    const p = P(), rk = U.rankMaterials(p.mat);
    const top = rk.filter((x) => x.ok);
    const best = top[0] && top[0].score;
    $('#matTemp').textContent = `Part temperature ${rk[0].tEff} °C`;
    $('#matList').innerHTML = rk.map((x, i) => `<div class="mat${x.ok ? '' : ' out'}">
      <div><div class="name">${esc(x.m.name)}${x.ok && i === 0 ? ' <span class="pill good">Pick</span>' : ''}</div><div class="props">${x.m.rho} g/cm³ · ${x.m.ts} MPa · ${x.m.E} GPa · HDT ${x.m.hdt} °C · ~$${x.m.cost}/kg</div></div>
      <div><div class="score"><span style="width:${x.ok ? Math.max(4, (x.score / best) * 100) : 0}%"></span></div><div class="note" style="margin-top:4px">${esc(x.m.note)}</div>
        <div class="chips">${x.why.map((w) => `<span class="chip ok">${esc(w)}</span>`).join('')}${x.fail.map((w) => `<span class="chip no">${esc(w)}</span>`).join('')}</div></div>
      <div class="num muted" style="text-align:right">${fmt(U.partMass(p.mat, x.m.rho, PRN()), 1)} g</div></div>`).join('');
    const m = top[0] ? top[0].m : U.MATERIALS[0];
    const sh = U.partShell(p.mat, PRN());
    const sz = p.mat.stlSize ? ` Part ${p.mat.stlSize.map((v) => fmt(v, 1)).join(' × ')} mm.` : '';
    $('#partOut').innerHTML = `In <b>${esc(m.name)}</b>: <b>${fmt(U.partMass(p.mat, m.rho, PRN()), 1)} g</b>. ${fmt(sh.shell, 1)} of ${fmt(sh.V, 1)} cm³ printed solid${sh.measured ? ` (sides ${fmt(p.mat.areaSide, 1)} cm², top/bottom ${fmt(p.mat.areaTB, 1)} cm² from the STL)` : sh.estArea ? ` (area estimated at ${fmt(sh.A, 0)} cm²)` : ''}.${sz}`;
    drawStl();
  }

  // ---------- STL (slicer-style preview with three.js, MIT) ----------
  let stlMesh = null;
  const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };
  const PLATES = { bambu: [256, 256, 'Bambu X1 / P1 (256 × 256)'], prusa: [250, 210, 'Prusa MK4 (250 × 210)'], ender: [220, 220, 'Ender 3 (220 × 220)'], voron: [350, 350, 'Voron 350 (350 × 350)'], mini: [180, 180, 'A1 mini / Prusa mini (180 × 180)'] };
  async function readStl(file, unit) {
    const tris = U.parseSTL(await file.arrayBuffer());
    return { tris, st: U.stlStats(tris, UNIT_MM[unit] || 1) };
  }
  const stlFields = (st, name) => ({ vol: +st.vol.toFixed(3), area: +st.area.toFixed(2), areaSide: +st.areaSide.toFixed(2), areaTB: +st.areaTB.toFixed(2), stlName: name, stlSize: st.size.map((v) => +v.toFixed(2)) });
  const loadThree = () => (window.__three ? Promise.resolve(window.__three) : import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js').then((m) => (window.__three = m)));

  // rotate the mesh 90° about X or Y (changes which faces are walls vs skins, so the mass estimate updates)
  function rotateStl(axis) {
    const t = stlMesh;
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i], y = t[i + 1], z = t[i + 2];
      if (axis === 'x') { t[i + 1] = -z; t[i + 2] = y; } else { t[i] = z; t[i + 2] = -x; }
    }
    const m = P().mat;
    Object.assign(m, stlFields(U.stlStats(t, UNIT_MM[m.stlUnit || 'mm']), m.stlName));
    if (sv) sv.rebuild = true;
    save(); render();
  }

  // viewer state survives re-renders; the WebGL canvas is re-attached to the new host element
  let sv = null;
  async function drawStl() {
    const host = $('#stlView');
    if (!host || !stlMesh) return;
    host.hidden = false;
    let T;
    try { T = await loadThree(); } catch (e) { host.innerHTML = '<p class="faint" style="padding:12px">3D preview needs an internet connection the first time (three.js). The mass estimate still works.</p>'; return; }
    if (!sv) {
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(devicePixelRatio || 1);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, 1, 1, 20000);
      camera.up.set(0, 0, 1);
      scene.add(new T.HemisphereLight(0xffffff, 0x444444, 1.6));
      const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.6, -1, 1.4); scene.add(sun);
      const fill = new T.DirectionalLight(0xffffff, 0.5); fill.position.set(1, 0.8, 0.4); scene.add(fill);
      sv = { T, renderer, scene, camera, rot: { th: -Math.PI / 4 - Math.PI / 2, ph: 0.55, r: 300 }, target: new T.Vector3(), rebuild: true, mesh: null, plate: null };
      const cv = renderer.domElement;
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerdown', (e) => { sv.drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => {
        if (!sv.drag) return;
        const dx = e.clientX - sv.drag.x, dy = e.clientY - sv.drag.y;
        sv.drag.x = e.clientX; sv.drag.y = e.clientY;
        if (sv.drag.pan) {
          const k = sv.rot.r / 600, th = sv.rot.th;
          sv.target.x += (-Math.sin(th) * dx - Math.cos(th) * Math.sin(sv.rot.ph) * dy) * k * -1;
          sv.target.y += (Math.cos(th) * dx - Math.sin(th) * Math.sin(sv.rot.ph) * dy) * k * -1;
          sv.target.z += Math.cos(sv.rot.ph) * dy * k;
        } else { sv.rot.th -= dx * 0.008; sv.rot.ph = Math.max(-1.45, Math.min(1.5, sv.rot.ph + dy * 0.008)); }
        stlRender();
      });
      cv.addEventListener('pointerup', () => { sv.drag = null; });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); sv.rot.r = Math.max(5, Math.min(5000, sv.rot.r * (e.deltaY < 0 ? 0.88 : 1.14))); stlRender(); }, { passive: false });
      new ResizeObserver(() => stlRender()).observe(cv);
    }
    if (sv.renderer.domElement.parentElement !== host) { host.innerHTML = ''; host.appendChild(sv.renderer.domElement); }
    if (sv.rebuild || sv.plateKey !== stlPlateKey()) stlBuild();
    stlRender();
  }
  const stlPlateKey = () => `${S.settings.plate || 'bambu'}|${P().mat.stlUnit || 'mm'}|${S.theme}|${S.settings.overhang !== false}`;

  function stlBuild() {
    const { T, scene } = sv;
    for (const o of [sv.mesh, sv.plate, sv.edges]) if (o) { scene.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
    const k = UNIT_MM[P().mat.stlUnit || 'mm'], t = stlMesh, n = t.length / 3;
    // place on the plate: centred in X/Y, lowest point at Z = 0
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.length; i++) { const c = i % 3; lo[c] = Math.min(lo[c], t[i]); hi[c] = Math.max(hi[c], t[i]); }
    const off = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
    const pos = new Float32Array(t.length), col = new Float32Array(t.length);
    for (let i = 0; i < t.length; i++) pos[i] = (t[i] + off[i % 3]) * k;
    const base = new T.Color(cssv('--accent')), over = new T.Color('#e5484d'), showOver = S.settings.overhang !== false;
    let overN = 0;
    for (let f = 0; f < n; f += 3) {
      const a = f * 3, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], wx = pos[a + 6] - pos[a], wy = pos[a + 7] - pos[a + 1], wz = pos[a + 8] - pos[a + 2];
      const nz = ux * wy - uy * wx, nl = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, nz) || 1;
      const minZ = Math.min(pos[a + 2], pos[a + 5], pos[a + 8]);
      const isOver = showOver && nz / nl < -0.707 && minZ > 0.3; // faces steeper than 45° below horizontal, not on the plate
      if (isOver) overN++;
      const c = isOver ? over : base;
      for (let v = 0; v < 3; v++) { col[a + v * 3] = c.r; col[a + v * 3 + 1] = c.g; col[a + v * 3 + 2] = c.b; }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    sv.mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, flatShading: true }));
    scene.add(sv.mesh);
    sv.edges = new T.LineSegments(new T.EdgesGeometry(geo, 35), new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    scene.add(sv.edges);
    // build plate with a 10 mm grid and 50 mm major lines
    const [pw, pd] = PLATES[S.settings.plate || 'bambu'] || PLATES.bambu, dark = S.theme === 'dark';
    const plate = new T.Group();
    const bed = new T.Mesh(new T.PlaneGeometry(pw, pd), new T.MeshStandardMaterial({ color: dark ? 0x2b2b28 : 0xd9d7cf, roughness: 0.9 }));
    bed.position.z = -0.05; plate.add(bed);
    const lines = [], majors = [];
    for (let x = -pw / 2; x <= pw / 2 + 1e-6; x += 10) (Math.round(x + pw / 2) % 50 === 0 ? majors : lines).push(x, -pd / 2, 0, x, pd / 2, 0);
    for (let y = -pd / 2; y <= pd / 2 + 1e-6; y += 10) (Math.round(y + pd / 2) % 50 === 0 ? majors : lines).push(-pw / 2, y, 0, pw / 2, y, 0);
    const seg = (arr, color, op) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: op })); };
    plate.add(seg(lines, dark ? 0xffffff : 0x000000, 0.07), seg(majors, dark ? 0xffffff : 0x000000, 0.18));
    const ax = (x2, y2, color) => seg([-pw / 2 + 1, -pd / 2 + 1, 0.1, -pw / 2 + 1 + x2, -pd / 2 + 1 + y2, 0.1], color, 1);
    plate.add(ax(30, 0, 0xe5484d), ax(0, 30, 0x57b36a));
    sv.plate = plate; scene.add(plate);
    scene.background = new T.Color(cssv('--panel-2'));
    const size = [(hi[0] - lo[0]) * k, (hi[1] - lo[1]) * k, (hi[2] - lo[2]) * k];
    sv.size = size; sv.fits = size[0] <= pw && size[1] <= pd;
    sv.overhangs = overN;
    sv.tris = n / 3;
    sv.target.set(0, 0, size[2] / 2);
    sv.rot.r = Math.max(60, Math.hypot(...size) * 2.2);
    sv.rebuild = false; sv.plateKey = stlPlateKey();
    const info = $('#stlInfo');
    if (info) info.innerHTML = `${fmt(sv.tris, 0)} triangles · ${uText(`${fmt(size[0], 1)} × ${fmt(size[1], 1)} × ${fmt(size[2], 1)} mm`)} ${sv.fits ? '' : '<span class="pill crit">larger than the plate</span>'}${showOver && sv.overhangs ? ` · <span style="color:#e5484d">${fmt(sv.overhangs, 0)} overhang faces need support</span>` : ''}`;
  }

  function stlRender() {
    if (!sv || !sv.mesh) return;
    const cv = sv.renderer.domElement, host = cv.parentElement;
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * (devicePixelRatio || 1)) || cv.height !== Math.round(h * (devicePixelRatio || 1))) { sv.renderer.setSize(w, h, false); cv.style.width = '100%'; cv.style.height = '100%'; }
    const { th, ph, r } = sv.rot, c = sv.camera;
    c.aspect = w / h; c.updateProjectionMatrix();
    c.position.set(sv.target.x + r * Math.cos(ph) * Math.cos(th), sv.target.y + r * Math.cos(ph) * Math.sin(th), sv.target.z + r * Math.sin(ph));
    c.lookAt(sv.target);
    sv.renderer.render(sv.scene, c);
  }
  function stlView(v) {
    if (!sv) return;
    const s = sv.size || [50, 50, 50];
    sv.target.set(0, 0, s[2] / 2);
    if (v === 'fit' || v === 'iso') { sv.rot.th = -Math.PI * 0.75; sv.rot.ph = 0.55; }
    if (v === 'top') { sv.rot.ph = 1.5; sv.rot.th = -Math.PI / 2; }
    if (v === 'front') { sv.rot.ph = 0.02; sv.rot.th = -Math.PI / 2; }
    if (v === 'side') { sv.rot.ph = 0.02; sv.rot.th = 0; }
    sv.rot.r = Math.max(60, Math.hypot(...s) * 2.2);
    stlRender();
  }

  // ---------- LIBRARY ----------
  const LIB_COLS = {
    motors: [['name', 'Motor', 'text', 210], ['kv', 'kV', 'number', 64], ['rm', 'Rm Ω', 'number', 70], ['i0', 'I0 A', 'number', 58], ['g', 'Weight g', 'number', 70, 'g>oz'], ['maxA', 'Max A', 'number', 60], ['maxW', 'Max W', 'number', 66], ['link', 'Link', 'text', 140], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
    props: [['name', 'Prop', 'text', 200], ['diam', 'Diameter in', 'number', 76], ['pitch', 'Pitch in', 'number', 70], ['g', 'Weight g', 'number', 76, 'g>oz'], ['link', 'Link', 'text', 160], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
    batteries: [['name', 'Pack', 'text', 240], ['chem', 'Chem', 'chem'], ['s', 'Cells S', 'number', 54], ['p', 'Cells P', 'number', 54], ['cellMah', 'Cell mAh', 'number', 76], ['g', 'Pack g', 'number', 70, 'g>oz'], ['c', 'Cont. C', 'number', 54], ['cPeak', 'Peak C', 'number', 54], ['link', 'Link', 'text', 120], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
    printed: [['name', 'Part', 'text', 190], ['mat', 'Material', 'mat'], ['vol', 'Volume cm³', 'number', 70, 'cm³>in³'], ['area', 'Area cm²', 'number', 70, 'cm²>in²'], ['walls', 'Walls', 'number', 50], ['tb', 'Top/bot layers', 'number', 56], ['infill', 'Infill %', 'number', 56], ['g', 'Mass g', 'number', 66, 'g>oz'], ['notes', 'Notes', 'text', 140], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
    parts: [['name', 'Name', 'text', 220], ['sub', 'Subsystem', 'sub', 110], ['g', 'g', 'number', 70, 'g>oz'], ['rail', 'Rail', 'rail'], ['w', 'Avg W', 'number', 60], ['pw', 'Peak W', 'number', 60], ['rf', 'RF Freq', 'rf'], ['link', 'Link', 'text', 140], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
    airframes: [['name', 'Name', 'text', 200], ['span', 'Span m', 'number', 70, 'm>in'], ['area', 'Wing m²', 'number', 80, 'm²>ft²'], ['length', 'Length m', 'number', 70, 'm>in'], ['g', 'Weight g', 'number', 80, 'g>oz'], ['notes', 'Notes', 'text', 160], ['link', 'Link', 'text', 140], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
  };
  const LIB_BLANK = {
    motors: { name: 'New motor', kv: 0, g: 0, maxA: 0, link: '', cost: 0, buy: '' },
    props: { name: 'New prop', diam: 10, pitch: 5, g: 0, link: '', cost: 0, buy: '' },
    batteries: { name: 'New pack', chem: 'lipo', s: 6, p: 1, cellMah: 5000, g: 700, c: 25, cPeak: 0, link: '', cost: 0, buy: '' },
    printed: { name: 'New printed part', mat: 'petg', vol: 10, area: 0, walls: 3, tb: 4, infill: 25, g: 0, sub: '3D printed', notes: '', cost: 0, buy: '' },
    parts: { name: 'New component', sub: 'Avionics', g: 10, rail: '5V', w: 1, pw: 1, rf: '', link: '', cost: 0, buy: '' },
    airframes: { name: 'New airframe', span: 1, area: 0.2, length: 0.8, g: 500, notes: '', link: '', cost: 0, buy: '' },
  };
  const nameOf = (kind, id) => ((S.lib[kind] || []).find((x) => x.id === id) || {}).name || '(deleted)';

  const mtOpen = new Set(); // motors whose thrust tests are expanded
  function renderLibrary(el) {
    if (S.libTab === 'tests') S.libTab = 'motors';
    if (S.libTab === 'subs') S.libTab = 'parts';
    const t = S.libTab, L = S.lib;
    const tabs = [['motors', 'Motors & thrust data', L.motors.length], ['props', 'Props', L.props.length], ['batteries', 'Battery packs', L.batteries.length], ['parts', 'Components', L.parts.length], ['printed', '3D printed parts', (L.printed || []).length], ['airframes', 'Airframes', L.airframes.length]];
    const opt = (list, v) => list.map(([a, b]) => `<option value="${a}"${a === (v || '') ? ' selected' : ''}>${b}</option>`).join('');
    let body = '';
    // one motor's thrust tests, shown under its row
    const testRows = (mId) => {
      const list = L.tests.map((x, i) => [x, i]).filter(([x]) => x.motor === mId);
      return `<div class="mt-tests">${list.length ? `<table><thead><tr><th>Prop</th><th class="n">Bench V</th><th class="n">Points</th><th class="n">Max thrust g</th><th class="n">Max A</th><th class="n">g/W at 50%</th><th></th></tr></thead><tbody>
        ${list.map(([x, i]) => { const c = U.curve(x, x.v), half = c.thrustAtThrottle(50); return `<tr><td>${esc(nameOf('props', x.prop))}</td><td class="n">${fmt(x.v, 1)}</td><td class="n">${x.rows.length}${c.estimated ? ' <span class="pill warn">thin</span>' : ''}</td><td class="n">${fmt(c.tmax, 0)}</td><td class="n">${fmt(c.imax, 1)}</td><td class="n">${c.hasThr ? fmt(half / c.powerAt(half), 2) : '—'}</td>
          <td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="test-edit" data-i="${i}">Edit</button><button class="btn ghost sm danger" data-act="lib-del" data-kind="tests" data-i="${i}" aria-label="Delete test">×</button></div></td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">No thrust tests yet. Pairs without one use the motor model and prop data.</p>'}
        <button class="btn sm" data-act="test-new" data-motor="${esc(mId)}" style="margin-top:8px">+ Add thrust test</button></div>`;
    };
    let subsBody = '';
    if (t === 'parts') {
      const used = (k) => S.lib.parts.filter((x) => x.sub === k).length + S.projects.reduce((a, p) => a + p.bom.filter((r) => r.sub === k).length, 0);
      subsBody = `<details class="group" data-g="library:subsystems"${(S.ui && S.ui.groups && S.ui.groups['library:subsystems']) === false ? '' : ' open'} style="margin-top:18px"><summary>Subsystems</summary><div style="padding-top:8px"><div class="tbl-wrap"><table><thead><tr><th>Color</th><th>Name</th><th class="n">Used by</th><th>Preview</th><th></th><th></th></tr></thead><tbody>
        ${L.subs.map((x, i) => `<tr><td><input type="color" data-lib="subs.${i}.color" value="${esc(x.color)}" aria-label="Color of ${esc(x.name)}" style="width:44px;height:30px;padding:2px"></td>
          <td><input type="text" data-lib="subs.${i}.name" value="${esc(x.name)}" style="width:200px" aria-label="Name"></td>
          <td class="n">${used(x.key)} item${used(x.key) === 1 ? '' : 's'}</td><td>${subTag(x.key)}</td>
          <td><div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-act="sub-up" data-i="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button class="btn ghost sm" data-act="sub-color" data-i="${i}" title="Back to the default color">Reset color</button></div></td>
          <td>${CORE_SUBS.includes(x.key) ? `<span class="faint" title="Used by the calculations (motors, battery, payload, airframe, printed parts). Rename or recolor it instead.">built-in</span>` : `<button class="btn ghost sm danger" data-act="sub-del" data-i="${i}" aria-label="Delete">×</button>`}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="sub-add">Add subsystem</button><span class="note">The order here is the order in BOM reports. Deleting a subsystem moves its items to ${esc(subName('Other'))}.</span></div></div></details>`;
    }
    {
      const cols = LIB_COLS[t];
      const cell = (k, c, v) => {
        if (c[2] === 'chem') return `<select data-lib="${k}">${opt(Object.entries(U.CELL).map(([a, b]) => [a, b.label]), v)}</select>`;
        if (c[2] === 'rail') return `<select data-lib="${k}">${opt(RAILS, v)}</select>`;
        if (c[2] === 'mat') return `<select data-lib="${k}">${opt(U.MATERIALS.map((m) => [m.id, m.name]), v)}</select>`;
        if (c[2] === 'rf') return `<select data-lib="${k}">${opt(RF_OPTS, v)}</select>`;
        if (c[2] === 'sub') {
          // every known subsystem plus any custom ones already in use; each option in its own color
          const all = subKeys().concat(v && !subKeys().includes(v) ? [v] : []);
          return `<select data-lib="${k}" data-rebuild class="subsel" style="--sc:${subColor(v)};width:${c[3] + 20}px">${all.map((x) => `<option value="${esc(x)}" style="color:${subColor(x)}"${x === v ? ' selected' : ''}>■ ${esc(subName(x))}</option>`).join('')}</select>`;
        }
        return `<input type="${c[2]}" data-lib="${k}"${c[4] ? ` data-u="${c[4]}"` : ''} value="${esc(c[4] ? toDisp(v ?? '', c[4]) : v ?? '')}" step="any" style="width:${c[3]}px">`;
      };
      const acts = (i) => ({
        motors: `<button class="btn sm" data-act="use-motor" data-role="mr" data-i="${i}">Lift</button><button class="btn sm" data-act="use-motor" data-role="fw" data-i="${i}">Cruise</button>`,
        props: `<button class="btn sm" data-act="use-prop" data-role="mr" data-i="${i}">Lift</button><button class="btn sm" data-act="use-prop" data-role="fw" data-i="${i}">Cruise</button>`,
        batteries: `<button class="btn sm" data-act="lib-use" data-kind="batteries" data-i="${i}">Use pack</button>`,
        parts: `<button class="btn sm" data-act="lib-use" data-kind="parts" data-i="${i}">Add to BOM</button>`,
        printed: `<label class="btn sm">STL<input type="file" accept=".stl,.STL" data-stlrow="${i}" hidden></label><button class="btn sm" data-act="lib-use" data-kind="printed" data-i="${i}">Add to BOM</button>`,
        airframes: `<button class="btn sm" data-act="lib-use" data-kind="airframes" data-i="${i}">Apply</button>`,
      })[t];
      const extra = t === 'motors' ? '<th>Thrust data</th>' : t === 'props' ? '<th>Performance data</th><th class="n">Tests</th>' : '';
      const nTests = (x) => `<td class="n">${L.tests.filter((q) => q[t === 'motors' ? 'motor' : 'prop'] === x.id).length || '<span class="faint">0</span>'}</td>`;
      const mtBtn = (x) => { const n = L.tests.filter((q) => q.motor === x.id).length; return `<td><button class="btn sm${n ? '' : ' ghost'}" data-act="mt-toggle" data-id="${esc(x.id)}" aria-expanded="${mtOpen.has(x.id)}">${mtOpen.has(x.id) ? '▾' : '▸'} ${n} test${n === 1 ? '' : 's'}</button></td>`; };
      const extraCell = (x, i) => (t === 'motors' ? mtBtn(x) : t === 'props' ? `<td><button class="btn sm${x.data ? '' : ' ghost'}" data-act="prop-data" data-i="${i}">${x.data ? `${esc(x.data.src)} · ${x.data.rpm.length} rpm` : 'Add data…'}</button></td>${nTests(x)}` : '');
      body = `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}${extra}<th>Use in ${esc(P().name)}</th><th></th></tr></thead><tbody>
        ${L[t].map((x, i) => `<tr>${cols.map((c) => `<td>${cell(`${t}.${i}.${c[0]}`, c, x[c[0]])}</td>`).join('')}${extraCell(x, i)}<td><div class="row" style="flex-wrap:nowrap">${acts(i)}</div></td><td><button class="btn ghost sm danger" data-act="lib-del" data-kind="${t}" data-i="${i}" aria-label="Delete">×</button></td></tr>${t === 'motors' && mtOpen.has(x.id) ? `<tr class="mt-row"><td colspan="${cols.length + 3}">${testRows(x.id)}</td></tr>` : ''}`).join('')}
        </tbody></table></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="lib-add" data-kind="${t}">Add ${{ motors: 'motor', props: 'prop', batteries: 'battery pack', parts: 'component', printed: 'printed part', airframes: 'airframe' }[t]}</button>
        ${t === 'printed' ? `<span class="note">Printer settings:</span>
          <label class="f" style="width:110px"><span>Line width mm</span><input type="number" data-lib="printer.lineW" value="${PRN().lineW}" step="0.01"></label>
          <label class="f" style="width:110px"><span>Layer height mm</span><input type="number" data-lib="printer.layerH" value="${PRN().layerH}" step="0.01"></label>` : ''}
        ${t === 'batteries' ? '<span class="note">One row per pack. Set the pack count on the Performance tab.</span>' : ''}
        ${t === 'motors' ? `<button class="btn" data-act="spec-import" data-kind="motors">Import / paste motor specs</button><button class="btn" data-act="bulk-import">Import thrust spreadsheet (all sheets)</button><button class="btn ghost" data-act="mt-all">${mtOpen.size ? 'Collapse' : 'Expand'} all thrust data</button><span class="note">Rm and I0 enable the motor model ${tip('Rm: winding resistance in ohms (values over 1.5 are read as mΩ). I0: no-load current in amps.')}</span>` : ''}
        ${t === 'props' ? `<button class="btn" data-act="apc-import">Import APC .dat / .zip</button><button class="btn" data-act="spec-import" data-kind="props">Import / paste prop list</button><span class="note">Prop data drives cruise efficiency ${tip('Ct and Cp versus advance ratio at each RPM, e.g. APC PER3 files. Also used for motor + prop pairs without a thrust test.')}</span>` : ''}</div>`;
    }
    el.innerHTML = `<div class="card"><div class="card-h"><h2>Component library</h2>
        <div class="row"><span class="note">Shared by every design.</span><button class="btn sm" data-act="team-open" title="Share this library with everyone who can open the app">Team library</button><button class="btn sm" data-act="tpl-download" title="Excel workbook with a sheet per component type">Download template</button><button class="btn sm primary" data-act="tpl-import">Import workbook</button></div></div>
      <div class="row" style="margin-bottom:12px"><label class="f" style="min-width:240px"><span>Library section</span><select id="libSection">${tabs.map(([k, l, n]) => `<option value="${k}"${k === t ? ' selected' : ''}>${l} (${n})</option>`).join('')}</select></label></div>
      <div class="sub-tabs">${tabs.map(([k, l, n]) => `<button class="btn${k === t ? ' primary' : ''}" data-libtab="${k}">${l} <span class="num" style="opacity:.7">${n}</span></button>`).join('')}</div>${body}${subsBody}</div>`;
  }

  // ---------- template workbook: download and import (sheets: Components, Motors, Props, Batteries, Airframes, Thrust - …) ----------
  function downloadTemplate() {
    const b64 = window.UAS_TEMPLATE_B64;
    if (!b64) return toast('Template not bundled in this build.');
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    download('HangarLab template.xlsx', new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  // header row → objects, using a regex per field
  function sheetObjects(rows, fields) {
    const hi = rows.findIndex((r) => (r || []).filter((c) => typeof c === 'string' && /[a-z]/i.test(c)).length >= 2);
    if (hi < 0) return [];
    const hdr = rows[hi].map((c) => String(c ?? '').trim()), map = {};
    for (const [k, rx] of fields) { const i = hdr.findIndex((h, j) => rx.test(h) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i; }
    if (map.name == null) return [];
    return rows.slice(hi + 1).map((r) => {
      const o = {};
      for (const k in map) { const v = (r || [])[map[k]]; if (v != null && v !== '') o[k] = v; }
      return o;
    }).filter((o) => o.name && String(o.name).trim());
  }
  const numOr = (v, d = 0) => (v === '' || v == null || !isFinite(+v) ? d : +v);
  const RAIL_IN = { vbat: 'VBAT', '3.3v': '3.3V', '5v': '5V', '9v': '9V', '12v': '12V', '24v': '24V', 'own supply': 'Separate', separate: 'Separate', none: '', '': '' };
  const bandIn = (v) => { const t = String(v || '').toLowerCase(); if (!t || t === 'none') return ''; const hit = Object.entries(U.BANDS).find(([k, b]) => b.label.toLowerCase() === t || k === t); return hit && hit[0] !== 'gnss' ? hit[0] : /gnss|gps/.test(t) ? '' : /5\.8/.test(t) ? '5800' : /2\.4/.test(t) ? '2400' : /915/.test(t) ? '915' : /868/.test(t) ? '868' : /433/.test(t) ? '433' : /1\.[23]/.test(t) ? '1200' : ''; };
  const chemIn = (v) => ({ lipo: 'lipo', lihv: 'lihv', 'li-ion': 'liion', liion: 'liion', lifepo4: 'life', life: 'life' })[String(v || 'lipo').toLowerCase().replace(/\s/g, '')] || 'lipo';
  const BUY_COLS = [['buy', /buy|purchase|shop|store|order/i], ['cost', /cost|price/i]];
  const buyOf = (o) => Object.assign(o.buy ? { buy: String(o.buy).trim() } : {}, o.cost != null && isFinite(+o.cost) ? { cost: +o.cost } : {});
  function upsert(kind, prefix, o) {
    const hit = S.lib[kind].find((x) => x.name.toLowerCase() === String(o.name).toLowerCase());
    if (hit) { Object.assign(hit, o); return 'u'; }
    S.lib[kind].push(Object.assign({ id: prefix + uid() }, LIB_BLANK[kind], o));
    return 'a';
  }
  // long-format thrust sheet: Motor | Prop | Throttle | Thrust | Voltage | Current | Power → {key: {motor, prop, v, rows}}
  function thrustLong(rows) {
    const hi = rows.findIndex((r) => (r || []).some((c) => /^motor/i.test(String(c || ''))) && (r || []).some((c) => /thrust/i.test(String(c || ''))));
    if (hi < 0) return null;
    const h = rows[hi].map((c) => String(c ?? ''));
    const col = (rx) => h.findIndex((x) => rx.test(x));
    const m = { motor: col(/^motor/i), prop: col(/^prop/i), thr: col(/thrott|pwm|%/i), g: col(/thrust/i), v: col(/volt/i), a: col(/curr|amp/i), w: col(/power|watt/i) };
    if (m.prop < 0 || m.g < 0 || (m.a < 0 && m.w < 0)) return null;
    const kg = /kg/i.test(h[m.g]) ? 1000 : 1;
    const out = {};
    let lastM = '', lastP = '';
    for (const r of rows.slice(hi + 1)) {
      if (!r) continue;
      const mo = String(r[m.motor] ?? '').trim() || lastM, pr = String(r[m.prop] ?? '').trim() || lastP; // blank cells repeat the row above
      lastM = mo; lastP = pr;
      const g = +r[m.g], v = m.v >= 0 ? +r[m.v] : NaN;
      let a = m.a >= 0 ? +r[m.a] : NaN;
      if (!isFinite(a) && m.w >= 0 && isFinite(v) && v) a = +r[m.w] / v;
      if (!mo || !pr || !(g > 0) || !(a >= 0)) continue;
      const k = mo + '|' + pr, G = out[k] || (out[k] = { motor: mo, prop: pr, rows: [], vs: [] });
      const thr = m.thr >= 0 && r[m.thr] !== '' && r[m.thr] != null ? +r[m.thr] : null;
      G.rows.push([isFinite(thr) ? thr : null, +(g * kg).toFixed(2), +a.toFixed(3)]);
      if (isFinite(v) && v) G.vs.push(v);
    }
    for (const G of Object.values(out)) G.v = G.vs.length ? +(G.vs.reduce((x, y) => x + y) / G.vs.length).toFixed(2) : 22.2;
    return Object.keys(out).length ? out : null;
  }
  async function importWorkbook(file) {
    let sheets;
    try { sheets = await readSheets(file); } catch (e) { return toast(e.message); }
    snapshot();
    const n = { a: 0, u: 0 }, per = {};
    const tally = (k, r) => { n[r]++; per[k] = (per[k] || 0) + 1; };
    for (const sh of sheets) {
      const name = sh.name.trim().toLowerCase();
      if (name === 'components' || name === 'parts') {
        for (const o of sheetObjects(sh.rows, [['name', /^name|component|item/i], ['sub', /subsys/i], ['g', /weight|mass|\(g\)/i], ['rail', /rail|supply/i], ['w', /avg|average|typ/i], ['pw', /peak|max/i], ['rf', /rf|band|radio/i], ...BUY_COLS, ['link', /link|url/i]])) {
          tally('components', upsert('parts', 'parts-', Object.assign({ name: String(o.name).trim(), sub: subKeyOf(o.sub), g: numOr(o.g), rail: RAIL_IN[String(o.rail || '').toLowerCase().trim()] ?? '', w: numOr(o.w), pw: numOr(o.pw, numOr(o.w)), rf: bandIn(o.rf), link: o.link ? String(o.link) : '' }, buyOf(o))));
        }
      } else if (name === 'motors' || name === 'props') {
        const kind = name;
        for (const o of specParse(sh.rows, kind).items) tally(kind, upsert(kind, kind === 'motors' ? 'm-' : 'pr-', o));
      } else if (name === 'batteries' || name === 'packs') {
        for (const o of sheetObjects(sh.rows, [['name', /^name|pack/i], ['chem', /chem/i], ['s', /cells? s\b|series|^s$/i], ['p', /cells? p\b|parallel|^p$/i], ['cellMah', /cell cap|mah/i], ['g', /weight|mass/i], ['cPeak', /peak|burst/i], ['c', /\bc\b|continuous/i], ...BUY_COLS, ['link', /link|url/i]])) {
          tally('batteries', upsert('batteries', 'batteries-', Object.assign({ name: String(o.name).trim(), chem: chemIn(o.chem), s: numOr(o.s, 1), p: numOr(o.p, 1), cellMah: numOr(o.cellMah), g: numOr(o.g), c: numOr(o.c, 1), cPeak: numOr(o.cPeak) }, o.link ? { link: String(o.link) } : {}, buyOf(o))));
        }
      } else if (name === 'airframes') {
        for (const o of sheetObjects(sh.rows, [['name', /^name|airframe/i], ['span', /span/i], ['area', /area/i], ['length', /length/i], ['g', /weight|mass/i], ['notes', /note/i], ...BUY_COLS, ['link', /link|url/i]])) {
          tally('airframes', upsert('airframes', 'airframes-', Object.assign({ name: String(o.name).trim(), span: numOr(o.span), area: numOr(o.area), length: numOr(o.length), g: numOr(o.g), notes: o.notes ? String(o.notes) : '', link: o.link ? String(o.link) : '' }, buyOf(o))));
        }
      } else if (/thrust/.test(name) && thrustLong(sh.rows)) {
        const groups = thrustLong(sh.rows);
        for (const gk of Object.keys(groups)) {
          const G = groups[gk];
          if (!G.rows.length) continue;
          const motor = findOrAdd('motors', G.motor), prop = findOrAdd('props', G.prop, propSize(G.prop));
          const t = S.lib.tests.find((x) => x.motor === motor && x.prop === prop);
          if (t && t.rows.length > G.rows.length) { per['thrust tests kept (more points already)'] = (per['thrust tests kept (more points already)'] || 0) + 1; continue; }
          if (t) { t.rows = G.rows; t.v = G.v; n.u++; } else { S.lib.tests.push({ id: 't-' + uid(), motor, prop, v: G.v, rows: G.rows }); n.a++; }
          per['thrust tests'] = (per['thrust tests'] || 0) + 1;
        }
      } else if (name.startsWith('thrust')) {
        const cellAfter = (rx) => { const r = sh.rows.find((row) => row && typeof row[0] === 'string' && rx.test(row[0])); return r && r[1] != null ? String(r[1]).trim() : ''; };
        const det = detectCols(sh.rows);
        if (!det) continue;
        const res = sheetToRows(sh.rows, det, numOr(cellAfter(/^bench volt/i), 22.2));
        if (!res.rows.length) continue;
        const g = guessNames(sh.name.replace(/^thrust\s*[-–:]?\s*/i, ''));
        const mName = cellAfter(/^motor/i) || g.motor, pName = cellAfter(/^prop/i) || g.prop || 'Unknown prop';
        const motor = findOrAdd('motors', mName), prop = findOrAdd('props', pName, propSize(pName));
        const t = S.lib.tests.find((x) => x.motor === motor && x.prop === prop);
        const v = res.v || numOr(cellAfter(/^bench volt/i), 22.2);
        // never replace a test with fewer points (e.g. the template's example sheet left in place)
        if (t && t.rows.length > res.rows.length) { per['thrust tests kept (more points already)'] = (per['thrust tests kept (more points already)'] || 0) + 1; continue; }
        if (t) { t.rows = res.rows; t.v = v; n.u++; } else { S.lib.tests.push({ id: 't-' + uid(), motor, prop, v, rows: res.rows }); n.a++; }
        per['thrust tests'] = (per['thrust tests'] || 0) + 1;
      }
    }
    save(); render();
    const what = Object.entries(per).map(([k, c]) => `${c} ${k}`).join(', ');
    toast(what ? `Imported ${what} (${n.a} new, ${n.u} updated)` : 'No template sheets found (Components, Motors, Motor thrust data, Props, Batteries, Airframes).', what ? { label: 'Undo', fn: undo } : null);
  }

  // ---------- team library (shared through the published app's database) ----------
  let teamDb;
  async function teamStore() {
    if (teamDb === undefined) teamDb = window.claude && window.claude.use ? await window.claude.use('db').catch(() => null) : null;
    return teamDb;
  }
  const teamId = (k, id) => `${k}~${id}`.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 200);
  async function teamDialog() {
    openDlg('Team library', `<p class="note">Everyone who can open this app shares one team library.</p>
      <ul class="note" style="padding-left:18px"><li><b>Share my library</b> sends all your library items up. Items the team already has are replaced by your version.</li>
      <li><b>Get team library</b> brings the team's items into your library. Your copies of the same items are replaced by the team's (Undo works).</li>
      <li>Deleting an item in your library never deletes it from the team.</li></ul>
      <p id="teamStat" class="hint">Connecting…</p>`,
      `<button class="btn" data-act="dlg-close">Close</button><button class="btn" data-act="team-push" disabled>Share my library</button><button class="btn primary" data-act="team-pull" disabled>Get team library</button>`);
    const db = await teamStore(), st = $('#teamStat');
    if (!st) return;
    if (!db) { st.textContent = 'Not available here: the team library works in the published app when you are signed in to claude.ai. Here, share a workspace backup (Export) instead.'; return; }
    try { const snap = await db.collection('teamlib').limit(1000).get(); st.textContent = `${snap.size} item${snap.size === 1 ? '' : 's'} in the team library.`; }
    catch (e) { st.textContent = `Could not read the team library (${e.code || e.message}).`; return; }
    document.querySelectorAll('[data-act="team-push"],[data-act="team-pull"]').forEach((x) => { x.disabled = false; });
  }
  async function teamPush() {
    const db = await teamStore(), st = $('#teamStat');
    if (!db) return;
    const items = LIB_KINDS.flatMap((k) => (S.lib[k] || []).map((x) => [k, x])), q = items.slice();
    let done = 0, fail = 0, why = '';
    const one = async ([k, x]) => {
      for (let a = 0; a < 3; a++) {
        try { await db.collection('teamlib').doc(teamId(k, x.id)).set({ kind: k, id: x.id, json: JSON.stringify(x), at: Date.now() }); done++; return; }
        catch (e) { why = e.code || e.message; if (e.code !== 'resource_exhausted' && e.code !== 'unavailable') break; await new Promise((r) => setTimeout(r, 1500 * (a + 1))); }
      }
      fail++;
    };
    await Promise.all([0, 1, 2, 3].map(async () => { while (q.length) { await one(q.shift()); if (st) st.textContent = `Sharing… ${done + fail} of ${items.length}`; } }));
    if (st) st.textContent = fail ? `Shared ${done} items; ${fail} failed (${why}). Only people with Contributor or Editor access can share.` : `Shared all ${done} items with the team.`;
  }
  async function teamPull() {
    const db = await teamStore();
    if (!db) return;
    let snap;
    try { snap = await db.collection('teamlib').limit(1000).get(); } catch (e) { toast(`Could not read the team library (${e.code || e.message})`); return; }
    snapshot();
    let a = 0, u = 0;
    for (const d of snap.docs) {
      const o = d.data();
      if (!o || !LIB_KINDS.includes(o.kind)) continue;
      let item; try { item = JSON.parse(o.json); } catch (e) { continue; }
      if (!item || !item.id) continue;
      const list = S.lib[o.kind] = S.lib[o.kind] || [], i = list.findIndex((x) => x.id === item.id);
      if (i < 0) { list.push(item); a++; } else if (JSON.stringify(list[i]) !== o.json) { list[i] = item; u++; }
    }
    closeDlg(); save(); render(); toast(`Team library: ${a} added, ${u} updated`, { label: 'Undo', fn: undo });
  }

  // ---------- spreadsheet import ----------
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxP || (xlsxP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => { xlsxP = null; rej(new Error('Could not load the Excel reader (offline?). Save the sheet as CSV and try again.')); };
      document.head.appendChild(s);
    }));
  }
  const scriptP = {};
  function loadScript(url, global, what) {
    if (window[global]) return Promise.resolve(window[global]);
    return scriptP[url] || (scriptP[url] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => res(window[global]);
      s.onerror = () => { delete scriptP[url]; rej(new Error(`Could not load the ${what} (offline?).`)); };
      document.head.appendChild(s);
    }));
  }
  const loadLzma = () => loadScript('https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma-d-min.js', 'LZMA', 'LZMA decoder');

  // minimal zip reader: stored, deflate (native DecompressionStream) and LZMA (APC's PERFILES zip uses LZMA)
  function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This is not a zip file.');
    const n = dv.getUint16(e + 10, true), out = [];
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      out.push({ name, read: async () => {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = u8.subarray(start, start + csize);
        if (method === 0) return new TextDecoder().decode(data);
        if (method === 8) return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        if (method === 14) {
          const L = await loadLzma();
          const psz = data[2] | (data[3] << 8), body = data.subarray(4 + psz), all = new Uint8Array(13 + body.length);
          all.set(data.subarray(4, 9));
          for (let i = 0; i < 4; i++) all[5 + i] = (usize >>> (8 * i)) & 255;
          all.set(body, 13);
          const r = L.decompress(all);
          return typeof r === 'string' ? r : new TextDecoder().decode(Uint8Array.from(r, (x) => x & 255));
        }
        throw new Error(`Unsupported zip compression (method ${method}). Unzip it and pick the .dat files instead.`);
      } });
    }
    return out;
  }

  // pasted text -> 2D array (tab, comma/semicolon, or 2+ spaces)
  const textRows = (text) => text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(l.includes('\t') ? '\t' : /[,;]/.test(l) ? /[,;]/ : /\s{2,}/).map((c) => { const v = c.trim().replace(/^"|"$/g, ''); return v !== '' && isFinite(+v) ? +v : v; }));

  // ---------- motor / prop spec import (CSV, Excel or paste) ----------
  const SPEC_RX = {
    motors: [['name', /name|model|motor/i], ['kv', /\bkv\b|rpm\s*\/\s*v/i], ['i0v', /(i0|io|no.?load).*(volt|\(v\)|@)/i], ['rm', /\brm\b|resist|ohm|mΩ|mohm|Ω/i], ['i0', /\bi0\b|\bio\b|no.?load|idle/i], ['maxA', /max.*(curr|amp|\(a\))|\bimax|peak.*curr|max\s*a\b/i], ['maxW', /max.*(pow|watt|\(w\))|\bpmax|max\s*w\b/i], ['g', /weight|mass|\bg\b|gram/i], ['buy', /buy|purchase|shop|store|order/i], ['cost', /cost|price/i], ['link', /link|url/i]],
    props: [['name', /name|model|prop/i], ['diam', /diam|\bdia\b|\bd\b/i], ['pitch', /pitch|\bp\b/i], ['g', /weight|mass|\bg\b|gram/i], ['buy', /buy|purchase|shop|store|order/i], ['cost', /cost|price/i], ['link', /link|url/i]],
  };
  function specParse(rows, kind) {
    const hi = rows.findIndex((r) => r.filter((c) => typeof c === 'string' && /[a-z]/i.test(c)).length >= 2);
    if (hi < 0) return { items: [], map: {}, hdr: [] };
    const hdr = rows[hi].map((c) => String(c ?? '').trim()), map = {};
    for (const [k, rx] of SPEC_RX[kind]) { const i = hdr.findIndex((h, j) => rx.test(h) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i; }
    if (map.name == null) map.name = 0;
    const mohm = map.rm != null && /mΩ|mohm|milli|\(m/i.test(hdr[map.rm]);
    const items = [];
    for (const r of rows.slice(hi + 1)) {
      const name = String(r[map.name] ?? '').trim();
      if (!name) continue;
      const o = { name };
      for (const k in map) if (k !== 'name' && r[map[k]] != null && r[map[k]] !== '') o[k] = k === 'link' || k === 'buy' ? String(r[map[k]]) : +r[map[k]];
      if (kind === 'motors' && o.rm != null && (mohm || o.rm > 1.5)) o.rm = +(o.rm / 1000).toFixed(5);
      if (kind === 'props' && (!o.diam || !o.pitch)) { const sz = U.sizeOf(name); if (!o.diam && sz.diam) o.diam = sz.diam; if (!o.pitch && sz.pitch) o.pitch = sz.pitch; }
      items.push(o);
    }
    return { items, map, hdr };
  }
  let specState = null;
  function specDialog(kind) {
    specState = { kind, items: [] };
    const cols = kind === 'motors' ? 'Name, kV, Rm (Ω or mΩ), I0 (A), I0 voltage, Max A, Max W, Weight g, Link' : 'Name, Diameter in, Pitch in, Weight g, Link';
    const ph = kind === 'motors' ? 'Motor\tkV\tRm (mΩ)\tI0 (A)\tWeight (g)&#10;T-Motor MN5008\t340\t89\t0.8\t135' : 'Prop\tDiameter\tPitch\tWeight (g)&#10;APC 15x5.5MR\t15\t5.5\t42';
    openDlg(`Import ${kind === 'motors' ? 'motor specs' : 'prop list'}`, `
      <p class="note">Paste rows from a spreadsheet or datasheet, or load a CSV / Excel file. A header row is needed; these columns are recognised in any order: <b>${cols}</b>. Existing ${kind} with the same name are updated.</p>
      <div class="row"><label class="btn">Choose file<input type="file" id="spec-file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" hidden></label><span class="hint" id="spec-src"></span></div>
      <textarea id="spec-box" rows="7" placeholder="${ph}"></textarea>
      <div id="spec-prev"></div>`,
      `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="spec-go">Import</button>`);
  }
  function specPreview(rows) {
    const { items, map, hdr } = specParse(rows, specState.kind);
    specState.items = items;
    const keys = SPEC_RX[specState.kind].map(([k]) => k).filter((k) => map[k] != null);
    $('#spec-prev').innerHTML = items.length ? `<p class="hint">${items.length} row(s). Columns: ${keys.map((k) => `${k} ← “${esc(hdr[map[k]])}”`).join(' · ')}</p>
      <div class="tbl-wrap" style="max-height:220px"><table><thead><tr>${keys.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>${items.slice(0, 50).map((o) => `<tr>${keys.map((k) => `<td>${esc(o[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="hint">No rows recognised yet. Include a header row.</p>';
  }
  function specGo() {
    const { kind, items } = specState;
    if (!items.length) return toast('Nothing to import yet.');
    snapshot();
    let added = 0, updated = 0;
    for (const o of items) {
      const hit = S.lib[kind].find((x) => x.name.toLowerCase() === o.name.toLowerCase());
      if (hit) { Object.assign(hit, o); updated++; } else { S.lib[kind].push(Object.assign({ id: (kind === 'motors' ? 'm-' : 'pr-') + uid() }, LIB_BLANK[kind], o)); added++; }
    }
    closeDlg(); S.libTab = kind; save(); render(); toast(`${added} added, ${updated} updated`);
  }

  // ---------- APC prop performance import (.dat files or the PERFILES zip) ----------
  let apcState = null;
  function apcDialog() {
    apcState = { entries: [], filter: '' };
    openDlg('Import APC prop performance', `
      <p class="note">Load APC <b>PER3_*.dat</b> files, several at once, or the whole <b>PERFILES_WEB zip</b> from apcprop.com and pick the props you use. Each prop keeps its Ct/Cp table at every RPM. Weight is not in the files, so add it on the Props tab.</p>
      <div class="row"><label class="btn primary">Choose .dat or .zip<input type="file" id="apc-file" accept=".dat,.DAT,.txt,.zip" multiple hidden></label><input type="search" id="apc-q" placeholder="Filter, e.g. 16x or E" style="max-width:200px">
        <button class="btn sm" data-act="apc-all">Check all shown</button><button class="btn sm ghost" data-act="apc-none">Uncheck all</button><span class="hint" id="apc-n"></span></div>
      <div id="apc-list" class="tree-msgs" style="max-height:320px"></div>`,
      `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="apc-go">Import checked</button>`);
  }
  const apcShown = () => { const q = apcState.filter.toLowerCase(); return apcState.entries.map((e, i) => [e, i]).filter(([e]) => !q || e.label.toLowerCase().includes(q)); };
  function renderApc() {
    const shown = apcShown();
    const on = apcState.entries.filter((e) => e.on).length;
    // ~9 KB per prop; browser storage is ~5 MB shared with designs and library
    $('#apc-n').textContent = apcState.entries.length ? `${on} checked of ${apcState.entries.length}${on > 150 ? ` · ~${((on * 9) / 1024).toFixed(1)} MB, may fill browser storage` : ''}` : '';
    $('#apc-list').innerHTML = shown.slice(0, 600).map(([e, i]) => { const sz = U.sizeOf(e.label); return `<label><input type="checkbox" data-apc="${i}"${e.on ? ' checked' : ''}> APC ${esc(e.label)} <span class="faint">${sz.diam ? `${sz.diam}×${sz.pitch} in` : ''}${S.lib.props.some((p) => p.name === 'APC ' + e.label) ? ' · in library' : ''}</span></label>`; }).join('') || '<p class="faint">No matches.</p>';
  }
  async function apcFiles(files) {
    $('#apc-list').innerHTML = '<p class="hint">Reading…</p>';
    try {
      const entries = [];
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          for (const ent of unzip(await f.arrayBuffer())) {
            const base = ent.name.split('/').pop();
            if (/^PER3_.*\.dat$/i.test(base) && !/MARINE/i.test(ent.name)) entries.push({ label: base.replace(/^PER3_/i, '').replace(/\.dat$/i, ''), read: ent.read, on: false });
          }
        } else { const text = await f.text(); entries.push({ label: f.name.replace(/^PER3_/i, '').replace(/\.(dat|txt)$/i, ''), read: async () => text, on: true }); }
      }
      entries.sort((a, b) => (U.sizeOf(a.label).diam || 0) - (U.sizeOf(b.label).diam || 0) || a.label.localeCompare(b.label));
      apcState.entries = entries;
      renderApc();
    } catch (e) { $('#apc-list').innerHTML = `<p class="hint" style="color:var(--crit)">${esc(e.message)}</p>`; }
  }
  async function apcGo() {
    const on = apcState.entries.filter((e) => e.on);
    if (!on.length) return toast('Check at least one prop.');
    snapshot();
    let added = 0, updated = 0, bad = 0;
    for (const e of on) {
      const r = U.parseAPC(await e.read(), e.label);
      if (!r) { bad++; continue; }
      r.name = 'APC ' + e.label;
      const hit = S.lib.props.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
      if (hit) { hit.data = r.data; if (!hit.diam) hit.diam = r.diam; if (!hit.pitch) hit.pitch = r.pitch; updated++; } else { S.lib.props.push({ id: 'pr-' + uid(), name: r.name, diam: r.diam, pitch: r.pitch, g: 0, link: 'https://www.apcprop.com/', data: r.data }); added++; }
    }
    closeDlg(); S.libTab = 'props'; save(); render(); toast(`${added} added, ${updated} updated${bad ? `, ${bad} unreadable` : ''}`);
  }

  // ---------- one prop's performance data: view, paste, load, clear ----------
  function propDataDialog(i) {
    const pr = S.lib.props[i], d = pr.data;
    let sum = 'No performance data yet: a P/D-based estimate is used.';
    if (d) { const s0 = U.propCoef(d, 0, d.rpm[Math.floor(d.rpm.length / 2)]); sum = `<b>${esc(d.src)}</b> · ${d.rpm.length} RPM table${d.rpm.length > 1 ? 's' : ''} (${d.rpm[0]}–${d.rpm[d.rpm.length - 1]} rpm) · static Ct ${s0[0].toFixed(3)}, Cp ${s0[1].toFixed(3)}`; }
    openDlg(`Prop data · ${esc(pr.name)}`, `
      <p class="note">${sum}</p>
      <div class="row"><label class="btn">Load .dat / .txt / .csv<input type="file" id="pd-file" accept=".dat,.txt,.csv" hidden></label><span class="hint">Diameter ${pr.diam || '?'} in (needed for static tables)</span></div>
      <label class="f"><span>Paste one of: an APC PER3 file · a table with <b>J, Ct, Cp</b> (optional RPM column) · a static table <b>RPM, Thrust (g / kg / N / lbf), Power (W / hp)</b></span>
      <textarea id="pd-box" rows="9" placeholder="RPM, Thrust (g), Power (W)&#10;4000, 1210, 61&#10;6000, 2730, 205"></textarea></label>
      <p class="hint" id="pd-out"></p><input type="hidden" id="pd-i" value="${i}">`,
      `${d ? '<button class="btn ghost danger" data-act="pd-clear">Remove data</button>' : ''}<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="pd-save">Save</button>`);
  }
  function pdParse() {
    const pr = S.lib.props[+$('#pd-i').value];
    const d = U.parsePropTable($('#pd-box').value, pr.diam);
    $('#pd-out').innerHTML = d ? `Read <b>${d.rpm.length}</b> RPM table(s), ${d.tab.reduce((a, t) => a + t.length, 0)} points (${esc(d.src)}).` : $('#pd-box').value.trim() ? '<span style="color:var(--crit)">Not recognised. Check the header names, and set the prop diameter for static tables.</span>' : '';
    return d;
  }

  // -> [{ name, rows: 2D array }]
  async function readSheets(file) {
    if (/\.(csv|txt|tsv)$/i.test(file.name)) {
      const text = await file.text();
      const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(l.includes('\t') ? '\t' : ',').map((c) => { const v = c.trim().replace(/^"|"$/g, ''); return v !== '' && isFinite(+v) ? +v : v; }));
      return [{ name: file.name.replace(/\.\w+$/, ''), rows }];
    }
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    return wb.SheetNames.map((n) => ({ name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
  }
  const COLRX = { thr: /thrott|^thr|pwm|duty|%/i, g: /thrust|lift/i, a: /curr|amp|\(a\)/i, v: /volt|\(v\)/i, w: /power|watt|\(w\)/i };
  // find header row and column roles in a sheet
  function detectCols(rows) {
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const hdr = (rows[r] || []).map((c) => (c == null ? '' : String(c)));
      const map = {};
      hdr.forEach((h, i) => { for (const k in COLRX) if (map[k] == null && h && COLRX[k].test(h) && !(k === 'thr' && COLRX.g.test(h))) { map[k] = i; break; } });
      // need current, or power with voltage/throttle (skips summary sheets with "max thrust" + "hover power")
      if (map.g != null && (map.a != null || (map.w != null && (map.v != null || map.thr != null)))) {
        const unit = hdr[map.g] || '';
        map.scale = /\bkg/i.test(unit) ? 1000 : /\(n\)|newton/i.test(unit) ? 1000 / 9.80665 : /\b(lb|lbs)\b/i.test(unit) ? 453.592 : /\boz\b/i.test(unit) ? 28.3495 : 1;
        return { hdrRow: r, map, headers: hdr };
      }
    }
    return null;
  }
  function sheetToRows(rows, det, vDefault) {
    const out = [], vs = [];
    const n = (x) => (x == null || x === '' ? null : +x);
    for (let r = det.hdrRow + 1; r < rows.length; r++) {
      const row = rows[r] || [], m = det.map;
      const g = n(row[m.g]);
      if (!(g > 0)) continue;
      const v = m.v != null ? n(row[m.v]) : null;
      let a = m.a != null ? n(row[m.a]) : null;
      if (a == null && m.w != null) a = n(row[m.w]) / (v || vDefault);
      if (!(a >= 0)) continue;
      if (v) vs.push(v);
      const thr = m.thr != null ? n(row[m.thr]) : null;
      out.push([thr != null && isFinite(thr) ? thr : null, +(g * m.scale).toFixed(2), +a.toFixed(3)]);
    }
    return { rows: out, v: vs.length ? +(vs.reduce((x, y) => x + y) / vs.length).toFixed(2) : null };
  }
  // guess motor / prop names from a sheet title like "Hobbywing 4120 250 kV APC16x6"
  function guessNames(title) {
    const m = title.match(/((?:APC|HQ|GF|HF|VSC|EOLO|T-?Motor|Gemfan|Master ?Airscrew|Aeronaut)?\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*\d)?[A-Z]?)/i);
    const prop = m ? m[1].trim() : '';
    return { motor: (m ? title.replace(m[1], '') : title).replace(/\s+-\s*$/, '').trim(), prop };
  }
  const findOrAdd = (kind, name, extra) => {
    const hit = S.lib[kind].find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
    const o = Object.assign({ id: (kind === 'motors' ? 'm-' : 'pr-') + uid(), name }, LIB_BLANK[kind], { name }, extra || {});
    S.lib[kind].push(o);
    return o.id;
  };
  const propSize = (name) => { const m = name.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/); return m ? { diam: +m[1] > 40 ? +m[1] / 10 : +m[1], pitch: +m[2] > 20 ? +m[2] / 10 : +m[2] } : {}; };

  // ---------- thrust test editor ----------
  let sheetCache = null;
  function testDialog(i, motorId) {
    const t = i == null ? { id: 't-' + uid(), motor: motorId || (S.lib.motors[0] || {}).id, prop: (S.lib.props[0] || {}).id, v: 22.2, rows: [] } : clone(S.lib.tests[i]);
    sheetCache = null;
    const opts = (list, v) => list.map((x) => `<option value="${x.id}"${x.id === v ? ' selected' : ''}>${esc(x.name)}</option>`).join('') + '<option value="__new">New…</option>';
    openDlg(i == null ? 'New thrust data' : 'Edit thrust data', `
      <div class="fields" style="padding:0">
        <label class="f"><span>Motor</span><select id="te-motor">${opts(S.lib.motors, t.motor)}</select></label>
        <label class="f"><span>Prop</span><select id="te-prop">${opts(S.lib.props, t.prop)}</select></label>
        <div class="f" id="te-newm" hidden><span>New motor: name, kV, weight g</span><div class="in"><input type="text" id="te-mname" placeholder="T-Motor MN5008"><input type="number" id="te-mkv" placeholder="kV" style="width:70px"><input type="number" id="te-mg" placeholder="g" style="width:64px"></div></div>
        <div class="f" id="te-newp" hidden><span>New prop: name, weight g</span><div class="in"><input type="text" id="te-pname" placeholder="APC 15x5E"><input type="number" id="te-pg" placeholder="g" style="width:64px"></div></div>
        <label class="f"><span>Bench voltage</span><span class="in"><input type="number" id="te-v" value="${t.v}" step="any"><em>V</em></span></label>
      </div>
      <div class="drop" style="padding:10px"><div class="grow"><b>Load from a file</b><div class="note">Excel (.xlsx, .xls), OpenDocument or CSV. Columns like <i>Throttle (%), Thrust (g), Voltage (V), Current (A), Power (W)</i> are found automatically; kg, N, lb and oz thrust are converted.</div></div>
        <label class="btn">Choose file<input type="file" id="te-file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt" hidden></label></div>
      <div id="te-sheet"></div>
      <label class="f"><span>Rows: throttle %, thrust g, current A (or paste Throttle, Thrust, Voltage, Current, Power)</span><textarea id="te-rows" rows="9">${esc(t.rows.map((r) => `${r[0] ?? ''}, ${r[1]}, ${r[2]}`).join('\n'))}</textarea></label>
      <p class="hint">Leave throttle empty if the datasheet only lists thrust vs current.</p>
      <input type="hidden" id="te-i" value="${i ?? ''}"><input type="hidden" id="te-id" value="${esc(t.id)}">`,
      `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="test-save">Save</button>`);
  }
  function fillFromSheet() {
    const k = +($('#te-sheetSel') || { value: 0 }).value;
    const sh = sheetCache[k];
    const det = detectCols(sh.rows);
    const box = $('#te-sheetInfo');
    if (!det) { box.innerHTML = `<span style="color:var(--crit)">No thrust + current/power columns found in “${esc(sh.name)}”.</span>`; return; }
    const res = sheetToRows(sh.rows, det, +$('#te-v').value || 22.2);
    $('#te-rows').value = res.rows.map((r) => `${r[0] ?? ''}, ${r[1]}, ${r[2]}`).join('\n');
    if (res.v) $('#te-v').value = res.v;
    const used = ['thr', 'g', 'v', 'a', 'w'].filter((x) => det.map[x] != null).map((x) => `${{ thr: 'throttle', g: 'thrust', v: 'voltage', a: 'current', w: 'power' }[x]} ← “${esc(det.headers[det.map[x]])}”`).join(' · ');
    box.innerHTML = `Loaded <b>${res.rows.length} rows</b> from “${esc(sh.name)}”. ${used}`;
    const g = guessNames(sh.name);
    // fill name guesses unless the user typed their own
    for (const [id, v] of [['#te-mname', g.motor], ['#te-pname', g.prop]]) { const el = $(id); if (!el.value || el.value === el.dataset.guess) el.value = el.dataset.guess = v; }
  }
  function parseRowsText(text) {
    const rows = [], vs = [];
    for (const line of text.split(/\r?\n/)) {
      const c = line.split(/[\t,;]+/).map((x) => x.trim());
      if (c.length < 2) continue;
      const nums = c.map((x) => (x === '' ? null : Number(x)));
      if (nums.slice(1).some((x) => x != null && !isFinite(x))) continue; // header row
      if (nums.length >= 4 && nums[3] != null) { rows.push([nums[0], nums[1], nums[3]]); if (nums[2]) vs.push(nums[2]); } else if (nums[1] != null && nums[2] != null) rows.push([nums[0], nums[1], nums[2]]);
    }
    return { rows, v: vs.length ? vs.reduce((a, b) => a + b) / vs.length : null };
  }
  function saveTestFromDlg() {
    let motor = $('#te-motor').value, prop = $('#te-prop').value;
    if (motor === '__new') { const nm = $('#te-mname').value.trim(); if (!nm) return toast('Name the new motor.'); motor = findOrAdd('motors', nm, { kv: +$('#te-mkv').value || 0, g: +$('#te-mg').value || 0 }); }
    if (prop === '__new') { const nm = $('#te-pname').value.trim(); if (!nm) return toast('Name the new prop.'); prop = findOrAdd('props', nm, Object.assign({ g: +$('#te-pg').value || 0 }, propSize(nm))); }
    const { rows, v } = parseRowsText($('#te-rows').value);
    if (!rows.length) return toast('Add at least one row: throttle, thrust g, current A.');
    const t = { id: $('#te-id').value, motor, prop, v: v || +$('#te-v').value || 22.2, rows };
    const i = $('#te-i').value;
    if (i === '') S.lib.tests.push(t); else S.lib.tests[+i] = t;
    const m = S.lib.motors.find((x) => x.id === motor);
    if (m) m.maxA = Math.max(+m.maxA || 0, ...rows.map((r) => r[2]));
    mtOpen.add(motor); S.libTab = 'motors';
    closeDlg(); save(); render(); toast(`Saved ${rows.length} rows for ${nameOf('motors', motor)} · ${nameOf('props', prop)}`);
  }

  // ---------- bulk import: one test per sheet ----------
  let bulk = [];
  function bulkDialog() {
    bulk = [];
    openDlg('Import thrust data from a spreadsheet', `
      <p class="note">Pick a workbook where each sheet is one motor + prop test (like your "2025-26 Aircraft System Design" file). Every sheet with thrust and current or power columns is listed. Check the names, then import.</p>
      <label class="btn" style="justify-self:start">Choose file<input type="file" id="bulk-file" accept=".xlsx,.xls,.xlsm,.ods,.csv" hidden></label>
      <div id="bulk-list"></div>`,
      `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="bulk-go">Import checked</button>`);
  }
  function renderBulk() {
    $('#bulk-list').innerHTML = bulk.length ? `<div class="tbl-wrap"><table><thead><tr><th></th><th>Sheet</th><th>Motor</th><th>Prop</th><th class="n">Rows</th><th class="n">V</th></tr></thead><tbody>
      ${bulk.map((b, i) => `<tr><td><input type="checkbox" id="bk-on-${i}"${b.rows.length ? ' checked' : ' disabled'}></td><td>${esc(b.sheet)}</td>
        <td><input type="text" id="bk-m-${i}" value="${esc(b.motor)}" style="min-width:150px"></td><td><input type="text" id="bk-p-${i}" value="${esc(b.prop)}" style="min-width:110px"></td>
        <td class="n">${b.rows.length || '<span class="faint">none</span>'}</td><td><input type="number" id="bk-v-${i}" value="${b.v || ''}" step="any" style="width:70px"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Motors and props are matched by name; new names are added to the library. Fill in kV, weights and prop sizes afterwards on the Motors and Props tabs.</p>` : '<p class="faint">No sheets with thrust data found.</p>';
  }
  function bulkGo() {
    snapshot();
    let n = 0;
    bulk.forEach((b, i) => {
      if (!$(`#bk-on-${i}`) || !$(`#bk-on-${i}`).checked) return;
      const mName = $(`#bk-m-${i}`).value.trim() || b.sheet, pName = $(`#bk-p-${i}`).value.trim() || 'Unknown prop';
      const motor = findOrAdd('motors', mName), prop = findOrAdd('props', pName, propSize(pName));
      const v = +$(`#bk-v-${i}`).value || 22.2;
      const rows = b.rows;
      S.lib.tests.push({ id: 't-' + uid(), motor, prop, v, rows });
      const m = S.lib.motors.find((x) => x.id === motor);
      if (m) m.maxA = Math.max(+m.maxA || 0, ...rows.map((r) => r[2]));
      n++;
    });
    closeDlg(); S.libTab = 'motors'; save(); render(); toast(`Imported ${n} thrust test(s)`);
  }

  // ---------- LOGS (layout and features modelled on ArduPilot UAV Log Viewer; independent code) ----------
  let LOG = null, LV = null, logErr = '';
  const lvs = { side: 'plot', view: '3d', filter: '', paramQ: '', evKinds: { mode: true, msg: true, err: true, ev: true }, sel: [], exprs: [], cursor: null, playing: false, speed: 10, cam: { yaw: -0.7, pitch: 0.6, zoom: 1 } };
  const PRESET_GROUPS = [
    ['Attitude', [['Roll vs desired', ['ATT.Roll', 'ATT.DesRoll']], ['Pitch vs desired', ['ATT.Pitch', 'ATT.DesPitch']], ['Yaw vs desired', ['ATT.Yaw', 'ATT.DesYaw']], ['Roll tracking error', ['=ATT.DesRoll - ATT.Roll']]]],
    ['Rates', [['Roll rate', ['RATE.R', 'RATE.RDes']], ['Pitch rate', ['RATE.P', 'RATE.PDes']], ['Yaw rate', ['RATE.Y', 'RATE.YDes']]]],
    ['Battery', [['Voltage & current', ['BAT.Volt', 'BAT.Curr']], ['Power (W)', ['=BAT.Volt * BAT.Curr']], ['Consumed', ['BAT.CurrTot', 'BAT.EnrgTot']]]],
    ['Vibration', [['Vibration', ['VIBE.VibeX', 'VIBE.VibeY', 'VIBE.VibeZ']], ['Clipping', ['VIBE.Clip', 'VIBE.Clip0', 'VIBE.Clip1', 'VIBE.Clip2']]]],
    ['Altitude', [['Altitude', ['CTUN.Alt', 'CTUN.DAlt', 'CTUN.BAlt']], ['Barometer', ['BARO.Alt']], ['Climb rate', ['CTUN.CRt', 'CTUN.DCRt']]]],
    ['Speed', [['Airspeed', ['ARSP.Airspeed', 'CTUN.As']], ['Ground speed', ['GPS.Spd']]]],
    ['GPS', [['Satellites & HDOP', ['GPS.NSats', 'GPS.HDop']]]],
    ['EKF', [['Innovations (XKF4)', ['XKF4.SV', 'XKF4.SP', 'XKF4.SH', 'XKF4.SM']], ['Innovations (NKF4)', ['NKF4.SV', 'NKF4.SP', 'NKF4.SH', 'NKF4.SM']]]],
    ['Radio', [['RC inputs', ['RCIN.C1', 'RCIN.C2', 'RCIN.C3', 'RCIN.C4']], ['Motor outputs', ['RCOU.C1', 'RCOU.C2', 'RCOU.C3', 'RCOU.C4']], ['Throttle', ['CTUN.ThO', 'CTUN.ThI', 'CTUN.ThH']]]],
  ];
  const resolveKey = (k) => {
    if (k[0] === '=') return k;
    const i = k.lastIndexOf('.'), msg = U.findMsg(LOG, k.slice(0, i)), f = k.slice(i + 1);
    return msg && msg.cols.includes(f) ? `${msg.name}.${f}` : null;
  };
  const presetKeys = (keys) => keys.map(resolveKey).filter((k) => k && (k[0] !== '=' || (() => { try { U.evalExpr(LOG, k.slice(1)); return true; } catch (e) { return false; } })()));
  function applyPreset(keys) { lvs.sel = presetKeys(keys); }
  const MODE_HUE = {};
  const modeColor = (name, a = 1) => {
    if (MODE_HUE[name] == null) { let h = 0; for (const ch of name) h = (h * 37 + ch.charCodeAt(0)) % 360; MODE_HUE[name] = h; }
    return `hsla(${MODE_HUE[name]} 75% ${S.theme === 'dark' ? 62 : 45}% / ${a})`;
  };

  // everything derived from the loaded log once
  function lvPrepare() {
    const modes = U.logModes(LOG), ev = U.logEvents(LOG), track = U.logTrack(LOG), params = U.logParams(LOG);
    let t0 = Infinity, t1 = -Infinity;
    for (const m of Object.values(LOG.msgs)) { if (!m.count || !m.cols.some((c) => /^Time(US|MS)$|^time$/.test(c))) continue; const t = m.time(); if (t.length) { t0 = Math.min(t0, t[0]); t1 = Math.max(t1, t[t.length - 1]); } }
    if (!isFinite(t0)) { t0 = 0; t1 = 1; }
    const segs = modes.map((m, i) => ({ name: m.name, a: m.t, b: i + 1 < modes.length ? modes[i + 1].t : t1 }));
    LV = { modes, segs, ev, track, params, t0, t1, att: U.findMsg(LOG, 'ATT') };
    lvs.cursor = t0;
  }
  function lvModeTable() {
    const mc = LV.mc = U.modeCruise(LOG, LV.segs), fwDesign = P().type !== 'multirotor';
    if (!mc) return `<div class="legend" id="lvModes">${[...new Set(LV.segs.map((s) => s.name))].map((n) => `<span><i style="background:${modeColor(n)}"></i>${esc(n)}</span>`).join('')}</div>`;
    return `<div class="tbl-wrap" style="margin-top:10px"><table class="mis" id="lvModes"><thead><tr><th>Flight mode</th><th class="n">Time</th><th class="n">Cruising</th><th class="n">Avg cruise speed</th><th class="n">Avg cruise current</th><th class="n">Avg cruise power</th>${fwDesign ? '<th></th>' : ''}</tr></thead><tbody>
      ${mc.rows.map((r, i) => `<tr><td><i class="dot" style="background:${modeColor(r.name)}"></i>${esc(r.name)}</td><td class="n">${fmtT(r.time)}</td><td class="n">${r.cruise ? fmtT(r.cruise) : '<span class="faint">—</span>'}</td><td class="n">${fin(r.v) ? `${fmt(r.v, 1)} m/s` : '<span class="faint">—</span>'}</td><td class="n">${fin(r.i) ? `${fmt(r.i, 1)} A` : '<span class="faint">—</span>'}</td><td class="n">${fin(r.p) ? `${fmt(r.p, 0)} W` : '<span class="faint">—</span>'}</td>${fwDesign ? `<td>${fin(r.v) && fin(r.i) && r.cruise > 30 ? `<button class="btn sm" data-lv="cal" data-i="${i}" title="Use this as the measured cruise point of ${esc(P().name)}">Calibrate ${esc(P().name)}</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div><p class="hint">Cruising = armed, moving faster than 3 m/s and holding altitude within 1 m/s. Speed is ${mc.src}${mc.src === 'ground speed' ? ' (no airspeed sensor logged, so wind is included)' : ''}.</p>
      <div class="row" style="margin-top:6px"><button class="btn sm" data-lv="mission"${LV.track ? '' : ' disabled'}>Build ${esc(P().name)}'s mission profile from this flight</button></div>`;
  }
  const modeAt = (t) => { let n = null; for (const s of LV.segs) if (s.a <= t) n = s.name; return n; };
  function valAt(key, t) {
    const i = key.lastIndexOf('.'), m = LOG.msgs[key.slice(0, i)] || U.findMsg(LOG, key.slice(0, i));
    if (!m || !m.cols.includes(key.slice(i + 1))) return null;
    const k = U.idxAt(m.time(), t);
    return k < 0 ? null : m.col(key.slice(i + 1))[k];
  }

  function renderLogs(el) {
    if (!lvs.inited) { lvs.speed = S.settings.logs.speed; lvs.view = S.settings.logs.view; lvs.inited = true; }
    if (!LOG) { LOG = U.sampleLog(); LOG.name = 'Synthetic sample flight'; lvPrepare(); applyPreset(['BAT.Volt', 'BAT.Curr']); }
    el.innerHTML = `<div class="stack" id="lvRoot">
      <div class="drop" id="drop">
        <div class="grow"><b>${esc(LOG.name || 'Log')}</b> <span class="pill ${LOG.sample ? 'warn' : 'good'}">${esc(LOG.source)}</span>
          <div class="note">Drop an ArduPilot <b>.bin</b> / <b>.log</b> or a <b>.csv</b>. Files stay in your browser.${logErr ? ` <span style="color:var(--crit)">${esc(logErr)}</span>` : ''}</div></div>
        <div class="row"><button class="btn sm" data-lv="csv">Export plotted CSV</button><button class="btn sm" data-lv="kml"${LV.track ? '' : ' disabled'}>Export KML track</button>
        <label class="btn primary">Open log<input type="file" id="logFile" accept=".bin,.BIN,.log,.LOG,.csv,.txt" hidden></label></div>
      </div>
      <div class="readouts" id="logRo"></div>
      <div class="lv">
        <aside class="card lv-side">
          <div class="seg" role="tablist" style="width:100%;margin-bottom:10px">${[['plot', 'Plot'], ['params', `Params ${LV.params.length || ''}`], ['events', `Events ${LV.ev.length || ''}`]].map(([k, l]) => `<button data-lvside="${k}" aria-pressed="${lvs.side === k}" style="flex:1">${l}</button>`).join('')}</div>
          <div id="lvSide"></div>
        </aside>
        <section class="lv-main">
          <div class="lv-top">
            <div class="card lv-viewcard">
              <div class="card-h"><div class="seg">${[['3d', '3D'], ['map', 'Map']].map(([k, l]) => `<button data-lvview="${k}" aria-pressed="${lvs.view === k}">${l}</button>`).join('')}</div><p id="lvViewNote">${LV.track ? `${esc(LV.track.src)} · drag to rotate · scroll to zoom` : 'No position data in this log'}</p></div>
              <div class="lv-view"><canvas id="lv3d"${lvs.view === '3d' ? '' : ' hidden'}></canvas><div id="lvMap"${lvs.view === 'map' ? '' : ' hidden'}></div></div>
              ${lvModeTable()}
            </div>
            <div class="card lv-hud"><canvas id="lvHorizon" width="200" height="200"></canvas><dl class="kv" id="lvData"></dl></div>
          </div>
          <div class="card">
            <div class="lv-time">
              <button class="btn sm icon" data-lv="play" id="lvPlay" aria-label="Play or pause">${lvs.playing ? '<svg class="i"><use href="#i-pause"/></svg>' : '<svg class="i"><use href="#i-play"/></svg>'}</button>
              <select id="lvSpeed" aria-label="Playback speed" style="width:auto">${[1, 2, 5, 10, 20, 50].map((x) => `<option value="${x}"${x === lvs.speed ? ' selected' : ''}>${x}×</option>`).join('')}</select>
              <input type="range" id="lvTime" min="${LV.t0}" max="${LV.t1}" step="0.1" value="${lvs.cursor}" aria-label="Time">
              <span class="num muted" id="lvClock"></span>
            </div>
            <div class="chart" id="chLog" style="margin-top:8px"></div>
            <p class="hint" style="margin-top:6px">Drag on the plot to zoom · double-click to reset · shaded bands are flight modes · red ticks are errors</p>
          </div>
        </section>
      </div></div>`;
    lvSide();
    logSummary();
    logChart();
    lvDraw();
  }

  function lvSide() {
    const box = $('#lvSide');
    if (!box) return;
    if (lvs.side === 'plot') {
      const presets = PRESET_GROUPS.map(([g, items]) => {
        const ok = items.filter(([, keys]) => presetKeys(keys).length);
        return ok.length ? `<div class="lv-pg"><h3>${g}</h3><div class="chips">${ok.map(([n, keys]) => `<button class="chip lv-chip" data-lvpreset="${esc(JSON.stringify(keys))}">${esc(n)}</button>`).join('')}</div></div>` : '';
      }).join('');
      const names = Object.keys(LOG.msgs).sort(), q = lvs.filter;
      const tree = names.filter((n) => !q || n.toLowerCase().includes(q) || LOG.msgs[n].cols.some((c) => c.toLowerCase().includes(q))).map((n) => {
        const m = LOG.msgs[n];
        const fields = m.cols.filter((c) => !/^Time(US|MS)$|^time$/.test(c) && !(m.fmt && 'nNZ'.includes(m.fmt[m.cols.indexOf(c)])) && n !== 'MSG' && n !== 'PARM');
        if (!fields.length) return '';
        const open = lvs.sel.some((k) => k.startsWith(n + '.')) || !!q;
        return `<details${open ? ' open' : ''}><summary>${esc(n)} <span>${m.count}</span></summary>${fields.map((f) => `<label><input type="checkbox" data-logfield="${esc(n)}.${esc(f)}"${lvs.sel.includes(`${n}.${f}`) ? ' checked' : ''}>${esc(f)}</label>`).join('')}</details>`;
      }).join('');
      box.innerHTML = `<div class="lv-presets">${presets}</div>
        <label class="f" style="margin-top:10px"><span>Expression (e.g. BAT.Volt * BAT.Curr, ATT.DesRoll - ATT.Roll, abs(...), deg(...))</span>
          <div class="in"><input type="text" id="lvExpr" placeholder="ATT.DesRoll - ATT.Roll"><button class="btn sm" data-lv="expr">Plot</button></div></label>
        <p class="hint" id="lvExprErr"></p>
        <div class="row" style="justify-content:space-between;margin:8px 0 6px"><h3>Messages</h3><button class="btn ghost sm" data-lv="clear">Clear plot</button></div>
        <input type="search" id="logSearch" placeholder="Filter messages / fields" value="${esc(lvs.filter)}">
        <div class="tree-msgs" style="margin-top:6px">${tree || '<p class="faint">No matches.</p>'}</div>`;
    } else if (lvs.side === 'params') {
      const q = lvs.paramQ.toLowerCase(), rows = LV.params.filter((p) => !q || p.name.toLowerCase().includes(q));
      box.innerHTML = LV.params.length ? `<div class="row" style="margin-bottom:8px"><input type="search" id="lvParamQ" placeholder="Search parameters" value="${esc(lvs.paramQ)}" style="flex:1"><button class="btn sm" data-lv="params">Save .param</button></div>
        <div class="tree-msgs"><table class="lv-params"><tbody>${rows.map((p) => `<tr><td>${esc(p.name)}${p.changes ? ' <span class="pill warn" title="Changed during the log">±' + p.changes + '</span>' : ''}</td><td class="n">${fmt(p.value, Number.isInteger(p.value) ? 0 : 4)}</td></tr>`).join('')}</tbody></table></div>
        <p class="hint">${rows.length} of ${LV.params.length}. ± marks parameters changed during the log.</p>` : '<p class="faint">No PARM records in this log.</p>';
    } else {
      const K = { mode: 'Modes', msg: 'Messages', err: 'Errors', ev: 'Events' };
      const rows = LV.ev.filter((e) => lvs.evKinds[e.kind]);
      box.innerHTML = `<div class="chips" style="margin-bottom:8px">${Object.entries(K).map(([k, l]) => `<label class="chip"><input type="checkbox" data-lvkind="${k}"${lvs.evKinds[k] ? ' checked' : ''}> ${l}</label>`).join('')}</div>
        <div class="msglist lv-events" style="max-height:560px">${rows.map((e) => `<button class="lv-ev ${e.kind}${e.kind === 'err' && !e.ok ? ' bad' : ''}" data-lvjump="${e.t}"><span>${fmtT(e.t - LV.t0)}</span>${e.kind === 'mode' ? `<i style="background:${modeColor(e.text.replace('Mode → ', ''))}"></i>` : ''}${esc(e.text)}</button>`).join('') || '<p class="faint">Nothing to show.</p>'}</div>`;
    }
  }
  const fmtT = (s) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

  function logSummary() {
    const s = U.logSummary(LOG), p = P(), R = U.compute(p, S.lib, { lite: true });
    const proj = s.avgP ? (R.bat.usableWh / s.avgP) * 60 : null;
    const pred = U.enduranceOf(p, R);
    let h = ro('Duration', fmtT(s.duration), '', `${fmt(s.duration, 0)} s`, '', true);
    if (fin(s.altMax)) h += ro('Max altitude', fmt(s.altMax, 1), 'm', 'CTUN.Alt');
    if (fin(s.spdMax)) h += ro('Max ground speed', fmt(s.spdMax, 1), 'm/s', 'GPS.Spd');
    if (fin(s.vMin)) h += ro('Voltage', fmt(s.vMin, 2), 'V min', `start ${fmt(s.vStart, 2)} V`);
    if (fin(s.iMax)) h += ro('Max current', fmt(s.iMax, 1), 'A', fin(s.mAh) ? `${fmt(s.mAh, 0)} mAh used` : '');
    if (fin(s.avgP)) h += ro('Avg power (armed)', fmt(s.avgP, 0), 'W', 'BAT.Volt × BAT.Curr');
    if (fin(proj)) h += ro('Projected endurance', fmt(proj, 1), 'min', `${esc(p.name)} pack at this power`, '', true);
    if (fin(proj) && fin(pred)) { const d = (pred / proj - 1) * 100; h += ro('Design vs log', `${d >= 0 ? '+' : ''}${fmt(d, 0)}`, '%', `design predicts ${fmt(pred, 1)} min`, Math.abs(d) > 20 ? 'warn' : 'good'); }
    if (fin(s.vibeMax)) h += ro('Peak vibration', fmt(s.vibeMax, 0), 'm/s²', 'keep under 30', lvl(s.vibeMax, 30, 60));
    const nErr = LV.ev.filter((e) => e.kind === 'err' && !e.ok).length;
    h += ro('Errors', String(nErr), '', nErr ? 'see Events' : 'none logged', nErr ? 'crit' : 'good');
    $('#logRo').innerHTML = h;
  }

  // plot: one colored axis per unit group, mode bands behind, error ticks on top
  function lvSeries() {
    const out = [];
    for (const k of lvs.sel) {
      if (k[0] === '=') { try { const r = U.evalExpr(LOG, k.slice(1)); out.push({ key: k, label: k.slice(1), t: r.t, y: r.y }); } catch (e) { /* field missing in this log */ } continue; }
      const i = k.lastIndexOf('.'), m = LOG.msgs[k.slice(0, i)];
      if (m) out.push({ key: k, label: k, t: m.time(), y: m.col(k.slice(i + 1)) });
    }
    return out;
  }
  const scaleKey = (k) => (k[0] === '=' ? 'e:' + k : k.slice(k.lastIndexOf('.') + 1).replace(/^Des/, '').replace(/^C\d+$/, 'C').replace(/^Vibe[XYZ]$/, 'Vibe').replace(/^Clip\d?$/, 'Clip').replace(/^(SV|SP|SH|SM)$/, 'Innov').replace(/Des$/, ''));
  function logChart() {
    const ser = lvSeries();
    if (!ser.length) { if (charts.chLog) { charts.chLog.destroy(); delete charts.chLog; } $('#chLog').innerHTML = '<div class="empty">Pick a preset or fields on the left.</div>'; return; }
    const data = window.uPlot ? uPlot.join(ser.map((s) => [s.t, s.y])) : [];
    const scales = [...new Set(ser.map((s) => scaleKey(s.key)))];
    const colorOf = (i) => cssv(`--c${(i % 8) + 1}`);
    const axes = scales.slice(0, 4).map((sc, i) => {
      const first = ser.findIndex((s) => scaleKey(s.key) === sc);
      return { scale: sc, label: ser.filter((s) => scaleKey(s.key) === sc).map((s) => s.label.split('.').pop()).join(', '), color: colorOf(first) };
    });
    const under = (uu) => {
      const ctx = uu.ctx, bb = uu.bbox, dpr = devicePixelRatio || 1;
      ctx.save();
      for (const sg of LV.segs) {
        const x0 = Math.max(bb.left, uu.valToPos(sg.a, 'x', true)), x1 = Math.min(bb.left + bb.width, uu.valToPos(sg.b, 'x', true));
        if (x1 > x0) { ctx.fillStyle = modeColor(sg.name, 0.09); ctx.fillRect(x0, bb.top, x1 - x0, bb.height); }
      }
      ctx.fillStyle = cssv('--crit');
      for (const e of LV.ev) if (e.kind === 'err' && !e.ok) { const x = uu.valToPos(e.t, 'x', true); if (x >= bb.left && x <= bb.left + bb.width) ctx.fillRect(x - dpr, bb.top, 2 * dpr, 10 * dpr); }
      ctx.restore();
    };
    const u = chart('chLog', {
      xLabel: 'Time (s)', h: 300, data, xDec: 1,
      axes: axes.map((a) => ({ scale: a.scale, label: a.label, color: a.color })), under,
      series: ser.map((s, i) => ({ label: s.label, color: colorOf(i), scale: scaleKey(s.key), w: 1.25, dec: 2 })),
      marks: [],
      onCursor: (uu) => { if (lvs.playing) return; const t = uu.posToVal(uu.cursor.left, 'x'); if (fin(t) && uu.cursor.left >= 0) lvSetTime(t, false); },
    });
  }

  function lvSetTime(t, movePlot = true) {
    lvs.cursor = Math.min(LV.t1, Math.max(LV.t0, t));
    const r = $('#lvTime'); if (r) r.value = lvs.cursor;
    const c = $('#lvClock'); if (c) c.textContent = `${fmtT(lvs.cursor - LV.t0)} / ${fmtT(LV.t1 - LV.t0)}`;
    const u = charts.chLog;
    if (movePlot && u) {
      const [a, b] = [u.scales.x.min, u.scales.x.max];
      if (lvs.cursor < a || lvs.cursor > b) { const w = b - a; u.setScale('x', { min: Math.max(LV.t0, lvs.cursor - w * 0.1), max: Math.max(LV.t0, lvs.cursor - w * 0.1) + w }); }
      u.setCursor({ left: u.valToPos(lvs.cursor, 'x'), top: u.cursor.top > 0 ? u.cursor.top : 20 }, false);
    }
    lvDraw();
  }

  // attitude, mode and data at the cursor
  function lvHud() {
    const cv = $('#lvHorizon'), t = lvs.cursor;
    if (!cv) return;
    const roll = valAt('ATT.Roll', t) || 0, pitch = valAt('ATT.Pitch', t) || 0, yaw = valAt('ATT.Yaw', t);
    const dpr = devicePixelRatio || 1, W = cv.clientWidth || 200, H = cv.clientHeight || 200;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const r = Math.min(W, H) / 2 - 4, cx = W / 2, cy = H / 2;
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
    x.translate(cx, cy); x.rotate((-roll * Math.PI) / 180);
    const off = (pitch / 45) * r;
    x.fillStyle = '#2f6fa8'; x.fillRect(-2 * r, -2 * r + off, 4 * r, 2 * r);
    x.fillStyle = '#7a5531'; x.fillRect(-2 * r, off, 4 * r, 2 * r);
    x.strokeStyle = '#fff'; x.lineWidth = 1; x.font = '10px "Roboto Mono"'; x.fillStyle = '#fff';
    for (let a = -30; a <= 30; a += 10) { if (!a) continue; const y = off - (a / 45) * r, w = a % 20 ? 12 : 24; x.beginPath(); x.moveTo(-w, y); x.lineTo(w, y); x.stroke(); }
    x.beginPath(); x.moveTo(-2 * r, off); x.lineTo(2 * r, off); x.lineWidth = 2; x.stroke();
    x.restore();
    x.strokeStyle = cssv('--accent'); x.lineWidth = 3;
    x.beginPath(); x.moveTo(cx - 34, cy); x.lineTo(cx - 10, cy); x.lineTo(cx, cy + 8); x.lineTo(cx + 10, cy); x.lineTo(cx + 34, cy); x.stroke();
    x.strokeStyle = cssv('--line-2'); x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    const mode = modeAt(t), alt = valAt('CTUN.Alt', t) ?? valAt('BARO.Alt', t), spd = valAt('GPS.Spd', t), as = valAt('ARSP.Airspeed', t);
    const v = valAt('BAT.Volt', t), a = valAt('BAT.Curr', t), thr = valAt('CTUN.ThO', t);
    const row = (k, val) => (val == null || val === '' ? '' : `<dt>${k}</dt><dd>${val}</dd>`);
    $('#lvData').innerHTML = row('Time', fmtT(t - LV.t0)) + row('Mode', mode ? `<span style="color:${modeColor(mode)}">${esc(mode)}</span>` : '—')
      + row('Roll / pitch', `${fmt(roll, 0)}° / ${fmt(pitch, 0)}°`) + row('Heading', fin(yaw) ? `${fmt(yaw, 0)}°` : '') + row('Altitude', fin(alt) ? `${fmt(alt, 1)} m` : '')
      + row('Ground speed', fin(spd) ? `${fmt(spd, 1)} m/s` : '') + row('Airspeed', fin(as) ? `${fmt(as, 1)} m/s` : '') + row('Battery', fin(v) ? `${fmt(v, 2)} V${fin(a) ? ` · ${fmt(a, 1)} A` : ''}` : '')
      + row('Throttle', fin(thr) ? `${fmt(thr * (thr <= 1 ? 100 : 1), 0)} %` : '');
  }

  // orbit-camera 3D path, colored by mode, with a ground shadow and the aircraft at the cursor
  function lv3d() {
    const cv = $('#lv3d'), tr = LV.track;
    if (!cv || cv.hidden) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
    if (!tr) { x.fillStyle = cssv('--faint'); x.font = '13px "Barlow"'; x.fillText('No GPS or POS position in this log.', 16, 28); return; }
    const n = tr.e.length, step = Math.max(1, Math.floor(n / 4000));
    let mnE = Infinity, mxE = -Infinity, mnN = Infinity, mxN = -Infinity, mxU = -Infinity, mnU = Infinity;
    for (let i = 0; i < n; i++) { mnE = Math.min(mnE, tr.e[i]); mxE = Math.max(mxE, tr.e[i]); mnN = Math.min(mnN, tr.n[i]); mxN = Math.max(mxN, tr.n[i]); mxU = Math.max(mxU, tr.u[i]); mnU = Math.min(mnU, tr.u[i]); }
    const span = Math.max(mxE - mnE, mxN - mnN, (mxU - mnU) * 2, 20), ce = (mnE + mxE) / 2, cn = (mnN + mxN) / 2, gz = Math.min(0, mnU);
    const { yaw, pitch, zoom } = lvs.cam, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dist = span * 1.6 / zoom, f = Math.min(W, H) * 1.1;
    const P3 = (E, N, Uu) => {
      const a = E - ce, b = N - cn, z = Uu - (gz + (mxU - gz) / 3);
      const x1 = a * cyw - b * syw, y1 = a * syw + b * cyw;
      const yv = y1 * sp + z * cp, depth = y1 * cp - z * sp + dist;
      return [W / 2 + (f * x1) / depth, H / 2 - (f * yv) / depth, depth];
    };
    // ground grid
    const g = Math.pow(10, Math.floor(Math.log10(span / 5))), half = Math.ceil(span / 2 / g) * g * 1.1;
    x.strokeStyle = cssv('--grid'); x.lineWidth = 1;
    for (let v = -half; v <= half + 1e-6; v += g) {
      let a = P3(ce + v, cn - half, gz), b = P3(ce + v, cn + half, gz); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
      a = P3(ce - half, cn + v, gz); b = P3(ce + half, cn + v, gz); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    // shadow
    x.strokeStyle = cssv('--line-2'); x.lineWidth = 1.5; x.beginPath();
    for (let i = 0; i < n; i += step) { const q = P3(tr.e[i], tr.n[i], gz); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }
    x.stroke();
    // path by mode
    x.lineWidth = 2.5; x.lineJoin = 'round';
    let prev = null, col = null;
    for (let i = 0; i < n; i += step) {
      const q = P3(tr.e[i], tr.n[i], tr.u[i]), c = modeColor(modeAt(tr.t[i]) || 'none');
      if (prev) { if (c !== col) { x.stroke(); x.beginPath(); x.moveTo(prev[0], prev[1]); x.strokeStyle = c; col = c; } x.lineTo(q[0], q[1]); } else { x.beginPath(); x.moveTo(q[0], q[1]); x.strokeStyle = col = c; }
      prev = q;
    }
    x.stroke();
    // home + aircraft
    const h0 = P3(0, 0, gz); x.fillStyle = cssv('--good'); x.beginPath(); x.arc(h0[0], h0[1], 5, 0, 7); x.fill();
    x.fillStyle = cssv('--fg'); x.font = '600 11px "Barlow"'; x.fillText('H', h0[0] + 7, h0[1] + 4);
    const k = Math.max(0, U.idxAt(tr.t, lvs.cursor));
    const ac = [tr.e[k], tr.n[k], tr.u[k]], hd = ((valAt('ATT.Yaw', lvs.cursor) ?? 0) * Math.PI) / 180, s2 = span / 40;
    const gp = P3(ac[0], ac[1], gz), ap = P3(...ac);
    x.setLineDash([3, 3]); x.strokeStyle = cssv('--muted'); x.lineWidth = 1; x.beginPath(); x.moveTo(gp[0], gp[1]); x.lineTo(ap[0], ap[1]); x.stroke(); x.setLineDash([]);
    const pt = (fwd, rt) => P3(ac[0] + Math.sin(hd) * fwd + Math.cos(hd) * rt, ac[1] + Math.cos(hd) * fwd - Math.sin(hd) * rt, ac[2]);
    const tri = [pt(s2 * 1.6, 0), pt(-s2, s2), pt(-s2 * 0.4, 0), pt(-s2, -s2)];
    x.fillStyle = cssv('--accent'); x.strokeStyle = cssv('--bg'); x.lineWidth = 1.5;
    x.beginPath(); tri.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = cssv('--faint'); x.font = '11px "Roboto Mono"';
    x.fillText(uText(`grid ${g >= 1000 ? g / 1000 + ' km' : g + ' m'} · ${fmt(ac[2], 0)} m above start`), 10, H - 10);
  }

  // 2D map: Leaflet with OpenStreetMap tiles (works in the downloaded app; the shared viewer blocks tile images)
  let lmap = null, lmLayer = null, lmMarker = null, lmTileErr = 0;
  const loadLeaflet = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'L', 'map library');
  async function lvMap() {
    const box = $('#lvMap'), tr = LV.track;
    if (!box || box.hidden) return;
    if (!tr) { box.innerHTML = '<p class="faint" style="padding:16px">No position data in this log.</p>'; return; }
    let L;
    try { L = await loadLeaflet(); } catch (e) { box.innerHTML = `<p class="faint" style="padding:16px">${esc(e.message)}</p>`; return; }
    if (!lmap || lmap.getContainer() !== box) {
      if (lmap) lmap.remove();
      lmap = L.map(box, { zoomControl: true, attributionControl: true });
      lmTileErr = 0;
      const tileErr = () => { if (++lmTileErr === 3) $('#lvViewNote').textContent = 'Map tiles are blocked here. Open the downloaded app file to see them; the path still shows.'; };
      const bases = {
        Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).on('tileerror', tileErr),
        Street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).on('tileerror', tileErr),
      };
      const pick = bases[S.settings.logs.map] ? S.settings.logs.map : 'Satellite';
      bases[pick].addTo(lmap);
      L.control.layers(bases, null, { position: 'topright', collapsed: false }).addTo(lmap);
      lmap.on('baselayerchange', (e) => { S.settings.logs.map = e.name; save(); });
      lmap.invalidateSize();
      lmap.fitBounds(L.latLngBounds(tr.lat.map((a, i) => [a, tr.lng[i]])), { padding: [20, 20] }); // the map needs a view before paths are added
      lmLayer = L.layerGroup().addTo(lmap);
      const n = tr.lat.length, step = Math.max(1, Math.floor(n / 3000));
      let run = [], cur = null;
      const flush = () => { if (run.length > 1) { L.polyline(run, { color: '#111', weight: 7, opacity: 0.55 }).addTo(lmLayer); L.polyline(run, { color: modeColor(cur), weight: 4, opacity: 1 }).addTo(lmLayer); } }; // dark casing keeps the path readable on any map
      for (let i = 0; i < n; i += step) {
        const m = modeAt(tr.t[i]) || 'none';
        if (m !== cur) { flush(); run = run.length ? [run[run.length - 1]] : []; cur = m; }
        run.push([tr.lat[i], tr.lng[i]]);
      }
      flush();
      L.circleMarker([tr.lat[0], tr.lng[0]], { radius: 6, color: '#111', weight: 2, fillColor: cssv('--good'), fillOpacity: 1 }).bindTooltip('Home').addTo(lmLayer);
      L.circleMarker([tr.lat[n - 1], tr.lng[n - 1]], { radius: 6, color: '#111', weight: 2, fillColor: cssv('--crit'), fillOpacity: 1 }).bindTooltip('End').addTo(lmLayer);
      lmMarker = L.circleMarker([tr.lat[0], tr.lng[0]], { radius: 7, color: cssv('--bg'), weight: 2, fillColor: cssv('--accent'), fillOpacity: 1 }).addTo(lmap);
    }
    const k = Math.max(0, U.idxAt(tr.t, lvs.cursor));
    lmMarker.setLatLng([tr.lat[k], tr.lng[k]]);
  }

  function lvDraw() { if (!LV || S.tab !== 'logs') return; lv3d(); lvHud(); convertDom($('#lvData')); if (lvs.view === 'map') lvMap(); const c = $('#lvClock'); if (c) c.textContent = `${fmtT(lvs.cursor - LV.t0)} / ${fmtT(LV.t1 - LV.t0)}`; }

  let lvLast = 0;
  function lvTick(ts) {
    if (!lvs.playing || S.tab !== 'logs') { lvs.playing = false; return; }
    const dt = lvLast ? (ts - lvLast) / 1000 : 0;
    lvLast = ts;
    lvSetTime(lvs.cursor + dt * lvs.speed);
    if (lvs.cursor >= LV.t1) { lvs.playing = false; const b = $('#lvPlay'); if (b) b.innerHTML = '<svg class="i"><use href="#i-play"/></svg>'; return; }
    requestAnimationFrame(lvTick);
  }

  function lvExport(kind) {
    if (kind === 'csv') {
      const ser = lvSeries();
      if (!ser.length) return toast('Plot something first.');
      const d = uPlot.join(ser.map((s) => [s.t, s.y]));
      const rows = [['time_s'].concat(ser.map((s) => s.label))];
      for (let i = 0; i < d[0].length; i++) rows.push(d.map((col) => (col[i] == null ? '' : +(+col[i]).toFixed(6))));
      download(`${(LOG.name || 'log').replace(/\.\w+$/, '')}-plot.csv`, csvOf(rows), 'text/csv');
    } else if (kind === 'kml') {
      const tr = LV.track, alt0 = (valAt('GPS.Alt', tr.t[0]) ?? 0) - tr.u[0];
      const coords = tr.lat.map((a, i) => `${tr.lng[i].toFixed(7)},${a.toFixed(7)},${(alt0 + tr.u[i]).toFixed(1)}`).join(' ');
      download(`${(LOG.name || 'log').replace(/\.\w+$/, '')}.kml`, `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(LOG.name || 'Flight')}</name><Placemark><name>Flight path</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark></Document></kml>`, 'application/vnd.google-earth.kml+xml');
    } else if (kind === 'params') {
      const text = LV.params.map((p) => `${p.name},${p.value}`).join('\n');
      download(`${(LOG.name || 'log').replace(/\.\w+$/, '')}.param`, text, 'text/plain');
    }
  }

  // viewer events (delegated, scoped to the logs tab)
  document.addEventListener('click', (e) => {
    if (S.tab !== 'logs') return;
    const b = e.target.closest('[data-lv],[data-lvside],[data-lvview],[data-lvpreset],[data-lvjump]');
    if (!b) return;
    if (b.dataset.lvside) { lvs.side = b.dataset.lvside; document.querySelectorAll('[data-lvside]').forEach((x) => x.setAttribute('aria-pressed', x === b)); lvSide(); return; }
    if (b.dataset.lvview) { lvs.view = b.dataset.lvview; document.querySelectorAll('[data-lvview]').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#lv3d').hidden = lvs.view !== '3d'; $('#lvMap').hidden = lvs.view !== 'map'; $('#lvViewNote').textContent = LV.track ? `${LV.track.src} · ${lvs.view === 'map' ? 'drag to pan · scroll to zoom' : 'drag to rotate · scroll to zoom'}` : 'No position data in this log'; lvDraw(); if (lmap) setTimeout(() => lmap.invalidateSize(), 50); return; }
    if (b.dataset.lvpreset) { applyPreset(JSON.parse(b.dataset.lvpreset)); lvSide(); logChart(); return; }
    if (b.dataset.lvjump) { lvSetTime(+b.dataset.lvjump); return; }
    const a = b.dataset.lv;
    if (a === 'play') { lvs.playing = !lvs.playing; b.innerHTML = lvs.playing ? '<svg class="i"><use href="#i-pause"/></svg>' : '<svg class="i"><use href="#i-play"/></svg>'; if (lvs.playing) { if (lvs.cursor >= LV.t1) lvs.cursor = LV.t0; lvLast = 0; requestAnimationFrame(lvTick); } }
    if (a === 'clear') { lvs.sel = []; lvSide(); logChart(); }
    if (a === 'cal') {
      const r = LV.mc.rows[+b.dataset.i], p = P(), R = U.compute(p, S.lib, { lite: true });
      const prop = Math.max(0.1, r.i - R.pAv / R.bat.V); // the calibration point is propulsion current only
      withUndo(`${p.name} calibrated from ${r.name}: ${fmt(r.v, 1)} m/s, ${fmt(prop, 1)} A propulsion (${fmt(r.i, 1)} A total minus ${fmt(R.pAv / R.bat.V, 1)} A electronics)`, () => {
        p.fw.cal = Object.assign({}, p.fw.cal, { on: true, v: +r.v.toFixed(1), a: +prop.toFixed(2), g: Math.round(R.Wg) });
      });
      if (LV.mc.src === 'ground speed') setTimeout(() => toast('Calibrated from ground speed: wind on the day is baked in. An airspeed sensor log gives a cleaner point.'), 2500);
    }
    if (a === 'mission') {
      const p = P(), m = U.missionFromLog(LOG, LV.segs, LV.track, p.type);
      if (!m || !m.segs.length) { toast('Could not find climb, cruise or hover segments in this log.'); return; }
      withUndo(`${p.name}: mission rebuilt from ${LOG.name || 'the log'} (${m.segs.length} segments). See Design → Mission profile.`, () => {
        Object.assign(p.mission, { segs: m.segs, logWh: m.wh != null ? +m.wh.toFixed(1) : null, logName: LOG.name || 'flight log' });
      });
    }
    if (a === 'expr') {
      const v = $('#lvExpr').value.trim();
      try { U.evalExpr(LOG, v); lvs.sel = lvs.sel.concat('=' + v).slice(-8); $('#lvExprErr').textContent = ''; logChart(); } catch (err) { $('#lvExprErr').innerHTML = `<span style="color:var(--crit)">${esc(err.message)}</span>`; }
    }
    if (a === 'csv' || a === 'kml' || a === 'params') lvExport(a);
  });
  document.addEventListener('input', (e) => {
    if (S.tab !== 'logs') return;
    const el = e.target;
    if (el.id === 'lvTime') { lvs.playing = false; const pb = $('#lvPlay'); if (pb) pb.innerHTML = '<svg class="i"><use href="#i-play"/></svg>'; lvSetTime(+el.value); }
    else if (el.id === 'lvSpeed') lvs.speed = +el.value;
    else if (el.id === 'lvParamQ') { lvs.paramQ = el.value; const pos = el.selectionStart; lvSide(); const q = $('#lvParamQ'); q.focus(); q.setSelectionRange(pos, pos); }
    else if (el.id === 'logSearch') { lvs.filter = el.value.toLowerCase(); const pos = el.selectionStart; lvSide(); const q = $('#logSearch'); q.focus(); q.setSelectionRange(pos, pos); }
    else if (el.dataset.logfield) { const k = el.dataset.logfield; lvs.sel = el.checked ? lvs.sel.concat(k).slice(-8) : lvs.sel.filter((x) => x !== k); logChart(); }
    else if (el.dataset.lvkind) { lvs.evKinds[el.dataset.lvkind] = el.checked; lvSide(); }
  });
  document.addEventListener('keydown', (e) => { if (S.tab === 'logs' && e.key === 'Enter' && e.target.id === 'lvExpr') { e.preventDefault(); const b = document.querySelector('[data-lv="expr"]'); if (b) b.click(); } });
  let lvDrag = null;
  document.addEventListener('pointerdown', (e) => { if (e.target.id === 'lv3d') { lvDrag = [e.clientX, e.clientY]; e.target.setPointerCapture(e.pointerId); } });
  document.addEventListener('pointermove', (e) => { if (!lvDrag) return; lvs.cam.yaw += (e.clientX - lvDrag[0]) * 0.008; lvs.cam.pitch = Math.max(0.08, Math.min(1.5, lvs.cam.pitch + (e.clientY - lvDrag[1]) * 0.008)); lvDrag = [e.clientX, e.clientY]; lv3d(); });
  document.addEventListener('pointerup', () => { lvDrag = null; });
  document.addEventListener('wheel', (e) => { if (e.target.id !== 'lv3d') return; e.preventDefault(); lvs.cam.zoom = Math.max(0.3, Math.min(8, lvs.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); lv3d(); }, { passive: false });

  function loadLogFile(file) {
    logErr = '';
    const isBin = /\.bin$/i.test(file.name);
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const lg = isBin ? U.parseBin(rd.result) : U.parseText(rd.result);
        if (!Object.keys(lg.msgs).length) throw new Error('No records found. Is this a DataFlash log?');
        LOG = lg; LOG.name = file.name;
        lvs.playing = false; lvs.cam = { yaw: -0.7, pitch: 0.6, zoom: 1 };
        if (lmap) { lmap.remove(); lmap = null; }
        lvPrepare();
        lvs.sel = [];
        for (const [, items] of PRESET_GROUPS) for (const [n, keys] of items) if (!lvs.sel.length && /Voltage|Roll vs/.test(n)) applyPreset(keys);
        if (!lvs.sel.length) { const m = Object.values(LOG.msgs)[0]; lvs.sel = m.cols.filter((c) => !/^Time/.test(c)).slice(0, 2).map((c) => `${m.name}.${c}`); }
      } catch (e) { logErr = `Could not read ${file.name}: ${e.message}`; }
      render();
    };
    rd.onerror = () => { logErr = 'The browser could not read that file.'; render(); };
    if (isBin) rd.readAsArrayBuffer(file); else rd.readAsText(file);
  }

  // ---------- dialogs ----------
  function openDlg(title, body, foot) {
    const d = $('#dlg');
    d.innerHTML = `<div class="dlg-h"><h2>${title}</h2><button class="btn ghost sm" data-act="dlg-close" aria-label="Close">×</button></div><div class="dlg-b">${body}</div><div class="dlg-f">${foot}</div>`;
    if (!d.open) d.showModal();
  }
  function closeDlg() { const d = $('#dlg'); if (d.open) d.close(); }

  // ---------- export ----------
  const stamp = () => new Date().toISOString().slice(0, 10);
  const fileBase = (p) => `${p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'design'}-${stamp()}`;
  // inside claude.ai the page cannot start downloads itself; the viewer's `downloads` capability shows a save prompt instead
  async function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads').catch(() => null);
      if (dl) {
        try { await dl.save({ filename: name, data: blob }); toast(`Saved ${name}`); }
        catch (e) {
          if (e && e.code === 'declined') return;
          toast(e && e.code === 'rejected_extension' ? `This viewer can't save .${name.split('.').pop()} files. Use the downloaded app for this one.` : 'Saving is not available here. Use a Copy button or the downloaded app.');
        }
        return;
      }
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`Saved ${name}`);
    } catch (e) { toast('Download blocked here. Use a Copy button instead.'); }
  }
  const csvOf = (rows) => rows.map((r) => r.map((c) => { const s = c == null ? '' : String(c); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
  const tsvOf = (rows) => rows.map((r) => r.map((c) => (c == null ? '' : String(c).replace(/[\t\r\n]+/g, ' '))).join('\t')).join('\n');
  function copyText(text, label) {
    navigator.clipboard.writeText(text).then(() => toast(`${label} copied. Paste into Excel or Sheets.`), () => {
      openDlg('Copy', `<p class="note">Clipboard access is blocked here. Press Ctrl+C (⌘C) to copy.</p><textarea id="cpBox" rows="10" readonly>${esc(text)}</textarea>`, '<button class="btn" data-act="dlg-close">Done</button>');
      const b = $('#cpBox'); b.focus(); b.select();
    });
  }

  // every calculated number for one design: [Section, Parameter, Value, Unit]
  function calcRows(p) {
    const R = U.compute(p, S.lib), rows = [['Section', 'Parameter', 'Value', 'Unit']];
    const r4 = (v) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(4) : v ?? '');
    const add = (s, k, v, u = '') => rows.push([s, k, r4(v), u]);
    add('Design', 'Name', p.name); add('Design', 'Configuration', TYPE_LABEL[p.type] + (p.type === 'vtol' ? ` (${p.vtol.kind})` : '')); add('Design', 'Exported', new Date().toISOString());
    add('Environment', 'Altitude', p.env.alt, 'm'); add('Environment', 'Temperature', p.env.temp, '°C'); add('Environment', 'Air density', R.rho, 'kg/m³');
    add('Battery', 'Pack', p.batt.name); add('Battery', 'Chemistry', R.bat.chem.label); add('Battery', 'Pack layout', `${p.batt.s}S${p.batt.p || 1}P, ${p.batt.cellMah} mAh cells`);
    add('Battery', 'Packs on board', `${R.bat.packs} in ${p.batt.conn || 'parallel'}`); add('Battery', 'Total layout', `${R.bat.S}S${R.bat.P}P`);
    add('Battery', 'Capacity', R.bat.mah, 'mAh'); add('Battery', 'Nominal voltage', R.bat.V, 'V'); add('Battery', 'Voltage range', `${R.bat.vMin.toFixed(1)}–${R.bat.vMax.toFixed(1)}`, 'V');
    add('Battery', 'Energy', R.bat.Wh, 'Wh'); add('Battery', 'Usable energy', R.bat.usableWh, 'Wh'); add('Battery', 'Weight (all packs)', R.bat.g, 'g'); add('Battery', 'Max continuous current', R.bat.iMaxCont, 'A'); if (R.bat.peakSet) add('Battery', 'Peak (burst) current', R.bat.iMaxPeak, 'A');
    add('Mass', 'All-up weight', R.Wg, 'g'); add('Mass', 'Payload', p.payload.name + ': ' + (p.payload.g || 0), 'g');
    add('Mass', 'Battery fraction', (p.batt.g / R.Wg) * 100, '%'); add('Mass', 'Payload fraction', ((+p.payload.g || 0) / R.Wg) * 100, '%');
    for (const [s, g] of Object.entries(R.mass.bySub).sort((a, b) => b[1] - a[1])) add('Mass by subsystem', subName(s), g, 'g');
    { const c = U.costOf(p, S.lib); if (c) add('Mass', 'Parts cost', c, S.settings.currency || '$'); const cg = U.cgOf(p, S.lib); if (cg.x != null) add('Mass', p.type === 'multirotor' ? 'CG from frame centre' : 'CG', p.type === 'multirotor' ? cg.x : cg.pct, p.type === 'multirotor' ? 'mm' : '% MAC'); }
    add('Electronics', 'Power from flight pack', R.pAv, 'W');
    if (R.h) {
      const s = 'Lift propulsion';
      add(s, 'Motor + prop', R.h.set.name); add(s, 'Thrust data', R.h.set.physics ? 'physics estimate' : `bench, ${R.h.set.rows.length} points at ${R.h.set.v} V`);
      add(s, 'Motors', p.mr.n); add(s, 'Layout', U.LAYOUTS[p.mr.layout].label); add(s, 'Max thrust (total)', R.h.tmaxTot, 'g'); add(s, 'Thrust-to-weight', R.h.tw);
      add(s, 'Thrust per motor at hover', R.h.tPer, 'g'); add(s, 'Hover throttle', R.h.thr, '%'); add(s, 'Hover power', R.hoverP, 'W'); add(s, 'Hover current', R.hoverI, 'A');
      add(s, 'Hover time', R.hoverMin, 'min'); add(s, 'Hover efficiency', R.Wg / R.h.pMotors, 'g/W'); add(s, 'Full-throttle current per motor', R.h.iMaxMotor, 'A');
      add(s, 'Peak current (all)', R.maxI, 'A'); if (R.diskLoad) add(s, 'Disk loading', R.diskLoad, 'kg/m²');
      if (fin(R.payloadG) && p.type !== 'fixedwing') add(s, `Extra payload before ${p.mr.maxThr}% hover throttle`, R.payloadG, 'g');
    }
    if (p.type === 'multirotor' && R.bestRange) {
      add('Forward flight', 'Best range', R.bestRange.km, 'km'); add('Forward flight', 'Best range speed', R.bestRange.V, 'm/s');
      add('Forward flight', 'Best endurance', R.bestEnd.minutes, 'min'); add('Forward flight', 'Top speed (est.)', R.vmax, 'm/s'); add('Forward flight', 'Frame CdA', p.mr.cda, 'm²');
    }
    if (R.cruise) {
      const s = 'Fixed-wing';
      add(s, 'Wingspan', p.fw.span, 'm'); add(s, 'Wing area', p.fw.area, 'm²'); add(s, 'Aspect ratio', R.AR); add(s, 'CD0 at cruise', R.cd0); add(s, 'Oswald e', R.e); add(s, 'CL max', p.fw.clmax);
      add(s, 'Cruise L/D', R.LDcruise); add(s, 'Max L/D', R.LDmax);
      if (R.drag) for (const x of R.drag.parts) add('Drag build-up', x.name, x.cda * 1e4, 'cm²');
      add(s, 'Drag correction factor', R.kUsed); add(s, 'Correction source', R.kSource);
      add(s, 'Wing loading', R.wingLoad, 'kg/m²'); add(s, 'Stall speed', R.vs, 'm/s');
      if (R.cruiseSet) add(s, 'Cruise motor + prop', R.cruiseSet.name);
      add(s, 'Cruise speed', p.fw.vc, 'm/s'); add(s, 'Cruise CL', R.cruise.CL); add(s, 'Cruise power', R.cruise.P, 'W'); add(s, 'Cruise current', R.cruise.I, 'A');
      if (p.type === 'fixedwing') { add(s, 'Endurance at cruise', R.cruise.minutes, 'min'); add(s, 'Range at cruise', R.cruise.km, 'km'); if (fin(R.cruise.consKm)) { add(s, 'Endurance (conservative, +20 % power)', R.cruise.consMinutes, 'min'); add(s, 'Range (conservative, +20 % power)', R.cruise.consKm, 'km'); } add(s, 'Static thrust-to-weight', R.staticTW); }
      add(s, 'Best endurance speed', R.bestEnd.V, 'm/s'); add(s, 'Best range speed', R.bestRange.V, 'm/s');
      if (p.type === 'fixedwing') { add(s, 'Max endurance', R.bestEnd.minutes, 'min'); add(s, 'Max range', R.bestRange.km, 'km'); }
      add(s, 'Best climb rate', R.maxRoc, 'm/s'); if (R.vmaxLevel) add(s, 'Top speed (est.)', R.vmaxLevel, 'm/s');
      if (R.calK) add(s, 'Drag calibration factor', R.calK);
    }
    if (R.mission) {
      const s = 'VTOL mission';
      add(s, 'Hover time per sortie', p.vtol.hoverS, 's'); add(s, 'Extra reserve', p.vtol.reserve, '%'); add(s, 'Energy available', R.mission.eAvail, 'Wh');
      add(s, 'Hover energy', R.mission.eHover, 'Wh'); add(s, 'Cruise energy', R.mission.eCruise, 'Wh'); add(s, 'Cruise time', R.mission.minutes, 'min'); add(s, 'Mission range', R.mission.km, 'km');
    }
    const mp = U.missionPlan(p, S.lib, R);
    if (mp) {
      const s = 'Mission profile';
      add(s, 'Wind', p.mission.wind, 'm/s'); add(s, 'Extra reserve', p.mission.reserve, '%'); add(s, 'Energy available', mp.avail, 'Wh');
      for (const r of mp.rows) add(s, `${r.label} ${r.v} ${r.unit}${r.dir && r.dir !== 'none' ? ` (${r.dir}wind)` : ''}`, `${r.E.toFixed(1)} Wh${mp.consK > 1 ? ` (${r.Econs.toFixed(1)} conservative)` : ''}, ${(r.t / 60).toFixed(1)} min${r.err ? ' · ' + r.err : ''}`);
      add(s, 'Energy used', mp.consK > 1 ? mp.totalCons : mp.total, 'Wh'); add(s, 'Result', mp.ok ? 'fits' : mp.okNominal ? 'fits only in the nominal case' : 'does not fit');
    }
    const pl = U.powerPlan(p, S.lib, R);
    add('Power', 'Peak bus current', pl.totalPk, 'A'); add('Power', 'PDB rating', pl.pdbRating, 'A'); add('Power', 'Main connector', pl.mainConn[0]); add('Power', 'Main leads', pl.mainWire[0], 'AWG');
    for (const r of pl.rails) add('Power rails', r.rail === 'VBAT' ? 'Battery bus' : r.rail, `${r.kind}, ${r.avgW.toFixed(1)} W avg, ${r.peakW.toFixed(1)} W peak${r.rail !== 'VBAT' && r.rail !== 'Separate' ? `, ${r.rec} A regulator` : ''}`);
    for (const c of R.checks) add('Checks', { good: 'OK', warn: 'Check', crit: 'Fix', info: 'Note' }[c.level], c.msg);
    return { rows, R, pl };
  }
  function bomRowsFor(p) {
    const out = [['Subsystem', 'Item', 'Qty', 'Unit g', 'Total g', 'Rail', 'Avg W', 'Peak W', 'RF Freq', 'X mm', 'Unit cost', 'Total cost', 'Link', 'Buy link']];
    for (const r of U.fullBom(p, S.lib)) { const x = r.auto ? (p.cg.pos || {})[r.key] : r.x; out.push([subName(r.sub), r.name, r.qty, r.g, +(r.qty * r.g).toFixed(2), r.rail || '', r.w || 0, r.pw || r.w || 0, r.rf ? (U.BANDS[r.rf] || {}).label : '', x ?? '', r.cost || '', r.cost ? +(r.cost * r.qty).toFixed(2) : '', r.link || '', r.buy || '']); }
    return out;
  }
  function curveRows(p, R) {
    const out = {};
    if (R.ff) out['Speed-power'] = [['Airspeed m/s', 'Power W', 'Endurance min', 'Range km', 'Tilt deg']].concat(R.ff.map((x) => [x.V, +x.P.toFixed(1), +x.minutes.toFixed(2), +x.km.toFixed(3), +x.tilt.toFixed(1)]));
    else if (R.fwCurve) out['Speed-power'] = [['Airspeed m/s', 'Power W', 'Endurance min', 'Range km', 'Climb m/s', 'CL']].concat(R.fwCurve.map((x) => [+x.V.toFixed(2), +x.P.toFixed(1), +x.minutes.toFixed(2), +x.km.toFixed(3), +x.roc.toFixed(2), +x.CL.toFixed(3)]));
    out['Battery trade'] = [['Capacity mAh', 'Pack g', 'AUW g', 'Minutes']].concat(U.batterySweep(p, S.lib).map((x) => [Math.round(x.mah), +x.g.toFixed(1), +x.auw.toFixed(1), fin(x.minutes) ? +x.minutes.toFixed(2) : '']));
    out['Payload trade'] = [['Payload g', 'Minutes', 'Hover throttle %', 'Range km']].concat(U.payloadSweep(p, S.lib).map((x) => [Math.round(x.g), fin(x.minutes) ? +x.minutes.toFixed(2) : '', fin(x.thr) ? +x.thr.toFixed(1) : '', fin(x.km) ? +x.km.toFixed(2) : '']));
    const set = R.h ? R.h.set : R.cruiseSet;
    if (set && set.rows.length) out['Motor curve'] = [['Throttle %', 'Thrust g', 'Current A', `${set.name} · ${set.physics ? 'physics estimate' : `bench at ${set.v} V`}`]].concat(set.rows.map((r) => [r[0] ?? '', +(+r[1]).toFixed(1), +(+r[2]).toFixed(2)]));
    return out;
  }

  async function exportXlsx(p) {
    let X;
    try { X = await loadXLSX(); } catch (e) { return toast(e.message); }
    const { rows, R, pl } = calcRows(p);
    const wb = X.utils.book_new();
    const sheet = (name, aoa, widths) => { const ws = X.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
    sheet('Calculations', rows, [18, 40, 22, 8]);
    sheet('BOM', bomRowsFor(p), [13, 40, 6, 9, 9, 9, 8, 8, 12, 40]);
    sheet('Power rails', [['Rail', 'Regulator', 'Avg W', 'Peak W', 'Avg A', 'Peak A', 'Rated A', 'Items']].concat(pl.rails.map((r) => [r.rail, r.kind, +r.avgW.toFixed(2), +r.peakW.toFixed(2), +r.iAvg.toFixed(3), +r.iPk.toFixed(3), r.rail === 'VBAT' ? '' : r.rec, r.items.map((i) => i.name).join('; ')])), [9, 24, 8, 8, 8, 8, 8, 60]);
    const links = rfLinks(p);
    if (links.length) sheet('RF links', [['Link', 'MHz', 'TX dBm', 'TX dBi', 'RX dBi', 'Loss dB', 'Sens dBm', 'Path loss dB', 'Margin dB', 'Max range km']].concat(links.map((x) => { const r = U.link(x.l, p.rf); return [x.name, x.l.mhz, x.l.tx, x.l.txG, x.l.rxG, x.l.loss, x.l.sens, +r.loss.toFixed(1), +r.margin.toFixed(1), +r.maxKm.toFixed(2)]; })), [30, 8, 8, 8, 8, 8, 9, 11, 10, 12]);
    for (const [name, aoa] of Object.entries(curveRows(p, R))) sheet(name, aoa, aoa[0].map(() => 14));
    const buf = X.write(wb, { type: 'array', bookType: 'xlsx' });
    download(`${fileBase(p)}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // standalone, printable report (light theme, no scripts)
  function reportHtml(p) {
    const { rows } = calcRows(p);
    const sections = {};
    for (const r of rows.slice(1)) (sections[r[0]] = sections[r[0]] || []).push(r);
    const fmtv = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : esc(v));
    const bom = bomRowsFor(p).slice(1);
    const subs = [...new Set(bom.map((r) => r[0]))];
    const light = (s) => { const t = S.theme; S.theme = 'light'; const c = subColor(s); S.theme = t; return c; };
    const bomHtml = subs.map((s) => { const rs = bom.filter((r) => r[0] === s); return `<tr class="g"><td colspan="5"><i style="background:${light(s)}"></i>${esc(s)} · ${rs.reduce((a, r) => a + r[4], 0).toFixed(1)} g</td></tr>` + rs.map((r) => `<tr><td>${esc(r[1])}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td><td>${r[5]}${r[6] ? ` · ${r[6]} W` : ''}</td></tr>`).join(''); }).join('');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(p.name)} — HangarLab report</title>
<style>body{font:13px/1.45 "Segoe UI",system-ui,sans-serif;color:#15212b;max-width:900px;margin:32px auto;padding:0 20px}h1{font-size:22px;margin:0}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#546472;border-bottom:1px solid #d6dde3;padding-bottom:4px;margin:26px 0 8px}
table{border-collapse:collapse;width:100%}td{padding:3px 6px;border-bottom:1px solid #eef1f4;vertical-align:top}td.n{text-align:right;font-variant-numeric:tabular-nums}.k{color:#546472;width:45%}tr.g td{font-weight:600;background:#f4f6f8}tr.g i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.sub{color:#8794a0}@media print{body{margin:0}h2{break-after:avoid}}</style>
<h1>${esc(p.name)}</h1><p class="sub">${TYPE_LABEL[p.type]} · exported ${new Date().toLocaleString()} from HangarLab</p>
${Object.entries(sections).map(([s, rs]) => `<h2>${esc(s)}</h2><table>${rs.map((r) => `<tr><td class="k">${esc(r[1])}</td><td>${fmtv(r[2])} ${esc(r[3])}</td></tr>`).join('')}</table>`).join('')}
<h2>Bill of materials</h2><table><tr><td class="k"><b>Item</b></td><td class="n"><b>Qty</b></td><td class="n"><b>Unit g</b></td><td class="n"><b>Total g</b></td><td><b>Rail</b></td></tr>${bomHtml}</table>
</html>`;
  }

  function exportDialog() {
    const p = P();
    const bk = backups();
    openDlg('Export', `
      <p class="note">Exports <b>${esc(p.name)}</b> as it stands now. Excel and CSV values are plain numbers, ready for your own formulas.</p>
      <div class="exp-grid">
        <button class="exp" data-act="tpl-download"><b>Component template</b><span>.xlsx · blank workbook for components, motors, props, batteries, airframes and thrust tests; import it in Parts Library</span></button>
        <button class="exp" data-act="ex-xlsx"><b>Excel workbook</b><span>.xlsx · calculations, BOM, power rails, RF links, speed-power, battery and payload trades, motor curve</span></button>
        <button class="exp" data-act="ex-html"><b>Design report</b><span>.html · one printable page; print to PDF from your browser</span></button>
        <button class="exp" data-act="ex-csv"><b>Calculations</b><span>.csv · every number with section and unit</span></button>
        <button class="exp" data-act="ex-bom"><b>Bill of materials</b><span>.csv · all components incl. motors, props, pack, payload</span></button>
        <button class="exp" data-act="ex-copy"><b>Copy calculations</b><span>paste straight into Excel or Google Sheets</span></button>
        <button class="exp" data-act="ex-json"><b>Workspace backup</b><span>.json · every design and the whole library, for Import</span></button>
      </div>
      <p class="hint">Downloads are blocked in some embedded viewers; Copy works everywhere.</p>
      <div><h3 style="margin:6px 0 8px">Automatic backups</h3>${bk.length ? `<div class="checks">${bk.map((x, j) => `<div class="chk" style="align-items:center"><span class="grow">${new Date(x.t).toLocaleString()} <span class="faint">· ${esc(x.why)}</span></span><button class="btn sm" data-act="restore" data-i="${j}">Restore</button></div>`).join('')}</div>` : '<p class="hint">None yet. A copy is kept each time the app opens (at most every 12 hours) and before any upgrade.</p>'}</div>`,
      `<button class="btn" data-act="dlg-close">Done</button>`);
  }
  function importWorkspace(text) {
    try {
      const o = JSON.parse(text);
      if (!o.projects || !o.lib) throw new Error('missing projects or library');
      const tmp = migrate({ v: o.v >= 2 ? o.v : 1, projects: o.projects, lib: o.lib });
      const ids = new Set(S.projects.map((p) => p.id));
      for (const p of tmp.projects) { if (ids.has(p.id)) p.id = 'p-' + uid(); S.projects.push(p); }
      for (const k of ['motors', 'props', 'tests', 'batteries', 'parts', 'airframes', 'printed']) {
        const have = new Set(S.lib[k].map((x) => x.id));
        for (const x of tmp.lib[k] || []) if (!have.has(x.id)) S.lib[k].push(x);
      }
      save(); render(); toast(`Imported ${tmp.projects.length} design(s)`);
    } catch (e) { toast('Import failed: ' + e.message); }
  }

  // ---------- SETTINGS ----------
  const storageUse = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(KEY)) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { /* blocked */ } return n; };
  function renderSettings(el) {
    const bk = backups(), propData = S.lib.props.filter((x) => x.data).length;
    el.innerHTML = `<div class="stack" style="max-width:980px">
      <div class="settings">
        <div class="card"><h2>Appearance</h2><div class="fields" style="padding:10px 0 0">
          ${sel('theme', 'Theme', [['dark', 'Dark'], ['light', 'Light']], { st: true, rebuild: true })}
          ${sel('units', 'Units', [['metric', 'Metric (SI)'], ['imperial', 'Imperial (in, oz, mph, °F)']], { st: true, rebuild: true })}
          <p class="hint">Values are always stored in metric; exports stay metric.</p></div></div>

        <div class="card"><h2>Estimates</h2><div class="fields" style="padding:10px 0 0">
          ${num('settings.calc.defK', `Default drag correction ${tip('Multiplies the drag build-up until you calibrate a real flight. 1.0 = raw physics. Typical gap between build-up methods and real small aircraft is 1.1–1.3.')}`, { st: true, step: 0.05 })}
          ${num('settings.calc.cons', `Conservative power factor ${tip('The conservative range/endurance numbers use this much more propulsion power. 1.2 = +20 %.')}`, { st: true, step: 0.05 })}
          ${chk('settings.calc.learn', 'Use the correction learned from flights marked “real measurement”', { st: true })}
          <p class="hint" id="setLearn"></p></div></div>

        <div class="card"><h2>New designs</h2><div class="fields" style="padding:10px 0 0">
          ${txt('settings.currency', 'Currency symbol', { st: true })}
          ${num('settings.newDesign.usable', 'Usable battery', { st: true, unit: '%' })}
          ${num('settings.newDesign.alt', 'Field altitude', { st: true, unit: 'm' })}
          ${num('settings.newDesign.temp', 'Air temperature', { st: true, unit: '°C' })}
          <p class="hint">Applied when you click New. Existing designs keep their values.</p></div></div>

        <div class="card"><h2>Flight log viewer</h2><div class="fields" style="padding:10px 0 0">
          ${sel('settings.logs.speed', 'Default playback speed', [1, 2, 5, 10, 20, 50].map((x) => [x, x + '×']), { st: true, isNum: true })}
          ${sel('settings.logs.view', 'Open in', [['3d', '3D view'], ['map', 'Map']], { st: true })}
          <p class="hint">Map tiles load from OpenStreetMap in the downloaded app; the shared viewer blocks them.</p></div></div>

        <div class="card"><h2>Advanced mode</h2><div class="fields" style="padding:10px 0 0">
          ${chk('settings.adv.on', 'Turn on advanced mode', { st: true, rebuild: true })}
          <p class="hint">Edit the connector and wire tables the Electrical tab picks from, and choose the main connector and leads per design. Off = the built-in tables.</p>
          ${S.settings.adv && S.settings.adv.on ? `
          <label class="f"><span>Connectors: name, continuous A (one per line)</span><textarea data-s="settings.adv.conns" rows="8" spellcheck="false">${esc(S.settings.adv.conns)}</textarea></label>
          <label class="f"><span>Wire: AWG, continuous A (one per line)</span><textarea data-s="settings.adv.wire" rows="8" spellcheck="false">${esc(S.settings.adv.wire)}</textarea></label>
          <div class="row wide"><button class="btn sm ghost" data-act="adv-reset">Reset tables to defaults</button></div>` : ''}</div></div>

        <div class="card"><h2>Saving &amp; backups</h2>
          <p class="note" style="margin:8px 0 10px">Every change saves automatically to this browser about a quarter second after you make it. Loaded flight logs, STL previews and undo history are not saved. Each address (localhost port, shared link, downloaded file) has its own storage.</p>
          <dl class="kv" style="margin-bottom:12px"><dt>Storage used</dt><dd id="setStore"></dd><dt>Designs · library items</dt><dd>${S.projects.length} · ${['motors', 'props', 'tests', 'batteries', 'parts', 'printed', 'airframes'].reduce((a, k) => a + (S.lib[k] || []).length, 0)}</dd><dt>Props with performance data</dt><dd>${propData}</dd></dl>
          <div class="fields" style="padding:0">${chk('settings.backups.on', 'Keep automatic backups (on open, at most every 12 h, and before upgrades)', { st: true })}</div>
          <div class="checks" style="margin:8px 0">${bk.map((x, j) => `<div class="chk" style="align-items:center"><span class="grow">${new Date(x.t).toLocaleString()} <span class="faint">· ${esc(x.why)}</span></span><button class="btn sm" data-act="restore" data-i="${j}">Restore</button></div>`).join('') || '<p class="hint">No backups yet.</p>'}</div>
          <div class="row"><button class="btn sm" data-act="backup-now">Back up now</button><button class="btn sm" data-act="tpl-download">Component template (.xlsx)</button><button class="btn sm" data-act="export">Export workspace…</button><button class="btn sm ghost" data-act="import">Import…</button></div></div>

        <div class="card"><h2>Reset</h2><p class="note" style="margin:8px 0 10px">Both can be undone right after with Undo.</p>
          <div class="row"><button class="btn sm danger" data-act="clear-propdata"${propData ? '' : ' disabled'}>Remove all prop performance data</button><button class="btn sm danger" data-act="reset-examples">Replace everything with the example data</button></div></div>

        <div class="card"><h2>Keyboard shortcuts</h2><dl class="kv" style="margin-top:8px"><dt>Switch tab</dt><dd>1 – 9</dd><dt>Undo</dt><dd>Ctrl/⌘ + Z</dd><dt>Export</dt><dd>Ctrl/⌘ + E</dd><dt>Quick start guide</dt><dd>?</dd></dl>
          <div class="row" style="margin-top:12px"><button class="btn sm" data-act="shortcuts">Open quick start</button>${chk('settings.quickstart', 'Show the quick start when the app opens', { st: true })}</div></div>

        <div class="card"><h2>About</h2><p class="note" style="margin:8px 0 0">Libraries: uPlot (MIT), Leaflet (BSD-2), SheetJS (Apache-2.0), LZMA-JS (MIT). Prop data: APC Propellers PER3 files. Fonts: Barlow, Barlow Condensed, Roboto Mono (OFL / Apache-2.0). The flight log viewer follows the layout of ArduPilot UAV Log Viewer but shares no code with it.</p></div>
      </div></div>`;
    settingsLive();
  }
  function settingsLive() {
    const s = $('#setStore'); if (s) s.textContent = `${fmt(storageUse() / 1024, 0)} KB of about 5,000 KB`;
    const l = $('#setLearn');
    if (l) l.innerHTML = (S.lib.fleetFrom || []).length ? `Learned ×${fmt(S.lib.fleetK, 2)} from ${S.lib.fleetFrom.map((x) => esc(x[0])).join(', ')}.` : 'No flights marked as real measurements yet, so the default correction applies.';
  }

  // ---------- quick start (shown on open until dismissed; reopen with ? or Settings) ----------
  const QS_STEPS = [
    { title: 'Welcome to HangarLab', tab: null, body: `
      <p>Size a multirotor, fixed-wing or VTOL drone, check its power and radio links, and compare the plan with real flight logs.</p>
      <ol class="qs-list">
        <li><b>Performance</b> — pick the configuration, motor, prop, battery and payload. Results update as you type.</li>
        <li><b>Compare</b> — designs side by side.</li>
        <li><b>Parts &amp; Weight</b> — every part with weight, cost, balance, supply rail and radio band.</li>
        <li><b>Electrical · Radio Link · 3D Printing</b> — regulators and wiring, link budgets, filament choice and printed-part mass.</li>
        <li><b>Parts Library</b> — the motors, props, packs and parts every design draws from.</li>
        <li><b>Flight Logs</b> — open an ArduPilot log and compare it with the design.</li>
      </ol>
      <p class="hint">The example designs are loaded so every number has something to show. Change them freely; Undo is always one keystroke away.</p>` },
    { title: '1 · Set up a design', tab: 'design', body: `
      <p>Use the design picker in the top bar, or <b>New</b>, then work down the left panel:</p>
      <ol class="qs-list">
        <li><b>Configuration</b>: multirotor, fixed-wing or hybrid VTOL.</li>
        <li><b>Battery</b>: load a pack from the library, set how many packs and series or parallel.</li>
        <li><b>Payload</b> mass.</li>
        <li><b>Propulsion</b>: motor and prop. The green or amber note tells you whether thrust comes from bench data or an estimate.</li>
        <li>Fixed-wing / VTOL: <b>wing area, span</b> and the drag inputs (fuselage size, add-ons such as a gimbal).</li>
      </ol>
      <p>The cards on the right show weight, thrust-to-weight, endurance and range. <b>Checks</b> lists anything to fix, and the red badge on the Performance tab counts them.</p>` },
    { title: '2 · Fill the library', tab: 'library', body: `
      <p>Better data gives better numbers. In <b>Parts Library</b>:</p>
      <ul class="qs-list">
        <li><b>Download template</b> → fill in components, motors, props, packs, airframes and thrust tests in Excel → <b>Import workbook</b>.</li>
        <li><b>Props → Import APC .dat / .zip</b> for real propeller performance.</li>
        <li><b>Motors &amp; thrust data</b>: paste or load a thrust-stand sheet for each motor + prop pair.</li>
        <li>Motor <b>Rm and I0</b> from the datasheet turn on the motor model.</li>
      </ul>
      <p class="hint">Without flight data, range and endurance include a ×1.25 drag correction and a conservative case. Calibrate from a real flight on the Performance tab when you have one.</p>` },
    { title: '3 · Parts, power and radios', tab: 'mass', body: `
      <ul class="qs-list">
        <li><b>Parts &amp; Weight</b>: add parts from the library or paste rows from a spreadsheet. Set each part’s rail (5 V, 12 V, VBAT…) and RF band. <b>Full BOM report</b> combines several designs into one purchase list.</li>
        <li><b>Electrical</b>: regulator sizes, PDB rating, connector and wire gauge from those rails.</li>
        <li><b>Radio Link</b>: margin and maximum range for each radio, Fresnel clearance and antenna suggestions.</li>
        <li><b>3D Printing</b>: rank filaments for heat, UV and impacts; load an STL to estimate the printed part’s mass.</li>
      </ul>` },
    { title: '4 · Check against a real flight', tab: 'logs', body: `
      <p>In <b>Flight Logs</b>, drop an ArduPilot <b>.bin</b> or <b>.log</b>.</p>
      <ul class="qs-list">
        <li>Plot presets, any field, or expressions such as <code>BAT.Volt * BAT.Curr</code>.</li>
        <li>3D path or map coloured by flight mode, with play/pause.</li>
        <li>Parameters and events (modes, errors, arm/disarm).</li>
        <li><b>Design vs log</b> compares the logged power with your design’s prediction.</li>
      </ul>` },
    { title: '5 · Saving, sharing and shortcuts', tab: null, body: `
      <ul class="qs-list">
        <li><b>Autosave</b>: every change is kept in this browser. Automatic backups are in <b>Settings</b>.</li>
        <li><b>Export</b>: Excel workbook, report, CSV, or a workspace backup to move your work to another computer (<b>Import</b> in the top bar reads it).</li>
        <li><b>Metric / Imperial</b> in the top bar; theme and estimate settings under <b>Settings</b>.</li>
      </ul>
      <dl class="kv" style="margin-top:10px"><dt>Switch tab</dt><dd>1 – 9</dd><dt>Undo</dt><dd>Ctrl/⌘ + Z</dd><dt>Export</dt><dd>Ctrl/⌘ + E</dd><dt>This guide</dt><dd>?</dd></dl>` },
  ];
  let qsStep = 0;
  function quickStart(step = 0) {
    qsStep = Math.max(0, Math.min(QS_STEPS.length - 1, step));
    const st = QS_STEPS[qsStep], last = qsStep === QS_STEPS.length - 1;
    openDlg(`<span class="qs-title">${st.title}</span>`, `<div class="qs">${st.body}</div>
      <div class="qs-dots" role="tablist">${QS_STEPS.map((x, i) => `<button data-qs="${i}" aria-label="Step ${i + 1}" aria-current="${i === qsStep}"></button>`).join('')}</div>`,
      `<label class="f check" style="margin-right:auto;grid-column:auto;font-size:13px"><input type="checkbox" id="qsHide"${S.settings.quickstart === false ? ' checked' : ''}> Don’t show on start</label>
       ${st.tab ? `<button class="btn ghost" data-qs-go="${st.tab}">Show me</button>` : ''}
       ${qsStep ? '<button class="btn" data-qs="prev">Back</button>' : ''}
       <button class="btn primary" data-qs="${last ? 'done' : 'next'}">${last ? 'Get started' : 'Next'}</button>`);
    $('#dlg').classList.add('qs-dlg');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qs],[data-qs-go]');
    if (!b) return;
    if (b.dataset.qsGo) { closeDlg(); S.tab = b.dataset.qsGo; save(); render(); window.scrollTo(0, 0); return; }
    const v = b.dataset.qs;
    if (v === 'next') quickStart(qsStep + 1);
    else if (v === 'prev') quickStart(qsStep - 1);
    else if (v === 'done') closeDlg();
    else quickStart(+v);
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'qsHide') { S.settings.quickstart = !e.target.checked; save(); } });
  document.addEventListener('keydown', (e) => {
    if (!$('#dlg').open || !$('#dlg').classList.contains('qs-dlg')) return;
    if (e.key === 'ArrowRight') quickStart(qsStep + 1);
    if (e.key === 'ArrowLeft') quickStart(qsStep - 1);
  });
  $('#dlg').addEventListener('close', () => $('#dlg').classList.remove('qs-dlg'));

  // ---------- render ----------
  // ---------- COMPARE ----------
  function renderCompare(el) {
    const ids = (S.cmpSel || []).filter((id) => S.projects.some((p) => p.id === id));
    const ps = ids.length ? ids.map((id) => S.projects.find((p) => p.id === id)) : S.projects.slice();
    const Rs = ps.map((p) => U.compute(p, S.lib));
    const cons = (p, R, key) => (p.type === 'fixedwing' ? R.cruise && R.cruise[key] : p.type === 'vtol' ? R.mission && R.mission[key] : null);
    const rangeOf = (p, R) => (p.type === 'multirotor' ? R.bestRange && R.bestRange.km : p.type === 'fixedwing' ? R.cruise && R.cruise.km : R.mission && R.mission.km);
    const cur = esc(S.settings.currency || '$');
    // [label, value(p, R), unit, which is better, decimals]
    const M = [
      ['Configuration', (p) => TYPE_LABEL[p.type] + (p.type === 'vtol' ? ` · ${p.vtol.kind}` : '')],
      ['All-up weight', (p, R) => R.Wg / 1000, 'kg', 'lo', 2],
      ['Payload', (p) => +p.payload.g || 0, 'g', 'hi', 0],
      ['Battery', (p, R) => `${R.bat.packs > 1 ? `${R.bat.packs}× ` : ''}${R.bat.S}S${R.bat.P}P · ${fmt(R.bat.Wh, 0)} Wh`],
      ['Battery fraction', (p, R) => (R.bat.g / R.Wg) * 100, '%', null, 0],
      ['Endurance', (p, R) => U.enduranceOf(p, R), 'min', 'hi', 1],
      ['Endurance, conservative', (p, R) => cons(p, R, 'consMinutes'), 'min', 'hi', 1],
      ['Range', rangeOf, 'km', 'hi', 1],
      ['Range, conservative', (p, R) => cons(p, R, 'consKm'), 'km', 'hi', 1],
      ['Mission profile', (p, R) => { const m = U.missionPlan(p, S.lib, R); if (!m) return '—'; const st = misStatus(m); return `<span class="pill ${st.st}">${st.pill}</span> ${leftTxt(m.avail - m.total, m.avail)}`; }],
      ['Hover throttle', (p, R) => R.h && R.h.thr, '%', 'lo', 0],
      ['Thrust / weight', (p, R) => (R.h ? R.h.tw : R.staticTW), '', 'hi', 2],
      ['Hover power', (p, R) => R.hoverP, 'W', 'lo', 0],
      ['Cruise power', (p, R) => R.cruise && R.cruise.P, 'W', 'lo', 0],
      ['Cruise speed', (p, R) => (p.type === 'multirotor' ? R.bestRange && R.bestRange.V : p.fw.vc), 'm/s', null, 1],
      ['Stall speed', (p, R) => R.vs, 'm/s', 'lo', 1],
      ['Wing loading', (p, R) => R.wingLoad && R.wingLoad * 10, 'g/dm²', null, 1],
      ['Peak current', (p, R) => R.maxI, 'A', 'lo', 0],
      ['Balance', (p) => { const c = U.cgOf(p, S.lib); return c.x == null ? '—' : p.type === 'multirotor' ? `${fmt(c.x, 0)} mm` : `${fmt(c.pct, 0)} % MAC`; }],
      ['Parts cost', (p) => U.costOf(p, S.lib), 'money', 'lo', 0],
      ['Issues to fix', (p, R) => R.checks.filter((c) => c.level === 'crit').length, '', 'lo', 0],
    ];
    const body = M.map(([label, f, unit, better, d]) => {
      const vals = ps.map((p, j) => { try { return f(p, Rs[j]); } catch (e) { return null; } });
      const nums = vals.map((v) => (typeof v === 'number' && fin(v) ? v : null));
      const ok = nums.filter((v) => v != null);
      const best = better && ps.length > 1 && ok.length > 1 && new Set(ok).size > 1 ? (better === 'hi' ? Math.max(...ok) : Math.min(...ok)) : null;
      if (!vals.some((v) => v != null && v !== '' && !(typeof v === 'number' && !fin(v)))) return '';
      return `<tr><th>${label}</th>${vals.map((v, j) => `<td class="n${nums[j] != null && nums[j] === best ? ' best' : ''}">${nums[j] != null ? (unit === 'money' ? (v ? `${cur}${fmt(v, d)}` : '—') : `${fmt(v, d)}${unit ? ' ' + unit : ''}`) : v == null || v === '' ? '<span class="faint">—</span>' : v}</td>`).join('')}</tr>`;
    }).join('');
    el.innerHTML = `<div class="stack">
      <div class="card"><div class="card-h"><h2>Compare designs</h2><div class="row">${S.projects.map((p) => `<label class="f check" style="grid-column:auto"><input type="checkbox" data-cmpsel="${p.id}"${ps.includes(p) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></div>
        <div class="tbl-wrap"><table class="cmp"><thead><tr><th></th>${ps.map((p) => `<th class="n"><button class="btn ghost sm" data-act="cmp-open" data-id="${p.id}" title="Open in Design">${esc(p.name)}</button></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="hint" style="margin-top:8px">Highlighted: the best value in each row. Conservative numbers add ${fmt(((S.settings.calc.cons || 1.2) - 1) * 100, 0)} % propulsion power unless a design is calibrated from flight. Duplicate a design (header) to try a variant side by side.</p></div></div>`;
  }

  const VIEWS = { design: [renderDesign, liveDesign], compare: [renderCompare, null], mass: [renderMass, liveMass], power: [renderPower, null], rf: [renderRF, liveRF], materials: [renderMaterials, liveMaterials], library: [renderLibrary, () => {}], logs: [renderLogs, null], settings: [renderSettings, settingsLive] };
  function render() {
    syncLib();
    updateFleet();
    killCharts();
    renderHeader();
    const el = $('#view');
    const keepScroll = window.scrollY;
    VIEWS[S.tab][0](el);
    convertDom(el);
    window.scrollTo(0, keepScroll);
  }
  function updateFleet() {
    S.lib.fleetK = 0;
    const ks = [];
    for (const p of S.projects) {
      if (p.type === 'multirotor' || !p.fw || !p.fw.cal || !p.fw.cal.on || !p.fw.cal.learn) continue;
      const R = U.compute(p, S.lib, { lite: true });
      if (fin(R.calK)) ks.push([p.name, R.calK]);
    }
    S.lib.fleetFrom = ks;
    S.lib.cfg = S.settings.calc;
    const adv = S.settings.adv || {}, rows = (t) => String(t || '').split(/\r?\n/).map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((r) => r[0] && +r[1] > 0).map((r) => [r[0], +r[1]]).sort((a, b) => a[1] - b[1]);
    S.lib.pwr = adv.on ? { on: true, conns: rows(adv.conns), wire: rows(adv.wire) } : null;
    S.lib.fleetK = ks.length ? Math.min(2.5, Math.max(0.8, Math.exp(ks.reduce((a, x) => a + Math.log(x[1]), 0) / ks.length))) : 0;
  }
  function live() {
    syncLib();
    updateFleet();
    tabBadges(); const f = VIEWS[S.tab][1]; if (f) { f(); convertDom($('#view')); } else render(); }

  // a BOM edit changed a library item: refresh the other rows that mirror it once the field loses focus
  let libEdited = false;
  document.addEventListener('focusout', () => { if (libEdited) { libEdited = false; setTimeout(() => { if (!document.activeElement || !document.activeElement.dataset || !document.activeElement.dataset.k) render(); }, 0); } });

  // ---------- events ----------
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'spec-box') { specPreview(textRows(el.value)); $('#spec-src').textContent = 'pasted'; return; }
    if (el.id === 'pd-box') { pdParse(); return; }
    if (el.id === 'apc-q') { apcState.filter = el.value; renderApc(); return; }
    if (el.dataset.apc != null) { apcState.entries[+el.dataset.apc].on = el.checked; renderApc(); return; }
    if (el.dataset.cmpsel) {
      const id = el.dataset.cmpsel, cur = ((S.cmpSel || []).length ? S.cmpSel : S.projects.map((x) => x.id)).filter((x) => S.projects.some((p) => p.id === x));
      S.cmpSel = el.checked ? [...new Set(cur.concat(id))] : cur.filter((x) => x !== id);
      if (!S.cmpSel.length) S.cmpSel = [id];
      save(); render(); return;
    }
    if (el.dataset.bomsel) {
      const id = el.dataset.bomsel, cur = bomSelection().map((x) => x.id);
      S.bomSel = el.checked ? [...new Set(cur.concat(id))] : cur.filter((x) => x !== id);
      save(); render(); return;
    }
    if (el.dataset.s) {
      setPath(S, el.dataset.s, readVal(el));
      save();
      if (el.dataset.rebuild != null) render(); else { updateFleet(); renderHeader(); settingsLive(); }
      return;
    }
    const k = el.dataset.k, lk = el.dataset.lib;
    if (!k && !lk) return;
    if (k === '_batPreset') {
      const b = S.lib.batteries.find((x) => x.id === el.value);
      if (b) { P().batt.ref = b.id; delete P().batt.unlinked; }
      syncLib(); save(); render(); return;
    }
    if (k === '_airframe') {
      const a = S.lib.airframes.find((x) => x.id === el.value);
      if (a) {
        const p = P();
        if (a.span) p.fw.span = a.span;
        if (a.area) p.fw.area = a.area;
        if (a.g && !p.bom.some((r) => r.name === a.name || r.ref === `airframes:${a.id}`)) p.bom.unshift(libToBom('airframes', a));
        toast(a.area ? `Applied ${a.name}` : `${a.name} has no wing area in the library; set it here.`);
      }
      save(); render(); return;
    }
    if (k) {
      setPath(P(), k, readVal(el));
      if (k === 'payload.g') { // keep the slider and the number box in step
        const g = P().payload.g, box = document.getElementById('i-payload.g'), sl = $('#paySlide');
        if (el !== box && box) box.value = imperial() ? +(+toDisp(g, 'g>oz')).toFixed(2) : g;
        if (el !== sl && sl) { if (g > +sl.max) sl.max = Math.ceil((g * 1.5) / 500) * 500; sl.value = g; }
      }
      if (/^mission\.segs\./.test(k)) delete P().mission.logWh;
      const bm = k.match(/^bom\.(\d+)\.(\w+)$/), bt = k.match(/^batt\.(\w+)$/);
      if (bm) {
        const r = P().bom[+bm[1]], [rk] = splitRef(r.ref), x = refItem(r.ref);
        if (x && LINKED[rk].includes(bm[2]) && !(rk === 'printed' && bm[2] === 'g')) x[bm[2]] = r[bm[2]];
      }
      if (bt && P().batt.ref && BAT_LINKED.includes(bt[1])) { const x = S.lib.batteries.find((y) => y.id === P().batt.ref); if (x) x[bt[1]] = P().batt[bt[1]]; }
      if (k === 'mat.area' || k === 'mat.vol') { delete P().mat.areaSide; delete P().mat.areaTB; delete P().mat.stlName; delete P().mat.stlSize; stlMesh = null; }
      if (k === 'mr.layout') P().mr.n = U.LAYOUTS[el.value].n;
      if (k === 'name') renderHeader();
    } else {
      setPath(S.lib, lk, readVal(el));
      if (/^subs\.\d+\.(color|name)$/.test(lk)) { const m = lk.split('.'); const row = el.closest('tr'); const tag = row && row.querySelector('.subtag'); const x = S.lib.subs[+m[1]]; if (tag) { tag.style.setProperty('--sc', x.color); tag.textContent = x.name; } }
      const pm = lk.match(/^printed\.(\d+)\.(mat|vol|area|walls|tb|infill)$/);
      if (pm && (pm[2] === 'area' || pm[2] === 'vol')) { const x = S.lib.printed[+pm[1]]; delete x.areaSide; delete x.areaTB; }
      const idx = pm ? [+pm[1]] : /^printer\./.test(lk) ? (S.lib.printed || []).map((_, j) => j) : [];
      for (const j of idx) {
        const x = S.lib.printed[j], m = U.MATERIALS.find((q) => q.id === x.mat);
        if (m) { x.g = +U.partMass(x, m.rho, PRN()).toFixed(1); const gi = document.querySelector(`[data-lib="printed.${j}.g"]`); if (gi) gi.value = toDisp(x.g, 'g>oz'); }
      }
    }
    save();
    if (el.dataset.rebuild != null || (k && /^bom\.\d+\.(rf|rail)$/.test(k) && S.tab !== 'mass')) render(); else live();
    if (k && /^bom\.\d+\.(name|g|rail|w|pw|rf|link|buy|cost)$/.test(k) && refItem(P().bom[+k.split('.')[1]].ref)) libEdited = true;
  });

  document.addEventListener('click', (e) => {
    const sb = e.target.closest('[data-stlview],[data-stlrot]');
    if (sb) { if (sb.dataset.stlview) stlView(sb.dataset.stlview); else rotateStl(sb.dataset.stlrot); return; }
    const b = e.target.closest('[data-act],[data-tab],[data-settype],[data-libtab],[data-massview],[data-units]');
    if (!b) return;
    if (b.tagName === 'A' && b.getAttribute('href') === '#') e.preventDefault();
    if (b.dataset.units) { S.units = b.dataset.units; save(); render(); toast(S.units === 'imperial' ? 'Imperial units (stored in metric; exports stay metric)' : 'Metric units'); return; }
    if (b.dataset.tab) { lvs.playing = false; if (lmap) { lmap.remove(); lmap = null; } S.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); return; }
    if (b.dataset.settype) { P().type = b.dataset.settype; save(); render(); return; }
    if (b.dataset.libtab) { S.libTab = b.dataset.libtab; save(); render(); return; }
    if (b.dataset.massview) { S.massView = b.dataset.massview; save(); render(); return; }
    const p = P(), i = +b.dataset.i;
    switch (b.dataset.act) {
      case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); render(); break;
      case 'new':
        openDlg('New design', `<label class="f"><span>Name</span><input type="text" id="nd-name" value="New design"></label>
          <label class="f"><span>Configuration</span><select id="nd-type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <p class="hint">Starts from the matching example design so every field has a sensible value. Edit or clear its BOM.</p>`,
          `<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="new-go">Create</button>`);
        break;
      case 'new-go': {
        const type = $('#nd-type').value;
        const base = clone(window.UAS_SEED.projects.find((x) => x.type === type));
        base.id = 'p-' + uid(); base.name = $('#nd-name').value || 'New design'; fixDesign(base);
        Object.assign(base.batt, { usable: S.settings.newDesign.usable }); Object.assign(base.env, { alt: S.settings.newDesign.alt, temp: S.settings.newDesign.temp });
        S.projects.push(base); S.active = base.id; closeDlg(); save(); render(); break;
      }
      case 'dup': { const c = clone(p); c.id = 'p-' + uid(); c.name = p.name + ' (copy)'; S.projects.push(c); S.active = c.id; save(); render(); toast('Duplicated'); break; }
      case 'del': {
        if (S.projects.length < 2) { toast('Keep at least one design. Create a new one first, then delete this one.'); break; }
        const R = U.compute(p, S.lib, { lite: true });
        openDlg('Delete this design?', `<p style="margin-top:0">You are about to delete <b>${esc(p.name)}</b>.</p>
          <dl class="kv" style="margin:8px 0 12px"><dt>Configuration</dt><dd>${TYPE_LABEL[p.type]}</dd><dt>All-up weight</dt><dd>${fmt(R.Wg / 1000, 2)} kg</dd><dt>BOM rows</dt><dd>${p.bom.length}</dd>${p.fw && p.fw.cal && p.fw.cal.on ? '<dt>Flight calibration</dt><dd>yes</dd>' : ''}</dl>
          <label class="f check"><input type="checkbox" id="delSave" checked> Download a copy of this design first (.json, opens again with Import)</label>
          <p class="hint">A backup of the whole workspace is also saved in Settings → Saving &amp; backups, and Undo (Ctrl/⌘ + Z) brings it back until you close the app. Library parts are not deleted.</p>`,
          `<button class="btn" data-act="dlg-close">Keep it</button><button class="btn danger" data-act="del-go">Delete ${esc(p.name)}</button>`);
        break;
      }
      case 'del-go': {
        const save1 = $('#delSave') && $('#delSave').checked;
        if (save1) download(`hangarlab-${fileBase(p)}.json`, JSON.stringify({ app: 'hangarlab', v: 5, projects: [p], lib: S.lib }, (k, v) => (['fleetK', 'fleetFrom', 'cfg', 'pwr', 'knownDefaults'].includes(k) ? undefined : v), 1), 'application/json');
        backup(JSON.stringify(S), `before deleting ${p.name}`);
        closeDlg();
        withUndo(`Deleted ${p.name}${save1 ? ' (copy downloaded)' : ''}`, () => { S.projects = S.projects.filter((x) => x.id !== p.id); S.active = S.projects[0].id; });
        break;
      }
      case 'export': exportDialog(); break;
      case 'ex-xlsx': exportXlsx(p); break;
      case 'ex-html': download(`${fileBase(p)}-report.html`, reportHtml(p), 'text/html'); break;
      case 'ex-csv': download(`${fileBase(p)}-calculations.csv`, '﻿' + csvOf(calcRows(p).rows), 'text/csv'); break;
      case 'ex-bom': download(`${fileBase(p)}-bom.csv`, '﻿' + csvOf(bomRowsFor(p)), 'text/csv'); break;
      case 'ex-copy': copyText(tsvOf(calcRows(p).rows), 'Calculations'); break;
      case 'ex-json': download(`hangarlab-${stamp()}.json`, JSON.stringify({ app: 'hangarlab', v: 5, projects: S.projects, lib: S.lib }, (k, v) => (['fleetK', 'fleetFrom', 'cfg', 'pwr', 'knownDefaults'].includes(k) ? undefined : v), 1), 'application/json'); break;
      case 'bom-copy': copyText(tsvOf(bomTableRows()), 'BOM'); break;
      case 'bom-csv': download(`bom-${stamp()}.csv`, '﻿' + csvOf(bomTableRows()), 'text/csv'); break;
      case 'bom-sort': p.bom.sort((x, y) => subOrder(x.sub) - subOrder(y.sub) || String(x.sub).localeCompare(y.sub)); save(); render(); break;
      case 'import': $('#importFile').click(); break;
      case 'dlg-close': closeDlg(); break;
      case 'bom-add': {
        const [kind, id] = ($('#libPick').value || '').split(':');
        const x = kind && (S.lib[kind] || []).find((q) => q.id === id);
        p.bom.push(x ? libToBom(kind, x) : { id: 'b' + uid(), name: 'New item', sub: 'Other', qty: 1, g: 0, rail: '', w: 0, pw: 0, rf: '' });
        save(); render(); break;
      }
      case 'drag-del': withUndo('Add-on removed', () => P().fw.drag.extras.splice(i, 1)); break;
      case 'adv-reset': withUndo('Connector and wire tables reset', () => { S.settings.adv.conns = U.CONNECTORS.map((c) => c.join(', ')).join('\n'); S.settings.adv.wire = U.WIRE.map((w) => w.join(', ')).join('\n'); }); break;
      case 'sub-add': { const n = S.lib.subs.length + 1; S.lib.subs.push({ key: 'sub-' + uid(), name: `New subsystem ${n}`, color: hueHex((n * 47) % 360, 0.66, 0.54) }); save(); render(); break; }
      case 'sub-up': if (i > 0) { const l = S.lib.subs; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(); render(); } break;
      case 'sub-color': S.lib.subs[i].color = defaultSubColor(S.lib.subs[i].key); save(); render(); break;
      case 'sub-del': {
        const x = S.lib.subs[i];
        withUndo(`Removed subsystem ${x.name}`, () => {
          for (const r of S.lib.parts.concat(...S.projects.map((p) => p.bom))) if (r.sub === x.key) r.sub = 'Other';
          S.lib.subs.splice(i, 1);
        });
        break;
      }
      case 'bom-unlink': { const r = p.bom[i]; delete r.ref; r.unlinked = true; save(); render(); toast(`${r.name} is now a custom row; library changes no longer reach it.`); break; }
      case 'bat-unlink': delete p.batt.ref; p.batt.unlinked = true; save(); render(); toast('Pack unlinked from the library'); break;
      case 'seg-add': p.mission.segs.push({ type: 'cruise', v: p.type === 'multirotor' ? 1 : 5, dir: 'none' }); save(); render(); break;
      case 'seg-del': withUndo('Segment removed', () => p.mission.segs.splice(i, 1)); break;
      case 'seg-up': if (i > 0) { const s2 = p.mission.segs; [s2[i - 1], s2[i]] = [s2[i], s2[i - 1]]; save(); render(); } break;
      case 'cmp-open': S.active = b.dataset.id; S.tab = 'design'; save(); render(); window.scrollTo(0, 0); break;
      case 'team-open': teamDialog(); break;
      case 'team-push': teamPush(); break;
      case 'team-pull': teamPull(); break;
      case 'bom-del': withUndo(`Removed ${p.bom[i].name}`, () => p.bom.splice(i, 1)); break;
      case 'bom-paste': pasteDialog(); break;
      case 'paste-go': { const rows = parsePaste($('#pasteBox').value); closeDlg(); withUndo(`Added ${rows.length} row(s)`, () => p.bom.push(...rows)); break; }
      case 'rf-add': (p.rf.manual = p.rf.manual || []).push({ name: 'Ground video link', band: '5800', mhz: 5800, tx: 25, txG: 3, rxG: 8, loss: 1, sens: -90, pol: 'cl' }); save(); render(); break;
      case 'rf-del': withUndo('Link removed', () => p.rf.manual.splice(i, 1)); break;
      case 'part-add': {
        const top = U.rankMaterials(p.mat).find((x) => x.ok);
        const m = top ? top.m : U.MATERIALS[0];
        const g = U.partMass(p.mat, m.rho, PRN());
        p.bom.push({ id: 'b' + uid(), name: `${$('#partName').value || 'Printed part'} (${m.name})`, sub: '3D printed', qty: 1, g: Math.round(g * 10) / 10, rail: '', w: 0, pw: 0, rf: '' });
        save(); toast(`Added ${fmt(g, 1)} g ${m.name} part to BOM`); break;
      }
      case 'part-lib': {
        const top = U.rankMaterials(p.mat).find((x) => x.ok), m = top ? top.m : U.MATERIALS[0];
        (S.lib.printed = S.lib.printed || []).push({ id: 'pp-' + uid(), name: $('#partName').value || 'Printed part', mat: m.id, vol: p.mat.vol, area: p.mat.area || 0, areaSide: p.mat.areaSide, areaTB: p.mat.areaTB, walls: p.mat.walls, tb: p.mat.tb, infill: p.mat.infill, notes: p.mat.stlName || '', g: +U.partMass(p.mat, m.rho, PRN()).toFixed(1), sub: '3D printed' });
        save(); toast(`Saved to library: 3D printed parts`); break;
      }
      case 'test-new': testDialog(null, b.dataset.motor); break;
      case 'mt-toggle': { const id = b.dataset.id; if (mtOpen.has(id)) mtOpen.delete(id); else mtOpen.add(id); render(); break; }
      case 'mt-all': { if (mtOpen.size) mtOpen.clear(); else S.lib.motors.forEach((m) => mtOpen.add(m.id)); render(); break; }
      case 'spec-import': specDialog(b.dataset.kind); break;
      case 'spec-go': specGo(); break;
      case 'apc-import': apcDialog(); break;
      case 'apc-go': apcGo(); break;
      case 'apc-all': apcShown().forEach(([e]) => (e.on = true)); renderApc(); break;
      case 'apc-none': apcState.entries.forEach((e) => (e.on = false)); renderApc(); break;
      case 'prop-data': propDataDialog(i); break;
      case 'pd-save': { const d = pdParse(); if (!d) { toast('Nothing to save yet.'); break; } S.lib.props[+$('#pd-i').value].data = d; closeDlg(); save(); render(); toast('Prop data saved'); break; }
      case 'pd-clear': { const j = +$('#pd-i').value; closeDlg(); withUndo('Prop data removed', () => delete S.lib.props[j].data); break; }
      case 'test-edit': testDialog(i); break;
      case 'test-save': saveTestFromDlg(); break;
      case 'bulk-import': bulkDialog(); break;
      case 'bulk-go': bulkGo(); break;
      case 'use-motor': case 'use-prop': {
        const kind = b.dataset.act === 'use-motor' ? 'motors' : 'props', x = S.lib[kind][i], role = b.dataset.role;
        p[role][kind === 'motors' ? 'motor' : 'prop'] = x.id;
        save(); toast(`${x.name} → ${p.name} (${role === 'mr' ? 'lift' : 'cruise'})`); break;
      }
      case 'lib-del': withUndo(`Removed ${S.lib[b.dataset.kind][i].name || 'item'}`, () => S.lib[b.dataset.kind].splice(i, 1)); break;
      case 'groups-open': case 'groups-close': {
        const open = b.dataset.act === 'groups-open';
        S.ui = S.ui || {}; S.ui.groups = S.ui.groups || {};
        document.querySelectorAll('details.group[data-g]').forEach((g) => { g.open = open; S.ui.groups[g.dataset.g] = open; });
        save(); break;
      }
      case 'undo': undo(); break;
      case 'tpl-download': downloadTemplate(); break;
      case 'tpl-import': $('#tplFile').click(); break;
      case 'backup-now': backup(JSON.stringify(S), 'manual'); render(); toast('Backup saved'); break;
      case 'clear-propdata': withUndo('Prop data removed', () => S.lib.props.forEach((x) => delete x.data)); break;
      case 'reset-examples': {
        const seed = clone(window.UAS_SEED);
        withUndo('Example data loaded', () => { S.projects = seed.projects; S.lib = seed.lib; S.active = seed.projects[0].id; });
        break;
      }
      case 'shortcuts': quickStart(0); break;
      case 'restore': {
        const bk = backups()[i];
        if (!bk) break;
        snapshot();
        const r = migrate(JSON.parse(bk.raw));
        Object.assign(S, { projects: r.projects, lib: r.lib, active: r.active });
        closeDlg(); save(); render(); toast('Backup restored', { label: 'Undo', fn: undo });
        break;
      }
      case 'lib-add': { const k = b.dataset.kind; S.lib[k].push(Object.assign({ id: k.slice(0, 2) + '-' + uid() }, LIB_BLANK[k])); save(); render(); break; }
      case 'lib-use': {
        const k = b.dataset.kind, x = S.lib[k][i];
        if (k === 'batteries') { Object.assign(p.batt, { ref: x.id }); delete p.batt.unlinked; }
        if (k === 'printed' || k === 'parts') p.bom.push(libToBom(k, x));
        if (k === 'airframes') { if (x.span) p.fw.span = x.span; if (x.area) p.fw.area = x.area; if (x.g && !p.bom.some((r) => r.ref === `airframes:${x.id}`)) p.bom.unshift(libToBom(k, x)); }
        syncLib();
        save(); toast(`Applied to ${p.name}`); break;
      }
    }
  });

  document.addEventListener('toggle', (e) => {
    const g = e.target;
    if (!g.matches || !g.matches('details.group[data-g]')) return;
    S.ui = S.ui || {}; S.ui.groups = S.ui.groups || {};
    S.ui.groups[g.dataset.g] = g.open; save();
  }, true);
  // shortcuts: 1–9 tabs, Ctrl/⌘+Z undo, Ctrl/⌘+E export, ? help
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || $('#dlg').open;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); exportDialog(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const tabs = ['design', 'compare', 'mass', 'power', 'rf', 'materials', 'library', 'logs', 'settings'];
    if (/^[1-9]$/.test(e.key)) { const t = tabs[+e.key - 1]; if (t !== S.tab) { lvs.playing = false; S.tab = t; save(); render(); window.scrollTo(0, 0); } }
    else if (e.key === '?') document.querySelector('[data-act="shortcuts"]').click();
  });
  $('#projSel').addEventListener('change', (e) => { S.active = e.target.value; stlMesh = null; save(); render(); });
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(importWorkspace);
    e.target.value = '';
  });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'logFile' && el.files[0]) loadLogFile(el.files[0]);
    if (el.id === 'te-motor') $('#te-newm').hidden = el.value !== '__new';
    if (el.id === 'te-prop') $('#te-newp').hidden = el.value !== '__new';
    if (el.id === 'te-sheetSel') fillFromSheet();
    if (el.id === 'libSection') { S.libTab = el.value; save(); render(); }
    if (el.id === 'tplFile' && el.files[0]) { importWorkbook(el.files[0]); el.value = ''; }
    if (el.id === 'dragAdd' && el.value !== '') { const [n, c] = DRAG_ADDONS[+el.value]; (P().fw.drag.extras = P().fw.drag.extras || []).push({ name: n.replace(/ \(.*\)$/, ''), cda: c, qty: 1 }); save(); render(); }
    if (el.id === 'stl-unit') {
      P().mat.stlUnit = el.value;
      if (stlMesh) Object.assign(P().mat, stlFields(U.stlStats(stlMesh, UNIT_MM[el.value]), P().mat.stlName));
      if (sv) sv.rebuild = true;
      save(); render();
    }
    if (el.id === 'stl-mat' && el.files[0]) {
      try {
        const f = el.files[0], { tris, st } = await readStl(f, P().mat.stlUnit || 'mm');
        stlMesh = tris; if (sv) sv.rebuild = true;
        Object.assign(P().mat, stlFields(st, f.name), { partName: f.name.replace(/\.stl$/i, '') });
        save(); render();
        toast(`${f.name}: ${fmt(st.vol, 2)} cm³, ${fmt(st.area, 1)} cm²`);
      } catch (err) { toast(err.message); }
    }
    if (el.dataset.stlrow != null && el.files[0]) {
      try {
        const f = el.files[0], { st } = await readStl(f, 'mm'), x = S.lib.printed[+el.dataset.stlrow];
        Object.assign(x, stlFields(st, f.name));
        if (!x.name || x.name === 'New printed part') x.name = f.name.replace(/\.stl$/i, '');
        const m = U.MATERIALS.find((q) => q.id === x.mat);
        if (m) x.g = +U.partMass(x, m.rho, PRN()).toFixed(1);
        save(); render(); toast(`${f.name}: ${fmt(st.vol, 2)} cm³ → ${fmt(x.g, 1)} g`);
      } catch (err) { toast(err.message); }
    }
    if (el.id === 'apc-file' && el.files.length) apcFiles([...el.files]);
    if (el.id === 'pd-file' && el.files[0]) { $('#pd-box').value = await el.files[0].text(); pdParse(); }
    if (el.id === 'spec-file' && el.files[0]) {
      try { const sh = await readSheets(el.files[0]); const best = sh.find((x) => specParse(x.rows, specState.kind).items.length) || sh[0]; specPreview(best.rows); $('#spec-src').textContent = `${el.files[0].name} · ${best.name}`; } catch (err) { $('#spec-prev').innerHTML = `<p class="hint" style="color:var(--crit)">${esc(err.message)}</p>`; }
    }
    if (el.id === 'te-file' && el.files[0]) {
      const box = $('#te-sheet');
      box.innerHTML = '<p class="hint">Reading…</p>';
      try {
        sheetCache = await readSheets(el.files[0]);
        const best = Math.max(0, sheetCache.findIndex((sh) => detectCols(sh.rows)));
        box.innerHTML = `${sheetCache.length > 1 ? `<label class="f"><span>Sheet</span><select id="te-sheetSel">${sheetCache.map((sh, k) => `<option value="${k}"${k === best ? ' selected' : ''}>${esc(sh.name)}${detectCols(sh.rows) ? '' : ' (no thrust table)'}</option>`).join('')}</select></label>` : ''}<p class="hint" id="te-sheetInfo"></p>`;
        fillFromSheet();
      } catch (err) { box.innerHTML = `<p class="hint" style="color:var(--crit)">${esc(err.message)}</p>`; }
    }
    if (el.id === 'bulk-file' && el.files[0]) {
      $('#bulk-list').innerHTML = '<p class="hint">Reading…</p>';
      try {
        const sheets = await readSheets(el.files[0]);
        bulk = sheets.map((sh) => { const det = detectCols(sh.rows), res = det ? sheetToRows(sh.rows, det, 22.2) : { rows: [], v: null }, g = guessNames(sh.name); return { sheet: sh.name, motor: g.motor, prop: g.prop, rows: res.rows, v: res.v }; });
        renderBulk();
      } catch (err) { $('#bulk-list').innerHTML = `<p class="hint" style="color:var(--crit)">${esc(err.message)}</p>`; }
    }
  });
  document.addEventListener('dragover', (e) => { if (S.tab === 'logs') { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const d = $('#drop'); if (d && !e.relatedTarget) d.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    if (S.tab !== 'logs') return;
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) loadLogFile(f);
  });
  window.addEventListener('resize', () => { if (S.tab === 'logs') lvDraw(); });

  S = load();
  render();
  if (mergedNote) { save(); toast(mergedNote, { label: 'Undo', fn: undo }); }
  if (S.settings.quickstart !== false) setTimeout(() => quickStart(0), 250);
})();
