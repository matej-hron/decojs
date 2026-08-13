# Fáze 2 — rozsah oprav zápisu

Kde se sahá, kde ne, a v jakém pořadí. Pravidla samotná jsou v
[`glossary.md`](glossary.md) a [`style-guide.md`](style-guide.md); postup opravy
je ve skillu `.github/skills/fixing-physics-notation/`.

Měřeno na `main` po PR #81 a #82 (verze 0.6.37).

## Nejdřív: kam se `&nbsp;` smí zapsat

**Tohle rozhodni dřív než cokoli opravíš.** `&nbsp;` je HTML entita — funguje
jen tam, kde řetězec projde parserem HTML. Jinde se uživateli vypíše doslova
i se středníkem.

| Cesta řetězce | Zapiš | Kde to je |
|---|---|---|
| `data-i18n` → `el.innerHTML` (`js/i18n.js:99`) | `&nbsp;` | většina locale klíčů |
| statický text v `*.html` | `&nbsp;` | všechny stránky |
| otázky, volby a vysvětlení kvízů → `innerHTML` (`js/quiz.js:199`) | `&nbsp;` | `data/quiz-*.json` |
| Chart.js na canvas | **U+00A0** | `chart.*`, `tissueSim.tooltipLabel` |
| `.textContent =` | **U+00A0** | `quiz.buttons.*`, `quiz.runtime.*` |
| `.title =`, `aria-label`, `placeholder` | **U+00A0** | `chart.tooltips.*` |
| uvnitř KaTeX vzorce | **`\,`** | 1 výskyt v `pressure.html` |

Ověření před editací klíče:

```bash
grep -rn "<klíč>" --include=*.js --include=*.html . | grep -v node_modules
```

Hlídá to test `i18n notation` v `tests/run-tests.mjs`.

## Rozsah

**3 290 chybějících nedělitelných mezer ve 40 souborech** (3 099 obyčejná
mezera, 191 slepené). Čísla jsou po vyloučení složenin typu `12litrový`.

### A. Teoretické stránky — dělat první

Tohle čte garant a komise.

| Soubor | Výskytů |
|---|---|
| `pressure.html` | 87 |
| `tissue-loading.html` | 37 |
| `gradient-factors.html` | 18 |
| `m-values.html` | 12 |
| `about.html` | 12 |
| `locales/{cs,en,es}.json` | 194 / 184 / 174 |

V locales se dělá po prefixech, ne najednou. Největší:
`sandbox` 28, `warnings` 19, `diveEditor` 19, `gasLaw` 18, `gradientFactors` 17,
`totalPressure` 16, `gasConsumption` 13, `about` 13, `tissueLoading` 12.

### B. Kvízy — dělat druhé

| Soubor | Výskytů |
|---|---|
| `data/quiz-physics{,-en,-es}.json` | 678 / 530 / 530 |
| `data/quiz-training{,-en,-es}.json` | 57 / 58 / 58 |
| `data/quiz-accidents{,-en,-es}.json` | 46 / 57 / 57 |
| `data/quiz-equipment{,-en,-es}.json` | 44 / 45 / 44 |
| `data/quiz-safety{,-en,-es}.json` | 36 / 38 / 38 |
| `data/quiz-anatomy{,-en,-es}.json` | 16 / 15 / 15 |
| `data/quiz-vessel{,-en,-es}.json` | 15 / 14 / 15 |

Kvízy jdou přes `innerHTML`, `&nbsp;` je tam tedy správně. **Mění se jen
typografie, nikdy formulace** — jsou to doslovné otázky SPČR. Nedělitelná
mezera znění otázky nemění.

### C. Sandbox a data — dělat naposledy

`sandbox/tissue-saturation.html` 16, `sandbox/gas-law.html` 13,
`sandbox/cascade-filling.html` 12, `sandbox/chart-test.html` 7,
`sandbox/transfilling.html` 6, `sandbox/gradient-factors.html` 3,
`sandbox/m-values.html` 2, `sandbox/schreiner.html` 2, `sandbox/haldane.html` 1,
`data/dive-setup.json` 14, `data/dive-profiles.json` 11.

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
| `P_amb` velkým písmenem | 183 v 25 souborech | #62 |
| `<em>` jako značka místo `<var>` | 105 (a 110 legitimních zvýraznění nechat) | #56 |
| `T_{1/2}` → `t_{1/2}` | 15–17 v 8–10 souborech | #62 |

## Pracovní postup

Jedna stránka nebo jeden locale prefix = jeden PR. Na každý běž skillem
`fixing-physics-notation`, který vynutí inventuru, paritu cs/en/es, bodovou
editaci a report.

Po každém PR: `npm test` (280+), `git diff --stat` == `git diff -w --stat`,
bump verze v `sw.js` i `css/styles.css`.
