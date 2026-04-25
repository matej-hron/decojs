DecoJS is a browser-based, zero-build implementation of the Bühlmann ZH-L16 decompression algorithm with Erik Baker's gradient factors, packaged as a Progressive Web App. It runs live at [decotheory.eu](https://decotheory.eu); the source is on GitHub at [matej-hron/decojs](https://github.com/matej-hron/decojs).

## Who this wiki is for

Developers reading, modifying, or porting the code. This wiki documents the algorithm as implemented — equations with file:line citations, data flow between modules, and the numerical conventions used. The in-app HTML pages ([pressure.html](https://decotheory.eu/pressure.html), [tissue-loading.html](https://decotheory.eu/tissue-loading.html), [m-values.html](https://decotheory.eu/m-values.html), [gradient-factors.html](https://decotheory.eu/gradient-factors.html)) cover the physics for divers — this wiki does not.

## Contents

**Getting started**

- [Project-Info](Project-Info.md) — install, run, tests, live demo
- [Architecture](Architecture.md) — module graph and no-build philosophy

**Decompression Model** (the math as implemented)

- [Decompression-Model](Decompression-Model.md) — overview and notation
- [Model-01-Compartments](Model-01-Compartments.md) — 16 tissue compartments, variants A/B/C
- [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md) — constant-depth loading
- [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md) — linear-rate loading
- [Model-04-M-Values](Model-04-M-Values.md) — Bühlmann critical supersaturation
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — pAnchor-based GF ramp

**Algorithms** (how DecoJS simulates a dive)

- [Algorithms](Algorithms.md) — overview
- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md)
- [Algo-02-NDL-Calculation](Algo-02-NDL-Calculation.md)
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md)
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md)
- [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md)
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md)

**Reference**

- [Module-Reference](Module-Reference.md) — per-file API walkthrough
- [Validation-and-Testing](Validation-and-Testing.md) — 208 tests, decotengu cross-check
- [Extending-DecoJS](Extending-DecoJS.md) — adding gases, quizzes, variants
- [References](References.md) — bibliography

## How to read

Start with [Architecture](Architecture.md) to orient — it shows the module graph and the no-build ES-module philosophy. Then read the Decompression Model chapters in order; they build up notation and each equation is cited to source. The Algorithms chapters assume the Model chapters and show how DecoJS stitches the equations into a dive simulation. [Module-Reference](Module-Reference.md) is lookup-style — go there when you need the signature or line number for a specific function.
