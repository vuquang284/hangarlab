// HangarLab engine: physics, power, RF, materials, and log parsing.
// Pure functions only (no DOM) so it can be tested in Node: `node test.js`.
(function (G) {
  'use strict';

  const g0 = 9.80665;
  const RHO0 = 1.225;

  // ---------- constants ----------
  const CELL = {
    lipo: { label: 'LiPo', nom: 3.7, max: 4.2, min: 3.5, whkg: 150 },
    lihv: { label: 'LiHV', nom: 3.8, max: 4.35, min: 3.5, whkg: 160 },
    liion: { label: 'Li-ion', nom: 3.6, max: 4.2, min: 3.0, whkg: 230 },
    life: { label: 'LiFePO4', nom: 3.2, max: 3.65, min: 2.8, whkg: 110 },
  };

  const LAYOUTS = {
    tri: { label: 'Tri (Y3)', n: 3, coax: false },
    quadx: { label: 'Quad X', n: 4, coax: false },
    hexa: { label: 'Hexa', n: 6, coax: false },
    octo: { label: 'Octo', n: 8, coax: false },
    y6: { label: 'Y6 (coaxial)', n: 6, coax: true },
    x8: { label: 'X8 (coaxial)', n: 8, coax: true },
  };

  // ponytail: fixed coaxial factors (lower rotor in upper wash). Replace with per-pair test data if you have it.
  const COAX_THRUST = 0.85;
  const COAX_POWER = 1.22;

  const RAIL_V = { '3.3V': 3.3, '5V': 5, '9V': 9, '12V': 12, '24V': 24 };

  // ---------- helpers ----------
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function interp(xs, ys, x) {
    const n = xs.length;
    if (!n) return NaN;
    if (n === 1) return ys[0];
    let i = 1;
    while (i < n - 1 && xs[i] < x) i++;
    const x0 = xs[i - 1], x1 = xs[i];
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    return ys[i - 1] + t * (ys[i] - ys[i - 1]);
  }

  function rhoAt(altM, tempC) {
    const p = 101325 * Math.pow(1 - 2.25577e-5 * altM, 5.25588);
    return p / (287.05 * (tempC + 273.15));
  }

  // b: one pack (s cells in series × p in parallel, cellMah each, g per pack) times `packs`, wired in series or parallel
  function packOf(b) {
    const n = Math.max(1, Math.round(+b.packs || 1)), ser = b.conn === 'series', p = Math.max(1, +b.p || 1);
    const cell = +b.cellMah || +b.mah || 0;
    return { n, ser, S: (+b.s || 1) * (ser ? n : 1), P: p * (ser ? 1 : n), mah: cell * p * (ser ? 1 : n), packMah: cell * p, g: (+b.g || 0) * n };
  }
  function battery(b) {
    const c = CELL[b.chem] || CELL.lipo;
    const pk = packOf(b);
    const V = pk.S * c.nom;
    const Ah = pk.mah / 1000;
    return {
      V, Ah, chem: c, S: pk.S, P: pk.P, mah: pk.mah, g: pk.g, packs: pk.n, packMah: pk.packMah,
      Wh: V * Ah,
      usableWh: V * Ah * (b.usable / 100),
      vMin: pk.S * c.min, vMax: pk.S * c.max,
      iMaxCont: b.c * Ah,
      iMaxPeak: Math.max(+b.c || 0, +b.cPeak || 0) * Ah, // burst rating (seconds); blank peak C = continuous
      peakSet: +b.cPeak > 0,
      estG: (V * Ah) / c.whkg * 1000 / pk.n, // per pack
    };
  }

  // ---------- propulsion curve from bench test table ----------
  // set.rows: [throttle% | null, thrust_g, current_A]; set.v: test voltage.
  function curve(set, vBatt) {
    if (!set) return null;
    let rows = (set.rows || [])
      .filter((r) => r && r[1] > 0 && r[2] >= 0)
      .map((r) => ({ thr: r[0] == null || r[0] === '' ? null : +r[0], g: +r[1], a: +r[2] }))
      .sort((a, b) => a.g - b.g);
    const estimated = rows.length < 2;
    if (estimated) {
      // ponytail: single data point -> thrust ∝ throttle², current ∝ throttle³. Add real bench rows to replace.
      const top = rows[0] || { thr: 100, g: 0, a: 0 };
      rows = [];
      for (let t = 10; t <= 100; t += 10) {
        const x = t / 100;
        rows.push({ thr: t, g: top.g * x * x, a: top.a * x * x * x });
      }
    }
    const vt = set.v || vBatt;
    const vs = vBatt / vt;
    const ks = vs * vs; // static thrust ∝ rpm² ∝ V²
    const top = rows[rows.length - 1];
    const gs = rows.map((r) => r.g);
    const ps = rows.map((r) => r.a * vt);
    const hasThr = rows.every((r) => r.thr != null);
    const thrs = rows.map((r) => r.thr);
    const tmax = top.g * ks;
    return {
      estimated, rows, vt, hasThr,
      tmax, // g at 100% at battery voltage, sea level
      imax: top.a * ks, // A at 100% (P ∝ V³ so I ∝ V²)
      pmax: top.a * vt * ks * vs,
      // electrical W to make thrust g at sea level
      powerAt(g) {
        if (g <= 0) return 0;
        const g0r = gs[0];
        if (g < g0r) return ps[0] * Math.pow(g / g0r, 1.5);
        if (g > gs[gs.length - 1]) {
          const n = gs.length;
          const slope = (ps[n - 1] - ps[n - 2]) / (gs[n - 1] - gs[n - 2] || 1);
          return ps[n - 1] + slope * (g - gs[n - 1]);
        }
        return interp(gs, ps, g);
      },
      throttleAt(g) {
        const gt = g / ks; // thrust needed at the test voltage
        if (!hasThr) return 100 * Math.sqrt(clamp(g / tmax, 0, 4));
        if (gt < gs[0]) return thrs[0] * Math.sqrt(gt / gs[0]);
        if (gt > gs[gs.length - 1]) return 100 * Math.sqrt(g / tmax);
        return interp(gs, thrs, gt);
      },
      thrustAtThrottle(t) {
        if (!hasThr) return tmax * (t / 100) * (t / 100);
        const order = rows.map((r, i) => i).sort((a, b) => thrs[a] - thrs[b]);
        const xs = order.map((i) => thrs[i]), ys = order.map((i) => gs[i]);
        if (t < xs[0]) return ys[0] * Math.pow(t / xs[0], 2) * ks;
        return interp(xs, ys, t) * ks;
      },
    };
  }

  // ---------- aerodynamics ----------
  // cd0 may be a number or a function of airspeed (drag build-up: skin friction depends on Reynolds number)
  function fwDrag(V, W, rho, S, AR, cd0, e) {
    const q = 0.5 * rho * V * V;
    const CL = W / (q * S);
    const CD = (typeof cd0 === 'function' ? cd0(V, W) : cd0) + (CL * CL) / (Math.PI * e * AR);
    return { D: q * S * CD, CL, CD, P: q * S * CD * V };
  }

  // ---------- parasite drag build-up (Raymer, fully turbulent flat-plate friction: conservative for small UAS) ----------
  // dr: { fusL, fusD, tailPct, tc, booms: {n, L, d}, extras: [{name, cda cm²}], misc % }
  const cfTurb = (Re) => 0.455 / Math.pow(Math.log10(Math.max(Re, 1e4)), 2.58);
  const muAir = (tempC) => { const T = tempC + 273.15; return (1.458e-6 * T ** 1.5) / (T + 110.4); };
  function bodyDrag(L, d, Vnu) {
    if (!(L > 0 && d > 0)) return 0;
    const FR = L / d;
    const swet = Math.PI * d * L * Math.pow(Math.max(0.05, 1 - 2 / FR), 2 / 3) * (1 + 1 / (FR * FR));
    return cfTurb(Vnu * L) * (1 + 60 / FR ** 3 + FR / 400) * swet; // m² of drag area
  }
  // skin-friction multiplier by construction. Foam (1.25, with misc 20 % and 80 % motor efficiency) reproduces the
  // AtomRC Dolphin Pro reference (5.25 A @ 22 m/s, 1.4 kg, 6S) uncalibrated; the others are scaled from it.
  const FINISH = { composite: { label: 'Molded composite (glass/carbon)', k: 1.0 }, builtup: { label: 'Built-up, film covered', k: 1.1 }, printed: { label: '3D printed (LW-PLA, PETG)', k: 1.15 }, foam: { label: 'EPO / EPP foam', k: 1.25 } };
  // motor can diameter (mm) from a size code like 2216 (22 mm stator → ~28 mm can), else from weight
  function motorCanMm(m) {
    const mm = String((m && m.name) || '').match(/(?:^|\D)(\d{2})(\d{2})(?:\D|$)/);
    if (mm && +mm[1] >= 10) return +mm[1] + 6;
    return m && m.g ? 7 * Math.cbrt(m.g) : 0;
  }
  // ctx: { pods: {n, d, L} (m), wash: {n, D (prop m), Tper (N), mount: 'wing'|'nose'|'pusher'} }
  function dragBuildup(f, dr, V, rho, tempC, rotors, ctx) {
    const S = f.area, b = f.span, c = S / b, Vnu = (rho * V) / muAir(tempC);
    const rough = (FINISH[dr.finish] || FINISH.foam).k;
    const ffWing = (tc) => 1 + (0.6 / 0.3) * tc + 100 * tc ** 4;
    const tc = +dr.tc || 0.12;
    const parts = [];
    parts.push({ name: 'Wing', cda: rough * cfTurb(Vnu * c) * ffWing(tc) * 2.05 * S });
    const St = (S * (+dr.tailPct || 0)) / 100;
    if (St) parts.push({ name: 'Tail', cda: rough * cfTurb(Vnu * 0.7 * c) * ffWing(0.09) * 2.05 * St });
    if (dr.fusL > 0) parts.push({ name: 'Fuselage', cda: rough * bodyDrag(+dr.fusL, +dr.fusD, Vnu) * 1.1 }); // 1.1: wing–body interference
    const bo = dr.booms || {};
    if (bo.n > 0) parts.push({ name: `Booms ×${bo.n}`, cda: rough * bo.n * bodyDrag(+bo.L, +bo.d, Vnu) * 1.1 });
    if (rotors && rotors.n) {
      const D = rotors.diamIn * 0.0254;
      // ponytail: stopped 2-blade prop aligned with flow + motor bell ≈ 0.02·D² + 10 cm² each
      parts.push({ name: `Stopped lift rotors ×${rotors.n}`, cda: rotors.n * (0.02 * D * D + 0.001) });
    }
    const pods = ctx && ctx.pods;
    let podCda = 0;
    if (pods && pods.n > 0 && pods.d > 0) {
      // streamlined pod friction + a little bluff-body drag from the exposed motor bell and mount
      podCda = pods.n * (rough * bodyDrag(+pods.L, +pods.d, Vnu) * 1.1 + 0.15 * (Math.PI * pods.d * pods.d) / 4);
      parts.push({ name: `Motor pods ×${pods.n}`, cda: podCda });
    }
    const w = ctx && ctx.wash;
    if (w && w.Tper > 0 && w.D > 0 && w.mount !== 'pusher') {
      // momentum theory: air behind a tractor prop moves faster, so surfaces in the slipstream see more friction
      const A = (Math.PI * w.D * w.D) / 4, Vs = Math.sqrt(V * V + (2 * w.Tper) / (rho * A)), Vw = V + 0.75 * (Vs - V), fac = (Vw / V) ** 2 - 1;
      const fus = parts.find((x) => x.name === 'Fuselage');
      const inWash = w.mount === 'wing' ? w.n * rough * cfTurb(Vnu * c) * ffWing(tc) * 2.05 * Math.min(w.D, b / w.n) * c + podCda : 0.5 * (fus ? fus.cda : 0);
      if (fac > 0 && inWash > 0) parts.push({ name: 'Prop wash (faster air behind props)', cda: fac * inWash });
    }
    for (const x of dr.extras || []) if (+x.cda > 0) parts.push({ name: x.name || 'Add-on', cda: (+x.cda * (+x.qty || 1)) / 1e4 });
    const sum = parts.reduce((a, p) => a + p.cda, 0);
    const misc = (sum * (+dr.misc || 0)) / 100;
    if (misc) parts.push({ name: `Misc (gaps, screws, leaks) ${dr.misc}%`, cda: misc });
    const f0 = sum + misc;
    return { cd0: f0 / S, f: f0, parts, chord: c, Re: Vnu * c };
  }
  // Obert-type estimate with a 5 % fuselage/untapered-wing penalty: ~0.82 at AR 5, ~0.77 at AR 8.5
  const CONSERVATIVE = 1.2;
  // drag build-up methods typically underpredict real small aircraft by 10–30 %; middle of that until you calibrate
  const DEFAULT_K = 1.25;
  const oswald = (AR) => clamp(0.95 / (1.05 + 0.007 * Math.PI * AR), 0.6, 0.88);

  // ponytail: momentum theory + fixed profile/tip-speed assumptions; calibrate with a flight log for accuracy.
  const MR_KAPPA = 1.15, MR_PROFILE_FRAC = 0.35, MR_TIP_SPEED = 120;
  // speed stops at the first of: 85 % thrust, the lean-angle limit (ArduPilot ANGLE_MAX), or 85 % of full-throttle motor power.
  // out.limit names which one; 'cap' means the sweep ran out at MR_V_CAP, so the real top speed is higher.
  const MR_V_CAP = 80;
  function mrForward(W, rho, Adisk, cda, pHoverMotors, tmaxN, leanDeg, pMaxMotors) {
    const vh = Math.sqrt(W / (2 * rho * Adisk));
    const pInd0 = MR_KAPPA * W * vh;
    const pPro = MR_PROFILE_FRAC * pInd0;
    const lean = ((leanDeg || 30) * Math.PI) / 180;
    const out = [];
    out.limit = 'cap';
    for (let V = 0; V <= MR_V_CAP; V += 0.5) {
      const D = 0.5 * rho * V * V * cda;
      const T = Math.hypot(W, D);
      if (T > 0.85 * tmaxN) { out.limit = 'thrust'; break; }
      const a = Math.atan2(D, W);
      if (a > lean) { out.limit = 'lean'; break; }
      let vi = vh;
      for (let k = 0; k < 80; k++) {
        const vn = T / (2 * rho * Adisk * Math.hypot(V * Math.cos(a), V * Math.sin(a) + vi));
        vi = 0.5 * vi + 0.5 * vn;
      }
      const pa = MR_KAPPA * T * vi + D * V + pPro * (1 + 3 * Math.pow(V / MR_TIP_SPEED, 2));
      const P = pHoverMotors * (pa / (pInd0 + pPro));
      if (pMaxMotors && P > 0.85 * pMaxMotors) { out.limit = 'power'; break; }
      out.push({ V, P, tilt: (a * 180) / Math.PI, T });
    }
    return out;
  }

  // ---------- motors, props, bench tests ----------
  // lib.motors {id,name,kv,g,maxA,link}, lib.props {id,name,diam,pitch,g,link}, lib.tests {id,motor,prop,v,rows}
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const findTest = (lib, mId, pId) => (lib.tests || []).find((t) => t.motor === mId && t.prop === pId && (t.rows || []).length) || null;

  // ---------- prop performance data ----------
  // pr.data = { src, rpm: [..], tab: [[[J, Ct, Cp], ...] per rpm] }
  const sizeOf = (s) => {
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/);
    if (!m) return {};
    // APC file names drop the decimal point: 105x45 = 10.5x4.5
    const fix = (v, other) => (v.length >= 3 && !v.includes('.') && +v > 30 ? +v / 10 : v.length === 2 && +v > 30 && +other < 30 ? +v / 10 : +v);
    return { diam: fix(m[1], m[2]), pitch: fix(m[2], m[1]) };
  };

  // APC PER3_*.dat: blocks "PROP RPM = n" followed by rows V J Pe Ct Cp ...
  function parseAPC(text, fileName) {
    const lines = text.split(/\r?\n/);
    const title = ((lines.find((l) => l.trim()) || '').trim().split(/\s{2,}/)[0] || fileName || 'Prop').replace(/\.dat$/i, '');
    const rpm = [], tab = [];
    let cur = null;
    for (const line of lines) {
      const m = line.match(/PROP RPM\s*=\s*([\d.]+)/i);
      if (m) { cur = []; rpm.push(+m[1]); tab.push(cur); continue; }
      if (!cur) continue;
      const n = line.trim().split(/\s+/).map(Number);
      if (n.length >= 5 && n.slice(0, 5).every(isFinite) && n[3] > 0 && n[4] > 0) cur.push([+n[1].toFixed(4), +n[3].toFixed(4), +n[4].toFixed(4)]);
    }
    const keep = rpm.map((r, i) => [r, tab[i]]).filter(([, t]) => t.length >= 2);
    if (!keep.length) return null;
    const sz = sizeOf(title);
    return { name: 'APC ' + title, diam: sz.diam || 0, pitch: sz.pitch || 0, data: { src: 'APC', rpm: keep.map((x) => x[0]), tab: keep.map((x) => x[1]) } };
  }

  // generic pasted table: columns J, Ct, Cp (+ optional RPM), or static RPM, thrust, power (needs diameter)
  function parsePropTable(text, diamIn) {
    if (/PROP RPM\s*=/i.test(text)) return (parseAPC(text) || {}).data || null;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let hdr = null, start = 0;
    for (let i = 0; i < Math.min(lines.length, 6); i++) if (/[a-z]/i.test(lines[i])) { hdr = lines[i].toLowerCase().split(/[\t,;]+|\s{2,}/).map((s) => s.trim()); start = i + 1; }
    const rows = lines.slice(start).map((l) => l.split(/[\t,;\s]+/).map(Number)).filter((r) => r.length >= 3 && r.every(isFinite));
    if (!rows.length) return null;
    const col = (rx) => (hdr ? hdr.findIndex((h) => rx.test(h)) : -1);
    let iJ = col(/^j\b|adv/), iCt = col(/^ct|thrust coef/), iCp = col(/^cp|power coef/), iR = col(/rpm/);
    if (iJ >= 0 && iCt >= 0 && iCp >= 0) {
      const by = new Map();
      for (const r of rows) { const k = iR >= 0 ? r[iR] : 0; if (!by.has(k)) by.set(k, []); if (r[iCt] > 0 && r[iCp] > 0) by.get(k).push([r[iJ], r[iCt], r[iCp]]); }
      const ks = [...by.keys()].sort((a, b) => a - b);
      return { src: 'Pasted J/Ct/Cp', rpm: ks, tab: ks.map((k) => by.get(k).sort((a, b) => a[0] - b[0])) };
    }
    // static: RPM, thrust, power; units from header (g/kg/N/lbf, W/hp)
    iR = iR >= 0 ? iR : 0;
    const iT = col(/thrust/) >= 0 ? col(/thrust/) : 1, iP = col(/power|watt|pwr/) >= 0 ? col(/power|watt|pwr/) : 2;
    const th = hdr ? hdr[iT] || '' : '', ph = hdr ? hdr[iP] || '' : '';
    const tN = /lbf|lb/.test(th) ? 4.44822 : /kg/.test(th) ? g0 : /\(n\)|newton|\bn\b/.test(th) ? 1 : g0 / 1000;
    const pW = /hp/.test(ph) ? 745.7 : 1;
    const D = (diamIn || 0) * 0.0254;
    if (!D) return null;
    const pts = rows.filter((r) => r[iR] > 0 && r[iT] > 0).map((r) => { const n = r[iR] / 60; return [r[iR], [[0, (r[iT] * tN) / (RHO0 * n * n * D ** 4), (r[iP] * pW) / (RHO0 * n ** 3 * D ** 5)]]]; });
    pts.sort((a, b) => a[0] - b[0]);
    return pts.length ? { src: 'Pasted static', rpm: pts.map((x) => x[0]), tab: pts.map((x) => x[1]) } : null;
  }

  function propCoef(d, J, rpm) {
    const at = (rows) => {
      if (rows.length === 1 || J <= rows[0][0]) return [rows[0][1], rows[0][2]];
      const last = rows[rows.length - 1];
      if (J >= last[0]) return [Math.max(0, last[1] * (1 - (J - last[0]) * 4)), last[2]];
      return [interp(rows.map((r) => r[0]), rows.map((r) => r[1]), J), interp(rows.map((r) => r[0]), rows.map((r) => r[2]), J)];
    };
    const rs = d.rpm;
    if (rs.length === 1 || rpm <= rs[0]) return at(d.tab[0]);
    if (rpm >= rs[rs.length - 1]) return at(d.tab[rs.length - 1]);
    let i = 1;
    while (rs[i] < rpm) i++;
    const f = (rpm - rs[i - 1]) / (rs[i] - rs[i - 1]), a = at(d.tab[i - 1]), b = at(d.tab[i]);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
  }

  function propModel(pr) {
    const D = (pr.diam || 0) * 0.0254;
    if (pr.data && pr.data.tab && pr.data.tab.length) return { D, data: true, coef: (J, rpm) => propCoef(pr.data, J, rpm) };
    // ponytail: P/D-based coefficients with parabolic falloff to zero thrust at J ≈ 1.1·P/D. Import APC data to replace.
    const pd = pr.pitch / (pr.diam || 1), Ct0 = 0.07 + 0.08 * pd, Cp0 = 0.02 + 0.06 * pd, Jz = 1.1 * pd + 0.05;
    return { D, data: false, coef: (J) => { const x = clamp(J / Jz, 0, 1); return [Ct0 * (1 - x * x), Cp0 * (1 - 0.6 * x * x)]; } };
  }

  // motor + prop operating point. With Rm the motor equations set rpm; without it rpm = 0.82·kV·V.
  function drive(m, pr, Vb) {
    const pm = propModel(pr);
    if (!m.kv || !pm.D) return null;
    const KvR = (m.kv * 2 * Math.PI) / 60, kt = 1 / KvR, Rm = +m.rm > 0 ? +m.rm : null, I0 = +m.i0 || 0, D = pm.D;
    const ESC = 0.97;
    function solve(t, V, rho = RHO0) {
      const Vm = Vb * clamp(t, 0, 1);
      const coefAt = (w) => { const n = w / (2 * Math.PI); return pm.coef(n > 0 ? V / (n * D) : 0, n * 60); };
      let w;
      if (Rm) {
        let lo = 0, hi = Vm * KvR;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2, n = mid / (2 * Math.PI);
          const Qm = kt * ((Vm - mid / KvR) / Rm - I0);
          const Qp = (Math.max(0, coefAt(mid)[1]) * rho * n * n * D ** 5) / (2 * Math.PI);
          if (Qm > Qp) lo = mid; else hi = mid;
        }
        w = (lo + hi) / 2;
      } else w = 0.82 * Vm * KvR; // no Rm: assume ~18 % slip
      const n = w / (2 * Math.PI), [Ct, Cp] = coefAt(w);
      const T = Ct * rho * n * n * D ** 4, Ps = Math.max(0, Cp) * rho * n ** 3 * D ** 5;
      const Pel = (Rm ? Vm * Math.max(0, (Vm - w / KvR) / Rm) : Ps / 0.8) / ESC; // no Rm: 80 % motor efficiency
      return { T, Ps, Pel, I: Pel / Vb, rpm: n * 60, etaP: T > 0 && Ps > 0 ? (T * V) / Ps : 0, etaM: Pel > 0 ? Ps / Pel : 0 };
    }
    return { solve, propData: pm.data, motorModel: !!Rm };
  }

  // one motor+prop pair as a "set" that curve() understands
  function combo(lib, mId, pId, V) {
    const m = (lib.motors || []).find((x) => x.id === mId), pr = (lib.props || []).find((x) => x.id === pId);
    if (!m || !pr) return null;
    const t = findTest(lib, mId, pId);
    const d = drive(m, pr, V);
    const base = { id: `${mId}|${pId}`, name: `${m.name} · ${pr.name}`, motor: m.name, prop: pr.name, kv: m.kv, motorG: +m.g || 0, propG: +pr.g || 0, diam: pr.diam, pitch: pr.pitch, maxA: m.maxA, mLink: m.link, pLink: pr.link, drive: d };
    if (t) return Object.assign(base, { v: t.v, rows: t.rows, test: t, source: 'Bench data' });
    const source = !d ? 'Missing kV or prop size' : d.motorModel && d.propData ? 'Motor model + prop data' : d.propData ? 'kV estimate + prop data' : d.motorModel ? 'Motor model + estimated prop' : 'kV-only estimate';
    if (!d) return Object.assign(base, { v: V, rows: [], physics: true, source });
    const rows = [];
    for (let k = 10; k <= 100; k += 10) { const s = d.solve(k / 100, 0); rows.push([k, (s.T / g0) * 1000, s.I]); }
    return Object.assign(base, { v: V, rows, physics: true, source });
  }

  // electrical W for n motors to make thrust TN at airspeed V (null if out of reach)
  function drivePower(d, n, V, TN, rho) {
    const per = TN / n;
    if (d.solve(1, V, rho).T < per) return null;
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (d.solve(mid, V, rho).T < per) lo = mid; else hi = mid; }
    const s = d.solve(hi, V, rho);
    return { P: n * s.Pel, thr: hi * 100, etaP: s.etaP, etaM: s.etaM, rpm: s.rpm };
  }

  // old "sets" (motor+prop+rows in one) -> separate motors, props, tests
  function splitSets(sets) {
    const motors = [], props = [], tests = [], map = {};
    for (const s of sets || []) {
      let m = motors.find((x) => x.name === s.motor);
      if (!m) motors.push((m = { id: 'm-' + slug(s.motor), name: s.motor, kv: s.kv || 0, g: s.motorG || 0, maxA: 0, link: s.mLink || '' }));
      let pr = props.find((x) => x.name === s.prop);
      if (!pr) props.push((pr = { id: 'pr-' + slug(s.prop), name: s.prop, diam: s.diam || 0, pitch: s.pitch || 0, g: s.propG || 0, link: '' }));
      if (!pr.g && s.propG) pr.g = s.propG;
      if (s.rows && s.rows.length && !s.placeholder && !/placeholder/i.test(s.note || '') && !/placeholder/i.test(s.name || '')) {
        tests.push({ id: 't-' + slug(s.id), motor: m.id, prop: pr.id, v: s.v, rows: s.rows, note: s.note || '' });
        m.maxA = Math.max(m.maxA, ...s.rows.map((r) => +r[2] || 0));
      }
      map[s.id] = [m.id, pr.id];
    }
    return { motors, props, tests, map };
  }

  // ---------- mass ----------
  function propulsion(p, lib, V) {
    const out = [];
    const add = (mId, pId, n, tag) => { const c = combo(lib, mId, pId, V); if (c && n) out.push({ c, n, tag, mId, pId }); };
    if (p.type !== 'fixedwing') add(p.mr.motor, p.mr.prop, p.mr.n, 'lift');
    if (p.type === 'fixedwing' || (p.type === 'vtol' && p.vtol.kind === 'quadplane')) add(p.fw.motor, p.fw.prop, p.fw.n, 'cruise');
    return out;
  }

  function escOf(lib, o) {
    const e = o && o.esc && (lib.escs || []).find((x) => x.id === o.esc);
    if (e) return { name: e.name, use: e.use || '', a: +e.a || 0, burst: +e.burst || 0, sMin: +e.sMin || 0, sMax: +e.sMax || 0, g: +e.g || 0, lib: e };
    return o && (+o.escA > 0 || +o.escS > 0) ? { name: 'ESC', a: +o.escA || 0, burst: 0, sMin: 0, sMax: +o.escS || 0 } : null;
  }
  // full-throttle current and power of one motor against its ESC and its own ratings; problems also go to R.overload
  function driveChk(chk, R, bat, lib, o, motorId, iMax, label, lift) {
    const e = escOf(lib, o), m = (lib.motors || []).find((x) => x.id === motorId), L = label ? `${label} motor` : 'Motor', ov = (R.overload = R.overload || []);
    if (!isFinite(iMax) || iMax <= 0) return;
    if (e && lift && e.use === 'plane') chk('warn', `${e.name} is a plane ESC driving ${label ? 'lift ' : ''}motors. Multirotor ESCs respond faster to the flight controller, which hover stability needs.`);
    if (e && !lift && e.use === 'mr') chk('info', `${e.name} is a multirotor ESC on the ${label ? 'cruise ' : ''}motor. It works; check that braking is off so the prop can windmill.`);
    if (e && e.a) {
      if (iMax > (e.burst || e.a)) { chk('crit', `${L} full-throttle current ${iMax.toFixed(1)} A exceeds the ESC's ${e.burst ? 'burst' : 'continuous'} rating ${(e.burst || e.a).toFixed(0)} A (${e.name}).`); ov.push(`over ${label ? label.toLowerCase() + ' ' : ''}ESC`); }
      else if (iMax > e.a) chk('warn', `${L} full-throttle current ${iMax.toFixed(1)} A is above the ESC's continuous ${e.a.toFixed(0)} A but within its ${e.burst.toFixed(0)} A burst: fine for short bursts, not sustained full throttle.`);
      else if (iMax > 0.85 * e.a) chk('warn', `${L} full-throttle current ${iMax.toFixed(1)} A is within 15 % of the ESC's ${e.a.toFixed(0)} A rating.`);
    }
    if (e && e.sMax && bat.S > e.sMax) { chk('crit', `The ${bat.S}S pack is above the ${label ? label.toLowerCase() + ' ' : ''}ESC's ${e.sMax}S limit (${e.name}): it will be damaged.`); ov.push('ESC voltage'); }
    else if (e && e.sMin && bat.S < e.sMin) chk('warn', `The ${bat.S}S pack is below the ${label ? label.toLowerCase() + ' ' : ''}ESC's ${e.sMin}S minimum (${e.name}).`);
    if (m && +m.maxA > 0 && iMax > +m.maxA * 1.05) {
      const bad = iMax > +m.maxA * 1.2;
      chk(bad ? 'crit' : 'warn', `${L} draws ${iMax.toFixed(1)} A at full throttle, above its ${(+m.maxA).toFixed(0)} A rating (${m.name}). Use a smaller prop, a lower-kV motor or fewer cells.`);
      if (bad) ov.push('over motor rating');
    }
    if (m && +m.maxW > 0 && iMax * bat.V > +m.maxW * 1.05) {
      const bad = iMax * bat.V > +m.maxW * 1.2;
      chk(bad ? 'crit' : 'warn', `${L} takes ${(iMax * bat.V).toFixed(0)} W at full throttle, above its ${(+m.maxW).toFixed(0)} W rating (${m.name}).`);
      if (bad && !ov.includes('over motor rating')) ov.push('over motor rating');
    }
  }

  function autoRows(p, lib) {
    const bat = battery(p.batt), V = bat.V;
    const rows = [];
    const find = (k, id) => (lib[k] || []).find((x) => x.id === id) || {};
    for (const { c, n, tag, mId, pId } of propulsion(p, lib, V)) {
      const M = find('motors', mId), Pr = find('props', pId);
      rows.push({ name: `${c.motor} (${tag})`, sub: 'Propulsion', qty: n, g: c.motorG, link: c.mLink || '', buy: M.buy || '', cost: +M.cost || 0, auto: 'motor', key: 'motor-' + tag });
      rows.push({ name: `${c.prop} prop (${tag})`, sub: 'Propulsion', qty: n, g: c.propG, link: c.pLink || '', buy: Pr.buy || '', cost: +Pr.cost || 0, auto: 'prop', key: 'prop-' + tag });
      const es = escOf(lib, tag === 'lift' ? p.mr : p.fw);
      if (es && es.lib) rows.push({ name: `${es.name} (${tag})`, sub: 'Propulsion', qty: n, g: es.g, link: es.lib.link || '', buy: es.lib.buy || '', cost: +es.lib.cost || 0, auto: 'esc', key: 'esc-' + tag });
    }
    rows.push({ name: p.batt.name || 'Flight battery', sub: 'Power', qty: bat.packs, g: +p.batt.g || 0, link: p.batt.link || '', buy: p.batt.buy || '', cost: +p.batt.cost || 0, auto: 'battery', key: 'battery' });
    if (p.payload && +p.payload.g > 0) rows.push({ name: p.payload.name || 'Payload', sub: 'Payload', qty: 1, g: +p.payload.g, auto: 'payload', key: 'payload' });
    return rows;
  }

  function massOf(p, lib) {
    const auto = autoRows(p, lib);
    const all = auto.concat(p.bom || []);
    const total = sum(all, (r) => (+r.qty || 0) * (+r.g || 0));
    const bySub = {};
    for (const r of all) bySub[r.sub || 'Other'] = (bySub[r.sub || 'Other'] || 0) + (+r.qty || 0) * (+r.g || 0);
    return { auto, total, bySub };
  }

  // avionics/electronics draw from the flight battery, in W at the battery
  function avionicsPower(p) {
    let w = 0;
    for (const r of p.bom || []) {
      if (!r.rail || r.rail === 'Separate') continue;
      const pw = (+r.qty || 0) * (+r.w || 0);
      w += r.rail === 'VBAT' ? pw : pw / ((p.becEff || 90) / 100);
    }
    return w;
  }

  // ponytail: typical discharge-capacity vs temperature curves (LiPo / Li-ion datasheets, 0.5–1C); LiFePO4 suffers more in the cold
  function coldFactor(t, chem) {
    const pts = chem === 'life' ? [[-20, 0.5], [-10, 0.65], [0, 0.8], [10, 0.95], [15, 1]] : [[-20, 0.6], [-10, 0.75], [0, 0.88], [10, 1]];
    if (!(t < pts[pts.length - 1][0])) return 1;
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0); }
    return 1;
  }

  // ponytail: typical figures from small-UAS VTOL papers; editable per design (vtol.hoverPen %, vtol.accel m/s²)
  const VTOL_DEF = {
    quadplane: { pen: 3, acc: 1.0, tw: 1.5, note: 'booms and fuselage under the lift props' },
    tiltrotor: { pen: 8, acc: 1.5, tw: 1.5, note: 'wing under the rotors pushes down in hover' },
    tailsitter: { pen: 6, acc: 2.5, tw: 1.8, note: 'prop wash scrubs along the wing; needs extra thrust for control' },
  };

  // ---------- main compute ----------
  function hover(set, n, coax, Wg, sigma, V) {
    if (!set || !n || !set.rows.length) return null;
    const c = curve(set, V);
    const tPer = Wg / n;
    const cf = coax ? COAX_THRUST : 1;
    const pPer = (c.powerAt(tPer) / Math.sqrt(sigma)) * (coax ? COAX_POWER : 1);
    const thr = c.throttleAt(tPer / sigma / cf);
    const tmaxTot = n * c.tmax * sigma * cf;
    return {
      set, c, tPer, pMotors: n * pPer, thr,
      tmaxTot, tw: tmaxTot / Wg,
      iMaxMotor: c.imax, overRange: tPer / sigma / cf > c.tmax,
      diskM2: n * Math.PI * Math.pow(((set.diam || 0) * 0.0254) / 2, 2) / (coax ? 2 : 1),
    };
  }

  function compute(p, lib, o) {
    o = o || {};
    const b = Object.assign({}, p.batt, o.batt || {});
    const bat = battery(b);
    const pp = Object.assign({}, p, { batt: b });
    if (o.payloadG != null) pp.payload = Object.assign({}, p.payload, { g: o.payloadG });
    const mass = massOf(pp, lib);
    const Wg = mass.total, WN = (Wg / 1000) * g0;
    const rho = rhoAt(p.env.alt, p.env.temp), sigma = rho / RHO0;
    const pAv = avionicsPower(p);
    const R = { type: p.type, bat, mass, Wg, WN, rho, sigma, pAv, checks: [] };
    // cold packs give less: usable energy factor from air temperature (packs warm up in flight, so mild below 10 °C)
    const cf = coldFactor(p.env.temp, b.chem);
    if (cf < 1) { bat.usableWh *= cf; bat.coldF = cf; }
    const chk = (level, msg) => R.checks.push({ level, msg });
    // sustained current (hover/cruise) must stay under the continuous rating; full throttle only lasts seconds, so it is checked against peak
    const battChk = (iMax, iSus, what) => {
      const c = bat.iMaxCont, pk = bat.iMaxPeak;
      if (isFinite(iSus) && iSus > c) chk('crit', `${what[0].toUpperCase() + what.slice(1)} draw ${iSus.toFixed(0)} A exceeds the battery's continuous rating ${c.toFixed(0)} A (${b.c}C). Use a higher-C or larger pack.`);
      if (!isFinite(iMax) || iMax <= c) return;
      if (!bat.peakSet) chk('warn', `Full-throttle draw ${iMax.toFixed(0)} A is above the continuous rating ${c.toFixed(0)} A (${b.c}C). Enter the pack's peak (burst) C to check it against the burst limit.`);
      else if (iMax > pk) chk('crit', `Full-throttle draw ${iMax.toFixed(0)} A exceeds the battery's peak rating ${pk.toFixed(0)} A (${b.cPeak}C burst).`);
      else chk('info', `Full throttle (${iMax.toFixed(0)} A) is above continuous ${c.toFixed(0)} A but within peak ${pk.toFixed(0)} A: fine for short bursts (climb-out, gusts), not sustained.`);
    };

    if (p.type === 'multirotor' || p.type === 'vtol') {
      const L = LAYOUTS[p.mr.layout] || LAYOUTS.quadx;
      const lift = combo(lib, p.mr.motor, p.mr.prop, bat.V);
      const vd = p.type === 'vtol' ? VTOL_DEF[p.vtol.kind] || VTOL_DEF.quadplane : null;
      const kH = vd ? 1 + (p.vtol.hoverPen != null && p.vtol.hoverPen !== '' ? +p.vtol.hoverPen : vd.pen) / 100 : 1;
      R.kHover = kH;
      const h = hover(lift, p.mr.n, L.coax, Wg * kH, sigma, bat.V);
      R.h = h;
      // props on neighbouring arms must not touch: arm tips are wheelbase · sin(π / arms) apart
      const pr = (lib.props || []).find((x) => x.id === p.mr.prop), d = pr ? +pr.diam || 0 : 0, wb = +p.mr.wb || 0;
      if (d && wb) {
        const arms = L.coax ? p.mr.n / 2 : p.mr.n, gap = wb * Math.sin(Math.PI / arms) - d * 25.4;
        R.propGap = gap;
        if (gap < 0) chk('crit', `${d}" props overlap by ${(-gap).toFixed(0)} mm on a ${wb} mm ${arms}-arm frame. The largest that fits is ${((wb * Math.sin(Math.PI / arms)) / 25.4).toFixed(1)}".`);
        else if (gap < 0.05 * d * 25.4) chk('warn', `Only ${gap.toFixed(0)} mm between prop tips on the ${wb} mm frame. Leave about 5 % of the prop diameter to keep them out of each other's wash.`);
      }
      if (d && +p.mr.maxProp > 0 && d > +p.mr.maxProp) chk('warn', `${d}" props are larger than the frame's ${p.mr.maxProp}" maximum.`);
      if (lift && lift.physics) chk(lift.rows.length ? (lift.drive.propData && lift.drive.motorModel ? 'info' : 'warn') : 'crit', lift.rows.length ? `${lift.name}: ${lift.source.toLowerCase()} (no bench data). Add thrust data, prop data or motor Rm/I0 in Library for better numbers.` : `${lift.name}: set the motor kV and prop size, or add bench data.`);
      if (h) {
        const P = h.pMotors + pAv;
        R.hoverP = P;
        R.hoverI = P / bat.V;
        R.hoverMin = (bat.usableWh / P) * 60;
        R.maxI = p.mr.n * h.iMaxMotor + pAv / bat.V;
        const thrustAtLimit = p.mr.n * h.c.thrustAtThrottle(p.mr.maxThr) * sigma * (L.coax ? COAX_THRUST : 1);
        R.payloadG = thrustAtLimit / kH - Wg;
        R.diskLoad = h.diskM2 ? Wg / 1000 / h.diskM2 : null;
        if (h.c.estimated && !lift.physics) chk('warn', `${h.set.name}: only one data point, curve is estimated. Add bench rows in Library.`);
        if (!lift.physics && Math.abs(bat.V - h.c.vt) / h.c.vt > 0.1) chk('warn', `Battery ${bat.V.toFixed(1)} V vs bench test ${h.c.vt.toFixed(1)} V for ${h.set.name}: thrust scaled by (V/Vtest)², verify with a test at your voltage.`);
        if (h.overRange) chk('crit', 'Required thrust per motor is above the 100% bench point. It cannot hover.');
        const twWarn = vd ? vd.tw : 2;
        if (h.tw < 1.4) chk('crit', `Thrust-to-weight ${h.tw.toFixed(2)} is too low for control authority (aim ≥ ${twWarn}).`);
        else if (h.tw < twWarn) chk('warn', `Thrust-to-weight ${h.tw.toFixed(2)} is marginal (aim ≥ ${twWarn}).`);
        if (h.thr > 80) chk('crit', `Hover throttle ${h.thr.toFixed(0)}% leaves no margin.`);
        else if (h.thr > 65) chk('warn', `Hover throttle ${h.thr.toFixed(0)}% is high (aim 40–60%).`);
        driveChk(chk, R, bat, lib, p.mr, p.mr.motor, h.iMaxMotor, p.type === 'vtol' ? 'Lift' : '', true);
        if (p.type === 'multirotor') battChk(R.maxI, R.hoverI, 'hover');
        if (p.type === 'multirotor' && !o.lite && h.diskM2) {
          const ff = mrForward(WN, rho, h.diskM2, p.mr.cda, h.pMotors, (h.tmaxTot / 1000) * g0, p.mr.lean, p.mr.n * h.iMaxMotor * bat.V);
          R.ff = ff.map((pt) => {
            const P2 = pt.P + pAv, t = (bat.usableWh / P2) * 3600;
            return { V: pt.V, P: P2, minutes: t / 60, km: (pt.V * t) / 1000, tilt: pt.tilt };
          });
          if (R.ff.length) {
            R.bestRange = R.ff.reduce((a, x) => (x.km > a.km ? x : a));
            R.bestEnd = R.ff.reduce((a, x) => (x.minutes > a.minutes ? x : a));
            R.vmax = R.ff[R.ff.length - 1].V;
            R.vmaxLimit = ff.limit;
          }
        } else if (h.diskM2 === 0) chk('warn', 'Set a prop diameter on the propulsion set to model forward flight.');
      } else if (!lift) chk('crit', 'Pick a lift motor and prop.');
    }

    if (p.type === 'fixedwing' || p.type === 'vtol') {
      const f = p.fw, S = f.area, AR = (f.span * f.span) / S;
      const quadp = p.type === 'vtol' && p.vtol.kind === 'quadplane';
      const dr = f.drag && f.drag.mode === 'buildup' ? f.drag : null;
      const liftSet = quadp ? combo(lib, p.mr.motor, p.mr.prop, bat.V) : null;
      const rotors = quadp && liftSet ? { n: p.mr.n, diamIn: liftSet.diam || 0 } : null;
      const eOsw = dr && dr.eAuto !== false ? oswald(AR) : f.e;
      R.e = eOsw;
      const shared = p.type === 'vtol' && p.vtol.kind !== 'quadplane';
      const cset = shared ? combo(lib, p.mr.motor, p.mr.prop, bat.V) : combo(lib, f.motor, f.prop, bat.V);
      const cn = shared ? p.mr.n : f.n;
      const mObj = (lib.motors || []).find((m) => m.id === (shared ? p.mr.motor : f.motor));
      const mount = dr && dr.mount && dr.mount !== 'auto' ? dr.mount : cn >= 2 ? 'wing' : 'nose';
      const can = motorCanMm(mObj) / 1000, podCfg = (dr && dr.pods) || {};
      const pods = !dr || podCfg.mode === 'none' ? null : podCfg.mode === 'manual' ? { n: +podCfg.n || 0, d: +podCfg.d || 0, L: +podCfg.L || 0 } : mount === 'wing' && can ? { n: cn, d: 1.3 * can, L: 3.9 * can } : null;
      const Dprop = cset ? (cset.diam || 0) * 0.0254 : 0;
      // two passes: drag without wash -> thrust per motor -> slipstream speed -> wash drag
      const bu = (V, W) => {
        const a = dragBuildup(f, dr, V, rho, p.env.temp, rotors, { pods });
        if (!Dprop || !cn) return a;
        const q = 0.5 * rho * V * V, CL = W / (q * S), Dn = q * S * (a.cd0 + (CL * CL) / (Math.PI * eOsw * AR));
        return dragBuildup(f, dr, V, rho, p.env.temp, rotors, { pods, wash: { n: cn, D: Dprop, Tper: Dn / cn, mount } });
      };
      const cd0 = dr ? (V, W) => bu(V, W || WN).cd0 : f.cd0 + (quadp ? p.vtol.dcd0 : 0);
      R.drag = dr ? bu(f.vc, WN) : null;
      R.mount = dr ? mount : null;
      R.cd0 = typeof cd0 === 'function' ? cd0(f.vc, WN) : cd0;
      R.chord = S / f.span;
      const propK = f.propOther ? 0.85 : 1; // prop differs from its data (e.g. glass-fiber vs APC): −15 % thrust per watt
      const eta = (f.etaP / 100) * (f.etaD / 100) * propK;
      const c = cset && cset.rows.length ? curve(cset, bat.V) : null;
      if (!shared && cset && cset.physics) chk(cset.drive && cset.drive.propData ? 'info' : 'warn', `${cset.name}: ${cset.source.toLowerCase()} (no bench data).`);
      R.AR = AR;
      R.wingLoad = Wg / 1000 / S; // kg/m²
      R.vs = Math.sqrt((2 * WN) / (rho * S * f.clmax));
      // with real prop data, cruise power comes from the motor+prop solve at airspeed; otherwise assumed efficiencies
      const dm0 = cset && cset.drive && cset.drive.propData ? cset.drive : null;
      const dm = dm0 && propK < 1 ? Object.assign({}, dm0, { solve: (t, V, r) => { const s = dm0.solve(t, V, r); return Object.assign({}, s, { T: s.T * propK, etaP: s.etaP * propK }); } }) : dm0;
      R.propModel = !!dm;
      const dragN = (V, W, k) => fwDrag(V, W, rho, S, AR, cd0, eOsw).D * k;
      const propP = (V, W, k) => {
        if (dm) { const r = drivePower(dm, cn, V, dragN(V, W, k), rho); return r && r.P; }
        return (fwDrag(V, W, rho, S, AR, cd0, eOsw).P * k) / eta;
      };
      // drag correction: learned from your calibrated flights, else the default theory-to-flight gap
      const cfg = lib.cfg || {}, useLearned = lib.fleetK > 0 && cfg.learn !== false;
      let k = useLearned ? lib.fleetK : cfg.defK > 0 ? cfg.defK : DEFAULT_K;
      R.kSource = useLearned ? 'learned' : 'default';
      if (f.cal && f.cal.on && f.cal.v > 0 && f.cal.a > 0 && f.cal.g > 0) {
        const target = f.cal.a * bat.V, Wm = (f.cal.g / 1000) * g0;
        if (dm) {
          let lo = 0.2, hi = 5;
          for (let j = 0; j < 30; j++) { const mid = (lo + hi) / 2, P = propP(f.cal.v, Wm, mid); if (P == null || P > target) hi = mid; else lo = mid; }
          k = (lo + hi) / 2;
        } else k = target / propP(f.cal.v, Wm, 1);
        R.calK = k;
        R.kSource = 'calibrated';
      }
      R.kUsed = k;
      const pReq = (V) => { const P = propP(V, WN, k); return P == null ? null : P + pAv; };
      const tst = c ? (cn * c.tmax * sigma * g0) / 1000 : 0;
      const vp = cset && cset.kv && cset.pitch ? (cset.kv * bat.V * 0.85 * cset.pitch * 0.0254) / 60 : null;
      const tav = (V) => (dm ? cn * dm.solve(1, V, rho).T : vp ? Math.max(0, tst * (1 - V / vp)) : tst);
      R.staticTW = tst / WN;
      R.pitchSpeed = vp;
      if (!o.lite) {
        const v0 = R.vs * 1.05, v1 = dm ? R.vs * 4.5 : Math.max(v0 + 5, Math.min(vp || R.vs * 4, R.vs * 4.5));
        const pts = [];
        for (let i = 0; i <= 90; i++) {
          const V = v0 + ((v1 - v0) * i) / 90;
          const P = pReq(V);
          if (P == null) continue;
          const d = fwDrag(V, WN, rho, S, AR, cd0, eOsw), t = (bat.usableWh / P) * 3600;
          pts.push({ V, P, minutes: t / 60, km: (V * t) / 1000, roc: ((tav(V) - d.D * k) * V) / WN, D: d.D * k, CL: d.CL });
        }
        R.fwCurve = pts;
        const safe = pts.filter((x) => x.V >= 1.2 * R.vs);
        const pool = safe.length ? safe : pts;
        R.bestEnd = pool.reduce((a, x) => (x.P < a.P ? x : a), pool[0]);
        R.bestRange = pool.reduce((a, x) => (x.km > a.km ? x : a), pool[0]);
        R.vmaxLevel = dm || vp ? (pts.filter((x) => x.roc >= 0).pop() || {}).V : null;
        R.maxRoc = pts.length ? Math.max(...pts.map((x) => x.roc)) : null;
      }
      const vc = f.vc, pc = pReq(vc);
      R.cruise = { V: vc, P: pc == null ? NaN : pc, I: pc == null ? NaN : pc / bat.V, CL: fwDrag(vc, WN, rho, S, AR, cd0, eOsw).CL };
      R.cruise.minutes = (bat.usableWh / R.cruise.P) * 60;
      R.cruise.km = (vc * R.cruise.minutes * 60) / 1000;
      // conservative case: +20 % propulsion power (one-reference tuning; typical conceptual-design spread)
      if (!R.calK) {
        const pc2 = (R.cruise.P - pAv) * ((lib.cfg && lib.cfg.cons > 0) ? lib.cfg.cons : CONSERVATIVE) + pAv;
        Object.assign(R.cruise, { consP: pc2, consMinutes: (bat.usableWh / pc2) * 60, consKm: ((vc * bat.usableWh) / pc2) * 3.6 });
      }
      if (dm) {
        const dp = drivePower(dm, cn, vc, dragN(vc, WN, k), rho);
        if (dp) Object.assign(R.cruise, { etaP: dp.etaP, etaM: dp.etaM, thr: dp.thr, rpm: dp.rpm });
      }
      R.cruiseSet = cset;
      if (!c) chk('crit', 'Pick a cruise motor and prop (with kV and prop size, or bench data).');
      else if (c.estimated && !cset.physics) chk('warn', `${cset.name}: only one data point, thrust curve is estimated.`);
      if (c && !shared) driveChk(chk, R, bat, lib, f, f.motor, c.imax, p.type === 'vtol' ? 'Cruise' : '', false);
      if (pc == null) chk('crit', `The cruise motor and prop cannot hold ${vc} m/s at this weight.`);
      if (R.fwCurve && R.fwCurve.length) R.LDmax = Math.max(...R.fwCurve.map((x) => R.WN / x.D));
      R.LDcruise = R.WN / fwDrag(vc, WN, rho, S, AR, cd0, eOsw).D;
      if (R.LDcruise > 14 && !(R.calK)) chk('warn', `Cruise L/D ${R.LDcruise.toFixed(1)} is glider territory. Check wing area and the drag inputs (fuselage, add-ons).`);
      if (AR < 4 || AR > 14) chk('warn', `Aspect ratio ${AR.toFixed(1)} (mean chord ${(R.chord * 1000).toFixed(0)} mm) looks off. Check span and wing area.`);
      if (vc < 1.3 * R.vs) chk('warn', `Cruise ${vc} m/s is under 1.3 × stall (${(1.3 * R.vs).toFixed(1)} m/s).`);
      if (R.cruise.CL > 0.9 * f.clmax) chk('crit', `Cruise CL ${R.cruise.CL.toFixed(2)} is near CLmax.`);
      if (p.type === 'fixedwing' && R.staticTW < 0.4) chk('warn', `Static thrust-to-weight ${R.staticTW.toFixed(2)} is low for hand launch (aim ≥ 0.5).`);
      if (!dm && vp && vc > vp * 0.85) chk('warn', `Cruise is close to pitch speed ${vp.toFixed(1)} m/s; consider more pitch.`);
      if (dm && R.cruise.thr > 85) chk('warn', `Cruise needs ${R.cruise.thr.toFixed(0)}% throttle; little speed margin.`);
      if (!dm && c && R.cruise.P - pAv > cn * c.pmax * 0.9) chk('crit', 'Cruise power exceeds what the cruise motor can deliver.');
      if (p.type === 'fixedwing') {
        R.maxI = (c ? cn * c.imax : 0) + pAv / bat.V;
        battChk(R.maxI, R.cruise.I, 'cruise');
        // payload limited by stall speed target
        if (f.vsMax) R.payloadG = ((f.vsMax * f.vsMax * rho * S * f.clmax) / 2 / g0) * 1000 - Wg;
      }
    }

    if (p.type === 'vtol' && R.h && R.cruise) {
      const v = p.vtol;
      const eAvail = bat.usableWh * (1 - v.reserve / 100);
      const eHover = (R.hoverP * v.hoverS) / 3600;
      // transitions: speed up from hover to 1.2 × stall (forward) and back (slowing down, wing carrying more of the load)
      const vd2 = VTOL_DEF[v.kind] || VTOL_DEF.quadplane, acc = +v.accel > 0 ? +v.accel : vd2.acc;
      const vtr = 1.2 * R.vs, tTr = vtr / acc;
      const pCr = isFinite(R.cruise.P) ? R.cruise.P : R.hoverP;
      const pFwd = v.kind === 'quadplane' ? 0.75 * R.hoverP + pCr : 0.5 * (R.hoverP + pCr); // quadplane: lift props still carrying most of it while the pusher accelerates
      const ke = (0.5 * (Wg / 1000) * vtr * vtr) / 0.5 / 3600; // kinetic energy at ~50 % prop efficiency, Wh
      const eFwd = (pFwd * tTr) / 3600 + ke, eBack = (0.8 * pFwd * tTr) / 3600;
      const nTr = v.transitions != null && v.transitions !== '' ? Math.max(0, +v.transitions) : 2;
      const eTrans = (nTr / 2) * (eFwd + eBack);
      R.trans = { v: vtr, t: tTr, acc, eFwd, eBack, e: eTrans, n: nTr, pFwd };
      const eCruise = eAvail - eHover - eTrans;
      const consCruiseP = R.cruise.consP || R.cruise.P;
      R.mission = {
        eAvail, eHover, eTrans, eCruise,
        consKm: Math.max(0, (eCruise / consCruiseP) * 3600 * p.fw.vc / 1000),
        consMinutes: Math.max(0, (eCruise / consCruiseP) * 60),
        minutes: Math.max(0, (eCruise / R.cruise.P) * 60),
        km: Math.max(0, (eCruise / R.cruise.P) * 3600 * p.fw.vc / 1000),
      };
      if (eCruise <= 0) chk('crit', 'Hover and transitions use all available energy; nothing left for cruise.');
      else if (eTrans > 0.15 * eAvail) chk('warn', `Transitions take ${Math.round((eTrans / eAvail) * 100)} % of the usable energy. A faster transition (more cruise thrust) or a lower stall speed helps.`);
      if (v.kind === 'tailsitter' && R.h) {
        // standing on its tail the wing is a sail: the most wind it can hold position in with full thrust tilted into it
        const tmax = (R.h.tmaxTot / 1000) * g0, W = WN * (R.kHover || 1), side = Math.sqrt(Math.max(0, tmax * tmax - W * W));
        R.hoverWind = Math.sqrt((2 * side) / (rho * p.fw.area * 1.2));
        const w = p.mission ? +p.mission.wind || 0 : 0;
        if (w > R.hoverWind) chk('crit', `Tailsitter hover: wind ${w} m/s is above the ${R.hoverWind.toFixed(1)} m/s it can hold against (wing side area). Take off and land into lighter wind.`);
        else if (w > 0.7 * R.hoverWind) chk('warn', `Tailsitter hover: wind ${w} m/s is close to the ${R.hoverWind.toFixed(1)} m/s limit; little control margin left.`);
      }
      R.maxI = R.h.iMaxMotor * p.mr.n + pAv / bat.V;
      battChk(R.maxI, Math.max(R.hoverI || 0, R.cruise.I || 0), 'hover');
    }

    if (Wg > 25000) chk('warn', 'AUW over 25 kg: FAA Part 107 limit (55 lb) is near or exceeded.');
    if (bat.Wh > 100) chk('info', `Pack is ${bat.Wh.toFixed(0)} Wh (>100 Wh): airline carry-on limits apply.`);
    if (!R.checks.some((c) => c.level !== 'info')) chk('good', 'No issues found with the current inputs.');
    return R;
  }

  // battery capacity sweep: weight scales with capacity at the current pack's g/mAh
  function batterySweep(p, lib) {
    const cell = +p.batt.cellMah || +p.batt.mah, g = +p.batt.g;
    const out = [];
    for (let f = 0.25; f <= 3.001; f += 0.0625) {
      const r = compute(p, lib, { batt: { cellMah: cell * f, mah: cell * f, g: g * f }, lite: true });
      out.push({ mah: r.bat.mah, g: r.bat.g, minutes: enduranceOf(p, r), auw: r.Wg });
    }
    return out;
  }

  const enduranceOf = (p, r) => (p.type === 'multirotor' ? r.hoverMin : p.type === 'fixedwing' ? r.cruise && r.cruise.minutes : r.mission && r.mission.minutes);

  // payload mass sweep: endurance and (for lift craft) hover throttle vs payload
  function payloadSweep(p, lib) {
    const cur = (p.payload && +p.payload.g) || 0;
    const top = Math.max(1000, cur * 2.5);
    const out = [];
    for (let k = 0; k <= 40; k++) {
      const g = (top * k) / 40;
      const r = compute(p, lib, { payloadG: g, lite: true });
      out.push({ g, minutes: enduranceOf(p, r), thr: r.h ? r.h.thr : null, km: p.type === 'fixedwing' ? r.cruise && r.cruise.km : r.mission ? r.mission.km : null });
    }
    return out;
  }

  // every component of a design: auto rows (motors, props, pack, payload) + BOM
  function fullBom(p, lib) {
    return autoRows(p, lib).map((r) => Object.assign({ rail: '', w: 0, rf: '' }, r)).concat(p.bom || []);
  }

  // purchase list across designs: rows merged by name + subsystem, qty per design
  function consolidate(projects, lib) {
    const map = new Map();
    projects.forEach((p, i) => {
      for (const r of fullBom(p, lib)) {
        const k = `${r.sub}|${r.name}`;
        const e = map.get(k) || { name: r.name, sub: r.sub, g: +r.g || 0, w: +r.w || 0, link: r.link || '', buy: r.buy || '', cost: +r.cost || 0, qty: projects.map(() => 0) };
        e.qty[i] += +r.qty || 0;
        map.set(k, e);
      }
    });
    return [...map.values()];
  }

  const costOf = (p, lib) => sum(fullBom(p, lib), (r) => (+r.qty || 0) * (+r.cost || 0));

  // longitudinal CG from item positions (mm from the design's datum); items without a position are listed, not guessed
  function cgOf(p, lib) {
    const pos = (p.cg && p.cg.pos) || {};
    let gm = 0, g = 0, missing = 0;
    for (const r of fullBom(p, lib)) {
      const m = (+r.qty || 0) * (+r.g || 0), x = r.auto ? pos[r.key] : r.x;
      if (!m) continue;
      if (x === '' || x == null || !isFinite(+x)) { missing++; continue; }
      gm += m * +x; g += m;
    }
    const x = g ? gm / g : null, out = { x, g, missing };
    if (p.type !== 'multirotor' && p.fw && x != null) {
      const mac = +p.cg.mac > 0 ? +p.cg.mac : (p.fw.area / p.fw.span) * 1000;
      out.mac = mac;
      out.pct = ((x - (+p.cg.le || 0)) / mac) * 100;
    }
    return out;
  }

  // mission profile: energy per segment from the computed power curves (R must be a full compute, not lite)
  // ponytail: climb adds W·rate/0.7 (mr) or /0.6 (fw) on top of hover / best-endurance power; descent costs 85 % hover (mr) or avionics only (fw). Good to ~10 %; a flight log beats it.
  const SEG = { hover: ['Hover', 's'], transition: ['Transition', '×'], climb: ['Climb', 'm'], cruise: ['Cruise', 'km'], loiter: ['Loiter', 'min'], descend: ['Descend', 'm'] };
  function missionPlan(p, lib, R) {
    const M = p.mission;
    if (!M || !(M.segs || []).length) return null;
    const fw = p.type !== 'multirotor', w = +M.wind || 0, W = R.WN, pAv = R.pAv;
    const consK = R.calK || !fw ? 1 : (lib.cfg && lib.cfg.cons > 0 ? lib.cfg.cons : CONSERVATIVE);
    const curve = fw ? R.fwCurve : R.ff;
    const pAt = (V) => {
      if (fw && Math.abs(V - p.fw.vc) < 1e-6 && R.cruise && isFinite(R.cruise.P)) return R.cruise.P;
      if (!curve || !curve.length) return null;
      if (V <= curve[0].V) return curve[0].P;
      for (let i = 1; i < curve.length; i++) if (curve[i].V >= V) { const a = curve[i - 1], b = curve[i], t = (V - a.V) / (b.V - a.V); return a.P + t * (b.P - a.P); }
      return null; // faster than this aircraft can fly
    };
    const V = fw ? p.fw.vc : +M.vMr > 0 ? +M.vMr : R.bestRange && R.bestRange.V;
    const rate = +M.climb > 0 ? +M.climb : 2;
    const rows = [];
    for (const sg of M.segs) {
      const v = +sg.v || 0, r = { type: sg.type, label: SEG[sg.type] ? SEG[sg.type][0] : sg.type, v, unit: SEG[sg.type] ? SEG[sg.type][1] : '', t: 0, P: null, err: '' };
      if (sg.type === 'transition') {
        if (!R.trans) r.err = 'Only hybrid VTOL designs transition.';
        else { r.t = v * R.trans.t; r.P = r.t ? ((v * (R.trans.eFwd + R.trans.eBack)) / 2) * 3600 / r.t : 0; }
      } else if (sg.type === 'hover') { r.t = v; r.P = R.hoverP; if (!R.hoverP) r.err = 'No lift motors: this aircraft cannot hover.'; }
      else if (sg.type === 'climb') {
        r.t = v / rate;
        r.P = !fw ? R.hoverP + (W * rate) / 0.7 : R.bestEnd ? R.bestEnd.P + (W * rate) / 0.6 : null;
        if (fw && R.maxRoc != null && rate > R.maxRoc) r.err = `Climb rate ${rate} m/s is above the best climb ${R.maxRoc.toFixed(1)} m/s.`;
      } else if (sg.type === 'descend') { r.t = v / (fw ? 2 : 1.5); r.P = fw ? pAv : R.hoverP * 0.85; }
      else if (sg.type === 'loiter') { r.t = v * 60; r.P = fw ? R.bestEnd && R.bestEnd.P : R.hoverP; }
      else if (sg.type === 'cruise') {
        const dir = sg.dir || 'none';
        const gs = dir === 'head' ? V - w : dir === 'tail' ? V + w : dir === 'cross' ? Math.sqrt(Math.max(0, V * V - w * w)) : V;
        r.V = V; r.gs = gs; r.dir = dir;
        r.P = V ? pAt(V) : null;
        if (!(gs > 0.5)) r.err = `Wind ${w} m/s is as fast as the ${V ? V.toFixed(1) : '?'} m/s airspeed: no progress.`;
        else r.t = (v * 1000) / gs;
        if (r.P == null && !r.err) r.err = 'This speed is beyond the power curve.';
      }
      if (r.P == null || !isFinite(r.P)) r.P = 0;
      r.E = (r.P * r.t) / 3600;
      const ePav = (pAv * r.t) / 3600;
      r.Econs = Math.max(0, r.E - ePav) * consK + Math.min(r.E, ePav);
      rows.push(r);
    }
    const total = sum(rows, (r) => r.E), totalCons = sum(rows, (r) => r.Econs);
    const avail = R.bat.usableWh * (1 - (+M.reserve || 0) / 100);
    return {
      rows, total, totalCons, avail, consK, V, wind: w,
      minutes: sum(rows, (r) => r.t) / 60,
      km: sum(rows.filter((r) => r.type === 'cruise'), (r) => r.v),
      ok: !rows.some((r) => r.err) && totalCons <= avail,
      okNominal: !rows.some((r) => r.err) && total <= avail,
    };
  }

  // ---------- power distribution ----------
  const STD_AMPS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
  const WIRE = [[24, 3.5], [22, 6], [20, 10], [18, 16], [16, 22], [14, 32], [12, 41], [10, 55], [8, 73], [6, 101], [4, 135], [2, 181]];
  const CONNECTORS = [['XT30', 30], ['XT60', 60], ['XT90', 90], ['EC5', 120], ['AS150 / QS8', 150], ['AS250', 250]];
  const pickWire = (a) => (WIRE.find((w) => w[1] >= a) || WIRE[WIRE.length - 1]);
  const pickConn = (a) => (CONNECTORS.find((c) => c[1] >= a) || CONNECTORS[CONNECTORS.length - 1]);

  function powerPlan(p, lib, R) {
    const bat = R.bat;
    const groups = {};
    for (const r of p.bom || []) {
      if (!r.rail) continue;
      (groups[r.rail] = groups[r.rail] || []).push(r);
    }
    const rails = Object.keys(groups).map((rail) => {
      const items = groups[rail];
      const V = rail === 'VBAT' ? bat.V : rail === 'Separate' ? null : RAIL_V[rail] || parseFloat(rail);
      const avgW = sum(items, (r) => (+r.qty || 0) * (+r.w || 0));
      const peakW = sum(items, (r) => (+r.qty || 0) * (+r.pw || +r.w || 0));
      const iAvg = V ? avgW / V : 0, iPk = V ? peakW / V : 0;
      const rec = STD_AMPS.find((a) => a >= iPk * 1.25) || Math.ceil(iPk * 1.25);
      const notes = [];
      let kind = 'Direct from battery';
      if (rail === 'Separate') kind = 'Separate supply';
      else if (rail !== 'VBAT' && V) {
        if (V >= bat.vMin - 1) {
          kind = 'Buck-boost regulator';
          notes.push(`Battery sags to ${bat.vMin.toFixed(1)} V, which is too close to ${V} V for a buck BEC.`);
        } else kind = 'Switching BEC (buck)';
        const ldoW = (bat.vMax - V) * iAvg;
        if (ldoW > 0.5) notes.push(`A linear regulator would burn ${ldoW.toFixed(1)} W here. Use switching.`);
        notes.push(`Input range needed: ${bat.vMin.toFixed(1)}–${bat.vMax.toFixed(1)} V (${bat.S}S).`);
      } else if (rail === 'VBAT') notes.push(`Items must accept ${bat.vMin.toFixed(1)}–${bat.vMax.toFixed(1)} V.`);
      const lossW = rail !== 'VBAT' && rail !== 'Separate' ? avgW * (100 / (p.becEff || 90) - 1) : 0;
      return { rail, V, items, avgW, peakW, iAvg, iPk, rec, kind, notes, lossW };
    }).sort((a, b) => (a.V || 99) - (b.V || 99));

    const motorSets = [];
    if (R.h) motorSets.push({ label: 'Lift ESC', n: p.mr.n, iMax: R.h.iMaxMotor, iHover: R.h.pMotors / p.mr.n / bat.V });
    if ((p.type === 'fixedwing' || (p.type === 'vtol' && p.vtol.kind === 'quadplane')) && R.cruiseSet && R.cruiseSet.rows.length) {
      const c = curve(R.cruiseSet, bat.V);
      motorSets.push({ label: 'Cruise ESC', n: p.fw.n, iMax: c.imax, iHover: R.cruise ? (R.cruise.P - R.pAv) / p.fw.n / bat.V : 0 });
    }
    const railsI = sum(rails.filter((r) => r.rail !== 'Separate'), (r) => (r.rail === 'VBAT' ? r.peakW : r.peakW / ((p.becEff || 90) / 100)) / bat.V);
    const motorsI = sum(motorSets, (m) => m.n * m.iMax);
    const totalPk = motorsI + railsI;
    return {
      rails, motorSets, railsI, motorsI, totalPk,
      ...(() => {
        // advanced mode: your own connector / wire tables and per-design picks (lib.pwr, p.power)
        const pw = lib.pwr || {}, W = pw.wire && pw.wire.length ? pw.wire : WIRE, C = pw.conns && pw.conns.length ? pw.conns : CONNECTORS;
        const pk = (list, a) => list.find((x) => x[1] >= a) || list[list.length - 1];
        const ov = (pw.on && p.power) || {};
        const conn = (ov.conn && C.find((c) => c[0] === ov.conn)) || pk(C, totalPk);
        const wire = (ov.awg && W.find((w) => String(w[0]) === String(ov.awg))) || pk(W, totalPk);
        return { mainWire: wire, mainConn: conn, connAuto: !(ov.conn && conn[0] === ov.conn), wireAuto: !(ov.awg && String(wire[0]) === String(ov.awg)), escWire: motorSets.map((m) => pk(W, m.iMax)), conns: C, wires: W };
      })(),
      pdbRating: Math.ceil((totalPk * 1.2) / 10) * 10,
    };
  }

  // ---------- RF ----------
  const BANDS = {
    '433': { mhz: 433, label: '433 MHz', tx: 20, sens: -117 },
    '868': { mhz: 868, label: '868 MHz', tx: 27, sens: -120 },
    '915': { mhz: 915, label: '915 MHz', tx: 30, sens: -121 },
    '1200': { mhz: 1280, label: '1.2/1.3 GHz', tx: 27, sens: -90 },
    '2400': { mhz: 2440, label: '2.4 GHz', tx: 20, sens: -105 },
    '5800': { mhz: 5800, label: '5.8 GHz', tx: 25, sens: -90 },
    gnss: { mhz: 1575.42, label: 'GNSS L1 (rx only)', tx: null, sens: null },
  };
  const POL = { same: { label: 'Matched', db: 0 }, cl: { label: 'Circular ↔ linear', db: 3 }, cross: { label: 'Linear, 90° misaligned', db: 20 }, lr: { label: 'LHCP ↔ RHCP', db: 25 } };

  // radio presets: datasheet TX power and sensitivity (check yours: firmware and air rate change them)
  const AIRMAX = [ // Ubiquiti airMAX ac (Rocket 5AC Lite datasheet): data rate trades sensitivity
    ['1x BPSK 1/2', 27, -96], ['2x QPSK 1/2', 27, -95], ['2x QPSK 3/4', 27, -92], ['4x 16QAM 1/2', 27, -90], ['4x 16QAM 3/4', 27, -86],
    ['6x 64QAM 2/3', 27, -83], ['6x 64QAM 3/4', 26, -77], ['6x 64QAM 5/6', 25, -74], ['8x 256QAM 3/4', 23, -69], ['8x 256QAM 5/6', 22, -65],
  ];
  const RADIOS = {
    'rfd900x': { label: 'RFD900x (64 kbps air rate)', mhz: 915, tx: 30, sens: -121 },
    'elrs24-500': { label: 'ExpressLRS 2.4 GHz, 500 Hz', mhz: 2440, tx: 24, sens: -105 },
    'elrs24-250': { label: 'ExpressLRS 2.4 GHz, 250 Hz', mhz: 2440, tx: 24, sens: -108 },
    'elrs24-150': { label: 'ExpressLRS 2.4 GHz, 150 Hz', mhz: 2440, tx: 24, sens: -112 },
    'elrs24-50': { label: 'ExpressLRS 2.4 GHz, 50 Hz', mhz: 2440, tx: 24, sens: -115 },
    'elrs24-1w': { label: 'ExpressLRS 2.4 GHz, 1 W module (e.g. Ranger Micro), 150 Hz', mhz: 2440, tx: 30, sens: -112 },
    'elrs900-200': { label: 'ExpressLRS 900 MHz, 200 Hz', mhz: 915, tx: 27, sens: -112 },
    'elrs900-50': { label: 'ExpressLRS 900 MHz, 50 Hz', mhz: 915, tx: 27, sens: -123 },
    'crossfire': { label: 'TBS Crossfire, 150 Hz', mhz: 915, tx: 30, sens: -117 },
    'rocket-ac': { label: 'Ubiquiti Rocket 5AC Lite (airMAX ac)', mhz: 5800, airmax: 27 },
    'bullet-ac': { label: 'Ubiquiti Bullet AC (airMAX ac)', mhz: 5800, airmax: 25 },
    'vtx58': { label: 'Analog 5.8 GHz video, 400 mW', mhz: 5800, tx: 26, sens: -90 },
  };
  // antennas: gain, polarization (lin / rhcp / lhcp) and beamwidth (deg; 360 = omni)
  const ANTENNAS = {
    'dipole': { label: 'Dipole / whip, 2 dBi', g: 2, pol: 'lin', bw: 360 },
    'collinear': { label: 'Collinear omni, 5 dBi', g: 5, pol: 'lin', bw: 360 },
    'mushroom': { label: 'Mushroom (cloverleaf) omni, RHCP, 3.7 dBi', g: 3.71, pol: 'rhcp', bw: 360 },
    'patch8': { label: 'Patch, 8 dBi, 60° beam', g: 8, pol: 'lin', bw: 60 },
    'panel14cp': { label: 'Flat panel, RHCP, 14 dBi, 40° beam', g: 14, pol: 'rhcp', bw: 40 },
    'helical12': { label: 'Helical, RHCP, 12 dBi, 40° beam', g: 12, pol: 'rhcp', bw: 40 },
    'yagi15': { label: 'Yagi, 15 dBi, 30° beam', g: 15, pol: 'lin', bw: 30 },
  };
  // polarization loss between two antennas
  const polLoss = (a, b) => (!a || !b ? null : a === b ? 0 : a === 'lin' || b === 'lin' ? 3 : 25);
  const fspl = (km, mhz) => 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.44;
  function link(l, d) {
    const pol = (POL[l.pol] || POL.same).db;
    const eirp = l.tx + l.txG - l.loss;
    const budget = eirp + l.rxG - pol - l.sens; // allowed path loss
    const slant = Math.max(0.001, Math.hypot(d.dist, (d.alt - d.gndH) / 1000));
    const loss = fspl(slant, l.mhz);
    const margin = budget - loss;
    const maxKm = Math.pow(10, (budget - d.fade - 32.44 - 20 * Math.log10(l.mhz)) / 20);
    const fres = 17.32 * Math.sqrt(slant / (4 * (l.mhz / 1000)));
    const need = d.fade - margin;
    let ant;
    if (need <= 0) ant = 'Link closes with these antennas. Omni dipoles/monopoles are fine.';
    else if (need <= 3) ant = 'Swap the ground side to a 5–6 dBi collinear omni, or cut cable loss.';
    else if (need <= 8) ant = 'Ground patch (8–9 dBi, ~60° beam) aimed at the operating area.';
    else if (need <= 13) ant = 'Helical or patch array (11–14 dBi, 30–40° beam). Needs aiming or a tracker.';
    else ant = 'Yagi/dish (15+ dBi) on a tracker, more TX power, or a lower data rate (better sensitivity).';
    const lam = 299.792458 / l.mhz; // m
    return { eirp, budget, slant, loss, margin, maxKm, fres, fres60: fres * 0.6, ant, lamMm: lam * 1000, quarterMm: lam * 250 * 0.95, halfMm: lam * 500 * 0.95, polDb: pol };
  }
  const radioHorizonKm = (h1, h2) => 4.12 * (Math.sqrt(Math.max(0, h1)) + Math.sqrt(Math.max(0, h2)));

  function rfConflicts(bands) {
    const out = [];
    const uniq = [...new Set(bands)];
    const mhz = (b) => BANDS[b].mhz;
    if (uniq.includes('gnss')) for (const b of uniq) {
      if (b === '1200') out.push('1.2/1.3 GHz video sits next to GNSS L1/L2: expect GPS desense. Use 5.8 GHz or a filtered VTX.');
      if (b !== 'gnss' && BANDS[b] && [2, 3, 4].some((k) => Math.abs(mhz(b) * k - 1575.42) < 40)) out.push(`Harmonics of ${BANDS[b].label} land near GNSS L1. Keep that antenna away from the GPS.`);
    }
    const counts = {};
    bands.forEach((b) => (counts[b] = (counts[b] || 0) + 1));
    for (const b in counts) if (b !== 'gnss' && counts[b] > 1) out.push(`${counts[b]} radios share ${BANDS[b].label}. Separate antennas by ≥ λ/2·4 (${Math.round((299.792 / mhz(b)) * 2000)} mm) and avoid adjacent channels.`);
    if (uniq.includes('2400') && uniq.includes('5800')) out.push('2.4 GHz and 5.8 GHz together are fine; keep the 5.8 GHz VTX antenna away from the 2.4 GHz receiver.');
    return out;
  }

  // ---------- 3D printing materials ----------
  // Typical FDM values. hdt: heat deflection °C @0.45 MPa. Scores 0–3. req: printer needed.
  const MATERIALS = [
    { id: 'pla', name: 'PLA', rho: 1.24, ts: 50, E: 3.5, hdt: 55, uv: 1, water: 2, impact: 1, chem: 1, flex: false, req: 'open', cost: 20, note: 'Stiff, easy. Creeps and softens in a hot car or near ESCs.' },
    { id: 'petg', name: 'PETG', rho: 1.27, ts: 50, E: 2.1, hdt: 70, uv: 2, water: 3, impact: 2, chem: 2, flex: false, req: 'open', cost: 22, note: 'Tough, water-resistant all-rounder.' },
    { id: 'abs', name: 'ABS', rho: 1.04, ts: 40, E: 2.2, hdt: 98, uv: 1, water: 2, impact: 2, chem: 2, flex: false, req: 'enclosed', cost: 22, note: 'Heat-resistant and light; yellows in sun.' },
    { id: 'asa', name: 'ASA', rho: 1.07, ts: 45, E: 2.0, hdt: 95, uv: 3, water: 2, impact: 2, chem: 2, flex: false, req: 'enclosed', cost: 28, note: 'ABS with UV stability. Good outdoor default.' },
    { id: 'pc', name: 'Polycarbonate', rho: 1.2, ts: 60, E: 2.3, hdt: 135, uv: 1, water: 2, impact: 3, chem: 1, flex: false, req: 'enclosed', cost: 35, note: 'Very tough and heat-resistant; warps without an enclosure.' },
    { id: 'pa', name: 'Nylon (PA12)', rho: 1.01, ts: 50, E: 1.5, hdt: 80, uv: 1, water: 0, impact: 3, chem: 3, flex: false, req: 'enclosed', cost: 40, note: 'Impact and fuel resistant. Must be dried; absorbs water.' },
    { id: 'pacf', name: 'PA-CF (nylon carbon)', rho: 1.15, ts: 75, E: 6.5, hdt: 150, uv: 2, water: 1, impact: 2, chem: 3, flex: false, req: 'enclosed', cost: 70, note: 'Stiffest common option; arms and mounts. Hardened nozzle.' },
    { id: 'petgcf', name: 'PETG-CF', rho: 1.3, ts: 55, E: 5.0, hdt: 75, uv: 2, water: 3, impact: 1, chem: 2, flex: false, req: 'open', cost: 35, note: 'Stiff, easy, matte. Hardened nozzle. Brittle in crashes.' },
    { id: 'tpu', name: 'TPU 95A', rho: 1.21, ts: 35, E: 0.03, hdt: 60, uv: 2, water: 2, impact: 3, chem: 2, flex: true, req: 'open', cost: 30, note: 'Bumpers, antenna mounts, battery pads, landing feet.' },
    { id: 'pei', name: 'PEI (ULTEM 9085)', rho: 1.34, ts: 70, E: 2.3, hdt: 153, uv: 2, water: 2, impact: 2, chem: 3, flex: false, req: 'hightemp', cost: 200, note: 'Flame-retardant, aerospace-qualified grades.' },
    { id: 'peek', name: 'PEEK', rho: 1.3, ts: 100, E: 3.8, hdt: 155, uv: 1, water: 3, impact: 2, chem: 3, flex: false, req: 'hightemp', cost: 500, note: 'Extreme temperature and chemical resistance.' },
  ];
  const PRINTER_LEVEL = { open: 0, enclosed: 1, hightemp: 2 };

  function rankMaterials(env) {
    const tEff = env.amb + (env.sun ? 20 : 0) + (env.heat ? 25 : 0);
    const w = { uv: env.uv ? 3 : 0.3, water: env.wet ? 3 : 0.5, impact: env.crash ? 3 : 1, chem: env.fuel ? 3 : 0.3 };
    return MATERIALS.map((m) => {
      const why = [], fail = [];
      if (m.hdt - 5 < tEff) fail.push(`softens: HDT ${m.hdt} °C vs ${tEff} °C part temp`);
      if (PRINTER_LEVEL[m.req] > PRINTER_LEVEL[env.printer]) fail.push(m.req === 'hightemp' ? 'needs a high-temp printer' : 'needs an enclosed printer');
      if (env.flex && !m.flex) fail.push('not flexible');
      if (!env.flex && m.flex) fail.push('too soft for structure');
      let s = 0, tot = 0;
      for (const k in w) { s += w[k] * m[k]; tot += w[k] * 3; }
      let score = s / tot; // 0..1
      score += (env.stiff / 10) * (m.E / 6.5) * 0.6;
      score += (env.light / 10) * ((m.ts / m.rho) / 75) * 0.6;
      score += Math.min(0.25, (m.hdt - tEff) / 400);
      score -= (env.budget / 10) * (Math.log10(m.cost) - 1.3) * 0.15;
      if (env.uv && m.uv >= 3) why.push('UV-stable');
      if (env.wet && m.water >= 3) why.push('shrugs off water');
      if (env.crash && m.impact >= 3) why.push('impact-tough');
      if (env.fuel && m.chem >= 3) why.push('chemical-resistant');
      if (m.E >= 5) why.push('very stiff');
      if (m.hdt - tEff > 40) why.push(`${m.hdt - tEff} °C heat headroom`);
      return { m, score: fail.length ? -1 : score, ok: !fail.length, why, fail, tEff };
    }).sort((a, b) => b.score - a.score);
  }

  // x: { vol cm³, area cm² (0 = estimate), walls, tb (top/bottom layers), infill % }; pr: { lineW mm, layerH mm }
  // ponytail: shell = area × average skin thickness, area split 2/3 walls, 1/3 top/bottom (a cube's split).
  // Use the slicer's weight when you need it exact.
  // With areaSide/areaTB from an STL the split is measured; otherwise ⅔ / ⅓ is assumed.
  function partShell(x, pr) {
    const V = +x.vol || 0, lw = (pr && +pr.lineW) || 0.45, lh = (pr && +pr.layerH) || 0.2;
    const A = +x.area > 0 ? +x.area : 6 * Math.pow(V, 2 / 3);
    const measured = +x.areaSide > 0 || +x.areaTB > 0;
    const side = measured ? +x.areaSide || 0 : (2 / 3) * A, tb = measured ? +x.areaTB || 0 : (1 / 3) * A;
    const shellV = (side * (+x.walls || 0) * lw + tb * (+x.tb || 0) * lh) / 10; // cm² × mm / 10 = cm³
    return { V, A, estArea: !(+x.area > 0), measured, t: A ? shellV / A : 0, shell: Math.min(V, shellV) };
  }

  // ---------- STL ----------
  // -> Float32Array of triangles (9 floats each), units as in the file (normally mm)
  function parseSTL(buf) {
    const dv = new DataView(buf);
    const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (n && 84 + n * 50 === buf.byteLength) {
      const t = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      return t;
    }
    const text = new TextDecoder().decode(buf);
    const v = [];
    const rx = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    let m;
    while ((m = rx.exec(text))) v.push(+m[1], +m[2], +m[3]);
    if (!v.length || v.length % 9) throw new Error('Not a readable STL (binary or ASCII).');
    return Float32Array.from(v);
  }
  // volume (divergence theorem), area split by normal: |nz| > 0.5 counts as top/bottom skin
  function stlStats(t, unitMm = 1) {
    let vol = 0, area = 0, tb = 0;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.length; i += 9) {
      const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const a2 = Math.hypot(nx, ny, nz), a = a2 / 2;
      area += a;
      if (a2 && Math.abs(nz) / a2 > 0.5) tb += a;
      for (let k = 0; k < 9; k++) { const c = k % 3, val = t[i + k]; if (val < lo[c]) lo[c] = val; if (val > hi[c]) hi[c] = val; }
    }
    const u = unitMm;
    return {
      tris: t.length / 9,
      vol: (Math.abs(vol) * u ** 3) / 1000, // cm³
      area: (area * u ** 2) / 100, // cm²
      areaTB: (tb * u ** 2) / 100,
      areaSide: ((area - tb) * u ** 2) / 100,
      size: [0, 1, 2].map((c) => (hi[c] - lo[c]) * u), // mm
      closedHint: Math.abs(vol) > 0,
    };
  }
  function partMass(x, rho, pr) {
    const s = partShell(x, pr);
    return rho * (s.shell + (s.V - s.shell) * (+x.infill || 0) / 100);
  }

  // ---------- flight logs ----------
  const FSZ = { a: 64, b: 1, B: 1, h: 2, H: 2, i: 4, I: 4, f: 4, d: 8, n: 4, N: 16, Z: 64, c: 2, C: 2, e: 4, E: 4, L: 4, M: 1, q: 8, Q: 8 };

  function decodeStr(u8, off, len) {
    let s = '';
    for (let k = 0; k < len; k++) { const ch = u8[off + k]; if (!ch) break; s += String.fromCharCode(ch); }
    return s;
  }

  function readField(dv, u8, o, ch) {
    switch (ch) {
      case 'b': return dv.getInt8(o);
      case 'B': case 'M': return dv.getUint8(o);
      case 'h': return dv.getInt16(o, true);
      case 'H': return dv.getUint16(o, true);
      case 'i': return dv.getInt32(o, true);
      case 'I': return dv.getUint32(o, true);
      case 'f': return dv.getFloat32(o, true);
      case 'd': return dv.getFloat64(o, true);
      case 'c': return dv.getInt16(o, true) / 100;
      case 'C': return dv.getUint16(o, true) / 100;
      case 'e': return dv.getInt32(o, true) / 100;
      case 'E': return dv.getUint32(o, true) / 100;
      case 'L': return dv.getInt32(o, true) / 1e7;
      case 'q': return Number(dv.getBigInt64(o, true));
      case 'Q': return Number(dv.getBigUint64(o, true));
      case 'n': return decodeStr(u8, o, 4);
      case 'N': return decodeStr(u8, o, 16);
      case 'Z': return decodeStr(u8, o, 64);
      default: return NaN;
    }
  }

  // Builds a log object: { msgs: { NAME: { cols, count, col(name) -> array, time() -> Float64Array } }, source }
  function makeMsg(name, cols, getter, count) {
    const cache = {};
    const m = {
      name, cols, count,
      col(c) { return cache[c] || (cache[c] = getter(c)); },
      time() {
        if (cache.__t) return cache.__t;
        let t;
        if (cols.includes('TimeUS')) t = Float64Array.from(m.col('TimeUS'), (x) => x / 1e6);
        else if (cols.includes('TimeMS')) t = Float64Array.from(m.col('TimeMS'), (x) => x / 1e3);
        else if (cols.includes('time')) t = Float64Array.from(m.col('time'));
        else t = Float64Array.from({ length: count }, (_, i) => i);
        return (cache.__t = t);
      },
    };
    return m;
  }

  const INSTANCE_COLS = ['Instance', 'I', 'Inst', 'C'];
  // split multi-instance messages (BAT, GPS, IMU, ...) into NAME[0], NAME[1]
  function splitInstances(msgs, getIdx) {
    for (const name of Object.keys(msgs)) {
      const m = msgs[name];
      const ic = m.cols.find((c) => INSTANCE_COLS.includes(c) && c !== 'C');
      if (!ic || m.count < 2) continue;
      const inst = m.col(ic);
      const groups = {};
      for (let k = 0; k < inst.length; k++) (groups[inst[k]] = groups[inst[k]] || []).push(k);
      const keys = Object.keys(groups);
      if (keys.length < 2 || keys.length > 16) continue;
      delete msgs[name];
      for (const key of keys) {
        const rows = groups[key];
        msgs[`${name}[${key}]`] = makeMsg(`${name}[${key}]`, m.cols, (c) => { const src = m.col(c); return Array.from(rows, (r) => src[r]); }, rows.length);
      }
    }
    return msgs;
  }

  function parseBin(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    const fmts = { 128: { len: 89, name: 'FMT', fmt: 'BBnNZ', cols: ['Type', 'Length', 'Name', 'Format', 'Columns'] } };
    const offs = {};
    const n = u8.length;
    let i = 0, bad = 0;
    while (i + 3 <= n) {
      if (u8[i] !== 0xa3 || u8[i + 1] !== 0x95) { i++; bad++; continue; }
      const t = u8[i + 2], f = fmts[t];
      if (!f) { i++; bad++; continue; }
      if (i + f.len > n) break;
      if (t === 128) {
        const ty = u8[i + 3];
        fmts[ty] = { len: u8[i + 4], name: decodeStr(u8, i + 5, 4), fmt: decodeStr(u8, i + 9, 16), cols: decodeStr(u8, i + 25, 64).split(',') };
      } else (offs[t] = offs[t] || []).push(i);
      i += f.len;
    }
    const msgs = {};
    for (const t in offs) {
      const f = fmts[t];
      if (!f || msgs[f.name]) continue;
      const fo = [];
      let o = 3;
      for (const ch of f.fmt) { fo.push(o); o += FSZ[ch] || 0; }
      const list = offs[t];
      msgs[f.name] = makeMsg(f.name, f.cols, (c) => {
        const k = f.cols.indexOf(c), ch = f.fmt[k];
        if (k < 0) return [];
        if ('nNZ'.includes(ch)) return list.map((p) => readField(dv, u8, p + fo[k], ch));
        const out = new Float64Array(list.length);
        for (let j = 0; j < list.length; j++) out[j] = readField(dv, u8, list[j] + fo[k], ch);
        return out;
      }, list.length);
      msgs[f.name].fmt = f.fmt;
    }
    return { msgs: splitInstances(msgs), source: 'DataFlash .bin', skipped: bad };
  }

  function parseText(text) {
    const lines = text.split(/\r?\n/);
    const head = lines.find((l) => l.trim());
    if (head && !head.startsWith('FMT')) return parseCSV(text);
    const defs = {}, data = {};
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split(',').map((s) => s.trim());
      const name = parts[0];
      if (name === 'FMT') { defs[parts[3]] = { fmt: parts[4], cols: parts.slice(5) }; continue; }
      const d = defs[name];
      if (!d) continue;
      const rows = data[name] || (data[name] = d.cols.map(() => []));
      for (let k = 0; k < d.cols.length; k++) {
        const v = parts[k + 1];
        const num = Number(v);
        rows[k].push(v === undefined ? NaN : Number.isNaN(num) ? v : num);
      }
    }
    const msgs = {};
    for (const name in data) {
      const d = defs[name], cols = data[name];
      msgs[name] = makeMsg(name, d.cols, (c) => cols[d.cols.indexOf(c)] || [], cols[0].length);
      msgs[name].fmt = d.fmt;
    }
    return { msgs: splitInstances(msgs), source: 'DataFlash text .log' };
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const cols = lines[0].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    const data = cols.map(() => []);
    for (let r = 1; r < lines.length; r++) {
      const parts = lines[r].split(',');
      for (let k = 0; k < cols.length; k++) data[k].push(Number(parts[k]));
    }
    const tcol = cols.findIndex((c) => /^(time|timestamp|t|time_s|TimeUS|TimeMS)$/i.test(c));
    const names = cols.slice();
    if (tcol >= 0) names[tcol] = /us$/i.test(cols[tcol]) ? 'TimeUS' : /ms$/i.test(cols[tcol]) ? 'TimeMS' : 'time';
    const msgs = { CSV: makeMsg('CSV', names, (c) => data[names.indexOf(c)] || [], data[0].length) };
    return { msgs, source: 'CSV' };
  }

  const MODES = {
    copter: { 0: 'Stabilize', 1: 'Acro', 2: 'AltHold', 3: 'Auto', 4: 'Guided', 5: 'Loiter', 6: 'RTL', 7: 'Circle', 9: 'Land', 11: 'Drift', 13: 'Sport', 14: 'Flip', 15: 'AutoTune', 16: 'PosHold', 17: 'Brake', 18: 'Throw', 19: 'Avoid_ADSB', 20: 'Guided_NoGPS', 21: 'Smart_RTL', 22: 'FlowHold', 23: 'Follow', 24: 'ZigZag', 25: 'SystemID', 26: 'Heli_Autorotate', 27: 'Auto RTL' },
    plane: { 0: 'Manual', 1: 'Circle', 2: 'Stabilize', 3: 'Training', 4: 'Acro', 5: 'FBWA', 6: 'FBWB', 7: 'Cruise', 8: 'Autotune', 10: 'Auto', 11: 'RTL', 12: 'Loiter', 13: 'Takeoff', 14: 'Avoid_ADSB', 15: 'Guided', 17: 'QStabilize', 18: 'QHover', 19: 'QLoiter', 20: 'QLand', 21: 'QRTL', 22: 'QAutotune', 23: 'QAcro', 24: 'Thermal', 25: 'Loiter2QLand' },
  };

  function logVehicle(log) {
    const m = log.msgs.MSG;
    if (!m) return 'copter';
    const txt = m.col('Message').join(' ');
    return /ArduPlane|QuadPlane/i.test(txt) ? 'plane' : 'copter';
  }

  function logModes(log) {
    const m = log.msgs.MODE;
    if (!m) return [];
    const veh = logVehicle(log);
    const t = m.time(), num = m.col(m.cols.includes('ModeNum') ? 'ModeNum' : 'Mode');
    return Array.from(t, (x, k) => ({ t: x, name: MODES[veh][num[k]] || `Mode ${num[k]}` }));
  }

  // per flight mode: average speed, current and power while cruising (armed, moving, roughly level)
  // ponytail: "cruise" = speed > 3 m/s and |climb| < 1 m/s over ±1 s; tune the thresholds if a log disagrees
  function modeCruise(log, segs) {
    const bat = findMsg(log, 'BAT') || findMsg(log, 'CURR');
    if (!bat || !segs.length) return null;
    const bt = bat.time(), bv = bat.col(bat.cols.includes('Volt') ? 'Volt' : 'V'), bi = bat.col(bat.cols.includes('Curr') ? 'Curr' : 'I');
    const pick = (name, cols) => { const m = findMsg(log, name); const c = m && cols.find((x) => m.cols.includes(x)); return c ? { t: m.time(), y: m.col(c) } : null; };
    const air = pick('ARSP', ['Airspeed']) || pick('CTUN', ['Aspd', 'As']);
    const gnd = pick('GPS', ['Spd']);
    const spd = air || gnd;
    const alt = pick('CTUN', ['Alt']) || pick('GPS', ['Alt']) || pick('BARO', ['Alt']);
    const at = (s, t) => { const k = idxAt(s.t, t); return k < 0 ? null : s.y[k]; };
    const out = new Map();
    for (let k = 1; k < bt.length; k++) {
      const t = bt[k], dt = Math.min(5, t - bt[k - 1]);
      if (!(dt > 0)) continue;
      let seg = null;
      for (const s of segs) if (s.a <= t) seg = s;
      if (!seg) continue;
      const o = out.get(seg.name) || { name: seg.name, t: 0, tc: 0, s: 0, i: 0, p: 0 };
      out.set(seg.name, o);
      o.t += dt;
      if (!(bi[k] > 0.5) || !spd) continue;
      const v = at(spd, t);
      if (!(v > 3)) continue;
      if (alt) { const a0 = at(alt, t - 1), a1 = at(alt, t + 1); if (a0 != null && a1 != null && Math.abs(a1 - a0) / 2 > 1) continue; }
      o.tc += dt; o.s += v * dt; o.i += bi[k] * dt; o.p += bv[k] * bi[k] * dt;
    }
    return { src: air ? 'airspeed' : 'ground speed', rows: [...out.values()].map((o) => ({ name: o.name, time: o.t, cruise: o.tc, v: o.tc ? o.s / o.tc : null, i: o.tc ? o.i / o.tc : null, p: o.tc ? o.p / o.tc : null })) };
  }
  // mission segments rebuilt from a flight: per flight mode, climb / main part / descent, plus the energy the pack gave
  // ponytail: one segment per mode and height change; good for comparing plan vs flight, not a second-by-second replay
  function missionFromLog(log, segs, track, type) {
    if (!track || !segs.length) return null;
    const out = [];
    const add = (t, v, dir) => { if (!(v > 0)) return; const last = out[out.length - 1]; if (last && last.type === t && t !== 'cruise') last.v += v; else out.push({ type: t, v, dir: dir || 'none' }); };
    for (const s of segs) {
      const i0 = Math.max(0, idxAt(track.t, s.a)), i1 = idxAt(track.t, s.b);
      if (i1 <= i0 || s.b - s.a < 5) continue;
      let dist = 0, up = 0, down = 0;
      for (let k = i0 + 1; k <= i1; k++) {
        dist += Math.hypot(track.e[k] - track.e[k - 1], track.n[k] - track.n[k - 1]);
        const dz = track.u[k] - track.u[k - 1];
        if (dz > 0) up += dz; else down -= dz;
      }
      const net = track.u[i1] - track.u[i0], dur = s.b - s.a, spd = dist / dur, name = String(s.name).toUpperCase();
      if (net > 15) add('climb', Math.round(net));
      const hoverMode = /^Q|^LAND|^ALT|^POS|^STAB|^BRAKE/.test(name) || (type === 'multirotor' && spd < 2);
      if (hoverMode && type !== 'fixedwing') add('hover', Math.round(dur));
      else if (/LOITER|CIRCLE/.test(name) && type !== 'multirotor') add('loiter', +(dur / 60).toFixed(1));
      else if (dist > 200) add('cruise', +(dist / 1000).toFixed(2));
      if (net < -15) add('descend', Math.round(-net));
    }
    const bat = findMsg(log, 'BAT') || findMsg(log, 'CURR');
    let wh = null;
    if (bat) {
      if (bat.cols.includes('EnrgTot')) { const e = bat.col('EnrgTot'); wh = e[e.length - 1]; }
      else { const t = bat.time(), v = bat.col(bat.cols.includes('Volt') ? 'Volt' : 'V'), c = bat.col(bat.cols.includes('Curr') ? 'Curr' : 'I'); wh = 0; for (let k = 1; k < t.length; k++) wh += (v[k] * c[k] * Math.min(5, t[k] - t[k - 1])) / 3600; }
    }
    return { segs: out, wh };
  }
  // which ArduPilot firmware wrote the log: from the version message, else from tell-tale parameters
  // ---------- product page → library fields ----------
  // Reads a shop or maker page (HTML or pasted text): structured data first (JSON-LD Product, meta tags), then
  // "label ... value unit" patterns in the visible text. Returns only the fields it found; the user checks them.
  function pageSpecs(src, kind) {
    const html = String(src || ''), o = {};
    const ent = (s) => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&times;/g, 'x').replace(/&Omega;|&#937;/g, 'Ω');
    // JSON-LD Product
    for (const m of html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let d; try { d = JSON.parse(m[1].trim()); } catch (e) { continue; }
      const all = [].concat(d['@graph'] || d).flat();
      const p = all.find((x) => x && /product/i.test([].concat(x['@type'] || '').join(' ')));
      if (!p) continue;
      if (p.name) o.name = ent(String(p.name)).trim();
      const b = p.brand && (p.brand.name || p.brand);
      if (typeof b === 'string' && b.trim()) o.brand = ent(b).trim();
      const off = [].concat(p.offers || [])[0];
      const pr = off && (off.price ?? off.lowPrice ?? (off.priceSpecification && off.priceSpecification.price));
      if (pr != null && isFinite(+pr) && +pr > 0) o.cost = +pr;
      if (p.description) o._desc = ent(String(p.description));
      break;
    }
    const meta = (rx) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:${rx})["'][^>]*>`, 'i')); const c = m && m[0].match(/content=["']([^"']*)["']/i); return c ? ent(c[1]).trim() : ''; };
    if (!o.name) o.name = meta('og:title|twitter:title') || ent((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').split(/\s+[|–—]\s+/)[0].trim();
    if (!o.cost) { const pm = meta('product:price:amount|og:price:amount'); if (+pm > 0) o.cost = +pm; }
    if (!o.brand) { const bm = meta('product:brand|og:brand'); if (bm) o.brand = bm; }
    // visible text: tags become separators so "<td>KV</td><td>250</td>" reads "KV | 250"
    // the page's main content only, when marked, so menus listing other products ("180A HV (6-14S)") don't count
    const body = (html.match(/<main[\s>][\s\S]*<\/main>/i) || [html])[0];
    const plain = (h) => ent(ent(h).replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ');
    // the product description (often a spec table) goes first, ahead of the rest of the page
    const text = (o._desc ? plain(o._desc) + ' | ' : '') + plain(body);
    delete o._desc;
    if (!o.name) o.name = (ent(html.replace(/<[^>]+>/g, '\n')).split('\n').map((x) => x.trim()).find(Boolean) || '').slice(0, 120); // pasted text: first line
    const all = `${o.name} | ${text}`;
    // number after a label, within a short gap (skips "|", ":" and words like "(g)")
    const after = (label, unit) => { const m = all.match(new RegExp(`(?:${label})(?:[^0-9|(]|\\([^)]{0,20}\\)|\\|){0,40}?(\\d+(?:[.,]\\d+)?)\\s*(${unit})`, 'i')); return m ? { v: +m[1].replace(',', '.'), u: (m[2] || '').toLowerCase() } : null; };
    const W = after('weight|mass|net weight', 'kg|g\\b|grams?|oz|lbs?|');
    if (W && W.v > 0) {
      const g = W.u === 'kg' ? W.v * 1000 : W.u === 'oz' ? W.v * 28.35 : /^lb/.test(W.u) ? W.v * 453.6 : W.v;
      // no unit given: grams if plausible
      if (W.u || g >= 1) o.g = +g.toFixed(1);
    }
    if (!o.cost) { const pm = all.match(/(?:[$€£]|USD|EUR|GBP)\s?(\d{1,5}(?:[.,]\d{2})?)/); if (pm) o.cost = +pm[1].replace(',', '.'); }
    const len = (label) => { const r = after(label, 'mm|cm|m\\b|in\\b|inch(?:es)?|"'); return r ? (r.u === 'mm' ? r.v / 1000 : r.u === 'cm' ? r.v / 100 : /in|"/.test(r.u) ? r.v * 0.0254 : r.v) : null; };
    if (kind === 'motors') {
      const kv = all.match(/(\d{2,5})\s*kv\b/i) || all.match(/\bkv\s*(\d{2,5})\b/i) || after('\\bkv\\b', '');
      if (kv) o.kv = +(kv.v || kv[1]);
      const rm = after('internal resistance|resistance|\\brm\\b', 'mΩ|m ?ohms?|mohm|Ω|ohms?|');
      if (rm) o.rm = /^m/.test(rm.u) || (!rm.u && rm.v > 1.5) || rm.v > 1.5 ? +(rm.v / 1000).toFixed(5) : rm.v;
      const i0 = after('no[- ]?load current|idle current|\\bi0\\b|\\bio\\b', 'a\\b'); if (i0) o.i0 = i0.v;
      const ma = after('max(?:imum)?\\.? (?:continuous )?current|peak current|max(?:imum)? amps?|\\bimax\\b', 'a\\b'); if (ma) o.maxA = ma.v;
      const mw = after('max(?:imum)?\\.? (?:continuous )?power|peak power|\\bpmax\\b', 'w\\b'); if (mw) o.maxW = mw.v;
    } else if (kind === 'props') {
      const sz = sizeOf(o.name); if (sz.diam) Object.assign(o, sz);
      const d = after('diameter', 'in\\b|inch(?:es)?|"|mm'); if (!o.diam && d) o.diam = d.u === 'mm' ? +(d.v / 25.4).toFixed(1) : d.v;
      const p = after('pitch', 'in\\b|inch(?:es)?|"|mm'); if (!o.pitch && p) o.pitch = p.u === 'mm' ? +(p.v / 25.4).toFixed(1) : p.v;
    } else if (kind === 'batteries') {
      const sp = all.match(/\b(\d{1,2})\s*S\s*(\d{1,2})\s*P\b/i), s = sp || all.match(/\b(\d{1,2})\s*S\b(?![a-z])/i);
      if (s) o.s = +s[1];
      o.p = sp ? +sp[2] : 1;
      const mah = all.match(/(\d{3,6})\s*mAh/i) || ((m) => m && [m[0], String(+m[1] * 1000)])(all.match(/(\d{1,3}(?:\.\d+)?)\s*Ah\b/i));
      if (mah) o.cellMah = Math.round(+mah[1] / o.p);
      const c = all.match(/(\d{1,3})\s*C\b(?!\w)/); if (c) o.c = +c[1];
      const cb = after('burst|peak|max(?:imum)? discharge', 'c\\b'); if (cb && cb.v > (o.c || 0)) o.cPeak = cb.v;
      o.chem = /li-?ion|18650|21700|molicel|amprius/i.test(all) ? 'liion' : /lihv|\bhv\b/i.test(all) ? 'lihv' : /lifepo|life\b/i.test(all) ? 'life' : 'lipo';
      // Li-ion packs often give amps or watts instead of C: "300A burst", "1369W sustained discharge"
      const ah = o.cellMah && o.p ? (o.cellMah * o.p) / 1000 : 0;
      if (ah && !o.cPeak) { const m = all.match(/(\d{2,4})\s*A\s*(?:burst|peak)/i) || all.match(/(?:burst|peak)[^0-9|]{0,20}(\d{2,4})\s*A\b/i); if (m) o.cPeak = +(+m[1] / ah).toFixed(1); }
      if (ah && !o.c && o.s) {
        const m = all.match(/(\d{2,4})\s*A\s*(?:continuous|sustained|max continuous)/i), w = all.match(/(\d{3,5})\s*W\s*(?:sustained|continuous)/i);
        const m2 = all.match(/(?:continuous|sustained)[^0-9|]{0,25}(\d{2,4})\s*A\b(?!\s*(?:burst|peak))/i);
        const A = m ? +m[1] : w ? +w[1] / (o.s * (o.chem === 'liion' ? 3.6 : 3.7)) : m2 ? +m2[1] : 0;
        if (A) o.c = +(A / ah).toFixed(1);
      }
    } else if (kind === 'escs') {
      const a = after('continuous current|cont\\.? current|constant current', 'a\\b') || ((m) => m && { v: +m[1] })(all.match(/\b(\d{2,3})\s*A\b(?!h)/));
      if (a) o.a = a.v;
      const b = after('burst current|peak current|burst|peak', 'a\\b'); if (b && b.v > (o.a || 0)) o.burst = b.v;
      const s = all.match(/\b(\d{1,2})\s*(?:S\s*)?(?:-|–|~|to)\s*(\d{1,2})\s*S\b/i);
      if (s) { o.sMin = +s[1]; o.sMax = +s[2]; } else { const m = all.match(/\b(\d{1,2})\s*S\b/); if (m) o.sMax = +m[1]; }
      const mr = /multi-?rotor|multi-?copter|quad-?copter|\bdrones?\b|\bUAV\b|agricultur/i.test(all), pl = /air-?plane|fixed[- ]wing|\bplanes?\b|glider/i.test(all);
      if (mr !== pl) o.use = mr ? 'mr' : 'plane';
    } else if (kind === 'airframes') {
      const vt = /\bvtol\b|quad-?plane|tilt-?rotor|tail-?sitter/i.test(all), mr = /multi-?rotor|multi-?copter|quad-?copter|hexa|octo|wheelbase|\bquad\b/i.test(all), fw = /wing ?span|fixed[- ]wing|air-?plane|glider/i.test(all);
      o.type = vt ? 'vtol' : mr && !fw ? 'multirotor' : 'fixedwing';
      if (o.type === 'multirotor') {
        const wb = len('wheel ?base|diagonal(?: wheelbase)?|motor to motor'); if (wb) o.wb = Math.round(wb * 1000);
        const mp = after('max(?:imum)?\\.? prop(?:eller)?(?: size)?|prop(?:eller)? size|supports?', 'in\\b|inch(?:es)?|"'); if (mp) o.maxProp = mp.v;
        o.layout = /octo|x8\b/i.test(all) ? 'octo' : /hexa|\bhex\b|y6\b/i.test(all) ? 'hexa' : /\btri\b|y3/i.test(all) ? 'tri' : 'quadx';
      }
      const sp = o.type === 'multirotor' ? null : len('wing ?span|span'); if (sp) o.span = +sp.toFixed(3);
      const l = len('length'); if (l) o.length = +l.toFixed(3);
      const ar = after('wing area', 'dm²|dm2|dm\\^2|cm²|cm2|m²|m2|sq\\.? ?in'); if (ar) o.area = +(ar.u.startsWith('dm') ? ar.v / 100 : ar.u.startsWith('cm') ? ar.v / 1e4 : ar.u.startsWith('sq') ? ar.v * 0.00064516 : ar.v).toFixed(4);
    }
    for (const k of Object.keys(o)) if (o[k] === '' || o[k] == null || (typeof o[k] === 'number' && !isFinite(o[k]))) delete o[k];
    return o;
  }

  function logFirmware(log, params) {
    const m = findMsg(log, 'MSG'), txt = m && m.cols.includes('Message') ? Array.from(m.col('Message')).slice(0, 40).join(' ') : '';
    const hit = /Ardu(Plane|Copter|Rover|Sub)|AntennaTracker|Blimp/.exec(txt);
    if (hit) return hit[0] === 'AntennaTracker' ? 'AntennaTracker' : hit[0];
    const has = (n) => params.some((p) => p.name === n);
    return has('Q_ENABLE') || has('TRIM_ARSPD_CM') || has('AIRSPEED_CRUISE') ? 'ArduPlane' : has('ATC_ANG_RLL_P') ? 'ArduCopter' : has('CRUISE_SPEED') ? 'Rover' : 'ArduCopter';
  }

  // automatic health check, after the checks in ArduPilot's Tools/LogAnalyzer (re-implemented, not copied)
  function logHealth(log, params, vehicle) {
    const out = [], add = (level, title, detail) => out.push({ level, title, detail });
    const col = (name, c) => { const m = findMsg(log, name); return m && m.cols.includes(c) ? { t: m.time(), y: Array.from(m.col(c)) } : null; };
    const max = (a) => a.reduce((x, y) => (y > x ? y : x), -Infinity), min = (a) => a.reduce((x, y) => (y < x ? y : x), Infinity);
    const prm = (n) => { const p = params.find((x) => x.name === n); return p ? p.value : null; };
    // board power
    const vcc = col('POWR', 'Vcc');
    if (vcc && vcc.y.length) {
      const lo = min(vcc.y), sw = max(vcc.y) - lo;
      add(lo < 4.5 ? 'crit' : lo < 4.8 || sw > 0.3 ? 'warn' : 'good', 'Board power (Vcc)', `${lo.toFixed(2)}–${max(vcc.y).toFixed(2)} V${lo < 4.5 ? ': brownout risk, check the power module/BEC' : sw > 0.3 ? ': swings more than 0.3 V, check the 5 V supply under load' : ''}`);
    }
    // vibration and clipping
    const vx = col('VIBE', 'VibeX'), vy = col('VIBE', 'VibeY'), vz = col('VIBE', 'VibeZ');
    if (vx && vy && vz) {
      const pk = Math.max(max(vx.y), max(vy.y), max(vz.y));
      const clips = ['Clip', 'Clip0', 'Clip1', 'Clip2'].map((c) => col('VIBE', c)).filter(Boolean).reduce((a, c) => a + (max(c.y) - min(c.y)), 0);
      add(pk > 60 || clips > 100 ? 'crit' : pk > 30 || clips > 0 ? 'warn' : 'good', 'Vibration', `peak ${pk.toFixed(0)} m/s²${clips ? `, ${clips} accelerometer clips` : ''}${pk > 30 ? ': soft-mount the flight controller, balance props' : ' (under 30 is good)'}`);
    }
    // GPS
    const ns = col('GPS', 'NSats'), hd = col('GPS', 'HDop');
    if (ns) {
      const lo = min(ns.y.filter((x) => x > 0)), hp = hd ? max(hd.y) : null;
      add(lo < 6 || hp > 2.5 ? 'crit' : lo < 10 || hp > 1.5 ? 'warn' : 'good', 'GPS', `min ${isFinite(lo) ? lo : 0} satellites${hp != null ? `, worst HDop ${hp.toFixed(2)}` : ''}`);
    }
    // compass interference: field strength change with throttle
    const mx = col('MAG', 'MagX'), my = col('MAG', 'MagY'), mz = col('MAG', 'MagZ'), thr = col('CTUN', 'ThO') || col('CTUN', 'ThI');
    if (mx && my && mz && thr) {
      const f = mx.y.map((x, i) => Math.hypot(x, my.y[i], mz.y[i]));
      const at = (s, t) => { const k = idxAt(s.t, t); return k < 0 ? null : s.y[k]; };
      const lo = [], hi = [];
      const tMax = max(thr.y), scale = tMax > 1.5 ? 100 : 1; // copter ThO is 0..1, plane ThO is %
      mx.t.forEach((t, i) => { const th = at(thr, t); if (th == null) return; const r = th / scale; if (r < 0.1) lo.push(f[i]); else if (r > 0.4) hi.push(f[i]); });
      if (lo.length > 20 && hi.length > 20) {
        const a = lo.reduce((x, y) => x + y, 0) / lo.length, b = hi.reduce((x, y) => x + y, 0) / hi.length, pct = Math.abs(b - a) / a * 100;
        add(pct > 30 ? 'crit' : pct > 15 ? 'warn' : 'good', 'Compass interference', `field changes ${pct.toFixed(0)} % with throttle${pct > 15 ? ': move the compass away from power wires, or run compass-motor calibration' : ''}`);
      }
    }
    // motor balance (multirotor hover)
    if (vehicle === 'ArduCopter') {
      const ch = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, s: col('RCOU', `C${n}`) })).filter((c) => c.s && max(c.s.y) > 1300);
      if (ch.length >= 3) {
        const avg = ch.map((c) => { const v = c.s.y.filter((x) => x > 1150); return { n: c.n, a: v.reduce((x, y) => x + y, 0) / (v.length || 1) }; });
        const hiM = avg.reduce((x, y) => (y.a > x.a ? y : x)), loM = avg.reduce((x, y) => (y.a < x.a ? y : x)), spread = hiM.a - loM.a;
        add(spread > 200 ? 'crit' : spread > 100 ? 'warn' : 'good', 'Motor balance', `outputs spread ${spread.toFixed(0)} µs${spread > 100 ? `: motor ${hiM.n} works hardest (check its prop, motor, or the CG on that side)` : ''}`);
      }
    }
    // CPU load
    const ld = col('PM', 'Load');
    if (ld && ld.y.length) { const pk = max(ld.y) / 10; add(pk > 90 ? 'crit' : pk > 75 ? 'warn' : 'good', 'Processor load', `peak ${pk.toFixed(0)} %`); }
    // errors and failsafes
    const ev = logEvents(log), errs = ev.filter((e) => e.kind === 'err' && !e.ok), fs = ev.filter((e) => /failsafe/i.test(e.text));
    add(errs.length ? 'crit' : 'good', 'Errors', errs.length ? errs.slice(0, 4).map((e) => e.text).join('; ') + (errs.length > 4 ? ` (+${errs.length - 4} more)` : '') : 'none logged');
    if (fs.length) add('warn', 'Failsafes', fs.slice(0, 3).map((e) => e.text).join('; '));
    // battery sag per cell (cell count from the full voltage)
    const bv = col('BAT', 'Volt');
    if (bv && bv.y.length) {
      const top = max(bv.y), cells = Math.max(1, Math.round(top / 4.15)), lo = min(bv.y.filter((x) => x > 1)) / cells;
      add(lo < 3.2 ? 'crit' : lo < 3.4 ? 'warn' : 'good', 'Battery', `${cells}S, lowest ${lo.toFixed(2)} V per cell${prm('BATT_CAPACITY') ? ` · BATT_CAPACITY ${prm('BATT_CAPACITY')} mAh` : ''}`);
    }
    // ended in the air
    const alt = col('CTUN', 'Alt');
    if (alt && alt.y.length && alt.y[alt.y.length - 1] > 5) add('crit', 'Log end', `log stops ${alt.y[alt.y.length - 1].toFixed(0)} m up: power loss or crash?`);
    return out;
  }

  // starting parameters from a design (battery, failsafe, motor and filter values), as ArduPilot .param text
  // ponytail: filter / expo / accel fits are Mission Planner's initial-tune rules of thumb for multirotors; verify on the aircraft
  function apParams(p, R) {
    const b = R.bat, c = b.chem, S = b.S, out = [];
    const put = (k, v, note) => out.push([k, v, note]);
    const cellLow = { lipo: 3.5, lihv: 3.5, liion: 3.2, life: 3.0 }[p.batt.chem] || 3.5, cellCrt = { lipo: 3.3, lihv: 3.3, liion: 3.0, life: 2.8 }[p.batt.chem] || 3.3;
    const usable = +p.batt.usable || 80;
    put('BATT_CAPACITY', Math.round(b.mah), 'all packs on board, mAh');
    put('BATT_ARM_VOLT', +(S * (c.nom + 0.15)).toFixed(1), 'refuse to arm on a partly flat pack');
    put('BATT_LOW_VOLT', +(S * cellLow).toFixed(1), `${cellLow} V per cell`);
    put('BATT_CRT_VOLT', +(S * cellCrt).toFixed(1), `${cellCrt} V per cell`);
    put('BATT_LOW_MAH', Math.round(b.mah * (1 - usable / 100)), `land with ${100 - usable} % left (usable ${usable} %)`);
    put('BATT_CRT_MAH', Math.round(b.mah * (1 - usable / 100) * 0.5), 'half the low reserve');
    // failsafe action numbers differ per firmware: Copter 2 = RTL, 1 = Land; Plane/QuadPlane 1 = RTL, 2 = Land
    if (p.type === 'multirotor') { put('BATT_FS_LOW_ACT', 2, 'RTL'); put('BATT_FS_CRT_ACT', 1, 'Land'); }
    else { put('BATT_FS_LOW_ACT', 1, 'RTL'); put('BATT_FS_CRT_ACT', 2, p.type === 'vtol' ? 'Land (QLand with Q_OPTIONS as set)' : 'Land'); }
    const mot = p.type === 'vtol' ? 'Q_M_' : 'MOT_';
    if (p.type !== 'fixedwing') {
      const prop = (R.h && R.h.set && +R.h.set.diam) || 10;
      put(`${mot}BAT_VOLT_MAX`, +(S * c.max).toFixed(1), 'thrust scaling with pack voltage');
      put(`${mot}BAT_VOLT_MIN`, +(S * cellCrt).toFixed(1), '');
      if (R.h) put(`${mot}THST_HOVER`, +Math.min(0.8, Math.max(0.125, R.h.thr / 100)).toFixed(3), 'from the hover estimate; ArduPilot learns it in flight');
      put(`${mot}THST_EXPO`, +Math.min(0.8, Math.max(0.2, 0.15686 * Math.log(prop) + 0.23693)).toFixed(2), `${prop}" props`);
      const gyro = Math.max(20, Math.round(289.22 * Math.pow(prop, -0.838)));
      if (p.type === 'multirotor') {
        put('INS_GYRO_FILTER', gyro, `${prop}" props`);
        put('ATC_RAT_RLL_FLTD', Math.round(gyro / 2), ''); put('ATC_RAT_PIT_FLTD', Math.round(gyro / 2), '');
        put('ATC_RAT_RLL_FLTT', Math.round(gyro / 2), ''); put('ATC_RAT_PIT_FLTT', Math.round(gyro / 2), '');
        const acc = Math.max(10000, Math.round((-2.613267 * prop ** 3 + 343.39216 * prop ** 2 - 15083.7121 * prop + 235771) / 100) * 100);
        put('ATC_ACCEL_P_MAX', acc, 'cdeg/s²'); put('ATC_ACCEL_R_MAX', acc, 'cdeg/s²');
      }
    }
    if (p.type !== 'multirotor' && R.vs) {
      put('AIRSPEED_MIN', Math.ceil(1.3 * R.vs), 'm/s, 1.3 × stall (4.5+: AIRSPEED_MIN; older: ARSPD_FBW_MIN)');
      put('AIRSPEED_CRUISE', +p.fw.vc.toFixed(1), 'm/s (older: TRIM_ARSPD_CM in cm/s)');
      if (R.vmaxLevel) put('AIRSPEED_MAX', Math.floor(Math.min(R.vmaxLevel * 0.9, p.fw.vc * 1.6)), 'm/s (older: ARSPD_FBW_MAX)');
      if (R.cruise && isFinite(R.cruise.thr)) put('TRIM_THROTTLE', Math.round(R.cruise.thr), '% at cruise');
    }
    if (p.type === 'vtol') {
      put('Q_ENABLE', 1, '');
      if (R.vs) put('Q_ASSIST_SPEED', Math.ceil(R.vs * 1.1), 'm/s: lift motors help below this');
      if (R.trans) put('Q_TRANSITION_MS', Math.round(R.trans.t * 1000), 'ms, from the transition estimate');
      if (p.vtol.kind === 'tailsitter') put('Q_TAILSIT_ENABLE', 1, '');
      if (p.vtol.kind === 'tiltrotor') put('Q_TILT_ENABLE', 1, '');
    }
    return out;
  }
  function findMsg(log, base) {
    if (log.msgs[base]) return log.msgs[base];
    const k = Object.keys(log.msgs).find((n) => n.startsWith(base + '['));
    return k ? log.msgs[k] : null;
  }

  // loop instead of Math.max(...col): a long log has more samples than the call stack allows as arguments
  const colMax = (a) => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };
  const colMin = (a) => { let m = Infinity; for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; };

  function logSummary(log) {
    const s = {};
    const any = Object.values(log.msgs).filter((m) => m.count)[0];
    let t0 = Infinity, t1 = -Infinity;
    for (const m of Object.values(log.msgs)) {
      if (!m.cols.includes('TimeUS') && !m.cols.includes('TimeMS') && !m.cols.includes('time')) continue;
      const t = m.time();
      if (t.length) { t0 = Math.min(t0, t[0]); t1 = Math.max(t1, t[t.length - 1]); }
    }
    s.duration = isFinite(t1 - t0) ? t1 - t0 : any ? any.count : 0;
    const bat = findMsg(log, 'BAT') || findMsg(log, 'CURR');
    if (bat) {
      const v = bat.col(bat.cols.includes('Volt') ? 'Volt' : 'V');
      const c = bat.col(bat.cols.includes('Curr') ? 'Curr' : 'I');
      const vf = Array.from(v).filter((x) => x > 1);
      s.vStart = vf[0]; s.vMin = colMin(vf);
      s.iMax = colMax(c);
      if (bat.cols.includes('CurrTot')) { const ct = bat.col('CurrTot'); s.mAh = ct[ct.length - 1]; }
      let pw = 0, nArmed = 0;
      for (let k = 0; k < v.length; k++) if (c[k] > 1) { pw += v[k] * c[k]; nArmed++; }
      s.avgP = nArmed ? pw / nArmed : null;
      if (bat.cols.includes('EnrgTot')) { const e = bat.col('EnrgTot'); s.wh = e[e.length - 1]; }
    }
    const ctun = log.msgs.CTUN;
    if (ctun && ctun.cols.includes('Alt')) s.altMax = colMax(ctun.col('Alt'));
    const gps = findMsg(log, 'GPS');
    if (gps) {
      if (gps.cols.includes('Spd')) s.spdMax = colMax(gps.col('Spd'));
      if (gps.cols.includes('NSats')) s.satsMin = colMin(Array.from(gps.col('NSats')).filter((x) => x > 0));
    }
    const vibe = findMsg(log, 'VIBE');
    if (vibe && vibe.cols.includes('VibeZ')) s.vibeMax = Math.max(...['VibeX', 'VibeY', 'VibeZ'].map((c) => colMax(vibe.col(c))));
    return s;
  }

  function gpsTrack(log) {
    const g = findMsg(log, 'GPS') || findMsg(log, 'POS');
    if (!g) return null;
    const latC = g.cols.includes('Lat') ? 'Lat' : null, lngC = g.cols.includes('Lng') ? 'Lng' : g.cols.includes('Lon') ? 'Lon' : null;
    if (!latC || !lngC) return null;
    const la = g.col(latC), lo = g.col(lngC);
    const scale = Math.abs(la[Math.floor(la.length / 2)]) > 1000 ? 1e-7 : 1; // CSV/text may carry raw 1e7 ints
    const alt = g.cols.includes('Alt') ? g.col('Alt') : null;
    const pts = [];
    for (let k = 0; k < la.length; k++) if (la[k] && lo[k]) pts.push([la[k] * scale, lo[k] * scale, alt ? alt[k] : 0]);
    return pts.length > 1 ? pts : null;
  }

  // ---------- log viewer helpers ----------
  // ArduPilot ERR subsystems and EV ids (common ones; others show their number)
  const ERR_SUBSYS = { 1: 'Main', 2: 'Radio', 3: 'Compass', 4: 'Optical flow', 5: 'Radio failsafe', 6: 'Battery failsafe', 7: 'GPS failsafe', 8: 'GCS failsafe', 9: 'Fence failsafe', 10: 'Flight mode', 11: 'GPS', 12: 'Crash check', 13: 'Flip', 14: 'Autotune', 15: 'Parachute', 16: 'EKF check', 17: 'EKF failsafe', 18: 'Barometer', 19: 'CPU', 20: 'ADSB failsafe', 21: 'Terrain', 22: 'Navigation', 23: 'Terrain failsafe', 24: 'EKF primary', 25: 'Thrust loss', 26: 'Sensor failsafe', 27: 'Leak failsafe', 28: 'Pilot input', 29: 'Vibration failsafe' };
  const EV_IDS = { 10: 'Armed', 11: 'Disarmed', 15: 'Auto-armed', 17: 'Land complete (maybe)', 18: 'Land complete', 25: 'Home set', 28: 'Not landed' };

  // nearest earlier sample (sample-and-hold), binary search
  function idxAt(t, x) {
    let lo = 0, hi = t.length - 1;
    if (!t.length || x < t[0]) return -1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= x) lo = m; else hi = m - 1; }
    return lo;
  }

  function logEvents(log) {
    const out = [];
    for (const m of logModes(log)) out.push({ t: m.t, kind: 'mode', text: `Mode → ${m.name}` });
    const add = (name, fn) => { const m = log.msgs[name]; if (!m) return; const t = m.time(); for (let k = 0; k < t.length; k++) { const e = fn(m, k); if (e) out.push(Object.assign({ t: t[k] }, e)); } };
    add('MSG', (m, k) => ({ kind: 'msg', text: String(m.col('Message')[k]) }));
    add('ERR', (m, k) => { const s = m.col('Subsys')[k], c = m.col('ECode')[k]; return { kind: 'err', text: `${ERR_SUBSYS[s] || `Subsystem ${s}`}: ${c ? `error code ${c}` : 'cleared'}`, ok: !c }; });
    add('EV', (m, k) => { const id = m.col('Id')[k]; return { kind: 'ev', text: EV_IDS[id] || `Event ${id}` }; });
    return out.sort((a, b) => a.t - b.t);
  }

  // last value of every parameter (PARM Name/Value), with how many times it changed during the log
  function logParams(log) {
    const m = log.msgs.PARM;
    if (!m) return [];
    const nm = m.col('Name'), v = m.col('Value'), t = m.time(), map = new Map();
    for (let k = 0; k < nm.length; k++) {
      const e = map.get(nm[k]);
      if (!e) map.set(nm[k], { name: nm[k], value: v[k], t: t[k], changes: 0 });
      else { if (e.value !== v[k]) e.changes++; e.value = v[k]; e.t = t[k]; }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // flight path in local meters (east, north, up) from the first fix
  function logTrack(log) {
    const g = findMsg(log, 'POS') && findMsg(log, 'POS').cols.includes('Lat') ? findMsg(log, 'POS') : findMsg(log, 'GPS');
    if (!g || !g.cols.includes('Lat')) return null;
    const lngC = g.cols.includes('Lng') ? 'Lng' : g.cols.includes('Lon') ? 'Lon' : null;
    if (!lngC) return null;
    const la = g.col('Lat'), lo = g.col(lngC), al = g.cols.includes('Alt') ? g.col('Alt') : null, tt = g.time();
    const sc = Math.abs(la[Math.floor(la.length / 2)]) > 1000 ? 1e-7 : 1;
    const t = [], lat = [], lng = [], e = [], n = [], u = [];
    let lat0 = null, lng0 = 0, alt0 = 0, kx = 0;
    for (let k = 0; k < la.length; k++) {
      if (!la[k] || !lo[k]) continue;
      const y = la[k] * sc, x = lo[k] * sc, z = al ? al[k] : 0;
      if (lat0 == null) { lat0 = y; lng0 = x; alt0 = z; kx = Math.cos((y * Math.PI) / 180) * 111320; }
      t.push(tt[k]); lat.push(y); lng.push(x); e.push((x - lng0) * kx); n.push((y - lat0) * 110540); u.push(z - alt0);
    }
    return t.length > 1 ? { src: g.name, t, lat, lng, e, n, u } : null;
  }

  // safe expression over log fields, e.g. "ATT.DesRoll - ATT.Roll" or "BAT.Volt * BAT.Curr".
  // Only field references, numbers, + - * / ^ ( ) , and a fixed list of math functions are accepted.
  const EXPR_FN = { abs: 'Math.abs', sqrt: 'Math.sqrt', sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', atan2: 'Math.atan2', min: 'Math.min', max: 'Math.max', pow: 'Math.pow', log: 'Math.log', exp: 'Math.exp', hypot: 'Math.hypot', deg: '(180/Math.PI)*', rad: '(Math.PI/180)*' };
  function evalExpr(log, src) {
    const rx = /\s*(?:([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?\.[A-Za-z_][A-Za-z0-9_]*)|(\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)|([A-Za-z_]+)|([-+*/^(),]))/y;
    const refs = [], parts = [];
    let pos = 0;
    while (pos < src.length) {
      rx.lastIndex = pos;
      const m = rx.exec(src);
      if (!m || m[0] === '') { if (/^\s*$/.test(src.slice(pos))) break; throw new Error(`Unexpected “${src.slice(pos).trim().slice(0, 12)}”`); }
      pos = rx.lastIndex;
      if (m[1]) {
        const dot = m[1].lastIndexOf('.'), msg = findMsg(log, m[1].slice(0, dot)), f = m[1].slice(dot + 1);
        if (!msg || !msg.cols.includes(f)) throw new Error(`No field ${m[1]} in this log`);
        let i = refs.findIndex((r) => r.msg === msg && r.f === f);
        if (i < 0) { refs.push({ msg, f }); i = refs.length - 1; }
        parts.push(`v[${i}]`);
      } else if (m[2]) parts.push(m[2]);
      else if (m[3]) { if (!EXPR_FN[m[3].toLowerCase()]) throw new Error(`Unknown function ${m[3]}`); parts.push(EXPR_FN[m[3].toLowerCase()]); }
      else parts.push(m[4] === '^' ? '**' : m[4]);
    }
    if (!refs.length) throw new Error('Use at least one field, like ATT.Roll');
    const fn = new Function('v', `return (${parts.join(' ')});`);
    const t = refs[0].msg.time(), cols = refs.map((r) => ({ t: r.msg.time(), y: r.msg.col(r.f) }));
    const y = new Float64Array(t.length), v = new Array(refs.length);
    for (let k = 0; k < t.length; k++) {
      for (let j = 0; j < cols.length; j++) { const c = cols[j], ix = j === 0 ? k : idxAt(c.t, t[k]); v[j] = ix < 0 ? NaN : c.y[ix]; }
      y[k] = fn(v);
    }
    return { t, y };
  }

  // synthetic quad flight so the viewer is not empty before a real log is dropped in
  function sampleLog() {
    const N = 2700, dt = 0.2; // 9 min @ 5 Hz
    const t = [], volt = [], curr = [], ctot = [], alt = [], dalt = [], roll = [], droll = [], pitch = [], dpitch = [], yaw = [], dyaw = [], lat = [], lng = [], galt = [], spd = [], sats = [], hdop = [], vx = [], vy = [], vz = [], c1 = [], c2 = [], c3 = [], c4 = [], tho = [];
    let mah = 0, x = 0, y = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let k = 0; k < N; k++) {
      const s = k * dt;
      const climb = s < 20 ? s / 20 : s > 500 ? Math.max(0, (530 - s) / 30) : 1;
      const da = 40 * climb;
      const fwd = s > 60 && s < 470 ? Math.min(1, (s - 60) / 15) * Math.min(1, (470 - s) / 15) : 0;
      const sp = 9 * fwd;
      const armed = s < 532;
      const I = armed ? (s < 3 ? 2 : 15.8 + 3.2 * fwd + 1.6 * Math.sin(s / 7) + rnd() * 1.2) : 0.6;
      mah += (I * dt * 1000) / 3600;
      const V = 50.4 - 0.0009 * mah - I * 0.045 + rnd() * 0.05;
      const hdg = s / 60;
      x += Math.cos(hdg) * sp * dt; y += Math.sin(hdg) * sp * dt;
      t.push(s * 1e6); volt.push(V); curr.push(I); ctot.push(mah);
      dalt.push(da); alt.push(da + rnd() * 0.6);
      const dr = 12 * fwd * Math.sin(hdg * 3) + rnd() * 0.5, dp = -8 * fwd;
      droll.push(dr); roll.push(dr + rnd() * 1.6); dpitch.push(dp); pitch.push(dp + rnd() * 1.4);
      const yw = ((((hdg * 180) / Math.PI + 90) % 360) + 360) % 360;
      dyaw.push(yw); yaw.push(yw + rnd() * 2); galt.push(312 + da + rnd() * 0.8); hdop.push(0.7 + Math.abs(rnd()) * 0.2); tho.push(armed ? 0.38 + 0.08 * climb + 0.05 * fwd + rnd() * 0.02 : 0);
      lat.push(33.7756 + y / 111320); lng.push(-84.3963 + x / (111320 * Math.cos((33.7756 * Math.PI) / 180)));
      spd.push(sp + Math.abs(rnd())); sats.push(armed ? 16 + Math.round(rnd() * 3) : 14);
      vx.push(Math.abs(8 + rnd() * 6)); vy.push(Math.abs(9 + rnd() * 6)); vz.push(Math.abs(14 + rnd() * 8));
      const base = armed ? 1430 + 120 * climb + 60 * fwd : 1000;
      c1.push(base + rnd() * 40); c2.push(base + rnd() * 40); c3.push(base + rnd() * 40); c4.push(base + rnd() * 40);
    }
    const tbl = (name, obj) => makeMsg(name, Object.keys(obj), (c) => obj[c], obj.TimeUS.length);
    const msgs = {
      'BAT[0]': tbl('BAT[0]', { TimeUS: t, Volt: volt, Curr: curr, CurrTot: ctot }),
      CTUN: tbl('CTUN', { TimeUS: t, Alt: alt, DAlt: dalt, ThO: tho }),
      ATT: tbl('ATT', { TimeUS: t, Roll: roll, DesRoll: droll, Pitch: pitch, DesPitch: dpitch, Yaw: yaw, DesYaw: dyaw }),
      'GPS[0]': tbl('GPS[0]', { TimeUS: t, Lat: lat, Lng: lng, Alt: galt, Spd: spd, NSats: sats, HDop: hdop }),
      'VIBE[0]': tbl('VIBE[0]', { TimeUS: t, VibeX: vx, VibeY: vy, VibeZ: vz }),
      RCOU: tbl('RCOU', { TimeUS: t, C1: c1, C2: c2, C3: c3, C4: c4 }),
      MODE: tbl('MODE', { TimeUS: [2e6, 20e6, 60e6, 470e6, 500e6], Mode: [2, 16, 3, 6, 9], ModeNum: [2, 16, 3, 6, 9] }),
      EV: tbl('EV', { TimeUS: [1e6, 532e6], Id: [10, 11] }),
      ERR: tbl('ERR', { TimeUS: [300e6, 304e6], Subsys: [16, 16], ECode: [2, 0] }),
      PARM: makeMsg('PARM', ['TimeUS', 'Name', 'Value'], (c) => ({ TimeUS: [0, 0, 0, 0, 0, 0, 200e6], Name: ['ATC_ANG_RLL_P', 'ATC_ANG_PIT_P', 'BATT_CAPACITY', 'FRAME_CLASS', 'INS_GYRO_FILTER', 'WPNAV_SPEED', 'WPNAV_SPEED'], Value: [4.5, 4.5, 7000, 1, 20, 500, 900] })[c], 7),
      MSG: makeMsg('MSG', ['TimeUS', 'Message'], (c) => (c === 'TimeUS' ? [0, 1e6, 60e6, 532e6] : ['ArduCopter V4.5.7 (synthetic sample)', 'Arming motors', 'Mission: 1 WP', 'Disarming motors']), 4),
    };
    return { msgs, source: 'Synthetic sample', sample: true };
  }

  G.UAS = {
    g0, RHO0, CELL, LAYOUTS, BANDS, POL, MATERIALS, RAIL_V, COAX_THRUST,
    rhoAt, battery, packOf, curve, dragBuildup, oswald, FINISH, CONSERVATIVE, DEFAULT_K, motorCanMm, combo, parseAPC, parsePropTable, propCoef, drive, drivePower, sizeOf, splitSets, propulsion, payloadSweep, fullBom, consolidate, costOf, cgOf, missionPlan, SEG, enduranceOf, fwDrag, mrForward, massOf, autoRows, avionicsPower, compute, batterySweep,
    powerPlan, pickWire, pickConn, escOf, pageSpecs, AIRMAX, RADIOS, ANTENNAS, polLoss, CONNECTORS, WIRE, link, fspl, radioHorizonKm, rfConflicts,
    rankMaterials, partMass, partShell, parseSTL, stlStats,
    parseBin, parseText, parseCSV, logModes, logSummary, logFirmware, logHealth, apParams, modeCruise, VTOL_DEF, missionFromLog, coldFactor, gpsTrack, sampleLog, findMsg, interp, logEvents, logParams, logTrack, evalExpr, idxAt, ERR_SUBSYS, EV_IDS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
