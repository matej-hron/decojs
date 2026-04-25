# Decompression Theory — Interactive Learning

An educational web application for understanding decompression models used in scuba diving. Visualize how inert gases dissolve into body tissues during a dive and how they are released during ascent.

**Live:** [https://decotheory.eu](https://decotheory.eu)

## Disclaimer

**Educational use only** — this tool is **not** intended for real dive planning. Never use it for actual dives. Always use certified dive computers, tables, and proper training.

## Features

- **Interactive Dive Planner (Sandbox)** — full-featured dive planning with live chart updates as you edit gases, gradient factors, and waypoints.
- **Three coordinated charts** — `DiveProfileChart` (depth/time with deco stops, ceilings, gas switches), `MValueChart` (P-P diagram with tissue trail and timeline playback), and `GFChart` (instantaneous gradient factor per compartment).
- **Theory pages** — Pressure & Depth, Tissue Loading, M-Values, Gradient Factors. Each lesson embeds the same chart components used in the sandbox so worked examples stay live.
- **Quizzes** — 7 modules covering Physics, Anatomy, Accidents, Safety Guidelines, Training Guidelines, Equipment, and Vessel; 650+ questions sourced from CMAS / SPČR exam materials.
- **Bühlmann ZH-L16** — variants A / B / C (default C), with Erik Baker gradient factors.
- **Multi-gas** — air, nitrox, and oxygen deco mixes with automatic MOD-based switching.
- **Multilingual** — English, Czech, Spanish.
- **Responsive** — works on phone, tablet, and desktop.

## Sections

| Section | Description |
|---------|-------------|
| **Sandbox** | Main dive planner plus four supporting simulators (tissue saturation, transfilling, cascade filling, gas law). |
| **Theory** | Pressure & Depth, Tissue Loading, M-Values, Gradient Factors. |
| **Tests** | Seven CMAS / SPČR quiz topics. |

## Tech stack

- **Pure HTML / CSS / ES Modules** — no build tools, no transpiler, no bundler.
- **Chart.js** for all dive-profile and tissue-loading visualisations.
- **KaTeX** for math rendering on theory pages.
- **GitHub Pages** for hosting at `decotheory.eu`.

## Project layout

```
decojs/
├── index.html, about.html
├── pressure.html, tissue-loading.html, m-values.html, gradient-factors.html
├── quiz-{physics,anatomy,accidents,safety,training,equipment,vessel}.html
├── sandbox/
│   ├── index.html               # Main dive planner
│   ├── tissue-saturation.html
│   ├── transfilling.html
│   ├── cascade-filling.html
│   └── gas-law.html
├── js/
│   ├── decoModel.js             # Schreiner / Haldane / M-value / GF / deco scheduling
│   ├── tissueCompartments.js    # ZH-L16 A / B / C constants
│   ├── mvalues.js               # M-value diagram
│   ├── diveSetup.js             # Gas presets, profile generation, multi-gas switching
│   ├── diveProfile.js           # Profile validation
│   ├── tissueEducation.js       # Theory-page interactive animations
│   ├── i18n.js                  # Translation loader (en, cs, es)
│   ├── nav.js                   # Shared nav and NAV_ITEMS
│   ├── quiz.js                  # Generic quiz engine
│   ├── charts/                  # DiveProfileChart, MValueChart, GFChart, helpers
│   └── components/              # DiveSetupEditor, TissueSaturationSim, page chrome
├── data/
│   ├── dive-setup.json, dive-profiles.json
│   └── quiz-*.json              # Per-topic exam banks
├── locales/                     # en.json, cs.json, es.json
├── css/styles.css
├── tests/                       # 208 tests + decotengu reference data
└── wiki/                        # Developer documentation (mirrored to GitHub Wiki)
```

## Core algorithm

DecoJS implements the Bühlmann ZH-L16 model with 16 tissue compartments and Erik Baker's gradient factors. Inert-gas loading uses the **Schreiner equation** during depth changes and the **Haldane equation** at constant depth. M-values follow the Bühlmann linear form `M(P) = a + P / b`. Gradient factor interpolation is anchored at `pAnchor` — the ambient pressure at which `GF_max` across the 16 compartments first equals `GF_low` during a simulated free ascent. This is the Baker-intended ramp; many naïve implementations ramp from first-stop depth instead.

For the full developer reference — per-equation citations, file:line references, algorithm chapters, module API — see the **[wiki](https://github.com/matej-hron/decojs/wiki)**.

## Development

```bash
npm install            # only needed for `npm test`
npm test               # 208 tests, must pass before commits
```

Local development uses any static HTTP server; the project is loaded as ES modules directly by the browser. The convention is the **VS Code Live Server** extension on port 5500. Alternatives: `python3 -m http.server 5500`, `npx http-server -p 5500`.

See `CLAUDE.md` for the full commit checklist (including the wiki-update rule when core algorithm files change).

## Author

**Matej Hron** — CMAS I** instructor at [Deepblue diving club](https://deepblue.cz)

- [matej.hron@gmail.com](mailto:matej.hron@gmail.com)
- [LinkedIn](https://www.linkedin.com/in/matejhron/)
- [GitHub](https://github.com/matej-hron/decojs)

## References

- Powell, Mark. *Deco for Divers* — primary inspiration for this project.
- Jahns, Jan. *Fyzika* — comprehensive diving physics for Czech divers.
- Bühlmann, A. A. *Tauchmedizin*, Springer, 1992 — canonical ZH-L16 source.
- Baker, Erik C. "Understanding M-values" / "Clearing Up The Confusion About 'Deep Stops'" (1998).
- Full bibliography on the [wiki References page](https://github.com/matej-hron/decojs/wiki/References).

## Acknowledgments

Special thanks to **Mark Powell** for writing *Deco for Divers* — the book that made decompression theory click and inspired this project.

Built with the help of **Claude** (Anthropic).

## License

MIT
