# Jak zapisovat veličiny — HTML, CSS, KaTeX, JS, Markdown

Praktická příručka: **co napsat na klávesnici**, ne proč. Které značky patří kam, je
v [`glossary.md`](glossary.md); proč tyto konvence platí, je ve [`style-guide.md`](style-guide.md).
Tento dokument mění jen zápis autora — **neinstaluje žádný kód**. Návrhy CSS bloku,
KaTeX maker a číselného modulu jsou proto vždy označeny jako **fáze 2**.

Čtenář tohoto dokumentu právě otevřel soubor a chce vědět, jaký znak/element/volání
tam patří. Každý blok kódu je proto ověřen tak, aby šel zkopírovat beze změny.

## 1. HTML — knihovna vzorů

### 1.1 Proč `<var>`, ne `<em>`

HTML Living Standard, §4.5.16, uvádí mezi případy užití elementu `<var>` doslova
„a symbol identifying a physical quantity" — přesně náš případ. `<em>` naproti tomu
znamená *stress emphasis*: mění důraz věty a čtečky obrazovky mu odpovídajícím
způsobem mění intonaci. Pro značku veličiny je to sémanticky špatně — `<em>` nenese
informaci „tohle je proměnná", nese informaci „tohle slovo je v mluvené větě
zdůrazněné". `glossary.md` §7 to shrnuje jedním řádkem; tady je důvod v plném znění,
protože je to nejčastější reálná chyba v repozitáři (viz §1.3 níže).

Element `<sub>` smí být uvnitř `<var>` (spec §4.5.19: *„The `sub` element can be used
inside a `var` element, for variables that have subscripts."*), ale DecoJS-preferovaný
zápis je **index mimo `<var>`**:

```html
<var>p</var><sub>amb</sub>
```

Ne `<var>p<sub>amb</sub></var>`. Obojí je platné HTML, ale zápis s indexem uvnitř
`<var>` zdědí kurzívu z `<var>` na `<sub>` a vyžaduje CSS reset (viz §2 níže), aby se
popisný index vrátil na stojaté písmo. Zápis s indexem mimo `<var>` je jednoznačný bez
spoléhání na dědičnost — `<sub>` sám o sobě stojaté písmo nezdědí, protože není potomkem
`<var>`.

### 1.2 Vzorová knihovna (kopírovat doslovně)

```html
<!-- 1. Holá veličina -->
<var>p</var>

<!-- 2. Veličina s popisným indexem (index STOJATĚ) -->
<var>p</var><sub>amb</sub>

<!-- 3. Index, který je proměnnou (index KURZÍVOU) -->
<var>a</var><sub><var>i</var></sub>

<!-- 4. Parciální tlak s chemickým indexem -->
<var>p</var><sub>N<sub>2</sub></sub>

<!-- 5. Hodnota + jednotka (nedělitelné) -->
<span class="qty">1,4&nbsp;<abbr class="unit" title="bar">bar</abbr></span>

<!-- 6. Chemický vzorec (VŽDY stojatě) -->
<span class="chem">N<sub>2</sub></span>

<!-- 7. Víceznaková zkratka jako veličina (stojatě) -->
<abbr class="qty-abbr" title="gradientový faktor">GF</abbr><sub>low</sub>

<!-- 8. Vložený vzorec -->
<span class="formula-inline">$p_{\mathrm{amb}} = p_{\mathrm{atm}} + \rho g h$</span>
```

Vzor 5 se liší od podkladové rešerše fáze 1: tam je mezi číslem
a jednotkou `&#8239;` (U+202F). **V tomto projektu se místo toho píše `&nbsp;`** —
důvod je vysvětlen v §6.1. `&#8239;` smí v celém dokumentu authoring.md vystupovat
jen jako *chybný* příklad (zde i v §6.1), ne jako doporučení (viz tabulka §4).

### 1.3 Současný stav: `<em>` jako značka veličiny

`<em>` se dnes používá jako značka proměnné v datech kvízů — je to **jediný HTML
element**, který se v těchto řetězcích vůbec vyskytuje (typicky `<em>pp</em>O₂`).
Reprodukovatelné ověření:

```bash
grep -o '<em>' data/*.json | wc -l   # 88 výskytů
grep -l '<em>' data/*.json | wc -l   # napříč 9 soubory
```

Tato data se vykreslují přes `innerHTML` — `js/quiz.js:196` (otázka a možnosti
odpovědí) a `js/quiz.js:251` (vysvětlivka po zodpovězení). Náhrada `<em>` → `<var>`
se tedy opravdu vykreslí — `innerHTML` neuteče značky, jen je vloží do DOM.

**Provedeno (fáze 2, PR #88.)** Podle §4 glossáře je `pp` ve vzorci nepřípustné
synonymum, takže cílový zápis je `<var>p</var><sub>O₂</sub>`. Čeština psala
`<em>pp</em>O₂`, angličtina a španělština `<em>p</em>O₂`; sjednoceno na kanonický
tvar ve všech třech jazycích.

Dřívější znění tohoto odstavce nabízelo jako alternativu
`<span class="qty-abbr">pp</span><var>p</var><sub>O₂</sub>`. To je omyl — vysázelo
by se to jako „pp*p*O₂“, tedy značka dvakrát. Hovorové `pp` se buď ponechá celé
a bez značky (popisky grafů a varování, viz výjimka v §4 glossáře), nebo se
nahradí kanonickým tvarem. Míchat obojí nelze.

## 2. CSS — nainstalováno

> Tento blok **je v `css/styles.css`** (na konci souboru). Nainstalovala ho fáze 2,
> PR #87. Pozor: `var(--x)` jinde v souboru je čtení custom property, ne selektor
> `var` — jsou to dvě různé věci se stejným názvem.

Před instalací neobsahoval `css/styles.css` žádný selektor `var`, `sub` ani `sup`,
takže přidání s ničím nekolidovalo.

```bash
grep -nE '^\s*(var|sub|sup)\s*[,{]|[^-]\b(var|sub|sup)\s*\{' css/styles.css
# (žádný výstup)
```

**Pozor na past v tomto příkazu:** `var(--x)` v `css/styles.css` je **hodnota
vlastnosti** (CSS custom property lookup), ne selektor prvku `var`. Grep výše je
schválně napsaný tak, aby `var(` nezachytil — nezaměňujte tyto dvě věci, když budete
prohledávat soubor sami.

```css
/* Značky veličin — kurzíva dle ČSN EN ISO 80000-1 kap. 7 */
var {
    font-style: italic;
}

/* Popisné indexy uvnitř <var> zpět na stojaté (dědí kurzívu) */
var sub,
var sup {
    font-style: normal;
}

/* Výjimka: index, který je sám proměnnou → opět kurzíva */
var sub var,
var sup var {
    font-style: italic;
}

/* Jednotky a chemické vzorce vždy stojatě */
.unit,
.chem,
.qty-abbr {
    font-style: normal;
    font-variant: normal;
    text-decoration: none; /* potlačí tečkované podtržení <abbr> */
}

/* Dvojice hodnota+jednotka se nesmí zalomit */
.qty {
    white-space: nowrap;
}
```

> **Klíčový detail:** `font-style` se dědí přes DOM strom, ale `<var>p</var><sub>amb</sub>`
> (§1.2 vzor 2, **doporučený** zápis) má `<sub>` jako **sourozence** `<var>`, ne potomka —
> kurzívu tedy vůbec nezdědí a pravidlo `var sub { font-style: normal }` na něj nemá
> vliv (ani ho nepotřebuje). Pravidlo je nutné jen pro alternativní zápis
> `<var>p<sub>amb</sub></var>` (index uvnitř `<var>`), který spec také povoluje, ale
> projekt ho nedoporučuje — viz §1.1.

## 3. Přístupnost

| Element | Jak to čte odečítač | Poznámka |
|---|---|---|
| `<var>` | jen text, role `generic` | kurzíva je čistě vizuální |
| `<sub>`/`<sup>` | inline, bez oznámení pozice (NVDA, JAWS, VoiceOver) | pro `p_amb`, `CO₂` dostačuje |
| `<abbr title>` | některé odečítače přečtou `title` | vhodné pro jednotky (vzor 5, 7) |

Na české sekce doplňujte `lang="cs"` — ovlivňuje výslovnost i to, jak čtečka přečte
desetinnou čárku.

## 4. Unicode — referenční tabulka

| Znak | Název | Kód | Entita | Použití |
|---|---|---|---|---|
| − | minus | U+2212 | `&minus;` | záporná čísla, odčítání — **ne** `-` |
| · | tečka na střední výšce | U+00B7 | `&middot;` | součin veličin: *ρ*·*g*·*h* |
| × | znak násobení | U+00D7 | `&times;` | aritmetika, rozměry, `× 10ⁿ` |
| – | pomlčka | U+2013 | `&ndash;` | rozsahy: `10–20&nbsp;m` |
| (nbsp) | nedělitelná mezera | U+00A0 | `&nbsp;` | **autorský zápis** číslo–jednotka (§6.1) |
| (nnbsp) | úzká nedělitelná mezera | U+202F | `&#8239;` | **nepoužívat při psaní** ✗; SI Brochure ji doporučuje jako oddělovač tisíců, ale `cs-CZ` v ověřeném prostředí (§6.2) místo ní generuje U+00A0 — jediný ověřený zdroj U+202F v tomto repozitáři je `Intl.NumberFormat('fr-FR', …)`, který DecoJS nepoužívá |
| ° | stupeň | U+00B0 | `&deg;` | `20&nbsp;°C` — **ne** U+2103 ℃ |
| ≈ ≤ ≥ ≠ | | U+2248 / U+2264 / U+2265 / U+2260 | `&asymp;` `&le;` `&ge;` `&ne;` | |
| τ ρ Δ π η μ λ | řecká písmena | — | `&tau;` `&rho;` `&Delta;`… | veličiny |
| ₂ | dolní index 2 | U+2082 | — | chemické vzorce v prose (§1.2 rozdíl mezi `<sub>` a Unicode je v §7.5 rešerše, ne zde) |

> **℃ (U+2103) nikdy nepoužívat.** Je to kompatibilní znak z bloku CJK Compatibility,
> jeho dekompozice je `U+00B0 U+0043` — píšeme rovnou tyto dva znaky (`°` + `C`).

**Proč tabulka obsahuje U+202F, když se autorský nedoporučuje:** je to jediné místo
v tomto dokumentu, kde se `&nbsp;` (autorská nedělitelná mezera, §6.1) a U+202F
(hazard na straně spotřeby čísla, §6.2) objevují vedle sebe. Nejde tedy o dvě
zaměnitelné volby téhož problému — je to jedna volba (`&nbsp;` při psaní) a jedna
past (U+202F/U+00A0 v generovaném výstupu), popsaná ve dvou různých kapitolách tohoto
dokumentu. Přesně to je důvod, proč tabulkový řádek nese ✗ a odkaz na §6.2, ne
doporučení.

## 5. KaTeX / LaTeX

### 5.1 Proč `P_{amb}` je špatně — ověřeno

KaTeX (i běžný LaTeX) sází holé písmenné znaky v dolním indexu jako proměnné —
kurzívou, a navíc bez mezer mezi nimi, takže „amb" čtenář podvědomě čte jako součin
tří proměnných *a*·*m*·*b*. Ověřeno přímo v KaTeX 0.16.9 (stejná verze a CDN, jaké
používají čtyři theory pages projektu), vykreslením obou variant a přečtením
vypočítaného stylu textového uzlu „amb":

```
katex.render('P_{amb}', div, { throwOnError: false });
// → span.mord.mathnormal.mtight, computed font-style: italic   ❌

katex.render('p_{\\mathrm{amb}}', div, { throwOnError: false });
// → span.mord.mathrm.mtight,     computed font-style: normal   ✅
```

(Ověřovací skript a jeho výstup jsou v reportu k tomuto úkolu — spouští se v prohlížeči,
ne v Node, protože `katex.render()` vyžaduje DOM.)

### 5.2 Proč `\mathrm{}`, ne `\text{}`

Oba jsou v KaTeX i v GitHub Math podporované a oba vysází „amb" stojatě ve výchozím
kontextu. Rozdíl je v tom, na čem to písmo závisí:

- `\mathrm{}` je **na kontextu nezávislé** — vždy stojaté, bez ohledu na okolní řez
  písma matematického výrazu.
- `\text{}` **dědí aktuální textový řez písma** — ověřeno v KaTeX 0.16.9: uvnitř
  `\textbf{…}` se `\text{amb}` vysází tučně spolu s okolím. (Pozor: `\mathrm{}` uvnitř
  `\textit{…}`/`\textbf{…}` v KaTeX vůbec nejde použít — je to funkce jen pro matematický
  režim, ne textový, a vyhodí `ParseError`.)

Pro popisný index, který má být **vždy** stojatě bez ohledu na to, do jakého vzorce ho
někdo vloží, je proto `\mathrm{}` bezpečnější volba — nespoléhá na to, že okolí zůstane
stojaté.

### 5.3 Převodní tabulka — současný stav → správně

| Nyní v projektu | Správně | Poznámka |
|---|---|---|
| `P_{amb}` | `p_{\mathrm{amb}}` | malé *p*, stojatý index |
| `P_{alv}` | `p_{\mathrm{alv}}` | |
| `P_{t,0}` | `p_{\mathrm{t},0}` | „t" = tissue → stojatě |
| `f_{N_2}` | `f_{\mathrm{N}_2}` | N stojatě, 2 je číslice |
| `P_{H_2O}` | `p_{\mathrm{H_2O}}` | |
| `T_{1/2}` | `t_{1/2}` | malé *t*, číselný index |
| `GF_{low}` | `\mathrm{GF}_{\mathrm{low}}` | víceznaková zkratka stojatě |
| `M_{adj}` | `M_{\mathrm{adj}}` | |
| `P_{ceiling}` | `p_{\mathrm{ceiling}}` | |
| `e^{-kt}` | `\mathrm{e}^{-kt}` | ISO 80000-2: e je konstanta |
| `\text{ bar}` | `\,\mathrm{bar}` | `\,` = tenká mezera |
| `12.8 \text{ L/min}` | `12{,}8\,\mathrm{l/min}` | česká čárka, malé l |

### 5.4 Makra KaTeX — fáze 2, zatím neinstalováno

> Tento modul **zatím neexistuje** v `js/`. Instaluje ho fáze 2. Uveden zde jako
> návrh, aby budoucí implementace nezačínala z prázdna a rovnou dodržovala §5.1–§5.3.

```js
// js/katexMacros.js  — jediný zdroj pravdy pro sazbu vzorců
export const PHYSICS_MACROS = {
  // Tlaky
  "\\pamb":     "p_{\\mathrm{amb}}",
  "\\palv":     "p_{\\mathrm{alv}}",
  "\\pt":       "p_{\\mathrm{t}}",
  "\\ptzero":   "p_{\\mathrm{t},0}",
  "\\pho":      "p_{\\mathrm{H_2O}}",
  "\\pceil":    "p_{\\mathrm{ceiling}}",
  "\\panchor":  "p_{\\mathrm{anchor}}",
  "\\ppar":     "p_{\\mathrm{#1}}",        // \ppar{O_2} → p_O2
  // Zlomky plynů
  "\\fN":       "f_{\\mathrm{N}_2}",
  "\\fO":       "f_{\\mathrm{O}_2}",
  "\\fHe":      "f_{\\mathrm{He}}",
  // Bühlmann
  "\\thalf":    "t_{1/2}",
  "\\Madj":     "M_{\\mathrm{adj}}",
  "\\Mzero":    "M_0",
  // Gradientové faktory
  "\\GF":       "\\mathrm{GF}",
  "\\GFlow":    "\\mathrm{GF}_{\\mathrm{low}}",
  "\\GFhigh":   "\\mathrm{GF}_{\\mathrm{high}}",
  "\\GFinst":   "\\mathrm{GF}_{\\mathrm{inst}}",
  // ISO 80000-2 — stojaté konstanty a operátory
  "\\eu":       "\\mathrm{e}",
  "\\dif":      "\\mathrm{d}",
  // Jednotky
  "\\unit":     "\\,\\mathrm{#1}",         // \unit{bar} → tenká mezera + bar
};
```

Použití (`renderMathInElement` z `auto-render.min.js`, který theory pages už načítají):

```js
import { PHYSICS_MACROS } from './katexMacros.js';

renderMathInElement(document.body, {
  delimiters: [
    { left: "$$", right: "$$", display: true  },
    { left: "$",  right: "$",  display: false }
  ],
  throwOnError: false,
  macros: PHYSICS_MACROS      // TÝŽ objekt při každém volání — viz §5.5
});
```

Haldaneova rovnice pak je čitelná i ve zdroji:

```latex
$$\pt(t) = \palv + (\ptzero - \palv)\cdot\eu^{-kt}$$
```

Podporováno v KaTeX 0.16.x: `\mathrm`, `\text`, `\operatorname`, `\,`, `\;`, `\quad`,
`\dfrac`, `\begin{cases}`, `\ln`, `\exp`, `\gdef`, `\boldsymbol`, `\vec`.
**Nepodporováno:** `siunitx`, `\DeclareMathOperator`. `\ce{}` (mhchem) vyžaduje
samostatný contrib skript navíc (~37&nbsp;kB) — v projektu dnes nenačtený.

### 5.5 Sdílený objekt maker — ověřeno

`macros` musí být **týž objekt při každém volání** `katex.render()` /
`renderMathInElement()` — jinak `\gdef` uvnitř jednoho vzorce nepřežije do dalšího
volání. Ověřeno v prohlížeči (KaTeX 0.16.9, stejná CDN verze jako projekt):

```
const macros = {};
katex.render('\\gdef\\foo{bar}', scratchDiv, { macros, throwOnError: false });
katex.render('\\foo', outputDiv, { macros, throwOnError: false });
// → outputDiv obsahuje vykreslené "bar" — makro přežilo, protože `macros`
//   je stejný objekt v obou voláních.

katex.render('\\gdef\\foo{bar}', scratchDiv, { macros: {}, throwOnError: false });
katex.render('\\foo', outputDiv, { macros: {}, throwOnError: true });
// → vyhodí `ParseError: Undefined control sequence: \foo` — nový `{}` objekt
//   při druhém volání makro nezná.
```

Praktický důsledek pro `PHYSICS_MACROS` výše: exportovat ho jako modulovou konstantu
(`export const PHYSICS_MACROS = {...}`) a předávat **tentýž import** do všech
`renderMathInElement()` volání na stránce — ne vytvářet nový literál objektu na
každém místě volání.

### 5.6 Wiki (GitHub Math) — omezení

GitHub podporuje LaTeX v Markdownu včetně **wiki** stránek, ale bez uživatelských
maker — každý matematický blok se zpracovává nezávisle. `PHYSICS_MACROS` z §5.4 tam
tedy nefunguje; `\mathrm{...}` se musí vypisovat **pokaždé znovu**. `\ce{}` (mhchem)
tam také není podporováno.

| Kontext ve wiki | Doporučený zápis |
|---|---|
| Blokový vzorec | ` ```math ` … ` ``` ` (spolehlivější než `$$`, nevyžaduje trik se zalomením řádku) |
| Vložený vzorec | `` $p_{\mathrm{amb}}$ `` |
| Značka v prose | `*p*<sub>amb</sub>` nebo `<var>p</var><sub>amb</sub>` |
| Jednoduchý index bez vzorce | Unicode `p₂` |

`<sub>`, `<sup>` a `<var>` jsou v GitHubově sanitizační allowlistě a v Markdownu
(včetně wiki) fungují bez úprav.

## 5b. Značka s indexem tam, kde markup není

Kanonický tvar značky s dolním indexem je `<var>t</var><sub>1/2</sub>`. Ne každý
sink ale `<sub>` umí, a tvar se pak musí přizpůsobit — stejně jako `&nbsp;`
v HTML proti doslovnému U+00A0 v JSON (§6.1). **Význam je jeden, zápis se řídí
sinkem.**

| Sink | Zápis | Proč |
|---|---|---|
| HTML (včetně `locales/*.json` → `innerHTML`) | `<var>t</var><sub>1/2</sub>` | plný markup |
| KaTeX | `t_{1/2}` | index je číslo, sází se stojatě |
| SVG `<text>` | `<tspan font-style="italic">t</tspan><tspan dy="3" font-size="0.72em">1/2</tspan>` | SVG nezná `<var>` ani `<sub>` |
| `<option>`, `title=`, canvas | `t½` | obsah je podle HTML specifikace **jen text**, markup se nevykreslí |

Než někam vložíš markup, **ověř sink**. `locales/*.json` ho snese, protože
`applyTranslations()` v `js/i18n.js` přiřazuje `el.innerHTML`; kdyby týž klíč
četl `textContent` nebo Chart.js, uživatel by uviděl `<var>t</var>` jako text.

**U SVG posouvá `dy` i následující obsah.** Za indexem musí přijít `<tspan>`
s opačným `dy`, jinak zbytek popisku klesne o výšku indexu. Kontrola: spodní
hrana prvního a posledního `<tspan>` se musí rovnat.

## 6. Čísla — JS formátování

### 6.1 Při psaní: `&nbsp;` v HTML, U+00A0 v datech

Oddělovač se volí podle toho, **čím řetězec projde na cestě k uživateli**, ne podle
osobní preference.

| Soubor | Zápis | Proč |
|---|---|---|
| `*.html` | `&nbsp;` | autor to píše ručně, prohlížeč to vždy dekóduje, v diffu je to vidět |
| `locales/*.json`, `data/*.json` | **doslovné U+00A0** | tentýž řetězec může skončit v `innerHTML`, na canvasu Chart.js, v `textContent` i v atributu `title` — entitu dekóduje jen první z nich |

**V datech nesmí být `&nbsp;`.** Locale řetězec neví, kam ho kód pošle:
`js/i18n.js` ho vloží přes `innerHTML` (entita se dekóduje), ale Chart.js ho vykreslí
na canvas a `js/quiz.js` ho na dvou místech přiřadí do `textContent` — tam by se
uživateli vypsalo `20&nbsp;m` i se středníkem. Přesně na to narazil PR #82.

U+00A0 se vykreslí správně ve všech čtyřech případech. Je to jediný tvar, který
**přežije, když někdo později změní sink** — třeba při běžném zpřísnění `innerHTML`
na `textContent`. Klasifikovat každý klíč podle sinku by šlo, ale ta klasifikace by
tichem zestárla; invariant nezestárne.

Hlídají to testy `*.json: no &nbsp; entity` a `*.json: U+00A0 between value and unit`
v `tests/run-tests.mjs`.

V HTML naopak zůstává entita: doslovné U+00A0 je v diffu neviditelné a editor ho
snadno nahradí obyčejnou mezerou beze stopy. V JSON tuhle nevýhodu vyváží to, že
data se needitují tak často a hlídá je test.

Podkladová rešerše fáze 1 doporučuje `&#8239;` (U+202F) jako typograficky užší
variantu preferovanou SI Brochure; **toto doporučení projekt záměrně nepřejímá** —
viz [Rozhodnutí projektu](style-guide.md#rozhodnutí-projektu) a §4.1 v `style-guide.md`.

```html
<!-- ✅ v HTML -->
<span class="qty">20&nbsp;m</span>
<!-- ✗ nikdy takto -->
<span class="qty">20&#8239;m</span>
```

```json
{ "sac": "Hladina (1 bar): 20 l/min" }
```

V ukázce výše jsou obě mezery před jednotkou doslovná U+00A0 — v souboru je nepoznáš
od obyčejné mezery, proto na to je test. Hromadnou opravu umí
[`tools/nbsp.py`](tools/nbsp.py), který oddělovač volí podle přípony souboru sám.

### 6.2 Past na straně spotřeby: co doopravdy generuje `Intl.NumberFormat`

Toto je **jiná otázka** než §6.1 — netýká se toho, co autor napíše do souboru, ale
toho, co za běhu vyprodukuje `Intl.NumberFormat` a co s tím dělá další kód (parsování,
porovnávání v testech). Ověřeno spuštěním v Node (v26.3.1, ICU 78.3 / CLDR 48.0) i
v aktuálním Chromiu (151) — obě prostředí se shodla:

```js
const s = new Intl.NumberFormat('cs-CZ').format(12345.6);
console.log(JSON.stringify(s));
for (const ch of s) process.stdout.write(ch.codePointAt(0).toString(16) + ' ');
```
```
"12 345,6"
31 32 a0 33 34 35 2c 36
```

Oddělovač tisíců **není obyčejná mezera** (U+0020, `20`) — je to U+00A0 (`a0`),
nedělitelná mezera. To je past bez ohledu na přesný Unicode bod: kód i testy **nesmí
předpokládat ASCII mezeru** při porovnávání nebo parsování naformátovaných čísel.

```js
console.log(new Intl.NumberFormat('cs-CZ').format(10000) === '10 000');
console.log(new Intl.NumberFormat('cs-CZ').format(10000) === '10\u00A0000');
console.log(parseFloat('12\u00A0345,6'));
```
```
false
true
12
```

První řádek je `false`, protože vlevo je U+00A0 z `Intl.NumberFormat`, vpravo obyčejná
mezera ze zdrojáku. Poslední řádek — `parseFloat` se utne na první nečíslici a vrátí
jen `12`, ne `12345.6`.

**Konkrétní Unicode bod se liší podle prostředí/verze CLDR dat — nespoléhejte na
žádný pevný.** `fr-FR` ve stejném testu skutečně vrací U+202F (ověřeno stejným
skriptem, jen se změněnou lokalizací):

```js
console.log([...new Intl.NumberFormat('fr-FR').format(12345.6)].map(c => c.codePointAt(0).toString(16)).join(' '));
```
```
31 32 202f 33 34 35 2c 36
```

`cs-CZ` tedy v tomto ověřeném prostředí **negeneruje** U+202F — generuje U+00A0.
(Starší podklady, včetně části veřejné dokumentace, U+202F pro `cs-CZ` uvádějí; buď
šlo o záměnu s `fr-FR`, nebo o chování jiné verze CLDR dat. Pro tento dokument je
závazné to, co je výše skutečně spuštěno a ověřeno, ne dřívější tvrzení.) Bezpečný
způsob, jak oddělovač zjistit, aniž byste ho museli hádat nebo hardcodovat, je
`formatToParts()`:

```js
const parts = new Intl.NumberFormat('cs-CZ').formatToParts(12345.6);
const group = parts.find(p => p.type === 'group').value;
console.log(group.codePointAt(0).toString(16));
```
```
a0
```

V testech proto **nikdy** nepište `assert.equal(fmt(10000), '10 000')` s doslovnou
mezerou ze zdrojáku — buď použijte `\u00A0` explicitně, nebo lépe extrahujte oddělovač
přes `formatToParts()` a normalizujte oba řetězce před porovnáním.

### 6.3 Skupinové oddělovače — ověřená oprava tvrzení o `minimumGroupingDigits`

Výzkumný podklad (§9.3) tvrdí, že `cs-CZ` má `minimumGroupingDigits = 2` jako
**výchozí** chování, takže `1000` → `"1000"`, ale `10000` → `"10 000"`. Ověřeno, že
to **neplatí bez dalšího nastavení**:

```js
console.log(new Intl.NumberFormat('cs-CZ').format(1000));    // výchozí chování
console.log(new Intl.NumberFormat('cs-CZ').format(10000));
console.log(new Intl.NumberFormat('cs-CZ').resolvedOptions().useGrouping);
```
```
1 000
10 000
auto
```

Výchozí `useGrouping: 'auto'` seskupuje **i čtyřciferná** čísla. Chování „čtyřciferná
čísla bez mezery" (které odpovídá IJP §791 — „PČP umožňují psát čtyřciferná čísla bez
mezery", tedy **dovoleno**, ne povinné) je nutné vyžádat explicitně přes
`useGrouping: 'min2'`:

```js
console.log(new Intl.NumberFormat('cs-CZ', { useGrouping: 'min2' }).format(1000));
console.log(new Intl.NumberFormat('cs-CZ', { useGrouping: 'min2' }).format(10000));
```
```
1000
10 000
```

Kdo chce v kódu tuto konvenci, musí `useGrouping: 'min2'` nastavit sám — nejde
o výchozí chování `cs-CZ` v tomto ověřeném prostředí.

### 6.4 `style: 'unit'` — ověřená (a přísnější) podpora jednotek

Výzkumný podklad tvrdí, že `style: 'unit'` zná `bar`, `meter`, `minute`, `liter`,
`celsius`. Ověřeno spuštěním pro všech devět jednotek relevantních pro DecoJS:

```js
const units = ['bar','meter','minute','liter','celsius','msw','fsw','ata','atm'];
for (const u of units) {
  try {
    console.log(u, '->', new Intl.NumberFormat('cs-CZ', { style: 'unit', unit: u }).format(1.4));
  } catch (e) {
    console.log(u, '-> THROWS', e.constructor.name);
  }
}
```
```
bar -> THROWS RangeError
meter -> 1,4 m
minute -> 1,4 min
liter -> 1,4 l
celsius -> 1,4 °C
msw -> THROWS RangeError
fsw -> THROWS RangeError
ata -> THROWS RangeError
atm -> THROWS RangeError
```

**Oprava oproti podkladu: `bar` vyhazuje `RangeError` stejně jako `msw`/`fsw`/`ata`/`atm`.**
`bar` (a žádná jiná tlaková jednotka) není v ECMA-402 seznamu podporovaných
jednoduchých jednotek — ověřitelné přes `Intl.supportedValuesOf('unit')`, kde se
nevyskytuje žádná jednotka tlaku. Pro *primární* jednotku celého projektu (tlak, viz
sekce „Jednotky projektu" v `style-guide.md`) tedy `style: 'unit'` **nikdy** nepůjde
použít — ruční konkatenace čísla a jednotky (viz `qty()` níže) není obchvat pro
okrajový případ, je to **jediná cesta** pro tlak.

### 6.5 `js/format.js` — zavedeno

Modul existuje. Formátuj přes něj, `toFixed()` do zobrazovaného čísla nepatří.

```js
import { fmtNum } from './format.js';   // cesta podle umístění souboru

fmtNum(0.7511, 2)        // "0,75" v cs/es, "0.75" v en
fmtNum(comp.halfTime)    // bez počtu míst: hodnota se jen lokalizuje
fmtNum(x, 2, 'en')       // explicitní jazyk (používají testy)
```

Jazyk se bere z `document.documentElement.lang`. Ten nastavuje `js/i18n.js`
**už při vyhodnocení modulu**, ne až po načtení locale JSONu — jinak by se
prvních pár set milisekund formátovalo podle `en` a grafy, které se vykreslují
synchronně, by zůstaly s tečkou.

**Kde `fmtNum` nepoužívej.** Vrací *zobrazovací* řetězec. Desetinná čárka je
neplatná v geometrii SVG, v `<input type="number">.value`, v CSS délkách, v URL
a všude, kde se hodnota čte zpět přes `parseFloat`.

#### Tři sinky, tři nástroje

`fmtNum()` řeší čísla, která vznikají výpočtem. Statická čísla v šabloně
potřebují něco jiného — modul proto nabízí ještě dvě funkce:

| Sink | Funkce | Kdy |
|---|---|---|
| číslo vzniká výpočtem | `fmtNum(x, n)` | vždy, když se počítá |
| číslo je v próze uvnitř buňky | `localizeNumbersIn(el)` | rozsahy jako `< 0,16`, `0,16 – 0,50` |
| KaTeX / LaTeX | `localizeLatex(src)` | před `katex.render()` |

```js
import { localizeNumbersIn, localizeLatex } from './js/format.js';

localizeNumbersIn(document.getElementById('ppo2-limits-table'));
katex.render(localizeLatex(el.dataset.latex), el, { displayMode: true });
```

**`localizeNumbersIn` zachovává počet desetinných míst.** `0.50` se přepíše na
`0,50`, ne na `0,5` — v tabulce limitů by kolísající počet míst vypadal jako
nesourodá data. Je záměrně **opt-in na konkrétní element**: plošný běh přes
`document` by „lokalizoval" i čísla verzí, poměry a názvy souborů.

**`localizeLatex` balí čárku do skupiny.** V matematickém režimu je holá čárka
interpunkce a KaTeX za ni vloží mezeru — `0.84` by se vysázelo jako `0, 84`.
Správný tvar je `0{,}84` (viz §4).

**Statické číslo v HTML, které přepisuje JS, je vždycky chyba.** Ukázkové
hodnoty typu `<div id="pt0Subst">= (1.0133 − 0.0627) · 0.7902</div>` jsou mrtvé
anglicky formátované řetězce a svádí k tomu upravovat je místo šablony. Piš
`…` a nech je vyplnit kód.

#### Odchylky od původního návrhu

Návrh výše (fáze 1) počítal s `Intl.NumberFormat` a s pomocníkem `qty()`.
Zavedená verze je jiná ve třech bodech:

1. **Bez `Intl.NumberFormat`.** `Intl` by kromě desetinného oddělovače zavedl
   i **seskupování tisíců** — tedy U+00A0 uvnitř generovaných čísel, přesně ten
   znak, který testy hlídají v autorském textu (§6.2). Aplikace zobrazuje malé
   fyzikální veličiny (bar, m, min), kde se skupiny neuplatní, takže by to byla
   změna výstupu bez užitku a s novou pastí. Prostá záměna oddělovače je navíc
   deterministická a testovatelná pod Node bez závislosti na verzi ICU.
2. **Modul nic neimportuje.** Návrh počítal s `getCurrentLanguage()` z
   `js/i18n.js`. Tím by ale `js/mvalues.js` a spol. — čisté výpočetní moduly
   importované testy v Node — získaly závislost na prohlížeči. Čtení
   `document.documentElement.lang` (za `typeof document` guardem) drží
   jediný zdroj pravdy a nulové vazby.
3. **`num()` se jmenuje `fmtNum()` a `qty()` není.** `num` je v projektu
   obsazené jako lokální proměnná a `fmt` je v grafech pomocník na `{0}`/`{1}`.
   `qty()` by znamenalo přepsat 253 volajících míst dvakrát — jednotka u nich
   často přichází z překladové šablony, ne z konstanty.

Číselné hodnoty v `data/*.json` se ukládají jako čísla, ne předformátované řetězce —
formátování patří k vykreslení, ne k datům, jinak se překladatelé musí dotýkat čísel
místo textu.
