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
komentářů, `.formula`, `data-latex` ani `$…$`. Zná výjimky (`12litrový`, `60°`,
`12l lahev`) a s `--words` opraví i mezeru u skloňovaných názvů („2 bary"),
aniž by měnil tvar slova. `--words` se uplatní jen na české soubory.


## Rozsah

**3 290 chybějících nedělitelných mezer ve 40 souborech** (3 099 obyčejná
mezera, 191 slepené). Čísla jsou po vyloučení složenin typu `12litrový`.

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
