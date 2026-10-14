// Flight Logs "3D map": the flight path over satellite imagery with an orange vehicle model that follows playback.
// three.js (loaded on first use, like the STL preview); imagery is Esri World Imagery stitched into one ground texture.
// ponytail: flat ground at the home altitude (no terrain model); add a DEM when hilly sites matter.

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

// CSS colour (hsl/rgb/hex) → '#rrggbb' that three understands
const m3Css = (() => { let c; return (s) => { c = c || document.createElement('canvas').getContext('2d'); c.fillStyle = '#888'; c.fillStyle = s; return c.fillStyle; }; })();

// stitch satellite tiles covering the track into one canvas, placed in local east/north metres
async function m3Ground(T, tr) {
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (let i = 0; i < tr.lat.length; i++) { la0 = Math.min(la0, tr.lat[i]); la1 = Math.max(la1, tr.lat[i]); lo0 = Math.min(lo0, tr.lng[i]); lo1 = Math.max(lo1, tr.lng[i]); }
  const padLa = Math.max((la1 - la0) * 0.25, 0.001), padLo = Math.max((lo1 - lo0) * 0.25, 0.001);
  la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  const tx = (lo, z) => ((lo + 180) / 360) * 2 ** z, ty = (la, z) => ((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
  let z = 18;
  while (z > 3 && (Math.floor(tx(lo1, z)) - Math.floor(tx(lo0, z)) + 1) * (Math.floor(ty(la0, z)) - Math.floor(ty(la1, z)) + 1) > 36) z--;
  const x0 = Math.floor(tx(lo0, z)), x1 = Math.floor(tx(lo1, z)), y0 = Math.floor(ty(la1, z)), y1 = Math.floor(ty(la0, z));
  const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256;
  const cx = cv.getContext('2d'); cx.fillStyle = '#2b2b28'; cx.fillRect(0, 0, cv.width, cv.height);
  let ok = 0;
  await Promise.all([]
    .concat(...Array.from({ length: x1 - x0 + 1 }, (_, i) => Array.from({ length: y1 - y0 + 1 }, (_, j) => [x0 + i, y0 + j])))
    .map(([x, y]) => new Promise((res) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { cx.drawImage(im, (x - x0) * 256, (y - y0) * 256); ok++; res(); };
      im.onerror = () => res();
      im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    })));
  // tile edges back to lat/lng, then to the track's local metres
  const lng = (x) => (x / 2 ** z) * 360 - 180, lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
  const kx = Math.cos((tr.lat[0] * Math.PI) / 180) * 111320;
  const E = (lo) => (lo - tr.lng[0]) * kx, N = (la) => (la - tr.lat[0]) * 110540;
  const w0 = E(lng(x0)), w1 = E(lng(x1 + 1)), n0 = N(lat(y1 + 1)), n1 = N(lat(y0));
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new T.Mesh(new T.PlaneGeometry(w1 - w0, n1 - n0), new T.MeshBasicMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set((w0 + w1) / 2, 0, -(n0 + n1) / 2);
  return { mesh, ok, size: Math.max(w1 - w0, n1 - n0) };
}

async function m3Build(host) {
  const T = await loadThree();
  const tr = LV.track;
  const scene = new T.Scene();
  scene.background = new T.Color(m3Css(cssv('--panel-2')));
  scene.add(new T.HemisphereLight(0xffffff, 0x444444, 1.6));
  const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(300, 600, 200); scene.add(sun);
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  host.innerHTML = ''; host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(45, 1, 0.5, 200000);
  // path coloured by flight mode, plus its shadow on the ground
  const n = tr.e.length, step = Math.max(1, Math.floor(n / 6000)), pts = [], shadow = [], cols = [];
  let span = 20;
  for (let i = 0; i < n; i += step) {
    const y = Math.max(0.3, tr.u[i]);
    pts.push(tr.e[i], y, -tr.n[i]); shadow.push(tr.e[i], 0.15, -tr.n[i]);
    const c = new T.Color(m3Css(modeColor(modeAt(tr.t[i]) || 'none'))); cols.push(c.r, c.g, c.b);
    span = Math.max(span, Math.abs(tr.e[i]) * 2, Math.abs(tr.n[i]) * 2, tr.u[i] * 2);
  }
  const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  scene.add(new T.Line(lg, new T.LineBasicMaterial({ vertexColors: true })));
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(shadow, 3));
  scene.add(new T.Line(sg, new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })));
  const kind = m3Kind(), model = m3Model(T, kind), scale = Math.max(2, span / 45);
  model.scale.setScalar(scale); scene.add(model);
  const drop = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: M3_ORANGE, transparent: true, opacity: 0.6 }));
  scene.add(drop);
  m3 = { T, key: `${LOG.name}|${LV.t0}`, renderer, scene, camera, model, drop, kind, span, scale, cam: { yaw: -0.6, pitch: 0.5, dist: span * 0.5 }, follow: true, target: new T.Vector3(), ground: null };
  m3Ground(T, tr).then((gr) => {
    if (!m3 || m3.scene !== scene) return;
    scene.add(gr.mesh); m3.ground = gr;
    const note = $('#lvViewNote'); if (note && lvs.view === 'map3d' && !gr.ok) note.textContent = 'Satellite imagery is blocked here; the path and model still show. The downloaded app file loads it.';
    m3Draw();
  });
}

function m3Draw() {
  const host = $('#lv3dMap');
  if (!host || host.hidden || !LV) return;
  if (!LV.track) { host.innerHTML = '<p class="faint" style="padding:16px">No position data in this log.</p>'; return; }
  if (!m3 || m3.key !== `${LOG.name}|${LV.t0}`) {
    if (m3) { m3.renderer.dispose(); m3 = null; }
    if (host.dataset.loading) return;
    host.dataset.loading = '1';
    host.innerHTML = '<p class="faint" style="padding:16px">Loading 3D view…</p>';
    m3Build(host).then(() => { delete host.dataset.loading; m3Draw(); }).catch(() => { delete host.dataset.loading; host.innerHTML = '<p class="faint" style="padding:16px">The 3D map needs an internet connection the first time (three.js).</p>'; });
    return;
  }
  if (!host.contains(m3.renderer.domElement)) { host.innerHTML = ''; host.appendChild(m3.renderer.domElement); }
  const { T, renderer, camera, model, drop } = m3, tr = LV.track;
  const W = host.clientWidth || 600, H = host.clientHeight || 380;
  renderer.setSize(W, H, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = W / H; camera.updateProjectionMatrix();
  // vehicle at the playback cursor, attitude from ATT (roll right-wing-down, pitch nose-up, yaw clockwise from north)
  const k = Math.max(0, U.idxAt(tr.t, lvs.cursor));
  const pos = new T.Vector3(tr.e[k], Math.max(0.3, tr.u[k]), -tr.n[k]);
  model.position.copy(pos);
  const d2r = Math.PI / 180, roll = valAt('ATT.Roll', lvs.cursor) || 0, pitch = valAt('ATT.Pitch', lvs.cursor) || 0, yaw = valAt('ATT.Yaw', lvs.cursor) || 0;
  model.rotation.set(pitch * d2r, -yaw * d2r, -roll * d2r);
  drop.geometry.setFromPoints([pos, new T.Vector3(pos.x, 0.15, pos.z)]);
  if (m3.follow) m3.target.copy(pos); else if (!m3.targetSet) { m3.target.set(0, 0, 0); m3.targetSet = true; }
  const c = m3.cam;
  camera.position.set(m3.target.x + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), m3.target.y + c.dist * Math.sin(c.pitch), m3.target.z + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw));
  camera.lookAt(m3.target);
  renderer.render(m3.scene, camera);
}

// orbit: drag to rotate, wheel to zoom, double-click toggles follow
let m3Drag = null;
document.addEventListener('pointerdown', (e) => { if (m3 && e.target === m3.renderer.domElement) { m3Drag = [e.clientX, e.clientY]; e.target.setPointerCapture(e.pointerId); } });
document.addEventListener('pointermove', (e) => {
  if (!m3Drag || !m3) return;
  m3.cam.yaw -= (e.clientX - m3Drag[0]) * 0.008; m3.cam.pitch = Math.max(0.08, Math.min(1.5, m3.cam.pitch + (e.clientY - m3Drag[1]) * 0.006));
  m3Drag = [e.clientX, e.clientY]; m3Draw();
});
document.addEventListener('pointerup', () => { m3Drag = null; });
document.addEventListener('wheel', (e) => { if (!m3 || e.target !== m3.renderer.domElement) return; e.preventDefault(); m3.cam.dist = Math.max(m3.scale * 4, Math.min(m3.span * 6, m3.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); m3Draw(); }, { passive: false });
document.addEventListener('dblclick', (e) => { if (!m3 || e.target !== m3.renderer.domElement) return; m3.follow = !m3.follow; if (!m3.follow) m3.target.set(0, 0, 0); toast(m3.follow ? '3D map: following the vehicle' : '3D map: centred on home'); m3Draw(); });
