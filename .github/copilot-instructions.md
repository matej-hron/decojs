# Copilot Instructions for Deco Theory PWA

## Project Overview
DecoJS is an educational PWA for scuba diving decompression theory, implementing the Bühlmann ZH-L16 algorithm with interactive visualizations.

**Live at:** https://decotheory.eu (GitHub Pages from `main`)

## Development Commands

```bash
npm test              # Run all tests — MUST pass before commits
npm run test:watch    # Watch mode for development
```

**Local development:** VS Code Live Server extension (port 5500)

## Architecture

**No build tools** — Pure ES Modules loaded directly by the browser.

### Three Main Parts

1. **Sandbox** (`sandbox/index.html`) — Interactive dive planner; DiveSetupEditor → JSON → DiveProfileChart + MValueChart
2. **Theory** (`pressure.html`, `tissue-loading.html`, `m-values.html`, `gradient-factors.html`) — Educational pages; each example links to Sandbox ("Open in Sandbox →")
3. **Quizzes** (`quiz-*.html`) — Official SPČR (Czech CMAS) exam questions; generic quiz engine with category filtering and scoring

### Core Modules
- `js/decoModel.js` — Barrel re-exporting the deco engine (implementation in `js/deco/`)
- `js/deco/constants.js`, `config.js`, `environment.js` — Constants, deco modes, ambient pressure
- `js/deco/gasKinetics.js` — Haldane/Schreiner equations, depth-step simulation
- `js/deco/gradients.js` — M-values, gradient factors, ceilings
- `js/deco/ceiling.js` — First-stop search, ceiling time series
- `js/deco/schedule.js` — NDL and deco-stop schedule generation
- `js/deco/profile.js` — Full-profile tissue loading
- `js/tissueCompartments.js` — ZH-L16 compartment data (A/B/C variants)
- `js/diveSetup.js` — Gas presets, profile generation
- `js/quiz.js` — Generic quiz engine

### Reusable Components
- `js/charts/DiveProfileChart.js` — Depth/time with deco stops, ceilings, gas switches
- `js/charts/MValueChart.js` — P-P diagram with tissue loading visualization
- `js/components/DiveSetupEditor.js` — Form UI for dive configuration
- `js/nav.js` — Centralized `NAV_ITEMS` array, handles subdirectory paths

## Current Content

**Theory pages (English):** Pressure, Tissue Loading, M-Values, Gradient Factors

**Quizzes (Czech — CMAS/SPČR 2018 exams):** Physics, Anatomy, Accidents, Safety, Training, Equipment, Vessel — 7 quizzes, 650+ questions total

## Key Conventions

- Quizzes: Czech with proper diacritics (háčky, čárky); English loanwords stay as-is (Single, AL80)
- Theory pages: English
- CSS variables in `:root` for theming
- JSDoc comments for public functions
- Bug fixes must include regression tests

## Known Limitations / Roadmap

- **Repetitive dives disabled** — DiveSetupEditor supports multi-dive (`showMultiDive` option) but charts only render `dives[0]`. Full support requires chaining tissue simulation across dives, surface interval off-gassing, and continuous timeline rendering.

## Theoretical References

When looking into decompression theory concepts, follow these primary sources:

1. **Decompression Theory** (local text file):
   `resources/decompression-theory.txt` - Professor A.A. Buehlmann's ZH-L16 Algorithm explanation by Paul Chapman, covering:
   - Haldane's foundational decompression theory
   - Tissue compartments and half-times
   - On-gassing and off-gassing principles
   - M-values and tolerable supersaturation
   - Workman's refinements to allowable overpressure
   - Buehlmann's ZH-L16 algorithm details
   - Practical dive planning applications

2. **"Deco for Divers" by Mark Powell** (book, no online version available):
   The definitive reference for recreational and technical diving decompression. 
   Physical copy only - not available online.

3. **CMAS P*/P** Physics Course** (local file):
   `resources/FyzikaP12_2025.txt` - Czech diving physics course material covering:
   - Density (Hustota) - water density, temperature anomaly
   - Pressure (Tlak) - atmospheric, hydrostatic, total pressure with altitude tables
   - Gas compression (Stlačování plynů) - Boyle-Mariotte's Law, gas consumption calculations
   - Buoyancy (Archimedův zákon) - weight calculations, BCD control
   - Air composition (Složení vzduchu) - N₂ 78%, O₂ 21%
   - Dalton's Law (Daltonův zákon) - partial pressures, ppO₂ limits (0.16-1.6 bar), ppN₂ max 4 bar
   - Henry's Law (Henryho zákon) - gas dissolution, on/off-gassing, tissue saturation
   - Vision underwater (Vidění) - light refraction, objects appear 1/3 larger, 1/4 closer
   - Hearing underwater (Slyšení) - sound speed 1500 m/s vs 330 m/s in air
   - Heat transfer (Přenos tepla) - water conducts heat 25x better than air

## Notation

Physical quantities follow ČSN EN ISO 80000-1 and Czech typographic convention:
quantity symbols italic, units upright, `&nbsp;` between number and unit, decimal comma
in Czech, lowercase *p* for pressure.

Full rules: [`docs/notation/`](../docs/notation/). The digest in
`.github/instructions/notation.instructions.md` loads automatically when you edit HTML,
wiki pages, quiz data, or chart components.

Introducing a new quantity or symbol? Add it to `docs/notation/glossary.md` in the same
commit.

## ⚠️ IMPORTANT: Before Every Push

### 1. Run Tests
Always run `npm test` before pushing. All tests must pass.

### 2. Add Tests for Bug Fixes
When fixing a non-UI bug, **always add a test** that would have caught the bug. This prevents regressions.

### 3. Bump the Cache Version
Before pushing ANY changes, update the version number in **two places**:

**File: `sw.js` (line 2)**
```javascript
const CACHE_NAME = 'deco-theory-0.0.1';  // ← Increment this (0.0.1 → 0.0.2 → 0.0.3...)
```

**File: `css/styles.css` (search for `.version-number::after`)**
```css
.version-number::after {
    content: "0.0.1";  /* ← Keep in sync with sw.js */
}
```

### 2. Why This Matters
- The service worker uses `CACHE_NAME` to detect updates
- If you don't bump the version, users won't get the new code
- The footer version helps users confirm they have the latest version

## Wiki Documentation (CRITICAL)

The developer wiki lives in `wiki/` and must be **manually pushed** to `decojs.wiki.git` — it is never synced automatically. When you change a core algorithm file, update the corresponding wiki page so file:line citations, equations, and signatures stay accurate. A drifted wiki is worse than no wiki.

| Source file | Wiki pages to review |
|---|---|
| `js/decoModel.js` (barrel) + `js/deco/*.js` | `Model-02-Haldane-Equation.md`, `Model-03-Schreiner-Equation.md`, `Model-04-M-Values.md`, `Model-05-Gradient-Factors.md`, `Algo-01-Ascent-Simulation.md` through `Algo-06-Ceiling-Time-Series.md`, `Module-Reference.md` |
| `js/tissueCompartments.js` | `Model-01-Compartments.md`, `Module-Reference.md` |
| `js/diveSetup.js` | `Algo-05-Multi-Gas-Switching.md`, `Module-Reference.md`, `Extending-DecoJS.md` |
| `tests/*` | `Validation-and-Testing.md` (test count, scenario coverage) |

Treat any change to an exported function signature, an equation, or a numerical constant as a wiki change. Worked examples in the Model chapters use specific numbers — re-verify them if you change underlying constants or formulas.

## Adding a New Quiz

1. Create `data/quiz-{name}.json`
2. Create `quiz-{name}.html` (copy existing quiz page as template)
3. Add to `NAV_ITEMS` submenu in `js/nav.js`
4. Add topic tile to `index.html`
5. Add both files to `STATIC_ASSETS` array in `sw.js`
6. Bump version

### Quiz JSON Format
```json
{
  "title": "Quiz Title",
  "description": "Description",
  "questions": [
    {
      "id": 1,
      "category": "category-slug",
      "question": "Question text?",
      "options": [
        { "key": "a", "text": "Option A" },
        { "key": "b", "text": "Option B" }
      ],
      "correct": "a",
      "explanation": "Why A is correct..."
    }
  ]
}
```

## PWA Structure

| File | Purpose |
|------|---------|
| `manifest.json` | App metadata (name, icons, start URL) |
| `sw.js` | Service worker - caches files for offline use |
| `icons/` | App icons in various sizes (SVG) |

## Key Configuration

### GitHub Pages Paths
Since the app runs at `/decojs/` (not root), manifest uses absolute paths:
```json
"start_url": "/decojs/index.html",
"scope": "/decojs/"
```

### Files Cached for Offline
All static assets are listed in `sw.js` → `STATIC_ASSETS` array.
If you add new files, add them to this array.

## Update Behavior

| What Changes | Auto-updates? | Notes |
|--------------|---------------|-------|
| HTML, CSS, JS | ✅ Yes | Requires version bump in sw.js |
| JSON data files | ✅ Yes | Requires version bump in sw.js |
| manifest.json start_url | ❌ No | Requires user to uninstall/reinstall |
| manifest.json scope | ❌ No | Requires user to uninstall/reinstall |
| App name | ❌ No | Requires user to uninstall/reinstall |

## Testing PWA Locally

Use the **Live Server** VS Code extension (already installed) - just right-click on any HTML file and select "Open with Live Server".

Note: Service workers require HTTPS in production, but work on localhost for testing.

## Chart Standards

### Fullscreen Support
**All charts MUST include a fullscreen toggle button.** Use this pattern:

**HTML Structure:**
```html
<section class="chart-section">
    <div class="chart-header">
        <h2>📈 Chart Title</h2>
        <button id="fullscreen-btn" class="btn btn-small btn-icon" title="Fullscreen">
            <span class="fullscreen-icon">⛶</span>
            <span class="fullscreen-text">Fullscreen</span>
        </button>
    </div>
    <div class="chart-container" id="chart-container">
        <canvas id="chart-canvas"></canvas>
        <button id="exit-fullscreen-btn" class="btn btn-fullscreen-close" title="Exit Fullscreen">✕</button>
    </div>
</section>
```

**JavaScript (add to page script):**
```javascript
// Fullscreen controls
const chartContainer = document.getElementById('chart-container');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');

function toggleFullscreen() {
    const isFullscreen = chartContainer.classList.toggle('fullscreen');
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    if (chartInstance) {
        setTimeout(() => chartInstance.resize(), 50);
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
exitFullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartContainer.classList.contains('fullscreen')) {
        toggleFullscreen();
    }
});
```

The CSS styles for `.chart-header`, `.chart-container.fullscreen`, and `.btn-fullscreen-close` are already defined in `css/styles.css`.
