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
| ~~Parciální tlaky: 8 různých zápisů~~ | ~~354 v 21 souborech~~ (skutečně 205 v 20) | **hotovo** |
| ~~`P_amb` velkým písmenem~~ | ~~183 v 25 souborech~~ | **hotovo** |
| `<em>` jako značka místo `<var>` | 105 (a 110 legitimních zvýraznění nechat) | #56 |
| `T_{1/2}` → `t_{1/2}` | 15–17 v 8–10 souborech — **změřeno 0**, viz níže | #62 |
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

### Parciální tlaky — hotovo

Nástroj `docs/notation/tools/ppres.py`, 205 oprav ve 20 souborech (PR #88).
Doplňkově 51 oprav `psym.py` (malé `p` s indexem, ale bez kurzívy).

Glossary §4 tuhle třídu nerozhoduje plošně, ale podmíněně:

> `ppO₂` je hovorové synonymum, ne značka. Kanonicky *p*<sub>O₂</sub>.
> `ppO₂` **smí zůstat** ve varovných hláškách a popiscích grafů; **ve vzorci nikdy**.

Ta výjimka není libovůle. Popisky jdou na canvas Chart.js a do `alert()`, kde se
HTML nevykreslí — kurzívu ani dolní index tam zapsat nelze a `ppO₂` je nejmenší
zlo. Nástroj proto opravuje jen text, o kterém **umí dokázat**, že končí
v `innerHTML`. 25 popisků grafů, legend a varování zůstalo záměrně beze změny.

#### Co bylo v jakém tvaru

| Povrch | Před | Po |
|---|---|---|
| česká próza | `<em>pp</em>O₂` | `<var>p</var><sub>O₂</sub>` |
| anglická/španělská próza | `<em>p</em>O₂`, `ppO₂` | totéž |
| KaTeX | `ppO_2`, `pp_{inert}`, `F_{O_2}` | `p_{\mathrm{O_2}}`, `f_{\mathrm{inert}}` |
| HTML vzorec | `p<sub>amb</sub>` (stojatě) | `<var>p</var><sub>amb</sub>` |
| canvas / varování | `ppO₂ (bar)` | beze změny (výjimka výše) |

Objemový zlomek se sjednotil zároveň: glossary §4 má *f*, projekt psal `F_{O_2}`
(velké `F` je značka síly).

#### Tři důkazy, na kterých nástroj stojí

1. **HTML tag v hodnotě dokazuje `innerHTML`** — jinak by uživatel tu značku
   viděl doslova.
2. **Klíč v `data-i18n` dokazuje `innerHTML`** — `js/i18n.js:99` dělá
   `el.innerHTML = translated` bez výjimky. Tohle je průkaznější než bod 1:
   `<th data-i18n="…">ppO₂ (bar)</th>` žádný tag nemá, a přesto je to HTML.
   Výjimka `page.title` jde do `document.title`, což je prostý text.
3. **`<sub>` uvnitř zóny „formula“ dokazuje HTML vzorec, ne KaTeX** — v KaTeX
   zdroji by ta značka nedávala smysl. Bez tohohle rozlišení propadlo 51 výskytů
   `p<sub>amb</sub>` v `.formula` blocích.

#### Sink je vlastnost klíče, ne jazykové mutace

První verze nástroje rozhodovala podle jednotlivé hodnoty. Výsledek: čeština
`<em>pp</em>N₂ v našich plicích` se opravila, angličtina `The ppN₂ in our lungs`
ne — tentýž klíč, tentýž DOM, jiný výsledek. Přesně ta disparita, kterou má
sjednocení odstranit. Nástroj proto sjednocuje důkaz přes celou jazykovou
rodinu (`locales/{cs,en,es}.json`, `data/quiz-X{,-en,-es}.json`). Rozdíl:
139 → 171 oprav.

#### Co odhalil až test a prohlížeč

- **Dvojitý dolní index.** `ppN₂<sub>max</sub>` se změnilo na
  `<var>p</var><sub>N₂</sub><sub>max</sub>` — dva sousední `<sub>`. Chytil to
  regresní test. Víceslovný index se odděluje čárkou: `<sub>N₂,max</sub>`.
- **Pozor na `sub + sub` jako detektor.** CSS sousední kombinátor ignoruje
  textové uzly, takže `<sub>amb</sub> + GF × (M − <sub>amb</sub>)` hlásí falešně
  pozitivní nález. Skutečná kontrola je `previousSibling.nodeName === 'SUB'`.
- **Text hned za tagem propadal.** Lookbehind vylučoval `>`, takže `<li>ppN₂`
  se neopravilo, zatímco totéž uprostřed věty ano. `>` se vyloučit nesmí, `<`
  ano (`<p>O₂` není parciální tlak).

#### Kvízy: doslovnost citací SPČR zůstala

Všech 27 českých výskytů bylo ve `explanation` — v našem výkladu, ne v zadání
otázky ani v možnostech odpovědí. Znění zkouškových otázek se nezměnilo.

### Poločas `t`(1/2) — hotovo

Odhad 15–17 výskytů se nepotvrdil a **první měření na `T_{1/2}` vrátilo nulu**.
Nula ale znamenala jen to, že se hledal špatný tvar: projekt značku psal `T½`
a `t<sub>½</sub>`, tedy s vulgárním zlomkem U+00BD. Skutečný rozsah byl **77
výskytů** v 8 souborech. Poučení pro další třídy: než se issue zavře na základě
nuly, musí se prohledat i tvary, které se ke stejnému významu píší jinak.

Chyba byla dvojí:

- **velké `T`** — Bühlmannova notace, glossary ji uvádí v tabulce chyb;
- **`½` místo indexu `1/2`** — U+00BD je kompatibilní znak s rozkladem
  `<fraction> 1 ⁄ 2`, tedy stejná kategorie jako `℃` (U+2103), kterou glossary
  za chybu označuje už dřív. V `T½` navíc ½ nebyl index vůbec — sázel se
  v plné velikosti vedle značky.

Sjednoceno na `<var>t</var><sub>1/2</sub>`: 33 řetězců v locales (11 klíčů ×
3 jazyky, parita seděla), 22 v HTML.

#### Zápis se řídí sinkem, ne vkusem

Ne každé místo `<sub>` unese. Tvar se proto liší podle sinku — stejná úvaha,
jakou projekt už používá u `&nbsp;` proti doslovnému U+00A0. Pravidlo je nově
v `authoring.md` §5b.

| Sink | Zápis |
|---|---|
| HTML a `locales/*.json` (jdou do `innerHTML`) | `<var>t</var><sub>1/2</sub>` |
| KaTeX | `t_{1/2}` — už bylo správně |
| SVG `<text>` | dva `<tspan>` (kurzíva + posun `dy`) |
| `<option>` | `t½` — obsah je podle specifikace jen text |

Sink u locales se neodhadoval: `applyTranslations()` přiřazuje `el.innerHTML`
a žádné JS těch 11 klíčů nečte do `textContent`.

#### Co odhalil až prohlížeč

- **`dy` posouvá i následující obsah.** Popisek osy `t(1/2) (min, log)` měl
  závorku posazenou o výšku indexu níž. Suffix musí baseline vrátit opačným
  `dy`; ověřeno tím, že spodní hrana prvního a posledního `<tspan>` sedí na
  1930 px, zatímco index je na 1933.
- **Značky ve Schreinerovi se při výchozím stavu vůbec nekreslí** —
  `Math.floor(tMax / t½)` je 0, protože segment má 3 min a nejrychlejší tkáň
  5 min. Kód by tak zůstal neověřený; bylo nutné nastavit rychlost 0 m/min
  a segment 40 min, teprve pak se vykreslilo 5 značek.

#### Past ve vlastním testu

Výjimka pro komentáře byla napsaná jako „řádek začíná `//`", jenže
`halfTime: 38.3,    // …t½` je komentář **na konci řádku**. Test tenhle řádek
nahlásil — a měl pravdu, protože skript do něj předtím markup opravdu vložil.
Výjimka se opravila na „`//` stojí před značkou".

Tři testy, každý ověřen tím, že se chyba nasadila zpátky a test spadl.

### Skupinový oddělovač a osy grafů — hotovo

`toLocaleString()` bez lokalizace sleduje **jazyk prohlížeče**, ne jazyk
aplikace. Česká stránka v anglickém prohlížeči tak kreslila na osu `0.5`
vedle `0,5` v textu pod grafem. 6 volání nahrazeno `fmtGroup()`.

`fmtGroup` je záměrně oddělená od `fmtNum`: seskupování tisíců se u malých
fyzikálních veličin neuplatní, ale u bar-litrů ano. Oddělovač se nehádá,
bere se z CLDR přes `Intl` — `authoring.md` §6.2 ukazuje, že konkrétní kódový
bod se liší podle verze dat (čeština U+00A0, francouzština U+202F).

**Chart.js si čísla na osách formátuje sám** a locale bere z
`Chart.defaults.locale`, které jinak spadne na jazyk prohlížeče. Nastaveno
z jazyka aplikace, čímž se opravily i osy, které vlastní `ticks.callback`
nemají. Ověřeno negativně: bez toho řádku hlásí kontrola `0.5`, `1.0`, `1.5`
na třech stránkách.

Doběrky z třídy poločasu: osy grafů na `tissue-loading.html` psaly `0T`, `1T`.
Byly na canvasu, kde DOM kontrola nedohlédne — opraveno na `0t½` podle
pravidla pro sinky bez markupu.

#### Kontrola, která měřila nulu

Předchozí kontrola desetinné čárky hlásila 52/52 čistých kombinací. Byla
**planá ve dvou vrstvách naráz**:

1. Nastavovala `localStorage` klíč `language`, jenže i18n používá
   `deco-theory-lang`. Všechny „české" běhy tedy běžely anglicky.
2. Regulární výraz vyžadoval jednotku **v témže textovém uzlu** jako číslo.
   Web ale sází `<span>2,41</span> bar`, takže uzel obsahuje jen číslo.

Odhaleno až tím, že se do `format.js` nasadila chyba (čeština bez čárky)
a kontrola dál hlásila „vše čisté". Poučení do dalších tříd: **zelený výsledek
kontroly neznamená nic, dokud kontrola neselže na nasazené chybě.**

Přepsaná kontrola počítá, kolik čísel vůbec našla, takže planost je vidět
na první pohled. Našla 53 zbylých výskytů — viz další sekce.

### Desetinný oddělovač v tabulkách a konstantách — hotovo

Poslední skupina desetinných teček: 53 textových uzlů, které předchozí PR
nezachytily, protože nevznikají výpočtem ani nejsou v locales — jsou napsané
natvrdo v HTML nebo zabudované do řetězců vzorců.

| Kde | Počet | Řešení |
|---|---|---|
| `pressure.html` tabulka podle nadmořské výšky | 6 | tbody se generuje z pole `ALTITUDE_ROWS` přes `fmtNum()` |
| `pressure.html` Daltonův příklad | 6 | tbody se generuje z `DALTON_GASES`, součin se počítá |
| `pressure.html` tabulky limitů *p*(O₂) a *p*(N₂) | 16 | `localizeNumbersIn()` — buňky jsou rozsahy (`0,16 – 0,50`), přepisuje se jen oddělovač |
| `pressure.html` vzorec SAC (KaTeX) | 3 | `localizeLatex()` |
| `tissue-loading.html` tabulka rozpustnosti | 12 | tbody se generuje z `SOLUBILITY_ROWS` |
| `tissue-loading.html` popisky SVG schématu | 6 | `fmtNum()` v `js/tissueEducation.js` |
| sandboxy: konstanty ve vzorcích | 17 | import `WATER_VAPOR_PRESSURE`, `Math.LN2`, `PRESSURE_PER_METER`, `B_INTERCEPT` |
| `sandbox/schreiner.html` tlačítka kroku | 2 | `fmtNum(0.1, 1)` |

**Tři různé sinky, tři různé nástroje.** Do `js/format.js` přibyly dvě funkce,
protože „přepiš tečku na čárku" znamená v každém kontextu něco jiného:

- `fmtNum()` — číslo vzniká výpočtem, formátuje se při vzniku;
- `localizeNumbersIn(element)` — číslo je součástí prózy v buňce
  (`< 0,16`, `0,16 – 0,50`). Přestavovat kvůli čárce celý řádek z dat by bylo
  nepřiměřené. **Zachovává počet desetinných míst** — `0.50` → `0,50`,
  nekolabuje na `0,5`. Je záměrně opt-in na konkrétní element: plošný běh přes
  `document` by „lokalizoval" i čísla verzí a poměry;
- `localizeLatex(src)` — KaTeX. V matematickém režimu je holá čárka
  interpunkce a KaTeX za ni vloží mezeru (`0, 84`). Musí se zabalit do
  skupiny: `0{,}84` (authoring.md §4).

**Statické placeholdery.** Regresní test na konstanty odhalil vedlejší nález:
sandboxy měly v HTML zapsané ukázkové hodnoty (`= (4.0133 − 0.0627) · 0.7902`),
které JS při inicializaci přepíše. Byly to mrtvé anglické hodnoty, které navíc
svádí k tomu upravovat je místo šablony. 47 takových uzlů se nahradilo `…`;
kontrola v prohlížeči ověřuje, že žádný `…` na stránce nezůstane.

**Chybný sink v SVG.** V `tissue-loading.html` byly popisky uvnitř `<svg>`
zapsané jako `<text><var>p</var><sub>N₂</sub> = 3.16</text>`. SVG ale HTML
značky nezná — parser je vystrčí ven z grafiky a text `= 3.16` skončil jako
volný uzel v okolním `<div>`. Zápis se opravil na prostý text (viz
authoring.md §5b: tvar značky se řídí sinkem).

**Nepoužité klíče.** `daltonsLaw.example.o2PP` a `n2PP` obsahovaly jen číslo
s jednotkou. Po vygenerování tabulky je počítá JS, takže se z locales smazaly
(3 jazyky × 2 klíče).

### Desetinný oddělovač ve statickém obsahu — hotovo

31 oprav (PR #89): 6 v `data/quiz-accidents.json` (české výklady psaly `0.16 bar`,
zatímco `quiz-physics.json` správně `0,16 bar`) a 25 v `locales/es.json`.

Španělština byla **nekonzistentní sama se sebou** — 104× čárka proti 25× tečce.
Většina odpovídá SI i RAE, takže se sjednotilo na čárku.

Regresní test hlídá **obě** konvence naráz: čárku v cs/es, tečku v en. Dva
detaily, bez kterých by hlásil falešně pozitivní nálezy:

- **Pohled dopředu na jednotku.** Bez něj by se chytila čísla verzí a poměry.
- **Skupina, která není přesně tři číslice.** Anglický oddělovač tisíců
  `1,000 kPa` je správně; bez tohohle rozlišení by se četl jako desetinná čárka.

### Desetinný oddělovač za běhu — hotovo

Statický obsah řešil předchozí PR; tenhle řeší **vypočtená čísla**. V české
verzi sandbox ukazoval `0,16 bar` v textu vedle `0.7511 bar` ve výpočtu
hned pod ním.

**`js/format.js`** — `fmtNum(value, decimals, lang)`. Modul záměrně nic
neimportuje: čisté funkce jsou testovatelné pod Node a `js/mvalues.js` ani
`js/tissueEducation.js` nezískávají závislost na prohlížeči.

| Co | Kolik |
|---|---|
| `toFixed()` přepsáno na `fmtNum()` | 253 |
| surová interpolace čísla (`${comp.halfTime}`) | 6 |
| statická anglická čísla v HTML nahrazena výpočtem | 10 |
| ponecháno syrových `toFixed()` (viz níže) | 23 |

Seskupování tisíců se **nedělá**. Aplikace zobrazuje malé fyzikální veličiny
(bar, m, min), kde se skupiny neuplatní, a zavádět je by změnilo výstup, o který
tady nejde.

#### Kde čárka není typografie, ale chyba

23 volání `toFixed()` zůstalo záměrně. Desetinná čárka by na těchto místech
nebyla „jinak vysázené číslo", ale neplatná hodnota:

| Kontext | Kde | Proč |
|---|---|---|
| geometrie SVG (`d`, `x1`, `cy`, …) | `haldane.html` 6, `schreiner.html` 8 | prohlížeč atribut zahodí a prvek zmizí |
| `<input type="number">.value` | `m-values.html` 5 | čárka není platná hodnota |
| hodnota čtená zpět `parseFloat` | `schreiner.html` 3 | rozbije se výpočet |
| samotný formátovač | `js/format.js` 1 | jediné místo, kam `toFixed` patří |

Test `no shipped page formats a display number with raw toFixed` hlídá tento
rozpočet po souborech. Přibude-li nové `toFixed()`, test pojmenuje soubor.

#### Bez čeho by to nefungovalo

**Jazyk musí být znám dřív, než se něco vykreslí.** `initI18n()` čeká na
`locales/*.json`, ale stránky vykreslují grafy synchronně ve stejném bloku.
Prvních pár set milisekund se tedy formátovalo podle `lang="en"`. `js/i18n.js`
proto nastavuje `document.documentElement.lang` už při vyhodnocení modulu —
závislosti modulu se vyhodnotí před tělem importujícího modulu, takže každá
stránka má správný jazyk od prvního tiku. `setLanguage()` ho navíc přepisuje
synchronně, ještě před fetchem, aby přepnutí jazyka nezaostávalo o jeden
síťový round trip.

**Statická čísla v HTML, která JS přepisuje až na kliknutí.** Popisky posuvníků
v `sandbox/gradient-factors.html` se zapisovaly jen při události `input`, takže
do prvního doteku svítilo `2.40 bar` ze šablony. `render()` teď popisky
synchronizuje. Tabulka MOD v `pressure.html` měla čtyři odpovědi natvrdo
(`56.7 m`, …) bez `data-i18n` — žádný překlad se k nim nedostal; jsou přesně
vypočitatelné, takže se generují.

**Převod `<script>` na `<script type="module">`.** Klasický skript neumí
`import`. Čtyři stránky (`cascade-filling`, `gas-law`, `transfilling`,
`tissue-loading`) proto musely na modul. Ověřeno předem: žádné `on*=` atributy
v HTML, žádné `window.X = `, žádný implicitní globál a `node --check` jako
modul — tedy nic, co by rozbil striktní režim nebo modulový rozsah.

#### Co našel až prohlížeč

Statická kontrola tohle nemohla vidět:

- **`fmtNum` v souřadnicích SVG.** Vyloučení pokrývalo jen
  `setAttribute('cy', …)`. Hodnota přiřazená do proměnné a použitá o řádek dál
  proklouzla; konzole hlásila `<line> attribute y1: Expected length, "11,82"`.
- **`js/tissueEducation.js` načtený jako klasický skript** — přidaný `import`
  shodil celou stránku (`Cannot use import statement outside a module`).
- **Popisky v Chart.js jsou na canvasu, ne v DOM.** Prošlo se to až přímým
  vyvoláním tooltipu přes `chart.tooltip.setActiveElements()`; jinak kontrola
  hlásila „v pořádku", protože nečetla vůbec nic.

**Změřeno po opravě:** 26 stránek × 2 jazyky = 52 kombinací, 0 špatných
oddělovačů, 0 chyb v konzoli. Ověřeno i přepnutí jazyka za běhu bez reloadu
(`2.40 bar` → `2,41 bar`) a odhalení skrytých panelů kliknutím.

**Testy:** 294/294 (6 nových).

### Zbývá

`toLocaleString()` — 6 volání, řídí se locale prohlížeče, ne jazykem aplikace.
Týká se seskupování tisíců v `sandbox/cascade-filling.html`. Malý rozsah,
samostatný úkol.
