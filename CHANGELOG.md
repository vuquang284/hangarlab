# Changelog

HangarLab is **in development** (not alpha or beta yet). Versions stay at **0.x.y-dev** until the first public release, which will be **1.0.0**.

Numbering ([semantic versioning](https://semver.org), major.minor.patch):

- **patch** (0.1.**1**): bug fixes and wording.
- **minor** (0.**2**.0): new features or changes.
- **major** (**1**.0.0): first public release; after that, a major bump means saved designs, backups or imports break.

To record an update: bump `APP_VERSION` at the top of `hangarlab/app-core.js`, add an entry here, run `node build.js` in `hangarlab/`, commit, then tag it (`git tag v0.1.1-dev && git push --tags`). The version shows at the bottom right of every page.

## 0.4.0-dev (2026-10-15)

- **Add from link** in the Parts Library (motors, props, battery packs, ESCs, components, airframes): paste a product page link and HangarLab fills in the name, brand, price, buy link and the specs it finds (kV, Rm, I0, max current and power, weight, size and pitch, cells, capacity, C rating, ESC current and cell range, wingspan, length, wing area). Found values are highlighted to check before adding. Li-ion packs that list amps or watts instead of C are converted.
- Pages are read through a small Cloudflare Pages Function (`functions/api/page.js`). Where it isn't available (running locally) and the shop blocks reading, paste the page text instead.

## 0.3.1-dev (2026-10-15)

- Built-in parts library updated from the edited parts spreadsheet: new props (APC 8x6E, 8x6EP, 16x10E, 16x10EP), components (Cube Orange+ Standard, Herelink air unit, Jetson Orin Nano Super Dev Kit), the HEEWING T2 motor with thrust data, and the Skids Assembly printed part; updated component values. Removed the frame parts, payload mount, electromagnet and the old printed parts. Libraries people already have keep their own items.

## 0.3.0-dev (2026-10-15)

- ESCs: new **ESCs** section in the Parts Library (continuous and burst current, cell range, weight, cost, buy link), and an ESC picker for the lift and cruise motors in Propulsion. Pick one from the library, or type its rating and max cells. Library ESCs are added to the BOM automatically.
- New checks: full-throttle current against the ESC's continuous and burst rating, pack voltage against the ESC's cell range, and full-throttle current and power against the motor's own max current and max power. The cruise motor is now checked too, not only the lift motors.
- Part finders flag motor + prop pairs and packs that overload the ESC or the motor.
- Excel import and template: new ESCs sheet.

## 0.2.2-dev (2026-10-15)

- Tour: waits until the page is on screen before starting, and only counts as seen once someone finishes or skips it (it could be skipped silently when the page opened in the background).

## 0.2.1-dev (2026-10-15)

- Tour: clearer wording for the "Start your own" step.

## 0.2.0-dev (2026-10-15)

- First-visit guided tour: a spotlight and arrow walk through the design picker, New, Simple/Detailed, inputs, results, tabs, Parts Library, Flight Logs, Export and Help. Replay it from the quick start guide or Settings.
- Example generic designs (Example quadcopter, Example fixed-wing, Example quadplane VTOL) with generic parts, instead of real part builds. Existing saved designs are not touched.
- The self-check runs against fixed reference designs (`test-fixtures.json`), so changing the examples never changes the test.

## 0.1.0-dev (2026-10-15)

In development. Everything built so far:

- Performance tab for multirotor, fixed-wing and hybrid VTOL (quadplane, tilt-rotor, tailsitter), with transitions, mission profile, wind and cold-weather effects.
- Simple / Detailed inputs, a key results row, and a 4-step New design wizard.
- Part finders for motor + prop and battery; Compare tab.
- Parts & Weight with cost, buy links and balance (CG); Electrical with an advanced connector and wire mode.
- Radio Link with radio and antenna presets, an antenna finder for the range you need, and a coverage map (ground station drag, KML/KMZ/waypoint import, terrain line of sight).
- 3D Printing with STL preview.
- Parts Library with thrust data, APC prop data, editable subsystems and Excel template import.
- Flight Logs with plots, 3D satellite map and vehicle model, per-mode cruise stats, health check, ArduPilot parameter descriptions, calibration and mission from a log.
- Exports: Excel, report / PDF, CSV, pre-flight checklist, ArduPilot `.param` file, workspace backups.
- Disclaimer and privacy footer.
