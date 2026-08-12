# Pravidla zápisu fyzikálních veličin

Proč značky vypadají tak, jak vypadají. Seznam značek je v [`glossary.md`](glossary.md),
technický zápis v `authoring.md`.

Tento dokument je určen stejnou měrou garantovi jako agentovi, který upravuje kód. Každé
tvrzení má u sebe zdroj, který lze ověřit — pokud zdroj chybí, je tvrzení označeno jako
**rozhodnutí projektu**, ne jako požadavek normy. Tyto dvě věci se v textu nikdy nemíchají.

## 1. Odkud pravidla plynou

| Norma | Co určuje |
|---|---|
| ČSN EN ISO 80000-1 (01 1300), ed. 10/2023, kap. 7 | kurzíva vs. stojaté písmo, indexy, násobení |
| ČSN EN ISO 80000-4, -5, -9 | značky pro mechaniku, termodynamiku, fyzikální chemii |
| ČSN 01 6910:2014 | česká úprava písemností — mezery, čárka, pomlčka |
| ÚJČ, Internetová jazyková příručka | veřejně dostupný výklad téhož |

Plné texty ČSN jsou placené — nelze je tady citovat doslovně ani na ně odkázat plným
zněním. **Závaznou normou zůstává ČSN**, ne dokumenty citované níže. Česká agentura pro
standardizaci (ČAS) ve svém veřejném přehledu normy ČSN EN ISO 80000-1 potvrzuje, co norma
obsahuje:

> „Rozsáhlá kapitola 7 podává typografická pravidla pro zápis veličin a jednotek, příloha
> B pak pravidla pro zaokrouhlování."
> — Česká agentura pro standardizaci, přehled normy ČSN EN ISO 80000-1 (viz [Prameny](#prameny), č. 1)

Protože samotné znění kapitoly 7 nemáme k dispozici, doslovná pravidla níže citujeme ze
dvou veřejně dostupných zdrojů, ne z ČSN samotné:

- **NIST SP 811** (2008), kap. 7 a 10 — americký průvodce soustavou SI, obsahově shodný
  s ISO 80000-1 v otázce kurzívy, stojatého písma a indexů. Ověřeno proti aktuálnímu
  webovému znění NIST k datu psaní tohoto dokumentu.
- **Internetová jazyková příručka (IJP)** Ústavu pro jazyk český AV ČR — veřejná
  interpretace ČSN 01 6910, kterou vede tentýž ústav, jenž se na tvorbě ČSN 01 6910 podílel.

Jinými slovy: **NIST se necituje jako náhrada ČSN**, ale jako doložitelné znění téhož
pravidla, protože ČSN samotnou nelze odkazem zpřístupnit. Kde se NIST a ČSN případně liší
v detailu, platí ČSN — na to ale v textu níže nenarazíme, protože citované pasáže jsou
obecná typografická pravidla společná oběma normám (ISO 80000 je základ, ze kterého NIST
SP 811 vychází).

## 2. Kurzíva vs. stojaté písmo

### 2.1 Co říká norma — a čím to dokládáme

> „Quantity symbols, which are always printed in **italic** (that is, sloping) type, are,
> with few exceptions, single letters of the Latin or Greek alphabets that may have
> subscripts or superscripts or other identifying signs."
> — NIST SP 811, §10.1

> „— symbols for **quantities and variables**: italic
> — symbols for **units**: roman"
> — NIST SP 811, §10.2

Tedy: **značka veličiny se sází kurzívou** (*p*, *T*, *V*), **značka jednotky stojatě**
(bar, m, Pa). V DecoJS to znamená element `<var>` pro veličinu (technicky v `authoring.md`)
a obyčejný text pro jednotku.

### 2.2 Rozhodovací tabulka

Tabulka je obecná — kategorie podle ISO/NIST, ne konkrétní veličiny DecoJS (ty jsou
v `glossary.md` §1–§5). Příklady níže jsou ilustrační, včetně dvou, které se v DecoJS
vůbec nevyskytují (Avogadrova konstanta, Σ), protože ukazují pravidlo v jeho obecné podobě.

| Kategorie | Písmo | Příklady |
|---|---|---|
| Značka veličiny / proměnné | **kurzíva** | *p*, *T*, *t*, *V* |
| Značka jednotky | **stojatě** | bar, Pa, m, min |
| Předpona SI | **stojatě** | k (kilo), M (mega), μ (mikro) |
| Popisný dolní index (zkratka slova, jméno osoby, částice) | **stojatě** | *p*<sub>amb</sub>, *N*<sub>A</sub> (Avogadrova konstanta) |
| Index, který je sám veličinou | **kurzíva** | *c*<sub>*p*</sub> (tepelná kapacita při stálém tlaku) |
| Běžící index / proměnná | **kurzíva** | *p*<sub>*i*</sub>, Σ<sub>*i*</sub> *x*<sub>*i*</sub> |
| Značka chemického prvku | **stojatě** | N₂, O₂, He |
| Číslicový index | **stojatě** | *V*<sub>1</sub>, *M*<sub>0</sub> |
| Matematická konstanta | **stojatě** | e, π |
| Matematický operátor / funkce | **stojatě** | d, Δ, ln, sin |
| Vektorová veličina | **tučná kurzíva** | ***v***, ***F*** |
| Číselné hodnoty | **stojatě** | 5; 1,5; 3,14 |
| Víceznaková zkratka jako veličina | **stojatě** (§2.4) | GF, SAC, MOD |

### 2.3 Nejobtížnější pravidlo — indexy

Toto pravidlo je jádrem celé oponentovy výtky (garant #61) i nejčastější chybou v projektu.
Zaslouží si nejpodrobnější zacházení, protože je to jediné pravidlo, kde na první pohled
podobné zápisy (*p*<sub>t</sub> vs. *c*<sub>*p*</sub>) mají opačné písmo indexu.

Doslovné znění:

> „These rules imply that a subscript or superscript on a quantity symbol is in **roman**
> type if it is **descriptive** (for example, if it is a number or represents the name of
> a person or a particle); but it is in **italic** type if it represents a **quantity**, or
> is a **variable** such as *x* in *E*<sub>*x*</sub> or an **index** such as *i* in
> ∑<sub>*i*</sub>*x*<sub>*i*</sub> that represents a number."
> — NIST SP 811, §10.2

IUPAC (Mills & Metanomski, *On the Use of Italic and Roman Fonts for Symbols in Scientific
Text*, IUPAC IDCNS) dodává praktický test, který je snazší si zapamatovat než formální
znění. Samotný Green Book (3. vyd., §1.6) nebyl pro tento citát ověřen z prvního zdroje —
plný text je jen v placené/vázané podobě mimo běžný webový přístup. Citát níže je doslovný
z IDCNS poznámky, která sama uvádí, že shrnuje pravidlo z Green Booku (str. 5–6); ověřen byl
z archivované kopie (`old.iupac.org` vrací pro automatizované dotazy 403, proto přes
Wayback Machine — viz [Prameny](#prameny), č. 6), ne z živé stránky ani z Green Booku
samotného:

> „A good general rule is that **quantities, or variables, can be given a value, but labels
> cannot**."

**Aplikace testu:**

| Zápis | Co index znamená | Test | Písmo |
|---|---|---|---|
| *p*<sub>amb</sub> | „amb" = zkratka slova *ambient* | štítek, nelze mu přiřadit hodnotu | stojatě |
| *p*<sub>N₂</sub> | chemická značka | štítek | stojatě |
| *c*<sub>*p*</sub> | „p" = **tlak**, tedy veličina | lze přiřadit hodnotu (např. 1&nbsp;bar) | **kurzívou** |
| *a*<sub>*i*</sub> | „i" = číslo kompartmentu, běžící index | lze přiřadit hodnotu (1, 2, 3…) | **kurzívou** |

Past, na kterou test přesně cílí: *p*<sub>t</sub> (tkáňový tlak — „t" = *tissue*, popisný
štítek → stojatě) vs. *c*<sub>*p*</sub> (index „p" = tlak, veličina → kurzívou). Vzhledově
jde o jedno písmeno na stejném místě zápisu; rozhoduje výhradně **význam**, ne podoba.
Úplná aplikace pravidla na všechny veličiny DecoJS je v `glossary.md` §1 a §3.

**Jazyk popisného indexu je věc projektu, ne normy.** ISO/NIST určují jen písmo (stojaté),
mlčí o tom, v jakém jazyce se popisný index píše. DecoJS proto lokalizuje popisné indexy
(*p*<sub>celk</sub> česky, *p*<sub>tot</sub> anglicky), zatímco chemické indexy (O₂, N₂, He)
se nepřekládají nikdy — to je rozhodnutí projektu, podrobně v `glossary.md` §3, ne
požadavek žádné z citovaných norem.

### 2.4 Víceznakové zkratky (GF, SAC, MOD…)

ČSN EN ISO 80000-1, kap. 7, staví na tom, že značky veličin jsou zpravidla **jednopísmenné**
znaky latinské nebo řecké abecedy (viz citace NIST SP 811 §10.1 v §2.1 výše — „single
letters… that may have subscripts"). GF, SAC, MOD, NDL a OTU proto stojí mimo tento formální
systém: nejsou to značky jedné veličiny, ale zkratky sousloví.

Kdyby se sázely kurzívou, čtenář by je přečetl jako **součin** jednopísmenných proměnných —
GF jako *G*·*F*, SAC jako *S*·*A*·*C*. To je důvod, proč se víceznakové zkratky sázejí
stojatě: stejné pravidlo, obráceně použité. (N. Higham ve svém rozboru ISO 80000
o víceznakových zkratkách nepíše — probírá jednopísmenné konstanty jako e a i; jeho text
je v Pramenech uveden jako obecný kontext k italice/stojatému písmu podle ISO, ne jako
zdroj tohoto konkrétního argumentu.)

> **Sázej víceznakové zkratky stojatě:** GF, GF<sub>low</sub>, GF<sub>high</sub>, SAC, MOD,
> NDL, EAD, OTU, TDT, CNS.

## 3. Velikost písmen — kde nesmíme chybovat

### 3.1 Jednotky

Velké písmeno **jen u jednotek odvozených od jmen osob**:

> „Velkými písmeny se např. označují všechny jednotky pocházející z vlastních jmen, i když
> jejich plná forma je psána s písmenem malým: 230 V (voltů), 75 W (wattů), 9,81 N
> (newtonů)… Velké *M* (mega-) je označení pro miliontý násobek fyzikální jednotky, malé
> *m* (mili-) pro její tisícinu."
> — Internetová jazyková příručka ÚJČ, §785

Praktické důsledky pro DecoJS:

| Správně | Špatně | Proč |
|---|---|---|
| bar | Bar, BAR | bar **není** odvozen od jména osoby |
| kPa | KPa | k = kilo, malé |
| MPa | mPa | mPa = **milipascal**, 10⁹× menší než MPa |
| K | k | K = kelvin (osoba: Kelvin), k = kilo |
| m, s, kg, mol, min | M, S, KG | metr, sekunda, kilogram… nejsou od osob |

**Litr:** `l` i `L` jsou obě mezinárodně platná (16. CGPM, rezoluce 6, 1979). DecoJS volí
`l` — potvrzuje to česká praxe i stávající obsah kvízů (`15&nbsp;l`, `87,5&nbsp;l/min`); volba `l`
místo `L` je tedy rozhodnutí projektu v rámci povolené volnosti, ne požadavek normy.

### 3.2 Veličiny — záměna velikosti písmene mění význam

| Malé | Význam | Velké | Význam |
|---|---|---|---|
| *p* | tlak | *P* | výkon |
| *t* | čas / Celsiova teplota | *T* | termodynamická teplota (K) |
| *v* | rychlost | *V* | objem |
| *m* | hmotnost | *M* | molární hmotnost / M-hodnota |
| *n* | látkové množství | *N* | počet částic |

Tohle není typografická konvence, kterou lze bez následků porušit — záměna velikosti
písmene zamění jednu fyzikální veličinu za jinou. Volba malého *p* pro tlak je podrobně
zdůvodněná v [Rozhodnutí projektu](#rozhodnutí-projektu) níže.

### 3.3 Kolize *t* = čas × *t* = Celsiova teplota

Česká i mezinárodní konvence používají *t* pro obojí — čas i Celsiovu teplotu. ISO 80000-5
připouští pro Celsiovu teplotu alternativní symbol **ϑ** (vartheta), aby se kolizi předešlo.

**Rozhodnutí projektu:** v DecoJS je *t* **vždy čas** — dominantní použití napříč projektem
je doba ponoru a poločasy tkání. Teplota se píše buď *T* (termodynamická, v K), nebo se
vypisuje slovem s jednotkou (`20&nbsp;°C`). Symbol ϑ se nezavádí — přidal by čtenáři
nutnost učit se nový znak kvůli veličině (teplota vody), která se v DecoJS téměř vždy
uvádí jako vstupní hodnota, ne jako výsledek vzorce.

## 4. Česká typografická pravidla (ČSN 01 6910 / ÚJČ)

### 4.1 Mezera mezi číslem a jednotkou — povinná a nedělitelná

> „Značky se od číselné hodnoty oddělují mezerou, číslo a značka se umísťují na stejný
> řádek, např. 10 ha, 3 kg, 14 %, 100 kWh, rychlost 50 km/h, teplota 12–15 °C."
> — Internetová jazyková příručka ÚJČ, §785

> „Řádek nemá být zalomen … mezi číslem a značkou, např. 50 %, § 23 … mezi číslem
> a zkratkou počítaného předmětu nebo písmennou značkou jednotek a měn, např. 5 str.,
> 8 hod., 100 m², 10 kg, 16 h, 19 °C, 1 000 000 Kč … [vkládáme] místo běžné mezislovní
> mezery mezeru pevnou."
> — Internetová jazyková příručka ÚJČ, §880

NIST SP 811 formuluje totéž pravidlo v §7.2 a přidává výjimku, kterou má i čeština:
**úhlový stupeň, minuta a vteřina se připojují bez mezery.** Doslovně: „The only exceptions
to this rule are for the unit symbols for degree, minute, and second for plane angle:
°, ′, and ″ … in which case no space is left between the numerical value and the unit
symbol." (NIST SP 811, §7.2)

| Zápis | Verdikt |
|---|---|
| ✗ `40m`, `1,4bar`, `20°C` | mezera chybí |
| `40&nbsp;m`, `1,4&nbsp;bar`, `20&nbsp;°C` | ✅ mezera nedělitelná |
| `60°`, `17° 15′` (úhel) | ✅ bez mezery — výjimka |
| ✗ `20 ° C` | mezera navíc mezi ° a C |

**Kterou nedělitelnou mezeru píšeme.** Norma (ani ÚJČ) nepředepisuje konkrétní Unicode
znak, jen požaduje, aby mezera byla **pevná** (nedělitelná). DecoJS proto v autorském textu
používá entitu **`&nbsp;`** (U+00A0) — v repozitáři je to už dnes zavedený vzor (67×
existujících výskytů), zatímco jiná nedělitelná mezera se v projektu nepoužívá ani jednou.
Volba entity místo doslovného znaku je záměrná: doslovný U+00A0 je v diffu neviditelný
a editor ho snadno rozbije. Mechanika psaní (`&nbsp;` v HTML, KaTeX ekvivalent, Unicode
tabulka) je v `authoring.md`.

**Past, na kterou tady upozorňujeme, protože ji fáze 1 výzkumu doporučovala a je to
špatně:** existuje i jiný kandidát na nedělitelnou mezeru, úzká nedělitelná mezera
U+202F, kterou preferuje SI Brochure z typografických důvodů (užší proklad). **DecoJS ji
nepoužívá jako autorský znak** — je to jen typografické vylepšení, ne požadavek ÚJČ ani
ČSN, a v repozitáři nemá žádnou oporu (0 výskytů). U+202F má navíc vlastní past na opačné
straně řetězce: `Intl.NumberFormat` s `cs-CZ` ho sám generuje jako oddělovač tisíců, což
umí rozbít `parseFloat` a porovnávání řetězců v testech. To je ale otázka zpracování čísel
za běhu, ne autorského zápisu — řeší ji `authoring.md`, ne tento dokument.

### 4.2 Desetinný oddělovač a členění

> „Pokud zvolíme zápis čísel pomocí číslic, oddělujeme trojice řádů před a za desetinnou
> čárkou mezerami… 6 378 km; 30 000 let; 11 430,5 l; 3,536 2 kg… PČP umožňují psát
> čtyřciferná čísla bez mezery (4256 km, 2000 slov). Letopočty se nikdy nečlení. Před
> desetinnou čárkou ani za ní mezera není."
> — Internetová jazyková příručka ÚJČ, §791

| Jazyk | Desetinný oddělovač | Oddělovač tisíců |
|---|---|---|
| čeština (DecoJS CZ) | **čárka** — `1,4&nbsp;bar` | mezera — `1 000&nbsp;kPa` |
| angličtina | ✗ tečka (jiná konvence, ne pro CZ obsah) | čárka |
| španělština | čárka (shodně s češtinou) | mezera / tečka |

✗ `2.81 bar` v českém textu (tečka) — ✅ `2,81&nbsp;bar` (čárka).

### 4.3 Rozsahy — pomlčka, ne spojovník

> „V případě, že jsou oba výrazy oddělené pomlčkou jednoslovné, píšeme pomlčku bez mezer,
> např. otevírací doba 8–16 h."
> — Internetová jazyková příručka ÚJČ, §165

| Zápis | Verdikt |
|---|---|
| `10–20&nbsp;m` (pomlčka U+2013, bez mezer, pak nedělitelná mezera + jednotka) | ✅ |
| ✗ `10-20 m` (spojovník U+002D místo pomlčky) | špatně |
| ✗ `10 – 20 m` (pomlčka s mezerami u číselného rozsahu) | špatně |
| `hloubka 30&nbsp;m – hladina` (víceslovný člen, s mezerami) | ✅ |

### 4.4 Znaménko minus

> „Vyjadřují-li znaménka + nebo − kladnou nebo zápornou hodnotu čísla, přiléhají k číslici
> bez mezer: +24 °C, −273,15 °C."
> „S mezerami píšeme znaky pro sčítání, odčítání, násobení a dělení v matematických
> operacích: 3 + 5 − 2 = 6, 20 × 5 = 100."
> — Internetová jazyková příručka ÚJČ, §785

Správný znak je **− U+2212** (`&minus;`), ne spojovník `-` (U+002D) a ne pomlčka `–`
(U+2013). IJP sama dodává, že záměna je tolerovaná jen v korespondenci, ne v odborném
textu:

> „Podle ČSN 01 6910 je v korespondenci dovoleno znak minus (−) nahradit pomlčkou (–)
> a znak krát (×) malým písmenem x."
> — Internetová jazyková příručka ÚJČ, §785

### 4.5 Násobení

- **×** (U+00D7) — v aritmetice a rozměrech: `20 × 5 = 100`, `3&nbsp;m × 4&nbsp;m`
- **·** (U+00B7) — v součinech veličin: *p* = *ρ*·*g*·*h*
- **·** (U+00B7) — ve složených značkách jednotek vzniklých násobením: `5&nbsp;g·m⁻³`
- `*` a písmeno `x` — nikdy v odborném textu (jen v korespondenci, viz §4.4)

Tyto dva případy s tečkou na střední výšce dokládají dvě různé kapitoly NIST SP 811, ne
jedna — jde o odlišná pravidla, každé s jiným rozsahem platnosti.

**Součin značek jednotek** (`5&nbsp;g·m⁻³`) řídí kapitola 6, ne kapitola 10 — a tady je tečka
upřednostněna bezpodmínečně, nezávisle na desetinné čárce vs. tečce:

> „Symbols for units formed from other units by multiplication are indicated by means of
> either a half-high (that is, centered) dot or a space. However, this Guide… prefers the
> half-high dot because it is less likely to lead to confusion."
> — NIST SP 811, §6.1.5

**Součin značek veličin** (*p* = *ρ*·*g*·*h*) řídí §10.5.4, konkrétně jeho poznámka 2, která
tečku na střední výšce výslovně povoluje jako jeden ze způsobů zápisu:

> „The multiplication of quantity symbols (or numbers in parentheses or values of
> quantities in parentheses) may be indicated in one of the following ways: *ab*, *a b*,
> *a*·*b*, *a* × *b*."
> — NIST SP 811, §10.5.4, poznámka 2

Pozor, §10.5.4 samotné (hlavní text i poznámka 1) se týká násobení **čísel a hodnot
veličin**, ne značek jednotek — a v tomto případě NIST dokonce preferuje křížek (×), i
v prostředí s desetinnou čárkou:

> „When the comma is used as the decimal marker, the preferred sign for the multiplication
> of numbers is the half-high dot. However, even when the comma is so used, this Guide
> prefers the cross for the multiplication of values of quantities."
> — NIST SP 811, §10.5.4, poznámka 1

§10.5.4 tedy **nelze** použít jako důvod pro tečku u `5&nbsp;g·m⁻³` — to je věc §6.1.5.
Případná záměna těchto dvou kapitol byla chyba v dřívější verzi tohoto dokumentu.

### 4.6 Procenta — mezera mění význam

> „14 % = 14 procent… V případě, že pomocí číslice a značky vyjadřujeme přídavné jméno,
> mezeru nevkládáme: 20% = 20procentní, dvacetiprocentní."
> — Internetová jazyková příručka ÚJČ, §785

| Zápis | Čte se | Použití |
|---|---|---|
| `obsah kyslíku je 32&nbsp;%` | „třicet dva procent" | ✅ podstatné jméno |
| `32% nitrox` | „dvaatřicetiprocentní" | ✅ přídavné jméno |
| `GF 30/70` | bez % | ✅ dvojice, žádné pravidlo o % se neuplatní |

### 4.7 Skloňování značek

> „V textu se značky užívají obvykle ve spojení s číselnou hodnotou… V ostatních
> případech se značky vypisují: Bude třeba několik metrů látky."
> — Internetová jazyková příručka ÚJČ, §785

Značky se **nikdy neskloňují ani nepřechylují**: ✗ `5 mů`, `5 ms` — správně `5&nbsp;m`. Bez
číslovky se slovo vypisuje: „v hloubce několika metrů".

**Dvě věci, které vypadají jako chyba a nejsou — nezasahujte do nich:**

- `12litrový přístroj` je **správná česká složenina**, ne chybějící mezera. Číslice a
  přídavné jméno se tu píšou dohromady stejně jako `20%` v §4.6 výše (`20 % =`
  20procentní). Toto je stejné pravidlo IJP §785, jen na jiné jednotce.
- `kPa` v kvízech je **doslovná citace** oficiálního zadání SPČR a zůstává. Kvízy jsou
  interaktivní verze reálných zkušebních otázek; přepis jednotky by změnil citaci.

## Rozhodnutí projektu

Čtyři sporné body, kde existuje víc než jedna rozumná konvence. Každý je psán jako
alternativy → volba → důvod, aby měl garant s čím polemizovat — ne jako hotový verdikt.

### 1. Malé *p* pro tlak

Existují dva vzájemně neslučitelné autoritativní systémy:

| Systém | Značka | Zdroj | Použití |
|---|---|---|---|
| Fyzikální chemie / ISO | malé ***p*** | IUPAC Gold Book, ISO 80000-4/-9 | fyzika, chemie, česká škola |
| Respirační fyziologie | velké **P** | Pappenheimer et al. (1950), *Federation Proceedings* 9(3):602–605 | medicína, plicní fyziologie |

Pappenheimerova konvence je vnitřně konzistentní třípatrový systém: velká **P/V/F/Q** +
kapitálkový index místa (I = inspired, A = alveolar, a = arterial) + chemický druh. Odtud
*P*<sub>A</sub>O₂, *F*<sub>I</sub>O₂. Použít velké *P* **bez** zbytku tohoto aparátu — jen
jako izolovanou náhradu za malé *p* — je nekonzistentní: čtenář dostane půl systému.

**Volba: DecoJS používá malé *p* pro všechny tlaky včetně parciálních.** Odpovídá to ISO
80000, IUPAC i české školní fyzice. Garant sám v [issue #61](https://github.com/matej-hron/decojs/issues/61)
píše, co by na univerzitě i ve škole použil on sám (citace doslovná, bez úprav, jeho
zápis `pcelk = pO2 + pN2` je prostý text bez formátování — na kurzívu a index ho
převádíme až v `glossary.md` a v kódu):

> „…bych použil to, co se u nás ve škole i na universitě používá: **pcelk = pO2 + pN2** —
> jen nevím, zda jde pro malé nápisy použít Dolní index, tady úplně ne."
> — Jiří Hovorka, recenze 17. 6. 2026 (issue #61)

Po převodu do zápisu podle §2 tohoto dokumentu: *p*<sub>celk</sub> = *p*<sub>O₂</sub> +
*p*<sub>N₂</sub>.

Pappenheimerovu notaci (*F*<sub>I</sub>O₂ apod.) DecoJS použije jen v případném ryze
fyziologickém výkladu, a to s explicitní poznámkou, že jde o jiný, medicínský systém.

### 2. *p*<sub>O₂</sub> kanonicky, `ppO₂` hovorově

Projekt dnes používá `ppO₂` v UI řetězcích (`locales/*.json`) i v JS (`sandbox/index.html`).
Anglické a španělské stránky (a ojediněle i české vysvětlivky u kvízů) dnes používají
zápis *p*O₂ bez formátovaného indexu — stejná veličina má tedy v projektu víc než jeden
zápis, ne čistě podle jazyka, ale podle vrstvy (UI vs. vysvětlivky).

**Volba: kanonický zápis je *p*<sub>O₂</sub>** — kurzívní *p*, stojatý index O₂ včetně
číslice. `ppO₂` zůstává povoleno jen jako **hovorové potápěčské synonymum** (varovné
hlášky, popisky grafů), musí být v `glossary.md` uvedeno jako synonymum a **nesmí se
objevit ve vzorci**. Důvod je dvojí: sjednocuje zápis napříč UI a vysvětlivkami a reaguje
přímo na garantovu žádost v issue #61 o čitelný index v malých popiscích.

### 3. *t*<sub>1/2</sub> pro poločas

Bühlmann ve své vlastní notaci (*Halbwertszeit*) používá *t*<sub>1/2</sub>. Wiki dnes
používá `T_{1/2}` (velké *T*, navíc kurzívou vysázený index v LaTeXu, viz past v §2.3 —
index „1/2" je číslo, tedy popisný, měl by být stojatě).

***τ* (tau) je jiná veličina** — časová konstanta, vázaná vztahem *t*<sub>1/2</sub> =
*τ* · ln 2 — a nelze ji s *t*<sub>1/2</sub> zaměňovat.

**Volba: *t*<sub>1/2</sub>** — malé kurzívní *t*, stojatý číselný index. Používáme
Bühlmannovu vlastní notaci místo vlastního novotvaru; sjednotit i ve wiki.

### 4. Jednotky projektu

Zdrojové materiály se rozcházejí: Chapmanův text (`resources/decompression-theory.txt`)
používá ATM a stopy, česká CMAS skripta (`resources/FyzikaP12_2025.txt`) kPa/MPa/bar,
projekt dosud bar a metry.

**Volba (potvrzení stávající praxe): primární jednotky bar (tlak), m (hloubka), min (čas),
l (objem), °C (teplota).** kPa se ponechává v kvízech, protože tak jsou formulovány
oficiální otázky SPČR — jde o citaci zadání, ne o nekonzistenci (viz §4.7 poznámka výše).

## Prameny

1. ČSN EN ISO 80000-1 (01 1300), ed. 10/2023 — Česká agentura pro standardizaci, katalog:
   <https://csnonline.agentura-cas.cz/Detailnormy.aspx?k=516771>; přehled ČAS „Normy
   k uvádění veličin a jednotek" (zdroj citátu o kapitole 7):
   <https://agenturacas.gov.cz/produkty-a-sluzby/reprodukce-csn/o-vybranych-normach/normy-k-uvadeni-velicin-a-jednotek/>
2. ČSN EN ISO 80000-4 (mechanika): <https://www.technicke-normy-csn.cz/csn-en-iso-80000-4-011300-158638.html>;
   ČSN EN ISO 80000-5 (termodynamika): <https://www.technicke-normy-csn.cz/csn-en-iso-80000-5-011300-158642.html>;
   ČSN EN ISO 80000-9 (fyzikální chemie) — stejná řada, stejný vydavatel.
3. ČSN 01 6910:2014, Úprava dokumentů zpracovaných textovými procesory — ÚJČ AV ČR:
   <https://ujc.cas.cz/en/expertni-cinnost/czech-national-standard-csn-01-6910-version-2014/>
4. NIST SP 811 (2008), *Guide for the Use of the International System of Units*, kap. 6
   „Rules and Style Conventions for Printing and Using Units" (§6.1.5):
   <https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-6-rules-and-style-conventions-printing-and-using>;
   kap. 7 „Rules and Style Conventions for Expressing Values of Quantities":
   <https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-7-rules-and-style-conventions-expressing-values>;
   kap. 10 „More on Printing and Using Symbols and Numbers" (§10.1, §10.2, §10.5.4):
   <https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-10-more-printing-and-using-symbols-and-numbers>
5. Internetová jazyková příručka ÚJČ AV ČR — §785 „Značky, čísla a číslice":
   <https://prirucka.ujc.cas.cz/?id=785>; §880 „Nevhodné výrazy na konci řádků":
   <https://prirucka.ujc.cas.cz/?id=880>; §791 „Členění čísel… a desetinná čísla":
   <https://prirucka.ujc.cas.cz/?id=791>; §165 „Pomlčka": <https://prirucka.ujc.cas.cz/?id=165>
6. IUPAC Green Book, 3. vyd. (2007), §1.6 — obecná reference, primární text nebyl pro citát
   v §2.3 ověřen z prvního zdroje (dostupný jen v placené/vázané podobě): volně dostupný
   odkaz <https://iupac.org/what-we-do/books/greenbook/> (zrcadlo:
   <https://archive.org/details/QuantitiesUnitsAndSymbolsInPhysicalChemistry3RdEdRscIupac2007>).
   Citát „value vs. label" v §2.3 je doslovně z Mills I. M., Metanomski W. V., *On the Use
   of Italic and Roman Fonts for Symbols in Scientific Text*, IUPAC IDCNS — tato poznámka
   sama uvádí, že shrnuje Green Book str. 5–6. Živá stránka `old.iupac.org` vrací pro
   automatizované dotazy 403; citát byl ověřen z archivované kopie:
   <https://web.archive.org/web/20200121182850/http://old.iupac.org/standing/idcns/italic_roman.html>
   — tedy přes sekundární/archivní cestu, ne přímým čtením Green Booku.
7. N. Higham, „Typesetting Mathematics According to the ISO Standard" (2016) — obecný
   kontext k italice/stojatému písmu podle ISO 80000-2 (jednopísmenné konstanty *e*, *i*),
   necituje se jako zdroj argumentu o víceznakových zkratkách v §2.4:
   <https://nhigham.com/2016/01/28/typesetting-mathematics-according-to-the-iso-standard/>
8. 16. CGPM (1979), rezoluce 6 (litr `l`/`L`): <https://www.bipm.org/en/committees/cg/cgpm/16-1979/resolution-6>
9. Pappenheimer J. R. et al. (1950), „Standardization of definitions and symbols in
   respiratory physiology", *Federation Proceedings* 9(3):602–605:
   <https://europepmc.org/abstract/MED/14784074>
10. SI Brochure, 9. vyd. (BIPM, 2019) — zdroj preference úzké mezery U+202F pro dělení
    číslic, zmíněné v §4.1 jako past, kterou DecoJS nepoužívá:
    <https://www.bipm.org/documents/20126/41483022/SI-Brochure-9.pdf>
11. GitHub issue [#61](https://github.com/matej-hron/decojs/issues/61) — garantova recenze,
    Jiří Hovorka, 17. 6. 2026 (zdroj rozhodnutí v §2.3 a v [Rozhodnutí projektu](#rozhodnutí-projektu) č. 1–2).
12. `docs/notation/_research-source.md` — fáze 1 rešerše, ze které tento dokument čerpá;
    smazána v pozdějším kroku plánu, viz poznámka v jejím záhlaví.
13. IUPAC Gold Book (*Compendium of Chemical Terminology*), heslo „pressure, p":
    <https://goldbook.iupac.org/terms/view/P04819> (doi: 10.1351/goldbook.P04819) — jiná
    publikace než Green Book v položce 6 výše. `goldbook.iupac.org` vrací pro automatizované
    dotazy 403; obsah hesla ověřen přes archivovanou kopii:
    <https://web.archive.org/web/20231004174031/https://goldbook.iupac.org/terms/view/P04819>.
    Zdroj rozhodnutí v [Rozhodnutí projektu](#rozhodnutí-projektu) č. 1 (malé *p* pro tlak).
