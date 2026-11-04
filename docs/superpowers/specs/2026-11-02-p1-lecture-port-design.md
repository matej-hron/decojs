# Port přednášky Fyzika P1 do DecoTheory — návrh

Datum: 2026-11-02 · Autor obsahu: Matej Hron (instruktor, přednáší CMAS P★/P★★) · Koordinace: Claude
Zdroj: `resources/FyzikaP12_2025.pptx` / `.pdf` (60 slidů). Analýza pokrytí: `coordinator-briefs/p1/report-kandidati.md`
(mimo repo, viz níže). Závazný log rozhodnutí: `~/.herdr/worktrees/decojs/coordinator-briefs/p1/decisions.md`.

## 1. Záměr a proč

Matej přednáší fyziku pro kurz P★/P★★ z PowerPointu. Chce přednášku **časem celou přesunout do DecoTheory**, aby
(1) na přednášce mohl místo statických slidů ukazovat živé modely a (2) studenti měli doma přesně ten obsah, který
slyšeli, plus modely a řešené příklady. Statické slidy dnes nechávají výsledky příkladů jen „nahlas“ a vztahy
(hloubka ↔ objem, teplota ↔ hustota) ukazují šipkami; model je ukáže pohybem.

Přesun probíhá **postupně po kapitolách**. PowerPoint zůstává záchranná síť: hybridní přednáška (hotové kapitoly
z webu, zbytek ze slidů) je v pořádku.

## 2. Kdo a jak to používá

| | Přednáška | Doma |
|---|---|---|
| Kdo | Matej u notebooku → projektor | student |
| Zařízení | landscape, 1280×720 až 1920×1080 | hlavně mobil na výšku (390×844) |
| Ovládání | **normálně** myší/klávesnicí; ← → a tlačítka ‹ › skáčou po slidech (žádný zvláštní režim) | prstem, posouváním |
| Potřeby | čitelnost z dálky, nic důležitého pod ohybem, odpovědi schované do odkrytí, rychlé otevření konkrétního příkladu | vysvětlení, příklady s kontrolou, návrat k látce |

Jeden obsah a **jeden model pro obojí** — rozložení se jen přizpůsobí šířce.

## 3. Cíle, ne-cíle, anti-cíle

**Cíle**
- Kapitoly v pořadí přednášky (od jednoduchého ke složitému), česky.
- Ke každé kapitole: text z přednášky (opravený), řešené příklady, vložené interaktivní modely.
- Do další přednášky (~23. 11. 2026) odpřednášitelné z webu kapitoly P★: Hustota, Tlak (+ Boyle), Spotřeba,
  Archimedes a vyvážení.

**Ne-cíle (teď)**
- Angličtina/španělština nových stránek (později).
- Speciální prezentační engine (zvláštní režim, skrývání obsahu, přechodové efekty), krokování klikrem, poznámky
  přednášejícího. Skok na předchozí a další slide ale je: stránka se dál normálně posouvá (viz §4, Navigace).
- P★★ témata (optika, zvuk, teplo), Dalton/Henry — po přednášce.
- END (rozhodnutí autora: v P1 ne).

**Anti-cíle (selhání, i kdyby to „fungovalo“)**
- Model, který učí špatnou fyziku kvůli zjednodušení, aniž by zjednodušení přiznal.
- Na projektoru nečitelné (drobné popisky, nutnost scrollovat uvnitř jedné myšlenky).
- Čísla, která nesedí s Matejovými příklady a testy SPČR (proto výchozí „školní“ čísla).
- Přetížení začátečníka Bühlmannem/M-values — P1 je vstupní brána, ne deco kurz.
- Kapitola, která přeskupí Matejův postup výkladu.

**Věrnost přednášce (autor: „nebuď moc kreativní“)**
- Obsah = to, co je v přednášce. Žádná nová témata, odbočky, zajímavosti navíc ani „vylepšení“ výkladu.
- „Více“ vysvětluje jen to, co slide říká (jak to Matej vykládá nahlas), stručně a věcně — žádné rozšiřování látky.
- Modely ukazují jen vztahy z přednášky, s co nejméně ovládacími prvky; žádné herní režimy, animace pro efekt
  ani ozdoby. Vizuálně střídmě, v duchu zbytku DecoTheory.
- Při pochybnosti: méně, a otázku napsat do REPORT.md.

## 4. Struktura

- Nová sekce **„Kurz P1 – Fyzika“**: rozcestník + kapitoly v pořadí přednášky:
  Hustota → Tlak → Stlačování plynů (Boyle, spotřeba) → Archimedes a vyvážení → Složení vzduchu a Dalton → Henry →
  (P★★) Vidění → Slyšení → Teplo.
- **Motivační otázky ze slidu 6** („Jak hluboko můžu? Jak dlouho tam můžu být? Jak dlouho mi vydrží vzduch? Jak rychle
  zpátky? Jak předcházet nehodám?“) jsou na rozcestníku. Každá se **„odemkne“** na konci kapitoly, kde ji student
  poprvé umí zodpovědět (rámeček „Teď už umíš odpovědět na…“). Otázky NEřídí pořadí kapitol.
- Kde existující stránka/sandbox téma už pokrývá (např. sycení → `sandbox/tissue-saturation.html`), kapitola odkáže,
  nepřepisuje.

### Navigace (schváleno autorem)
- Hlavní menu (`js/nav.js`): nová položka **„Kurzy“** mezi Home a Sandbox; podmenu obsahuje **jen kurzy** („P1 – Fyzika“
  vede na rozcestník), kapitoly ne (oprava 2026-11-04, kapitola nepatří na úroveň kurzu). Na stránkách kapitol zůstává
  „Kurzy“ zvýrazněné jako aktivní. Kapitoly jsou na rozcestníku v pořadí přednášky, nehotové jako „připravujeme“.
- V kapitole: bez obsahu sekcí a bez lišty (oprava 2026-11-04), jen patička slidu (viz §5), dole „← předchozí / další kapitola →“.
- Klávesy ← → a nenápadná tlačítka ‹ › skočí na předchozí a další zastávku (slide, „Procvič si“), i přes hranici
  kapitoly a rozcestníku (rozhodnuto 2026-11-04, `js/course/slideNav.js`). Šipky se nepoužijí, když patří posuvníku nebo
  poli, ani s modifikátorem a u modelu na celé obrazovce. Na telefonu tlačítka nejsou, tam se posouvá.
- Úvodní stránka (`index.html`): karta „Kurz P1 – Fyzika“.
- Modely P1 zatím NE v menu Sandbox. (Později možná Sandbox členěný podle kurzů — mimo rozsah.)

### Sdílená látka mezi kurzy (schváleno autorem)
Kurzy se překrývají (P2 použije tlak, Boyla… znovu, jen hlouběji). Proto se odděluje **pojem** od **kurzu**:
- **Pojem = sdílený blok výkladu** o jedné věci (např. „anomálie vody“, „hydrostatický tlak“), napsaný jednou na
  jednom místě. Obsahem je výklad pro „Více“.
- **Kurz = pořadí kapitol**; v kapitole je **jádro = slidy daného kurzu** (vlastní pro kurz) a pod „Více“ se
  **vloží (ne zkopíruje) sdílený blok pojmu**. Hlubší verze pro jiný kurz = další blok (např. „Boyle – pokročilé“).
- Modely jsou sdílené moduly stejně (vodní sloupec).
- Vkládání, ne odkazy (student doma neodskakuje). Musí fungovat offline (bloky v `sw.js`) a bez build kroku.
- Pilot postaví mechanismus a použije ho pro bloky kapitoly Hustota. Existující anglické stránky (`pressure.html` …)
  se zatím nesjednocují (jiná úroveň, jiný jazyk).

### Procvičování (schváleno autorem)
- Na konci kapitoly sekce **„Procvič si“**: vložené **ručně vybrané CMAS/SPČR otázky** podle ID z
  `data/quiz-physics.json` (kategorie jsou na kapitoly moc hrubé) + odkaz na celý kvíz. Využij existující
  `js/quiz.js`, kde to jde. Pro pilot např. otázka o teplotě u dna zamrzlého jezera 50 m.
- Vlastní otázky z látky: až po pilotu; musí být viditelně odlišené („DecoTheory“ vs. „SPČR“) a schválené Matejem.

## 5. Šablona kapitoly

1. Kapitola začíná **rovnou prvním slidem**, jako na přednášce (oprava 2026-11-04), navigační lišta není. Na každém slidu
   je stejná **patička** v rámečku: vlevo jméno přednášky „P1 – Fyzika“ (odkaz na Obsah), vpravo číslo slidu z přednášky
   (atribut `data-slide-number`; titulní slide a „Procvič si“ ho nemají) a tlačítka ‹ ›. Název slidu je nadpis.
   „Rozbalit všechny výklady“ je v řádku „Více“ vpravo. Nadpis prvního slidu je jediné `h1` stránky.

   **Pevná scéna (desktop):** všechny zastávky (titulní slide, slidy, modely, „Procvič si“) mají stejný rámeček, nadpis
   i začátek těla, přepnutí vypadá jako v PowerPointu. Zastávka = slide + řádek „Více“ a vyplní celou výšku pod
   hlavičkou webu (řádek zůstane prázdný, když „Více“ není), další slide tedy není vidět. Písmo závisí jen na okně. Rozměry jsou
   jedny v `css/course.css`, slide na nízkém okně smí narůst, obsah se neořezává. Telefon: normální tok, žádná pevná výška.
   **Styl slidů je jeden, Hladina** (přechod tyrkysová → tmavomodrá, nahoře vlnka, rozhodnuto 2026-11-04); přepínač se nestaví,
   světlý styl přibude, jen pokud Hladina neobstojí na projektoru v učebně. Kontrast textu aspoň 4,5:1, ovládání aspoň 3:1.
   Krátký úvod (proč to potápěč potřebuje) a **háčky dopředu** („tohle budeme potřebovat u tlaku a u vztlaku“) patří
   na začátek „Více“ pod prvním slidem. Jsou to text kapitoly, ne sdílený blok pojmu.
2. Výklad po sekcích ve **dvou vrstvách** (rozhodnutí autora):
   - **Jádro = text slidu** (opravený, téměř doslovně), vždy viditelné. To se promítá. **Na projektoru se jádro
     sekce vejde na jednu obrazovku** (landscape) — velké písmo a čísla, kontrast pro projektor ve světlém tématu.
   - **„Více“ = výklad na doma** — to, co Matej říká nahlas; ve výchozím stavu sbalené (na mobilu i projektoru
     stejně), rozbalí se klikem. Přepínač „Rozbalit všechny výklady“ je v řádku „Více“.
   - Stejný vzor rozbalování jako u odpovědí příkladů (bod 4) — jeden vzor na stránce; preferovat nativní
     `<details>`/`<summary>` (funguje offline i bez JS).
   - Text ve „Více“ píše builder → **Matej ho schvaluje před merge** (v PR vypsat všechny nové odstavce, nebo je
     dát do REPORT.md k revizi). Jádro nesmí měnit pořadí ani význam slidů.
3. **Jeden slide přednášky = jedna zastávka** (rozhodnuto 2026-11-04). **Model se otevírá z náhledu na svém slidu a není
   samostatná zastávka.** Náhled je tlačítko se skutečnými daty modelu a nápovědou „Otevřít model“. Klik otevře simulátor
   překryvem v rámečku slidu, zavírá se Esc, křížkem a klikem mimo. V simulátoru šipky slidy nepřepínají. Adresa
   `#model-…` otevře stránku se slidem a simulátorem, předvolby se načtou. „Více“ je pod slidem jedno.
4. **Řešené příklady** z přednášky: zadání viditelné, výsledek a postup **schované do odkrytí** (stejně na přednášce
   i doma). Kde to dává smysl, „spočítej sám“ s kontrolou.
5. Rámeček „Teď už umíš odpovědět na…“ (pokud kapitola nějakou otázku odemyká).
6. „Procvič si“: poslední slide kapitoly, sekce `#procvic` (přepínání slidů na ni míří z další kapitoly).
7. Odkaz na odpovídající kategorii kvízu fyziky (`data/quiz-physics.json` má kategorie mapující se na kapitoly, např.
   `vlastnosti-vody-vzduchu`, `tlak-jednotky`, `vztlak-vystroj`, `spotreba-planovani`).

## 6. Společné požadavky na modely

- **Předvolby v URL**: každý model (a každý příklad) jde otevřít přímým odkazem s nastavenými parametry, aby Matej
  mohl ze slidu / z rozcestníku skočit rovnou na ukázku. Využij existující `js/urlParams.js`, pokud sedí.
- **Offline**: vše v `sw.js` STATIC_ASSETS (DecoTheory je PWA; na přednášce nemusí být internet).
- **Školní vs. přesná čísla**: výchozí „školní“ režim jako přednáška (*p* = 1 + *h*/10 bar, ρ = 1 000 kg/m³,
  g = 10 m/s²) a přepínač „přesně“ (1,013 bar + *hρg*, slaná/sladká voda, nadmořská výška přes `js/deco/environment.js`).
  Pilot (hustota) ho nemusí mít, pokud nepočítá tlak.
- **Přiznaná zjednodušení**: model, který zjednodušuje (ilustrativní profil, idealizace), to říká jednou větou u modelu.
- **Vodní sloupec** (dlouhodobý koncept): svislý sloupec vody s osou hloubky, do kterého kapitoly přidávají vrstvy —
  teplota (Hustota), tlak + balónek/zvon (Tlak/Boyle), potápěč a vztlak (Archimedes), parciální tlaky (Dalton),
  sycení (Henry). Pilot postaví **znovupoužitelnou kostru** (osa hloubky, vykreslení sloupce, hladina/led, posuvník
  hloubky na mobilu i desktopu) jako modul; další kapitoly přidávají vrstvy, ne nové kopie.
- **Notace a slovníček veličin a jednotek jsou povinné, ne kosmetika** (v DecoTheory se to dlouho čistilo).
  Před psaním textu i UI přečti `.github/instructions/notation.instructions.md`, `docs/notation/style-guide.md`,
  `docs/notation/glossary.md` (a pro kontrolu `.github/skills/fixing-physics-notation/SKILL.md`):
  - každou veličinu a jednotku ber **ze slovníčku** (symbol, název, jednotka) — žádné vlastní varianty;
  - veličina, která ve slovníčku chybí, se do něj **přidá ve stejném commitu** (s odkazem na ISO 80000);
    pro pilot jistě **Celsiova teplota** (ISO 80000-5; slovníček má zatím jen termodynamickou *T*);
  - platí i pro popisky os grafů, posuvníků, tabulek a tooltipy v JS (kurzíva veličin, `&nbsp;`, desetinná čárka,
    záhlaví tabulek ve tvaru *veličina* / jednotka podle style-guide);
  - před PR projdi změny podle skillu fixing-physics-notation a výsledek uveď v PR.

## 7. Pilot: kapitola Hustota (slidy 8–9)

Proč pilot: nejmenší kapitola → nejlevněji ověří celý řetězec (šablona, čeština, projektor + mobil, offline, URL)
a postaví kostru vodního sloupce. Po pilotu Matej kapitolu vyzkouší na projektoru i v mobilu a šablona se upraví
dřív, než se rozjedou další kapitoly.

Obsah:
- Definice hustoty, tabulka látek ze slidu 8 (voda sladká 1 000, slaná 1 020–1 030, led 920, vzduch 1,25 → viz
  poznámka v §9, olovo 11 340, ocel 7 850 kg/m³).
- Háčky dopředu (ve „Více“ pod slidem 8): sladká vs. slaná voda → tlak; olovo vs. neopren vs. vzduch → vztlak.
- Teplotní závislost, anomálie vody (max. hustota při ~4 °C), led plave a izoluje, voda promrzá od hladiny.

Slide 9 je jedna zastávka se dvěma řadami text + náhled jako v přednášce; modely se otevírají z náhledů.

Modely:
1. **Hustota vody vs. teplota** — posuvník teploty (cca −5 až 30 °C, pod 0 °C led), křivka hustoty s bodem; maximum
   u 4 °C zřetelně; skok na led 917–920 kg/m³. Data: tabulková hustota vody (uveď zdroj v kódu).
2. **Jezero během roku** — podle GIFu ve slidu 9 (oprava 2026-11-04, nahrazuje dřívější profil po měsících): 9 fází po
   2 s, pět vrstev s teplotami z GIFu, vítr, strom, led. Hlavní věc je dynamika: přehrát/pozastavit, plynulé přechody,
   posuvník fází, předvolba `?faze=1..9`. Doplněk oproti GIFu: šipky „těžší voda klesá“ při přechodech 1→2, 2→3, 3→4,
   6→7, 7→8. Je to **schéma podle přednášky, ne měření**; čísla bez zdroje v přednášce (termoklina, teploty mimo GIF,
   hloubka) se nepoužívají. Obecně: když má slide animaci, model zachová její smysl.
- Řešený příklad (návrh builderu: „Kde pod ledem najdeš nejteplejší vodu?“) se schovanou odpovědí.
- Odkaz na kvíz kategorie `vlastnosti-vody-vzduchu`.

## 8. Harmonogram (do přednášky ~23. 11. 2026)

| Kdy | Co |
|---|---|
| 1. týden (do ~9. 11.) | Pilot Hustota + kostra vodního sloupce + rozcestník sekce; Matejova zkouška na projektoru a mobilu |
| 2. týden (do ~16. 11.) | Tlak (+ výška, Boyle: balónek, zvon, nebezpečí malých hloubek), Spotřeba, Archimedes a vyvážení — paralelně |
| 3. týden (do ~20. 11.) | Generálka s Matejem, opravy; Dalton/MOD pokud zbude čas; obsah zamknout 2 dny před přednáškou |
| po přednášce | Dalton, Henry, P★★ |

Otevřené rozhodnutí pro 2. týden: model vztlaku — tělo potápěče neutrální, nebo modelované (rozhodne Matej).

## 9. Opravy přednášky při portu

Při převodu textu rovnou opravit a v PR vypsat:
- překlepy: púsobící, oběm(u), rotože, hustotoa, abchom, provézt, větžího, řišího, Powel → Powell, Ruen → Rouen,
  Cannary → Canary, Marriotův → Mariottův;
- notace: `ppO2`/`p02`/`pN` → *p*<sub>O₂</sub>, *p*<sub>N₂</sub>; desetinná čárka; `&nbsp;` mezi číslem a jednotkou;
  „1.500 m/s“ → 1 500 m/s; `4°` → 4 °C;
- věcné: teplo — „1 kg vody … 3000×“ platí na objem (~3 500×), na hmotnost je to ~4×; vodivost vody ~23× vzduch
  (sjednotit 25×/30×); hustota vzduchu 1,25 kg/m³ je správně pro normální tlak a **10 °C** (tak to má i test
  SPČR v `data/quiz-physics.json`) — jen doplnit „při 10 °C“, hodnotu neměnit (navazuje na ni příklad s lahví);
- slide 40 je duplikát slidu 22 — neportovat dvakrát.
Opravy, které mění význam (ne překlepy), označ v PR, ať je Matej odsouhlasí.

## 10. Rozhodnuto autorem / koordinátorem

- Autor: pořadí kapitol zůstává; česky nejdřív; školní čísla výchozí; END ne; *p*<sub>N₂</sub> hranice ~4 bar (pásmo
  3–4) jako koncept; jeden model pro přednášku i doma; postupný přesun.
- Autor (2026-11-04): ← → a tlačítka přepínají slidy i přes hranici kapitoly. Upřesňuje dřívější „žádný prezentační
  režim“: nic se neskrývá, stránka se dál posouvá, zvláštní režim ani klikr nejsou potřeba.
- Koordinátor (Matej může přebít): sekce jako samostatná skupina stránek s rozcestníkem; modely jako JS moduly
  vložené v kapitole; pilot = Hustota; projektor ve světlém tématu.
- Koordinátor: **plán a stavba teď pokrývají jen 1. týden** (pilot Hustota + kostra vodního sloupce + rozcestník).
  Kapitoly 2. týdne dostanou vlastní krátké specifikace až po Matejově zkoušce pilotu; návrhy K1–K3 z analýzy jsou
  podklad, ne schválený návrh.
- Koordinátor: kostra vodního sloupce v pilotu má **zdokumentované rozhraní pro vrstvy** (jak vrstva přidá
  vykreslení a ovládání) a ukázkovou vrstvu „teplota“; zafixuje se před 2. týdnem, aby paralelní kapitoly mohly
  přidávat vrstvy bez kolizí.
- Koordinátor: **„odemykání“ otázek je jen prezentační** (statické): rozcestník vypíše otázky ze slidu 6 a u každé
  odkaz na kapitolu, která ji zodpoví (zatím „připravujeme“, pokud kapitola není hotová); kapitola má rámeček
  „Teď už umíš odpovědět na…“. Žádný stav per student, žádné localStorage.

## 11. Nechává se na builderovi

- Umístění souborů a URL sekce (např. adresář `p1/`), zařazení do `js/nav.js` (popisky přes i18n klíče; obsah
  stránek zatím jen česky — zvol, co se stane, když má uživatel UI v en/es, a napiš to do PR).
- Vizuální podoba (frontend-design skill), knihovna grafů (v repu je Chart.js), přesné rozložení vodního sloupce.
- Formát „spočítej sám“ a jak se odkrývá odpověď.
- Zdroj tabulkových dat hustoty vody.

## 12. Integrace a ověření

- Postup a pravidla: `coordinator-briefs/p1/common.md` (nové .js do `sw.js` STATIC_ASSETS + allow-list
  `.github/workflows/pages.yml`, verze, PR; merguje koordinátor).
- TDD pro výpočty (hustota z teploty, profily jezera, převody).
- Ověřit v Chrome: 390×844 na výšku, 1280×720 a 1920×1080 na šířku (projektor), světlé i tmavé téma, offline
  (po prvním načtení), přímé URL s předvolbou.
