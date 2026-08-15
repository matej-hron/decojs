# Slovníček veličin

Kanonický registr značek používaných v DecoJS. **Zavádíš-li novou veličinu, zapiš ji sem.**

Pravidla, proč se značky píšou takto, jsou ve `style-guide.md`.
Jak je zapsat v HTML, LaTeXu a v kódu, je v `authoring.md`.

## 1. Jak slovníček číst

1. **Značka veličiny se sází kurzívou** — *p*, *t*, *V*. Jednotka stojatě — bar, m, min.
2. **Index se řídí svým významem, ne vzhledem.** Popisný index (zkratka slova, chemická
   značka, číslo) je **stojatě**. Index, který je sám veličinou nebo běžícím indexem, je
   **kurzívou**.
3. **Víceznakové zkratky stojatě** — GF, NDL, MOD. Kurzíva by je četla jako součin (*G*·*F*).

**Test na index** (IUPAC): *veličině lze přiřadit hodnotu, štítku ne.*

| Zápis | Index znamená | Písmo |
|---|---|---|
| *p*<sub>amb</sub> | zkratka slova *ambient* | stojatě |
| *p*<sub>N₂</sub> | chemická značka | stojatě |
| *p*<sub>t,0</sub> | *t* = tissue, 0 = číslo | stojatě |
| *c*<sub>*p*</sub> | *p* = tlak, tedy veličina | **kurzívou** |
| *a*<sub>*i*</sub> | *i* = číslo kompartmentu | **kurzívou** |

Past: *p*<sub>t</sub> (tkáňový tlak, „t" = tissue → stojatě) vs. *c*<sub>*p*</sub>
(index *p* = tlak → kurzívou). Rozhoduje význam.

## 2. Základní veličiny

| Symbol | Veličina (CZ) | Quantity (EN) | Jednotka | Pozn. | V kódu (kanonicky) | Legacy alias, ponechat | Doloženo | Zdroj |
|---|---|---|---|---|---|---|---|---|
| *p* | tlak | pressure | bar | SI: Pa | — | — | — | ISO 80000-4 |
| *p*<sub>amb</sub> | okolní (absolutní) tlak | ambient pressure | bar | SI: Pa | `pAmb` | `ambientPressure` | 29 × / 31 × | Bühlmann |
| *p*<sub>atm</sub> | atmosférický tlak | atmospheric pressure | bar | SI: Pa | — | — | — | ISO 80000-4 |
| *p*<sub>h</sub> | hydrostatický tlak | hydrostatic pressure | bar | SI: Pa | — | — | — | čes. konvence |
| *p*<sub>abs</sub> | absolutní tlak | absolute pressure | bar | SI: Pa | — | — | — | čes. konvence |
| *p*<sub>e</sub> | přetlak | gauge pressure | bar | SI: Pa | — | — | — | ISO 80000-4 |
| *V* | objem | volume | l | SI: m³ | — | — | — | ISO 80000-4 |
| *ρ* | hustota | density | kg/m³ | — | — | — | — | ISO 80000-4 |
| *T* | termodynamická teplota | thermodynamic temperature | K | — | — | — | — | ISO 80000-5 |
| *t* | **čas** | time | min | SI: s | — | — | — | ISO 80000-3 |
| *h* | hloubka / výška | depth / height | m | — | — | — | — | čes. konvence |
| *m* | hmotnost | mass | kg | — | — | — | — | ISO 80000-4 |
| *F* | síla | force | N | — | — | — | — | ISO 80000-4 |
| *F*<sub>vz</sub> | vztlaková (Archimédova) síla | buoyancy force | N | — | — | — | — | čes. škola |
| *F*<sub>G</sub> | tíhová síla | weight force | N | — | — | — | — | čes. škola |
| *S* | plocha, obsah | area | m² | — | — | — | — | čes. škola (ISO: *A*) |
| *g* | tíhové zrychlení | gravitational acceleration | m/s² | — | — | — | — | ISO 80000-3 |
| *v* | rychlost | velocity | m/min | SI: m/s | — | — | — | ISO 80000-3 |
| *n* | látkové množství | amount of substance | mol | — | — | — | — | ISO 80000-9 |
| *R* | molární plynová konstanta | gas constant | — | SI: J/(mol·K); *R* má i jiný význam, viz §5 | — | — | — | ISO 80000-9 |
| *c* | koncentrace | concentration | — | SI: mol/m³ | — | — | — | ISO 80000-9 |

> Odchylky české školy od ISO: plocha *S* (ISO: *A*), tíhová síla *F*<sub>G</sub> nebo *G*
> (ISO: *F*<sub>g</sub>), vztlak *F*<sub>vz</sub> (mezinárodně *F*<sub>A</sub>). Pro
> českého čtenáře držíme českou variantu a mezinárodní uvádíme v závorce.

> **„Doloženo" je počet výskytů v `js/`, ne počet řádků.** Reprodukce pro daný
> identifikátor: `grep -roE "\b<identifikátor>\b" js/ | wc -l`.

## 3. Popisné indexy CZ↔EN

Indexy jsou dvojího druhu a zachází se s nimi různě:

- **Chemické** (O₂, N₂, He, CO₂, H₂O) — značka prvku. **Nikdy se nepřekládají**,
  ve všech jazycích stejné.
- **Popisné** (celkový, okolní, tkáňový) — zkrácená *slova*, a slova se překládají.

ISO 80000 určuje jen to, že popisný index je stojatě; jazyk neřeší. Garant (#61) žádá
`p_celk`, takže český čtenář dostane český index.

| Význam | Index CZ | Index EN | Příklad CZ | Příklad EN |
|---|---|---|---|---|
| celkový | celk | tot | *p*<sub>celk</sub> | *p*<sub>tot</sub> |
| okolní (absolutní) | okol | amb | *p*<sub>okol</sub> | *p*<sub>amb</sub> |
| atmosférický | atm | atm | *p*<sub>atm</sub> | *p*<sub>atm</sub> |
| hydrostatický | h | h | *p*<sub>h</sub> | *p*<sub>h</sub> |
| tkáňový | tk | t | *p*<sub>tk</sub> | *p*<sub>t</sub> |
| alveolární | alv | alv | *p*<sub>alv</sub> | *p*<sub>alv</sub> |
| počáteční | 0 | 0 | *p*<sub>tk,0</sub> | *p*<sub>t,0</sub> |
| tolerovaný | tol | tol | *p*<sub>okol,tol</sub> | *p*<sub>amb,tol</sub> |
| maximální | max | max | *p*<sub>max</sub> | *p*<sub>max</sub> |
| upravený (s GF) | upr | adj | *M*<sub>upr</sub> | *M*<sub>adj</sub> |

**Slova psaná ve vzorci celá.** Některé indexy nejsou zkratkou, ale běžným slovem;
ve vzorci se sázejí stojatě a překládají stejně jako zkratky.

| Význam | Zdroj (EN) | CZ | Příklad |
|---|---|---|---|
| hloubka | depth | hloubka | *p*<sub>okol</sub> = 1 + hloubka / 10 |
| lahev | cyl | lahev | *V*<sub>lahev</sub> |
| počáteční tlak | start | poč | *p*<sub>poč</sub> |
| rezerva | reserve | rez | *p*<sub>rez</sub> |
| průměrný | avg | prům | *p*<sub>prům</sub> |

**Zkratky se nepřekládají** (§5): `SAC`, `MOD`, `OTU`, `NDL`, `GF` zůstávají ve všech
jazycích stejné — ve vzorci ale musí být stojatě (`\mathrm{SAC}`), jinak je KaTeX
vysází jako součin kurzívních písmen *S*·*A*·*C*.

**Vyřešeno ve fázi 2:** vzorce se sázejí z jednoho anglického zdroje a překládá je
`localizeLatex()` v `js/format.js` — tabulka `UPRIGHT_CS` je strojovým protějškem
obou tabulek výše. Do HTML se tedy píše kanonický anglický tvar
(`p_{\mathrm{tot}}`) a český čtenář dostane `p_{\mathrm{celk}}`. Popisky grafů
jdou přes `locales/*.json` a řídí se stejným pravidlem.

## 4. Parciální tlaky a podíly plynů

| Symbol | Veličina (CZ) | Quantity (EN) | Poznámka | V kódu (kanonicky) | Legacy alias, ponechat | Doloženo |
|---|---|---|---|---|---|---|
| *p*<sub>O₂</sub> | parciální tlak kyslíku | oxygen partial pressure | index stojatě, číslice stojatě | `ppO2` | — | 45 × |
| *p*<sub>N₂</sub> | parciální tlak dusíku | nitrogen partial pressure | — | `ppN2` | — | 13 × |
| *p*<sub>He</sub> | parciální tlak helia | helium partial pressure | — | — | — | — |
| *p*<sub>CO₂</sub> | parciální tlak oxidu uhličitého | carbon dioxide partial pressure | — | — | — | — |
| *p*<sub>H₂O</sub> | tlak vodní páry | water vapour pressure | 0,0627&nbsp;bar při 37&nbsp;°C | — | — | — |
| *f*<sub>O₂</sub> | objemový zlomek kyslíku | oxygen fraction | bezrozměrný, 0–1 | — | — | — |
| *f*<sub>N₂</sub> | objemový zlomek dusíku | nitrogen fraction | 0,7902 pro vzduch | `fN2` | — | 3 × |
| *f*<sub>He</sub> | objemový zlomek helia | helium fraction | — | — | — | — |

> **`ppO₂` je hovorové synonymum, ne značka.** Kanonicky *p*<sub>O₂</sub>. `ppO₂` smí
> zůstat ve varovných hláškách a popiscích grafů; **ve vzorci nikdy**. Anglické a
> španělské stránky dnes používají *p*O₂ — sjednotí se na *p*<sub>O₂</sub>.

## 5. Dekompresní model

| Symbol | Veličina (CZ) | Quantity (EN) | Jednotka | Zdroj | V kódu (kanonicky) | Legacy alias, ponechat | Doloženo |
|---|---|---|---|---|---|---|---|
| *i* | číslo kompartmentu (1–16) | compartment index | — | Bühlmann | — | — | — |
| *t*<sub>1/2</sub> | poločas (nasycení) tkáně | tissue half-time | min | Bühlmann (*Halbwertszeit*) | `halfTime` | — | 65 × |
| *k* | rychlostní konstanta, *k* = ln 2 / *t*<sub>1/2</sub> | rate constant | min⁻¹ | standard | — | — | — |
| *a* | Bühlmannův koeficient *a* | Bühlmann a-coefficient | bar | ZH-L16 | — | — | — |
| *b* | Bühlmannův koeficient *b* | Bühlmann b-coefficient | — | ZH-L16 | — | — | — |
| *p*<sub>alv</sub> | alveolární tlak inertního plynu | alveolar inert gas pressure | bar | Bühlmann | `pAlv` | `alveolarPressure` | 3 × / 4 × |
| *p*<sub>t</sub> | tlak inertního plynu v tkáni | tissue inert gas pressure | bar | Bühlmann | `pTissue` | `tissuePressure` | 16 × / 9 × |
| *p*<sub>t,0</sub> | počáteční tlak v tkáni | initial tissue pressure | bar | Schreiner | — | — | — |
| *p*<sub>amb,tol</sub> | tolerovaný okolní tlak (strop) | tolerated ambient pressure | bar | Bühlmann | — | — | — |
| *R* | rychlost změny tlaku | rate of pressure change | bar/min | Schreiner | — | — | — |
| *M* | M-hodnota | M-value | bar | Workman | — | — | — |
| *M*<sub>0</sub> | povrchová M-hodnota | surfacing M-value | bar | Workman | — | — | — |
| Δ*M* | sklon M-hodnoty | M-value slope | — | Workman | — | — | — |
| *M*<sub>adj</sub> | upravená M-hodnota (s GF) | adjusted M-value | bar | Baker | — | — | — |
| GF | gradientový faktor | gradient factor | % / 0–1 | Baker | — | — | — |
| GF<sub>low</sub> | GF na první zastávce | GF low | % | Baker | `gfLow` | — | 139 × |
| GF<sub>high</sub> | GF na hladině | GF high | % | Baker | `gfHigh` | — | 102 × |
| GF<sub>inst</sub> | okamžitý GF | instantaneous GF | % | DecoJS | — | — | — |
| *p*<sub>ceiling</sub> | tlak stropu | ceiling pressure | bar | DecoJS | `ceiling` | — | 49 × |
| *p*<sub>anchor</sub> | kotevní tlak rampy GF | anchor pressure | bar | DecoJS | `pAnchor` | — | 87 × |

> *τ* **není totéž.** Časová konstanta *τ* se váže vztahem *t*<sub>1/2</sub> = *τ* · ln 2.
> Wiki dnes používá *T*<sub>1/2</sub> — sjednotit na *t*<sub>1/2</sub>.

> *R* **znamená dvě různé veličiny.** V §2 je *R* molární plynová konstanta
> (J·K⁻¹·mol⁻¹); zde, ve Schreinerově rovnici, je *R* rychlost změny tlaku
> (bar·min⁻¹). Rozlišuje je jen kontext, nikdy značka — každý vzorec s *R* musí mít
> kontext jednoznačný.

## 6. Zkratky

České potápěčské prostředí používá **anglické zkratky nepřeložené**; český opis se
uvádí při prvním výskytu.

| Zkratka | Český termín | English | V kódu (kanonicky) | Legacy alias, ponechat | Doloženo |
|---|---|---|---|---|---|
| NDL | bezdekompresní limit | no-decompression limit | — | — | — |
| MOD | maximální operační (provozní) hloubka | maximum operating depth | — | — | — |
| EAD | ekvivalentní vzduchová hloubka | equivalent air depth | — | — | — |
| DCS | dekompresní nemoc (též kesonová nemoc) | decompression sickness | — | — | — |
| CNS | toxicita centrálního nervového systému | CNS oxygen toxicity | — | — | — |
| OTU | jednotky kyslíkové toxicity | oxygen tolerance units | — | — | — |
| GF | gradientový faktor | gradient factor | — | — | — |
| SAC | spotřeba vzduchu na povrchu | surface air consumption | — | — | — |
| TTS / TDT | doba do vynoření / celková doba dekomprese | time to surface / total deco time | — | — | — |
| SI | povrchový interval | surface interval | — | — | — |
| EAN | obohacený vzduch (nitrox) | enriched air nitrox | — | — | — |

Další termíny: **kompartment** (přejaté, běžné), **sycení/nasycení tkáně**,
**vysycování**, **přesycení**, **inertní plyn**, **dekompresní zastávka**,
**bezpečnostní zastávka**, **rychlost výstupu**, **dusíková narkóza** (hovorově
*hloubkové opojení*), **kyslíková toxicita**, **M-hodnota**.

## 7. Špatně × správně

| ✗ Špatně | ✓ Správně | Proč |
|---|---|---|
| ✗ `20m`, `1,4bar` | `20&nbsp;m`, `1,4&nbsp;bar` | mezera povinná a nedělitelná (ÚJČ §785, §880) |
| ✗ `2.81 bar` (v češtině) | `2,81&nbsp;bar` | desetinná čárka |
| ✗ `10-20 m` | `10–20&nbsp;m` | pomlčka U+2013, ne spojovník |
| ✗ `-273,15 °C` | `−273,15&nbsp;°C` | minus U+2212 |
| ✗ `20°C` | `20&nbsp;°C` | mezera před °C |
| ✗ `20 ° C` | `20&nbsp;°C` | ale ne mezi ° a C |
| ✗ `℃` | `°C` | U+2103 je kompatibilní znak z CJK bloku |
| ✗ `<em>p</em>` | `<var>p</var>` | `<em>` nese větný důraz, ne význam veličiny |
| ✗ `P` (tlak) | *p* | ISO 80000-4, IUPAC, česká škola |
| ✗ `ppO2`, `CO2` | *p*<sub>O₂</sub>, CO₂ | ASCII index |
| ✗ `P_{amb}` (LaTeX) | `p_{\mathrm{amb}}` | index by se vysázel kurzívou |
| ✗ `T_{1/2}` | `t_{1/2}` | Bühlmannova notace |
| ✗ `t½` v HTML | `<var>t</var><sub>1/2</sub>` | U+00BD je kompatibilní znak, jako ℃ výše |
| ✗ `GF` kurzívou | GF stojatě | kurzíva se čte jako součin *G*·*F* |
| ✗ `5 mů`, `5 ms` | `5 m` | značky se neskloňují |

**Není chyba:**

- `12litrový` — správná česká složenina, ne chybějící mezera.
- `60°`, `17° 15′` — úhlový stupeň se připojuje **bez** mezery.
- `kPa` v kvízech — doslovná citace zadání SPČR.
- `32% nitrox` — přídavné jméno („dvaatřicetiprocentní"); `obsah je 32 %` je podstatné jméno.
