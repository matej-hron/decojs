# Decompression Theory - Interactive Learning

An educational web application for understanding decompression models used in scuba diving. Visualize how inert gases dissolve into body tissues during a dive and how they're released during ascent.

**Live:** [https://decotheory.eu](https://decotheory.eu)

## Disclaimer

**Educational Use Only** — This tool is NOT intended for real dive planning. Never use this for actual dives. Always use certified dive computers, tables, and proper training.

## Features

- **Interactive Dive Planner (Sandbox)** — Full-featured dive planning with real-time chart updates
- **DiveSetupEditor component** — Configure gases, waypoints, gradient factors, and more
- **DiveProfileChart** — Time-based visualization with depth, pressure, partial pressures, ceiling, and tissue loading
- **MValueChart** — Pressure-pressure diagram with animated tissue trails and timeline playback
- **Educational Theory Pages** — Learn about pressure, tissue loading, M-values, and gradient factors with interactive examples
- **Knowledge Quizzes** — 6 quiz modules with 600+ questions from official CMAS/SPČR exam materials
- **Bühlmann ZH-L16 model** — Industry-standard decompression algorithm with A/B/C variants
- **Gradient Factor support** — GF Low/High conservatism settings with visual comparison
- **Mobile-friendly PWA** — Responsive design with offline support

## Structure

| Section | Description |
|---------|-------------|
| **Sandbox** | Interactive dive planner with DiveProfileChart and MValueChart |
| **Theory** | Educational pages: Pressure & Depth, Tissue Loading, M-Values, Gradient Factors |
| **Tests** | Physics, Anatomy, Accidents, Safety Guidelines, Training Guidelines, Equipment quizzes |

## Tech Stack

- **Pure HTML/CSS/JS** — No build tools, static hosting ready (GitHub Pages)
- **Chart.js** — Interactive dive profile and M-value charts
- **KaTeX** — Mathematical formula rendering
- **ES Modules** — Clean modular architecture
- **PWA** — Service worker for offline support

## Project Structure

```
decojs/
├── index.html              # Landing page
├── about.html              # About page with author info
├── sandbox/
│   └── index.html          # Main dive planner (Sandbox)
├── pressure.html           # Theory: Pressure & Depth
├── tissue-loading.html     # Theory: Tissue Loading
├── m-values.html           # Theory: M-Values
├── gradient-factors.html   # Theory: Gradient Factors
├── quiz-physics.html       # Quiz: Physics
├── quiz-anatomy.html       # Quiz: Anatomy
├── quiz-accidents.html     # Quiz: Accidents
├── quiz-safety.html        # Quiz: Safety Guidelines (Czech)
├── quiz-training.html      # Quiz: Training Guidelines (Czech)
├── quiz-equipment.html     # Quiz: Equipment (Czech)
├── css/
│   └── styles.css          # All styles (CSS variables, responsive)
├── js/
│   ├── decoModel.js        # Core decompression calculations
│   ├── diveSetup.js        # Dive setup parsing and normalization
│   ├── quiz.js             # Quiz engine
│   ├── nav.js              # Shared navigation component
│   ├── charts/
│   │   ├── DiveProfileChart.js  # Reusable depth/time chart component
│   │   ├── MValueChart.js       # Reusable M-value chart component
│   │   └── chartTypes.js        # Shared types and validation
│   └── components/
│       └── DiveSetupEditor.js   # Reusable dive setup editor
├── data/
│   ├── dive-profiles.json  # Preset dive profiles
│   ├── dive-setup.json     # Default dive setup
│   └── quiz-*.json         # Quiz question banks
└── tests/
    └── run-tests.mjs       # Test suite (174 tests)
```

## Core Algorithm

The decompression model uses:

- **Haldane Equation** — For constant depth segments:
  ```
  P_tissue(t) = P_alveolar + (P_initial - P_alveolar) × e^(-kt)
  ```

- **Schreiner Equation** — For linear depth changes (descent/ascent):
  ```
  P_tissue(t) = P_alveolar + R(t - 1/k) - (P_alveolar - P_initial - R/k) × e^(-kt)
  ```

Where `k = ln(2) / half-time` is the tissue rate constant.

### Compartments

16 theoretical compartments with N₂ half-times ranging from ~4-5 to 635 minutes (ZH-L16A variant). These are mathematical constructs fit to experimental data, not literal anatomical tissues.

### Gradient Factor Interpolation (pAnchor-based)

The implementation uses pAnchor-based GF interpolation, which is the correct approach per Baker's original gradient factor paper. During ascent, the active GF is interpolated from pAnchor to surface, not from bottom depth.

## Development

```bash
# Serve locally (or use VS Code Live Server)
python3 -m http.server 8080

# Run tests
npm test
```

## Author

**Matej Hron** — CMAS I** instructor at [Deepblue diving club](https://deepblue.cz)

- [matej.hron@gmail.com](mailto:matej.hron@gmail.com)
- [LinkedIn](https://www.linkedin.com/in/matejhron/)
- [GitHub](https://github.com/matej-hron/decojs)

## References

- **Powell, Mark.** *Deco for Divers.* — The primary inspiration for this project
- **Jahns, Jan.** *Fyzika.* — Comprehensive diving physics for Czech divers
- Bühlmann, A.A. (1984). *Decompression–Decompression Sickness*
- [Wikipedia: Bühlmann decompression algorithm](https://en.wikipedia.org/wiki/B%C3%BChlmann_decompression_algorithm)

## Acknowledgments

Special thanks to **Mark Powell** for writing *Deco for Divers* — the book that made decompression theory click and inspired this project.

Built with the help of **Claude** (Anthropic).

## License

MIT
