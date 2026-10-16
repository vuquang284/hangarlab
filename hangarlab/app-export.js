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
// file names: <design>-<what>-<date>, e.g. Example-fixed-wing-calculations-2026-10-16
const fileBase = (p, kind) => `${p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'design'}${kind ? '-' + kind : ''}-${stamp()}`;
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
  if (R.ff) out['Power vs airspeed'] = [['Airspeed m/s', 'Power W', 'Endurance min', 'Range km', 'Tilt deg']].concat(R.ff.map((x) => [x.V, +x.P.toFixed(1), +x.minutes.toFixed(2), +x.km.toFixed(3), +x.tilt.toFixed(1)]));
  else if (R.fwCurve) out['Power vs airspeed'] = [['Airspeed m/s', 'Power W', 'Endurance min', 'Range km', 'Climb m/s', 'CL']].concat(R.fwCurve.map((x) => [+x.V.toFixed(2), +x.P.toFixed(1), +x.minutes.toFixed(2), +x.km.toFixed(3), +x.roc.toFixed(2), +x.CL.toFixed(3)]));
  out['Battery size trade'] = [['Capacity mAh', 'Pack g', 'AUW g', 'Minutes']].concat(U.batterySweep(p, S.lib).map((x) => [Math.round(x.mah), +x.g.toFixed(1), +x.auw.toFixed(1), fin(x.minutes) ? +x.minutes.toFixed(2) : '']));
  out['Payload trade'] = [['Payload g', 'Minutes', 'Hover throttle %', 'Range km']].concat(U.payloadSweep(p, S.lib).map((x) => [Math.round(x.g), fin(x.minutes) ? +x.minutes.toFixed(2) : '', fin(x.thr) ? +x.thr.toFixed(1) : '', fin(x.km) ? +x.km.toFixed(2) : '']));
  const set = R.h ? R.h.set : R.cruiseSet;
  if (set && set.rows.length) out['Motor thrust curve'] = [['Throttle %', 'Thrust g', 'Current A', `${set.name} · ${set.physics ? 'physics estimate' : `bench at ${set.v} V`}`]].concat(set.rows.map((r) => [r[0] ?? '', +(+r[1]).toFixed(1), +(+r[2]).toFixed(2)]));
  return out;
}

// The worked calculation: constants and assumptions first, then every input, then each result as a live Excel formula
// of the cells above. Items: { sec } | { label, sym, v | f, unit, how, kind }. `f` uses {sym} for other cells. Parts the
// app solves numerically (thrust curves, prop data, drag build-up) come in as inputs with their source, so the formulas
// still add up to the app's numbers.
function workedCalc(p, R, mp) {
  const it = [], sec = (t) => it.push({ sec: t });
  const put = (kind) => (label, sym, v, unit, how) => it.push({ label, sym, v: fin(+v) ? +v : v, unit, how, kind });
  const con = put('const'), asm = put('assume'), inp = put('input');
  const calc = (label, sym, f, unit, how) => it.push({ label, sym, f, unit, how, kind: 'calc' });
  const b = R.bat, coax = R.h && (U.LAYOUTS[p.mr.layout] || {}).coax, f = p.fw;
  sec('Constants');
  con('Sea-level standard pressure', 'P0', 101325, 'Pa', 'International Standard Atmosphere');
  con('Pressure lapse coefficient', 'kP', 2.25577e-5, '1/m', 'Standard atmosphere, below 11 km');
  con('Pressure lapse exponent', 'nP', 5.25588, '', 'Standard atmosphere, below 11 km');
  con('Gas constant of dry air', 'Rair', 287.05, 'J/(kg·K)', 'Physics');
  con('Celsius to kelvin', 'TK', 273.15, 'K', 'Physics');
  con('Sea-level standard density', 'rho0', 1.225, 'kg/m³', 'International Standard Atmosphere');
  con('Gravity', 'g', 9.80665, 'm/s²', 'Standard gravity');
  sec('Assumptions');
  asm('Usable share of the battery', 'use', p.batt.usable, '%', 'Design input: how deep you plan to discharge');
  asm('Cold-weather capacity factor', 'cold', b.coldF || 1, '', b.coldF ? `Typical capacity loss at ${p.env.temp} °C` : 'No loss at 10 °C and above');
  asm('Regulator efficiency', 'bec', p.becEff || 90, '%', 'Used in the electronics power below');
  if (R.h) {
    asm('Hover thrust factor', 'kH', R.kHover || 1, '', p.type === 'vtol' ? 'Extra thrust for the airframe in the prop wash' : 'None for multirotors');
    asm('Coaxial thrust factor', 'cf', coax ? 0.85 : 1, '', coax ? "Lower rotor works in the upper one's wash" : 'Not coaxial');
    asm('Coaxial power factor', 'cp', coax ? 1.22 : 1, '', coax ? 'Extra power for the same thrust, coaxial pair' : 'Not coaxial');
  }
  if (R.cruise) {
    asm('Drag correction', 'k', R.kUsed, '', { calibrated: 'Calibrated from your flight', learned: 'Learned from your calibrated flights', default: 'Default gap between theory and real flights' }[R.kSource] || R.kSource);
    if (!R.propModel) {
      asm('Prop efficiency', 'etaP', f.etaP, '%', 'Design input');
      asm('Motor + ESC efficiency', 'etaD', f.etaD, '%', 'Design input');
      asm('Prop type factor', 'pk', f.propOther ? 0.85 : 1, '', f.propOther ? 'Prop differs from its data (−15 %)' : 'Prop matches its data');
    }
  }
  sec('Air');
  inp('Field altitude (above sea level)', 'h', p.env.alt, 'm', 'Design input');
  inp('Air temperature', 'T', p.env.temp, '°C', 'Design input');
  calc('Air pressure', 'pa', '{P0}*(1-{kP}*{h})^{nP}', 'Pa', 'p = P0 · (1 − kP · h)^nP');
  calc('Air density', 'rho', '{pa}/({Rair}*({T}+{TK}))', 'kg/m³', 'ρ = p / (R · (T + 273.15))');
  calc('Density ratio', 'sigma', '{rho}/{rho0}', '', 'σ = ρ / ρ0');
  sec('Battery');
  inp('Cell nominal voltage', 'vc', b.chem.nom, 'V', b.chem.label);
  inp('Cells in series (all packs)', 'S', b.S, '', `${p.batt.s}S per pack × ${b.packs} pack(s) in ${p.batt.conn || 'parallel'}`);
  inp('Cells in parallel (all packs)', 'P', b.P, '', `${p.batt.p || 1}P per pack`);
  inp('Cell capacity', 'mah', +p.batt.cellMah || 0, 'mAh', p.batt.name);
  calc('Pack voltage', 'V', '{S}*{vc}', 'V', 'V = S · V_cell');
  calc('Capacity', 'Ah', '{P}*{mah}/1000', 'Ah', 'Ah = P · mAh / 1000');
  calc('Energy', 'Wh', '{V}*{Ah}', 'Wh', 'Wh = V · Ah');
  calc('Usable energy', 'Wu', '{Wh}*{use}/100*{cold}', 'Wh', 'Wu = Wh · usable % · cold factor');
  inp('Continuous rating', 'C', p.batt.c, 'C', 'Pack label');
  calc('Max continuous current', 'Ic', '{C}*{Ah}', 'A', 'I = C · Ah');
  sec('Weight and electronics');
  calc('All-up weight', 'AUW', 'SUM(BOM!E2:E{bomEnd})', 'g', "Sum of the BOM sheet's Total g column");
  calc('Weight force', 'W', '{AUW}/1000*{g}', 'N', 'W = AUW / 1000 · g');
  inp('Electronics power', 'pAv', R.pAv, 'W', 'BOM average watts on regulated rails ÷ regulator efficiency, plus battery-bus items');
  if (R.h) {
    const n = +p.mr.n;
    sec(p.type === 'vtol' ? 'Hover (lift motors)' : 'Hover');
    inp('Lift motors', 'n', n, '', `${U.LAYOUTS[p.mr.layout].label} · ${R.h.set.name}`);
    calc('Thrust per motor', 'Tm', '{AUW}*{kH}/{n}', 'g', 'T = AUW · kH / n');
    inp('Power per motor at sea level', 'Pm0', (R.h.pMotors / n) * Math.sqrt(R.sigma) / (coax ? 1.22 : 1), 'W', `Read from the ${R.h.set.physics ? 'physics estimate' : 'thrust-stand data'} at that thrust`);
    calc('Power per motor here', 'Pm', '{Pm0}/SQRT({sigma})*{cp}', 'W', 'P = P_sea level / √σ · coax factor');
    calc('Hover power (total)', 'Ph', '{n}*{Pm}+{pAv}', 'W', 'P = n · P_motor + electronics');
    calc('Hover current', 'Ih', '{Ph}/{V}', 'A', 'I = P / V');
    if (p.type === 'multirotor') calc('Hover time', 'th', '{Wu}/{Ph}*60', 'min', 't = Wu / P · 60');
    inp('Hover throttle', 'thr', R.h.thr, '%', 'Read from the thrust curve at that thrust');
    inp('Max thrust per motor (sea level)', 'Tmax', R.h.c.tmax, 'g', 'Full throttle on the thrust curve');
    calc('Max thrust (total)', 'Tt', '{n}*{Tmax}*{sigma}*{cf}', 'g', 'T = n · T_max · σ · coax factor');
    calc('Thrust-to-weight', 'tw', '{Tt}/({AUW}*{kH})', '', 'T/W = T_total / (AUW · kH)');
    inp('Full-throttle current per motor', 'Im', R.h.iMaxMotor, 'A', 'Full throttle on the thrust curve');
    if (p.type === 'multirotor') calc('Peak current', 'Ipk', '{n}*{Im}+{pAv}/{V}', 'A', 'I = n · I_motor + electronics / V');
  }
  if (R.cruise) {
    sec(p.type === 'vtol' ? 'Cruise (wing-borne)' : 'Cruise');
    inp('Wingspan', 'b', f.span, 'm', 'Design input');
    inp('Wing area', 'Sw', f.area, 'm²', 'Design input');
    calc('Aspect ratio', 'AR', '{b}^2/{Sw}', '', 'AR = b² / S');
    inp('Cruise speed', 'Vc', f.vc, 'm/s', 'Design input');
    calc('Dynamic pressure', 'q', '0.5*{rho}*{Vc}^2', 'Pa', 'q = ½ ρ V²');
    calc('Lift coefficient', 'CL', '{W}/({q}*{Sw})', '', 'CL = W / (q · S)');
    inp('Zero-lift drag coefficient', 'CD0', R.cd0, '', R.drag ? 'Drag build-up at cruise (see the Drag build-up rows on Summary)' : 'Design input');
    inp('Oswald efficiency', 'e', R.e, '', f.drag && f.drag.eAuto ? 'Estimated from aspect ratio' : 'Design input');
    calc('Drag coefficient', 'CD', '{CD0}+{CL}^2/(PI()*{e}*{AR})', '', 'CD = CD0 + CL² / (π · e · AR)');
    calc('Drag (theory)', 'D0', '{q}*{Sw}*{CD}', 'N', 'D = q · S · CD');
    calc('Drag', 'D', '{k}*{D0}', 'N', 'D = k · D_theory');
    calc('Power to push the air', 'Pa', '{D}*{Vc}', 'W', 'P = D · V');
    const Pprop = R.cruise.P - R.pAv;
    if (R.propModel) inp('Motor × prop efficiency at cruise', 'eta', Pprop > 0 ? airPower(R, f) / Pprop : 0, '', 'Solved from the prop data and motor model at cruise');
    else calc('Overall efficiency', 'eta', '{etaP}/100*{etaD}/100*{pk}', '', 'η = η_prop · η_motor · factor');
    calc('Propulsion power', 'Pp', '{Pa}/{eta}', 'W', 'P = P_air / η');
    calc('Cruise power (total)', 'Pc', '{Pp}+{pAv}', 'W', 'P = P_propulsion + electronics');
    calc('Cruise current', 'Icr', '{Pc}/{V}', 'A', 'I = P / V');
    if (p.type === 'fixedwing') {
      calc('Endurance at cruise', 'tc', '{Wu}/{Pc}*60', 'min', 't = Wu / P · 60');
      calc('Range at cruise', 'Rc', '{Vc}*{tc}*60/1000', 'km', 'R = V · t');
    }
    inp('Max lift coefficient', 'CLm', f.clmax, '', 'Design input');
    calc('Stall speed', 'Vs', 'SQRT(2*{W}/({rho}*{Sw}*{CLm}))', 'm/s', 'Vs = √(2W / (ρ · S · CLmax))');
    calc('Wing loading', 'WL', '{AUW}/1000/{Sw}', 'kg/m²', 'AUW / S');
  }
  if (mp) {
    sec('Mission');
    inp('Extra reserve', 'res', +p.mission.reserve || 0, '%', 'Design input');
    calc('Energy available', 'Ea', '{Wu}*(1-{res}/100)', 'Wh', 'Wu · (1 − reserve)');
    const es = [];
    mp.rows.forEach((r, i) => {
      const k = 's' + i;
      inp(`${r.label}: ${r.v} ${r.unit}${r.dir && r.dir !== 'none' ? ` (${r.dir}wind)` : ''} · power`, k + 'P', r.P, 'W', 'From the power curve above');
      inp(`${r.label} · time`, k + 't', r.t, 's', r.err || (r.type === 'cruise' ? 'distance / ground speed' : r.type === 'climb' ? 'height / climb rate' : 'segment duration'));
      calc(`${r.label} · energy`, k + 'E', `{${k}P}*{${k}t}/3600`, 'Wh', 'E = P · t / 3600');
      es.push(`{${k}E}`);
    });
    calc('Energy used', 'Eu', es.join('+') || '0', 'Wh', 'Sum of the segments (nominal power)');
    calc('Energy left at landing', 'El', '{Ea}-{Eu}', 'Wh', 'Available − used');
  }
  return it;
}
// what each calculated value means, for the workbook's last column (mission segments: see WHAT_SEG)
const WHAT = {
  pa: 'Air pressure at the field altitude', rho: 'Air density at the field; thinner air needs more power for the same thrust and lift',
  sigma: 'How dense the air is compared with sea level (1 = sea level)', V: 'Nominal voltage of the whole battery',
  Ah: 'Charge the battery holds', Wh: 'Total energy stored in the battery', Wu: 'Energy you can actually use in flight',
  Ic: 'Highest current the battery can supply continuously', AUW: 'Take-off weight of the whole aircraft', W: 'Weight as a force, for lift and thrust',
  Tm: 'Thrust each lift motor makes to hover', Pm: 'Electrical power each lift motor draws in hover at this altitude', Ph: 'Battery power while hovering, electronics included',
  Ih: 'Battery current while hovering', th: 'How long it can hover on the usable energy', Tt: 'Thrust of all lift motors at full throttle',
  tw: 'Thrust-to-weight ratio; about 2 or more gives good control margin', Ipk: 'Battery current at full throttle on all motors',
  AR: 'How long and slender the wing is; higher means less induced drag', q: 'Air pressure from moving at cruise speed',
  CL: 'How hard the wing works to carry the weight at cruise', CD: 'Total drag of the aircraft at cruise as a coefficient',
  D0: 'Drag from theory before the correction', D: 'Drag force at cruise', Pa: 'Power needed to push the aircraft through the air',
  eta: 'Share of battery power that becomes thrust power', Pp: 'Battery power for the cruise motor(s)', Pc: 'Battery power in cruise, electronics included',
  Icr: 'Battery current in cruise', tc: 'Flight time at cruise speed on the usable energy', Rc: 'Distance at cruise speed on the usable energy',
  Vs: 'Slowest speed the wing can hold the aircraft up', WL: 'Weight carried per square meter of wing',
  Ea: 'Energy available for the mission after the reserve', Eu: 'Energy the whole mission uses', El: 'Energy left when you land; negative means it does not make it',
};
// air power at cruise (D · V) with the same terms as the sheet, for the implied efficiency when prop data is used
const airPower = (R, f) => { const V = +f.vc, q = 0.5 * R.rho * V * V, CL = R.cruise.CL; return R.kUsed * q * f.area * (R.cd0 + (CL * CL) / (Math.PI * R.e * R.AR)) * V; };

// the Design charts drawn off-screen (so export works from any tab) and turned into PNGs
async function designChartImages(p, R) {
  const W = designChartW || 560; // width of the charts as last shown on the Performance tab
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px`;
  const defs = [['speed', 'Power vs airspeed'], ['pay', 'Payload trade'], ['batt', 'Battery size trade'], ['motor', 'Motor thrust curve']];
  const ids = {};
  box.innerHTML = defs.map(([k]) => `<div class="chart" id="xc-${k}" style="width:${W}px"></div>`).join('');
  document.body.appendChild(box);
  for (const [k] of defs) ids[k] = 'xc-' + k;
  const out = {};
  try {
    designCharts(p, R, ids);
    await new Promise((r) => setTimeout(r, 60));
    for (const [k, title] of defs) if (charts[ids[k]]) out[k] = await chartPng(ids[k], title);
  } finally {
    for (const k of Object.values(ids)) { const e = document.getElementById(k); if (e) ro_.unobserve(e); if (charts[k]) { charts[k].destroy(); delete charts[k]; } }
    box.remove();
  }
  return out;
}
// exports follow the app's Metric/Imperial setting: the same units the app converts (mass, length, area, speed,
// distance, wing loading, temperature); W, V, A, Wh, N, Pa and density stay as they are
const impKey = (unit) => (imperial() && unit ? uKey(unit) : null);
const impNum = (v, k) => (k && typeof v === 'number' && fin(v) ? +toImp(v, k).toPrecision(8) : v);
// [Section, Parameter, Value, Unit] rows
const impRows = (rows) => rows.map((r, i) => { const k = i && impKey(r[3]); return k && typeof r[2] === 'number' ? [r[0], r[1], impNum(r[2], k), uName(k)] : r; });
// tables whose header cells end in a unit ("Total g", "Airspeed m/s"): convert those columns and rename the header
function impTable(aoa) {
  if (!imperial()) return aoa;
  const keys = aoa[0].map((h) => { const m = String(h).match(/ (g|kg|m|m²|m\/s|km|mm|°C)$/); return m ? uKey(m[1]) : null; });
  return aoa.map((r, i) => r.map((v, j) => (!keys[j] ? v : i ? impNum(v, keys[j]) : String(v).replace(/ \S+$/, ' ' + uName(keys[j])))));
}
const blobB64 = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const loadExcelJS = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', 'ExcelJS', 'Excel writer');

async function exportXlsx(p) {
  let EX;
  try { EX = await loadExcelJS(); } catch (e) { return toast(e.message); }
  toast('Building the workbook…');
  const { rows, R, pl } = calcRows(p);
  const mp = U.missionPlan(p, S.lib, R);
  const wb = new EX.Workbook();
  wb.creator = 'HangarLab'; wb.calcProperties.fullCalcOnLoad = true;
  const head = (ws, row = 1) => { const r = ws.getRow(row); r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEBE5' } }; };
  const sheet = (name, aoa, widths) => { const ws = wb.addWorksheet(name.slice(0, 31)); ws.addRows(aoa); if (widths) ws.columns = widths.map((w) => ({ width: w })); head(ws); ws.views = [{ state: 'frozen', ySplit: 1 }]; return ws; };
  const BLUE = { color: { argb: 'FF1F4E99' } };

  // Worked calculations: inputs (constants grey, assumptions and design inputs blue) in one column, results as live
  // formulas in another, each with its unit; formulas point at the Input or Result cell they use
  const IMP = imperial();
  const items = workedCalc(p, R, mp);
  const bomSI = bomRowsFor(p), bom = impTable(bomSI);
  // imperial: the conversion factors used go in with the constants, and each formula converts to SI and back
  const used = [...new Set(items.filter((x) => !x.sec && impKey(x.unit)).map((x) => impKey(x.unit)))];
  const cvSym = {};
  if (used.length) {
    const cv = [];
    for (const k of used) {
      if (k.startsWith('°C')) { cv.push({ label: '°F per °C', sym: 'cvF1', v: 1.8, unit: '', how: 'Unit conversion', kind: 'const' }, { label: '°F at 0 °C', sym: 'cvF0', v: 32, unit: '', how: 'Unit conversion', kind: 'const' }); continue; }
      cvSym[k] = 'cv' + cv.length;
      cv.push({ label: `${uName(k)} per ${k.split('>')[0]}`, sym: cvSym[k], v: UCONV[k], unit: '', how: 'Unit conversion', kind: 'const' });
    }
    items.splice(items.findIndex((x) => x.sec === 'Assumptions'), 0, ...cv);
  }
  const bySym = {}; for (const x of items) if (!x.sec) bySym[x.sym] = x;
  const wc = wb.addWorksheet('Worked calculations');
  wc.columns = [{ width: 36 }, { width: 8 }, { width: 13 }, { width: 9 }, { width: 46 }, { width: 13 }, { width: 9 }, { width: 64 }];
  wc.addRow([`${p.name}: worked calculation${IMP ? ' (imperial units)' : ''}`]).font = { bold: true, size: 14 };
  wc.addRow(['Inputs: grey = constant, blue = assumption or design input (change them to try alternatives). Results are live Excel formulas of the cells above; click one to see its formula.']).font = { italic: true, color: { argb: 'FF666666' } };
  wc.addRow([]);
  wc.addRow(['Item', 'Symbol', 'Input', 'Unit', 'Equation or source', 'Result', 'Unit', 'What it means']); head(wc, 4);
  wc.views = [{ state: 'frozen', ySplit: 4 }];
  const addr = {};
  items.forEach((x, i) => { if (!x.sec) addr[x.sym] = `${x.f != null ? 'F' : 'C'}${5 + i}`; });
  const GREY = { color: { argb: 'FF7A7A7A' } }, SEC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE9DF' } };
  // each result is also worked out here and stored with its formula, so the numbers show even before Excel recalculates
  // (Protected View, previews); the expressions are our own formula strings with numbers substituted
  const val = {}, bomSum = bomSI.slice(1).reduce((a, r) => a + (+r[4] || 0), 0);
  const evalF = (f) => { try { const v = Function(`return (${f.replace(/SUM\(BOM!E2:E\{bomEnd\}\)/, String(bomSum)).replace(/\{(\w+)\}/g, (m, k) => `(${+val[k] || 0})`).replace(/\^/g, '**').replace(/SQRT/g, 'Math.sqrt').replace(/PI\(\)/g, 'Math.PI')})`)(); return fin(v) ? v : undefined; } catch (e) { return undefined; } };
  let row = 5;
  for (const x of items) {
    const r = wc.getRow(row++);
    if (x.sec) { r.getCell(1).value = x.sec; r.font = { bold: true, color: { argb: 'FFD9530A' } }; for (let c = 1; c <= 8; c++) r.getCell(c).fill = SEC; continue; }
    val[x.sym] = x.f != null ? evalF(x.f) : x.v;
    r.getCell(1).value = x.label; r.getCell(2).value = x.sym; r.getCell(2).font = { italic: true }; r.getCell(5).value = x.how || '';
    const k = impKey(x.unit);
    // a cell in SI inside a formula: imperial cells are converted back on the way in
    const si = (sym) => { const c = addr[sym], kk = impKey(bySym[sym] && bySym[sym].unit); return !kk ? c : kk.startsWith('°C') ? `((${c}-${addr.cvF0})/${addr.cvF1})` : `(${c}/${addr[cvSym[kk]]})`; };
    if (x.f != null) {
      let f = x.f.replace('SUM(BOM!E2:E{bomEnd})', IMP ? `(SUM(BOM!E2:E${bom.length})/${addr[cvSym['g>oz']]})` : `SUM(BOM!E2:E${bom.length})`).replace(/\{(\w+)\}/g, (m, s) => si(s));
      if (k) f = k.startsWith('°C') ? `(${f})*${addr.cvF1}+${addr.cvF0}` : `(${f})*${addr[cvSym[k]]}`;
      r.getCell(6).value = { formula: f, result: impNum(val[x.sym], k) }; r.getCell(6).font = { bold: true };
      r.getCell(7).value = k ? uName(k) : x.unit || '';
      r.getCell(8).value = WHAT[x.sym] || (/^s\d+E$/.test(x.sym) ? 'Energy this mission segment uses' : '');
    } else {
      r.getCell(3).value = typeof x.v === 'number' ? +(k ? toImp(x.v, k) : x.v).toPrecision(10) : x.v;
      r.getCell(3).font = x.kind === 'const' ? GREY : BLUE;
      r.getCell(4).value = k ? uName(k) : x.unit || '';
    }
  }

  sheet('Summary', IMP ? impRows(rows) : rows, [18, 40, 22, 8]);
  // BOM with live totals, so the worked calculation's weight follows edits here
  const wbBom = sheet('BOM', bom, [13, 40, 6, 9, 9, 9, 8, 8, 12, 8, 10, 10, 40, 40]);
  for (let i = 2; i <= bom.length; i++) {
    wbBom.getCell(`E${i}`).value = { formula: `C${i}*D${i}`, result: bom[i - 1][4] };
    if (bom[i - 1][10] !== '') wbBom.getCell(`L${i}`).value = { formula: `C${i}*K${i}`, result: bom[i - 1][11] };
  }
  const tot = wbBom.addRow(['Total', '', '', '', { formula: `SUM(E2:E${bom.length})`, result: impNum(R.Wg, impKey('g')) }]); tot.font = { bold: true };
  sheet('Power rails', [['Rail', 'Regulator', 'Avg W', 'Peak W', 'Avg A', 'Peak A', 'Rated A', 'Items']].concat(pl.rails.map((r) => [r.rail, r.kind, +r.avgW.toFixed(2), +r.peakW.toFixed(2), +r.iAvg.toFixed(3), +r.iPk.toFixed(3), r.rail === 'VBAT' ? '' : r.rec, r.items.map((i) => i.name).join('; ')])), [9, 24, 8, 8, 8, 8, 8, 60]);
  const links = rfLinks(p);
  if (links.length) sheet('RF links', impTable([['Link', 'MHz', 'TX dBm', 'TX dBi', 'RX dBi', 'Loss dB', 'Sens dBm', 'Path loss dB', 'Margin dB', 'Max range km']].concat(links.map((x) => { const r = U.link(x.l, p.rf); return [x.name, x.l.mhz, x.l.tx, x.l.txG, x.l.rxG, x.l.loss, x.l.sens, +r.loss.toFixed(1), +r.margin.toFixed(1), +r.maxKm.toFixed(2)]; }))), [30, 8, 8, 8, 8, 8, 9, 11, 10, 12]);

  // chart pictures: next to their data, and all together on a Charts sheet
  let imgs = {};
  try { imgs = await designChartImages(p, R); } catch (e) { /* charts unavailable (chart library offline): data only */ }
  const pic = async (ws, blob, col, rowAt) => {
    const id = wb.addImage({ base64: await blobB64(blob), extension: 'png' });
    const bm = await createImageBitmap(blob), k = window.devicePixelRatio || 1, w = Math.round(bm.width / k), h = Math.round(bm.height / k); // same size as on screen
    ws.addImage(id, { tl: { col, row: rowAt }, ext: { width: w, height: h } });
    return Math.ceil(h / 20) + 2;
  };
  const curveImg = { 'Power vs airspeed': 'speed', 'Battery size trade': 'batt', 'Payload trade': 'pay', 'Motor thrust curve': 'motor' };
  for (const [name, aoa0] of Object.entries(curveRows(p, R))) {
    const aoa = impTable(aoa0), ws = sheet(name, aoa, aoa[0].map(() => 14));
    if (imgs[curveImg[name]]) await pic(ws, imgs[curveImg[name]], aoa[0].length + 1, 1);
  }
  if (Object.keys(imgs).length) {
    const cs = wb.addWorksheet('Charts');
    let at = 0;
    for (const k of ['speed', 'pay', 'batt', 'motor']) if (imgs[k]) at += await pic(cs, imgs[k], 0, at);
  }
  wb.views = [{ activeTab: 0 }];
  const buf = await wb.xlsx.writeBuffer();
  download(`${fileBase(p, 'calculations')}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

// standalone, printable report (light theme, no scripts)
function reportHtml(p) {
  const rows = impRows(calcRows(p).rows);
  const sections = {};
  for (const r of rows.slice(1)) (sections[r[0]] = sections[r[0]] || []).push(r);
  const fmtv = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : esc(v));
  const bomT = impTable(bomRowsFor(p)), bom = bomT.slice(1), wU = bomT[0][4].replace('Total ', '');
  const subs = [...new Set(bom.map((r) => r[0]))];
  const light = (s) => { const t = S.theme; S.theme = 'light'; const c = subColor(s); S.theme = t; return c; };
  const bomHtml = subs.map((s) => { const rs = bom.filter((r) => r[0] === s); return `<tr class="g"><td colspan="5"><i style="background:${light(s)}"></i>${esc(s)} · ${rs.reduce((a, r) => a + r[4], 0).toFixed(1)} ${wU}</td></tr>` + rs.map((r) => `<tr><td>${esc(r[1])}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td><td>${r[5]}${r[6] ? ` · ${r[6]} W` : ''}</td></tr>`).join(''); }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(p.name)} — HangarLab report</title>
<style>body{font:13px/1.45 "Segoe UI",system-ui,sans-serif;color:#15212b;max-width:900px;margin:32px auto;padding:0 20px}h1{font-size:22px;margin:0}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#546472;border-bottom:1px solid #d6dde3;padding-bottom:4px;margin:26px 0 8px}
table{border-collapse:collapse;width:100%}td{padding:3px 6px;border-bottom:1px solid #eef1f4;vertical-align:top}td.n{text-align:right;font-variant-numeric:tabular-nums}.k{color:#546472;width:45%}tr.g td{font-weight:600;background:#f4f6f8}tr.g i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.sub{color:#8794a0}@media print{body{margin:0}h2{break-after:avoid}}</style>
<h1>${esc(p.name)}</h1><p class="sub">${TYPE_LABEL[p.type]} · exported ${new Date().toLocaleString()} from HangarLab</p>
${Object.entries(sections).map(([s, rs]) => `<h2>${esc(s)}</h2><table>${rs.map((r) => `<tr><td class="k">${esc(r[1])}</td><td>${fmtv(r[2])} ${esc(r[3])}</td></tr>`).join('')}</table>`).join('')}
<h2>Bill of materials</h2><table><tr><td class="k"><b>Item</b></td><td class="n"><b>Qty</b></td><td class="n"><b>Unit ${wU}</b></td><td class="n"><b>Total ${wU}</b></td><td><b>Rail</b></td></tr>${bomHtml}</table>
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
// one row per export: icon, name, one-line description, file type on the right
const EXPORTS = [
  ['Results and calculations', [
    ['ex-xlsx', 'sheet', 'Calculation workbook', 'Every input, the formula behind each result, and the charts', '.xlsx'],
    ['ex-copy', 'copy', 'Copy results', 'Every result with its unit, to paste into Sheets or a document', 'Copy'],
  ]],
  ['Design report', [
    ['print-report', 'print', 'Print or save as PDF', 'The design report on one page', 'PDF'],
    ['ex-html', 'file', 'Report file', 'The same report to keep or send', '.html'],
  ]],
  ['Parts', [
    ['ex-bom', 'list', 'Parts list (BOM)', 'Quantity, weight, cost and buy link for every part', '.csv'],
    ['tpl-download', 'sheet', 'Parts import template', 'Blank workbook to fill in and import in Parts Library', '.xlsx'],
  ]],
  ['Backup', [
    ['ex-json', 'download', 'Full backup', 'Every design and the parts library; bring it back with Import', '.json'],
  ]],
]
function exportDialog() {
  const p = P();
  const row = ([act, icon, name, desc, tag, alt]) => `<div class="xr"><button class="xr-main" data-act="${act}"><svg class="i"><use href="#i-${icon}"/></svg><span class="xr-t"><b>${name}</b><span>${desc}</span></span><span class="xr-tag">${tag}</span></button>${alt ? `<button class="xr-tag xr-alt" data-act="${alt[0]}" title="Download as a file">${alt[1]}</button>` : ''}</div>`;
  openDlg(`Export <span class="faint">· ${esc(p.name)}</span>`, `<div class="xlist">${EXPORTS.map(([g, rows]) => `<h3 class="exp-h">${g}</h3>${rows.map(row).join('')}`).join('')}</div>
    <p class="hint" style="margin-top:12px">Downloads are blocked in some embedded viewers; Copy results works everywhere. Automatic backups are in <a href="#" data-act="exp-backups">Settings → Saving &amp; backups</a>.</p>`,
    `<button class="btn" data-act="dlg-close">Done</button>`);
}
function importWorkspace(text) {
  try {
    const o = JSON.parse(text);
    if (!o.projects || !o.lib) throw new Error('missing projects or library');
    const tmp = migrate({ v: o.v >= 2 ? o.v : 1, projects: o.projects, lib: o.lib });
    const ids = new Set(S.projects.map((p) => p.id));
    for (const p of tmp.projects) { if (ids.has(p.id)) p.id = 'p-' + uid(); S.projects.push(p); }
    for (const k of LIB_KINDS) {
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
        <p class="hint">Values are always stored in metric; exports use the units chosen here.</p></div></div>

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
        <dl class="kv" style="margin-bottom:12px"><dt>Storage used</dt><dd id="setStore"></dd><dt>Designs · library items</dt><dd>${S.projects.length} · ${LIB_KINDS.reduce((a, k) => a + (S.lib[k] || []).length, 0)}</dd><dt>Props with performance data</dt><dd>${propData}</dd></dl>
        <div class="fields" style="padding:0">${chk('settings.backups.on', 'Keep automatic backups (on open, at most every 12 h, and before upgrades)', { st: true })}</div>
        <div class="checks" style="margin:8px 0">${bk.map((x, j) => `<div class="chk" style="align-items:center"><span class="grow">${new Date(x.t).toLocaleString()} <span class="faint">· ${esc(x.why)}</span></span><button class="btn sm" data-act="restore" data-i="${j}">Restore</button></div>`).join('') || '<p class="hint">No backups yet.</p>'}</div>
        <div class="row"><button class="btn sm" data-act="backup-now">Back up now</button><button class="btn sm" data-act="tpl-download">Parts import template (.xlsx)</button><button class="btn sm" data-act="export">Export…</button><button class="btn sm" data-act="import">Import…</button></div></div>

      <div class="card"><h2>Reset</h2><p class="note" style="margin:8px 0 10px">Both can be undone right after with Undo.</p>
        <div class="row"><button class="btn sm danger" data-act="clear-propdata"${propData ? '' : ' disabled'}>Remove all prop performance data</button><button class="btn sm danger" data-act="reset-examples">Replace everything with the example data</button></div></div>

      <div class="card"><h2>Keyboard shortcuts</h2><dl class="kv" style="margin-top:8px"><dt>Switch tab</dt><dd>1 – 9</dd><dt>Undo</dt><dd>Ctrl/⌘ + Z</dd><dt>Export</dt><dd>Ctrl/⌘ + E</dd><dt>Show / hide inputs</dt><dd>Ctrl/⌘ + B</dd><dt>Quick start guide</dt><dd>?</dd></dl>
        <div class="row" style="margin-top:12px"><button class="btn sm" data-act="shortcuts">Open quick start</button><button class="btn sm" data-tour="start">Replay the tour</button>${chk('settings.quickstart', 'Show the quick start next time the app opens', { st: true })}</div></div>

      <div class="card"><h2>About</h2>
        <p class="note" style="margin:8px 0 6px">HangarLab gives planning estimates, not guarantees. Check them against bench tests and test flights and follow your local aviation rules; the regulation notes are not legal advice. Your designs, library and logs stay in this browser. Map, terrain and parameter data are downloaded from their public sources when you open those views, and a link you give to Add from link is read through HangarLab's server. Visits are counted anonymously (Cloudflare Web Analytics, no cookies).</p>
        <p class="note" style="margin:0 0 6px"><a href="https://github.com/vuquang284/hangarlab/issues/new" target="_blank" rel="noopener">Report a problem or suggest a feature</a> (GitHub Issues).</p>
        <p class="note" style="margin:0 0 6px"><b>License:</b> HangarLab is open source under the <a href="https://github.com/vuquang284/hangarlab/blob/main/LICENSE" target="_blank" rel="noopener">GNU AGPL-3.0</a>; <a href="https://github.com/vuquang284/hangarlab" target="_blank" rel="noopener">source code on GitHub</a>. The name and logo are not covered.</p>
        <p class="note" style="margin:0 0 6px"><b>Libraries:</b> uPlot (MIT), Leaflet (BSD-2), three.js (MIT), SheetJS (Apache-2.0), ExcelJS (MIT), LZMA-JS (MIT). Fonts: Barlow, Barlow Condensed, Roboto Mono (OFL / Apache-2.0).</p>
        <p class="note" style="margin:0"><b>Data:</b> satellite imagery © Esri, Maxar, Earthstar Geographics; street map © OpenStreetMap contributors; terrain heights from AWS Terrain Tiles (Mapzen, with SRTM, GMTED, ETOPO1 and other public sources); ArduPilot parameter descriptions from autotest.ardupilot.org (GPLv3); APC Propellers PER3 performance files. The flight-log viewer, health check and 3D map follow ArduPilot UAV Log Viewer, LogAnalyzer and Mission Planner but share no code with them.</p></div>
    </div></div>`;
  settingsLive();
}
function settingsLive() {
  const s = $('#setStore'); if (s) s.textContent = `${fmt(storageUse() / 1024, 0)} KB of about 5,000 KB`;
  const l = $('#setLearn');
  if (l) l.innerHTML = (S.lib.fleetFrom || []).length ? `Learned ×${fmt(S.lib.fleetK, 2)} from ${S.lib.fleetFrom.map((x) => esc(x[0])).join(', ')}.` : 'No flights marked as real measurements yet, so the default correction applies.';
}
