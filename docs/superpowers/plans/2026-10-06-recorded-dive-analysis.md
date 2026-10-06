# Recorded Dive Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sandbox page that opens recorded Divesoft dives and shows them in the existing profile, P-P and GF charts, with GF sliders that redraw limits over the fixed recorded profile and a summary of how close the dive came to them.

**Architecture:** Pure helpers in `js/import/` thin the recorded profile, prepare a DiveSetup for a chosen GF, and summarise the analysis. `DiveProfileChart` gains two opt-in overlays (the computer's logged ceiling, above-ceiling shading). A new component `js/components/RecordedDiveAnalysis.js` builds the page UI and wires the three existing charts, as `sandbox/index.html` does.

**Tech Stack:** Vanilla ES modules, Chart.js (CDN, as on other sandbox pages), Node 26 `node:test`, the existing `tests/run-tests.mjs` suite.

**Spec:** `docs/superpowers/specs/2026-10-06-recorded-dive-analysis-design.md`

## Global Constraints

- No build step and no new dependencies. Browser modules only import relative paths.
- `js/import/*.js` stay free of DOM and `node:` imports.
- Chart changes are opt-in options defaulting to off: existing pages must render exactly as before, and the existing `npm test` suite (623 tests in `run-tests.mjs`) must stay green.
- Every dive starts from fresh surface saturation (no repetitive chaining).
- The recorded profile is never altered by GF changes; only ceilings, GF lines and corridors change.
- Ceiling-violation tolerance is 0.1 m (depth shallower than ceiling − 0.1 m counts as above ceiling). Deco is "present" where ceiling > 0.05 m.
- Thinning tolerance is 0.1 m of depth.
- i18n: every new UI string is a key in `locales/en.json`, `locales/cs.json` **and** `locales/es.json` (a parity test enforces identical key sets). Static elements use `data-i18n`; dynamic text uses `translate(key, fallback)` and re-renders on the `languagechange` event dispatched on `document`.
- Notation (CLAUDE.md, `.github/instructions/notation.instructions.md`): between a number and a unit write `&nbsp;` in HTML and ` ` in JS strings (never a plain space, never a literal U+00A0). Czech strings use a decimal comma, English and Spanish a decimal point; format numbers with `fmtNum(value, decimals)` from `js/format.js`. Quantity symbols italic (`<var>p</var>`), multi-letter abbreviations (GF, NDL, TTS) upright.
- Czech UI copy keeps established English diving loanwords; do not invent calques.
- Code style: 4-space indent, single quotes, JSDoc on exported functions.
- Commits end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Picking the computer's root folder instead of `DIVELOG`** (the folder picker then returns `SUMMARY.DSM`, `SAVE/*.SSF`, `DUMP/*.DMP` and `DIVELOG/*.DLF`): only `.dlf` files are read, the others are ignored silently. Test in Task 5.
- **One corrupt file among good ones:** the good dives still load and the bad file is reported by name. Test in Task 5.
- **GF low dragged above GF high:** the pair is normalised (GF high raised to GF low), never passed inverted to the engine. Test in Task 5.
- **A dive without a deco configuration record** (no device GF): sliders and "Reset" use 100/100 and nothing throws. Test in Task 2.
- **A header-only dive (no samples) or a non-OC dive:** listed, but analysis is refused cleanly instead of throwing. Tests in Tasks 2 and 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/import/thinProfile.js` (create) | `thinProfile(waypoints, toleranceM)`: shape-preserving waypoint reduction |
| `js/import/recordedDive.js` (modify) | add `prepareRecordedSetup(dive, gf)` |
| `js/import/recordedDiveSummary.js` (create) | `analyzeRecordedDive(setup)`, `summarizeRecordedDive(analysis)`, tolerance constants |
| `js/charts/chartTypes.js` (modify) | new `DEFAULT_DIVE_PROFILE_OPTIONS` entries |
| `js/charts/DiveProfileChart.js` (modify) | `_buildRecordedOverlayDatasets()` and its call in `_render()` |
| `js/components/RecordedDiveAnalysis.js` (create) | page UI: loading, dive list, GF controls, summary, chart wiring |
| `sandbox/recorded-dive.html` (create) | page shell |
| `js/nav.js` (modify) | sandbox menu entry |
| `locales/en.json`, `cs.json`, `es.json` (modify) | strings |
| `tests/recorded-dive.test.mjs` (create) | `node:test` suite for Tasks 1–5 |
| `package.json` (modify) | add the new suite to `npm test` |

Note: the spec asked to verify `MValueChart`/`GFChart` with a thinned dive "in the plan's first task". That check needs a browser and the thinned setup, so it happens in Task 5's smoke test instead. The spec's `summarizeRecordedDive(results, ceilingDepths, gfLow, gfHigh)` signature becomes `summarizeRecordedDive({ results, ceilingDepths })`, because GF is already baked into `ceilingDepths`.

---

### Task 1: Profile thinning

**Files:**
- Create: `js/import/thinProfile.js`
- Create: `tests/recorded-dive.test.mjs`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `parseDivesoftDLF` (`js/import/divesoftDlf.js`), `toDiveSetup` (`js/import/recordedDive.js`), fixtures in `tests/fixtures/divesoft/`.
- Produces: `export function thinProfile(waypoints: {time:number(min), depth:number, gasId?:string}[], toleranceM: number): same-shaped array` — a new array containing a subset of the **same objects**, in order.

- [ ] **Step 1: Write the failing tests**

Create `tests/recorded-dive.test.mjs`:

```js
/**
 * Recorded dive analysis tests (thinning, setup preparation, summary, chart overlays, page helpers).
 * Run: node --test tests/recorded-dive.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import { toDiveSetup } from '../js/import/recordedDive.js';
import { thinProfile } from '../js/import/thinProfile.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);

function loadDive(id) {
    return parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` });
}

/** Depth of a polyline at time t (minutes), by linear interpolation. */
function depthAt(waypoints, t) {
    for (let i = 1; i < waypoints.length; i++) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        if (t <= b.time) {
            if (b.time === a.time) return b.depth;
            return a.depth + (t - a.time) / (b.time - a.time) * (b.depth - a.depth);
        }
    }
    return waypoints.at(-1).depth;
}

describe('thinProfile', () => {
    const full = toDiveSetup(loadDive('00000100')).dives[0].waypoints;
    const thin = thinProfile(full, 0.1);

    test('reduces a recorded dive to a chart-friendly size', () => {
        assert.equal(full.length, 683);
        assert.ok(thin.length >= 60 && thin.length <= 200, `${thin.length} waypoints`);
    });

    test('never deviates more than the tolerance from the original', () => {
        for (const wp of full) {
            const dev = Math.abs(depthAt(thin, wp.time) - wp.depth);
            assert.ok(dev <= 0.1 + 1e-9, `deviation ${dev} m at ${wp.time} min`);
        }
    });

    test('keeps endpoints, the deepest point and gas-switch waypoints', () => {
        assert.equal(thin[0], full[0]);
        assert.equal(thin.at(-1), full.at(-1));
        const deepest = full.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.ok(thin.includes(deepest));
        for (const wp of full.filter(w => w.gasId)) assert.ok(thin.includes(wp));
    });

    test('keeps order and returns the same objects', () => {
        for (let i = 1; i < thin.length; i++) assert.ok(thin[i].time >= thin[i - 1].time);
        for (const wp of thin) assert.ok(full.includes(wp));
    });

    test('is idempotent', () => {
        assert.deepEqual(thinProfile(thin, 0.1), thin);
    });

    test('short inputs come back unchanged (as a copy)', () => {
        const two = [{ time: 0, depth: 0 }, { time: 1, depth: 5 }];
        const out = thinProfile(two, 0.1);
        assert.deepEqual(out, two);
        assert.notEqual(out, two);
        assert.deepEqual(thinProfile([], 0.1), []);
    });

    test('a straight line collapses to its endpoints', () => {
        const line = Array.from({ length: 11 }, (_, i) => ({ time: i, depth: i * 2 }));
        assert.deepEqual(thinProfile(line, 0.1), [line[0], line[10]]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/import/thinProfile.js`.

- [ ] **Step 3: Implement**

Create `js/import/thinProfile.js`:

```js
/**
 * Shape-preserving thinning of a recorded dive profile.
 *
 * Recorded dives have a sample every second; DecoTheory's charts turn every
 * waypoint into a time step. Ramer–Douglas–Peucker keeps only the points needed
 * to stay within a depth tolerance of the original polyline.
 */

/**
 * Reduce waypoints while keeping the profile within `toleranceM` of the original.
 *
 * Always keeps the first and last waypoint, the deepest waypoint and every
 * waypoint that carries a `gasId`. Deviation is measured in depth at the same
 * time (vertical distance), so the tolerance is in metres.
 *
 * @param {Array<{time: number, depth: number, gasId?: string}>} waypoints - Time in minutes, ascending
 * @param {number} toleranceM - Maximum allowed depth deviation in metres
 * @returns {Array<Object>} A new array holding a subset of the same waypoint objects, in order
 */
export function thinProfile(waypoints, toleranceM) {
    if (waypoints.length <= 2) return waypoints.slice();

    const keep = new Uint8Array(waypoints.length);
    keep[0] = 1;
    keep[waypoints.length - 1] = 1;
    let deepest = 0;
    waypoints.forEach((wp, i) => {
        if (wp.depth > waypoints[deepest].depth) deepest = i;
        if (wp.gasId) keep[i] = 1;
    });
    keep[deepest] = 1;

    const simplify = (first, last) => {
        const a = waypoints[first];
        const b = waypoints[last];
        let maxDeviation = 0;
        let maxIndex = -1;
        for (let i = first + 1; i < last; i++) {
            const span = b.time - a.time;
            const fraction = span > 0 ? (waypoints[i].time - a.time) / span : 0;
            const deviation = Math.abs(waypoints[i].depth - (a.depth + fraction * (b.depth - a.depth)));
            if (deviation > maxDeviation) {
                maxDeviation = deviation;
                maxIndex = i;
            }
        }
        if (maxDeviation > toleranceM) {
            keep[maxIndex] = 1;
            simplify(first, maxIndex);
            simplify(maxIndex, last);
        }
    };

    let previous = 0;
    for (let i = 1; i < waypoints.length; i++) {
        if (keep[i]) {
            simplify(previous, i);
            previous = i;
        }
    }
    return waypoints.filter((_, i) => keep[i]);
}
```

Note: anchors (endpoints, deepest, gas switches) are fixed before simplifying, and each stretch between consecutive anchors is simplified on its own. Recursion depth is bounded by the number of samples between anchors (under a few thousand for any real dive).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Add the suite to `npm test`**

In `package.json`, set the `test` script to:

```json
"test": "node tests/run-tests.mjs && node --test tests/divesoft-dlf.test.mjs tests/recorded-dive.test.mjs",
```

Run: `npm test`
Expected: `623/623 passed`, then the node:test summary with `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/import/thinProfile.js tests/recorded-dive.test.mjs package.json
git commit -m "feat(import): thin recorded dive profiles for charting"
```

---

### Task 2: `prepareRecordedSetup`

**Files:**
- Modify: `js/import/recordedDive.js` (add an export at the end; add an import of `thinProfile` at the top)
- Modify: `tests/recorded-dive.test.mjs` (append)

**Interfaces:**
- Consumes: `thinProfile` (Task 1), existing `toDiveSetup(dive)`.
- Produces:
  - `export const THIN_TOLERANCE_M = 0.1`
  - `export function prepareRecordedSetup(dive, { gfLow, gfHigh } = {}): { setup, deviceCeiling, samples }`
    - `setup`: DiveSetup from `toDiveSetup(dive)` with `gfLow`/`gfHigh` overridden when given (numbers, %), and `dives[0].waypoints` thinned with `THIN_TOLERANCE_M`.
    - `deviceCeiling`: `[{ t: minutes, depth: metres }]` for every sample that has a numeric `ceiling`, unthinned.
    - `samples`: `dive.samples` (same array).

- [ ] **Step 1: Write the failing tests**

Append to `tests/recorded-dive.test.mjs` (add `prepareRecordedSetup, THIN_TOLERANCE_M` to the existing `recordedDive.js` import line):

```js
describe('prepareRecordedSetup', () => {
    test('thins the profile and keeps the device GF by default', () => {
        const dive = loadDive('00000100');
        const { setup, samples } = prepareRecordedSetup(dive);
        assert.equal(THIN_TOLERANCE_M, 0.1);
        assert.equal(setup.gfLow, 60);
        assert.equal(setup.gfHigh, 90);
        const n = setup.dives[0].waypoints.length;
        assert.ok(n >= 60 && n <= 200, `${n} waypoints`);
        assert.equal(samples, dive.samples);
    });

    test('overrides GF without touching the dive', () => {
        const dive = loadDive('00000100');
        const { setup } = prepareRecordedSetup(dive, { gfLow: 30, gfHigh: 70 });
        assert.equal(setup.gfLow, 30);
        assert.equal(setup.gfHigh, 70);
        assert.equal(dive.deco.gfLow, 60);
    });

    test('exposes the logged ceiling in minutes at full resolution', () => {
        const dive = loadDive('00000100');
        const { deviceCeiling } = prepareRecordedSetup(dive);
        assert.equal(deviceCeiling.length, dive.samples.length);
        const peak = deviceCeiling.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.equal(peak.depth, 3.1);
        const sample = dive.samples.find(s => s.ceiling === 3.1);
        assert.equal(peak.t, sample.t / 60);
    });

    test('a dive without device GF or samples does not throw', () => {
        const dive = loadDive('00000101');
        const bare = { ...dive, deco: { model: null, gfLow: null, gfHigh: null, gfAlt: null }, samples: [], events: [] };
        const { setup, deviceCeiling } = prepareRecordedSetup(bare);
        assert.equal(setup.gfLow, 100);
        assert.equal(setup.gfHigh, 100);
        assert.deepEqual(deviceCeiling, []);
        assert.deepEqual(setup.dives[0].waypoints, [{ time: 0, depth: 0 }]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: FAIL — `prepareRecordedSetup` is not exported.

- [ ] **Step 3: Implement**

At the top of `js/import/recordedDive.js` add:

```js
import { thinProfile } from './thinProfile.js';
```

Append to `js/import/recordedDive.js`:

```js
/** Depth tolerance (m) used when thinning recorded profiles for analysis. */
export const THIN_TOLERANCE_M = 0.1;

/**
 * Prepare a recorded dive for analysis at a chosen GF.
 *
 * @param {Object} dive - RecordedDive
 * @param {{gfLow?: number, gfHigh?: number}} [gf] - GF in %; defaults to the dive's own GF
 * @returns {{setup: Object, deviceCeiling: Array<{t: number, depth: number}>, samples: Array<Object>}}
 *   setup: DiveSetup with thinned waypoints; deviceCeiling: the computer's logged
 *   ceiling (t in minutes, depth in m) for drawing; samples: the dive's samples
 */
export function prepareRecordedSetup(dive, { gfLow, gfHigh } = {}) {
    const base = toDiveSetup(dive);
    const setup = {
        ...base,
        gfLow: Number.isFinite(gfLow) ? gfLow : base.gfLow,
        gfHigh: Number.isFinite(gfHigh) ? gfHigh : base.gfHigh,
        dives: [{ waypoints: thinProfile(base.dives[0].waypoints, THIN_TOLERANCE_M) }],
    };
    const deviceCeiling = dive.samples
        .filter(s => Number.isFinite(s.ceiling))
        .map(s => ({ t: s.t / 60, depth: s.ceiling }));
    return { setup, deviceCeiling, samples: dive.samples };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/recorded-dive.test.mjs` → all PASS. Then `npm test` → `623/623 passed` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/import/recordedDive.js tests/recorded-dive.test.mjs
git commit -m "feat(import): prepare recorded dives for analysis at a chosen GF"
```

---

### Task 3: Analysis and summary

**Files:**
- Create: `js/import/recordedDiveSummary.js`
- Modify: `tests/recorded-dive.test.mjs` (append)

**Interfaces:**
- Consumes: `prepareRecordedSetup` (Task 2); engine: `calculateTissueLoading` (`js/deco/profile.js`), `calculateCeilingTimeSeries(results, gfLow, gfHigh, pAnchor)` (`js/deco/ceiling.js`, GF as 0–1), `calculateMaxGF(tissuePressures, ambientPressure) → {gfMax, leadingCompartment}` (`js/deco/gradients.js`), `calculateChartGFAnchor(setup, results) → {pAnchor}` (`js/charts/chartTypes.js`, the same anchor `DiveProfileChart` uses), `getDiveSetupWaypoints`, `getDiveSetupSurfacePressure`, `getDiveSetupPressurePerMeter` (`js/diveSetup.js`).
- Produces:
  - `export const CEILING_VIOLATION_TOLERANCE_M = 0.1`
  - `export const DECO_CEILING_THRESHOLD_M = 0.05`
  - `export function analyzeRecordedDive(setup): { results, ceilingDepths }` — `results` from `calculateTissueLoading` (time in minutes), `ceilingDepths` aligned with `results.timePoints`.
  - `export function summarizeRecordedDive({ results, ceilingDepths }): { peakGf: {value, compartment, t} | null, surfaceGfEnd: {value, compartment} | null, aboveCeiling: {seconds, worstM}, deco: {maxCeiling, start, end} | null }` — GF values are fractions (1.0 = 100 % of M-value); `t`, `start`, `end` in minutes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/recorded-dive.test.mjs` (add the import at the top: `import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M, DECO_CEILING_THRESHOLD_M } from '../js/import/recordedDiveSummary.js';`):

```js
describe('analyzeRecordedDive / summarizeRecordedDive', () => {
    const dive = loadDive('00000100');
    const summaryAt = (gfLow, gfHigh) =>
        summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(dive, { gfLow, gfHigh }).setup));

    test('exports the agreed tolerances', () => {
        assert.equal(CEILING_VIOLATION_TOLERANCE_M, 0.1);
        assert.equal(DECO_CEILING_THRESHOLD_M, 0.05);
    });

    test('at the device GF 60/90 the dive stays within limits and has light deco', () => {
        const s = summaryAt(60, 90);
        assert.equal(s.aboveCeiling.seconds, 0);
        assert.equal(s.aboveCeiling.worstM, 0);
        assert.ok(s.deco, 'deco present');
        assert.ok(s.deco.maxCeiling > 1.5 && s.deco.maxCeiling < 3, `max ceiling ${s.deco.maxCeiling}`);
        assert.ok(s.deco.start < s.deco.end);
    });

    test('GF 30/70 deepens the ceiling but the recorded dive still clears it', () => {
        const strict = summaryAt(30, 70);
        const device = summaryAt(60, 90);
        assert.equal(strict.aboveCeiling.seconds, 0);
        assert.ok(strict.deco.maxCeiling > device.deco.maxCeiling + 5);
    });

    test('GF 20/50 puts part of the recorded dive above the ceiling', () => {
        const s = summaryAt(20, 50);
        assert.ok(s.aboveCeiling.seconds > 60, `${s.aboveCeiling.seconds} s`);
        assert.ok(s.aboveCeiling.worstM > 0.3, `${s.aboveCeiling.worstM} m`);
    });

    test('peak tissue GF does not depend on the GF setting', () => {
        const a = summaryAt(60, 90).peakGf;
        const b = summaryAt(20, 50).peakGf;
        assert.deepEqual(a, b);
        assert.ok(a.value > 0.3 && a.value < 1.2, `peak GF ${a.value}`);
        assert.ok(a.compartment >= 1 && a.compartment <= 16);
    });

    test('surface GF at the end is reported', () => {
        const s = summaryAt(60, 90);
        assert.ok(s.surfaceGfEnd);
        assert.ok(s.surfaceGfEnd.value > 0);
    });

    test('thinning does not move the peak ceiling by more than 0.1 m', () => {
        const thinned = analyzeRecordedDive(prepareRecordedSetup(dive).setup);
        const fullSetup = toDiveSetup(dive);
        const full = analyzeRecordedDive(fullSetup);
        const diff = Math.abs(Math.max(...thinned.ceilingDepths) - Math.max(...full.ceilingDepths));
        assert.ok(diff <= 0.1, `peak ceiling moved ${diff} m`);
    });

    test('a no-deco dive reports no deco and no violations', () => {
        const s = summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(loadDive('00000101')).setup));
        assert.equal(s.deco, null);
        assert.equal(s.aboveCeiling.seconds, 0);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `recordedDiveSummary.js`.

- [ ] **Step 3: Implement**

Create `js/import/recordedDiveSummary.js`:

```js
/**
 * Analysis of a recorded dive at a chosen GF, and the numbers shown in the
 * analysis page's summary panel.
 *
 * The ceiling series is computed exactly as DiveProfileChart computes it
 * (same GF anchor), so the summary agrees with what the chart draws.
 */

import { calculateTissueLoading } from '../deco/profile.js';
import { calculateCeilingTimeSeries } from '../deco/ceiling.js';
import { calculateMaxGF } from '../deco/gradients.js';
import { calculateChartGFAnchor } from '../charts/chartTypes.js';
import {
    getDiveSetupWaypoints,
    getDiveSetupSurfacePressure,
    getDiveSetupPressurePerMeter,
} from '../diveSetup.js';

/** Depth shallower than ceiling minus this (m) counts as above the ceiling. */
export const CEILING_VIOLATION_TOLERANCE_M = 0.1;

/** A ceiling deeper than this (m) means a deco obligation. */
export const DECO_CEILING_THRESHOLD_M = 0.05;

/**
 * Run the engine over a prepared recorded-dive setup.
 *
 * @param {Object} setup - DiveSetup (gfLow/gfHigh in %)
 * @returns {{results: Object, ceilingDepths: number[]}} Tissue loading results
 *   (time in minutes) and the ceiling at each time point
 */
export function analyzeRecordedDive(setup) {
    const results = calculateTissueLoading(getDiveSetupWaypoints(setup), setup.surfaceInterval ?? 0, {
        gases: setup.gases,
        surfacePressure: getDiveSetupSurfacePressure(setup),
        pressurePerMeter: getDiveSetupPressurePerMeter(setup),
    });
    const { pAnchor } = calculateChartGFAnchor(setup, results);
    const ceilingDepths = calculateCeilingTimeSeries(results, setup.gfLow / 100, setup.gfHigh / 100, pAnchor);
    return { results, ceilingDepths };
}

function tissuesAt(results, index) {
    const pressures = {};
    for (const id of Object.keys(results.compartments)) {
        pressures[id] = results.compartments[id].pressures[index];
    }
    return pressures;
}

/**
 * Summarise an analysed recorded dive.
 *
 * @param {{results: Object, ceilingDepths: number[]}} analysis - From analyzeRecordedDive()
 * @returns {{
 *   peakGf: {value: number, compartment: number, t: number}|null,
 *   surfaceGfEnd: {value: number, compartment: number}|null,
 *   aboveCeiling: {seconds: number, worstM: number},
 *   deco: {maxCeiling: number, start: number, end: number}|null
 * }} GF as fractions of the M-value gradient; times in minutes
 */
export function summarizeRecordedDive({ results, ceilingDepths }) {
    const { timePoints, depthPoints, ambientPressures } = results;

    let peakGf = null;
    for (let i = 0; i < timePoints.length; i++) {
        const { gfMax, leadingCompartment } = calculateMaxGF(tissuesAt(results, i), ambientPressures[i]);
        if (leadingCompartment !== null && (!peakGf || gfMax > peakGf.value)) {
            peakGf = { value: gfMax, compartment: leadingCompartment, t: timePoints[i] };
        }
    }

    const last = timePoints.length - 1;
    const surface = last >= 0 ? calculateMaxGF(tissuesAt(results, last), results.surfacePressure) : null;
    const surfaceGfEnd = surface && surface.leadingCompartment !== null
        ? { value: surface.gfMax, compartment: surface.leadingCompartment }
        : null;

    let seconds = 0;
    let worstM = 0;
    for (let i = 1; i < timePoints.length; i++) {
        const shortfall = ceilingDepths[i] - depthPoints[i];
        if (shortfall > CEILING_VIOLATION_TOLERANCE_M) {
            seconds += (timePoints[i] - timePoints[i - 1]) * 60;
            worstM = Math.max(worstM, shortfall);
        }
    }

    let deco = null;
    for (let i = 0; i < timePoints.length; i++) {
        if (ceilingDepths[i] > DECO_CEILING_THRESHOLD_M) {
            if (!deco) deco = { maxCeiling: 0, start: timePoints[i], end: timePoints[i] };
            deco.maxCeiling = Math.max(deco.maxCeiling, ceilingDepths[i]);
            deco.end = timePoints[i];
        }
    }

    return { peakGf, surfaceGfEnd, aboveCeiling: { seconds: Math.round(seconds), worstM }, deco };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/recorded-dive.test.mjs` → all PASS. Then `npm test` → green.

If an assertion on dive #100's numbers fails, print the summary and check it against the spec's measured values (60/90: deepest ceiling about 2.2 m, no violation; 30/70: about 11.5 m, no violation; 20/50: about 150 s above ceiling, worst about 0.9 m). Do not loosen the qualitative assertions; report the mismatch instead.

- [ ] **Step 5: Commit**

```bash
git add js/import/recordedDiveSummary.js tests/recorded-dive.test.mjs
git commit -m "feat(import): analyse and summarise recorded dives at a chosen GF"
```

---

### Task 4: `DiveProfileChart` overlays

**Files:**
- Modify: `js/charts/chartTypes.js` (`DEFAULT_DIVE_PROFILE_OPTIONS`, around line 272)
- Modify: `js/charts/DiveProfileChart.js` (new method; one call in `_render()` right after the "Aggregate ceiling line" block, around line 1034–1050)
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (two keys under `chart.profile`)
- Modify: `tests/recorded-dive.test.mjs` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime (the chart must not import `js/import/`).
- Produces (new options, all defaulting to off):
  - `referenceCeiling: Array<{t: number(min), depth: number(m)}> | null` (default `null`)
  - `referenceCeilingLabel: string | null` (default `null`; falls back to the translated `chart.profile.datasetReferenceCeiling`)
  - `highlightCeilingViolations: boolean` (default `false`) — needs `showCeiling: true` to have an effect
  - `violationToleranceM: number` (default `0.1`)
  - `colors.referenceCeiling` (default `'#e67e22'`), `colors.ceilingViolation` (default `'#c0392b'`)
  - method `_buildRecordedOverlayDatasets(results, ceilingDepths): Array<ChartDataset>` — returns `[]` when both overlays are off.

- [ ] **Step 1: Write the failing tests**

Append to `tests/recorded-dive.test.mjs` (add `import { DiveProfileChart } from '../js/charts/DiveProfileChart.js';` and `import { DEFAULT_DIVE_PROFILE_OPTIONS, mergeOptions } from '../js/charts/chartTypes.js';` at the top):

```js
describe('DiveProfileChart recorded-dive overlays', () => {
    const results = { timePoints: [0, 1, 2, 3], depthPoints: [10, 5, 2, 0] };
    const ceilingDepths = [0, 3, 3, 0.05];
    const build = (options) =>
        DiveProfileChart.prototype._buildRecordedOverlayDatasets.call(
            { options: mergeOptions(DEFAULT_DIVE_PROFILE_OPTIONS, options) }, results, ceilingDepths);

    test('defaults leave existing charts unchanged', () => {
        assert.equal(DEFAULT_DIVE_PROFILE_OPTIONS.referenceCeiling, null);
        assert.equal(DEFAULT_DIVE_PROFILE_OPTIONS.highlightCeilingViolations, false);
        assert.deepEqual(build({}), []);
    });

    test('draws the reference ceiling as a dashed line on the depth axis', () => {
        const [ds] = build({ referenceCeiling: [{ t: 0, depth: 0 }, { t: 2, depth: 3.1 }], referenceCeilingLabel: 'Freedom ceiling' });
        assert.equal(ds.label, 'Freedom ceiling');
        assert.deepEqual(ds.data, [{ x: 0, y: 0 }, { x: 2, y: 3.1 }]);
        assert.equal(ds.yAxisID, 'yDepth');
        assert.ok(Array.isArray(ds.borderDash));
        assert.equal(ds.fill, false);
    });

    test('shades only where depth is shallower than ceiling minus the tolerance', () => {
        const sets = build({ showCeiling: true, highlightCeilingViolations: true });
        assert.equal(sets.length, 2);
        const [depthEdge, ceilingEdge] = sets;
        // t=1: depth 5, ceiling 3 → fine; t=2: depth 2, ceiling 3 → violation; t=3: 0 vs 0.05 → within tolerance
        assert.deepEqual(depthEdge.data.map(p => p.y), [null, null, 2, null]);
        assert.deepEqual(ceilingEdge.data.map(p => p.y), [null, null, 3, null]);
        assert.equal(depthEdge.fill, '+1');
        assert.equal(depthEdge.spanGaps, false);
    });

    test('violation shading needs the ceiling to be shown', () => {
        assert.deepEqual(build({ showCeiling: false, highlightCeilingViolations: true }), []);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: FAIL — `_buildRecordedOverlayDatasets` is not a function / default options missing.

- [ ] **Step 3: Implement**

In `js/charts/chartTypes.js`, inside `DEFAULT_DIVE_PROFILE_OPTIONS`, add after `showCeiling: false,`:

```js
    referenceCeiling: null,
    referenceCeilingLabel: null,
    highlightCeilingViolations: false,
    violationToleranceM: 0.1,
```

and inside its `colors` object add:

```js
        referenceCeiling: '#e67e22',
        ceilingViolation: '#c0392b',
```

In `js/charts/DiveProfileChart.js`, add this method to the class (next to `setOptions`):

```js
    /**
     * Extra datasets for recorded dives: the dive computer's own ceiling as a
     * reference line, and shading where the recorded depth is shallower than
     * DecoTheory's ceiling. Both are opt-in options; returns [] when off.
     *
     * @param {Object} results - calculateTissueLoading() results (time in minutes)
     * @param {number[]|null} ceilingDepths - DecoTheory ceiling per time point
     * @returns {Array<Object>} Chart.js datasets
     */
    _buildRecordedOverlayDatasets(results, ceilingDepths) {
        const datasets = [];
        const { referenceCeiling, colors } = this.options;

        if (Array.isArray(referenceCeiling) && referenceCeiling.length > 0) {
            datasets.push({
                label: this.options.referenceCeilingLabel
                    ?? translate('chart.profile.datasetReferenceCeiling', 'Dive computer ceiling (m)'),
                data: referenceCeiling.map(p => ({ x: p.t, y: p.depth })),
                borderColor: colors.referenceCeiling,
                backgroundColor: 'transparent',
                fill: false,
                yAxisID: 'yDepth',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                borderDash: [2, 3],
                order: 8,
            });
        }

        if (this.options.showCeiling && this.options.highlightCeilingViolations && ceilingDepths) {
            const tolerance = this.options.violationToleranceM;
            const violated = results.timePoints.map((_, i) => ceilingDepths[i] - results.depthPoints[i] > tolerance);
            const label = translate('chart.profile.datasetCeilingViolation', 'Above ceiling');
            datasets.push({
                label,
                data: results.timePoints.map((t, i) => ({ x: t, y: violated[i] ? results.depthPoints[i] : null })),
                borderColor: colors.ceilingViolation,
                backgroundColor: colors.ceilingViolation + '55',
                fill: '+1',
                spanGaps: false,
                yAxisID: 'yDepth',
                pointRadius: 0,
                borderWidth: 2,
                order: 7,
            });
            datasets.push({
                label: `${label} (ceiling)`,
                data: results.timePoints.map((t, i) => ({ x: t, y: violated[i] ? ceilingDepths[i] : null })),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                fill: false,
                spanGaps: false,
                yAxisID: 'yDepth',
                pointRadius: 0,
                borderWidth: 0,
                order: 7,
            });
        }
        return datasets;
    }
```

In `_render()`, directly after the closing brace of the `if (this.options.showCeiling && ceilingDepths && !this.options.showTissueLoading) { datasets.push({...}); }` block, add:

```js
        datasets.push(...this._buildRecordedOverlayDatasets(results, ceilingDepths));
```

`fill: '+1'` fills to the next dataset in the array, which is why the two violation datasets are pushed together and in this order. If the chart's legend lists datasets by label, hide the helper dataset from the legend: find the existing `legend.labels.filter` in `_render()`'s Chart.js config (search for `legend`) and, if a filter exists, add `&& !item.text.endsWith('(ceiling)')`; if none exists, add `filter: (item) => !item.text.endsWith('(ceiling)')` under `plugins.legend.labels`. Keep any existing filter behaviour.

Add the two translation keys under `chart.profile` in each locale (same nesting as the existing `datasetCeiling` key):

| key | en | cs | es |
|---|---|---|---|
| `datasetReferenceCeiling` | `Dive computer ceiling (m)` | `Strop podle počítače (m)` | `Techo del ordenador (m)` |
| `datasetCeilingViolation` | `Above ceiling` | `Nad stropem` | `Por encima del techo` |

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/recorded-dive.test.mjs` → all PASS. Then `npm test` → `623/623 passed` (this includes the locale key-parity test) and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/charts/chartTypes.js js/charts/DiveProfileChart.js locales/en.json locales/cs.json locales/es.json tests/recorded-dive.test.mjs
git commit -m "feat(charts): optional dive-computer ceiling and above-ceiling shading in the profile chart"
```

---

### Task 5: Analysis page

**Files:**
- Create: `js/components/RecordedDiveAnalysis.js`
- Create: `sandbox/recorded-dive.html`
- Modify: `js/nav.js` (sandbox menu, after the `repetitive` entry around line 23)
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (`nav.sandbox.recorded` and a new `sandbox.recorded` object)
- Modify: `tests/recorded-dive.test.mjs` (append)

**Interfaces:**
- Consumes: `parseDivesoftDLF`, `DlfFormatError` (`js/import/divesoftDlf.js`); `prepareRecordedSetup` (Task 2); `analyzeRecordedDive`, `summarizeRecordedDive`, `CEILING_VIOLATION_TOLERANCE_M` (Task 3); `DiveProfileChart` options from Task 4; existing `MValueChart`, `GFChart` (`js/charts/`), `GF_PRESETS` (`js/gfPresets.js`, items `{ gfLow, gfHigh, label, labelKey, title, titleKey }`), `MIN_GF_PERCENT`, `MAX_GF_PERCENT` (`js/gfLimits.js`), `translate` (`js/i18n.js`), `fmtNum` (`js/format.js`), `escHtml` (`js/utils/escHtml.js`).
- Produces (exports of `js/components/RecordedDiveAnalysis.js`):
  - `isDlfFileName(name: string): boolean`
  - `async loadDiveFiles(files: Iterable<{name: string, arrayBuffer(): Promise<ArrayBuffer>}>): Promise<{dives: RecordedDive[], errors: {fileName: string, message: string}[]}>` — dives sorted by `source.diveNumber` (unnumbered last, then by `start.local`).
  - `clampGfPair(gfLow, gfHigh): {gfLow: number, gfHigh: number}` — integers within `[MIN_GF_PERCENT, MAX_GF_PERCENT]`, and `gfHigh >= gfLow` (raise high to low).
  - `deviceGf(dive): {gfLow, gfHigh}` — the dive's GF, or 100/100.
  - `canAnalyze(dive): boolean` — `dive.mode === 'oc' && dive.samples.length >= 2`.
  - `class RecordedDiveAnalysis { constructor(root: HTMLElement, { demoFiles?: string[] }) }`.

- [ ] **Step 1: Write the failing tests for the pure helpers**

Append to `tests/recorded-dive.test.mjs` (add `import { isDlfFileName, loadDiveFiles, clampGfPair, deviceGf, canAnalyze } from '../js/components/RecordedDiveAnalysis.js';` at the top):

```js
describe('RecordedDiveAnalysis helpers', () => {
    const fakeFile = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    const fixture = id => new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES)));

    test('only .dlf files are dive logs', () => {
        assert.ok(isDlfFileName('00000100.DLF'));
        assert.ok(isDlfFileName('dive.dlf'));
        assert.ok(!isDlfFileName('SUMMARY.DSM'));
        assert.ok(!isDlfFileName('00019302.SSF'));
        assert.ok(!isDlfFileName('DLF'));
    });

    test('loads dive logs from a picked computer root folder and ignores everything else', async () => {
        const files = [
            fakeFile('SUMMARY.DSM', new Uint8Array(16)),
            fakeFile('00019302.SSF', new Uint8Array(256)),
            fakeFile('00000101.DLF', fixture('00000101')),
            fakeFile('00000100.DLF', fixture('00000100')),
        ];
        const { dives, errors } = await loadDiveFiles(files);
        assert.deepEqual(dives.map(d => d.source.diveNumber), [100, 101]);
        assert.deepEqual(errors, []);
    });

    test('a corrupt file is reported and the others still load', async () => {
        const broken = fixture('00000101');
        broken[0] = 0;
        const { dives, errors } = await loadDiveFiles([fakeFile('00000099.DLF', broken), fakeFile('00000100.DLF', fixture('00000100'))]);
        assert.equal(dives.length, 1);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].fileName, '00000099.DLF');
        assert.ok(errors[0].message.length > 0);
    });

    test('GF pairs are clamped and never inverted', () => {
        assert.deepEqual(clampGfPair(60, 90), { gfLow: 60, gfHigh: 90 });
        assert.deepEqual(clampGfPair(95, 70), { gfLow: 95, gfHigh: 95 });
        assert.deepEqual(clampGfPair(0, 150), { gfLow: 10, gfHigh: 100 });
        assert.deepEqual(clampGfPair(33.6, 80.2), { gfLow: 34, gfHigh: 80 });
    });

    test('device GF falls back to 100/100', () => {
        assert.deepEqual(deviceGf(loadDive('00000100')), { gfLow: 60, gfHigh: 90 });
        assert.deepEqual(deviceGf({ deco: { gfLow: null, gfHigh: null } }), { gfLow: 100, gfHigh: 100 });
    });

    test('only open-circuit dives with samples can be analysed', () => {
        const dive = loadDive('00000100');
        assert.ok(canAnalyze(dive));
        assert.ok(!canAnalyze({ ...dive, mode: 'ccr' }));
        assert.ok(!canAnalyze({ ...dive, mode: 'gauge' }));
        assert.ok(!canAnalyze({ ...dive, samples: [] }));
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/recorded-dive.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `RecordedDiveAnalysis.js`.

- [ ] **Step 3: Implement the component**

Create `js/components/RecordedDiveAnalysis.js`. The module must import cleanly in Node (the tests import the helpers): do not touch `document`, `window` or `Chart` at module top level; only inside the class.

```js
/**
 * Recorded dive analysis page component.
 *
 * Opens Divesoft .DLF dive logs, lists them, and shows the selected dive in
 * DecoTheory's profile, P-P (M-value) and GF charts. GF sliders redraw the
 * limits over the fixed recorded profile; the summary panel reports how close
 * the dive came to them. Dives live only in the open page.
 */

import { parseDivesoftDLF } from '../import/divesoftDlf.js';
import { prepareRecordedSetup } from '../import/recordedDive.js';
import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M } from '../import/recordedDiveSummary.js';
import { MIN_GF_PERCENT, MAX_GF_PERCENT } from '../gfLimits.js';
import { GF_PRESETS } from '../gfPresets.js';
import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

/** True for file names that look like Divesoft dive logs. */
export function isDlfFileName(name) {
    return /.\.dlf$/i.test(name ?? '');
}

/**
 * Parse every .DLF file among `files`; skip everything else.
 *
 * @param {Iterable<{name: string, arrayBuffer: () => Promise<ArrayBuffer>}>} files
 * @returns {Promise<{dives: Object[], errors: Array<{fileName: string, message: string}>}>}
 */
export async function loadDiveFiles(files) {
    const dives = [];
    const errors = [];
    for (const file of files) {
        if (!isDlfFileName(file.name)) continue;
        try {
            dives.push(parseDivesoftDLF(await file.arrayBuffer(), { fileName: file.name }));
        } catch (error) {
            errors.push({ fileName: file.name, message: error.message || String(error) });
        }
    }
    dives.sort((a, b) => {
        const na = a.source.diveNumber ?? Infinity;
        const nb = b.source.diveNumber ?? Infinity;
        if (na !== nb) return na - nb;
        return a.start.local.localeCompare(b.start.local);
    });
    return { dives, errors };
}

/** Clamp a GF pair to the allowed range and make sure GF high is not below GF low. */
export function clampGfPair(gfLow, gfHigh) {
    const clamp = v => Math.min(MAX_GF_PERCENT, Math.max(MIN_GF_PERCENT, Math.round(Number(v) || 0)));
    const low = clamp(gfLow);
    return { gfLow: low, gfHigh: Math.max(low, clamp(gfHigh)) };
}

/** The GF the dive computer used, or 100/100 when the log has none. */
export function deviceGf(dive) {
    return { gfLow: dive.deco?.gfLow ?? 100, gfHigh: dive.deco?.gfHigh ?? 100 };
}

/** Only open-circuit dives with a profile can be analysed. */
export function canAnalyze(dive) {
    return dive.mode === 'oc' && dive.samples.length >= 2;
}

const t = (key, fallback) => translate(`sandbox.recorded.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const minSec = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export class RecordedDiveAnalysis {
    /**
     * @param {HTMLElement} root - Element the page UI is built in
     * @param {{demoFiles?: string[]}} [config] - URLs of example .DLF files loaded when nothing is picked
     */
    constructor(root, { demoFiles = [] } = {}) {
        this.root = root;
        this.demoFiles = demoFiles;
        this.dives = [];
        this.errors = [];
        this.isDemo = false;
        this.selected = null;
        this.gf = { gfLow: 100, gfHigh: 100 };
        this.charts = null;
        this._buildDom();
        document.addEventListener('languagechange', () => this._renderAll());
        this._loadDemo();
    }

    _buildDom() {
        this.root.innerHTML = `
            <section class="rda-open card">
                <label class="rda-picker"><span data-i18n="sandbox.recorded.openFolder">Open a DIVELOG folder</span>
                    <input type="file" id="rda-folder" webkitdirectory></label>
                <label class="rda-picker"><span data-i18n="sandbox.recorded.openFiles">or pick .DLF files</span>
                    <input type="file" id="rda-files" multiple accept=".dlf,.DLF"></label>
                <p class="rda-status" id="rda-status"></p>
            </section>
            <section class="rda-list card"><div class="table-scroll"><table class="rda-table">
                <thead><tr>
                    <th data-i18n="sandbox.recorded.colDive">#</th>
                    <th data-i18n="sandbox.recorded.colStart">Start (device time)</th>
                    <th data-i18n="sandbox.recorded.colDepth">Max depth</th>
                    <th data-i18n="sandbox.recorded.colDuration">Duration</th>
                    <th data-i18n="sandbox.recorded.colMode">Mode</th>
                    <th data-i18n="sandbox.recorded.colGf">GF</th>
                    <th data-i18n="sandbox.recorded.colWater">Water</th>
                    <th data-i18n="sandbox.recorded.colWarnings">Warnings</th>
                </tr></thead>
                <tbody id="rda-rows"></tbody>
            </table></div></section>
            <section class="rda-analysis" id="rda-analysis" hidden>
                <div class="rda-controls card">
                    <h2 data-i18n="sandbox.recorded.gfHeading">Gradient factors</h2>
                    <label for="rda-gf-low">GF Low <output id="rda-gf-low-out"></output></label>
                    <input type="range" id="rda-gf-low" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <label for="rda-gf-high">GF High <output id="rda-gf-high-out"></output></label>
                    <input type="range" id="rda-gf-high" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <div class="rda-presets" id="rda-presets"></div>
                    <button type="button" class="btn btn-small btn-secondary" id="rda-reset" data-i18n="sandbox.recorded.resetGf">Reset to device GF</button>
                </div>
                <div class="rda-summary card" id="rda-summary"></div>
                <p class="rda-note" id="rda-note" hidden></p>
                <div class="rda-charts" id="rda-charts">
                    <div class="chart-wrapper" id="rda-profile" style="height: 520px;"></div>
                    <div class="chart-wrapper" id="rda-mvalue" style="height: 640px;"></div>
                    <div class="chart-wrapper" id="rda-gf" style="height: 640px;"></div>
                </div>
                <details class="rda-help card">
                    <summary data-i18n="sandbox.recorded.helpHeading">How the ceilings compare</summary>
                    <p data-i18n="sandbox.recorded.helpText"></p>
                </details>
            </section>`;
        const $ = id => this.root.querySelector(`#${id}`);
        this.el = {
            status: $('rda-status'), rows: $('rda-rows'), analysis: $('rda-analysis'),
            gfLow: $('rda-gf-low'), gfHigh: $('rda-gf-high'), gfLowOut: $('rda-gf-low-out'), gfHighOut: $('rda-gf-high-out'),
            presets: $('rda-presets'), reset: $('rda-reset'), summary: $('rda-summary'), note: $('rda-note'),
            charts: $('rda-charts'), profile: $('rda-profile'), mvalue: $('rda-mvalue'), gfChart: $('rda-gf'),
        };
        const pick = async (input) => {
            const result = await loadDiveFiles(input.files);
            this.isDemo = false;
            this._setDives(result);
        };
        $('rda-folder').addEventListener('change', e => pick(e.target));
        $('rda-files').addEventListener('change', e => pick(e.target));
        const onSlider = () => this._setGf(clampGfPair(this.el.gfLow.value, this.el.gfHigh.value));
        this.el.gfLow.addEventListener('input', onSlider);
        this.el.gfHigh.addEventListener('input', onSlider);
        this.el.reset.addEventListener('click', () => this.selected && this._setGf(deviceGf(this.selected)));
        this.el.presets.innerHTML = GF_PRESETS.map(p =>
            `<button type="button" class="btn btn-small btn-secondary" data-gf-low="${p.gfLow}" data-gf-high="${p.gfHigh}">${escHtml(translate(p.labelKey, p.label))}</button>`).join('');
        this.el.presets.addEventListener('click', e => {
            const btn = e.target.closest('button[data-gf-low]');
            if (btn) this._setGf(clampGfPair(btn.dataset.gfLow, btn.dataset.gfHigh));
        });
    }

    async _loadDemo() {
        if (this.demoFiles.length === 0) return;
        const files = await Promise.all(this.demoFiles.map(async url => {
            const response = await fetch(url);
            return { name: url.split('/').pop(), arrayBuffer: () => response.arrayBuffer() };
        }));
        if (this.dives.length > 0) return; // the user picked files meanwhile
        this.isDemo = true;
        this._setDives(await loadDiveFiles(files));
    }

    _setDives({ dives, errors }) {
        this.dives = dives;
        this.errors = errors;
        this.selected = null;
        this._renderList();
        if (dives.length > 0) this._select(dives.at(-1));
        else this.el.analysis.hidden = true;
    }

    _select(dive) {
        this.selected = dive;
        this._renderList();
        this._setGf(deviceGf(dive));
    }

    _setGf(gf) {
        this.gf = gf;
        this.el.gfLow.value = gf.gfLow;
        this.el.gfHigh.value = gf.gfHigh;
        this.el.gfLowOut.textContent = `${gf.gfLow} %`;
        this.el.gfHighOut.textContent = `${gf.gfHigh} %`;
        this._renderAnalysis();
    }

    _renderAll() {
        this._renderList();
        this._renderAnalysis();
    }

    _renderList() {
        const statusParts = [];
        if (this.isDemo) statusParts.push(t('demoNote', 'Showing example dives. Open your own DIVELOG folder above.'));
        if (this.dives.length === 0) statusParts.push(t('noDives', 'No dive logs found. Pick the DIVELOG folder from the dive computer, or its .DLF files.'));
        for (const e of this.errors) statusParts.push(fill(t('unreadable', 'Could not read {0}: {1}'), e.fileName, e.message));
        this.el.status.innerHTML = statusParts.map(s => `<span>${escHtml(s)}</span>`).join('<br>');

        this.el.rows.innerHTML = '';
        for (const dive of this.dives) {
            const tr = document.createElement('tr');
            if (dive === this.selected) tr.classList.add('rda-selected');
            const gf = dive.deco?.gfLow != null ? `${dive.deco.gfLow}/${dive.deco.gfHigh}` : '–';
            tr.innerHTML = `
                <td>${escHtml(String(dive.source.diveNumber ?? dive.source.fileName))}</td>
                <td>${escHtml(dive.start.local.replace('T', ' '))}</td>
                <td class="num">${fmtNum(dive.maxDepth, 1)} m</td>
                <td class="num">${minSec(dive.duration)}</td>
                <td>${escHtml(dive.mode)}</td>
                <td>${gf}</td>
                <td>${escHtml(dive.environment.waterSetting ?? '–')}</td>
                <td class="rda-warn">${escHtml(dive.warnings.join(', '))}</td>`;
            tr.tabIndex = 0;
            tr.addEventListener('click', () => this._select(dive));
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') this._select(dive); });
            this.el.rows.appendChild(tr);
        }
    }

    _renderAnalysis() {
        const dive = this.selected;
        if (!dive) return;
        this.el.analysis.hidden = false;
        if (!canAnalyze(dive)) {
            this.el.charts.hidden = true;
            this.el.summary.innerHTML = '';
            this.el.note.hidden = false;
            this.el.note.textContent = dive.samples.length < 2
                ? t('noSamplesNote', 'This log has no depth profile to analyse.')
                : fill(t('nonOcNote', 'Analysis currently supports open-circuit dives only (this dive: {0}).'), dive.mode);
            return;
        }
        this.el.charts.hidden = false;
        const { setup, deviceCeiling } = prepareRecordedSetup(dive, this.gf);
        const summary = summarizeRecordedDive(analyzeRecordedDive(setup));
        this._renderSummary(dive, summary);
        this._renderCharts(setup, deviceCeiling, dive);
    }

    _renderSummary(dive, s) {
        const pct = v => `${fmtNum(v * 100, 0)} %`;
        const device = deviceGf(dive);
        const rows = [
            [t('peakGf', 'Peak tissue GF'), s.peakGf
                ? fill(t('peakGfValue', '{0} (compartment {1} at {2} min)'), pct(s.peakGf.value), s.peakGf.compartment, fmtNum(s.peakGf.t, 1))
                : '–'],
            [t('surfaceGf', 'Surface GF at the end'), s.surfaceGfEnd
                ? fill(t('surfaceGfValue', '{0} (compartment {1})'), pct(s.surfaceGfEnd.value), s.surfaceGfEnd.compartment)
                : '–'],
            [t('aboveCeiling', 'Time above ceiling'), s.aboveCeiling.seconds > 0
                ? fill(t('aboveCeilingValue', '{0} (up to {1} m above)'), minSec(s.aboveCeiling.seconds), fmtNum(s.aboveCeiling.worstM, 1))
                : t('aboveCeilingNone', 'none — the dive stayed below the ceiling')],
            [t('decoObligation', 'Deco obligation'), s.deco
                ? fill(t('decoValue', 'deepest ceiling {0} m, from {1} to {2} min'), fmtNum(s.deco.maxCeiling, 1), fmtNum(s.deco.start, 1), fmtNum(s.deco.end, 1))
                : t('noDeco', 'no deco')],
        ];
        this.el.summary.innerHTML = `<h2>${escHtml(t('summaryHeading', 'At this GF'))}</h2><dl>${
            rows.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>`;
        const differs = this.gf.gfLow !== device.gfLow || this.gf.gfHigh !== device.gfHigh;
        this.el.note.hidden = !differs;
        this.el.note.textContent = differs
            ? fill(t('gfDiffers', 'GF {0}/{1} differs from the GF {2}/{3} the dive computer used. Its dashed ceiling still shows its own GF.'),
                this.gf.gfLow, this.gf.gfHigh, device.gfLow, device.gfHigh)
            : '';
    }

    async _renderCharts(setup, deviceCeiling, dive) {
        if (!this.charts) {
            const [{ DiveProfileChart }, { MValueChart }, { GFChart }] = await Promise.all([
                import('../charts/DiveProfileChart.js'),
                import('../charts/MValueChart.js'),
                import('../charts/GFChart.js'),
            ]);
            if (this.charts) return this._renderCharts(setup, deviceCeiling, dive);
            this.charts = {
                profile: new DiveProfileChart(this.el.profile, {
                    diveSetup: setup,
                    options: {
                        showCeiling: true, showLabels: false, showDecoStops: false, showGasSwitches: true,
                        highlightCeilingViolations: true, violationToleranceM: CEILING_VIOLATION_TOLERANCE_M,
                        referenceCeiling: deviceCeiling.length ? deviceCeiling : null,
                        referenceCeilingLabel: this._deviceCeilingLabel(dive),
                    },
                }),
                mvalue: new MValueChart(this.el.mvalue, {
                    diveSetup: setup,
                    options: { compartments: [1], showMValueLines: true, showGFLines: true, showAmbientLine: true, showTrail: true, compartmentSelector: true },
                }),
                gf: new GFChart(this.el.gfChart, {
                    diveSetup: setup,
                    options: { compartments: [1, 2, 3, 4, 5, 6], showTrail: true, compartmentSelector: true },
                }),
            };
            this.charts.mvalue.options.onTimeIndexChange = i => this.charts.gf.setTimeIndex(i);
            this.charts.gf.options.onTimeIndexChange = i => this.charts.mvalue.setTimeIndex(i);
            return;
        }
        this.charts.profile.update(setup, {
            referenceCeiling: deviceCeiling.length ? deviceCeiling : null,
            referenceCeilingLabel: this._deviceCeilingLabel(dive),
        });
        this.charts.mvalue.update(setup);
        this.charts.gf.update(setup);
    }

    _deviceCeilingLabel(dive) {
        const gf = deviceGf(dive);
        return fill(t('deviceCeilingLabel', 'Dive computer ceiling, GF {0}/{1} (m)'), gf.gfLow, gf.gfHigh);
    }
}
```

Notes for the implementer:
- `_renderCharts` imports the chart modules lazily so the helper exports stay importable in Node without Chart.js.
- Keep the class's DOM ids prefixed `rda-` and its CSS classes prefixed `rda-`.

- [ ] **Step 4: Run the helper tests**

Run: `node --test tests/recorded-dive.test.mjs` → all PASS.

- [ ] **Step 5: Create the page shell**

Create `sandbox/recorded-dive.html`, modelled on `sandbox/tissue-saturation.html` (same `<head>` PWA and CSS links, nav block, disclaimer banner, hero, footer, nav and i18n scripts) with these differences:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recorded Dives - Deco Theory</title>
    <link rel="manifest" href="../manifest.json">
    <meta name="theme-color" content="#2980b9">
    <link rel="icon" type="image/svg+xml" href="../icons/icon.svg">
    <link rel="stylesheet" href="../css/styles.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation"></script>
    <script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom"></script>
    <style>
        .rda-root { max-width: 1200px; margin: 0 auto; padding: 1rem; display: grid; gap: 1rem; }
        .rda-open { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
        .rda-status { flex-basis: 100%; margin: 0; color: var(--text-subtle); font-size: 0.9rem; }
        .rda-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 0.9rem; }
        .rda-table th, .rda-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); text-align: left; }
        .rda-table td.num { text-align: right; }
        .rda-table tbody tr { cursor: pointer; }
        .rda-table tbody tr:hover, .rda-table tbody tr.rda-selected { background: var(--surface-sunken); }
        .rda-warn { color: var(--warning-color); font-size: 0.8rem; }
        .rda-analysis { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; }
        .rda-controls { display: grid; gap: 0.4rem; align-content: start; }
        .rda-presets { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .rda-summary dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0; }
        .rda-summary dt { color: var(--text-subtle); }
        .rda-note, .rda-charts, .rda-help { grid-column: 1 / -1; }
        .rda-charts { display: grid; gap: 1rem; }
        @media (max-width: 900px) { .rda-analysis { grid-template-columns: 1fr; } }
    </style>
</head>
<body data-i18n-title="nav.sandbox.recorded" data-i18n-title-context="nav.sandbox.label">
    <!-- nav block: copy exactly from sandbox/tissue-saturation.html -->
    <div class="disclaimer-banner" data-i18n="sandbox.recorded.disclaimerBanner">
        <strong>Educational Use Only</strong> — Replays dives recorded by a dive computer through DecoTheory's model. Not a substitute for your dive computer.
    </div>
    <header class="hero hero-compact">
        <h1 data-i18n="sandbox.recorded.title">Recorded Dives</h1>
        <p class="hero-subtitle" data-i18n="sandbox.recorded.subtitle">Open dives from a Divesoft dive computer and see them in the profile, P-P and GF charts. Change GF to see where the limits would have been.</p>
    </header>
    <main>
        <div class="rda-root"></div>
    </main>
    <footer>
        <span class="wip-badge" data-i18n="common.wipBadge">Experimental</span>
        <p data-i18n="sandbox.recorded.disclaimer"><strong>Disclaimer:</strong> For educational purposes only. Each dive starts from a fresh surface state; earlier dives the same day are not taken into account.</p>
        <span class="version-number"></span>
    </footer>
    <script src="../js/nav.js" type="module"></script>
    <script type="module">
        import { initI18n, createLanguageSwitcher } from '../js/i18n.js';
        createLanguageSwitcher();
        initI18n();
    </script>
    <script type="module">
        import { RecordedDiveAnalysis } from '../js/components/RecordedDiveAnalysis.js';
        const demoFiles = Array.from({ length: 10 }, (_, i) =>
            `../tests/fixtures/divesoft/${String(92 + i).padStart(8, '0')}.DLF`);
        new RecordedDiveAnalysis(document.querySelector('.rda-root'), { demoFiles });
    </script>
</body>
</html>
```

Replace the `<!-- nav block ... -->` comment with the `<nav class="main-nav">…</nav>` block copied verbatim from `sandbox/tissue-saturation.html`. If `css/styles.css` has no `.card`, `.btn`, `.btn-small`, `.btn-secondary` or `.table-scroll` class, check the sandbox for the equivalent class names and use those instead (do not add global CSS).

- [ ] **Step 6: Navigation and strings**

In `js/nav.js`, add after the `sandbox/repetitive-dives.html` entry:

```js
            { href: 'sandbox/recorded-dive.html', labelKey: 'nav.sandbox.recorded', label: 'Recorded Dives' },
```

Add to each locale: `nav.sandbox.recorded`, and a new `sandbox.recorded` object (sibling of `sandbox.tissue`) with exactly these keys. Use ` ` (written as the JSON escape ` `) between numbers/placeholders and units, as shown.

| key | en | cs | es |
|---|---|---|---|
| `nav.sandbox.recorded` | Recorded Dives | Zaznamenané ponory | Inmersiones registradas |
| `title` | Recorded Dives | Zaznamenané ponory | Inmersiones registradas |
| `subtitle` | Open dives from a Divesoft dive computer and see them in the profile, P-P and GF charts. Change GF to see where the limits would have been. | Otevřete ponory z počítače Divesoft a prohlédněte si je v grafu profilu, P-P diagramu a grafu GF. Změnou GF uvidíte, kde by ležely limity. | Abre inmersiones de un ordenador Divesoft y míralas en los gráficos de perfil, P-P y GF. Cambia los GF para ver dónde habrían estado los límites. |
| `disclaimerBanner` | `<strong>Educational Use Only</strong> — Replays dives recorded by a dive computer through DecoTheory's model. Not a substitute for your dive computer.` | `<strong>Pouze pro výuku</strong> — Přehrává ponory zaznamenané počítačem přes model DecoTheory. Nenahrazuje váš potápěčský počítač.` | `<strong>Solo con fines educativos</strong> — Reproduce inmersiones registradas por un ordenador de buceo con el modelo de DecoTheory. No sustituye a tu ordenador de buceo.` |
| `disclaimer` | `<strong>Disclaimer:</strong> For educational purposes only. Each dive starts from a fresh surface state; earlier dives the same day are not taken into account.` | `<strong>Upozornění:</strong> Pouze pro výuku. Každý ponor začíná z odsyceného stavu; dřívější ponory téhož dne se nezapočítávají.` | `<strong>Aviso:</strong> Solo con fines educativos. Cada inmersión parte de un estado de superficie sin carga; no se tienen en cuenta las inmersiones anteriores del mismo día.` |
| `openFolder` | Open a DIVELOG folder | Otevřít složku DIVELOG | Abrir una carpeta DIVELOG |
| `openFiles` | or pick .DLF files | nebo vybrat soubory .DLF | o elegir archivos .DLF |
| `demoNote` | Showing example dives. Open your own DIVELOG folder above. | Zobrazují se ukázkové ponory. Výše otevřete svou složku DIVELOG. | Se muestran inmersiones de ejemplo. Abre arriba tu carpeta DIVELOG. |
| `noDives` | No dive logs found. Pick the DIVELOG folder from the dive computer, or its .DLF files. | Žádné záznamy ponorů. Vyberte složku DIVELOG z počítače nebo její soubory .DLF. | No se encontraron registros. Elige la carpeta DIVELOG del ordenador o sus archivos .DLF. |
| `unreadable` | Could not read {0}: {1} | Soubor {0} nelze přečíst: {1} | No se pudo leer {0}: {1} |
| `colDive` | # | # | # |
| `colStart` | Start (device time) | Začátek (čas počítače) | Inicio (hora del ordenador) |
| `colDepth` | Max depth | Max. hloubka | Prof. máx. |
| `colDuration` | Duration | Doba | Duración |
| `colMode` | Mode | Režim | Modo |
| `colGf` | GF | GF | GF |
| `colWater` | Water | Voda | Agua |
| `colWarnings` | Warnings | Upozornění | Avisos |
| `gfHeading` | Gradient factors | Gradient faktory | Factores de gradiente |
| `resetGf` | Reset to device GF | Vrátit GF počítače | Volver a los GF del ordenador |
| `summaryHeading` | At this GF | Při tomto GF | Con estos GF |
| `peakGf` | Peak tissue GF | Nejvyšší GF tkáně | GF máximo de tejido |
| `peakGfValue` | `{0} (compartment {1} at {2} min)` | `{0} (kompartment {1} v {2} min)` | `{0} (compartimento {1} a los {2} min)` |
| `surfaceGf` | Surface GF at the end | Povrchový GF na konci | GF de superficie al final |
| `surfaceGfValue` | `{0} (compartment {1})` | `{0} (kompartment {1})` | `{0} (compartimento {1})` |
| `aboveCeiling` | Time above ceiling | Čas nad stropem | Tiempo por encima del techo |
| `aboveCeilingValue` | `{0} (up to {1} m above)` | `{0} (až {1} m nad stropem)` | `{0} (hasta {1} m por encima)` |
| `aboveCeilingNone` | none — the dive stayed below the ceiling | žádný — ponor zůstal pod stropem | ninguno — la inmersión quedó bajo el techo |
| `decoObligation` | Deco obligation | Dekompresní povinnost | Obligación de descompresión |
| `decoValue` | `deepest ceiling {0} m, from {1} to {2} min` | `nejhlubší strop {0} m, od {1} do {2} min` | `techo más profundo {0} m, de {1} a {2} min` |
| `noDeco` | no deco | bez dekomprese | sin descompresión |
| `gfDiffers` | GF {0}/{1} differs from the GF {2}/{3} the dive computer used. Its dashed ceiling still shows its own GF. | GF {0}/{1} se liší od GF {2}/{3}, který použil počítač. Jeho čárkovaný strop stále odpovídá jeho GF. | Los GF {0}/{1} difieren de los GF {2}/{3} que usó el ordenador. Su techo discontinuo sigue mostrando sus propios GF. |
| `nonOcNote` | Analysis currently supports open-circuit dives only (this dive: {0}). | Analýza zatím podporuje jen ponory na otevřeném okruhu (tento ponor: {0}). | Por ahora el análisis solo admite inmersiones en circuito abierto (esta: {0}). |
| `noSamplesNote` | This log has no depth profile to analyse. | Tento záznam nemá hloubkový profil. | Este registro no tiene perfil de profundidad. |
| `deviceCeilingLabel` | Dive computer ceiling, GF {0}/{1} (m) | Strop podle počítače, GF {0}/{1} (m) | Techo del ordenador, GF {0}/{1} (m) |
| `helpHeading` | How the ceilings compare | Jak se stropy liší | Cómo se comparan los techos |
| `helpText` | The solid ceiling is DecoTheory's, recalculated for the GF you choose. It holds GF Low until the ascent starts and then ramps to GF High. The dashed ceiling is what the dive computer logged with its own GF and its own rule; on deco dives it usually clears faster during the ascent. Changing GF never changes your tissues — only where the limit is drawn. | Plný strop počítá DecoTheory pro zvolený GF: drží GF Low až do začátku výstupu a pak přechází ke GF High. Čárkovaný strop zaznamenal počítač se svým GF a podle svého pravidla; při dekompresních ponorech během výstupu obvykle mizí rychleji. Změna GF nemění vaše tkáně — jen to, kde leží limit. | El techo continuo es el de DecoTheory, recalculado para los GF que elijas: mantiene GF Low hasta que empieza el ascenso y luego pasa a GF High. El techo discontinuo es el que registró el ordenador con sus propios GF y su propia regla; en inmersiones con descompresión suele desaparecer antes durante el ascenso. Cambiar los GF nunca cambia tus tejidos, solo dónde se dibuja el límite. |

- [ ] **Step 7: Run all tests**

Run: `node --test tests/recorded-dive.test.mjs` → PASS. Run: `npm test` → `623/623 passed` (includes locale key parity and the locale number-format check) and `ℹ fail 0`. If the locale number-format test flags a string, fix that string's decimal separator or non-breaking space; do not change the test.

- [ ] **Step 8: Browser smoke test**

Start a static server from the repo root: `python3 -m http.server 5518` (in the background), open `http://localhost:5518/sandbox/recorded-dive.html`, and check:
- the ten demo dives are listed and #101 is selected; selecting #100 shows a summary with deco and no time above ceiling;
- the profile chart shows depth, the DecoTheory ceiling and the dashed dive-computer ceiling; moving GF Low to 20 and GF High to 50 shows red shading near the end and a non-zero "Time above ceiling";
- P-P and GF charts render, their timelines step with the arrow keys and stay in sync, and stepping through about 400 time points is smooth (no per-waypoint labels cluttering the profile);
- switching the language to Czech re-renders the summary with decimal commas;
- the browser console shows no errors.

If you cannot run a browser, say so in your report; the controller runs this check.

- [ ] **Step 9: Commit**

```bash
git add js/components/RecordedDiveAnalysis.js sandbox/recorded-dive.html js/nav.js locales/en.json locales/cs.json locales/es.json tests/recorded-dive.test.mjs
git commit -m "feat(sandbox): recorded dive analysis page with GF what-if"
```
