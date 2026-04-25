## How to cite this wiki

> DecoJS Wiki, Hron M., 2026. https://github.com/matej-hron/decojs/wiki

The underlying source code is archived at https://github.com/matej-hron/decojs and deployed at https://decotheory.eu. Where the code implements a published equation, cite both this wiki (for the implementation) and the original source below (for the equation).

## At a glance

**Cited inline by other wiki pages** — the load-bearing references for DecoJS's algorithm and constants:

- §1.1 — decotengu Decompression Model docs
- §2.1 — Bühlmann *Tauchmedizin* (ZH-L16 source)
- §2.2 — Schreiner & Kelley 1971 (linear-rate uptake equation)
- §2.3 — Workman 1965 (M-values)
- §2.4 — Erik Baker GF articles
- §3 — Mark Powell, *Deco for Divers* (project's intellectual inspiration)
- §4.1 — decotengu (numerical oracle for the test suite)
- §6 — ZH-L16 constant tables

**Further reading** — context, prior art, and orientation for readers going deeper:

- §1.2, §1.3 — decotengu Algorithms and Design pages
- §2.5 — Wienke & O'Leary secondary review
- §4.2 — divetools.app (another web-based deco planner)
- §4.3 — eight other open-source ZH-L16 + GF implementations across Python, C, C++, Java, JavaScript, Kotlin
- §5 — SPČR / CMAS training references and the project's institutional context

## 1. decotengu — reference implementation and documentation model

Project documentation for Artur Wroblewski's `decotengu` (Python 3 Bühlmann ZH-L16 + GF implementation, v0.14.1). Hosted at https://wrobell.dcmod.org/decotengu/.

The sidebar TOC:

- `info.html` — Project Information
- `usage.html` — Using DecoTengu Library
- `cmd.html` — Commandline Tools
- `model.html` — **Decompression Model** (the math)
- `algo.html` — **Algorithms** (ascent, first-stop, stop-length)
- `alt.html` — Alternative Implementations
- `design.html` — **Design** (engine, data model, dive phases, conveyor)
- `api.html` — Classes and Functions (API reference)
- `changelog.html` — Changelog

### 1.1 Decompression Model — https://wrobell.dcmod.org/decotengu/model.html

Sections: Introduction · Parameters · Equations · Calculations · References.

Equations presented symbolically with all variables defined and one worked numerical example per equation:

- **Schreiner equation** for inert-gas tissue uptake under continuously changing ambient pressure:

  `P = P_alv + R·(t − 1/k) − (P_alv − P_i − R/k)·e^(−k·t)`

  with a worked nitrogen-loading example across descent / bottom / ascent.

- **Bühlmann ceiling with gradient factors**:

  `P_l = (P − a·gf) / (gf/b + 1 − gf)`

  plus the trimix extension (weighted `a`, `b` from N₂ and He partial pressures) and the `gf_low` / `gf_high` linear interpolation between first stop and surface.

The rigour level is equation-with-definition-and-numerical-example, no derivation from first principles — the reader is expected to know Haldane. The DecoJS wiki matches this level.

### 1.2 Algorithms — https://wrobell.dcmod.org/decotengu/algo.html

Sections: Ascent to Surface · Finding First Decompression Stop · Finding Length of Decompression Stop.

Presented as numbered pseudocode with conditional branches (NDL vs deco), 3 m rounding of ceilings (`p_l = ceil(p_l/3) · 3`), and a big-O note for stop-length search (`O(n/64 + log n)` via linear pre-range + binary refine). No external citations — algorithms are presented as library-specific design choices.

### 1.3 Design — https://wrobell.dcmod.org/decotengu/design.html

Sections: Core Calculations · Data Model · Dive Phases · Dive Profile Expansion · Tabular Calculator. Covers the `Engine` class orchestrating the `ZH_L16_GF` model; data classes `Step` / `Data` / `GasMix` / `DecoStop`; the six-value `Phase` enum (START, DESCENT, CONST, ASCENT, DECO_STOP, GAS_MIX); the `Conveyor` that expands profiles at fixed time intervals; `TabExp` for precomputed exponentials.

## 2. Academic references

### 2.1 Bühlmann — ZH-L16 / Keller-Bühlmann

**Keller, H.; Bühlmann, A. A.** "Deep diving and short decompression by breathing mixed gases." *Journal of Applied Physiology*, 20(6): 1267–1270, November 1965. https://doi.org/10.1152/jappl.1965.20.6.1267 (Original Keller-Bühlmann multi-gas decompression paper.)

**Bühlmann, A. A.** *Dekompression — Dekompressionskrankheit.* Berlin / Heidelberg / New York: Springer-Verlag, 1983. ISBN 3-540-12514-0. (Original ZH-L12 book, German.)

**Bühlmann, A. A.** *Decompression — Decompression Sickness.* Berlin / New York: Springer-Verlag, 1984. ISBN 0-387-13308-9. (English translation of the 1983 volume.)

**Bühlmann, A. A.** *Tauchmedizin: Barotrauma, Gasembolie, Dekompression, Dekompressionskrankheit.* Berlin: Springer-Verlag, 1992. ISBN 3-540-55581-1 / 978-3-540-55581-0. https://link.springer.com/book/10.1007/978-3-642-97413-7

**This is the canonical ZH-L16 reference — the first edition to publish the 16-compartment A / B / C parameter sets.** DecoJS's compartment constants in `js/tissueCompartments.js` trace back to this book through the chain in §6 below.

**Bühlmann, A. A.** *Tauchmedizin.* 3rd ed. Berlin: Springer-Verlag, 1995. ISBN 3-540-58970-8. https://link.springer.com/book/10.1007/978-3-642-97623-0

**Bühlmann, A. A.; Völlm, E. B.; Nussberger, P.** *Tauchmedizin: Barotrauma · Gasembolie · Dekompression · Dekompressionskrankheit · Dekompressionscomputer.* 5th ed. Berlin: Springer-Verlag, 2002. ISBN 3-540-42979-4 / 978-3-540-42979-1. https://link.springer.com/book/10.1007/978-3-642-55939-6 (Introduces ZH-L8 ADT; still reprints the ZH-L16 tables.)

### 2.2 Schreiner — exponential gas uptake with changing pressure

**Schreiner, H. R.; Kelley, P. L.** "A Pragmatic View of Decompression." In C. J. Lambertsen (ed.), *Underwater Physiology IV: Proceedings of the Fourth Symposium on Underwater Physiology*. New York: Academic Press, 1971, pp. 205–219.

Origin of the linear-rate-of-pressure-change form of the Haldane equation used in iterative dive-computer calculations. This is what "the Schreiner equation" refers to in `decoModel.js:125`.

Secondary reference which derives and discusses the Schreiner form in modern notation: Baker, "Clearing Up The Confusion About 'Deep Stops'" (§2.4) — contains the worked-out Schreiner equation as it appears in most dive-computer source code.

### 2.3 Workman — M-values

**Workman, R. D.** "Calculation of decompression schedules for nitrogen-oxygen and helium-oxygen dives." Research Report 6-65. Washington, D.C.: U.S. Navy Experimental Diving Unit, 26 May 1965. https://pubmed.ncbi.nlm.nih.gov/5295231/ · https://www.semanticscholar.org/paper/eb72db3344bfe9d5bfbc59efe59d68c55bcac6d9

The original U.S. Navy paper that introduced the "M-value" concept — maximum tolerated inert-gas pressure per tissue compartment as a linear function of depth. Foundation on top of which Bühlmann's a / b coefficients were constructed.

### 2.4 Erik Baker — Gradient Factors articles

All three freely distributed PDFs, archived by Shearwater and other outlets. No formal publication venue; these are the "grey literature" of the GF model, and the central reference for DecoJS's `findGFLowAnchor` / `interpolateGF` implementation.

**Baker, Erik C.** "Understanding M-values." 1998. https://www.shearwater.com/wp-content/uploads/2019/05/understanding_m-values.pdf

Explains M-values, surfacing M₀ and slope ΔM, and Bühlmann a/b coefficient derivation from half-time:

- `a = 2 · ht^(−1/3)` (atm)
- `b = 1.005 − ht^(−1/2)` (dimensionless)

**Baker, Erik C.** "Clearing Up The Confusion About 'Deep Stops'." 1998. https://www.shearwater.com/wp-content/uploads/2012/08/Deep-Stops.pdf — mirror: https://citeseerx.ist.psu.edu/document?repid=rep1&type=pdf&doi=eb03802361c6050ec2d0bb250c3db2407602032e

**Introduces Gradient Factors as the mechanism for forcing deeper first stops — this is THE Gradient-Factor paper.** Contains the complete Schreiner equation form used by DecoJS (`decoModel.js:125`).

**Baker, Erik C.** "Oxygen Toxicity Calculations." Sometimes circulated as "Deco Lessons" in the decotengu references. No stable publisher URL; mirrored widely. Used by decotengu as its third Baker reference.

### 2.5 Community secondary review

Worth citing as a readable secondary source that ties Workman, Bühlmann, Schreiner, and Baker together:

**Wienke, B. R.; O'Leary, T. R.** "Reduced Gradient Bubble Model in Depth." In *Decompression Modelling and Algorithm* (Springer chapter). https://link.springer.com/chapter/10.1007/978-3-030-96921-9_5

## 3. Mark Powell — *Deco for Divers*

**Powell, Mark.** *Deco for Divers: A Diver's Guide to Decompression Theory and Physiology.*

- 1st edition: AquaPress, 2008. ISBN-10 1-905492-07-3 / ISBN-13 978-1-905492-07-7. https://www.amazon.com/dp/1905492073
- 2nd / revised edition: AquaPress Ltd, 15 December 2014. ISBN-13 978-1-905492-29-9. https://www.amazon.com/dp/1905492294
- Internet Archive copy (1st ed.): https://archive.org/details/decofordivers0000mark

Cited by the DecoJS README as the **primary inspiration for the project**. Powell is a senior TDI instructor-trainer and one of the most widely cited popular-education authorities on Bühlmann + GFs.

## 4. Open-source prior art

### 4.1 decotengu — primary reference implementation

- Project: https://wrobell.dcmod.org/decotengu/
- Source (mirror): https://gitlab.com/wrobell/decotengu · also on PyPI as `decotengu`
- Language: Python 3
- License: GPL-3.0
- Approach: Bühlmann ZH-L16 A/B/C with Erik Baker gradient factors; Schreiner iteration for inert-gas loading; decompression stops located by iteratively finding the shallowest depth at which the tissue ceiling (GF-adjusted) is not violated; stop duration found by linear search + binary refinement. OC air / nitrox / trimix supported.

**DecoJS relationship:** used as the numerical oracle. DecoJS matches decotengu 0.14.1 exactly on 83.8 % of the 160 Bühlmann-air reference scenarios and within ±1 min on 100 %. See [Validation-and-Testing](Validation-and-Testing.md#decotengu-cross-check).

### 4.2 divetools.app

Browser-based dive-planning tool covering Bühlmann ZH-L16 with gradient factors, OC and CCR planning, multi-level profiles, trimix, ppO₂ / CNS / OTU tracking, gas mixer, MOD / EAD / END.

- URL: https://divetools.app/

### 4.3 Additional open-source implementations worth cross-referencing

Verified GitHub projects implementing ZH-L16 + GF, in several languages. Useful as additional numerical sanity checks and for readers wanting reference code in their preferred language.

- **Subsurface** — https://subsurface-divelog.org/ · source https://github.com/subsurface/subsurface · GPL-2.0 · C++ / Qt. Dive log + planner co-founded by Linus Torvalds; ships its own Bühlmann ZH-L16B + Baker GF planner (`core/planner.c`, `core/deco.c`). One of the most-used OSS deco engines in the wild.
- **dipplanner** — https://github.com/ThomasChiroux/dipplanner · Python · GPL-3.0. Bühlmann ZH-L16B/C + GF; OC & CCR; trimix. Long-lived reference project, predates decotengu.
- **pydplan** — https://github.com/eianlei/pydplan · Python 3 / PyQt5. Intended for learning and understanding how the Bühlmann algorithm works; educational cousin of DecoJS in Python.
- **guyfleeman/libbuhlmann** — https://github.com/guyfleeman/libbuhlmann · C++ · ZH-L16C + GF. Header-only static implementation.
- **AquaBSD/libbuhlmann** — https://github.com/AquaBSD/libbuhlmann · C · Bühlmann lib.
- **Jens-Horstmann/Buhlmann-ZHL-16** — https://github.com/Jens-Horstmann/Buhlmann-ZHL-16 · Java / Maven · ZHL-16 + GF for OC.
- **oliverjohnstone/npm-buhlmann-ZH-L16** — https://github.com/oliverjohnstone/npm-buhlmann-ZH-L16 · JavaScript (npm). Closest peer to DecoJS in language terms.
- **NeoTech-Software/Abysner** — https://github.com/NeoTech-Software/Abysner · Kotlin Multiplatform (Android/iOS) · open-source dive & decompression planner.
- **dmaziuk/diy-zhl** — https://github.com/dmaziuk/diy-zhl · Python notebooks demonstrating Bühlmann decompression.
- **HeinrichsWeikamp OSTC firmware** — https://bitbucket.org/heinrichsweikamp/ostc2_code · open-source firmware of the OSTC dive computer, cited by decotengu. Primary-source implementation of Bühlmann + GF in production hardware.

## 5. SPČR / CMAS training references

> See the project's **"Expert review"** section in `about.html` (rendered at https://decotheory.eu/about.html) for the endorsement context.

SPČR = **Svaz potápěčů České republiky**, the Czech diving federation and CMAS national-federation seat for the Czech Republic. DecoJS is the practical component of Matej Hron's CMAS I3 (International Instructor Level 3) thesis.

### 5.1 SPČR official sites

- **https://www.cmas.cz/** — SPČR main site (CMAS ČR).
- **https://www.cmas.cz/stranka-pro-instruktory-55** — "Pro instruktory" (For Instructors). Downloadable PDFs include *Výcvikové směrnice SPČR 2016* (Training Guidelines), *Bezpečnostní směrnice SPČR 2016* (Safety Guidelines), *Jak se stát instruktorem* (How to become an instructor), *CMAS Trimix Blender výcviková směrnice SPČR*, and instructor qualification extension / pricing lists. No dedicated decompression-theory PDF is directly linked — deco theory is delivered through the instructor courses and the SPČR 100-question exam bank, not a standalone PDF.
- **https://www.cmas.cz/stranka-archiv-53** — Archive of Training Commission (VK SPČR) meeting minutes and instructor-project documents (2012–).
- **https://www.cmas.cz/mapa-cmas-a-spcr-76** — "CMAS and SPČR" — explains the federation / international-body relationship.

### 5.2 SPČR / CMAS exam banks

Source for the DecoJS quizzes:

- **SPČR 2018 exam questions** — official CMAS ČR examinations (Physics, Anatomy, Accidents, Safety, Training, Equipment, Vessel). Digitised into DecoJS's `data/quiz-*.json`. The canonical printed / PDF version is distributed by SPČR VK to candidates — not publicly downloadable on cmas.cz.
- **Strany potápěčské** — https://www.stranypotapecske.cz/kurzy/syskval.asp?sys=CMAS — independent Czech summary of the CMAS qualification system.

### 5.3 CMAS international

- **Instructor Manual** — https://archives.cmas.org/technique/cmas-instructor-manual
- **International Diver Training Standards and Procedures Manual** — https://archives.cmas.org/document?fileId=4157&language=1
- **Training standards index** — https://www.cmas.org/standards.html
- **Bühlmann ZH-L fact sheet (CMAS)** — https://www.cmas.org/fact-sheets/b%C3%BChlmann-zh-l-eng.html (CMAS's own endorsed reference for the ZH-L family.)

### 5.4 SPČR / CMAS endorsers

Per `about.html` "Expert review" section:

- **Ing. Jiří ("Jirka") Hovorka** — SPČR technical instructor; reviewed and endorsed DecoJS. Source of the in-app Gradient-Factor reference table.
- **Petr Hruška** — SPČR / CMAS instructor; further endorser.
- **Výcviková komise SPČR (VK SPČR)** — the SPČR Training Commission, institutional endorser.

## 6. ZH-L16 constant tables

Primary (paper) source for the constants is **Bühlmann 1992 *Tauchmedizin*** (§2.1); this is the book in which the 16-compartment A / B / C coefficient sets were first published. For citing in a wiki without access to the book, the accepted substitute sources are:

1. **Baker, E. "Understanding M-values."** https://www.shearwater.com/wp-content/uploads/2019/05/understanding_m-values.pdf — reprints the full ZH-L16A half-times and a / b values and derives them from the half-time formulas `a = 2·ht^(−1/3)`, `b = 1.005 − ht^(−1/2)`. **This is the de-facto open reference most OSS projects cite**, including decotengu. The DecoJS wiki cites Baker here.

2. **Wikipedia — Bühlmann decompression algorithm.** https://en.wikipedia.org/wiki/B%C3%BChlmann_decompression_algorithm — contains a full ZH-L16C parameter table (half-times and a / b for both N₂ and He, all 16 compartments), citing Bühlmann 1984 / 1992 / 1995 / 2002 as primary sources. Useful as a quick-lookup reference but should not be the sole citation.

3. **dive-tables.com** — https://dive-tables.com/buhlmann-en — independent reprint of ZH-L16A/B/C tables side-by-side with a clear GF explanation.

4. **CMAS fact sheet** — https://www.cmas.org/fact-sheets/b%C3%BChlmann-zh-l-eng.html — CMAS-endorsed short summary.

5. **HeinrichsWeikamp OSTC firmware source** — https://bitbucket.org/heinrichsweikamp/ostc2_code — primary-source-style reference: the ZH-L16 constants as actually shipped in production dive-computer firmware. decotengu cites this for cross-check.

**Variant letter meaning:**

- **A** = Experimental (mathematically derived from half-times; found empirically not conservative enough in middle compartments).
- **B** = Printed tables (slightly more conservative; used for table calculations).
- **C** = Dive computers (most conservative; used for in-water computers).

DecoJS's defaults follow **ZH-L16C** — aligned with decotengu — see `js/tissueCompartments.js`.

**Numerical provenance chain:**

> DecoJS constants ≈ decotengu ≈ OSTC firmware ≈ Baker (1998 derivation) ≈ Bühlmann 1992 *Tauchmedizin*.

This chain is what the alignment in commits `ff06756` and `7f985da` established; it is the warrant for calling DecoJS's output a correct implementation of Bühlmann ZH-L16C.

---

*References last verified 2026-04-24.*
