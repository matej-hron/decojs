# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
DecoJS is an educational PWA for scuba diving decompression theory, implementing the Bühlmann ZH-L16 algorithm with interactive visualizations.

**Live at:** https://decotheory.eu

## Development Commands

```bash
npm test              # Run all 174 tests - MUST pass before commits
npm run test:watch    # Watch mode for development
```

**Local development:** Use VS Code Live Server extension (port 5500)

## Before Every Commit (CRITICAL)

1. Run `npm test` - all tests must pass
2. Bump version in TWO files:
   - `sw.js` line 2: `const CACHE_NAME = 'deco-theory-X.X.XX'`
   - `css/styles.css`: search `.version-number::after` and update content

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

## Key Conventions

- Quizzes use Czech with proper diacritics (háčky, čárky)
- Theory pages in English
- CSS variables in `:root` for theming
- JSDoc comments for public functions
- Bug fixes should include regression tests

## Known Limitations / Roadmap

- **Repetitive dives disabled** - DiveSetupEditor supports multi-dive (`showMultiDive` option) but charts only render `dives[0]`. Full support requires: chaining tissue simulation across dives, surface interval off-gassing, continuous timeline rendering. Feature is on roadmap but not critical.
