> ⚠️ **DOČASNÝ PRACOVNÍ SOUBOR — bude smazán.**
> Slouží jen jako podklad při psaní `glossary.md`, `style-guide.md` a `authoring.md`.
> Neodkazuj na něj. Závazné znění je v uvedených třech dokumentech.
> Odstraněno v Tasku 6 tohoto plánu.

# Značení fyzikálních veličin v DecoJS / decotheory.eu

**Rešerše a návrh normy zápisu — podklad pro `copilot-instructions`**

Verze dokumentu: 1.0 · Datum: 2026-08-12 · Fáze 1 (research & extract)

---

## Executive Summary

Oponentova výtka je oprávněná a doložitelná normou. Podle **ČSN EN ISO 80000-1 (01 1300)**, kapitola 7 (Typografická pravidla), se **značky veličin sázejí kurzívou** (*p*, *T*, *V*), zatímco **značky jednotek stojatě** (bar, m, Pa)[^1][^2]. Projekt DecoJS toto pravidlo v HTML **nedodržuje nikde** — element `<var>` se v repozitáři nevyskytuje ani jednou, a v prose se veličiny píší stojatě (`P<sub>amb</sub>`, `ppN₂`)[^3]. Kurzíva vzniká jen náhodně tam, kde formuli vykresluje KaTeX.

Zároveň jsem našel **čtyři systémové chyby**, které jsou závažnější než chybějící kurzíva:

1. **V české lokalizaci se čísla renderují s desetinnou tečkou.** Veškeré dynamické hodnoty procházejí `toFixed()`, které vždy vrací tečku. Česká UI tedy zobrazuje `pAnchor 2.81 bar` místo `2,81 bar`[^4].
2. **`<em>` se používá jako značka veličiny** (58 výskytů, např. `<em>pp</em>O₂`). To je sémanticky špatně — `<em>` znamená důraz, ne proměnnou; správný element je `<var>`[^5][^6].
3. **Dolní indexy jsou v LaTeXu kurzívou.** Wiki i theory pages píší `P_{amb}`, což vykreslí „amb" kurzívou. ISO vyžaduje u popisných indexů stojaté písmo → `p_{\mathrm{amb}}`[^7][^8].
4. **`quiz-accidents.json` obsahuje 5 desetinných teček v českém textu** (`0.16 bar`) — zjevný pozůstatek z anglického draftu[^9].

Projekt navíc míchá **čtyři různé notace pro tutéž veličinu**: `P<sub>amb</sub>` (HTML), `P_{amb}` (KaTeX), `P_amb` (canvas/tooltip ASCII) a `pAmb` (JS)[^10].

**Doporučení pro fázi 2:** nezavádět MathML ani nový renderer. Projekt už KaTeX používá — stačí ho (a) doplnit o sadu maker s ISO-korektními definicemi, (b) v prose zavést `<var>` + tři CSS pravidla, (c) opravit číselné formátování přes `Intl.NumberFormat`. Detailní plán v §11.

---

## 1. Normativní rámec

### 1.1 České normy

Celá řada ISO 80000 je v ČR převzata pod třídicím znakem **01 1300**, vydavatel Česká agentura pro standardizaci (ČAS)[^1].

| Norma | Název | Vydání | Relevance pro DecoJS |
|---|---|---|---|
| **ČSN EN ISO 80000-1** | Veličiny a jednotky – Část 1: Obecně | 10/2023 | **Klíčová.** Kapitola 7 = typografická pravidla[^1] |
| **ČSN EN ISO 80000-3** | Prostor a čas | 04/2021 | čas *t*, hloubka/délka, rychlost *v* |
| **ČSN EN ISO 80000-4** | **Mechanika** | 12/2020 | **tlak *p***, síla *F*, hustota *ρ* |
| **ČSN EN ISO 80000-5** | Termodynamika | 12/2020 | teplota *T*, *t* |
| **ČSN EN ISO 80000-9** | Fyzikální chemie a molekulová fyzika | 12/2020 | **parciální tlak *p*_B**, látkové množství *n* |
| **ČSN EN ISO 80000-2** | Matematické znaky a značky | — | stojaté e, d, π, operátory |
| **ČSN 01 6910:2014** | Úprava dokumentů zpracovaných textovými procesory | 08/2014 | **české mezerování, desetinná čárka, pomlčky**[^11] |

Právní rámec: zákon **č. 505/1990 Sb. o metrologii** (ve znění z. 152/2021 Sb.) a **vyhláška č. 264/2000 Sb.** o měřicích jednotkách[^12].

> ⚠️ Plné texty ČSN jsou zpoplatněné. Všechna pravidla níže jsou proto doložena z veřejně dostupných ekvivalentů: **Internetová jazyková příručka ÚJČ AV ČR** (veřejná interpretace ČSN 01 6910, spravovaná stejnou institucí)[^13], **NIST SP 811** (americký průvodce SI, obsahově shodný s ISO 80000-1)[^2] a **SI Brochure 9. vydání (BIPM)**[^14].

### 1.2 Mezinárodní referenční dokumenty

- SI Brochure, 9. vydání (BIPM, 2019) — <https://www.bipm.org/documents/20126/41483022/SI-Brochure-9.pdf>
- NIST SP 811 (2008), kap. 7 a 10 — <https://www.nist.gov/pml/special-publication-811>
- IUPAC Green Book, 3. vyd. — <https://iupac.org/what-we-do/books/greenbook/>
- Internetová jazyková příručka ÚJČ — <https://prirucka.ujc.cas.cz/>

---

## 2. Základní pravidlo: kurzíva vs. stojaté písmo

### 2.1 Citace normy

> „Quantity symbols, which are always printed in **italic** (that is, sloping) type, are, with few exceptions, single letters of the Latin or Greek alphabets that may have subscripts or superscripts or other identifying signs."
> — NIST SP 811, §10.1[^2]

> „— symbols for quantities and variables: **italic**
> — symbols for units: **roman**"
> — NIST SP 811, §10.2[^2]

ČAS k ČSN EN ISO 80000-1: *„Rozsáhlá kapitola 7 podává typografická pravidla pro zápis veličin a jednotek"*[^1].

### 2.2 Rozhodovací tabulka

| Kategorie | Písmo | Příklady |
|---|---|---|
| **Značka veličiny / proměnné** | **kurzíva** | *p*, *T*, *t*, *V*, *m*, *ρ*, *F*, *n*, *c*, *h*, *k*, *a*, *b* |
| **Značka jednotky** | **stojatě** | bar, Pa, kPa, m, s, min, K, °C, mol, L, N, J, W |
| **Předpona SI** | **stojatě** | k (kilo), M (mega), μ (mikro), m (mili), h (hekto) |
| **Popisný dolní index** (zkratka slova, jméno osoby, částice) | **stojatě** | *p*<sub>amb</sub>, *p*<sub>atm</sub>, *T*<sub>max</sub>, *N*<sub>A</sub> (Avogadro), *m*<sub>e</sub> (elektron) |
| **Index, který je sám veličinou** | **kurzíva** | *c*<sub>*p*</sub> (tepelná kapacita při stálém tlaku), *E*<sub>*x*</sub> |
| **Běžící index / proměnná** | **kurzíva** | *p*<sub>*i*</sub>, Σ<sub>*i*</sub> *x*<sub>*i*</sub>, *a*<sub>*i*</sub> |
| **Značka chemického prvku / vzorec** | **stojatě** | N₂, O₂, He, CO₂, H₂O — včetně číslic v indexu |
| **Číslicový index** | **stojatě** | *V*<sub>1</sub>, *V*<sub>2</sub>, *M*<sub>0</sub>, *t*<sub>1/2</sub> |
| **Matematická konstanta** | **stojatě** | e (Eulerovo číslo), π, i (imaginární jednotka) |
| **Matematický operátor / funkce** | **stojatě** | d (diferenciál), Δ (operátor přírůstku), ln, log, sin, exp |
| **Vektorová veličina** | **tučná kurzíva** | ***v***, ***F*** |
| **Číselné hodnoty** | **stojatě** | 5; 1,5; 3,14 |
| **Víceznaková zkratka jako veličina** | **stojatě** (viz §2.4) | GF, SAC, MOD, NDL, OTU |

### 2.3 Nejobtížnější pravidlo — indexy

Doslovné znění, které je klíčové pro celý projekt:

> „These rules imply that a subscript or superscript on a quantity symbol is in **roman** type if it is **descriptive** (for example, if it is a number or represents the name of a person or a particle); but it is in **italic** type if it represents a **quantity**, or is a **variable** such as *x* in *E*<sub>*x*</sub> or an **index** such as *i* in Σ<sub>*i*</sub> *x*<sub>*i*</sub> that represents a number."
> — NIST SP 811, §10.2[^2]

IUPAC Green Book §1.6 dodává praktický test:

> „A good general rule is that **quantities, or variables, can be given a value, but labels cannot**."[^15]

**Aplikace na DecoJS:**

| Zápis | Index | Písmo indexu | Odůvodnění |
|---|---|---|---|
| *p*<sub>amb</sub> | „amb" = zkratka slova *ambient* | **stojatě** | popisný štítek |
| *p*<sub>alv</sub> | „alv" = *alveolární* | **stojatě** | popisný štítek |
| *p*<sub>N₂</sub> | chemická značka | **stojatě** | značka prvku |
| *T*<sub>max</sub> | „max" = *maximum* | **stojatě** | popisný štítek |
| *p*<sub>t,0</sub> | „t" = *tissue*, „0" = číslo | **stojatě** | oba popisné |
| *c*<sub>*p*</sub> | „p" = **tlak** (veličina) | **kurzíva** | index má hodnotu |
| *a*<sub>*i*</sub> | „i" = číslo kompartmentu | **kurzíva** | běžící index |

> **Pozor na past:** `p_t` (tkáňový tlak, *t* = *tissue* → stojatě) vs. `c_p` (index *p* = tlak → kurzíva). Rozhoduje význam, ne vzhled.

### 2.4 Víceznakové zkratky (GF, SAC, MOD…)

ISO 80000-1 §7.1.1 stanoví, že značky veličin jsou **jednopísmenné**. GF, SAC, MOD, NDL, OTU tedy stojí mimo formální systém. Kdyby se sázely kurzívou, čtou se jako **součin** proměnných (*G*·*F*). Doporučená praxe (Higham, „Typesetting Mathematics According to the ISO Standard")[^7]:

**Sázej víceznakové zkratky stojatě:** GF, GF<sub>low</sub>, GF<sub>high</sub>, SAC, MOD, NDL, EAD, OTU, TDT, CNS.

---

## 3. Velikost písmen — kde nesmíme chybovat

### 3.1 Jednotky

Velké písmeno **jen u jednotek odvozených od jmen osob**[^16]:

| Správně | Špatně | Význam |
|---|---|---|
| Pa | pa, PA | pascal (Blaise Pascal) |
| N, K, W, J, Hz, V | n, k, w… | newton, kelvin, watt, joule… |
| **bar** | Bar, BAR | bar — **není** od jména osoby |
| m, s, kg, mol, cd, min | M, S, KG | metr, sekunda, kilogram… |
| **kPa** | KPa | kilopascal |
| **MPa** | mPa | mPa = **milipascal**, tj. 10⁹× menší! |
| K | k | K = kelvin, k = kilo |

ÚJČ: *„Velkými písmeny se označují všechny jednotky pocházející z vlastních jmen … 230 V, 75 W, 9,81 N. Velké M (mega-) je označení pro miliontý násobek fyzikální jednotky, malé m (mili-) pro její tisícinu."*[^13]

**Litr:** `l` i `L` jsou obě platné (16. CGPM, rezoluce 6, 1979)[^17]. **Pro DecoJS volíme `l`** — česká praxe i stávající obsah kvízů (`15 l`, `87,5 l/min`).

### 3.2 Veličiny — záměna mění význam

| Malé | Význam | Velké | Význam |
|---|---|---|---|
| *p* | **tlak** | *P* | **výkon** |
| *t* | čas / Celsiova teplota | *T* | termodynamická teplota (K) |
| *v* | rychlost | *V* | objem |
| *m* | hmotnost | *M* | molární hmotnost / M-hodnota |
| *n* | látkové množství | *N* | počet částic |

> **Rozhodnutí projektu:** tlak je **vždy malé *p***. Bühlmannova literatura i Wikipedie používají `P_amb`, ale to je v rozporu s ISO 80000-4 i s českou školní fyzikou. Sjednocujeme na *p*. Viz §6.1.

### 3.3 Kolize *t* = čas × *t* = Celsiova teplota

Česká i ISO konvence používají pro obojí *t*. ISO 80000-5 připouští alternativu **ϑ** (vartheta) pro Celsiovu teplotu.
**Rozhodnutí:** v DecoJS je *t* **vždy čas** (dominantní použití — doba ponoru, poločasy). Teplota se píše *T* (K) nebo se vypisuje slovem s jednotkou (`20 °C`). Symbol ϑ nezavádíme.

---

## 4. Česká typografická pravidla (ČSN 01 6910 / ÚJČ)

### 4.1 Mezera mezi číslem a jednotkou — povinná a nedělitelná

> „Značky se od číselné hodnoty **oddělují mezerou**, číslo a značka se umísťují na **stejný řádek**, např. *10 ha*, *3 kg*, *14 %*, *100 kWh*, rychlost *50 km/h*, teplota *12–15 °C*."
> — IJP §785[^13]

> „Řádek nemá být zalomen … mezi číslem a značkou, např. *50 %*, *§ 23*; mezi číslem a … písmennou značkou jednotek a měn, např. *10 kg*, *16 h*, *19 °C*, *1 000 000 Kč*. … vkládáme … místo běžné mezislovní mezery **mezeru pevnou**."
> — IJP §880[^18]

NIST SP 811 §7.2 formuluje totéž a explicitně uvádí výjimku: **úhlový stupeň, minuta a vteřina se připojují bez mezery**[^2].

| Zápis | Verdikt |
|---|---|
| `40 m`, `1,4 bar`, `20 °C`, `78 %`, `12 min` | ✅ mezera (nedělitelná) |
| `40m`, `1,4bar`, `20°C` | ❌ |
| `60°`, `17° 15′` (úhel) | ✅ bez mezery |
| `20 ° C` | ❌ mezera mezi ° a C |

### 4.2 Desetinný oddělovač a členění

> „Oddělujeme trojice řádů před a za desetinnou čárkou mezerami: *6 378 km; 30 000 let; 11 430,5 l; 3,536 2 kg*. PČP umožňují psát **čtyřciferná čísla bez mezery** (*4256 km, 2000 slov*). Letopočty se nikdy nečlení. Před desetinnou čárkou ani za ní mezera není."
> — IJP §791[^19]

| Jazyk | Desetinný oddělovač | Oddělovač tisíců |
|---|---|---|
| **čeština** | **čárka** — `1,4 bar` | **mezera** — `1 000 kPa` (4místná i bez) |
| **angličtina** | tečka — `1.4 bar` | čárka — `1,000 kPa` |
| **španělština** | čárka — `1,4 bar` | mezera / tečka |

### 4.3 Rozsahy — pomlčka, ne spojovník

> „Pokud jsou oba výrazy oddělené pomlčkou **jednoslovné**, píšeme pomlčku **bez mezer** (*otevírací doba 8–16 h*). … vyjádření rozsahu (s významem 'až'): *strana 23–26*, *9–16 h*."
> — IJP §165[^20]

| Zápis | Verdikt |
|---|---|
| `10–20 m` (pomlčka – U+2013, bez mezer, pak nedělitelná mezera + jednotka) | ✅ |
| `10-20 m` (spojovník) | ❌ |
| `10 – 20 m` (pomlčka s mezerami) | ❌ pro číselné rozsahy |
| `hloubka 30 m – hladina` (víceslovný člen) | ✅ s mezerami |

### 4.4 Znaménko minus

> „Vyjadřují-li znaménka *+* nebo *−* kladnou nebo zápornou hodnotu čísla, přiléhají k číslici **bez mezer**: *+24 °C*, *−273,15 °C*."
> „S mezerami píšeme znaky pro sčítání, odčítání, násobení a dělení v matematických operacích: *3 + 5 − 2 = 6*, *20 × 5 = 100*."
> — IJP §785[^13]

Správný znak je **− U+2212** (`&minus;`), **ne** spojovník `-` a **ne** pomlčka `–`.
IJP dodává: *„Podle ČSN 01 6910 je v korespondenci dovoleno znak minus (−) nahradit pomlčkou (–) a znak krát (×) malým písmenem x."* — to je **úleva pro korespondenci, ne pro odborný text**.

### 4.5 Násobení

- **×** (U+00D7) — v aritmetice a rozměrech: `20 × 5 = 100`, `3 m × 4 m`
- **·** (U+00B7) — v součinech veličin a jednotek: `p = ρ·g·h`, `5 g·m⁻³`
- `*` a písmeno `x` — **nikdy** v odborném textu

NIST §10.5.4: *„When the comma is used as the decimal marker, the preferred sign for the multiplication of numbers is the half-high dot."* Tj. v češtině je preferovaná **tečka na střední výšce**[^2].

### 4.6 Procenta — mezera mění význam

> „*14 %* = 14 procent." … „V případě, že pomocí číslice a značky vyjadřujeme **přídavné jméno**, mezeru nevkládáme: *20% =* 20procentní, dvacetiprocentní."
> — IJP §785[^13]

| Zápis | Čte se | Použití |
|---|---|---|
| `obsah kyslíku je 32 %` | „třicet dva procent" | ✅ podstatné jméno |
| `32% nitrox` | „dvaatřicetiprocentní" | ✅ přídavné jméno |
| `GF 30/70` | bez % | ✅ dvojice |

### 4.7 Skloňování značek

> „V textu se značky užívají obvykle ve spojení s číselnou hodnotou … V ostatních případech se značky vypisují: *Bude třeba několik metrů látky.*"
> — IJP §785[^13]

Značky se **nikdy neskloňují ani nepřechylují**: `5 m`, nikdy `5 mů`, `5 ms`. Bez číslovky se slovo vypisuje: *„v hloubce několika metrů"*.

**Poznámka:** `12litrový přístroj` (bez mezery) je **správná česká složenina**, ne chyba mezerování[^21].

---

## 5. Slovníček veličin (kanonický registr)

Toto je jádro dokumentu. **Každý nový symbol v projektu musí být zapsán zde.**

### 5.1 Základní fyzikální veličiny

| Symbol | Veličina (CZ) | Quantity (EN) | Jednotka SI | Jednotka v projektu | Index | Zdroj |
|---|---|---|---|---|---|---|
| *p* | tlak | pressure | Pa | bar | — | ISO 80000-4 |
| *p*<sub>amb</sub> | okolní (absolutní) tlak | ambient pressure | Pa | bar | stojatě | Bühlmann |
| *p*<sub>atm</sub> | atmosférický tlak | atmospheric pressure | Pa | bar | stojatě | ISO 80000-4 |
| *p*<sub>h</sub> | hydrostatický tlak | hydrostatic pressure | Pa | bar | stojatě | čes. konvence |
| *p*<sub>abs</sub> | absolutní tlak | absolute pressure | Pa | bar | stojatě | čes. konvence |
| *p*<sub>e</sub> | přetlak | gauge pressure | Pa | bar | stojatě | ISO 80000-4 |
| *V* | objem | volume | m³ | l | — | ISO 80000-4 |
| *ρ* | hustota | density | kg/m³ | kg/m³ | — | ISO 80000-4 |
| *T* | termodynamická teplota | thermodynamic temperature | K | K | — | ISO 80000-5 |
| *t* | **čas** | time | s | min | — | ISO 80000-3 |
| *h* | hloubka / výška | depth / height | m | m | — | čes. konvence |
| *m* | hmotnost | mass | kg | kg | — | ISO 80000-4 |
| *F* | síla | force | N | N | — | ISO 80000-4 |
| *F*<sub>vz</sub> | vztlaková (Archimédova) síla | buoyancy force | N | N | stojatě | čes. škola |
| *F*<sub>G</sub> | tíhová síla | weight force | N | N | stojatě | čes. škola |
| *S* | plocha, obsah | area | m² | m² | — | čes. škola (ISO: *A*) |
| *g* | tíhové zrychlení | gravitational acceleration | m/s² | m/s² | — | ISO 80000-3 |
| *v* | rychlost | velocity | m/s | m/min | — | ISO 80000-3 |
| *n* | látkové množství | amount of substance | mol | mol | — | ISO 80000-9 |
| *R* | molární plynová konstanta | gas constant | J/(mol·K) | — | — | ISO 80000-9 |
| *c* | koncentrace | concentration | mol/m³ | — | — | ISO 80000-9 |

> **Odchylky české školy od ISO:** plocha *S* (ISO: *A*), tíhová síla *F*<sub>G</sub> nebo *G* (ISO: *F*<sub>g</sub>), vztlak *F*<sub>vz</sub> (mezinárodně *F*<sub>A</sub>). Pro českého čtenáře držíme českou variantu a mezinárodní uvádíme v závorce[^22].

### 5.2 Parciální tlaky a složení směsi

| Symbol | Veličina (CZ) | Quantity (EN) | Poznámka |
|---|---|---|---|
| *p*<sub>O₂</sub> | parciální tlak kyslíku | oxygen partial pressure | index stojatě, číslice stojatě |
| *p*<sub>N₂</sub> | parciální tlak dusíku | nitrogen partial pressure | |
| *p*<sub>He</sub> | parciální tlak helia | helium partial pressure | |
| *p*<sub>CO₂</sub> | parciální tlak oxidu uhličitého | carbon dioxide partial pressure | |
| *p*<sub>H₂O</sub> | tlak vodní páry | water vapour pressure | 0,0627 bar při 37 °C |
| *f*<sub>O₂</sub> | objemový zlomek kyslíku | oxygen fraction | bezrozměrný, 0–1 |
| *f*<sub>N₂</sub> | objemový zlomek dusíku | nitrogen fraction | 0,7902 pro vzduch |
| *f*<sub>He</sub> | objemový zlomek helia | helium fraction | |

### 5.3 Dekompresní model (Bühlmann ZH-L16 / Schreiner / Baker)

| Symbol | Veličina (CZ) | Quantity (EN) | Jednotka | Zdroj |
|---|---|---|---|---|
| *i* | číslo kompartmentu (1–16) | compartment index | — | Bühlmann[^23] |
| *t*<sub>1/2</sub> | poločas (nasycení) tkáně | tissue half-time | min | Bühlmann (*Halbwertszeit*) |
| *k* | rychlostní konstanta, *k* = ln 2 / *t*<sub>1/2</sub> | rate constant | min⁻¹ | standard |
| *a* | Bühlmannův koeficient *a* | Bühlmann a-coefficient | bar | ZH-L16 |
| *b* | Bühlmannův koeficient *b* | Bühlmann b-coefficient | — | ZH-L16 |
| *p*<sub>alv</sub> | alveolární tlak inertního plynu | alveolar inert gas pressure | bar | Bühlmann |
| *p*<sub>t</sub> | tlak inertního plynu v tkáni | tissue inert gas pressure | bar | Bühlmann |
| *p*<sub>t,0</sub> | počáteční tlak v tkáni | initial tissue pressure | bar | Schreiner |
| *p*<sub>amb,tol</sub> | tolerovaný okolní tlak (strop) | tolerated ambient pressure | bar | Bühlmann |
| *R* | rychlost změny tlaku | rate of pressure change | bar/min | Schreiner[^24] |
| *M* | M-hodnota | M-value | bar | Workman[^25] |
| *M*<sub>0</sub> | povrchová M-hodnota | surfacing M-value | bar | Workman |
| Δ*M* | sklon M-hodnoty | M-value slope | — | Workman |
| *M*<sub>adj</sub> | upravená M-hodnota (s GF) | adjusted M-value | bar | Baker[^26] |
| GF | gradientový faktor | gradient factor | % / 0–1 | Baker |
| GF<sub>low</sub> | GF na první zastávce | GF low | % | Baker |
| GF<sub>high</sub> | GF na hladině | GF high | % | Baker |
| GF<sub>inst</sub> | okamžitý GF | instantaneous GF | % | DecoJS |
| *p*<sub>ceiling</sub> | tlak stropu | ceiling pressure | bar | DecoJS |
| *p*<sub>anchor</sub> | kotevní tlak rampy GF | anchor pressure | bar | DecoJS |

### 5.4 Potápěčská terminologie a zkratky

České potápěčské prostředí používá **anglické zkratky nepřeložené**; český opis se uvádí při prvním výskytu[^27].

| Zkratka | Český termín | English |
|---|---|---|
| NDL | bezdekompresní limit | no-decompression limit |
| MOD | maximální operační (provozní) hloubka | maximum operating depth |
| EAD | ekvivalentní vzduchová hloubka | equivalent air depth |
| DCS | dekompresní nemoc (též kesonová nemoc) | decompression sickness |
| CNS | toxicita centrálního nervového systému | CNS oxygen toxicity |
| OTU | jednotky kyslíkové toxicity | oxygen tolerance units |
| GF | gradientový faktor | gradient factor |
| SAC | spotřeba vzduchu na povrchu | surface air consumption |
| TTS / TDT | doba do vynoření / celková doba dekomprese | time to surface / total deco time |
| SI | povrchový interval | surface interval |
| EAN | obohacený vzduch (nitrox) | enriched air nitrox |

Další termíny: **kompartment** (přejaté, běžné), **sycení/nasycení tkáně**, **vysycování**, **přesycení**, **inertní plyn**, **dekompresní zastávka**, **bezpečnostní zastávka**, **rychlost výstupu**, **dusíková narkóza** (hovorově *hloubkové opojení*), **kyslíková toxicita**, **M-hodnota**[^27].

---

## 6. Sporné body — rozhodnutí projektu

### 6.1 *p* vs. *P* pro tlak

Existují dva **neslučitelné** autoritativní systémy:

| Systém | Značka | Zdroj | Použití |
|---|---|---|---|
| **Fyzikální chemie / ISO** | malé ***p*** | IUPAC Gold Book, ISO 80000-4/-9[^15] | fyzika, chemie, česká škola |
| **Respirační fyziologie** | velké **P** | Pappenheimer 1950[^28] | medicína, plicní fyziologie |

Pappenheimerova konvence je vnitřně konzistentní třípatrový systém: velká **P/V/F/Q** + **kapitálkový index** místa (I = inspired, A = alveolar, a = arterial) + chemický druh. Odtud P<sub>A</sub>O₂, F<sub>I</sub>O₂, V̇O₂. Používat velké *P* **bez** zbytku systému je nekonzistentní.

> **Rozhodnutí:** DecoJS používá **malé *p*** pro všechny tlaky včetně parciálních. Odpovídá to ISO 80000, IUPAC, české školní fyzice i hlavnímu českému teoretickému zdroji stranypotapecske.cz[^29]. Pappenheimerovu notaci (F<sub>I</sub>O₂, V̇O₂) použijeme jen v případném ryze fyziologickém výkladu, a to s explicitní poznámkou.

### 6.2 ppO₂ vs. *p*O₂ vs. *p*<sub>O₂</sub>

Projekt dnes používá `ppO₂` (ve všech lokalizacích a v JS), zatímco anglické a španělské kvízy používají `<em>p</em>O₂` — tj. **CZ a EN/ES používají různé symboly pro tutéž veličinu**[^30].

Důkazy z českých zdrojů[^29]:
- **stranypotapecske.cz** (hlavní český teoretický web): `pO2`, `pN2` — jedno *p*
- **cs.wikipedia / Tlak**: `p_i`
- **Garmin CZ manuál**: `PO2`
- Kurzy nitroxu hovorově: `ppO2 max 1,4 bar`

> **Rozhodnutí:** kanonický zápis je ***p*<sub>O₂</sub>** (kurzívní *p*, stojatý index O₂ s číslicí 2 dole). Zkratka `ppO₂` zůstává povolená v **hovorovém potápěčském kontextu** (varovné hlášky, popisky grafů), ale **musí být uvedena ve slovníčku jako synonymum** a nesmí se objevit ve vzorci. Tím se odstraní i CZ↔EN divergence.

### 6.3 Poločas: *t*<sub>1/2</sub> vs. *T*<sub>1/2</sub> vs. *τ*

Bühlmann používá *t*<sub>1/2</sub> (*Halbwertszeit*). Wiki DecoJS používá `T_{1/2}`, kód používá `halfTime`.
*τ* je **jiná veličina** (časová konstanta, *t*<sub>1/2</sub> = *τ* · ln 2) — nezaměňovat.

> **Rozhodnutí:** ***t*<sub>1/2</sub>** (malé kurzívní *t*, stojatý číselný index). Sjednotit i ve wiki.

### 6.4 Jednotky projektu

Zdrojové materiály se rozcházejí: Chapmanův text používá ATM + stopy, česká CMAS skripta kPa/MPa/bar, projekt bar + metry[^31].

> **Rozhodnutí (potvrzení stávající praxe):** primární jednotky **bar** (tlak), **m** (hloubka), **min** (čas), **l** (objem), **°C** (teplota). kPa se uvádí v kvízech, protože tak jsou formulovány oficiální otázky SPČR — to je v pořádku, jde o citaci zadání.

---

## 7. Implementace v HTML + CSS

### 7.1 Element `<var>` — normativní opora

HTML Living Standard §4.5.16, doslova:

> „The `var` element represents a variable. This could be an actual variable in a mathematical expression or programming context, an identifier representing a constant, **a symbol identifying a physical quantity**, a function parameter, or just be a term used as a placeholder in prose."[^5]

Spec dokonce uvádí přesně náš případ:

```html
<p>…she wrote <var>E</var> = <var>m</var><var>c</var><sup>2</sup>.</p>
<p>The coordinate of the <var>i</var>th point is
   (<var>x<sub><var>i</var></sub></var>, <var>y<sub><var>i</var></sub></var>).</p>
```

A k `<sub>` (§4.5.19): *„The `sub` element can be used inside a `var` element, for variables that have subscripts."*[^5]

**Proč ne `<em>`:** `<em>` znamená *stress emphasis* — mění prozodii věty a čtečky obrazovky mu mění intonaci. Pro proměnnou je to sémanticky nesprávné[^6]. `<i>` je přípustná náhrada („technický termín"), ale `<var>` je přesnější.

### 7.2 Vzorová knihovna značek

```html
<!-- 1. Holá veličina -->
<var>p</var>

<!-- 2. Veličina s popisným indexem (index STOJATĚ) -->
<var>p</var><sub>amb</sub>

<!-- 3. Veličina s indexem, který je proměnnou (index KURZÍVOU) -->
<var>a</var><sub><var>i</var></sub>

<!-- 4. Parciální tlak s chemickým indexem -->
<var>p</var><sub>N<sub>2</sub></sub>

<!-- 5. Hodnota + jednotka (nedělitelné) -->
<span class="qty">1,4&#8239;<abbr class="unit" title="bar">bar</abbr></span>

<!-- 6. Chemický vzorec (VŽDY stojatě) -->
<span class="chem">N<sub>2</sub></span>

<!-- 7. Víceznaková zkratka jako veličina (stojatě) -->
<abbr class="qty-abbr" title="gradientový faktor">GF</abbr><sub>low</sub>

<!-- 8. Vložený vzorec -->
<span class="formula-inline">$p_{\mathrm{amb}} = p_{\mathrm{atm}} + \rho g h$</span>
```

### 7.3 Minimální CSS

Ověřeno: v `css/styles.css` **neexistuje** žádný selektor `var`, `sub` ani `sup`, takže přidání nekoliduje. Zápis `var(--x)` je hodnota vlastnosti, ne selektor — konflikt nehrozí[^32].

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

> **Klíčový detail:** `font-style` se **dědí**. Bez pravidla `var sub { font-style: normal }` by se `<var>p</var><sub>amb</sub>`… — pozor, zde `<sub>` **není** potomkem `<var>`, takže kurzívu nezdědí. Pravidlo je nutné pro variantu `<var>p<sub>amb</sub></var>`, kterou spec také připouští. **Doporučená forma pro projekt je `<var>p</var><sub>amb</sub>`** (index mimo `<var>`) — je jednoznačná a nevyžaduje spoléhání na CSS reset.

### 7.4 Přístupnost

| Element | Jak to čte odečítač | Poznámka |
|---|---|---|
| `<var>` | jen text, role `generic` | kurzíva je čistě vizuální[^33] |
| `<sub>`/`<sup>` | inline, bez oznámení pozice (NVDA, JAWS, VoiceOver) | pro `p_amb`, `CO₂` dostačuje |
| `<abbr title>` | některé odečítače přečtou `title` | vhodné pro jednotky |

Doplnit `lang="cs"` na české sekce — ovlivňuje výslovnost i čtení desetinné čárky.

### 7.5 Unicode — referenční tabulka

| Znak | Název | Kód | Entita | Použití |
|---|---|---|---|---|
| − | minus | U+2212 | `&minus;` | záporná čísla, odčítání — **ne** `-` |
| · | tečka na střední výšce | U+00B7 | `&middot;` | součin veličin: `ρ·g·h` |
| × | znak násobení | U+00D7 | `&times;` | aritmetika, rozměry, `× 10ⁿ` |
| – | pomlčka | U+2013 | `&ndash;` | rozsahy: `10–20 m` |
| (nbsp) | nedělitelná mezera | U+00A0 | `&nbsp;` | číslo–jednotka (univerzální) |
| (nnbsp) | úzká nedělitelná mezera | U+202F | `&#8239;` | **preferovaná** číslo–jednotka dle SI |
| ° | stupeň | U+00B0 | `&deg;` | `20 °C` — **ne** U+2103 ℃ |
| ≈ ≤ ≥ ≠ | | U+2248/2264/2265/2260 | `&asymp;` `&le;` `&ge;` `&ne;` | |
| τ ρ Δ π η μ λ | řecká písmena | | `&tau;` `&rho;` `&Delta;`… | veličiny |
| ₂ | dolní index 2 | U+2082 | — | viz níže |

> **℃ (U+2103) nepoužívat.** Je to kompatibilní znak z bloku CJK Compatibility, existující jen kvůli převodu starých východoasijských kódování; jeho dekompozice je `U+00B0 U+0043`. SI Brochure i NIST píší `°C` jako dva znaky[^14].

> **Chemické vzorce:** `O<sub>2</sub>` je sémanticky robustnější než `O₂` (znaky U+2080–2089 nejsou zaručeny ve všech fontech). **Projekt ale už používá `O₂`/`N₂` konzistentně na ~29 místech** a čtečky je čtou stejně. **Rozhodnutí: ponechat Unicode ₂ v prose a v datech kvízů; `<sub>` použít ve vzorcích a v nových šablonách.** Klíčové je odstranit ASCII varianty `CO2`, `O2`.

---

## 8. Matematika: KaTeX a LaTeX

### 8.1 Zásadní zjištění — indexy jsou v LaTeXu kurzívou

`P_{amb}` vysází „amb" **kurzívou** a navíc se špatným prokladem (LaTeX čte a·m·b jako součin tří proměnných). Správně je `\mathrm{}`[^7][^8].

Proč `\mathrm{}` a ne `\text{}`: `\text{}` dědí okolní řez písma (v italic prostředí vysází index kurzívou), `\mathrm{}` je na kontextu nezávislé. Oba jsou v KaTeX i v GitHub MathJax podporované[^8].

### 8.2 Převodní tabulka — současný stav → správně

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
| `e^{-kt}` | `\mathrm{e}^{-kt}` | ISO 80000-2: e je konstanta[^7] |
| `\text{ bar}` | `\,\mathrm{bar}` | `\,` = tenká mezera |
| `12.8 \text{ L/min}` | `12{,}8\,\mathrm{l/min}` | česká čárka, malé l |

### 8.3 Makra KaTeX — definovat jednou, používat všude

KaTeX podporuje volbu `macros` v `katex.render()` i v `renderMathInElement()`. Objekt maker musí být **sdílený napříč voláními** (nevytvářet nový v každé iteraci)[^34].

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

Použití:

```js
import { PHYSICS_MACROS } from './katexMacros.js';

renderMathInElement(document.body, {
  delimiters: [
    { left: "$$", right: "$$", display: true  },
    { left: "$",  right: "$",  display: false }
  ],
  throwOnError: false,
  macros: PHYSICS_MACROS      // TÝŽ objekt při každém volání
});
```

Haldaneova rovnice pak je čitelná i ve zdroji:

```latex
$$\pt(t) = \palv + (\ptzero - \palv)\cdot\eu^{-kt}$$
```

Podporované v KaTeX 0.16.x: `\mathrm`, `\text`, `\operatorname`, `\,`, `\;`, `\quad`, `\dfrac`, `\begin{cases}`, `\ln`, `\exp`, `\gdef`, `\boldsymbol`, `\vec`. **Nepodporováno:** `siunitx`, `\DeclareMathOperator`. `\ce{}` (mhchem) vyžaduje samostatný contrib skript (~37 kB)[^35].

### 8.4 Wiki (GitHub MathJax)

GitHub podporuje LaTeX v Markdownu od 19. 5. 2022 a dokumentace explicitně uvádí **wikis** mezi podporovanými místy[^36]:

> „Mathematical expressions rendering is available in GitHub Issues, GitHub Discussions, pull requests, **wikis**, and Markdown files."

Podporuje `\mathrm{}`, `\text{}`, `\operatorname{}`, `\,`, `\begin{cases}`, `\dfrac`. **Nepodporuje** `\ce{}` ani **uživatelská makra** — každý math blok se zpracovává nezávisle. Ve wiki je proto nutné `\mathrm{amb}` **vypisovat pokaždé**[^36].

Elementy `<sub>`, `<sup>` i **`<var>`** jsou v allowlistu sanitizace GitHubu — v Markdownu tedy fungují[^37].

| Kontext ve wiki | Doporučený zápis |
|---|---|
| Blokový vzorec | ` ```math ` … ` ``` ` (lépe než `$$`, nevyžaduje trik se zalomením) |
| Vložený vzorec | `$p_{\mathrm{amb}}$` |
| Značka v prose | `*p*<sub>amb</sub>` nebo `<var>p</var><sub>amb</sub>` |
| Jednoduchý index | Unicode `p₂` |

---

## 9. Čísla v kódu — lokalizované formátování

### 9.1 Diagnóza

`js/i18n.js` **neobsahuje žádnou logiku formátování čísel**. Statické řetězce v `locales/cs.json` čárku správně mají (`"ppO₂ 1,4 (dno)"`), ale všechny **dynamické** hodnoty procházejí `toFixed()`, které vrací vždy tečku[^4]:

```js
// js/charts/MValueChart.js:1060
label: fmt(translate('chart.mvalue.pAnchor', 'pAnchor {0} bar ({1}m)'),
           pAnchor.toFixed(2), anchorDepthM)
// → v české lokalizaci: "pAnchor 2.81 bar (18.0m)"   ❌
```

Jediná lokálně uvědomělá cesta je `formatAxis()` v `chartTheme.js:166`, která volá `toLocaleString(undefined, …)` — a to jen pro popisky os[^4].

### 9.2 Řešení

```js
// js/format.js — nový modul
import { getCurrentLanguage } from './i18n.js';

const LOCALE_MAP = { cs: 'cs-CZ', en: 'en-US', es: 'es-ES' };
export const NNBSP = '\u202F';   // úzká nedělitelná mezera

function locale() {
    return LOCALE_MAP[getCurrentLanguage()] ?? 'en-US';
}

/** Číslo s pevným počtem desetinných míst, lokalizovaný oddělovač. */
export function num(value, decimals = 1) {
    return new Intl.NumberFormat(locale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/** Hodnota + jednotka, oddělené úzkou nedělitelnou mezerou. */
export function qty(value, unit, decimals = 1) {
    return `${num(value, decimals)}${NNBSP}${unit}`;
}
```

`Intl.NumberFormat` podporuje `style: 'unit'` pro `bar`, `meter`, `minute`, `liter`, `celsius`[^38] — ale **ne** `msw`, `fsw`, `ata`, `atm`. Pro ty je nutná ruční konkatenace jako výše.

### 9.3 Past: U+202F

Skupinový oddělovač pro `cs-CZ` je podle CLDR **U+202F** (úzká nedělitelná mezera), **ne** U+00A0[^38]. To rozbíjí `parseFloat()` i porovnávání řetězců v testech:

```js
new Intl.NumberFormat('cs-CZ').format(12345.6);   // "12\u202F345,6"
parseFloat("12\u202F345,6");                       // NaN

// V testech NIKDY:
assert.equal(fmt(10000), '10 000');       // selže — obyčejná mezera
// Správně:
assert.equal(fmt(10000), '10\u202F000');
```

Navíc `cs-CZ` má `minimumGroupingDigits = 2`, takže **čtyřmístná čísla se neseskupují**: `1000` → `"1000"`, `10000` → `"10 000"`[^38]. To se shoduje s IJP §791 („čtyřciferná čísla lze psát bez mezery").

### 9.4 Čísla v datech

**Ukládat jako čísla, formátovat při vykreslení.** Předformátované lokalizované řetězce v JSON vedou k rozpadu hodnot mezi jazykovými mutacemi a znemožňují výpočty. Překladatelé mají editovat **text**, ne čísla[^38].

---

## 10. Audit současného stavu

### 10.1 Souhrn rozporů

| Oblast | Rozpor | Rozsah |
|---|---|---|
| **Kurzíva veličin** | `<var>` se nevyskytuje **nikde**; kurzíva jen náhodou přes KaTeX | celý projekt[^3] |
| **`<em>` jako veličina** | `<em>pp</em>O₂` (CZ) / `<em>p</em>O₂` (EN, ES) | 58 výskytů v 9 souborech[^30] |
| **Čtyři notace téhož** | `P<sub>amb</sub>` · `P_{amb}` · `P_amb` · `pAmb` | napříč HTML/KaTeX/canvas/JS[^10] |
| **Desetinná tečka v CZ UI** | `toFixed()` u všech dynamických hodnot | všechny grafy a odečty[^4] |
| **Desetinná tečka v CZ datech** | `0.16 bar`, `0.2 bar` … | 5× `quiz-accidents.json`[^9] |
| **ASCII chemie** | `CO2`, `(21% O2)` | 4× `quiz-accidents.json`[^9] |
| **Mezera číslo–jednotka** | `10m` × `10 m`, `80%` × `80 %`, `37°C` × `37 °C` | ~190 výskytů v HTML[^39] |
| **Nedělitelné mezery** | prakticky nulové (4 výskyty, žádný jako oddělovač jednotky) | celý projekt[^40] |
| **Spojovník místo pomlčky** | `100-120`, `5-6 cm` | 5× `quiz-accidents.json`[^9] |
| **Znak minus** | U+2212 se nevyskytuje **nikde**; `−1 °C` psáno pomlčkou | celý projekt[^9] |
| **Kurzívní indexy v LaTeXu** | `P_{amb}`, `f_{N_2}`, `GF_{low}` | wiki + 4 theory pages[^41] |
| **Čeština v anglickém vzorci** | `P_{H_2O} = 0{,}0627 \text{ bar při 37 °C}` | `pressure.html:533`[^42] |
| **KaTeX z CDN** | není v `STATIC_ASSETS`; po bumpu verze vzorce offline nefungují do prvního online načtení | `sw.js`[^43] |
| **Nekonzistentní renderer** | theory pages = KaTeX; sandbox = holé `<sub>`; `gradient-factors.html` načítá KaTeX a nepoužívá ho | 12 souborů[^41] |

### 10.2 Rozsah práce podle souborů

| Kategorie | Počet | Nejzatíženější soubory |
|---|---|---|
| `<sub>` v HTML | ~104 v 12 souborech | `sandbox/schreiner.html` (23), `sandbox/haldane.html` (22), `sandbox/m-values.html` (13) |
| KaTeX `.formula` bloky | ~49 v 6 souborech | `pressure.html` (14), `sandbox/schreiner.html` (16) |
| `ppO₂`/`ppN₂` (vše) | 29 souborů | `sandbox/index.html` (43), `locales/en.json` (35), `js/diveSetup.js` (34), `js/tissueEducation.js` (32) |
| Číslo+jednotka bez mezery | ~190 v 19 souborech | `pressure.html` (57), `tissue-loading.html` (28), `gradient-factors.html` (21) |

Zdroj: [^39][^41]

### 10.3 Co je naopak v pořádku

- **`quiz-physics.json` má bezchybnou desetinnou čárku** (0 chyb) a důsledně mezeruje jednotky (0 výskytů `[0-9]bar` apod.)[^9]
- **`°C` je v českých kvízech vždy s mezerou** — 14 výskytů, 0 chyb[^9]
- **Znaky násobení jsou správné:** `·` v algebře, `×` v aritmetice, 0 výskytů `*` nebo písmene `x`[^9]
- **Unicode ₂ dominuje** (~98 %) nad ASCII `2`[^9]
- **Wiki je nejkonzistentnější částí projektu** — jednotný LaTeX, `37 °C` s mezerou[^41]
- **`sw.js` a `styles.css` mají synchronizovanou verzi** (0.6.36)[^43]
- **Přidání CSS pravidel pro `var`/`sub` nekoliduje s ničím** — takové selektory neexistují[^32]

---

## 11. Návrh fáze 2 (sjednocení)

Doporučené pořadí — od nejvyššího poměru přínos/riziko:

| # | Krok | Rozsah | Riziko |
|---|---|---|---|
| **1** | Založit `.github/instructions/notation.instructions.md` (viz §12) | 1 soubor | žádné |
| **2** | Opravit 5 desetinných teček + 4 ASCII `CO2`/`O2` + 5 spojovníků v `quiz-accidents.json` | 14 náhrad | nízké, **přidat regresní test** |
| **3** | Přidat CSS blok pro `var`/`sub`/`.unit`/`.chem`/`.qty` | ~20 řádků | žádné (selektory neexistují) |
| **4** | Nahradit `<em>` → `<var>` v datech kvízů; sjednotit CZ `<em>pp</em>O₂` → `<var>p</var><sub>O₂</sub>` | 58 náhrad, 9 souborů | nízké (`quiz.js` používá `innerHTML`[^30]) |
| **5** | Vytvořit `js/katexMacros.js` a `js/format.js`; zapojit makra do 4 theory pages | 2 nové moduly | střední |
| **6** | Opravit LaTeX: `P_{amb}` → `p_{\mathrm{amb}}` atd. ve wiki i v HTML | ~49 vzorců + 21 wiki stran | střední — **přepočítat ověřené příklady** |
| **7** | Zavést `Intl.NumberFormat` na místě `toFixed()` v grafech a odečtech | ~40 volání | **vyšší** — testy porovnávají řetězce |
| **8** | Doplnit nedělitelné mezery `&#8239;` mezi číslo a jednotku v HTML | ~190 míst | nízké, mechanické |
| **9** | Přidat lint skript `tests/notation-lint.mjs` do `npm test` | 1 soubor | žádné |
| **10** | Sjednotit sandbox stránky na KaTeX; přidat KaTeX do `STATIC_ASSETS` (self-host) | 8 souborů + sw.js | střední |

> **Povinné u každého kroku dle `CLAUDE.md`:** spustit `npm test`, bumpnout verzi v `sw.js:2` **a** v `css/styles.css` (`.version-number::after`), a u změny algoritmického souboru aktualizovat odpovídající wiki stranu.

### 11.1 Kontrola strojově (lint)

Regexy, které spolehlivě odhalí nejčastější prohřešky[^38]:

```js
// tests/notation-lint.mjs
const RULES = [
  { name: 'number-unit-no-space',
    re: /\d(?:bar|msw|fsw|ata|atm|kPa|MPa|km|min|°[CF]|ml|kg)\b/g,
    msg: 'Chybí nedělitelná mezera mezi číslem a jednotkou' },

  { name: 'em-as-variable',
    re: /<em>([A-Za-z]{1,2})<\/em>/g,
    msg: 'Použij <var>, ne <em>, pro značku veličiny' },

  { name: 'hyphen-as-range',
    re: /\b\d+-\d+\b/g,
    msg: 'Rozsah piš pomlčkou – (U+2013), ne spojovníkem' },

  { name: 'italic-latex-subscript',
    re: /_\{(?!\\mathrm|\d|1\/2)[a-z]{2,}\}/g,
    msg: 'Popisný index musí být \\mathrm{...}' },
];
// + pro data/quiz-*.json bez -en: /\b\d+\.\d+\b/  → desetinná tečka v češtině
```

Alternativa s hotovým nástrojem: **Vale** (<https://vale.sh>) — jediný binární soubor, bez build stepu, umí Markdown i HTML, pravidla v YAML (`extends: existence`, `tokens:`)[^38].

---

## 12. Doporučené umístění v repozitáři

Projekt už má `.github/copilot-instructions.md` (struktura `##`/`###`, emoji v nadpisech, tabulky, fenced bloky) a `CLAUDE.md`; existuje i `docs/` s `algorithm-reference.md`[^44].

| Soubor | Obsah | Proč |
|---|---|---|
| **`docs/notation-style-guide.md`** | tento dokument v plné podobě — slovníček, normy, citace | referenční, pro člověka; vedle `algorithm-reference.md` |
| **`.github/instructions/notation.instructions.md`** | zhuštěná pravidla DO/DON'T s `applyTo` | načte se jen pro dotčené soubory, šetří kontext |
| **`.github/copilot-instructions.md`** | 5–10 řádků odkazujících na výše uvedené | globální připomínka |
| **`CLAUDE.md`** | odstavec „Notation" s odkazem | Claude Code čte root |

GitHub podporuje `applyTo` frontmatter s glob vzory (i více vzorů oddělených čárkou)[^45]:

```markdown
---
applyTo: "*.html,sandbox/**/*.html,wiki/**/*.md,data/quiz-*.json"
---

# Zápis fyzikálních veličin

- **DO:** `<var>p</var><sub>amb</sub>` — kurzívní značka, stojatý popisný index
- **DON'T:** `<em>p</em>`, `P<sub>amb</sub>`, `pAmb` v prose

- **DO:** `p_{\mathrm{amb}}`, `f_{\mathrm{N}_2}`, `\mathrm{GF}_{\mathrm{low}}`
- **DON'T:** `P_{amb}`, `f_{N_2}`, `GF_{low}` — index by byl kurzívou

- **DO:** `1,4&#8239;bar` v češtině · `1.4&#8239;bar` v angličtině
- **DON'T:** `1.4 bar` v českém textu, `1,4bar`, `1,4 bar` s obyčejnou mezerou

- **DO:** tlak je vždy malé *p*; `p`≠`P` (výkon), `t`≠`T`
- **DO:** rozsah pomlčkou bez mezer: `10–20 m`; minus U+2212: `−5 °C`
```

Doporučená délka `copilot-instructions.md` podle dokumentace GitHubu je **do ~2 stran**; delší pravidla patří do `applyTo` souborů, které se načítají jen pro odpovídající cesty[^45].

---

## 13. Rychlá referenční karta

```
KURZÍVA (značky veličin):
  p  T  t  V  m  h  ρ  F  S  g  v  n  c  k  a  b  M  R
  indexy, které jsou veličinou nebo běžícím indexem:  c_p , a_i

STOJATĚ:
  jednotky ................ bar  Pa  kPa  MPa  m  s  min  K  °C  mol  l  N
  předpony ................ k  M  m  μ  h
  popisné indexy .......... p_amb  p_alv  p_t  T_max  M_adj  GF_low
  chemické vzorce ......... N₂  O₂  He  CO₂  H₂O   (i číslice v indexu)
  víceznakové zkratky ..... GF  SAC  MOD  NDL  EAD  OTU  CNS
  konstanty a operátory ... e  π  i  d  Δ  ln  exp  sin
  číselné hodnoty ......... 5   1,5   3,14

VELIKOST PÍSMEN:
  p = tlak      ≠  P = výkon
  t = čas       ≠  T = termodynamická teplota
  v = rychlost  ≠  V = objem
  kPa (ne KPa)  ·  MPa (ne mPa = milipascal!)  ·  bar (ne Bar)

ČEŠTINA:
  desetinná čárka ......... 1,4 bar        (ne 1.4)
  tisíce mezerou .......... 1 000 kPa      (4místná i bez: 1000)
  číslo + jednotka ........ 40 m           nedělitelná mezera U+202F
  Celsius ................. 20 °C          (úhel naopak: 60°)
  procenta ................ 32 %  podst.   /  32% nitrox  příd.
  rozsah .................. 10–20 m        pomlčka U+2013, bez mezer
  minus ................... −5 °C          U+2212, ne - ani –
  násobení ................ ρ·g·h  /  20 × 5      nikdy * ani x
  značky se neskloňují .... 5 m            (ne "5 metrů" se značkou)

LATEX / KATEX:
  p_{\mathrm{amb}}       f_{\mathrm{N}_2}       t_{1/2}
  \mathrm{GF}_{\mathrm{low}}      \mathrm{e}^{-kt}      1{,}4\,\mathrm{bar}
```

---

## 14. Confidence Assessment

**Vysoká jistota (přímé citace primárních zdrojů):**
- Pravidlo kurzíva/stojatě a pravidlo indexů — doslovné znění NIST SP 811 §10.1/§10.2, obsahově shodné s ISO 80000-1 kap. 7[^2]
- České typografické rules — doslovné citace IJP ÚJČ §165, §785, §791, §880[^13][^18][^19][^20]
- Sémantika `<var>` — doslovná citace HTML Living Standard §4.5.16, včetně formulace „a symbol identifying a physical quantity"[^5]
- Podpora matematiky na GitHubu včetně wiki — oficiální dokumentace[^36]
- Kompletní audit repozitáře (počty, file:line) — přímé čtení pracovní kopie[^3][^4][^9][^30][^39][^41]
- Chování `Intl.NumberFormat` pro cs-CZ včetně U+202F a `minimumGroupingDigits = 2`[^38]

**Střední jistota (sekundární zdroje, ověřeno křížově):**
- Čísla a data vydání jednotlivých ČSN EN ISO 80000-x — z katalogů ČAS a technicke-normy-csn.cz, plné texty jsou zpoplatněné[^1]
- Bühlmannova původní notace — z Wikipedie, cronatec.ch a Bakerových prací; originál *Tauchmedizin* jsem neměl k dispozici[^23]
- Bakerova přesná typografie GF<sub>low</sub>/GF<sub>high</sub> — původní PDF v *Immersed* se nepodařilo strojově přečíst; potvrzeno z několika reprodukcí[^26]

**Nízká jistota / explicitní mezery:**
- **Oficiální materiály SPČR / CMAS ČR nebyly dostupné** — weby svazu nereagovaly, PDF na spms.cz se nepodařilo zpracovat. Doporučení pro české potápěčské názvosloví se opírá o stranypotapecske.cz, soprassub.com, msdiving.cz a českou lokalizaci Garmin[^27][^29]. **Před finalizací slovníčku doporučuji ověřit proti tištěným skriptům SPČR.**
- Zda ČSN 01 6910:2014 předepisuje úzkou mezeru U+202F, nebo jen „pevnou mezeru" obecně — IJP mluví o „pevné mezeře", SI Brochure o tenké. Volba U+202F je proto doporučení, ne doložený požadavek normy[^18].
- ppO₂ vs. pO₂ v české potápěčské praxi — doloženy **obě** varianty; rozhodnutí v §6.2 je normativní volba projektu, ne popis jednoznačného úzu[^29].

**Předpoklady, které jsem přijal bez konzultace:**
1. Cílem je **normativní správnost dle ČSN/ISO**, ne kopírování zvyklostí potápěčské komunity → odtud volba *p* místo *P* a *p*<sub>O₂</sub> místo ppO₂.
2. Projekt zůstává **bez build stepu** → doporučuji zůstat u KaTeX + `<var>`, nikoli přecházet na MathML.
3. `bar`, `m`, `min`, `l`, `°C` zůstávají primárními jednotkami; kPa v kvízech je citace oficiálního zadání SPČR.
4. Rozsah fáze 2 je celý projekt včetně `sandbox/`, wiki a dat kvízů.

---

## Footnotes

[^1]: ČSN EN ISO 80000-1 (01 1300), vyd. 10/2023 — katalog ČAS: <https://csnonline.agentura-cas.cz/Detailnormy.aspx?k=516771>; přehled ČAS „Normy k uvádění veličin a jednotek": <https://agenturacas.gov.cz/produkty-a-sluzby/reprodukce-csn/o-vybranych-normach/normy-k-uvadeni-velicin-a-jednotek/>; ČSN EN ISO 80000-4: <https://www.technicke-normy-csn.cz/csn-en-iso-80000-4-011300-158638.html>; ČSN EN ISO 80000-5: <https://www.technicke-normy-csn.cz/csn-en-iso-80000-5-011300-158642.html>
[^2]: NIST SP 811, kap. 10 „More on Printing and Using Symbols and Numbers" §10.1, §10.2, §10.2.1, §10.2.3, §10.4.1, §10.5.3, §10.5.4 — <https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-10-more-printing-and-using-symbols-and-numbers>; kap. 7 §7.2 — <https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-7-rules-and-style-conventions-expressing-values>
[^3]: Audit repozitáře: `<var>`, `<i>` ani `<em>` se pro značky veličin v žádné HTML stránce nepoužívají; kurzíva vzniká jen uvnitř KaTeX výstupu. Ověřeno grepem napříč všemi 28 `.html` souborech.
[^4]: `js/i18n.js` (žádné `Intl`/`toFixed`/`toLocaleString`); `js/charts/DiveProfileChart.js:36-41` (`fmt()`), `:664`, `:1393`, `:1415`; `js/charts/MValueChart.js:1060`; `js/components/TissueSaturationSim.js:295-302`; jediná lokálně uvědomělá cesta `js/charts/chartTheme.js:166-173` (`formatAxis`).
[^5]: HTML Living Standard §4.5.16 (`var`), §4.5.19 (`sub`/`sup`) — <https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-var-element>
[^6]: HTML Living Standard §4.5.2 (`em` = stress emphasis) — <https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-em-element>; MDN `<var>` — <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/var>
[^7]: N. Higham, „Typesetting Mathematics According to the ISO Standard" — <https://nhigham.com/2016/01/28/typesetting-mathematics-according-to-the-iso-standard/>; C. Beccari, TUGboat 18:1 — <https://tug.org/TUGboat/tb18-1/tb54becc.pdf>
[^8]: TeX StackExchange, „Which command should I use for textual subscripts in math mode?" — <https://tex.stackexchange.com/questions/98406/>
[^9]: `data/quiz-accidents.json:628, 653, 803, 828, 878` (desetinné tečky); `:1178, 1203, 1253` (`CO2`, `O2` v ASCII); `:178, 203, 253, 378, 1353` (spojovník v rozsazích). `data/quiz-physics.json` naopak 0 chyb v desetinné čárce, 0 chyb v mezerování jednotek, `·`/`×` použity správně.
[^10]: `tissue-loading.html:403` (`P<sub>ambient</sub>`), `m-values.html:210` (`M = a + \frac{P_{amb}}{b}`), `js/charts/BubbleModel.js:334, 350` (`P_amb`, `P_tissue` v canvasu), `js/decoModel.js` (`ambientPressure`, `pAmb`).
[^11]: ČSN 01 6910:2014, ÚJČ AV ČR — <https://ujc.cas.cz/en/expertni-cinnost/czech-national-standard-csn-01-6910-version-2014/>
[^12]: Zákon č. 505/1990 Sb. — <https://www.unmz.gov.cz/wp-content/uploads/Z505_01072021.pdf>; vyhláška č. 264/2000 Sb. — <https://www.zakonyprolidi.cz/cs/2000-264>
[^13]: Internetová jazyková příručka ÚJČ, §785 „Značky, čísla a číslice" — <https://prirucka.ujc.cas.cz/?id=785>
[^14]: SI Brochure, 9. vyd. (BIPM 2019) — <https://www.bipm.org/documents/20126/41483022/SI-Brochure-9.pdf>
[^15]: IUPAC Green Book §1.6, shrnuto v pokynech IUPAC — <https://reports.iupac.org/guidelines-for-drafting-reports/5-quantities.html>; IUPAC Gold Book, heslo „pressure" — <https://goldbook.iupac.org/terms/view/P04819>
[^16]: SI Brochure §5.2 / NIST SP 330 §5 — <https://www.nist.gov/pml/special-publication-330/sp-330-section-5>
[^17]: 16. CGPM (1979), rezoluce 6 — <https://www.bipm.org/en/committees/cg/cgpm/16-1979/resolution-6>
[^18]: Internetová jazyková příručka ÚJČ, §880 „Zalomení řádků" — <https://prirucka.ujc.cas.cz/?id=880>
[^19]: Internetová jazyková příručka ÚJČ, §791 — <https://prirucka.ujc.cas.cz/?id=791>
[^20]: Internetová jazyková příručka ÚJČ, §165 „Pomlčka" — <https://prirucka.ujc.cas.cz/?id=165>
[^21]: `data/quiz-physics.json:1107, 1732, 1932` — `20litrového`, `12litrovém`, `18litrový` jsou správné české složeniny, ne chyby mezerování.
[^22]: cs.wikipedia.org: Tlak, Hustota, Teplota, Archimédův zákon, Látkové množství; Mikulčák, *Matematické, fyzikální a chemické tabulky*; přehled veličin: <https://fyzika.jreichl.com/main.article/view/438-fyzikalni-veliciny-a-jednotky-prehledna-tabulka>
[^23]: Bühlmann AA, *Tauchmedizin* / *Decompression – Decompression Sickness* (Springer); shrnutí notace: <https://cronatec.ch/the-formula-for-the-buehlmann-algorithm/>; <https://en.wikipedia.org/wiki/B%C3%BChlmann_decompression_algorithm>; CMAS fact sheet: <https://www.cmas.org/fact-sheets/bühlmann-zh-l-eng.html>
[^24]: Schreinerova rovnice, odvození — <https://wrobell.dcmod.org/decotengu/model.html>
[^25]: Workman RD (1965), *Calculation of decompression schedules for nitrogen-oxygen and helium-oxygen dives*, USN EDU Report 6-65; shrnutí — <https://scubatechphilippines.com/scuba_blog/understanding-m-values-eric-baker/>
[^26]: Baker EC, „Understanding M-values", *Immersed* 3(3), 1998 — <https://wrobell.dcmod.org/decotengu/_downloads/mvalues.pdf>; „Clearing Up The Confusion About Deep Stops" — <http://www.dive-tech.co.uk/resources/deepstops.pdf>; CMAS GF fact sheet — <https://www.cmas.org/fact-sheets/gradient-factors-gf-and-dive-computers.html>
[^27]: <http://stranypotapecske.cz/teorie/deco.asp>; <https://soprassub.com>; <https://msdiving.cz>; česká lokalizace Garmin Descent Mk1 — <https://www8.garmin.com/manuals/webhelp/descentmk1/CS-CZ/>; cs.wikipedia „Dekompresní nemoc"
[^28]: Pappenheimer JR et al. (1950), „Standardization of definitions and symbols in respiratory physiology", *Federation Proceedings* 9(3):602–605 — <https://europepmc.org/abstract/MED/14784074>; Wagner PD (2021), oprava FIO₂ vs FiO₂ — <https://journals.physiology.org/doi/epdf/10.1152/ajplung.00610.2020>
[^29]: <http://stranypotapecske.cz/teorie/dychaci-smesi.asp> (`pO2 = fO2 × p`); cs.wikipedia „Tlak" (`p_i`); cs.wikipedia „Parciální tlak" (`P(O2)`); Garmin CS-CZ (`PO2`).
[^30]: `data/quiz-physics.json:2027, 2052, 2177, 2202, 2377`; `data/quiz-accidents.json:628`; `data/quiz-anatomy.json:1778` (CZ `<em>pp</em>`); `data/quiz-physics-en.json:1056, 1134`; `data/quiz-accidents-en.json:328` (EN/ES `<em>p</em>`). Celkem 58 výskytů `<em>` v 9 souborech; žádný jiný HTML tag se v datech kvízů nevyskytuje. Vykreslování přes `innerHTML`: `js/quiz.js:196` a `js/quiz.js:251`.
[^31]: `resources/decompression-theory.txt:178-203, 268-270, 359` (ATM, stopy, `Pambtol = ( Pcomp - a ) x b`, `PPN2`); `resources/FyzikaP12_2025.txt:151-152, 713, 716, 868` (kPa/MPa/bar, `p02 min = 0.16 bar`, `1.500 m/s` jako oddělovač tisíců).
[^32]: `css/styles.css` — grep na selektory `var`, `sub`, `sup` nevrací nic; `:root` na řádcích 53–115; `.formula` 1292–1301; `.formula-inline` 1302–1307; `.math-content` 1278–1291; `.formula-content` 4685–4697.
[^33]: HTML-AAM, mapování `var` na roli `generic` — <https://w3c.github.io/html-aam/#el-var>
[^34]: KaTeX API a volba `macros` — <https://katex.org/docs/api.html>, <https://katex.org/docs/options.html>, auto-render — <https://katex.org/docs/autorender.html>
[^35]: KaTeX Supported Functions — <https://katex.org/docs/supported.html>; Support Table — <https://katex.org/docs/support_table.html>; mhchem contrib — <https://github.com/KaTeX/KaTeX/blob/main/contrib/mhchem/README.md>
[^36]: GitHub Docs, „Writing mathematical expressions" — <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions>; GitHub Changelog 19. 5. 2022 — <https://github.blog/changelog/2022-05-19-render-mathematical-expressions-in-markdown/>
[^37]: `gjtorikian/html-pipeline`, `sanitization_filter.rb` — `sup`, `sub` i `var` jsou v `DEFAULT_CONFIG.elements` — <https://github.com/gjtorikian/html-pipeline/blob/main/lib/html_pipeline/sanitization_filter.rb>
[^38]: MDN `Intl.NumberFormat` — <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat>; ECMA-402 tabulka povolených jednotek — <https://tc39.es/ecma402/#table-sanctioned-single-unit-identifiers>; CLDR unit data — <https://unicode.org/cldr/latest/common/validity/unit.xml>; diskuse `min2` — <https://github.com/tc39/proposal-intl-numberformat-v3/issues/77>; Vale — <https://vale.sh>
[^39]: Počty výskytů „číslo bezprostředně následované jednotkou" podle souborů: `pressure.html` 57, `tissue-loading.html` 28, `gradient-factors.html` 21, `sandbox/gas-law.html` 16, `sandbox/haldane.html` 10, `sandbox/schreiner.html` 9, dále 13 souborů s 1–8 výskyty. Popisky grafů: `js/charts/DiveProfileChart.js:642` (`'MAX: {0}m'`), `:664`, `:774` (`'DECO {0}m · {1}min'`) vs. `:696` (`'TDT: {0} min'`).
[^40]: Nedělitelné mezery v HTML: pouze `sandbox/m-values.html:564`, `:655`, `sandbox/gas-law.html:972`, `about.html:45` — žádná z nich neodděluje číslo od jednotky. V datech kvízů 0 výskytů.
[^41]: `wiki/Model-01-Compartments.md:30, 52`; `wiki/Model-02-Haldane-Equation.md:7, 20, 38, 41, 50`; `wiki/Model-03-Schreiner-Equation.md:14, 21, 39`; `wiki/Model-04-M-Values.md:10, 37, 65, 72, 96`; `wiki/Model-05-Gradient-Factors.md` (blok `cases`). HTML: `pressure.html:238-821` (14 bloků), `tissue-loading.html:345-589`, `m-values.html:210`; `gradient-factors.html:306, 336, 342` načítá KaTeX, ale používá jen `<sub>`.
[^42]: `pressure.html:533` — `P_{H_2O} = 0{,}0627 \text{ bar při 37 °C}` na anglické stránce.
[^43]: `sw.js:2` (`CACHE_NAME = 'deco-theory-0.6.36'`), `sw.js:5-100` (`STATIC_ASSETS`, jen relativní cesty), `sw.js:113-143` (fetch handler s runtime cache); `pressure.html:23-26`, `tissue-loading.html:22-25`, `m-values.html:23-26`, `gradient-factors.html:23-26` (KaTeX 0.16.9 z `cdn.jsdelivr.net`); `css/styles.css:2093-2095` (`.version-number::after { content: "0.6.36" }`).
[^44]: Struktura `.github/copilot-instructions.md` (H1 + `##`/`###`, emoji v nadpisech, tabulky, fenced bloky); `CLAUDE.md` sekce „Key Conventions"; `docs/algorithm-reference.md`. Žádný z nich neobsahuje pravidla notace ani typografie.
[^45]: GitHub Docs, „Adding repository custom instructions for GitHub Copilot" včetně `applyTo` frontmatteru — <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions>
