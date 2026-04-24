DecoJS is a browser-based, zero-build implementation of the Bühlmann ZH-L16 decompression algorithm with Erik Baker's gradient factors, packaged as a Progressive Web App. It runs live at [decotheory.eu](https://decotheory.eu); the source is on GitHub at [matej-hron/decojs](https://github.com/matej-hron/decojs).

## Who this wiki is for

Developers reading, modifying, or porting the code. This wiki documents the algorithm as implemented — equations with file:line citations, data flow between modules, and the numerical conventions used. The in-app HTML pages ([pressure.html](https://decotheory.eu/pressure.html), [tissue-loading.html](https://decotheory.eu/tissue-loading.html), [m-values.html](https://decotheory.eu/m-values.html), [gradient-factors.html](https://decotheory.eu/gradient-factors.html)) cover the physics for divers — this wiki does not.

## Contents

**Getting started**

- [[Project-Info]] — install, run, tests, live demo
- [[Architecture]] — module graph, PWA, no-build philosophy

**Decompression Model** (the math as implemented)

- [[Decompression-Model]] — overview and notation
- [[Model-01-Compartments]] — 16 tissue compartments, variants A/B/C
- [[Model-02-Haldane-Equation]] — constant-depth loading
- [[Model-03-Schreiner-Equation]] — linear-rate loading
- [[Model-04-M-Values]] — Bühlmann critical supersaturation
- [[Model-05-Gradient-Factors]] — pAnchor-based GF ramp

**Algorithms** (how DecoJS simulates a dive)

- [[Algorithms]] — overview
- [[Algo-01-Ascent-Simulation]]
- [[Algo-02-NDL-Calculation]]
- [[Algo-03-First-Stop-Ramped-GF]]
- [[Algo-04-Deco-Stop-Loop]]
- [[Algo-05-Multi-Gas-Switching]]
- [[Algo-06-Ceiling-Time-Series]]

**Reference**

- [[Module-Reference]] — per-file API walkthrough
- [[Validation-and-Testing]] — 208 tests, decotengu cross-check
- [[Extending-DecoJS]] — adding gases, quizzes, variants
- [[References]] — bibliography

## How to read

Start with [[Architecture]] to orient — it shows the module graph and the no-build ES-module philosophy. Then read the Decompression Model chapters in order; they build up notation and each equation is cited to source. The Algorithms chapters assume the Model chapters and show how DecoJS stitches the equations into a dive simulation. [[Module-Reference]] is lookup-style — go there when you need the signature or line number for a specific function.

## Credits

DecoJS is the practical component of Matej Hron's CMAS I3 (International Instructor Level 3) thesis. Expert review and endorsement was provided by Ing. Jiří Hovorka, Petr Hruška, and the Training Commission of the Czech Diving Federation (VK SPČR); see [[References#spcr--cmas-endorsers]].

Numerical validation uses Artur Wroblewski's [decotengu](https://wrobell.dcmod.org/decotengu/) as the reference oracle — DecoJS's 3900-scenario comparison suite runs decotengu 0.14.1 output against the JS implementation. Credit for the reference implementation and for the documentation format this wiki is modeled on goes to Artur Wroblewski.
