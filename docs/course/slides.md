# Šablona slidů kurzu P1

Každá zastávka kurzu je slide jednoho z **typů** níže. Nová kapitola (Tlak, Stlačování plynů, Archimedes, … až po
slide 60 přednášky) se píše jen skládáním těchto typů: **žádné vlastní třídy ani rozměry pro jednotlivý slide.**
Typy a jejich vzhled si prohlédneš ve vzorníku `docs/course/vzornik-slidu.html`. `docs/` se nepublikuje, vzorník proto
otevři z lokálního serveru, například `python3 -m http.server 5591` v kořeni repa a pak
`http://127.0.0.1:5591/docs/course/vzornik-slidu.html`.

Rozložení odpovídá originálu přednášky (`resources/FyzikaP12_2025.pdf`, slidy 1 a 2) a pevné scéně z P6
(spec `docs/superpowers/specs/2026-11-02-p1-lecture-port-design.md` §7).

## 1. Pravidla

- **Jedno místo pro rozměry:** polohy a velikosti jsou jen proměnné scény v `:root` v `css/course.css` (tabulka v §2).
  Typy je používají, slide sám žádné číslo nemá. Kontrolu drží test `tests/course-p1.test.mjs` (žádné `class` ani
  `style` na slidu, typ z povoleného seznamu).
- **Kostra zastávky:** `<section id="…" class="course-section">`, v ní `<div class="course-slide" data-slide-type="…">`,
  první potomek je nadpis (`h1` na prvním slidu kapitoly, jinak `h2`), za ním tělo `<div class="course-core">`.
  Pod slidem může být jedno `<details class="course-more">` (Více).
- **Číslo slidu z přednášky:** `data-slide-number="12"`. Titulní slide a Procvič si ho nemají. Patičku doplní
  `js/course/slideNav.js` sám.
- **Stejné místo na všech zastávkách (desktop):** stejný rámeček, nadpis v 10 % výšky slidu, začátek těla v 28 %,
  okraje textu kolem 8 % šířky. Titulní slide má vlastní pevnou polohu (nadpis ve spodní třetině).
  Po skoku na zastávku není vidět další slide.
- **Žádné přetečení:** tělo se musí vejít na 1280×720 až 1920×1080. Když se nevejde, použij variantu
  `data-slide-fit="compact"` (§4). Polohu nadpisu ani těla nikdy neměň. Kdyby nestačila ani ona, slide rozděl na dva.
- **Telefon (do 768 px):** normální tok bez pevné výšky, kompaktní varianta tam písmo nezmenšuje.
- **Model** je simulátor v `<dialog class="course-sim">` a otevírá se z náhledu na slidu typu `models`. Simulátor má
  vlastní kompaktní hlavičku (`.chart-header`), protože graf potřebuje výšku. Není to zastávka a typ nemá.
- **Text slidu** se přepisuje přesně podle přednášky. Výklad navíc patří do Více.

## 2. Proměnné scény (`css/course.css`, `:root`)

| Proměnná | Desktop | Telefon | Co řídí |
|---|---|---|---|
| `--course-slide-height` | výška okna − hlavička − řádek Více | (nepoužije se) | výška rámečku |
| `--course-slide-pad` | `clamp(1rem, 7.5vw, 8.2rem)`, kolem 8 % šířky | `clamp(1rem, 4vw, 4rem)` | levý a pravý okraj textu |
| `--course-slide-title-top` | 10 % výšky slidu | `--space-3` | horní hrana nadpisu |
| `--course-slide-body-top` | 28 % výšky slidu | výška hlavičky | začátek těla |
| `--course-slide-title` | `clamp(1.6rem, min(3.4vw, 6.5vh), 3.4rem)` | stejné | písmo nadpisu |
| `--course-slide-text` | `clamp(1.15rem, min(2.3vw, 4.1vh), 2.6rem)` | stejné | písmo těla |
| `--course-slide-text-compact` | 0,8 × písmo těla | písmo těla | varianta `compact` |
| `--course-quote-scale` | 0,75 | 0,9 | písmo výstřižku vůči tělu |
| `--course-title-slide-title` | 1,35 × písmo nadpisu | stejné | nadpis titulního slidu |
| `--course-title-slide-top` | 67 % výšky slidu (začátek spodní třetiny) | (nepoužije se) | horní hrana nadpisu titulního slidu |
| `--course-practice-text` | `clamp(0.9rem, 2.05vh, 1.4rem)` | stejné | písmo Procvič si |
| `--course-model-ui` | `clamp(0.95rem, 1.7vh, 1.25rem)`, na 1920×1080 kolem 18 px | stejné | přepínače, popisky a poznámka `.course-simplification` v simulátorech |

Barvy stylu Hladina jsou proměnné `--slide-*` na `.course-page` (výstřižek citace: `--slide-card-bg`, `--slide-card-fg`).

## 3. Typy

### `title`: titulní slide

Velký nadpis ve spodní třetině, pod ním jeden menší řádek, bez odstavce. Úvodní text patří do Více.
Použij ho pro titulní slide kurzu a pro úvodní slide kapitoly, pokud ho přednáška má (například slide 10 „Tlak“).

```html
<section class="course-section">
    <div class="course-slide" data-slide-type="title">
        <h1>Kurz P1 – Fyzika</h1>
        <p class="course-slide-sub">P★</p>
    </div>
    <details class="course-more">
        <summary>Více <span class="course-summary-hint">o kurzu</span></summary>
        <div class="course-more-body"><p>…</p></div>
    </details>
</section>
```

### `content`: obsahový slide

Nadpis a text nebo odrážky (slidy 2, 5, 6, 7, 8). Tělo ve dvou sloupcích (například text a tabulka, slide 8)
zajistí `course-core-cols` na těle: každý sloupec je jeden `<div>`, od 900 px šířky leží vedle sebe.

```html
<section id="plan" class="course-section">
    <div class="course-slide" data-slide-number="2" data-slide-type="content">
        <h2>Fyzika – plán</h2>
        <div class="course-core">
            <ul>
                <li>Fyzika, teorie (dnes)</li>
                <li>Fyziologie</li>
            </ul>
        </div>
    </div>
</section>
```

```html
<div class="course-slide" data-slide-number="8" data-slide-type="content" data-slide-fit="compact">
    <h1>Hustota</h1>
    <div class="course-core course-core-cols">
        <div><p>…</p></div>
        <div><table class="course-table">…</table></div>
    </div>
</div>
```

Části těla, které typ zná: `.course-highlight` (zvýraznění jako v přednášce), `.course-formula` (vzorec na řádku),
`.course-unit`, `.course-table` (tabulka, čísla ve sloupci `class="num"`), `.course-note` (drobná poznámka).

### `quote`: citace

Převzatý dokument (osnova SPČR na slidech 3 a 4) jako světlý výstřižek s tmavým textem a se zdrojem pod kartou.
Text citace se nemění, ani pravopisné varianty originálu. Žádné uvozovky ani jiné dekorace.
Ve variantě `compact` jde seznam od 900 px šířky do dvou sloupců.

```html
<div class="course-slide" data-slide-number="3" data-slide-type="quote" data-slide-fit="compact">
    <h2>Fyzika – osnova výcviku</h2>
    <div class="course-core">
        <figure class="course-quote">
            <blockquote>
                <p class="course-quote-head"><strong>P★: T4 Základy potápěčské fyziky</strong> <span>(2&nbsp;×&nbsp;45&nbsp;min)</span></p>
                <ul>
                    <li>…</li>
                </ul>
            </blockquote>
            <figcaption>Citace z osnovy výcviku SPČR (CMAS), kurz P★</figcaption>
        </figure>
    </div>
</div>
```

`.course-quote-head` je řádek hlavičky citovaného dokumentu: název vlevo, rozsah vpravo. Bez něj citace funguje taky.

### `models`: slide s náhledy modelů

Nadpis a řady text + náhled. Klik na náhled otevře simulátor v překryvu přesně v rámečku slidu (slide 9).
Řada `course-row-flip` dává náhled doleva. Náhledy vykreslí modul stránky, simulátory jsou v `<dialog>` pod Více.
Jeden model smí mít náhled na víc slidech (M1 kapitoly Tlak na slidech 15 a 20): překryv se otevře na slidu, odkud
se kliklo. Popisek „Otevřít model“ dej nahoru (`course-thumb-hint-top`), když dole v náhledu je popisek osy.

```html
<div class="course-slide" data-slide-number="9" data-slide-type="models" data-slide-fit="compact">
    <h2>Závislost hustoty na teplotě</h2>
    <div class="course-core">
        <div class="course-row">
            <ul><li>…</li></ul>
            <button type="button" class="course-thumb" data-open-model="model-hustota" aria-label="Otevřít model: hustota vody a teplota">
                <span class="course-thumb-plot" id="nahled-hustota"></span>
                <span class="course-thumb-hint">Otevřít model</span>
            </button>
        </div>
    </div>
</div>
```

### `figure`: text a obrázek nebo schéma

Text vlevo, obrázek vpravo (od 900 px vedle sebe, na telefonu pod sebou), jako slidy 11, 14, 16, 18 a 22.
Obrázek je `<figure class="course-figure course-illustration">` s jedním `<svg>` (styl ilustrací níže) nebo
`<figure class="course-figure">` s `<img>`, oboje s nepovinným `<figcaption>` (popisek, u převzatého obrázku zdroj a licence).
Výška obrázku je nejvýš polovina slidu (`--course-slide-height`), takže se slide vždy vejde.

Schéma kreslíme jako české SVG s `role="img"` a `aria-label` ve stylu ilustrací (oddíl níže). Starší třídy čárových
schémat (`fig-line`, `fig-thin`, `fig-arrow`, `fig-water`, `fig-surface`, `fig-particle`, `fig-piston`, `fig-ground`,
`fig-label-strong`, `fig-label-lg`) v CSS zůstávají pro schémata, která ještě nejsou předělaná (Stlačování);
nové obrázky je nepoužívají.
Značka veličiny v SVG: `<tspan font-style="italic">F</tspan>`.

Varianty těla:
- **Obrázek pod textem v jednom sloupci** (`content` s `course-core-cols`, slidy 13 a 17): ilustrace na konci sloupce,
  výška nejvýš 22 % slidu. Nízký pás (viewBox 600 × 200, slide 17) má navíc `course-illustration-band` a nejvýš 20 %.
  Ilustrace ze dvou částí (slide 13) má popisek pod každou částí: `<figcaption class="course-figure-pair">` se dvěma `<span>`.
- **Dvě ilustrace vedle sebe a pod nimi řádek přes celou šířku** (slide 12, vzor stylu ilustrací níže): tělo má dva `<div>`
  (krátký nadpis `<h3 class="course-figure-title">`, ilustrace `course-illustration` s popiskem) a za nimi
  `<div class="course-core-row">` s drobnějším textem a fotkou. Ilustrace jsou nejvýš 25 % slidu, fotka 16 %.
- **Převzatá fotka:** `<img>` z `images/course/p1/`, pod ní `<figcaption>` s autorem, licencí a odkazem na zdroj,
  záznam v `images/course/p1/SOURCES.md` (licence ověřená na stránce souboru).
- **Obrázek nese víc než text** (slide 18: nádoby a Pascalův sud v jedné ilustraci): `course-core course-core-figure-wide`
  prohodí šířky sloupců, obrázek dostane 1,35 dílu a text 1 díl. Ilustrace ze dvou částí má `course-figure-pair` jako slide 13.
- **Portrét pod textem** (slide 18: Pascal): `<figure class="course-figure course-portrait">` s `<img>` (výška 17 % slidu,
  na telefonu 120 px) a popiskem vedle: jméno a roky, pod tím `course-figure-note` s autorem díla, licencí a odkazem.
  Jen když se vejde a je k němu volný zdroj.

```html
<div class="course-slide" data-slide-number="11" data-slide-type="figure">
    <h2>Tlak</h2>
    <div class="course-core">
        <div>
            <p>Tlak udává, jak velká síla působí kolmo na jednotku plochy.</p>
            <p class="course-formula"><var>p</var> = <var>F</var>/<var>S</var> <span class="course-unit">[Pa]</span></p>
        </div>
        <figure class="course-figure course-illustration">
            <svg viewBox="0 0 600 420" role="img" aria-label="Tlaková síla F působí kolmo na plochu S">…</svg>
        </figure>
    </div>
</div>
```

### Styl ilustrací

Vzor je slide 12 (T6), Matej ho schválil. V Tlaku jsou podle něj všechna schémata (T7: slidy 11–18 a 21, T9: Pascalův sud na slidu 18);
Stlačování a Hustota se projdou zvlášť.

- **Obrázek nese slide.** Ilustrace je hlavní prvek: v těle zabere víc místa než text. Nad ní je krátký nadpis
  (`<h3 class="course-figure-title">` se zvýrazněním), pod ní krátký popisek písmem těla v `<figcaption>`, ne odstavec.
  Doplněk popisku (kratší druhý řádek) je `<span class="course-figure-note">`.
- **Plné tvary a scéna, ne technický nákres.** Siluety a výplně ve světlém rámu (obloha `fig-sky`, papír `fig-paper`),
  silné tahy, kus scény (sníh, kopec, stromy). Barvy jen ze tříd, které berou proměnné scény Hladina, nikdy natvrdo
  v atributech `fill`, `stroke` nebo `style`:
  `fig-silhouette` (postava, uvnitř `fig-limb`, `fig-limb-thick`, `fig-pole`), `fig-snow`, `fig-snow-lip`, `fig-hill`,
  `fig-tree`, `fig-flake`, `fig-track` (mělká stopa), `fig-track-deep` (hluboká stopa), `fig-glass` (průhledný plast),
  `fig-plastic`, `fig-liquid`, `fig-ink` (tmavé detaily), `fig-ticks`, `fig-hub`, `fig-needle`, `fig-pointer`.
- **Síla je výrazná.** `fig-force`: plná bloková šipka v barvě zvýraznění s tmavým obrysem, popisek
  `<tspan font-style="italic">F</tspan>`. Stejná síla = stejný tvar šipky.
- **Fotky:** kde je skutečná věc názornější než kresba (manometr, výstroj), fotka z volného zdroje (public domain, CC0,
  CC BY, CC BY-SA) s autorem a licencí pod obrázkem a záznamem v `images/course/p1/SOURCES.md`. Žádná loga ani značky
  výrobců, ani vyražené na výrobku. Když volná fotka bez značky není, plná kresba v tomhle stylu.
- **Čitelnost:** popisky v ilustraci mají `fig-label-xl` (36 px ve viewBoxu výšky 270). Na projektoru 1920×1080
  to je aspoň 31 px (ilustrace 25 % slidu), na telefonu aspoň 16 px (obrázek na šířku displeje). Kontrast podle pravidel
  v oddílu 1, tmavé popisky na světlém rámu.
- **Rozměr:** všechny ilustrace mají viewBox šířky 600 (výška podle obsahu), takže mají při stejné šířce stejně velké
  popisky. Na projektoru se to ověřuje měřením: nejmenší popisek v ilustraci aspoň 31 px na 1920×1080.
- **Další třídy (T7):** `fig-air` (částice plynu), `fig-gas` (prostor s plynem), `fig-wall` (stěna nádoby), `fig-guide`
  (čárkovaná vodorovná pomocná čára), `fig-dim` (kóta), `fig-rock` (hora), `fig-sea`, `fig-solid-top`/`-front`/`-side`
  (deska v perspektivě), `fig-atom`, `fig-bond`, `fig-road`, `fig-road-line`, `fig-plane`, `fig-body`, `fig-cavity`,
  `fig-leader` s `fig-halo` (odkazová čára čitelná na tmavém i světlém).
- **Další třídy (T9, Pascalův sud):** `fig-barrel` (dřevo), `fig-stave` (spáry mezi dužinami), `fig-hoop` (obruč, ucho
  konvičky), `fig-jet` (tryskající nebo tekoucí voda), `fig-drop` (kapka), `fig-can` (konvička).
- **Štítky:** zvýrazněná hodnota je tmavý štítek se žlutým písmem (`fig-tag` + popisek `fig-label-xl fig-label-tag`),
  neutrální popisek přes kresbu světlý štítek (`fig-tag-light`). Bílé písmo na moři: `fig-label-light`.
- **Dvouřádkový popisek:** dva `<tspan>` s `x` a mezi nimi `<tspan font-size="0"> </tspan>`, aby text zněl celý
  („vzduchu ubývá, tlak klesá k 0“) a zarovnání vpravo nerozhodila mezera.

```html
<div>
    <h3 class="course-figure-title"><span class="course-highlight">Stejná síla, menší plocha → větší tlak</span></h3>
    <figure class="course-figure course-illustration">
        <svg viewBox="0 0 600 270" role="img" aria-label="Stejný člověk ve sněhu …">
            <rect class="fig-sky" width="600" height="270" rx="16"/>
            <g class="fig-silhouette">…</g>
            <polygon class="fig-force" points="…"/>
            <text x="…" y="…" class="fig-label-xl"><tspan font-style="italic">F</tspan></text>
        </svg>
        <figcaption>Stejná síla, různě velká plocha</figcaption>
    </figure>
</div>
```

### `calc`: příklad

Zadání je vidět, výsledek se odkrývá (slidy 19 a 20). Dvě podoby, které jdou kombinovat:

- **Výpočet:** postup v jednom `<details class="course-answer">` „Ukázat postup“, řádky v `<ol class="course-calc-steps">`,
  výsledné pravidlo v `.course-calc-result` (první `<span>` je rámeček, vedle smí být odkaz na model). Odkaz `data-preset-link` může otevřít model s předvolbou na tomtéž slidu.
- **Tabulka k doplnění:** `.course-table`, kde buňka s výsledkem je `<details class="course-cell"><summary>?</summary>2</details>`.
  Klik na otazník odkryje hodnotu (nativní `<details>`, funguje i bez JS). Víc tabulek a náhled modelu vedle sebe dává
  `.course-calc-cols` (každý sloupec je jeden `<div>` nebo náhled). Řádek `class="course-alert"` je zvýraznění „pozor“
  jako červená čísla v přednášce (`--slide-alert`).

```html
<div class="course-slide" data-slide-number="20" data-slide-type="calc" data-slide-fit="compact">
    <h2>Celkový tlak</h2>
    <div class="course-core">
        <p><span class="course-highlight">Příklad:</span> doplňme hodnoty celkového tlaku v hloubce.</p>
        <div class="course-calc-cols">
            <div>
                <p>Moře</p>
                <table class="course-table">
                    <thead><tr><th scope="col"><var>h</var> [m]</th><th scope="col"><var>p</var> [bar]</th></tr></thead>
                    <tbody>
                        <tr><td class="num">10</td><td class="num"><details class="course-cell"><summary aria-label="Ukázat tlak v 10&nbsp;m">?</summary>2</details></td></tr>
                        <tr class="course-alert"><td class="num">66</td><td class="num"><details class="course-cell"><summary aria-label="Ukázat tlak v 66&nbsp;m">?</summary>7,6</details></td></tr>
                    </tbody>
                </table>
            </div>
            <button type="button" class="course-thumb" data-open-model="model-tlak" aria-label="Otevřít model: tlak v hloubce">…</button>
        </div>
    </div>
</div>
```

### `practice`: Procvič si

Poslední zastávka kapitoly: otázky z testů SPČR/CMAS vedle sebe. Nemá číslo slidu, otázky vybírá `data-question-ids`.

```html
<section id="procvic" class="course-section">
    <div class="course-slide" data-slide-type="practice">
        <h2>Procvič si</h2>
        <div class="course-core">
            <p class="course-note">Otázky z testů SPČR/CMAS. Klikni na odpověď.</p>
            <div class="course-practice" data-quiz-source="data/quiz-physics.json" data-question-ids="6,7,8"></div>
            <p><a href="../quiz-physics.html?kategorie=…">Všechny otázky z testu … →</a></p>
        </div>
    </div>
</section>
```

## 4. Varianta pro dlouhý obsah: `data-slide-fit="compact"`

Jediná varianta, platí pro každý typ: menší písmo těla (`--course-slide-text-compact`, 0,8 × tělo). Nadpis
ani začátek těla se neposouvají. U citace navíc seznam do dvou sloupců, u odrážek a tabulek menší mezery.
Teď ji mají slidy 3, 4, 8, 9, 12, 13, 15, 17, 18, 19, 20, 21 a 22. Procvič si ji nemá: na slide patří tři otázky,
zbytek je v kvízu. Na telefonu písmo nezmenšuje.

Jestli se slide vejde, ověř měřením přes `getBoundingClientRect` na 1280×720, 1440×800, 1728×1000 a 1920×1080:
výška slidu se rovná `--course-slide-height`, obsah těla končí nad patičkou a další slide začíná pod oknem.

## 5. Typy do budoucna (zatím nestavěné)

Už postavené: `title` jako úvod kapitoly (slide 10), `figure` (text a obrázek, slidy 11, 14, 16, 18, 22; použijí ho i
23, 27, 31, 32, 35, 40, 42–45, 48, 49, 53–55, 59) a `calc` (příklad, slidy 19 a 20; použijí ho i 24, 25, 28–30, 36, 37, 41).

Prošel jsem všech 60 slidů přednášky (`resources/FyzikaP12_2025.pdf` a `.txt`). Tyhle slidy budou chtít další typy.
Postav je, až na ně dojde kapitola, ve stejném duchu (atribut `data-slide-type`, rozměry jen z proměnných scény):

| Typ | Co obsahuje | Slidy přednášky |
|---|---|---|
| velký obrázek | fotka nebo schéma přes většinu slidu s jednou větou pod ním | 50, 51, 52 |
| tabulka nebo graf s textem | datová tabulka či graf vedle výkladu (tabulka bez grafu stačí `content` s `course-core-cols`, slide 17) | 38 (koláč složení vzduchu), 46 (saturace v čase), 47 |
| upozornění | výrazné varování se značkou nebezpečí („Nikdy nezadržujte dech!“) | 26, 34, 44 |
| velká věta | jedna až dvě krátké věty přes celý slide | 56 („Rychlejší… Není jasné, odkud zvuk přichází“) |
| konec | závěrečný slide s fotkou a jednou větou | 60 („Konec … A hurá do vody“) |

Slidy se vzorcem a odrážkami bez obrázku (například 33, 39, 57, 58) zvládne `content` s `.course-formula`.
