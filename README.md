# Decompression Theory - Interactive Learning

An educational web application for understanding decompression models used in scuba diving. Visualize how inert gases dissolve into body tissues during a dive and how they're released during ascent.

🔗 **Live Demo:** [https://matej-hron.github.io/decojs/](https://matej-hron.github.io/decojs/)

## ⚠️ Disclaimer

**Educational Use Only** — This tool is NOT intended for real dive planning. Never use this for actual dives. Always use certified dive computers, tables, and proper training.

## Features

- **Interactive dive profile editor** — Define custom dive profiles with time/depth waypoints
- **Real-time tissue loading visualization** — See how nitrogen saturates and desaturates across 16 theoretical compartments
- **Bühlmann ZH-L16 model** — Industry-standard decompression algorithm
- **Educational content** — Beginner-friendly explanations with optional mathematical details
- **Mobile-friendly** — Responsive design with fullscreen chart mode

## Topics

| Topic | Status |
|-------|--------|
| Tissue Loading & Saturation | ✅ Available |
| M-Values & Surfacing Limits | 🔜 Coming Soon |
| Gradient Factors | 🔜 Coming Soon |
| Multi-Gas Diving | 🔜 Coming Soon |

## Implementation

### Tech Stack

- **Pure HTML/CSS/JS** — No build tools, static hosting ready (GitHub Pages)
- **Chart.js** — Interactive tissue loading charts
- **KaTeX** — Mathematical formula rendering
- **ES Modules** — Clean modular architecture

### Project Structure

```
decojs/
├── index.html              # Landing page with topic navigation
├── tissue-loading.html     # Tissue saturation visualization page
├── css/
│   └── styles.css          # All styles (CSS variables, responsive)
└── js/
    ├── main.js             # App entry point, UI logic, state management
    ├── decoModel.js        # Core decompression calculations
    ├── tissueCompartments.js # Bühlmann ZH-L16A compartment data
    ├── diveProfile.js      # Profile parsing, validation, defaults
    └── visualization.js    # Chart.js rendering and interactions
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
