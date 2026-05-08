# Haldane Sandbox Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sandbox/haldane.html`, an interactive page that renders the Haldane equation as a live, annotated artefact (formula → satellite term cards → time scrubber → mini Pt curve → M-value strip), as designed in `docs/superpowers/specs/2026-05-08-haldane-sandbox-page-design.md`.

**Architecture:** Single-file page (HTML + inline `<style>` + inline `<script type="module">`) following the same shape as `sandbox/transfilling.html`. ESM imports of existing math primitives from `js/decoModel.js` and `js/tissueCompartments.js` — no new modules. State lives in a single in-memory object; one `recompute()` function reads state and updates the DOM after every input change. Mini chart is hand-drawn inline SVG (not Chart.js, not the existing TissueSaturationSim).

**Tech Stack:** Vanilla ES Modules, no build step. Browser-native `<input type="range">`, `<select>`, `<input type="number">`. Inline SVG for the chart. Existing project i18n (`js/i18n.js` + `locales/{en,cs,es}.json`) for control labels.

**Branch:** `feat/haldane-sandbox` (already created at the start of this plan; spec already committed there).

**Smoke-test harness:** Reuse `webapp-testing` skill's `with_server.py` plus a Playwright script kept in `.claude-scratch/` (gitignored). One growing script across tasks; final shape lives in Task 7 verification.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `.gitignore` | Modify | Ignore `.claude-scratch/`, `reviews/` |
| `sandbox/haldane.html` | Create | The whole page |
| `js/nav.js` | Modify | Add Haldane entry under Sandbox submenu |
| `index.html` | Modify | Add a sandbox topic tile linking to the new page |
| `sw.js` | Modify | Add `./sandbox/haldane.html` to `STATIC_ASSETS`; bump `CACHE_NAME` |
| `css/styles.css` | Modify | Bump `.version-number::after` content |
| `locales/en.json` | Modify | Add `sandbox.haldane.*` control labels |
| `locales/cs.json` | Modify | Same keys, Czech (with English diving-term loanwords per `feedback_czech_diving_terms.md`) |
| `locales/es.json` | Modify | Same keys, Spanish |

---

## Task 1: Page skeleton + plumbing

**Goal:** A blank Haldane page that loads, appears in nav, is cached by the service worker, and passes a minimal smoke test (no console errors, hero h1 visible, nav contains link).

**Files:**
- Modify: `.gitignore`
- Create: `sandbox/haldane.html`
- Modify: `js/nav.js`
- Modify: `sw.js`
- Create: `.claude-scratch/haldane_smoke.py` (gitignored)

- [ ] **Step 1: Add scratch dirs to `.gitignore`**

```diff
 node_modules/
 .DS_Store
 .superpowers/
+.claude-scratch/
+reviews/
```

- [ ] **Step 2: Write the failing smoke test**

Create `.claude-scratch/haldane_smoke.py`:

```python
"""Growing smoke test for sandbox/haldane.html. Each plan task adds assertions."""
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5599/sandbox/haldane.html'


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
        assert 'Haldane' in h1, f'expected Haldane in h1, got: {h1!r}'

        # nav has a link to this page (text or href)
        nav_link = page.locator('a[href*="haldane"]').count()
        assert nav_link >= 1, 'no nav link to haldane.html'

        print(f'[task 1] h1={h1!r}, nav_link_count={nav_link}, errs={errs}')
        assert not errs, f'console errors: {errs}'

        browser.close()


if __name__ == '__main__':
    run()
```

- [ ] **Step 3: Run the smoke test — expect failure (page does not exist)**

Run from repo root:

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/haldane_smoke.py
```

Expected: AssertionError or 404. The page doesn't exist yet.

- [ ] **Step 4: Create `sandbox/haldane.html` skeleton**

Use `sandbox/transfilling.html` as a structural template (nav, hero, disclaimer, footer, version). Replace the body with a single empty placeholder section. Page-specific styles will accumulate in later tasks.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Haldane Equation — Deco Theory</title>

    <!-- PWA -->
    <link rel="manifest" href="../manifest.json">
    <meta name="theme-color" content="#2980b9">
    <link rel="icon" type="image/svg+xml" href="../icons/icon.svg">

    <!-- App styles -->
    <link rel="stylesheet" href="../css/styles.css">

    <style>
        /* Page-specific layout — accumulates over tasks. */
        .haldane-layout {
            max-width: 1100px;
            margin: 0 auto;
            padding: 1rem;
        }
    </style>
</head>
<body>
    <!-- Navigation -->
    <nav class="main-nav">
        <div class="nav-container">
            <a href="../index.html" class="nav-logo">Deco Theory</a>
            <button class="nav-hamburger" aria-label="Toggle menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
            <ul class="nav-links"><!-- generated by js/nav.js --></ul>
            <span class="nav-wip-badge">Experimental</span>
        </div>
    </nav>

    <!-- Disclaimer -->
    <div class="disclaimer-banner" data-i18n="sandbox.haldane.disclaimerBanner">
        <strong>Educational Use Only</strong> — Interactive walk-through of the Bühlmann/Haldane on-gassing equation.
    </div>

    <!-- Hero -->
    <header class="hero hero-compact">
        <h1 data-i18n="sandbox.haldane.title">Haldane Equation</h1>
        <p class="hero-subtitle" data-i18n="sandbox.haldane.subtitle">A live, annotated walk-through of how a tissue compartment on-gasses over time.</p>
    </header>

    <!-- Layout -->
    <div class="haldane-layout">
        <p class="placeholder">Coming up — inputs, formula, term cards.</p>
    </div>

    <!-- Footer -->
    <footer>
        <span class="wip-badge" data-i18n="common.wipBadge">Experimental</span>
        <p data-i18n="sandbox.haldane.disclaimer"><strong>Disclaimer:</strong> For educational purposes only. The actual diving algorithm uses additional logic.</p>
        <span class="version-number"></span>
    </footer>

    <!-- Navigation script -->
    <script src="../js/nav.js" type="module"></script>

    <!-- i18n -->
    <script type="module">
        import { initI18n, createLanguageSwitcher } from '../js/i18n.js';
        createLanguageSwitcher();
        initI18n();
    </script>
</body>
</html>
```

- [ ] **Step 5: Add nav entry**

Open `js/nav.js` and find the Sandbox submenu around line 22 (entries for `tissue-saturation`, `transfilling`, `cascade-filling`). Add this entry as the first item under Sandbox (so it sits at the top, paired with Tissue Saturation as the two single-compartment-focused tools):

```js
{ href: 'sandbox/haldane.html', labelKey: 'nav.sandbox.haldane', label: 'Haldane Equation' },
```

Then add the matching i18n key in all three locale files. In each `nav.sandbox` block, add `"haldane": "..."` next to the existing `tissue`/`transfill`/`cascade` entries:

- `en.json` → `"haldane": "Haldane Equation"`
- `cs.json` → `"haldane": "Haldaneova rovnice"`
- `es.json` → `"haldane": "Ecuación de Haldane"`

- [ ] **Step 6: Add to service worker `STATIC_ASSETS`**

Open `sw.js`, find the `STATIC_ASSETS` array, and add `'./sandbox/haldane.html'` next to other sandbox entries. Do NOT bump `CACHE_NAME` yet — version bump happens in the final Task.

- [ ] **Step 7: Run the smoke test — expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/haldane_smoke.py
```

Expected: `[task 1] h1='Haldane Equation', nav_link_count=1, errs=[]`. Exit code 0.

- [ ] **Step 8: Commit**

```bash
git add .gitignore sandbox/haldane.html js/nav.js sw.js locales/en.json locales/cs.json locales/es.json
git commit -m "$(cat <<'EOF'
feat(haldane): page skeleton, nav entry, sw.js cache

Empty placeholder page wired into the service worker and the
Sandbox submenu (with translated label in en/cs/es). Subsequent
tasks add the inputs strip, formula breakdown, time control,
mini chart, and M-value strip.

Refs spec: docs/superpowers/specs/2026-05-08-haldane-sandbox-page-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Inputs strip + i18n keys

**Goal:** Render the four input controls (start depth, target depth, compartment, gas), wire them to a `state` object, and translate the labels in en/cs/es. Smoke test asserts state changes when the user fiddles.

**Files:**
- Modify: `sandbox/haldane.html`
- Modify: `locales/en.json`
- Modify: `locales/cs.json`
- Modify: `locales/es.json`
- Modify: `.claude-scratch/haldane_smoke.py`

- [ ] **Step 1: Add the smoke-test assertions for Task 2**

Append to `.claude-scratch/haldane_smoke.py`, inside `run()`, after the Task 1 block:

```python
        # ---- Task 2: inputs strip ----
        # Default state values
        assert page.locator('#startDepth').input_value() == '0'
        assert page.locator('#targetDepth').input_value() == '30'
        assert page.locator('#compartment').input_value() == '4'   # 0-based idx 4 = compartment #5

        # Change start depth and verify it sticks
        page.locator('#startDepth').fill('10')
        page.locator('#startDepth').dispatch_event('input')
        page.wait_for_timeout(50)
        assert page.locator('#startDepth').input_value() == '10'

        # Change compartment select
        page.locator('#compartment').select_option('0')
        page.wait_for_timeout(50)
        assert page.locator('#compartment').input_value() == '0'

        print('[task 2] inputs ok')
```

- [ ] **Step 2: Run smoke test — expect failure (no #startDepth element)**

Run the same command as Task 1, Step 7. Expect AssertionError on locator strict mode or "0 != ''".

- [ ] **Step 3: Add i18n keys**

In `locales/en.json`, find an appropriate location after the existing `sandbox.transfill` block and add:

```json
"haldane": {
    "title": "Haldane Equation",
    "subtitle": "A live, annotated walk-through of how a tissue compartment on-gasses over time.",
    "disclaimerBanner": "<strong>Educational Use Only</strong> — Interactive walk-through of the Bühlmann/Haldane on-gassing equation.",
    "disclaimer": "<strong>Disclaimer:</strong> For educational purposes only. The actual diving algorithm uses additional logic.",
    "labels": {
        "startDepth": "Start depth (m)",
        "targetDepth": "Target depth (m)",
        "compartment": "Compartment",
        "gas": "Gas",
        "time": "Time"
    },
    "gas": {
        "air": "Air (F<sub>N₂</sub> = 0.79)"
    }
}
```

In `locales/cs.json`, mirror the structure with Czech values; keep "Air" as **Vzduch** but keep diving loanwords in their English form per `feedback_czech_diving_terms.md`:

```json
"haldane": {
    "title": "Haldaneova rovnice",
    "subtitle": "Interaktivní rozbor toho, jak tkáňový kompartment sytí dusík v čase.",
    "disclaimerBanner": "<strong>Pouze pro výukové účely</strong> — Interaktivní rozbor Bühlmannovy/Haldaneovy rovnice nasycování.",
    "disclaimer": "<strong>Upozornění:</strong> Pouze pro výukové účely. Reálný dekompresní algoritmus používá další logiku.",
    "labels": {
        "startDepth": "Počáteční hloubka (m)",
        "targetDepth": "Cílová hloubka (m)",
        "compartment": "Kompartment",
        "gas": "Plyn",
        "time": "Čas"
    },
    "gas": {
        "air": "Vzduch (F<sub>N₂</sub> = 0,79)"
    }
}
```

In `locales/es.json`:

```json
"haldane": {
    "title": "Ecuación de Haldane",
    "subtitle": "Recorrido interactivo de cómo un compartimento tisular se satura en el tiempo.",
    "disclaimerBanner": "<strong>Solo para fines educativos</strong> — Recorrido interactivo de la ecuación de Bühlmann/Haldane de saturación.",
    "disclaimer": "<strong>Aviso:</strong> Solo para fines educativos. El algoritmo de descompresión real usa lógica adicional.",
    "labels": {
        "startDepth": "Profundidad inicial (m)",
        "targetDepth": "Profundidad objetivo (m)",
        "compartment": "Compartimento",
        "gas": "Gas",
        "time": "Tiempo"
    },
    "gas": {
        "air": "Aire (F<sub>N₂</sub> = 0.79)"
    }
}
```

Validate JSON parses:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); if(!j.sandbox.haldane) throw new Error(l+' missing haldane'); console.log(l, j.sandbox.haldane.title)});"
```

- [ ] **Step 4: Replace the placeholder body with the inputs strip + script scaffold**

In `sandbox/haldane.html`, expand the `<style>` block with the inputs strip styles, replace the placeholder body, and add the inline script:

```html
    <style>
        .haldane-layout {
            max-width: 1100px;
            margin: 0 auto;
            padding: 1rem;
        }
        .haldane-inputs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin-bottom: 1rem;
        }
        .haldane-inputs .field { display: flex; flex-direction: column; gap: 0.25rem; }
        .haldane-inputs .field label { font-size: 0.8rem; color: var(--text-muted); }
        .haldane-inputs .field input,
        .haldane-inputs .field select {
            padding: 0.4rem 0.5rem;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-background);
            font-size: 0.9rem;
        }
        .haldane-inputs .gas-readout {
            padding: 0.4rem 0.5rem;
            font-size: 0.9rem;
            color: var(--text-muted);
        }
    </style>
```

Replace the body's placeholder div with:

```html
    <div class="haldane-layout">
        <div class="haldane-inputs">
            <div class="field">
                <label for="startDepth" data-i18n="sandbox.haldane.labels.startDepth">Start depth (m)</label>
                <input type="number" id="startDepth" min="0" max="60" step="1" value="0">
            </div>
            <div class="field">
                <label for="targetDepth" data-i18n="sandbox.haldane.labels.targetDepth">Target depth (m)</label>
                <input type="number" id="targetDepth" min="0" max="60" step="1" value="30">
            </div>
            <div class="field">
                <label for="compartment" data-i18n="sandbox.haldane.labels.compartment">Compartment</label>
                <select id="compartment"><!-- populated by JS --></select>
            </div>
            <div class="field">
                <label data-i18n="sandbox.haldane.labels.gas">Gas</label>
                <span class="gas-readout" data-i18n="sandbox.haldane.gas.air">Air (F<sub>N₂</sub> = 0.79)</span>
            </div>
        </div>
        <!-- formula, term cards, time control, chart, m-value strip — added in later tasks -->
    </div>
```

Replace the existing `<script type="module">` (the i18n one) with a single combined module:

```html
    <script type="module">
        import { initI18n, createLanguageSwitcher } from '../js/i18n.js';
        import {
            getAmbientPressure,
            getAlveolarN2Pressure,
            getInitialTissueN2,
            haldaneEquation,
            getMValue,
            N2_FRACTION,
        } from '../js/decoModel.js';
        import {
            getCompartmentsForVariant,
            getRateConstant,
        } from '../js/tissueCompartments.js';

        // ---------- State ----------
        const state = {
            startDepth: 0,        // m
            targetDepth: 30,      // m
            compartmentIdx: 4,    // 0-based; UI shows 1-based
            variant: 'ZH-L16C',   // matches values from ZHL16_VARIANTS object
            t: 0,                 // minutes
            n2Fraction: N2_FRACTION,
        };

        // ---------- DOM ----------
        const els = {
            startDepth:   document.getElementById('startDepth'),
            targetDepth:  document.getElementById('targetDepth'),
            compartment:  document.getElementById('compartment'),
        };

        // ---------- Compartment dropdown ----------
        function populateCompartments() {
            const comps = getCompartmentsForVariant(state.variant);
            els.compartment.innerHTML = comps
                .map((c, i) => `<option value="${i}">${i + 1} · T½ = ${c.halfTime.toFixed(1)} min</option>`)
                .join('');
            els.compartment.value = String(state.compartmentIdx);
        }

        // ---------- Recompute (stub) ----------
        function recompute() {
            // Pure values (used by later tasks).
            const comp = getCompartmentsForVariant(state.variant)[state.compartmentIdx];
            const halfTime = comp.halfTime;
            const k = getRateConstant(halfTime);
            const pAmbStart = getAmbientPressure(state.startDepth);
            const pAmbTarget = getAmbientPressure(state.targetDepth);
            const pT0 = getAlveolarN2Pressure(pAmbStart, state.n2Fraction);
            const pAlv = getAlveolarN2Pressure(pAmbTarget, state.n2Fraction);
            const Pt = haldaneEquation(pT0, pAlv, state.t, halfTime);
            const M = getMValue(pAmbTarget, comp.aN2, comp.bN2);
            // Later tasks read these via DOM.
            // Stash on a global for now so smoke tests / future tasks can introspect.
            window.__haldane = { halfTime, k, pT0, pAlv, Pt, M, pAmbStart, pAmbTarget };
        }

        // ---------- Event wiring ----------
        els.startDepth.addEventListener('input', () => {
            state.startDepth = parseFloat(els.startDepth.value) || 0;
            recompute();
        });
        els.targetDepth.addEventListener('input', () => {
            state.targetDepth = parseFloat(els.targetDepth.value) || 0;
            recompute();
        });
        els.compartment.addEventListener('change', () => {
            state.compartmentIdx = parseInt(els.compartment.value, 10);
            recompute();
        });

        // ---------- Init ----------
        createLanguageSwitcher();
        initI18n();
        populateCompartments();
        recompute();
    </script>
```

- [ ] **Step 5: Run smoke test — expect pass**

Same command as Task 1 Step 7. Expected: `[task 2] inputs ok`.

- [ ] **Step 6: Commit**

```bash
git add sandbox/haldane.html locales/en.json locales/cs.json locales/es.json .claude-scratch/haldane_smoke.py
git commit -m "$(cat <<'EOF'
feat(haldane): inputs strip wired to state + i18n keys (en/cs/es)

Four controls (start/target depth, compartment select, gas readout)
backed by a single in-memory state object. recompute() stub computes
all derived values (Pt0, Palv, k, Pt, M) and stashes them on
window.__haldane for the next task to surface in the DOM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Live formula + substituted line + term cards (math wiring)

**Goal:** Render the big colour-coded formula, the substituted-numbers line, and the four term cards (Palv, Pt,0, k, e^−kt). Each card shows: name, symbolic formula, substituted formula, value, intuition.

**Files:**
- Modify: `sandbox/haldane.html`
- Modify: `.claude-scratch/haldane_smoke.py`

- [ ] **Step 1: Add Task 3 smoke-test assertions**

Append inside `run()`:

```python
        # ---- Task 3: formula + term cards ----
        # Reset to defaults
        page.locator('#startDepth').fill('0')
        page.locator('#startDepth').dispatch_event('input')
        page.locator('#targetDepth').fill('30')
        page.locator('#targetDepth').dispatch_event('input')
        page.locator('#compartment').select_option('4')   # idx 4 = comp #5
        page.wait_for_timeout(50)

        # Reference values at t=0:
        # P_amb_target = 1.01325 + 30*0.1 = 4.01325
        # Palv         = (4.01325 - 0.0627) * 0.7902 = 3.1218
        # Pt0          = (1.01325 - 0.0627) * 0.7902 = 0.7510
        # T½ comp 5    = 27 min (same across ZH-L16 a/b/c)
        # k            = ln(2)/27 = 0.025672
        # e^-kt at t=0 = 1.0
        # Pt at t=0    = Pt0 = 0.7510

        def num(sel):
            return float(page.locator(sel).inner_text().replace('bar', '').replace(',', '.').strip())

        assert abs(num('#palvValue') - 3.1218) < 0.01, num('#palvValue')
        assert abs(num('#pt0Value')  - 0.7510) < 0.01, num('#pt0Value')
        assert abs(num('#kValue')    - 0.0257) < 0.001, num('#kValue')
        assert abs(num('#expValue')  - 1.0000) < 0.001, num('#expValue')
        assert abs(num('#ptValue')   - 0.7510) < 0.01, num('#ptValue')

        print('[task 3] formula+cards ok at t=0')
```

- [ ] **Step 2: Run smoke test — expect failure (elements don't exist)**

Run command from Task 1 Step 7. Expected: locator returns empty / no element with id `palvValue`.

- [ ] **Step 3: Add formula + term-card markup**

After the closing `</div>` of `.haldane-inputs` (still inside `.haldane-layout`), add:

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
                <strong id="ptValue">0.7510</strong> bar = <span id="palvNum">3.1227</span>
                + (<span id="pt0Num">0.7510</span> − <span id="palvNum2">3.1227</span>) · <span id="expNum">1.0000</span>
            </div>
        </div>

        <!-- Term cards -->
        <div class="term-row">
            <div class="term-card palv">
                <div class="name">P<sub>alv</sub> · alveolar N<sub>2</sub> pressure</div>
                <div class="formula">= (P<sub>amb</sub> − 0.0627) · F<sub>N₂</sub></div>
                <div class="formula" id="palvSubst">= (4.0133 − 0.0627) · 0.7902</div>
                <div class="value"><span id="palvValue">3.1227</span> bar</div>
                <div class="why">What the lungs are pushing into the blood at target depth.</div>
            </div>
            <div class="term-card pt0">
                <div class="name">P<sub>t,0</sub> · tissue pressure at t=0</div>
                <div class="formula">= (P<sub>amb,start</sub> − 0.0627) · F<sub>N₂</sub></div>
                <div class="formula" id="pt0Subst">= (1.0133 − 0.0627) · 0.7902</div>
                <div class="value"><span id="pt0Value">0.7510</span> bar</div>
                <div class="why">Where this compartment started, assumed equilibrated at start depth.</div>
            </div>
            <div class="term-card k">
                <div class="name">k · rate constant</div>
                <div class="formula">= ln(2) / T½</div>
                <div class="formula" id="kSubst">= 0.6931 / 27.0</div>
                <div class="value"><span id="kValue">0.0257</span> min⁻¹</div>
                <div class="why">Faster compartments → bigger k → catch up sooner.</div>
            </div>
            <div class="term-card exp">
                <div class="name">e<sup>−kt</sup> · "fraction left to go"</div>
                <div class="formula">= e<sup>−k · t</sup></div>
                <div class="formula" id="expSubst">= e<sup>−0.0257 · 0</sup></div>
                <div class="value"><span id="expValue">1.0000</span></div>
                <div class="why">1.0 at t=0, decays toward 0. Half-gone every T½.</div>
            </div>
        </div>
```

- [ ] **Step 4: Add formula + term-card styles**

Append to the `<style>` block:

```css
        .haldane-formula {
            text-align: center;
            padding: 1rem;
            background: linear-gradient(180deg, rgba(41,128,185,0.06), rgba(41,128,185,0.02));
            border: 1px solid rgba(41,128,185,0.18);
            border-radius: var(--radius);
            margin-bottom: 0.5rem;
            font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }
        .formula-symbolic { font-size: 1.4rem; line-height: 2.2; }
        .formula-substituted { font-size: 1rem; color: var(--text-muted); margin-top: 0.4rem; }
        .formula-substituted strong { color: #e67e22; font-size: 1.05em; }
        .term { display: inline-block; padding: 1px 5px; border-radius: 3px; }
        .term-result { background: rgba(230, 126, 34, 0.18); border-bottom: 2px solid #e67e22; font-weight: 700; }
        .term-palv   { background: rgba(41, 128, 185, 0.16); border-bottom: 2px solid #2980b9; }
        .term-pt0    { background: rgba(231, 76, 60, 0.16);  border-bottom: 2px solid #e74c3c; }
        .term-k      { background: rgba(46, 204, 113, 0.16); border-bottom: 2px solid #27ae60; }
        .term-t      { background: rgba(155, 89, 182, 0.16); border-bottom: 2px solid #9b59b6; }

        .term-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.6rem;
            margin: 1rem 0;
        }
        @media (max-width: 800px) {
            .term-row { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
            .term-row { grid-template-columns: 1fr; }
        }
        .term-card {
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-top: 3px solid var(--border-color);
            border-radius: 4px;
            padding: 0.6rem 0.75rem;
            font-size: 0.85rem;
            line-height: 1.45;
        }
        .term-card.palv { border-top-color: #2980b9; }
        .term-card.pt0  { border-top-color: #e74c3c; }
        .term-card.k    { border-top-color: #27ae60; }
        .term-card.exp  { border-top-color: #9b59b6; }
        .term-card .name    { font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem; }
        .term-card .formula { font-family: ui-monospace, monospace; color: var(--text-muted); font-size: 0.82rem; margin-top: 0.25rem; }
        .term-card .value   { font-family: ui-monospace, monospace; font-weight: 700; color: #2980b9; font-size: 1rem; margin-top: 0.4rem; }
        .term-card .why     { color: var(--text-muted); font-size: 0.8rem; font-style: italic; margin-top: 0.4rem; }
```

- [ ] **Step 5: Wire `recompute()` to update the DOM**

Replace the recompute() body (the part after the calculations) so it stops stashing on a global and starts updating the DOM:

```js
        function recompute() {
            const comp = getCompartmentsForVariant(state.variant)[state.compartmentIdx];
            const halfTime = comp.halfTime;
            const k = getRateConstant(halfTime);
            const pAmbStart = getAmbientPressure(state.startDepth);
            const pAmbTarget = getAmbientPressure(state.targetDepth);
            const pT0 = getAlveolarN2Pressure(pAmbStart, state.n2Fraction);
            const pAlv = getAlveolarN2Pressure(pAmbTarget, state.n2Fraction);
            const expTerm = Math.exp(-k * state.t);
            const Pt = haldaneEquation(pT0, pAlv, state.t, halfTime);
            const M = getMValue(pAmbTarget, comp.aN2, comp.bN2);

            // Substituted-formula line
            document.getElementById('ptValue').textContent = Pt.toFixed(4);
            document.getElementById('palvNum').textContent = pAlv.toFixed(4);
            document.getElementById('palvNum2').textContent = pAlv.toFixed(4);
            document.getElementById('pt0Num').textContent = pT0.toFixed(4);
            document.getElementById('expNum').textContent = expTerm.toFixed(4);

            // Term cards
            document.getElementById('palvValue').textContent = pAlv.toFixed(4);
            document.getElementById('palvSubst').innerHTML =
                `= (${pAmbTarget.toFixed(4)} − 0.0627) · ${state.n2Fraction.toFixed(4)}`;
            document.getElementById('pt0Value').textContent = pT0.toFixed(4);
            document.getElementById('pt0Subst').innerHTML =
                `= (${pAmbStart.toFixed(4)} − 0.0627) · ${state.n2Fraction.toFixed(4)}`;
            document.getElementById('kValue').textContent = k.toFixed(4);
            document.getElementById('kSubst').textContent = `= 0.6931 / ${halfTime.toFixed(1)}`;
            document.getElementById('expValue').textContent = expTerm.toFixed(4);
            document.getElementById('expSubst').innerHTML = `= e<sup>−${k.toFixed(4)} · ${state.t}</sup>`;

            // Stashed for later tasks (chart, M-value).
            window.__haldane = { halfTime, k, pT0, pAlv, Pt, M, pAmbStart, pAmbTarget, expTerm };
        }
```

- [ ] **Step 6: Run smoke test — expect pass**

Same command. Expected: `[task 3] formula+cards ok at t=0`.

- [ ] **Step 7: Commit**

```bash
git add sandbox/haldane.html .claude-scratch/haldane_smoke.py
git commit -m "$(cat <<'EOF'
feat(haldane): live formula + substituted line + term cards

Big formula with colour-coded variables; numeric substitution line
under it; four cards (Palv, Pt,0, k, e^-kt) each showing symbolic
formula, substituted formula, value, and a one-liner intuition.

Math reads from existing decoModel.js / tissueCompartments.js
primitives — no new equations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Time control (scrubber + step buttons)

**Goal:** Numeric readout + range slider + four step buttons (−5/−1/+1/+5). Slider range is `0` to `max(120, 4·T½)`. Time changes drive `recompute()`.

**Files:**
- Modify: `sandbox/haldane.html`
- Modify: `.claude-scratch/haldane_smoke.py`

- [ ] **Step 1: Add Task 4 smoke-test assertions**

Append inside `run()`:

```python
        # ---- Task 4: time control ----
        # Scrub to t=27 (one half-time of comp 5). Pt should be ~ midpoint of [Pt0, Palv].
        page.locator('#timeSlider').fill('27')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        pt_at_halftime = num('#ptValue')
        # Pt(27) = Palv + (Pt0 - Palv) * 0.5 = 3.1218 + (0.7510 - 3.1218)*0.5 = 1.9364
        assert abs(pt_at_halftime - 1.9364) < 0.01, pt_at_halftime

        # Scrub to t=120 (slider max for comp 5 = max(120, 4·27) = 120). After ~4.4 half-times
        # the curve should have covered ≥ 95% of the gap from Pt0 to Palv (1 - e^(-ln2·120/27)
        # ≈ 0.954). Stronger asymptote tests are infeasible at this slider range; the
        # qualitative "approaches Palv" claim is what matters here.
        page.locator('#timeSlider').fill('120')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        pt_late = num('#ptValue')
        palv_now = num('#palvValue')
        pt0_now = num('#pt0Value')
        progress = (pt_late - pt0_now) / (palv_now - pt0_now)
        assert progress > 0.95, f'progress toward Palv at t=120: {progress}'

        # +1 button: t goes from 120 to 121
        page.locator('#tPlus1').click()
        page.wait_for_timeout(50)
        assert page.locator('#timeSlider').input_value() == '121'

        # -5 button: 121 -> 116
        page.locator('#tMinus5').click()
        page.wait_for_timeout(50)
        assert page.locator('#timeSlider').input_value() == '116'

        print('[task 4] time control ok')
```

- [ ] **Step 2: Run smoke test — expect failure**

- [ ] **Step 3: Add the time-control markup**

Insert *after* the `.term-row` div, still inside `.haldane-layout`:

```html
        <!-- Time control -->
        <div class="time-row">
            <span class="t-readout">⏱ t = <strong id="timeValue">0</strong> min</span>
            <input type="range" id="timeSlider" min="0" max="120" step="1" value="0">
            <div class="step-btns">
                <button type="button" id="tMinus5">−5</button>
                <button type="button" id="tMinus1">−1</button>
                <button type="button" id="tPlus1">+1</button>
                <button type="button" id="tPlus5">+5</button>
            </div>
        </div>
```

- [ ] **Step 4: Add the time-control styles**

Append to `<style>`:

```css
        .time-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.7rem 1rem;
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin: 1rem 0;
        }
        .time-row .t-readout {
            font-family: ui-monospace, monospace;
            min-width: 100px;
            font-size: 0.95rem;
        }
        .time-row #timeSlider { flex: 1; accent-color: #9b59b6; }
        .time-row .step-btns { display: flex; gap: 0.25rem; }
        .time-row .step-btns button {
            padding: 0.25rem 0.6rem;
            border: 1px solid var(--border-color);
            border-radius: 3px;
            background: var(--card-background);
            font-family: ui-monospace, monospace;
            font-size: 0.85rem;
            cursor: pointer;
        }
        .time-row .step-btns button:hover { background: var(--background-color); }
        .time-row .step-btns button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Wire the time control to state**

Append to the `<script type="module">` block (just before the `// ---------- Init ----------` line):

```js
        const timeSlider = document.getElementById('timeSlider');
        const timeValue  = document.getElementById('timeValue');
        const btnMinus5  = document.getElementById('tMinus5');
        const btnMinus1  = document.getElementById('tMinus1');
        const btnPlus1   = document.getElementById('tPlus1');
        const btnPlus5   = document.getElementById('tPlus5');

        function applyTimeRange() {
            const comp = getCompartmentsForVariant(state.variant)[state.compartmentIdx];
            const tMax = Math.max(120, Math.ceil(4 * comp.halfTime));
            timeSlider.max = String(tMax);
            if (state.t > tMax) state.t = tMax;
        }

        function setTime(newT) {
            const tMax = parseInt(timeSlider.max, 10);
            state.t = Math.max(0, Math.min(tMax, Math.round(newT)));
            timeSlider.value = String(state.t);
            timeValue.textContent = String(state.t);
            updateStepButtons();
            recompute();
        }

        function updateStepButtons() {
            const tMax = parseInt(timeSlider.max, 10);
            btnMinus1.disabled = state.t <= 0;
            btnMinus5.disabled = state.t <= 0;
            btnPlus1.disabled  = state.t >= tMax;
            btnPlus5.disabled  = state.t >= tMax;
        }

        timeSlider.addEventListener('input', () => setTime(parseInt(timeSlider.value, 10)));
        btnMinus5.addEventListener('click', () => setTime(state.t - 5));
        btnMinus1.addEventListener('click', () => setTime(state.t - 1));
        btnPlus1.addEventListener('click',  () => setTime(state.t + 1));
        btnPlus5.addEventListener('click',  () => setTime(state.t + 5));

        // Compartment changes also affect tMax
        const _compartmentHandler = els.compartment.onchange;
        els.compartment.addEventListener('change', () => {
            applyTimeRange();
            timeValue.textContent = String(state.t);
            updateStepButtons();
        });
```

Replace the `// ---------- Init ----------` block with:

```js
        // ---------- Init ----------
        createLanguageSwitcher();
        initI18n();
        populateCompartments();
        applyTimeRange();
        timeValue.textContent = String(state.t);
        updateStepButtons();
        recompute();
```

- [ ] **Step 6: Run smoke test — expect pass**

Expected: `[task 4] time control ok`.

- [ ] **Step 7: Commit**

```bash
git add sandbox/haldane.html .claude-scratch/haldane_smoke.py
git commit -m "$(cat <<'EOF'
feat(haldane): time scrubber + ±1 / ±5 step buttons

Slider runs 0 to max(120, 4·T½) so the curve flattens visibly for
any compartment. Step buttons disabled at range bounds. Changing
compartment recomputes the slider max.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mini Pt(t) chart (inline SVG)

**Goal:** Inline SVG showing the Pt curve from t=0 to t=tMax, with horizontal asymptote at Palv, baseline at Pt0, and a vertical cursor at the current t. Updates whenever any input or t changes.

**Files:**
- Modify: `sandbox/haldane.html`
- Modify: `.claude-scratch/haldane_smoke.py`

- [ ] **Step 1: Add Task 5 smoke-test assertions**

Append inside `run()`:

```python
        # ---- Task 5: mini chart ----
        page.locator('#timeSlider').fill('0')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        cursor_x_t0 = float(page.locator('#chartCursor').get_attribute('x1'))

        page.locator('#timeSlider').fill('60')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        cursor_x_t60 = float(page.locator('#chartCursor').get_attribute('x1'))
        assert cursor_x_t60 > cursor_x_t0, f'cursor should move right: {cursor_x_t0} -> {cursor_x_t60}'

        # Curve path is non-empty
        path_d = page.locator('#chartCurve').get_attribute('d')
        assert path_d and path_d.startswith('M') and len(path_d) > 50, path_d

        print('[task 5] mini chart ok')
```

- [ ] **Step 2: Run smoke test — expect failure**

- [ ] **Step 3: Add the chart markup**

After the `.time-row` block, before any later sections, add:

```html
        <!-- Mini Pt(t) chart -->
        <div class="chart-row">
            <svg id="ptChart" viewBox="0 0 480 140" preserveAspectRatio="none" aria-label="Pt over time">
                <!-- Asymptote (Palv) -->
                <line id="chartAsymptote" x1="0" x2="480" stroke="#2980b9" stroke-dasharray="4 4" stroke-width="1" stroke-opacity="0.6"/>
                <!-- Baseline (Pt0) -->
                <line id="chartBaseline"  x1="0" x2="480" stroke="#e74c3c" stroke-dasharray="2 4" stroke-width="1" stroke-opacity="0.5"/>
                <!-- Curve -->
                <path id="chartCurve" fill="none" stroke="#2c3e50" stroke-width="1.6"/>
                <!-- Cursor -->
                <line id="chartCursor" stroke="#9b59b6" stroke-width="1.5" y1="0" y2="140"/>
                <!-- Cursor dot -->
                <circle id="chartDot" r="3.5" fill="#9b59b6"/>
            </svg>
        </div>
```

- [ ] **Step 4: Add chart styles**

Append to `<style>`:

```css
        .chart-row {
            background: linear-gradient(180deg, rgba(41,128,185,0.04), rgba(41,128,185,0));
            border: 1px dashed rgba(41,128,185,0.35);
            border-radius: var(--radius);
            padding: 0.5rem;
            margin-bottom: 1rem;
        }
        #ptChart { width: 100%; height: 140px; display: block; }
```

- [ ] **Step 5: Implement `drawChart()` and call it from `recompute()`**

Append to the `<script type="module">` block:

```js
        const CHART_W = 480, CHART_H = 140, CHART_PAD = 6;
        const chartCurve     = document.getElementById('chartCurve');
        const chartCursor    = document.getElementById('chartCursor');
        const chartDot       = document.getElementById('chartDot');
        const chartAsymptote = document.getElementById('chartAsymptote');
        const chartBaseline  = document.getElementById('chartBaseline');

        function drawChart() {
            const { halfTime, pT0, pAlv } = window.__haldane;
            const tMax = parseInt(timeSlider.max, 10);
            // y range: encompass both Pt0 and Palv with 5% padding both sides.
            const yMin = Math.min(pT0, pAlv);
            const yMax = Math.max(pT0, pAlv);
            const ySpan = (yMax - yMin) || 1;
            const yLo = yMin - 0.05 * ySpan;
            const yHi = yMax + 0.05 * ySpan;

            const xOf = (t) => CHART_PAD + (CHART_W - 2 * CHART_PAD) * (t / tMax);
            const yOf = (p) => CHART_PAD + (CHART_H - 2 * CHART_PAD) * (1 - (p - yLo) / (yHi - yLo));

            const pts = [];
            const N = 120;
            for (let i = 0; i <= N; i++) {
                const t = (i / N) * tMax;
                const Pt = haldaneEquation(pT0, pAlv, t, halfTime);
                pts.push(`${xOf(t).toFixed(2)},${yOf(Pt).toFixed(2)}`);
            }
            chartCurve.setAttribute('d', `M ${pts.join(' L ')}`);

            const yPalv = yOf(pAlv).toFixed(2);
            chartAsymptote.setAttribute('y1', yPalv);
            chartAsymptote.setAttribute('y2', yPalv);
            const yPt0 = yOf(pT0).toFixed(2);
            chartBaseline.setAttribute('y1', yPt0);
            chartBaseline.setAttribute('y2', yPt0);

            const cursorX = xOf(state.t).toFixed(2);
            chartCursor.setAttribute('x1', cursorX);
            chartCursor.setAttribute('x2', cursorX);
            const PtNow = window.__haldane.Pt;
            chartDot.setAttribute('cx', cursorX);
            chartDot.setAttribute('cy', yOf(PtNow).toFixed(2));
        }
```

Add `drawChart();` as the last statement of `recompute()` (after the existing DOM updates).

- [ ] **Step 6: Run smoke test — expect pass**

Expected: `[task 5] mini chart ok`.

- [ ] **Step 7: Commit**

```bash
git add sandbox/haldane.html .claude-scratch/haldane_smoke.py
git commit -m "$(cat <<'EOF'
feat(haldane): mini Pt(t) chart as inline SVG

Single curve from t=0 to tMax with dashed asymptote at Palv and
baseline at Pt0, vertical cursor + dot at the current t. Hand-drawn
SVG path (120 sample points) — no charting library.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: M-value strip + ZH-L16 a/b/c selector

**Goal:** Horizontal gradient bar showing `Pt / M`; numeric readout; model selector that swaps a/b coefficients (and therefore M, and therefore the bar position) without changing Pt.

**Files:**
- Modify: `sandbox/haldane.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/haldane_smoke.py`

- [ ] **Step 1: Add Task 6 smoke-test assertions**

Append inside `run()`:

```python
        # ---- Task 6: M-value strip ----
        page.locator('#timeSlider').fill('30')
        page.locator('#timeSlider').dispatch_event('input')
        page.wait_for_timeout(50)
        pt_before = num('#ptValue')
        page.locator('#variantSelect').select_option('ZH-L16A')
        page.wait_for_timeout(50)
        m_a = num('#mValue')
        page.locator('#variantSelect').select_option('ZH-L16B')
        page.wait_for_timeout(50)
        m_b = num('#mValue')
        page.locator('#variantSelect').select_option('ZH-L16C')
        page.wait_for_timeout(50)
        m_c = num('#mValue')
        pt_after = num('#ptValue')

        assert pt_before == pt_after, f'Pt should not change with variant: {pt_before} vs {pt_after}'
        # All three M values must differ pairwise (compartment 5 has different a/b across variants)
        assert m_a != m_b and m_b != m_c and m_a != m_c, f'M values: a={m_a}, b={m_b}, c={m_c}'

        # Edge case: start = target → curve flat, Pt == Pt0 == Palv for all t
        page.locator('#startDepth').fill('20')
        page.locator('#startDepth').dispatch_event('input')
        page.locator('#targetDepth').fill('20')
        page.locator('#targetDepth').dispatch_event('input')
        page.wait_for_timeout(50)
        for t in ['0', '15', '60']:
            page.locator('#timeSlider').fill(t)
            page.locator('#timeSlider').dispatch_event('input')
            page.wait_for_timeout(30)
            pt = num('#ptValue')
            palv = num('#palvValue')
            assert abs(pt - palv) < 1e-3, f't={t}: Pt={pt} != Palv={palv}'

        print('[task 6] m-value + edge case ok')
```

- [ ] **Step 2: Run smoke test — expect failure**

- [ ] **Step 3: Add M-value labels to i18n (en/cs/es)**

In each `sandbox.haldane` block, add a `mvalue` sub-object. **`en.json`:**

```json
"mvalue": {
    "title": "M-value check",
    "modelLabel": "Model",
    "within": "within",
    "exceeded": "exceeded"
}
```

**`cs.json`:**

```json
"mvalue": {
    "title": "Kontrola M-hodnoty",
    "modelLabel": "Model",
    "within": "v limitu",
    "exceeded": "překročeno"
}
```

**`es.json`:**

```json
"mvalue": {
    "title": "Comprobación del valor M",
    "modelLabel": "Modelo",
    "within": "dentro",
    "exceeded": "excedido"
}
```

- [ ] **Step 4: Add M-value strip markup**

After the `.chart-row`:

```html
        <!-- M-value strip -->
        <div class="mvalue-row">
            <span class="mvalue-title" data-i18n="sandbox.haldane.mvalue.title">M-value check</span>
            <div class="mvalue-bar"><div class="mvalue-marker" id="mvalueMarker"></div></div>
            <span class="mvalue-readout">
                P<sub>t</sub> = <span id="mvaluePt">0.7510</span> / M = <span id="mValue">2.50</span>
                <span class="mvalue-status" id="mvalueStatus" data-i18n="sandbox.haldane.mvalue.within">within</span>
            </span>
            <label class="mvalue-model">
                <span data-i18n="sandbox.haldane.mvalue.modelLabel">Model</span>
                <select id="variantSelect">
                    <option value="ZH-L16A">ZH-L16A</option>
                    <option value="ZH-L16B">ZH-L16B</option>
                    <option value="ZH-L16C" selected>ZH-L16C</option>
                </select>
            </label>
        </div>
```

- [ ] **Step 5: Add M-value styles**

```css
        .mvalue-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        .mvalue-title { font-weight: 600; }
        .mvalue-bar {
            flex: 1;
            min-width: 200px;
            height: 22px;
            background: linear-gradient(90deg, #27ae60 0%, #f1c40f 70%, #e74c3c 100%);
            border-radius: 3px;
            position: relative;
        }
        .mvalue-marker {
            position: absolute;
            top: -3px; bottom: -3px;
            width: 3px;
            background: #2c3e50;
            border-radius: 1px;
            transition: left 0.15s;
        }
        .mvalue-readout { font-family: ui-monospace, monospace; }
        .mvalue-status { font-weight: 600; }
        .mvalue-status.ok { color: #27ae60; }
        .mvalue-status.exceeded { color: #e74c3c; }
        .mvalue-model { display: inline-flex; align-items: center; gap: 0.4rem; }
        .mvalue-model select {
            padding: 0.25rem 0.5rem;
            border: 1px solid var(--border-color);
            border-radius: 3px;
            background: var(--card-background);
            font-size: 0.85rem;
        }
```

- [ ] **Step 6: Wire M-value updates**

Append to the script:

```js
        const variantSelect  = document.getElementById('variantSelect');
        const mvalueMarker   = document.getElementById('mvalueMarker');
        const mvalueStatus   = document.getElementById('mvalueStatus');
        const mvalueOut      = document.getElementById('mValue');
        const mvaluePtOut    = document.getElementById('mvaluePt');

        variantSelect.addEventListener('change', () => {
            state.variant = variantSelect.value;
            // Half-times are identical across a/b/c, but rebuild dropdown to keep things clean.
            populateCompartments();
            recompute();
        });

        function updateMValueStrip() {
            const { Pt, M } = window.__haldane;
            mvaluePtOut.textContent = Pt.toFixed(4);
            mvalueOut.textContent = M.toFixed(2);
            // Marker x: Pt/M as a fraction (clamped 0..1.05 so we can show "exceeded" overflow).
            const ratio = Math.max(0, Math.min(1.05, Pt / M));
            mvalueMarker.style.left = `${ratio * 100}%`;
            const exceeded = Pt > M;
            mvalueStatus.textContent = exceeded ? '✗ exceeded' : '✓ within';
            mvalueStatus.classList.toggle('exceeded', exceeded);
            mvalueStatus.classList.toggle('ok', !exceeded);
        }
```

Add `updateMValueStrip();` as the last call in `recompute()` (after `drawChart();`).

- [ ] **Step 7: Run smoke test — expect pass**

Expected: `[task 6] m-value + edge case ok`.

- [ ] **Step 8: Commit**

```bash
git add sandbox/haldane.html locales/en.json locales/cs.json locales/es.json .claude-scratch/haldane_smoke.py
git commit -m "$(cat <<'EOF'
feat(haldane): M-value strip with ZH-L16 a/b/c selector

Gradient bar with marker at Pt/M, numeric readout, and a model
selector. Switching variant changes M but never Pt (compartment
half-times are shared across a/b/c).

Edge case verified: when start_depth == target_depth, the curve
is flat at Palv = Pt0 for all t.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Topic tile, version bump, ship

**Goal:** Surface the new page from the homepage, bump cache version, run the full smoke test, push the branch, open a PR, merge.

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `css/styles.css`

- [ ] **Step 1: Add the page as a sublink in the existing Sandbox tile on `index.html`**

In `index.html` (around line 70, the `<!-- Topic: Sandbox -->` block) the Sandbox card has a `<div class="topic-sublinks">` listing the sandbox tools. Add a Haldane sublink as the first entry (so it sits at the top, mirroring its position in the nav):

```html
<a href="sandbox/haldane.html" data-i18n="home.topics.sandboxLinks.haldane">Haldane Equation</a>
```

(Place this immediately after the opening `<div class="topic-sublinks">` and before the existing `Deco Modelling` link.)

Add the matching i18n key in all three locales, in the existing `home.topics.sandboxLinks` block:

- `en.json` → `"haldane": "Haldane Equation"`
- `cs.json` → `"haldane": "Haldaneova rovnice"`
- `es.json` → `"haldane": "Ecuación de Haldane"`

Note: no new top-level topic tile — other sandbox tools (Tissue Saturation, Transfilling, Cascade Filling, Gas Law) are also surfaced as sublinks under the existing Sandbox card, and Haldane should follow the same pattern.

- [ ] **Step 2: Bump cache version**

Open `sw.js`. Change line 2 from `'deco-theory-0.5.56'` to the next patch version (e.g. `'deco-theory-0.5.57'`).

Open `css/styles.css`. Find `.version-number::after { content: "0.5.56"; ... }` and change to the same new version.

- [ ] **Step 3: Run `npm test`**

```bash
npm test
```

Expected: `📊 Test Results: 201/201 passed`.

- [ ] **Step 4: Run the full smoke test once more**

Same command as in earlier tasks. Expected output (in order):

```
[task 1] h1='Haldane Equation', nav_link_count=1, errs=[]
[task 2] inputs ok
[task 3] formula+cards ok at t=0
[task 4] time control ok
[task 5] mini chart ok
[task 6] m-value + edge case ok
```

- [ ] **Step 5: Commit the polish + version bump**

```bash
git add index.html sw.js css/styles.css locales/en.json locales/cs.json locales/es.json
git commit -m "$(cat <<'EOF'
chore(haldane): home sublink + bump cache to 0.5.57

Adds the Haldane sandbox sublink under the existing Sandbox topic
card on the homepage. Bumps service-worker cache and CSS version
indicator to 0.5.57.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/haldane-sandbox
```

- [ ] **Step 7: Open the PR**

```bash
gh pr create --base main --head feat/haldane-sandbox \
  --title "feat(haldane): interactive Haldane equation sandbox page" \
  --body "$(cat <<'EOF'
## Summary
New educational sandbox page at \`sandbox/haldane.html\`: an annotated, live walk-through of

  P_t(t) = P_alv + (P_t,0 − P_alv) · e^−kt

Each variable is colour-coded; satellite term cards underneath show what each piece means, how it's computed, and its current value. User picks initial/target depth + tissue compartment and scrubs time forward in minutes. M-value strip at the bottom with ZH-L16 a/b/c selector.

Reuses the existing math primitives in \`js/decoModel.js\` and \`js/tissueCompartments.js\` — no new equations.

## Spec
\`docs/superpowers/specs/2026-05-08-haldane-sandbox-page-design.md\`

## Test plan
- [x] \`npm test\` — 201/201 passed
- [x] Browser smoke (Playwright): page skeleton, inputs strip, formula + term cards (numeric correctness vs reference values), time control (Pt at one half-time ≈ midpoint, Pt at t=120 ≈ Palv), mini chart cursor moves, M-value selector swaps M without changing Pt, edge case start==target gives flat curve. No console errors.
- [ ] Hard-refresh production after merge to clear stale service worker.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Merge the PR**

```bash
gh pr merge --merge --delete-branch
```

Expected: clean fast-forward (origin/main hadn't moved during the work).

- [ ] **Step 9: Sync local main**

```bash
git checkout main && git pull origin main
```

Expected: clean fast-forward to the merge commit.
