---
applyTo: "**/*.html,wiki/**/*.md,data/*.json,locales/*.json,js/**/*.js"
---

# Zápis fyzikálních veličin

Závazné znění: [`docs/notation/glossary.md`](../../docs/notation/glossary.md).
**Při rozporu platí `docs/notation/`, ne tento soubor.**

## Pět pravidel

1. **Značka veličiny kurzívou, jednotka stojatě.** `<var>p</var><sub>celk</sub>`, `bar` nikdy kurzívou.
2. **Mezi číslem a jednotkou `&nbsp;`.** Správně `20&nbsp;m`; ✗ nikdy `20m`, `20 m` ani `&#8239;`/U+202F.
3. **V češtině desetinná čárka.** Správně `2,81&nbsp;bar`; ✗ nikdy `2.81 bar`.
4. **Tlak je malé *p*.** Parciální tlak *p*<sub>O₂</sub>, ne `ppO2`.
5. **Víceznakové zkratky stojatě.** GF, MOD, NDL, SAC, OTU.

Proč malé *p* (pravidlo 4): [style-guide.md](../../docs/notation/style-guide.md#rozhodnutí-projektu).

## Špatně × správně

| ✗ Špatně | ✓ Správně |
|---|---|
| ✗ `20m`, `20 m` | `20&nbsp;m` |
| ✗ `2.81 bar` | `2,81&nbsp;bar` |
| ✗ `10-20 m` | `10–20&nbsp;m` |
| ✗ `20°C` | `20&nbsp;°C` |
| ✗ `<em>p</em>` | `<var>p</var>` |
| ✗ `P_{amb}` | `p_{\mathrm{amb}}` |
| ✗ `T_{1/2}` | `t_{1/2}` |
| ✗ `ppO2`, `CO2` | *p*<sub>O₂</sub>, CO₂ |

Není chyba: `12litrový` (složenina), `60°` (úhel bez mezery), `kPa` v kvízech (citace SPČR).

## Indexy

Popisný index **stojatě** (*p*<sub>amb</sub>), index, který je sám veličinou nebo běžícím
indexem, **kurzívou** (*c*<sub>*p*</sub>, *a*<sub>*i*</sub>).

Chemické indexy se nepřekládají; popisné ano — `p_celk` v češtině, `p_tot` v angličtině.
Převodní tabulka: [glossary.md §3](../../docs/notation/glossary.md#3-popisné-indexy-czen).

## Nová veličina

Zapiš ji do [`glossary.md`](../../docs/notation/glossary.md) **ve stejném commitu**.

Podrobnosti: [`style-guide.md`](../../docs/notation/style-guide.md) (pravidla a normy),
[`authoring.md`](../../docs/notation/authoring.md) (HTML, KaTeX, čísla).
