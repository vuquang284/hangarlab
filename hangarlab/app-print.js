// HangarLab UI: 3D Printing tab and STL preview.
// The app-*.js files share one global scope and load in the order listed in build.js.
'use strict';

// ---------- MATERIALS ----------
function renderMaterials(el) {
  el.innerHTML = `<div class="bench"><aside class="side">${sideTools}
    ${group('Where the part lives', `
      ${num('mat.amb', 'Max ambient', { unit: '°C' })}
      ${sel('mat.printer', 'Your printer', [['open', 'Open frame'], ['enclosed', 'Enclosed'], ['hightemp', 'High-temp (PEI/PEEK)']])}
      ${chk('mat.sun', 'Sits in direct sun (+20 °C)')}${chk('mat.heat', 'Near motor, ESC or battery (+25 °C)')}
      ${chk('mat.uv', 'Long outdoor UV exposure')}${chk('mat.wet', 'Rain, humidity or water landings')}
      ${chk('mat.crash', 'Takes impacts or hard landings')}${chk('mat.fuel', 'Fuel, oil or solvents nearby')}
      ${chk('mat.flex', 'Part must flex (bumpers, mounts, pads)')}`)}
    ${group('Priorities', `
      <label class="f wide"><span>Stiffness</span><input type="range" min="0" max="10" data-k="mat.stiff" value="${P().mat.stiff}"></label>
      <label class="f wide"><span>Low weight</span><input type="range" min="0" max="10" data-k="mat.light" value="${P().mat.light}"></label>
      <label class="f wide"><span>Cost sensitivity</span><input type="range" min="0" max="10" data-k="mat.budget" value="${P().mat.budget}"></label>`)}
    ${group('Part mass estimate', `
      <div class="f wide"><div class="row"><label class="btn sm primary">Load STL<input type="file" id="stl-mat" accept=".stl,.STL" hidden></label>
        <select id="stl-unit" aria-label="STL units" style="width:auto">${['mm', 'cm', 'in'].map((u) => `<option${(P().mat.stlUnit || 'mm') === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
        <span class="hint" style="margin:0">${P().mat.stlName ? `${esc(P().mat.stlName)}` : 'Fills volume and areas from the mesh'}</span></div></div>
      ${stlMesh ? `<div class="stl3d">
        <div class="row stl-tools">
          <div class="seg">${[['iso', 'Iso'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side']].map(([v, l]) => `<button data-stlview="${v}">${l}</button>`).join('')}</div>
          <button class="btn sm" data-stlrot="x" title="Rotate 90° about X">⟳ X</button><button class="btn sm" data-stlrot="y" title="Rotate 90° about Y">⟳ Y</button>
          <label class="f check" style="grid-column:auto;font-size:12px"><input type="checkbox" data-s="settings.overhang" data-rebuild${S.settings.overhang !== false ? ' checked' : ''}> Overhangs</label>
        </div>
        <div id="stlView" class="stl-host"></div>
        <div class="row" style="justify-content:space-between;margin-top:6px"><span class="hint" id="stlInfo" style="margin:0"></span>
          <select data-s="settings.plate" data-rebuild aria-label="Build plate" style="width:auto;font-size:12px">${Object.entries(PLATES).map(([k, v]) => `<option value="${k}"${(S.settings.plate || 'bambu') === k ? ' selected' : ''}>${v[2]}</option>`).join('')}</select></div>
        <p class="hint" style="margin-top:4px">Drag to orbit · right-drag or Shift-drag to pan · scroll to zoom</p>
      </div>` : ''}
      ${num('mat.vol', 'Part volume', { unit: 'cm³' })}${num('mat.area', 'Surface area', { unit: 'cm²' })}
      ${num('mat.walls', 'Walls (perimeters)', { step: 1, min: 0 })}${num('mat.tb', 'Top + bottom layers', { step: 1, min: 0 })}
      ${num('mat.infill', 'Infill', { unit: '%' })}
      ${num('printer.lineW', 'Line width', { unit: 'mm', lib: true, step: 0.01 })}${num('printer.layerH', 'Layer height', { unit: 'mm', lib: true, step: 0.01 })}
      <label class="f"><span>Part name</span><input type="text" id="partName" data-k="mat.partName" value="${esc(P().mat.partName || 'Printed part')}"></label>
      <p class="hint" id="partOut"></p>
      <div class="row" style="grid-column:1/-1"><button class="btn sm" data-act="part-add">Add to BOM</button><button class="btn sm" data-act="part-lib">Save to library</button></div>
      <p class="hint">Walls and skins print solid, the rest at infill. Area 0 = estimate ${tip('Shell = side area × walls × line width + top/bottom area × layers × layer height. Load an STL for measured areas. Line width and layer height apply to every printed part.')}</p>`)}
    </aside>
    <section class="stack"><div class="card"><div class="card-h"><h2>Ranked materials</h2><p id="matTemp"></p></div><div id="matList"></div></div></section></div>`;
  liveMaterials();
}
function liveMaterials() {
  const p = P(), rk = U.rankMaterials(p.mat);
  const top = rk.filter((x) => x.ok);
  const best = top[0] && top[0].score;
  $('#matTemp').textContent = `Part temperature ${rk[0].tEff} °C`;
  $('#matList').innerHTML = rk.map((x, i) => `<div class="mat${x.ok ? '' : ' out'}">
    <div><div class="name">${esc(x.m.name)}${x.ok && i === 0 ? ' <span class="pill good">Pick</span>' : ''}</div><div class="props">${x.m.rho} g/cm³ · ${x.m.ts} MPa · ${x.m.E} GPa · HDT ${x.m.hdt} °C · ~$${x.m.cost}/kg</div></div>
    <div><div class="score"><span style="width:${x.ok ? Math.max(4, (x.score / best) * 100) : 0}%"></span></div><div class="note" style="margin-top:4px">${esc(x.m.note)}</div>
      <div class="chips">${x.why.map((w) => `<span class="chip ok">${esc(w)}</span>`).join('')}${x.fail.map((w) => `<span class="chip no">${esc(w)}</span>`).join('')}</div></div>
    <div class="num muted" style="text-align:right">${fmt(U.partMass(p.mat, x.m.rho, PRN()), 1)} g</div></div>`).join('');
  const m = top[0] ? top[0].m : U.MATERIALS[0];
  const sh = U.partShell(p.mat, PRN());
  const sz = p.mat.stlSize ? ` Part ${p.mat.stlSize.map((v) => fmt(v, 1)).join(' × ')} mm.` : '';
  $('#partOut').innerHTML = `In <b>${esc(m.name)}</b>: <b>${fmt(U.partMass(p.mat, m.rho, PRN()), 1)} g</b>. ${fmt(sh.shell, 1)} of ${fmt(sh.V, 1)} cm³ printed solid${sh.measured ? ` (sides ${fmt(p.mat.areaSide, 1)} cm², top/bottom ${fmt(p.mat.areaTB, 1)} cm² from the STL)` : sh.estArea ? ` (area estimated at ${fmt(sh.A, 0)} cm²)` : ''}.${sz}`;
  drawStl();
}

// ---------- STL (slicer-style preview with three.js, MIT) ----------
let stlMesh = null;
const UNIT_MM = { mm: 1, cm: 10, in: 25.4 };
const PLATES = { bambu: [256, 256, 'Bambu X1 / P1 (256 × 256)'], prusa: [250, 210, 'Prusa MK4 (250 × 210)'], ender: [220, 220, 'Ender 3 (220 × 220)'], voron: [350, 350, 'Voron 350 (350 × 350)'], mini: [180, 180, 'A1 mini / Prusa mini (180 × 180)'] };
async function readStl(file, unit) {
  const tris = U.parseSTL(await file.arrayBuffer());
  return { tris, st: U.stlStats(tris, UNIT_MM[unit] || 1) };
}
const stlFields = (st, name) => ({ vol: +st.vol.toFixed(3), area: +st.area.toFixed(2), areaSide: +st.areaSide.toFixed(2), areaTB: +st.areaTB.toFixed(2), stlName: name, stlSize: st.size.map((v) => +v.toFixed(2)) });
const loadThree = () => (window.__three ? Promise.resolve(window.__three) : import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js').then((m) => (window.__three = m)));

// rotate the mesh 90° about X or Y (changes which faces are walls vs skins, so the mass estimate updates)
function rotateStl(axis) {
  const t = stlMesh;
  for (let i = 0; i < t.length; i += 3) {
    const x = t[i], y = t[i + 1], z = t[i + 2];
    if (axis === 'x') { t[i + 1] = -z; t[i + 2] = y; } else { t[i] = z; t[i + 2] = -x; }
  }
  const m = P().mat;
  Object.assign(m, stlFields(U.stlStats(t, UNIT_MM[m.stlUnit || 'mm']), m.stlName));
  if (sv) sv.rebuild = true;
  save(); render();
}

// viewer state survives re-renders; the WebGL canvas is re-attached to the new host element
let sv = null;
async function drawStl() {
  const host = $('#stlView');
  if (!host || !stlMesh) return;
  host.hidden = false;
  let T;
  try { T = await loadThree(); } catch (e) { host.innerHTML = '<p class="faint" style="padding:12px">3D preview needs an internet connection the first time (three.js). The mass estimate still works.</p>'; return; }
  if (!sv) {
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(devicePixelRatio || 1);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xffffff, 0x444444, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.6, -1, 1.4); scene.add(sun);
    const fill = new T.DirectionalLight(0xffffff, 0.5); fill.position.set(1, 0.8, 0.4); scene.add(fill);
    sv = { T, renderer, scene, camera, rot: { th: -Math.PI / 4 - Math.PI / 2, ph: 0.55, r: 300 }, target: new T.Vector3(), rebuild: true, mesh: null, plate: null };
    const cv = renderer.domElement;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => { sv.drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!sv.drag) return;
      const dx = e.clientX - sv.drag.x, dy = e.clientY - sv.drag.y;
      sv.drag.x = e.clientX; sv.drag.y = e.clientY;
      if (sv.drag.pan) {
        const k = sv.rot.r / 600, th = sv.rot.th;
        sv.target.x += (-Math.sin(th) * dx - Math.cos(th) * Math.sin(sv.rot.ph) * dy) * k * -1;
        sv.target.y += (Math.cos(th) * dx - Math.sin(th) * Math.sin(sv.rot.ph) * dy) * k * -1;
        sv.target.z += Math.cos(sv.rot.ph) * dy * k;
      } else { sv.rot.th -= dx * 0.008; sv.rot.ph = Math.max(-1.45, Math.min(1.5, sv.rot.ph + dy * 0.008)); }
      stlRender();
    });
    cv.addEventListener('pointerup', () => { sv.drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); sv.rot.r = Math.max(5, Math.min(5000, sv.rot.r * (e.deltaY < 0 ? 0.88 : 1.14))); stlRender(); }, { passive: false });
    new ResizeObserver(() => stlRender()).observe(cv);
  }
  if (sv.renderer.domElement.parentElement !== host) { host.innerHTML = ''; host.appendChild(sv.renderer.domElement); }
  if (sv.rebuild || sv.plateKey !== stlPlateKey()) stlBuild();
  stlRender();
}
const stlPlateKey = () => `${S.settings.plate || 'bambu'}|${P().mat.stlUnit || 'mm'}|${S.theme}|${S.settings.overhang !== false}`;

function stlBuild() {
  const { T, scene } = sv;
  for (const o of [sv.mesh, sv.plate, sv.edges]) if (o) { scene.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  const k = UNIT_MM[P().mat.stlUnit || 'mm'], t = stlMesh, n = t.length / 3;
  // place on the plate: centered in X/Y, lowest point at Z = 0
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i++) { const c = i % 3; lo[c] = Math.min(lo[c], t[i]); hi[c] = Math.max(hi[c], t[i]); }
  const off = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
  const pos = new Float32Array(t.length), col = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) pos[i] = (t[i] + off[i % 3]) * k;
  const base = new T.Color(cssv('--accent')), over = new T.Color('#e5484d'), showOver = S.settings.overhang !== false;
  let overN = 0;
  for (let f = 0; f < n; f += 3) {
    const a = f * 3, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], wx = pos[a + 6] - pos[a], wy = pos[a + 7] - pos[a + 1], wz = pos[a + 8] - pos[a + 2];
    const nz = ux * wy - uy * wx, nl = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, nz) || 1;
    const minZ = Math.min(pos[a + 2], pos[a + 5], pos[a + 8]);
    const isOver = showOver && nz / nl < -0.707 && minZ > 0.3; // faces steeper than 45° below horizontal, not on the plate
    if (isOver) overN++;
    const c = isOver ? over : base;
    for (let v = 0; v < 3; v++) { col[a + v * 3] = c.r; col[a + v * 3 + 1] = c.g; col[a + v * 3 + 2] = c.b; }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  sv.mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, flatShading: true }));
  scene.add(sv.mesh);
  sv.edges = new T.LineSegments(new T.EdgesGeometry(geo, 35), new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  scene.add(sv.edges);
  // build plate with a 10 mm grid and 50 mm major lines
  const [pw, pd] = PLATES[S.settings.plate || 'bambu'] || PLATES.bambu, dark = S.theme === 'dark';
  const plate = new T.Group();
  const bed = new T.Mesh(new T.PlaneGeometry(pw, pd), new T.MeshStandardMaterial({ color: dark ? 0x2b2b28 : 0xd9d7cf, roughness: 0.9 }));
  bed.position.z = -0.05; plate.add(bed);
  const lines = [], majors = [];
  for (let x = -pw / 2; x <= pw / 2 + 1e-6; x += 10) (Math.round(x + pw / 2) % 50 === 0 ? majors : lines).push(x, -pd / 2, 0, x, pd / 2, 0);
  for (let y = -pd / 2; y <= pd / 2 + 1e-6; y += 10) (Math.round(y + pd / 2) % 50 === 0 ? majors : lines).push(-pw / 2, y, 0, pw / 2, y, 0);
  const seg = (arr, color, op) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: op })); };
  plate.add(seg(lines, dark ? 0xffffff : 0x000000, 0.07), seg(majors, dark ? 0xffffff : 0x000000, 0.18));
  const ax = (x2, y2, color) => seg([-pw / 2 + 1, -pd / 2 + 1, 0.1, -pw / 2 + 1 + x2, -pd / 2 + 1 + y2, 0.1], color, 1);
  plate.add(ax(30, 0, 0xe5484d), ax(0, 30, 0x57b36a));
  sv.plate = plate; scene.add(plate);
  scene.background = new T.Color(cssv('--panel-2'));
  const size = [(hi[0] - lo[0]) * k, (hi[1] - lo[1]) * k, (hi[2] - lo[2]) * k];
  sv.size = size; sv.fits = size[0] <= pw && size[1] <= pd;
  sv.overhangs = overN;
  sv.tris = n / 3;
  sv.target.set(0, 0, size[2] / 2);
  sv.rot.r = Math.max(60, Math.hypot(...size) * 2.2);
  sv.rebuild = false; sv.plateKey = stlPlateKey();
  const info = $('#stlInfo');
  if (info) info.innerHTML = `${fmt(sv.tris, 0)} triangles · ${uText(`${fmt(size[0], 1)} × ${fmt(size[1], 1)} × ${fmt(size[2], 1)} mm`)} ${sv.fits ? '' : '<span class="pill crit">larger than the plate</span>'}${showOver && sv.overhangs ? ` · <span style="color:#e5484d">${fmt(sv.overhangs, 0)} overhang faces need support</span>` : ''}`;
}

function stlRender() {
  if (!sv || !sv.mesh) return;
  const cv = sv.renderer.domElement, host = cv.parentElement;
  if (!host) return;
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * (devicePixelRatio || 1)) || cv.height !== Math.round(h * (devicePixelRatio || 1))) { sv.renderer.setSize(w, h, false); cv.style.width = '100%'; cv.style.height = '100%'; }
  const { th, ph, r } = sv.rot, c = sv.camera;
  c.aspect = w / h; c.updateProjectionMatrix();
  c.position.set(sv.target.x + r * Math.cos(ph) * Math.cos(th), sv.target.y + r * Math.cos(ph) * Math.sin(th), sv.target.z + r * Math.sin(ph));
  c.lookAt(sv.target);
  sv.renderer.render(sv.scene, c);
}
function stlView(v) {
  if (!sv) return;
  const s = sv.size || [50, 50, 50];
  sv.target.set(0, 0, s[2] / 2);
  if (v === 'fit' || v === 'iso') { sv.rot.th = -Math.PI * 0.75; sv.rot.ph = 0.55; }
  if (v === 'top') { sv.rot.ph = 1.5; sv.rot.th = -Math.PI / 2; }
  if (v === 'front') { sv.rot.ph = 0.02; sv.rot.th = -Math.PI / 2; }
  if (v === 'side') { sv.rot.ph = 0.02; sv.rot.th = 0; }
  sv.rot.r = Math.max(60, Math.hypot(...s) * 2.2);
  stlRender();
}
