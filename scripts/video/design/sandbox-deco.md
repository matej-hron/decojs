# Design: video series for the decompression sandbox (`sandbox/index.html`)

## Changelog

**Rev 2** (after design review 1, owner decisions rounds 1–2, implementer bug report):
- **Lengths (B3):** captions cut using the calibrated rate of ~2.1 words/s. V1 229 → 205 words,
  V2 205 → 182, V3 215 → 180, V4 277 → 207 (≈203 without the "%" tokens). Estimates updated below.
- **Tank column (decision 1):** fixed by the implementer. Table and §1 updated, and video 2
  now quotes the stage value from the table only, never next to the gas summary (decision D).
  R1 is resolved.
- **MOD (decision A):** my R2 premise was wrong. The app uses the diver convention
  (1 bar + 10 m/bar), where EAN50 at 1.6 is exactly 22 m, so nothing is rounded up. Video 1
  now quotes the card as shown: "deco MOD 22 m, so the plan switches at 21 m". R2 removed.
- **Runtime and ascent rate (decisions B, C):** the table now rounds runtimes up and uses the
  planner's 10 m/min. I re-measured the plan myself (§1, §7). In video 2, scene 7 is rebuilt
  around "follow the runtime, rounded up, never before", and scene 8 says "18-second move,
  still at 39". Video 4 surfaces at v=89 (`39.2 min`). All `expectText` values are updated.
- **Should-fix items:**
  - S2: "red dashed *curve*"; AVG line is "dotted".
  - S3: no "ceiling" wording in video 4.
  - S4: "slower compartment 5".
  - S5: GF as "a share of the gap".
  - S6: the grey surface line and the trail are named.
  - S7: outro path is "Decompression Modelling" / "Modelování dekomprese", read from the locale.
  - S8: Czech fixes, with "odsycování" used throughout.
  - S9: neutral wording about the reserve.
- **Nits:**
  - N1: V1 says "from 6 m to 18 m" (measured).
  - N2: GF High wording made more precise.
  - N6: ambient check against `1.013 + 40/10`.
  - N7: `assertPlan` now covers the tank column.
  - N8: `highlight(null)` before typing.
  - The reviewer's feasibility notes went into §5.2.

> **As shipped:** the videos differ from rev 2 in places (owner decisions G/H, review
> rounds, readability). See **§8 As shipped** at the end; where it disagrees with
> §1–§7, §8 wins.

---

Four short narrated walkthroughs, one per part of the page. All four use **one dive**, so each
video builds on the previous one and every number appears the same way throughout.

| # | Scenario file | Publish as | Topic | Words (EN) | Est. length |
|---|---|---|---|---|---|
| 1 | `scenes/sandbox-setup.mjs` | `videos/sandbox-setup` | Entering the dive (the editor) | 205 | ~95 s |
| 2 | `scenes/sandbox-runtime.mjs` | `videos/sandbox-runtime` | Reading the runtime table | 182 | ~87 s |
| 3 | `scenes/sandbox-profile.mjs` | `videos/sandbox-profile` | Reading the dive profile chart | 180 | ~87 s |
| 4 | `scenes/sandbox-pp.mjs` | `videos/sandbox-pp` | Reading the P-P diagram | 207 | ~98 s |

Word counts are whitespace tokens of the EN captions. Estimates use ~2.1 words/s, the reviewer's calibration against the four shipped videos, plus
the cards. If a render comes out over 100 s, the first cuts are listed in R9.

I measured every number, selector and pixel claim below in Playwright against the current page
(Chart.js 4.5.1 from the CDN). §7 lists the probes.

---

## 1. The series dive

**40 m for 20 min on air in twin 12 l, EAN50 in an S080 stage, GF 30/70, ZH-L16C,
sea level, EN 13319 water, SAC 20/15 l/min, reserve 50 bar.** The owner approved it (decision 4).

Why this dive:
- It is a typical "decompression procedures" training dive.
- It has every feature the videos must explain:
  - a gas switch (21 m);
  - six stops from 18 m to 3 m, with 1-minute deep stops and longer shallow stops;
  - a clear ceiling peak (16.8 m);
  - a GF anchor (18 m);
  - controlling compartments that change during the dive (TC1 at the bottom, TC2 at 18 m,
    TC5 at 3 m).
- Built step by step in video 1, it shows cause and effect on camera:
  - deco on a 12 l single runs out of gas;
  - EAN50 shortens the stops;
  - GF Low moves the first stop from 6 m to 18 m.
- GF 30/70 is a common technical default and not a vendor preset, so no product is named.

Videos 2–4 load the dive from the compact URL. It gives exactly the same plan as building it
in the editor:

```
sandbox/index.html?v=1&d=40&t=20&gfL=30&gfH=70&cyl=24&dg=50:11.1:50:200
```

### The plan as the page shows it (en-US, after the table fixes)

| Phase | Depth | Duration | Runtime | Gas | Tank | Chart, exact (min) |
|---|---|---|---|---|---|---|
| ↓ Des | 40 m | 2 | 2 | Air | 195 bar | 2.0 |
| ● Bottom | 40 m | 18 | 20 | Air | 120 bar | leaves 40 m at 20.0 |
| ↑ Asc | 21 m | 2 | 22 | Air | 114 bar | at 21 m at 21.9 |
| ⇄ Switch | 21 m | — | 22 | EAN50 | 200 bar | `Air → EAN50 @ 21 m` |
| ■ Stop | 18 m | 1 | 24 | EAN50 | 195 bar | 22.2 → 23.2 |
| ■ Stop | 15 m | 1 | 25 | EAN50 | 190 bar | 23.5 → 24.5 |
| ■ Stop | 12 m | 1 | 26 | EAN50 | 186 bar | 24.8 → 25.8 |
| ■ Stop | 9 m | 1 | 28 | EAN50 | 182 bar | 26.1 → 27.1 |
| ■ Stop | 6 m | 4 | 32 | EAN50 | 172 bar | 27.4 → 31.4 |
| ■ Stop | 3 m | 7 | 39 | EAN50 | 159 bar | 31.7 → 38.7 |
| ▲ Surface | 0 m | 18 s | 39 | EAN50 | 159 bar | surfaces at 39.0 |

How to read the table:
- Ascent rows show the model's exact departure time **rounded up** (decision B), so the table
  never says to leave before the model.
- Moves between stops take 0.3 min (18 s) at the planner's 10 m/min (decision C), the same
  rate as the chart's `⬆ 10 m/min` label.
- The Duration column is the whole-minute stop. Runtime is the clock to follow: 22 + 1 min +
  18 s of travel = 23.2, shown as 24.
- I re-measured this myself after the implementer's round-2 fixes, and it matches
  `r-impl-fixes-2.md`.

Other values the narration uses:
- NDL display: `7 min · Deco: 15 min stops`.
- Profile chart: `⬇ 20 m/min`, `⬆ 10 m/min`, `BOTTOM TIME: 20 min`, `MAX: 40 m`, `AVG: 24.1 m`,
  `Air → EAN50 @ 21 m`, `DECO 18 m · 1 min` … `DECO 3 m · 7 min`, `TDT: 39 min`.
  The drawn ceiling peaks at **16.8 m at 20.3 min**.
- P-P diagram: `Anchor pressure 2.81 bar (18.0 m)`; TC1 (5 min) starts at 0.751 bar; ambient
  is 5.013 bar at 40 m.

Stage (EAN50) pressures are quoted **from the table only**. The gas summary under the chart
differs by 1 bar (158 vs 159) because it uses a different integration (decision D). The videos
never show the two next to each other or quote the summary.

### Shared module

`scripts/video/lib/sandbox.mjs` lives outside `scenes/`, so nobody mistakes it for a
scenario. It exports:
- `NB` (U+00A0), `DIVE_URL`, and `EXPECTED_PLAN`: the rows above as
  `[phase, depth, duration, runtime, gas, tank]` (N7: the tank column is included now that it
  is correct).
- `assertPlan(page)`: reads `#dive-plan-table-container` and throws on any difference.
  - Every scenario calls it in `prepare()`, so a changed engine fails before recording starts.
  - Video 1 also calls it at the end of its GF scene.
- `intro(lang, n)` and `outro(lang, next)`: one card style for the whole series.
  - Footers: `DECO THEORY · DECOTHEORY.EU` (intro) and
    `EDUCATIONAL USE ONLY · NOT FOR REAL DIVE PLANNING` /
    `POUZE PRO VÝUKU · NE PRO PLÁNOVÁNÍ SKUTEČNÝCH PONORŮ` (outro).
  - The outro subtitle (S7) is built from the locale files, so it always matches the menu:
    `decotheory.eu → ${nav.sandbox.label} → ${nav.sandbox.deco}`. That gives
    `decotheory.eu → Sandbox → Decompression Modelling` /
    `decotheory.eu → Pískoviště → Modelování dekomprese`.
- The chart-geometry helpers from §5.2.

Card titles:

| # | EN title / subtitle | CS title / subtitle |
|---|---|---|
| 1 | Entering a Dive / Decompression modelling · part 1 of 4 | Zadání ponoru / Modelování dekomprese · díl 1 ze 4 |
| 2 | Reading the Runtime Table / … part 2 of 4 | Jak číst runtime / … díl 2 ze 4 |
| 3 | Reading the Dive Profile / … part 3 of 4 | Jak číst profil ponoru / … díl 3 ze 4 |
| 4 | The Pressure–Pressure Diagram / … part 4 of 4 | Diagram tlak–tlak / … díl 4 ze 4 |

All outro cards use the title "Try it yourself" / "Vyzkoušejte si to sami".

**Diagram name (S8):** the Czech UI heading `sandbox.dive.mValueChart` is `📐 Diagram tlak-tlak`
(hyphen). Change it to the typographically correct en dash, `Diagram tlak–tlak`, in the same PR
(locale-only change). The captions and card already use the en dash. Check other uses with
`grep -n "tlak-tlak" locales/cs.json` and change them too.

---

## 2. Video 1 — Entering a dive (`sandbox-setup`) · 205 words · ~95 s

**Learning goal:** the student can enter depth, time, gases and gradient factors, and sees what
each choice changes in the plan: NDL vs. deco, gas reserve, deco gas, conservatism.

**Page state:**
- `sandbox/index.html` in a fresh context, so it opens on the default "Simple 30 m"
  (30 m / 20 min, air, 12 l, GF 100/100).
- Zoom **1.25**.
- In `prepare()`, scroll so `#sandbox-layout` sits just under the nav. In that frame the Quick
  Setup and the whole written plan are visible side by side.
- Keep the editor *expanded*.

| # | EN caption | CS caption | On screen | Checks (source) |
|---|---|---|---|---|
| 1 | Part one: entering a dive into the decompression sandbox. | První díl: jak zadat ponor do dekompresního pískoviště. | intro card | — |
| 2 | Describe the dive on the left; the plan on the right recalculates as you type. | Vlevo popíšete ponor, plán vpravo se při psaní hned přepočítá. | card off; `highlight('#editor-panel')` for ~2.5 s, then `highlight('#dive-plan-table-container')` | — |
| 3 | Quick setup: 40 m deep, bottom time 20 min, counted from leaving the surface. | Rychlé nastavení: hloubka 40 m, čas na dně 20 min, počítaný od opuštění hladiny. | `highlight(null)` (N8); type 40 into `.dse-quick-depth` and 20 into `.dse-quick-time` (the deco-table `type()` helper); then `highlight('details.dse-quick-setup')` | input values 40 / 20; `tr.dse-plan-bottom .dse-plan-runtime` = `20` (the footnote and tooltip both count the descent in the bottom time) |
| 4 | Raw Bühlmann allows 11 min at 40 m on air without stops, so this is a deco dive: 8 min of stops. | Čistý Bühlmann dovolí ve 40 m na vzduch 11 min bez zastávek, takže jde o dekompresní ponor: 8 min zastávek. | `highlight('.dse-ndl-display')` | `.dse-ndl-value` = `11`, `.dse-deco-time` = `8` (GF is still 100/100, so "raw Bühlmann" is right; N3: never reuse that wording after the GF change) |
| 5 | Watch the Tank column: one 12-litre cylinder would end at 7 bar, and rows below the 50-bar reserve turn red. | Sledujte sloupec Láhev: jedna 12litrová láhev by skončila na 7 bar a řádky pod rezervou 50 bar zčervenají. | `highlight('#dive-plan-table-container .dse-plan-table:nth-of-type(2)')` | the 3 m stop row tank = `7 bar` with class `danger-row`; `.dse-reserve-input` = `50` (re-measured after the fixes: still `7 bar`, `danger-row`) |
| 6 | Open Gases and switch to twin 12-litre cylinders. Air's MOD at pO₂ 1.4 bar is 56 m. | Otevřete Plyny a zvolte dvojče 2 × 12 l. MOD vzduchu při pO₂ 1,4 bar je 56 m. | `highlight(null)`; `click('details.dse-gases > summary')`; `reveal('details.dse-gases')`; `select('.dse-gas-card:nth-child(1) .dse-gas-cylinder', 24)`; `highlight('details.dse-gases')` | `.dse-gas-card:nth-child(1) .dse-gas-mod` = `MOD: 56 m`; bottom-row tank `120 bar` |
| 7 | Add a deco gas: EAN50 in an S080 stage. Its deco MOD at pO₂ 1.6 bar is 22 m, so the plan switches at 21 m. | Přidejte dekompresní plyn: EAN50 ve stage S080. Jeho deko MOD při pO₂ 1,6 bar je 22 m, plán proto přepne ve 21 m. | `highlight(null)`; `click('.dse-add-gas-btn')`; `select('.dse-gas-card:nth-child(2) .dse-gas-cylinder', '11.1')`; `highlight('.dse-gas-card:nth-child(2) .dse-gas-mod')` (ring the MOD block, not the whole card: S1) | card-2 `.dse-gas-mod` innerText = `MOD: 18 m\ndeco MOD: 22 m\nrecommended switch: 21 m`; switch row depth `21 m`, gas `EAN50`; `.dse-gf-lock-input` **unchecked** (scene 9 depends on it) |
| 8 | Less nitrogen means faster off-gassing: the stops shrink from 8 to 5 min. | Méně dusíku znamená rychlejší odsycování: zastávky se zkrátí z 8 na 5 min. | `highlight('.dse-ndl-display')` (scrolls back up, so the table is in view too) | `.dse-deco-time` = `5`; first stop row depth `6 m` (needed for scene 10) |
| 9 | Now set the conservatism: gradient factors 30/70. | Teď nastavíme konzervativnost: gradient faktory 30/70. | `highlight(null)`; `click('details.dse-gases > summary')` (close); `click('details.dse-gf > summary')`; `reveal('details.dse-gf')`; type 30 into `.dse-gf-low-input`, 70 into `.dse-gf-high-input` | summary hint `(GF 30/70)` |
| 10 | GF Low 30 moves the first stop from 6 m to 18 m. GF High 70 limits supersaturation at the surface, so the shallow stops grow: 15 min in total. | GF Low 30 posune první zastávku z 6 m na 18 m. GF High 70 omezí přesycení na hladině, takže mělké zastávky se prodlouží: celkem 15 min. | `highlight('#dive-plan-table-container')` | first stop row depth `18 m`; `.dse-deco-time` = `15`; `assertPlan(page)` |
| 11 | Environment and Gas consumption keep their defaults: altitude 0 m, SAC 20 and 15 l/min. The sandbox is for learning, not a dive computer. | Prostředí a Spotřeba plynu necháme ve výchozím stavu: nadmořská výška 0 m, SAC 20 a 15 l/min. Pískoviště slouží k výuce, nenahrazuje počítač. | `highlight(['details.dse-environment > summary', 'details.dse-sac > summary'])`, then `highlight(null)`; `cursorAway()` | hints `(0 m · EN)` and `(SAC 20/15 L/min)` |
| 12 | Next: reading the runtime table. Thanks for watching! | Příště: jak číst runtime. Díky za pozornost! | outro card | — |

Notes:
- Scenes 11 and 12 of rev 1 were merged. "One dive, no helium" was dropped for length.
- Measured for scene 10 (N1): with EAN50 and GF 100/100 the stops are 6 m and 3 m. GF 30/100
  moves the first stop to 18 m, and GF 70 then lengthens the shallow stops to 15 min in total.
  The causal claim is therefore exact.
- `say` notes: "E A N fifty", "S zero eighty", "P O two", "M O D", "G F thirty seventy",
  "Buhlmann", "S A C".

> **Rings on the table:** the table is rebuilt (`innerHTML`) on every edit, which detaches any
> ring's target. Always `highlight(null)` *before* an edit and highlight the table again
> afterwards (R4, N8).

---

## 3. Video 2 — Reading the runtime table (`sandbox-runtime`) · 182 words · ~87 s

**Learning goal:** the student can:
- read each column;
- follow the runtime, not the summed durations, knowing it includes the moves and is rounded
  up, so it is never earlier than the model;
- find the gas switch, the last stop and the stage pressure.

**Page state:**
- `DIVE_URL`.
- In `prepare()`, click `#collapse-btn`, set zoom **1.25**, and scroll
  `.dse-plan-table-heading` to just under the nav (nav bottom is ~88 px at this zoom).
  Heading, both tables and the footnotes fit in the 940 px frame.
- Do **not** open "How the algorithm decided": it overflows the frame.

Row selectors:
- `B(n)` = `#dive-plan-table-container .dse-plan-table:nth-of-type(1) tbody tr:nth-child(n)`
- `A(n)` = `… :nth-of-type(2) tbody tr:nth-child(n)`: A1 is the ascent, A2 the switch, A3–A8
  the stops from 18 m to 3 m, A9 the surface.

Use the **union ring** (§5.1) for row ranges.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Part two: reading the runtime table. | Druhý díl: jak číst runtime. | intro card | `assertPlan` in prepare |
| 2 | Same dive: 40 m, 20 min, air, EAN50 for deco, GF 30/70: the plan you copy onto your wetnotes. | Stejný ponor: 40 m, 20 min, vzduch, EAN50 na dekompresi, GF 30/70: plán, který si opíšete na wetnotes. | card off; `highlight('#dive-plan-table-container')` | covered by `assertPlan` |
| 3 | Each row is one phase: depth, duration, runtime, gas and expected tank pressure. | Každý řádek je jedna fáze: hloubka, doba trvání, runtime, plyn a očekávaný tlak v láhvi. | `highlight('… .dse-plan-table:nth-of-type(1) thead')` | — |
| 4 | Descent to 40 m takes 2 min, then 18 on the bottom: runtime 20, as bottom time includes the descent. | Sestup do 40 m trvá 2 min, pak 18 min na dně: runtime 20, protože čas na dně zahrnuje sestup. | union ring B1–B2 | B1 duration `2`; B2 duration `18`, runtime `20` |
| 5 | Ascend to 21 m, runtime 22, and switch to EAN50; the stage starts full, at 200 bar. | Výstup do 21 m, runtime 22, a změna na EAN50; stage začíná plná, na 200 bar. | union ring A1–A2, then ring `A(2) .dse-plan-tank` | A1 depth `21 m`, runtime `22`; A2 gas `EAN50`, tank `200 bar` |
| 6 | Then a stop every 3 m: 1 min at 18, 15, 12 and 9 m, 4 min at 6 m, 7 min at 3 m. | Pak zastávka každé 3 m: 1 min v 18, 15, 12 a 9 m, 4 min v 6 m, 7 min ve 3 m. | union ring A3–A8 | depth and duration of A3–A8 |
| 7 | Follow the runtime: it includes the short moves and is rounded up, so leave 18 m at 24, never before. | Řiďte se runtime: zahrnuje i krátké přesuny a zaokrouhluje se nahoru, takže 18 m opouštíte ve 24, nikdy dřív. | ring `A(2) .dse-plan-runtime` (22) and `A(3) .dse-plan-stop` (1), then move the ring to `A(3) .dse-plan-runtime` (24) | A2 runtime `22`, A3 duration `1`, runtime `24`. **Custom guard:** for every stop, `ceil(exact departure − 1e-6)` from the chart's depth dataset (18 m leaves at 23.2) equals the table runtime, and none is smaller |
| 8 | The 3 m stop ends at 39; after an 18-second move you are on the surface, still at 39 min. | Zastávka ve 3 m končí ve 39; po přesunu, který trvá 18 s, jste na hladině, stále ve 39 min. | union ring A8–A9 | A8 runtime `39`; A9 duration `18 s`, runtime `39` |
| 9 | Tank is the expected pressure from your SAC: air ends the ascent at 114 bar, the stage at 159. | Láhev je očekávaný tlak podle vašeho SAC: vzduch skončí výstup na 114 bar, stage na 159. | ring `A(1) .dse-plan-tank`, then `A(9) .dse-plan-tank` | A1 tank `114 bar`; A9 tank `159 bar`; no `danger-row` in the table |
| 10 | The plan is the model alone; real dives add contingency plans and a computer. | Plán je jen model; skutečný ponor potřebuje i nouzové plány a počítač. | `highlight(null)` | — |
| 11 | Next: reading the dive profile chart. Thanks for watching! | Příště: jak číst profil ponoru. Díky za pozornost! | outro card | — |

Notes:
- **Scene 7 (B1)** is rebuilt around the fixed table. It teaches the tech convention: follow
  the runtime, which can be later than the sum of the stop durations, but never earlier than
  the model. The rev-1 "jump by 2" example is gone: the only 2-minute step left (26 → 28) is
  just rounding up 27.1.
- **Scene 8:** 38.7 + 0.3 = 39.0, so "still at 39" is exact. It agrees with video 3's
  `TDT: 39 min` (N4).
- **Scene 9:** the stage value comes from the table only (decision D). It states values and
  does not judge the gas plan against the reserve (S9); the red reserve rows are already
  shown in video 1.
- `say`: "eighteen seconds", "two hundred bar", "one hundred and fifty nine".

---

## 4. Video 3 — Reading the dive profile chart (`sandbox-profile`) · 180 words · ~87 s

**Learning goal:** the student can read:
- the axes;
- the profile line and the bottom-time bracket;
- the ceiling: what it means and why it forbids a direct ascent;
- the gas switch and the stop staircase;
- TDT and average depth.

**Page state:**
- `DIVE_URL`, zoom **1** (fixed-position fullscreen and body zoom don't mix).
- Click `#collapse-btn`, then scroll the Dive Profile section heading under the nav.
- In scene 2, press the chart's own fullscreen button,
  `#dive-profile-container .dpc-fullscreen-btn`. This is a **CSS** fullscreen
  (`.dpc-fullscreen`, `position: fixed`, `z-index: 1000`):
  - the chart fills 1880×900 px;
  - the overlay (z-index 2147483000) still draws on top;
  - real browser fullscreen would hide the overlay, so the chart can never use it.

Ring and cursor positions come from the chart instance (§5.2). Annotation ids:
`descentLabel`, `bottomTimeBracket`, `maxDepthLine`, `avgDepthLine`, `ascentLabel`,
`totalDiveTime`, `surfaceIntervalLabel`, `stopLabel0…5`, `gasSwitch0`, `gasSwitchDot0`.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Part three: reading the dive profile chart. | Třetí díl: jak číst profil ponoru. | intro card | `assertPlan` |
| 2 | These buttons switch the chart's view. We stay on Profile, in full screen. | Tlačítka přepínají pohled grafu. Zůstaneme u profilu, na celou obrazovku. | `highlight('.chart-controls')`; `highlight(null)`; `click('#dive-profile-container .dpc-fullscreen-btn')`; wait 400 ms (the chart resizes at 0, 100 and 300 ms) | `#dpc-depth` has class `active` |
| 3 | Time runs left to right in minutes; depth runs down in metres, with the surface at zero. | Čas běží zleva doprava v minutách, hloubka roste dolů v metrech, hladina je nula. | ring the x scale box, then the y scale box, then a thin ring along y = 0 | — |
| 4 | The blue line is you: down at 20 m/min to 40 m, and 20 min of bottom time, the yellow bracket. | Modrá čára jste vy: sestup 20 m/min do 40 m a 20 min času na dně, které ukazuje žlutá závorka. | ring `descentLabel` → `maxDepthLine` label → `bottomTimeBracket` (glide the cursor along) | annotation contents `⬇ 20 m/min`, `MAX: 40 m`, `BOTTOM TIME: 20 min` |
| 5 | The red dashed curve is the ceiling: the shallowest depth allowed right now. At the end of the bottom time it is almost 17 m. | Červená čárkovaná křivka je strop: nejmenší hloubka, která je právě teď dovolená. Na konci času na dně je skoro 17 m. | **at scene start**, before the words "red dashed": `ring(null)` and glide the cursor along the ceiling curve from t = 3 to its maximum; then a round ring at (20.3 min, 16.8 m) (S2: the red dashed `MAX` line was ringed just before, so the motion must disambiguate) | max of the `Ceiling (m)` dataset ∈ [16.5, 17.0], reached at t ∈ [20, 21] |
| 6 | So no direct ascent: the shaded band is off limits. Ascend to 21 m and switch to EAN50 at the purple dot. | Přímý výstup tedy nejde: stínované pásmo je zakázané. Vystoupáte do 21 m a u fialové tečky přejdete na EAN50. | ring the shaded area (rect: t 3–39, depth 0 → 17), then union ring `gasSwitchDot0` + `gasSwitch0` | `gasSwitch0` = `Air → EAN50 @ 21 m` |
| 7 | Then the stops, a staircase every 3 m, each deeper than the ceiling while your tissues off-gas. | Pak zastávky, schody po 3 m, každý hlouběji než strop, zatímco probíhá odsycování tkání. | rings on `stopLabel0` … `stopLabel5` | labels `DECO 18 m · 1 min` … `DECO 3 m · 7 min`; **no** sample where ceiling > depth (custom check over both datasets) |
| 8 | The ceiling rises to the surface; you surface at 39 min, the total dive time. | Strop stoupá k hladině; vynoříte se ve 39 min, to je celkový čas ponoru. | ring `totalDiveTime` | `TDT: 39 min`; equals the table's last runtime `39`, and the depth dataset reaches 0 m at 39.0 |
| 9 | The green dotted line is the average depth, 24.1 m, used for gas planning. | Zelená tečkovaná čára je průměrná hloubka, 24,1 m, potřebná pro plán spotřeby plynu. | ring the `avgDepthLine` label box | `AVG: 24.1 m` |
| 10 | The ceiling line is a guide for your current depth; the planner puts stops on a 3 m grid, a little deeper. | Čára stropu je vodítko pro vaši aktuální hloubku; plánovač dává zastávky po 3 m, o kus hlouběji. | `ring(null)`; `cursorAway()` | — |
| 11 | Next: the pressure–pressure diagram. Thanks for watching! | Příště: diagram tlak–tlak. Díky za pozornost! | outro card | — |

Notes:
- Say "about seventeen metres" and "T D T".
- Scene 7 says "deeper than the ceiling", not "below", because "below" is ambiguous on this
  chart.
- Since decision C, the `⬆ 10 m/min` label on screen matches the table's ascent rate. Videos 2
  and 3 now state one ascent model (B2).

---

## 5. Video 4 — Reading the P-P diagram (`sandbox-pp`) · 207 words · ~98 s

**Learning goal:** the student knows:
- what each axis means;
- how to tell apart the ambient line, the surface line, the M-value, the two GF lines and the
  GF corridor;
- what the anchor is;
- how to follow one tissue through the dive: on-gassing at depth, the controlling compartment
  at a stop, and surfacing just under GF High.

**Page state:**
- `DIVE_URL`, zoom 1. Collapse the editor and scroll the P-P section into view.
- In `prepare()`, click `#mvalue-container .mvc-fullscreen-btn`. The
  `.mvc-wrapper.mvc-fullscreen` is a CSS fullscreen like the profile chart's. It shows the
  compartment selector, the status line, the timeline, the chart and the mini profile, all in
  1920×940.
- Default compartment: TC1.

Controls:

| What | Selector or API | Notes |
|---|---|---|
| Timeline slider | `#mvalue-container .mvc-timeline input[type=range]` | 0–100, `index = round(v/100 · maxIndex)`; `ui.slide()` works unchanged |
| Time readout | `#mvalue-container .mvc-timeline > span` | |
| Status line | `#mvalue-container .mvc-controlling-status` | |
| Compartment | `click('#mvalue-container .mvc-compartment-option[data-compartment-id="N"]')` | selects only that one |
| Canvas | `#mvalue-container canvas` | scales `x`/`y` |

Dataset labels (en-US):
- `Ambient Line (y = x)`
- `Surface (1.013 bar)`: the grey dashed vertical line
- `Anchor pressure 2.81 bar (18.0 m)` (flag `mvalueAnchor`)
- `M-value TCn`, `GF Low (30%) TCn`, `GF High (70%) TCn`, `GF Corridor TCn`, `Trail TCn`
- the current point: flag `mvalueCurrentPoint`, label `TCn (h min)`

The P-P timeline comes from the tissue simulation, so the table fixes don't affect it.

Slider stops (measured):

| v | readout | TC shown | point | note |
|---|---|---|---|---|
| 0 | `0.0 min @ 0.0 m` | TC1 | (1.013, 0.751) | |
| 45 | `20.0 min @ 40.0 m` | TC1 | (5.013, 3.683) | |
| 50 | `22.2 min @ 18.0 m` | TC2 | (2.813, 3.230); corridor 3.565 | status: `controlling compartment: TC2` |
| 80 | `35.4 min @ 3.0 m` | TC5 | (1.313, 1.687), above the corridor left end 1.611 | status: `TC5` |
| 88 | `38.7 min @ 3.0 m` | TC5 | (1.313, 1.599); corridor left end 1.611 | `no decompression ceiling` |
| 89 | `39.2 min @ 0.0 m` | TC5 | (1.013, 1.587) < 1.611, > 1.013 | first surface sample: supersaturated, under GF High |

The timeline continues for ~5 min of surface interval, up to `44.0 min @ 0.0 m`. Never slide past v=89.

| # | EN caption | CS caption | On screen | Checks |
|---|---|---|---|---|
| 1 | Part four: reading the pressure–pressure diagram. | Čtvrtý díl: jak číst diagram tlak–tlak. | intro card (fullscreen already on underneath) | `assertPlan` |
| 2 | Across: ambient pressure, from 1 bar at the surface, the grey line, to 5 bar at 40 m. Up: nitrogen in one compartment. | Vodorovně: okolní tlak, od 1 bar na hladině, šedá čára, po 5 bar ve 40 m. Svisle: dusík v jednom kompartmentu. | card off; ring the x scale box; ring the surface line (`dataRect(1.0, 0, 1.03, yMax)`); ring the y scale box | N6: `Surface (1.013 bar)` dataset present; TC1 point x at v=45 (checked in scene 4) = `1.013 + 40 · results.pressurePerMeter` ± 0.01 |
| 3 | The dot is compartment 1, half-time 5 min, with 0.75 bar of nitrogen. Above the blue line, tissue is supersaturated. | Tečka je kompartment 1, poločas 5 min, s 0,75 bar dusíku. Nad modrou přímkou je tkáň přesycená. | ring the TC1 selector label; round ring at the point; then ring a segment of the ambient line (rect x 2.5–4, y 2.5–4) | point label `TC1 (5 min)`; y ∈ [0.745, 0.755] |
| 4 | Descend and stay 20 min: the dot jumps right, then climbs as the tissue takes up nitrogen; the faint line is its path. | Sestup a 20 min na dně: tečka skočí doprava a pak stoupá, jak tkáň přijímá dusík; slabá čára je její dráha. | `slide(timeline, 45, 3500)`; then ring a stretch of the trail (S6) | readout `20.0 min @ 40.0 m`; N6 check |
| 5 | The dotted line is the M-value, the compartment's limit. GF Low allows 30 % of the gap between it and the blue line, GF High 70 %. | Tečkovaná čára je M-hodnota, nejvíc dusíku, kolik kompartment snese. GF Low dovolí 30 % rozdílu mezi ní a modrou přímkou, GF High 70 %. | round ring on the M-value line at x = 1.6; then on `GF Low (30%) TC1` at x = 2; then on `GF High (70%) TC1` at x = 2 | datasets `M-value TC1`, `GF Low (30%) TC1`, `GF High (70%) TC1` present |
| 6 | The solid line is the ascent limit: GF Low at the orange anchor, the 18 m first stop, rising to GF High at the surface. | Plná čára je limit pro výstup: GF Low u oranžové kotvy, tedy první zastávky v 18 m, k hladině roste na GF High. | ring the anchor's legend hit box (`chart.legend.legendHitBoxes`), then the anchor line; glide along the corridor from right to left, ending on the surface line | anchor label `Anchor pressure 2.81 bar (18.0 m)`; anchor depth = first-stop depth from `assertPlan` |
| 7 | At the first stop, compartment 2 is closest to its limit: the controlling compartment, outlined in the selector. | Na první zastávce je nejblíž svému limitu kompartment 2: je řídicí, v nabídce je zvýrazněný. | `slide(timeline, 50, 1500)`; click TC2; ring the TC2 selector label and a round ring on its point near the corridor end | readout `22.2 min @ 18.0 m`; status contains `controlling compartment: TC2` |
| 8 | On the last stop the slower compartment 5 controls: to surface, its dot must drop below the solid line's left end. | Na poslední zastávce řídí pomalejší kompartment 5: před vynořením musí jeho tečka klesnout pod levý konec plné čáry. | click TC5; `slide(…, 80, 2000)` (check); `slide(…, 88, 1200)`; round ring on the corridor's left end (1.013, 1.611) and on the dot | at v=80 status contains `TC5`; at v=88 point y < corridor-left y |
| 9 | Surfaced: the dot is above the blue line, supersaturated, but just under the limit you chose. | Na hladině: tečka je nad modrou přímkou, přesycená, ale těsně pod zvoleným limitem. | `slide(…, 89, 800)`; round ring on the dot | readout `39.2 min @ 0.0 m`; point y > x and y < corridor-left y |
| 10 | One compartment is shown; the plan respects all sixteen. A model, not a guarantee against decompression sickness. | Je vidět jeden kompartment, plán hlídá všech šestnáct. Model, ne záruka proti dekompresní nemoci. | `ring(null)`; `cursorAway()` | — |
| 11 | Try it yourself in the Deco Theory sandbox. Thanks for watching! | Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost! | outro card | — |

Changes from rev 1:
- Old scenes 4 and 3 are merged; the ambient line now sits in scene 3.
- Old scenes 6 and 7 are merged.
- The "dot moves left" sentence is dropped; the slide shows it.
- Scene 8 (S4) says "slower compartment 5" (half-time 27 min of up to 635).

Timing: the slowest action is scene 8 (click + 2.0 s + check + 1.2 s + rings, about 5 s) under
~10 s of narration. Scene 4's 3.5 s slide sits under ~10 s.

Notes on getting the physics right in narration:
- **Never** say "below the blue line = on-gassing". On- and off-gassing are set by the
  inspired/alveolar pN₂, not by ambient pressure. The blue line only separates undersaturated
  from supersaturated tissue.
- **No "ceiling" in video 4 (S3).** Do not ring or quote the status line's "GF-ramp ceiling …"
  figure. It differs from the profile chart on purpose (wiki Algo-06, "Three different
  ceilings"); see R3.
- "TC" is the page's label. Say "compartment two" and caption it "compartment 2" /
  "kompartment 2" (the Czech UI term is *řídicí kompartment*).
- `say`: "M value", "G F low", "G F high", "pressure pressure diagram".
- The Alveolar pN₂ toggle would show the true on/off-gassing boundary. It is a good topic for a
  future video, but it is out of scope here (S6).

### 5.1 Changes to the generator (`make-video.mjs` + `overlay.js`)

Small and additive; existing scenarios stay unchanged.

1. **Rings at viewport rectangles:** `ui.ring(rects | null, { round })`.
   - The overlay gets `__video.ring(rects, opts)`, which reuses `.vid-ring` with
     `position: fixed` coordinates.
   - `round: true` sets `border-radius: 50%`, for points.
   - `ring(null)` and `highlight(null)` both clear all rings.
2. **Union highlight:** `ui.highlight(sels, { union: true })` draws one ring around the bounding
   box of all matched elements and tracks it every frame.
3. **Cursor to coordinates:** expose the existing `glide` as `ui.glideTo(x, y, ms)`.
4. Document all three in `scripts/video/README.md`.

### 5.2 Chart geometry helpers (`scripts/video/lib/sandbox.mjs`)

Each helper takes `(page, canvasSelector, …)` and returns **viewport** coordinates:

```js
// inside page.evaluate:
const chart = Chart.getChart(document.querySelector(sel));
const r = chart.canvas.getBoundingClientRect();
const k = r.width / chart.width;            // CSS px → viewport px (robust to body zoom)
const vp = (x, y) => ({ x: r.left + x * k, y: r.top + y * k });
```

- `annotationBox(id)`: from `Chart.registry.getPlugin('annotation').getAnnotations(chart)`,
  the element with `options.id === id` → `{left, top, width, height}` (pad ~6 px).
- `dataPoint(xVal, yVal, yScale = 'y')` and `dataRect(x0, y0, x1, y1, yScale)`.
- `scaleBox(id)`, `legendBox(i)` (`chart.legend.legendHitBoxes[i]`), and `dataset(predicate)`
  for numeric checks.
- **Settle inside the helper, not in each scene** (reviewer feasibility b). Every helper first
  awaits two `requestAnimationFrame`s plus 150 ms:
  - DiveProfileChart resizes at 0, 100 and 300 ms after fullscreen, so wait 400 ms after
    entering it;
  - MValueChart rebuilds the chart on every compartment or time change.
- **Keep rings out of the top-right 120×120 px of the P-P plot** (feasibility a). The
  fullscreen close button (×) sits there, over the ambient line's end.

### 5.3 Changes to the page and `VideoWalkthrough.js`

**Placement: one button per section, next to its heading.** The owner chose this (decision 3).

| Video | Host placement |
|---|---|
| 1 Setup | in `.editor-header`, between the `h2` and `#collapse-btn`; hidden when `.sandbox-editor-panel.collapsed` |
| 2 Runtime | in a new heading row around `h3.dse-plan-table-heading` |
| 3 Profile | heading row around `h3[data-i18n="sandbox.dive.profileChart"]` |
| 4 P-P | heading row around `h3[data-i18n="sandbox.dive.mValueChart"]` |

⚠ The host must be a **sibling** of the `h3`, never a child. The i18n pass sets `textContent`
on `[data-i18n]` headings and would delete the button. Use a wrapper
`<div class="sandbox-section-head">` (flex, `space-between`, `align-items: center`,
`flex-wrap: wrap`).

Component changes (with tests):
- **Inline variant `.video-walkthrough--inline`:** `margin-top: 0`, and the button in a
  `var(--primary)` outline style at a smaller size. The current hero style is white on
  transparent, which is invisible on white panels.
- **Accessible names:** an optional `data-video-title="<i18n key>"` sets `aria-label` and
  `title`, and is relabelled on `languagechange`. The visible text stays `common.video.open`.
- **New locale keys** `sandbox.dive.video.setup|runtime|profile|pp` (en + cs):
  "Video: entering a dive" / "Videonávod: zadání ponoru", "Video: reading the runtime table" /
  "Videonávod: jak číst runtime", "Video: reading the dive profile" / "Videonávod: jak číst
  profil ponoru", "Video: reading the P-P diagram" / "Videonávod: jak číst diagram tlak–tlak".
- **Initialisation:** call `initVideoWalkthroughs()` from the sandbox's module script.
- **Tests:** a jsdom test for `data-video-title` → `aria-label` and the relabel on
  `languagechange`.

The buttons will show in the recorded frames, so render **after** the page change lands.

---

## 6. Risks and open issues

**R1 — Tank column: resolved** (decision 1, implementer fix + regression test). One 1-bar
difference remains between the table and the gas summary for EAN50 (159 vs 158). Decision D:
leave it, and quote the table only.

**R2 — removed** (decision A). The MOD in the diver convention is exactly 22 m. My rev-1 claim
of "21.9 rounded up" used a different surface-pressure convention.

**R3 — Three different ceilings on screen.** The profile chart (16.8 m), the P-P status line
(15.2 m at the end of the bottom time, 13.0 m at the 18 m stop) and the first stop (18 m)
disagree by design (wiki Algo-06). Videos quote only the profile-chart value, and video 4 never
says "ceiling". The status line remains readable in video 4. Accept it.

**R4 — Rings lose their target on DOM re-render** (table, gas cards). Clear rings before each
edit, and ring stable containers.

**R5 — Unpinned Chart.js CDN.** A major release could break `getAnnotations`, `legendHitBoxes`
or the layout. The number checks catch drift in values, not in looks.

**R6 — Intermediate recalculation while typing** (a 4 m plan for a moment). Rings are cleared
before typing (N8), so the "No limit" flash isn't framed.

**R7 — Pronunciation** of EAN50, S080 and Bühlmann can't be checked by ear here. The reviewer
should listen.

**R8 — Default stage cylinder** (`_addGas` comment "7L" vs the 10 l it picks). Cosmetic;
video 1 sets S080.

**R9 — Length.** If a render exceeds 100 s, cut in this order:
1. V4 scene 4's last sentence (trail);
2. V4 scene 2's "the grey line" (it is named again in scene 6);
3. V1 scene 11's second sentence (the outro footer carries the disclaimer);
4. V3 scene 9 (AVG).

---

## 7. How I verified (probe notes)

Static server on the repo root, Playwright from `scripts/video/node_modules`, viewport
1920×940, fresh context, service workers blocked.
- **Editor walk-through (rev 1):** built the dive step by step and read the NDL display, the
  summary hints and the plan after each step:

  | Step | Result |
  |---|---|
  | 30/20 | NDL 20, "At limit" |
  | 40/20 | NDL 11, deco 8; 12 l ends at 7 bar |
  | Doubles | 120 bar bottom |
  | + EAN50 | deco 5; first stop 6 m; switch at 21 m |
  | GF 30/100 | first stop 18 m |
  | GF 30/70 | deco 15, NDL 7 |

- The compact URL gives the same plan as the editor.
- **Profile chart:** annotation contents and boxes via `getAnnotations`; ceiling vs depth over
  all 268 samples (no crossing; maximum 16.82 m at 20.33 min).
- **P-P:** slider sweep 0–100 for the controlling compartment; point and corridor values for
  TC1, TC2 and TC5.
- **Rev 2, after the implementer's round-2 fixes** (tank, round up, 10 m/min): re-ran the
  editor walk-through and the URL plan (table in §1), the annotations, the ceiling scan and
  the P-P stops.
  - Unchanged: NDL 11 / deco 8 / 7 bar `danger-row`, deco 5 with the first stop at 6 m,
    GF 30/100 first stop 18 m, deco 15, MOD texts, lock unchecked, every annotation, the
    16.82 m ceiling with no crossing, and P-P values at v = 0/45/50/80/88.
  - New: the departures from the depth dataset (23.2, 24.5, 25.8, 27.1, 31.4, 38.7) round up
    exactly to the table runtimes; the surface is at 39.0; the P-P v=89 readout is
    `39.2 min @ 0.0 m`.

---

## 8. As shipped (after implementation, reviews 1–2 and owner decisions G/H)

The scenario files (`scripts/video/scenes/sandbox-*.mjs`) are the source of truth; this
section records where they differ from rev 2 above.

| # | Video | Length | Zoom |
|---|---|---|---|
| 1 | `videos/sandbox-setup` | 99.1 s | 1.4 |
| 2 | `videos/sandbox-runtime` | 88.6 s | 1.45, sticky nav unstuck (`unstickNav`) so heading, both tables and footnotes fill the frame |
| 3 | `videos/sandbox-profile` | 80.3 s | 1.6 (CSS fullscreen fitted with `fitChartFullscreen`) |
| 4 | `videos/sandbox-pp` | 97.9 s | 1.4 (CSS fullscreen fitted; above 1.4 the selector wraps and the plot gets too flat) |

**Readability (lead L1–L3):** chart scenes are no longer recorded at zoom 1. With zoom ≠ 1 the
generator reports the zoom as `devicePixelRatio`, so Chart.js draws the canvas at the recorded
size (sharp text), and `fitChartFullscreen(page, zoom)` sizes the charts' CSS fullscreen to the
zoomed viewport (it is in viewport units, which body zoom does not scale). The geometry helpers
use separate x and y factors (`kx`, `ky`): under zoom the canvas box scales differently per axis.

**Text changes:**
- **V1 scene 11 (R9 cut 3):** the second sentence ("The sandbox is for learning, not a dive
  computer") was cut to stay under 100 s; the outro footer carries the disclaimer. CS uses
  the accusative "Prostředí a Spotřebu plynu necháme…".
- **V1 scene 7:** after ringing the EAN50 MOD block, the Switch row in the table is ringed
  ("…so the plan switches at 21 m"), because at zoom 1.4 it is out of view.
- **V1 scene 10:** rings the ascent table (the whole plan is taller than the frame at 1.4).
- **V2 scenes 7–8 (decision H, replaces rev 2 and review-2 S1/S3):** the video explains how to
  *read* the runtime, not how it is built. There is no ceil guard; plain `expectText` checks only.
  - s7: "Runtime is the dive clock, in whole minutes, when each step ends. Watch your timer: at 24
    you leave 18 m."
  - s8: "The last stop, at 3 m, ends at runtime 39; an 18-second ascent to the surface ends the
    dive." / CS "…; 18sekundový výstup na hladinu ponor ukončí."
- **V2 scene 9 (N4):** "…air is at 114 bar when you switch, the stage ends at 159 bar."
- **V3 scene 8:** the caption names the label: "…the total dive time (TDT)."
- **V4 scene 7 (S5):** "At the first stop, compartment 2's dot would meet its solid line first
  if you ascended: it is the controlling compartment, outlined in the selector." The dot is
  ringed first, then the selector.
- **V4 scene 8 (review S2):** "Later on the last stop, the slower compartment 5 takes over: …".
  Compartments 3 and 4 control earlier on the way up. The slide reaches v=80 before TC5 is
  selected, so the outline the viewer sees is TC5's.
- Card subtitles use the nav's capitals: "Decompression Modelling · part n of 4" (N6). Captions
  write `L/min` in EN and `l/min` in CS (N5).

**Recording-only page tweaks (lib):**
- `muteChartHover`: no Chart.js tooltips while the visible cursor glides (V1, V3, V4).
- `fitChartFullscreen` and `unstickNav`, as above.
  `fitChartFullscreen` also swaps the profile fullscreen's 20 px padding for an equal inset,
  because under zoom Chart.js would otherwise size the canvas to the padding box and CSS would
  stretch it non-uniformly. The geometry helpers fail the render if `kx` and `ky` differ by
  more than 2 %.
- V3 scene 6 rings the gas-switch label and the dot separately, as a box and a circle; one box
  around both would cut through the `DECO 18 m` label.
- Clicks in `prepare()` are JS clicks, so no cursor is parked on screen.
- New rings start each scene clean (`ring(null)`).

**Checks:** as in §2–§5, minus the dropped ceil guard. `assertPlan` uses the table in §1. The
generator's `--dry` mode runs every action and check without TTS or recording.

