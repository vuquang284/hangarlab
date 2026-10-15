// Seed library and designs. Bench tables and weights come from
// "2025-26 Aircraft System Design Spreadsheet.xlsx" and "Airframe Selections.xlsx".
// rows: [throttle %, thrust g, current A]; v: bench voltage.
(function (G) {
  const sets = [
    { id: 'hw4120-1608', name: 'Hobbywing 4120 250KV · APC 16x8E', motor: 'Hobbywing 4120 250KV', kv: 250, motorG: 309, prop: 'APC 16x8E', diam: 16, pitch: 8, propG: 51.87, v: 44.4, cells: 12,
      rows: [[33, 1029, 2.3], [35, 1184, 2.6], [37, 1324, 3.0], [39, 1454, 3.5], [42, 1642, 4.2], [45, 1835, 5.0], [48, 2043, 5.9], [51, 2272, 7.0], [54, 2526, 8.3], [57, 2805, 9.7], [60, 3108, 11.3], [63, 3433, 13.1], [66, 3774, 15.0], [69, 4128, 17.2], [72, 4488, 19.5], [75, 4849, 22.2], [78, 5208, 25.2], [81, 5560, 28.4], [84, 5905, 32.0], [87, 6242, 35.8], [90, 6575, 39.9], [100, 7694, 55.3]] },
    { id: 'hw4120-1606', name: 'Hobbywing 4120 250KV · APC 16x6', motor: 'Hobbywing 4120 250KV', kv: 250, motorG: 309, prop: 'APC 16x6', diam: 16, pitch: 6, propG: 0, v: 44.4, cells: 12,
      rows: [[33, 834, 1.9], [35, 951, 2.2], [37, 1065, 2.5], [39, 1177, 2.8], [42, 1347, 3.3], [45, 1526, 3.9], [48, 1719, 4.6], [51, 1928, 5.4], [54, 2157, 6.3], [57, 2406, 7.3], [60, 2674, 8.5], [63, 2960, 9.8], [66, 3264, 11.3], [69, 3583, 12.9], [72, 3915, 14.7], [75, 4257, 16.6], [78, 4608, 18.8], [81, 4965, 21.1], [84, 5327, 23.6], [87, 5694, 26.3], [90, 6065, 29.2], [100, 7291, 40.3]] },
    { id: 'tm4120-1608', name: 'T-Motor AT4120 250KV · APC 16x8', motor: 'T-Motor AT4120 250KV', kv: 250, motorG: 304, prop: 'APC 16x8', diam: 16, pitch: 8, propG: 51.87, v: 44.2, cells: 12,
      rows: [[40, 1253, 3.25], [45, 1485, 3.99], [50, 1899, 5.53], [55, 2422, 7.96], [60, 2859, 10.12], [65, 3392, 12.62], [70, 3852, 15.97], [75, 4379, 19.57], [80, 5016, 24.05], [90, 5952, 32.7], [100, 6717, 45.73]] },
    { id: 'hw-x6plus', name: 'Hobbywing XRotor X6 Plus 150KV · 24x8', motor: 'XRotor X6 Plus 6218 150KV', kv: 150, motorG: 683, prop: 'HF 2480', diam: 24, pitch: 8, propG: 0, v: 46, cells: 12,
      rows: [[40, 2416, 4.6], [42, 2732, 5.5], [44, 3058, 6.4], [46, 3377, 7.4], [48, 3746, 8.7], [50, 4106, 9.9], [52, 4419, 11.2], [54, 4822, 12.5], [56, 5209, 14.1], [58, 5476, 15.6], [60, 5947, 17.3], [62, 6370, 19.1], [64, 6709, 20.7], [66, 7086, 22.6], [68, 7501, 24.9], [70, 7779, 26.6], [72, 8238, 28.8], [74, 8654, 31.0], [76, 9016, 32.7], [78, 9294, 35.1], [80, 9782, 37.6], [90, 10731, 43.6], [100, 11822, 51.8]] },
    { id: 'hw-h6m', name: 'Hobbywing XRotor H6M 6210 130KV · 22x7.4', motor: 'XRotor H6M 6210 130KV', kv: 130, motorG: 385, prop: 'VSC 22.1x7.4', diam: 22.1, pitch: 7.4, propG: 0, v: 48, cells: 12,
      rows: [[30, 805, 1.3], [33, 955, 1.6], [36, 1175, 2.0], [39, 1385, 2.4], [42, 1635, 3.0], [45, 1895, 3.7], [48, 2235, 4.7], [51, 2505, 5.6], [54, 2765, 6.4], [57, 3060, 7.5], [60, 3300, 8.3], [63, 3695, 9.8], [66, 3935, 10.7], [69, 4305, 12.2], [72, 4575, 13.4], [75, 4820, 14.4], [78, 5220, 16.3], [81, 5505, 17.6], [84, 5685, 18.5], [87, 6010, 20.1], [90, 6335, 21.8], [100, 6570, 23.0]] },
    { id: 'hw-6212', name: 'Hobbywing 6212 180KV · 22x7.4', motor: 'Hobbywing 6212 180KV', kv: 180, motorG: 292, prop: 'VSC 22.1x7.4', diam: 22.1, pitch: 7.4, propG: 0, v: 46, cells: 12,
      rows: [[33, 1845, 4.0], [35, 2089, 4.6], [37, 2334, 5.3], [39, 2579, 6.1], [42, 2949, 7.4], [45, 3322, 8.9], [48, 3701, 10.4], [51, 4089, 12.1], [54, 4489, 13.8], [57, 4905, 15.7], [60, 5338, 17.7], [63, 5791, 19.8], [66, 6265, 22.2], [69, 6759, 24.9], [72, 7272, 27.8], [75, 7799, 31.2], [78, 8333, 34.9], [81, 8866, 38.9], [84, 9385, 43.1], [87, 9875, 47.3], [90, 10318, 51.2], [100, 11114, 58.4]] },
    { id: 'hw-h8m', name: 'Hobbywing XRotor H8M 8106 85KV · 30x9.8', motor: 'XRotor H8M 8106 85KV', kv: 85, motorG: 458, prop: 'HF 30x9.8', diam: 30, pitch: 9.8, propG: 0, v: 48, cells: 12,
      rows: [[30, 975, 1.2], [33, 1180, 1.5], [36, 1470, 2.0], [39, 1715, 2.4], [42, 1945, 2.9], [45, 2315, 3.7], [48, 2595, 4.4], [51, 2995, 5.4], [54, 3265, 6.1], [57, 3510, 6.8], [60, 3865, 7.9], [63, 4275, 9.1], [66, 4505, 9.9], [69, 4865, 11.1], [72, 5270, 12.6], [75, 5470, 13.3], [78, 5895, 15.1], [81, 6195, 16.3], [84, 6405, 17.2], [87, 6685, 18.5], [90, 7025, 20.0], [100, 7520, 22.1]] },
    { id: 'xn350-1309', name: 'Xnova X-Class Lightning 350KV · HQ 13x9x3', motor: 'Xnova Lightning 350KV', kv: 350, motorG: 320, prop: 'HQ 13x9x3', diam: 13, pitch: 9, propG: 0, v: 50.25, cells: 12,
      rows: [[20, 610, 1.8], [30, 1185, 4.1], [40, 1855, 7.6], [50, 2700, 13.0], [60, 3700, 20.1], [70, 4790, 29.0], [80, 5730, 40.0], [90, 6850, 52.5], [100, 8000, 69.87]] },
    { id: 'xn350-1504', name: 'Xnova X-Class Lightning 350KV · APC 15x4', motor: 'Xnova Lightning 350KV', kv: 350, motorG: 320, prop: 'APC 15x4', diam: 15, pitch: 4, propG: 0, v: 50, cells: 12,
      rows: [[50, 2400, 8.6], [100, 8210, 53.0]] },
    { id: 'xing3616-hq11', name: 'iFlight Xing2 3616 760KV · HQ 11x4.5x3', motor: 'Xing2 3616 760KV', kv: 760, motorG: 166.3, prop: 'HQ 11x4.5x3', diam: 11, pitch: 4.5, propG: 0, v: 31.9, cells: 8,
      rows: [[50, 1940, 13.64], [60, 2645, 21.52], [70, 3481, 30.79], [80, 4360, 44.77], [90, 5155, 62.1], [100, 6054, 78.57]] },
    { id: 'xing3616-gf1050', name: 'iFlight Xing2 3616 760KV · GF 1050', motor: 'Xing2 3616 760KV', kv: 760, motorG: 166.3, prop: 'GF 1050', diam: 10, pitch: 5, propG: 0, v: 31.9, cells: 8,
      rows: [[50, 1835, 13.6], [60, 2495, 20.06], [70, 3250, 30.81], [80, 4020, 43.14], [90, 4712, 59.43], [100, 5348, 78.2]] },
    { id: 'xing2812-hq8', name: 'iFlight Xing 2812 1150KV · HQ 8x4.5x3', motor: 'Xing 2812 1150KV', kv: 1150, motorG: 77, prop: 'HQ 8x4.5x3', diam: 8, pitch: 4.5, propG: 0, v: 23.9, cells: 6,
      rows: [[50, 1237, 12.83], [60, 1681, 19.85], [70, 2127, 28.7], [80, 2571, 39.5], [90, 2954, 51.57], [100, 3232, 60.77]] },
    { id: 'xn3220-hq10', name: 'Xnova 3220 SK 700KV · HQ 10x5x3', motor: 'Xnova 3220 SK 700KV', kv: 700, motorG: 155, prop: 'HQ 10x5x3', diam: 10, pitch: 5, propG: 0, v: 29.6, cells: 8,
      rows: [[10, 165, 0.7], [20, 425, 2.1], [30, 766, 4.2], [40, 1222, 7.6], [50, 1825, 13.0], [60, 2530, 20.7], [70, 3225, 30.0], [80, 3920, 40.5], [90, 4650, 53.5], [100, 5160, 67.0]] },
    { id: 'xing3110-hq8', name: 'iFlight Xing2 3110 900KV · HQ 8x4x3', motor: 'Xing2 3110 900KV', kv: 900, motorG: 80, prop: 'HQ 8x4x3', diam: 8, pitch: 4, propG: 0, v: 33.3, cells: 8,
      rows: [[50, 1302.9, 9.05], [60, 1780, 13.72], [70, 2317.1, 21.68], [80, 2970.5, 30.4], [90, 3520.5, 41.91], [100, 4013.8, 52.79]] },
    { id: 'ss5208-c18', name: 'SunnySky V5208 340KV · EOLO C18', motor: 'SunnySky V5208 340KV', kv: 340, motorG: 175, prop: 'EOLO C18 18x6.2', diam: 18, pitch: 6.2, propG: 0, v: 25, cells: 6,
      rows: [[null, 500, 1.5], [null, 750, 2.5], [null, 1000, 3.7], [null, 1250, 5.1], [null, 1500, 6.6], [null, 1750, 8.2], [null, 2000, 10.0], [null, 2250, 11.8], [null, 2500, 13.85], [null, 2750, 16.1], [null, 3000, 18.4], [null, 3500, 23.5], [null, 3970, 28.1]] },
    { id: 'atom2807-8x4', name: 'AtomRC 2807 1100KV · APC 8x4E (placeholder)', motor: 'AtomRC 2807 1100KV', kv: 1100, motorG: 56, prop: 'APC 8x4E', diam: 8, pitch: 4, propG: 13, v: 22.2, cells: 6,
      rows: [], placeholder: true },
  ];

  // one entry = one pack: s cells in series × p in parallel, cellMah per cell, g per pack
  const batteries = [
    { id: 'tattu-6s7000', name: 'Tattu 6S 7000 25C', chem: 'lipo', s: 6, p: 1, cellMah: 7000, g: 870, c: 25, cPeak: 50 },
    { id: 'tattu-4s550', name: 'Tattu 4S 550 95C', chem: 'lipo', s: 4, p: 1, cellMah: 550, g: 60, c: 95, cPeak: 190 },
    { id: 'ba-6iu82vu', name: 'Upgrade Energy GREEN V2 6S1P 4Ah AMPRIUS SA10', chem: 'liion', s: 6, p: 1, cellMah: 4000, g: 305, c: 1.5, cPeak: 4, link: 'https://www.upgradeenergytech.com/' },
  ];


  // rail: VBAT | 3.3V | 5V | 9V | 12V | 24V | Separate | '' ; w = average W, pw = peak W; rf: band key
  const parts = [
    { id: 'cube-orange-mini', name: 'Cube Orange+ Mini', sub: 'Avionics', g: 53, rail: '5V', w: 2.5, pw: 3, rf: '', link: 'https://irlock.com/products/the-cube-orange-mini-set' },
    { id: 'ctrl-zero-h7', name: 'Control Zero H7 OEM G + carrier', sub: 'Avionics', g: 9.6, rail: '5V', w: 10.5, pw: 12, rf: '' },
    { id: 'jetson-orin-nano', name: 'Jetson Orin Nano + Seeed A603', sub: 'Compute', g: 128, rail: '12V', w: 15, pw: 25, rf: '' },
    { id: 'elrs-rp4', name: 'ELRS RP4TD receiver', sub: 'Comms', g: 3.4, rail: '5V', w: 0.5, pw: 0.6, rf: '2400', link: 'https://www.radiomasterrc.com/products/rp4td-expresslrs-2-4ghz-diversity-receiver' },
    { id: 'ft-ez-id', name: 'FT EZ ID Remote ID', sub: 'Avionics', g: 10, rail: '5V', w: 0.2, pw: 0.5, rf: '2400' },
    { id: 'here4', name: 'Here4 GPS', sub: 'Sensors', g: 60, rail: '5V', w: 1, pw: 1.5, rf: '' },
    { id: '3dr-loc-one', name: '3DR Location One GPS + compass + baro', sub: 'Sensors', g: 20, rail: '5V', w: 1, pw: 1.2, rf: '' },
    { id: '3dr-airspeed', name: '3DR CAN airspeed (DLVR)', sub: 'Sensors', g: 12.2, rail: '5V', w: 0.5, pw: 0.6, rf: '' },
    { id: 'landmark', name: 'Landmark landing camera', sub: 'Sensors', g: 37, rail: '5V', w: 1.5, pw: 2, rf: '' },
    { id: 'rfd900x', name: 'RFD900x telemetry', sub: 'Comms', g: 18, rail: '5V', w: 5, pw: 5, rf: '915' },
    { id: 'siyi-a8', name: 'SIYI A8 mini gimbal camera', sub: 'Payload', g: 95, rail: '12V', w: 5, pw: 8, rf: '' },
    { id: 'bullet-ac', name: 'Ubiquiti Bullet AC', sub: 'Comms', g: 116, rail: '24V', w: 8, pw: 10, rf: '5800' },
    { id: 'matek-bec12s', name: 'Matek BEC12S-PRO', sub: 'Power', g: 5, rail: '', w: 0, rf: '' },
    { id: 'pdb-pm', name: 'PDB & power modules (est.)', sub: 'Power', g: 70, rail: '', w: 0, rf: '' },
    { id: 'lucid-esc', name: 'TBS Lucid 12S 90A ESC', sub: 'Propulsion', g: 20, rail: '', w: 0, rf: '' },
    { id: 'apw-em15', name: 'APW 15 mm electromagnet', sub: 'Payload', g: 25, rail: '12V', w: 2.5, pw: 2.5, rf: '' },
    { id: 'frame-arm', name: 'Frame arm', sub: 'Structures', g: 84, rail: '', w: 0, rf: '' },
    { id: 'frame-brace', name: 'Frame arm brace', sub: 'Structures', g: 40, rail: '', w: 0, rf: '' },
    { id: 'frame-mm', name: 'Frame motor mount', sub: 'Structures', g: 6, rail: '', w: 0, rf: '' },
    { id: 'frame-payload-mount', name: 'Host payload mount', sub: 'Structures', g: 49, rail: '', w: 0, rf: '' },
  ];

  const airframes = [
    { id: 'heewing-t2', name: 'HEEWING T2 Cruza', type: 'fixedwing', span: 1.2, area: 0, length: 0, g: 1200, notes: 'Wing area not listed', link: 'https://www.rcgroups.com/forums/showthread.php?4411511-Heewing-T2-Cruza/page7' },
    { id: 'zmo-v2', name: 'ZMO V2 VTOL', type: 'vtol', span: 1.2, area: 0, length: 0, g: 1000, notes: '' },
    { id: 'zohd-altus', name: 'ZOHD Altus VTOL', type: 'vtol', span: 0.98, area: 0, length: 0, g: 545, notes: '' },
    { id: 'reptile-dragon2', name: 'Reptile DRAGON V2', type: 'fixedwing', span: 1.2, area: 0, length: 0.7, g: 480, notes: '>90 mm internal length' },
    { id: 'heewing-t1', name: 'HEEWING T-1 Ranger', type: 'fixedwing', span: 0.73, area: 0, length: 0.645, g: 205, notes: '' },
    { id: 'dolphin-pro', name: 'AtomRC Dolphin Pro', type: 'fixedwing', span: 0.845, area: 0.1696, length: 0.826, g: 790, notes: '' },
    { id: 'dolphin-v11', name: 'AtomRC Dolphin V1.1', type: 'fixedwing', span: 0.845, area: 0.1696, length: 0.71, g: 360, notes: '' },
    { id: 'talon-gt', name: 'ZOHD Talon GT Rebel', type: 'fixedwing', span: 1.0, area: 0, length: 0.66, g: 0, notes: '' },
    { id: 'stallion', name: 'Flightory Stallion VTOL', type: 'vtol', span: 1.34, area: 0, length: 0.99, g: 0, notes: '3D printed' },
    { id: 'mojito', name: 'TBS Mojito', type: 'fixedwing', span: 0, area: 0, length: 0, g: 1130, notes: '' },
  ];

  let n = 0;
  const row = (name, sub, qty, g, rail = '', w = 0, pw = 0, rf = '', link = '') => ({ id: 'b' + n++, name, sub, qty, g, rail, w, pw: pw || w, rf, link });

  const quad = {
    id: 'p-quad', name: 'Example quadcopter', type: 'multirotor',
    payload: { name: 'Payload', g: 1000 },
    env: { alt: 300, temp: 25 },
    batt: { name: 'Tattu 6S 7000 25C', chem: 'lipo', s: 6, p: 1, cellMah: 7000, g: 870, c: 25, cPeak: 50, packs: 2, conn: 'series', usable: 80 },
    becEff: 90,
    mr: { layout: 'quadx', set: 'hw4120-1608', n: 4, esc: 'esc-12s-80', escA: 0, maxThr: 70, cda: 0.12, lean: 30 },
    fw: { span: 2, area: 0.5, cd0: 0.03, e: 0.8, clmax: 1.2, etaP: 65, etaD: 85, vc: 18, set: 'atom2807-8x4', n: 1, vsMax: 12, cal: { on: false, v: 0, a: 0, g: 0 },
      drag: { mode: 'buildup', finish: 'foam', fusL: 1.2, fusD: 0.14, tailPct: 22, tc: 0.12, booms: { n: 0, L: 0, d: 0 }, extras: [], misc: 20, eAuto: true } },
    vtol: { kind: 'quadplane', hoverS: 90, reserve: 0, dcd0: 0.008 },
    bom: [
      row('Flight controller', 'Avionics', 1, 50, '5V', 2.5, 3),
      row('GPS + compass', 'Sensors', 1, 40, '5V', 1, 1.5, ''),
      row('RC receiver (ELRS 2.4 GHz)', 'Comms', 1, 4, '5V', 0.5, 0.6, '2400'),
      row('Telemetry radio (900 MHz)', 'Comms', 1, 20, '5V', 5, 5, '915'),
      row('Remote ID module', 'Avionics', 1, 10, '5V', 0.2, 0.5, '2400'),
      row('Power module + PDB', 'Power', 1, 60),
      row('Battery straps', 'Hardware', 2, 15),
      row('Wire & connectors (est.)', 'Wiring', 1, 200),
      row('Frame (est.)', 'Structures', 1, 1000),
    ],
    rf: { dist: 2, alt: 120, gndH: 2, fade: 10, links: {} },
    mat: { amb: 40, sun: true, heat: false, uv: true, wet: false, crash: true, fuel: false, flex: false, stiff: 6, light: 6, budget: 4, printer: 'enclosed', vol: 35, infill: 30, area: 0, walls: 3, tb: 4 },
  };

  const dolphin = {
    id: 'p-dolphin', name: 'Example fixed-wing', type: 'fixedwing',
    payload: { name: 'Camera payload', g: 250 },
    env: { alt: 300, temp: 25 },
    batt: { name: '6S 5000 25C', chem: 'lipo', s: 6, p: 1, cellMah: 5000, g: 451, c: 25, cPeak: 50, packs: 2, conn: 'parallel', usable: 80 },
    becEff: 90,
    mr: { layout: 'quadx', set: 'xing2812-hq8', n: 4, escA: 50, maxThr: 70, cda: 0.05, lean: 30 },
    fw: { span: 0.845, area: 0.1696, cd0: 0.035, e: 0.75, clmax: 1.1, etaP: 60, etaD: 85, vc: 22, set: 'atom2807-8x4', n: 1, esc: 'esc-6s-60', vsMax: 14,
      cal: { on: false, v: 0, a: 0, g: 0, learn: false },
      drag: { mode: 'buildup', finish: 'foam', fusL: 0.83, fusD: 0.11, tailPct: 20, tc: 0.12, booms: { n: 0, L: 0, d: 0 }, extras: [{ name: 'Gimbal camera', cda: 40, qty: 1 }, { name: 'Exposed antenna', cda: 5, qty: 3 }], misc: 20, eAuto: true } },
    vtol: { kind: 'quadplane', hoverS: 90, reserve: 0, dcd0: 0.008 },
    bom: [
      row('AtomRC Dolphin Pro airframe', 'Structures', 1, 790),
      row('Flight controller', 'Avionics', 1, 25, '5V', 2, 2.5),
      row('GPS + compass', 'Sensors', 1, 20, '5V', 1, 1.2, ''),
      row('Airspeed sensor', 'Sensors', 1, 12, '5V', 0.5, 0.6),
      row('RC receiver (ELRS 2.4 GHz)', 'Comms', 1, 4, '5V', 0.5, 0.6, '2400'),
      row('Telemetry radio (900 MHz)', 'Comms', 1, 18, '5V', 5, 5, '915'),
      row('Mini gimbal camera', 'Payload', 1, 95, '12V', 5, 8),
      row('Power module', 'Power', 1, 25),
      row('Remote ID module', 'Avionics', 1, 10, '5V', 0.2, 0.5, '2400'),
      row('Wire & connectors (est.)', 'Wiring', 1, 80),
    ],
    rf: { dist: 5, alt: 120, gndH: 2, fade: 10, links: {} },
    mat: { amb: 35, sun: true, heat: true, uv: true, wet: false, crash: true, fuel: false, flex: false, stiff: 5, light: 8, budget: 5, printer: 'open', vol: 12, infill: 20, area: 0, walls: 3, tb: 4 },
  };

  const vtol = {
    id: 'p-vtol', name: 'Example quadplane VTOL', type: 'vtol',
    payload: { name: 'Survey camera', g: 300 },
    env: { alt: 300, temp: 25 },
    batt: { name: '6S4P Molicel P45B 21700 (example)', chem: 'liion', s: 6, p: 4, cellMah: 4500, g: 1750, c: 10, packs: 1, conn: 'parallel', usable: 85 },
    becEff: 90,
    mr: { layout: 'quadx', set: 'xing2812-hq8', n: 4, esc: 'esc-6s-60', escA: 0, maxThr: 70, cda: 0.05, lean: 30 },
    fw: { span: 2.0, area: 0.5, cd0: 0.03, e: 0.8, clmax: 1.3, etaP: 65, etaD: 85, vc: 20, set: 'atom2807-8x4', n: 1, esc: 'esc-6s-60', vsMax: 13, cal: { on: false, v: 0, a: 0, g: 0 },
      drag: { mode: 'buildup', finish: 'builtup', fusL: 1.0, fusD: 0.13, tailPct: 22, tc: 0.12, booms: { n: 2, L: 1.1, d: 0.025 }, extras: [{ name: 'Gimbal camera', cda: 40, qty: 1 }, { name: 'Exposed antenna', cda: 5, qty: 2 }], misc: 20, eAuto: true } },
    vtol: { kind: 'quadplane', hoverS: 90, reserve: 0, dcd0: 0.008 },
    bom: [
      row('Airframe + booms', 'Structures', 1, 1400),
      row('Cube Orange+ Mini', 'Avionics', 1, 53, '5V', 2.5, 3),
      row('Here4 GPS', 'Sensors', 1, 60, '5V', 1, 1.5, ''),
      row('3DR CAN airspeed (DLVR)', 'Sensors', 1, 12.2, '5V', 0.5, 0.6),
      row('RFD900x telemetry', 'Comms', 1, 18, '5V', 5, 5, '915'),
      row('ELRS RP4 receiver', 'Comms', 1, 3.4, '5V', 0.5, 0.6, '2400'),
      row('SIYI A8 mini', 'Payload', 1, 95, '12V', 5, 8),
      row('Wire & connectors (est.)', 'Wiring', 1, 150),
    ],
    rf: { dist: 8, alt: 120, gndH: 3, fade: 10, links: {} },
    mat: { amb: 35, sun: true, heat: false, uv: true, wet: true, crash: true, fuel: false, flex: false, stiff: 7, light: 7, budget: 5, printer: 'enclosed', vol: 20, infill: 25, area: 0, walls: 3, tb: 4 },
  };

  // split bench sets into separate motor / prop / thrust-test libraries
  const { motors, props, tests, map } = G.UAS.splitSets(sets);
  for (const pr of props) { const a = (G.UAS_APC || {})[pr.name]; if (a) pr.data = a.data; }
  const fix = (o) => { if (o.set && map[o.set]) [o.motor, o.prop] = map[o.set]; delete o.set; };
  for (const p of [quad, dolphin, vtol]) { fix(p.mr); fix(p.fw); }
  // one entry = one ESC: continuous and burst amps, cell range, weight
  const escs = [
    { id: 'esc-6s-40', name: 'Generic 6S 40A ESC', brand: '', a: 40, burst: 50, sMin: 2, sMax: 6, g: 35 },
    { id: 'esc-6s-60', name: 'Generic 6S 60A ESC', brand: '', a: 60, burst: 80, sMin: 3, sMax: 6, g: 60 },
    { id: 'esc-12s-80', name: 'Generic 12S 80A ESC', brand: '', use: 'mr', a: 80, burst: 100, sMin: 6, sMax: 12, g: 90 },
  ];
  const printer = { lineW: 0.45, layerH: 0.2 };
  const printed = [
    { id: 'pp-gps-mast', name: 'GPS mast', mat: 'petg', vol: 18, area: 0, walls: 3, tb: 4, infill: 25, g: 0, sub: '3D printed', notes: '' },
    { id: 'pp-ant-mount', name: 'Antenna mount', mat: 'tpu', vol: 6, area: 0, walls: 4, tb: 5, infill: 40, g: 0, sub: '3D printed', notes: '' },
  ];
  for (const x of printed) x.g = +G.UAS.partMass(x, G.UAS.MATERIALS.find((m) => m.id === x.mat).rho, printer).toFixed(1);
  // library.js (from make_defaults.js) replaces the built-in library and, optionally, the example designs
  const OV = G.UAS_LIBRARY;
  G.UAS_SEED = { lib: OV && OV.lib ? OV.lib : { motors, props, tests, batteries, parts, airframes, printed, escs, printer }, projects: OV && OV.projects ? OV.projects : [quad, dolphin, vtol], legacySets: sets };
})(typeof window !== 'undefined' ? window : globalThis);
