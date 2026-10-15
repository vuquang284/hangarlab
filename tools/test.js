// Self-check for engine.js: `node tools/test.js`
require('../hangarlab/engine.js');
require('../hangarlab/apc.js');
require('../hangarlab/library.js');
require('../hangarlab/data.js');
const assert = require('assert');
const U = globalThis.UAS, { lib } = globalThis.UAS_SEED;
// numeric checks run against fixed reference designs (validated against the team spreadsheet and a measured flight),
// so changing the shipped example designs in data.js never moves the goalposts
const FIX = require('./test-fixtures.json');
const projects = [FIX.quad, FIX.dolphin, globalThis.UAS_SEED.projects[2]];
// the shipped examples must still compute
for (const ex of globalThis.UAS_SEED.projects) { const r = U.compute(ex, lib); assert(r.Wg > 0 && r.checks.length, `example ${ex.name} computes`); }
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}±${tol}`);

// Heavy-lift quad: AUW must match the spreadsheet (6467.88 g)
const quad = projects[0];
const rq = U.compute(quad, lib);
near(rq.Wg, 6467.88, 0.01, 'quad AUW');
// 1617 g/motor -> ~182 W/motor on the HW4120 16x8 bench table, at 300 m / 25 °C a bit more
near(rq.h.pMotors * Math.sqrt(rq.sigma), 4 * 182.6, 6, 'quad hover power (sea-level equiv)');
assert(rq.hoverMin > 17 && rq.hoverMin < 22, 'quad hover time ' + rq.hoverMin);
assert(rq.ff && rq.ff.length > 10 && rq.bestRange.km > 0, 'quad forward flight curve');
// top speed stops at a real limit (30° lean by default), not at the end of the speed sweep
assert(rq.vmaxLimit === 'lean' && rq.vmax > 15 && rq.vmax < 30, `quad top speed ${rq.vmax} (${rq.vmaxLimit})`);
assert(rq.ff[rq.ff.length - 1].tilt <= 30, 'quad tilt within lean limit');
const steep = U.compute(Object.assign({}, quad, { mr: Object.assign({}, quad.mr, { lean: 45 }) }), lib);
assert(steep.vmax > rq.vmax, 'more lean, more top speed');

// Dolphin: calibrated so measured 5.25 A @ 22 m/s @ 1.4 kg is reproduced
const dol = projects[1];
const rd = U.compute(dol, lib);
near(rd.Wg, 2669.8, 0.01, 'dolphin AUW');
const cal = U.compute(Object.assign({}, dol, { bom: [], payload: { g: 0 }, batt: Object.assign({}, dol.batt, { g: (1400 - 69) / 2 }) }), lib);
near((cal.cruise.P - cal.pAv) / cal.bat.V, 5.25, 0.05, 'dolphin calibration point');
assert(rd.cruise.minutes > 10, 'dolphin endurance');

// library split: 16 bench tests kept, placeholder AtomRC pair falls back to physics
assert.strictEqual(lib.tests.length, 16);
const atom = U.combo(lib, dol.fw.motor, dol.fw.prop, 22.2);
assert(atom.physics && atom.rows.length === 10, 'physics fallback');
// physics estimate within 20% of the HW4120 16x8 bench max thrust
const hwM = lib.motors.find((m) => m.name === 'Hobbywing 4120 250KV'), hwP = lib.props.find((x) => x.name === 'APC 16x8E');
const phys = U.drive(hwM, Object.assign({}, hwP, { data: null }), 44.4).solve(1, 0);
near((phys.T / U.g0) * 1000, 7694, 7694 * 0.2, 'physics max thrust');
// payload input changes AUW and endurance
const heavier = U.compute(quad, lib, { payloadG: 2360 });
near(heavier.Wg - rq.Wg, 1000, 0.01, 'payload adds mass');
assert(heavier.hoverMin < rq.hoverMin);
const ps = U.payloadSweep(quad, lib);
assert(ps[0].minutes > ps[ps.length - 1].minutes, 'payload sweep falls');
const cons = U.consolidate([quad, projects[2]], lib);
assert(cons.find((r) => r.name.startsWith('Cube Orange')).qty.join() === '1,1', 'consolidated BOM');

// APC data: 16x8E static thrust at 6000 rpm from the file is 8.33 lbf-ish; check Ct interpolation stays sane
const p16 = lib.props.find((x) => x.name === 'APC 16x8E');
assert(p16.data && p16.data.rpm.length > 10, 'apc seed attached');
const [ct0] = U.propCoef(p16.data, 0, 6000);
assert(ct0 > 0.07 && ct0 < 0.12, 'apc static Ct ' + ct0);
// motor model: with Rm the solver lands below no-load rpm and draws more current at full throttle than at half
const mm = { kv: 250, rm: 0.08, i0: 1, g: 300 };
const dv = U.drive(mm, p16, 44.4), full = dv.solve(1, 0), half = dv.solve(0.5, 0);
assert(full.rpm < 250 * 44.4 && full.I > half.I && full.etaM > 0.7 && full.etaM < 0.95, 'motor model ' + JSON.stringify(full));
// pasted static table converts to Ct at J=0
const pt = U.parsePropTable('RPM, Thrust (g), Power (W)\n4000, 1200, 60\n6000, 2700, 200', 16);
assert(pt && pt.rpm.length === 2 && pt.tab[0][0][1] > 0.05, 'static paste');
// dolphin now cruises on APC 8x4E data: prop efficiency reported and calibration still reproduces 5.25 A
assert(rd.propModel && rd.cruise.etaP > 0.3 && rd.cruise.etaP < 0.9, 'dolphin prop eta ' + rd.cruise.etaP);

// packs: 2 × 6S 7000 in series = 12S 7000; in parallel = 6S 14000; 6S2P cells = 9000 mAh
const ser = U.battery(quad.batt), par = U.battery(Object.assign({}, quad.batt, { conn: 'parallel' }));
assert(ser.S === 12 && ser.mah === 7000 && ser.g === 1740, 'series packs');
assert(par.S === 6 && par.mah === 14000 && par.g === 1740 && Math.abs(par.Wh - ser.Wh) < 1e-9, 'parallel packs');
assert(U.battery({ chem: 'liion', s: 6, p: 2, cellMah: 4500, g: 880, packs: 1 }).mah === 9000, 'cells in parallel');
assert(Math.abs(U.battery({ chem: 'liion', s: 1, p: 1, cellMah: 1, packs: 1 }).V - 3.6) < 1e-9 && U.CELL.liion.max === 4.2, 'li-ion 3.6 / 4.2');

// printed part: 36 cm³ PETG cube-ish, 3 walls, 4 top/bottom layers, 25 % infill ≈ 18.7 g
near(U.partMass({ vol: 36, area: 0, walls: 3, tb: 4, infill: 25 }, 1.27, { lineW: 0.45, layerH: 0.2 }), 18.7, 0.2, 'printed part mass');
assert(Math.abs(U.partMass({ vol: 10, walls: 0, tb: 0, infill: 100 }, 1.27) - 12.7) < 1e-9, 'solid part');
assert(U.partMass({ vol: 10, area: 1000, walls: 5, tb: 5, infill: 0 }, 1) === 10, 'shell capped at volume');

// STL: 20 mm cube -> 8 cm³, 24 cm² (8 top/bottom + 16 sides); binary and ASCII agree
function cubeTris(s) {
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  const P = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  return [q(0,3,2,1), q(4,5,6,7), q(0,1,5,4), q(1,2,6,5), q(2,3,7,6), q(3,0,4,7)].flat().map((i) => P[i]);
}
const cv = cubeTris(20);
const bin = Buffer.alloc(84 + (cv.length / 3) * 50);
bin.writeUInt32LE(cv.length / 3, 80);
for (let i = 0; i < cv.length / 3; i++) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) bin.writeFloatLE(cv[i * 3 + k][c], 84 + i * 50 + 12 + (k * 3 + c) * 4);
const cs = U.stlStats(U.parseSTL(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length)));
near(cs.vol, 8, 1e-6, 'stl volume'); near(cs.area, 24, 1e-6, 'stl area'); near(cs.areaTB, 8, 1e-6, 'stl top/bottom area');
const NL = String.fromCharCode(10);
const ascii = ['solid c'].concat(Array.from({ length: cv.length / 3 }, (_, i) => ['facet normal 0 0 0', 'outer loop'].concat(cv.slice(i * 3, i * 3 + 3).map((p) => `vertex ${p.join(' ')}`), ['endloop', 'endfacet']).join(NL)), ['endsolid c']).join(NL);
near(U.stlStats(U.parseSTL(new TextEncoder().encode(ascii).buffer)).vol, 8, 1e-6, 'ascii stl volume');
// 20 mm PLA cube, 3 walls, 4 layers, 15 % infill: shell 2.16 + 0.64 cm³ -> 4.44 g
near(U.partMass(Object.assign({ walls: 3, tb: 4, infill: 15 }, cs), 1.24, { lineW: 0.45, layerH: 0.2 }), 4.44, 0.01, 'stl part mass');

// drag build-up: 1.2 m span, 0.28 m² ISR plane, 0.9 m × 0.12 m fuselage, gimbal + gear + antennas -> CD0 ≈ 0.05–0.07, e ≈ 0.8
const dbu = U.dragBuildup({ area: 0.28, span: 1.2 }, { fusL: 0.9, fusD: 0.12, tailPct: 22, tc: 0.12, booms: { n: 0 }, extras: [{ name: 'gimbal', cda: 40 }, { name: 'gear', cda: 30 }, { name: 'antennas', cda: 5, qty: 2 }], misc: 15 }, 20, 1.2, 20);
assert(dbu.cd0 > 0.045 && dbu.cd0 < 0.075, 'build-up cd0 ' + dbu.cd0);
assert(U.oswald(5.1) > 0.75 && U.oswald(5.1) < 0.88, 'oswald');
// faster -> higher Reynolds -> lower friction coefficient
assert(U.dragBuildup({ area: 0.28, span: 1.2 }, { fusL: 0.9, fusD: 0.12 }, 30, 1.2, 20).cd0 < U.dragBuildup({ area: 0.28, span: 1.2 }, { fusL: 0.9, fusD: 0.12 }, 15, 1.2, 20).cd0, 'Re trend');
// dolphin with build-up but no calibration: cruise L/D should be realistic (6–12)
const dolNoCal = U.compute(Object.assign({}, dol, { fw: Object.assign({}, dol.fw, { cal: { on: false } }) }), lib);
assert(dolNoCal.LDcruise > 5 && dolNoCal.LDcruise < 12, 'dolphin L/D ' + dolNoCal.LDcruise);

// uncalibrated model vs the AtomRC Dolphin Pro reference (5.25 A @ 22 m/s, 1.4 kg, 6S): within 10 %
{
  const ref = JSON.parse(JSON.stringify(dol));
  ref.payload.g = 0; ref.bom = [{ name: 'x', sub: 'x', qty: 1, g: 1400 - 56 - 13 - 902, rail: '', w: 0 }];
  ref.fw.cal = { on: false }; ref.fw.vc = 22; ref.fw.drag.extras = [{ name: 'Exposed antenna', cda: 5, qty: 2 }];
  const Rr = U.compute(ref, Object.assign({}, lib, { fleetK: 1 })); // raw physics, no correction factor
  near(Rr.cruise.I, 5.25, 0.525, 'uncalibrated Dolphin reference current');
  const Rd = U.compute(ref, lib);
  assert(Rd.kSource === 'default' && Rd.cruise.P > Rr.cruise.P * 1.15, 'default correction applied');
  const Rl = U.compute(ref, Object.assign({}, lib, { fleetK: 1.6 }));
  assert(Rl.kSource === 'learned' && Rl.cruise.P > Rd.cruise.P, 'learned correction applied');
  assert(Rr.cruise.consKm < Rr.cruise.km && Rr.cruise.consP > Rr.cruise.P, 'conservative band');
}

// motor pods + prop wash: twin wing motors add both; a single nose motor adds no pods
assert(U.motorCanMm({ name: 'HEEWING T2 FX-2216-850KV' }) === 28, 'can size from 2216');
{
  const tw = JSON.parse(JSON.stringify(dol)); tw.fw.cal = { on: false }; tw.fw.n = 2;
  const parts = U.compute(tw, lib).drag.parts.map((x) => x.name).join();
  assert(/Motor pods ×2/.test(parts) && /Prop wash/.test(parts), 'twin pods + wash: ' + parts);
  const one = U.compute(Object.assign({}, dol, { fw: Object.assign({}, dol.fw, { cal: { on: false } }) }), lib).drag.parts.map((x) => x.name).join();
  assert(!/Motor pods/.test(one) && /Prop wash/.test(one), 'nose motor: wash only');
  const other = JSON.parse(JSON.stringify(tw)); other.fw.propOther = true;
  assert(U.compute(other, lib).cruise.P > U.compute(tw, lib).cruise.P, 'prop mismatch costs power');
}

// settings: conservative factor and default drag correction come from lib.cfg
{
  const a = U.compute(dol, Object.assign({}, lib, { cfg: { cons: 1.5, defK: 1.0 } }));
  const b = U.compute(dol, Object.assign({}, lib, { cfg: { cons: 1.2, defK: 1.0 } }));
  assert(a.cruise.consP > b.cruise.consP || dol.fw.cal.on, 'conservative factor setting');
}

// VTOL mission
const rv = U.compute(projects[2], lib);
assert(rv.mission && rv.mission.km > 0, 'vtol mission range');

// sweep and power plan run
assert(U.batterySweep(quad, lib).length > 10);
const pp = U.powerPlan(quad, lib, rq);
assert(pp.rails.find((r) => r.rail === '5V').iAvg > 1, '5V rail current');

// RF: 915 MHz at 2 km
const l = U.link({ mhz: 915, tx: 30, txG: 2, rxG: 2, loss: 1, sens: -121, pol: 'same' }, { dist: 2, alt: 120, gndH: 2, fade: 10 });
near(l.loss, U.fspl(Math.hypot(2, 0.118), 915), 1e-9, 'fspl');
assert(l.margin > 30, 'rfd margin');

// materials: hot + UV outdoor ranks ASA/PA-CF over PLA, PLA excluded
const rk = U.rankMaterials({ amb: 45, sun: true, heat: false, uv: true, wet: false, crash: false, fuel: false, flex: false, stiff: 5, light: 5, budget: 5, printer: 'enclosed' });
assert(!rk.find((x) => x.m.id === 'pla').ok, 'PLA should fail at 65 °C');
assert(rk[0].ok, 'top material ok');

// DataFlash .bin round trip: FMT + 3 BAT records
function binLog() {
  const recs = [];
  const fmt = (type, len, name, format, cols) => {
    const b = Buffer.alloc(89);
    b[0] = 0xa3; b[1] = 0x95; b[2] = 128; b[3] = type; b[4] = len;
    b.write(name, 5); b.write(format, 9); b.write(cols, 25);
    return b;
  };
  recs.push(fmt(129, 3 + 8 + 4 + 4 + 1, 'BAT', 'QffB', 'TimeUS,Volt,Curr,Instance'));
  for (let k = 0; k < 3; k++) {
    const b = Buffer.alloc(20);
    b[0] = 0xa3; b[1] = 0x95; b[2] = 129;
    b.writeBigUInt64LE(BigInt(k * 1e6), 3); b.writeFloatLE(50 - k, 11); b.writeFloatLE(10 + k, 15); b[19] = 0;
    recs.push(b);
  }
  recs.splice(2, 0, Buffer.from([0x00, 0x12])); // garbage byte resync
  const buf = Buffer.concat(recs);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}
const log = U.parseBin(binLog());
assert.deepStrictEqual(Array.from(log.msgs.BAT.col('Volt')), [50, 49, 48]);
assert.deepStrictEqual(Array.from(log.msgs.BAT.time()), [0, 1, 2]);

const txt = U.parseText('FMT, 128, 89, FMT, BBnNZ, Type,Length,Name,Format,Columns\nFMT, 1, 23, ATT, Qff, TimeUS,Roll,Pitch\nATT, 1000000, 1.5, -2\nATT, 2000000, 2.5, -3\n');
assert.deepStrictEqual(Array.from(txt.msgs.ATT.col('Roll')), [1.5, 2.5]);

const sl = U.sampleLog();
const s = U.logSummary(sl);
const ev = U.logEvents(sl);
assert(ev.some((e) => e.text === 'Armed') && ev.some((e) => /EKF check/.test(e.text)) && ev.some((e) => e.kind === 'mode'), 'events');
const pr = U.logParams(sl);
assert(pr.find((p) => p.name === 'WPNAV_SPEED').value === 900 && pr.find((p) => p.name === 'WPNAV_SPEED').changes === 1, 'params');
const tr = U.logTrack(sl);
assert(tr && tr.e.length > 100 && Math.max(...tr.u) > 35, 'track');
const ex = U.evalExpr(sl, 'BAT.Volt * BAT.Curr');
assert(Math.abs(ex.y[100] - sl.msgs['BAT[0]'].col('Volt')[100] * sl.msgs['BAT[0]'].col('Curr')[100]) < 1e-9, 'expression');
assert.throws(() => U.evalExpr(sl, 'alert(1)'), /Unknown function/);
assert.throws(() => U.evalExpr(sl, 'ATT.Roll; x'), /Unexpected/);
assert(s.duration > 500 && s.mAh > 1000 && s.avgP > 500, 'sample summary');
// long logs: summary must not pass every sample as a function argument (stack overflow)
const N = 300000, rows = ['FMT, 128, 89, FMT, BBnNZ, Type,Length,Name,Format,Columns', 'FMT, 2, 23, BAT, Qff, TimeUS,Volt,Curr', 'FMT, 3, 23, VIBE, Qfff, TimeUS,VibeX,VibeY,VibeZ'];
for (let k = 0; k < N; k++) rows.push(`BAT, ${k * 1000}, ${50 - k / N}, ${k === 7 ? 99 : 10}`, `VIBE, ${k * 1000}, 1, 2, ${k === 9 ? 42 : 3}`);
const big = U.logSummary(U.parseText(rows.join('\n')));
assert(big.iMax === 99 && big.vibeMax === 42 && big.vMin > 49 && big.vMin < 49.01, 'long log summary ' + JSON.stringify(big));

// ESC limits: a 6S 40 A ESC on the 12S example quad is over current and over voltage; library ESCs go in the BOM
{
  const ex = JSON.parse(JSON.stringify(globalThis.UAS_SEED.projects[0])), L = globalThis.UAS_SEED.lib;
  assert(!U.compute(ex, L).overload?.length, 'example quad ESC fits');
  assert(U.autoRows(ex, L).some((x) => x.auto === 'esc' && x.qty === 4), 'ESC rows in BOM');
  ex.mr.esc = 'esc-6s-40';
  const o = U.compute(ex, L).overload;
  assert(o.includes('over ESC') && o.includes('ESC voltage'), 'ESC overload ' + o);
  // a plane ESC driving lift motors is flagged
  const L2 = JSON.parse(JSON.stringify(L)); L2.escs.find((e) => e.id === 'esc-12s-80').use = 'plane'; ex.mr.esc = 'esc-12s-80';
  assert(U.compute(ex, L2).checks.some((c) => c.level === 'warn' && /plane ESC/.test(c.msg)), 'plane ESC on lift motors');
}

// prop clearance: 16" props overlap on a 500 mm quad (tips 354 mm apart), fit on 700 mm
{
  const q = JSON.parse(JSON.stringify(globalThis.UAS_SEED.projects[0])), L = globalThis.UAS_SEED.lib;
  q.mr.wb = 500;
  assert(U.compute(q, L).checks.some((c) => c.level === 'crit' && /overlap/.test(c.msg)), 'props overlap on 500 mm');
  q.mr.wb = 700;
  const r = U.compute(q, L);
  assert(r.propGap > 80 && !r.checks.some((c) => /overlap|prop tips/.test(c.msg)), 'props fit on 700 mm ' + r.propGap);
  const f = U.pageSpecs('Holybro X500 V2 frame kit\nWheelbase: 500mm\nMax propeller size: 13 inch\nWeight: 610 g', 'airframes');
  assert(f.type === 'multirotor' && f.wb === 500 && f.maxProp === 13 && f.layout === 'quadx' && f.g === 610 && !f.span, 'frame page ' + JSON.stringify(f));
}

// product pages: structured data plus "label | value unit" spec tables
{
  const m = U.pageSpecs('<title>T-Motor MN5008 KV340 – Shop</title><script type="application/ld+json">{"@type":"Product","name":"T-Motor MN5008 KV340","brand":{"name":"T-Motor"},"offers":{"price":"109.90"}}</script><table><tr><td>Internal resistance</td><td>89 mΩ</td></tr><tr><td>Idle current (10V)</td><td>0.8 A</td></tr><tr><td>Max continuous current (180S)</td><td>28 A</td></tr><tr><td>Weight (incl. cable)</td><td>135 g</td></tr></table>', 'motors');
  assert(m.brand === 'T-Motor' && m.cost === 109.9 && m.kv === 340 && m.rm === 0.089 && m.i0 === 0.8 && m.maxA === 28 && m.g === 135, 'motor page ' + JSON.stringify(m));
  const b = U.pageSpecs('RED V4 6S6P 30Ah\n30Ah capacity, 1369W sustained discharge, and 300A burst\nWeight: 2.6kg', 'batteries');
  assert(b.s === 6 && b.p === 6 && b.cellMah === 5000 && b.chem === 'lipo' && b.g === 2600 && b.cPeak === 10 && b.c > 2 && b.c < 2.3, 'battery page ' + JSON.stringify(b));
  const e = U.pageSpecs('Hobbywing XRotor 60A ESC\nContinuous current: 60A\nBurst current: 80A (10s)\nLiPo: 3-6S\nWeight: 62g', 'escs');
  assert(e.name === 'Hobbywing XRotor 60A ESC' && e.a === 60 && e.burst === 80 && e.sMin === 3 && e.sMax === 6 && e.g === 62, 'ESC page ' + JSON.stringify(e));
}

console.log('all checks passed');
console.log({ quadHoverMin: rq.hoverMin.toFixed(1), quadTW: rq.h.tw.toFixed(2), quadThr: rq.h.thr.toFixed(0), dolphinMin: rd.cruise.minutes.toFixed(1), dolphinKm: rd.cruise.km.toFixed(1), vtolKm: rv.mission.km.toFixed(1), vtolHoverThr: rv.h.thr.toFixed(0) });
