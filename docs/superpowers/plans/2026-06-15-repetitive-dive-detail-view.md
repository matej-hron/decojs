# Repetitive-Dive Detail View + Pre-Saturation Indicators — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seeded, full-fidelity per-dive detail view (all charts + runtime table) to the repetitive-dive page, plus pre-saturation indicators expressed as the surfacing gradient factor.

**Architecture:** A pure `surfacingGF()` helper reuses the existing `calculateMaxGF` at surface ambient (no new physics). The three chart components gain a default-preserving `initialTissuePressures` seam (one line in `normalizeDiveSetup` + their single `calculateTissueLoading` call). A new `RuntimeTable` splits pure `buildRuntimeRows()` from a thin renderer. The page grows an in-page detail view driven by the trip's in-memory `planTrip` output.

**Tech Stack:** Pure ES modules, no build step. Unit tests in the monolithic `tests/run-tests.mjs` (custom `describe`/`test`/`expect`; the `.test.js` files are legacy Jest, not run). Chart components are browser-only (Chart.js via CDN) and are not exercised by the node test harness — their seeded rendering is verified by a mandatory browser smoke test.

**Spec:** `docs/superpowers/specs/2026-06-15-repetitive-dive-detail-view-design.md`
**Branch:** `feat/repetitive-dive-detail-view` (stacked on `feat/repetitive-dive-engine`).

---

## File Structure

- **Create** `js/preSaturation.js` — pure `surfacingGF(tissuePressures)` → `{ controllingPct, controllingCompartmentId, perCompartmentPct }`.
- **Modify** `js/charts/chartTypes.js` — `normalizeDiveSetup` preserves a new optional `initialTissuePressures`.
- **Modify** `js/charts/DiveProfileChart.js`, `js/charts/MValueChart.js`, `js/charts/GFChart.js` — thread `this.diveSetup.initialTissuePressures` into their single `calculateTissueLoading(...)` call.
- **Create** `js/components/RuntimeTable.js` — pure `buildRuntimeRows(profile, gases)` + a thin `renderRuntimeTable(rows)` DOM helper.
- **Modify** `sandbox/repetitive-dives.html` — overview pre-load headlines + clickable panels + in-page seeded detail view + per-tissue strip.
- **Modify** `sw.js` — register the two new JS modules; bump `CACHE_NAME`.
- **Modify** `css/styles.css` — bump `.version-number::after`.
- **Modify** `tests/run-tests.mjs` — add `surfacingGF`, `buildRuntimeRows`, and `normalizeDiveSetup`-preservation tests.

**Seed convention (resolves spec open question):** the seed lives on `diveSetup.initialTissuePressures`. Charts already read everything from `this.diveSetup`, and the detail view builds a per-dive setup, so this is the minimal consistent choice.

---

## Task 1: `surfacingGF` pre-saturation helper

**Files:**
- Create: `js/preSaturation.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `tests/run-tests.mjs` (among the existing blocks, before the final SUMMARY). `planTrip`, `getInitialTissueN2`, `N2_FRACTION`, and `COMPARTMENTS` are already imported at the top of the file. Add `import { surfacingGF } from '../js/preSaturation.js';` near the other module imports (~line 184, next to the `planTrip` import).

```js
describe('preSaturation - surfacingGF', () => {
    const gases = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('a fresh surface-equilibrium diver reads 0% on every tissue', () => {
        const fresh = {};
        COMPARTMENTS.forEach(c => { fresh[c.id] = getInitialTissueN2(N2_FRACTION); });
        const res = surfacingGF(fresh);
        expect(res.controllingPct).toBe(0);
        const maxPer = Math.max(...Object.values(res.perCompartmentPct));
        expect(maxPer).toBe(0);
        expect(Object.keys(res.perCompartmentPct).length).toBe(COMPARTMENTS.length);
    });

    test('a pre-saturated diver reads > 0%, and the controlling value is the max', () => {
        // Build a loaded tissue state from a 2-dive trip's second-dive start.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,   maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 200, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const loaded = trip.dives[1].startingTissue;
        const res = surfacingGF(loaded);
        expect(res.controllingPct).toBeGreaterThan(0);
        const maxPer = Math.max(...Object.values(res.perCompartmentPct));
        expect(res.controllingPct).toBeCloseTo(maxPer, 9);
        expect(res.perCompartmentPct[res.controllingCompartmentId]).toBeCloseTo(maxPer, 9);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -i "surfacingGF\|Cannot find\|preSaturation"`
Expected: FAIL — module `../js/preSaturation.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `js/preSaturation.js`:

```js
/**
 * Pre-saturation expressed as the surfacing gradient factor.
 *
 * "If you ascended straight to the surface right now, how close to each tissue's
 * Bühlmann limit are you." 0% = off-gassed to a fresh-diver baseline (clamped);
 * 100% = at the surfacing M-value limit. This is the same gradient factor the GF
 * chart shows, read at surface ambient — no new decompression math.
 *
 * Pure module — no DOM, no side effects.
 */

import { calculateMaxGF, getAmbientPressure } from './decoModel.js';

/**
 * @param {Object} tissuePressures - { [compartmentId]: nitrogen pressure (bar) }
 * @returns {{
 *   controllingPct: number,            // max surfacing GF across tissues, clamped at 0, as %
 *   controllingCompartmentId: number,  // the leading (max-GF) compartment id
 *   perCompartmentPct: Object          // { [compartmentId]: clamped surfacing GF % }
 * }}
 */
export function surfacingGF(tissuePressures) {
    const surfaceAmbient = getAmbientPressure(0);
    const { gfMax, leadingCompartment, allGFs } = calculateMaxGF(tissuePressures, surfaceAmbient);
    const clampPct = (g) => Math.max(0, g) * 100;

    const perCompartmentPct = {};
    for (const id of Object.keys(allGFs)) {
        perCompartmentPct[id] = clampPct(allGFs[id]);
    }

    return {
        controllingPct: clampPct(gfMax),
        controllingCompartmentId: leadingCompartment,
        perCompartmentPct
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 2 new).

- [ ] **Step 5: Commit**

```bash
git add js/preSaturation.js tests/run-tests.mjs
git commit -m "feat(trip): surfacingGF pre-saturation helper"
```

---

## Task 2: Seed-aware chart components

**Files:**
- Modify: `js/charts/chartTypes.js:322` (inside `normalizeDiveSetup`)
- Modify: `js/charts/DiveProfileChart.js:842`, `js/charts/MValueChart.js:899`, `js/charts/GFChart.js:871`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add to `tests/run-tests.mjs`. Add `import { normalizeDiveSetup } from '../js/charts/chartTypes.js';` near the other imports (chartTypes.js has no imports of its own, so it loads cleanly in node).

```js
describe('normalizeDiveSetup - initialTissuePressures preservation', () => {
    const base = {
        gases: [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902 }],
        dives: [{ waypoints: [{ time: 0, depth: 0 }, { time: 2, depth: 30 }, { time: 20, depth: 30 }, { time: 23, depth: 0 }] }]
    };

    test('defaults initialTissuePressures to null when absent', () => {
        const norm = normalizeDiveSetup({ ...base });
        expect(norm.initialTissuePressures).toBe(null);
    });

    test('preserves initialTissuePressures when present', () => {
        const seed = { 1: 1.5, 2: 1.4 };
        const norm = normalizeDiveSetup({ ...base, initialTissuePressures: seed });
        expect(norm.initialTissuePressures).toBe(seed);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "initialTissuePressures preservation"`
Expected: FAIL — `norm.initialTissuePressures` is `undefined` (the field is stripped by `normalizeDiveSetup`).

- [ ] **Step 3a: Preserve the field in `normalizeDiveSetup`**

In `js/charts/chartTypes.js`, in the object returned by `normalizeDiveSetup` (currently ends with `dives: setup.dives` on line 322), add a line after `dives: setup.dives`:

```js
        dives: setup.dives,
        initialTissuePressures: setup.initialTissuePressures ?? null
    };
```

(The closing `};` already exists — insert the new property before it and add the comma to the `dives` line as shown.)

- [ ] **Step 3b: Thread the seed into each chart's tissue calculation**

In `js/charts/DiveProfileChart.js` line 842, change:

```js
        const results = calculateTissueLoading(waypoints, surfaceInterval, { gases });
```

to:

```js
        const results = calculateTissueLoading(waypoints, surfaceInterval, { gases, initialTissuePressures: this.diveSetup.initialTissuePressures });
```

In `js/charts/MValueChart.js` line 899, change:

```js
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases });
```

to:

```js
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases, initialTissuePressures: this.diveSetup.initialTissuePressures });
```

In `js/charts/GFChart.js` line 871, change:

```js
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases });
```

to:

```js
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases, initialTissuePressures: this.diveSetup.initialTissuePressures });
```

(`initialTissuePressures` is `null` for every existing caller, and the `calculateTissueLoading` seam treats `null` as "use surface equilibrium", so all existing pages are byte-for-byte unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 2 new). The existing suite staying green confirms the chart change is default-preserving.

- [ ] **Step 5: Commit**

```bash
git add js/charts/chartTypes.js js/charts/DiveProfileChart.js js/charts/MValueChart.js js/charts/GFChart.js tests/run-tests.mjs
git commit -m "feat(charts): optional initialTissuePressures seed threaded through profile/M-value/GF charts"
```

---

## Task 3: `RuntimeTable` — pure rows + renderer

**Files:**
- Create: `js/components/RuntimeTable.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing test**

Add to `tests/run-tests.mjs`. Add `import { buildRuntimeRows } from '../js/components/RuntimeTable.js';` near the other imports. `generateDecoProfile` is already imported.

```js
describe('RuntimeTable - buildRuntimeRows', () => {
    const air = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('derives ordered rows from a deco dive profile', () => {
        const profile = generateDecoProfile(40, 30, air, 30, 70); // GF 30/70 → real deco
        const rows = buildRuntimeRows(profile, air);

        // Non-empty, first segment is the descent.
        expect(rows.length > 0).toBe(true);
        expect(rows[0].phase).toBe('descent');

        // runTime is non-decreasing and the final row surfaces at depth 0.
        let prev = 0;
        rows.forEach(r => { expect(r.runTime >= prev).toBe(true); prev = r.runTime; });
        expect(rows[rows.length - 1].depth).toBe(0);

        // Segment times partition the timeline: sum == last waypoint time.
        const totalSeg = rows.reduce((s, r) => s + r.segmentTime, 0);
        const lastWpTime = profile.waypoints[profile.waypoints.length - 1].time;
        expect(totalSeg).toBeCloseTo(lastWpTime, 6);

        // Every deco stop appears as a stop row.
        const stopRows = rows.filter(r => r.isStop);
        expect(stopRows.length >= profile.decoStops.length).toBe(true);

        // Every row carries a gas name.
        rows.forEach(r => expect(typeof r.gas).toBe('string'));
    });

    test('an NDL dive (no deco) still produces a descent + bottom + ascent', () => {
        const profile = generateDecoProfile(18, 30, air, 100, 100); // within NDL
        const rows = buildRuntimeRows(profile, air);
        expect(rows[0].phase).toBe('descent');
        expect(rows.some(r => r.phase === 'bottom')).toBe(true);
        expect(rows[rows.length - 1].depth).toBe(0);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -i "buildRuntimeRows\|Cannot find\|RuntimeTable"`
Expected: FAIL — module `../js/components/RuntimeTable.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `js/components/RuntimeTable.js`:

```js
/**
 * Runtime table for a single executed dive profile.
 *
 * Splits the pure row-derivation (`buildRuntimeRows`) from DOM rendering
 * (`renderRuntimeTable`) so the logic is unit-testable without a browser.
 */

/**
 * Derive ordered runtime rows from an executed dive profile.
 *
 * @param {Object} profile - generateDecoProfile result: { waypoints, decoStops, ... }.
 *                           waypoints: [{ time, depth, gasId? }] with absolute times
 *                           (minutes from dive start); the last waypoint is the surface.
 * @param {Array}  gases   - [{ id, name, ... }]; gases[0] is the starting gas.
 * @returns {Array<{phase:string, depth:number, segmentTime:number, runTime:number, gas:string, isStop:boolean}>}
 */
export function buildRuntimeRows(profile, gases) {
    const waypoints = profile.waypoints;
    const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
    const gasName = (id) => {
        const g = (gases || []).find(x => x.id === id);
        return g ? g.name : (gases && gases[0] ? gases[0].name : 'Gas');
    };

    let currentGasId = (waypoints[0] && waypoints[0].gasId) || (gases && gases[0] && gases[0].id);
    const rows = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
        const wp1 = waypoints[i];
        const wp2 = waypoints[i + 1];

        // A gas switch is marked on the waypoint where it takes effect.
        if (wp1.gasId) currentGasId = wp1.gasId;

        const segmentTime = wp2.time - wp1.time;
        if (segmentTime <= 0) continue; // skip zero-length (e.g. in-transit gas-switch markers)

        let phase;
        let depth;
        if (wp2.depth > wp1.depth) {
            phase = 'descent';
            depth = wp2.depth;
        } else if (wp2.depth < wp1.depth) {
            phase = 'ascent';
            depth = wp2.depth;
        } else {
            phase = wp1.depth === maxDepth ? 'bottom' : 'stop';
            depth = wp1.depth;
        }

        rows.push({
            phase,
            depth,
            segmentTime,
            runTime: wp2.time,
            gas: gasName(currentGasId),
            isStop: phase === 'stop'
        });
    }

    return rows;
}

/**
 * Render rows into a <table> element. DOM-only (verified via browser smoke test).
 * @param {Array} rows - output of buildRuntimeRows
 * @returns {HTMLTableElement}
 */
export function renderRuntimeTable(rows) {
    const table = document.createElement('table');
    table.className = 'runtime-table';
    const fmt = (n) => (Math.round(n * 10) / 10);
    const phaseLabel = { descent: 'Descent', bottom: 'Bottom', ascent: 'Ascent', stop: 'Deco stop' };

    table.innerHTML = `
        <thead>
            <tr><th>Phase</th><th>Depth (m)</th><th>Seg (min)</th><th>Run (min)</th><th>Gas</th></tr>
        </thead>
        <tbody>
            ${rows.map(r => `
                <tr${r.isStop ? ' class="is-stop"' : ''}>
                    <td>${phaseLabel[r.phase] || r.phase}</td>
                    <td>${fmt(r.depth)}</td>
                    <td>${fmt(r.segmentTime)}</td>
                    <td>${fmt(r.runTime)}</td>
                    <td>${r.gas}</td>
                </tr>`).join('')}
        </tbody>`;
    return table;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 2 new).

- [ ] **Step 5: Commit**

```bash
git add js/components/RuntimeTable.js tests/run-tests.mjs
git commit -m "feat(trip): RuntimeTable with pure buildRuntimeRows + renderer"
```

---

## Task 4: Detail view + pre-saturation indicators in the page

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js` (register new modules, bump `CACHE_NAME`)
- Modify: `css/styles.css` (bump `.version-number::after`)

This task is UI; it is verified by a mandatory browser smoke test (project policy). Keep the dives hardcoded (no editor).

- [ ] **Step 1: Read the current page**

Read `sandbox/repetitive-dives.html` in full to see its current structure (the `setup`, the `planTrip(setup)` call, the `fmtClock`/`fmtDur` helpers, and how each `.dive-card` + `.chart-host` is built). You will refactor the per-dive rendering to add a pre-load headline + a click-through detail view, reusing those helpers.

- [ ] **Step 2: Add imports + pre-load headline + clickable panels**

In the page's `<script type="module">`, add to the imports:

```js
    import { MValueChart } from '../js/charts/MValueChart.js';
    import { GFChart } from '../js/charts/GFChart.js';
    import { surfacingGF } from '../js/preSaturation.js';
    import { buildRuntimeRows, renderRuntimeTable } from '../js/components/RuntimeTable.js';
    import { COMPARTMENTS } from '../js/tissueCompartments.js';
```

In the `trip.dives.forEach(...)` overview loop, compute the pre-load headline for each dive and add it to the `.dive-meta` line, and make each card open the detail view on click. Replace the existing meta line construction with:

```js
      const pre = d.surfaceIntervalBefore == null
        ? 'fresh'
        : `pre-load ${Math.round(surfacingGF(d.startingTissue).controllingPct)}% ` +
          `(tissue #${surfacingGF(d.startingTissue).controllingCompartmentId})`;

      card.innerHTML = `
        <h2>${d.id.toUpperCase()} — ${fmtClock(d.startDateTime)}</h2>
        <div class="dive-meta">${si} · deco ${fmtDur(d.profile.totalDecoTime)}
          · ${d.profile.decoStops.length} stop(s) · ${pre}</div>
        <div class="chart-host"></div>
        <button class="view-detail" data-dive="${d.id}">View detail →</button>`;
```

Wire the button after appending the card:

```js
      card.querySelector('.view-detail').addEventListener('click', () => showDetail(d.id));
```

- [ ] **Step 3: Add the detail container + view-swap + detail rendering**

In the `<body>`, after the `<div id="panels"></div>` (inside `.trip`), add:

```html
    <div id="detail" style="display:none;"></div>
```

In the script, after the overview loop, add the detail logic. `trip` is already in scope:

```js
    const overview = document.getElementById('panels');
    const detail = document.getElementById('detail');

    function showOverview() {
      detail.style.display = 'none';
      detail.innerHTML = '';
      overview.style.display = '';
    }

    function presatStrip(startingTissue) {
      const per = surfacingGF(startingTissue).perCompartmentPct;
      const bars = COMPARTMENTS.map(c => {
        const pct = Math.min(100, per[c.id] || 0);
        return `<span class="presat-bar" title="#${c.id} (${c.halfTime}min): ${Math.round(pct)}%"
                   style="height:${pct}%;background:${c.color};"></span>`;
      }).join('');
      return `<div class="presat-strip-wrap">
                <div class="presat-strip">${bars}</div>
                <div class="presat-axis"><span>fast</span><span>slow</span></div>
              </div>`;
    }

    function showDetail(diveId) {
      const d = trip.dives.find(x => x.id === diveId);
      if (!d) return;
      overview.style.display = 'none';
      detail.style.display = '';

      const seededSetup = { ...setup, dives: [{ waypoints: d.profile.waypoints }], initialTissuePressures: d.startingTissue };
      const siLine = d.surfaceIntervalBefore == null ? 'first dive' : `surface interval ${fmtDur(d.surfaceIntervalBefore)}`;

      detail.innerHTML = `
        <button class="back-to-trip">← back to trip</button>
        <h2>${d.id.toUpperCase()} — ${fmtClock(d.startDateTime)}</h2>
        <div class="dive-meta">${siLine} · deco ${fmtDur(d.profile.totalDecoTime)}</div>
        <h3>Pre-saturation at start (surfacing GF per tissue)</h3>
        ${d.surfaceIntervalBefore == null ? '<p>Fresh diver — no residual loading.</p>' : presatStrip(d.startingTissue)}
        <h3>Dive profile</h3><div class="chart-host" id="dv-profile"></div>
        <h3>M-value loading</h3><div class="chart-host" id="dv-mvalue"></div>
        <h3>Gradient factor</h3><div class="chart-host" id="dv-gf"></div>
        <h3>Runtime</h3><div id="dv-runtime"></div>`;

      detail.querySelector('.back-to-trip').addEventListener('click', showOverview);

      new DiveProfileChart(detail.querySelector('#dv-profile'), {
        diveSetup: seededSetup, options: { showLabels: true, showCeiling: true }
      });
      new MValueChart(detail.querySelector('#dv-mvalue'), { diveSetup: seededSetup, options: {} });
      new GFChart(detail.querySelector('#dv-gf'), { diveSetup: seededSetup, options: {} });

      const rows = buildRuntimeRows(d.profile, setup.gases);
      detail.querySelector('#dv-runtime').appendChild(renderRuntimeTable(rows));
    }
```

> Reconcile the `MValueChart` / `GFChart` constructor option objects with their real usage in `sandbox/index.html` (lines ~1219–1240) — pass whatever required options they expect there. Do NOT guess option names; mirror the working sandbox usage.

- [ ] **Step 4: Add minimal styles for the strip + table**

In the page's `<style>` block, add:

```css
    .presat-strip-wrap { max-width: 480px; }
    .presat-strip { display:flex; align-items:flex-end; gap:2px; height:80px;
                    border-bottom:1px solid var(--border-color,#ccc); }
    .presat-bar { flex:1 1 0; min-height:1px; border-radius:2px 2px 0 0; }
    .presat-axis { display:flex; justify-content:space-between; font-size:.75rem; opacity:.7; }
    .runtime-table { border-collapse:collapse; width:100%; max-width:560px; font-size:.9rem; }
    .runtime-table th, .runtime-table td { border:1px solid var(--border-color,#ccc); padding:.25rem .5rem; text-align:right; }
    .runtime-table th:first-child, .runtime-table td:first-child { text-align:left; }
    .runtime-table tr.is-stop { font-weight:600; }
    .view-detail, .back-to-trip { margin-top:.5rem; cursor:pointer; }
```

- [ ] **Step 5: Browser smoke test (REQUIRED)**

Serve the repo (`python3 -m http.server 5500` from repo root) and use a headless browser (the `example-skills:webapp-testing` Playwright skill, or a short Playwright script) to navigate to `http://localhost:5500/sandbox/repetitive-dives.html`. Assert ALL of:
1. ZERO console errors and ZERO page/runtime errors.
2. Overview shows three panels; D2 and D3 show a non-zero `pre-load NN%` headline (D1 shows `fresh`).
3. Clicking "View detail →" on D3 shows the detail view with: a pre-saturation strip (16 bars), THREE rendered charts (profile, M-value, GF — each a `<canvas>`), and a runtime table with multiple rows.
4. The detail view's deco figure for D3 matches the overview's deco figure for D3 (seeding consistency).
5. "← back to trip" returns to the overview.
Capture a screenshot of the D3 detail view. Stop the server when done. If anything throws or a chart doesn't render, debug against `sandbox/index.html`'s chart usage before continuing — do not commit a broken page.

- [ ] **Step 6: Register modules + bump version**

- Run `grep -n "CACHE_NAME\|./js/tripPlanner.js" sw.js`.
- Add `'./js/preSaturation.js',` and `'./js/components/RuntimeTable.js',` to `STATIC_ASSETS`, matching the path style of neighbours (e.g. near `./js/tripPlanner.js` and the other `./js/components/*`).
- Bump `sw.js` line 2 `CACHE_NAME` from `deco-theory-0.6.5` to `deco-theory-0.6.6`.
- Run `grep -n "version-number::after" css/styles.css` and update its `content:` value to `"0.6.6"`.

- [ ] **Step 7: Final test run + commit**

Run: `npm test 2>&1 | tail -3` → expect `✅ All tests passed!`.

```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): seeded per-dive detail view + pre-saturation indicators"
```

---

## Task 5: Wiki documentation

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document the new modules + chart option**

In `wiki/Module-Reference.md`:
- Add a `js/preSaturation.js` entry: `surfacingGF(tissuePressures) → { controllingPct, controllingCompartmentId, perCompartmentPct }` — surfacing gradient factor per tissue (reuses `calculateMaxGF` at surface ambient), used by the repetitive-dive detail view to express pre-saturation.
- Add a `js/components/RuntimeTable.js` entry: pure `buildRuntimeRows(profile, gases)` + `renderRuntimeTable(rows)`.
- Note that `DiveProfileChart`/`MValueChart`/`GFChart` (and `normalizeDiveSetup`) now accept an optional `initialTissuePressures` to seed the tissue state (default `null` = surface equilibrium, behaviour unchanged).

- [ ] **Step 2: Verify citations + commit**

Re-open the touched source files and confirm any `file:line` references are accurate. Then:

```bash
git add wiki/
git commit -m "docs(wiki): document preSaturation, RuntimeTable, and chart initialTissuePressures option"
```

(Do not push to the GitHub wiki remote — the controller handles wiki-remote sync.)

---

## Self-Review (completed during planning)

- **Spec coverage:** Pre-saturation metric → Task 1; seed-aware charts → Task 2; runtime table → Task 3; detail view + overview headline + per-tissue strip + version/sw.js → Task 4; wiki → Task 5. Seed convention decided (`diveSetup.initialTissuePressures`). Per-tissue strip uses `COMPARTMENTS` order (already fast→slow). No gaps.
- **Placeholder scan:** none — every code step is concrete.
- **Type/name consistency:** `initialTissuePressures` used identically in `normalizeDiveSetup`, all three charts, and the seeded detail setup; `surfacingGF` return shape (`controllingPct`/`controllingCompartmentId`/`perCompartmentPct`) consistent across Task 1 tests, the overview headline, and `presatStrip`; `buildRuntimeRows` row shape (`phase`/`depth`/`segmentTime`/`runTime`/`gas`/`isStop`) consistent between Task 3 and `renderRuntimeTable`.
- **Risk:** chart components aren't node-testable; their seeded rendering is covered by the mandatory browser smoke test in Task 4, while the default-preserving guarantee is covered by the existing suite staying green in Task 2.
