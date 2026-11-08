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

Barvy stylu Hladina jsou proměnné `--slide-*` na `.course-page` (výstřižek citace: `--slide-card-bg`, `--slide-card-fg`).

## 3. Typy

### `title`: titulní slide

Velký nadpis ve spodní třetině, pod ním jeden menší řádek, bez odstavce. Úvodní text patří do Více.
Použij ho pro titulní slide kurzu a pro úvodní slide kapitoly, pokud ho přednáška má (například slide 10 „Tlak“).

```html
<section class="course-section">
    <div class="course-slide" data-slide-type="title">
        <h1>Kurz P1 – Fyzika</h1>
        <p class="course-slide-sub">Fyzika P★, P★★ podle přednášky SPČR</p>
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
ani začátek těla se neposouvají. U citace navíc seznam do dvou sloupců. Teď ji mají slidy 3, 4, 8 a 9.
Na telefonu písmo nezmenšuje.

Jestli se slide vejde, ověř měřením přes `getBoundingClientRect` na 1280×720, 1440×800, 1728×1000 a 1920×1080:
výška slidu se rovná `--course-slide-height`, obsah těla končí nad patičkou a další slide začíná pod oknem.

## 5. Typy do budoucna (zatím nestavěné)

Prošel jsem všech 60 slidů přednášky (`resources/FyzikaP12_2025.pdf` a `.txt`). Tyhle slidy budou chtít další typy.
Postav je, až na ně dojde kapitola, ve stejném duchu (atribut `data-slide-type`, rozměry jen z proměnných scény):

| Typ | Co obsahuje | Slidy přednášky |
|---|---|---|
| `title` jako úvod kapitoly | velký název kapitoly, už existuje | 10 (Tlak) |
| obrázek / schéma s popiskem | text a obrázek nebo schéma vedle sebe, popisky v obrázku | 11, 12, 14, 16, 18, 21, 22, 23, 27, 31, 32, 35, 40, 42–45, 48, 49, 53–55, 59 |
| velký obrázek | fotka nebo schéma přes většinu slidu s jednou větou pod ním | 50, 51, 52 |
| výpočet krok za krokem | zadání příkladu, dosazení po řádcích, výsledek; tabulka hodnot k doplnění | 19, 20, 24, 25, 28–30, 36, 37, 41 |
| tabulka nebo graf s textem | datová tabulka či graf vedle výkladu | 17, 38 (koláč složení vzduchu), 46 (saturace v čase), 47 |
| upozornění | výrazné varování se značkou nebezpečí („Nikdy nezadržujte dech!“) | 26, 34, 44 |
| velká věta | jedna až dvě krátké věty přes celý slide | 56 („Rychlejší… Není jasné, odkud zvuk přichází“) |
| konec | závěrečný slide s fotkou a jednou větou | 60 („Konec … A hurá do vody“) |

Slidy se vzorcem a odrážkami bez obrázku (například 33, 39, 57, 58) zvládne `content` s `.course-formula`.
