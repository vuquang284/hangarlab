// HangarLab UI: quick start, Compare tab, events and start-up (load last).
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

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
      <li><b>Parts &amp; Weight</b>: add parts from the library or paste rows from a spreadsheet. Set each part’s rail (5 V, 12 V, VBAT…), RF band, cost, buy link and position for the balance (CG). <b>Full BOM report</b> combines several designs into one purchase list.</li>
      <li><b>Electrical</b>: regulator sizes, PDB rating, connector and wire gauge from those rails.</li>
      <li><b>Radio Link</b>: margin and maximum range for each radio, Fresnel clearance and antenna suggestions.</li>
      <li><b>3D Printing</b>: rank filaments for heat, UV and impacts; load an STL to estimate the printed part’s mass.</li>
    </ul>` },
  { title: '4 · Check against a real flight', tab: 'logs', body: `
    <p>In <b>Flight Logs</b>, drop an ArduPilot <b>.bin</b> or <b>.log</b>.</p>
    <ul class="qs-list">
      <li>Plot presets, any field, or expressions such as <code>BAT.Volt * BAT.Curr</code>.</li>
      <li>3D path or map colored by flight mode, with play/pause.</li>
      <li>Parameters and events (modes, errors, arm/disarm).</li>
      <li><b>Design vs log</b> compares the logged power with your design’s prediction.</li>
      <li>The flight-mode table shows cruise speed and current per mode: <b>Calibrate</b> a design from it, or <b>build its mission profile</b> from the flight.</li>
    </ul>` },
  { title: '5 · Saving, sharing and shortcuts', tab: null, body: `
    <ul class="qs-list">
      <li><b>Autosave</b>: every change is kept in this browser. Automatic backups are in <b>Settings</b>.</li>
      <li><b>Export</b>: Excel workbook, report, CSV, or a workspace backup to move your work to another computer (<b>Import</b> in the top bar reads it).</li>
      <li><b>Metric / Imperial</b> at the right of the tab bar; theme, estimates and advanced mode under <b>Settings</b> (gear icon).</li>
    </ul>
    <dl class="kv" style="margin-top:10px"><dt>Switch tab</dt><dd>1 – 9</dd><dt>Undo</dt><dd>Ctrl/⌘ + Z</dd><dt>Export</dt><dd>Ctrl/⌘ + E</dd><dt>This guide</dt><dd>?</dd></dl>` },
];
let qsStep = 0;
function quickStart(step = 0) {
  qsStep = Math.max(0, Math.min(QS_STEPS.length - 1, step));
  const st = QS_STEPS[qsStep], last = qsStep === QS_STEPS.length - 1;
  openDlg(`<span class="qs-title">${st.title}</span>`, `<div class="qs">${st.body}</div>
    <div class="qs-dots" role="tablist">${QS_STEPS.map((x, i) => `<button data-qs="${i}" aria-label="Step ${i + 1}" aria-current="${i === qsStep}"></button>`).join('')}</div>`,
    `<span class="faint" style="margin-right:auto;font-size:13px">Reopen any time with the ? button</span>
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
    // radio link presets fill the numbers they stand for
    const rfm = k.match(/^(rf\.(?:links|manual)\.[^.]+)\.(preset|rate|txAnt|rxAnt)$/);
    if (rfm) {
      const l = getPath(P(), rfm[1]), rad = U.RADIOS[l.preset];
      if (rfm[2] === 'preset' && rad) { l.mhz = rad.mhz; if (rad.airmax) { if (l.rate == null || l.rate === '') l.rate = '0'; } else { l.tx = rad.tx; l.sens = rad.sens; } }
      if (rad && rad.airmax && (rfm[2] === 'preset' || rfm[2] === 'rate')) { const rr = U.AIRMAX[+l.rate || 0]; l.tx = Math.min(rr[1], rad.airmax); l.sens = rr[2]; }
      const ta = U.ANTENNAS[l.txAnt], ra = U.ANTENNAS[l.rxAnt];
      if (rfm[2] === 'txAnt' && ta) l.txG = ta.g;
      if (rfm[2] === 'rxAnt' && ra) l.rxG = ra.g;
      if ((rfm[2] === 'txAnt' || rfm[2] === 'rxAnt') && ta && ra) { const pl = U.polLoss(ta.pol, ra.pol); l.pol = pl === 0 ? 'same' : pl === 3 ? 'cl' : 'lr'; }
    }
    if (k === 'vtol.kind') { const vd = U.VTOL_DEF[el.value]; if (vd) Object.assign(P().vtol, { accel: vd.acc, hoverPen: vd.pen }); } // switch to that type's typical values
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
  const b = e.target.closest('[data-act],[data-tab],[data-settype],[data-libtab],[data-massview],[data-units],[data-detail]');
  if (!b) return;
  if (b.tagName === 'A' && b.getAttribute('href') === '#') e.preventDefault();
  if (b.dataset.units) { S.units = b.dataset.units; save(); render(); toast(S.units === 'imperial' ? 'Imperial units (stored in metric; exports stay metric)' : 'Metric units'); return; }
  if (b.dataset.tab) { lvs.playing = false; if (lmap) { lmap.remove(); lmap = null; } S.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); return; }
  if (b.dataset.settype) { P().type = b.dataset.settype; save(); render(); return; }
  if (b.dataset.libtab) { S.libTab = b.dataset.libtab; save(); render(); return; }
  if (b.dataset.detail) { S.settings.detail = b.dataset.detail; save(); render(); return; }
  if (b.dataset.massview) { S.massView = b.dataset.massview; save(); render(); return; }
  const p = P(), i = +b.dataset.i;
  switch (b.dataset.act) {
    case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); render(); break;
    case 'wiz': wizard(+b.dataset.step); break;
    case 'wiz-go': wizardCreate(); break;
    case 'new':
      wiz = { step: 0, name: 'New design', type: 'fixedwing', kind: 'quadplane', bat: (S.lib.batteries[0] || {}).id || '', packs: 1, motor: '', prop: '', auto: true, payload: 0, airframe: '' };
      wizard(0);
      break;
    case 'new-go': {
      const type = $('#nd-type').value;
      const base = clone(window.UAS_SEED.projects.find((x) => x.type === type));
      base.id = 'p-' + uid(); base.name = $('#nd-name').value || 'New design'; delete base.versions; delete base.flights; fixDesign(base);
      Object.assign(base.batt, { usable: S.settings.newDesign.usable }); Object.assign(base.env, { alt: S.settings.newDesign.alt, temp: S.settings.newDesign.temp });
      S.projects.push(base); S.active = base.id; closeDlg(); save(); render(); break;
    }
    case 'dup': { const c = clone(p); c.id = 'p-' + uid(); c.name = p.name + ' (copy)'; delete c.versions; S.projects.push(c); S.active = c.id; save(); render(); toast('Duplicated'); break; }
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
    case 'find-mp': finderDialog('mp', b.dataset.role); break;
    case 'find-bat': finderDialog('bat'); break;
    case 'find-undo': {
      const key = b.dataset.key, k = `${p.id}:${key}`, prev = finderPrev[k];
      if (!prev) break;
      delete finderPrev[k];
      withUndo(`${p.name}: back to ${prev.label}`, () => {
        if (prev.batt) p.batt = clone(prev.batt); else { p[key].motor = prev.motor; p[key].prop = prev.prop; }
        syncLib();
      });
      break;
    }
    case 'regs': regsDialog(); break;
    case 'find-use': {
      const r = finderLast && finderLast[i];
      if (!r) break;
      closeDlg();
      const key = r.apply.motor ? r.apply.role : 'bat';
      finderPrev[`${p.id}:${key}`] = r.apply.motor
        ? { label: `${nameOf('motors', p[key].motor)} + ${nameOf('props', p[key].prop)}`, motor: p[key].motor, prop: p[key].prop }
        : { label: p.batt.name || 'the previous pack', batt: clone(p.batt) };
      withUndo(`${p.name}: now using ${r.label}`, () => {
        if (r.apply.motor) { p[r.apply.role].motor = r.apply.motor; p[r.apply.role].prop = r.apply.prop; }
        else { p.batt.ref = r.apply.bat; delete p.batt.unlinked; p.batt.packs = r.apply.packs; p.batt.conn = 'parallel'; syncLib(); }
      });
      break;
    }
    case 'ver-save': {
      const snap = clone(p); delete snap.versions; delete snap.flights;
      p.versions = p.versions || [];
      p.versions.unshift({ name: `v${p.versions.length + 1}${p.notes ? ` · ${String(p.notes).split('\n')[0].slice(0, 40)}` : ''}`, at: Date.now(), data: snap });
      if (p.versions.length > 20) p.versions.length = 20;
      save(); render(); toast('Version saved. Rename it in the Vehicle panel.'); break;
    }
    case 'ver-restore': {
      const v = p.versions[i];
      withUndo(`${p.name} restored to ${v.name}`, () => { const keep = { id: p.id, versions: p.versions, flights: p.flights }; for (const k of Object.keys(p)) delete p[k]; Object.assign(p, clone(v.data), keep); fixDesign(p); });
      break;
    }
    case 'ver-del': withUndo('Version deleted', () => p.versions.splice(i, 1)); break;
    case 'fl-del': withUndo('Flight removed from history', () => p.flights.splice(i, 1)); break;
    case 'print-report': printHtml(reportHtml(p)); break;
    case 'checklist': printHtml(checklistHtml(p)); break;
    case 'ex-param': {
      const R = U.compute(p, S.lib), rows = U.apParams(p, R);
      const txt = [`# ${p.name}: starting parameters from HangarLab (${new Date().toISOString().slice(0, 10)})`, '# Check each value against your hardware before flying. Rule-of-thumb values are marked in the comments.']
        .concat(rows.map(([k, v, n]) => `${k},${v}${n ? `\t# ${n}` : ''}`)).join('\n') + '\n';
      download(`${fileBase(p)}.param`, txt, 'text/plain');
      break;
    }
    case 'checklist-dl': download(`${fileBase(p)}-preflight.html`, checklistHtml(p), 'text/html'); break;
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
    case 'rf-ant': case 'rf-rate': {
      const l = getPath(p, b.dataset.k);
      if (!l) break;
      withUndo(b.dataset.act === 'rf-ant' ? `Antennas: ${U.ANTENNAS[b.dataset.tx].label} + ${U.ANTENNAS[b.dataset.rx].label}` : `Data rate: ${U.AIRMAX[i][0]}`, () => {
        if (b.dataset.act === 'rf-ant') {
          const A = U.ANTENNAS[b.dataset.tx], B = U.ANTENNAS[b.dataset.rx], pl = U.polLoss(A.pol, B.pol);
          Object.assign(l, { txAnt: b.dataset.tx, rxAnt: b.dataset.rx, txG: A.g, rxG: B.g, pol: pl === 0 ? 'same' : pl === 3 ? 'cl' : 'lr' });
        } else { const rr = U.AIRMAX[i]; Object.assign(l, { rate: String(i), tx: Math.min(rr[1], U.RADIOS[l.preset].airmax), sens: rr[2] }); }
      });
      break;
    }
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
    case 'lib-sort': { // ascending → descending → library order
      const t = S.libTab, k = b.dataset.k, cur = libSortOf(t);
      S.ui = S.ui || {}; S.ui.libSort = S.ui.libSort || {};
      if (!cur || cur.k !== k) S.ui.libSort[t] = { k, dir: 1 };
      else if (cur.dir > 0) S.ui.libSort[t] = { k, dir: -1 };
      else delete S.ui.libSort[t];
      save(); render(); break;
    }
    case 'lib-sort-clear': { if (S.ui && S.ui.libSort) delete S.ui.libSort[S.libTab]; save(); render(); break; }
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

// phone header ⋯ menu: opens on its button, closes on any other click (menu items still run their own action) or Escape
const moreSet = (open) => { $('.actions').classList.toggle('open', open); $('#moreBtn').setAttribute('aria-expanded', open); };
document.addEventListener('click', (e) => { const open = !!e.target.closest('#moreBtn') && !$('.actions').classList.contains('open'); moreSet(open); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.actions').classList.contains('open')) moreSet(false); });

// library filter: hide rows in place (a re-render would take focus out of the box)
document.addEventListener('input', (e) => { if (e.target.id === 'libFilter') { libQ[S.libTab] = e.target.value; libFilterApply(); } });

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
// first visit only; the ? button (or the setting) brings it back
if (S.settings.quickstart !== false) { S.settings.quickstart = false; save(); setTimeout(() => quickStart(0), 250); }
