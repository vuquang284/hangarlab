// HangarLab UI: "New design" wizard: type → battery → motor + prop → payload & airframe.
// Starts from the matching example design (so every advanced field has a sensible value) and applies the choices.
'use strict';

let wiz = null;
const WIZ_STEPS = ['Type', 'Battery', 'Motor + prop', 'Payload'];
function wizRead() {
  const v = (id) => { const el = $('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  for (const [k, id, num] of [['name', 'wz-name'], ['kind', 'wz-kind'], ['bat', 'wz-bat'], ['packs', 'wz-packs', 1], ['motor', 'wz-motor'], ['prop', 'wz-prop'], ['auto', 'wz-auto'], ['payload', 'wz-payload', 1], ['airframe', 'wz-af']]) {
    const x = v(id);
    if (x !== undefined) wiz[k] = num ? +x || 0 : x;
  }
}
function wizard(step) {
  if (!wiz) return;
  if ($('#dlg').open) wizRead();
  wiz.step = Math.max(0, Math.min(3, step));
  const opt = (list, cur, none) => (none ? `<option value="">${none}</option>` : '') + list.map((x) => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const st = wiz.step;
  const body = [
    `<label class="f"><span>Name</span><input type="text" id="wz-name" value="${esc(wiz.name)}"></label>
     <div class="f"><span>What are you building?</span><div class="seg" role="group">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button data-wiztype="${k}" aria-pressed="${wiz.type === k}">${l}</button>`).join('')}</div></div>
     ${wiz.type === 'vtol' ? `<label class="f"><span>VTOL type</span><select id="wz-kind">${[['quadplane', 'Quadplane (separate lift + cruise motors)'], ['tiltrotor', 'Tilt-rotor'], ['tailsitter', 'Tailsitter']].map(([k, l]) => `<option value="${k}"${k === wiz.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}`,
    `<label class="f"><span>Battery pack</span><select id="wz-bat">${opt(S.lib.batteries, wiz.bat, 'Keep the example pack')}</select></label>
     <label class="f"><span>Packs on board (in parallel)</span><input type="number" id="wz-packs" value="${wiz.packs}" min="1" step="1"></label>
     <p class="hint">Packs come from Parts Library → Battery packs. Add yours there first, or keep the example and edit it later.</p>`,
    `<label class="f check"><input type="checkbox" id="wz-auto"${wiz.auto ? ' checked' : ''}> Pick the best motor + prop from my library for me</label>
     <label class="f"><span>Motor</span><select id="wz-motor">${opt(S.lib.motors, wiz.motor, 'Keep the example motor')}</select></label>
     <label class="f"><span>Prop</span><select id="wz-prop">${opt(S.lib.props, wiz.prop, 'Keep the example prop')}</select></label>
     <p class="hint">With the box ticked, every motor + prop pair in the library is tried on the finished design and the longest-flying one within its limits is used. Your picks above are then ignored.</p>`,
    `<label class="f"><span>Payload mass (g)</span><input type="number" id="wz-payload" value="${wiz.payload}" min="0" step="10"></label>
     ${wiz.type !== 'multirotor' ? `<label class="f"><span>Airframe</span><select id="wz-af">${opt(S.lib.airframes, wiz.airframe, 'Keep the example wing')}</select></label>` : ''}
     <p class="hint">Everything can be changed afterwards on the Performance tab.</p>`,
  ][st];
  openDlg(`New design · ${st + 1} of 4: ${WIZ_STEPS[st]}`, `<div class="wiz-dots">${WIZ_STEPS.map((s, i) => `<span class="${i === st ? 'on' : i < st ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>${body}`,
    `<button class="btn" data-act="dlg-close">Cancel</button>${st ? `<button class="btn" data-act="wiz" data-step="${st - 1}">Back</button>` : ''}${st < 3 ? `<button class="btn primary" data-act="wiz" data-step="${st + 1}">Next</button>` : '<button class="btn primary" data-act="wiz-go">Create design</button>'}`);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-wiztype]');
  if (!b || !wiz) return;
  wizRead(); wiz.type = b.dataset.wiztype; wizard(wiz.step);
});
function wizardCreate() {
  wizRead();
  const w = wiz, base = clone(window.UAS_SEED.projects.find((x) => x.type === w.type) || window.UAS_SEED.projects[0]);
  base.id = 'p-' + uid(); base.name = w.name || 'New design'; delete base.versions; delete base.flights;
  if (w.type === 'vtol') { base.vtol.kind = w.kind; const vd = U.VTOL_DEF[w.kind]; if (vd) Object.assign(base.vtol, { accel: vd.acc, hoverPen: vd.pen }); }
  fixDesign(base);
  Object.assign(base.batt, { usable: S.settings.newDesign.usable }); Object.assign(base.env, { alt: S.settings.newDesign.alt, temp: S.settings.newDesign.temp });
  if (w.bat) { base.batt.ref = w.bat; delete base.batt.unlinked; }
  base.batt.packs = Math.max(1, w.packs || 1); base.batt.conn = 'parallel';
  base.payload = Object.assign({}, base.payload, { g: Math.max(0, w.payload || 0) });
  const role = w.type === 'fixedwing' ? 'fw' : 'mr';
  if (!w.auto) { if (w.motor) base[role].motor = w.motor; if (w.prop) base[role].prop = w.prop; }
  if (w.airframe && base.fw) { const a = S.lib.airframes.find((x) => x.id === w.airframe); if (a) { if (a.span) base.fw.span = a.span; if (a.area) base.fw.area = a.area; if (a.g) base.bom.unshift(libToBom('airframes', a)); } }
  snapshot();
  S.projects.push(base); S.active = base.id; syncLib();
  let note = '';
  if (w.auto) {
    const r = finderRows(base, 'mp', role).rows.find((x) => x.ok);
    if (r) { base[role].motor = r.apply.motor; base[role].prop = r.apply.prop; note = ` with ${r.label}`; }
    else note = ' (no library motor + prop fits its limits yet; kept the example pair)';
  }
  wiz = null; closeDlg(); S.tab = 'design'; save(); render(); window.scrollTo(0, 0);
  toast(`Created ${base.name}${note}`, { label: 'Undo', fn: undo });
}
