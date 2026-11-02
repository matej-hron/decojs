# Vodní sloupec — rozhraní vrstev

Vodní sloupec je **sdílený model kurzu P1** (spec `docs/superpowers/specs/2026-11-02-p1-lecture-port-design.md`
§6). Kapitoly ho nekopírují, ale **přidávají do něj vrstvy**: teplota (Hustota), tlak + balónek/zvon
(Tlak, Boyle), potápěč a vztlak (Archimedes), parciální tlaky (Dalton), sycení (Henry).

| Soubor | Co |
|---|---|
| `js/components/WaterColumn.js` | kostra: osa hloubky, sloupec, hladina/led, ukazatel, posuvník, odečet, rozhraní vrstev, čisté pomocné funkce |
| `js/components/waterColumn/<vrstva>Layer.js` | jedna vrstva = jeden soubor (vzor: `temperatureLayer.js`) |
| `tests/water-column.test.mjs` | testy čistých částí kostry a vrstvy teplota |

Tohle rozhraní je **zafixované před 2. týdnem**, aby paralelní kapitoly mohly přidávat vrstvy bez kolizí.
Co je stabilní a co se smí měnit, je v [§9](#9-co-je-stabilní).

## 1. Použití na stránce

```js
import { createWaterColumn } from '../js/components/WaterColumn.js';
import { createTemperatureLayer } from '../js/components/waterColumn/temperatureLayer.js';
import { lakeTemperature, lakeBands, lakeHasIce } from '../js/physics/lakeProfiles.js';

const col = createWaterColumn(document.getElementById('model-lom'), {
    maxDepth: 40,               // m
    depth: 0,                   // m, zaokrouhlí se na step
    step: 1,                    // m, krok posuvníku i tažení
    surface: 'water',           // 'water' | 'ice'
    state: { month: 8 },        // počáteční klíče stránky / vrstev
    // aside: false,            // vypne všechny boční panely
    // height: 480,             // px, nebo (width) => px; výchozí defaultHeight(width)
    // labels: { depthAxis: 'hloubka / m', depth: 'hloubka', slider: 'Hloubka', ice: 'led', figure: 'Vodní sloupec' },
});

col.addLayer(createTemperatureLayer({
    profile: (depth, s) => lakeTemperature(s.month, depth, s.maxDepth),
    bands: (s) => lakeBands(s.month, s.maxDepth),
}));

monthSelect.addEventListener('change', () => {
    const month = Number(monthSelect.value);
    col.setState({ month, surface: lakeHasIce(month) ? 'ice' : 'water' });
});

const off = col.on('change', (state, { source, changed }) => {
    if (changed.includes('depth')) writeUrlParam('hloubka', state.depth);
});
```

### API kostry

| Člen | Popis |
|---|---|
| `createWaterColumn(host, options)` | vloží do `host` obal `.water-column` a vrátí objekt níže |
| `addLayer(layer)` | přidá vrstvu; zavolá `layer.init(ctx)`; vrací `col` (řetězení). Duplicitní `id` → `Error` |
| `removeLayer(id)` | odebere vrstvu, zavolá `layer.destroy()`; vrací `true/false` |
| `setState(partial)` | sloučí do stavu, zvaliduje klíče kostry, překreslí (v dalším snímku) a ohlásí změnu se `source: 'api'` |
| `getState()` | mělká kopie stavu |
| `on('change', fn)` | `fn(state, { source: 'user' \| 'api', changed: string[] })`; vrací funkci pro odhlášení. Volá se jen při skutečné změně (stejná hodnota = nic), takže `setState` v posluchači nezacyklí |
| `getGeometry()` | poslední vykreslená `geom` (pro testy / ladění) |
| `render()` | vynutí synchronní překreslení (běžně netřeba) |
| `destroy()` | `destroy()` všech vrstev, odpojí observery, odstraní DOM |
| `el`, `svg`, `controlsEl`, `readoutEl` | prvky obalu (viz §6) |

`source: 'user'` = posuvník, tažení/klik v SVG a ovládání vrstev přes `ctx.setState`; `'api'` = `col.setState`.

## 2. Vrstva

Vrstva je obyčejný objekt (typicky z továrny `create<Název>Layer(options)`):

```js
{
    id: 'pressure',                       // povinné, unikátní; zároveň prefix soukromých klíčů stavu
    render(g, geom, state) { … },          // povinné: kreslí do vlastního <g>
    readout(state) { return 'tlak 2&nbsp;bar'; },  // volitelné: HTML do řádku odečtu, nebo null
    aside: true,                          // volitelné: chce vlastní boční panel (graf vrstvy)
    zIndex: 0,                            // volitelné: pořadí kreslení (viz níže)
    init(ctx) { … },                      // volitelné: jednou při addLayer — vlastní ovládání
    destroy() { … },                      // volitelné: úklid (posluchače, DOM ovládání)
}
```

### Životní cyklus

1. `addLayer(layer)` → kostra vytvoří `<g class="wc-layer" data-layer="<id>">` a zavolá `init(ctx)`.
2. Při každém překreslení (změna stavu, šířky, tématu) kostra pro každou vrstvu **vyprázdní její `<g>`**
   a zavolá `render(g, geom, state)`. Vrstva tedy kreslí vždy celé znovu, nic si nepamatuje v DOM.
   Stav je zmrazený (`Object.freeze`) — vrstva ho nemění, změny jdou přes `ctx.setState`.
3. Po vykreslení se sestaví odečet: `hloubka … · readout(vrstva 1) · readout(vrstva 2) …`
   (pořadí přidání; `null` nebo prázdný řetězec se vynechá).
4. `removeLayer(id)` / `destroy()` → `layer.destroy()`.

Výjimka v `render`/`readout` jedné vrstvy se zaloguje (`console.error`) a ostatní vrstvy se vykreslí dál.

### Pořadí kreslení (z-order)

Uvnitř SVG odspodu: **podklad** (výchozí barva vody) → **vrstvy** seřazené podle `zIndex` (výchozí 0,
při shodě pořadí přidání) → **překryv kostry** (obrys sloupce, hladina/led, osa hloubky, ukazatel hloubky
a jeho úchop). Ukazatel je tak vždy nahoře a vždy chytitelný.

Konvence `zIndex`:

| `zIndex` | Pro co | Příklad |
|---|---|---|
| −10 | barevné pozadí sloupce | teplota (gradient) |
| 0 | čáry, popisky, grafy v panelu | tlak, parciální tlaky |
| 10 | předměty ve vodě | balónek, zvon, potápěč |

### `ctx` v `init(ctx)`

| Pole | Popis |
|---|---|
| `controlsEl` | `<div class="water-column-controls">` pod sloupcem — sem vrstva vloží svoje ovládání (DOM, ne SVG) |
| `root` | obal `.water-column` |
| `getState()` | mělká kopie stavu |
| `setState(partial)` | změna stavu z ovládání vrstvy (`source: 'user'`) |
| `uid` | unikátní prefix pro `id` v SVG (gradienty, clipPath), např. `wc1-pressure` |

## 3. `geom`

Kostra kreslí v **pixelových souřadnicích** (bez `viewBox`): 1 jednotka SVG = 1 CSS px, takže písmo má
stálou velikost. `geom` se počítá při každém překreslení z šířky obalu.

| Pole | Popis |
|---|---|
| `width`, `height` | rozměr SVG v px |
| `fontSize` | základní velikost písma v px: `clamp(14, round(10 + width/128), 20)` — 14 px v mobilu, 20 px od 1280 px. Odvozené velikosti počítej jako násobky (`0.9 * fontSize`) |
| `column` | `{x, y, w, h}` sloupce; `y` = hladina (hloubka 0), `y + h` = dno (`maxDepth`) |
| `aside` | `{x, y, w, h}` **panel této vrstvy**, nebo `null` (vrstva nechce panel, `aside: false` v kostře) |
| `panels` | všechny panely v pořadí přidání vrstev (jen pro informaci) |
| `depthToY(m)`, `yToDepth(px)` | lineární převod hloubka ↔ y; **neomezují** rozsah (omezuje `snapDepth`) |
| `ticks` | hloubky (m) popsané na ose — vrstva podle nich může kreslit vodorovnou mřížku v panelu |
| `maxDepth` | m |
| `colors` | barvy tématu, viz §7 |

Panel má stejné `y` a `h` jako sloupec, takže **hloubka je ve sloupci i v panelu na stejné výšce**.
Pod panelem je místo (~3,4 em) na vodorovnou osu panelu: popisky ticků na `y + h + 1.25 em`,
název osy na `y + h + 2.75 em`.

### Proč panel pro každou vrstvu (odchylka od plánu)

Plán měl jeden `aside` pro celý sloupec. Kostra místo toho dává **každé vrstvě s `aside: true` vlastní
panel** vedle sebe: profil teploty a průběh tlaku mají jiné vodorovné osy a ve společném panelu by se
paralelní kapitoly praly o místo i o osu. Kapitola s jednou vrstvou se chová přesně jako v plánu.
Na mobilu (< 600 px) je sloupec ~42 % šířky a zbytek panely — s jednou vrstvou má panel na 390 px
displeji ~180 px. Víc než dva panely na mobil nedávej (kapitola, ne kostra, rozhoduje, které vrstvy
zapne).

## 4. `state` — jmenné konvence klíčů

`state` je **jeden plochý objekt** sdílený všemi vrstvami. Aby se paralelní kapitoly nepraly:

| Druh klíče | Kdo ho vlastní | Tvar | Příklady |
|---|---|---|---|
| **kostra** | `WaterColumn.js` | rezervované jméno (`CORE_STATE_KEYS`) | `depth` (m), `maxDepth` (m), `surface` (`'water'`\|`'ice'`) |
| **scénář** | stránka (kapitola) | bez prefixu, popisuje svět, ne vrstvu | `month` (1–12), později `water` (`'fresh'`\|`'salt'`), `altitude` (m) |
| **soukromý klíč vrstvy** | jedna vrstva | **prefix = `id` vrstvy, camelCase** | `pressureMode` (`'school'`\|`'exact'`), `diverWeights`, `balloonVolume0` |

Pravidla:

- Vrstva **čte** cokoli, ale **zapisuje** jen klíče se svým prefixem.
- Scénářové klíče zapisuje stránka. Potřebuje-li je víc vrstev (např. slaná voda pro tlak i vztlak),
  zůstávají bez prefixu a jejich význam se zapíše do tabulky níže — **nový scénářový klíč = řádek v této
  tabulce v tomtéž PR**.
- Vrstva, která něco potřebuje od stránky (profil, data), to dostane **v options továrny** (funkce
  `profile(depth, state)`), ne tím, že by znala jezero nebo kapitolu.
- Plochý klíč s prefixem (`pressureMode`) místo vnořeného objektu (`pressure.mode`) proto, že
  `setState` slučuje mělce a `on('change')` hlásí `changed` jako seznam jmen — vnořený objekt by se
  při každé změně celý přepsal a nešlo by poznat, co se změnilo.

Registrované scénářové klíče:

| Klíč | Typ | Kdo zapisuje | Význam |
|---|---|---|---|
| `month` | 1–12 | `p1/hustota.html` | měsíc roku pro teplotní profil lomu |

## 5. Hloubka, ovládání, přístupnost

- **Posuvník** `<input type="range">` v `controlsEl` (min 0, max `maxDepth`, krok `step`) — prst, myš,
  klávesnice; `aria-label` „Hloubka“, `aria-valuetext` „12 m“.
- **Tažení ukazatele** v SVG (pointer events). Jen na úchopu ukazatele (pás ≥ 44 px kolem čáry) je
  `touch-action: none`; jinde prst normálně posouvá stránku. Myší/perem lze stisknout kdekoli ve
  sloupci (skočí a táhne), prstem klepnutí do sloupce skočí. Capture je na `<svg>`, takže tažení přežije
  překreslení.
- Hloubka se vždy zaokrouhlí na `step` a omezí na 0…`maxDepth` (`snapDepth`); změna `maxDepth` hloubku
  znovu omezí.
- **Odečet** `<p class="water-column-readout" aria-live="polite" aria-atomic="true">`.
  `readout(state)` vrací **HTML** (smí obsahovat `<var>`, `<sub>`, `&nbsp;`).
  Teplotu piš slovem („teplota 8&nbsp;°C“, style-guide §3.3 — *t* je v DecoJS čas), tlak značkou
  (`<var>p</var> = 2&nbsp;bar`) nebo slovem — hlavně jednotně v rámci odečtu.

## 6. DOM a CSS třídy

```
<div class="water-column">              ← col.el
  <svg class="water-column-svg">        ← col.svg (role="img", aria-label)
    <g class="wc-base">                 ← podklad (rect.wc-water)
    <g class="wc-layer" data-layer="…"> ← vrstvy
    <g class="wc-overlay">              ← obrys, hladina/led, .wc-axis, .wc-pointer, .wc-pointer-hit
  </svg>
  <p class="water-column-readout">      ← col.readoutEl
  <div class="water-column-controls">   ← col.controlsEl
    <label class="water-column-depth"><span>Hloubka</span><input type="range"></label>
    …ovládání vrstev…
  </div>
</div>
```

Kostra nastavuje inline jen to, co je nutné k funkci (`display: block`, šířka SVG, `touch-action` úchopu).
Vzhled odečtu a ovládání (velikost písma pro projektor, rozložení řádku) patří do `css/course.css`.

## 7. Barvy a téma

Barvy se čtou z CSS proměnných (`getComputedStyle` při každém překreslení) a předají se ve
`geom.colors`; přepnutí `<html data-theme="dark">` kostra zachytí (MutationObserver) a překreslí.
Vrstvy **nepoužívají natvrdo psané barvy textu a čar** — berou je z `geom.colors`:

| Klíč | Zdroj | Pro co |
|---|---|---|
| `text` | `--text` | popisky, osy, čáry dat (kontrast na projektoru) |
| `subtle` | `--text-subtle` | podružné popisky (na projektoru střídmě — slabý kontrast) |
| `border`, `borderStrong` | `--border`, `--border-strong` | mřížka, rámečky |
| `surface` | `--surface` | „halo“ pod textem přes barevnou plochu, výplň úchopu |
| `water`, `waterLine` | `--wc-water` / `--blue-100` (tmavé: `--blue-800`); `--wc-water-line` / `--blue-500` (`--blue-300`) | podklad sloupce, vlnka hladiny |
| `ice`, `iceStroke`, `iceText` | `--wc-ice*` / `--blue-50`, `--blue-300` (tmavé: `--gray-200`, `--gray-400`), `--gray-800` | led |
| `dark` | `'light'` \| `'dark'` | jen kdyby vrstva opravdu potřebovala jinou barvu dat |

Text přes barevnou plochu: `haloAttrs(colors, fontSize)` (text v `--text`, pod ním obrys v `--surface`).
Barvy **dat** vrstvy (stupnice teploty, …) smí mít vrstva vlastní, ale přepsatelné CSS proměnnou
`--wc-<vrstva>-*` (teplota: `--wc-temp-cold`, `--wc-temp-mid`, `--wc-temp-warm`).

## 8. Exporty pro vrstvy a testy

Z `WaterColumn.js` (čisté, bez DOM, testované v Node):
`clamp`, `decimalsOf`, `fmtCs`, `snapDepth`, `niceStep`, `niceTicks`, `depthTicks`, `baseFontSize`,
`defaultHeight`, `computeGeometry`, `depthReadout`, `joinReadout`, `sortLayers`, `estimateTextWidth`,
`splitLabel`, `wavePath`, konstanty `CORE_STATE_KEYS`, `DEFAULT_LABELS`.
DOM pomocníci: `svgEl(tag, attrs, parent)` (`attrs.text` = textContent), `haloAttrs`, `readColors`.

**Čísla na výstupu vždy přes `fmtCs(value, decimals)`** (= `fmtNum(…, 'cs')` z `js/format.js` + minus
U+2212 + bez „−0“), nikdy `toFixed` — ten je dovolený jen pro souřadnice SVG. Obsah kurzu je zatím jen
česky, proto pevně `'cs'`. Mezi číslem a jednotkou v `readout` `&nbsp;`, v SVG `<text>` znak U+00A0.
V SVG `<text>` prostý text (bez kurzívy — SVG nemá `<var>`); kurzíva značek jen v HTML odečtu.

Vrstva teplota navíc exportuje `temperatureColor(t, range, stops)`, `temperatureTicks`,
`sampleProfile`, `resolveBands`, `temperatureReadout` a převody `hexToRgb`, `rgbToHex`, `rgbToOklab`,
`oklabToRgb`.

### Vrstva teplota

```js
createTemperatureLayer({
    profile: (depth, state) => °C,   // povinné
    range: [0, 25],                  // °C: osa panelu i barevná stupnice (mimo rozsah = krajní barva)
    bands: [{ from, to, label }] | (state) => [...],   // volitelná pásma (m)
    decimals: 0, label: 'teplota', axisLabel: 'teplota / °C', aside: true, id: 'temperature',
});
```

- Sloupec obarvený svislým gradientem vzorkovaným z profilu (~1 vzorek / 4 px). Stupnice tmavě modrá →
  světle šedá → červenooranžová, interpolovaná v OKLab (stejný krok teploty ≈ stejný krok barvy);
  osa modrá–oranžová je čitelná i pro barvoslepé. `zIndex: −10`.
- Pásma: čárkované hranice přes sloupec i panel, popisek uvnitř pásma (zalomí se na dva řádky, příliš
  tenké pásmo popisek nemá — hranice zůstanou).
- Panel: profil teploty (čára v `--text`), osa „teplota / °C“ po 5&nbsp;°C (při úzkém panelu po 10),
  bod v aktuální hloubce s popiskem „8 °C“.

## 9. Co je stabilní

**Stabilní** (změna = domluva s leadem a úprava všech vrstev v jednom PR):

- `createWaterColumn(host, options)` a jeho členy z §1;
- tvar vrstvy (`id`, `render`, `readout`, `aside`, `zIndex`, `init`, `destroy`) a `ctx`;
- signatura `render(g, geom, state)`, význam polí `geom` z §3 (přidávat nová pole smíš);
- klíče kostry `depth`, `maxDepth`, `surface` a konvence prefixů z §4;
- `on('change')` a tvar `{ source, changed }`;
- třídy DOM z §6 a klíče `geom.colors` z §7 (přidávat smíš).

**Smí se měnit** bez domluvy (nejde o rozhraní):

- přesné rozměry okrajů, poměr sloupec/panel, výška, vzhled vlnky, ledu a ukazatele;
- algoritmus ticků a velikosti písma (testy hlídají jen meze: ≥ 14 px, popisky ≥ 2,5 em od sebe);
- vnitřní implementace (plánování překreslení, observery).

**Přidání nového klíče kostry** (např. `altitude`) — jen pokud ho kostra sama kreslí; jinak je to
scénářový klíč stránky (§4).

## 10. Jak přidat vrstvu — příklad „tlak“

Jen ilustrace rozhraní (skutečná vrstva přijde s kapitolou Tlak a musí sedět se slovníčkem notace).

```js
// js/components/waterColumn/pressureLayer.js
import { svgEl, fmtCs, niceTicks } from '../WaterColumn.js';

export function createPressureLayer({ id = 'pressure' } = {}) {
    // soukromý klíč vrstvy: pressureMode ('school' | 'exact')
    const pressure = (depth, s) => (s.pressureMode === 'exact' ? 1.013 + depth * 1000 * 9.81 / 1e5 : 1 + depth / 10);
    let select = null;

    return {
        id,
        aside: true,
        zIndex: 0,

        init(ctx) {
            select = document.createElement('select');
            select.innerHTML = '<option value="school">školní čísla</option><option value="exact">přesně</option>';
            select.addEventListener('change', () => ctx.setState({ pressureMode: select.value }));
            ctx.controlsEl.append(select);
        },

        render(g, geom, state) {
            const p = geom.aside;
            if (!p) return;
            const pMax = pressure(state.maxDepth, state);
            const xOf = (bar) => p.x + (bar / pMax) * p.w;
            const pts = [0, state.maxDepth].map((d) => `${xOf(pressure(d, state)).toFixed(1)},${geom.depthToY(d).toFixed(1)}`);
            svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: geom.colors.text, 'stroke-width': 2 }, g);
            for (const bar of niceTicks(0, pMax, Math.floor(p.w / (2.2 * geom.fontSize)))) {
                svgEl('text', { x: xOf(bar), y: p.y + p.h + 1.25 * geom.fontSize, 'text-anchor': 'middle',
                    fill: geom.colors.text, text: fmtCs(bar, 0) }, g);
            }
            svgEl('text', { x: p.x + p.w / 2, y: p.y + p.h + 2.75 * geom.fontSize, 'text-anchor': 'middle',
                fill: geom.colors.text, text: 'tlak / bar' }, g);
        },

        readout(state) {
            return `<var>p</var> = ${fmtCs(pressure(state.depth, state), 1)}&nbsp;bar`;
        },

        destroy() {
            select?.remove();
        },
    };
}
```

Na stránce: `col.addLayer(createPressureLayer())` — kostra jí přidělí druhý panel vedle teploty
a odečet bude „hloubka 10&nbsp;m · teplota 8&nbsp;°C · *p* = 2,0&nbsp;bar“.

## 11. Offline a integrace

DecoTheory je PWA a na přednášce nemusí být internet. **Každý nový soubor vrstvy přidej do `sw.js`
`STATIC_ASSETS`** (a do allow-listu `.github/workflows/pages.yml`, pokud ho workflow vyžaduje) ve stejném PR.
Kostra nemá žádné závislosti mimo `js/format.js`; vrstvy importují jen `../WaterColumn.js` a vlastní
fyziku z `js/physics/`. Žádné CDN.

Nová veličina nebo značka v popiscích vrstvy → `docs/notation/glossary.md` ve stejném commitu.

Testy čistých částí nové vrstvy přidej do `tests/water-column.test.mjs` (nebo vlastního
`tests/water-column-<vrstva>.test.mjs`) a do `npm test` skriptu (`package.json` upravuje lead).
