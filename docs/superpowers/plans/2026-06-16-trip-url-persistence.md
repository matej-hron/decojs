# Trip URL Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist/share the repetitive-dive trip via a `?trip=` URL param — the address bar auto-syncs as you edit, reloading restores the trip, and a button copies the link.

**Architecture:** A new `js/tripUrl.js` base64-encodes a minimal trip object into a URL param (mirroring the existing `js/urlParams.js` single-dive scheme). The page decodes on load and calls `updateUrlWithTrip` (via `history.replaceState`) inside `rerender()`.

**Tech Stack:** Pure ES modules, no build. `btoa`/`atob` (global in browser + Node). Unit tests in `tests/run-tests.mjs`; UI via Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-06-16-trip-url-persistence-design.md`
**Branch:** `feat/calendar-trip-planner-core`.

---

## File Structure
- **Create** `js/tripUrl.js` — `encodeTrip`/`decodeTrip` (pure) + `getTripFromUrl`/`updateUrlWithTrip`/`getTripShareUrl` (window/history wrappers).
- **Modify** `sandbox/repetitive-dives.html` — decode-on-load, `updateUrlWithTrip` in `rerender`, Copy button.
- **Modify** `sw.js`, `css/styles.css` — register module + version bump.
- **Modify** `tests/run-tests.mjs` — encode/decode round-trip + failure tests.

---

## Task 1: `js/tripUrl.js` + encode/decode tests

**Files:**
- Create: `js/tripUrl.js`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write the failing tests**

Add `import { encodeTrip, decodeTrip } from '../js/tripUrl.js';` near the other imports in `tests/run-tests.mjs` (the module's pure functions don't touch `window`, so it loads in Node; `btoa`/`atob` are Node globals). Then add:

```js
describe('tripUrl - encode/decode', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
    const ean32 = [{ id: 'ean32', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0 }];

    test('round-trips a trip whose dives share the trip gas', () => {
        const trip = { startDate: '2026-06-15', dayCount: 3, gfLow: 90, gfHigh: 100, gases: air, dives: [
            { id: 'd1', name: 'Wreck', startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air },
            { id: 'd2', name: 'Reef',  startDateTime: 660, maxDepth: 18, bottomTime: 50, gases: air }
        ]};
        const back = decodeTrip(encodeTrip(trip));
        expect(back.startDate).toBe('2026-06-15');
        expect(back.dayCount).toBe(3);
        expect(back.gfLow).toBe(90);
        expect(back.gfHigh).toBe(100);
        expect(back.dives.length).toBe(2);
        expect(back.dives[0].name).toBe('Wreck');
        expect(back.dives[0].maxDepth).toBe(40);
        expect(back.dives[1].bottomTime).toBe(50);
        expect(back.dives[0].id).toBe('d1');   // fresh sequential ids
        expect(back.dives[1].id).toBe('d2');
        expect(back.dives[0].gases[0].id).toBe('air'); // refilled from trip gases (omitted in encode)
    });

    test('preserves a dive with a different gas (stored inline)', () => {
        const trip = { startDate: '2026-06-15', dayCount: 1, gfLow: 100, gfHigh: 100, gases: air, dives: [
            { id: 'd1', name: 'A', startDateTime: 0,   maxDepth: 30, bottomTime: 30, gases: air },
            { id: 'd2', name: 'B', startDateTime: 200, maxDepth: 30, bottomTime: 30, gases: ean32 }
        ]};
        const back = decodeTrip(encodeTrip(trip));
        expect(back.dives[0].gases[0].id).toBe('air');
        expect(back.dives[1].gases[0].id).toBe('ean32');
    });

    test('returns null for malformed input', () => {
        expect(decodeTrip('')).toBe(null);
        expect(decodeTrip('aGVsbG8=')).toBe(null);              // base64 of "hello" → not JSON
        expect(decodeTrip(btoa('{"foo":1}'))).toBe(null);        // valid JSON but no dives/gases array
    });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test 2>&1 | grep -i "tripUrl\|Cannot find"`
Expected: FAIL — module `../js/tripUrl.js` does not exist.

- [ ] **Step 3: Implement**

Create `js/tripUrl.js`:

```js
/**
 * Encode/decode a repetitive-dive trip to/from a URL param, so a trip is
 * shareable and reload-surviving. Mirrors the single-dive scheme in urlParams.js.
 *
 * encodeTrip/decodeTrip are pure (no DOM). The get/update/share helpers touch
 * window.location / history.
 */

const URL_PARAM = 'trip';

function minimalGas(g) {
    return { id: g.id, name: g.name, o2: g.o2, n2: g.n2, he: g.he || 0 };
}

function sameGases(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((g, i) =>
        g.id === b[i].id && g.o2 === b[i].o2 && g.n2 === b[i].n2 && (g.he || 0) === (b[i].he || 0));
}

/**
 * @param {Object} trip - { startDate, dayCount, gfLow, gfHigh, gases, dives }
 * @returns {string} URL-safe base64 of the minimal trip JSON
 */
export function encodeTrip(trip) {
    const tripGases = (trip.gases || []).map(minimalGas);
    const minimal = {
        startDate: trip.startDate,
        dayCount: trip.dayCount,
        gfLow: trip.gfLow,
        gfHigh: trip.gfHigh,
        gases: tripGases,
        dives: (trip.dives || []).map(d => {
            const dive = {
                name: d.name,
                startDateTime: d.startDateTime,
                maxDepth: d.maxDepth,
                bottomTime: d.bottomTime
            };
            // Store per-dive gas only when it differs from the trip gas (keeps URLs short).
            if (d.gases && !sameGases(d.gases, trip.gases)) dive.gases = d.gases.map(minimalGas);
            return dive;
        })
    };
    const json = JSON.stringify(minimal);
    return btoa(unescape(encodeURIComponent(json)));
}

/**
 * @param {string} str - encoded trip
 * @returns {Object|null} trip, or null on any malformed input
 */
export function decodeTrip(str) {
    try {
        if (!str) return null;
        const json = decodeURIComponent(escape(atob(str)));
        const m = JSON.parse(json);
        if (!m || !Array.isArray(m.dives) || !Array.isArray(m.gases)) return null;
        const tripGases = m.gases;
        const dives = m.dives.map((d, i) => ({
            id: 'd' + (i + 1),
            name: d.name,
            startDateTime: d.startDateTime,
            maxDepth: d.maxDepth,
            bottomTime: d.bottomTime,
            gases: Array.isArray(d.gases) ? d.gases : tripGases
        }));
        return {
            startDate: m.startDate,
            dayCount: m.dayCount,
            gfLow: m.gfLow,
            gfHigh: m.gfHigh,
            gases: tripGases,
            dives
        };
    } catch (e) {
        return null;
    }
}

/** Read and decode the trip from the current URL (null if absent/invalid). */
export function getTripFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return decodeTrip(params.get(URL_PARAM));
}

/** Write the trip into the URL via replaceState (no new history entry). */
export function updateUrlWithTrip(trip) {
    const url = new URL(window.location);
    url.searchParams.set(URL_PARAM, encodeTrip(trip));
    window.history.replaceState({}, '', url);
}

/** Absolute shareable URL for the trip. */
export function getTripShareUrl(trip) {
    const url = new URL(window.location);
    url.searchParams.set(URL_PARAM, encodeTrip(trip));
    return url.toString();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test 2>&1 | tail -5`
Expected: `✅ All tests passed!` (existing suite + 3 new).

- [ ] **Step 5: Commit**

```bash
git add js/tripUrl.js tests/run-tests.mjs
git commit -m "feat(trip): tripUrl encode/decode + URL get/update/share helpers"
```

---

## Task 2: Page wiring — decode-on-load, auto-sync, Copy button

**Files:**
- Modify: `sandbox/repetitive-dives.html`
- Modify: `sw.js`, `css/styles.css`

- [ ] **Step 1: Read the page** — locate the `let trip = { ... }` default literal, the `rerender()` function, and the `.trip-config` bar.

- [ ] **Step 2: Imports + decode-on-load**

Add the import:
```js
    import { getTripFromUrl, updateUrlWithTrip, getTripShareUrl } from '../js/tripUrl.js';
```
Immediately AFTER the `let trip = { ... };` default literal, override from the URL if present:
```js
    const urlTrip = getTripFromUrl();
    if (urlTrip) trip = urlTrip;
```

- [ ] **Step 3: Auto-sync the URL in `rerender`**

Inside `rerender()`, after the calendar render / overview scheduling (at the END of the function body), add:
```js
      updateUrlWithTrip(trip);
```
(`rerender` runs on every add/edit/remove/config change; edits arrive via the debounced `rerenderDeferred → rerender`, so the URL settles after typing stops.)

- [ ] **Step 4: Copy-link button**

In the `.trip-config` bar markup, add:
```html
      <button id="cfg-copy" class="cfg-copy-btn">Copy trip link</button>
```
Wire it (near the other `cfg-*` handlers):
```js
    document.getElementById('cfg-copy').addEventListener('click', async (e) => {
      const btn = e.target;
      try {
        await navigator.clipboard.writeText(getTripShareUrl(trip));
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = prev; }, 1500);
      } catch (_) { /* clipboard unavailable — the address bar still holds the link */ }
    });
```
Add CSS to the page `<style>`:
```css
    .cfg-copy-btn { font-size:.8rem; padding:.15rem .5rem; cursor:pointer; border:1px solid var(--border-color,#ccc); border-radius:4px; background:var(--surface,#f7f7f7); }
```

- [ ] **Step 5: Browser smoke test (REQUIRED)**

Playwright (script in repo root, then delete). Start `python3 -m http.server 5500`. On `http://localhost:5500/sandbox/repetitive-dives.html`:
1. ZERO console/page errors on load; the URL has NO `?trip=` initially (default trip), then gains `?trip=` after the first render (rerender runs on load).
2. Change GF Low to 80 (config input) and add a dive via the calendar (click empty slot → Add). Read `window.location.href` — it contains `?trip=`.
3. Rename dive 1 to "WreckX" (click its block → set Name → dispatch change); wait ~400ms (debounce). Capture `window.location.href`.
4. **RELOAD** by navigating `page.goto(capturedHref)` fresh → assert the trip is restored: an overview card / calendar block shows "WreckX", GF Low input shows 80, and the added dive is present. ZERO console errors.
5. Click "Copy trip link" → button text flips to "Copied!"; (clipboard may be blocked in headless — if so, just assert no error and the text flip; the href already proves the link).
Capture a screenshot. Stop the server. Fix any failure before committing.

- [ ] **Step 6: Register + version bump**

- Add `'./js/tripUrl.js'` to `sw.js` `STATIC_ASSETS`.
- Bump `sw.js` `CACHE_NAME` `deco-theory-0.6.14` → `deco-theory-0.6.15`; `css/styles.css` `.version-number::after` → `"0.6.15"`.

- [ ] **Step 7: Final test + commit**

Run: `npm test 2>&1 | tail -3` → expect green.
```bash
git add sandbox/repetitive-dives.html sw.js css/styles.css
git commit -m "feat(trip): persist/share trip via ?trip= URL (auto-sync + copy link)"
```

---

## Task 3: Wiki

**Files:**
- Modify: `wiki/Module-Reference.md`

- [ ] **Step 1: Document + commit**

Add a `js/tripUrl.js` entry: `encodeTrip`/`decodeTrip` (base64 minimal-trip codec, per-dive gas omitted when equal to the trip gas; decode re-mints sequential ids and returns null on malformed input), plus `getTripFromUrl`/`updateUrlWithTrip` (replaceState)/`getTripShareUrl`. Note the page decodes on load and auto-syncs in `rerender`. Verify any file:line citations.
```bash
git add wiki/
git commit -m "docs(wiki): document tripUrl (shareable trip persistence)"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** encode/decode + helpers → Task 1; decode-on-load + auto-sync + Copy button → Task 2; minimal-gas omission + null-on-malformed → Task 1 (code + tests); wiki → Task 3. No gaps.
- **Placeholder scan:** none — full code in every code step; the smoke acceptance is explicit (reload restores the trip).
- **Type/name consistency:** `encodeTrip`/`decodeTrip`/`getTripFromUrl`/`updateUrlWithTrip`/`getTripShareUrl` names consistent between Task 1 (definitions) and Task 2 (imports/usage); the trip shape (`startDate/dayCount/gfLow/gfHigh/gases/dives[{id,name,startDateTime,maxDepth,bottomTime,gases}]`) matches the page's `trip` object.
- **Risk:** the `?trip=` write happens on every `rerender` (cheap); reload-restoration is the key behaviour, validated by Task 2's smoke step 4. `decodeTrip` returns null on any error so a bad/old link never crashes the page.
