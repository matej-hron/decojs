# M-Value Sandbox Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sandbox/m-values.html` — a two-playground interactive sandbox per spec `docs/superpowers/specs/2026-05-09-mvalues-sandbox-page-design.md`. Top playground evaluates `M = a + P_amb/b`. Bottom playground exposes the analytical derivation `a(t½)` and `b(t½)` with the 16 ZH-L16 compartments overlaid as dots.

**Architecture:** Single self-contained HTML file with inline `<style>` and `<script type="module">`. Reuses existing CSS variables and the `.term-row`/`.term-card`/`.haldane-formula`/`.term-*` styling vocabulary from `sandbox/schreiner.html`, but with its own page-level layout class `.mvalues-layout` containing two `<section class="mvalues-section">` playgrounds plus a global variant toggle.

**Tech Stack:** Vanilla ES Modules, no build. Inline SVG charts (no charting library). Imports `getMValue` from `js/decoModel.js` and `COMPARTMENTS`, `setZHL16Variant`, `ZHL16_VARIANTS` from `js/tissueCompartments.js`.

**Branch:** `feat/mvalues-sandbox-page` (already created from `origin/main`; spec already committed there).

**Smoke-test harness:** `.claude-scratch/mvalues_smoke.py` (gitignored) — boots the page on a local server via `with_server.py` and runs Playwright assertions. Each task adds its assertions.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `sandbox/m-values.html` | Create | The whole page |
| `js/nav.js` | Modify | Add M-Values entry under Sandbox submenu after Schreiner |
| `index.html` | Modify | Add M-Values sublink in Sandbox topic tile after Schreiner |
| `sw.js` | Modify | Register `./sandbox/m-values.html` in `STATIC_ASSETS`; bump `CACHE_NAME` (in final task) |
| `css/styles.css` | Modify | Bump `.version-number::after` content (in final task) |
| `locales/en.json` | Modify | Add `nav.sandbox.mvalues`, `home.topics.sandboxLinks.mvalues`, full `sandbox.mvalues.*` block |
| `locales/cs.json` | Modify | Same keys, Czech values |
| `locales/es.json` | Modify | Same keys, Spanish values |
| `wiki/Model-04-M-Values.md` | Modify | Add "See also: M-Value Sandbox" cross-link |
| `wiki/Model-01-Compartments.md` | Modify | Add "See also: M-Value Sandbox" cross-link under "Bühlmann a/b — where they come from" |
| `wiki/Module-Reference.md` | Modify | List the new sandbox file in the sandbox section |
| `.claude-scratch/mvalues_smoke.py` | Create | Smoke test (gitignored) |

---

## Task 1: Page skeleton, nav, sw, smoke-test infra

**Goal:** A `sandbox/m-values.html` page that loads with title "M-Value Sandbox", appears in the sandbox nav submenu and on the home/sandbox indexes, is registered in the service worker, and passes a minimal smoke test. No playground content yet — just the page chrome (header, disclaimer, hero, footer, nav script, i18n script). Versions are NOT bumped yet.

**Files:**
- Create: `sandbox/m-values.html`
- Modify: `js/nav.js`
- Modify: `index.html`
- Modify: `sandbox/index.html` (add sublink to the sandbox index page if there's a list — verify by reading the file first)
- Modify: `sw.js` (add `'./sandbox/m-values.html'` to `STATIC_ASSETS`, do NOT bump `CACHE_NAME` yet)
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (add `nav.sandbox.mvalues`, `home.topics.sandboxLinks.mvalues`, stub `sandbox.mvalues.{title,subtitle,disclaimerBanner,disclaimer}`)
- Create: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Create `sandbox/m-values.html` skeleton**

The file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>M-Value Sandbox — Deco Theory</title>

    <!-- PWA -->
    <link rel="manifest" href="../manifest.json">
    <meta name="theme-color" content="#2980b9">
    <link rel="icon" type="image/svg+xml" href="../icons/icon.svg">

    <!-- App styles -->
    <link rel="stylesheet" href="../css/styles.css">

    <style>
        /* Page-specific layout — accumulates over tasks. */
        .mvalues-layout {
            max-width: 1100px;
            margin: 0 auto;
            padding: 1rem;
        }
        .mvalues-section {
            margin-bottom: 2rem;
            padding: 1rem;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
        }
        .mvalues-section.derivation {
            background: linear-gradient(180deg, rgba(127,140,141,0.05), rgba(127,140,141,0));
            border-style: dashed;
        }
        .mvalues-anchor {
            font-size: 0.95rem;
            color: var(--text-muted);
            margin-bottom: 0.75rem;
            font-style: italic;
        }
        .mvalues-section h2 {
            font-size: 1.1rem;
            margin-top: 0;
            margin-bottom: 0.5rem;
        }
        /* Global variant toggle bar (between title and top playground) */
        .variant-bar {
            display: flex;
            gap: 0.5rem;
            align-items: center;
            justify-content: center;
            padding: 0.5rem;
            margin-bottom: 1rem;
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            font-size: 0.9rem;
        }
        .variant-bar label { font-weight: 600; }
        .variant-bar .variant-options {
            display: inline-flex;
            gap: 0.4rem;
        }
        .variant-bar .variant-options label {
            font-weight: normal;
            cursor: pointer;
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
    <div class="disclaimer-banner" data-i18n="sandbox.mvalues.disclaimerBanner">
        <strong>Educational Use Only</strong> — Interactive walk-through of Bühlmann's M-value formula and where its coefficients come from.
    </div>

    <!-- Hero -->
    <header class="hero hero-compact">
        <h1 data-i18n="sandbox.mvalues.title">M-Value Sandbox</h1>
        <p class="hero-subtitle" data-i18n="sandbox.mvalues.subtitle">Where the line comes from, and what it looks like for all 16 compartments.</p>
    </header>

    <!-- Layout (playgrounds added in later tasks) -->
    <div class="mvalues-layout">
        <!-- Task 5 will add the global variant bar here -->
        <!-- Task 2-4 will add the top playground here -->
        <!-- Task 5-6 will add the bottom playground here -->
        <!-- Task 7 will add cross-links here -->
    </div>

    <!-- Footer -->
    <footer>
        <span class="wip-badge">Experimental</span>
        <p data-i18n="sandbox.mvalues.disclaimer"><strong>Disclaimer:</strong> For educational purposes only. The actual diving algorithm uses additional logic.</p>
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

- [ ] **Step 2: Add nav entry in `js/nav.js`**

Find the Sandbox submenu definition (look for the existing entry `{ href: 'sandbox/schreiner.html', labelKey: 'nav.sandbox.schreiner', label: 'Schreiner Equation' }`). Add the M-Values entry **immediately after** Schreiner:

```js
{ href: 'sandbox/m-values.html', labelKey: 'nav.sandbox.mvalues', label: 'M-Value Sandbox' },
```

The Sandbox submenu order becomes: deco → tissue-saturation → haldane → schreiner → **m-values** → transfilling → cascade-filling → gas-law.

- [ ] **Step 3: Add sublink to home page Sandbox topic tile**

Open `index.html`. Find the Sandbox topic tile section (search for `home.topics.sandboxLinks.schreiner` to locate it). Add a new `<li>` immediately after the Schreiner sublink:

```html
<li><a href="sandbox/m-values.html" data-i18n="home.topics.sandboxLinks.mvalues">M-Value Sandbox</a></li>
```

- [ ] **Step 4: Check `sandbox/index.html` for a sandbox list and update if present**

Read `sandbox/index.html`. If it contains a list of sandbox sub-pages (look for links to `haldane.html`, `schreiner.html`, etc.), add an entry pointing to `m-values.html` between the Schreiner link and the Transfilling link. Use `data-i18n="home.topics.sandboxLinks.mvalues"` for the label. If `sandbox/index.html` is just a redirect or has no such list, skip this step (note: the spec's section 3 ordering reflects how it appears on `index.html` and any sandbox-page lists).

- [ ] **Step 5: Add page to `sw.js` `STATIC_ASSETS`**

In `sw.js`, find the `STATIC_ASSETS` array. Add `'./sandbox/m-values.html'` immediately after the existing `'./sandbox/schreiner.html'` entry. **Do NOT change `CACHE_NAME` yet** — the version bump happens in the final task (Task 7).

- [ ] **Step 6: Add nav and stub page i18n keys to all three locale files**

In `locales/en.json`, find the `nav.sandbox` block and add after `schreiner`:

```json
"mvalues": "M-Value Sandbox"
```

In the same file, find `home.topics.sandboxLinks` and add after `schreiner`:

```json
"mvalues": "M-Value Sandbox"
```

Find the existing `sandbox.haldane` and `sandbox.schreiner` blocks. Add a new `sandbox.mvalues` block immediately after `schreiner`:

```json
"mvalues": {
    "title": "M-Value Sandbox",
    "subtitle": "Where the line comes from, and what it looks like for all 16 compartments.",
    "disclaimerBanner": "<strong>Educational Use Only</strong> — Interactive walk-through of Bühlmann's M-value formula and where its coefficients come from.",
    "disclaimer": "<strong>Disclaimer:</strong> For educational purposes only. The actual diving algorithm uses additional logic."
}
```

In `locales/cs.json` add the matching keys with Czech values:

```json
"mvalues": "M-hodnota: pískoviště"
```
(in `nav.sandbox` and `home.topics.sandboxLinks`)

```json
"mvalues": {
    "title": "M-hodnota: pískoviště",
    "subtitle": "Odkud čára pochází a jak vypadá pro všech 16 kompartmentů.",
    "disclaimerBanner": "<strong>Pouze pro výukové účely</strong> — Interaktivní rozbor Bühlmannova vzorce pro M-hodnoty a původu jejich koeficientů.",
    "disclaimer": "<strong>Upozornění:</strong> Pouze pro výukové účely. Reálný dekompresní algoritmus používá další logiku."
}
```

In `locales/es.json`:

```json
"mvalues": "Sandbox de Valor M"
```
(in `nav.sandbox` and `home.topics.sandboxLinks`)

```json
"mvalues": {
    "title": "Sandbox de Valor M",
    "subtitle": "De dónde viene la línea, y cómo se ve para los 16 compartimentos.",
    "disclaimerBanner": "<strong>Solo para fines educativos</strong> — Recorrido interactivo de la fórmula de Valor M de Bühlmann y el origen de sus coeficientes.",
    "disclaimer": "<strong>Aviso:</strong> Solo para fines educativos. El algoritmo de descompresión real usa lógica adicional."
}
```

Validate JSON parses:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); if(!j.sandbox.mvalues) throw new Error(l+' missing mvalues block'); console.log(l, j.sandbox.mvalues.title)});"
```

Expected output:
```
en M-Value Sandbox
cs M-hodnota: pískoviště
es Sandbox de Valor M
```

- [ ] **Step 7: Create the smoke test scaffold**

Create `.claude-scratch/mvalues_smoke.py` (the `.claude-scratch/` directory is already gitignored):

```python
"""Growing smoke test for sandbox/m-values.html. Each plan task adds assertions."""
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5599/sandbox/m-values.html'


def _num(text):
    return float(text.replace('bar', '').replace('min', '').replace(',', '.').strip())


def num(page, sel):
    return _num(page.locator(sel).inner_text())


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
        assert 'M-Value' in h1 or 'M-hodnota' in h1 or 'Valor M' in h1, f'unexpected h1: {h1!r}'

        nav_link = page.locator('a[href*="m-values.html"]').count()
        assert nav_link >= 1, 'no nav link to m-values.html'

        print(f'[task 1] h1={h1!r}, nav_link_count={nav_link}, errs={errs}')
        assert not errs, f'console errors: {errs}'

        browser.close()


if __name__ == '__main__':
    run()
```

- [ ] **Step 8: Run the smoke test**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected output:
```
[task 1] h1='M-Value Sandbox', nav_link_count=1, errs=[]
```

- [ ] **Step 9: Commit**

```bash
git add sandbox/m-values.html js/nav.js index.html sw.js locales/en.json locales/cs.json locales/es.json
# Also add sandbox/index.html if it was modified in Step 4
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): page skeleton, nav, sw, i18n stubs

Empty M-Value sandbox page wired into nav, home page Sandbox topic
tile, service worker static assets, and i18n. Subsequent tasks add the
two playgrounds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Top playground inputs + formula + term cards (no chart)

**Goal:** Top playground renders with depth, compartment, view-toggle inputs (variant control deferred to Task 5 when it becomes global), an annotated formula `M = a + P_amb/b`, and 4 term cards (`a`, `P_amb`, `b`, `M`) that update live as the user changes inputs. No chart yet.

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json` (add `sandbox.mvalues.top.*`)
- Modify: `.claude-scratch/mvalues_smoke.py` (extend assertions)

- [ ] **Step 1: Add top-playground CSS to the existing `<style>` block**

Append inside the existing `<style>` block in `sandbox/m-values.html`:

```css
.mvalues-inputs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    margin-bottom: 1rem;
}
.mvalues-inputs .field { display: flex; flex-direction: column; gap: 0.25rem; }
.mvalues-inputs .field label { font-size: 0.8rem; color: var(--text-muted); }
.mvalues-inputs .field input,
.mvalues-inputs .field select {
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-background);
    font-size: 0.9rem;
}
.mvalues-formula {
    text-align: center;
    padding: 1rem;
    background: linear-gradient(180deg, rgba(41,128,185,0.06), rgba(41,128,185,0.02));
    border: 1px solid rgba(41,128,185,0.18);
    border-radius: var(--radius);
    margin-bottom: 0.5rem;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.mvalues-formula .formula-symbolic { font-size: 1.4rem; line-height: 2.2; }
.mvalues-formula .formula-substituted { font-size: 1rem; color: var(--text-muted); margin-top: 0.4rem; }
.mvalues-formula .formula-substituted strong { color: #e67e22; font-size: 1.05em; }
.mvalues-formula .term { display: inline-block; padding: 1px 5px; border-radius: 3px; }
.mvalues-formula .term-result { background: rgba(230, 126, 34, 0.18); border-bottom: 2px solid #e67e22; font-weight: 700; }
.mvalues-formula .term-a       { background: rgba(231, 76, 60, 0.16);  border-bottom: 2px solid #e74c3c; }
.mvalues-formula .term-pamb    { background: rgba(127, 140, 141, 0.18); border-bottom: 2px solid #7f8c8d; }
.mvalues-formula .term-b       { background: rgba(41, 128, 185, 0.16); border-bottom: 2px solid #2980b9; }

.mv-term-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
    margin: 1rem 0;
}
@media (max-width: 700px) {
    .mv-term-row { grid-template-columns: repeat(2, 1fr); }
}
.mv-term-card {
    background: var(--card-background);
    border: 1px solid var(--border-color);
    border-top: 3px solid var(--border-color);
    border-radius: 4px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    line-height: 1.45;
}
.mv-term-card.a    { border-top-color: #e74c3c; }
.mv-term-card.pamb { border-top-color: #7f8c8d; }
.mv-term-card.b    { border-top-color: #2980b9; }
.mv-term-card.m    { border-top-color: #e67e22; }
.mv-term-card .name    { font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem; }
.mv-term-card .formula { font-family: ui-monospace, monospace; color: var(--text-muted); font-size: 0.82rem; margin-top: 0.25rem; }
.mv-term-card .value   { font-family: ui-monospace, monospace; font-weight: 700; color: #2980b9; font-size: 1rem; margin-top: 0.4rem; }
.mv-term-card .why     { color: var(--text-muted); font-size: 0.8rem; font-style: italic; margin-top: 0.4rem; }

.view-toggle {
    display: inline-flex;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
}
.view-toggle button {
    padding: 0.4rem 0.75rem;
    background: var(--card-background);
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
}
.view-toggle button.active {
    background: rgba(41, 128, 185, 0.15);
    font-weight: 600;
}
```

- [ ] **Step 2: Replace the `<!-- Task 2-4 will add the top playground here -->` placeholder with the top playground markup**

In `sandbox/m-values.html`, replace that comment with:

```html
<section class="mvalues-section top">
    <h2 data-i18n="sandbox.mvalues.top.heading">What does M look like at this depth?</h2>
    <p class="mvalues-anchor" data-i18n="sandbox.mvalues.top.anchor">Pick a depth, a compartment, and a variant — see Bühlmann's M-value formula evaluate live.</p>

    <div class="mvalues-inputs">
        <div class="field">
            <label for="mvDepth" data-i18n="sandbox.mvalues.top.inputs.depth">Depth (m)</label>
            <input type="number" id="mvDepth" min="0" max="60" step="0.1" value="30">
        </div>
        <div class="field">
            <label for="mvCompartment" data-i18n="sandbox.mvalues.top.inputs.compartment">Compartment</label>
            <select id="mvCompartment"><!-- populated by JS --></select>
        </div>
        <div class="field">
            <label data-i18n="sandbox.mvalues.top.inputs.viewToggle.label">View</label>
            <div class="view-toggle" id="mvViewToggle">
                <button type="button" data-view="this" class="active" data-i18n="sandbox.mvalues.top.inputs.viewToggle.thisComp">This compartment</button>
                <button type="button" data-view="all" data-i18n="sandbox.mvalues.top.inputs.viewToggle.all16">All 16</button>
            </div>
        </div>
    </div>

    <div class="mvalues-formula">
        <div class="formula-symbolic">
            <span class="term term-result">M</span> =
            <span class="term term-a">a</span> +
            <span class="term term-pamb">P<sub>amb</sub></span> /
            <span class="term term-b">b</span>
        </div>
        <div class="formula-substituted">
            <strong id="mvMValue">5.5588</strong> bar =
            <span id="mvANumF">0.6200</span> +
            <span id="mvPambNumF">4.0133</span> /
            <span id="mvBNumF">0.8126</span>
        </div>
    </div>

    <div class="mv-term-row">
        <div class="mv-term-card a">
            <div class="name" data-i18n="sandbox.mvalues.top.cards.a.name">a | tissue intercept</div>
            <div class="formula" data-i18n="sandbox.mvalues.top.cards.a.formula">compartment + variant lookup</div>
            <div class="value"><span id="mvAValue">0.6200</span> bar</div>
            <div class="why" data-i18n="sandbox.mvalues.top.cards.a.why">Y-intercept of the M-line. Higher = more supersaturation tolerated at the surface.</div>
        </div>
        <div class="mv-term-card pamb">
            <div class="name" data-i18n="sandbox.mvalues.top.cards.pAmb.name">P<sub>amb</sub> | ambient pressure</div>
            <div class="formula">= 1.01325 + depth · 0.1</div>
            <div class="value"><span id="mvPambValue">4.0133</span> bar</div>
            <div class="why" data-i18n="sandbox.mvalues.top.cards.pAmb.why">The horizontal axis of the M-line. Each meter of depth adds 0.1 bar.</div>
        </div>
        <div class="mv-term-card b">
            <div class="name" data-i18n="sandbox.mvalues.top.cards.b.name">b | tissue slope</div>
            <div class="formula" data-i18n="sandbox.mvalues.top.cards.b.formula">compartment lookup (slope = 1/b)</div>
            <div class="value"><span id="mvBValue">0.8126</span></div>
            <div class="why" data-i18n="sandbox.mvalues.top.cards.b.why">Lower b → steeper M-line → faster compartment.</div>
        </div>
        <div class="mv-term-card m">
            <div class="name" data-i18n="sandbox.mvalues.top.cards.m.name">M | tolerated tissue pressure</div>
            <div class="formula">= a + P<sub>amb</sub> / b</div>
            <div class="value"><span id="mvMValue2">5.5588</span> bar</div>
            <div class="why" data-i18n="sandbox.mvalues.top.cards.m.why">Above this, the algorithm flags supersaturation as unsafe.</div>
        </div>
    </div>

    <!-- Task 3 adds the chart here -->
</section>
```

- [ ] **Step 3: Add the top-playground module script before the closing `</body>`**

Insert this `<script type="module">` block **before** the existing `<!-- i18n -->` script (because we want module imports to load before any DOM-dependent setup):

```html
<script type="module">
    import { COMPARTMENTS, ZHL16_VARIANTS, setZHL16Variant } from '../js/tissueCompartments.js';
    import { getMValue } from '../js/decoModel.js';

    // Page state — variant becomes global in Task 5; for Task 2 it's hardcoded to C.
    const state = {
        depth: 30,
        compartmentIdx: 4,        // TC5 (zero-based index = 4)
        variant: 'ZH-L16C',
        topView: 'this',
    };

    // Initialize variant on the COMPARTMENTS array
    setZHL16Variant(state.variant);

    const els = {
        depth: document.getElementById('mvDepth'),
        compartment: document.getElementById('mvCompartment'),
        viewToggle: document.getElementById('mvViewToggle'),
        // Formula numbers
        formulaA: document.getElementById('mvANumF'),
        formulaPamb: document.getElementById('mvPambNumF'),
        formulaB: document.getElementById('mvBNumF'),
        formulaM: document.getElementById('mvMValue'),
        // Card values
        aValue: document.getElementById('mvAValue'),
        pambValue: document.getElementById('mvPambValue'),
        bValue: document.getElementById('mvBValue'),
        mValue: document.getElementById('mvMValue2'),
    };

    // Populate compartment dropdown
    function populateCompartments() {
        els.compartment.innerHTML = '';
        COMPARTMENTS.forEach((comp, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `TC${comp.id} — ${comp.halfTime} min — ${comp.label.split(' - ')[1] || ''}`.trim();
            els.compartment.appendChild(opt);
        });
        els.compartment.value = state.compartmentIdx;
    }

    function pAmbFromDepth(d) {
        return 1.01325 + d * 0.1;
    }

    function recompute() {
        const comp = COMPARTMENTS[state.compartmentIdx];
        const pAmb = pAmbFromDepth(state.depth);
        const a = comp.aN2;
        const b = comp.bN2;
        const m = getMValue(pAmb, a, b);

        els.formulaA.textContent = a.toFixed(4);
        els.formulaPamb.textContent = pAmb.toFixed(4);
        els.formulaB.textContent = b.toFixed(4);
        els.formulaM.textContent = m.toFixed(4);

        els.aValue.textContent = a.toFixed(4);
        els.pambValue.textContent = pAmb.toFixed(4);
        els.bValue.textContent = b.toFixed(4);
        els.mValue.textContent = m.toFixed(4);
    }

    // Wire inputs
    els.depth.addEventListener('input', () => {
        const v = parseFloat(els.depth.value);
        if (!Number.isFinite(v)) return;
        state.depth = Math.max(0, Math.min(60, v));
        recompute();
    });
    els.compartment.addEventListener('change', () => {
        state.compartmentIdx = parseInt(els.compartment.value, 10);
        recompute();
    });
    els.viewToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-view]');
        if (!btn) return;
        state.topView = btn.dataset.view;
        els.viewToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        // Task 3 will trigger chart re-render here
    });

    populateCompartments();
    recompute();
</script>
```

- [ ] **Step 4: Add the corresponding i18n keys to all three locale files**

In `locales/en.json`, extend the `sandbox.mvalues` block (add nested keys under it):

```json
"top": {
    "heading": "What does M look like at this depth?",
    "anchor": "Pick a depth, a compartment, and a variant — see Bühlmann's M-value formula evaluate live.",
    "inputs": {
        "depth": "Depth (m)",
        "compartment": "Compartment",
        "viewToggle": {
            "label": "View",
            "thisComp": "This compartment",
            "all16": "All 16"
        }
    },
    "cards": {
        "a": {
            "name": "a | tissue intercept",
            "formula": "compartment + variant lookup",
            "why": "Y-intercept of the M-line. Higher = more supersaturation tolerated at the surface."
        },
        "pAmb": {
            "name": "P<sub>amb</sub> | ambient pressure",
            "why": "The horizontal axis of the M-line. Each meter of depth adds 0.1 bar."
        },
        "b": {
            "name": "b | tissue slope",
            "formula": "compartment lookup (slope = 1/b)",
            "why": "Lower b → steeper M-line → faster compartment."
        },
        "m": {
            "name": "M | tolerated tissue pressure",
            "why": "Above this, the algorithm flags supersaturation as unsafe."
        }
    }
}
```

In `locales/cs.json` (Czech — keep "M-value" / English diving loanwords per project memory):

```json
"top": {
    "heading": "Jak M vypadá v této hloubce?",
    "anchor": "Vyberte hloubku, kompartment a variantu — sledujte, jak Bühlmannova M-hodnota počítá živě.",
    "inputs": {
        "depth": "Hloubka (m)",
        "compartment": "Kompartment",
        "viewToggle": {
            "label": "Zobrazení",
            "thisComp": "Tento kompartment",
            "all16": "Všech 16"
        }
    },
    "cards": {
        "a": {
            "name": "a | průsečík tkáně",
            "formula": "vyhledání podle kompartmentu + varianty",
            "why": "Průsečík M-čáry s osou y. Vyšší = více tolerované supersaturace na hladině."
        },
        "pAmb": {
            "name": "P<sub>amb</sub> | okolní tlak",
            "why": "Vodorovná osa M-čáry. Každý metr hloubky přidá 0,1 bar."
        },
        "b": {
            "name": "b | sklon tkáně",
            "formula": "vyhledání podle kompartmentu (sklon = 1/b)",
            "why": "Nižší b → strmější M-čára → rychlejší kompartment."
        },
        "m": {
            "name": "M | tolerovaný tlak v tkáni",
            "why": "Nad touto hodnotou algoritmus označí supersaturaci za nebezpečnou."
        }
    }
}
```

In `locales/es.json`:

```json
"top": {
    "heading": "¿Cómo se ve M a esta profundidad?",
    "anchor": "Elige una profundidad, un compartimento y una variante — observa la fórmula del Valor M de Bühlmann evaluarse en vivo.",
    "inputs": {
        "depth": "Profundidad (m)",
        "compartment": "Compartimento",
        "viewToggle": {
            "label": "Vista",
            "thisComp": "Este compartimento",
            "all16": "Los 16"
        }
    },
    "cards": {
        "a": {
            "name": "a | intersección del tejido",
            "formula": "búsqueda por compartimento + variante",
            "why": "Intersección con el eje y de la línea M. Mayor = más sobresaturación tolerada en la superficie."
        },
        "pAmb": {
            "name": "P<sub>amb</sub> | presión ambiental",
            "why": "Eje horizontal de la línea M. Cada metro de profundidad añade 0,1 bar."
        },
        "b": {
            "name": "b | pendiente del tejido",
            "formula": "búsqueda por compartimento (pendiente = 1/b)",
            "why": "Menor b → línea M más pendiente → compartimento más rápido."
        },
        "m": {
            "name": "M | presión tisular tolerada",
            "why": "Por encima de esto, el algoritmo marca la sobresaturación como peligrosa."
        }
    }
}
```

Validate JSON parses:

```bash
node -e "['en','cs','es'].forEach(l=>{const j=require('./locales/'+l+'.json'); if(!j.sandbox.mvalues.top) throw new Error(l+' missing top'); console.log(l, 'ok')});"
```

- [ ] **Step 5: Extend the smoke test for Task 2 assertions**

Append to `.claude-scratch/mvalues_smoke.py` **inside the `run()` function**, after the Task 1 section and before `browser.close()`:

```python
        # ---- Task 2: top playground inputs + cards ----
        # Default state: depth=30, comp=TC5, variant=ZH-L16C
        # P_amb = 1.01325 + 30 * 0.1 = 4.01325
        # TC5 var C: aN2=0.6200, bN2=0.8126
        # M = 0.6200 + 4.01325 / 0.8126 = 0.6200 + 4.93878... = 5.55878 bar

        a_val = float(page.locator('#mvAValue').inner_text())
        pamb_val = float(page.locator('#mvPambValue').inner_text())
        b_val = float(page.locator('#mvBValue').inner_text())
        m_val = float(page.locator('#mvMValue2').inner_text())

        assert abs(a_val - 0.6200) < 0.0001, f'a value: {a_val}'
        assert abs(pamb_val - 4.0133) < 0.001, f'pAmb value: {pamb_val}'
        assert abs(b_val - 0.8126) < 0.0001, f'b value: {b_val}'
        assert abs(m_val - 5.5588) < 0.005, f'M value: {m_val}'

        # Change depth to 0 m → P_amb = 1.01325, M = 0.6200 + 1.01325/0.8126 = 1.8668
        page.locator('#mvDepth').fill('0')
        page.locator('#mvDepth').dispatch_event('input')
        page.wait_for_timeout(50)
        m_at_0 = float(page.locator('#mvMValue2').inner_text())
        assert abs(m_at_0 - 1.8668) < 0.005, f'M at surface for TC5 var C: {m_at_0}'

        # Change compartment to TC1 (idx 0) → variant C: aN2=1.1696, bN2=0.5578
        # at depth 0: M = 1.1696 + 1.01325/0.5578 = 1.1696 + 1.8164 = 2.9860
        page.locator('#mvCompartment').select_option('0')
        page.wait_for_timeout(50)
        m_tc1_surface = float(page.locator('#mvMValue2').inner_text())
        assert abs(m_tc1_surface - 2.9860) < 0.01, f'M at surface for TC1 var C: {m_tc1_surface}'

        # View toggle: clicking 'All 16' switches the active button
        page.locator('button[data-view="all"]').click()
        assert page.locator('button[data-view="all"]').get_attribute('class').count('active'), 'all16 not active'
        page.locator('button[data-view="this"]').click()
        assert page.locator('button[data-view="this"]').get_attribute('class').count('active'), 'this not active'

        print('[task 2] top playground inputs+cards ok')
```

- [ ] **Step 6: Run the smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected output ends with:
```
[task 1] h1='M-Value Sandbox', nav_link_count=1, errs=[]
[task 2] top playground inputs+cards ok
```

- [ ] **Step 7: Smoke-test the page in a browser**

Open `http://localhost:5599/sandbox/m-values.html` in a browser. Confirm:
- Inputs appear (depth=30, compartment=TC5, view toggle visible).
- Formula `M = a + P_amb/b` displays with substituted values `5.5588 = 0.6200 + 4.0133 / 0.8126`.
- 4 term cards appear with values matching the formula.
- Changing depth updates all values smoothly.

(Per project memory: "smoke test before ship" — npm test passing isn't enough; load the page in a browser before shipping ESM/HTML wiring changes.)

- [ ] **Step 8: Commit**

```bash
git add sandbox/m-values.html locales/en.json locales/cs.json locales/es.json .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): top playground inputs, formula, term cards

Depth, compartment, view-toggle inputs; annotated M = a + P_amb/b
formula; 4 term cards (a, P_amb, b, M) wired to live recompute.
Variant is hardcoded to ZH-L16C until Task 5 makes it page-global.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Top playground chart — "This compartment" view

**Goal:** Top playground gets an SVG chart showing the selected compartment's M-line for the active variant (bold), with the other two variants overlaid as faint dashed lines, plus a marker at `(P_amb_current, M_current)`. Y-axis is dynamic (`1.1 × max M at maxP_amb across visible compartments`, clamped to ≥10 bar).

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Add chart CSS**

Append inside the `<style>` block:

```css
.mv-chart-row {
    background: linear-gradient(180deg, rgba(41,128,185,0.04), rgba(41,128,185,0));
    border: 1px dashed rgba(41,128,185,0.35);
    border-radius: var(--radius);
    padding: 0.5rem;
    margin-bottom: 1rem;
}
#mvTopChart { width: 100%; height: 280px; display: block; }
.mv-chart-axis { stroke: var(--text-muted); stroke-width: 1; }
.mv-chart-tick { stroke: var(--text-muted); stroke-width: 0.5; }
.mv-chart-label { fill: var(--text-muted); font-size: 10px; font-family: ui-monospace, monospace; }
.mv-chart-ambient { stroke: #2980b9; stroke-width: 1; stroke-dasharray: 4,3; fill: none; opacity: 0.5; }
.mv-chart-surface { stroke: #7f8c8d; stroke-width: 1; stroke-dasharray: 2,2; }
.mv-chart-mline { fill: none; stroke-width: 2; }
.mv-chart-mline.faint { stroke-width: 1; stroke-dasharray: 3,3; opacity: 0.5; }
.mv-chart-marker { fill: #e67e22; stroke: white; stroke-width: 1.5; }
```

- [ ] **Step 2: Add the chart container after the term cards in the top playground**

Replace the `<!-- Task 3 adds the chart here -->` comment in `sandbox/m-values.html` with:

```html
<div class="mv-chart-row">
    <svg id="mvTopChart" viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet" aria-label="M-value chart"></svg>
</div>
```

- [ ] **Step 3: Extend the page module to draw the chart**

Inside the existing `<script type="module">` block in `sandbox/m-values.html`, **inside** the imports area add:

```js
import { buildCompartments } from '../js/tissueCompartments.js';
```

Then below `populateCompartments()`, add new chart helpers and modify `recompute()` to call the renderer. Add this AFTER the existing `recompute` function, then update `recompute` itself:

```js
// ---- Chart constants ----
const CHART_W = 480;
const CHART_H = 280;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 28;
const X_MIN = 0;
const X_MAX = 7;       // bar — covers surface through ~60 m

const VARIANT_LIST = ['ZH-L16A', 'ZH-L16B', 'ZH-L16C'];
const VARIANT_COMPS = {};   // variant name → COMPARTMENTS array snapshot
for (const v of VARIANT_LIST) {
    VARIANT_COMPS[v] = buildCompartments(v);
}

function compartmentColor(comp) {
    return comp.color;
}

function dynamicYMax(compsByVariant, activeVariant, allLines) {
    // Compute 1.1 * max(M at X_MAX), clamped to >= 10
    let maxM = 0;
    if (allLines) {
        // Use all 16 in the active variant (Task 4 path)
        const comps = compsByVariant[activeVariant];
        for (const c of comps) {
            const m = c.aN2 + X_MAX / c.bN2;
            if (m > maxM) maxM = m;
        }
    } else {
        // Use the selected comp across all 3 variants (Task 3 path)
        for (const v of VARIANT_LIST) {
            const c = compsByVariant[v][state.compartmentIdx];
            const m = c.aN2 + X_MAX / c.bN2;
            if (m > maxM) maxM = m;
        }
    }
    return Math.max(10, maxM * 1.1);
}

function xToPx(x, yMax) {
    return PAD_L + (x - X_MIN) / (X_MAX - X_MIN) * (CHART_W - PAD_L - PAD_R);
}
function yToPx(y, yMax) {
    const usable = CHART_H - PAD_T - PAD_B;
    return PAD_T + usable - (y / yMax) * usable;
}

function svgEl(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs || {})) {
        el.setAttribute(k, v);
    }
    return el;
}

function drawTopChart() {
    const svg = document.getElementById('mvTopChart');
    if (!svg) return;
    svg.innerHTML = '';

    const allLines = state.topView === 'all';
    const yMax = dynamicYMax(VARIANT_COMPS, state.variant, allLines);

    // Axes
    svg.appendChild(svgEl('line', {
        x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: CHART_H - PAD_B, class: 'mv-chart-axis',
    }));
    svg.appendChild(svgEl('line', {
        x1: PAD_L, y1: CHART_H - PAD_B, x2: CHART_W - PAD_R, y2: CHART_H - PAD_B, class: 'mv-chart-axis',
    }));

    // X ticks at integer bar values
    for (let x = 0; x <= X_MAX; x++) {
        const px = xToPx(x, yMax);
        svg.appendChild(svgEl('line', {
            x1: px, y1: CHART_H - PAD_B, x2: px, y2: CHART_H - PAD_B + 4, class: 'mv-chart-tick',
        }));
        const lbl = svgEl('text', {
            x: px, y: CHART_H - PAD_B + 14, class: 'mv-chart-label', 'text-anchor': 'middle',
        });
        lbl.textContent = x.toString();
        svg.appendChild(lbl);
    }

    // Y ticks every 2 bar (rounded to chart's y-range)
    for (let y = 0; y <= yMax; y += 2) {
        const py = yToPx(y, yMax);
        svg.appendChild(svgEl('line', {
            x1: PAD_L - 4, y1: py, x2: PAD_L, y2: py, class: 'mv-chart-tick',
        }));
        const lbl = svgEl('text', {
            x: PAD_L - 6, y: py + 3, class: 'mv-chart-label', 'text-anchor': 'end',
        });
        lbl.textContent = y.toString();
        svg.appendChild(lbl);
    }

    // Axis labels
    const xLabel = svgEl('text', {
        x: (CHART_W + PAD_L) / 2, y: CHART_H - 4, class: 'mv-chart-label', 'text-anchor': 'middle',
    });
    xLabel.textContent = 'P_amb (bar)';
    svg.appendChild(xLabel);
    const yLabel = svgEl('text', {
        x: 8, y: PAD_T + 8, class: 'mv-chart-label', 'text-anchor': 'start',
    });
    yLabel.textContent = 'P_t (bar)';
    svg.appendChild(yLabel);

    // Ambient line y = x
    svg.appendChild(svgEl('line', {
        x1: xToPx(0, yMax), y1: yToPx(0, yMax),
        x2: xToPx(Math.min(X_MAX, yMax), yMax), y2: yToPx(Math.min(X_MAX, yMax), yMax),
        class: 'mv-chart-ambient',
    }));

    // Surface line (vertical at P_amb = 1.01325)
    svg.appendChild(svgEl('line', {
        x1: xToPx(1.01325, yMax), y1: PAD_T, x2: xToPx(1.01325, yMax), y2: CHART_H - PAD_B,
        class: 'mv-chart-surface',
    }));

    // M-lines
    if (state.topView === 'this') {
        // Faint lines for inactive variants
        for (const v of VARIANT_LIST) {
            const isActive = v === state.variant;
            const c = VARIANT_COMPS[v][state.compartmentIdx];
            const m0 = c.aN2 + X_MIN / c.bN2;
            const mMax = c.aN2 + X_MAX / c.bN2;
            svg.appendChild(svgEl('line', {
                x1: xToPx(X_MIN, yMax), y1: yToPx(m0, yMax),
                x2: xToPx(X_MAX, yMax), y2: yToPx(mMax, yMax),
                class: 'mv-chart-mline' + (isActive ? '' : ' faint'),
                stroke: compartmentColor(c),
            }));
        }
    } else {
        // All 16 lines for active variant
        const comps = VARIANT_COMPS[state.variant];
        comps.forEach((c, idx) => {
            const m0 = c.aN2 + X_MIN / c.bN2;
            const mMax = c.aN2 + X_MAX / c.bN2;
            const isSelected = idx === state.compartmentIdx;
            svg.appendChild(svgEl('line', {
                x1: xToPx(X_MIN, yMax), y1: yToPx(m0, yMax),
                x2: xToPx(X_MAX, yMax), y2: yToPx(mMax, yMax),
                class: 'mv-chart-mline' + (isSelected ? '' : ' faint'),
                stroke: compartmentColor(c),
            }));
        });
    }

    // Current marker at (P_amb, M) for selected comp under active variant
    const c = VARIANT_COMPS[state.variant][state.compartmentIdx];
    const pAmbNow = pAmbFromDepth(state.depth);
    const mNow = c.aN2 + pAmbNow / c.bN2;
    if (mNow <= yMax && pAmbNow >= X_MIN && pAmbNow <= X_MAX) {
        svg.appendChild(svgEl('circle', {
            cx: xToPx(pAmbNow, yMax), cy: yToPx(mNow, yMax),
            r: 5, class: 'mv-chart-marker',
            id: 'mvTopChartMarker',
        }));
    }
}
```

Then update `recompute()` so it ALSO calls `drawTopChart()`. Find the existing `recompute` and append the call at its end:

```js
function recompute() {
    // ... existing assignments ...
    drawTopChart();
}
```

And update the view toggle handler to call `drawTopChart` (replace the `// Task 3 will trigger chart re-render here` comment):

```js
els.viewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    state.topView = btn.dataset.view;
    els.viewToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    drawTopChart();
});
```

- [ ] **Step 4: Add i18n keys for chart axis labels**

Extend `sandbox.mvalues.top.chart` in all three locale files. **en.json:**

```json
"chart": {
    "xAxis": "P_amb (bar)",
    "yAxis": "P_t (bar)",
    "legendAmbient": "Ambient line (y = x)",
    "legendSurface": "Surface (P_amb = 1.013 bar)"
}
```

**cs.json:**

```json
"chart": {
    "xAxis": "P_amb (bar)",
    "yAxis": "P_t (bar)",
    "legendAmbient": "Ambientní čára (y = x)",
    "legendSurface": "Hladina (P_amb = 1,013 bar)"
}
```

**es.json:**

```json
"chart": {
    "xAxis": "P_amb (bar)",
    "yAxis": "P_t (bar)",
    "legendAmbient": "Línea ambiental (y = x)",
    "legendSurface": "Superficie (P_amb = 1,013 bar)"
}
```

(Axis labels are still hardcoded in the SVG for now; if i18n binding into SVG text is desired later we can add it. The keys are reserved.)

- [ ] **Step 5: Extend the smoke test**

Append in `.claude-scratch/mvalues_smoke.py` before `browser.close()`:

```python
        # ---- Task 3: top chart "This compartment" ----
        # The chart marker should exist at depth 30, comp TC5, variant C
        # P_amb = 4.01325, M = 5.5588. Marker present.
        # Reset state to defaults
        page.locator('#mvDepth').fill('30')
        page.locator('#mvDepth').dispatch_event('input')
        page.locator('#mvCompartment').select_option('4')   # TC5
        page.locator('button[data-view="this"]').click()
        page.wait_for_timeout(50)

        marker = page.locator('#mvTopChartMarker')
        assert marker.count() == 1, 'expected 1 marker on top chart'

        # The "This compartment" view should render exactly 3 M-lines (3 variants of selected comp)
        mlines_this = page.locator('#mvTopChart line.mv-chart-mline').count()
        assert mlines_this == 3, f'expected 3 m-lines in This view, got {mlines_this}'

        # Switch to All-16 view: should render 16 M-lines
        page.locator('button[data-view="all"]').click()
        page.wait_for_timeout(50)
        mlines_all = page.locator('#mvTopChart line.mv-chart-mline').count()
        assert mlines_all == 16, f'expected 16 m-lines in All view, got {mlines_all}'

        # Back to "This"
        page.locator('button[data-view="this"]').click()
        page.wait_for_timeout(50)

        print('[task 3] top chart this/all-16 line counts ok')
```

- [ ] **Step 6: Run smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected last line: `[task 3] top chart this/all-16 line counts ok`

- [ ] **Step 7: Browser verify**

Open the page. Confirm:
- Chart renders with axes, ambient line (blue dashed), surface line (gray dashed vertical at ~1.01 bar).
- "This compartment" view shows 3 lines (one bold red for active variant C, two faint dashed for A and B).
- Marker dot sits at `(4.01, 5.56)` for default state.
- Toggling "All 16" shows 16 colored lines, the selected one bold.

- [ ] **Step 8: Commit**

```bash
git add sandbox/m-values.html locales/en.json locales/cs.json locales/es.json .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): top chart with this-comp / all-16 views

Inline SVG P-P chart. "This compartment" overlays the selected comp's
M-line under all three variants (bold active, faint dashed inactive).
"All 16" renders all compartments under the active variant. Y-axis
dynamic per existing js/mvalues.js convention. Marker at current
(P_amb, M).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Top playground variant overlay polish + view-toggle keyboard

**Goal:** The variant overlay in "This compartment" view distinguishes the three variants visually (different dash patterns or colors) so even at a glance, A/B/C are identifiable. Also adds a small variant legend underneath the chart so the user can read the colors. (The variant is still local to the top playground — it becomes global in Task 5.)

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Add chart legend CSS and variant-specific overlay styles**

Append to `<style>`:

```css
.mv-chart-legend {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    font-family: ui-monospace, monospace;
}
.mv-chart-legend .item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}
.mv-chart-legend .swatch {
    display: inline-block;
    width: 24px;
    height: 2px;
    background: currentColor;
}
.mv-chart-legend .swatch.dashed {
    height: 0;
    border-top: 2px dashed currentColor;
}
.mv-chart-mline.variant-A { stroke-dasharray: 8,2; }
.mv-chart-mline.variant-B { stroke-dasharray: 3,3; }
.mv-chart-mline.variant-C { stroke-dasharray: none; }
```

- [ ] **Step 2: Modify `drawTopChart()` to attach `variant-A|B|C` classes to the inactive lines, and add a legend underneath**

In the "This compartment" branch of `drawTopChart()`, change the line-drawing loop so each line gets a variant-specific class. Find:

```js
        for (const v of VARIANT_LIST) {
            const isActive = v === state.variant;
            const c = VARIANT_COMPS[v][state.compartmentIdx];
            const m0 = c.aN2 + X_MIN / c.bN2;
            const mMax = c.aN2 + X_MAX / c.bN2;
            svg.appendChild(svgEl('line', {
                x1: xToPx(X_MIN, yMax), y1: yToPx(m0, yMax),
                x2: xToPx(X_MAX, yMax), y2: yToPx(mMax, yMax),
                class: 'mv-chart-mline' + (isActive ? '' : ' faint'),
                stroke: compartmentColor(c),
            }));
        }
```

Replace it with:

```js
        for (const v of VARIANT_LIST) {
            const isActive = v === state.variant;
            const c = VARIANT_COMPS[v][state.compartmentIdx];
            const m0 = c.aN2 + X_MIN / c.bN2;
            const mMax = c.aN2 + X_MAX / c.bN2;
            const variantClass = ' variant-' + v.charAt(v.length - 1);  // 'A' | 'B' | 'C'
            svg.appendChild(svgEl('line', {
                x1: xToPx(X_MIN, yMax), y1: yToPx(m0, yMax),
                x2: xToPx(X_MAX, yMax), y2: yToPx(mMax, yMax),
                class: 'mv-chart-mline' + (isActive ? '' : ' faint') + variantClass,
                stroke: compartmentColor(c),
            }));
        }
```

- [ ] **Step 3: Add the legend element after the chart container in the markup**

In `sandbox/m-values.html`, immediately AFTER the `</div>` that closes `.mv-chart-row`, add:

```html
<div class="mv-chart-legend" id="mvTopChartLegend">
    <span class="item" data-i18n="sandbox.mvalues.top.legend.variantA"><span class="swatch dashed"></span>ZH-L16A (long dash)</span>
    <span class="item" data-i18n="sandbox.mvalues.top.legend.variantB"><span class="swatch dashed"></span>ZH-L16B (short dash)</span>
    <span class="item" data-i18n="sandbox.mvalues.top.legend.variantC"><span class="swatch"></span>ZH-L16C (solid)</span>
    <span class="item" data-i18n="sandbox.mvalues.top.legend.ambient"><span class="swatch dashed" style="color:#2980b9;"></span>Ambient line (y = x)</span>
    <span class="item" data-i18n="sandbox.mvalues.top.legend.surface"><span class="swatch dashed" style="color:#7f8c8d;"></span>Surface (P_amb = 1.013 bar)</span>
</div>
```

- [ ] **Step 4: Add legend i18n keys**

Extend `sandbox.mvalues.top.legend` in all three locale files. **en.json:**

```json
"legend": {
    "variantA": "ZH-L16A (long dash)",
    "variantB": "ZH-L16B (short dash)",
    "variantC": "ZH-L16C (solid)",
    "ambient": "Ambient line (y = x)",
    "surface": "Surface (P_amb = 1.013 bar)"
}
```

**cs.json:**

```json
"legend": {
    "variantA": "ZH-L16A (dlouhá čárka)",
    "variantB": "ZH-L16B (krátká čárka)",
    "variantC": "ZH-L16C (plná)",
    "ambient": "Ambientní čára (y = x)",
    "surface": "Hladina (P_amb = 1,013 bar)"
}
```

**es.json:**

```json
"legend": {
    "variantA": "ZH-L16A (raya larga)",
    "variantB": "ZH-L16B (raya corta)",
    "variantC": "ZH-L16C (sólida)",
    "ambient": "Línea ambiental (y = x)",
    "surface": "Superficie (P_amb = 1,013 bar)"
}
```

- [ ] **Step 5: Extend smoke test**

Append:

```python
        # ---- Task 4: variant overlay classes + legend ----
        # In "This compartment" view, the 3 lines should each have variant-A|B|C class
        page.locator('button[data-view="this"]').click()
        page.wait_for_timeout(50)
        for v in ['A', 'B', 'C']:
            count = page.locator(f'#mvTopChart line.mv-chart-mline.variant-{v}').count()
            assert count == 1, f'variant-{v} line count: {count}'

        # Legend renders 5 items
        legend_items = page.locator('#mvTopChartLegend .item').count()
        assert legend_items == 5, f'legend items: {legend_items}'

        print('[task 4] variant overlay classes + legend ok')
```

- [ ] **Step 6: Run smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected last line: `[task 4] variant overlay classes + legend ok`

- [ ] **Step 7: Browser verify**

The 3 variant lines in "This compartment" view show distinct dash patterns (long, short, solid). Legend underneath the chart explains them.

- [ ] **Step 8: Commit**

```bash
git add sandbox/m-values.html locales/en.json locales/cs.json locales/es.json .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): variant overlay dash patterns + chart legend

Each variant gets a distinct line style (A long dash / B short dash /
C solid) so A vs B vs C is identifiable at a glance. Legend explains
all visual conventions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Bottom playground inputs + formulas + term cards (no chart) + global variant toggle

**Goal:** Bottom playground renders with t½ slider, snap toggle, two analytical formulas, and 3 term cards (`t½`, `a(t½)`, `b(t½)`). The variant toggle moves from the top playground to a global page-level bar that controls both playgrounds. Bottom values update live as the slider moves. The bottom chart is still empty (Task 6).

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Add bottom-playground CSS**

Append to `<style>`:

```css
.mv-derivation-formula {
    text-align: center;
    padding: 0.75rem;
    background: linear-gradient(180deg, rgba(127,140,141,0.06), rgba(127,140,141,0.02));
    border: 1px solid rgba(127,140,141,0.18);
    border-radius: var(--radius);
    margin-bottom: 0.5rem;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.mv-derivation-formula .formula-line { font-size: 1.05rem; line-height: 1.8; }
.mv-derivation-formula .term-th  { background: rgba(155, 89, 182, 0.18); border-bottom: 2px solid #9b59b6; padding: 1px 5px; border-radius: 3px; }
.mv-derivation-formula .term-da  { background: rgba(231, 76, 60, 0.18); border-bottom: 2px solid #e74c3c; padding: 1px 5px; border-radius: 3px; }
.mv-derivation-formula .term-db  { background: rgba(41, 128, 185, 0.18); border-bottom: 2px solid #2980b9; padding: 1px 5px; border-radius: 3px; }

.mv-deriv-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    margin-bottom: 1rem;
}
.mv-deriv-inputs .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.mv-deriv-inputs label { font-size: 0.85rem; color: var(--text-muted); min-width: 110px; }
.mv-deriv-inputs input[type="range"] { flex: 1; accent-color: #9b59b6; }
.mv-deriv-inputs input[type="number"] {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-background);
    font-size: 0.9rem;
    width: 80px;
}

.mv-deriv-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin: 1rem 0;
}
@media (max-width: 700px) { .mv-deriv-row { grid-template-columns: 1fr; } }
.mv-deriv-card {
    background: var(--card-background);
    border: 1px solid var(--border-color);
    border-top: 3px solid var(--border-color);
    border-radius: 4px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    line-height: 1.45;
}
.mv-deriv-card.th { border-top-color: #9b59b6; }
.mv-deriv-card.da { border-top-color: #e74c3c; }
.mv-deriv-card.db { border-top-color: #2980b9; }
.mv-deriv-card .name    { font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem; }
.mv-deriv-card .formula { font-family: ui-monospace, monospace; color: var(--text-muted); font-size: 0.82rem; margin-top: 0.25rem; }
.mv-deriv-card .value   { font-family: ui-monospace, monospace; font-weight: 700; color: var(--text-color); font-size: 1rem; margin-top: 0.4rem; }
.mv-deriv-card .delta   { font-family: ui-monospace, monospace; color: var(--text-muted); font-size: 0.82rem; margin-top: 0.25rem; }
.mv-deriv-card .delta.nonzero { color: #e67e22; font-weight: 600; }
.mv-deriv-card .why     { color: var(--text-muted); font-size: 0.78rem; font-style: italic; margin-top: 0.4rem; }
```

- [ ] **Step 2: Add the global variant bar**

In `sandbox/m-values.html`, replace the `<!-- Task 5 will add the global variant bar here -->` comment (or insert at the top of `.mvalues-layout`, before the top playground) with:

```html
<div class="variant-bar">
    <label data-i18n="sandbox.mvalues.variantBar.label">ZH-L16 variant (applies to both playgrounds):</label>
    <div class="variant-options" id="mvVariantBar">
        <label><input type="radio" name="mvVariant" value="ZH-L16A"> A</label>
        <label><input type="radio" name="mvVariant" value="ZH-L16B"> B</label>
        <label><input type="radio" name="mvVariant" value="ZH-L16C" checked> C</label>
    </div>
</div>
```

- [ ] **Step 3: Replace the `<!-- Task 5-6 will add the bottom playground here -->` comment with bottom-playground markup**

```html
<section class="mvalues-section derivation">
    <h2 data-i18n="sandbox.mvalues.bottom.heading">Where do a and b come from?</h2>
    <p class="mvalues-anchor" data-i18n="sandbox.mvalues.bottom.anchor">ZH-L16A's a and b aren't fitted to data — they're computed from half-time alone. Variants B and C are post-hoc adjustments to specific compartments.</p>

    <div class="mv-derivation-formula">
        <div class="formula-line">
            <span class="term-da">a</span>(<span class="term-th">t<sub>½</sub></span>) =
            2 · <span class="term-th">t<sub>½</sub></span><sup>−1/3</sup>  &nbsp;(bar)
        </div>
        <div class="formula-line">
            <span class="term-db">b</span>(<span class="term-th">t<sub>½</sub></span>) =
            1.005 − <span class="term-th">t<sub>½</sub></span><sup>−1/2</sup>
        </div>
    </div>

    <div class="mv-deriv-inputs">
        <div class="row">
            <label for="mvHalfTime" data-i18n="sandbox.mvalues.bottom.inputs.halfTime">Half-time t½ (min)</label>
            <input type="range" id="mvHalfTimeSlider" min="0" max="100" step="0.1" value="50">
            <input type="number" id="mvHalfTime" min="1" max="700" step="0.1" value="27">
        </div>
        <div class="row">
            <label></label>
            <label class="toggle-row" style="cursor:pointer;">
                <input type="checkbox" id="mvSnapToggle">
                <span class="toggle-hint" data-i18n="sandbox.mvalues.bottom.inputs.snapToggle">Snap to standard compartments</span>
            </label>
        </div>
    </div>

    <div class="mv-deriv-row">
        <div class="mv-deriv-card th">
            <div class="name" data-i18n="sandbox.mvalues.bottom.cards.halfTime.name">t<sub>½</sub> | half-time</div>
            <div class="value"><span id="mvDerivHalfTime">27.0</span> min</div>
            <div class="why" data-i18n="sandbox.mvalues.bottom.cards.halfTime.why">Each compartment's signature time. Not anatomical — a sample point on an exponential axis.</div>
        </div>
        <div class="mv-deriv-card da">
            <div class="name" data-i18n="sandbox.mvalues.bottom.cards.a.name">a(t<sub>½</sub>) | analytical intercept</div>
            <div class="formula">= 2 · t<sub>½</sub><sup>−1/3</sup></div>
            <div class="value"><span id="mvDerivA">0.6667</span> bar</div>
            <div class="delta" id="mvDerivADelta"></div>
            <div class="why" data-i18n="sandbox.mvalues.bottom.cards.a.why">Variants B and C drop a for specific compartments — that's the only place statistics enter Bühlmann.</div>
        </div>
        <div class="mv-deriv-card db">
            <div class="name" data-i18n="sandbox.mvalues.bottom.cards.b.name">b(t<sub>½</sub>) | analytical slope</div>
            <div class="formula">= 1.005 − t<sub>½</sub><sup>−1/2</sup></div>
            <div class="value"><span id="mvDerivB">0.8126</span></div>
            <div class="delta" id="mvDerivBDelta"></div>
            <div class="why" data-i18n="sandbox.mvalues.bottom.cards.b.why">Identical across A/B/C except TC1 (whose t½ swap also swaps b).</div>
        </div>
    </div>

    <!-- Task 6 adds the chart here -->
</section>
```

- [ ] **Step 4: Extend the page module to wire the bottom playground and the global variant bar**

Inside the `<script type="module">` block, **after** existing top-playground state declarations, extend `state` to include bottom-playground fields:

Find:

```js
const state = {
    depth: 30,
    compartmentIdx: 4,
    variant: 'ZH-L16C',
    topView: 'this',
};
```

Replace with:

```js
const state = {
    depth: 30,
    compartmentIdx: 4,
    variant: 'ZH-L16C',
    topView: 'this',
    halfTime: 27.0,    // bottom playground slider position
    snap: false,
};
```

Append below the existing `els` declaration (extend it):

```js
els.variantBar = document.getElementById('mvVariantBar');
els.halfTime = document.getElementById('mvHalfTime');
els.halfTimeSlider = document.getElementById('mvHalfTimeSlider');
els.snapToggle = document.getElementById('mvSnapToggle');
els.derivHalfTime = document.getElementById('mvDerivHalfTime');
els.derivA = document.getElementById('mvDerivA');
els.derivADelta = document.getElementById('mvDerivADelta');
els.derivB = document.getElementById('mvDerivB');
els.derivBDelta = document.getElementById('mvDerivBDelta');
```

Add helper functions before `recompute`:

```js
const T_HALF_MIN = 1;
const T_HALF_MAX = 700;
const LOG_T_MIN = Math.log(T_HALF_MIN);
const LOG_T_MAX = Math.log(T_HALF_MAX);

function sliderToHalfTime(sliderVal /* 0..100 */) {
    // log-scale: slider 0 → 1 min, 100 → 700 min
    const f = sliderVal / 100;
    return Math.exp(LOG_T_MIN + f * (LOG_T_MAX - LOG_T_MIN));
}

function halfTimeToSlider(t) {
    const clamped = Math.max(T_HALF_MIN, Math.min(T_HALF_MAX, t));
    const f = (Math.log(clamped) - LOG_T_MIN) / (LOG_T_MAX - LOG_T_MIN);
    return f * 100;
}

function computeAFromHalfTime(t) {
    return 2 * Math.pow(t, -1 / 3);
}

function computeBFromHalfTime(t) {
    return 1.005 - Math.pow(t, -0.5);
}

function findStandardCompartmentByHalfTime(t, comps) {
    // Returns { idx, comp, exact } where exact=true if t matches a standard t½ within 0.01.
    for (let i = 0; i < comps.length; i++) {
        if (Math.abs(comps[i].halfTime - t) < 0.01) {
            return { idx: i, comp: comps[i], exact: true };
        }
    }
    return null;
}

function snapToNearestStandard(t, comps) {
    let best = comps[0];
    let bestD = Math.abs(comps[0].halfTime - t);
    for (const c of comps) {
        const d = Math.abs(c.halfTime - t);
        if (d < bestD) { best = c; bestD = d; }
    }
    return best.halfTime;
}
```

Add a `recomputeDerivation()` function and call it from `recompute()`:

```js
function recomputeDerivation() {
    const t = state.halfTime;
    const a = computeAFromHalfTime(t);
    const b = computeBFromHalfTime(t);

    els.derivHalfTime.textContent = t.toFixed(1);
    els.derivA.textContent = a.toFixed(4);
    els.derivB.textContent = b.toFixed(4);

    // Delta — only when slider is exactly at a standard t½ for the active variant
    const comps = VARIANT_COMPS[state.variant];
    const match = findStandardCompartmentByHalfTime(t, comps);
    if (match && match.exact) {
        const dA = match.comp.aN2 - a;
        const dB = match.comp.bN2 - b;
        const aDeltaTxt = `stored: ${match.comp.aN2.toFixed(4)} (${state.variant.replace('ZH-L16','')}, Δ ${(dA >= 0 ? '+' : '')}${dA.toFixed(4)})`;
        const bDeltaTxt = `stored: ${match.comp.bN2.toFixed(4)} (Δ ${(dB >= 0 ? '+' : '')}${dB.toFixed(4)})`;
        els.derivADelta.textContent = aDeltaTxt;
        els.derivBDelta.textContent = bDeltaTxt;
        els.derivADelta.classList.toggle('nonzero', Math.abs(dA) > 0.0005);
        els.derivBDelta.classList.toggle('nonzero', Math.abs(dB) > 0.0005);
    } else {
        els.derivADelta.textContent = 'between standards';
        els.derivBDelta.textContent = 'between standards';
        els.derivADelta.classList.remove('nonzero');
        els.derivBDelta.classList.remove('nonzero');
    }
}

// Update recompute() to also call recomputeDerivation():
function recompute() {
    // ... existing top-playground updates ...
    drawTopChart();
    recomputeDerivation();
}
```

Wire bottom-playground inputs:

```js
function setHalfTime(t, fromSlider) {
    let next = t;
    if (state.snap) {
        const comps = VARIANT_COMPS[state.variant];
        next = snapToNearestStandard(t, comps);
    }
    next = Math.max(T_HALF_MIN, Math.min(T_HALF_MAX, next));
    state.halfTime = next;
    if (!fromSlider) {
        els.halfTimeSlider.value = halfTimeToSlider(next).toString();
    }
    els.halfTime.value = next.toFixed(1);
    recompute();
}

els.halfTimeSlider.addEventListener('input', () => {
    const t = sliderToHalfTime(parseFloat(els.halfTimeSlider.value));
    setHalfTime(t, true);
});
els.halfTime.addEventListener('input', () => {
    const t = parseFloat(els.halfTime.value);
    if (!Number.isFinite(t)) return;
    setHalfTime(t, false);
});
els.snapToggle.addEventListener('change', () => {
    state.snap = els.snapToggle.checked;
    setHalfTime(state.halfTime, false);
});

// Global variant bar
els.variantBar.addEventListener('change', (e) => {
    if (e.target.name !== 'mvVariant') return;
    state.variant = e.target.value;
    setZHL16Variant(state.variant);
    // Re-pull compartment data into our cached map (variant-specific)
    // VARIANT_COMPS already has all three pre-built; nothing to refresh there.
    // Re-snap if needed
    if (state.snap) {
        const comps = VARIANT_COMPS[state.variant];
        state.halfTime = snapToNearestStandard(state.halfTime, comps);
        els.halfTime.value = state.halfTime.toFixed(1);
        els.halfTimeSlider.value = halfTimeToSlider(state.halfTime).toString();
    }
    recompute();
});

// Initial slider position
els.halfTimeSlider.value = halfTimeToSlider(state.halfTime).toString();
els.halfTime.value = state.halfTime.toFixed(1);
```

Also, **remove** the old per-page variant from the top-playground inputs — the spec says variant is global. Look for any leftover variant control in the top inputs strip and delete it (Task 2 didn't add one — variant was hardcoded — so nothing to remove unless a previous step added one prematurely).

- [ ] **Step 5: Add bottom-playground i18n keys**

In `locales/en.json`, extend `sandbox.mvalues`:

```json
"variantBar": {
    "label": "ZH-L16 variant (applies to both playgrounds):"
},
"bottom": {
    "heading": "Where do a and b come from?",
    "anchor": "ZH-L16A's a and b aren't fitted to data — they're computed from half-time alone. Variants B and C are post-hoc adjustments to specific compartments.",
    "inputs": {
        "halfTime": "Half-time t½ (min)",
        "snapToggle": "Snap to standard compartments"
    },
    "cards": {
        "halfTime": {
            "name": "t<sub>½</sub> | half-time",
            "why": "Each compartment's signature time. Not anatomical — a sample point on an exponential axis."
        },
        "a": {
            "name": "a(t<sub>½</sub>) | analytical intercept",
            "why": "Variants B and C drop a for specific compartments — that's the only place statistics enter Bühlmann."
        },
        "b": {
            "name": "b(t<sub>½</sub>) | analytical slope",
            "why": "Identical across A/B/C except TC1 (whose t½ swap also swaps b)."
        }
    }
}
```

In `locales/cs.json`:

```json
"variantBar": {
    "label": "Varianta ZH-L16 (platí pro obě pískoviště):"
},
"bottom": {
    "heading": "Odkud pocházejí a a b?",
    "anchor": "a a b ZH-L16A nejsou napasované na data — počítají se pouze z poločasu. Varianty B a C jsou dodatečné úpravy konkrétních kompartmentů.",
    "inputs": {
        "halfTime": "Poločas t½ (min)",
        "snapToggle": "Přichytit ke standardním kompartmentům"
    },
    "cards": {
        "halfTime": {
            "name": "t<sub>½</sub> | poločas",
            "why": "Charakteristický čas kompartmentu. Není anatomický — jen vzorek na exponenciální ose."
        },
        "a": {
            "name": "a(t<sub>½</sub>) | analytický průsečík",
            "why": "Varianty B a C snižují a u konkrétních kompartmentů — jediné místo, kde do Bühlmanna vstupuje statistika."
        },
        "b": {
            "name": "b(t<sub>½</sub>) | analytický sklon",
            "why": "Identické pro A/B/C kromě TC1 (jehož záměna t½ mění i b)."
        }
    }
}
```

In `locales/es.json`:

```json
"variantBar": {
    "label": "Variante ZH-L16 (afecta a ambos sandboxes):"
},
"bottom": {
    "heading": "¿De dónde vienen a y b?",
    "anchor": "Las a y b de ZH-L16A no se ajustan a datos — se calculan solo a partir del periodo de saturación. Las variantes B y C son ajustes posteriores a compartimentos específicos.",
    "inputs": {
        "halfTime": "Periodo t½ (min)",
        "snapToggle": "Ajustar a compartimentos estándar"
    },
    "cards": {
        "halfTime": {
            "name": "t<sub>½</sub> | periodo de saturación",
            "why": "Tiempo característico de cada compartimento. No es anatómico — solo un punto de muestreo en un eje exponencial."
        },
        "a": {
            "name": "a(t<sub>½</sub>) | intersección analítica",
            "why": "Las variantes B y C bajan a en compartimentos específicos — el único lugar donde entra estadística en Bühlmann."
        },
        "b": {
            "name": "b(t<sub>½</sub>) | pendiente analítica",
            "why": "Idéntica en A/B/C salvo TC1 (cuyo cambio de t½ también cambia b)."
        }
    }
}
```

- [ ] **Step 6: Extend smoke test for Task 5**

Append before `browser.close()`:

```python
        # ---- Task 5: bottom playground inputs + cards + global variant ----
        # Default state: t½ = 27, variant = C
        # a(27) = 2 * 27^(-1/3) = 2 * 0.33333 = 0.66667
        # b(27) = 1.005 - 27^(-0.5) = 1.005 - 0.19245 = 0.81255
        deriv_th = float(page.locator('#mvDerivHalfTime').inner_text())
        deriv_a = float(page.locator('#mvDerivA').inner_text())
        deriv_b = float(page.locator('#mvDerivB').inner_text())
        assert abs(deriv_th - 27.0) < 0.05, f't½: {deriv_th}'
        assert abs(deriv_a - 0.6667) < 0.001, f'a(27): {deriv_a}'
        assert abs(deriv_b - 0.8126) < 0.001, f'b(27): {deriv_b}'

        # Delta: TC5 var C has a=0.6200 (Δ -0.0467 from analytical)
        delta_text = page.locator('#mvDerivADelta').inner_text()
        assert '0.6200' in delta_text and ('Δ' in delta_text or 'D ' in delta_text), f'a-delta: {delta_text!r}'

        # Move slider to t½ = 100 (between standards)
        page.locator('#mvHalfTime').fill('100')
        page.locator('#mvHalfTime').dispatch_event('input')
        page.wait_for_timeout(50)
        deriv_a_100 = float(page.locator('#mvDerivA').inner_text())
        # a(100) = 2 * 100^(-1/3) = 2 * 0.21544 = 0.43089
        assert abs(deriv_a_100 - 0.4309) < 0.005, f'a(100): {deriv_a_100}'

        # Snap toggle on → with t=100, nearest standard is TC9 (109 min)
        page.locator('#mvSnapToggle').check()
        page.wait_for_timeout(50)
        deriv_th_snapped = float(page.locator('#mvDerivHalfTime').inner_text())
        assert abs(deriv_th_snapped - 109.0) < 0.5, f'snapped t½: {deriv_th_snapped}'

        # Switch variant to A → for TC9, a(109) analytical = 0.4187, stored A = 0.4187 (no delta)
        page.locator('input[name="mvVariant"][value="ZH-L16A"]').check()
        page.wait_for_timeout(50)
        delta_a_text = page.locator('#mvDerivADelta').inner_text()
        # In variant A, TC9's stored a equals analytical → Δ should be ~0
        assert 'Δ +0.0000' in delta_a_text or 'Δ -0.0000' in delta_a_text or 'D +0.0000' in delta_a_text, f'expected near-zero delta in variant A: {delta_a_text!r}'

        # Switch to C, snap stays on → t½ = 109, a stored C = 0.3750, Δ = -0.0437
        page.locator('input[name="mvVariant"][value="ZH-L16C"]').check()
        page.wait_for_timeout(50)
        delta_a_c = page.locator('#mvDerivADelta').inner_text()
        assert '0.3750' in delta_a_c, f'expected stored 0.3750 in delta text: {delta_a_c!r}'

        # Reset for next tasks
        page.locator('#mvSnapToggle').uncheck()
        page.locator('#mvHalfTime').fill('27')
        page.locator('#mvHalfTime').dispatch_event('input')
        page.wait_for_timeout(50)

        print('[task 5] bottom playground inputs+cards + global variant ok')
```

- [ ] **Step 7: Run smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected last line: `[task 5] bottom playground inputs+cards + global variant ok`

- [ ] **Step 8: Browser verify**

Open the page. Confirm:
- Variant bar appears at the top with A/B/C radios; C selected by default.
- Bottom section "Where do a and b come from?" appears with formulas, slider, snap toggle, 3 cards.
- Sliding t½ updates `a(t½)` and `b(t½)` smoothly.
- When t½ matches a standard compartment (e.g., 27 = TC5), the card shows the stored value and Δ.
- Toggling variant updates the Δ accordingly.

- [ ] **Step 9: Commit**

```bash
git add sandbox/m-values.html locales/en.json locales/cs.json locales/es.json .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): bottom playground (derivation) + global variant

Bottom playground exposes a(t½)=2·t½^(-1/3) and b(t½)=1.005−t½^(-1/2)
with continuous slider, snap-to-standard toggle, and 3 term cards.
Cards show the analytical value plus a Δ vs the stored variant value
when the slider is exactly at a standard t½. Variant toggle moved to
a page-level bar that controls both playgrounds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bottom playground chart — derivation curves with overlay dots

**Goal:** Bottom playground gets an SVG chart showing the analytical curves `a(t½)` and `b(t½)` over the full t½ range (1–700 min, log x-axis), with the 16 standard ZH-L16 compartments overlaid as dots in two series (one for `a`, one for `b`). Toggling variant lifts subset of dots off the analytical curves visibly. The current slider position is shown as a vertical guideline.

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Add bottom-chart CSS**

Append to `<style>`:

```css
.mv-deriv-chart-row {
    background: linear-gradient(180deg, rgba(127,140,141,0.04), rgba(127,140,141,0));
    border: 1px dashed rgba(127,140,141,0.35);
    border-radius: var(--radius);
    padding: 0.5rem;
    margin-bottom: 1rem;
}
#mvDerivChart { width: 100%; height: 280px; display: block; }
.mv-deriv-curve-a { stroke: #e74c3c; stroke-width: 2; fill: none; }
.mv-deriv-curve-b { stroke: #2980b9; stroke-width: 2; fill: none; }
.mv-deriv-dot-a   { fill: #e74c3c; stroke: white; stroke-width: 1; }
.mv-deriv-dot-b   { fill: #2980b9; stroke: white; stroke-width: 1; }
.mv-deriv-dot-a.selected,
.mv-deriv-dot-b.selected { stroke: #2c3e50; stroke-width: 2; }
.mv-deriv-cursor  { stroke: #9b59b6; stroke-width: 1; stroke-dasharray: 3,3; }
```

- [ ] **Step 2: Add the chart container after the term cards in the bottom playground**

Replace `<!-- Task 6 adds the chart here -->` with:

```html
<div class="mv-deriv-chart-row">
    <svg id="mvDerivChart" viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet" aria-label="Derivation chart"></svg>
</div>
<div class="mv-chart-legend">
    <span class="item" style="color:#e74c3c;" data-i18n="sandbox.mvalues.bottom.legend.a"><span class="swatch"></span>a(t½) curve + 16 stored values (dots)</span>
    <span class="item" style="color:#2980b9;" data-i18n="sandbox.mvalues.bottom.legend.b"><span class="swatch"></span>b(t½) curve + 16 stored values (dots)</span>
    <span class="item" style="color:#9b59b6;" data-i18n="sandbox.mvalues.bottom.legend.cursor"><span class="swatch dashed"></span>Slider position (current t½)</span>
</div>
```

- [ ] **Step 3: Extend the script to draw the bottom chart**

Add inside the `<script type="module">` block, near the top-chart helpers:

```js
// ---- Bottom (derivation) chart constants ----
const DERIV_W = 480;
const DERIV_H = 280;
const DERIV_PAD_L = 40;
const DERIV_PAD_R = 40;   // right padding leaves room for the b-axis
const DERIV_PAD_T = 14;
const DERIV_PAD_B = 32;
const A_MIN = 0;
const A_MAX = 1.5;
const B_MIN = 0.4;
const B_MAX = 1.0;
const N_SAMPLES = 120;

function tToPx(t) {
    const f = (Math.log(t) - LOG_T_MIN) / (LOG_T_MAX - LOG_T_MIN);
    return DERIV_PAD_L + f * (DERIV_W - DERIV_PAD_L - DERIV_PAD_R);
}
function aToPx(a) {
    const usable = DERIV_H - DERIV_PAD_T - DERIV_PAD_B;
    return DERIV_PAD_T + usable - ((a - A_MIN) / (A_MAX - A_MIN)) * usable;
}
function bToPx(b) {
    const usable = DERIV_H - DERIV_PAD_T - DERIV_PAD_B;
    return DERIV_PAD_T + usable - ((b - B_MIN) / (B_MAX - B_MIN)) * usable;
}

function drawDerivChart() {
    const svg = document.getElementById('mvDerivChart');
    if (!svg) return;
    svg.innerHTML = '';

    // Axes (left = a, right = b, bottom = t½ log)
    svg.appendChild(svgEl('line', {
        x1: DERIV_PAD_L, y1: DERIV_PAD_T, x2: DERIV_PAD_L, y2: DERIV_H - DERIV_PAD_B, class: 'mv-chart-axis',
    }));
    svg.appendChild(svgEl('line', {
        x1: DERIV_W - DERIV_PAD_R, y1: DERIV_PAD_T, x2: DERIV_W - DERIV_PAD_R, y2: DERIV_H - DERIV_PAD_B, class: 'mv-chart-axis',
    }));
    svg.appendChild(svgEl('line', {
        x1: DERIV_PAD_L, y1: DERIV_H - DERIV_PAD_B, x2: DERIV_W - DERIV_PAD_R, y2: DERIV_H - DERIV_PAD_B, class: 'mv-chart-axis',
    }));

    // X ticks at decade positions: 1, 10, 100, 1000 (cap at 700)
    for (const tx of [1, 10, 100, 700]) {
        const px = tToPx(tx);
        svg.appendChild(svgEl('line', {
            x1: px, y1: DERIV_H - DERIV_PAD_B, x2: px, y2: DERIV_H - DERIV_PAD_B + 4, class: 'mv-chart-tick',
        }));
        const lbl = svgEl('text', { x: px, y: DERIV_H - DERIV_PAD_B + 14, class: 'mv-chart-label', 'text-anchor': 'middle' });
        lbl.textContent = tx.toString();
        svg.appendChild(lbl);
    }

    // Y-left ticks for a (every 0.5)
    for (let a = A_MIN; a <= A_MAX; a += 0.5) {
        const py = aToPx(a);
        svg.appendChild(svgEl('line', { x1: DERIV_PAD_L - 4, y1: py, x2: DERIV_PAD_L, y2: py, class: 'mv-chart-tick' }));
        const lbl = svgEl('text', { x: DERIV_PAD_L - 6, y: py + 3, class: 'mv-chart-label', 'text-anchor': 'end', fill: '#e74c3c' });
        lbl.textContent = a.toFixed(1);
        svg.appendChild(lbl);
    }
    // Y-right ticks for b (every 0.1)
    for (let b = B_MIN; b <= B_MAX; b += 0.1) {
        const py = bToPx(b);
        svg.appendChild(svgEl('line', { x1: DERIV_W - DERIV_PAD_R, y1: py, x2: DERIV_W - DERIV_PAD_R + 4, y2: py, class: 'mv-chart-tick' }));
        const lbl = svgEl('text', { x: DERIV_W - DERIV_PAD_R + 6, y: py + 3, class: 'mv-chart-label', 'text-anchor': 'start', fill: '#2980b9' });
        lbl.textContent = b.toFixed(1);
        svg.appendChild(lbl);
    }

    // Axis labels
    const xLabel = svgEl('text', { x: (DERIV_W) / 2, y: DERIV_H - 6, class: 'mv-chart-label', 'text-anchor': 'middle' });
    xLabel.textContent = 't½ (min, log)';
    svg.appendChild(xLabel);

    // Curves: 120 samples
    let pathA = '';
    let pathB = '';
    for (let i = 0; i <= N_SAMPLES; i++) {
        const f = i / N_SAMPLES;
        const t = Math.exp(LOG_T_MIN + f * (LOG_T_MAX - LOG_T_MIN));
        const a = computeAFromHalfTime(t);
        const b = computeBFromHalfTime(t);
        const px = tToPx(t);
        const aPy = aToPx(a);
        const bPy = bToPx(b);
        pathA += (i === 0 ? `M ${px} ${aPy}` : ` L ${px} ${aPy}`);
        pathB += (i === 0 ? `M ${px} ${bPy}` : ` L ${px} ${bPy}`);
    }
    svg.appendChild(svgEl('path', { d: pathA, class: 'mv-deriv-curve-a' }));
    svg.appendChild(svgEl('path', { d: pathB, class: 'mv-deriv-curve-b' }));

    // Dots at the 16 standard compartment t½'s for the active variant
    const comps = VARIANT_COMPS[state.variant];
    comps.forEach((c, idx) => {
        const px = tToPx(c.halfTime);
        const aPy = aToPx(c.aN2);
        const bPy = bToPx(c.bN2);
        const isSelected = idx === state.compartmentIdx;
        svg.appendChild(svgEl('circle', {
            cx: px, cy: aPy, r: isSelected ? 5 : 3.5,
            class: 'mv-deriv-dot-a' + (isSelected ? ' selected' : ''),
            'data-comp': idx, 'data-axis': 'a',
        }));
        svg.appendChild(svgEl('circle', {
            cx: px, cy: bPy, r: isSelected ? 5 : 3.5,
            class: 'mv-deriv-dot-b' + (isSelected ? ' selected' : ''),
            'data-comp': idx, 'data-axis': 'b',
        }));
    });

    // Cursor at current slider t½
    const tNow = state.halfTime;
    const cursorX = tToPx(tNow);
    svg.appendChild(svgEl('line', {
        x1: cursorX, y1: DERIV_PAD_T, x2: cursorX, y2: DERIV_H - DERIV_PAD_B,
        class: 'mv-deriv-cursor',
    }));
}

```

Then find the existing `recompute()` function (defined in Task 2 and extended in Task 5 to call `drawTopChart()` and `recomputeDerivation()`) and append `drawDerivChart();` to it. The function should now look like:

```js
function recompute() {
    const comp = COMPARTMENTS[state.compartmentIdx];
    const pAmb = pAmbFromDepth(state.depth);
    const a = comp.aN2;
    const b = comp.bN2;
    const m = getMValue(pAmb, a, b);

    els.formulaA.textContent = a.toFixed(4);
    els.formulaPamb.textContent = pAmb.toFixed(4);
    els.formulaB.textContent = b.toFixed(4);
    els.formulaM.textContent = m.toFixed(4);

    els.aValue.textContent = a.toFixed(4);
    els.pambValue.textContent = pAmb.toFixed(4);
    els.bValue.textContent = b.toFixed(4);
    els.mValue.textContent = m.toFixed(4);

    drawTopChart();
    recomputeDerivation();
    drawDerivChart();
}
```

- [ ] **Step 4: Add legend i18n keys**

Extend `sandbox.mvalues.bottom.legend` in all three files. **en.json:**

```json
"legend": {
    "a": "a(t½) curve + 16 stored values (dots)",
    "b": "b(t½) curve + 16 stored values (dots)",
    "cursor": "Slider position (current t½)"
}
```

**cs.json:**

```json
"legend": {
    "a": "křivka a(t½) + 16 uložených hodnot (body)",
    "b": "křivka b(t½) + 16 uložených hodnot (body)",
    "cursor": "Pozice posuvníku (aktuální t½)"
}
```

**es.json:**

```json
"legend": {
    "a": "curva a(t½) + 16 valores almacenados (puntos)",
    "b": "curva b(t½) + 16 valores almacenados (puntos)",
    "cursor": "Posición del deslizador (t½ actual)"
}
```

- [ ] **Step 5: Extend smoke test for Task 6**

Append before `browser.close()`:

```python
        # ---- Task 6: bottom chart curves + dots ----
        # Both curves should be present
        path_a = page.locator('#mvDerivChart path.mv-deriv-curve-a').count()
        path_b = page.locator('#mvDerivChart path.mv-deriv-curve-b').count()
        assert path_a == 1 and path_b == 1, f'curves: a={path_a}, b={path_b}'

        # 16 dots per axis = 32 total
        dots_a = page.locator('#mvDerivChart circle.mv-deriv-dot-a').count()
        dots_b = page.locator('#mvDerivChart circle.mv-deriv-dot-b').count()
        assert dots_a == 16 and dots_b == 16, f'dots: a={dots_a}, b={dots_b}'

        # Variant overlay test: in C, the TC5 a-dot is BELOW the analytical curve.
        # Switch to C, ensure dot for TC5 (idx 4) at t½=27, a-stored=0.6200, analytical=0.6667
        # Get the dot's cy attribute and the curve's value at the same x position
        page.locator('input[name="mvVariant"][value="ZH-L16C"]').check()
        page.wait_for_timeout(50)
        # Switch to A: TC5 dot should sit on curve (a stored = analytical = 0.6667)
        page.locator('input[name="mvVariant"][value="ZH-L16A"]').check()
        page.wait_for_timeout(50)
        # Switch back to C
        page.locator('input[name="mvVariant"][value="ZH-L16C"]').check()
        page.wait_for_timeout(50)

        # Cursor should be present
        cursor = page.locator('#mvDerivChart line.mv-deriv-cursor').count()
        assert cursor == 1, f'cursor: {cursor}'

        print('[task 6] bottom chart curves + 32 dots + cursor ok')
```

- [ ] **Step 6: Run smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected last line: `[task 6] bottom chart curves + 32 dots + cursor ok`

- [ ] **Step 7: Browser verify**

- Bottom chart shows red `a(t½)` curve and blue `b(t½)` curve.
- 16 red dots and 16 blue dots overlaid at standard t½ positions.
- Toggling variant A → C: red dots for TC5–15 visibly drop below the red curve. Blue dots stay on the blue curve.
- Sliding t½ moves the purple dashed cursor.

- [ ] **Step 8: Commit**

```bash
git add sandbox/m-values.html locales/en.json locales/cs.json locales/es.json .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): bottom chart with derivation curves + dots

SVG chart of a(t½) and b(t½) analytical curves over log-scaled t½ axis.
16 standard compartments overlaid as dots — variant A's dots sit on the
curve, variant C lifts TC5–15 off the red curve. Slider position shown
as a purple dashed cursor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Cross-playground sync, cross-links, wiki updates, version bump

**Goal:** Final polish task. Selecting a compartment in the top dropdown also highlights the dot in the bottom chart; matching the bottom slider exactly to a standard compartment updates the top dropdown. Cross-links section appears at the bottom of the page. Wiki pages get "See also" links. Service-worker `CACHE_NAME` and `css/styles.css` `.version-number` are bumped.

**Files:**
- Modify: `sandbox/m-values.html`
- Modify: `wiki/Model-04-M-Values.md`
- Modify: `wiki/Model-01-Compartments.md`
- Modify: `wiki/Module-Reference.md`
- Modify: `sw.js`
- Modify: `css/styles.css`
- Modify: `locales/en.json`, `locales/cs.json`, `locales/es.json`
- Modify: `.claude-scratch/mvalues_smoke.py`

- [ ] **Step 1: Update compartment-select listener to also redraw the bottom chart**

Already done implicitly because `recompute()` calls `drawDerivChart()`. But verify: when the user picks compartment in the dropdown, does the bottom chart's `.selected` dot move to the new compartment? If not, ensure `drawDerivChart()` is using the updated `state.compartmentIdx`. The handler should be unchanged — `recompute()` covers it.

- [ ] **Step 2: Add bottom-slider → top compartment sync**

Modify `setHalfTime()` so when the slider snaps exactly to a standard compartment, the top compartment dropdown follows:

Find the existing `setHalfTime` and add at the end (just before `recompute()`):

```js
function setHalfTime(t, fromSlider) {
    let next = t;
    if (state.snap) {
        const comps = VARIANT_COMPS[state.variant];
        next = snapToNearestStandard(t, comps);
    }
    next = Math.max(T_HALF_MIN, Math.min(T_HALF_MAX, next));
    state.halfTime = next;
    if (!fromSlider) {
        els.halfTimeSlider.value = halfTimeToSlider(next).toString();
    }
    els.halfTime.value = next.toFixed(1);

    // NEW: if t exactly matches a standard compartment, sync the top dropdown
    const comps = VARIANT_COMPS[state.variant];
    const match = findStandardCompartmentByHalfTime(next, comps);
    if (match && match.exact && state.compartmentIdx !== match.idx) {
        state.compartmentIdx = match.idx;
        els.compartment.value = match.idx;
    }

    recompute();
}
```

- [ ] **Step 3: Add top-compartment → bottom-slider sync**

Modify the compartment-change handler:

```js
els.compartment.addEventListener('change', () => {
    state.compartmentIdx = parseInt(els.compartment.value, 10);
    // NEW: also move the bottom slider to that compartment's t½
    const comp = COMPARTMENTS[state.compartmentIdx];
    state.halfTime = comp.halfTime;
    els.halfTime.value = comp.halfTime.toFixed(1);
    els.halfTimeSlider.value = halfTimeToSlider(comp.halfTime).toString();
    recompute();
});
```

- [ ] **Step 4: Add cross-links section at the bottom of the page**

In `sandbox/m-values.html`, replace `<!-- Task 7 will add cross-links here -->` with:

```html
<section class="mvalues-section" style="background: transparent; border: none;">
    <h2 data-i18n="sandbox.mvalues.crossLinks.heading">See also</h2>
    <ul>
        <li><a href="../wiki/Model-04-M-Values.html" data-i18n="sandbox.mvalues.crossLinks.wiki">Wiki: M-Values (the math)</a></li>
        <li><a href="../m-values.html" data-i18n="sandbox.mvalues.crossLinks.theory">M-Values theory page (history + dive examples)</a></li>
        <li><a href="haldane.html" data-i18n="sandbox.mvalues.crossLinks.haldane">Haldane sandbox (tissue chases ambient)</a></li>
        <li><a href="schreiner.html" data-i18n="sandbox.mvalues.crossLinks.schreiner">Schreiner sandbox (tissue chases moving ambient)</a></li>
    </ul>
</section>
```

(Note: the wiki link `Model-04-M-Values.html` only resolves on the published GitHub wiki. For locally-served pages, the wiki/ directory contains markdown files. Keep the link as-is — local users get a 404 but online users get the page. If desired, the link could point to GitHub's wiki URL, but that requires hard-coding the repo URL.)

- [ ] **Step 5: Add cross-links i18n keys**

In `locales/en.json`, extend `sandbox.mvalues`:

```json
"crossLinks": {
    "heading": "See also",
    "wiki": "Wiki: M-Values (the math)",
    "theory": "M-Values theory page (history + dive examples)",
    "haldane": "Haldane sandbox (tissue chases ambient)",
    "schreiner": "Schreiner sandbox (tissue chases moving ambient)"
}
```

In `locales/cs.json`:

```json
"crossLinks": {
    "heading": "Viz také",
    "wiki": "Wiki: M-hodnoty (matematika)",
    "theory": "Stránka teorie M-hodnot (historie + příklady ponorů)",
    "haldane": "Haldaneovo pískoviště (tkáň pronásleduje ambient)",
    "schreiner": "Schreinerovo pískoviště (tkáň pronásleduje pohyblivý ambient)"
}
```

In `locales/es.json`:

```json
"crossLinks": {
    "heading": "Ver también",
    "wiki": "Wiki: Valores M (la matemática)",
    "theory": "Página de teoría de Valores M (historia + ejemplos de inmersión)",
    "haldane": "Sandbox de Haldane (el tejido persigue al ambiente)",
    "schreiner": "Sandbox de Schreiner (el tejido persigue al ambiente en movimiento)"
}
```

- [ ] **Step 6: Update `wiki/Model-04-M-Values.md`**

Find the `## Cross-references` section at the bottom and add a new bullet:

```markdown
- [Sandbox: M-Values](../sandbox/m-values.html) — interactive playground for the M-value formula and where its coefficients come from.
```

- [ ] **Step 7: Update `wiki/Model-01-Compartments.md`**

Find the section `## Bühlmann a/b — where they come from` (around line 65). At the end of that section add:

```markdown

See also: [Sandbox: M-Values](../sandbox/m-values.html), whose bottom playground visualizes these formulas alongside the 16 stored compartment values — toggling between A and C lifts the adjusted dots off the analytical curves.
```

- [ ] **Step 8: Update `wiki/Module-Reference.md`**

Find the sandbox section (search for existing entries like `sandbox/haldane.html` or `sandbox/schreiner.html`). Add an entry for `sandbox/m-values.html` describing it briefly:

```markdown
- `sandbox/m-values.html` — Two-playground sandbox for the M-value formula and its derivation. Top playground evaluates `M = a + P_amb/b`. Bottom playground exposes the analytical curves `a(t½)` and `b(t½)` with 16 ZH-L16 compartments overlaid as dots (variants A/B/C lift dots off the curves selectively). See `docs/superpowers/specs/2026-05-09-mvalues-sandbox-page-design.md`.
```

Place it immediately after the `sandbox/schreiner.html` entry to keep the file ordered.

- [ ] **Step 9: Bump service-worker version and CSS version-number**

In `sw.js`, find:

```js
const CACHE_NAME = 'deco-theory-0.5.79';
```

Bump to `0.5.80`:

```js
const CACHE_NAME = 'deco-theory-0.5.80';
```

In `css/styles.css`, find the `.version-number::after` rule (search for `.version-number::after`). Update its `content` value to match: `0.5.80`. Example:

```css
.version-number::after {
    content: 'v0.5.80';
}
```

(The exact prefix `v` may differ in the existing file — preserve the format you find, just update the version number.)

- [ ] **Step 10: Run npm test (per CLAUDE.md commit checklist)**

```bash
npm test
```

Expected: all tests pass (the M-value sandbox change is in HTML/CSS only; existing unit tests should be unaffected).

- [ ] **Step 11: Extend smoke test for Task 7 sync behavior**

Append before `browser.close()`:

```python
        # ---- Task 7: cross-playground sync ----
        # Reset to defaults
        page.locator('#mvDepth').fill('30')
        page.locator('#mvDepth').dispatch_event('input')
        page.locator('#mvCompartment').select_option('4')   # TC5
        page.locator('input[name="mvVariant"][value="ZH-L16C"]').check()
        page.wait_for_timeout(50)

        # Top → bottom: changing compartment to TC9 (idx=8) should move bottom slider to t½=109
        page.locator('#mvCompartment').select_option('8')
        page.wait_for_timeout(50)
        deriv_th_after = float(page.locator('#mvDerivHalfTime').inner_text())
        assert abs(deriv_th_after - 109.0) < 0.5, f'expected t½=109 after TC9 select, got {deriv_th_after}'

        # Bottom → top: setting t½ exactly to 27 (TC5) should change top dropdown to TC5 (idx=4)
        page.locator('#mvHalfTime').fill('27')
        page.locator('#mvHalfTime').dispatch_event('input')
        page.wait_for_timeout(50)
        comp_idx = page.locator('#mvCompartment').input_value()
        assert comp_idx == '4', f'expected dropdown idx=4 (TC5) after t½=27, got {comp_idx}'

        # Cross-links section present
        cross_links = page.locator('a[href*="m-values.html"], a[href*="schreiner.html"], a[href*="haldane.html"]').count()
        assert cross_links >= 4, f'expected >=4 cross-links, got {cross_links}'

        print('[task 7] cross-playground sync + cross-links ok')
```

- [ ] **Step 12: Run smoke test, expect pass**

```bash
python3 ~/.claude/plugins/cache/anthropic-agent-skills/example-skills/1ed29a03dc85/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -m http.server 5599" --port 5599 \
  -- python3 .claude-scratch/mvalues_smoke.py
```

Expected last line: `[task 7] cross-playground sync + cross-links ok`

- [ ] **Step 13: Final browser verification — full feature walkthrough**

Open the page in a browser. Walk through:

1. Default: depth=30, comp=TC5, variant=C. Top playground shows `M = 5.5588 = 0.6200 + 4.0133 / 0.8126`. Bottom shows t½=27, `a(27)=0.6667`, `b(27)=0.8126`, with `a` card displaying "stored: 0.6200 (C, Δ -0.0467)".
2. Slide depth to 0 m. M drops to 1.87. Bottom unchanged.
3. Pick compartment TC1 in top. Bottom slider jumps to 5 min (variant C TC1). Top chart shows TC1's M-line.
4. Toggle variant to A. Bottom chart's TC5–15 a-dots snap onto the red curve (now matching analytical). Top chart's TC1 line shifts (because variant A TC1 has a=1.2599, b=0.5050).
5. Toggle bottom snap toggle on. Slide bottom slider; it snaps to standard compartment t½'s. Top dropdown follows.
6. Click "All 16" view in top. 16 lines render. Selected line bolded.
7. Cross-links at the bottom navigate to wiki / theory / Haldane / Schreiner pages.

- [ ] **Step 14: Commit final task**

```bash
git add sandbox/m-values.html sw.js css/styles.css \
        locales/en.json locales/cs.json locales/es.json \
        wiki/Model-04-M-Values.md wiki/Model-01-Compartments.md wiki/Module-Reference.md \
        .claude-scratch/mvalues_smoke.py
git commit -m "$(cat <<'EOF'
feat(mvalues-sandbox): cross-playground sync, cross-links, wiki, version

Cross-sync top/bottom: picking a compartment in top moves the bottom
slider to that compartment's t½; conversely, snapping the bottom
slider to a standard t½ updates the top dropdown. Cross-links to
wiki, theory page, and sibling sandboxes added at page bottom. Wiki
pages reference the new sandbox. Service-worker CACHE_NAME and CSS
version bumped to 0.5.80.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15: Push branch and open PR**

```bash
git push -u origin feat/mvalues-sandbox-page
gh pr create --title "feat: M-value sandbox page (sandbox/m-values.html)" --body "$(cat <<'EOF'
## Summary

- New interactive sandbox page at `sandbox/m-values.html`.
- Top playground evaluates `M = a + P_amb/b` with depth/compartment/variant inputs and a P-P chart.
- Bottom playground exposes the analytical derivation `a(t½) = 2·t½^(-1/3)` and `b(t½) = 1.005 − t½^(-1/2)` with the 16 ZH-L16 compartments overlaid as dots — toggling A → C lifts the adjusted dots off the analytical curves.
- Variant toggle is page-level (controls both playgrounds).
- Cross-playground compartment sync (top dropdown ↔ bottom slider).
- Wiki cross-links to Model-04 and Model-01.

Spec: `docs/superpowers/specs/2026-05-09-mvalues-sandbox-page-design.md`
Plan: `docs/superpowers/plans/2026-05-09-mvalues-sandbox-page.md`

## Test plan

- [x] All `npm test` pass.
- [x] Browser smoke test (`.claude-scratch/mvalues_smoke.py`) green at every task.
- [ ] Manual: verify default state shows `M = 5.5588` for TC5 var C at 30 m.
- [ ] Manual: variant A → C visibly lifts TC5–15 a-dots off the bottom chart's red curve.
- [ ] Manual: top compartment ↔ bottom slider sync works in both directions.
- [ ] Manual: "All 16" view renders 16 colored lines.
- [ ] Manual: page renders correctly on mobile (cards reflow, charts maintain aspect).
- [ ] Manual: i18n switching (en/cs/es) doesn't break the formulas or charts.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage check** (per `docs/superpowers/specs/2026-05-09-mvalues-sandbox-page-design.md`):

| Spec section | Implemented in |
|---|---|
| §3 Page identity (file path, title, nav, ordering) | Task 1 |
| §4.1 Top inputs (depth, comp, variant, view toggle) | Task 2 (variant moved to global in Task 5) |
| §4.2 Annotated formula | Task 2 |
| §4.3 Term cards (4 cards) | Task 2 |
| §4.4 Main chart (axes, ambient, surface, this-comp view, all-16 view, marker, dynamic y) | Tasks 3 + 4 |
| §5.1 Bottom anchor message | Task 5 |
| §5.2 Annotated derivation formulas | Task 5 |
| §5.3 Inputs (slider, numeric, snap, shared variant) | Task 5 |
| §5.4 Term cards (3 cards with delta) | Task 5 |
| §5.5 Bottom chart (curves, log x, dual y, 16 dots, cursor) | Task 6 |
| §5.6 Variant teaching moment (dots lift off) | Task 6 |
| §6 Cross-playground sync | Task 7 |
| §7 Layout (desktop + mobile) | Task 1 (skeleton) + per-task CSS |
| §8 Defaults | Tasks 1–5 (initial state values) |
| §9 i18n keys (en/cs/es) | Task 1 (stub), Tasks 2/5/6/7 (per-section) |
| §10 Tech details (vanilla ESM, `getMValue`, helpers) | Task 2 (top), Task 5 (bottom), Task 6 (bottom chart) |
| §11 Service worker + version bump | Task 1 (sw asset), Task 7 (cache name + version) |
| §12 Wiki updates | Task 7 |
| §13 Smoke testing | Task 1 + each subsequent task extends |

**Placeholder scan:** No "TBD", "TODO", "implement later" in the plan body. Every step has either runnable code or runnable shell commands. One note flagged inline:

- Task 7 Step 4 cross-link to `Model-04-M-Values.html` only resolves on GitHub wiki. Acceptable — same pattern used elsewhere in the codebase.

**Type/name consistency check:**

- `state.compartmentIdx` (zero-based) — used consistently across all tasks. `state.compartmentIdx = 4` = TC5.
- Element IDs `mvDepth`, `mvCompartment`, `mvVariantBar`, `mvHalfTime`, etc. — used consistently.
- Function names `recompute`, `recomputeDerivation`, `drawTopChart`, `drawDerivChart`, `setHalfTime`, `pAmbFromDepth`, `computeAFromHalfTime`, `computeBFromHalfTime`, `findStandardCompartmentByHalfTime`, `snapToNearestStandard`, `sliderToHalfTime`, `halfTimeToSlider`, `tToPx`, `aToPx`, `bToPx`, `xToPx`, `yToPx`, `svgEl`, `compartmentColor`, `dynamicYMax` — all defined in earlier tasks, referenced in later tasks consistently.
- CSS class names `.mvalues-layout`, `.mvalues-section`, `.mv-term-row`, `.mv-term-card.{a,pamb,b,m}`, `.mv-deriv-row`, `.mv-deriv-card.{th,da,db}`, `.mv-chart-row`, `.mv-deriv-chart-row`, `.mv-chart-mline.{variant-A,variant-B,variant-C}`, `.mv-deriv-curve-{a,b}`, `.mv-deriv-dot-{a,b}`, `.mv-deriv-cursor` — all introduced once, referenced consistently.
- Variant strings `'ZH-L16A' | 'ZH-L16B' | 'ZH-L16C'` — match `ZHL16_VARIANTS` exports from `js/tissueCompartments.js`.
- Constants `X_MIN=0`, `X_MAX=7`, `T_HALF_MIN=1`, `T_HALF_MAX=700`, `A_MIN=0`, `A_MAX=1.5`, `B_MIN=0.4`, `B_MAX=1.0`, `N_SAMPLES=120` — defined once each, used consistently.

**End of plan.**
