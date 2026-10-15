# Changelog

HangarLab is **in development** (not alpha or beta yet). Versions stay at **0.x.y-dev** until the first public release, which will be **1.0.0**.

Numbering ([semantic versioning](https://semver.org), major.minor.patch):

- **patch** (0.1.**1**): bug fixes and wording.
- **minor** (0.**2**.0): new features or changes.
- **major** (**1**.0.0): first public release; after that, a major bump means saved designs, backups or imports break.

To record an update: bump `APP_VERSION` at the top of `hangarlab/app-core.js`, add an entry here, run `node tools/build.js`, commit, then tag it (`git tag v0.1.1-dev && git push --tags`). The version shows at the bottom right of every page.

## 0.7.1-dev (2026-10-15)

- Open source under the GNU AGPL-3.0 (`LICENSE`). The name and logos, the APC prop data and third-party libraries are not covered; see the README. Settings → About links the license and source code.

## 0.7.0-dev (2026-10-15)

Ready for the public site at hangarlab.app.

- The page now starts with a proper HTML header (`<!doctype html>`, language), so browsers render it in standards mode.
- Browser icon, page description and a link preview image (shared links show a HangarLab card).
- "Report a problem or suggest a feature" link (GitHub Issues) in the footer and Settings.
- The Parts & Weight tab is renamed **BOM & Weight**, so it isn't confused with Parts Library.
- The app open in two tabs no longer overwrites itself: a tab picks up changes saved in another.
- Privacy text updated: links given to Add from link are read through HangarLab's server, and visits are counted anonymously (Cloudflare Web Analytics, no cookies).
- Add from link's server only answers requests from HangarLab's own pages.
- Example fixed-wing uses the Xing2 3110 900KV + HQ 8x4x3 (bench data, within the motor's ratings); the example VTOL pack has a 15C peak rating. The examples open with no warnings.
- Development tools moved to `tools/` and README images to `assets/`, so only the app is published. Run `node tools/test.js` and `node tools/build.js` from the repository root.

## 0.6.0-dev (2026-10-15)

- Airframes have a **Type** (Fixed-wing, Multirotor, Hybrid VTOL), and multirotor frames have **Wheelbase**, **Layout** and **Max prop** columns. Existing airframes get a type from their name.
- Multirotor designs get a **Load frame** picker in Propulsion: it sets the layout, motor count and wheelbase and adds the frame's weight to the BOM. Fixed-wing and VTOL designs only list wings. The New design wizard offers frames for multirotors too.
- New checks: props on neighboring arms overlapping (from wheelbase and arm count, with the largest prop that fits), tips closer than about 5 % of the diameter, and props larger than the frame's stated maximum.
- Excel import, the template and Add from link read the frame type, wheelbase, layout and max prop size.

## 0.5.0-dev (2026-10-15)

- ESCs have a **For** column: Multirotor, Plane or Either. The ESC picker shows it, a plane ESC on lift motors gets a warning, and a multirotor ESC on a cruise motor gets a note to turn braking off. Excel import, the template and Add from link read it too.

## 0.4.1-dev (2026-10-15)

- Built-in library: TBS Lucid 12S 90A ESC moved from Components to ESCs (90 A continuous, up to 12S, 20 g).

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
