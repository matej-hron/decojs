# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
DecoJS is an educational PWA for scuba diving decompression theory, implementing the Bühlmann ZH-L16 algorithm with interactive visualizations.

**Live at:** https://decotheory.eu

## Development Commands

```bash
npm test              # Run all 208 tests - MUST pass before commits
npm run test:watch    # Watch mode for development
```

**Local development:** Use VS Code Live Server extension (port 5500)

## Before Every Commit (CRITICAL)

1. Run `npm test` - all tests must pass
2. Bump version in TWO files:
   - `sw.js` line 2: `const CACHE_NAME = 'deco-theory-X.X.XX'`
   - `css/styles.css`: search `.version-number::after` and update content
3. If a core algorithm file changed, update the wiki (see below)

## Wiki Documentation (CRITICAL)

The developer wiki lives in `wiki/` (mirrored to the GitHub wiki). When you change a core algorithm file, update the corresponding wiki page so file:line citations, equations, and signatures stay accurate. A drifted wiki is worse than no wiki.

| Source file | Wiki pages to review |
|---|---|
| `js/decoModel.js` | `Model-02-Haldane-Equation.md`, `Model-03-Schreiner-Equation.md`, `Model-04-M-Values.md`, `Model-05-Gradient-Factors.md`, `Algo-01-Ascent-Simulation.md` through `Algo-06-Ceiling-Time-Series.md`, `Module-Reference.md` |
| `js/tissueCompartments.js` | `Model-01-Compartments.md`, `Module-Reference.md` |
| `js/mvalues.js` | `Model-04-M-Values.md`, `Module-Reference.md` |
| `js/diveSetup.js` | `Algo-05-Multi-Gas-Switching.md`, `Module-Reference.md`, `Extending-DecoJS.md` |
| `tests/*` | `Validation-and-Testing.md` (test count, scenario coverage) |

Treat any change to an exported function signature, an equation, or a numerical constant as a wiki change. Worked examples in the Model chapters use specific numbers — re-verify them if you change underlying constants or formulas.

## Architecture

**No build tools** - Pure ES Modules loaded directly by browser.

### Three Main Parts

1. **Sandbox** (`sandbox/index.html`)
   - Interactive dive planner where users freely simulate dives
   - Three components: DiveSetupEditor → produces JSON → feeds two charts
   - Components: `DiveProfileChart`, `MValueChart`, `DiveSetupEditor`

2. **Theory** (pressure.html, tissue-loading.html, m-values.html, gradient-factors.html)
   - Educational pages explaining decompression concepts
   - Embed chart components to demonstrate examples
   - Each example links to Sandbox with same dive setup ("Open in Sandbox →")

3. **Tests** (quiz-*.html)
   - Official SPČR (Czech CMAS) exam questions made interactive
   - Generic quiz engine with category filtering and scoring

### Core Modules
- `js/decoModel.js` - Haldane/Schreiner equations, M-value calculations
- `js/tissueCompartments.js` - ZH-L16 compartment data (A/B/C variants)
- `js/diveSetup.js` - Gas presets, profile generation
- `js/quiz.js` - Generic quiz engine

### Reusable Components
- `js/charts/DiveProfileChart.js` - Depth/time with deco stops, ceilings, gas switches
- `js/charts/MValueChart.js` - P-P diagram with tissue loading visualization
- `js/components/DiveSetupEditor.js` - Form UI for dive configuration

### Navigation
- `js/nav.js` - Centralized `NAV_ITEMS` array, handles subdirectory paths

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

## Current Content

**Theory pages (English):** Pressure, Tissue Loading, M-Values, Gradient Factors

**Quizzes (Czech - CMAS/SPČR 2018 exams):**
- Physics, Anatomy, Accidents, Safety, Training, Equipment, Vessel
- 7 quizzes, 650+ questions total

## Notation (CRITICAL)

Physical quantities follow ČSN EN ISO 80000-1 and Czech typographic convention. Full rules
in [`docs/notation/`](docs/notation/): `glossary.md` (which symbol for what),
`style-guide.md` (why), `authoring.md` (how to type it).

These five are repeated here because Claude Code does not load
`.github/instructions/notation.instructions.md` — VS Code Copilot and the coding agent do.
Keep the two lists identical.

1. **Quantity symbol italic, unit upright.** `<var>p</var><sub>celk</sub>`, `bar` never italic.
2. **`&nbsp;` between number and unit.** Correct: `20&nbsp;m`; ✗ never `20m`, `20 m`, nor `&#8239;`/U+202F.
3. **Decimal comma in Czech content.** Correct: `2,81&nbsp;bar`; ✗ never `2.81 bar`.
4. **Pressure is lowercase *p*.** Partial pressure *p*<sub>O₂</sub>, not `ppO2`.
5. **Multi-letter abbreviations upright.** GF, MOD, NDL, SAC, OTU.

Introducing a new quantity or symbol? Add it to `docs/notation/glossary.md` in the same
commit. A glossary that has fallen behind is worse than none.

## Key Conventions

- Quizzes use Czech with proper diacritics (háčky, čárky)
- Theory pages in English
- CSS variables in `:root` for theming
- JSDoc comments for public functions
- Bug fixes should include regression tests

## Known Limitations / Roadmap

- **Repetitive dives disabled** - DiveSetupEditor supports multi-dive (`showMultiDive` option) but charts only render `dives[0]`. Full support requires: chaining tissue simulation across dives, surface interval off-gassing, continuous timeline rendering. Feature is on roadmap but not critical.
