# Repetitive-Dive Chaining Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure `planTrip()` engine that chains multiple square dives across surface intervals (off-gassing + pre-saturation carryover), plus a minimal stacked-panel sandbox page that visualises deco growing dive-over-dive.

**Architecture:** Two small, default-preserving seams let existing model functions accept a seeded tissue state (`generateDecoProfile` in `js/diveSetup.js`, `calculateTissueLoading` in `js/decoModel.js`). A new pure module `js/tripPlanner.js` loops dives in chronological order: off-gas at the surface via the existing `simulateDepthTime` primitive, regenerate each dive's deco profile from the carried-in tissue, and carry the end-of-dive tissue forward. A new sandbox page renders one `DiveProfileChart` per dive.

**Tech Stack:** Pure ES modules, no build step. Tests live in the monolithic `tests/run-tests.mjs` (custom `describe`/`test`/`expect` runner, executed by `npm test`).

**Spec:** `docs/superpowers/specs/2026-06-15-repetitive-dive-engine-design.md`

---

## File Structure

- **Modify** `js/decoModel.js` — `calculateTissueLoading` accepts `options.initialTissuePressures` (Seam 1).
- **Modify** `js/diveSetup.js` — `generateDecoProfile` accepts `options.initialTissuePressures` + bypasses surface-NDL early-return when seeded (Seam 2).
- **Create** `js/tripPlanner.js` — pure `planTrip(diveSetup)` engine.
- **Modify** `tests/run-tests.mjs` — add `planTrip` import + a `describe('tripPlanner', ...)` block. Seam tests added to existing describe blocks.
- **Create** `sandbox/repetitive-dives.html` — minimal stacked-panel view.
- **Modify** `sw.js` — add the new page to `STATIC_ASSETS`, bump `CACHE_NAME`.
- **Modify** `css/styles.css` — bump `.version-number::after`.
- **Modify** wiki pages — `Algo-01-Ascent-Simulation.md`, `Algo-05-Multi-Gas-Switching.md`, `Module-Reference.md`.

A note on convention: `tests/run-tests.mjs` already imports `calculateTissueLoading`, `simulateDepthTime`, `generateDecoProfile`, `getInitialTissueN2`, `N2_FRACTION` near its top — reuse those imports; only `planTrip` is new.

---

## Task 1: Seam 1 — `calculateTissueLoading` accepts a seeded tissue state

**Files:**
- Modify: `js/decoModel.js:1115-1121`
- Test: `tests/run-tests.mjs` (append a `test` to a new or existing `describe`)

- [ ] **Step 1: Write the failing test**

Add this near the other `calculateTissueLoading` tests in `tests/run-tests.mjs`:

```js
describe('calculateTissueLoading - initialTissuePressures seam', () => {
    test('omitting initialTissuePressures starts at surface equilibrium', () => {
        const profile = [
            { time: 0, depth: 0 },
            { time: 2, depth: 30 },
            { time: 20, depth: 30 },
            { time: 23, depth: 0 }
        ];
        const res = calculateTissueLoading(profile, 0, {});
        const firstCompId = Object.keys(res.compartments)[0];
        const surfaceEq = getInitialTissueN2(N2_FRACTION);
        expect(res.compartments[firstCompId].pressures[0]).toBeCloseTo(surfaceEq, 4);
    });

    test('providing initialTissuePressures seeds every compartment from it', () => {
        const profile = [
            { time: 0, depth: 0 },
            { time: 2, depth: 30 },
            { time: 20, depth: 30 },
            { time: 23, depth: 0 }
        ];
        const baseline = calculateTissueLoading(profile, 0, {});
        const seed = {};
        Object.keys(baseline.compartments).forEach(id => { seed[id] = 1.5; });
        const res = calculateTissueLoading(profile, 0, { initialTissuePressures: seed });
        const firstCompId = Object.keys(res.compartments)[0];
        expect(res.compartments[firstCompId].pressures[0]).toBeCloseTo(1.5, 6);
    });
});
```

- [ ] **Step 2: Run tests to verify the new seed test fails**

Run: `npm test 2>&1 | grep -A2 "initialTissuePressures seam"`
Expected: the second test FAILS (seeded value still equals surface equilibrium, not 1.5). The first test PASSES.

- [ ] **Step 3: Implement the seam**

In `js/decoModel.js`, replace the tissue-initialisation block (currently lines 1115-1121):

```js
    // Current tissue pressures (start at surface saturation with initial gas)
    const currentPressures = {};
    const initialN2Fraction = getN2FractionAtTime(0);
    const initialN2 = getInitialTissueN2(initialN2Fraction);
    COMPARTMENTS.forEach(comp => {
        currentPressures[comp.id] = initialN2;
    });
```

with:

```js
    // Current tissue pressures. Default: surface saturation with the initial gas.
    // When options.initialTissuePressures is provided (repetitive-dive chaining),
    // seed each compartment from it instead.
    const currentPressures = {};
    const initialN2Fraction = getN2FractionAtTime(0);
    const initialN2 = getInitialTissueN2(initialN2Fraction);
    const seededPressures = options.initialTissuePressures || null;
    COMPARTMENTS.forEach(comp => {
        currentPressures[comp.id] = seededPressures
            ? seededPressures[comp.id]
            : initialN2;
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing count + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add js/decoModel.js tests/run-tests.mjs
git commit -m "feat(model): calculateTissueLoading accepts seeded initial tissue state"
```

---

## Task 2: Seam 2 — `generateDecoProfile` accepts a seeded tissue state

**Files:**
- Modify: `js/diveSetup.js:352-377`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add to `tests/run-tests.mjs`:

```js
describe('generateDecoProfile - initialTissuePressures seam', () => {
    const air = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('omitting the seed is unchanged (surface start)', () => {
        const a = generateDecoProfile(40, 30, air, 100, 100, undefined, {});
        const b = generateDecoProfile(40, 30, air, 100, 100);
        expect(a.totalDecoTime).toBe(b.totalDecoTime);
    });

    test('a pre-saturated seed increases the deco obligation', () => {
        // 30 m / 18 min from the surface is within NDL → no deco.
        const fresh = generateDecoProfile(30, 18, air, 100, 100, undefined, {});
        expect(fresh.totalDecoTime).toBe(0);

        // Same dive, but tissues already heavily loaded → must incur deco.
        const loaded = generateDecoProfile(30, 18, air, 100, 100, undefined, {});
        const seed = {};
        // Build a heavy seed from a deep prior dive's loading.
        const prior = calculateTissueLoading(
            [{ time: 0, depth: 0 }, { time: 2, depth: 45 }, { time: 25, depth: 45 }, { time: 30, depth: 0 }],
            0, { gases: air });
        Object.keys(prior.compartments).forEach(id => {
            seed[id] = prior.compartments[id].pressures.at(-1);
        });
        const res = generateDecoProfile(30, 18, air, 100, 100, undefined, { initialTissuePressures: seed });
        expect(res.totalDecoTime).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run tests to verify the seed test fails**

Run: `npm test 2>&1 | grep -A2 "pre-saturated seed"`
Expected: FAIL — `res.totalDecoTime` is still 0 because the surface-NDL early-return fires and the seed is ignored.

- [ ] **Step 3: Implement the seam**

In `js/diveSetup.js`, replace the deco-decision + tissue-init block (currently lines 351-377):

```js
    // Check if deco is required
    const requiresDeco = bottomTime > ndl;
    
    if (!requiresDeco) {
        // Within NDL - generate simple profile with safety stop
        const waypoints = generateSimpleProfile(maxDepth, bottomTime, safetyStop, options);
        // Add gasId to first bottom waypoint
        waypoints[1].gasId = bottomGas.id;
        
        return {
            waypoints,
            ndl,
            requiresDeco: false,
            decoStops: [],
            totalDecoTime: 0,
            controllingCompartment
        };
    }
    
    // Deco required - simulate to end of bottom time and generate deco schedule
    
    // Initialize tissue pressures
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(comp => {
        tissues[comp.id] = initialN2;
    });
```

with:

```js
    // Check if deco is required. The NDL here is surface-based, so it is only
    // valid when starting fresh. For repetitive dives (a seeded tissue state) we
    // cannot trust it — skip the early-return and always run the deco scheduler,
    // which reads the actual bottom tissue state (and returns zero stops + a
    // safety stop if no deco is genuinely needed).
    const seededTissues = options.initialTissuePressures || null;
    const requiresDeco = bottomTime > ndl;
    
    if (!requiresDeco && !seededTissues) {
        // Within NDL - generate simple profile with safety stop
        const waypoints = generateSimpleProfile(maxDepth, bottomTime, safetyStop, options);
        // Add gasId to first bottom waypoint
        waypoints[1].gasId = bottomGas.id;
        
        return {
            waypoints,
            ndl,
            requiresDeco: false,
            decoStops: [],
            totalDecoTime: 0,
            controllingCompartment
        };
    }
    
    // Simulate to end of bottom time and generate deco schedule.
    
    // Initialize tissue pressures (seeded for repetitive dives, else surface).
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(comp => {
        tissues[comp.id] = seededTissues ? seededTissues[comp.id] : initialN2;
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/diveSetup.js tests/run-tests.mjs
git commit -m "feat(model): generateDecoProfile accepts seeded tissue state, bypasses surface-NDL when seeded"
```

---

## Task 3: `planTrip` skeleton — single-dive parity

**Files:**
- Create: `js/tripPlanner.js`
- Modify: `tests/run-tests.mjs` (add `import { planTrip } from '../js/tripPlanner.js';` near the other module imports, ~line 175)
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add the import line near the top of `tests/run-tests.mjs` with the other imports:

```js
import { planTrip } from '../js/tripPlanner.js';
```

Then add the describe block:

```js
describe('tripPlanner - planTrip', () => {
    const gases = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];
    const sum = t => Object.values(t).reduce((a, b) => a + b, 0);

    test('single-dive trip matches a direct generateDecoProfile call', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30 }]
        };
        const trip = planTrip(setup);
        const direct = generateDecoProfile(40, 30, gases, 100, 100, undefined, {});
        expect(trip.dives).toHaveLength(1);
        expect(trip.dives[0].profile.totalDecoTime).toBe(direct.totalDecoTime);
        expect(trip.dives[0].surfaceIntervalBefore).toBe(null);
        expect(trip.conflicts).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test 2>&1 | grep -i "tripPlanner\|Cannot find\|planTrip"`
Expected: FAIL — module `../js/tripPlanner.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `js/tripPlanner.js`:

```js
/**
 * Repetitive-dive trip planner (sub-project ①).
 *
 * Chains a sequence of square dives across surface intervals: tissues off-gas at
 * the surface between dives, and each dive's deco obligation is regenerated from
 * the carried-in ("pre-saturated") tissue state.
 *
 * Pure module — no DOM, no side effects.
 */

import { generateDecoProfile } from './diveSetup.js';
import { calculateTissueLoading, simulateDepthTime, N2_FRACTION } from './decoModel.js';

/**
 * @typedef {Object} TripDive
 * @property {string} id            Stable identity (survives reshuffling).
 * @property {number} startDateTime Scheduled start, epoch minutes.
 * @property {number} maxDepth      Metres.
 * @property {number} bottomTime    Minutes from dive start until leaving max depth.
 *
 * @param {Object} diveSetup - { gases, gfLow, gfHigh, dives: TripDive[] }
 * @returns {{ dives: Array, conflicts: Array }}
 */
export function planTrip(diveSetup) {
    const gases = diveSetup.gases;
    const gfLow = diveSetup.gfLow ?? 100;
    const gfHigh = diveSetup.gfHigh ?? 100;

    const ordered = [...diveSetup.dives].sort((a, b) => a.startDateTime - b.startDateTime);

    const results = [];
    const conflicts = [];
    let tissue = null;            // { [compId]: pressure } at end of previous dive
    let prevEndDateTime = null;

    ordered.forEach((dive, i) => {
        let surfaceIntervalBefore = null;
        let seed = null;

        if (i > 0) {
            const gap = dive.startDateTime - prevEndDateTime;
            if (gap < 0) {
                conflicts.push({ diveId: dive.id, type: 'overlap', overrunMinutes: -gap });
                surfaceIntervalBefore = 0;
                seed = { ...tissue };                       // no off-gassing
            } else {
                surfaceIntervalBefore = gap;
                seed = simulateDepthTime(tissue, 0, gap, N2_FRACTION);  // off-gas on air at surface
            }
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        const profile = generateDecoProfile(
            dive.maxDepth, dive.bottomTime, gases, gfLow, gfHigh, undefined, decoOpts
        );
        const loading = calculateTissueLoading(profile.waypoints, 0, { gases, ...decoOpts });

        const startingTissue = {};
        const endTissue = {};
        Object.keys(loading.compartments).forEach(id => {
            const p = loading.compartments[id].pressures;
            startingTissue[id] = p[0];
            endTissue[id] = p[p.length - 1];
        });

        const lastWp = profile.waypoints[profile.waypoints.length - 1];
        const endDateTime = dive.startDateTime + lastWp.time;

        results.push({
            id: dive.id,
            startDateTime: dive.startDateTime,
            endDateTime,
            surfaceIntervalBefore,
            startingTissue,
            endTissue,
            profile
        });

        tissue = endTissue;
        prevEndDateTime = endDateTime;
    });

    return { dives: results, conflicts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add js/tripPlanner.js tests/run-tests.mjs
git commit -m "feat(trip): planTrip engine skeleton with single-dive parity"
```

---

## Task 4: Two-dive chaining — pre-saturation carryover

**Files:**
- Test: `tests/run-tests.mjs` (extend the `tripPlanner - planTrip` describe)

- [ ] **Step 1: Write the failing test**

Add inside the `tripPlanner - planTrip` describe block:

```js
    test('a second dive starts pre-saturated and incurs more deco', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,    maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 1000, maxDepth: 40, bottomTime: 30 }  // ~SI 925 min later
            ]
        };
        const trip = planTrip(setup);
        const [d1, d2] = trip.dives;

        // Surface interval is the real clock gap from d1's actual end.
        expect(d2.surfaceIntervalBefore).toBe(1000 - d1.endDateTime);
        // Pre-saturation: d2 starts more loaded than d1 (which started at surface eq).
        expect(sum(d2.startingTissue)).toBeGreaterThan(sum(d1.startingTissue));
        // And carries a heavier or equal deco obligation.
        expect(d2.profile.totalDecoTime).toBeGreaterThanOrEqual(d1.profile.totalDecoTime);
    });
```

> Note: `toBeGreaterThan` / `toBeGreaterThanOrEqual` already exist in the runner's `expect` (used elsewhere in `run-tests.mjs`).

- [ ] **Step 2: Run tests to verify it passes**

Run: `npm test 2>&1 | grep -A2 "pre-saturated and incurs"`
Expected: PASS — the Task 3 engine already chains correctly. (If it fails, the engine has a real bug; debug before proceeding.)

- [ ] **Step 3: No new implementation needed**

The engine from Task 3 implements this. This task locks the behaviour with a test.

- [ ] **Step 4: Confirm full suite green**

Run: `npm test 2>&1 | tail -3`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add tests/run-tests.mjs
git commit -m "test(trip): pre-saturation carryover across a surface interval"
```

---

## Task 5: Surface-interval off-gassing — monotonicity + overnight residual

**Files:**
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add inside the `tripPlanner - planTrip` describe block:

```js
    test('a longer surface interval leaves the next dive less loaded', () => {
        const make = (secondStart) => planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,           maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: secondStart, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const shortSI = make(200);   // d2 soon after d1
        const longSI  = make(2000);  // d2 much later
        const startLoad = trip => sum(trip.dives[1].startingTissue);
        expect(startLoad(longSI)).toBeLessThan(startLoad(shortSI));
    });

    test('after an overnight interval slow tissues retain residual', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,    maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 1140, maxDepth: 40, bottomTime: 30 }  // ~18 h later
            ]
        });
        const [d1, d2] = trip.dives;
        // Fresh surface-equilibrium reference (a brand-new first dive's start load).
        const fresh = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'x', startDateTime: 0, maxDepth: 40, bottomTime: 30 }]
        }).dives[0];
        // Still above a fresh start, but well below the end-of-dive-1 load.
        expect(sum(d2.startingTissue)).toBeGreaterThan(sum(fresh.startingTissue));
        expect(sum(d2.startingTissue)).toBeLessThan(sum(d1.endTissue));
    });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test 2>&1 | grep -A2 "longer surface interval\|overnight interval"`
Expected: both PASS (engine already off-gasses via `simulateDepthTime`). If either fails, debug the off-gassing path.

- [ ] **Step 3: No new implementation needed**

Behaviour-locking tests only.

- [ ] **Step 4: Confirm full suite green**

Run: `npm test 2>&1 | tail -3`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add tests/run-tests.mjs
git commit -m "test(trip): surface-interval off-gassing monotonicity and overnight residual"
```

---

## Task 6: Conflict detection — negative surface interval

**Files:**
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add inside the `tripPlanner - planTrip` describe block:

```js
    test('a dive starting before the previous one ends is flagged as a conflict', () => {
        // d1 at 40 m / 30 min ends (incl. ascent) well after t=35; start d2 at 35.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 35, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const d1End = trip.dives[0].endDateTime;
        expect(d1End).toBeGreaterThan(35);                 // precondition: there IS an overlap
        expect(trip.conflicts).toHaveLength(1);
        expect(trip.conflicts[0].diveId).toBe('d2');
        expect(trip.conflicts[0].type).toBe('overlap');
        expect(trip.conflicts[0].overrunMinutes).toBeCloseTo(d1End - 35, 4);
        expect(trip.dives[1].surfaceIntervalBefore).toBe(0);
    });
```

- [ ] **Step 2: Run tests to verify it passes**

Run: `npm test 2>&1 | grep -A2 "flagged as a conflict"`
Expected: PASS (engine implements the `gap < 0` branch). If it fails, verify the conflict branch in `js/tripPlanner.js`.

- [ ] **Step 3: No new implementation needed**

The conflict branch was written in Task 3. This locks it.

- [ ] **Step 4: Confirm full suite green**

Run: `npm test 2>&1 | tail -3`
Expected: `✅ All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add tests/run-tests.mjs
git commit -m "test(trip): negative-gap conflict detection"
```

---

## Task 7: Minimal stacked-panel sandbox page

**Files:**
- Create: `sandbox/repetitive-dives.html`
- Modify: `sw.js` (add page to `STATIC_ASSETS`, bump `CACHE_NAME`)
- Modify: `css/styles.css` (bump `.version-number::after`)

This task is UI; it is verified by a manual browser smoke test (per project rule: tests passing is not enough for ESM/HTML wiring). Keep the page minimal — hardcoded dives, no editor.

- [ ] **Step 1: Inspect an existing sandbox page for the chart-wiring pattern**

Run: `sed -n '1,40p' sandbox/chart-test.html` and note how `DiveProfileChart` is imported and instantiated (`new DiveProfileChart(container, { diveSetup, options })`), plus the `<script type="module">` + CSS include pattern. Mirror it below.

- [ ] **Step 2: Create the page**

Create `sandbox/repetitive-dives.html`. Use the same `<head>` (stylesheet link, viewport) and module-script conventions as `sandbox/chart-test.html`. Body:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repetitive Dives — DecoJS Sandbox</title>
  <link rel="stylesheet" href="../css/styles.css">
  <style>
    .trip { max-width: 900px; margin: 0 auto; padding: 1rem; }
    .dive-card { border: 1px solid var(--border-color, #ccc); border-radius: 8px; margin: 1rem 0; padding: 1rem; }
    .dive-card h2 { margin: 0 0 .25rem; font-size: 1.1rem; }
    .dive-meta { font-size: .9rem; opacity: .85; margin-bottom: .5rem; }
    .conflict { color: #b00; font-weight: 600; }
    .chart-host { height: 320px; }
  </style>
</head>
<body>
  <div class="trip">
    <h1>Repetitive Dive Planner — preview</h1>
    <p>Each panel is one dive in the trip. Surface intervals off-gas the tissues;
       later dives start pre-saturated and accrue more decompression.</p>
    <div id="panels"></div>
  </div>

  <script type="module">
    import { DiveProfileChart } from '../js/charts/DiveProfileChart.js';
    import { planTrip } from '../js/tripPlanner.js';

    const gases = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0,
                     cylinderVolume: 12, startPressure: 200 }];

    // Hardcoded 3-dive day: two morning/afternoon dives + one next-morning dive.
    const setup = {
      gases, gfLow: 100, gfHigh: 100, reservePressure: 50,
      dives: [
        { id: 'd1', startDateTime: 9 * 60,            maxDepth: 40, bottomTime: 25 }, // 09:00
        { id: 'd2', startDateTime: 13 * 60,           maxDepth: 30, bottomTime: 35 }, // 13:00
        { id: 'd3', startDateTime: (24 + 9) * 60,     maxDepth: 40, bottomTime: 25 }  // next 09:00
      ]
    };

    const fmtClock = (epochMin) => {
      const day = Math.floor(epochMin / (24 * 60)) + 1;
      const mins = epochMin % (24 * 60);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      return `Day ${day} ${hh}:${mm}`;
    };
    const fmtDur = (m) => {
      const r = Math.round(m);
      return r >= 60 ? `${Math.floor(r / 60)}h ${r % 60}m` : `${r}m`;
    };

    const trip = planTrip(setup);
    const conflictIds = new Set(trip.conflicts.map(c => c.diveId));
    const panels = document.getElementById('panels');

    trip.dives.forEach(d => {
      const card = document.createElement('div');
      card.className = 'dive-card';

      const si = d.surfaceIntervalBefore == null
        ? 'first dive'
        : (conflictIds.has(d.id)
            ? `<span class="conflict">⚠ overlaps previous dive's deco</span>`
            : `surface interval ${fmtDur(d.surfaceIntervalBefore)}`);

      card.innerHTML = `
        <h2>${d.id.toUpperCase()} — ${fmtClock(d.startDateTime)}</h2>
        <div class="dive-meta">${si} · deco ${fmtDur(d.profile.totalDecoTime)}
          · ${d.profile.decoStops.length} stop(s)</div>
        <div class="chart-host"></div>`;
      panels.appendChild(card);

      const perDiveSetup = { ...setup, dives: [{ waypoints: d.profile.waypoints }] };
      new DiveProfileChart(card.querySelector('.chart-host'), {
        diveSetup: perDiveSetup,
        options: { showLabels: true, showCeiling: true }
      });
    });
  </script>
</body>
</html>
```

> If `DiveProfileChart`'s constructor options differ from what you saw in Step 1 (e.g. it needs `showTissueLoading` or a different option name), adjust the `options` object to match `chart-test.html` — do not guess.

- [ ] **Step 3: Smoke-test in the browser (REQUIRED)**

Start the project the way the repo expects (VS Code Live Server on port 5500, or `python3 -m http.server 5500`), then open `http://localhost:5500/sandbox/repetitive-dives.html`.

Verify by eye:
- Three stacked dive panels render, each with a depth/time profile chart.
- D2 and D3 show a non-zero "deco" figure that is **≥** D1's (pre-saturation effect; D2 after a 4 h SI, D3 after an overnight SI).
- No JS console errors.

If the charts don't render, debug the `DiveProfileChart` option names against `chart-test.html` before continuing. Do not mark this step done until the page renders correctly.

- [ ] **Step 4: Register the page in the service worker + bump version**

Find the current version and the `STATIC_ASSETS` array:

Run: `grep -n "CACHE_NAME\|STATIC_ASSETS\|sandbox/" sw.js | head -20`

- Add `'./sandbox/repetitive-dives.html'` to the `STATIC_ASSETS` array (follow the exact relative-path style of the neighbouring sandbox entries).
- Bump the patch version in `sw.js` line 2: `const CACHE_NAME = 'deco-theory-X.X.(N+1)'`.
- Bump the matching version in `css/styles.css` — Run: `grep -n "version-number::after" css/styles.css` and update its `content:` value to the same new version.

- [ ] **Step 5: Final full-suite run + commit**

Run: `npm test 2>&1 | tail -3`
Expected: `✅ All tests passed!`

```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): minimal stacked-panel repetitive-dive sandbox page + version bump"
```

---

## Task 8: Wiki documentation

**Files:**
- Modify: `wiki/Module-Reference.md`, `wiki/Algo-01-Ascent-Simulation.md`, `wiki/Algo-05-Multi-Gas-Switching.md`

Per CLAUDE.md, `decoModel.js` and `diveSetup.js` are core files; their signature changes must be mirrored in the wiki. Also push the wiki to `decojs.wiki.git` (it is never automatic).

- [ ] **Step 1: Document the new `initialTissuePressures` option**

In `wiki/Algo-01-Ascent-Simulation.md` (and `Algo-05-Multi-Gas-Switching.md` where `generateDecoProfile` is described), add a short subsection noting that both `calculateTissueLoading` and `generateDecoProfile` accept an optional `options.initialTissuePressures` (a `{ [compId]: pressure }` map). When provided, the simulation starts from that loaded state instead of surface equilibrium, and `generateDecoProfile` additionally bypasses its surface-based NDL early-return. This is the seam used for repetitive-dive chaining.

- [ ] **Step 2: Add a `js/tripPlanner.js` entry to `Module-Reference.md`**

Add a `js/tripPlanner.js` row/section describing `planTrip(diveSetup) → { dives, conflicts }`: chains square dives across surface intervals, returning per-dive `startingTissue` / `endTissue` / `profile` and a list of `overlap` conflicts. Note it is a pure module built on `generateDecoProfile`, `calculateTissueLoading`, and `simulateDepthTime`.

- [ ] **Step 3: Verify citations**

Re-open `js/decoModel.js` and `js/diveSetup.js` and confirm any `file:line` references you wrote in the wiki match the post-change line numbers.

- [ ] **Step 4: Commit (and push the wiki)**

```bash
git add wiki/
git commit -m "docs(wiki): document initialTissuePressures seam and tripPlanner module"
```

Then push the wiki mirror to `decojs.wiki.git` per the project's wiki-sync process.

---

## Self-Review (completed during planning)

- **Spec coverage:** Data model → Tasks 3,7; Seam 1 → Task 1; Seam 2 → Task 2; engine algorithm (off-gas, carryover, conflict) → Tasks 3–6; minimal view → Task 7; testing cases (parity, carryover, monotonicity, overnight, conflict) → Tasks 3–6; wiki → Task 8. No gaps.
- **Placeholders:** none — every code step shows full content.
- **Type/name consistency:** `initialTissuePressures` used identically in both seams and the engine; `planTrip` return `{ dives, conflicts }` with `PerDiveResult` fields (`startingTissue`, `endTissue`, `profile`, `surfaceIntervalBefore`, `endDateTime`) consistent across Tasks 3–7; conflict shape `{ diveId, type:'overlap', overrunMinutes }` consistent between Task 3 impl and Task 6 test.
- **Risk:** both model seams are gated on the new option, so the existing suite must stay green at every commit (verified by the `npm test` step in each task).
