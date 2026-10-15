// HangarLab UI: Parts & Weight, Electrical and Radio Link tabs.
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

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
// antenna finder: every aircraft omni × every ground antenna, ranked by whether it reaches the range, then by how
// simple it is to own (omni < patch < panel/helical < yagi; directional ones need aiming or a tracker), then margin
const ANT_EASE = { dipole: 0, collinear: 1, mushroom: 1, patch8: 2, panel14cp: 3, helical12: 3, yagi15: 4 };
function antennaOptions(l, d) {
  const out = [];
  for (const [ta, A] of Object.entries(U.ANTENNAS)) {
    if (A.bw < 360) continue; // aircraft side stays omni: it turns and banks
    for (const [ra, B] of Object.entries(U.ANTENNAS)) {
      const pl = U.polLoss(A.pol, B.pol), pol = pl === 0 ? 'same' : pl === 3 ? 'cl' : 'lr';
      const r = U.link(Object.assign({}, l, { txG: A.g, rxG: B.g, pol }), d);
      out.push({ ta, ra, A, B, r, ok: r.margin >= d.fade, ease: ANT_EASE[ta] + ANT_EASE[ra] * 2 + (pl === 25 ? 10 : 0) });
    }
  }
  return out.sort((x, y) => (y.ok - x.ok) || (x.ok ? x.ease - y.ease : y.r.margin - x.r.margin) || y.r.margin - x.r.margin);
}
function antennaFinder(x, d) {
  const l = x.l, opts = antennaOptions(l, d), ok = opts.filter((o) => o.ok);
  const cur = U.link(l, d), need = d.fade - cur.margin, hor = U.radioHorizonKm(d.alt, d.gndH);
  const top = (ok.length ? ok : opts).slice(0, 5);
  const rate = U.RADIOS[l.preset] && U.RADIOS[l.preset].airmax ? (() => {
    // fastest airMAX rate that still reaches the range with the current antennas
    const cap = U.RADIOS[l.preset].airmax;
    let best = -1;
    U.AIRMAX.forEach((rr, i) => { if (U.link(Object.assign({}, l, { tx: Math.min(rr[1], cap), sens: rr[2] }), d).margin >= d.fade) best = i; });
    return best < 0 ? `<p class="hint" style="color:var(--crit)">No airMAX data rate reaches ${fmt(d.dist, 1)} km with these antennas.</p>` : `<p class="hint">Fastest data rate that reaches ${fmt(d.dist, 1)} km with these antennas: <b>${esc(U.AIRMAX[best][0])}</b>${best !== +l.rate ? ` <button class="btn sm" data-act="rf-rate" data-k="${x.key}" data-i="${best}">Use it</button>` : ''}</p>`;
  })() : '';
  return `<h3 style="margin:12px 0 4px">Antennas for ${fmt(d.dist, 1)} km ${need > 0 ? `<span class="pill crit">now ${fmt(need, 1)} dB short</span>` : '<span class="pill good">current setup reaches it</span>'}</h3>
    ${ok.length ? '' : `<p class="hint" style="color:var(--crit)">No antenna pair reaches ${fmt(d.dist, 1)} km at ${d.fade} dB margin with this radio. Closest options below; also consider more TX power, a lower data rate, or a lower fade margin.</p>`}
    <div class="tbl-wrap"><table class="mis"><thead><tr><th>Aircraft antenna</th><th>Ground antenna</th><th class="n">Margin at ${fmt(d.dist, 1)} km</th><th class="n">Max range</th><th>Aiming</th><th></th></tr></thead><tbody>
    ${top.map((o) => `<tr${o.ok ? '' : ' style="opacity:.65"'}><td>${esc(o.A.label)}</td><td>${esc(o.B.label)}</td><td class="n${o.ok ? '' : ' bad'}">${fmt(o.r.margin, 1)} dB</td><td class="n">${o.r.maxKm > hor ? `${fmt(hor, 0)} km <span class="faint" title="Radio range ${fmt(o.r.maxKm, 0)} km, but the earth's curve blocks line of sight first at this height">horizon</span>` : `${fmt(o.r.maxKm, o.r.maxKm < 10 ? 1 : 0)} km`}</td><td>${o.B.bw >= 360 ? 'none' : o.B.bw >= 60 ? 'point at the area' : 'tracker or careful aiming'}</td><td>${l.txAnt === o.ta && l.rxAnt === o.ra ? '<span class="faint">in use</span>' : `<button class="btn sm" data-act="rf-ant" data-k="${x.key}" data-tx="${o.ta}" data-rx="${o.ra}">Use</button>`}</td></tr>`).join('')}
    </tbody></table></div>${rate}`;
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
      <div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr));padding:8px 0 0">
        ${sel(`${k}.preset`, `Radio preset ${tip('Fills frequency, TX power and sensitivity from the datasheet. Edit them afterwards if your firmware or air rate differs.')}`, [['', 'Custom']].concat(Object.entries(U.RADIOS).map(([a, b]) => [a, b.label])), { rebuild: true })}
        ${U.RADIOS[x.l.preset] && U.RADIOS[x.l.preset].airmax ? sel(`${k}.rate`, `Data rate ${tip('airMAX ac: higher data rates need a stronger signal (worse sensitivity) and the radio lowers its TX power. Pick the rate you need for video.')}`, U.AIRMAX.map((r, i) => [String(i), `${r[0]} · ${Math.min(r[1], U.RADIOS[x.l.preset].airmax)} dBm · ${r[2]} dBm`]), { rebuild: true }) : ''}
        ${sel(`${k}.txAnt`, 'Aircraft antenna', [['', 'Custom']].concat(Object.entries(U.ANTENNAS).map(([a, b]) => [a, b.label])), { rebuild: true })}
        ${sel(`${k}.rxAnt`, 'Ground antenna', [['', 'Custom']].concat(Object.entries(U.ANTENNAS).map(([a, b]) => [a, b.label])), { rebuild: true })}
      </div>
      <dl class="kv" style="margin-top:12px" id="${k}-out"></dl>
      <p class="note" id="${k}-ant" style="margin:10px 0 0"></p>
      <div class="ant-find" id="${k}-find"></div>
      <div class="checks" id="${k}-geo" style="margin-top:8px"></div>
      <details class="rf-math" style="margin-top:8px"><summary>Path loss, step by step</summary><div id="${k}-math"></div></details>
      ${x.manual != null ? `<button class="btn ghost sm danger" data-act="rf-del" data-i="${x.manual}" style="margin-top:8px">Remove link</button>` : ''}
    </div>`;
  };
  const conf = U.rfConflicts(p.bom.filter((r) => r.rf).map((r) => r.rf).concat(p.bom.some((r) => /gps|gnss|here\s?\d|rtk/i.test(r.name)) ? ['gnss'] : []));
  el.innerHTML = `<div class="bench"><aside class="side">${sideTools}
      ${group('Mission geometry', `${num('rf.dist', `Range you need ${tip('The farthest the aircraft will be from the ground station. Each radio card lists the antennas that reach it with your fade margin.')}`, { unit: 'km' })}${num('rf.alt', 'Drone altitude AGL', { unit: 'm' })}${num('rf.gndH', 'Ground antenna height', { unit: 'm' })}${num('rf.fade', 'Required fade margin', { unit: 'dB' })}<p class="hint" id="rfGeo"></p>`)}
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
    // geometry checks: directional ground antenna beam, omni nulls overhead, the other band for comparison
    const geo = [], h = d.alt - d.gndH, elev = (Math.atan2(h, d.dist * 1000) * 180) / Math.PI;
    const ra = U.ANTENNAS[x.l.rxAnt], ta = U.ANTENNAS[x.l.txAnt];
    if (ra && ra.bw < 360) {
      const wide = 2 * d.dist * 1000 * Math.tan((ra.bw / 2) * Math.PI / 180), inside = elev <= ra.bw / 2;
      const near = h / Math.tan((ra.bw / 2) * Math.PI / 180);
      geo.push([inside ? 'good' : 'warn', `Ground ${ra.label.split(',')[0].toLowerCase()} (${ra.bw}° beam): ${fmt(wide, 0)} m wide at ${fmt(d.dist, 1)} km, so the drone must stay in that corridor or the antenna needs a tracker. Closer than ${fmt(near, 0)} m at ${fmt(h, 0)} m height it is above the beam.`]);
    }
    if ((!ta || ta.bw === 360) && h > 0) {
      const r60 = h / Math.tan(Math.PI / 3);
      geo.push([elev > 60 ? 'crit' : 'info', `Aircraft omni antenna: weak straight down/up (null). Within ${fmt(r60, 0)} m of the ground station at ${fmt(h, 0)} m height the drone is more than 60° overhead and the link can fade; avoid passing directly over it.`]);
    }
    const pl = U.polLoss(ta && ta.pol, ra && ra.pol);
    if (pl != null && pl !== (U.POL[x.l.pol] || U.POL.same).db) geo.push(['warn', `Antenna polarisations (${ta.pol.toUpperCase()} ↔ ${ra.pol.toUpperCase()}) mean a ${pl} dB loss; the Polarization field says ${(U.POL[x.l.pol] || U.POL.same).db} dB.`]);
    if (x.l.mhz > 2000) {
      const other = x.l.mhz > 4000 ? 2440 : 5800, ro2 = U.link(Object.assign({}, x.l, { mhz: other }), d);
      geo.push(['info', `Same radio and antennas at ${other > 4000 ? '5.8' : '2.4'} GHz: ${fmt(ro2.margin, 1)} dB margin (${ro2.margin >= r.margin ? '+' : ''}${fmt(ro2.margin - r.margin, 1)} dB), max range ${fmt(ro2.maxKm, 1)} km. 2.4 GHz reaches further and gets through obstacles better; 5.8 GHz has more channel bandwidth for video.`]);
    }
    const af = document.getElementById(`${x.key}-find`); if (af) af.innerHTML = antennaFinder(x, d);
    const ge = document.getElementById(`${x.key}-geo`);
    if (ge) ge.innerHTML = geo.map(([lv, msg]) => `<div class="chk"><span class="pill ${lv}">${{ good: 'OK', warn: 'Check', crit: 'Fix', info: 'Note' }[lv]}</span><span>${esc(msg)}</span></div>`).join('');
    // FSPL = 20·log10(d) + 20·log10(f) + 20·log10(4π/c), then the link budget around it
    const slm = r.slant * 1000, fHz = x.l.mhz * 1e6, t1 = 20 * Math.log10(slm), t2 = 20 * Math.log10(fHz), t3 = 20 * Math.log10((4 * Math.PI) / 299792458);
    const mt = document.getElementById(`${x.key}-math`);
    if (mt) mt.innerHTML = `<dl class="kv" style="margin-top:8px;font-size:12.5px">
      <dt>20·log₁₀(d), d = ${fmt(slm, 0)} m slant</dt><dd>${fmt(t1, 2)} dB</dd>
      <dt>20·log₁₀(f), f = ${fmt(x.l.mhz, 0)} MHz</dt><dd>${fmt(t2, 2)} dB</dd>
      <dt>20·log₁₀(4π/c)</dt><dd>${fmt(t3, 2)} dB</dd>
      <dt><b>Free-space path loss</b></dt><dd><b>${fmt(t1 + t2 + t3, 2)} dB</b></dd>
      <dt>− TX antenna gain</dt><dd>−${fmt(x.l.txG, 2)} dB</dd><dt>− RX antenna gain</dt><dd>−${fmt(x.l.rxG, 2)} dB</dd>
      <dt>Net path loss</dt><dd>${fmt(t1 + t2 + t3 - x.l.txG - x.l.rxG, 2)} dB</dd>
      <dt>TX power − cable − polarisation</dt><dd>${fmt(x.l.tx, 1)} − ${fmt(x.l.loss, 1)} − ${fmt(r.polDb, 1)} dBm</dd>
      <dt>Received level</dt><dd>${fmt(x.l.tx - x.l.loss - r.polDb - (t1 + t2 + t3 - x.l.txG - x.l.rxG), 2)} dBm</dd>
      <dt>Sensitivity</dt><dd>${fmt(x.l.sens, 1)} dBm</dd><dt><b>Margin</b></dt><dd><b>${fmt(r.margin, 2)} dB</b></dd></dl>`;
    data.push(xs.map((km) => U.link(x.l, { dist: km, alt: d.alt, gndH: d.gndH, fade: d.fade }).margin));
    ser.push({ label: x.name, color: cssv(`--c${(i % 8) + 1}`) });
  });
  if (!links.length) { $('#chRF').innerHTML = '<p class="faint">No links to plot.</p>'; return; }
  data.push(xs.map(() => d.fade));
  ser.push({ label: 'Required', color: cssv('--faint'), dash: [5, 5], w: 1 });
  chart('chRF', { xLabel: 'Distance (km)', u: ['km'], xLog: true, xDec: 2, data, yLabel: 'Link margin (dB)', series: ser, marks: [{ x: d.dist, label: 'mission', color: cssv('--accent') }], h: 280 });
}
