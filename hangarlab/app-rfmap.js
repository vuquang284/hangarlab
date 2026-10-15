// HangarLab UI: Radio Link coverage map. Ground station from a pasted lat/lng, a map click or a KML/KMZ file;
// flight path from KML / waypoints / pasted coordinates. Each cell is colored by the selected radio's link margin
// at the drone's height, and grayed where terrain (AWS Terrarium heights + 4/3-earth curvature) blocks line of sight.
// ponytail: line of sight only (no diffraction / Fresnel-zone loss, no buildings or trees); a margin, not a guarantee.
'use strict';

let rfMap = null; // { map, L, base, layers }
let rfTerrain = null; // { key, elev }
const rfCov = { busy: false, last: '' };

// "lat, lng" / "lat lng" / "lat<TAB>lng" per line; also QGC .waypoints rows (lat/lng in columns 9 and 10)
function rfParseCoords(text) {
  const pts = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const c = line.trim().split(/[\s,;]+/).map(Number).filter((x) => isFinite(x));
    const cols = line.trim().split(/\t/);
    if (cols.length >= 11 && isFinite(+cols[8]) && isFinite(+cols[9]) && (+cols[8] || +cols[9])) { pts.push([+cols[8], +cols[9]]); continue; }
    if (c.length >= 2 && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180 && (c[0] || c[1])) pts.push([c[0], c[1]]);
  }
  return pts;
}
// KML: first Point = ground station, LineStrings / polygon rings = flight path (KML stores lng,lat[,alt])
function rfParseKml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), out = { gcs: null, path: [] };
  const pairs = (t) => t.trim().split(/\s+/).map((s) => s.split(',').map(Number)).filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1])).map(([lo, la]) => [la, lo]);
  for (const pm of doc.getElementsByTagName('Placemark')) {
    const pt = pm.getElementsByTagName('Point')[0], ls = [...pm.getElementsByTagName('LineString'), ...pm.getElementsByTagName('LinearRing')];
    if (pt && !out.gcs) { const c = pairs(pt.getElementsByTagName('coordinates')[0]?.textContent || ''); if (c[0]) out.gcs = c[0]; }
    for (const l of ls) out.path.push(...pairs(l.getElementsByTagName('coordinates')[0]?.textContent || ''));
  }
  return out;
}
async function rfLoadFile(file) {
  const p = P(), rf = p.rf, name = file.name.toLowerCase();
  let text;
  if (name.endsWith('.kmz')) { const ent = unzip(await file.arrayBuffer()).find((e) => /\.kml$/i.test(e.name)); if (!ent) return toast('No .kml inside that .kmz.'); text = await ent.read(); }
  else text = await file.text();
  const k = /<kml|<Placemark/i.test(text) ? rfParseKml(text) : { gcs: null, path: rfParseCoords(text) };
  if (!k.gcs && !k.path.length) return toast('No coordinates found in that file.');
  withUndo(`Loaded ${file.name}`, () => { if (k.gcs) rf.gcs = k.gcs; if (k.path.length) rf.path = k.path; if (!rf.gcs && k.path.length) rf.gcs = k.path[0]; });
}

function rfMapCard(p) {
  const rf = p.rf, links = rfLinks(p);
  if (!rf.cov || !links.some((x) => x.key === rf.cov)) rf.cov = links[0] ? links[0].key : '';
  return `<div class="card"><div class="card-h"><h2>Coverage map</h2><p id="rfCovNote">Set the ground station to draw coverage</p></div>
    <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));padding:0 0 10px">
      <label class="f"><span>Ground station (lat, lng)</span><input type="text" id="rfGcs" value="${rf.gcs ? `${rf.gcs[0].toFixed(6)}, ${rf.gcs[1].toFixed(6)}` : ''}" placeholder="38.9869, -76.9426 or click the map"></label>
      <label class="f"><span>Radio shown</span><select id="rfCovSel">${links.map((x) => `<option value="${esc(x.key)}"${x.key === rf.cov ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <div class="f"><span>Flight path / area</span><div class="row" style="gap:6px"><label class="btn sm">Import .kml / .kmz / .waypoints<input type="file" id="rfFile" accept=".kml,.kmz,.waypoints,.txt,.csv" hidden></label><button class="btn sm ghost" data-act="rf-paste">Paste coordinates</button>${rf.path && rf.path.length ? '<button class="btn sm ghost danger" data-act="rf-path-clear">Clear path</button>' : ''}</div></div>
    </div>
    <div id="rfMap" style="height:440px;border-radius:4px;overflow:hidden;background:var(--panel-2)"></div>
    <div class="legend" style="margin-top:8px"><span><i style="background:#2fa84f"></i>margin ≥ fade margin</span><span><i style="background:#e8b23a"></i>link closes, below fade margin</span><span><i style="background:#e5484d"></i>out of range</span><span><i style="background:#555"></i>terrain blocks line of sight</span></div>
    <p class="hint" id="rfPathNote"></p>
    <p class="hint">Coverage at the drone height set in Mission geometry (above the ground station's ground). Uses this radio's budget, the earth's curve and terrain line of sight; buildings, trees and the Fresnel zone are not counted, so plan with margin.</p></div>`;
}

async function rfMapDraw() {
  const box = $('#rfMap'), p = P(), rf = p.rf;
  if (!box) return;
  let L; try { L = await loadLeaflet(); } catch (e) { box.innerHTML = `<p class="faint" style="padding:16px">${esc(e.message)}</p>`; return; }
  if (!rfMap || rfMap.map.getContainer() !== box) {
    if (rfMap) rfMap.map.remove();
    const map = L.map(box, { zoomControl: true });
    const bases = {
      Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
      Street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }),
    };
    (bases[S.settings.logs.map] || bases.Satellite).addTo(map);
    L.control.layers(bases, null, { position: 'topright', collapsed: false }).addTo(map);
    map.on('click', (e) => { withUndo('Ground station placed', () => { rf.gcs = [e.latlng.lat, e.latlng.lng]; }); });
    rfMap = { map, L, group: L.layerGroup().addTo(map), fitted: false };
    map.setView(rf.gcs || [38.99, -76.94], rf.gcs ? 12 : 4);
  }
  rfMap.group.clearLayers();
  const note = $('#rfCovNote');
  if (!rf.gcs) { if (note) note.textContent = 'Paste the ground station position or click the map'; return; }
  const link = rfLinks(p).find((x) => x.key === rf.cov);
  const gcsIcon = L.circleMarker(rf.gcs, { radius: 7, color: '#111', weight: 2, fillColor: '#ff6a13', fillOpacity: 1 }).bindTooltip('Ground station');
  if (rf.path && rf.path.length) L.polyline(rf.path, { color: '#111', weight: 6, opacity: 0.5 }).addTo(rfMap.group);
  if (!link) { gcsIcon.addTo(rfMap.group); if (note) note.textContent = 'No radios on this design yet'; return; }
  // range rings for every radio (where its budget alone runs out, capped by the radio horizon)
  const d = rf, hor = U.radioHorizonKm(d.alt, d.gndH);
  rfLinks(p).forEach((x, i) => {
    const r = U.link(x.l, d), km = Math.min(r.maxKm, hor);
    L.circle(rf.gcs, { radius: km * 1000, color: cssv(`--c${(i % 8) + 1}`), weight: x.key === rf.cov ? 2.5 : 1.2, fill: false, dashArray: x.key === rf.cov ? null : '6 6' }).bindTooltip(`${x.name}: ${fmt(km, 1)} km${km < r.maxKm ? ' (radio horizon)' : ''}`).addTo(rfMap.group);
  });
  // map radius: where the link stops closing at all (0 dB margin), or the farthest path point, whichever is larger
  const sel = U.link(link.l, d), edge = Math.min(U.link(link.l, Object.assign({}, d, { fade: 0 })).maxKm, hor);
  const kx0 = Math.cos((rf.gcs[0] * Math.PI) / 180) * 111320;
  const far = (rf.path || []).reduce((m, q) => Math.max(m, Math.hypot((q[0] - rf.gcs[0]) * 110540, (q[1] - rf.gcs[1]) * kx0) / 1000), 0);
  const R = Math.max(1, edge, far) * 1.1;
  if (!rfMap.fitted || rfMap.lastR !== R) { rfMap.map.fitBounds(L.latLng(rf.gcs).toBounds(R * 2000), { padding: [10, 10] }); rfMap.fitted = true; rfMap.lastR = R; }
  // terrain once per ground station / radius
  const kx = Math.cos((rf.gcs[0] * Math.PI) / 180) * 111320, dLa = (R * 1000) / 110540, dLo = (R * 1000) / kx;
  const tkey = `${rf.gcs.join()}|${Math.ceil(R)}`;
  if (!rfTerrain || rfTerrain.key !== tkey) {
    if (note) note.textContent = 'Loading terrain…';
    const elev = await m3Terrain(rf.gcs[0] - dLa, rf.gcs[0] + dLa, rf.gcs[1] - dLo, rf.gcs[1] + dLo).catch(() => null);
    rfTerrain = { key: tkey, elev };
  }
  const elev = rfTerrain.elev, g0 = elev ? elev(rf.gcs[0], rf.gcs[1]) : 0;
  const ant = g0 + d.gndH, air = g0 + d.alt, kRe = 4 / 3 * 6371000;
  // line of sight from the ground antenna to a drone at (la, lo): terrain + earth bulge must stay under the ray
  const losOk = (la, lo, distM) => {
    if (!elev) return true;
    for (let s = 1; s < 24; s++) {
      const f = s / 24, h = ant + (air - ant) * f, x = distM * f;
      const gt = elev(rf.gcs[0] + (la - rf.gcs[0]) * f, rf.gcs[1] + (lo - rf.gcs[1]) * f) + (x * (distM - x)) / (2 * kRe);
      if (gt > h) return false;
    }
    return true;
  };
  const cls = (la, lo) => {
    const e = (lo - rf.gcs[1]) * kx, n = (la - rf.gcs[0]) * 110540, dist = Math.hypot(e, n);
    const m = U.link(link.l, { dist: dist / 1000, alt: d.alt, gndH: d.gndH, fade: d.fade }).margin;
    if (m < 0 || dist / 1000 > hor) return 3;
    if (!losOk(la, lo, dist)) return 4;
    return m >= d.fade ? 1 : 2;
  };
  const N = 120, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const cx = cv.getContext('2d'), img = cx.createImageData(N, N), COL = { 1: [47, 168, 79, 120], 2: [232, 178, 58, 130], 3: [229, 72, 77, 70], 4: [70, 70, 70, 150] };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const la = rf.gcs[0] + dLa - ((j + 0.5) / N) * 2 * dLa, lo = rf.gcs[1] - dLo + ((i + 0.5) / N) * 2 * dLo, o = (j * N + i) * 4;
    if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) > 0.5) continue; // round coverage, not a square
    const c = COL[cls(la, lo)];
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
  }
  cx.putImageData(img, 0, 0);
  L.imageOverlay(cv.toDataURL(), [[rf.gcs[0] - dLa, rf.gcs[1] - dLo], [rf.gcs[0] + dLa, rf.gcs[1] + dLo]], { opacity: 0.85, interactive: false }).addTo(rfMap.group);
  // flight path: each leg colored by the worst point on it, and the share of the path that is covered
  const pn = $('#rfPathNote');
  if (rf.path && rf.path.length > 1) {
    let good = 0, tot = 0;
    for (let s = 1; s < rf.path.length; s++) {
      const a = rf.path[s - 1], b = rf.path[s], steps = 8;
      let worst = 1;
      for (let q = 0; q <= steps; q++) { const c = cls(a[0] + (b[0] - a[0]) * q / steps, a[1] + (b[1] - a[1]) * q / steps); worst = Math.max(worst, c); }
      const len = Math.hypot((b[0] - a[0]) * 110540, (b[1] - a[1]) * kx);
      tot += len; if (worst === 1) good += len;
      L.polyline([a, b], { color: { 1: '#2fa84f', 2: '#e8b23a', 3: '#e5484d', 4: '#9a9a9a' }[worst], weight: 4 }).addTo(rfMap.group);
    }
    if (pn) pn.innerHTML = `<b>${esc(link.name)}</b> covers <b>${fmt((good / (tot || 1)) * 100, 0)} %</b> of the ${fmt(tot / 1000, 1)} km path with the full fade margin.`;
  } else if (pn) pn.textContent = '';
  gcsIcon.addTo(rfMap.group);
  if (note) note.textContent = `${link.name}: up to ${fmt(Math.min(sel.maxKm, hor), 1)} km at ${fmt(d.alt, 0)} m${elev ? ' · terrain on' : ' · flat earth (terrain unavailable)'}`;
}
const rfMapSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => rfMapDraw(), 250); }; })();

document.addEventListener('change', (e) => {
  const el = e.target, p = S && P();
  if (!p) return;
  if (el.id === 'rfGcs') {
    const c = rfParseCoords(el.value)[0];
    if (!c) { toast('Use "lat, lng", e.g. 38.9869, -76.9426'); return; }
    withUndo('Ground station set', () => { p.rf.gcs = c; });
  }
  if (el.id === 'rfCovSel') { p.rf.cov = el.value; save(); rfMapDraw(); }
  if (el.id === 'rfFile' && el.files[0]) { rfLoadFile(el.files[0]); el.value = ''; }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act="rf-paste"],[data-act="rf-path-clear"],[data-act="rf-paste-go"]');
  if (!b) return;
  const p = P();
  if (b.dataset.act === 'rf-path-clear') withUndo('Path cleared', () => { p.rf.path = []; });
  if (b.dataset.act === 'rf-paste') openDlg('Paste coordinates', '<p class="note" style="margin-top:0">One point per line: <code>lat, lng</code> (decimal degrees). The first point is used as the ground station if none is set. Mission Planner / QGC <code>.waypoints</code> lines work too.</p><textarea id="rfPasteBox" rows="10" placeholder="38.9869, -76.9426\n38.9901, -76.9380\n38.9952, -76.9311"></textarea>', '<button class="btn" data-act="dlg-close">Cancel</button><button class="btn primary" data-act="rf-paste-go">Use these points</button>');
  if (b.dataset.act === 'rf-paste-go') {
    const pts = rfParseCoords($('#rfPasteBox').value);
    if (!pts.length) { toast('No coordinates found.'); return; }
    closeDlg();
    withUndo(`${pts.length} point${pts.length > 1 ? 's' : ''} added`, () => { if (!p.rf.gcs) p.rf.gcs = pts[0]; p.rf.path = pts.length > 1 ? pts : p.rf.path || []; });
  }
});
