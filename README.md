<p align="center">
  <img src="hangarlab/HangarLab_center_light.png" alt="HangarLab" width="300">
</p>

# HangarLab

**HangarLab is a free web app for planning drones.** Size the motors, props and battery for a multirotor, fixed-wing or VTOL aircraft, check the power system and radio links, then compare the plan with real ArduPilot flight logs.

**[Open HangarLab →](https://hangarlab.pages.dev)**

No account and nothing to install: it runs in your browser, and your designs are saved there, with export and backups built in. A short guided tour shows you around on your first visit.

## Features

**Performance**
- Multirotor, fixed-wing and hybrid VTOL (quadplane, tilt-rotor, tailsitter).
- Endurance, range, hover throttle, top speed, wind limit, peak current and checks, all updated as you type.
- Drag build-up from the airframe geometry, or a fixed CD0. Calibrate from one measured flight to correct the model.
- VTOL transitions (time and energy), hover thrust penalty per VTOL type, and tailsitter hover wind limit.
- Mission profile with climb, cruise, loiter, hover and transition segments, wind and reserve.
- ESC and motor limits: full-throttle current and power against the ESC (current and cell range) and the motor's own ratings.
- Part finders that try every motor + prop pair or battery pack in your library and rank them by endurance within limits.
- **Simple / Detailed** input modes, and a guided **New design** setup.

**Compare**: designs side by side, with the best value in each row highlighted.

**Parts & Weight**: bill of materials with weight, cost, buy links, supply rail, radio band and balance (CG). Rows stay linked to the parts library.

**Electrical**: regulator sizing, peak bus current, main connector and wire gauge. Advanced mode lets you edit the connector and wire tables.

**Radio Link**
- Link budget per radio with presets (RFD900x, ExpressLRS, Crossfire, Ubiquiti airMAX ac with data-rate trade-off, analog video) and antenna presets.
- **Antenna finder**: the antenna pairs that reach the range you need, simplest first.
- **Coverage map**: drag the ground station on a satellite map, import a KML/KMZ or waypoint file, and see each radio's coverage with terrain line of sight.
- Beam-width and overhead-null checks, 2.4 vs 5.8 GHz comparison, and the free-space path loss worked step by step.

**3D Printing**: filament ranking for heat, UV and impact; STL preview with printed-part mass.

**Parts Library**: motors (with thrust-stand data), props (with APC performance data), battery packs, ESCs, components (with editable subsystems), printed parts and airframes. Import from the Excel template.

**Flight Logs** (ArduPilot `.bin` / `.log`)
- Plots, presets and expressions, parameters and events.
- 3D, map and **3D satellite map** views with an orange vehicle model that follows playback, terrain and a chase camera.
- Per-flight-mode cruise speed and current, with one-click calibration and mission rebuild.
- **Health check** (board power, vibration, GPS, compass interference, motor balance, CPU load, errors, battery).
- Parameter descriptions and range checks from ArduPilot.

**Export**: Excel workbook, printable report / PDF, CSV, pre-flight checklist, ArduPilot `.param` starting values, and full workspace backups.

## Privacy

Everything runs in the browser. Designs, the parts library and opened logs stay in that browser's storage and are never uploaded. Map imagery, terrain heights and ArduPilot parameter descriptions are downloaded from their public sources when you open those views. Use **Export → Workspace backup** to move your work to another browser or computer.

## Disclaimer

HangarLab gives planning estimates, not guarantees. Check the numbers against bench tests and test flights, and follow your local aviation rules; the regulation notes are an orientation, not legal advice.

## Using it

Open **[hangarlab.pages.dev](https://hangarlab.pages.dev)** in any modern browser, on a computer, tablet or phone.

- **Your work stays on your device.** Back it up with **Export → Workspace backup**, and import it on another browser or computer.
- **Offline copy:** download `hangarlab/HangarLab.html` from this repository and open it; it works without the website. Maps, terrain and 3D views still need an internet connection.
- **New versions** appear automatically the next time you open the site. Your saved designs are upgraded, never lost. The version is shown at the bottom right.

## Versions

HangarLab is in development (0.x versions; 1.0.0 will be the first public release). The current version is shown at the bottom right of the app and set by `APP_VERSION` in `hangarlab/app-core.js`. See [CHANGELOG.md](CHANGELOG.md) for what changed and how to release.

## Development

The app is static files with nothing to install. To run it locally, serve the `hangarlab/` folder:

```bash
python -m http.server 8000 --directory hangarlab
```

then open <http://localhost:8000>. Pushes to `main` update the live site; `hangarlab/_headers` makes browsers re-check the app files so a new version shows up right away.

Requires Node.js (any current LTS) for the tools below. Run them from `hangarlab/`:

| Command | What it does |
| --- | --- |
| `node test.js` | Self-check of the flight model, battery maths, log parsing and imports. |
| `node build.js` | Rebuilds `HangarLab.html` from `index.html` and the scripts. Run it and commit the result after any source change; CI fails if it is out of date. |
| `node make_defaults.js <backup.json> [--designs]` | Makes an exported workspace backup the built-in library (and optionally the example designs). `--reset` goes back to the library in `data.js`. |
| `python make_template.py` | Rebuilds the Excel import template and `template.js` (needs `openpyxl`). |

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
| `app-parts.js` | Parts & Weight, Electrical and Radio Link tabs, antenna finder. |
| `app-print.js` | 3D Printing tab and STL preview. |
| `app-library.js` | Parts Library tab, imports and team library. |
| `app-logs.js` | Flight Logs tab, parameter descriptions and health check display. |
| `app-map3d.js` | Flight Logs 3D satellite map. |
| `app-rfmap.js` | Radio Link coverage map. |
| `app-wizard.js` | New design wizard. |
| `app-tour.js` | First-visit guided tour. |
| `app-export.js` | Dialogs, export, checklist and Settings. |
| `app-main.js` | Quick start, Compare tab, events and start-up. |
| `_headers` | Cache headers for the live site. |
| `test-fixtures.json` | Reference designs `test.js` checks the model against (not shipped in the app). |

The `app-*.js` files are plain scripts that share one global scope, so their load order matters. It is listed in both `index.html` and `build.js`, and `app-main.js` must come last.

## Credits and data sources

- Libraries: [uPlot](https://github.com/leeoniya/uPlot) (MIT), [Leaflet](https://leafletjs.com) (BSD-2), [three.js](https://threejs.org) (MIT), [SheetJS](https://sheetjs.com) (Apache-2.0), [LZMA-JS](https://github.com/LZMA-JS/LZMA-JS) (MIT). Fonts: Barlow, Barlow Condensed, Roboto Mono (OFL / Apache-2.0).
- Satellite imagery © Esri, Maxar, Earthstar Geographics. Street map © OpenStreetMap contributors.
- Terrain heights: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen; SRTM, GMTED, ETOPO1 and other public sources).
- ArduPilot parameter descriptions from autotest.ardupilot.org (GPLv3), loaded at run time.
- APC Propellers PER3 performance files (`apc.js`). Check APC's terms before redistributing them.
- The flight-log viewer, health check and 3D map follow the ideas of ArduPilot's UAV Log Viewer, LogAnalyzer and Mission Planner, but share no code with them.
