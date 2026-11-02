# P1 pilot — Hustota + kostra vodního sloupce + rozcestník: implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** První odpřednášitelná kapitola kurzu P1 (Hustota, slidy 8–9) na webu: rozcestník sekce,
kapitola se dvěma modely, znovupoužitelná kostra vodního sloupce s rozhraním vrstev, sdílené bloky
pojmů pro „Více“, „Procvič si“ z CMAS otázek, navigace.

**Spec:** `docs/superpowers/specs/2026-11-02-p1-lecture-port-design.md` (§4–§7, §9, §12). Rozsah = 1. týden.

**Architecture:** Bez build kroku, ES moduly. Stránky kurzu v novém adresáři `p1/` (jedna úroveň
jako `sandbox/`, takže stávající logika prefixu `../` v `nav.js`/`i18n.js` stačí rozšířit o `p1`).
Sdílené bloky pojmů = HTML fragmenty `concepts/cs/<id>.html`, vkládané za běhu do
`<div data-concept="<id>">` uvnitř `<details class="course-more">`; cachované v `sw.js`, takže fungují
offline. Modely kreslí SVG v pixelových souřadnicích (ne Chart.js): žádná CDN závislost (offline na
přednášce), ostré a čitelné písmo na projektoru i v mobilu, sdílená kostra s vodním sloupcem.

**Tech stack:** vanilla JS (ES modules), SVG, CSS tokeny z `css/styles.css`, testy `node --test`.

## Soubory

| Soubor | Účel | Kdo |
|---|---|---|
| `js/physics/waterDensity.js` | hustota vody z teploty (Tanaka 2001), led | lead (TDD) |
| `js/physics/lakeProfiles.js` | ilustrativní teplotní profily lomu po měsících | lead (TDD) |
| `js/course/p1Course.js` | definice kurzu: kapitoly v pořadí přednášky, stav, otázky slidu 6 | lead |
| `js/course/concepts.js` | vkládání sdílených bloků pojmů | lead (TDD čisté části) |
| `js/course/practice.js` | „Procvič si“ — otázky podle ID z `data/quiz-physics.json` | lead (TDD čisté části) |
| `js/course/chapter.js` | obsah sekcí, „Rozbalit vše“, předchozí/další, init stránky | lead |
| `js/course/modelParams.js` | předvolby modelů v URL (čtení/zápis, validace) | lead (TDD) |
| `js/components/WaterColumn.js` | **kostra vodního sloupce** s rozhraním vrstev | Opus subagent |
| `js/components/waterColumn/temperatureLayer.js` | vrstva „teplota“ | Opus subagent |
| `js/components/DensityCurve.js` | SVG graf hustota–teplota s bodem | lead |
| `docs/course/water-column.md` | dokumentace rozhraní vrstev | Opus subagent |
| `concepts/cs/*.html` | sdílené bloky (hustota, anomálie vody, vrstvení jezera) | lead |
| `p1/index.html`, `p1/hustota.html` | rozcestník, kapitola | lead |
| `css/course.css` | styly kurzu (jádro/Více, projektor, modely) | lead |
| `js/nav.js`, `js/i18n.js`, `locales/*.json`, `index.html`, `scripts/build-pages.mjs`, `js/quiz.js` | navigace, karta, publikace, `?kategorie=` v kvízu | Sonnet subagent |
| `docs/notation/glossary.md` | Celsiova teplota | lead |
| `sw.js`, `package.json`, `css/styles.css` (verze) | integrace | lead (na konci) |

Subagenti necommitují a nesahají na `package.json`/`sw.js` — integruje lead.

## Úkol 1 — fyzika (lead, TDD)

- [ ] `tests/course-p1.test.mjs`: `waterDensity(4)` ≈ 999,97; maximum v 3,98 °C; `waterDensity(0)` ≈ 999,84;
      `waterDensity(10)` ≈ 999,70; `waterDensity(25)` ≈ 997,05; mimo 0–40 °C → `RangeError`;
      `densityAt(-2)` → `{ phase: 'ice', rho: 917 }`; `densityAt(4).phase === 'water'`.
- [ ] `lakeProfiles`: 12 měsíců; u dna (40 m) 4–5 °C každý měsíc; leden/únor led a 0 °C pod ledem, teplota
      s hloubkou roste (inverzní); srpen: hladina > 20 °C, monotónně klesá; duben a listopad promíchání
      (rozdíl hladina–dno ≤ 2 °C); fáze `zima | jarni-promichani | leto | podzimni-promichani`.
- [ ] Implementace, zelené testy, commit.

## Úkol 2 — kostra vodního sloupce (Opus subagent)

Rozhraní (zafixovat před 2. týdnem, viz `docs/course/water-column.md`):

```js
const col = createWaterColumn(host, { maxDepth: 40, depth: 0, surface: 'water' | 'ice',
                                      depthLabel: 'Hloubka', aside: true });
col.addLayer(layer);            // vrstva: { id, render(g, geom, state), readout?(state), aside?: bool, legend? }
col.setState({ depth, surface, ...vlastníKlíčeVrstev });  // překreslí všechny vrstvy
col.on('change', state => {});  // posuvník/tažení hloubky
col.destroy();
```

- `geom`: `{ width, height, column: {x,y,w,h}, aside: {x,y,w,h} | null, depthToY(h), yToDepth(y), ticks }`.
- Kostra kreslí: osu hloubky (m, celé metry, popisky `fmtNum`), sloupec vody, hladinu / led, ukazatel
  hloubky (čára + popisek), posuvník hloubky (`<input type=range>`, funguje prstem i myší, klávesnice),
  tažení ukazatele v SVG (pointer events), odečet (`readout`) všech vrstev pro aktuální hloubku.
- Pixelové souřadnice (ResizeObserver), písmo ≥ 14 px v mobilu, větší na širokém displeji; barvy z CSS
  proměnných, funguje v `data-theme="dark"`.
- Vrstva „teplota“: `createTemperatureLayer({ profile: depth => °C, range: [0, 25] })` — barevný sloupec
  podle teploty (stupnice studená→teplá), v `aside` profil teploty s osou „teplota / °C“, odečet
  „teplota 4&nbsp;°C“, volitelné pásma (`bands: [{from,to,label}]`, např. teplá vrstva / termoklina).
- Testy čistých částí (geometrie, ticks, barevná stupnice) v `tests/water-column.test.mjs`.

## Úkol 3 — navigace a publikace (Sonnet subagent)

- `nav.js`: položka „Kurzy“ (`nav.courses.label`) mezi Home a Sandbox; podmenu „P1 – Fyzika“
  (`p1/index.html`, `nav.courses.p1`) a „Hustota“ (`p1/hustota.html`, `nav.courses.p1Density`);
  `SUBFOLDERS` + `p1`. `i18n.js` `getLocalePrefix` + `/p1/`.
- `locales/{cs,en,es}.json`: klíče výše + karta úvodní stránky (`home.topics.courseP1`, `…Desc`,
  `…Links`); en/es popisek nese „(česky)“ / „(en checo)“ — obsah kurzu je zatím jen česky.
- `index.html`: karta „Kurz P1 – Fyzika“ jako první v mřížce (rozcestník + Hustota).
- `scripts/build-pages.mjs`: `SITE_DIRS` + `p1`, `concepts`.
- `js/quiz.js`: `?kategorie=<slug>` předvybere kategorii (neznámý slug ignorovat).
- Test `tests/course-nav.test.mjs`: každá kapitola `status: 'ready'` z `js/course/p1Course.js` je
  v podmenu Kurzy a naopak; build-pages publikuje `p1/` a `concepts/`.

## Úkol 4 — kapitola, rozcestník, bloky, CSS (lead)

- `p1/hustota.html`: úvod + háčky; sekce 1 Definice a tabulka (slide 8); sekce 2 Závislost na teplotě
  (slide 9) + model 1; sekce 3 Jezero/lom během roku + model 2; řešený příklad (odpověď v `<details>`);
  „Procvič si“ (otázky 6, 7, 8) + odkaz `quiz-physics.html?kategorie=vlastnosti-vody-vzduchu`;
  předchozí/další. Jádro = text slidu, „Více“ = `<details class="course-more">` + sdílený blok.
- `p1/index.html`: rozcestník (kapitoly v pořadí, stav), otázky slidu 6 s odkazem na kapitolu.
- URL předvolby: `?teplota=<°C>` (model 1), `?mesic=<1–12>&hloubka=<m>` (model 2), hash = model.
- Opravy slidu podle §9 (4° → 4&nbsp;°C, „při 10&nbsp;°C“ u vzduchu, desetinná čárka/nbsp, 1020–1030 →
  1&nbsp;020–1&nbsp;030).

## Úkol 5 — integrace a ověření (lead)

- `sw.js` STATIC_ASSETS všech nových souborů; `package.json` test skript; glossary (Celsiova teplota).
- `npm test`, `node scripts/build-pages.mjs /tmp/...`.
- Chrome: 390×844, 1280×720, 1920×1080, světlé/tmavé, offline, URL s předvolbou → screenshoty.
- Kontrola notace (skill fixing-physics-notation) na diffu.
- Review (Opus subagent), opravy, merge origin/main, verze, PR, CI.
