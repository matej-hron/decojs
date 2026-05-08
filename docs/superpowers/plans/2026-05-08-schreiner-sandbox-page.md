# Schreiner Sandbox Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sandbox/schreiner.html` — an interactive Schreiner equation page modeled on the recently-shipped Haldane page (`sandbox/haldane.html`), per spec `docs/superpowers/specs/2026-05-08-schreiner-sandbox-page-design.md`.

**Architecture:** Start by copying `sandbox/haldane.html` to `sandbox/schreiner.html`, then apply a series of focused edits: replace Target-depth field with Rate + Time fields, swap the formula to Schreiner's, add a 5th term card (R), make the chart show two lines (sloped Palv + curved Pt), and make the M-value bar update per t (since depth changes during a Schreiner segment). The Haldane shell already includes the simplified-math toggle, the M-value strip with Pt₀/Palv/Pamb anchors, the half-time tick markers, and the saturation readout — most of that carries over with minor tweaks.

**Tech Stack:** Vanilla ES Modules, no build. Inline `<style>` + `<script type="module">` per page. Reuses `schreinerEquation()` from `js/decoModel.js`.

**Branch:** `feat/schreiner-sandbox` (already created; spec already committed there at `d1aae06`).

**Smoke-test harness:** `.claude-scratch/schreiner_smoke.py` (gitignored) — boots the page on a local server via `with_server.py` and runs Playwright assertions. Each task adds its assertions.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `sandbox/schreiner.html` | Create (cp from haldane.html, edit) | The whole page |
| `js/nav.js` | Modify | Add Schreiner entry under Sandbox submenu after Haldane |
| `index.html` | Modify | Add Schreiner sublink in Sandbox topic card after Haldane |
| `sw.js` | Modify | Register `./sandbox/schreiner.html` in `STATIC_ASSETS`; bump `CACHE_NAME` |
| `css/styles.css` | Modify | Bump `.version-number::after` content |
| `locales/en.json` | Modify | Add `nav.sandbox.schreiner`, `home.topics.sandboxLinks.schreiner`, `sandbox.schreiner.*` block |
| `locales/cs.json` | Modify | Same keys, Czech values |
| `locales/es.json` | Modify | Same keys, Spanish values |

---

## Task 1: Page skeleton (copy from Haldane, swap identity)

**Goal:** A `sandbox/schreiner.html` page that loads, has the title "Schreiner Equation", appears in nav, is in the service-worker cache. No Schreiner-specific logic yet — the page still computes and renders Haldane underneath because we just copied the file. Subsequent tasks will swap the math.

**Files:**
- Create: `sandbox/schreiner.html` (cp of haldane.html with cosmetic swaps)
- Modify: `js/nav.js` (add submenu entry)
- Modify: `sw.js` (add to STATIC_ASSETS, do NOT bump version yet)
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (add `nav.sandbox.schreiner` plus a stub `sandbox.schreiner.{title,subtitle,disclaimerBanner,disclaimer}` block)
- Create: `.claude-scratch/schreiner_smoke.py` (gitignored)

- [ ] **Step 1: Copy Haldane page as starting point**

```bash
cp sandbox/haldane.html sandbox/schreiner.html
```

- [ ] **Step 2: Cosmetic swaps in `sandbox/schreiner.html`**

Edit the page header, hero, and disclaimer text. Find and update:

- Line near the top with `<title>Haldane Equation — Deco Theory</title>` → `<title>Schreiner Equation — Deco Theory</title>`
- The `<h1 data-i18n="sandbox.haldane.title">Haldane Equation</h1>` → `<h1 data-i18n="sandbox.schreiner.title">Schreiner Equation</h1>`
- The `<p class="hero-subtitle" data-i18n="sandbox.haldane.subtitle">…</p>` → change `data-i18n` to `sandbox.schreiner.subtitle` and the inline text to `Linear-rate companion to the Haldane page — watch the equation evolve as ambient pressure slides.`
- The `<div class="disclaimer-banner" data-i18n="sandbox.haldane.disclaimerBanner">…</div>` → change `data-i18n` to `sandbox.schreiner.disclaimerBanner`. Inline text: `<strong>Educational Use Only</strong> — Interactive walk-through of the Schreiner equation for linear-rate ambient pressure changes.`
- The footer disclaimer paragraph `data-i18n="sandbox.haldane.disclaimer"` → `sandbox.schreiner.disclaimer`. Inline text identical to the Haldane version.

Don't touch any other `data-i18n` attributes yet — those will get updated per-task as the corresponding markup is rewritten.

- [ ] **Step 3: Write the failing smoke test**

Create `.claude-scratch/schreiner_smoke.py`:

```python
"""Growing smoke test for sandbox/schreiner.html. Each plan task adds assertions."""
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5599/sandbox/schreiner.html'


def num(page, sel):
    return float(page.locator(sel).inner_text().replace('bar', '').replace('min⁻¹', '').replace('bar/min', '').replace(',', '.').strip())


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context().new_page()

        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append(f'PAGEERR: {e}'))

        page.goto(URL)
        page.wait_for_load_state('networkidle')

        # ---- Task 1: skeleton ----
        h1 = page.locator('h1').inner_text()
        assert 'Schreiner' in h1, f'expected Schreiner in h1, got: {h1!r}'

        nav_link = page.locator('a[href*="schreiner"]').count()
        assert nav_link >= 1, 'no nav link to schreiner.html'

        print(f'[task 1] h1={h1!r}, nav_link_count={nav_link}, errs={errs}')
        assert not errs, f'console errors: {errs}'

        browser.close()


if __name__ == '__main__':
    run()
```

- [ ] **Step 4: Run the smoke test — expect failure (page doesn't exist yet, or h1 still says Haldane if Step 2 wasn't done)**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/schreiner_smoke.py
```

Expected: AssertionError or 404 if Steps 1+2 incomplete. Move past once both Steps 1 and 2 done and the page loads with "Schreiner" in the h1.

- [ ] **Step 5: Add nav entry and i18n keys for nav**

In `js/nav.js`, find the Sandbox submenu and add the Schreiner entry **immediately after** the Haldane entry:

```js
{ href: 'sandbox/schreiner.html', labelKey: 'nav.sandbox.schreiner', label: 'Schreiner Equation' },
```

So the order in the Sandbox submenu becomes: deco → tissue-saturation → haldane → **schreiner** → transfilling → cascade-filling → gas-law.

In `locales/en.json` find the `nav.sandbox` block and add `"schreiner": "Schreiner Equation"` after `haldane`.

In `locales/cs.json`: `"schreiner": "Schreinerova rovnice"`.

In `locales/es.json`: `"schreiner": "Ecuación de Schreiner"`.

- [ ] **Step 6: Add stub page-level i18n keys**

In all three locale files, find the existing `sandbox.haldane` block and add a parallel `sandbox.schreiner` block right after its closing brace. Use these exact texts:

`en.json`:

```json
"schreiner": {
    "title": "Schreiner Equation",
    "subtitle": "Linear-rate companion to the Haldane page — watch the equation evolve as ambient pressure slides.",
    "disclaimerBanner": "<strong>Educational Use Only</strong> — Interactive walk-through of the Schreiner equation for linear-rate ambient pressure changes.",
    "disclaimer": "<strong>Disclaimer:</strong> For educational purposes only. The actual diving algorithm uses additional logic."
},
```

`cs.json`:

```json
"schreiner": {
    "title": "Schreinerova rovnice",
    "subtitle": "Lineárně-rychlostní doplněk k Haldaneově stránce — pozorujte, jak se rovnice vyvíjí, když se okolní tlak posouvá.",
    "disclaimerBanner": "<strong>Pouze pro výukové účely</strong> — Interaktivní rozbor Schreinerovy rovnice pro lineární změny okolního tlaku.",
    "disclaimer": "<strong>Upozornění:</strong> Pouze pro výukové účely. Reálný dekompresní algoritmus používá další logiku."
},
```

`es.json`:

```json
"schreiner": {
    "title": "Ecuación de Schreiner",
    "subtitle": "Compañera de tasa lineal de la página de Haldane — observa cómo la ecuación evoluciona mientras la presión ambiental se desliza.",
    "disclaimerBanner": "<strong>Solo para fines educativos</strong> — Recorrido interactivo de la ecuación de Schreiner para cambios lineales de presión ambiental.",
    "disclaimer": "<strong>Aviso:</strong> Solo para fines educativos. El algoritmo de descompresión real usa lógica adicional."
},
```

Validate JSON parses:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); if(!j.sandbox.schreiner) throw new Error(l+' missing schreiner block'); console.log(l, j.sandbox.schreiner.title)});"
```

Expected:
```
en Schreiner Equation
cs Schreinerova rovnice
es Ecuación de Schreiner
```

- [ ] **Step 7: Add page to sw.js STATIC_ASSETS**

In `sw.js`, find the `STATIC_ASSETS` array. Add `'./sandbox/schreiner.html'` immediately after the existing `'./sandbox/haldane.html'` entry. Do NOT change `CACHE_NAME` — version bump happens in the final task.

- [ ] **Step 8: Re-run smoke test — expect pass**

Same command as Step 4. Expected output:
```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
```

Note: at this point the page renders all the Haldane controls and term cards (because we just copied the file). That's fine — the title and nav link assertions pass, which is what Task 1 validates. Subsequent tasks rewrite the body.

- [ ] **Step 9: Commit**

```bash
git add sandbox/schreiner.html js/nav.js sw.js locales/en.json locales/cs.json locales/es.json
git commit -m "$(cat <<'EOF'
feat(schreiner): page skeleton (Haldane copy + identity swaps)

Copy of sandbox/haldane.html with title/hero/disclaimer/data-i18n
keys swapped to sandbox.schreiner.*. Nav and home wiring registered.
The page body still computes Haldane underneath — subsequent tasks
swap inputs to start+rate+time, switch the formula to Schreiner's,
add a 5th term card for R, and make the chart show two lines.

Refs spec: docs/superpowers/specs/2026-05-08-schreiner-sandbox-page-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Inputs strip (start depth + rate + time, with derived end depth)

**Goal:** Replace the Haldane-style "Target depth" input with two new inputs — depth rate (m/min, signed) and segment time (min) — plus a small read-only "End depth = X.X m" display. Update the state object and recompute() to use the new inputs. The page still uses Haldane math at this point (next task swaps to Schreiner); the goal here is just the input-strip rewiring.

**Files:**
- Modify: `sandbox/schreiner.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Add Task 2 smoke-test assertions**

Append inside `run()` after the Task 1 block:

```python
        # ---- Task 2: inputs strip (start + rate + time + end-depth display) ----
        assert page.locator('#startDepth').input_value() == '30'
        assert page.locator('#depthRate').input_value() == '-10'
        assert page.locator('#segmentTime').input_value() == '0.9'

        # End depth display = start + rate * time = 30 + (-10) * 0.9 = 21.0
        end_depth_text = page.locator('#endDepthDisplay').inner_text()
        assert '21.0' in end_depth_text, f'expected 21.0 in end-depth display, got: {end_depth_text!r}'

        # Change rate and verify end depth recomputes
        page.locator('#depthRate').fill('-20')
        page.locator('#depthRate').dispatch_event('input')
        page.wait_for_timeout(50)
        end_depth_text = page.locator('#endDepthDisplay').inner_text()
        assert '12.0' in end_depth_text, f'expected 12.0 (30 + -20*0.9), got: {end_depth_text!r}'

        # Change time
        page.locator('#segmentTime').fill('1.5')
        page.locator('#segmentTime').dispatch_event('input')
        page.wait_for_timeout(50)
        end_depth_text = page.locator('#endDepthDisplay').inner_text()
        assert '0.0' in end_depth_text, f'expected 0.0 (30 + -20*1.5), got: {end_depth_text!r}'

        print('[task 2] inputs ok')
```

- [ ] **Step 2: Run smoke test — expect failure**

(Same command as in Task 1 Step 4.) Expected: timeout waiting for `#depthRate` (doesn't exist yet — page still has `#targetDepth` from the Haldane copy).

- [ ] **Step 3: Add labels.depthRate, labels.segmentTime, labels.endDepth in i18n**

In each of `locales/{en,cs,es}.json`, find the existing `sandbox.haldane.labels` block as a reference, then add to the `sandbox.schreiner` block (which currently only has title/subtitle/disclaimerBanner/disclaimer) a new `labels` sub-block:

`en.json` — extend `sandbox.schreiner` to include:

```json
"labels": {
    "startDepth": "Start depth (m)",
    "depthRate": "Depth rate (m/min)",
    "segmentTime": "Time (min)",
    "endDepth": "End depth",
    "compartment": "Compartment",
    "model": "Model",
    "gas": "Gas",
    "time": "Time",
    "simplified": "Simplified math"
},
"gas": {
    "air": "Air (F<sub>N₂</sub> = 0.79)"
},
"simplifiedHint": "napkin formulas",
"mvalue": {
    "title": "M-value check",
    "within": "within",
    "exceeded": "exceeded"
}
```

`cs.json`:

```json
"labels": {
    "startDepth": "Počáteční hloubka (m)",
    "depthRate": "Rychlost změny hloubky (m/min)",
    "segmentTime": "Čas (min)",
    "endDepth": "Cílová hloubka",
    "compartment": "Kompartment",
    "model": "Model",
    "gas": "Plyn",
    "time": "Čas",
    "simplified": "Zjednodušené vzorce"
},
"gas": {
    "air": "Vzduch (F<sub>N₂</sub> = 0,79)"
},
"simplifiedHint": "ručně počítané",
"mvalue": {
    "title": "Kontrola M-hodnoty",
    "within": "v limitu",
    "exceeded": "překročeno"
}
```

`es.json`:

```json
"labels": {
    "startDepth": "Profundidad inicial (m)",
    "depthRate": "Tasa de profundidad (m/min)",
    "segmentTime": "Tiempo (min)",
    "endDepth": "Profundidad final",
    "compartment": "Compartimento",
    "model": "Modelo",
    "gas": "Gas",
    "time": "Tiempo",
    "simplified": "Cálculos simplificados"
},
"gas": {
    "air": "Aire (F<sub>N₂</sub> = 0.79)"
},
"simplifiedHint": "fórmulas a mano alzada",
"mvalue": {
    "title": "Comprobación del valor M",
    "within": "dentro",
    "exceeded": "excedido"
}
```

Validate:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); const s=j.sandbox.schreiner; if(!s.labels.depthRate || !s.labels.segmentTime || !s.labels.endDepth) throw new Error(l+' missing'); console.log(l, s.labels.depthRate)});"
```

- [ ] **Step 4: Replace Target-depth field with Rate + Time fields + End-depth display**

In `sandbox/schreiner.html`, find the Target-depth field (the Haldane-copied markup):

```html
            <div class="field">
                <label for="targetDepth" data-i18n="sandbox.haldane.labels.targetDepth">Target depth (m)</label>
                <input type="number" id="targetDepth" min="0" max="30" step="1" value="30">
            </div>
```

Replace with three new fields (rate, time, end-depth display):

```html
            <div class="field">
                <label for="depthRate" data-i18n="sandbox.schreiner.labels.depthRate">Depth rate (m/min)</label>
                <input type="number" id="depthRate" min="-30" max="30" step="0.5" value="-10">
            </div>
            <div class="field">
                <label for="segmentTime" data-i18n="sandbox.schreiner.labels.segmentTime">Time (min)</label>
                <input type="number" id="segmentTime" min="0.1" max="60" step="0.1" value="0.9">
            </div>
            <div class="field">
                <label data-i18n="sandbox.schreiner.labels.endDepth">End depth</label>
                <span class="gas-readout" id="endDepthDisplay">21.0 m</span>
            </div>
```

Also update the existing **Start depth** field in the same markup so its `data-i18n` points to the schreiner namespace:

Find:
```html
                <label for="startDepth" data-i18n="sandbox.haldane.labels.startDepth">Start depth (m)</label>
```

Change `data-i18n` to:
```html
                <label for="startDepth" data-i18n="sandbox.schreiner.labels.startDepth">Start depth (m)</label>
```

Also change the Start depth input's default value from `0` to `30`:

Find:
```html
                <input type="number" id="startDepth" min="0" max="30" step="1" value="0">
```

Change to:
```html
                <input type="number" id="startDepth" min="0" max="30" step="1" value="30">
```

Update the other inputs-strip data-i18n keys from `sandbox.haldane.labels.*` to `sandbox.schreiner.labels.*` (compartment, model, gas, simplified). And the `data-i18n` for the gas-readout span from `sandbox.haldane.gas.air` to `sandbox.schreiner.gas.air`. And the simplified `data-i18n` keys to `sandbox.schreiner.labels.simplified` and `sandbox.schreiner.simplifiedHint`. (Use grep to find them all: `grep -n 'data-i18n="sandbox.haldane' sandbox/schreiner.html`.)

- [ ] **Step 5: Update state object and event wiring in the inline script**

Find the `state` const declaration in the inline `<script type="module">` block:

```js
        const state = {
            startDepth: 0,
            targetDepth: 30,
            compartmentIdx: 4,
            variant: 'ZH-L16C',
            t: 0,
            n2Fraction: N2_FRACTION,
            simplified: false,
        };
```

Replace with:

```js
        const state = {
            startDepth: 30,
            depthRate: -10,    // m/min, signed (negative = ascent)
            segmentTime: 0.9,  // min, defines scrubber range
            compartmentIdx: 4,
            variant: 'ZH-L16C',
            t: 0,
            n2Fraction: N2_FRACTION,
            simplified: false,
        };
```

Find the `els` DOM-cache:

```js
        const els = {
            startDepth:   document.getElementById('startDepth'),
            targetDepth:  document.getElementById('targetDepth'),
            compartment:  document.getElementById('compartment'),
        };
```

Replace with:

```js
        const els = {
            startDepth:   document.getElementById('startDepth'),
            depthRate:    document.getElementById('depthRate'),
            segmentTime:  document.getElementById('segmentTime'),
            endDepthDisp: document.getElementById('endDepthDisplay'),
            compartment:  document.getElementById('compartment'),
        };
```

Find the existing event listeners block:

```js
        els.startDepth.addEventListener('input', () => {
            state.startDepth = parseFloat(els.startDepth.value) || 0;
            recompute();
        });
        els.targetDepth.addEventListener('input', () => {
            state.targetDepth = parseFloat(els.targetDepth.value) || 0;
            recompute();
        });
        els.compartment.addEventListener('change', () => { /* ... */ });
```

Replace the targetDepth listener with two new ones (rate + time):

```js
        els.startDepth.addEventListener('input', () => {
            state.startDepth = parseFloat(els.startDepth.value) || 0;
            recompute();
        });
        els.depthRate.addEventListener('input', () => {
            state.depthRate = parseFloat(els.depthRate.value) || 0;
            recompute();
        });
        els.segmentTime.addEventListener('input', () => {
            state.segmentTime = parseFloat(els.segmentTime.value) || 0;
            applyTimeRange();
            recompute();
        });
```

Keep the compartment change listener intact.

- [ ] **Step 6: Update applyTimeRange() to use state.segmentTime**

Find the existing `applyTimeRange()` (which currently uses compartment T½):

```js
        function applyTimeRange() {
            const comp = getCompartmentsForVariant(state.variant)[state.compartmentIdx];
            const tMax = Math.ceil(6 * comp.halfTime);
            timeSlider.max = String(tMax);
            if (state.t > tMax) state.t = tMax;
        }
```

Replace with:

```js
        function applyTimeRange() {
            const tMax = Math.max(0.1, state.segmentTime);
            timeSlider.max = String(tMax);
            timeSlider.step = '0.05';   // sub-minute resolution for short segments
            if (state.t > tMax) state.t = tMax;
        }
```

Also update the `timeSlider` HTML attributes for sane defaults. Find:

```html
            <input type="range" id="timeSlider" min="0" max="120" step="1" value="0">
```

Change to:

```html
            <input type="range" id="timeSlider" min="0" max="0.9" step="0.05" value="0">
```

- [ ] **Step 7: Update setTime() to support fractional t**

Find `setTime()`:

```js
        function setTime(newT) {
            const tMax = parseInt(timeSlider.max, 10);
            state.t = Math.max(0, Math.min(tMax, Math.round(newT)));
            timeSlider.value = String(state.t);
            timeValue.textContent = String(state.t);
            updateStepButtons();
            recompute();
        }
```

Replace with:

```js
        function setTime(newT) {
            const tMax = parseFloat(timeSlider.max);
            state.t = Math.max(0, Math.min(tMax, parseFloat(newT.toFixed(2))));
            timeSlider.value = String(state.t);
            timeValue.textContent = state.t.toFixed(2);
            updateStepButtons();
            recompute();
        }
```

(Schreiner segments are short and fractional — we round to 2 decimal places instead of integers.)

- [ ] **Step 8: Add end-depth-display update inside `recompute()`**

In `recompute()`, find the `// Substituted-formula line` block (or wherever current DOM updates begin) and at the very top of the function (before any other DOM writes), add:

```js
            // End depth display
            const endDepth = state.startDepth + state.depthRate * state.segmentTime;
            const endDepthClamped = Math.max(0, endDepth);  // clamp at 0 — can't ascend through surface
            els.endDepthDisp.textContent = `${endDepthClamped.toFixed(1)} m`;
```

- [ ] **Step 9: Run smoke test — expect Tasks 1 & 2 to pass**

Same command. Expected:
```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
```

If errors appear about undefined `targetDepth` references in JS, it's because some downstream code (recompute, etc.) still references the removed input. Those are fixed in Task 3 when we rewrite the math. For Task 2 it's enough that the inputs strip + state + end-depth display work; the page may still throw later errors when trying to compute Haldane against a missing targetDepth — that's expected and Task 3 resolves it. As long as the smoke test reaches the Task 2 assertions before crashing, this is OK.

If the page crashes hard before Task 2's assertions even run, temporarily comment out the `recompute()` call at the end of init while finishing Task 2 — Task 3 restores it.

- [ ] **Step 10: Commit**

```bash
git add sandbox/schreiner.html locales/en.json locales/cs.json locales/es.json .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
feat(schreiner): inputs strip — start + rate + time, derived end depth

Replace Haldane's Target-depth field with two new inputs: depth
rate (m/min, signed) and segment time (min). End depth is shown
as a derived read-only display: end = start + rate * time, clamped
at 0. State object updated; applyTimeRange() now reads from
state.segmentTime instead of compartment T½.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schreiner formula + 5 term cards

**Goal:** Swap the big formula from Haldane's to Schreiner's. Add a 5th term card (R, teal). Update `recompute()` to call `schreinerEquation()` and compute R live. Add the always-on "R = 0 → Haldane" annotation to the R card.

**Files:**
- Modify: `sandbox/schreiner.html`
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Add Task 3 smoke-test assertions**

Append inside `run()` after the Task 2 block:

```python
        # ---- Task 3: formula + 5 term cards ----
        # Reset to defaults
        page.locator('#startDepth').fill('30')
        page.locator('#startDepth').dispatch_event('input')
        page.locator('#depthRate').fill('-10')
        page.locator('#depthRate').dispatch_event('input')
        page.locator('#segmentTime').fill('0.9')
        page.locator('#segmentTime').dispatch_event('input')
        page.locator('#compartment').select_option('4')
        page.locator('#timeSlider').fill('0')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)

        # Reference values at t=0 (precise mode):
        # P_amb,start = 1.01325 + 30*0.1 = 4.01325 → P_alv,0 ≈ 3.1217 bar
        # P_t,0 = P_alv,0 = 3.1217 (saturated at start)
        # R = 0.7902 * (-10) * 0.1 = -0.7902 bar/min
        # k = ln(2)/27 ≈ 0.0257 min⁻¹
        # e^-kt at t=0 = 1.0
        # Pt at t=0 = P_t,0 = 3.1217

        def num(sel):
            return float(page.locator(sel).inner_text().replace('bar/min', '').replace('bar', '').replace('min⁻¹', '').replace(',', '.').strip())

        assert abs(num('#palv0Value') - 3.1217) < 0.01, num('#palv0Value')
        assert abs(num('#pt0Value')   - 3.1217) < 0.01, num('#pt0Value')
        assert abs(num('#rValue')     - (-0.7902)) < 0.001, num('#rValue')
        assert abs(num('#kValue')     - 0.0257) < 0.001, num('#kValue')
        assert abs(num('#expValue')   - 1.0000) < 0.001, num('#expValue')
        assert abs(num('#ptValue')    - 3.1217) < 0.01, num('#ptValue')

        print('[task 3] formula + 5 cards ok at t=0')
```

- [ ] **Step 2: Run smoke test — expect failure**

(Same command as in earlier tasks.) Expected: locator timeout on `#palv0Value`, `#rValue` etc. — they don't exist yet.

- [ ] **Step 3: Add R color to the term palette**

In `sandbox/schreiner.html`'s `<style>` block, find the existing term color rules:

```css
        .term-result { background: rgba(230, 126, 34, 0.18); border-bottom: 2px solid #e67e22; font-weight: 700; }
        .term-palv   { background: rgba(41, 128, 185, 0.16); border-bottom: 2px solid #2980b9; }
        .term-pt0    { background: rgba(231, 76, 60, 0.16);  border-bottom: 2px solid #e74c3c; }
        .term-k      { background: rgba(46, 204, 113, 0.16); border-bottom: 2px solid #27ae60; }
        .term-t      { background: rgba(155, 89, 182, 0.16); border-bottom: 2px solid #9b59b6; }
```

Add a new R rule:

```css
        .term-r      { background: rgba(22, 160, 133, 0.16);  border-bottom: 2px solid #16a085; }
```

Also add a `.term-card.r` border-top color rule. Find the existing block:

```css
        .term-card.palv { border-top-color: #2980b9; }
        .term-card.pt0  { border-top-color: #e74c3c; }
        .term-card.k    { border-top-color: #27ae60; }
        .term-card.exp  { border-top-color: #9b59b6; }
```

Add:

```css
        .term-card.r    { border-top-color: #16a085; }
```

- [ ] **Step 4: Update term-row grid to 5 columns**

Find `.term-row`:

```css
        .term-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.6rem;
            margin: 1rem 0;
        }
```

Change `repeat(4, 1fr)` → `repeat(5, 1fr)`. Also adjust media queries to gracefully fall back:

```css
        .term-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 0.6rem;
            margin: 1rem 0;
        }
        @media (max-width: 1000px) {
            .term-row { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 700px) {
            .term-row { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
            .term-row { grid-template-columns: 1fr; }
        }
```

- [ ] **Step 5: Replace the symbolic formula and substituted line**

Find the existing Haldane formula:

```html
        <!-- Live formula -->
        <div class="haldane-formula">
            <div class="formula-symbolic">
                <span class="term term-result">P<sub>t</sub>(t)</span> =
                <span class="term term-palv">P<sub>alv</sub></span> +
                (<span class="term term-pt0">P<sub>t,0</sub></span>
                − <span class="term term-palv">P<sub>alv</sub></span>) ·
                e<sup>−<span class="term term-k">k</span><span class="term term-t">t</span></sup>
            </div>
            <div class="formula-substituted">
                <strong id="ptValue">0.7510</strong> bar = <span id="palvNum">3.1218</span>
                + (<span id="pt0Num">0.7510</span> − <span id="palvNum2">3.1218</span>) · <span id="expNum">1.0000</span>
            </div>
        </div>
```

Replace with the Schreiner version:

```html
        <!-- Live formula -->
        <div class="haldane-formula">
            <div class="formula-symbolic">
                <span class="term term-result">P<sub>t</sub>(t)</span> =
                <span class="term term-palv">P<sub>alv,0</sub></span> +
                <span class="term term-r">R</span> ·
                (<span class="term term-t">t</span> − 1/<span class="term term-k">k</span>) −
                (<span class="term term-palv">P<sub>alv,0</sub></span> −
                <span class="term term-pt0">P<sub>t,0</sub></span> −
                <span class="term term-r">R</span>/<span class="term term-k">k</span>) ·
                e<sup>−<span class="term term-k">k</span><span class="term term-t">t</span></sup>
            </div>
            <div class="formula-substituted">
                <strong id="ptValue">3.1217</strong> bar = <span id="palv0Num">3.1217</span>
                + <span id="rNum">−0.7902</span> · (<span id="tNum1">0.00</span> − 1/<span id="kNum1">0.0257</span>)
                − (<span id="palv0Num2">3.1217</span> − <span id="pt0Num">3.1217</span> − <span id="rNum2">−0.7902</span>/<span id="kNum2">0.0257</span>) · <span id="expNum">1.0000</span>
            </div>
        </div>
```

(The `bar` keyword tag stays after the Pt value just like the Haldane page; everything else updates per recompute.)

- [ ] **Step 6: Replace 4 term cards with 5**

Find the existing `<div class="term-row">` containing the 4 Haldane cards. Replace the entire term-row contents with these 5 cards:

```html
        <!-- Term cards -->
        <div class="term-row">
            <div class="term-card palv">
                <div class="name">P<sub>alv,0</sub> | alveolar N<sub>2</sub> at start depth</div>
                <div class="formula" id="palv0Symbolic">= (P<sub>amb,start</sub> − 0.0627) · F<sub>N₂</sub></div>
                <div class="formula" id="palv0Subst">= (4.0133 − 0.0627) · 0.7902</div>
                <div class="value"><span id="palv0Value">3.1217</span> bar</div>
                <div class="why">Starting alveolar pressure. Slope-zero point of the moving alveolar source.</div>
            </div>
            <div class="term-card pt0">
                <div class="name">P<sub>t,0</sub> | tissue pressure at t=0</div>
                <div class="formula" id="pt0Symbolic">= (P<sub>amb,start</sub> − 0.0627) · F<sub>N₂</sub></div>
                <div class="formula" id="pt0Subst">= (4.0133 − 0.0627) · 0.7902</div>
                <div class="value"><span id="pt0Value">3.1217</span> bar</div>
                <div class="why">Tissue assumed equilibrated at start depth → equals P<sub>alv,0</sub>.</div>
            </div>
            <div class="term-card r">
                <div class="name">R | alveolar pressure rate</div>
                <div class="formula" id="rSymbolic">= F<sub>N₂</sub> · depth_rate · 0.1</div>
                <div class="formula" id="rSubst">= 0.7902 · (−10) · 0.1</div>
                <div class="value"><span id="rValue">−0.7902</span> bar/min</div>
                <div class="why">Positive = descent (alveolar climbing), negative = ascent. R = 0 → equation collapses to Haldane.</div>
            </div>
            <div class="term-card k">
                <div class="name">k | rate constant</div>
                <div class="formula">= ln(2) / T½</div>
                <div class="formula" id="kSubst">= 0.6931 / 27.0</div>
                <div class="value"><span id="kValue">0.0257</span> min⁻¹</div>
                <div class="why">Faster compartments → bigger k → catch up sooner.</div>
            </div>
            <div class="term-card exp">
                <div class="name">e<sup>−kt</sup> | exponential decay factor</div>
                <div class="formula">= e<sup>−k · t</sup></div>
                <div class="formula" id="expSubst">= e<sup>−0.0257 · 0.00</sup></div>
                <div class="value"><span id="expValue">1.0000</span></div>
                <div class="why">1.0 at t=0, decays toward 0. Multiplied by the initial-disequilibrium term.</div>
            </div>
        </div>
```

- [ ] **Step 7: Rewrite `recompute()` to compute Schreiner**

Find the existing `recompute()` function. Replace its body wholesale with the Schreiner version:

```js
        function recompute() {
            // End depth display
            const endDepth = state.startDepth + state.depthRate * state.segmentTime;
            els.endDepthDisp.textContent = `${Math.max(0, endDepth).toFixed(1)} m`;

            // Math primitives
            const comp = getCompartmentsForVariant(state.variant)[state.compartmentIdx];
            const halfTime = comp.halfTime;
            const k = getRateConstant(halfTime);
            const F = state.simplified ? 0.79 : N2_FRACTION;
            const pAmbStart = ambient(state.startDepth);
            const pAlv0 = alveolar(pAmbStart);
            const pT0 = pAlv0;                              // tissue saturated at start
            const R = F * state.depthRate * 0.1;             // bar/min
            const expTerm = Math.exp(-k * state.t);
            // Pt(t) via the existing primitive
            const Pt = schreinerEquation(pT0, pAlv0, R, state.t, halfTime);

            // Current depth at this t (for M-value bar — depth changes during the segment)
            const currentDepth = Math.max(0, state.startDepth + state.depthRate * state.t);
            const pAmbCurrent = ambient(currentDepth);
            const pAlvCurrent = alveolar(pAmbCurrent);
            const M = getMValue(pAmbCurrent, comp.aN2, comp.bN2);

            // Substituted-formula line
            document.getElementById('ptValue').textContent = Pt.toFixed(4);
            document.getElementById('palv0Num').textContent = pAlv0.toFixed(4);
            document.getElementById('palv0Num2').textContent = pAlv0.toFixed(4);
            document.getElementById('pt0Num').textContent = pT0.toFixed(4);
            document.getElementById('rNum').textContent = R.toFixed(4);
            document.getElementById('rNum2').textContent = R.toFixed(4);
            document.getElementById('tNum1').textContent = state.t.toFixed(2);
            document.getElementById('kNum1').textContent = k.toFixed(4);
            document.getElementById('kNum2').textContent = k.toFixed(4);
            document.getElementById('expNum').textContent = expTerm.toFixed(4);

            // Term cards — symbolic + substituted + value
            const palv0Symbolic = state.simplified
                ? `= (D<sub>start</sub>/10 + 1) · F<sub>N₂</sub>`
                : `= (P<sub>amb,start</sub> − 0.0627) · F<sub>N₂</sub>`;
            const pt0Symbolic = palv0Symbolic;
            const palv0Subst = state.simplified
                ? `= (${state.startDepth}/10 + 1) · ${F}`
                : `= (${pAmbStart.toFixed(4)} − 0.0627) · ${F.toFixed(4)}`;
            const pt0Subst = palv0Subst;
            const rSymbolic = `= F<sub>N₂</sub> · depth_rate · 0.1`;
            const rSubst = `= ${F} · (${state.depthRate}) · 0.1`;

            document.getElementById('palv0Symbolic').innerHTML = palv0Symbolic;
            document.getElementById('palv0Subst').innerHTML = palv0Subst;
            document.getElementById('palv0Value').textContent = pAlv0.toFixed(4);
            document.getElementById('pt0Symbolic').innerHTML = pt0Symbolic;
            document.getElementById('pt0Subst').innerHTML = pt0Subst;
            document.getElementById('pt0Value').textContent = pT0.toFixed(4);
            document.getElementById('rSymbolic').innerHTML = rSymbolic;
            document.getElementById('rSubst').innerHTML = rSubst;
            document.getElementById('rValue').textContent = R.toFixed(4);
            document.getElementById('kValue').textContent = k.toFixed(4);
            document.getElementById('kSubst').textContent = `= 0.6931 / ${halfTime.toFixed(1)}`;
            document.getElementById('expValue').textContent = expTerm.toFixed(4);
            document.getElementById('expSubst').innerHTML = `= e<sup>−${k.toFixed(4)} · ${state.t.toFixed(2)}</sup>`;

            // Saturation %
            const saturationPct = (1 - expTerm) * 100;
            document.getElementById('saturationValue').textContent = saturationPct.toFixed(1);

            // Stash for chart + M-value strip
            window.__schreiner = {
                halfTime, k, pT0, pAlv0, R, Pt, M, pAmbStart, pAmbCurrent, pAlvCurrent,
                expTerm, t: state.t, currentDepth, aN2: comp.aN2, bN2: comp.bN2,
                segmentTime: state.segmentTime, depthRate: state.depthRate,
            };

            drawChart();
            updateMValueStrip();
        }
```

The `schreinerEquation` import must be present. Find the existing decoModel.js import block in the page and ensure it includes `schreinerEquation`:

```js
        import {
            getAmbientPressure,
            getAlveolarN2Pressure,
            schreinerEquation,
            getMValue,
            N2_FRACTION,
        } from '../js/decoModel.js';
```

(Replace `haldaneEquation` with `schreinerEquation` if the copy from Haldane left it in place.)

- [ ] **Step 8: Run smoke test — expect Tasks 1, 2, 3 to pass**

```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
```

- [ ] **Step 9: Commit**

```bash
git add sandbox/schreiner.html .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
feat(schreiner): big formula + 5 term cards (math wiring)

Swap the symbolic formula from Haldane's to Schreiner's. Add a
5th term card for R (alveolar-pressure rate, teal) with the
diver-friendly conversion formula F_N2 · depth_rate · 0.1, plus
an always-on intuition line "R = 0 → equation collapses to
Haldane". recompute() now calls schreinerEquation() and tracks
the diver's instantaneous depth (for the M-value bar).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Time scrubber tweaks (range + step + saturation)

**Goal:** The Haldane copy already provides the time scrubber + ±1/±T½ buttons + saturation readout. Schreiner needs different range mechanics (range = state.segmentTime, fractional step) and the ±T½ snap buttons don't make sense (segments are short). Replace ±T½ buttons with ±0.1 min buttons. Saturation readout already works via Task 3's recompute changes.

**Files:**
- Modify: `sandbox/schreiner.html`
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Add Task 4 smoke-test assertions**

Append after the Task 3 block:

```python
        # ---- Task 4: time control ----
        # Reset
        page.locator('#segmentTime').fill('0.9')
        page.locator('#segmentTime').dispatch_event('input')
        page.locator('#timeSlider').fill('0.45')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)

        # Pt at mid-segment should still be near Pt0 (TC5 is slow vs 0.45 min segment)
        # but expTerm should be < 1
        exp_mid = num('#expValue')
        assert 0.98 < exp_mid < 1.0, f'expTerm at t=0.45 should be just under 1, got {exp_mid}'

        # Saturation = (1 - exp) * 100, so a small percentage
        sat_text = page.locator('#saturationValue').inner_text()
        sat_val = float(sat_text)
        assert 0 < sat_val < 5, f'saturation at t=0.45 with TC5 should be small, got {sat_val}%'

        # +0.1 button: 0.45 → 0.55
        page.locator('#tPlusTenth').click()
        page.wait_for_timeout(50)
        assert page.locator('#timeSlider').input_value() == '0.55', page.locator('#timeSlider').input_value()

        # -0.1 button: 0.55 → 0.45
        page.locator('#tMinusTenth').click()
        page.wait_for_timeout(50)
        assert page.locator('#timeSlider').input_value() == '0.45'

        # Slider max = state.segmentTime
        slider_max = float(page.locator('#timeSlider').get_attribute('max'))
        assert abs(slider_max - 0.9) < 1e-6, f'slider max should be 0.9, got {slider_max}'

        print('[task 4] time control ok')
```

- [ ] **Step 2: Run smoke test — expect failure on `#tPlusTenth`**

(Same command.) Will fail because the buttons are still `tMinusHalf`/`tPlusHalf` from the Haldane copy.

- [ ] **Step 3: Replace ±T½ buttons with ±0.1 buttons**

In `sandbox/schreiner.html`, find the time-row markup:

```html
            <div class="step-btns">
                <button type="button" id="tMinusHalf">−T<sub>½</sub></button>
                <button type="button" id="tMinus1">−1</button>
                <button type="button" id="tPlus1">+1</button>
                <button type="button" id="tPlusHalf">+T<sub>½</sub></button>
            </div>
```

Replace with:

```html
            <div class="step-btns">
                <button type="button" id="tMinusTenth">−0.1</button>
                <button type="button" id="tMinus1">−1</button>
                <button type="button" id="tPlus1">+1</button>
                <button type="button" id="tPlusTenth">+0.1</button>
            </div>
```

In the inline script, find the DOM-ref block for these buttons and the `getHalfTime`/`nextHalfTimeMarker`/`prevHalfTimeMarker` helpers — they're carry-overs from Haldane and no longer used. Remove them. Find:

```js
        function getHalfTime() {
            return getCompartmentsForVariant(state.variant)[state.compartmentIdx].halfTime;
        }

        // ±T½ buttons snap to the next/previous T½ marker on the chart, rather than
        // adding a fixed minute count. Lets the user step through landmarks directly.
        function nextHalfTimeMarker() {
            const ht = getHalfTime();
            const nextIdx = Math.floor(state.t / ht + 1e-9) + 1;
            return Math.round(nextIdx * ht);
        }

        function prevHalfTimeMarker() {
            const ht = getHalfTime();
            const prevIdx = Math.ceil(state.t / ht - 1e-9) - 1;
            return Math.max(0, Math.round(prevIdx * ht));
        }
```

Delete those three functions entirely.

Find and replace the button refs and listeners:

```js
        const btnMinusHalf = document.getElementById('tMinusHalf');
        const btnMinus1    = document.getElementById('tMinus1');
        const btnPlus1     = document.getElementById('tPlus1');
        const btnPlusHalf  = document.getElementById('tPlusHalf');
```

Replace with:

```js
        const btnMinusTenth = document.getElementById('tMinusTenth');
        const btnMinus1     = document.getElementById('tMinus1');
        const btnPlus1      = document.getElementById('tPlus1');
        const btnPlusTenth  = document.getElementById('tPlusTenth');
```

Find the listeners block:

```js
        timeSlider.addEventListener('input', () => setTime(parseInt(timeSlider.value, 10)));
        btnMinusHalf.addEventListener('click', () => setTime(prevHalfTimeMarker()));
        btnMinus1.addEventListener('click',    () => setTime(state.t - 1));
        btnPlus1.addEventListener('click',     () => setTime(state.t + 1));
        btnPlusHalf.addEventListener('click',  () => setTime(nextHalfTimeMarker()));
```

Replace with:

```js
        timeSlider.addEventListener('input', () => setTime(parseFloat(timeSlider.value)));
        btnMinusTenth.addEventListener('click', () => setTime(state.t - 0.1));
        btnMinus1.addEventListener('click',     () => setTime(state.t - 1));
        btnPlus1.addEventListener('click',      () => setTime(state.t + 1));
        btnPlusTenth.addEventListener('click',  () => setTime(state.t + 0.1));
```

Find `updateStepButtons()`:

```js
        function updateStepButtons() {
            const tMax = parseInt(timeSlider.max, 10);
            btnMinus1.disabled    = state.t <= 0;
            btnPlus1.disabled     = state.t >= tMax;
            btnMinusHalf.disabled = prevHalfTimeMarker() >= state.t;
            btnPlusHalf.disabled  = nextHalfTimeMarker() > tMax || state.t >= tMax;
        }
```

Replace with:

```js
        function updateStepButtons() {
            const tMax = parseFloat(timeSlider.max);
            btnMinus1.disabled     = state.t <= 0;
            btnPlus1.disabled      = state.t >= tMax;
            btnMinusTenth.disabled = state.t <= 0;
            btnPlusTenth.disabled  = state.t >= tMax;
        }
```

Update the merged compartment-change listener (Haldane's last fix). Find:

```js
        els.compartment.addEventListener('change', () => {
            state.compartmentIdx = parseInt(els.compartment.value, 10);
            applyTimeRange();                      // may clamp state.t
            timeSlider.value = String(state.t);    // sync slider thumb after clamp
            timeValue.textContent = String(state.t);
            updateStepButtons();
            recompute();                           // recompute with the clamped state.t
        });
```

Update so `timeValue.textContent` shows fractional t:

```js
        els.compartment.addEventListener('change', () => {
            state.compartmentIdx = parseInt(els.compartment.value, 10);
            applyTimeRange();
            timeSlider.value = String(state.t);
            timeValue.textContent = state.t.toFixed(2);
            updateStepButtons();
            recompute();
        });
```

- [ ] **Step 4: Run smoke test — expect Tasks 1–4 to pass**

```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
[task 4] time control ok
```

- [ ] **Step 5: Commit**

```bash
git add sandbox/schreiner.html .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
feat(schreiner): time scrubber — ±0.1 / ±1 step buttons, fractional t

Schreiner segments are typically short (under a minute for fast
ascents/descents) and benefit from sub-minute scrubbing. Replace
the Haldane ±T½ snap buttons with ±0.1 minute buttons; ±1
remains for coarser steps. Slider step is 0.05 to allow smooth
mid-segment scrubbing. Slider max binds to state.segmentTime
(user-controlled), not compartment T½.

The half-time-snap helpers from Haldane are removed — they don't
fit Schreiner's sub-minute typical use.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mini chart with two lines (Palv slope + Pt curve)

**Goal:** Replace Haldane's "asymptote line at constant Palv" with a sloped Palv(t) line that goes from Palv,0 to Palv,end. The curve shows Pt(t) lagging behind. Baseline at Pt,0 stays. Cursor + dot still mark the current t.

**Files:**
- Modify: `sandbox/schreiner.html`
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Add Task 5 smoke-test assertions**

```python
        # ---- Task 5: chart with two lines ----
        page.locator('#timeSlider').fill('0')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        cursor_x_t0 = float(page.locator('#chartCursor').get_attribute('x1'))

        page.locator('#timeSlider').fill('0.45')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        cursor_x_mid = float(page.locator('#chartCursor').get_attribute('x1'))
        assert cursor_x_mid > cursor_x_t0, f'cursor should move right: {cursor_x_t0} -> {cursor_x_mid}'

        # The Palv line should be a path with two endpoints (a sloped line)
        palv_line_d = page.locator('#chartPalv').get_attribute('d')
        assert palv_line_d and palv_line_d.startswith('M') and len(palv_line_d) > 10, palv_line_d

        # Pt curve path is non-empty and starts with M
        pt_curve_d = page.locator('#chartCurve').get_attribute('d')
        assert pt_curve_d and pt_curve_d.startswith('M') and len(pt_curve_d) > 50, pt_curve_d

        print('[task 5] chart ok')
```

- [ ] **Step 2: Run smoke test — expect failure on `#chartPalv` (doesn't exist yet)**

- [ ] **Step 3: Update SVG markup — replace asymptote line with sloped Palv path**

In `sandbox/schreiner.html`, find the SVG element:

```html
            <svg id="ptChart" viewBox="0 0 480 140" preserveAspectRatio="none" aria-label="Pt over time">
                <!-- Asymptote (Palv) -->
                <line id="chartAsymptote" x1="0" x2="480" stroke="#2980b9" stroke-dasharray="4 4" stroke-width="1" stroke-opacity="0.6"/>
                <!-- Baseline (Pt0) -->
                <line id="chartBaseline"  x1="0" x2="480" stroke="#e74c3c" stroke-dasharray="2 4" stroke-width="1" stroke-opacity="0.5"/>
                <!-- Curve -->
                <path id="chartCurve" fill="none" stroke="#2c3e50" stroke-width="1.6"/>
                <!-- Half-time ticks (drawn dynamically) -->
                <g id="chartTicks"></g>
                <!-- Cursor -->
                <line id="chartCursor" stroke="#9b59b6" stroke-width="1.5" y1="0" y2="140"/>
                <!-- Cursor dot -->
                <circle id="chartDot" r="3.5" fill="#9b59b6"/>
            </svg>
```

Replace `<line id="chartAsymptote" .../>` with a sloped path:

```html
            <svg id="ptChart" viewBox="0 0 480 140" preserveAspectRatio="none" aria-label="Pt over time">
                <!-- Palv(t) — straight sloped line from Palv,0 to Palv,end -->
                <path id="chartPalv" fill="none" stroke="#2980b9" stroke-dasharray="4 4" stroke-width="1.2" stroke-opacity="0.7"/>
                <!-- Baseline (Pt,0) — flat dashed red -->
                <line id="chartBaseline" x1="0" x2="480" stroke="#e74c3c" stroke-dasharray="2 4" stroke-width="1" stroke-opacity="0.5"/>
                <!-- Curve (Pt(t)) -->
                <path id="chartCurve" fill="none" stroke="#2c3e50" stroke-width="1.6"/>
                <!-- Half-time ticks (drawn dynamically; may be empty for short segments) -->
                <g id="chartTicks"></g>
                <!-- Cursor -->
                <line id="chartCursor" stroke="#9b59b6" stroke-width="1.5" y1="0" y2="140"/>
                <!-- Cursor dot -->
                <circle id="chartDot" r="3.5" fill="#9b59b6"/>
            </svg>
```

- [ ] **Step 4: Replace `drawChart()` body**

Find the existing `drawChart()` (Haldane version, draws curve + asymptote):

```js
        function drawChart() {
            const { halfTime, pT0, pAlv } = window.__haldane;
            const tMax = parseInt(timeSlider.max, 10);
            // ... (Haldane y-range computation)
            // ... (asymptote, baseline, curve sampling using haldaneEquation)
        }
```

Replace the entire function body:

```js
        function drawChart() {
            const { halfTime, pT0, pAlv0, R, segmentTime, depthRate } = window.__schreiner;
            const tMax = Math.max(0.001, parseFloat(timeSlider.max));
            // Palv at t=0 and at t=segmentTime (linear in time)
            const pAlvEnd = pAlv0 + R * tMax;
            // y range: cover Pt0, Palv,0, Palv,end
            const yMin = Math.min(pT0, pAlv0, pAlvEnd);
            const yMax = Math.max(pT0, pAlv0, pAlvEnd);
            const ySpan = (yMax - yMin) || 1;
            const yLo = yMin - 0.05 * ySpan;
            const yHi = yMax + 0.05 * ySpan;

            const xOf = (t) => CHART_PAD + (CHART_W - 2 * CHART_PAD) * (t / tMax);
            const yOf = (p) => CHART_PAD + (CHART_H - 2 * CHART_PAD) * (1 - (p - yLo) / (yHi - yLo));

            // Pt(t) curve via schreinerEquation
            const pts = [];
            const N = 120;
            for (let i = 0; i <= N; i++) {
                const t = (i / N) * tMax;
                const PtAtT = schreinerEquation(pT0, pAlv0, R, t, halfTime);
                pts.push(`${xOf(t).toFixed(2)},${yOf(PtAtT).toFixed(2)}`);
            }
            chartCurve.setAttribute('d', `M ${pts.join(' L ')}`);

            // Palv(t) — straight line from (0, Palv,0) to (tMax, Palv,end)
            const palvPath = `M ${xOf(0).toFixed(2)},${yOf(pAlv0).toFixed(2)} L ${xOf(tMax).toFixed(2)},${yOf(pAlvEnd).toFixed(2)}`;
            chartPalv.setAttribute('d', palvPath);

            // Baseline at Pt,0
            const yPt0 = yOf(pT0).toFixed(2);
            chartBaseline.setAttribute('y1', yPt0);
            chartBaseline.setAttribute('y2', yPt0);

            // Cursor + dot at current t
            const cursorX = xOf(state.t).toFixed(2);
            chartCursor.setAttribute('x1', cursorX);
            chartCursor.setAttribute('x2', cursorX);
            chartCursor.setAttribute('y2', CHART_H);
            const PtNow = window.__schreiner.Pt;
            chartDot.setAttribute('cx', cursorX);
            chartDot.setAttribute('cy', yOf(PtNow).toFixed(2));

            // Half-time tick markers — only draw if at least one fits in [0, tMax]
            const ticksGroup = document.getElementById('chartTicks');
            ticksGroup.innerHTML = '';
            const SVG_NS = 'http://www.w3.org/2000/svg';
            const maxTicks = Math.min(5, Math.floor(tMax / halfTime));
            for (let i = 1; i <= maxTicks; i++) {
                const tickT = i * halfTime;
                const xT = xOf(tickT);
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', xT);
                line.setAttribute('x2', xT);
                line.setAttribute('y1', CHART_PAD);
                line.setAttribute('y2', CHART_H - CHART_PAD);
                line.setAttribute('stroke', '#7f8c8d');
                line.setAttribute('stroke-dasharray', '2 3');
                line.setAttribute('stroke-width', '0.8');
                line.setAttribute('stroke-opacity', '0.4');
                ticksGroup.appendChild(line);

                const label = document.createElementNS(SVG_NS, 'text');
                label.setAttribute('x', xT);
                label.setAttribute('y', CHART_PAD + 10);
                label.setAttribute('font-size', '11');
                label.setAttribute('fill', '#7f8c8d');
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
                label.textContent = i === 1 ? 'T½' : `${i}T½`;
                ticksGroup.appendChild(label);
            }
        }
```

The DOM-ref block at the top of the chart section needs updating. Find:

```js
        const chartCurve     = document.getElementById('chartCurve');
        const chartCursor    = document.getElementById('chartCursor');
        const chartDot       = document.getElementById('chartDot');
        const chartAsymptote = document.getElementById('chartAsymptote');
        const chartBaseline  = document.getElementById('chartBaseline');
```

Replace with:

```js
        const chartCurve    = document.getElementById('chartCurve');
        const chartCursor   = document.getElementById('chartCursor');
        const chartDot      = document.getElementById('chartDot');
        const chartPalv     = document.getElementById('chartPalv');
        const chartBaseline = document.getElementById('chartBaseline');
```

(Drop `chartAsymptote`, add `chartPalv`.)

- [ ] **Step 5: Run smoke test — expect Tasks 1–5 to pass**

```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
[task 4] time control ok
[task 5] chart ok
```

- [ ] **Step 6: Commit**

```bash
git add sandbox/schreiner.html .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
feat(schreiner): mini chart shows Palv(t) sloped line + Pt(t) curve

Replaces Haldane's flat asymptote with a sloped Palv(t) line going
from Palv,0 to Palv,end (slope = R). The Pt(t) curve via
schreinerEquation lags behind it — visualizes the phase lag that
is the heart of Schreiner.

Half-time tick marks remain (drawn only if any falls inside the
segment window). Baseline at Pt,0 stays.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: M-value strip — dynamic per t

**Goal:** All four anchor markers (Palv, Pamb, M-line) update as the user scrubs t — depth changes during a Schreiner segment, so the safety threshold and ambient pressure both move. Pt,0 alone stays put.

**Files:**
- Modify: `sandbox/schreiner.html`
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Add Task 6 smoke-test assertions**

```python
        # ---- Task 6: M-value strip dynamic ----
        # Reset to defaults
        page.locator('#startDepth').fill('30')
        page.locator('#startDepth').dispatch_event('input')
        page.locator('#depthRate').fill('-10')
        page.locator('#depthRate').dispatch_event('input')
        page.locator('#segmentTime').fill('0.9')
        page.locator('#segmentTime').dispatch_event('input')
        page.locator('#compartment').select_option('4')
        page.locator('#timeSlider').fill('0')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)

        # M at t=0 with current depth = 30 m, comp 5 ZH-L16C → M = 0.62 + 4.0133/0.8126 ≈ 5.5588
        m_t0 = num('#mValue')
        assert abs(m_t0 - 5.5588) < 0.01, m_t0

        # Scrub to t=0.9 → current depth = 30 + (-10)*0.9 = 21 m. P_amb = 3.11325.
        # M = 0.62 + 3.11325/0.8126 = 0.62 + 3.831 = 4.451
        page.locator('#timeSlider').fill('0.9')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        m_end = num('#mValue')
        assert abs(m_end - 4.451) < 0.02, m_end
        assert m_end < m_t0, f'M should decrease as we ascend: t0 M={m_t0}, end M={m_end}'

        print('[task 6] m-value dynamic ok')
```

- [ ] **Step 2: Run smoke test — expect failure (current code uses pAmbTarget, not pAmbCurrent)**

- [ ] **Step 3: Update `updateMValueStrip()` to use current-depth values**

The Haldane copy's `updateMValueStrip()` reads `pAmbTarget` and computes M from it. For Schreiner, the diver's depth changes during the segment, so we should use `pAmbCurrent` (already stashed in `window.__schreiner` from Task 3's recompute).

Find the Haldane version:

```js
        function updateMValueStrip() {
            const { Pt, M, pAmbTarget, aN2, bN2 } = window.__haldane;
            mvaluePtOut.textContent = Pt.toFixed(4);
            mvalueOut.textContent = M.toFixed(4);
            // ...
            const xOfBar = (v) => `${Math.max(0, Math.min(1, v / BAR_MAX)) * 100}%`;
            mvalueMarker.style.left = xOfBar(Pt);
            const mline = document.querySelector('.mvalue-mline');
            mline.style.left = xOfBar(M);
            const { pT0, pAlv } = window.__haldane;
            // ... anchors
            anchorPt0.style.left  = xOfBar(pT0);
            anchorPalv.style.left = xOfBar(pAlv);
            anchorPamb.style.left = xOfBar(pAmbTarget);
            // ... derivation
            deriv.innerHTML = `M = a + P<sub>amb</sub> / b = ${aN2.toFixed(4)} + ${pAmbTarget.toFixed(4)} / ${bN2.toFixed(4)} = <strong>${M.toFixed(4)}</strong>`;
        }
```

Replace with the Schreiner version (reads from `window.__schreiner`, uses current-depth values):

```js
        function updateMValueStrip() {
            const { Pt, M, pAmbCurrent, pAlvCurrent, pT0, aN2, bN2 } = window.__schreiner;
            mvaluePtOut.textContent = Pt.toFixed(4);
            mvalueOut.textContent = M.toFixed(4);
            const xOfBar = (v) => `${Math.max(0, Math.min(1, v / BAR_MAX)) * 100}%`;
            mvalueMarker.style.left = xOfBar(Pt);
            const mline = document.querySelector('.mvalue-mline');
            mline.style.left = xOfBar(M);
            // Anchor markers — Pt0 stays put; Palv and Pamb track current depth
            const anchorPt0  = document.getElementById('mvalueAnchorPt0');
            const anchorPalv = document.getElementById('mvalueAnchorPalv');
            const anchorPamb = document.getElementById('mvalueAnchorPamb');
            anchorPt0.style.left  = xOfBar(pT0);
            anchorPalv.style.left = xOfBar(pAlvCurrent);
            anchorPamb.style.left = xOfBar(pAmbCurrent);
            const exceeded = Pt > M;
            mvalueStatus.textContent = exceeded ? '✗ exceeded' : '✓ within';
            mvalueStatus.classList.toggle('exceeded', exceeded);
            mvalueStatus.classList.toggle('ok', !exceeded);
            const deriv = document.getElementById('mvalueDerivation');
            deriv.innerHTML = `M = a + P<sub>amb</sub>(t) / b = ${aN2.toFixed(4)} + ${pAmbCurrent.toFixed(4)} / ${bN2.toFixed(4)} = <strong>${M.toFixed(4)}</strong>`;
        }
```

(Note: `Pamb` in the derivation now has `(t)` appended to make the time-dependence explicit — pedagogically clearer.)

- [ ] **Step 4: Update i18n data-i18n attributes for the m-value section**

Find the M-value section markup (`<div class="mvalue-section">`). Several `data-i18n` attributes still point to `sandbox.haldane.mvalue.*` — change them to `sandbox.schreiner.mvalue.*`. Specifically:

- `data-i18n="sandbox.haldane.mvalue.title"` → `sandbox.schreiner.mvalue.title`
- `data-i18n="sandbox.haldane.mvalue.within"` → `sandbox.schreiner.mvalue.within`

Use `grep -n 'sandbox.haldane' sandbox/schreiner.html` to find any remaining haldane data-i18n keys; they all need updating.

- [ ] **Step 5: Run smoke test — expect Tasks 1–6 to pass**

```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
[task 4] time control ok
[task 5] chart ok
[task 6] m-value dynamic ok
```

- [ ] **Step 6: Commit**

```bash
git add sandbox/schreiner.html .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
feat(schreiner): M-value strip updates per t (depth changes during segment)

Palv anchor, Pamb anchor, and the M-line all recompute from the
diver's instantaneous depth at the current scrub time. Pt0 alone
stays static (it's defined at t=0). The derivation line spells
out the time dependence: M = a + P_amb(t)/b.

i18n data-i18n keys swapped from sandbox.haldane.mvalue.* to
sandbox.schreiner.mvalue.*.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Haldane-collapse smoke test (rate=0 verification)

**Goal:** Add the explicit smoke-test assertion that Schreiner with rate=0 keeps Pt = Palv,0 across all t (the algebraic-collapse check from the spec).

**Files:**
- Modify: `.claude-scratch/schreiner_smoke.py`

- [ ] **Step 1: Append the assertion**

```python
        # ---- Haldane collapse: rate=0 → Pt stays at Palv,0 across t ----
        page.locator('#startDepth').fill('30')
        page.locator('#startDepth').dispatch_event('input')
        page.locator('#depthRate').fill('0')
        page.locator('#depthRate').dispatch_event('input')
        page.locator('#segmentTime').fill('30')
        page.locator('#segmentTime').dispatch_event('input')
        page.wait_for_timeout(50)

        for t_val in ['0', '5', '15', '27']:
            page.locator('#timeSlider').fill(t_val)
            page.locator('#timeSlider').dispatch_event('input')
            page.wait_for_timeout(30)
            pt = num('#ptValue')
            palv0 = num('#palv0Value')
            assert abs(pt - palv0) < 1e-3, f'rate=0 should keep Pt=Palv,0; got Pt={pt}, Palv,0={palv0} at t={t_val}'

        print('[haldane collapse] rate=0 keeps Pt = Palv,0 across t ok')
```

- [ ] **Step 2: Run smoke test — expect all assertions to pass**

```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
[task 4] time control ok
[task 5] chart ok
[task 6] m-value dynamic ok
[haldane collapse] rate=0 keeps Pt = Palv,0 across t ok
```

(No code changes in `sandbox/schreiner.html` for this task — it's a verification task that the existing math handles rate=0 correctly. If the assertion fails, the Schreiner math primitive or the recompute() wiring has a bug worth investigating before continuing.)

- [ ] **Step 3: Commit**

```bash
git add .claude-scratch/schreiner_smoke.py
git commit -m "$(cat <<'EOF'
test(schreiner): smoke-test the Haldane-collapse case (rate=0)

Verifies that with rate=0 the page produces Pt = Palv,0 for all
t, which is the algebraic collapse of Schreiner to Haldane in this
single-segment-saturated model.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Home sublink + version bump + ship

**Files:**
- Modify: `index.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `sw.js`
- Modify: `css/styles.css`

- [ ] **Step 1: Add the home sublink**

In `index.html`, find the existing Sandbox topic card's sublinks list (around line 70):

```html
                        <a href="sandbox/index.html" data-i18n="home.topics.sandboxLinks.deco">Deco Modelling</a>
                        <a href="sandbox/tissue-saturation.html" data-i18n="home.topics.sandboxLinks.tissue">Tissue Saturation</a>
                        <a href="sandbox/haldane.html" data-i18n="home.topics.sandboxLinks.haldane">Haldane Equation</a>
                        <a href="sandbox/transfilling.html" data-i18n="home.topics.sandboxLinks.transfill">Transfilling</a>
```

Insert a Schreiner sublink immediately after Haldane:

```html
                        <a href="sandbox/index.html" data-i18n="home.topics.sandboxLinks.deco">Deco Modelling</a>
                        <a href="sandbox/tissue-saturation.html" data-i18n="home.topics.sandboxLinks.tissue">Tissue Saturation</a>
                        <a href="sandbox/haldane.html" data-i18n="home.topics.sandboxLinks.haldane">Haldane Equation</a>
                        <a href="sandbox/schreiner.html" data-i18n="home.topics.sandboxLinks.schreiner">Schreiner Equation</a>
                        <a href="sandbox/transfilling.html" data-i18n="home.topics.sandboxLinks.transfill">Transfilling</a>
```

- [ ] **Step 2: Add `home.topics.sandboxLinks.schreiner` i18n key**

In each of `locales/{en,cs,es}.json`, find the existing `home.topics.sandboxLinks` block. Add a `schreiner` key after `haldane`:

`en.json`:
```json
"sandboxLinks": {
    "deco": "Deco Modelling",
    "tissue": "Tissue Saturation",
    "haldane": "Haldane Equation",
    "schreiner": "Schreiner Equation",
    "transfill": "Transfilling",
    "cascade": "Cascade Filling",
    "gasLaw": "Gas Law"
}
```

`cs.json`: `"schreiner": "Schreinerova rovnice"` after `haldane`.

`es.json`: `"schreiner": "Ecuación de Schreiner"` after `haldane`.

Validate:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); if(!j.home.topics.sandboxLinks.schreiner) throw new Error(l+' missing'); console.log(l, j.home.topics.sandboxLinks.schreiner)});"
```

Expected:
```
en Schreiner Equation
cs Schreinerova rovnice
es Ecuación de Schreiner
```

- [ ] **Step 3: Bump cache version**

In `sw.js` line 2, change `'deco-theory-0.5.71'` to `'deco-theory-0.5.72'`.

In `css/styles.css`, find `.version-number::after { content: "0.5.71"; … }` and change to `"0.5.72"`.

- [ ] **Step 4: Run `npm test`**

```bash
npm test
```

Expected: `📊 Test Results: 201/201 passed`.

- [ ] **Step 5: Run the full smoke test once more**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/schreiner_smoke.py
```

Expected output (in order):
```
[task 1] h1='Schreiner Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula + 5 cards ok at t=0
[task 4] time control ok
[task 5] chart ok
[task 6] m-value dynamic ok
[haldane collapse] rate=0 keeps Pt = Palv,0 across t ok
```

- [ ] **Step 6: Commit the polish + version bump**

```bash
git add index.html locales/en.json locales/cs.json locales/es.json sw.js css/styles.css
git commit -m "$(cat <<'EOF'
chore(schreiner): home sublink + bump cache to 0.5.72

Adds the Schreiner sublink under the Sandbox topic card on the
home page (after Haldane). Bumps service-worker cache and CSS
version indicator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/schreiner-sandbox
```

- [ ] **Step 8: Open the PR**

```bash
gh pr create --base main --head feat/schreiner-sandbox \
  --title "feat(schreiner): interactive Schreiner equation sandbox page" \
  --body "$(cat <<'EOF'
## Summary
New educational sandbox page at \`sandbox/schreiner.html\` — sibling to the Haldane page. Same colour-coded annotated-formula shell, with Schreiner's extra terms (R, R/k, R·t) made explicit via a 5th term card and a teal R variable in the big formula.

Inputs: start depth + depth rate (m/min, signed) + segment time. End depth is a derived display — chosen specifically so rate=0 is reachable, letting the page demonstrate that Schreiner collapses to Haldane algebraically (Pt stays at Palv,0 across all t when rate=0).

Mini chart now shows two lines: Palv(t) as the linear sloped target and Pt(t) as the curve that lags behind it. M-value bar updates per t since P_amb at the diver's instantaneous depth changes during the segment.

## Spec
\`docs/superpowers/specs/2026-05-08-schreiner-sandbox-page-design.md\`

## Plan
\`docs/superpowers/plans/2026-05-08-schreiner-sandbox-page.md\`

## Test plan
- [x] \`npm test\` — 201/201 passed
- [x] Browser smoke (Playwright) — 7 task layers (skeleton, inputs, formula, time, chart, m-value, Haldane collapse). No console errors.
- [ ] Hard-refresh production after merge to flush 0.5.71 service worker.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Merge the PR**

```bash
gh pr merge --merge --delete-branch
```

Expected: clean fast-forward (origin/main hadn't moved during the work).

- [ ] **Step 10: Sync local main**

```bash
git checkout main
git pull origin main
```

Expected: clean fast-forward to the merge commit.
