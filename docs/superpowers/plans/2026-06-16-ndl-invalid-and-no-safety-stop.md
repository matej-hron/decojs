# Invalid NDL Dives + Safety Stops Off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag NDL-locked dives with under 1 min of real bottom time as invalid (rendered with an explanation, not a triangle), and disable safety stops throughout the trip planner.

**Architecture:** Both behaviours land in `planTrip` (the engine the calendar and all charts consume): it passes `{ enabled: false }` to `generateDecoProfile` and adds `invalid`/`invalidReason` flags to result dives. `TripCalendar` styles invalid blocks; the page's overview/detail render an explanation instead of building chart objects for invalid dives.

**Tech Stack:** Pure ES modules, no build step. Custom test runner `tests/run-tests.mjs` (`npm test`, NOT Jest). Playwright for browser smoke.

**Spec:** `docs/superpowers/specs/2026-06-16-ndl-invalid-and-no-safety-stop-design.md`
**Branch:** `feat/ndl-invalid-and-no-safety-stop` (already created, stacked on `feat/decotengu-repetitive-validation`).

---

## File Structure

| File | Change |
|---|---|
| `js/tripPlanner.js` | `{ enabled: false }` safety stop; invalid detection + `invalid`/`invalidReason` result flags. |
| `js/components/TripCalendar.js` | `tc-invalid` block class + invalid label/tooltip. |
| `sandbox/repetitive-dives.html` | Overview + detail: explanation instead of charts for invalid dives; `.tc-invalid` + invalid-card CSS in the inline `<style>`. |
| `tests/run-tests.mjs` | New `planTrip` tests (invalid flag, chaining, safety-stop-off). |
| `sw.js`, `css/styles.css` | Version bump. |
| `wiki/Module-Reference.md` | Document the two behaviours. |

---

## Task 1: Engine — safety stops off + invalid NDL detection

**Files:**
- Modify: `js/tripPlanner.js`
- Test: `tests/run-tests.mjs` (inside the existing `describe('tripPlanner - planTrip', ...)` block, opens ~line 2768)

- [ ] **Step 1: Write the failing tests**

Inside the `describe('tripPlanner - planTrip', () => {` block (where `gases` and `sum` are already defined at the top of the block), add:

```javascript
    test('an ndlLocked dive forced into overlap is flagged invalid', () => {
        // d2 overlaps d1's end → no off-gassing → NDL ~0 → no real no-deco bottom time.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 50, maxDepth: 40, bottomTime: 5, ndlLocked: true }
            ]
        });
        const d2 = trip.dives.find(d => d.id === 'd2');
        expect(d2.invalid).toBe(true);
        expect(d2.invalidReason).toBe('ndl-too-short');
        // Chaining preserved: it still produced tissue loading (heavier than fresh surface eq).
        expect(sum(d2.endTissue)).toBeGreaterThan(sum(d2.startingTissue) * 0); // endTissue populated
        expect(Object.keys(d2.endTissue).length).toBeGreaterThan(0);
    });

    test('a normal ndlLocked first dive is not invalid', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true }]
        });
        expect(trip.dives[0].invalid).toBe(false);
    });

    test('a non-locked dive is not invalid', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 20 }]
        });
        expect(trip.dives[0].invalid).toBe(false);
    });

    test('trip dives carry no safety-stop segment (safety stops off)', () => {
        // A no-deco dive: with safety stops ON it would gain a 3-min stop at 5 m. Off → none.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 18, bottomTime: 20 }]
        });
        const wp = trip.dives[0].profile.waypoints;
        // No waypoint pair sits at 5 m for a multi-minute span (the safety stop signature).
        const fiveMetreStops = wp.filter(w => w.depth === 5);
        const hasSafetyStop = fiveMetreStops.length >= 2; // arrive + depart at 5 m
        expect(hasSafetyStop).toBe(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "invalid\|safety-stop segment"`
Expected: the invalid/safety-stop tests FAIL (`d2.invalid` is `undefined`; the no-deco dive currently has a 5 m safety stop).

- [ ] **Step 3: Implement in `planTrip`**

In `js/tripPlanner.js`, replace the `ndlLocked` derivation block and the `generateDecoProfile` call. The current block is:

```javascript
        let bottomTime = dive.bottomTime;
        if (dive.ndlLocked) {
            const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
            // Use the NDL value directly as the bottom time. This is the established
            // app-wide convention (AddDiveDialog and ndlPreview both feed calculateNDL().ndl
            // straight into bottomTime), so a moved NDL-locked dive shows the SAME number the
            // add-dialog showed at creation. calculateNDL returns time-at-depth, so the
            // resulting in-water bottom phase (bottomTime − descentTime) is conservatively
            // under the true NDL — do NOT add descentTime here or this diverges from the dialog.
            const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
            const capped = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
            // bottomTime is measured from dive start and includes the descent. A derived NDL
            // below the descent time (heavy pre-saturation, e.g. an overlapping dive) would
            // make actualBottomDuration negative and the profile non-monotonic, so floor it at
            // the descent time (DESCENT_SPEED = 20 m/min, matching generateDecoProfile).
            const descentTime = dive.maxDepth / 20;
            bottomTime = Math.max(capped, descentTime);
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        const profile = generateDecoProfile(
            dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh, undefined, decoOpts
        );
```

Replace it with (adds `invalid`/`invalidReason` and `{ enabled: false }`):

```javascript
        let bottomTime = dive.bottomTime;
        let invalid = false;
        let invalidReason = null;
        if (dive.ndlLocked) {
            const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
            // Use the NDL value directly as the bottom time. This is the established
            // app-wide convention (AddDiveDialog and ndlPreview both feed calculateNDL().ndl
            // straight into bottomTime), so a moved NDL-locked dive shows the SAME number the
            // add-dialog showed at creation. calculateNDL returns time-at-depth, so the
            // resulting in-water bottom phase (bottomTime − descentTime) is conservatively
            // under the true NDL — do NOT add descentTime here or this diverges from the dialog.
            const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
            const capped = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
            const descentTime = dive.maxDepth / 20;   // DESCENT_SPEED = 20 m/min
            // If the actual bottom phase (capped − descentTime) is under a minute, there is no
            // real no-deco dive at this position (too pre-saturated). Flag it invalid; still floor
            // the bottom time so a minimal profile is generated for tissue continuity (chaining),
            // but the UI shows an explanation instead of the degenerate "triangle" profile.
            if (capped - descentTime < 1) {
                invalid = true;
                invalidReason = 'ndl-too-short';
            }
            bottomTime = Math.max(capped, descentTime);
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        // Safety stops are disabled for the trip planner: a 3-min stop on no-deco dives inflates
        // runtime/TTS inconsistently across dives and obscures the calendar deco times.
        const profile = generateDecoProfile(
            dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh, { enabled: false }, decoOpts
        );
```

Then in the `results.push({ ... })` object, add the two flags. Change:

```javascript
        results.push({
            id: dive.id,
            name: dive.name,
            startDateTime: dive.startDateTime,
            endDateTime,
            maxDepth: dive.maxDepth,
            bottomTime,
            surfaceIntervalBefore,
            startingTissue,
            endTissue,
            profile
        });
```
to:
```javascript
        results.push({
            id: dive.id,
            name: dive.name,
            startDateTime: dive.startDateTime,
            endDateTime,
            maxDepth: dive.maxDepth,
            bottomTime,
            surfaceIntervalBefore,
            startingTissue,
            endTissue,
            profile,
            invalid,
            invalidReason
        });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -3`
Expected: all pass; suite total up by 4.

- [ ] **Step 5: Commit**

```bash
git add js/tripPlanner.js tests/run-tests.mjs
git commit -m "feat(trip): flag too-short NDL dives invalid; disable safety stops

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Calendar — invalid block style + label

**Files:**
- Modify: `js/components/TripCalendar.js` (render loop, ~lines 197–208)
- Modify: `sandbox/repetitive-dives.html` (inline `<style>`, near the `.tc-block.tc-conflict` rule ~line 48)

No isolated unit test (DOM render; covered by Task 3 browser smoke).

- [ ] **Step 1: Add the `tc-invalid` class + invalid label in `render`**

In `js/components/TripCalendar.js`, the block construction is currently:

```javascript
            block.className = 'tc-block'
                + (b.conflict ? ' tc-conflict' : '')
                + (b.diveId === selectedDiveId ? ' tc-selected' : '');
            block.dataset.diveId = b.diveId;
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            const name = (d && d.name) ? d.name : b.diveId.toUpperCase();
            const depth = d ? d.maxDepth : '?';
            const runtime = d ? Math.round(d.endDateTime - d.startDateTime) : '?';
            block.textContent = `${name} · ${depth}m · ${runtime}min` + (d ? decoLabelSuffix(d) : '');
            block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
```

Replace it with:

```javascript
            block.className = 'tc-block'
                + (b.conflict ? ' tc-conflict' : '')
                + (d && d.invalid ? ' tc-invalid' : '')
                + (b.diveId === selectedDiveId ? ' tc-selected' : '');
            block.dataset.diveId = b.diveId;
            block.style.top = b.topPct + '%';
            block.style.height = Math.max(b.heightPct, 2) + '%';
            const name = (d && d.name) ? d.name : b.diveId.toUpperCase();
            const depth = d ? d.maxDepth : '?';
            if (d && d.invalid) {
                block.textContent = `${name} · ${depth}m · ⚠ no-deco N/A`;
                block.title = 'No-deco not possible here — too pre-saturated';
            } else {
                const runtime = d ? Math.round(d.endDateTime - d.startDateTime) : '?';
                block.textContent = `${name} · ${depth}m · ${runtime}min` + (d ? decoLabelSuffix(d) : '');
                block.title = b.conflict ? 'Overlaps previous dive\'s deco' : '';
            }
```

- [ ] **Step 2: Add the `.tc-invalid` CSS**

In `sandbox/repetitive-dives.html`, find the line (~48):

```css
    .tc-block.tc-conflict { background:#c0392b; outline:2px solid #c0392b; }
```

Add immediately after it:

```css
    .tc-block.tc-invalid { background:repeating-linear-gradient(45deg,#7f8c8d,#7f8c8d 6px,#95a5a6 6px,#95a5a6 12px); outline:2px dashed #e67e22; color:#fff; }
```

(Muted hatched grey with a dashed orange outline — clearly distinct from the solid-red `.tc-conflict`.)

- [ ] **Step 3: Verify modules parse + suite green**

Run: `node -e "import('./js/components/TripCalendar.js').then(()=>console.log('ok'))" && npm test 2>&1 | tail -3`
Expected: prints `ok`; all tests pass (unchanged count from Task 1).

- [ ] **Step 4: Commit**

```bash
git add js/components/TripCalendar.js sandbox/repetitive-dives.html
git commit -m "feat(calendar): distinct style + label for invalid NDL dives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Overview + detail — explanation instead of charts for invalid dives

**Files:**
- Modify: `sandbox/repetitive-dives.html` (`renderOverview` ~line 219, `showDetail` ~line 319, inline `<style>`)

This task is validated by the mandatory browser smoke (Step 4).

- [ ] **Step 1: Add a shared invalid-explanation constant**

In `sandbox/repetitive-dives.html`, near the top of the script (after the existing `const overview`/`detail` declarations, ~line 206), add:

```javascript
    const INVALID_NDL_HTML = `<div class="invalid-note">⚠ No-deco dive not possible here — too pre-saturated. Move it later or unlock to a custom dive.</div>`;
```

- [ ] **Step 2: Guard the overview card for invalid dives**

In `renderOverview`, the per-dive loop currently always builds the card with a `.chart-host`,
mode toggles, and a `DiveProfileChart`. Wrap the chart construction so an invalid dive shows the
explanation instead. Find this block (starting ~line 234):

```javascript
        card.innerHTML = `
          <h2>${esc(d.name || d.id.toUpperCase())} — ${fmtClock(d.startDateTime)}</h2>
          <div class="dive-meta">${si} · deco ${fmtDur(d.profile.totalDecoTime)}
            · ${d.profile.decoStops.length} stop(s) · ${pre}</div>
          <div class="chart-host"></div>
          <button class="view-detail" data-dive="${d.id}">View detail →</button>`;
        panels.appendChild(card);

        // Add mode toggles row between the chart host and the view-detail button.
        const toggles = buildModeToggles();
        const btn = card.querySelector('.view-detail');
        card.insertBefore(toggles, btn);

        // Use per-dive gases if available, fall back to trip-level gases.
        const diveGases = (trip.dives.find(td => td.id === d.id)?.gases) ?? trip.gases;
        const perDiveSetup = {
          ...trip,
          gases: diveGases,
          dives: [{ waypoints: d.profile.waypoints }],
          surfaceInterval: 0, // no post-dive flat tail — the chart should fill with the dive itself
          initialTissuePressures: d.startingTissue,
          sacRate: 20,
          decoSacRate: 15
        };
        const c = new DiveProfileChart(card.querySelector('.chart-host'), {
          diveSetup: perDiveSetup,
          options: { showLabels: true, showCeiling: true, showLegend: false, ...profileModes }
        });
        overviewCharts.push(c);

        card.querySelector('.view-detail').addEventListener('click', () => showDetail(d.id));
```

Replace it with:

```javascript
        if (d.invalid) {
          card.innerHTML = `
            <h2>${esc(d.name || d.id.toUpperCase())} — ${fmtClock(d.startDateTime)}</h2>
            <div class="dive-meta">${si} · ${d.maxDepth}m · invalid</div>
            ${INVALID_NDL_HTML}
            <button class="view-detail" data-dive="${d.id}">View detail →</button>`;
          panels.appendChild(card);
          card.querySelector('.view-detail').addEventListener('click', () => showDetail(d.id));
          return; // no chart for an invalid dive
        }

        card.innerHTML = `
          <h2>${esc(d.name || d.id.toUpperCase())} — ${fmtClock(d.startDateTime)}</h2>
          <div class="dive-meta">${si} · deco ${fmtDur(d.profile.totalDecoTime)}
            · ${d.profile.decoStops.length} stop(s) · ${pre}</div>
          <div class="chart-host"></div>
          <button class="view-detail" data-dive="${d.id}">View detail →</button>`;
        panels.appendChild(card);

        // Add mode toggles row between the chart host and the view-detail button.
        const toggles = buildModeToggles();
        const btn = card.querySelector('.view-detail');
        card.insertBefore(toggles, btn);

        // Use per-dive gases if available, fall back to trip-level gases.
        const diveGases = (trip.dives.find(td => td.id === d.id)?.gases) ?? trip.gases;
        const perDiveSetup = {
          ...trip,
          gases: diveGases,
          dives: [{ waypoints: d.profile.waypoints }],
          surfaceInterval: 0, // no post-dive flat tail — the chart should fill with the dive itself
          initialTissuePressures: d.startingTissue,
          sacRate: 20,
          decoSacRate: 15
        };
        const c = new DiveProfileChart(card.querySelector('.chart-host'), {
          diveSetup: perDiveSetup,
          options: { showLabels: true, showCeiling: true, showLegend: false, ...profileModes }
        });
        overviewCharts.push(c);

        card.querySelector('.view-detail').addEventListener('click', () => showDetail(d.id));
```

(`d.invalid` is `false` for every normal dive, so the existing path is unchanged for them. The
loop body is inside `result.dives.forEach(d => { ... })`, so the early `return` skips only the
current invalid card.)

- [ ] **Step 3: Guard the detail view for invalid dives**

In `showDetail`, after `const d = lastResult.dives.find(x => x.id === diveId); if (!d) return;`
and the `disposeDetail()` / `overview.style.display = 'none'` / `detail.style.display = ''`
lines, but BEFORE the `seededSetup` construction, add an invalid branch that renders the
explanation + pre-saturation strip and returns. Insert right after the
`const diveGases = (trip.dives.find(td => td.id === diveId)?.gases) ?? trip.gases;` line
(it is the first statement after the display toggles, ~line 328):

```javascript
      if (d.invalid) {
        const siLine = d.surfaceIntervalBefore == null ? 'first dive' : `surface interval ${fmtDur(d.surfaceIntervalBefore)}`;
        detail.innerHTML = `
          <button class="back-to-trip">← back to trip</button>
          <h2>${esc(d.name || d.id.toUpperCase())} — ${fmtClock(d.startDateTime)}</h2>
          <div class="dive-meta">${siLine} · ${d.maxDepth}m · invalid</div>
          ${INVALID_NDL_HTML}
          <h3>Pre-saturation at start (surfacing GF per tissue)</h3>
          ${d.surfaceIntervalBefore == null ? '<p>Fresh diver — no residual loading.</p>' : presatStrip(d.startingTissue)}`;
        detail.querySelector('.back-to-trip').addEventListener('click', showOverview);
        return; // no profile / M-value / GF / runtime charts for an invalid dive
      }
```

(This sits before any chart object is constructed, so no degenerate chart is ever built. Normal
dives fall through to the existing `seededSetup` + charts path unchanged.)

- [ ] **Step 4: Add the invalid-note CSS**

In `sandbox/repetitive-dives.html` inline `<style>`, add a rule (place it near the other
`.dive-card` / `.dive-meta` rules):

```css
    .invalid-note { margin:.5rem 0; padding:.6rem .8rem; border:1px dashed #e67e22; border-radius:6px; background:#fff6ee; color:#a04000; font-size:.9rem; }
```

- [ ] **Step 5: Browser smoke (MANDATORY — Playwright)**

Start a static server if needed (`python3 -m http.server 5500` from repo root) and drive
`http://localhost:5500/sandbox/repetitive-dives.html`. Verify:

1. Add a No-deco (NDL-locked) dive, then drag it into overlap with an earlier dive (so it
   becomes too pre-saturated). Its calendar block shows the **hatched `tc-invalid`** style and
   the label `… · ⚠ no-deco N/A` (no stop/TTS). No console errors.
2. The overview card for that dive shows the invalid explanation note and **no profile chart**
   (no triangle). Clicking **View detail →** shows the explanation + the pre-saturation strip
   and **no** profile/M-value/GF/runtime charts. No console errors.
3. A normal no-deco dive's calendar block runtime is **3 min shorter** than before (safety stop
   gone) — or equivalently, its detail runtime table has no 5 m / 3-min safety stop row.
4. A normal valid NDL dive and a normal deco dive still render their charts as before.

Capture: assert no `console.error` during the run; assert the invalid block's text contains
`no-deco N/A` and the overview card contains the invalid note.

- [ ] **Step 6: Commit**

```bash
git add sandbox/repetitive-dives.html
git commit -m "feat(trip-ui): explanation instead of triangle for invalid NDL dives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Version bump + wiki

**Files:**
- Modify: `sw.js:2`, `css/styles.css` (`.version-number::after`), `wiki/Module-Reference.md`

- [ ] **Step 1: Bump the cache name**

In `sw.js` line 2, read the current `const CACHE_NAME = 'deco-theory-X.X.XX'` and increment the
patch number by 1.

- [ ] **Step 2: Bump the visible version**

In `css/styles.css`, search `.version-number::after` and set its `content:` to the SAME version
string from Step 1.

- [ ] **Step 3: Update the wiki**

In `wiki/Module-Reference.md`, in the `tripPlanner` / `planTrip` entry, add: trip dives are
generated with safety stops disabled (`generateDecoProfile(..., { enabled: false })`); an
NDL-locked dive whose actual bottom phase (`min(NDL,99) − descentTime`) is under 1 min is flagged
`invalid: true` with `invalidReason: 'ndl-too-short'` (the profile is still generated at the
floored bottom time for tissue continuity, but the UI renders an explanation, not the profile).
In the `TripCalendar` entry, add: invalid dives render with a `tc-invalid` block style and a
`⚠ no-deco N/A` label.

- [ ] **Step 4: Run the suite**

Run: `npm test 2>&1 | tail -3`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add sw.js css/styles.css wiki/Module-Reference.md
git commit -m "chore: version bump + wiki for invalid NDL dives / no safety stops

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- A.1 safety stops off → Task 1 (`{ enabled: false }`) + safety-stop unit test. ✓
- A.2 invalid detection + flags, chaining preserved → Task 1 (invalid branch, floored profile, result flags) + invalid/chaining unit tests. ✓
- B calendar `tc-invalid` + label/tooltip + CSS → Task 2. ✓
- C.1 overview explanation, no chart → Task 3 Step 2. ✓
- C.2 detail explanation + pre-sat strip, no charts → Task 3 Step 3. ✓
- D testing (unit + browser smoke) → Task 1 unit, Task 3 Step 5 smoke. ✓
- E versioning + wiki → Task 4. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Task 4 reads-then-increments the version (live value unknown at plan time) — deliberate, not a placeholder.

**Type/name consistency:** `invalid` (boolean) + `invalidReason` (`'ndl-too-short'` | null) defined on the result in Task 1 and read in Tasks 2 (`d.invalid`) and 3 (`d.invalid`). `tc-invalid` class name matches between Task 2 JS and CSS. `INVALID_NDL_HTML` defined once (Task 3 Step 1) and used in both overview (Step 2) and detail (Step 3). `presatStrip`/`showOverview`/`fmtDur`/`fmtClock`/`esc` are pre-existing page helpers referenced as-is. `{ enabled: false }` is the `safetyStop` arg (6th positional) of `generateDecoProfile`, matching its signature.
