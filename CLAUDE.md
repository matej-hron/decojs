# CLAUDE.md - Project Context for Claude Code

## Project: DecoJS - Decompression Theory PWA
Interactive educational tool for scuba diving decompression theory.
Live at: https://matej-hron.github.io/decojs/

## Tech Stack
- Pure HTML/CSS/JavaScript (no build tools)
- Chart.js for visualizations
- PWA with service worker for offline support
- Jest for testing

## Key Commands
- `npm test` - Run tests (MUST pass before commits)
- Use Live Server VS Code extension for local dev

## Before Every Commit
1. Run `npm test`
2. Bump version in `sw.js` (line 2) AND `css/styles.css` (search `.version-number::after`)

## Project Structure
- `/js/` - Core logic (decoModel.js, tissueCompartments.js)
- `/js/charts/` - Reusable chart components
- `/data/` - Quiz JSON files, dive presets
- `/resources/` - Reference materials, source test files
- `/css/styles.css` - All styles

## Quizzes
5 quiz sets (100 questions each) from SPČR 2018 exams:
- Physics, Anatomy, Accidents, Safety Guidelines, Training Guidelines
- JSON format in `/data/quiz-*.json`
- When adding new quiz: update `js/nav.js` AND `index.html` tiles

## Language
- UI: English
- Quiz content: Czech with proper diacritics (háčky, čárky)
