# Fáze 2 — rozsah oprav zápisu

Kde se sahá, kde ne, a v jakém pořadí. Pravidla samotná jsou v
[`glossary.md`](glossary.md) a [`style-guide.md`](style-guide.md); postup opravy
je ve skillu `.github/skills/fixing-physics-notation/`.

**Stav: nedělitelné mezery hotové (skupiny A, B i C).** Zbývají třídy 2–5
a oddělovač tisíců — přehled na konci dokumentu. Měřeno na `main` po PR #81
a #82, dokončeno v 0.6.39.

## Nejdřív: kam se nedělitelná mezera smí zapsat

**Tohle rozhodni dřív než cokoli opravíš.** `&nbsp;` je HTML entita — funguje
jen tam, kde řetězec projde parserem HTML. Jinde se uživateli vypíše doslova
i se středníkem.

| Cesta řetězce | Zapiš | Kde to je |
|---|---|---|
| `data-i18n` → `el.innerHTML` (`js/i18n.js:99`) | `&nbsp;` | statické HTML |
| statický text v `*.html` | `&nbsp;` | všechny stránky |
| cokoli v `locales/*.json` a `data/*.json` | **U+00A0** | viz níže |
| uvnitř KaTeX vzorce | **`\,`** | 1 výskyt v `pressure.html` |

**V datech se entita nepoužívá vůbec.** Locale klíč ani otázka kvízu neví, kam ji
kód pošle: `innerHTML` entitu dekóduje, canvas Chart.js, `textContent`
(`js/quiz.js:187,259`) a atribut `title` (`MValueChart.js`) ne — tam by se
uživateli vypsalo `20&nbsp;m` i se středníkem. U+00A0 funguje ve všech čtyřech
případech a **přežije, když někdo později sink změní**. Klasifikovat klíče podle
současného sinku by šlo, ale ta klasifikace by tichem zestárla.

Hlídají to testy `*.json: no &nbsp; entity` a `*.json: U+00A0 between value
and unit` v `tests/run-tests.mjs`.

## Nástroj

Třídu 1 (mezera mezi číslem a jednotkou) dělá skript, ne ruční hledání:

```bash
python3 docs/notation/tools/nbsp.py --check --words -v <soubory>   # náhled
python3 docs/notation/tools/nbsp.py --fix   --words    <soubory>   # zápis
```

Oddělovač volí podle přípony souboru sám. Nesahá do `<script>`, `<style>`,
komentářů, `.formula`, `data-latex`, `$…$`, `<pre>` ani `<code>`. Zná výjimky
(`12litrový`, `60°`, `12l lahev`) a s `--words` opraví i mezeru u skloňovaných
názvů („2 bary"), aniž by měnil tvar slova. `--words` se uplatní jen na české
soubory. Hodnoty klíčů `id`, `slug`, `category` a spol. přeskakuje.


## Rozsah

Celkem **3 843 oprav ve 32 souborech**. Původní odhad byl 3 290; rozdíl vznikl
tím, že se doplnily skloňované názvy jednotek a jednotky s horním indexem
(`10 mm²`), které první měření minulo.

U každé skupiny je doloženo, že se nezměnilo nic než mezery: normalizovaný
obsah (bez mezer a nedělitelných mezer) je před opravou i po ní shodný.

### A. Teoretické stránky — **hotovo**

Tohle čte garant a komise.

| Soubor | Opraveno |
|---|---|
| `pressure.html` | 83 |
| `gradient-factors.html` | 18 |
| `tissue-loading.html` | 15 |
| `about.html` | 13 |
| `m-values.html` | 12 |
| `locales/cs.json` | 189 |
| `locales/en.json` | 177 |
| `locales/es.json` | 173 |

Zároveň se 22 existujících `&nbsp;` v locales převedlo na U+00A0, aby v datech
platil jeden tvar.

### B. Kvízy — **hotovo**

| Soubor | Opraveno |
|---|---|
| `data/quiz-physics{,-en,-es}.json` | 898 / 776 / 781 |
| `data/quiz-accidents{,-en,-es}.json` | 87 / 57 / 57 |
| `data/quiz-anatomy{,-en,-es}.json` | 72 / 17 / 19 |
| `data/quiz-training{,-en,-es}.json` | 66 / 64 / 59 |
| `data/quiz-equipment{,-en,-es}.json` | 50 / 45 / 44 |
| `data/quiz-safety{,-en,-es}.json` | 49 / 40 / 39 |
| `data/quiz-vessel{,-en,-es}.json` | 21 / 14 / 15 |
| `data/dive-setup.json`, `data/dive-profiles.json` | 14 / 9 |

Kvízy jdou přes `innerHTML`, ale i tak dostaly U+00A0 — data se řídí
příponou, ne sinkem. **Měnila se jen typografie, nikdy formulace** — jsou to
doslovné otázky SPČR. Nedělitelná mezera znění otázky nemění.

Klíče `id`, `slug`, `category` a spol. nástroj přeskakuje: `30m-deco-air`
v `dive-profiles.json` je identifikátor, který se v `js/main.js` vyhledává
podle hodnoty.

### C. Sandbox — **hotovo**

`transfilling.html` 24, `cascade-filling.html` 18, `gas-law.html` 17,
`tissue-saturation.html` 16, `chart-test.html` 5, `gradient-factors.html` 3,
`schreiner.html` 3, `haldane.html` 2, `m-values.html` 2 — celkem 90.

Ukázky kódu v `<pre>` a `<code>` nástroj přeskakuje: kód se cituje doslova
a nedělitelná mezera by se zkopírovala s ním.

## Mimo rozsah

- **`sw.js`, `.github/copilot-instructions.md`** — nejsou pokryté `applyTo`
  a nezobrazují se uživateli. (V copilot-instructions jsou 4 výskyty
  `1.6 bar`, `4 bar`, `1500 m`, `330 m`; ponecháno vědomě.)
- **Formulace kvízových otázek** — citace SPČR.
- **Jednotky v kvízech** (`kPa` místo `bar`) — rovněž citace.
- **`60°`, `180°`** — úhly a azimuty se píší bez mezery; `data/quiz-vessel.json`
  jich má 71 a nesmí se jich nikdo dotknout.
- **`12litrový`, `15litrová`** — složená přídavná jména.
- **Skloňované názvy jednotek** — „s méně než 1 barem", „2 bary". Opraví se
  jen mezera, tvar slova zůstává.
- **Španělský překlad `privacy.*`** (24 klíčů chybí) — obsahová práce, ne zápis.
  Zadokumentováno v testu parity.

## Další třídy chyb (samostatné úlohy)

Nedělitelné mezery jsou jen jedna z pěti tříd. Zbývá:

| Třída | Odhad | Issue |
|---|---|---|
| Parciální tlaky: 8 různých zápisů, 170× ASCII `2` místo `₂` | 354 výskytů, 21 souborů | #61 |
| ~~`P_amb` velkým písmenem~~ | ~~183 v 25 souborech~~ | **hotovo** |
| `<em>` jako značka místo `<var>` | 105 (a 110 legitimních zvýraznění nechat) | #56 |
| `T_{1/2}` → `t_{1/2}` | 15–17 v 8–10 souborech | #62 |
| ~~Oddělovač tisíců obyčejnou mezerou (`600 000 Pa`)~~ | ~~198 v 6 souborech~~ | **hotovo** |

### Oddělovač tisíců — hotovo

Vyplaval při opravě mezer u jednotek. ČSN 01 6910 chce i mezi trojicemi
číslic nedělitelnou mezeru; `Intl.NumberFormat('cs-CZ')` ji tak generuje
(viz `authoring.md` §6.2). Opraveno 197 výskytů v 5 souborech pomocí
`nbsp.py --thousands`.

Ze 198 měřených výskytů jich 11 bylo v HTML a **všech 11 byl planý poplach** —
souřadnice `viewBox="0 0 480 180"` a CSS `flex: 0 0 320px`. Vyřadily je
existující zóny (vnitřek tagu, `<style>`), takže v HTML nezůstalo nic
k opravě. Vzor navíc nepřipouští vedoucí nulu, protože žádné číslo
nezačíná „0 480".

Dvě věci, které vzor musí umět:

- **`v roce 1990 200 lidí` nejsou tisíce**, ale dvě čísla. Proto přesně
  tři číslice ve skupině a před nimi nejvýš tři.
- **`600 000 Pa` obsahuje obě třídy naráz.** Kdyby se řešily zvlášť,
  nález tisíců by překryl nález jednotky a mezera před `Pa` by zůstala
  obyčejná. Nález tisíců proto navazující jednotku pohltí.

### Značka tlaku — hotovo

Opraveno 271 výskytů. Velké `P` bylo ve třech tvarech a každý má jiný cíl,
protože každý končí v jiném vykreslovači:

| Povrch | Bylo | Je | Proč zrovna takhle |
|---|---|---|---|
| HTML / `innerHTML` | `P<sub>amb</sub>` | `<var>p</var><sub>amb</sub>` | `<var>` je kurzíva se sémantikou, `<sub>` jako sourozenec zůstane stojatě |
| KaTeX | `P_{amb}` | `p_{\mathrm{amb}}` | bez `\mathrm` by se index vysázel kurzívou |
| prostý text (canvas, SVG) | `P_amb` | `p_amb` | HTML se tam nevykreslí; opravitelná je jen velikost písmene |

**Index se nepřekládá.** Glossary §3 chce český index (`p_okol`), ale sama si
poznamenává, že popisky grafů jsou sdílené přes CZ/EN/ES a lokalizace indexů
si vyžádá jejich převod do i18n. To je samostatná úloha; tady se mění jen
velikost a řez značky.

**Známé omezení:** na canvasu a v SVG nelze zapnout kurzívu uprostřed řetězce,
takže `p_amb (bar)` zůstává stojatě. Popisek ovládacího prvku vedle grafu
(`sandbox.gradientFactors.controls.tissuePt`) je proto schválně taky `p_t`,
ne `<var>p</var><sub>t</sub>` — jinak by dvě sousední popisky vypadaly jinak.

Doplněno CSS z `authoring.md` §2 (`var` kurzívou, `var sub` zpět stojatě,
`.unit`/`.chem`/`.qty-abbr`, `.qty` nezlomitelné). Do té doby v projektu
nebyl ani jeden `<var>` a pravidla v CSS chyběla, přestože je dokument
předepisoval.

**Co našel až prohlížeč, ne grep:** popisek osy `P_amb (bar)` byl natvrdo
v inline `<script>` (`sandbox/m-values.html:998`) a přebíjel opravenou i18n
hodnotu. Stejně tak dva fallbacky v `translate()` a šablonové literály
skládané do `innerHTML`. Statická kontrola je hlásit nemohla, protože leží
v zóně, kam nástroj schválně nesahá.

### Vývojářský povrch se schválně nemění

Velké `P` zůstává v JSDoc komentářích (40 výskytů v `js/`) a ve vývojářské
wiki (86 výskytů). Není to opomenutí:

- Oponent hodnotí **produkt**, ne zdrojový kód.
- Jde o jeden souvislý povrch. Kdyby se převedl jen kód a wiki ne, citace
  `file:line` ve wiki přestanou odpovídat — a rozejitá wiki je podle
  `CLAUDE.md` horší než žádná.
- Přejmenování v komentářích nemá žádný uživatelský efekt a zdvojnásobilo
  by diff, ve kterém by se ztratily skutečné změny sazby.

Identifikátory (`pAmb`, `PPO2_DECO_LIMIT`, `options.ppO2`) se nemění nikdy —
to je refaktoring, ne sazba.

## Pracovní postup

Jedna stránka nebo jeden locale prefix = jeden PR. Na každý běž skillem
`fixing-physics-notation`, který vynutí inventuru, paritu cs/en/es, bodovou
editaci a report.

Po každém PR: `npm test` (280+), `git diff --stat` == `git diff -w --stat`,
bump verze v `sw.js` i `css/styles.css`.
