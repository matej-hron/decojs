# Design: series 2 — the other Dive Profile chart tabs (`sandbox/index.html`)

> **As shipped:** see **§9 As shipped** at the end; where it disagrees with §1–§8, §9 wins.

Four more narrated walkthroughs, one for each Dive Profile chart tab that series 1 did not
cover. Everything in the series-1 design (`sandbox-deco.md`, incl. §8 "As shipped") still
applies. This document only records what is new or different.

| # | Tab (button id) | Scenario | Publish as | Words (EN) | Est. length |
|---|---|---|---|---|---|
| 5 | Pressure (`#dpc-pressure`) | `scenes/sandbox-pressure.mjs` | `videos/sandbox-pressure` | 187 | ~92 s |
| 6 | Partial Pressure (`#dpc-pp`) | `scenes/sandbox-partial.mjs` | `videos/sandbox-partial` | 167 | ~83 s |
| 7 | Gas Consumption (`#dpc-gas`) | `scenes/sandbox-gas.mjs` | `videos/sandbox-gas` | 158 | ~79 s |
| 8 | Tissue Loading (`#dpc-tissue`) | `scenes/sandbox-tissue.mjs` | `videos/sandbox-tissue` | 190 | ~94 s |

Word counts are whitespace tokens of the EN captions. Lengths use ~2.1 words/s plus the cards.

**Order.** The order follows the brief, not the button row. The page's button order is
Profile · Pressure · Gas Consumption · Partial Pressure · Tissue Loading. The brief's order
teaches better:
- pressure first;
- then each gas's share of it (partial pressure);
- then what the pressure costs in gas;
- then what the inspired nitrogen does to the tissues.

Each video still names its own tab, so watching them out of order works.

**Scope (decision H, generalised).** The videos explain how to read each tab. They never
explain how the app computes it. Problems I found in the app are listed in §7
("App issues, not for these videos"). None of them blocks a video. Three are cosmetic defects
that would be visible on camera, and §7 says how each video copes with or without a fix.

I measured every number, dataset label, scale, annotation box and colour below in Playwright.
The setup: the series dive URL, en-US, 1920×940, zoom 1.6 with `devicePixelRatio` = 1.6 (as
the generator sets it), and `muteChartHover` + `fitChartFullscreen` from `lib/sandbox.mjs`.
The kx/ky stretch guard passed on all four tabs (§8).

---

## 1. Shared setup (all four videos)

**Dive:** unchanged. `DIVE_URL` (40 m / 20 min, air in 2 × 12 l, EAN50 in an S080, GF 30/70).
Every scenario calls `assertPlan` in `prepare()`.

**Recording state:**
- zoom **1.6**, the same as video 3, so all chart videos match;
- `muteChartHover(page)` and `fitChartFullscreen(page, 1.6)`;
- **new** `hideFullscreenClose(page)` (recording only, see §7 A3);
- editor collapsed by a JS click;
- the Dive Profile heading (`h3[data-i18n="sandbox.dive.profileChart"]`) scrolled to just
  under the nav, exactly as `sandbox-profile.mjs` does it.

At that scroll position the tab row `.chart-controls` is in frame, and so are the tissue
controls in video 8. Tabs are switched **on camera** with a visible `ui.click('#dpc-…')`.
Then the scene clicks `#dive-profile-container .dpc-fullscreen-btn` and waits 400 ms.

**New lib helpers (`scripts/video/lib/sandbox.mjs`):**

1. `hideFullscreenClose(page)`. Recording only. Injects
   `.dpc-exit-fullscreen-btn, .mvc-exit-fullscreen-btn { opacity: 0 !important; }`.
   In fullscreen the ✕ sits at viewport [1800, 58, 63 × 63] and covers the top tick of the
   right-hand axis: `7` on the pressure axis, `200` on the tank axis (§7 A3). It stays
   clickable for JS. Video 8 leaves fullscreen with
   `page.evaluate(() => document.querySelector('#dive-profile-container .dpc-exit-fullscreen-btn').click())`.
2. `introTabs(lang, n)`: intro cards for this series (n = 1…4). It reuses the `outro(lang)`
   footer.

   | Field | EN | CS |
   |---|---|---|
   | subtitle | `Dive Profile tabs · part n of 4` | `Záložky profilu ponoru · díl n ze 4` |
   | title 1 | The Pressure Tab | Záložka Tlak |
   | title 2 | The Partial Pressure Tab | Záložka Parciální tlak |
   | title 3 | The Gas Consumption Tab | Záložka Spotřeba plynu |
   | title 4 | The Tissue Loading Tab | Záložka Sycení tkání |

   The Czech titles use the Czech tab labels (`sandbox.dive.chartMode.*`). The subtitles are
   an open question (Q1): this way series 1's "part n of 4" cards stay valid without a
   re-render.
3. Nothing else is needed. `annotationBox` (incl. `part: 'label'`), `legendBox` (with
   `match`), `scaleBox`, `dataRect`, `dataPoint(s)`, `datasets` and `chartAreaBox` already
   cover every ring below.

**Canvas facts (fullscreen, zoom 1.6; all tabs):**
- Scales are `x` (0–45 min) and `yDepth` (0–45 m, reversed, left).
- The right-hand scale is:

  | Tab | Right scale | Range | Title |
  |---|---|---|---|
  | Pressure, Partial Pressure, Tissue Loading | `yPressure` | 0–7 | `Pressure (bar)` |
  | Gas Consumption | `yGas` | 0–210 | `Tank Pressure (bar)` |

- `showLabels` is off on these tabs, so the `descentLabel`, `bottomTimeBracket`, `TDT`
  and `SURFACE INTERVAL` annotations are **absent**.
- `stopLabel0–5`, `gasSwitch0` and `gasSwitchDot0` are always drawn.
- The data runs to 44.0 min: after surfacing at 39.0 the chart keeps going for ~5 min of
  surface interval. On the PP and Gas tabs the breathing gas there is air again.

Shorthand used in the tables: `C` = `PROFILE_CANVAS`, `ds(label)` = the dataset with that
label from `datasets(page, C)` (U+00A0 is already turned into a space), and
`at(d, t)` = the sample nearest to t.

---

## 2. Video 5 — the Pressure tab (`sandbox-pressure`) · 187 words · ~92 s

**Learning goal:** read ambient pressure off the right-hand axis. Know that it is 1 bar at
the surface plus 1 bar per 10 m. See that the pressure curve is the depth profile upside
down. Know where the biggest relative change is (the last 10 m).

**On screen (measured):**
- Two datasets: `Depth (m)` (blue, filled, left axis) and `Ambient Pressure (bar)` (orange
  dashed `#f39c12`, right axis).
- Legend: `Ambient Pressure (bar)`, `Depth (m)`.
- Ambient pressure: 1.013 at t = 0, 5.013 on the bottom (t = 2–20), 3.113 at the switch
  (21.9), 2.013 at 10 m, 1.613 at 6 m, 1.313 at 3 m, 1.013 from 39.0 to 44.0.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Dive profile tabs, part one: reading the Pressure tab. | Záložky profilu ponoru, díl první: jak číst záložku Tlak. | intro card | `assertPlan` |
| 2 | Same dive as before. Click Pressure, then go full screen. | Stejný ponor jako předtím. Klikněte na Tlak a přejděte na celou obrazovku. | card off; `highlight('.chart-controls')`; `highlight(null)`; `click('#dpc-pressure')`; `click(…dpc-fullscreen-btn)`; wait 400 | `#dpc-pressure.active`; fullscreen class present |
| 3 | The orange dashed line is ambient pressure, the total pressure around you. Read it on the right-hand axis, in bar. | Oranžová čárkovaná čára je okolní tlak, celkový tlak kolem vás. Čte se na pravé ose, v barech. | `ring(legendBox(C, 0, {match: '^Ambient'}))`, then `ring(scaleBox(C, 'yPressure'))` | legend text `Ambient Pressure (bar)`; scale title `Pressure (bar)` |
| 4 | At the surface it is 1 bar, the atmosphere. Every 10 m of water adds another bar. | Na hladině je to 1 bar, atmosféra. Každých 10 m vody přidá další bar. | round ring at `dataPoint(0, 1.013, {yScale:'yPressure'})`; glide along the descent (t 0 → 2) | `at(amb, 0)` ∈ [1.00, 1.02]; 10 m = 2.013 (check the sample at depth 10 m on the way up) |
| 5 | So at 40 m you are under 5 bar, and the line stays flat while you stay on the bottom. | Ve 40 m jste tedy pod tlakem 5 bar a čára zůstává rovná, dokud jste na dně. | ring `dataRect(2, 4.8, 20, 5.2, {yScale:'yPressure', pad: 4})` | all samples with t ∈ [2.1, 19.9] = 5.013 ± 0.001 |
| 6 | The pressure line is the depth profile turned upside down: deeper on the left axis, higher pressure on the right. | Čára tlaku je profil ponoru obrácený vzhůru nohama: hlouběji na levé ose, vyšší tlak na pravé. | ring `scaleBox(C, 'yDepth')`, then `scaleBox(C, 'yPressure')` (alternate 1.6 s each) | — |
| 7 | On the way up, each 3 m stop is 0.3 bar less. Between 10 m and the surface, the pressure halves, from 2 bar to 1. | Při výstupu je každá zastávka po 3 m o 0,3 bar níž. Mezi 10 m a hladinou se tlak sníží na polovinu, ze 2 barů na 1. | ring `dataRect(22, 1.0, 39, 2.9, {yScale:'yPressure', pad: 4})` (the stop staircase) | stop plateaus 2.813 / 2.513 / 2.213 / 1.913 / 1.613 / 1.313 (step 0.300 ± 0.001); 2.013 / 1.013 ∈ [1.95, 2.05] |
| 8 | That is the biggest relative change of the dive: a volume of gas doubles there. | To je největší relativní změna celého ponoru: objem plynu se tu zdvojnásobí. | keep ring | — (Boyle's law; reading level) |
| 9 | After surfacing, the line stays at 1 bar for the rest of the chart, the start of the surface interval. | Po vynoření zůstane čára na 1 baru až do konce grafu, to je začátek povrchového intervalu. | ring `dataRect(39, 0.8, 44, 1.2, {yScale:'yPressure', pad: 4})` | samples t ≥ 39.0 = 1.013 |
| 10 | The sandbox follows the EN 13319 standard, 1 bar per 10 m. Under Environment you can pick fresh or sea water, or an altitude. | Pískoviště počítá podle normy EN 13319, 1 bar na 10 m. V Prostředí lze zvolit sladkou nebo mořskou vodu či nadmořskou výšku. | `ring(null)`; `cursorAway()` | summary hint of `details.dse-environment` = `(0 m · EN)` (the editor is collapsed, but the DOM is there) |
| 11 | Next: partial pressures. Thanks for watching! | Příště: parciální tlaky. Díky za pozornost! | outro card | — |

Notes:
- "1 bar" in scenes 4 and 9 is what the axis shows; the exact value is 1.013. The checks
  allow for that.
- `say`: "zero point three bar", "E N thirteen three nineteen".

---

## 3. Video 6 — the Partial Pressure tab (`sandbox-partial`) · 167 words · ~83 s

**Learning goal:** read pO₂ and pN₂ off the right-hand axis. Compare them with the drawn
limits (pO₂ 1.4 bottom, 1.6 deco, pN₂ 4.0 narcosis). See the jump at the gas switch.

**On screen (measured):**

| Item | Style | Values |
|---|---|---|
| `pO₂ (bar)` | green solid | 0.213 at the surface; 1.053 on the bottom; falls to 0.668 at 21.83; **jumps to 1.557** at the switch (21.9); 1.407 at 18 m … 0.657 at 3 m; 0.213 again from 39.17 |
| `pN₂ (bar)` | purple solid | **3.960** on the bottom; 1.407 at 18 m on EAN50; 0.507 just before surfacing; 0.801 on air after surfacing |
| `ppO2Working` | yellow dashed line, label `pO₂ 1.4 (bottom)` | label at the right end |
| `ppO2Deco` | red dashed line, label `pO₂ 1.6 (deco)` | label at the right end |
| `ppN2Max` | purple dashed line, label `pN₂ narcosis (4.0)` | label at the left end |

⚠ The two pO₂ labels **overlap by 15 px** at the right edge (§7 A2). The scenes ring the
*lines* (thin `dataRect`s across the plot), never those two labels. If A2 is fixed, ring the
labels instead.

The page also shows the warning "Mild narcosis possible: pN₂ = 3.96 bar at 40 m" under the
chart. That is a cross-check only; it is not shown in fullscreen.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Dive profile tabs, part two: reading the Partial Pressure tab. | Záložky profilu ponoru, díl druhý: jak číst záložku Parciální tlak. | intro card | `assertPlan` |
| 2 | Click Partial Pressure and go full screen. | Klikněte na Parciální tlak a přejděte na celou obrazovku. | `click('#dpc-pp')`; fullscreen | `#dpc-pp.active` |
| 3 | Each gas in the mix carries its share of the ambient pressure: green is oxygen, purple is nitrogen, on the right axis. | Každý plyn ve směsi nese svůj podíl okolního tlaku: zelená je kyslík, fialová dusík, na pravé ose. | ring legend `^pO₂` then `^pN₂`; then `scaleBox('yPressure')` | legend texts `pO₂ (bar)`, `pN₂ (bar)` |
| 4 | On the surface, air gives 0.21 bar of oxygen. At 40 m it is five times more, 1.05 bar, below the 1.4 bar bottom limit. | Na hladině dává vzduch 0,21 bar kyslíku. Ve 40 m je to pětkrát víc, 1,05 bar, pod limitem 1,4 bar pro dno. | round ring at (0, 0.213); then `dataRect(2, 0.95, 20, 1.15)`; then a thin ring along the 1.4 line `dataRect(0, 1.37, 45, 1.43)` | `at(pO2, 0)` rounds to 0.21; bottom 1.053 rounds to 1.05; `ppO2Working` label `pO₂ 1.4 (bottom)` |
| 5 | Nitrogen reaches 3.96 bar at 40 m, just under the 4 bar narcosis line: expect mild narcosis on air at this depth. | Dusík dosáhne ve 40 m 3,96 bar, těsně pod čárou opojení 4 bar: na vzduch v této hloubce počítejte s mírným opojením. | ring `annotationBox('ppN2Max', {part:'label'})`; then `dataRect(2, 3.85, 20, 4.05)` | bottom pN₂ rounds to 3.96; label `pN₂ narcosis (4.0)`; `#dive-warnings` contains `3.96` |
| 6 | At 21 m you switch to EAN50: oxygen jumps to 1.56 bar, just under the 1.6 bar deco limit, and nitrogen drops. | Ve 21 m přejdete na EAN50: kyslík vyskočí na 1,56 bar, těsně pod deko limit 1,6 bar, a dusík klesne. | union ring `gasSwitchDot0` + `dataRect(21.5, 0.6, 22.4, 1.7)`; then a thin ring along the 1.6 line | max pO₂ = 1.557 at t = 21.9, rounds to 1.56, < 1.6; pN₂ after the switch < 1.6 |
| 7 | Less nitrogen in means faster off-gassing out; that is what the deco gas is for. Both lines step down with every stop. | Méně dusíku na vstupu znamená rychlejší odsycování; k tomu je dekompresní plyn. Obě čáry s každou zastávkou klesnou o schod. | ring `dataRect(22, 0.4, 39, 1.6)` | pO₂ plateaus are strictly decreasing from 18 m to 3 m |
| 8 | After surfacing you breathe air again: oxygen is back at 0.21 bar. | Po vynoření dýcháte opět vzduch: kyslík je zpět na 0,21 bar. | ring `dataRect(39.1, 0.1, 44, 0.35)` | samples t ≥ 39.17 round to 0.21 |
| 9 | The limits drawn, 1.4 and 1.6 bar, are common teaching values; follow the limits of your own training agency. | Zakreslené limity 1,4 a 1,6 bar jsou běžné výukové hodnoty; řiďte se limity své výcvikové organizace. | `ring(null)`; `cursorAway()` | — |
| 10 | Next: gas consumption. Thanks for watching! | Příště: spotřeba plynu. Díky za pozornost! | outro card | — |

Notes:
- Scene 6 matches video 1 ("deco MOD 22 m, so the plan switches at 21 m"). Here the student
  *sees* why: at 21 m the pO₂ is 1.56, just under 1.6.
- `say`: "P O two", "nought point two one", "one point five six".

---

## 4. Video 7 — the Gas Consumption tab (`sandbox-gas`) · 158 words · ~79 s

**Learning goal:** read each tank's pressure off the right-hand axis. Read the slope as how
fast that tank empties. Find the switch, the reserve line and how much is left.

**On screen (measured):**
- `Air (bar)`, red `#e74c3c`: 200 → 194.98 after the descent → 119.78 at 20 min → **113.52**
  (shown as 114 in table and summary), flat from 21.83. Bottom slope **4.18 bar/min**.
- `EAN50 (bar)`, **blue `#3498db`, the same colour as `Depth (m)`** (§7 A1): flat at 200
  until 21.9, then falls about 2.18 bar/min at 6 m and 1.78 at 3 m. It ends at **157.90**.
- Annotations: `reserveLine` `RESERVE: 50 bar` (red dashed, on `yGas`, label at the centre
  [878, 633]); `avgDepthLine` `AVG: 24.1 m` (green dotted); `maxDepthLine` `MAX: 40 m` (red
  dashed); the stops; the gas switch.
- Gas summary under the chart: `Air 200 → 114 bar`, `EAN50 200 → 158 bar`.

⚠ **Stage end pressure.** The chart and summary say 158; the series-1 table says 159
(decision D). Video 7 does **not** quote the stage's end value; it says "over 150 bar". The
air value (114) agrees everywhere and is quoted.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Dive profile tabs, part three: reading the Gas Consumption tab. | Záložky profilu ponoru, díl třetí: jak číst záložku Spotřeba plynu. | intro card | `assertPlan` |
| 2 | Click Gas Consumption and go full screen. | Klikněte na Spotřeba plynu a přejděte na celou obrazovku. | `click('#dpc-gas')`; fullscreen | `#dpc-gas.active` |
| 3 | Each line is one tank's pressure, read on the right axis: red for the twin 12s of air, ⟨STAGE⟩ for the EAN50 stage. | Každá čára je tlak v jedné lahvi, na pravé ose: červená je dvojče 2 × 12 l se vzduchem, ⟨STAGE_CS⟩ je stage s EAN50. | ring legend `^Air`, then `^EAN50`, then `scaleBox('yGas')` | legend texts; scale title `Tank Pressure (bar)`; dataset `borderColor` = the colour the caption names (see below) |
| 4 | Both start full at 200 bar. The steeper the line, the faster the tank empties: about 4 bar a minute on the bottom. | Obě začínají plné na 200 bar. Čím strmější čára, tím rychleji se láhev vyprazdňuje: na dně asi 4 bary za minutu. | round ring at (0, 200, `yGas`); then `dataRect(2, 115, 20, 200)` along the air line | both at t = 0 = 200; air slope over t 4–18 ∈ [3.9, 4.4] |
| 5 | At 21 m you switch: the air line goes flat at 114 bar, and the stage takes over. | Ve 21 m přejdete: čára vzduchu se zastaví na 114 bar a převezme to stage. | round ring at (21.9, 113.5, `yGas`) + ring `gasSwitchDot0` | air min rounds to 114 and is flat for t ≥ 21.9; EAN50 = 200 until 21.9; table A1 tank `114 bar` |
| 6 | Shallower, the stage empties more slowly: about 2 bar a minute at 6 m. | Mělčeji se stage vyprazdňuje pomaleji: v 6 m asi 2 bary za minutu. | `dataRect(27.4, 160, 31.4, 185, {yScale:'yGas'})` | EAN50 slope over t 28–31 ∈ [1.9, 2.4] |
| 7 | The dashed line marked RESERVE is your 50 bar reserve. Both tanks stay far above it; the stage still holds over 150 bar. | Čárkovaná čára REZERVA je vaše rezerva 50 bar. Obě lahve zůstávají vysoko nad ní; ve stage zbývá přes 150 bar. | glide to and ring `annotationBox('reserveLine', {part:'label'})`; then round ring at the EAN50 end (44, 157.9) | label `RESERVE: 50 bar`; air min > 50; EAN50 min ∈ (150, 200) |
| 8 | The other two dashed lines mark average and maximum depth, on the left axis. | Další dvě čárkované čáry ukazují průměrnou a maximální hloubku, na levé ose. | ring `avgDepthLine` and `maxDepthLine` labels | `AVG: 24.1 m`, `MAX: 40 m` |
| 9 | This assumes a steady SAC; work, cold and stress raise it. Plan reserves by your agency's rules, such as thirds. | Počítá se s ustáleným SAC; práce, chlad a stres ho zvyšují. Rezervy plánujte podle pravidel své organizace, třeba třetin. | `ring(null)`; `cursorAway()` | — |
| 10 | Next: tissue loading. Thanks for watching! | Příště: sycení tkání. Díky za pozornost! | outro card | — |

**⟨STAGE⟩ depends on §7 A1.**
- If the colour is fixed (recommended): the colour name of the new line colour, in EN and
  CS.
- If it is not fixed: EN "the lighter blue line", CS "světlejší modrá". The scene then also
  rings the line itself (`dataRect(22, 155, 44, 200)`), because otherwise it is hard to tell
  apart from the depth trace. The check asserts the dataset's actual `borderColor`, so the
  caption can't drift from what is drawn.

Notes:
- Scene 4 says "on the bottom", not "at 40 m", so it doesn't count the descent bend.
- `say`: "twin twelves", "S A C".

---

## 5. Video 8 — the Tissue Loading tab (`sandbox-tissue`) · 190 words · ~94 s

**Learning goal:** read tissue nitrogen against the inspired (alveolar) pN₂. This is the true
on-gassing/off-gassing boundary, which series 1 deliberately did not use. Compare a fast and a
slower compartment. Read supersaturation against ambient pressure, and the per-compartment
ceilings.

**On screen (measured):**
- Datasets with TC1 + TC5 selected: `Depth (m)`, `TC1 (5 min)`, `TC5 (27 min)` (solid, in the
  compartment colours: red `#e74c3c`, green), `TC1 ceiling`, `TC5 ceiling` (thin dotted, on
  the **depth** axis), `Ambient Pressure (bar)` (orange dashed), and `Alveolar pN₂ (bar)`
  (purple dashed).
- The tab opens with **TC1 only** checked.

| Value | Measured |
|---|---|
| TC1 maximum | 3.688 at 20.33 min |
| TC5 maximum | 2.027 at 21.9 min |
| Alveolar pN₂ on the bottom | 3.911 |
| TC1 rises above alveolar (starts off-gassing) | 20.33 min, the first sample of the ascent |
| TC5 rises above alveolar | 21.9 min, the gas switch |
| TC5 above ambient (supersaturated) | from 26.1 min on; at 39.0: TC5 1.591 vs ambient 1.013 |
| TC1 at 39.0 | 0.971 < 1.013, already below ambient |
| TC1 ceiling peak | 16.824 m (equal to the Profile tab's ceiling peak) |
| TC5 ceiling peak | 7.09 m |

With **All** selected, the Profile tab's `Ceiling (m)` equals the per-sample maximum of the 16
compartment ceilings to 0.0000 m. Scene 9's claim is therefore exact.

⚠ The compartment selector (`.dpc-tissue-controls`) sits **outside** the chart's fullscreen
container (§7 A4), so compartments are chosen **before** entering fullscreen. Checkbox:
`.dpc-tissue-controls input[data-compartment-id="5"]`. A click adds it; TC1 stays.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Dive profile tabs, part four: reading the Tissue Loading tab. | Záložky profilu ponoru, díl čtvrtý: jak číst záložku Sycení tkání. | intro card | `assertPlan`; hidden-tab check (below) |
| 2 | Click Tissue Loading. Compartment 1, the fastest, is shown; tick 5 to compare a slower one, then go full screen. | Klikněte na Sycení tkání. Je vidět kompartment 1, nejrychlejší; zaškrtněte 5 pro srovnání s pomalejším a přejděte na celou obrazovku. | `click('#dpc-tissue')`; `highlight('.dpc-tissue-controls')`; `click('…input[data-compartment-id="5"]')`; `highlight(null)`; fullscreen | only checkboxes 1 and 5 checked; datasets `TC1 (5 min)`, `TC5 (27 min)` present |
| 3 | Solid lines are the nitrogen in each compartment, on the right axis. The purple dashed line is the nitrogen you breathe in. | Plné čáry jsou dusík v každém kompartmentu, na pravé ose. Fialová čárkovaná je dusík, který vdechujete. | ring legend `^TC1 \(`, `^TC5 \(`, then `^Alveolar` | legend texts |
| 4 | Below the purple line a tissue takes up nitrogen; above it, the tissue gives it off. | Pod fialovou čarou tkáň dusík přijímá; nad ní ho odevzdává. | ring `dataRect(2, 0.7, 20, 4.0, {yScale:'yPressure'})` (the bottom phase, under the purple line) | — |
| 5 | On the bottom, compartment 1 almost catches up, at about 3.7 bar. Compartment 5 reaches only about 2. | Na dně kompartment 1 téměř dožene vdechovaný dusík, asi na 3,7 bar. Kompartment 5 dosáhne jen asi 2 bar. | round rings at the TC1 peak (20.33, 3.688) and the TC5 peak (21.9, 2.027) | TC1 max ∈ [3.6, 3.75] and < alveolar 3.911; TC5 max ∈ [1.9, 2.1] |
| 6 | Compartment 1 starts off-gassing as soon as you ascend; compartment 5 only once the switch to EAN50 drops the purple line. | Kompartment 1 začne odsycovat hned při výstupu; kompartment 5 až když přechod na EAN50 sníží fialovou čáru. | ring the TC1 crossing at 20.33, then the TC5 crossing at 21.9 with `gasSwitchDot0` | first t > 5 with TC1 > alveolar ∈ [20.0, 20.5]; with TC5 > alveolar = 21.9 ± 0.05 (the switch time) |
| 7 | The orange dashed line is ambient pressure. A tissue above it is supersaturated, as on the pressure–pressure diagram. | Oranžová čárkovaná čára je okolní tlak. Tkáň nad ní je přesycená, jako na diagramu tlak–tlak. | ring legend `^Ambient`; then `dataRect(31.7, 1.2, 38.7, 1.8)` around TC5 above the orange at 3 m | TC5 > ambient over t ∈ [31.7, 38.7] |
| 8 | On the surface, compartment 1 is already below the orange line; compartment 5 is still supersaturated and keeps off-gassing after the dive. | Na hladině je kompartment 1 už pod oranžovou čarou; kompartment 5 je stále přesycený a odsycuje i po ponoru. | round rings on TC1 and TC5 at t = 39.0 | `at(TC1, 39)` < `at(amb, 39)`; `at(TC5, 39)` > `at(amb, 39)`; TC5 decreasing for t > 39 |
| 9 | Thin dotted lines are each compartment's ceiling, on the depth axis; the deepest of all sixteen is the Profile tab's ceiling. | Tenké tečkované čáry jsou stropy jednotlivých kompartmentů, na ose hloubky; nejhlubší ze všech šestnácti je strop ze záložky Profil. | round ring at the TC1 ceiling peak (20.33, 16.82, `yDepth`); ring the TC5 ceiling peak | TC1 ceiling max = Profile `Ceiling (m)` max ± 0.01 |
| 10 | Compartments are a mathematical model, not real body tissues. | Kompartmenty jsou matematický model, ne skutečné tkáně těla. | `ring(null)`; `cursorAway()` | — |
| 11 | That's all the tabs. Try them yourself in the sandbox. Thanks for watching! | To jsou všechny záložky. Vyzkoušejte si je sami v pískovišti. Díky za pozornost! | outro card | — |

**Hidden-tab check (in `prepare()`, like cascade-filling):**
1. In a second page, open `DIVE_URL` and click `#dpc-tissue`, then the `All` button
   (`.dpc-tissue-controls button`, text `All`).
2. Compute the per-sample maximum of the 16 `TCn ceiling` datasets.
3. Click `#dpc-depth` and compare with `Ceiling (m)`. Fail if they differ by more than 0.01 m.
4. Close the page.

This guards scene 9's "deepest of all sixteen" without showing 16 lines on camera.

Notes:
- **Physics.** Scene 4 is the correct on/off-gassing rule (tissue vs inspired/alveolar pN₂).
  Series 1 avoided it on the P-P diagram. Scene 7 links it to the P-P video's supersaturation
  rule: the orange line here equals the blue y = x line there.
- `say`: "compartment one", "three point seven bar".

---

## 6. How the videos are offered on the page

**Recommendation: one button in the Dive Profile heading row that follows the active tab.**
- The button already exists (series 1, `data-video-base="../videos/sandbox-profile"`).
- When a tab is clicked, or the page applies `?chart=…` from the URL, the page re-points it:

  | Tab | Video | Title key (accessible name) |
  |---|---|---|
  | `dpc-depth` | `sandbox-profile` | `sandbox.dive.video.profile` |
  | `dpc-pressure` | `sandbox-pressure` | `sandbox.dive.video.pressure` |
  | `dpc-pp` | `sandbox-partial` | `sandbox.dive.video.partial` |
  | `dpc-gas` | `sandbox-gas` | `sandbox.dive.video.gas` |
  | `dpc-tissue` | `sandbox-tissue` | `sandbox.dive.video.tissue` |

Why this fits:
- It is consistent with the per-section placement (one button per heading).
- The video always matches what the student is looking at.
- The accessible name tells a screen-reader user which video it is.
- It adds no new UI.

Changes:
- **`VideoWalkthrough.js`:** export
  `setVideoWalkthrough(host, { base, title })`. It updates `data-video-base` and
  `data-video-title` and calls `relabel(host)`. `open()` already reads the base at click
  time, and `currentBase` caching handles the switch.
  - Test (jsdom, with the series-1 tests): after `setVideoWalkthrough`, the `aria-label`
    changes and a click opens the new base.
- **`sandbox/index.html`:** give the profile host an id (`#dive-profile-video`). Add
  `syncProfileVideo(btnId)` with the map above, and call it from both the tab click handler
  and the URL `chart` mode branch.
- **Locales (en, cs, es):**

  | Key | EN | CS |
  |---|---|---|
  | `sandbox.dive.video.pressure` | Video: reading the Pressure tab | Videonávod: jak číst záložku Tlak |
  | `sandbox.dive.video.partial` | Video: reading the Partial Pressure tab | Videonávod: jak číst záložku Parciální tlak |
  | `sandbox.dive.video.gas` | Video: reading the Gas Consumption tab | Videonávod: jak číst záložku Spotřeba plynu |
  | `sandbox.dive.video.tissue` | Video: reading the Tissue Loading tab | Videonávod: jak číst záložku Sycení tkání |

  Spanish follows the existing es file.

The alternative is a small list of five links (Q2). That is more discoverable, but it is new
UI and breaks the one-button-per-section pattern.

In recordings, the heading button is in frame before fullscreen. With the change it already
points at the current tab's video, which is consistent.

---

## 7. App issues (not for these videos)

None of these block a video. The first three are visible on camera; each says how the video
copes.

- **A1. The EAN50 tank line uses the depth line's blue.**
  - `DiveProfileChart.js`, gas-consumption datasets: `gasColors = ['#e74c3c', '#3498db', …]`.
    The second gas gets `#3498db`, which is `colors.depth`. With deco gases the stage line
    is hard to tell apart from the depth trace (measured: both `#3498db`).
  - Fix: a one-line palette change that skips the depth colour. The new colour must also
    differ from the AVG green, the reserve/MAX red and the gas-switch purple, e.g. a dark
    slate or orange.
  - **Recommended in this branch, before video 7.** Without it, video 7 says "the lighter blue
    line" and rings the line.
- **A2. The pO₂ 1.4 and 1.6 labels overlap.** Both use `position: 'end'`; at zoom 1.6 the
  boxes overlap by 15 px (`[1670, 657, 134×36]` vs `[1686, 636, 118×36]`), and at zoom 1 they
  overlap as well.
  - Fix: put the 1.6 label above its line and the 1.4 label below it (`yAdjust`), or move
    one label to `start`.
  - Small and recommended. Without it, video 6 rings the lines, not the labels.
- **A3. The fullscreen ✕ covers the top of the right-hand axis** (the `7` and `200` ticks)
  on every tab with a right axis, and on the P-P chart. The videos hide it while recording
  (`hideFullscreenClose`).
  - App fix later: reserve right padding for the button in fullscreen, or move it outside the
    plot.
- **A4. Tissue Loading: the compartment selector is outside the CSS fullscreen**, so a
  fullscreen user can't change compartments.
- **A5. Tissue Loading legend uses the raw half-time** (`fmt(…, comp.id, comp.halfTime)`
  without `fmtNum`). In Czech this reads `TC3 (12.5 min)` instead of `12,5`, which breaks
  notation rule 3. The P-P chart already uses `fmtNum`. The recordings are English, so this
  doesn't affect the videos.
- **A6. Stage end pressure 158 (chart, summary) vs 159 (table)** was known and left as is
  (decision D). Video 7 does not quote it.
- **A7. The Partial Pressure tab draws pO₂ as `ambient × (1 − fN₂)`** (code comment: "assumes
  no helium"). This is correct while helium is not exposed, but it will be wrong once trimix
  is supported. Note it for the trimix roadmap.
- **A8. A one-sample notch at surfacing.** The first surface sample (39.0 min) is still on
  the last gas, EAN50, then switches to air at 39.17 min. On the Tissue Loading tab the
  purple alveolar line dips to 0.475 bar before settling at 0.751; on the Partial Pressure
  tab, pO₂ shows 0.507 for that sample. The videos don't comment on it; V6 starts its
  post-surface ring at 39.2. App fix later: switch the breathing gas to air at the surfacing
  sample.
- **A9. Palette, readability on 4-gas dives.** Gas 2 `#34495e` ("dark grey") and gas 4
  `#7f8c8d` (grey) are distinct hex values but both read as "grey". This doesn't affect these
  two-gas videos; consider a warmer gas 4 later.

---

## 8. How I verified

All four tabs were checked in CSS fullscreen at zoom 1.6, with the generator's DPR override,
the series dive, `assertPlan`, `muteChartHover` and `fitChartFullscreen`:
- `datasets()` on every tab, which also runs the kx/ky stretch guard; it passed on all four;
- dataset labels, colours and min/max;
- scale ids, ranges and titles;
- every annotation id, content and label box (`annotationBox(…, {part:'label'})`);
- legend items and boxes;
- the ✕ button's rect.

Values were read with nearest-sample lookups: pressure at the stops; pO₂/pN₂ at the surface,
bottom, switch and end; the gas slopes; the tissue maxima, alveolar and ambient crossings,
and ceiling peaks. The aggregate-ceiling equality was checked with All compartments selected.
Screenshots are in the designer scratchpad (`tab-dpc-*-fs.png`, `tab-dpc-tissue-page.png`).

**Not yet verified:**
- real mouse clicks on the tab buttons and the tissue checkbox at zoom 1.6 (I used JS clicks);
- the timing of rings against the narration.

The implementer's `--dry` run covers the first, the reviewer's frame check the second.

---

## 9. As shipped (owner decisions S2-1…S2-3, design review 1)

The scenario files (`scripts/video/scenes/sandbox-{pressure,partial,gas,tissue}.mjs`) are the
source of truth. Recording state as §1: zoom 1.6, `muteChartHover`, `fitChartFullscreen`,
`hideFullscreenClose`, JS click to collapse the editor, the Dive Profile heading under the nav,
and `assertPlan` in `prepare()`.

| # | Video | Length |
|---|---|---|
| 5 | `videos/sandbox-pressure` | 82.2 s |
| 6 | `videos/sandbox-partial` | 89.2 s |
| 7 | `videos/sandbox-gas` | 78.4 s |
| 8 | `videos/sandbox-tissue` | 93.2 s |

**Decisions applied:**
- **S2-1:** cards come from `introTabs(lang, n)`: "Dive Profile tabs · part n of 4" /
  "Záložky profilu ponoru · díl n ze 4". Series 1 is unchanged.
- **S2-2:** `#dive-profile-video` follows the active tab. `VideoWalkthrough.js` exports
  `setVideoWalkthrough(host, { base, title })`. `sandbox/index.html` has `profileVideos` (one
  entry per `chartButtons` tab) and `syncProfileVideo(btnId)`, called from the tab handler
  and after the `?chart=` branch sets the active class. There are new locale keys
  `sandbox.dive.video.{pressure,partial,gas,tissue}` in en/cs/es. Tests:
  - jsdom: the name changes in both languages, and the next click opens the new video;
  - static: every tab has a video, its title key exists in en/cs/es, and its files are
    published.
- **S2-3 (app):**
  - **A1:** the tank-line palette is `GAS_LINE_COLORS = ['#e74c3c', '#34495e', '#16a085',
    '#7f8c8d', '#8e5a2b']`. No gas reuses the depth blue, AVG/pO₂ green, switch/pN₂ purple
    or the stop/ambient orange (tested).
  - **A2:** the pO₂ 1.6 label sits above its line and the 1.4 label below (`yAdjust` ∓11).
  - **A5:** `fmtNum` in the tissue legend.

**Text changes from §2–§5 (review 1):**
- **V7 s3:** the stage is "dark grey" / "tmavě šedá" (the drawn `#34495e`, checked). The
  lighter-blue fallback and its extra ring are gone.
- **V6 s4, s6:** rings the `pO₂ 1.4 (bottom)` and `pO₂ 1.6 (deco)` **labels**
  (`annotationBox(…, {part:'label'})`) and asserts that their boxes don't intersect.
- **V8 s8 (S2):** "…compartment 1 is already below the orange line, compartment 5 still above
  it: supersaturated. Both are above the purple line, so both keep off-gassing after the
  dive." Checks: at 39.2 and 44 min both are above alveolar and falling.
- **V8 s5 (S3):** the TC5 ring is at t = 20 (end of the bottom time), checked ∈ [1.9, 2.1].
- **V7 s6 (S4):** "The stage line flattens as you go up: about 4 bar a minute at 18 m, 2 at
  6 m. A smaller tank drops faster for the same gas." Slopes are checked over 22.2–23.2 and
  28–31 min.
- **V6 s7 (video review 1, S1):** "…that is what the deco gas is for. In EAN50 oxygen and
  nitrogen are equal, so the green line hides under the purple one as they step down
  together." / "…V EAN50 je kyslíku a dusíku stejně, takže zelená čára se schová pod fialovou
  a klesají spolu." Check: pO₂ = pN₂ ± 0.001 for every sample in 21.95–39.0 min.
- **V6 s5 (S5):** "…mild narcosis is already possible on air at this depth."
- **V7 s8 (S6):** "The green dotted line is average depth and the red dashed line maximum
  depth, on the left axis."
- **S7:**
  - V7 s5 CS "Ve 21 m přejdete na EAN50: …";
  - V5 s7 "each stop, 3 m shallower, is 0.3 bar less" / "každá další zastávka, o 3 m výš, má
    o 0,3 bar nižší tlak";
  - V7 s9 CS "třeba podle pravidla třetin";
  - V6 s7 EN "Breathing less nitrogen speeds up off-gassing; that is what the deco gas is for."

**Nits:**
- **N1:** V5's 10 m check uses the descent sample at t = 0.5 (10 m, 2.013 bar).
- **N2:** V5 s8 says "of the ascent".
- **N3:** V6 s8's ring starts at 39.2.
- **N4:** see S2-2.
- **N5:** no glide enters the ✕ area.
- **N6:** V8 checks that `Alveolar pN₂ (bar)` is present and not hidden.

**Video review 1 nits:** V5 scene 4 and V7 scene 7 start with `ring(null)` (N1). N3 (V8 "solid
lines" wording) wasn't done, because V8 wasn't re-rendered. N4 and N5 went into §7 as A8 and
A9.

**Recording details:**
- Each scene's cursor glides use `dataPoints` (one settle).
- V5 sends the cursor away after the descent glide, so it doesn't stay parked on the plateau.
- V8's hidden-tab check (All compartments: Profile ceiling = the deepest of the 16) runs in a
  second page during `prepare()`.

