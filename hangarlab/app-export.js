// HangarLab UI: dialogs, export and Settings.
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

// ---------- dialogs ----------
function openDlg(title, body, foot) {
  const d = $('#dlg');
  d.innerHTML = `<div class="dlg-h"><h2>${title}</h2><button class="btn ghost icon dlg-x" data-act="dlg-close" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div><div class="dlg-b">${body}</div><div class="dlg-f">${foot}</div>`;
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
  { const c = U.costOf(p, S.lib); if (c) add('Mass', 'Parts cost', c, S.settings.currency || '$'); const cg = U.cgOf(p, S.lib); if (cg.x != null) add('Mass', p.type === 'multirotor' ? 'CG from frame center' : 'CG', p.type === 'multirotor' ? cg.x : cg.pct, p.type === 'multirotor' ? 'mm' : '% MAC'); }
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
    add(s, 'Hover energy', R.mission.eHover, 'Wh'); if (R.trans) { add(s, 'Transitions', R.trans.n); add(s, 'Transition time (each)', R.trans.t, 's'); add(s, 'Transition energy (all)', R.mission.eTrans, 'Wh'); add(s, 'Hover thrust penalty', (R.kHover - 1) * 100, '%'); } if (fin(R.hoverWind)) add(s, 'Tailsitter hover wind limit', R.hoverWind, 'm/s'); add(s, 'Cruise energy', R.mission.eCruise, 'Wh'); add(s, 'Cruise time', R.mission.minutes, 'min'); add(s, 'Mission range', R.mission.km, 'km');
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

// print through a hidden frame; where the viewer blocks printing, fall back to a download
function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  f.srcdoc = html;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { download('hangarlab-print.html', html, 'text/html'); toast('Printing is blocked here: downloaded the page instead. Open it and print to PDF.'); } setTimeout(() => f.remove(), 60000); };
  document.body.appendChild(f);
}
function checklistHtml(p) {
  const R = U.compute(p, S.lib, { lite: true }), b = R.bat, bom = U.fullBom(p, S.lib);
  const radios = bom.filter((r) => r.rf).map((r) => `${r.name} (${(U.BANDS[r.rf] || {}).label || r.rf})`);
  const cg = U.cgOf(p, S.lib), mp = U.missionPlan(p, S.lib, U.compute(p, S.lib));
  const sec = (t, items) => `<h2>${t}</h2><ul>${items.filter(Boolean).map((x) => `<li><span class="box"></span>${x}</li>`).join('')}</ul>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(p.name)} — pre-flight checklist</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#15212b;max-width:720px;margin:24px auto;padding:0 18px}h1{font-size:20px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#546472;border-bottom:1px solid #d6dde3;padding-bottom:3px;margin:18px 0 6px}ul{list-style:none;padding:0;margin:0}li{display:flex;gap:10px;padding:4px 0;border-bottom:1px solid #eef1f4}.box{flex:none;width:14px;height:14px;border:1.5px solid #15212b;border-radius:3px;margin-top:3px}.sub{color:#546472;margin:2px 0 0}@media print{body{margin:0}}</style>
<h1>${esc(p.name)} — pre-flight checklist</h1><p class="sub">${TYPE_LABEL[p.type]} · AUW ${fmt(R.Wg, 0)} g · HangarLab · ${new Date().toLocaleDateString()}</p>
${sec('Site & weather', ['Airspace checked, permissions in hand', `Wind under ${fmt(p.type === 'multirotor' ? (R.vmax || 10) * 0.66 : Math.min((R.vmaxLevel || 20) * 0.66, p.fw.vc * 0.5), 0)} m/s`, `Air temperature near the planned ${p.env.temp} °C${b.coldF ? ' (cold: shorter flights)' : ''}`, 'Take-off / landing area clear, people briefed'])}
${sec('Battery', [`${b.packs > 1 ? `${b.packs}× ` : ''}${esc(p.batt.name || 'flight pack')}: ${b.S}S${b.P}P ${b.chem.label}`, `Fully charged: ${fmt(b.vMax, 1)} V (${b.chem.max} V per cell)`, 'No swelling, damage or hot cells; balance leads secure', 'Pack strapped and connector locked', `Land at ${p.mission && +p.mission.reserve ? `${p.mission.reserve} % extra reserve, ` : ''}${fmt(100 - (+p.batt.usable || 80), 0)} % left (usable ${p.batt.usable || 80} %)`])}
${sec('Airframe & propulsion', [`${p.type === 'fixedwing' ? p.fw.n : p.mr.n} props tight, right way round, undamaged`, 'Motors spin freely, no rubbing; bells and mounts tight', p.type !== 'multirotor' ? 'Control surfaces move the right way, no slop; hinges and horns secure' : 'Arms locked, frame bolts tight', cg.x != null ? (p.type === 'multirotor' ? `CG within 10 mm of the center (plan: ${fmt(cg.x, 0)} mm)` : `CG at ${fmt(cg.pct, 0)} % MAC (plan), check with the payload fitted`) : 'CG checked with the payload fitted', +p.payload.g ? `${esc(p.payload.name || 'Payload')} (${fmt(+p.payload.g, 0)} g) secured` : ''])}
${sec('Radios & avionics', ['Transmitter on, model selected, range check', ...radios.map((r) => `${esc(r)} linked, antennas undamaged`), 'GPS lock, enough satellites, home position set', 'Compass and accelerometer healthy; arming checks pass', 'Failsafe set: radio loss and low battery actions', bom.some((r) => /remote\s?id|\brid\b|beacon/i.test(r.name)) ? 'Remote ID broadcasting' : 'Remote ID (if required) broadcasting'])}
${sec('Mission', [mp ? `Mission plan ${mp.ok ? 'fits' : mp.okNominal ? 'is tight' : 'DOES NOT FIT'}: ${fmt(mp.total, 0)} of ${fmt(mp.avail, 0)} Wh` : 'Mission plan loaded', 'Geofence and RTL altitude set', 'Logging enabled'])}
${sec('After landing', ['Disarm, then unplug the battery', 'Note pack voltage and mAh used', 'Save the log; add it to the flight history in HangarLab'])}
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
      <button class="exp" data-act="print-report"><b>Print / save as PDF</b><span>the design report, straight to your printer or a PDF</span></button>
      <button class="exp" data-act="ex-html"><b>Design report</b><span>.html · one printable page</span></button>
      <button class="exp" data-act="checklist"><b>Pre-flight checklist</b><span>printable, built from this design's battery, radios and parts</span></button>
      <button class="exp" data-act="ex-param"><b>ArduPilot parameters</b><span>.param · battery, failsafe, motor and airspeed starting values for this design; load in Mission Planner / QGC</span></button>
      <button class="exp" data-act="checklist-dl"><b>Checklist file</b><span>.html · keep it on a phone or tablet in the field</span></button>
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
        ${num('settings.newDesign.alt', `Field elevation (MSL) ${tip('Height of the take-off site **above sea level (MSL)**, not above the ground. It sets the air density: thinner air at high sites means more power to hover and a higher stall speed.\n\n**0 m**  sea level\n**300 m**  typical inland field\n**1600 m**  Denver\n\nHow high you fly above the field is set in the Mission and Radio Link inputs.')}`, { st: true, unit: 'm' })}
        ${num('settings.newDesign.temp', 'Air temperature', { st: true, unit: '°C' })}
        <p class="hint">Applied when you click New. Existing designs keep their values.</p></div></div>

      <div class="card"><h2>Flight log viewer</h2><div class="fields" style="padding:10px 0 0">
        ${sel('settings.logs.speed', 'Default playback speed', [1, 2, 5, 10, 20, 50].map((x) => [x, x + '×']), { st: true, isNum: true })}
        ${sel('settings.logs.view', 'Open in', [['3d', '3D view'], ['map', 'Map'], ['map3d', '3D map (satellite)']], { st: true })}
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
        <div class="row"><button class="btn sm" data-act="backup-now">Back up now</button><button class="btn sm" data-act="tpl-download">Component template (.xlsx)</button><button class="btn sm" data-act="export">Export workspace…</button><button class="btn sm" data-act="import">Import…</button></div></div>

      <div class="card"><h2>Reset</h2><p class="note" style="margin:8px 0 10px">Both can be undone right after with Undo.</p>
        <div class="row"><button class="btn sm danger" data-act="clear-propdata"${propData ? '' : ' disabled'}>Remove all prop performance data</button><button class="btn sm danger" data-act="reset-examples">Replace everything with the example data</button></div></div>

      <div class="card"><h2>Keyboard shortcuts</h2><dl class="kv" style="margin-top:8px"><dt>Switch tab</dt><dd>1 – 9</dd><dt>Undo</dt><dd>Ctrl/⌘ + Z</dd><dt>Export</dt><dd>Ctrl/⌘ + E</dd><dt>Quick start guide</dt><dd>?</dd></dl>
        <div class="row" style="margin-top:12px"><button class="btn sm" data-act="shortcuts">Open quick start</button>${chk('settings.quickstart', 'Show the quick start next time the app opens', { st: true })}</div></div>

      <div class="card"><h2>About</h2>
        <p class="note" style="margin:8px 0 6px">HangarLab gives planning estimates, not guarantees. Check them against bench tests and test flights and follow your local aviation rules; the regulation notes are not legal advice. Your designs, library and logs stay in this browser.</p>
        <p class="note" style="margin:0 0 6px"><b>Libraries:</b> uPlot (MIT), Leaflet (BSD-2), three.js (MIT), SheetJS (Apache-2.0), LZMA-JS (MIT). Fonts: Barlow, Barlow Condensed, Roboto Mono (OFL / Apache-2.0).</p>
        <p class="note" style="margin:0"><b>Data:</b> satellite imagery © Esri, Maxar, Earthstar Geographics; street map © OpenStreetMap contributors; terrain heights from AWS Terrain Tiles (Mapzen, with SRTM, GMTED, ETOPO1 and other public sources); ArduPilot parameter descriptions from autotest.ardupilot.org (GPLv3); APC Propellers PER3 performance files. The flight-log viewer, health check and 3D map follow ArduPilot UAV Log Viewer, LogAnalyzer and Mission Planner but share no code with them.</p></div>
    </div></div>`;
  settingsLive();
}
function settingsLive() {
  const s = $('#setStore'); if (s) s.textContent = `${fmt(storageUse() / 1024, 0)} KB of about 5,000 KB`;
  const l = $('#setLearn');
  if (l) l.innerHTML = (S.lib.fleetFrom || []).length ? `Learned ×${fmt(S.lib.fleetK, 2)} from ${S.lib.fleetFrom.map((x) => esc(x[0])).join(', ')}.` : 'No flights marked as real measurements yet, so the default correction applies.';
}
