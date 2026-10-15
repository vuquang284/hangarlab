// HangarLab UI: Performance tab: design inputs, readouts, part finders, library links.
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

// ---------- DESIGN ----------
// "find best" button for one input group, with an undo for the last pick made from it
const finderPrev = {};
function finderRow(p, key) {
  const label = key === 'bat' ? 'Find the best battery' : 'Find the best motor + prop';
  const prev = finderPrev[`${p.id}:${key}`];
  return `<div class="row wide" style="gap:6px"><button class="btn sm" data-act="${key === 'bat' ? 'find-bat' : 'find-mp'}" data-role="${key}" title="Tries every option in your library on this design">${label}</button>${prev ? `<button class="btn sm ghost" data-act="find-undo" data-key="${key}" title="Back to ${esc(prev.label)}">Undo pick</button>` : ''}</div>`;
}
// in Simple mode only the inputs most designs need are shown; everything else keeps its value
const isSimple = () => S.settings.detail === 'simple';
const adv = (html) => (isSimple() ? '' : html);
function designInputs() {
  const p = P(), t = p.type;
  const bat = U.battery(p.batt);
  let h = '';
  h += group('Vehicle', `
    ${txt('name', 'Design name', { wide: true })}
    <label class="f wide"><span>Notes</span><textarea data-k="notes" rows="3" placeholder="What changed, part numbers, test results…">${esc(p.notes || '')}</textarea></label>
    <div class="f wide"><span>Versions ${tip('A version is a frozen copy of this design. Restore brings every setting back (Undo works).')}</span>
      ${(p.versions || []).map((v, j) => `<div class="in segrow" style="margin-top:4px"><input type="text" data-k="versions.${j}.name" value="${esc(v.name)}" aria-label="Version name"><span class="faint" style="white-space:nowrap;font-size:12px">${new Date(v.at).toLocaleDateString()}</span><button class="btn sm" data-act="ver-restore" data-i="${j}">Restore</button><button class="btn ghost sm danger" data-act="ver-del" data-i="${j}" aria-label="Delete version">×</button></div>`).join('') || '<p class="hint" style="margin:2px 0">None yet.</p>'}
      <button class="btn sm" data-act="ver-save" style="margin-top:6px">Save version</button></div>
    <div class="f wide"><span>Configuration</span><div class="seg" role="group">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button data-settype="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div></div>
    ${t === 'vtol' ? sel('vtol.kind', 'VTOL type', [['quadplane', 'Quadplane (separate lift + cruise)'], ['tiltrotor', 'Tilt-rotor (shared motors)'], ['tailsitter', 'Tailsitter (shared motors)']], { wide: true, rebuild: true }) : ''}`);
  h += group('Environment', `${num('env.alt', 'Field altitude', { unit: 'm' })}${num('env.temp', 'Air temperature', { unit: '°C' })}<p class="hint" id="rhoHint"></p>`);
  h += '%%PROP%%'; // propulsion groups land right under Environment
  let prop = '';
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
    ${adv(num('batt.cPeak', `Peak C ${tip('Burst rating from the datasheet (usually for ~10 s). Leave 0 if unknown: full throttle is then checked against the continuous rating.')}`, { unit: 'C', min: 0 }))}
    ${adv(num('batt.usable', 'Usable capacity', { unit: '%', min: 10, max: 100 }))}
    ${num('batt.packs', 'Packs on board', { min: 1, step: 1 })}
    ${adv(sel('batt.conn', 'Packs wired in', [['parallel', 'Parallel (more capacity)'], ['series', 'Series (more voltage)']]))}
    <p class="hint" id="batHint"></p>
    ${finderRow(p, 'bat')}`);
  h += group('Payload', `
    ${txt('payload.name', 'Payload', { wide: true })}
    ${num('payload.g', 'Payload mass', { unit: 'g', min: 0 })}
    <label class="f wide" style="margin-top:-6px"><input type="range" id="paySlide" data-k="payload.g" min="0" max="${Math.max(2000, Math.ceil(((+p.payload.g || 0) * 2) / 500) * 500)}" step="10" value="${+p.payload.g || 0}" aria-label="Payload mass (g)"></label>
    <p class="hint" id="payHint"></p>`);
  if (t === 'multirotor' || t === 'vtol') {
    prop += group(t === 'vtol' ? 'Lift propulsion' : 'Propulsion', `
      ${sel('mr.layout', 'Frame layout', Object.entries(U.LAYOUTS).map(([k, l]) => [k, l.label]), { rebuild: true })}
      ${num('mr.n', 'Motors', { step: 1, min: 1 })}
      ${propPick('mr', bat.V)}
      ${finderRow(p, 'mr')}
      ${adv(`${num('mr.escA', 'ESC rating', { unit: 'A' })}
      ${num('mr.maxThr', `Payload limit ${tip('Extra payload is counted until hover throttle reaches this value.')}`, { unit: '% thr' })}
      ${t === 'multirotor' ? num('mr.cda', 'Frame drag area CdA', { unit: 'm²', step: 0.01 }) : ''}
      ${t === 'multirotor' ? num('mr.lean', `Max lean angle ${tip('ArduPilot ANGLE_MAX (default 30°). Top speed and wind limit stop where the frame would need to tilt further than this.')}`, { unit: '°', step: 1, min: 5 }) : ''}`)}
`);
  }
  if (t === 'fixedwing' || t === 'vtol') {
    const shared = t === 'vtol' && p.vtol.kind !== 'quadplane';
    h += group('Wing & aero', `
      ${sel('_airframe', 'Load airframe', [['', 'Choose an airframe…']].concat(S.lib.airframes.map((a) => [a.id, a.name + (a.area ? '' : ' (no area)')])), { wide: true })}
      ${num('fw.vc', 'Cruise speed', { unit: 'm/s', min: 1 })}
      ${num('fw.span', 'Wingspan', { unit: 'm', imp: 'in', step: 0.01, min: 0.05 })}
      ${num('fw.area', 'Wing area', { unit: 'm²', step: 0.001, min: 0.005 })}
      ${adv(`${sel('fw.drag.mode', 'Parasite drag', [['buildup', 'Build up from geometry'], ['cd0', 'Fixed CD0']], { wide: true, rebuild: true })}
      ${(p.fw.drag || {}).mode === 'buildup' ? `
        ${sel('fw.drag.finish', 'Construction / surface', Object.entries(U.FINISH).map(([k, v]) => [k, v.label]), { wide: true })}
        ${sel('fw.drag.mount', `Cruise motor placement ${tip('Sets which drag the motors add. On the wing: each motor gets a pod (sized from the motor in Motor pods), and the wing behind each prop sits in faster prop wash, adding friction drag. In the nose or as a pusher: no pods, and only part of the fuselage is in the wash. Auto picks on the wing for 2 or more cruise motors, nose for 1.')}`, [['auto', 'Auto (2+ motors on wing, 1 in nose)'], ['wing', 'Tractor on wing'], ['nose', 'Tractor in nose'], ['pusher', 'Pusher']], { wide: true })}
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
      ${num('fw.etaP', 'Prop efficiency', { unit: '%' })}
      ${num('fw.etaD', 'Motor + ESC eff.', { unit: '%' })}`)}
      ${t === 'fixedwing' ? num('fw.vsMax', 'Max stall speed', { unit: 'm/s' }) : ''}
      ${(p.fw.drag || {}).mode === 'buildup' ? '' : '<p class="hint">Typical CD0: glider 0.02, FPV wing 0.03, ISR plane 0.05–0.07.</p>'}`);
    if (!shared) prop += group(t === 'fixedwing' ? 'Propulsion' : 'Cruise propulsion', `${propPick('fw', bat.V)}${finderRow(p, 'fw')}${num('fw.n', 'Cruise motors', { step: 1, min: 1 })}${adv(chk('fw.propOther', 'My actual prop differs from this data (−15 % prop efficiency)'))}`);
    if (!isSimple()) h += group('Calibrate from flight', `
      ${chk('fw.cal.on', 'Scale the drag model to a measured cruise point', { rebuild: true })}
      ${p.fw.cal.on ? `${chk('fw.cal.learn', 'Real measurement of this aircraft: use it to improve estimates for other designs')}${num('fw.cal.v', 'Measured airspeed', { unit: 'm/s' })}${num('fw.cal.a', 'Propulsion current', { unit: 'A' })}${num('fw.cal.g', 'Weight at test', { unit: 'g' })}<p class="hint" id="calHint"></p>` : '<p class="hint">Optional: anchor the model to a measured cruise point.</p>'}`, p.fw.cal.on);
  }
  if (t === 'vtol') {
    h += group('VTOL mission', `
      ${num('vtol.hoverS', `Hover time per sortie ${tip('Vertical take-off, landing and any hovering. Transitions are counted separately below.')}`, { unit: 's' })}
      ${adv(`${num('vtol.transitions', `Transitions per sortie ${tip('Usually 2: one to forward flight after take-off and one back before landing.')}`, { step: 1, min: 0 })}
      ${num('vtol.accel', `Transition acceleration ${tip('How fast it speeds up from hover to flying speed. Typical: quadplane 1 m/s², tilt-rotor 1.5, tailsitter 2.5. Faster = less energy spent half-hovering.')}`, { unit: 'm/s²', min: 0.1, step: 0.1 })}
      ${num('vtol.hoverPen', `Hover thrust penalty ${tip('Extra thrust needed in hover because the airframe sits in the prop wash. Typical: quadplane 3 % (booms), tilt-rotor 8 % (wing under the rotors), tailsitter 6 % (wash along the wing).')}`, { unit: '%', min: 0, step: 1 })}
      ${num('vtol.reserve', `Extra reserve ${tip('On top of the battery usable capacity, which already keeps a landing reserve. Usually 0.')}`, { unit: '%', min: 0 })}
      ${p.vtol.kind === 'quadplane' ? num('vtol.dcd0', 'Stopped-rotor ΔCD0', { step: 0.001 }) : ''}`)}
      <p class="hint" id="vtolHint"></p>`);
  }
  {
    const M = p.mission, mu = (u) => (u === 'm' ? 'm>ft' : u === 'km' ? 'km>mi' : '');
    const dirs = [['none', 'Still air'], ['head', 'Headwind'], ['tail', 'Tailwind'], ['cross', 'Crosswind']];
    if (!isSimple()) h += group('Mission & wind', `
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
  if (!isSimple()) h += group('Electronics', `${num('becEff', 'BEC / regulator efficiency', { unit: '%' })}<p class="hint" id="avHint"></p>`, false);
  return h.replace('%%PROP%%', prop);
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
    if (R.vmax != null) h += ro('Top speed (est.)', (R.vmaxLimit === 'cap' ? '> ' : '') + fmt(R.vmax, 1), 'm/s', `${fmt(R.vmax * 3.6, 0)} km/h, ${VMAX_LIMIT[R.vmaxLimit] || ''}`);
    h += ro('Extra payload', fmt(R.payloadG, 0), 'g', `before ${p.mr.maxThr}% hover throttle`, lvl(R.payloadG, 500, 0, true));
    if (R.diskLoad) h += ro('Disk loading', fmt(R.diskLoad, 1), 'kg/m²', `${fmt(p.mr.n)}× ${R.h.set.diam}" props`);
    const burstOk = R.maxI > R.bat.iMaxCont && R.bat.peakSet && R.maxI <= R.bat.iMaxPeak;
    h += ro('Peak current', fmt(R.maxI, 0), 'A', burstOk ? `full throttle: OK in bursts (pack ${fmt(R.bat.iMaxPeak, 0)} A peak, ${fmt(R.bat.iMaxCont, 0)} A cont.)` : `pack ${fmt(R.bat.iMaxCont, 0)} A cont.${R.bat.peakSet ? ` · ${fmt(R.bat.iMaxPeak, 0)} A peak` : ''}`, ampState(R.maxI, R.bat));
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
    if (R.trans) h += ro('Transitions', fmt(R.mission.eTrans, 0), 'Wh', `${R.trans.n}× · ${fmt(R.trans.t, 1)} s each to ${fmt(R.trans.v, 1)} m/s`, R.mission.eTrans > 0.15 * R.mission.eAvail ? 'warn' : '');
    if (fin(R.hoverWind)) h += ro('Hover wind limit', fmt(R.hoverWind, 1), 'm/s', 'tailsitter standing on its tail', (+p.mission.wind || 0) > R.hoverWind ? 'crit' : (+p.mission.wind || 0) > 0.7 * R.hoverWind ? 'warn' : '');
  }
  return h;
}

const VMAX_LIMIT = { thrust: 'limited by 85% thrust', lean: 'limited by max lean angle', power: 'limited by 85% motor power', cap: 'model stops here' };
const SEG_HUE = { hover: 352, climb: 24, cruise: 212, loiter: 140, descend: 172 };
// straight-line range and out-and-back radius in wind, from the endurance at the cruise speed
// strongest wind the aircraft can work in: multirotor = top speed at 85 % thrust; plane = top level speed
function windReadout(p, R) {
  const lim = p.type === 'multirotor' ? R.vmax : R.vmaxLevel;
  if (!fin(lim)) return '';
  const plan = p.type === 'multirotor' ? lim * 0.66 : Math.min(lim * 0.66, p.fw.vc * 0.5);
  const w = +p.mission.wind || 0;
  return ro('Wind limit', (p.type === 'multirotor' && R.vmaxLimit === 'cap' ? '> ' : '') + fmt(lim, 0), 'm/s', `fly in under ~${fmt(plan, 0)} m/s${w ? ` · set: ${fmt(w, 0)} m/s` : ''}`, w > lim * 0.8 ? 'crit' : w > plan ? 'warn' : '');
}
function missionReadouts(p, R, mp) {
  let h = windReadout(p, R);
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
// logged cruise current vs what the model predicts at the same speed and weight
function flightsCard(p, R) {
  const el = $('#flights');
  if (!el) return;
  const fl = p.flights || [];
  if (!fl.length) { el.innerHTML = '<p class="faint">No flights yet. Open a log in Flight Logs and press "Save this flight".</p>'; return; }
  const model = (f) => {
    if (!fin(f.v) || p.type === 'multirotor') return null;
    const q = clone(p); q.fw.vc = f.v; if (q.fw.cal) q.fw.cal.on = false;
    try { const r = U.compute(q, S.lib, { lite: true }); return r.cruise && fin(r.cruise.I) ? r.cruise.I : null; } catch (e) { return null; }
  };
  const rows = fl.map((f, j) => { const mI = model(f), d = mI && fin(f.i) ? (f.i / mI - 1) * 100 : null; return `<tr><td>${new Date(f.at).toLocaleDateString()}</td><td>${esc(f.log)}</td><td class="n">${fmtT(f.dur)}</td><td class="n">${fin(f.wh) ? `${fmt(f.wh, 0)} Wh` : '—'}</td><td>${esc(f.mode || '—')}</td><td class="n">${fin(f.v) ? `${fmt(f.v, 1)} m/s` : '—'}</td><td class="n">${fin(f.i) ? `${fmt(f.i, 1)} A` : '—'}</td><td class="n">${fin(mI) ? `${fmt(mI, 1)} A` : '—'}</td><td class="n${d != null && Math.abs(d) > 15 ? ' bad' : ''}">${d != null ? `${d >= 0 ? '+' : ''}${fmt(d, 0)} %` : '—'}</td><td><button class="btn ghost sm danger" data-act="fl-del" data-i="${j}" aria-label="Remove">×</button></td></tr>`; });
  const ds = fl.map((f) => { const mI = model(f); return mI && fin(f.i) ? f.i / mI : null; }).filter(fin);
  el.innerHTML = `<div class="tbl-wrap"><table class="mis"><thead><tr><th>Date</th><th>Log</th><th class="n">Length</th><th class="n">Energy</th><th>Cruise mode</th><th class="n">Speed</th><th class="n">Logged A</th><th class="n">Model A</th><th class="n">Diff</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <p class="hint">Model A = this design's uncalibrated estimate at the logged speed${ds.length > 1 ? `. Across ${ds.length} flights the logs average <b>${fmt((ds.reduce((a, b) => a + b, 0) / ds.length - 1) * 100, 0)} %</b> vs the model` : ''}. A steady gap means the drag inputs need work; use Calibrate in Flight Logs to fold one flight in.</p>`;
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
// ---- part finders: try library options in the full model, rank by endurance within limits ----
function finderRows(p, kind, role) {
  const cur = U.compute(p, S.lib, { lite: true }), out = [];
  const twMin = p.type === 'vtol' ? 1.5 : 2;
  const judge = (q, label, apply) => {
    let R; try { R = U.compute(q, S.lib, { lite: true }); } catch (e) { return; }
    const end = U.enduranceOf(q, R);
    if (!fin(end) || end <= 0) return;
    const why = [];
    if (R.h) { if (R.h.tw < twMin) why.push(`T/W ${fmt(R.h.tw, 1)}`); if (R.h.thr > 70) why.push(`hover ${fmt(R.h.thr, 0)} %`); if (q.mr.escA && R.h.iMaxMotor > q.mr.escA) why.push('over ESC'); }
    if (R.cruise && q.type !== 'multirotor' && (!fin(R.cruise.P) || R.cruise.thr > 90)) why.push('cannot hold cruise');
    if (q.type === 'fixedwing' && +q.fw.vsMax > 0 && R.vs > +q.fw.vsMax) why.push(`stall ${fmt(R.vs, 1)} m/s`);
    const sus = R.h && q.type === 'multirotor' ? R.hoverI : R.cruise ? R.cruise.I : R.hoverI;
    if (fin(sus) && sus > R.bat.iMaxCont) why.push(`${fmt(sus, 0)} A over pack`);
    if (fin(R.maxI) && R.maxI > (R.bat.peakSet ? R.bat.iMaxPeak : R.bat.iMaxCont * 1.5)) why.push('full throttle over pack');
    out.push({ label, end, auw: R.Wg, info: R.h && q.type === 'multirotor' ? `${fmt(R.h.thr, 0)} % hover` : R.cruise ? `${fmt(R.cruise.I, 1)} A cruise` : '', ok: !why.length, why: why.join(', '), apply });
  };
  if (kind === 'mp') {
    for (const m of S.lib.motors) for (const pr of S.lib.props) {
      if (!U.combo(S.lib, m.id, pr.id, cur.bat.V)) continue;
      const q = clone(p); q[role].motor = m.id; q[role].prop = pr.id;
      judge(q, `${m.name} + ${pr.name}`, { role, motor: m.id, prop: pr.id });
    }
  } else {
    for (const b of S.lib.batteries) for (const n of [1, 2, 3, 4]) {
      const q = clone(p); Object.assign(q.batt, { name: b.name, chem: b.chem, s: b.s, p: b.p || 1, cellMah: b.cellMah, g: b.g, c: b.c, cPeak: b.cPeak || 0, packs: n, conn: 'parallel' });
      judge(q, `${n > 1 ? `${n}× ` : ''}${b.name}`, { bat: b.id, packs: n });
    }
  }
  return { rows: out.sort((a, b) => (b.ok - a.ok) || b.end - a.end).slice(0, 25), now: U.enduranceOf(p, cur) };
}
let finderLast = null;
function finderDialog(kind, role) {
  const p = P(), { rows, now } = finderRows(p, kind, role);
  finderLast = rows;
  openDlg(kind === 'mp' ? `Best ${role === 'mr' ? (p.type === 'vtol' ? 'lift' : '') : 'cruise'} motor + prop for ${esc(p.name)}` : `Best battery for ${esc(p.name)}`,
    rows.length ? `<p class="note" style="margin-top:0">Ranked by ${p.type === 'multirotor' ? 'hover' : p.type === 'vtol' ? 'mission cruise' : 'cruise'} endurance; now ${fmt(now, 1)} min. Options that break a limit are listed last with the reason.</p>
    <div class="tbl-wrap"><table class="mis"><thead><tr><th>Option</th><th class="n">Endurance</th><th class="n">AUW</th><th class="n"></th><th>Limits</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr${r.ok ? '' : ' style="opacity:.6"'}><td>${esc(r.label)}</td><td class="n">${fmt(r.end, 1)} min</td><td class="n">${fmt(r.auw / 1000, 2)} kg</td><td class="n">${r.info}</td><td>${r.ok ? '<span class="pill good">OK</span>' : `<span class="pill warn">${esc(r.why)}</span>`}</td><td><button class="btn sm" data-act="find-use" data-i="${i}">Use</button></td></tr>`).join('')}</tbody></table></div>
    <p class="hint">${kind === 'mp' ? 'Pairs need a thrust test, or motor kV with prop size, to be modelled.' : 'Packs are tried 1–4 in parallel.'} Use applies it to the design (Undo works).</p>`
      : '<p class="note">Nothing in the library can be modelled for this yet. Add motors with kV and props with a size, thrust tests, or battery packs.</p>',
    '<button class="btn" data-act="dlg-close">Close</button>');
}
function regsDialog() {
  const p = P(), R = U.compute(p, S.lib, { lite: true }), g = R.Wg;
  const all = U.fullBom(p, S.lib).map((r) => r.name).join(' | ');
  const rid = /remote\s?id|\brid\b|beacon|dronetag|db120|rid module/i.test(all);
  const cam = /cam|gimbal|siyi|gopro|camera|eo\/ir|thermal/i.test(all);
  const us = g < 250 ? ['Under 250 g', 'Recreational: no FAA registration (TRUST certificate still needed). Commercial (Part 107): register and Remote ID.']
    : g < 25000 ? ['250 g – 25 kg', 'Register with the FAA. Remote ID required (built in or broadcast module). Commercial flights under Part 107.']
    : ['Over 25 kg (55 lb)', 'Outside Part 107: needs a Section 44807 exemption or other approval.'];
  const eu = g < 250 ? 'C0 class (under 250 g): open category A1, no pilot test; register the operator if it has a camera.'
    : g < 900 ? 'C1 class (under 900 g): open category A1; operator registration, online pilot test, Remote ID.'
    : g < 4000 ? 'C2 class (under 4 kg): open category A2 with the A2 certificate, or A3 away from people; Remote ID.'
    : g < 25000 ? 'C3/C4 class (under 25 kg): open category A3 only (far from people and built-up areas); Remote ID for C3.'
    : 'Over 25 kg: specific category with an operational authorisation (SORA).';
  openDlg(`Regulations for ${esc(p.name)}`, `<dl class="kv" style="margin-top:0"><dt>All-up weight</dt><dd>${fmt(g, 0)} g (${fmt(g / 453.592, 2)} lb)</dd>
    <dt>USA (FAA)</dt><dd><b>${us[0]}</b>: ${us[1]}</dd>
    <dt>EU (EASA)</dt><dd>${eu}</dd>
    <dt>Remote ID in BOM</dt><dd>${rid ? '<span class="pill good">found</span>' : g >= 250 ? '<span class="pill warn">not found</span> add a module, or check the flight controller supports broadcast RID' : 'not needed for recreational use'}</dd>
    <dt>Camera on board</dt><dd>${cam ? 'yes: privacy rules and operator registration apply even under 250 g in the EU' : 'none found in the BOM'}</dd>
    ${R.bat.Wh > 100 ? `<dt>Battery transport</dt><dd>${fmt(R.bat.Wh / R.bat.packs, 0)} Wh per pack${R.bat.Wh / R.bat.packs > 160 ? ': over 160 Wh, not allowed on passenger aircraft' : R.bat.Wh / R.bat.packs > 100 ? ': 100–160 Wh, airline approval needed, max 2 spares' : ''}.</dd>` : ''}</dl>
    <p class="hint">A quick orientation from weight and BOM, not legal advice. Rules change and vary by country; check the current FAA / EASA / local rules before flying.</p>`,
    '<button class="btn" data-act="dlg-close">Close</button>');
}
function renderDesign(el) {
  el.innerHTML = `<div class="bench"><aside class="side"><div class="row" style="justify-content:space-between;margin-bottom:8px"><div class="seg" role="group" aria-label="Input detail"><button data-detail="simple" aria-pressed="${isSimple()}" title="The inputs most designs need">Simple</button><button data-detail="detailed" aria-pressed="${!isSimple()}" title="Every input: drag build-up, calibration, mission, electronics">Detailed</button></div>${sideTools}</div>${designInputs()}</aside>
    <section class="stack">
      <div id="readouts"></div>
      <div class="card"><div class="card-h"><h2>Checks</h2><div class="row"><p id="chkCount" style="margin:0">Updated as you type</p><button class="btn sm ghost" data-act="regs">Regulations</button></div></div><div class="checks" id="checks"></div></div>
      <div class="card"><div class="card-h"><h2>Flight history</h2><p>Save flights from the Flight Logs tab</p></div><div id="flights"></div></div>
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
  {
    // key results in one row; the rest under "More results" (open/closed is remembered)
    const tmp = document.createElement('div'); tmp.innerHTML = designReadouts(p, R) + missionReadouts(p, R, mp);
    const all = [...tmp.children], key = all.filter((x) => x.classList.contains('key')), rest = all.filter((x) => !x.classList.contains('key'));
    const open = !!(S.ui && S.ui.moreRo);
    $('#readouts').innerHTML = `<div class="readouts">${key.map((x) => x.outerHTML).join('')}</div>${rest.length ? `<details class="more-ro"${open ? ' open' : ''}><summary>More results <span class="faint">(${rest.length})</span></summary><div class="readouts">${rest.map((x) => x.outerHTML).join('')}</div></details>` : ''}`;
  }
  missionCard(p, mp);
  flightsCard(p, R);
  const nBad = R.checks.filter((c) => c.level === 'crit').length, nWarn = R.checks.filter((c) => c.level === 'warn').length;
  $('#chkCount').textContent = nBad || nWarn ? `${nBad} to fix · ${nWarn} to check` : 'All clear';
  $('#checks').innerHTML = R.checks.map((c) => `<div class="chk"><span class="pill ${c.level}">${{ good: 'OK', warn: 'Check', crit: 'Fix', info: 'Note' }[c.level]}</span><span>${esc(c.msg)}</span></div>`).join('');
  const rh = $('#rhoHint'); if (rh) rh.innerHTML = `Air density <b>${fmt(R.rho, 3)} kg/m³</b> (σ = ${fmt(R.sigma, 3)}).`;
  const bh = $('#batHint'); if (bh) bh.innerHTML = `Each pack ${p.batt.s}S${p.batt.p || 1}P, ${fmt(R.bat.packMah, 0)} mAh. On board: <b>${R.bat.S}S${R.bat.P}P · ${fmt(R.bat.mah, 0)} mAh · ${fmt(R.bat.V, 1)} V</b> (${fmt(R.bat.vMin, 1)}–${fmt(R.bat.vMax, 1)} V), <b>${fmt(R.bat.Wh, 0)} Wh</b>, ${fmt(R.bat.g, 0)} g, ${fmt(R.bat.iMaxCont, 0)} A continuous${R.bat.peakSet ? `, ${fmt(R.bat.iMaxPeak, 0)} A peak` : ''}. A ${R.bat.chem.label} pack this size typically weighs ~${fmt(R.bat.estG, 0)} g.`;
  const bh2 = $('#batHint'); if (bh2 && R.bat.coldF) bh2.innerHTML += ` <b style="color:var(--warn)">Cold: ${fmt(p.env.temp, 0)} °C leaves ${fmt(R.bat.coldF * 100, 0)} % of the usable energy.</b>`;
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

// remember whether "More results" is open
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('more-ro')) { S.ui = S.ui || {}; S.ui.moreRo = e.target.open; save(); } }, true);
