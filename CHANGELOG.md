# Changelog

HangarLab uses [semantic versioning](https://semver.org): **major.minor.patch**.

- **patch** (1.0.**1**): bug fixes and wording.
- **minor** (1.**1**.0): new features that keep saved designs working.
- **major** (**2**.0.0): changes that break saved designs, backups or imports.

To release: bump `APP_VERSION` at the top of `hangarlab/app-core.js`, add an entry here, run `node build.js` in `hangarlab/`, commit, then tag it (`git tag v1.0.1 && git push --tags`). The version shows at the bottom right of every page.

## 1.0.0 (2026-10-15)

First public-ready release.

- Performance tab for multirotor, fixed-wing and hybrid VTOL (quadplane, tilt-rotor, tailsitter), with transitions, mission profile, wind and cold-weather effects.
- Simple / Detailed inputs, a key results row, and a 4-step New design wizard.
- Part finders for motor + prop and battery; Compare tab.
- Parts & Weight with cost, buy links and balance (CG); Electrical with an advanced connector and wire mode.
- Radio Link with radio and antenna presets, an antenna finder for the range you need, and a coverage map (ground station drag, KML/KMZ/waypoint import, terrain line of sight).
- 3D Printing with STL preview.
- Parts Library with thrust data, APC prop data, editable subsystems and Excel template import.
- Flight Logs with plots, 3D satellite map and vehicle model, per-mode cruise stats, health check, ArduPilot parameter descriptions, calibration and mission from a log.
- Exports: Excel, report / PDF, CSV, pre-flight checklist, ArduPilot `.param` file, workspace backups.
- Disclaimer and privacy footer; ready for Cloudflare Pages.
