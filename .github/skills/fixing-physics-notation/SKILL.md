---
name: fixing-physics-notation
description: Use when correcting, auditing, or reviewing how physical quantities are written on a DecoJS page or section — italic symbols, subscripts, non-breaking spaces, decimal commas, units, uppercase vs lowercase p — or when the garant/školitel has flagged notation problems, or before sending a page for academic review. Also use when asked to "opravit zápis veličin", "sjednotit značení", or to produce a report of notation fixes.
---

# Oprava zápisu fyzikálních veličin

Závazná pravidla jsou v repu — **čti je, necituj po paměti**:

| Soubor | Co v něm je |
|---|---|
| `.github/instructions/notation.instructions.md` | pět pravidel, rychlý přehled |
| `docs/notation/glossary.md` | kanonické značky, indexy CZ↔EN, „není chyba" |
| `docs/notation/style-guide.md` | proč to tak je (normy ČSN/ISO 80000) |
| `docs/notation/authoring.md` | mechanika: HTML, KaTeX, i18n, čísla |
| `docs/notation/phase2-scope.md` | co je ještě neopravené a v jakém pořadí |

Při rozporu platí `docs/notation/`.

## Krok 1 — Inventura: kde text doopravdy je

**Tento krok nesmíš přeskočit.** Viditelný text stránky většinou **není v HTML**;
je v `locales/*.json` a HTML nese jen `data-i18n` klíče. Kdo opraví jen HTML,
minul většinu práce.

```bash
SEC=total-pressure                 # id sekce, nebo vynech pro celou stránku
PAGE=pressure.html

# 1a. Kolik textu je v i18n vrstvě?
python3 - "$PAGE" "$SEC" <<'PY'
import sys,re
h=open(sys.argv[1],encoding='utf-8').read()
if len(sys.argv)>2 and sys.argv[2]:
    s=h.index(f'<section id="{sys.argv[2]}"'); e=h.find('<section',s+10); h=h[s:e if e>0 else len(h)]
keys=sorted(set(re.findall(r'data-i18n="([^"]+)"',h)))
print(f'{len(keys)} i18n klíčů:'); [print(' ',k) for k in keys[:10]]
print(f'  ... a dalších {len(keys)-10}' if len(keys)>10 else '')
print('PREFIXY:',sorted({k.split('.')[0] for k in keys}))
PY
```

Sestav **seznam souborů k opravě** — vždy obsahuje HTML *i* všechny tři jazyky:

- `<PAGE>.html` — vzorce, popisky mimo i18n, atributy `title`/`alt`
- `locales/cs.json`, `locales/en.json`, `locales/es.json` — pod nalezenými prefixy
- `data/*.json` — jen pokud sekce čte kvízová data

**Jazyková parita:** opravuješ-li klíč v `cs.json`, zkontroluj **stejný klíč**
v `en.json` i `es.json`. Chyby bývají v každém jazyce jiné.

## Krok 2 — Projdi pět tříd zvlášť

Vzorce zaujmou pozornost a próza se přehlédne. Projdi třídy **jednu po druhé**,
každou přes všechny soubory z Kroku 1.

| # | Třída | Hledej | Oprav na |
|---|---|---|---|
| 1 | číslo + jednotka | `20m`, `20 m` (obyčejná mezera) | `20&nbsp;m` v HTML, `20`+U+00A0+`m` v JSON |
| 1b | oddělovač tisíců | `600 000 Pa` (obyčejná mezera) | `600`+nbsp+`000`+nbsp+`Pa` — přepínač `--thousands` |
| 2 | desetinná tečka v CZ | `2.81 bar` | `2,81` + nedělitelná mezera + `bar` |
| 3 | značka tlaku | `P_{amb}`, `ppO2`, `T_{1/2}` | `p_{\mathrm{amb}}`, *p*<sub>O₂</sub>, *t*<sub>1/2</sub> |
| 4 | kurzíva značky | `<em>p</em>` **jako značka** | `<var>p</var>` |
| 5 | zkratky | GF/MOD/NDL/SAC/OTU kurzívou | stojatě |

Třídu 1 nehledej ručně — má hotový nástroj, který zná výjimky (`12litrový`,
`60°`, `12l lahev`, skloňované názvy) a nesahá do vzorců KaTeX ani do
`<script>`:

```bash
python3 docs/notation/tools/nbsp.py --check --words -v <soubory>
```

Výstup si projdi po řádcích **dřív, než pustíš `--fix`**. Nástroj řeší jen
třídu 1; třídy 2–5 zůstávají na tobě.

Po opravě ověř, že se změnily opravdu jen mezery:

```bash
python3 - <<'PY'
import subprocess
norm=lambda t:t.replace('&nbsp;','').replace('\u00a0','').replace(' ','')
for f in subprocess.run(['git','diff','--name-only'],capture_output=True,text=True).stdout.split():
    old=subprocess.run(['git','show',f'HEAD:{f}'],capture_output=True,text=True).stdout
    ok=norm(old)==norm(open(f,encoding='utf-8').read())
    print(f'{f:34} {"jen mezery OK" if ok else "JINA ZMENA - zkontroluj"}')
PY
```

## Locale JSON uprav jako text, ne jako JSON

Skript výše slouží **jen k vyhledání** chyb. Na zápis ho nepoužívej.

`json.load()` + `json.dump()` přeformátuje celý soubor — projekt má odsazení
**4 mezerami**, `json.dump` píše 2 a diff naroste z 13 řádků na 4 300.
Takový diff nikdo nezreviduje a přepíše git blame celého souboru.

Opravuj **cílenou záměnou řetězce** v konkrétním klíči (editační nástroj,
`sed` na jeden řádek), ne přepsáním souboru. Kontrola:

```bash
diff <(git diff --stat locales/) <(git diff -w --stat locales/) \
  && echo "OK: žádné formátovací změny" \
  || echo "CHYBA: soubor byl přeformátován, vrať a oprav bodově"
```

Obě čísla se musí shodovat. Liší-li se, změnil jsi formátování.

## Nikdy „neopravuj" toto

Jsou to **správné** zápisy; jejich změna je regrese:

- `12litrový`, `15litrová` — složené přídavné jméno, bez mezery
- `12l lahev` — zkrácené „12litrová lahev", tedy táž složenina
- `60°`, `180°` — úhel a azimut se píší bez mezery (`data/quiz-vessel.json` jich má 71)
- `32%` jako přívlastek vs. `32 %` jako podstatné jméno — obojí správně, jinde
- `kPa` a doslovné znění v kvízech — citace SPČR, cituje se verbatim
- **skloňovaný název jednotky v běžné větě** — „s méně než 1&nbsp;bar**em**",
  „2&nbsp;bar**y**", „v 10&nbsp;metr**ech**". Neskloňuje se **značka** (`bar`,
  `m`), ale vypsaný *název* jednotky ve větě čeština skloňuje normálně.
  Oprav jen mezeru, tvar slova nech být — jinak vznikne negramatická věta.
- `<em>` v běžné próze — v projektu je ~110 legitimních zvýraznění.
  Na `<var>` převádíš **jen** `<em>`, který nese značku veličiny.
- `&#8239;` / U+202F — nepoužívej vůbec, ani v HTML

## Oddělovač podle typu souboru, ne podle sinku

| Soubor | Použij |
|---|---|
| `*.html` | `&nbsp;` |
| `locales/*.json`, `data/*.json` | **doslovné U+00A0** |

V datech se entita nepoužívá vůbec. Tentýž locale klíč může skončit
v `innerHTML` (dekóduje), na canvasu Chart.js, v `textContent` (`js/quiz.js`)
i v atributu `title` — a jen ta první cesta entitu dekóduje. Do popisku grafu
by se vypsalo doslova „20&nbsp;m/min"; přesně to řešil PR #82.

U+00A0 se vykreslí správně všude a **přežije, když někdo později změní sink**.
Neklasifikuj klíče podle toho, kdo je zrovna čte — ta klasifikace tichem
zestárne.

Hromadnou opravu udělá `docs/notation/tools/nbsp.py`, který oddělovač volí
podle přípony sám:

```bash
python3 docs/notation/tools/nbsp.py --check --words -v <soubory>   # náhled
python3 docs/notation/tools/nbsp.py --fix   --words    <soubory>   # zápis
python3 docs/notation/tools/nbsp.py --fix   --thousands <soubory> # i tisíce
```

`--words` zapne i skloňované názvy jednotek („2 bary") a uplatní se jen
na české soubory. Hlídají to testy `*.json: no &nbsp; entity`
a `*.json: U+00A0 between value and unit` v `tests/run-tests.mjs`.

## Krok 3 — Ověření

```bash
npm test          # musí projít celé (273/273)
git diff --stat   # sedí seznam souborů z Kroku 1?

# diff nesmí obsahovat formátovací šum
diff <(git diff --stat) <(git diff -w --stat) && echo "OK"
```

Cache verzi v `sw.js` a `css/styles.css` bump **jen** tehdy, mění-li se něco,
co se posílá uživateli — u čistě obsahových oprav textu ano, u úprav
dokumentace v `docs/` ne.

## Krok 4 — Report

Report čte **školitel, ne vývojář**. Piš česky, bez cest do kódu v nadpisech,
a uveď rozsah a počty, ať je vidět, co bylo prověřeno.

```markdown
# Oprava zápisu veličin — <název sekce>

**Rozsah:** <stránka / sekce>, soubory: <výčet včetně locales>
**Zkontrolováno:** <N> textových řetězců ve <M> souborech, 3 jazyky

## Opraveno

| Třída | Počet | Příklad před → po |
|---|---|---|
| Mezera mezi číslem a jednotkou | 56 | `10 m` → `10&nbsp;m` |
| Značka tlaku velkým písmenem | 7 | `P_{amb}` → `p_{\mathrm{amb}}` |

Norma: <odkaz do style-guide.md, proč je nový tvar správný>

## Prověřeno a v pořádku
- <třída, která chyby neměla — ať je vidět, že se kontrolovala>

## Ponecháno záměrně
- `60°` (úhel se píše bez mezery), `12litrový` (složenina)

**Testy:** 273/273 ✅
```

Report musí odpovídat na otázku „co jsi kontroloval a nenašel", ne jen
„co jsi opravil". Bez toho čtenář nepozná, jestli je sekce hotová.
