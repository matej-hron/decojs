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
- **Educational Theory Pages** — Learn about pressure, tissue loading, M-values, and gradient factors with interactive examples
- **Bühlmann ZH-L16 model** — Industry-standard decompression algorithm with A/B/C variants
- **Gradient Factor support** — GF Low/High conservatism settings with visual comparison
- **Mobile-friendly PWA** — Responsive design with offline support

## Structure

| Section | Description |
|---------|-------------|
| **Sandbox** | Interactive dive planner with DiveProfileChart and MValueChart |
| **Theory** | Educational pages: Pressure & Depth, Tissue Loading, M-Values, Gradient Factors |
| **Tests** | Physics, Anatomy, and Accidents quizzes (CMAS/SPČR exam-style) |

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
├── gradient-factors.html   # Theory: Gradient Factors
├── quiz-*.html             # Test quizzes
├── css/
│   └── styles.css          # All styles (CSS variables, responsive)
├── js/
│   ├── decoModel.js        # Core decompression calculations
│   ├── diveSetup.js        # Dive setup parsing and normalization
│   ├── tissueCompartments.js # Bühlmann ZH-L16A/B/C compartment data
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

### Gradient Factor Interpolation (pAnchor-based)

The implementation uses pAnchor-based GF interpolation, which is the correct approach per Baker's original gradient factor paper. During ascent, the active GF is not interpolated from bottom depth to surface, but from pAnchor to surface.

**Key Concepts:**

- **Instantaneous GF** — The current gradient factor for a single tissue:
  ```
  GF_i(P_amb) = (P_t[i] - P_amb) / (M_i(P_amb) - P_amb)
  ```
  Where `P_t[i]` is tissue pressure, `P_amb` is ambient pressure, and `M_i(P_amb)` is the M-value line.

- **Max GF** — The highest instantaneous GF across all 16 compartments:
  ```
  GF_max(P_amb) = max(GF_i(P_amb)) for i = 1..16
  ```

- **pAnchor** — The ambient pressure during ascent where `GF_max` first equals `GF_low`:
  ```
  pAnchor: first P_amb during ascent where GF_max(P_amb) >= GF_low
  ```
  This is found by simulating ascent in 0.1 bar steps from bottom and off-gassing tissues.

- **GF Interpolation** — The active GF is interpolated from pAnchor to surface:
  ```
  GF(P_amb) = GF_low + (GF_high - GF_low) × (pAnchor - P_amb) / (pAnchor - 1.0)
  ```
  - At/below pAnchor: GF = GF_low (no ramping yet)
  - At surface (1.0 bar): GF = GF_high
  - Between: linear interpolation

**Why pAnchor?**

The traditional "bottom-anchored" approach (GF ramp from max depth to surface) is incorrect because:
1. At max depth, the diver may be far from any deco obligation
2. The first stop depth depends on tissue loading, not arbitrary bottom depth
3. pAnchor represents where the diver's leading tissue first reaches the GF_low limit

This implementation matches how dive computers like Shearwater use gradient factors.

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
