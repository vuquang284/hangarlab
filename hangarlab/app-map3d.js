// Flight Logs "3D map", modeled on Mission Planner / TitanPlanner's Map3D (re-implemented with three.js, no code copied):
// satellite imagery in rings of detail around home out to a hazy sky-blue horizon, terrain heights from the free AWS
// Terrarium elevation tiles, a chase camera behind the vehicle, and an orange vehicle model that follows playback.

let m3 = null;
const M3_ORANGE = 0xff6a13;

// vehicle shape from the log's firmware and parameters
function m3Kind() {
  const on = (n) => LV.params.some((p) => p.name === n && +p.value);
  const fw = LV.vehicle || (LV.vehicle = U.logFirmware(LOG, LV.params));
  if (fw === 'ArduPlane') return on('Q_TAILSIT_ENABLE') ? 'tailsitter' : on('Q_ENABLE') ? 'quadplane' : 'plane';
  if (fw === 'Rover') return 'rover';
  return 'copter';
}

// unit-size model, nose towards -Z (north at yaw 0), up +Y; every part orange
function m3Model(T, kind) {
  const g = new T.Group();
  const body = new T.MeshStandardMaterial({ color: M3_ORANGE, roughness: 0.45, metalness: 0.1 });
  const disc = new T.MeshStandardMaterial({ color: M3_ORANGE, transparent: true, opacity: 0.45, side: T.DoubleSide });
  const box = (w, h, d, x = 0, y = 0, z = 0) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), body); m.position.set(x, y, z); g.add(m); return m; };
  const rotor = (x, y, z, r) => { const m = new T.Mesh(new T.CircleGeometry(r, 24), disc); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); };
  if (kind === 'copter') {
    box(0.32, 0.12, 0.32);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const arm = box(0.06, 0.04, 0.72, sx * 0.25, 0, sz * 0.25); arm.rotation.y = sx * sz * Math.PI / 4;
      box(0.08, 0.1, 0.08, sx * 0.5, 0.05, sz * 0.5);
      rotor(sx * 0.5, 0.11, sz * 0.5, 0.26);
    }
    box(0.08, 0.06, 0.12, 0, 0.02, -0.2); // nose marker
  } else if (kind === 'rover') {
    box(0.5, 0.18, 0.9, 0, 0.12, 0);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(0.1, 0.22, 0.22, sx * 0.3, 0.05, sz * 0.32);
  } else if (kind === 'tailsitter') {
    box(1.6, 0.05, 0.38, 0, 0, 0.05); // flying wing
    box(0.04, 0.3, 0.22, 0.45, 0.12, 0.12); box(0.04, 0.3, 0.22, -0.45, 0.12, 0.12); // fins / landing legs
    for (const sx of [1, -1]) { box(0.08, 0.08, 0.18, sx * 0.45, 0, -0.22); const r = new T.Mesh(new T.CircleGeometry(0.22, 24), disc); r.position.set(sx * 0.45, 0, -0.32); g.add(r); }
  } else {
    box(0.13, 0.13, 1.0, 0, 0, 0.05); // fuselage
    box(1.6, 0.03, 0.24, 0, 0.04, -0.05); // wing
    box(0.55, 0.02, 0.14, 0, 0.03, 0.5); // tailplane
    box(0.02, 0.2, 0.16, 0, 0.13, 0.5); // fin
    const p = new T.Mesh(new T.CircleGeometry(0.16, 24), disc); p.position.set(0, 0, -0.46); g.add(p); // nose prop
    if (kind === 'quadplane') for (const sx of [1, -1]) {
      box(0.04, 0.04, 0.95, sx * 0.38, 0.06, -0.02); // boom
      rotor(sx * 0.38, 0.1, -0.48, 0.2); rotor(sx * 0.38, 0.1, 0.44, 0.2);
    }
  }
  g.rotation.order = 'YXZ';
  return g;
}

// CSS color (hsl/rgb/hex) → '#rrggbb' that three understands
const m3Css = (() => { let c; return (s) => { c = c || document.createElement('canvas').getContext('2d'); c.fillStyle = '#888'; c.fillStyle = s; return c.fillStyle; }; })();

// ---- web-mercator tile maths ----
const m3TX = (lo, z) => ((lo + 180) / 360) * 2 ** z;
const m3TY = (la, z) => ((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const m3Lng = (x, z) => (x / 2 ** z) * 360 - 180;
const m3Lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const m3Img = (src) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

// stitch a block of tiles [x0..x1]×[y0..y1] at zoom z into one canvas
async function m3Stitch(url, z, x0, x1, y0, y1) {
  const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  let ok = 0;
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(m3Img(url(z, x, y)).then((im) => { if (im) { cx.drawImage(im, (x - x0) * 256, (y - y0) * 256); ok++; } }));
  await Promise.all(jobs);
  return { cv, cx, ok };
}

// terrain: Terrarium tiles (height = R·256 + G + B/256 − 32768 m) covering a lat/lng box, as a height sampler
async function m3Terrain(la0, la1, lo0, lo1) {
  let z = 13;
  while (z > 5 && (Math.floor(m3TX(lo1, z)) - Math.floor(m3TX(lo0, z)) + 1) * (Math.floor(m3TY(la0, z)) - Math.floor(m3TY(la1, z)) + 1) > 16) z--;
  const x0 = Math.floor(m3TX(lo0, z)), x1 = Math.floor(m3TX(lo1, z)), y0 = Math.floor(m3TY(la1, z)), y1 = Math.floor(m3TY(la0, z));
  const st = await m3Stitch((zz, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zz}/${x}/${y}.png`, z, x0, x1, y0, y1);
  if (!st.ok) return null;
  let px; try { px = st.cx.getImageData(0, 0, st.cv.width, st.cv.height).data; } catch (e) { return null; }
  const W = st.cv.width, H = st.cv.height;
  return (la, lo) => {
    // bilinear between the four nearest height pixels: no stair-step cliffs that smear the imagery
    const fx = Math.max(0, Math.min(W - 1.001, (m3TX(lo, z) - x0) * 256 - 0.5)), fy = Math.max(0, Math.min(H - 1.001, (m3TY(la, z) - y0) * 256 - 0.5));
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const h = (x, y) => { const i = (y * W + x) * 4; return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768; };
    return (h(ix, iy) * (1 - ax) + h(ix + 1, iy) * ax) * (1 - ay) + (h(ix, iy + 1) * (1 - ax) + h(ix + 1, iy + 1) * ax) * ay;
  };
}

// one ring of imagery: an n×n block of tiles at zoom z centered on home, draped on the terrain and pushed back in
// depth by `level`, so the sharper rings win where they overlap
async function m3Ring(T, ctx, z, n, level) {
  const { lat0, lng0, kx } = ctx;
  const cx = Math.floor(m3TX(lng0, z)), cy = Math.floor(m3TY(lat0, z)), h = Math.floor(n / 2);
  const x0 = cx - h, x1 = cx + h, y0 = cy - h, y1 = cy + h;
  const st = await m3Stitch((zz, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zz}/${y}/${x}`, z, x0, x1, y0, y1);
  const E = (lo) => (lo - lng0) * kx, N = (la) => (la - lat0) * 110540;
  const w0 = E(m3Lng(x0, z)), w1 = E(m3Lng(x1 + 1, z)), n0 = N(m3Lat(y1 + 1, z)), n1 = N(m3Lat(y0, z));
  const seg = 64, geo = new T.PlaneGeometry(w1 - w0, n1 - n0, seg, seg);
  if (ctx.elev) {
    const pos = geo.attributes.position, mE = (w0 + w1) / 2, mN = (n0 + n1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const e = mE + pos.getX(i), nn = mN + pos.getY(i);
      pos.setZ(i, ctx.elev(lat0 + nn / 110540, lng0 + e / kx) - ctx.home);
    }
  }
  const tex = new T.CanvasTexture(st.cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = m3Aniso;
  const mat = new T.MeshBasicMaterial({ map: st.ok ? tex : null, color: st.ok ? 0xffffff : 0x6f7d63, polygonOffset: true, polygonOffsetFactor: level * 2, polygonOffsetUnits: level * 4 });
  const mesh = new T.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set((w0 + w1) / 2, -0.6 * (level + 1), -(n0 + n1) / 2);
  return { mesh, ok: st.ok };
}

// sharp tiles that follow the vehicle (zoom zd), like Mission Planner's near-camera detail; cached and trimmed
function m3Detail(lat, lng) {
  const { T } = m3, zd = m3.zd, ctx = m3.ctx;
  const cx = Math.floor(m3TX(lng, zd)), cy = Math.floor(m3TY(lat, zd)), R = 3;
  for (let x = cx - R; x <= cx + R; x++) for (let y = cy - R; y <= cy + R; y++) {
    const key = `${x}/${y}`;
    if (m3.tiles.has(key)) continue;
    m3.tiles.set(key, null);
    m3Img(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zd}/${y}/${x}`).then((im) => {
      if (!m3 || m3.ctx !== ctx || !im) return;
      const E = (lo) => (lo - ctx.lng0) * ctx.kx, N = (la) => (la - ctx.lat0) * 110540;
      const w0 = E(m3Lng(x, zd)), w1 = E(m3Lng(x + 1, zd)), n0 = N(m3Lat(y + 1, zd)), n1 = N(m3Lat(y, zd));
      const geo = new T.PlaneGeometry(w1 - w0, n1 - n0, 24, 24);
      if (ctx.elev) { const pos = geo.attributes.position, mE = (w0 + w1) / 2, mN = (n0 + n1) / 2; for (let i = 0; i < pos.count; i++) pos.setZ(i, ctx.elev(ctx.lat0 + (mN + pos.getY(i)) / 110540, ctx.lng0 + (mE + pos.getX(i)) / ctx.kx) - ctx.home); }
      const tex = new T.Texture(im); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = m3Aniso; tex.needsUpdate = true;
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set((w0 + w1) / 2, 0.2, -(n0 + n1) / 2);
      m3.scene.add(mesh); m3.tiles.set(key, mesh);
      m3Draw();
    });
  }
  if (m3.tiles.size > 160) for (const [key, mesh] of m3.tiles) {
    const [x, y] = key.split('/').map(Number);
    if (Math.abs(x - cx) > 5 || Math.abs(y - cy) > 5) { if (mesh) { m3.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose(); } m3.tiles.delete(key); }
  }
}

const M3_SKY = 0xaed9e6;
let m3Aniso = 8; // hazy sky blue, the horizon color Mission Planner fades its map into

async function m3Build(host) {
  const T = await loadThree();
  const tr = LV.track;
  const scene = new T.Scene();
  scene.background = new T.Color(M3_SKY);
  scene.add(new T.HemisphereLight(0xffffff, 0x556655, 1.6));
  const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(300, 600, 200); scene.add(sun);
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  m3Aniso = renderer.capabilities.getMaxAnisotropy();
  host.innerHTML = ''; host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(60, 1, 1, 400000);
  // flight path colored by mode
  const n = tr.e.length, step = Math.max(1, Math.floor(n / 6000)), pts = [], cols = [];
  let span = 20;
  for (let i = 0; i < n; i += step) {
    pts.push(tr.e[i], tr.u[i], -tr.n[i]);
    const c = new T.Color(m3Css(modeColor(modeAt(tr.t[i]) || 'none'))); cols.push(c.r, c.g, c.b);
    span = Math.max(span, Math.abs(tr.e[i]) * 2, Math.abs(tr.n[i]) * 2, tr.u[i] * 2);
  }
  const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  scene.add(new T.Line(lg, new T.LineBasicMaterial({ vertexColors: true })));
  const kind = m3Kind(), model = m3Model(T, kind), scale = Math.max(2, Math.min(span / 45, 60));
  model.scale.setScalar(scale); scene.add(model);
  const lineMat = (color, opacity) => new T.LineBasicMaterial({ color, transparent: true, opacity });
  const drop = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), lineMat(M3_ORANGE, 0.7));
  const heading = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), lineMat(0xffffff, 0.9));
  scene.add(drop, heading);
  scene.fog = new T.Fog(M3_SKY, span * 3, span * 25);
  m3 = { T, key: `${LOG.name}|${LV.t0}`, renderer, scene, camera, model, drop, heading, kind, span, scale, mode: 'chase', chase: { off: 0, dist: scale * 9, h: scale * 3 }, orbit: { yaw: -0.6, pitch: 0.5, dist: span * 0.6 }, elev: null };
  // detail zoom so 5×5 tiles cover the flight; five coarser rings, each twice as wide, reach the horizon
  const lat0 = tr.lat[0], lng0 = tr.lng[0], kx = Math.cos((lat0 * Math.PI) / 180) * 111320, mpp = (z) => (156543 * Math.cos((lat0 * Math.PI) / 180)) / 2 ** z;
  let z0 = 18; while (z0 > 8 && mpp(z0) * 256 * 5 < span * 1.4) z0--;
  const ctx = { lat0, lng0, kx, elev: null, home: 0 };
  const far = mpp(z0 - 5) * 256 * 3, dLa = far / 110540, dLo = far / kx;
  const elev = await m3Terrain(lat0 - dLa, lat0 + dLa, lng0 - dLo, lng0 + dLo).catch(() => null);
  if (elev) { ctx.elev = elev; ctx.home = elev(lat0, lng0); m3.elev = (e, nn) => elev(lat0 + nn / 110540, lng0 + e / kx) - ctx.home; }
  Object.assign(m3, { ctx, zd: Math.min(18, Math.max(z0 + 2, 17)), tiles: new Map() });
  for (let lvl = 0; lvl <= 5; lvl++) {
    m3Ring(T, ctx, z0 - lvl, lvl === 0 ? 5 : 6, lvl).then((r) => {
      if (!m3 || m3.scene !== scene) return;
      scene.add(r.mesh);
      const note = $('#lvViewNote');
      if (lvl === 0 && note && lvs.view === 'map3d') note.textContent = !r.ok ? 'Satellite imagery is blocked here; the path and model still show. The downloaded app file loads it.' : `${tr.src} · ${elev ? 'terrain on' : 'flat ground (terrain unavailable)'} · drag: look around · scroll: zoom · double-click: chase / overview`;
      m3Draw();
    });
  }
}

function m3Draw() {
  const host = $('#lv3dMap');
  if (!host || host.hidden || !LV) return;
  if (!LV.track) { host.innerHTML = '<p class="faint" style="padding:16px">No position data in this log.</p>'; return; }
  if (!m3 || m3.key !== `${LOG.name}|${LV.t0}`) {
    if (m3) { m3.renderer.dispose(); m3 = null; }
    if (host.dataset.loading) return;
    host.dataset.loading = '1';
    host.innerHTML = '<p class="faint" style="padding:16px">Loading 3D map, imagery and terrain…</p>';
    m3Build(host).then(() => { delete host.dataset.loading; m3Draw(); }).catch(() => { delete host.dataset.loading; host.innerHTML = '<p class="faint" style="padding:16px">The 3D map needs an internet connection the first time (three.js).</p>'; });
    return;
  }
  if (!host.contains(m3.renderer.domElement)) { host.innerHTML = ''; host.appendChild(m3.renderer.domElement); }
  const { T, renderer, camera, model, drop, heading } = m3, tr = LV.track;
  const W = host.clientWidth || 600, H = host.clientHeight || 380;
  renderer.setSize(W, H, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = W / H; camera.updateProjectionMatrix();
  // vehicle at the playback cursor, attitude from ATT (roll right-wing-down, pitch nose-up, yaw clockwise from north)
  const k = Math.max(0, U.idxAt(tr.t, lvs.cursor));
  const gnd = m3.elev ? m3.elev(tr.e[k], tr.n[k]) : 0;
  const pos = new T.Vector3(tr.e[k], Math.max(gnd + 0.3, tr.u[k]), -tr.n[k]);
  model.position.copy(pos);
  if (m3.ctx && m3.mode === 'chase') m3Detail(tr.lat[k], tr.lng[k]);
  const d2r = Math.PI / 180, roll = valAt('ATT.Roll', lvs.cursor) || 0, pitch = valAt('ATT.Pitch', lvs.cursor) || 0, yaw = valAt('ATT.Yaw', lvs.cursor) || 0;
  model.rotation.set(pitch * d2r, -yaw * d2r, -roll * d2r);
  drop.geometry.setFromPoints([pos, new T.Vector3(pos.x, gnd, pos.z)]);
  const hy = yaw * d2r, L = m3.scale * 5;
  heading.geometry.setFromPoints([pos, new T.Vector3(pos.x + Math.sin(hy) * L, pos.y, pos.z - Math.cos(hy) * L)]);
  if (m3.mode === 'chase') {
    // behind the vehicle along its heading, swung by the drag angle, a little above; never below the ground
    const a = hy + m3.chase.off, c = m3.chase;
    camera.position.set(pos.x - Math.sin(a) * c.dist, pos.y + c.h, pos.z + Math.cos(a) * c.dist);
    if (m3.elev) camera.position.y = Math.max(camera.position.y, m3.elev(camera.position.x, -camera.position.z) + 2);
    camera.lookAt(pos.x, pos.y + c.h * 0.25, pos.z);
  } else {
    const c = m3.orbit;
    camera.position.set(c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), c.dist * Math.cos(c.pitch) * Math.cos(c.yaw));
    camera.lookAt(0, 0, 0);
  }
  renderer.render(m3.scene, camera);
}

// chase: drag swings the camera around the vehicle and up/down, scroll moves in/out; overview: orbit home.
// double-click switches between them
let m3Drag = null;
document.addEventListener('pointerdown', (e) => { if (m3 && e.target === m3.renderer.domElement) { m3Drag = [e.clientX, e.clientY]; e.target.setPointerCapture(e.pointerId); } });
document.addEventListener('pointermove', (e) => {
  if (!m3Drag || !m3) return;
  const dx = e.clientX - m3Drag[0], dy = e.clientY - m3Drag[1];
  if (m3.mode === 'chase') { m3.chase.off -= dx * 0.008; m3.chase.h = Math.max(-m3.scale * 2, Math.min(m3.chase.dist * 1.5, m3.chase.h + dy * m3.scale * 0.03)); }
  else { m3.orbit.yaw -= dx * 0.008; m3.orbit.pitch = Math.max(0.08, Math.min(1.5, m3.orbit.pitch + dy * 0.006)); }
  m3Drag = [e.clientX, e.clientY]; m3Draw();
});
document.addEventListener('pointerup', () => { m3Drag = null; });
document.addEventListener('wheel', (e) => {
  if (!m3 || e.target !== m3.renderer.domElement) return;
  e.preventDefault();
  const f = e.deltaY > 0 ? 1.12 : 0.89;
  if (m3.mode === 'chase') { m3.chase.dist = Math.max(m3.scale * 2, Math.min(m3.span * 2, m3.chase.dist * f)); m3.chase.h *= f; }
  else m3.orbit.dist = Math.max(m3.scale * 4, Math.min(m3.span * 8, m3.orbit.dist * f));
  m3Draw();
}, { passive: false });
document.addEventListener('dblclick', (e) => { if (!m3 || e.target !== m3.renderer.domElement) return; m3.mode = m3.mode === 'chase' ? 'orbit' : 'chase'; toast(m3.mode === 'chase' ? '3D map: chase camera' : '3D map: overview around home'); m3Draw(); });
