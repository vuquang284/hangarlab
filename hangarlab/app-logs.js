// HangarLab UI: Flight Logs tab.
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

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
  LV = { vehicle: null, modes, segs, ev, track, params, t0, t1, att: U.findMsg(LOG, 'ATT') };
  lvs.cursor = t0;
}
function lvModeTable() {
  const mc = LV.mc = U.modeCruise(LOG, LV.segs), fwDesign = P().type !== 'multirotor';
  if (!mc) return `<div class="legend" id="lvModes">${[...new Set(LV.segs.map((s) => s.name))].map((n) => `<span><i style="background:${modeColor(n)}"></i>${esc(n)}</span>`).join('')}</div>`;
  return `<div class="tbl-wrap" style="margin-top:10px"><table class="mis" id="lvModes"><thead><tr><th>Flight mode</th><th class="n">Time</th><th class="n">Cruising</th><th class="n">Avg cruise speed</th><th class="n">Avg cruise current</th><th class="n">Avg cruise power</th>${fwDesign ? '<th></th>' : ''}</tr></thead><tbody>
    ${mc.rows.map((r, i) => `<tr><td><i class="dot" style="background:${modeColor(r.name)}"></i>${esc(r.name)}</td><td class="n">${fmtT(r.time)}</td><td class="n">${r.cruise ? fmtT(r.cruise) : '<span class="faint">—</span>'}</td><td class="n">${fin(r.v) ? `${fmt(r.v, 1)} m/s` : '<span class="faint">—</span>'}</td><td class="n">${fin(r.i) ? `${fmt(r.i, 1)} A` : '<span class="faint">—</span>'}</td><td class="n">${fin(r.p) ? `${fmt(r.p, 0)} W` : '<span class="faint">—</span>'}</td>${fwDesign ? `<td>${fin(r.v) && fin(r.i) && r.cruise > 30 ? `<button class="btn sm" data-lv="cal" data-i="${i}" title="Use this as the measured cruise point of ${esc(P().name)}">Calibrate ${esc(P().name)}</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div><p class="hint">Cruising = armed, moving faster than 3 m/s and holding altitude within 1 m/s. Speed is ${mc.src}${mc.src === 'ground speed' ? ' (no airspeed sensor logged, so wind is included)' : ''}.</p>
    <div class="row" style="margin-top:6px"><button class="btn sm" data-lv="hist">Save this flight to ${esc(P().name)}'s history</button><button class="btn sm" data-lv="mission"${LV.track ? '' : ' disabled'}>Build ${esc(P().name)}'s mission profile from this flight</button></div>`;
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
    <div class="card" id="lvHealth"></div>
    <div class="lv">
      <aside class="card lv-side">
        <div class="seg" role="tablist" style="width:100%;margin-bottom:10px">${[['plot', 'Plot'], ['params', `Params ${LV.params.length || ''}`], ['events', `Events ${LV.ev.length || ''}`]].map(([k, l]) => `<button data-lvside="${k}" aria-pressed="${lvs.side === k}" style="flex:1">${l}</button>`).join('')}</div>
        <div id="lvSide"></div>
      </aside>
      <section class="lv-main">
        <div class="lv-top">
          <div class="card lv-viewcard">
            <div class="card-h"><div class="seg">${[['3d', '3D'], ['map', 'Map'], ['map3d', '3D map']].map(([k, l]) => `<button data-lvview="${k}" aria-pressed="${lvs.view === k}">${l}</button>`).join('')}</div><p id="lvViewNote">${LV.track ? `${esc(LV.track.src)} · drag to rotate · scroll to zoom` : 'No position data in this log'}</p></div>
            <div class="lv-view"><canvas id="lv3d"${lvs.view === '3d' ? '' : ' hidden'}></canvas><div id="lvMap"${lvs.view === 'map' ? '' : ' hidden'}></div><div id="lv3dMap"${lvs.view === 'map3d' ? '' : ' hidden'}></div></div>
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
    const vehicle = LV.vehicle || (LV.vehicle = U.logFirmware(LOG, LV.params)), meta = LV.pdef;
    if (meta === undefined) { LV.pdef = null; pdefLoad(vehicle).then((m) => { LV.pdef = m || false; if (lvs.side === 'params') lvSide(); }); }
    const info = (n) => (meta && meta.get(n)) || null;
    const q = lvs.paramQ.toLowerCase(), rows = LV.params.filter((p) => !q || p.name.toLowerCase().includes(q) || ((info(p.name) || {}).DisplayName || '').toLowerCase().includes(q));
    const nBad = meta ? LV.params.filter((p) => paramIssue(info(p.name), p.value)).length : 0;
    box.innerHTML = LV.params.length ? `<div class="row" style="margin-bottom:8px"><input type="search" id="lvParamQ" placeholder="Search parameters" value="${esc(lvs.paramQ)}" style="flex:1"><button class="btn sm" data-lv="params">Save .param</button></div>
      ${meta === null ? '<p class="hint">Loading parameter descriptions from ArduPilot…</p>' : meta === false ? '<p class="hint">Parameter descriptions could not be loaded here (offline or blocked).</p>' : `<p class="hint">${esc(vehicle)} descriptions loaded.${nBad ? ` <b style="color:var(--warn)">${nBad} value${nBad > 1 ? 's' : ''} outside the documented range.</b>` : ''} Hover a name for its description.</p>`}
      <div class="tree-msgs"><table class="lv-params"><tbody>${rows.map((p) => { const inf = info(p.name), bad = paramIssue(inf, p.value); return `<tr${bad ? ' style="color:var(--warn)"' : ''}><td title="${inf ? esc(`${inf.DisplayName || ''}: ${inf.Description || ''}${inf.Units ? ` (${inf.Units})` : ''}${inf.Range ? ` Range ${inf.Range.low}–${inf.Range.high}` : ''}`) : ''}">${esc(p.name)}${bad ? ` <span class="pill warn">${esc(bad)}</span>` : ''}${inf && inf.DisplayName ? `<div class="faint" style="font-size:11px">${esc(inf.DisplayName)}${inf.Units ? ` · ${esc(inf.Units)}` : ''}</div>` : ''}${p.changes ? ' <span class="pill warn" title="Changed during the log">±' + p.changes + '</span>' : ''}</td><td class="n">${fmt(p.value, Number.isInteger(p.value) ? 0 : 4)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="hint">${rows.length} of ${LV.params.length}. ± marks parameters changed during the log.</p>` : '<p class="faint">No PARM records in this log.</p>';
  } else {
    const K = { mode: 'Modes', msg: 'Messages', err: 'Errors', ev: 'Events' };
    const rows = LV.ev.filter((e) => lvs.evKinds[e.kind]);
    box.innerHTML = `<div class="chips" style="margin-bottom:8px">${Object.entries(K).map(([k, l]) => `<label class="chip"><input type="checkbox" data-lvkind="${k}"${lvs.evKinds[k] ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="msglist lv-events" style="max-height:560px">${rows.map((e) => `<button class="lv-ev ${e.kind}${e.kind === 'err' && !e.ok ? ' bad' : ''}" data-lvjump="${e.t}"><span>${fmtT(e.t - LV.t0)}</span>${e.kind === 'mode' ? `<i style="background:${modeColor(e.text.replace('Mode → ', ''))}"></i>` : ''}${esc(e.text)}</button>`).join('') || '<p class="faint">Nothing to show.</p>'}</div>`;
  }
}
const fmtT = (s) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

// ---- ArduPilot parameter descriptions (autotest.ardupilot.org, loaded once per vehicle) ----
const pdefCache = {};
function pdefLoad(vehicle) {
  if (pdefCache[vehicle]) return pdefCache[vehicle];
  pdefCache[vehicle] = fetch(`https://autotest.ardupilot.org/Parameters/${vehicle}/apm.pdef.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return null;
    const m = new Map();
    for (const g of Object.values(j)) for (const [k, v] of Object.entries(g)) m.set(k, v);
    return m;
  }).catch(() => null);
  return pdefCache[vehicle];
}
// out of the documented range, or not one of the listed values
function paramIssue(info, v) {
  if (!info) return '';
  if (info.Range && isFinite(+info.Range.low) && isFinite(+info.Range.high) && (v < +info.Range.low || v > +info.Range.high)) return `outside ${info.Range.low}–${info.Range.high}`;
  if (info.Values && !info.Bitmask && !(String(v) in info.Values) && !(String(Math.round(v)) in info.Values)) return 'not a listed value';
  return '';
}
function lvHealthCard() {
  const el = $('#lvHealth');
  if (!el || !LV) return;
  const vehicle = LV.vehicle || (LV.vehicle = U.logFirmware(LOG, LV.params));
  const rows = U.logHealth(LOG, LV.params, vehicle);
  const nBad = rows.filter((r) => r.level === 'crit').length, nWarn = rows.filter((r) => r.level === 'warn').length;
  el.innerHTML = `<div class="card-h"><h2>Health check</h2><p>${esc(vehicle)} log · ${nBad ? `${nBad} to fix · ` : ''}${nWarn ? `${nWarn} to check` : nBad ? '' : 'nothing flagged'}</p></div>
    <div class="checks">${rows.map((r) => `<div class="chk"><span class="pill ${r.level}">${{ good: 'OK', warn: 'Check', crit: 'Fix' }[r.level]}</span><span><b>${esc(r.title)}</b> · ${esc(r.detail)}</span></div>`).join('') || '<p class="faint">Not enough data in this log.</p>'}</div>
    <p class="hint">Checks follow ArduPilot's log analyzer: board power, vibration, GPS, compass interference, motor balance, processor load, errors, failsafes and battery.</p>`;
}
function logSummary() {
  lvHealthCard();
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

function lvDraw() { if (!LV || S.tab !== 'logs') return; lv3d(); lvHud(); convertDom($('#lvData')); if (lvs.view === 'map') lvMap(); if (lvs.view === 'map3d') m3Draw(); const c = $('#lvClock'); if (c) c.textContent = `${fmtT(lvs.cursor - LV.t0)} / ${fmtT(LV.t1 - LV.t0)}`; }

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
  if (b.dataset.lvview) { lvs.view = b.dataset.lvview; document.querySelectorAll('[data-lvview]').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#lv3d').hidden = lvs.view !== '3d'; $('#lvMap').hidden = lvs.view !== 'map'; $('#lv3dMap').hidden = lvs.view !== 'map3d'; $('#lvViewNote').textContent = LV.track ? `${LV.track.src} · ${lvs.view === 'map' ? 'drag to pan · scroll to zoom' : lvs.view === 'map3d' ? 'drag to orbit · scroll to zoom · double-click: follow / home' : 'drag to rotate · scroll to zoom'}` : 'No position data in this log'; lvDraw(); if (lmap) setTimeout(() => lmap.invalidateSize(), 50); return; }
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
  if (a === 'hist') {
    const p = P(), mc = LV.mc, R = U.compute(p, S.lib, { lite: true });
    const best = mc && mc.rows.filter((r) => fin(r.v) && r.cruise > 30).sort((x, y) => y.cruise - x.cruise)[0];
    const m = U.missionFromLog(LOG, LV.segs, LV.track, p.type);
    withUndo(`Flight saved to ${p.name}'s history (Performance tab)`, () => {
      p.flights = p.flights || [];
      p.flights.unshift({ at: Date.now(), log: LOG.name || 'log', dur: LV.t1 - LV.t0, wh: m && fin(m.wh) ? +m.wh.toFixed(1) : null, mode: best ? best.name : '', v: best ? +best.v.toFixed(2) : null, i: best ? +best.i.toFixed(2) : null, src: mc ? mc.src : '', auw: Math.round(R.Wg) });
    });
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
