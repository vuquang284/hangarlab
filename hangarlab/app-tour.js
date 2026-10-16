// HangarLab UI: first-visit guided tour. A dimmed page with a spotlight on one control at a time and a bubble whose
// arrow points at it. Runs once (settings.tourDone); replay from the quick start guide or Settings.
'use strict';

const TOUR = [
  { sel: '#projSel', title: 'Your designs', text: 'Every aircraft you plan is a design. Pick one here; the examples are there to explore.' },
  { sel: '[data-act="new"]', title: 'Start your own', text: 'Click New to set up your own aircraft. Pick the type, battery, motor and prop, and payload; you can change any of it later.' },
  { sel: '[data-detail="simple"]', parent: true, title: 'Simple or Detailed', text: 'Simple shows the inputs most designs need. Detailed adds drag build-up, calibration, mission and electronics.' },
  { sel: '.side details.group', title: 'Inputs', text: 'Change anything on the left. Every number on the right updates as you type, and Ctrl+Z undoes.' },
  { sel: '#readouts', title: 'Results', text: 'Weight, endurance, range and the other key numbers. More results are folded underneath, and Checks lists anything to fix.' },
  { sel: '#tabs', title: 'One tab per job', text: 'Compare designs, list parts and weight, size the electrical system, plan radio links, and pick 3D printing materials.' },
  { sel: '[data-tab="library"]', title: 'Parts Library', text: 'Add your own motors, props, batteries, ESCs and parts: type them in, paste a product link, or import the Excel template. Every design draws from it.' },
  { sel: '[data-tab="logs"]', title: 'Flight Logs', text: 'Open an ArduPilot log to check a flight, see it on a 3D map, and calibrate your design from real data.' },
  { sel: '[data-act="export"]', title: 'Export and backup', text: 'A calculation workbook (Excel), a printable report, a parts list, and backups of all your work. Your data stays in this browser, so back it up.' },
  { sel: '[data-act="shortcuts"]', title: 'Help any time', text: 'The ? button opens the guide, and you can replay this tour from there.' },
];
let tourStep = -1;

function tourStart() {
  // wait until the page is on screen and laid out (a background tab or a pane still opening has no sizes yet)
  const head = document.querySelector('#projSel');
  if (document.visibilityState !== 'visible' || !head || !head.getBoundingClientRect().width) {
    if ((tourStart.tries = (tourStart.tries || 0) + 1) < 40) setTimeout(tourStart, 250);
    return;
  }
  if (S.tab !== 'design') { S.tab = 'design'; save(); render(); }
  document.querySelectorAll('details.group').forEach((d) => { d.open = true; });
  tourShow(0);
}
function tourEnd(seen = true) {
  tourStep = -1;
  $('#tourLayer')?.remove();
  if (seen) { S.settings.tourDone = true; save(); } // only once someone has actually gone through or skipped it
}
function tourShow(i) {
  if (i < 0) i = 0;
  if (i >= TOUR.length) return tourEnd(tourStep >= 0);
  // skip steps whose control is not on screen (e.g. a narrow window)
  let st = TOUR[i], el = document.querySelector(st.sel);
  if (el && st.parent) el = el.parentElement;
  if (!el || !el.getBoundingClientRect().width) return tourShow(i + (i >= tourStep ? 1 : -1));
  tourStep = i;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  let layer = $('#tourLayer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'tourLayer'; document.body.appendChild(layer); }
  const r = el.getBoundingClientRect(), pad = 6, W = Math.min(320, innerWidth - 24);
  const below = r.bottom + 170 < innerHeight || r.top < 190;
  const left = Math.max(12, Math.min(innerWidth - W - 12, r.left + r.width / 2 - W / 2));
  const arrowX = Math.max(18, Math.min(W - 18, r.left + r.width / 2 - left));
  layer.innerHTML = `<div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
    <div class="tour-tip ${below ? 'below' : 'above'}" role="dialog" aria-live="polite" style="left:${left}px;width:${W}px;${below ? `top:${r.bottom + pad + 14}px` : `bottom:${innerHeight - r.top + pad + 14}px`};--ax:${arrowX}px">
      <div class="tour-n">${i + 1} / ${TOUR.length}</div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p>
      <div class="row" style="justify-content:space-between;margin-top:10px"><button class="btn sm ghost" data-tour="skip">Skip tour</button>
        <div class="row" style="gap:6px">${i ? '<button class="btn sm" data-tour="back">Back</button>' : ''}<button class="btn sm primary" data-tour="next">${i === TOUR.length - 1 ? 'Done' : 'Next'}</button></div></div></div>`;
  layer.querySelector('[data-tour="next"]').focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tour]');
  if (!b) { if (tourStep >= 0 && e.target.closest('#tourLayer')) e.stopPropagation(); return; }
  e.stopPropagation();
  const a = b.dataset.tour;
  if (a === 'start') { closeDlg(); tourStart(); } else if (a === 'next') tourShow(tourStep + 1); else if (a === 'back') tourShow(tourStep - 1); else tourEnd();
}, true);
document.addEventListener('keydown', (e) => {
  if (tourStep < 0) return;
  if (e.key === 'Escape') tourEnd();
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tourShow(tourStep + 1); }
  else if (e.key === 'ArrowLeft') tourShow(tourStep - 1);
}, true);
window.addEventListener('resize', () => { if (tourStep >= 0) tourShow(tourStep); });
