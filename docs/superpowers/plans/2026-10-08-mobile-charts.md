# Mobile-portrait dive charts — implementation plan

> **Superseded in part:** the user narrowed the scope to the dive log page mid-implementation. See the "Scope change" section of the spec; class hooks and the styles.css block described below were not shipped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DiveProfileChart, MValueChart (P-P) and GFChart readable and usable at 360–430 px portrait, without changing desktop rendering.

**Architecture:** A new pure module `js/charts/narrowLayout.js` decides "narrow" (host ≤ 600 px). It applies or restores Chart.js option overrides through a plugin, and decides where the GF ranking panel goes. The components mark the host with `chart-narrow` and add stable class hooks to their existing DOM. `css/styles.css` holds narrow-only rules scoped under `.chart-narrow`.

**Tech Stack:** Vanilla ES modules, Chart.js 4 (CDN global), node:test for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-08-mobile-charts-design.md`

## Global Constraints

- Desktop (host width > 600 px) must render exactly as before. Narrow rules live only under `.chart-narrow`, and the plugin is a no-op when wide.
- Do not bump the version (`sw.js` CACHE_NAME, `.version-number`). Add the new JS file to `sw.js` STATIC_ASSETS.
- No new HTML files in the repo.
- Notation: `&nbsp;`/U+00A0 between number and unit; percent written as `92,1 %` via the existing `fmtNum` + ` %`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` must stay green.

## Review Focus

- Rotating the phone (crossing 600 px both ways) must restore the desktop options exactly. Covered by the restore tests in Task 1.
- Re-applying on every `update()` must not shrink annotation fonts cumulatively. Covered by the "idempotent" test in Task 1.
- `layout.padding` given as a number (not an object) must keep left/right/bottom. Covered in Task 1.
- Hidden host (width 0, `display: none`) must not count as narrow. Covered in Task 1.
- Fullscreen on a phone must still fill the screen. Checked by hand in Task 4.

---

### Task 1: `narrowLayout.js` module + tests

**Files:**
- Create: `js/charts/narrowLayout.js`
- Create: `tests/chart-narrow-layout.test.mjs`
- Modify: `package.json` (add the test file to the `node --test` list)
- Modify: `sw.js` (add `'./js/charts/narrowLayout.js',` after `'./js/charts/interactionLock.js',`)

**Interfaces — Produces:**
- `NARROW_CHART_MAX_WIDTH = 600`, `NARROW_BUTTON_GUTTER_PX = 40`
- `isNarrowChartWidth(width: number): boolean`
- `applyNarrowOverrides(options: object, narrow: boolean, saved: Map): void` — `saved` holds originals and created containers, keyed by JSON path
- `narrowChartPlugin` — Chart.js inline plugin `{ id: 'narrowLayout', beforeUpdate(chart) }`
- `syncNarrowClass(host: HTMLElement): boolean` — toggles `chart-narrow`, returns the state
- `rankingPlacement(chartWidth: number): 'overlay' | 'below' | 'hidden'`

- [ ] **Step 1: Write the failing tests** — `tests/chart-narrow-layout.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    NARROW_CHART_MAX_WIDTH, NARROW_BUTTON_GUTTER_PX, isNarrowChartWidth,
    applyNarrowOverrides, syncNarrowClass, rankingPlacement, narrowChartPlugin,
} from '../js/charts/narrowLayout.js';

const desktopOptions = () => ({
    layout: { padding: { right: 170 } },
    plugins: {
        legend: { labels: { boxWidth: 40, font: { size: 12 } } },
        annotation: { annotations: {
            max: { type: 'line', label: { font: { size: 10, weight: 'bold' }, padding: { top: 3, bottom: 3, left: 6, right: 6 } } },
            descent: { type: 'label', font: { size: 9 }, padding: { top: 3, bottom: 3, left: 6, right: 6 } },
            tiny: { type: 'label', font: { size: 8 } },
            plain: { type: 'box' },
        } },
    },
    scales: { x: { title: { text: 'Time', font: { size: 14 } } }, y: { ticks: {} } },
});

test('width threshold', () => {
    assert.equal(NARROW_CHART_MAX_WIDTH, 600);
    assert.equal(isNarrowChartWidth(390), true);
    assert.equal(isNarrowChartWidth(600), true);
    assert.equal(isNarrowChartWidth(601), false);
    assert.equal(isNarrowChartWidth(0), false, 'hidden host is not narrow');
    assert.equal(isNarrowChartWidth(NaN), false);
    assert.equal(isNarrowChartWidth(undefined), false);
});

test('narrow overrides: gutter, legend, axes, annotations', () => {
    const o = desktopOptions();
    applyNarrowOverrides(o, true, new Map());
    assert.deepEqual(o.layout.padding, { right: 170, top: NARROW_BUTTON_GUTTER_PX });
    assert.equal(o.plugins.legend.labels.boxWidth, 14);
    assert.equal(o.plugins.legend.labels.padding, 6);
    assert.equal(o.plugins.legend.labels.font.size, 11);
    assert.equal(o.scales.x.title.font.size, 11);
    assert.equal(o.scales.y.title.font.size, 11);
    assert.equal(o.scales.y.ticks.font.size, 10);
    const a = o.plugins.annotation.annotations;
    assert.equal(a.max.label.font.size, 9);
    assert.equal(a.max.label.font.weight, 'bold', 'other font keys kept');
    assert.deepEqual(a.max.label.padding, { top: 2, bottom: 2, left: 4, right: 4 });
    assert.equal(a.descent.font.size, 8);
    assert.equal(a.tiny.font.size, 8, 'never below 8 px');
    assert.deepEqual(a.plain, { type: 'box' }, 'annotations without labels untouched');
});

test('re-applying is idempotent (no cumulative shrink)', () => {
    const o = desktopOptions();
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, true, saved);
    assert.equal(o.plugins.annotation.annotations.max.label.font.size, 9);
    assert.equal(o.plugins.legend.labels.font.size, 11);
});

test('going wide restores the exact desktop options', () => {
    const o = desktopOptions();
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, desktopOptions());
    assert.equal(saved.size, 0);
});

test('wide with nothing saved is a no-op', () => {
    const o = desktopOptions();
    applyNarrowOverrides(o, false, new Map());
    assert.deepEqual(o, desktopOptions());
});

test('numeric layout.padding keeps its other sides', () => {
    const o = { layout: { padding: 10 } };
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    assert.deepEqual(o.layout.padding, { top: 40, right: 10, bottom: 10, left: 10 });
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, { layout: { padding: 10 } });
});

test('missing sections are created on narrow and removed on restore', () => {
    const o = {};
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    assert.equal(o.layout.padding.top, 40);
    assert.equal(o.plugins.legend.labels.font.size, 11);
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, {}, 'containers created on narrow are pruned again');
});

test('scriptable (function) fonts are left alone', () => {
    const fn = () => ({ size: 12 });
    const o = { scales: { x: { ticks: { font: fn } } } };
    applyNarrowOverrides(o, true, new Map());
    assert.equal(o.scales.x.ticks.font, fn);
});

test('plugin applies by chart width and restores on widen', () => {
    const options = desktopOptions();
    const chart = { width: 390, config: { options } };
    narrowChartPlugin.beforeUpdate(chart);
    assert.equal(options.layout.padding.top, 40);
    chart.width = 844;
    narrowChartPlugin.beforeUpdate(chart);
    assert.deepEqual(options, desktopOptions());
});

test('syncNarrowClass toggles chart-narrow from clientWidth', () => {
    const classes = new Set();
    const host = { clientWidth: 390, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
    assert.equal(syncNarrowClass(host), true);
    assert.ok(classes.has('chart-narrow'));
    host.clientWidth = 1200;
    assert.equal(syncNarrowClass(host), false);
    assert.ok(!classes.has('chart-narrow'));
});

test('ranking placement', () => {
    assert.equal(rankingPlacement(390), 'below');
    assert.equal(rankingPlacement(700), 'hidden');
    assert.equal(rankingPlacement(800), 'overlay');
    assert.equal(rankingPlacement(0), 'hidden');
});
```

- [ ] **Step 2: Run** `node --test tests/chart-narrow-layout.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `js/charts/narrowLayout.js`:**

```js
/**
 * Narrow (phone-portrait) layout for the shared charts.
 *
 * A chart is "narrow" when its host is at most NARROW_CHART_MAX_WIDTH wide. Narrow charts:
 *  - get the `chart-narrow` class on their host (CSS in styles.css does the DOM layout),
 *  - get smaller Chart.js fonts and a top gutter for the overlay buttons (narrowChartPlugin).
 * Desktop options are saved before the first override and restored when the chart widens
 * again (a phone rotated to landscape), so desktop rendering is unchanged.
 */

export const NARROW_CHART_MAX_WIDTH = 600;
/** Space above the legend for the lock / reset-zoom / fullscreen buttons. */
export const NARROW_BUTTON_GUTTER_PX = 40;
const GF_RANKING_OVERLAY_MIN_WIDTH = 800;
const MIN_ANNOTATION_FONT_PX = 8;
const NARROW_LABEL_PADDING = { top: 2, bottom: 2, left: 4, right: 4 };

/** @param {number} width - host or chart width in CSS px; 0 (hidden) is not narrow */
export function isNarrowChartWidth(width) {
    return Number.isFinite(width) && width > 0 && width <= NARROW_CHART_MAX_WIDTH;
}

/** Where the GF tissue-ranking panel goes at this chart width. */
export function rankingPlacement(chartWidth) {
    if (chartWidth >= GF_RANKING_OVERLAY_MIN_WIDTH) return 'overlay';
    return isNarrowChartWidth(chartWidth) ? 'below' : 'hidden';
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Overrides as [path, value-or-fn(original)] for the given options. */
function narrowOverrides(options) {
    const list = [
        [['layout', 'padding'], padding => (isPlainObject(padding)
            ? { ...padding, top: NARROW_BUTTON_GUTTER_PX }
            : Number.isFinite(padding)
                ? { top: NARROW_BUTTON_GUTTER_PX, right: padding, bottom: padding, left: padding }
                : { top: NARROW_BUTTON_GUTTER_PX })],
        [['plugins', 'legend', 'labels', 'boxWidth'], 14],
        [['plugins', 'legend', 'labels', 'padding'], 6],
        [['plugins', 'legend', 'labels', 'font', 'size'], 11],
    ];
    for (const id of Object.keys(options.scales ?? {})) {
        list.push([['scales', id, 'title', 'font', 'size'], 11]);
        list.push([['scales', id, 'ticks', 'font', 'size'], 10]);
    }
    const annotations = options.plugins?.annotation?.annotations;
    const shrink = size => Math.max(MIN_ANNOTATION_FONT_PX, size - 1);
    for (const [key, ann] of Object.entries(isPlainObject(annotations) || Array.isArray(annotations) ? annotations : {})) {
        if (!isPlainObject(ann)) continue;
        const base = ['plugins', 'annotation', 'annotations', key];
        for (const sub of [[], ['label']]) {
            const owner = sub.length ? ann.label : ann;
            if (!isPlainObject(owner)) continue;
            if (isPlainObject(owner.font) && Number.isFinite(owner.font.size)) {
                list.push([[...base, ...sub, 'font', 'size'], shrink]);
            }
            if (isPlainObject(owner.padding)) list.push([[...base, ...sub, 'padding'], { ...NARROW_LABEL_PADDING }]);
        }
    }
    return list;
}

/**
 * Walk to the parent of `path`; null if a non-plain value is in the way.
 * With `saved`, missing containers are created and recorded (`created: true`) so a restore can prune them.
 */
function parentOf(root, path, saved = null) {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (node[key] === undefined) {
            if (!saved) return null;
            node[key] = {};
            saved.set(JSON.stringify(path.slice(0, i + 1)), { had: false, value: undefined, created: true });
        }
        if (!isPlainObject(node[key]) && !Array.isArray(node[key])) return null;
        node = node[key];
    }
    return node;
}

/**
 * Apply (narrow) or restore (wide) the narrow overrides on a Chart.js options object, in place.
 * @param {object} options - raw Chart.js options (chart.config.options)
 * @param {boolean} narrow
 * @param {Map<string, {had: boolean, value: *}>} saved - originals, kept by the caller per options object
 */
export function applyNarrowOverrides(options, narrow, saved) {
    if (!narrow) {
        // newest first: leaves before the containers created for them
        for (const [key, { had, value, created }] of [...saved].reverse()) {
            const path = JSON.parse(key);
            const parent = parentOf(options, path);
            if (!parent) continue;
            const last = path.at(-1);
            if (had) parent[last] = value;
            else if (!created || Object.keys(parent[last] ?? {}).length === 0) delete parent[last];
        }
        saved.clear();
        return;
    }
    for (const [path, override] of narrowOverrides(options)) {
        const key = JSON.stringify(path);
        const parent = parentOf(options, path, saved);
        if (!parent) continue;
        const last = path.at(-1);
        if (!saved.has(key)) saved.set(key, { had: Object.hasOwn(parent, last), value: parent[last] });
        const original = saved.get(key).value;
        parent[last] = typeof override === 'function' ? override(original) : override;
    }
}

const savedByOptions = new WeakMap();

/** Chart.js inline plugin: narrow overrides by current chart width (re-evaluated on every update/resize). */
export const narrowChartPlugin = {
    id: 'narrowLayout',
    beforeUpdate(chart) {
        const options = chart.config?.options;
        if (!options) return;
        let saved = savedByOptions.get(options);
        if (!saved) {
            saved = new Map();
            savedByOptions.set(options, saved);
        }
        applyNarrowOverrides(options, isNarrowChartWidth(chart.width), saved);
    },
};

/** Toggle `chart-narrow` on a chart host from its current width. */
export function syncNarrowClass(host) {
    const narrow = isNarrowChartWidth(host.clientWidth);
    host.classList.toggle('chart-narrow', narrow);
    return narrow;
}
```

Restoring removes every leaf and container the narrow pass added, so the options deep-equal the desktop original.

- [ ] **Step 4: Run** `node --test tests/chart-narrow-layout.test.mjs`. Expected: all pass. Add the file to `package.json`'s `node --test` list, add it to `sw.js` STATIC_ASSETS, then run `npm test` (all green).

- [ ] **Step 5: Commit** — `feat(charts): narrow-layout helper for phone-portrait charts`.

---

### Task 2: Wire the components

**Files:** `js/charts/DiveProfileChart.js`, `js/charts/MValueChart.js`, `js/charts/GFChart.js`, `js/charts/interactionLock.js`

**Interfaces — Consumes:** `narrowChartPlugin`, `syncNarrowClass`, `rankingPlacement`, `isNarrowChartWidth` from Task 1.
**Produces (CSS hooks for Task 3):** host classes `dpc-host` / `mvc-host` / `gfc-host` + `chart-narrow`; `chart-compartments`, `chart-quick-btns`, `chart-chip` (with inline `--chip-color`), `chart-chip-dot`, `chart-hint`, `chart-timeline`, `chart-timeline-btn`, `chart-timeline-slider`, `chart-timeline-time`, `chart-overlay-btn`, `chart-mini-profile`; GF `gfc-ranking-panel gfc-ranking-below` with `<p class="gfc-ranking-title">` + `<ol class="gfc-ranking-list">`.

Change list. Inline styles stay exactly as they are; only classes and a CSS variable are added.

- [ ] **Step 1 (all three charts):** at the top of `_buildDOM()`, add `this.container.classList.add('<prefix>-host');` and `syncNarrowClass(this.container);`. In the existing ResizeObserver callback, call `syncNarrowClass(this.container)` first (synchronously, before the debounce). Add `narrowChartPlugin` to every Chart.js config's `plugins: [...]` array (create the array where a config has none). Find each `new Chart(` in the three files and make sure every one is covered.
- [ ] **Step 2 (MVC + GFC + DPC tissue controls):** add `chart-compartments` to the compartment controls container (`mvc-controls`, `gfc-controls`, `dpc-tissue-controls`). Add `chart-quick-btns` to the quick-button group div, `chart-chip` to each compartment `<label>`, with `--chip-color: ${comp.color};` appended to its cssText. Add `chart-chip-dot` to the colour-dot span and `chart-hint` to the shortcut hint div.
- [ ] **Step 3 (MVC + GFC timeline):** add `chart-timeline` to the timeline container, `chart-timeline-btn` in `_createButton`, `chart-timeline-slider` to `timeSlider` and `chart-timeline-time` to `timeDisplay`. Add `chart-mini-profile` to `miniProfileCanvas`.
- [ ] **Step 4 (overlay buttons):** add the `chart-overlay-btn` class to the fullscreen and reset-zoom buttons in all three charts. In `interactionLock.js`, set `btn.className = 'chart-interaction-lock-btn chart-overlay-btn'`.
- [ ] **Step 5 (GF ranking):** in `GFChart._renderCompartmentRanking`, replace the `chart.width < 800` gate with `rankingPlacement(chart.width)`. For `'hidden'` (or an empty ranking): `display: none`, return. For `'overlay'`: make sure the panel is a child of `this.chartContainer` (re-append if not), remove `gfc-ranking-below`, and keep the existing table rendering and positioning. For `'below'`: move the panel to just after `this.chartContainer` (`this.chartContainer.after(panel)` if its parent differs) and add `gfc-ranking-below`. Clear the inline `left/top/width/maxHeight`, set `display = 'block'`, and render:

```js
// compact list under the plot (phones)
const heading = document.createElement('p');
heading.className = 'gfc-ranking-title';
heading.textContent = title;
const list = document.createElement('ol');
list.className = 'gfc-ranking-list';
for (const row of ranking) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'gfc-ranking-dot';
    dot.style.backgroundColor = row.color;
    const value = document.createElement('b');
    value.textContent = `${fmtNum(row.gfPercent, 1)} %`;
    li.append(dot, ` TC${row.id} `, value);
    list.appendChild(li);
}
panel.replaceChildren(heading, list);
```

  Prefix `rankingKey` with the placement (`${placement}|…`) so switching mode re-renders.
- [ ] **Step 6:** `npm test` green. Load `http://localhost:5518/sandbox/index.html` at desktop width and confirm in the console that there are no errors and the charts look unchanged. Commit: `feat(charts): narrow-layout hooks in profile, P-P and GF charts`.

---

### Task 3: Narrow CSS

**Files:** `css/styles.css` (new block after the `.gfc-wrapper.gfc-fullscreen` rule, ~line 1878).

- [ ] **Step 1:** add the block below. `!important` is used only against inline styles.

```css
/* ---------- Narrow charts (host ≤ 600 px; class set by js/charts/narrowLayout.js) ----------
   Inline styles on the chart DOM are the desktop look; !important here only beats those. */
.mvc-host.chart-narrow,
.gfc-host.chart-narrow {
    height: auto !important;     /* page-fixed heights would squash the plot under the controls */
    min-height: 0 !important;
}
.dpc-host.chart-narrow { max-height: 460px; }

.chart-narrow > .mvc-wrapper:not(.mvc-fullscreen),
.chart-narrow > .gfc-wrapper:not(.gfc-fullscreen) { height: auto !important; }
.chart-narrow .mvc-wrapper:not(.mvc-fullscreen) > .mvc-chart-container,
.chart-narrow .gfc-wrapper:not(.gfc-fullscreen) > .gfc-chart-container {
    flex: none !important;
    height: auto;
    aspect-ratio: 1;
    min-height: 300px;
    max-height: 70vh;
}
.chart-narrow .chart-mini-profile { height: 64px !important; }

/* Overlay buttons: touch-sized, inside the 40 px gutter the plugin reserves above the legend */
.chart-narrow .chart-overlay-btn {
    width: 34px;
    height: 34px;
    padding: 0 !important;
    line-height: 1;
}

/* Compartment chips: 8 per row, colour shown by border + tint, checkbox kept for a11y */
.chart-narrow .chart-compartments { gap: 4px !important; }
.chart-narrow .chart-quick-btns button { min-height: 34px; }
.chart-narrow .chart-chip {
    position: relative;
    flex: 0 0 calc((100% - 7 * 4px) / 8) !important;
    justify-content: center;
    box-sizing: border-box;
    min-height: 34px;
    padding: 0 !important;
    font-variant-numeric: tabular-nums;
}
.chart-narrow .chart-chip input[type="checkbox"] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    margin: 0;
}
.chart-narrow .chart-chip .chart-chip-dot { display: none; }
.chart-narrow .chart-chip:has(input:checked) {
    background: color-mix(in srgb, var(--chip-color) 24%, transparent);
    font-weight: 700;
}
.chart-narrow .chart-chip:focus-within { outline: 2px solid var(--focus-ring, var(--primary-color)); outline-offset: 1px; }
.chart-narrow .chart-hint { display: none; }

/* Playback: buttons fill row 1, slider + time share row 2 */
.chart-narrow .chart-timeline { flex-wrap: wrap; gap: 6px !important; }
.chart-narrow .chart-timeline-btn { flex: 1 0 40px; min-height: 40px; }
.chart-narrow .chart-timeline-slider { flex: 1 1 140px !important; min-height: 32px; }
.chart-narrow .chart-timeline-time { margin-left: auto; min-width: 0 !important; font-size: 0.8rem; }

/* GF tissue ranking below the plot */
.gfc-ranking-panel.gfc-ranking-below {
    position: static;
    margin-top: 6px;
    box-shadow: none;
    background: var(--card-background);
}
.gfc-ranking-title { margin: 0 0 0.2rem; font-weight: 700; }
.gfc-ranking-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
}
.gfc-ranking-list li { white-space: nowrap; }
```

- [ ] **Step 2:** `npm test` green. Commit: `feat(charts): phone-portrait layout for chart controls, playback and ranking`.

---

### Task 4: Browser verification across pages (controller, by hand)

Harness: `scratchpad/h/index.html?p=<page>&w=390&h=1400` on port 5519 (it symlinks the worktree). The dive log uses `?u=lab/dive-log-demo.html`, regenerated with `scratchpad/mkdemo.sh` after any `lab/dive-log.html` change.

- [ ] Every page at 390 and 360 px: Sandbox (Profile, Pressure, Gas, Partial pressure, Tissue tabs; P-P; GF), pressure, tissue-loading, m-values, gradient-factors, sandbox/repetitive-dives (select a dive), the dive-log demo. Check `scrollWidth === innerWidth`.
- [ ] Legend not covered by buttons; axis titles not clipped; playback fits; chips 2 rows; ranking below the GF plot (press play / step so the ranking appears).
- [ ] Desktop 1400 px: compare against `origin/main` screenshots — no change.
- [ ] Dark theme (`document.documentElement.dataset.theme = 'dark'`) at 390 px.
- [ ] Fullscreen button on narrow: fills the viewport, exit works.
- [ ] Fix what is found (page-level padding for the dive log on phones if needed, annotation clipping). Commit each fix.

### Task 5: Ship

- [ ] `npm test`, `gh auth switch --user matej-hron`, `git push -u origin feat/mobile-charts`, then `gh pr create` to main (body ends with the Claude Code line). Write `REPORT.md` (not committed).
