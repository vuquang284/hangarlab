// HangarLab UI: Parts Library tab and every import (template workbook, specs, APC data, thrust tests).
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

// ---------- LIBRARY ----------
const LIB_COLS = {
  motors: [['name', 'Motor', 'text', 210], ['brand', 'Brand', 'text', 100], ['kv', 'kV', 'number', 64], ['rm', 'Rm Ω', 'number', 70], ['i0', 'I0 A', 'number', 58], ['g', 'Weight g', 'number', 70, 'g>oz'], ['maxA', 'Max A', 'number', 60], ['maxW', 'Max W', 'number', 66], ['link', 'Link', 'text', 140], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
  props: [['name', 'Prop', 'text', 200], ['brand', 'Brand', 'text', 100], ['diam', 'Diameter in', 'number', 76], ['pitch', 'Pitch in', 'number', 70], ['g', 'Weight g', 'number', 76, 'g>oz'], ['link', 'Link', 'text', 160], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
  batteries: [['name', 'Pack', 'text', 240], ['brand', 'Brand', 'text', 110], ['chem', 'Chem', 'chem'], ['s', 'Cells S', 'number', 54], ['p', 'Cells P', 'number', 54], ['cellMah', 'Cell mAh', 'number', 76], ['g', 'Pack g', 'number', 70, 'g>oz'], ['c', 'Cont. C', 'number', 54], ['cPeak', 'Peak C', 'number', 54], ['link', 'Link', 'text', 120], ['cost', 'Cost', 'number', 64], ['buy', 'Buy link', 'text', 140]],
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
// brand: guessed once from the name (usually its first word), then editable. Some product lines don't carry the maker's name.
const BRAND_ALIAS = [[/^(hobbywing|xrotor)\b/i, 'Hobbywing'], [/^t-?motor\b/i, 'T-Motor'], [/^(iflight|xing2?)\b/i, 'iFlight'], [/^upgrade energy\b/i, 'Upgrade Energy']];
function brandGuess(name) {
  const n = String(name || '').trim(), a = BRAND_ALIAS.find(([rx]) => rx.test(n));
  if (a) return a[1];
  const w = n.split(/\s+/)[0] || '';
  return /^[A-Za-z][\w-]*$/.test(w) && !/^new$/i.test(w) ? w : '';
}
function fillBrands(lib) {
  for (const k of ['motors', 'props', 'batteries']) for (const x of lib[k] || []) if (x.brand == null) x.brand = brandGuess(x.name);
}
const nameOf = (kind, id) => ((S.lib[kind] || []).find((x) => x.id === id) || {}).name || '(deleted)';

// sorting and filtering change only the order shown: rows keep their index in S.lib, which the inputs and buttons use.
// Sort per section is saved in S.ui.libSort = {section: {k, dir}}; the filter text lasts for the session.
const libQ = {};
const libSortOf = (t) => ((S.ui && S.ui.libSort) || {})[t] || null;
// what a cell sorts and filters by: numbers as numbers, selects by their label, blanks as null (always last)
function libVal(x, c) {
  const v = x[c[0]];
  if (v == null || v === '') return null;
  if (c[2] === 'number') return isFinite(+v) ? +v : null;
  if (c[2] === 'chem') return (U.CELL[v] || {}).label || v;
  if (c[2] === 'mat') return (U.MATERIALS.find((m) => m.id === v) || {}).name || v;
  if (c[2] === 'sub') return subName(v);
  if (c[2] === 'rail') return (RAILS.find((r) => r[0] === v) || [, v])[1];
  if (c[2] === 'rf') return (RF_OPTS.find((r) => r[0] === v) || [, v])[1];
  return String(v);
}
function libOrder(t, cols) {
  const list = S.lib[t], idx = list.map((x, i) => i), st = libSortOf(t), c = st && cols.find((q) => q[0] === st.k);
  if (!c) return idx;
  const vals = list.map((x) => libVal(x, c));
  return idx.sort((a, b) => {
    const va = vals[a], vb = vals[b];
    if (va == null || vb == null) return va == null && vb == null ? a - b : va == null ? 1 : -1;
    const r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    return r * st.dir || a - b;
  });
}
// every word typed must appear somewhere in the row ("tattu 6s" finds Tattu 6S packs)
const libMatch = (text, q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
function libFilterApply() {
  const q = libQ[S.libTab] || '';
  let shown = 0, total = 0;
  document.querySelectorAll('tr[data-libq]').forEach((tr) => {
    const ok = libMatch(tr.dataset.libq, q);
    tr.hidden = !ok;
    if (!tr.classList.contains('mt-row')) { total++; if (ok) shown++; }
  });
  const n = $('#libCount');
  if (n) n.textContent = q.trim() ? `${shown} of ${total}` : '';
}

const mtOpen = new Set(); // motors whose thrust tests are expanded
function renderLibrary(el) {
  if (S.libTab === 'tests') S.libTab = 'motors';
  if (S.libTab === 'subs') S.libTab = 'parts';
  const t = S.libTab, L = S.lib;
  fillBrands(L);
  const tabs =[['motors', 'Motors & thrust data', L.motors.length], ['props', 'Props', L.props.length], ['batteries', 'Battery packs', L.batteries.length], ['parts', 'Components', L.parts.length], ['printed', '3D printed parts', (L.printed || []).length], ['airframes', 'Airframes', L.airframes.length]];
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
    const st = libSortOf(t), q = libQ[t] || '';
    const th = (c) => {
      const on = st && st.k === c[0], label = c[1].replace(/<[^>]*>/g, '');
      return `<th aria-sort="${on ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="th-sort" data-act="lib-sort" data-k="${c[0]}" title="Sort by ${esc(label)}${c[0] === 'name' ? ' (groups brands together)' : ''}">${c[1]}<span class="sort-ind" aria-hidden="true">${on ? (st.dir > 0 ? '▲' : '▼') : '↕'}</span></button></th>`;
    };
    const rowText = (x) => cols.map((c) => libVal(x, c) ?? '').join(' ').toLowerCase();
    body = `<div class="row lib-tools"><input type="search" id="libFilter" value="${esc(q)}" placeholder="Filter, e.g. Tattu or 6S" aria-label="Filter this section" style="max-width:260px">
        <span class="note" id="libCount"></span>${st ? `<button class="btn ghost sm" data-act="lib-sort-clear">Library order</button>` : ''}<span class="note">Click a column heading to sort.</span></div>
      <div class="tbl-wrap"><table><thead><tr>${cols.map(th).join('')}${extra}<th>Use in ${esc(P().name)}</th><th></th></tr></thead><tbody>
      ${libOrder(t, cols).map((i) => { const x = L[t][i], rq = esc(rowText(x)), hid = libMatch(rowText(x), q) ? '' : ' hidden'; return `<tr data-libq="${rq}"${hid}>${cols.map((c) => `<td>${cell(`${t}.${i}.${c[0]}`, c, x[c[0]])}</td>`).join('')}${extraCell(x, i)}<td><div class="row" style="flex-wrap:nowrap">${acts(i)}</div></td><td><button class="btn ghost sm danger" data-act="lib-del" data-kind="${t}" data-i="${i}" aria-label="Delete">×</button></td></tr>${t === 'motors' && mtOpen.has(x.id) ? `<tr class="mt-row" data-libq="${rq}"${hid}><td colspan="${cols.length + 3}">${testRows(x.id)}</td></tr>` : ''}`; }).join('')}
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
      <div class="row"><span class="note">Shared by every design.</span><button class="btn sm" data-act="team-open"${window.claude && window.claude.use ? '' : ' hidden'} title="Share this library with everyone who can open the app">Team library</button><button class="btn sm" data-act="tpl-download" title="Excel workbook with a sheet per component type">Download template</button><button class="btn sm primary" data-act="tpl-import">Import workbook</button></div></div>
    <div class="row" style="margin-bottom:12px"><label class="f" style="min-width:240px"><span>Library section</span><select id="libSection">${tabs.map(([k, l, n]) => `<option value="${k}"${k === t ? ' selected' : ''}>${l} (${n})</option>`).join('')}</select></label></div>
    <div class="sub-tabs">${tabs.map(([k, l, n]) => `<button class="btn${k === t ? ' primary' : ''}" data-libtab="${k}">${l} <span class="num" style="opacity:.7">${n}</span></button>`).join('')}</div>${body}${subsBody}</div>`;
  libFilterApply();
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
  motors: [['brand', /brand|make|manufacturer|vendor/i], ['name', /name|model|motor/i], ['kv', /\bkv\b|rpm\s*\/\s*v/i], ['i0v', /(i0|io|no.?load).*(volt|\(v\)|@)/i], ['rm', /\brm\b|resist|ohm|mΩ|mohm|Ω/i], ['i0', /\bi0\b|\bio\b|no.?load|idle/i], ['maxA', /max.*(curr|amp|\(a\))|\bimax|peak.*curr|max\s*a\b/i], ['maxW', /max.*(pow|watt|\(w\))|\bpmax|max\s*w\b/i], ['g', /weight|mass|\bg\b|gram/i], ['buy', /buy|purchase|shop|store|order/i], ['cost', /cost|price/i], ['link', /link|url/i]],
  props: [['brand', /brand|make|manufacturer|vendor/i], ['name', /name|model|prop/i], ['diam', /diam|\bdia\b|\bd\b/i], ['pitch', /pitch|\bp\b/i], ['g', /weight|mass|\bg\b|gram/i], ['buy', /buy|purchase|shop|store|order/i], ['cost', /cost|price/i], ['link', /link|url/i]],
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
    for (const k in map) if (k !== 'name' && r[map[k]] != null && r[map[k]] !== '') o[k] = k === 'link' || k === 'buy' || k === 'brand' ? String(r[map[k]]) : +r[map[k]];
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
    <p class="note">Paste rows from a spreadsheet or datasheet, or load a CSV / Excel file. A header row is needed; these columns are recognized in any order: <b>${cols}</b>. Existing ${kind} with the same name are updated.</p>
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
    <div class="tbl-wrap" style="max-height:220px"><table><thead><tr>${keys.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>${items.slice(0, 50).map((o) => `<tr>${keys.map((k) => `<td>${esc(o[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="hint">No rows recognized yet. Include a header row.</p>';
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
  $('#pd-out').innerHTML = d ? `Read <b>${d.rpm.length}</b> RPM table(s), ${d.tab.reduce((a, t) => a + t.length, 0)} points (${esc(d.src)}).` : $('#pd-box').value.trim() ? '<span style="color:var(--crit)">Not recognized. Check the header names, and set the prop diameter for static tables.</span>' : '';
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
