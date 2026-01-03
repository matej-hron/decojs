# Decompression Theory - Interactive Learning

An educational web application for understanding decompression models used in scuba diving. Visualize how inert gases dissolve into body tissues during a dive and how they're released during ascent.

🔗 **Live Demo:** [https://matej-hron.github.io/decojs/](https://matej-hron.github.io/decojs/)

## ⚠️ Disclaimer

**Educational Use Only** — This tool is NOT intended for real dive planning. Never use this for actual dives. Always use certified dive computers, tables, and proper training.

## Features

- **Interactive Dive Planner (Sandbox)** — Full-featured dive planning with real-time chart updates
- **DiveSetupEditor component** — Configure gases, waypoints, gradient factors, and more
- **DiveProfileChart** — Time-based visualization with depth, pressure, partial pressures, ceiling, and tissue loading
- **MValueChart** — Pressure-pressure diagram with animated tissue trails and timeline playback
- **Educational Theory Pages** — Learn about pressure, tissue loading, and M-values with interactive examples
- **Bühlmann ZH-L16 model** — Industry-standard decompression algorithm
- **Mobile-friendly PWA** — Responsive design with offline support

## Structure

| Section | Description |
|---------|-------------|
| **Sandbox** | Interactive dive planner with DiveProfileChart and MValueChart |
| **Theory** | Educational pages: Pressure & Depth, Tissue Loading, M-Values |
| **Tests** | Physics, Anatomy, and Accidents quizzes |

## Implementation

### Tech Stack

- **Pure HTML/CSS/JS** — No build tools, static hosting ready (GitHub Pages)
- **Chart.js** — Interactive dive profile and M-value charts
- **KaTeX** — Mathematical formula rendering
- **ES Modules** — Clean modular architecture
- **PWA** — Service worker for offline support

### Project Structure

```
decojs/
├── index.html              # Landing page
├── sandbox/
│   └── index.html          # Main dive planner (Sandbox)
├── pressure.html           # Theory: Pressure & Depth
├── tissue-loading.html     # Theory: Tissue Loading
├── m-values.html           # Theory: M-Values
├── quiz-*.html             # Test quizzes
├── css/
│   └── styles.css          # All styles (CSS variables, responsive)
├── js/
│   ├── decoModel.js        # Core decompression calculations
│   ├── diveSetup.js        # Dive setup parsing and normalization
│   ├── tissueCompartments.js # Bühlmann ZH-L16A compartment data
│   ├── charts/
│   │   ├── DiveProfileChart.js  # Reusable depth/time chart component
│   │   ├── MValueChart.js       # Reusable M-value chart component
│   │   └── chartTypes.js        # Shared types and validation
│   └── components/
│       └── DiveSetupEditor.js   # Reusable dive setup editor
└── data/
    ├── dive-profiles.json  # Preset dive profiles
    └── dive-setup.json     # Default dive setup
```

### Core Algorithm

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

## Development

```bash
# Serve locally
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

## References

- **Powell, Mark.** *Deco for Divers.* — The primary inspiration for this project. An excellent, accessible guide to decompression theory for recreational and technical divers.
- Bühlmann, A.A. (1984). *Decompression–Decompression Sickness*
- [Wikipedia: Bühlmann decompression algorithm](https://en.wikipedia.org/wiki/B%C3%BChlmann_decompression_algorithm)
- [Aquatec: Decompression Theory PDF](https://aquatec.wordpress.com/wp-content/uploads/2011/03/decompression-theory.pdf)

## Acknowledgments

Special thanks to **Mark Powell** for writing *Deco for Divers* — the book that made decompression theory click for me and inspired this project. If you want to truly understand what your dive computer is doing, read his book.

Built with the help of **Claude Opus 4.5** (Anthropic) — my AI pair-programming buddy who helped bring this visualization to life. 🤖

## License

MIT
