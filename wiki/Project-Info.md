DecoJS is a browser-based educational tool and dive planner implementing Bühlmann ZH-L16 (variants A/B/C) with Erik Baker gradient factors. It combines three interactive sandboxes, four theory lessons, and seven CMAS/SPČR exam-style quizzes in a single Progressive Web App — no server, no build step, no framework.

- **Live:** https://decotheory.eu
- **Repository:** https://github.com/matej-hron/decojs
- **License:** No `LICENSE` file is currently checked in at the repo root. Treat the source as source-available for study until the author adds an explicit license; contact the author before reuse.

## Three sections

- **Sandbox** (`sandbox/index.html` plus four secondary simulators) — interactive dive planner where users freely configure gases, gradient factors, and a waypoint profile. The editor produces a single JSON dive setup that feeds the dive profile chart, the M-value (P-P) chart, and the instantaneous-GF chart.
- **Theory** (`pressure.html`, `tissue-loading.html`, `m-values.html`, `gradient-factors.html`) — four HTML lessons covering the physics for end-users, embedding the same chart components to demonstrate worked examples. Each example links back to Sandbox with a matching setup.
- **Tests** (`quiz-*.html`) — seven quizzes driven by the official SPČR (Czech CMAS) 2018 exam question banks (physics, anatomy, accidents, safety, training, equipment, vessel), powered by a generic quiz engine with category filters and scoring.

## Running locally

There is no bundler. The project is loaded as ES modules directly by the browser, which means files must be served over HTTP (not `file://`).

```bash
npm install   # only pulls jest for `npm test`; not needed to run the app
```

Serve the repo root with any static server. The convention used in development is the **VS Code Live Server** extension on port 5500 — open any HTML file and "Go Live". Alternatives: `python3 -m http.server 5500`, `npx http-server -p 5500`, or similar. No build step, no watch process.

## Running tests

```bash
npm test
```

This runs `node tests/run-tests.mjs` — a custom zero-dependency test runner with Jest-style `describe`/`test`/`expect`. The suite covers 208 tests across four files:

- `tests/decoModel.test.js` — pressure, Haldane, Schreiner, M-values, GF, ceilings, deco schedule
- `tests/diveSetup.test.js` — gas library, waypoints, MOD, SAC
- `tests/diveProfile.test.js` — profile validation and statistics
- `tests/decotengu-comparison.test.mjs` — 3900 Bühlmann-air scenarios pre-generated from decotengu 0.14.1 as the numerical oracle

See [Validation-and-Testing](Validation-and-Testing.md) for details on tolerances and scenario coverage.

## Before every commit

Bump the version badge so users can see the right version in the footer: edit `css/styles.css` — search for `.version-number::after` and update `content:`.

Run `npm test` — all 208 tests must pass — then commit alongside the feature change.

## Project layout

- `js/` — all application code. Core algorithm in `decoModel.js`, `tissueCompartments.js`, `diveSetup.js`, `diveProfile.js`; UI modules under `js/components/` and `js/charts/`; quiz engine in `quiz.js`; i18n in `i18n.js`; navigation in `nav.js`.
- `tests/` — test runner and four test files plus the 3900-scenario `decotengu-reference.json`.
- `data/` — JSON content: the default `dive-setup.json` and per-topic `quiz-*.json` exam banks.
- `locales/` — `en.json`, `cs.json`, `es.json` translation bundles.
- `css/` — single `styles.css` plus theme tokens; no preprocessor.
- `sandbox/` — sandbox entry points (`index.html`, `tissue-saturation.html`, `transfilling.html`, `cascade-filling.html`, `gas-law.html`).
- `icons/`, `fonts/`, `images/` — app icons (SVG), web fonts (Fraunces + Inter, WOFF2), images.
- Top-level HTML files: landing (`index.html`), four theory lessons, seven quizzes, `about.html`.
- `CNAME` — `decotheory.eu`.

## Deployment

GitHub Pages from the `main` branch, served under the `decotheory.eu` custom domain configured via the `CNAME` file.
