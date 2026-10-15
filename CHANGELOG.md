# Changelog

HangarLab is **in development** (not alpha or beta yet). Versions stay at **0.x.y-dev** until the first public release, which will be **1.0.0**.

Numbering ([semantic versioning](https://semver.org), major.minor.patch):

- **patch** (0.1.**1**): bug fixes and wording.
- **minor** (0.**2**.0): new features or changes.
- **major** (**1**.0.0): first public release; after that, a major bump means saved designs, backups or imports break.

To record an update: bump `APP_VERSION` at the top of `hangarlab/app-core.js`, add an entry here, run `node build.js` in `hangarlab/`, commit, then tag it (`git tag v0.1.1-dev && git push --tags`). The version shows at the bottom right of every page.

## 0.2.0-dev (2026-10-15)

- First-visit guided tour: a spotlight and arrow walk through the design picker, New, Simple/Detailed, inputs, results, tabs, Parts Library, Flight Logs, Export and Help. Replay it from the quick start guide or Settings.
- Example designs are now generic (Example quadcopter, Example fixed-wing, Example quadplane VTOL) with generic parts, instead of real team builds. Existing saved designs are not touched.
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
- Disclaimer and privacy footer; set up for Cloudflare Pages.
