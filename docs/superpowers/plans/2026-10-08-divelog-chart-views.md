# Dive log chart views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the dive log analysis switch its profile chart between Profile, Pressure, Partial pressure, Tissues and Gas views, with gas lines calibrated from the logbook entry's cylinders.

**Architecture:** A pure module `js/import/recordedGas.js` turns entry gas rows + the recorded profile into setup gases (volume, start pressure, per-gas SAC). `computeGasConsumption` gains an opt-in per-gas `sacRate`. `RecordedDiveAnalysis` gets a segmented control and passes the Sandbox preset options for the chosen view to `DiveProfileChart.update()`.

**Tech Stack:** Plain ES modules, Chart.js via DiveProfileChart, node:test + the repo's custom runner (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-08-divelog-chart-views-design.md`

## Global Constraints

- No build tools; ES modules loaded directly. New .js file → add to `sw.js` STATIC_ASSETS.
- Sandbox/Theory output must not change: a gas without `sacRate` behaves exactly as before.
- en/cs/es locale parity (`locales/*.json`), Czech decimal comma through `fmtNum`, U+00A0 between number and unit, SAC upright.
- Phone first: 390 px portrait, no horizontal page scroll, touch targets ≥ 44 px; desktop; light + dark.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Entry has a gas the recording never breathed (unused stage) → ignored, no crash, no NaN.
2. Entry row with end pressure > start pressure, or zero volume → treated as no calibration (assumed SAC), never negative SAC.
3. Recording gas never breathed (∫P dt = 0) but has entry data → cylinder shown flat at start pressure, no division by zero.
4. Switching view, then dragging GF, then selecting another dive → view kept, chart not recreated.
5. Legacy entry: one row with unknown mix (`o2: null`) and a single-gas recording → row matched.

---

### Task 1: Per-gas SAC override and the recordedGas module

**Files:**
- Modify: `js/diveSetup.js` (`computeGasConsumption`, ~line 1612)
- Modify: `js/charts/chartTypes.js` (`normalizeDiveSetup`, ~line 474)
- Create: `js/import/recordedGas.js`
- Modify: `sw.js` (STATIC_ASSETS, next to `./js/import/recordedDive.js`)
- Test: `tests/recorded-dive.test.mjs` (new `describe('recordedGas', …)` block)

**Interfaces:**
- Produces:
  - `computeGasConsumption(results, gases, sacRate, decoSacRate, reservePressure)` — a gas with finite `sacRate > 0` uses it for every interval it is breathed.
  - `normalizeDiveSetup` keeps `gas.sacRate` when finite and > 0.
  - `export const ASSUMED_SAC_LPM = 20, ASSUMED_CYLINDER_L = 12, ASSUMED_START_BAR = 200;`
  - `export function matchEntryGases(setupGases, entryRows) → Array<Object|null>`
  - `export function recordedGasSetup(setupGases, entryRows, results) → { gases: Object[], assumed: string[] }`

- [ ] **Step 1: Failing tests** in `tests/recorded-dive.test.mjs`:

```js
import { matchEntryGases, recordedGasSetup, ASSUMED_SAC_LPM } from '../js/import/recordedGas.js';
import { computeGasConsumption } from '../js/diveSetup.js';
import { calculateTissueLoading } from '../js/deco/profile.js';

describe('recordedGas', () => {
    const air = { id: 'g0', name: 'Air', o2: 0.21, n2: 0.79, he: 0 };
    const ean50 = { id: 'g1', name: 'EAN50', o2: 0.5, n2: 0.5, he: 0 };
    const waypoints = [
        { time: 0, depth: 0 }, { time: 2, depth: 30, gasId: 'g0' }, { time: 20, depth: 30 },
        { time: 23, depth: 21, gasId: 'g1' }, { time: 30, depth: 6 }, { time: 40, depth: 6 }, { time: 41, depth: 0 },
    ];
    const results = calculateTissueLoading(waypoints, 0, { gases: [air, ean50] });
    const row = (o2, extra) => ({ role: 'bottom', o2, he: o2 === null ? null : 0, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null, ...extra });

    test('matches by mix, then unknown-mix rows in order', () => {
        const rows = [row(0.5, { role: 'deco' }), row(null)];
        assert.deepEqual(matchEntryGases([air, ean50], rows), [rows[1], rows[0]]);
        assert.deepEqual(matchEntryGases([air], []), [null]);
        assert.deepEqual(matchEntryGases([air], [row(0.32)]), [null]);
    });

    test('calibrated gases end at the recorded end pressure', () => {
        const rows = [row(0.21, { volumeL: 12, startBar: 200, endBar: 90 }), row(0.5, { role: 'deco', volumeL: 5.7, startBar: 200, endBar: 160 })];
        const { gases, assumed } = recordedGasSetup([air, ean50], rows, results);
        assert.deepEqual(assumed, []);
        const gc = computeGasConsumption(results, gases, 99, 99, 50);
        assert.ok(Math.abs(gc.pressureByGasId.g0 - 90) < 1e-6);
        assert.ok(Math.abs(gc.pressureByGasId.g1 - 160) < 1e-6);
        assert.equal(gases[0].cylinderVolume, 12);
    });

    test('missing end pressure or volume falls back to assumed values', () => {
        const rows = [row(0.21, { volumeL: 15, startBar: 230 }), row(0.5, { role: 'deco', startBar: 200, endBar: 150 })];
        const { gases, assumed } = recordedGasSetup([air, ean50], rows, results);
        assert.equal(gases[0].cylinderVolume, 15);
        assert.equal(gases[0].startPressure, 230);
        assert.equal(gases[0].sacRate, ASSUMED_SAC_LPM);
        assert.equal(gases[1].cylinderVolume, 12);
        assert.deepEqual(assumed, ['Air', 'EAN50']);
    });

    test('bad pressures never give a negative or infinite SAC', () => {
        const rows = [row(0.21, { volumeL: 12, startBar: 100, endBar: 150 })];
        const { gases } = recordedGasSetup([air, ean50], rows, results);
        assert.equal(gases[0].sacRate, ASSUMED_SAC_LPM);
        const unused = recordedGasSetup([air, { ...ean50, id: 'g9' }], [row(0.5, { volumeL: 7, startBar: 200, endBar: 150 })], results);
        assert.ok(Number.isFinite(unused.gases[1].sacRate) && unused.gases[1].sacRate > 0);
    });

    test('computeGasConsumption without sacRate is unchanged; normalizeDiveSetup keeps sacRate', () => {
        const plain = computeGasConsumption(results, [air, ean50], 20, 15, 50);
        const withField = computeGasConsumption(results, [air, { ...ean50, sacRate: undefined }], 20, 15, 50);
        assert.deepEqual(withField.pressureByGasId, plain.pressureByGasId);
        const n = normalizeDiveSetup({ gases: [{ ...air, sacRate: 13 }, { ...ean50, sacRate: -1 }], dives: [{ waypoints }] });
        assert.equal(n.gases[0].sacRate, 13);
        assert.equal('sacRate' in n.gases[1], false);
    });
});
```

- [ ] **Step 2:** `node --test tests/recorded-dive.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement.**

`js/diveSetup.js` inside the loop, replace `const sac = isDecoStop ? decoSacRate : sacRate;` and move the gas lookup up:

```js
                const gas = gases.find(g => g.id === currentGasId);
                const sac = Number.isFinite(gas?.sacRate) && gas.sacRate > 0
                    ? gas.sacRate // a recorded dive's per-gas SAC, calibrated from the logbook
                    : (isDecoStop ? decoSacRate : sacRate);
```
(and drop the later `const gas = …` line; document `gases[].sacRate` in the JSDoc.)

`js/charts/chartTypes.js` gas mapping: add after `startPressure`:
```js
            ...(Number.isFinite(gas.sacRate) && gas.sacRate > 0 ? { sacRate: gas.sacRate } : {})
```

`js/import/recordedGas.js`:
```js
/**
 * Cylinder data for a recorded dive's gas-consumption view.
 *
 * A recording has no tank pressure. The logbook entry may know each cylinder's volume and start/end
 * pressure; recordedGasSetup() turns that into setup gases whose modelled pressure line (the same
 * integrator the chart draws with) ends exactly at the logged end pressure. Pure: no DOM.
 */
import { computeGasConsumption } from '../diveSetup.js';

export const ASSUMED_SAC_LPM = 20;
export const ASSUMED_CYLINDER_L = 12;
export const ASSUMED_START_BAR = 200;

const sameMix = (gas, row) => Number.isFinite(row.o2)
    && Math.abs(row.o2 - gas.o2) < 0.005 && Math.abs((row.he ?? 0) - (gas.he ?? 0)) < 0.005;
const num = v => (Number.isFinite(v) ? v : null);

/** Entry row for each setup gas (same order): same mix first, then rows with unknown mix in order; null when none. */
export function matchEntryGases(setupGases, entryRows) {
    const free = [...(entryRows ?? [])];
    const take = pred => {
        const i = free.findIndex(pred);
        return i < 0 ? null : free.splice(i, 1)[0];
    };
    const out = setupGases.map(g => take(r => sameMix(g, r)));
    return out.map(r => r ?? take(row => !Number.isFinite(row.o2)));
}

/**
 * Setup gases with cylinderVolume, startPressure and sacRate for the gas view.
 * @param {Object[]} setupGases - recording gases as in a DiveSetup
 * @param {Object[]} entryRows - gasesFromEntry() rows (may be empty)
 * @param {Object} results - calculateTissueLoading() results for the recorded profile
 * @returns {{gases: Object[], assumed: string[]}} assumed: names of gases using any assumed value
 */
export function recordedGasSetup(setupGases, entryRows, results) {
    const rows = matchEntryGases(setupGases, entryRows);
    const unit = computeGasConsumption(results, setupGases.map(g => ({ ...g, cylinderVolume: 0 })), 1, 1).consumedByGasId;
    const assumed = [];
    const gases = setupGases.map((g, i) => {
        const r = rows[i];
        const volume = num(r?.volumeL) > 0 ? r.volumeL : null;
        const start = num(r?.startBar) > 0 ? r.startBar : null;
        const end = num(r?.endBar);
        const load = unit[g.id] ?? 0;
        const calibrated = volume !== null && start !== null && end !== null && end >= 0 && end < start && load > 0;
        if (!calibrated) assumed.push(g.name);
        return {
            ...g,
            cylinderVolume: volume ?? ASSUMED_CYLINDER_L,
            startPressure: start ?? ASSUMED_START_BAR,
            sacRate: calibrated ? (start - end) * volume / load : ASSUMED_SAC_LPM,
        };
    });
    return { gases, assumed };
}
```
(`end === start` is not calibrated: no SAC can be derived, the gas is listed as assumed.)

`sw.js`: add `'./js/import/recordedGas.js',` after `'./js/import/recordedDive.js',`.

- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5: Commit** `feat(dive-log): per-gas SAC calibrated from the logbook cylinders`.

### Task 2: View switcher in RecordedDiveAnalysis

**Files:**
- Modify: `js/components/RecordedDiveAnalysis.js`
- Modify: `js/logbook/LogbookApp.js` (`_showAnalysis`) — pass `entryGases: gasesFromEntry(entry)`
- Modify: `lab/dive-log.html` (styles near the other `.rda-*` rules)
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (`diveLog.view.*`, `diveLog.gasNote*`)
- Test: `tests/recorded-dive.test.mjs`, `tests/logbook.test.mjs` if it constructs the analysis

**Interfaces:**
- Consumes: `recordedGasSetup`, `ASSUMED_*` from Task 1; `analyzeRecordedDive(setup).results`.
- Produces: `export const CHART_VIEWS` — `[{ id: 'profile'|'pressure'|'pp'|'tissue'|'gas', key, fallback, options }]`; `export function chartViewOptions(viewId, { referenceCeiling, referenceCeilingLabel })` → DiveProfileChart options.

- [ ] **Step 1: Failing tests:**

```js
import { CHART_VIEWS, chartViewOptions } from '../js/components/RecordedDiveAnalysis.js';
describe('chart views', () => {
    test('five views; profile keeps the recorded overlays, others drop them', () => {
        assert.deepEqual(CHART_VIEWS.map(v => v.id), ['profile', 'pressure', 'pp', 'tissue', 'gas']);
        const ref = [{ t: 0, depth: 0 }];
        const p = chartViewOptions('profile', { referenceCeiling: ref, referenceCeilingLabel: 'x' });
        assert.equal(p.showCeiling, true); assert.equal(p.highlightCeilingViolations, true); assert.equal(p.referenceCeiling, ref);
        const g = chartViewOptions('gas', { referenceCeiling: ref, referenceCeilingLabel: 'x' });
        assert.equal(g.showGasConsumption, true); assert.equal(g.referenceCeiling, null); assert.equal(g.highlightCeilingViolations, false);
        assert.equal(chartViewOptions('tissue', {}).showTissueLoading, true);
        assert.equal(chartViewOptions('nope', {}).showCeiling, true); // unknown → profile
    });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `CHART_VIEWS` option sets copy the Sandbox presets (sandbox/index.html ~1549) with `showLabels: false`.
  - `chartViewOptions(id, ref)` = view options + `{ referenceCeiling: profile ? ref.referenceCeiling ?? null : null, referenceCeilingLabel, highlightCeilingViolations: profile }`.
  - Constructor: `entryGases = []` option → `this.entryGases`; `this.view = 'profile'`; `this.gasCache = new Map()`.
  - `_buildDom`: before `#rda-profile` inside `#rda-charts` add `<div class="rda-views" role="group" id="rda-views" aria-label="…"></div>` and `<p class="rda-note rda-gas-note" id="rda-gas-note" hidden></p>` after `#rda-profile`. Render buttons `<button type="button" class="rda-seg" data-view="…" aria-pressed="…">` in `_renderViews()` (called from `_buildDom` and `_renderAll` for language). Click → `this.view = id; _renderViews(); _renderAnalysis();`.
  - `_renderAnalysis`: when `this.view === 'gas'`, `setup.gases = this._gasSetup(dive, setup).gases` and set the gas note; else hide the note. `_gasSetup` caches per dive and chain-independent (results from `analyzeRecordedDive({...setup, initialTissuePressures: null}).results` — gas does not depend on tissues).
  - `_renderCharts` passes `chartViewOptions(this.view, …)` both to the constructor (merged with `narrowLayout: true, showDecoStops: false, showGasSwitches: true, violationToleranceM`) and to `update(setup, …)`.
  - Gas note text: all calibrated → `gasNoteLogbook` "Cylinder pressures from your logbook entry; the line between them is modelled from the depth profile." ; else `gasNoteAssumed` "No cylinder data for {0} — assumed SAC {1} l/min, {2} l cylinder filled to {3} bar. Add start and end pressure to the logbook entry to see your own." (numbers via `fmtNum`, U+00A0 before units).
  - CSS: `.rda-views` flex-wrap segmented control mirroring `.lb-seg` (44 px min height, border, `aria-pressed=true` uses `--brand`), uses only tokens so dark mode works.
  - Locales: `diveLog.view.{label,profile,pressure,pp,tissue,gas}` and `diveLog.gasNoteLogbook`, `diveLog.gasNoteAssumed` in en/cs/es. Labels: en Profile / Pressure / Partial pressure / Tissues / Gas; cs Profil / Tlak / Parciální tlak / Tkáně / Plyn; es Perfil / Presión / Presión parcial / Tejidos / Gas.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(dive-log): switch the profile chart between pressure, partial pressure, tissue and gas views`.

### Task 3: Browser verification + release (coordinator)

- Scratchpad harness page served from the worktree root on port 5519: imports `RecordedDiveAnalysis` with `embedded: true`, a fake store (listDives → summary rows from fixtures, loadDive → parsed DLF), `entryGases` with an AL80 200→70 bar row; 390 px iframe + desktop, light + dark, every view.
- Release: merge origin/main, bump version (styles.css + sw.js), PR, squash-merge, wait for pages.yml, confirm decotheory.eu.
