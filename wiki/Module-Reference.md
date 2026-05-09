Per-file API walkthrough. Signatures, line references, dependencies. For the math behind the algorithm functions listed here, see [Decompression-Model](Decompression-Model.md) and the individual algorithm chapters.

All paths are relative to the repository root. Line numbers are kept current per the wiki-update rule in `CLAUDE.md`.

## Core algorithm

### `js/decoModel.js`

Implements Haldane and Schreiner kinetics, M-values, gradient-factor interpolation, NDL search, and the deco-stop scheduling loop. The largest module in the code base (~1300 lines).

Imports: `COMPARTMENTS`, `getRateConstant` from `tissueCompartments.js`.
Imported by: `diveSetup.js`, `mvalues.js`, `main.js`, `tissueEducation.js`, `visualization.js`, and every chart in `js/charts/`.

**Constants**

| Name | Value | Purpose |
|---|---|---|
| `CALC_INTERVAL` | `10` | Simulation time step, seconds |
| `SURFACE_PRESSURE` | `1.01325` | 1 atm in bar |
| `WATER_VAPOR_PRESSURE` | `0.0627` | At 37 °C, in bar |
| `N2_FRACTION` | `0.7902` | Lumps argon with N₂ (standard deco-model convention) |
| `PRESSURE_PER_METER` | `0.1` | bar per metre of sea water |
| `DEFAULT_GF_LOW`, `DEFAULT_GF_HIGH` | `1.0`, `1.0` | As fractions (not percentages) |
| `DECO_STOP_MAX_MINUTES` | `300` | Safety cap per stop; exceeding throws `DecoCapExceededError` |
| `DecoCapExceededError` | class | Thrown when a single stop would need > 5 h |

**Exports — Pressure & alveolar**

| Signature | Line | Description |
|---|---|---|
| `getAmbientPressure(depth)` | 72 | `SURFACE_PRESSURE + depth × 0.1` |
| `getAlveolarN2Pressure(ambient, n2=0.7902)` | 84 | `(ambient − 0.0627) × n2Frac` |
| `getInitialTissueN2(n2=0.7902)` | 93 | Alveolar N₂ at surface (saturation initialiser) |

**Exports — Kinetics**

| Signature | Line | Description |
|---|---|---|
| `haldaneEquation(P0, Palv, t, halfTime)` | 108 | Constant-depth exponential loading. See [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md). |
| `schreinerEquation(P0, Palv0, R, t, halfTime)` | 125 | Linear-rate loading. See [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md). |
| `simulateDepthTime(tissues, depth, t, n2)` | 838 | Vector-apply Haldane across all 16 compartments |
| `simulateDepthChange(tissues, startDepth, endDepth, t, n2)` | 860 | Vector-apply Schreiner across all 16 compartments |

**Exports — M-values & ceilings**

| Signature | Line | Description |
|---|---|---|
| `getMValue(ambient, a, b)` | 145 | `a + ambient/b` — raw Bühlmann limit |
| `getAdjustedMValue(ambient, a, b, gf)` | 160 | `ambient + gf × (M − ambient)` |
| `getCompartmentCeiling(Pt, a, b, gf)` | 361 | Minimum ambient pressure this compartment permits |
| `getDiveCeiling(tissues, gf)` | 377 | Deepest (most-restrictive) ceiling across 16 compartments; returns `{ceiling, ceilingDepth, controllingCompartment}` |
| `getFirstStopDepth(tissues, gfLow, stopIncrement=3)` | 456 | First mandatory stop rounded up to 3 m grid |

**Exports — Gradient factors**

| Signature | Description |
|---|---|
| `calculateInstantGF(Pt, ambient, compartment)` | `(Pt − ambient) / (M − ambient)`, expressed as 0–1 |
| `calculateMaxGF(tissues, ambient)` | Returns `{gfMax, leadingCompartment, allGFs}` |
| `findFirstStopAtGFLow(tissues, depth, n2, gfLow, stopIncrement, ascentRate, gasSwitchPoints)` | The convention's first-stop search: shallowest stop-grid depth where the dive ceiling at GF_low is satisfied after simulated ascent. Returns `{anchorDepth, pAnchor, tissuesAtAnchor}`. **The canonical pAnchor source** used by `generateDecoSchedule`, `calculateCeilingTimeSeriesDetailed`, `MValueChart`, and `GFChart`. See [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md). |
| `interpolateGF(ambient, pAnchor, gfLow, gfHigh)` | Linear ramp from GF-low at pAnchor to GF-high at surface (1.01325 bar) |
| `getFirstStopDepth(tissues, gfLow, stopIncrement=3)` | Static (no ascent simulation): rounds the current dive ceiling at GF_low up to the stop grid. Used for quick lookups; the deco scheduler uses `findFirstStopAtGFLow` instead. |

**Exports — NDL & deco scheduling**

| Signature | Line | Description |
|---|---|---|
| `calculateNDL(depth, n2=0.7902, gfLow=1.0)` | 741 | Binary search; returns `{ndl, controllingCompartment, descentTime, ndlExact}` |
| `generateDecoSchedule(tissues, depth, n2, gfLow, gfHigh, gases=null, options={})` | 899 | Returns `{stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth}`. Throws `DecoCapExceededError` if any stop would exceed `DECO_STOP_MAX_MINUTES`. See [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) and [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md). |

`generateDecoSchedule` options:

- `stopIncrement` (default 3 m) — vertical grid; pass 0.1 for continuous mode
- `timeIncrement` (default 1 min) — stop-time quantum
- `ascentRate` (default 10 m/min) — transit between stops
- `gasSwitchTime` (default 0) — minutes held at switch depth
- `maxPpO2` (default 1.6) — cap for deco gas MOD
- `safetyStop` — passed through for safety-stop handling

**Exports — Full-dive simulation**

| Signature | Line | Description |
|---|---|---|
| `calculateTissueLoading(profile, surfaceInterval=60, options={})` | 1178 | Main entry: walks the waypoint array at `CALC_INTERVAL` resolution, returns `{timePoints, depthPoints, ambientPressures, compartments: {1:{pressures:[]},…}, n2Fractions}` |
| `calculateCeilingTimeSeries(results, gfLow, gfHigh=gfLow)` | 590 | Flat array of ceiling depths at each time point |
| `calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh, providedPAnchor=null)` | 617 | Returns per-compartment ceiling series plus `gfValues` and `pAnchor`; used by M-value and profile charts |

**Implementation notes**

- Haldane is coded as `Palv + (P0 − Palv) × e^(−k·t)` at `decoModel.js:110`.
- Schreiner is coded as a three-term form at `decoModel.js:127–129`: constant inert-gas source + exponential offset.
- `pAnchor` is an ambient-pressure value, not a depth. `findFirstStopAtGFLow` iterates the stop grid surface-up, simulating the ascent to each candidate and checking the dive ceiling at `gfLow` (`getDiveCeiling`). The first depth that passes is the anchor — also the first decompression stop. See [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md).
- Ascent permission in the deco loop (`decoModel.js:1099–1102`) checks the GF-adjusted ceiling at current depth against the next-shallower stop, without Schreiner-crediting the short ascent segment. This matches decotengu's convention.
- `gasKey()` helper at `decoModel.js:918` normalises gases with or without an `id` field, so the deco loop tolerates both library gases and custom mixes.

### `js/tissueCompartments.js`

16 Bühlmann ZH-L16 compartment definitions, runtime-switchable between variants A / B / C.

Imports: none.
Imported by: `decoModel.js`, `diveSetup.js`, `mvalues.js`, `tissueEducation.js`, every chart, every test file.

**Exports**

| Name | Signature | Description |
|---|---|---|
| `ZHL16_VARIANTS` | `{A: 'ZH-L16A', B: 'ZH-L16B', C: 'ZH-L16C'}` | Enum |
| `COMPARTMENTS` | array of 16 objects | Current active compartments. Rebuilt in-place on variant switch. |
| `getZHL16Variant()` | `() => string` | Current active variant name |
| `setZHL16Variant(variant)` | `(string) => void` | Switch variant and rebuild `COMPARTMENTS` in place |
| `getCompartmentsForVariant(variant)` | `(string) => Array` | Inspect a variant without mutating global state |
| `getRateConstant(halfTime)` | `(number) => number` | `ln(2) / halfTime` |
| `getCompartmentCategory(halfTime)` | `(number) => string` | Returns "Fast" / "Medium" / "Medium-Slow" / "Slow" |

**Implementation notes**

- Each compartment object has `{id, halfTime, bN2, aN2, label, color}` after build; see `buildCompartments()` around `tissueCompartments.js:140`.
- TC1's half-time and `b` coefficient swap as a pair between variants. ZH-L16A uses 4.0 min / `b=0.5050`; B and C use 5.0 min / `b=0.5578`. See `COMPARTMENT_1_HALFTIME` at line 46 and `COMPARTMENT_1_B_N2` around line 55.
- All variants share TC2–16 half-times; only the `a` coefficient varies between A, B, C for compartments 5–15 (A_COEFFICIENTS_16A/B/C at lines 102, 115, 128).
- `setZHL16Variant()` clears and repushes the existing `COMPARTMENTS` array (`tissueCompartments.js:190–191`) rather than reassigning, so downstream code holding a reference (e.g. `decoModel.js`) picks up the change without reimporting.
- Default active variant is ZH-L16C (`currentVariant = ZHL16_VARIANTS.C` at line 40). Matches the decotengu default.
- All times in minutes, pressures in bar. See [Model-01-Compartments](Model-01-Compartments.md) for the full coefficient table.

### `js/mvalues.js`

Standalone page controller for the interactive M-value diagram on `m-values.html`. Not an algorithm module — it orchestrates dataset building for the Chart.js P-P diagram.

Imports: `COMPARTMENTS` from `tissueCompartments.js`; `calculateTissueLoading`, `getAmbientPressure`, `getAdjustedMValue`, `getFirstStopDepth`, etc. from `decoModel.js`; `loadDiveSetup`, `getDiveSetupWaypoints`, `getGases`, `getGradientFactors` from `diveSetup.js`.
Imported by: `m-values.html` only (direct script tag).

**Exports**

| Name | Description |
|---|---|
| `CHART_CONFIG` | Render settings (colours, point sizes, playback speed) |
| `loadSelectedProfile()` | Fetches profile, runs `calculateTissueLoading`, draws the P-P chart |
| `populateCoefficientsTable()` | Builds the HTML reference table of ZH-L16 coefficients for the active variant |

**Implementation notes**

- Dataset construction (`buildDatasets`, around line 811) draws the ambient line `y=x`, the alveolar line `y=0.7902·x`, one M-value line per visible compartment, the GF-adjusted corridor (GF-low at pAnchor, GF-high at surface), the tissue trail, and the current-time points.
- pAnchor for the GF corridor comes from `getFirstStopDepth()` + `interpolateGF()`; see `mvalues.js:869–892`. The same pAnchor is passed into `calculateCeilingTimeSeriesDetailed()` so the chart and the profile ceiling agree.
- Chart animation is disabled on update (`mvalues.js:1118`) so timeline-slider scrubbing is smooth.
- Pure UI — no algorithm equations live here. All math delegates to `decoModel.js`.

### `js/diveSetup.js`

Dive configuration, gas library, profile generation, and gas-switch waypoint insertion. The second-largest module (~1470 lines).

Imports: `calculateNDL`, `generateDecoSchedule`, `simulateDepthTime`, `simulateDepthChange`, `getInitialTissueN2`, and other helpers from `decoModel.js`; `COMPARTMENTS` from `tissueCompartments.js`; `translate` from `i18n.js`.
Imported by: `main.js`, `mvalues.js`, every chart, `DiveSetupEditor.js`.

#### Gas definitions

| Export | Line | Description |
|---|---|---|
| `BOTTOM_GASES` | 40 | Air (O₂ 0.2098 / N₂ 0.7902), EAN32, EAN36 |
| `DECO_GASES` | 50 | EAN50, EAN80, O₂ 100% |
| `PREDEFINED_GASES` | 59 | Union of the two above |
| `BOTTOM_CYLINDERS`, `STAGE_CYLINDERS` | 65, 81 | Cylinder size presets (litres) |
| `getPredefinedGas(id)`, `getBottomGas(id)`, `getDecoGas(id)` | 118, 127, 136 | ID lookups |

Note: `BOTTOM_GASES[0].n2` is `0.7902`, matching `N2_FRACTION` in `decoModel.js`.

#### Setup loading

| Signature | Line | Description |
|---|---|---|
| `loadDiveSetup(path='data/dive-setup.json')` | 145 | async; tries localStorage, falls back to JSON fetch, caches in module scope |
| `getDefaultSetup()` | 176 | Hardcoded 40 m / 20 min air dive |
| `clearCache()` | 1187 | Clears the module-level cache |
| `saveDiveSetup(setup, key='diveSetup')` | 1196 | Persist to localStorage |
| `loadSavedSetup(key='diveSetup')` | 1209 | Restore from localStorage |
| `extendDiveSetup(base, overrides)` | 694 | Deep merge with validation |

#### Profile generation

| Signature | Line | Description |
|---|---|---|
| `generateSimpleProfile(maxDepth, bottomTime, safetyStop, options)` | 239 | No-deco profile. Descent 20 m/min, ascent 10 m/min, optional 3 min @ 5 m. |
| `generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh, safetyStop, options)` | 326 | Async. Runs NDL check; if exceeded, calls `generateDecoSchedule()` and splices stops into the waypoint array. Returns `{waypoints, ndl, requiresDeco, decoStops, totalDecoTime, controllingCompartment, pAnchor, anchorDepth}`. |
| `generateDecoProfileSync(...)` | 552 | Synchronous variant accepting a pre-loaded `compartments` array. |
| `getNDLForDepth(depth, gas, gfLow)` | 682 | Convenience wrapper around `calculateNDL`. |

"Bottom time" means the absolute time at which ascent begins, not time spent at max depth. Descent duration is exact (not rounded); ascent time snaps to 0.1 min unless `continuousDeco=true` (`diveSetup.js:260`).

#### Gas calculations

| Signature | Line | Description |
|---|---|---|
| `calculateMOD(o2Fraction, maxPpO2=1.4)` | 807 | `floor((ppO₂/o2 − 1) × 10)`, metres |
| `calculateEND(depth, heFraction=0)` | 820 | `(depth + 10) × (1 − fHe) − 10` |
| `calculatePartialPressure(depth, gasFraction)` | 832 | `fraction × (1.01325 + depth/10)` |
| `getGasCylinderVolume(gas)`, `getCylinderVolume(setup)` | 842, 851 | Litres |
| `getGasStartPressure(gas)` | 861 | bar |
| `computeGasConsumption(results, gases, sacRate, decoSacRate, reservePressure=50)` | 1339 | Per-gas consumption over the profile |

#### Oxygen toxicity

| Signature | Line | Description |
|---|---|---|
| `NOAA_CNS_LIMITS` | 1259 | Discrete ppO₂ / max-exposure lookup table |
| `getCNSPerMinute(ppO2)` | 1282 | Percent per minute; 0 if ppO₂ < 0.5 |
| `calculateOTU(ppO2, timeMinutes)` | 1304 | `t × ((ppO₂ − 0.5)/0.5)^0.83` (NOAA form) |
| `OTU_LIMITS` | 1312 | Daily / series exposure limits |

Toxicity is informational; not fed back into the deco loop.

#### Waypoint & gas-switch helpers

| Signature | Line | Description |
|---|---|---|
| `getDiveSetupWaypoints(setup)` | 754 | Extracts `dives[0].waypoints` |
| `getSurfaceInterval(setup)`, `getGFLow(setup)`, `getGFHigh(setup)`, `getGradientFactors(setup)` | 767, 776, 785, 794 | Getters |
| `getGases(setup)`, `getBottomGasFromSetup(setup)`, `getDecoGasesFromSetup(setup)` | 884, 905, 915 | Gas collections |
| `getGasAtWaypoint(waypoint, gases)`, `getGasAtTime(waypoints, gases, time)` | 927, 949 | Active gas lookup |
| `getGasSwitchEvents(waypoints, gases)` | 974 | Returns `[{time, depth, fromGas, toGas}]` |
| `insertGasSwitchWaypoints(waypoints, gases, ascentRate=10, maxPpO2=1.6, gasSwitchTime=0)` | 1009 | Inserts switch waypoints at MOD depths on ascent; rounds to 3 m grid |

#### Presentation helpers

| Signature | Line | Description |
|---|---|---|
| `generateProfileName(setup)` | 1225 | Short label for UI |
| `formatDiveSetupSummary(setup)` | 1241 | Multi-line human summary |
| `renderDivePlanTableHTML(waypoints, gases, opts)` | 1435 | Returns HTML for the dive-plan table. Preserves explicit gas-switch rows; does not fold them into neighbouring rows. |

#### Defaults

`DEFAULT_GAS_SWITCH_TIME=0` (line 34), `DEFAULT_START_PRESSURE=200`, `DEFAULT_RESERVE_PRESSURE=50` (lines 91, 96), `DEFAULT_GF_LOW=100` / `DEFAULT_GF_HIGH=100` as percentages (lines 101–102), `DEFAULT_SAFETY_STOP={enabled:true, depth:5, time:3}` (line 107).

### `js/diveProfile.js`

Waypoint-array validation and statistics. No algorithm content.

Imports: none.
Imported by: `main.js`.

| Signature | Line | Description |
|---|---|---|
| `createDefaultProfile()` | 12 | Hardcoded 40 m × 20 min with 9/6/3 m stops |
| `validateProfile(profile)` | 32 | Returns `{valid, errors, warnings}` |
| `parseProfileInput(inputData)` | 105 | Parses `time\tdepth`-style text into waypoint array |
| `calculateRates(profile)` | 117 | Returns `[{from, to, rate, type: 'descent'|'ascent'|'level'}]` |
| `getDiveStats(profile)` | 145 | `{maxDepth, totalTime, maxDescentRate, maxAscentRate, waypointCount}` |

First waypoint must be `(time=0, depth=0)`; this is enforced so decompression dives can be detected correctly (`diveProfile.js:45–50`). Depths greater than 60 m and non-surface endings produce warnings, not errors.

### `js/tissueEducation.js`

Chart.js-driven educational animations for `tissue-loading.html`. Not imported as a library (no exports); executes on module load.

**Constants used** (duplicated from `decoModel.js` for page self-containment):

- `WATER_VAPOR_PRESSURE = 0.0627` (line 7)
- `SURFACE_PRESSURE = 1.01325` (line 8)
- `N2_FRACTION = 0.7902` (line 9)
- `SURFACE_ALVEOLAR_N2` ≈ 0.755 bar (line 10)

**Internal functions:** `animateTissueBars()` (line 129), `calculateOngassing()` (line 320), `calculateOffgassing()` (line 462). All use `P(T) = target + (initial − target) × e^(−ln2·T)` on a 0–6 half-time axis with 0.5 T steps.

## Charts (`js/charts/`)

### `DiveProfileChart.js`

Class component (~1600 lines) rendering the depth-vs-time chart with ceiling overlay, gas-switch markers, deco-stop annotations, and optional tissue-compartment overlays.

Exports: `class DiveProfileChart` (line 63), factory `createDiveProfileChart(container, config)` (line 1609).

Imports: `COMPARTMENTS` from `tissueCompartments.js`; `calculateTissueLoading`, `calculateCeilingTimeSeries`, `getAmbientPressure`, and others from `decoModel.js`; `theme`, `applyChartTheme`, `formatAxis` from `chartTheme.js`; `validateDiveSetup`, `normalizeDiveSetup`, `mergeOptions`, `DEFAULT_DIVE_PROFILE_OPTIONS` from `chartTypes.js`; `translate` from `i18n.js`; `getGases`, `getGasSwitchEvents` from `diveSetup.js`.

Key methods: `constructor(container, config)`, `_render()`, `update(diveSetup)`, `destroy()`, `_buildTissueControls()`. Accepts `options.mode` values for profile-only, tissue-overlay, or ppO₂/ppN₂ overlays. Listens for the global `languagechange` event.

### `MValueChart.js`

Class component (~1400 lines) rendering the pressure-pressure (P-P) M-value diagram with time-slider playback.

Exports: `class MValueChart` (line 87), factory `createMValueChart(container, config)` (line 1434).

Imports same as `DiveProfileChart.js` plus chart-specific helpers. Uses `createInteractionLockBtn` from `interactionLock.js`.

Key methods: `_setupKeyboardShortcuts()` (arrow keys step time, shift+arrow jumps waypoint, space toggles play/pause, home/end jump to start/end). Playback loop redraws with `chart.update('none')` to keep the slider smooth.

### `GFChart.js`

Class component (~1300 lines) plotting instantaneous GF (%) per compartment against ambient pressure, with the GF corridor as a shaded band.

Exports: `class GFChart` (line 81), factory `createGFChart(container, config)` (line 1311).

Plots `100 × (P_tissue − P_amb) / (a + P_amb/b − P_amb)` per compartment, the 100 % Bühlmann reference line, a shaded corridor from GF-low at pAnchor to GF-high at surface, and a vertical line at pAnchor.

### `chartTheme.js`

Chart.js theme glue (~200 lines). No state; idempotent.

| Export | Line | Description |
|---|---|---|
| `theme()` | 30 | Reads CSS custom properties from `:root`, returns a palette object |
| `applyChartTheme()` | 62 | Applies defaults to `Chart.defaults` globally |
| `depthGradient(ctx, area, strong, weak)` | 149 | Canvas gradient helper |
| `formatAxis(v, decimals=0)` | 166 | Axis-tick formatter |
| `watchThemeChanges(onChange)` | 180 | Observes `prefers-color-scheme` / data-theme attribute |

### `chartTypes.js`

Validation and normalisation of `diveSetup` objects for chart consumption (~300 lines).

| Export | Line | Description |
|---|---|---|
| `DEFAULT_ENVIRONMENT` | 146 | Salinity, altitude |
| `DEFAULT_DIVE_PROFILE_OPTIONS` | 156 | Chart display toggles |
| `DEFAULT_TISSUE_PRESSURE_OPTIONS` | 184 | Tissue overlay defaults |
| `mergeOptions(defaults, user)` | 208 | Shallow-per-key deep merge |
| `validateDiveSetup(setup)` | 230 | Returns `{valid, errors}` |
| `normalizeDiveSetup(setup)` | 298 | Applies defaults, coerces types, returns a fresh object |

### `interactionLock.js`

Small helper (~100 lines) that adds a toggle button to lock/unlock Chart.js zoom/pan on mobile.

| Export | Line | Description |
|---|---|---|
| `createInteractionLockBtn(getChart, container, opts)` | 22 | Injects a button and wires the `zoom` plugin's `enabled` flag |

### `BubbleModel.js`

`class BubbleModel` (line 28). A visualisation-only toy model, not wired into the decompression algorithm.

## Components (`js/components/`)

### `DiveSetupEditor.js`

`class DiveSetupEditor extends EventTarget` (line 115; ~1700 lines). Embeddable form editor that produces the `diveSetup` JSON consumed by the three chart components.

Default export at line 1674. Emits `change` events with `detail.diveSetup` when the form mutates (configurable via `options.emitOnInput`). Sections: gas management (library + custom), waypoint editor with drag-reorder, gradient-factor sliders with presets (Bühlmann, Conservative, Deco Planner), safety stop, SAC rates, import/export JSON textarea. Re-renders on `languagechange`.

Multi-dive toggle (`showMultiDive`) exists but only `dives[0]` is rendered by the chart components; see the note in `CLAUDE.md`.

### `TissueSaturationSim.js`

`class TissueSaturationSim` (line 51). Pure UI controller for the tissue-saturation canvas on `tissue-loading.html`. No algorithm exports.

### `HeroMotion.js` / `StickyTOC.js` / `tooltipShortcut.js`

Small UI helpers:

| Export | Line | Description |
|---|---|---|
| `mountHeroMotion(root)` | 82 in `HeroMotion.js` | Landing-page animated background |
| `initStickyTOC(options)` | 26 in `StickyTOC.js` | Scroll-spy for theory-page TOCs |
| `initTooltipShortcut()` | 13 in `tooltipShortcut.js` | Keyboard access for help tooltips |

## Utilities

### `js/i18n.js`

Custom JSON-based i18n (no library). Loads `locales/{lang}.json`, applies translations to `data-i18n` DOM attributes, persists selection in `localStorage['deco-theory-lang']`.

Exports (all from line 333):

| Name | Description |
|---|---|
| `initI18n()` | Detects browser language, loads translations, wires `languagechange` |
| `setLanguage(lang)` | Switches active language and fires `languagechange` |
| `getCurrentLanguage()` | Returns the active code (`'en'`, `'cs'`, `'es'`) |
| `createLanguageSwitcher(container, options)` | Renders the dropdown switcher |
| `translate(key, vars)` | Lookup by dot-notation key, supports `{0}`, `{1}` interpolation |
| `SUPPORTED_LANGS` | `['en', 'cs', 'es']` |

Locale files are in `locales/` (`en.json`, `cs.json`, `es.json`).

### `js/nav.js`

Centralised navigation menu for all HTML pages.

Exports (line 247): `initNavigation`, `NAV_ITEMS`. `NAV_ITEMS` is the authoritative menu structure (sandbox, theory, tests, about), and `initNavigation()` renders it into `.nav-links`, detects the active page, and handles subdirectory path prefixing for `/sandbox/`.

### `js/urlParams.js`

URL-based dive-setup share links.

| Export | Line | Description |
|---|---|---|
| `encodeDiveSetup(setup)` | 28 | Compact base64-ish encoding for `?p=…` |
| `decodeDiveSetup(encoded)` | 70 | Inverse |
| `getSandboxUrl(setup, options)` | 109 | Produces an "Open in Sandbox" link |
| `getChartModeFromUrl()` | 133 | Reads `?mode=…` |
| `getProfileFromUrl()` | 143 | Reads `?p=…` and decodes |
| `updateUrlWithProfile(setup)` | 155 | `history.replaceState` without reloading |

### `js/icons.js`

SVG-sprite helper.

| Export | Line | Description |
|---|---|---|
| `iconHTML(name, cls, title)` | 20 | Returns an `<svg><use …/></svg>` string |
| `iconElement(name, cls, title)` | 37 | Returns a live DOM element |

### `js/main.js`

Entry point for the legacy single-page sandbox view. No exports — executes on module load. Wires `DiveSetupEditor`-less controls directly: loads a setup, validates it with `validateProfile`, runs `calculateTissueLoading`, renders via `visualization.js`.

### `js/visualization.js`

Legacy Chart.js visualisation used by `main.js`. Modern pages use the class components in `js/charts/` instead.

| Export | Line | Description |
|---|---|---|
| `renderChart(canvas, results, visibleCompartments, gasSwitchEvents, ceilingDepths)` | 19 | One-shot chart render |
| `toggleCompartment(id, visible)` | 272 | Show/hide a compartment line |
| `showOnlyCompartments(ids)` | 289 | Isolate a selection |
| `showAllCompartments()` | 305 | Reset |
| `hideAllCompartments()` | 321 | Clear |
| `getChart()` | 338 | Access the underlying Chart instance |

### `js/quiz.js`

Generic quiz engine for the seven CMAS / SPČR quiz pages. No exports — executes on DOM load; reads `data/quiz-{name}.json` based on a URL parameter, renders questions with category filtering, shuffling, and scoring. See [Extending-DecoJS](Extending-DecoJS.md#adding-a-new-quiz) for the JSON format.

## Sandbox pages

- [`sandbox/m-values.html`](https://decotheory.eu/sandbox/m-values.html) — Two-playground sandbox for the M-value formula and its derivation. Top playground evaluates `M = a + P_amb/b`. Bottom playground exposes the analytical curves `a(t½)` and `b(t½)` with 16 ZH-L16 compartments overlaid as dots (variants A/B/C lift dots off the curves selectively).
