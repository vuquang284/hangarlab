<p align="center">
  <img src="assets/HangarLab_center_light.png" alt="HangarLab" width="300">
</p>

# HangarLab

**HangarLab is a free web app for planning drones.** Size the motors, props and battery for a multirotor, fixed-wing or VTOL aircraft, check the power system and radio links, then compare the plan with real ArduPilot flight logs.

**[Open HangarLab →](https://hangarlab.app)**

No account and nothing to install: it runs in your browser, and your designs are saved there, with export and backups built in. A short guided tour shows you around on your first visit.

## Features

**Performance**
- Multirotor, fixed-wing and hybrid VTOL (quadplane, tilt-rotor, tailsitter).
- Endurance, range, hover throttle, top speed, wind limit, peak current and checks, all updated as you type.
- Drag build-up from the airframe geometry, or a fixed CD0. Calibrate from one measured flight to correct the model.
- VTOL transitions (time and energy), hover thrust penalty per VTOL type, and tailsitter hover wind limit.
- Mission profile with climb, cruise, loiter, hover and transition segments, wind and reserve.
- Multirotor frames with wheelbase and layout, and a prop clearance check.
- ESC and motor limits: full-throttle current and power against the ESC (current and cell range) and the motor's own ratings.
- Part finders that try every motor + prop pair or battery pack in your library and rank them by endurance within limits.
- **Simple / Detailed** input modes, and a guided **New design** setup.
- Charts you can copy or save as pictures, and a collapsible input sidebar (Ctrl/⌘ + B).

**Compare**: designs side by side, with the best value in each row highlighted.

**BOM & Weight**: bill of materials with weight, cost, buy links, supply rail, radio band and balance (CG). Rows stay linked to the parts library.

**Electrical**: regulator sizing, peak bus current, main connector and wire gauge. Advanced mode lets you edit the connector and wire tables.

**Radio Link**
- Link budget per radio with presets (RFD900x, ExpressLRS, Crossfire, Ubiquiti airMAX ac with data-rate trade-off, analog video) and antenna presets.
- **Antenna finder**: the antenna pairs that reach the range you need, simplest first.
- **Coverage map**: drag the ground station on a satellite map, import a KML/KMZ or waypoint file, and see each radio's coverage with terrain line of sight.
- Beam-width and overhead-null checks, 2.4 vs 5.8 GHz comparison, and the free-space path loss worked step by step.

**3D Printing**: filament ranking for heat, UV and impact; STL preview with printed-part mass.

**Parts Library**: motors (with thrust-stand data), props (with APC performance data), battery packs, ESCs, components (with editable subsystems), printed parts and airframes. Import from the Excel template, or **add from a product link**: the name, price and specs are read from the page for you to check.

**Flight Logs** (ArduPilot `.bin` / `.log`)
- Plots, presets and expressions, parameters and events.
- 3D, map and **3D satellite map** views with an orange vehicle model that follows playback, terrain and a chase camera.
- Per-flight-mode cruise speed and current, with one-click calibration and mission rebuild.
- **Health check** (board power, vibration, GPS, compass interference, motor balance, CPU load, errors, battery).
- Parameter descriptions and range checks from ArduPilot.

**Export**: calculation workbook (Excel: every input and the formula behind each result, live, plus the charts), copy results, printable report / PDF, parts list (CSV) and a full backup, in metric or imperial units to match the app.

## Privacy

Everything runs in the browser. Designs, the parts library and opened logs stay in that browser's storage and are never uploaded. Map imagery, terrain heights and ArduPilot parameter descriptions are downloaded from their public sources when you open those views. A product link given to **Add from link** is fetched through HangarLab's server (a Cloudflare Pages Function) so the page can be read; nothing else is sent. Visits are counted anonymously with Cloudflare Web Analytics (no cookies). Use **Export → Full backup** to move your work to another browser or computer.

## Disclaimer

HangarLab gives planning estimates, not guarantees. Check the numbers against bench tests and test flights, and follow your local aviation rules; the regulation notes are an orientation, not legal advice.

## Using it

Open **[hangarlab.app](https://hangarlab.app)** in any modern browser, on a computer, tablet or phone.

- **Your work stays on your device.** Back it up with **Export → Full backup**, and import it on another browser or computer.
- **Offline copy:** save [hangarlab.app/HangarLab.html](https://hangarlab.app/HangarLab.html) (or `hangarlab/HangarLab.html` from this repository) and open it; it works without the website. Maps, terrain and 3D views still need an internet connection.
- **New versions** appear automatically the next time you open the site. Your saved designs are upgraded, never lost. The version is shown at the bottom right.
- **Found a bug or want a feature?** [Open an issue](https://github.com/vuquang284/hangarlab/issues/new).

## Versions

HangarLab is in development (0.x versions; 1.0.0 will be the first public release). The current version is shown at the bottom right of the app and set by `APP_VERSION` in `hangarlab/app-core.js`. See [CHANGELOG.md](CHANGELOG.md) for what changed and how to release.

## Development

The app is static files with nothing to install. To run it locally, serve the `hangarlab/` folder:

```bash
python -m http.server 8000 --directory hangarlab
```

then open <http://localhost:8000>. Pushes to `main` update the live site; `hangarlab/_headers` makes browsers re-check the app files so a new version shows up right away. Add from link needs the Cloudflare function, so locally it falls back to pasting the page text.

Only `hangarlab/` is published (Cloudflare Pages: build output directory `hangarlab`, no build command; `functions/` is deployed alongside it). Development tools live in `tools/` and images for the README in `assets/`.

Requires Node.js (any current LTS) for the tools below. Run them from the repository root:

| Command | What it does |
| --- | --- |
| `node tools/test.js` | Self-check of the flight model, battery maths, log parsing and imports. |
| `node tools/build.js` | Rebuilds `HangarLab.html` from `index.html` and the scripts. Run it and commit the result after any source change; CI fails if it is out of date. |
| `node tools/make_defaults.js <backup.json> [--designs]` | Makes an exported full backup the built-in library (and optionally the example designs). `--reset` goes back to the library in `data.js`. |
| `python tools/make_template.py` | Rebuilds the Excel import template (`tools/HangarLab template.xlsx`) and `hangarlab/template.js` (needs `openpyxl`). |

### Files

| File | Contents |
| --- | --- |
| `index.html` | Page layout, styles and logos. |
| `engine.js` | Flight, battery, electrical, RF and VTOL models, log parsing, health check and parameter export (`window.UAS`). No DOM access, so `test.js` runs it in Node. |
| `apc.js` | APC propeller performance data. |
| `data.js`, `library.js` | Built-in parts library and example designs; `library.js` overrides it when generated by `make_defaults.js`. |
| `template.js` | The Excel template, embedded for download. |
| `uPlot.iife.min.js` | [uPlot](https://github.com/leeoniya/uPlot) 1.6.30 (MIT), for the charts. |
| `app-core.js` | UI state, storage, units, form builders, info bubbles, charts, header. |
| `app-design.js` | Performance tab and part finders. |
| `app-parts.js` | BOM & Weight, Electrical and Radio Link tabs, antenna finder. |
| `app-print.js` | 3D Printing tab and STL preview. |
| `app-library.js` | Parts Library tab, imports and team library. |
| `app-logs.js` | Flight Logs tab, parameter descriptions and health check display. |
| `app-map3d.js` | Flight Logs 3D satellite map. |
| `app-rfmap.js` | Radio Link coverage map. |
| `app-wizard.js` | New design wizard. |
| `app-tour.js` | First-visit guided tour. |
| `app-export.js` | Dialogs, export (Excel workbook with the worked calculation, report, parts list, backup) and Settings. |
| `app-main.js` | Quick start, Compare tab, events and start-up. |
| `_headers` | Cache headers for the live site. |
| `favicon.png`, `og-image.png` | Browser icon and the link preview image. |

Outside the published folder:

| File | Contents |
| --- | --- |
| `functions/api/page.js` | Cloudflare Pages Function that fetches product pages for Add from link. Only answers requests from HangarLab's own pages. |
| `tools/` | `build.js`, `test.js` and its reference designs (`test-fixtures.json`), `make_defaults.js`, `make_template.py`, the Excel template, and the parts library workbook the built-in library is made from. |
| `assets/` | Logo images (the README logo and the icon source). |

The `app-*.js` files are plain scripts that share one global scope, so their load order matters. It is listed in both `index.html` and `build.js`, and `app-main.js` must come last.

## Credits and data sources

- Libraries: [uPlot](https://github.com/leeoniya/uPlot) (MIT), [Leaflet](https://leafletjs.com) (BSD-2), [three.js](https://threejs.org) (MIT), [SheetJS](https://sheetjs.com) (Apache-2.0), [ExcelJS](https://github.com/exceljs/exceljs) (MIT), [LZMA-JS](https://github.com/LZMA-JS/LZMA-JS) (MIT). Fonts: Barlow, Barlow Condensed, Roboto Mono (OFL / Apache-2.0).
- Satellite imagery © Esri, Maxar, Earthstar Geographics. Street map © OpenStreetMap contributors.
- Terrain heights: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen; SRTM, GMTED, ETOPO1 and other public sources).
- ArduPilot parameter descriptions from autotest.ardupilot.org (GPLv3), loaded at run time.
- APC Propellers PER3 performance files (`apc.js`). Check APC's terms before redistributing them.
- The flight-log viewer, health check and 3D map follow the ideas of ArduPilot's UAV Log Viewer, LogAnalyzer and Mission Planner, but share no code with them.

## License

Copyright (C) 2026 vuquang284.

HangarLab is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). If you run a modified copy as a website, you must offer its source code to the people who use it.

Not covered by that license:

- **The HangarLab name and logos** (`assets/`, `hangarlab/favicon.png`, `hangarlab/og-image.png`). Forks should use their own name and logo.
- **APC propeller data** (`hangarlab/apc.js`), which remains under APC Propellers' terms.
- **Third-party libraries** loaded by the app (uPlot, Leaflet, three.js, SheetJS, ExcelJS, LZMA-JS), which keep their own licenses as listed under Credits.
