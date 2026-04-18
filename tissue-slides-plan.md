# Tissue Loading & Saturation -- Slide Breakdown Plan

## Summary

The current tissue-loading.html has **13 sections** mapped to 13 slides. After analysis, the optimal split is **20 slides** (from 13). This follows the same pattern used successfully in pressure.html, where 8 original sections became 16 slides.

### Design Principles (from pressure.html)
1. **One visual anchor per slide** -- chart, table, diagram, formula, or exercise
2. **Billboard text** -- 3-second glance, bold the key phrase
3. **2-3 minutes per slide** -- enough for the presenter to explain one concept
4. Each slide should answer: "What ONE thing does the audience learn here?"

### Sections that stay as-is (7 of 13)
| # | Section ID | Reason |
|---|-----------|--------|
| 1 | `deco-theory` | Short intro, single concept card -- fits one slide perfectly |
| 3 | `gas-exchange` | One visual anchor (SVG pathway diagram with toggle). Dense but unified by the diagram |
| 5 | `critical-supersaturation` | Short warning card, single concept. Already split from saturation dynamics |
| 9 | `tissue-heterogeneity` | Concise bullet list, one concept (why tissues differ). No split needed |
| 12 | `tissue-chart-section` | Chart-only slide. Perfect as-is |
| 13 | `reference-table` | Table-only slide. Perfect as-is |
| 7 | `half-time-math` | Three formulas in one "math reference" card. Presenters can walk through them sequentially; splitting would lose the comparison value |

### Sections to split (6 of 13 -> 13 slides)
| Original | Splits into | Slides |
|----------|------------|--------|
| `henrys-law` | Henry's Law concept + Solubility Table | 2 |
| `saturation-dynamics` | Descent + At Depth + Ascent | 3 |
| `half-time-concept` | Definition + Pressure Gradient Effect | 2 |
| `half-time-charts` | On-gassing chart + Off-gassing chart | 2 |
| `buhlmann-compartments` | Compartments intro + Controlling compartment | 2 |
| `zhl16-variants` | Variant comparison (single slide but with stronger slide-text) | stays 1, but gets better slide-text |

Wait -- `zhl16-variants` actually works as one slide because the 3 variant cards form a unified comparison. Keep it.

**Final total: 7 unchanged + 11 from splits + 2 (buhlmann) = 20 slides**

---

## Slide-by-Slide Plan

### Slide 1: Why Does This Matter?
**Content from**: section `#deco-theory` (entire section)
**Key visual**: Warning concept card about DCS
**Slide-text EN**: "Nitrogen dissolves into your tissues under pressure. Ascend too fast and it forms **bubbles -- decompression sickness**."
**Slide-text CZ**: "Dusik se pod tlakem rozpousti ve tkanich. Vystoupate-li prilis rychle, tvori **bubliny -- dekompresni nemoc**."
**What to show**: The existing concept-card paragraph. No changes needed.
**Presenter notes**: Set the stage. This is the "why" of the entire chapter. Mention that everything that follows explains HOW this happens and how we MODEL it mathematically. Connect to the previous chapter (pressure) -- we learned about gas physics, now we see what it does to the body.

---

### Slide 2: Henry's Law -- The Soda Bottle
**Content from**: section `#henrys-law`, first half (through the O2/hemoglobin bullets and the N2 paragraph)
**Key visual**: The soda bottle analogy text + the concept that O2 is consumed/bound so N2 is the problem
**Slide-text EN**: "Like CO2 in a soda bottle -- **more pressure = more gas dissolved**. We track nitrogen because your body doesn't use it."
**Slide-text CZ**: "Jako CO2 v lahvi limonady -- **vyssi tlak = vice rozpusteneho plynu**. Sledujeme dusik, protoze ho telo nespotrebuje."
**What to show**: `<p data-i18n="tissueLoading.henrysLaw.text1">`, `<p data-i18n="tissueLoading.henrysLaw.text2">`, the `<ul>` with O2 reasons, and `<p data-i18n="tissueLoading.henrysLaw.text3">`
**Presenter notes**: Explain Henry's Law using the soda bottle metaphor. Key insight: ALL gases dissolve, but O2 is consumed by metabolism and bound to hemoglobin, so it doesn't accumulate. N2 is inert -- 78% of air -- so it's the problem gas. For trimix divers, He follows the same rules but with different numbers.

---

### Slide 3: Gas Solubility -- Fat Holds 5x More
**Content from**: section `#henrys-law`, second half (solubility table + footnote)
**Key visual**: The 3-column solubility table (N2, He, O2 with blood vs fat)
**Slide-text EN**: "Fat holds **5x more nitrogen** than blood. That's why slow fatty tissues take hours to off-gas."
**Slide-text CZ**: "Tuk pojme **5x vice dusiku** nez krev. Proto pomale tukove tkane potrebuji hodiny k odsyceni."
**What to show**: The `<table class="data-table small-table">` and the `<p class="footnote">` below it
**Presenter notes**: This table is the bridge to understanding WHY different tissues load at different rates (which we'll cover in detail later). Point out the Fat:Blood Ratio column -- nitrogen is 5.4x in fat. Helium is only 1.8x -- this is why He washes out faster and is preferred for deep technical diving. The O2 row is there for completeness but doesn't matter for decompression.

---

### Slide 4: Gas Exchange Pathway
**Content from**: section `#gas-exchange` (entire section)
**Key visual**: The SVG gas pathway diagram with descent/ascent toggle buttons
**Slide-text EN**: "Gas flows along the **pressure gradient**: tank -> lungs -> blood -> tissues. Higher pressure always pushes toward lower."
**Slide-text CZ**: "Plyn proudi po **tlakovem gradientu**: lahev -> plice -> krev -> tkane. Vyssi tlak vzdy tlaci smerem k nizsimu."
**What to show**: The intro paragraph, the SVG diagram, and the descent/ascent toggle. The `<details>` alveolar formula can remain collapsed.
**Presenter notes**: Walk the audience through the pathway left to right. Click the descent button to show on-gassing flow. Then switch to ascent to show the reversal. Key point: the direction of flow is determined ONLY by the pressure gradient -- gas always moves from high to low. The diagram shows how different tissues (fast/med/slow) fill at different rates. Mention the alveolar formula if the audience is technical.

---

### Slide 5: Descent -- On-gassing
**Content from**: section `#saturation-dynamics`, first dive-phase div (descent)
**Key visual**: The descent phase card with its formula line
**Slide-text EN**: "Descent: alveolar N2 pressure **exceeds tissue pressure**. Gas flows IN. Fast tissues fill first."
**Slide-text CZ**: "Sestup: alveolarni tlak N2 **prevysuje tlak v tkanich**. Plyn proudi DOVNITR. Rychle tkane se syti prvni."
**What to show**: The intro paragraph `<p data-i18n="tissueLoading.saturationDynamics.intro">` (as context), plus the `<div class="dive-phase">` for descent, including the formula line.
**Presenter notes**: This is phase 1 of 3. As you descend, ambient pressure increases, alveolar N2 pressure jumps up (from Dalton's Law -- previous chapter), and now there's a gradient from lungs to tissues. All 16 compartments start absorbing, but fast ones (brain, spinal cord -- 5 min half-time) fill much quicker than slow ones (fat -- 635 min half-time). Show the inequality: ppN2(tissue) < ppN2(alveolar) -> On-gassing.

---

### Slide 6: At Depth -- Differential Saturation
**Content from**: section `#saturation-dynamics`, second dive-phase div (at depth)
**Key visual**: The "at depth" phase card
**Slide-text EN**: "At depth: fast tissues **reach equilibrium in minutes**. Slow tissues are still far from saturated after an hour."
**Slide-text CZ**: "V hloubce: rychle tkane **dosahnou rovnovahy za minuty**. Pomale tkane jsou po hodine stale daleko od nasyceni."
**What to show**: The `<div class="dive-phase">` for "at depth"
**Presenter notes**: This is the key insight for understanding no-deco limits. On a short dive (say 20 min at 20m), fast compartments are nearly saturated but slow ones barely noticed. On a long dive (60+ min), medium compartments start catching up. This differential loading is WHY we need 16 different compartments in the model -- one tissue type can't represent the whole body.

---

### Slide 7: Ascent -- Off-gassing & Supersaturation
**Content from**: section `#saturation-dynamics`, third dive-phase div (ascent)
**Key visual**: The ascent phase card with TWO formula lines (off-gassing + supersaturation)
**Slide-text EN**: "Ascent: the gradient **reverses**. When tissue N2 exceeds ambient pressure, you're **supersaturated** -- bubble risk begins."
**Slide-text CZ**: "Vystup: gradient se **otaci**. Kdyz tlak N2 v tkanich prekroci okolni tlak, jste **presyceni** -- zacina riziko bublin."
**What to show**: The `<div class="dive-phase">` for ascent, with both formula lines and both paragraphs.
**Presenter notes**: Two critical thresholds to teach here: (1) Off-gassing starts when tissue N2 > alveolar N2 -- gas flows OUT, good. (2) Supersaturation occurs when tissue N2 > ambient pressure -- now the gas WANTS to come out of solution entirely, forming bubbles. This is where DCS risk lives. The distinction between "off-gassing" and "supersaturation" is crucial. Transition to the next slide about how much supersaturation is OK.

---

### Slide 8: Critical Supersaturation
**Content from**: section `#critical-supersaturation` (entire section)
**Key visual**: Warning card (yellow/orange styling)
**Slide-text EN**: "Some supersaturation is OK. Cross the **critical threshold** and bubbles form -- that's DCS."
**Slide-text CZ**: "Urcita mira presyceni je v poradku. Prekrocite-li **kritickou hranici**, tvori se bubliny -- to je DCS."
**What to show**: The two paragraphs in the warning card, including the link to m-values.html.
**Presenter notes**: This bridges to the next chapter (M-Values). The body CAN handle some supersaturation -- our tissues are somewhat elastic and dissolved gas can diffuse out safely up to a point. But cross the critical line and physics wins -- bubbles nucleate. Each tissue type has a DIFFERENT critical threshold (foreshadow M-values). Tell the audience: "The next chapter will show you exactly how to calculate these limits."

---

### Slide 9: The Half-Time Concept
**Content from**: section `#half-time-concept`, first half (intro + definition + visual bars)
**Key visual**: The 4 colored progress bars (50%, 75%, 87.5%, ~98%)
**Slide-text EN**: "**Half-time** = time to close 50% of the pressure gap. After 6 half-times, a tissue is ~98% saturated."
**Slide-text CZ**: "**Polocas** = cas k prekonani 50 % tlakoveho rozdilu. Po 6 polocasech je tkan ~98% nasycena."
**What to show**: The intro paragraph, the definition paragraph, the `.half-time-visual` div with 4 bars, and the example line (5-min vs 635-min compartment).
**Presenter notes**: This is one of the most important concepts in the whole course. Use the bars to walk through: after 1 half-time, 50% of the gap is closed. After 2, 75%. After 3, 87.5%. Practically, after 6 half-times (~98%), we consider the tissue "saturated." Give the concrete example: compartment 1 (5 min half-time) reaches 98% in 30 min. Compartment 16 (635 min) takes over 63 HOURS. That's why repetitive dives accumulate nitrogen in slow tissues.

---

### Slide 10: Pressure Gradient Effect
**Content from**: section `#half-time-concept`, second half (gradient title + gradient texts)
**Key visual**: The text about switching from air to Nitrox 50 or pure O2
**Slide-text EN**: "Half-time is constant, but a **bigger pressure gap = more gas moved** per half-time. That's why O2-rich deco gas works."
**Slide-text CZ**: "Polocas je konstantni, ale **vetsi tlakovy rozdil = vice presunutoho plynu** za polocas. Proto dekompresni smesi boate na O2 funguji."
**What to show**: The `<h4>` "The Pressure Gradient Effect" and the two paragraphs below it, including the Nitrox 50 / pure O2 example.
**Presenter notes**: This is the practical payoff of understanding half-times. The half-time itself doesn't change -- a 20-min compartment always takes 20 min for one half-time. But 50% of a BIG gap is more gas than 50% of a small gap. Example: tissue loaded to 3.16 bar, surfacing to 0.79 bar on air (79% N2) -- the gap is 2.37 bar. Switch to pure O2 (0% N2) -- the gap becomes 3.16 bar. Each half-time removes more nitrogen. This is the scientific basis for oxygen-rich decompression gases.

---

### Slide 11: Interactive: On-gassing Chart
**Content from**: section `#half-time-charts`, first half (on-gassing chart only)
**Key visual**: The on-gassing chart with depth slider
**Slide-text EN**: "Drag the depth slider -- **bigger pressure gap = faster absolute loading**. Watch the exponential curve flatten as the tissue approaches equilibrium."
**Slide-text CZ**: "Posunte posuvnik hloubky -- **vetsi tlakovy rozdil = rychlejsi absolutni syceni**. Sledujte, jak se exponencialni krivka splostuje pri priblizeni k rovnovaze."
**What to show**: The on-gassing chart wrapper (`<div class="half-time-chart-wrapper">` first one), including its title, description, depth slider, and canvas.
**Presenter notes**: Interactive demo. Start at 30m, show the curve. Then drag to 50m -- the curve reaches a higher equilibrium and the initial slope is steeper (bigger gradient). Then go back to 10m -- the curve is flatter and lower. Key teaching point: the SHAPE is always exponential, the RATE constant (k) is the same, but the AMOUNT of gas per unit time depends on the pressure difference. Let the audience experiment.

---

### Slide 12: Interactive: Off-gassing Chart
**Content from**: section `#half-time-charts`, second half (off-gassing chart + footnote)
**Key visual**: The off-gassing chart + the "symmetry" footnote
**Slide-text EN**: "Off-gassing is the **perfect mirror** of on-gassing. Same equation, same half-time -- only the direction changes."
**Slide-text CZ**: "Odsycovani je **dokonaly zrcadlovy obraz** syceni. Stejna rovnice, stejny polocas -- meni se jen smer."
**What to show**: The off-gassing chart wrapper (second `<div class="half-time-chart-wrapper">`), plus the footnote paragraph.
**Presenter notes**: Show that the off-gassing curve is literally the on-gassing curve flipped. This is mathematically elegant -- the Haldane equation works in both directions. The practical implication: a tissue that took 5 minutes to load to 50% takes 5 minutes to off-gas 50%. But remember the pressure gradient effect from slide 10 -- the gradient during off-gassing (tissue -> surface) is typically smaller than during on-gassing (surface -> depth), which is why off-gassing takes longer in practice. This is why we need deco stops.

---

### Slide 13: The Mathematics
**Content from**: section `#half-time-math` (entire section)
**Key visual**: Three formulas (Haldane, Schreiner, Pressure at Depth)
**Slide-text EN**: "**Haldane equation** for constant depth, **Schreiner equation** for ascent/descent -- exponential decay drives it all."
**Slide-text CZ**: "**Haldaneova rovnice** pro konstantni hloubku, **Schreinerova rovnice** pro vystup/sestup -- vse ridi exponencialni pokles."
**What to show**: The entire math-content div with all three formulas and their parameter lists.
**Presenter notes**: This is the "math reference" slide. For P1/P2 courses, mention these exist but don't dwell on them. For P3/technical courses, walk through the Haldane equation: it's just an exponential approach to equilibrium. Point out that P_alv (target) minus P_t0 (current) is the gap, and e^(-kt) is the decay factor. The Schreiner equation adds a rate term R for changing depth. The pressure formula is the simple one from the previous chapter. All of our interactive charts use these equations.

---

### Slide 14: Why Different Tissues Behave Differently
**Content from**: section `#tissue-heterogeneity` (entire section)
**Key visual**: The 3-bullet list (perfusion, solubility, distance)
**Slide-text EN**: "Brain exchanges gas in minutes, fat takes hours. **Blood perfusion, solubility, and distance** determine the speed."
**Slide-text CZ**: "Mozek vymenuje plyn za minuty, tuk za hodiny. **Prokrveni, rozpustnost a vzdalenost** urcuji rychlost."
**What to show**: The full concept card with intro, bullet list, and conclusion paragraph.
**Presenter notes**: Bridge slide connecting physiology to the mathematical model. Three factors: (1) Blood perfusion -- brain and heart get massive blood flow, so they exchange gas fast. Cartilage and fat barely get any blood flow. (2) Gas solubility -- fat dissolves 5x more N2 (recall slide 3), so it takes longer to fill up. (3) Physical distance -- gas has to diffuse from capillaries through tissue; the farther the tissue is from blood supply, the slower. These three factors together explain why we need 16 different compartments.

---

### Slide 15: Buhlmann's 16 Compartments
**Content from**: section `#buhlmann-compartments`, first part (intro + fast/medium/slow bullets)
**Key visual**: The 3-tier bullet list (fast 5-12.5min, medium 18.5-77min, slow 109-635min)
**Slide-text EN**: "**16 mathematical compartments** spanning 5 to 635 min. They're not real tissues -- they're equations fit to experimental data."
**Slide-text CZ**: "**16 matematickych kompartmentu** s polocasy 5 az 635 min. Nejsou to skutecne tkane -- jsou to rovnice fitovane na experimentalni data."
**What to show**: The intro paragraph and the 3 bullet points (fast, medium, slow compartments).
**Presenter notes**: Emphasize these are THEORETICAL constructs, not anatomical tissues. Buhlmann didn't say "compartment 1 IS the brain" -- he said "compartment 1 behaves LIKE fast tissues such as the brain." The 16 compartments span the full range from 5 min (very fast) to 635 min (very slow). This range was determined experimentally. Show the 3 tiers: fast (saturate in minutes during a short dive), medium (the usual suspects for recreational deco limits), slow (only matter for very long or repetitive dives).

---

### Slide 16: The Controlling Compartment
**Content from**: section `#buhlmann-compartments`, second part (controlling compartment paragraph)
**Key visual**: The paragraph about the controlling compartment
**Slide-text EN**: "At any moment, the compartment **closest to its limit** is the controlling one -- it determines your deco ceiling."
**Slide-text CZ**: "V kazdem okamziku je **ridici kompartment** ten nejblize svemu limitu -- urcuje vas dekompresni strop."
**What to show**: The `<p data-i18n="tissueLoading.buhlmannCompartments.controlling">` paragraph. Optionally add a brief visual or highlight.
**Presenter notes**: This is the key operational concept. Your dive computer doesn't just track one tissue -- it tracks all 16 simultaneously. At any given moment, ONE of them is closest to its critical supersaturation limit. That's the "controlling compartment" and it sets your ceiling. On a short deep dive, fast compartments control. On a long shallow dive, medium compartments take over. On repetitive dives, slow compartments can become controlling. This concept directly connects to M-Values (next chapter).

---

### Slide 17: ZH-L16 Variants: A, B, and C
**Content from**: section `#zhl16-variants` (entire section)
**Key visual**: The 3 variant cards (A=Experimental, B=Tables, C=Computers)
**Slide-text EN**: "Three variants: A (research), B (tables), **C (dive computers)** -- same half-times, different conservatism."
**Slide-text CZ**: "Tri varianty: A (vyzkum), B (tabulky), **C (potapecske pocitace)** -- stejne polocasy, ruzna konzervativnost."
**What to show**: The entire variant grid with all 3 cards.
**Presenter notes**: Quick comparison slide. All three variants use the SAME 16 half-times. The difference is in the 'a' coefficients (which we'll learn about in the M-Values chapter). A is the original experimental values -- least conservative. B adds safety margins for printed dive tables (to account for rounding). C is the most conservative and is what most dive computers use. The highlighted card (C) is what we use in this tool. Ask the class: "Why would dive computers need MORE conservatism than tables?" Answer: because precise tracking can lead to divers pushing limits more aggressively.

---

### Slide 18: Tissue Loading Chart (Interactive)
**Content from**: section `#tissue-chart-section` (entire section)
**Key visual**: The full DiveProfileChart showing all 16 compartment lines
**Slide-text EN**: "Watch all **16 compartments load and unload** in real time during a 20 m dive."
**Slide-text CZ**: "Sledujte, jak se vsech **16 kompartmentu nasycuje a odsycuje** v realnem case behem ponoru na 20 m."
**What to show**: The chart container and the "Open in Sandbox" link.
**Presenter notes**: This is the capstone demo. Hover over the chart to see how each compartment responds differently during the dive phases. Fast compartments (warm colors) spike up quickly during descent and drop quickly during ascent. Slow compartments (cool colors) barely move on a 40-min dive. Point out the ambient pressure line -- when a tissue line goes ABOVE ambient pressure, that tissue is supersaturated. Show the deco ceiling line -- this is calculated from the controlling compartment's M-value. Encourage students to open in Sandbox and experiment with different depths/times.

---

### Slide 19: Compartment Reference Table
**Content from**: section `#reference-table` (entire section)
**Key visual**: The 16-row reference table
**Slide-text EN**: "The full **ZH-L16C reference** -- 16 compartments, half-times from 5 min (brain) to 635 min (fat)."
**Slide-text CZ**: "Kompletni **reference ZH-L16C** -- 16 kompartmentu, polocasy od 5 min (mozek) po 635 min (tuk)."
**What to show**: The full reference table.
**Presenter notes**: Reference slide. Students don't need to memorize this, but it's good to see the full picture. Point out: compartments 1-3 (brain/spinal cord, 5-12.5 min) -- these are the "fast tissues" that matter most on short, deep dives. Compartments 4-8 (muscles/skin, 18.5-54.3 min) -- the "medium tissues" that typically control recreational no-deco limits. Compartments 9-16 (tendons, bones, fat, 77-635 min) -- "slow tissues" that matter for repetitive dives and long exposures. The "Time to Saturate" column (6 half-times) shows why slow tissues take so long.

---

### Slide 20: Summary & Bridge to M-Values
**NOTE**: This slide does NOT exist in the current HTML. It would be a new "summary" section added at the end of `<main>`, before the reference table. Alternatively, the presenter can use the reference table as the closing slide with a verbal bridge.

**If implemented:**
**Key visual**: A brief recap list
**Slide-text EN**: "We know HOW gas loads. Next: **how much is too much?** That's the M-Value chapter."
**Slide-text CZ**: "Vime, JAK se plyny syti. Dale: **kolik je prilis?** To je kapitola M-hodnoty."
**Presenter notes**: Quick recap: Henry's Law (gas dissolves proportionally to pressure), gas exchange pathway (lungs -> blood -> tissues), saturation dynamics (on-gas, off-gas, supersaturation), half-times (exponential approach to equilibrium), 16 compartments (fast to slow). The controlling compartment sets your ceiling. But how do we know the LIMIT for each compartment? That's M-Values -- next chapter.

**Decision**: Skip this slide for now. The reference table works as a natural ending point, and the presenter can verbally bridge to M-Values. Adding a summary section is a future enhancement.

---

## Implementation Notes

### Sections that need splitting in HTML

To split a section for presentation mode, there are two approaches:

**Approach A (Recommended): Split into separate `<section>` elements**
Each `<section>` becomes its own slide. This means:
- Henry's Law: split `#henrys-law` into `#henrys-law` (concept) + `#henrys-law-solubility` (table)
- Saturation Dynamics: split `#saturation-dynamics` into `#saturation-descent` + `#saturation-at-depth` + `#saturation-ascent`
- Half-Time Concept: split `#half-time-concept` into `#half-time-concept` (definition) + `#half-time-gradient` (gradient effect)
- Half-Time Charts: split `#half-time-charts` into `#half-time-charts-ongassing` + `#half-time-charts-offgassing`
- Buhlmann Compartments: split `#buhlmann-compartments` into `#buhlmann-compartments` (intro) + `#controlling-compartment`

**Approach B: Sub-slide markers within sections**
Add a mechanism for sub-slides within a single section. More complex to implement.

**Recommendation**: Approach A. It matches the pressure.html pattern exactly and requires no new JS infrastructure.

### Updated `data-slide-text` attributes needed

Each new section needs both `data-slide-text` (EN) and `data-slide-text-cs` (CZ) attributes as specified above.

### TOC updates

The table of contents nav needs updating to reflect the new section IDs. Some entries become two entries, others stay the same.

### Total slide count comparison

| Page | Original sections | After split | Change |
|------|------------------|-------------|--------|
| pressure.html | 8 (approx) | 16 | +8 |
| tissue-loading.html | 13 | 19 (excl. summary) | +6 |

The tissue-loading page is slightly more compact than pressure.html per-slide, which is appropriate because the material is more technical and the audience is expected to have absorbed the pressure.html content first.
