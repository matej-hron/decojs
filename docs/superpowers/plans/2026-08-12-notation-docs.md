# Physics Notation Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the physics-notation rules in the repository as a glossary, a style guide, and authoring patterns, and wire them into the agent instruction files so they reach an agent at the moment it edits an affected file.

**Architecture:** Three Czech-language Markdown documents under `docs/notation/`, split by audience: `glossary.md` (canonical symbol registry, the centerpiece), `style-guide.md` (rules, Czech typography, sources), `authoring.md` (HTML/CSS/KaTeX/number mechanics). A short digest at `.github/instructions/notation.instructions.md` carries an `applyTo` frontmatter so it loads only for files that contain user-visible notation. `CLAUDE.md` and `.github/copilot-instructions.md` get pointers.

**Tech Stack:** Markdown only. No build step, no dependencies, no runtime code. Verification is `npm test` (must stay green at 273/273) plus ad-hoc Python consistency checks that are run but never committed.

**Spec:** `docs/superpowers/specs/2026-08-12-notation-docs-design.md`

## Global Constraints

- **Documents are written in Czech.** Filenames, this plan, and the spec stay English.
- **Czech is the priority language.** CZ must be correct first; EN/ES may lag.
- **Non-breaking space is written as the `&nbsp;` entity** (U+00A0). Never `&#8239;`, never a literal character. The research source recommends U+202F — **the spec overrides it**; see spec §D1.
- **Pressure is lowercase italic *p*.** Never *P*, in prose or in LaTeX.
- **Canonical partial pressure is *p*<sub>O₂</sub>.** `ppO₂` is a colloquial synonym only, never inside a formula.
- **Half-time is *t*<sub>1/2</sub>.** Not `T_{1/2}`, not `τ`.
- **Multi-letter abbreviations are upright:** GF, SAC, MOD, NDL, EAD, OTU, DCS, CNS, TTS, TDT, SI, EAN.
- **Descriptive subscripts upright, quantity/index subscripts italic.**
- **Descriptive subscripts are localized** (`celk` in CZ, `tot` in EN); **chemical subscripts never are** (O₂, N₂, He).
- **℃ (U+2103) is banned.** Write `°C` as two characters.
- **No cache version bump.** Documentation-only commits leave `sw.js` and `css/styles.css` untouched — verified, 28 of the last 28.
- **Nothing is added to `STATIC_ASSETS`.**
- **No code is changed.** No `.html`, `.css`, `.js` or `data/*.json` file is modified by this plan.
- Commit message prefix: `docs(notation): …`

## File Structure

| File | Responsibility |
|---|---|
| `docs/notation/glossary.md` | Canonical symbol registry. Seven sections: how to read, base quantities, CZ↔EN subscripts, partial pressures, deco model, abbreviations, wrong × right. The single source of truth for "which symbol do we use". |
| `docs/notation/style-guide.md` | Why the symbols look the way they do: italic/upright, case, Czech typography, and the normative sources. Garant-facing. |
| `docs/notation/authoring.md` | How to type it: `<var>`, the CSS block, KaTeX `\mathrm{}` and macros, `Intl.NumberFormat`, Unicode table. Developer-facing. |
| `.github/instructions/notation.instructions.md` | ~50-line digest with `applyTo`. Links onward; never a copy of normative content. |
| `.github/copilot-instructions.md` | Gains a `## Notation` pointer section. |
| `CLAUDE.md` | Gains the same pointer plus the five hard rules inline, plus the glossary-drift maintenance rule. |
| `docs/notation/_research-source.md` | **Temporary scratch.** Created in Task 0, deleted in Task 6. Nothing may reference it. |

Tasks 1–3 are independent of each other once Task 0 lands. Task 4 depends on Task 1 (it links to glossary anchors). Task 5 depends on Task 4. Task 6 is cleanup and must be last.

---

### Task 0: Scaffold and import the research source

**Files:**
- Create: `docs/notation/_research-source.md` (temporary, committed then deleted in Task 6)

Nothing is git-ignored. The scratch file is committed so that its later removal is visible
in history rather than happening silently.

**Interfaces:**
- Produces: `docs/notation/_research-source.md` with the section numbering (`§1`–`§14`) that Tasks 1–3 cite.

- [ ] **Step 1: Create the directory and copy the research report**

```bash
mkdir -p docs/notation
cp ~/.copilot/session-state/20e5f855-e60a-42d1-bde0-f1e495d7c750/research/najdi-spravne-znaceni-fyzikalnich-zapisu-v-cr-musi.md \
   docs/notation/_research-source.md
```

If that path no longer exists, stop and ask — the report is the input for every following task and cannot be reconstructed.

- [ ] **Step 2: Prepend a removal notice so nobody links to it**

Insert these five lines at the very top of `docs/notation/_research-source.md`:

```markdown
> ⚠️ **DOČASNÝ PRACOVNÍ SOUBOR — bude smazán.**
> Slouží jen jako podklad při psaní `glossary.md`, `style-guide.md` a `authoring.md`.
> Neodkazuj na něj. Závazné znění je v uvedených třech dokumentech.
> Odstraněno v Tasku 6 tohoto plánu.
```

- [ ] **Step 3: Verify the section headings the later tasks depend on**

Run:

```bash
grep -n '^### 5\.\|^### 2\.3\|^### 4\.1\|^### 7\.3\|^### 8\.3' docs/notation/_research-source.md
```

Expected: at least `### 2.3`, `### 4.1`, `### 5.1`, `### 5.2`, `### 5.3`, `### 5.4`, `### 7.3`, `### 8.3`. If any is missing the copy is wrong — re-copy.

- [ ] **Step 4: Commit**

```bash
git add docs/notation/_research-source.md
git commit -m "docs(notation): import research source as temporary scratch

Working input for the notation documents. Deleted once its content has
been distributed into glossary.md, style-guide.md and authoring.md.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: `docs/notation/glossary.md`

**Files:**
- Create: `docs/notation/glossary.md`
- Read: `docs/notation/_research-source.md` §5.1–§5.4, §6.1–§6.4, §2.3

**Interfaces:**
- Produces: heading anchors that Task 4 links to — `#2-základní-veličiny`, `#3-popisné-indexy-czen`, `#4-parciální-tlaky-a-podíly-plynů`, `#5-dekompresní-model`, `#6-zkratky`, `#7-špatně--správně`.

- [ ] **Step 1: Write the document skeleton**

Seven `##` sections, in this order and with these exact headings:

```markdown
# Slovníček veličin

Kanonický registr značek používaných v DecoJS. **Zavádíš-li novou veličinu, zapiš ji sem.**

Pravidla, proč se značky píšou takto, jsou ve `style-guide.md`.
Jak je zapsat v HTML, LaTeXu a v kódu, je v `authoring.md`.

## 1. Jak slovníček číst
## 2. Základní veličiny
## 3. Popisné indexy CZ↔EN
## 4. Parciální tlaky a podíly plynů
## 5. Dekompresní model
## 6. Zkratky
## 7. Špatně × správně
```

- [ ] **Step 2: Fill section 1 — how to read the glossary**

Three rules and the subscript test. Content:

```markdown
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
```

- [ ] **Step 3: Fill section 2 — base quantities**

Copy the rows of `_research-source.md` §5.1 verbatim, then apply exactly these three transformations:

1. Replace the `Jednotka SI | Jednotka v projektu` pair with a single `Jednotka` column holding the project unit; move the SI unit into `Pozn.` only where it differs.
2. Drop the `Index` column — section 1 already states the rule.
3. Add a `V kódu` column using these verified identifiers. **These names are recorded, not enforced; this task renames nothing.**

| Symbol | V kódu (kanonicky) | Legacy alias, ponechat | Doloženo |
|---|---|---|---|
| *p*<sub>amb</sub> | `pAmb` | `ambientPressure` | 29 × / 31 × |
| *p*<sub>t</sub> | `pTissue` | `tissuePressure` | 16 × / 9 × |
| *p*<sub>alv</sub> | `pAlv` | `alveolarPressure` | 3 × / 4 × |
| *p*<sub>anchor</sub> | `pAnchor` | — | 87 × |
| *t*<sub>1/2</sub> | `halfTime` | — | 65 × |
| GF<sub>low</sub> | `gfLow` | — | 139 × |
| GF<sub>high</sub> | `gfHigh` | — | 102 × |
| *p*<sub>O₂</sub> | `ppO2` | — | 45 × |
| *p*<sub>N₂</sub> | `ppN2` | — | 13 × |
| *f*<sub>N₂</sub> | `fN2` | — | 3 × |
| *p*<sub>ceiling</sub> | `ceiling` | — | 49 × |

For any symbol with no identifier in the codebase (*p*<sub>ceiling</sub> has only the bare
`ceiling`; `fO2`, `pCeiling` and `gfInst` **do not exist**), write `—`. Do not invent names.

Keep the §5.1 note about Czech-school deviations from ISO (*S* for area, *F*<sub>vz</sub>
for buoyancy) as a blockquote under the table.

- [ ] **Step 4: Fill section 3 — the CZ↔EN subscript table**

This is the section that implements the hybrid rule. Content:

```markdown
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

**Důsledek, který zatím neřešíme:** popisky grafů jsou sdílené přes CZ/EN/ES, takže
lokalizované indexy si vyžádají jejich převedení do i18n. To je práce fáze 2.
```

- [ ] **Step 5: Fill sections 4, 5 and 6**

Section 4 from `_research-source.md` §5.2, section 5 from §5.3, section 6 from §5.4 —
rows verbatim, plus the `V kódu` column from the Step 3 table.

In section 4, add this note under the table, which resolves the CZ↔EN divergence:

```markdown
> **`ppO₂` je hovorové synonymum, ne značka.** Kanonicky *p*<sub>O₂</sub>. `ppO₂` smí
> zůstat ve varovných hláškách a popiscích grafů; **ve vzorci nikdy**. Anglické a
> španělské stránky dnes používají *p*O₂ — sjednotí se na *p*<sub>O₂</sub>.
```

In section 5, mark *t*<sub>1/2</sub> with:

```markdown
> *τ* **není totéž.** Časová konstanta *τ* se váže vztahem *t*<sub>1/2</sub> = *τ* · ln 2.
> Wiki dnes používá *T*<sub>1/2</sub> — sjednotit na *t*<sub>1/2</sub>.
```

In section 6, keep the §5.4 opening sentence that Czech diving uses English abbreviations
untranslated, with the Czech gloss on first occurrence.

- [ ] **Step 6: Fill section 7 — wrong × right**

The table an agent can act on without reading anything else. **Every counter-example line
must carry the ✗ character** — the consistency check in Step 7 skips those lines, and
without the marker the document will fail its own check.

```markdown
## 7. Špatně × správně

| ✗ Špatně | ✓ Správně | Proč |
|---|---|---|
| `20m`, `1,4bar` | `20&nbsp;m`, `1,4&nbsp;bar` | mezera povinná a nedělitelná (ÚJČ §785, §880) |
| `2.81 bar` (v češtině) | `2,81&nbsp;bar` | desetinná čárka |
| `10-20 m` | `10–20&nbsp;m` | pomlčka U+2013, ne spojovník |
| `-273,15 °C` | `−273,15&nbsp;°C` | minus U+2212 |
| `20°C` | `20&nbsp;°C` | mezera před °C |
| `20 ° C` | `20&nbsp;°C` | ale ne mezi ° a C |
| `℃` | `°C` | U+2103 je kompatibilní znak z CJK bloku |
| `<em>p</em>` | `<var>p</var>` | `<em>` nese větný důraz, ne význam veličiny |
| `P` (tlak) | *p* | ISO 80000-4, IUPAC, česká škola |
| `ppO2`, `CO2` | *p*<sub>O₂</sub>, CO₂ | ASCII index |
| `P_{amb}` (LaTeX) | `p_{\mathrm{amb}}` | index by se vysázel kurzívou |
| `T_{1/2}` | `t_{1/2}` | Bühlmannova notace |
| `GF` kurzívou | GF stojatě | kurzíva se čte jako součin *G*·*F* |
| `5 mů`, `5 ms` | `5 m` | značky se neskloňují |

**Není chyba:**

- `12litrový` — správná česká složenina, ne chybějící mezera.
- `60°`, `17° 15′` — úhlový stupeň se připojuje **bez** mezery.
- `kPa` v kvízech — doslovná citace zadání SPČR.
- `32% nitrox` — přídavné jméno („dvaatřicetiprocentní"); `obsah je 32 %` je podstatné jméno.
```

- [ ] **Step 7: Verify the document obeys its own rules**

Save as `/tmp/notation-check.py` (**not** in the repo — lint is out of scope):

```python
import re, sys

PATTERNS = [
    (r'\d(?:m|bar|min|%)\b',            'číslo nalepené na jednotku'),
    (r'\d\.\d+\s*(?:bar|m|min|l|°C)\b', 'desetinná tečka u hodnoty'),
    (r'\bP_\{',                          'velké P v LaTeXu'),
    (r'\u2103',                          'znak ℃ (U+2103)'),
    (r'&#8239;',                         'U+202F — spec nařizuje &nbsp;'),
]

bad = []
for path in sys.argv[1:]:
    fenced = False
    for n, line in enumerate(open(path, encoding='utf-8'), 1):
        if line.lstrip().startswith('```'):
            fenced = not fenced
            continue
        if fenced or '✗' in line or '❌' in line:
            continue
        for pat, msg in PATTERNS:
            if re.search(pat, line):
                bad.append(f'{path}:{n}: {msg}\n    {line.strip()[:90]}')

print('\n'.join(bad) if bad else 'OK — dokument dodržuje vlastní pravidla')
sys.exit(1 if bad else 0)
```

Run: `python3 /tmp/notation-check.py docs/notation/glossary.md`
Expected: `OK — dokument dodržuje vlastní pravidla`

If it reports a line that is a deliberate counter-example, add the ✗ marker to that line
rather than weakening the check.

**Do not "simplify" the `%` alternative.** It looks broken and is not: `\b` after `%`
requires a following word character, so `32% nitrox` and `obsah je 32 %` both pass — the
first is a correct Czech adjective, the second a correct substantive — while `32%nitrox`
is caught. Verified against all three. Likewise `12litrový` passes, because `\b` fails
between `l` and `i`.

- [ ] **Step 8: Verify every symbol in a table is italicised**

```bash
python3 - <<'PY'
import re
rows = [l for l in open('docs/notation/glossary.md', encoding='utf-8')
        if l.startswith('|') and not re.match(r'^\|\s*[-:| ]+\|', l)]
ok = re.compile(r'^(\*[A-Za-zρτΔ]\*|Δ\*[A-Za-z]\*|<var>|GF|NDL|MOD|EAD|DCS|CNS|OTU|SAC|TTS|TDT|SI|EAN|✗|`)')
bad = [r for r in rows
       if (c := r.split('|')[1].strip())
       and not ok.match(c)
       and not c.startswith(('Symbol', 'Zápis', 'Význam', 'Zkratka', 'Veličina', '**'))]
print('\n'.join(b.strip()[:90] for b in bad) if bad else 'OK — všechny značky kurzívou')
PY
```

Expected: `OK — všechny značky kurzívou`. Any row listed here has a symbol that is not
italic — the exact defect this document exists to prevent.

- [ ] **Step 9: Confirm the test suite is untouched**

Run: `npm test`
Expected: `273/273 passed`. This task changes no code; a different number means something
unrelated broke and must be investigated before committing.

- [ ] **Step 10: Check the tables render on GitHub**

The glossary is read on github.com, not in an editor — a table that collapses there is
useless to the garant. Verify locally first:

```bash
python3 - <<'PY'
import re
bad = []
block = []
for n, line in enumerate(open('docs/notation/glossary.md', encoding='utf-8'), 1):
    if line.startswith('|'):
        block.append((n, line.rstrip().count('|')))
    else:
        if block:
            widths = {w for _, w in block}
            if len(widths) > 1:
                bad.append(f'řádky {block[0][0]}–{block[-1][0]}: nestejný počet sloupců {sorted(widths)}')
            if len(block) < 2:
                bad.append(f'řádek {block[0][0]}: tabulka bez oddělovače')
        block = []
print('\n'.join(bad) if bad else 'OK — všechny tabulky mají konzistentní sloupce')
PY
```

Expected: `OK — všechny tabulky mají konzistentní sloupce`

Then push the branch and open the file on github.com. Confirm by eye: every table renders as
a table, `<sub>` renders as a subscript, and `*p*` renders italic. GitHub sanitizes HTML —
`<var>`, `<sub>` and `<sup>` are allowlisted and must survive.

- [ ] **Step 11: Commit**

```bash
git add docs/notation/glossary.md
git commit -m "docs(notation): add the quantity glossary

Canonical registry of symbols: base quantities, CZ/EN descriptive
subscripts, partial pressures, deco model, abbreviations, and a
wrong-vs-right table.

Records the canonical JS identifier per quantity alongside the legacy
alias still in use (pAmb/ambientPressure, pTissue/tissuePressure).
Nothing is renamed.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `docs/notation/style-guide.md`

**Files:**
- Create: `docs/notation/style-guide.md`
- Read: `docs/notation/_research-source.md` §1–§4, §6

**Interfaces:**
- Consumes: nothing from Task 1 beyond a relative link to `glossary.md`.
- Produces: anchor `#rozhodnutí-projektu`, linked from Task 4.

- [ ] **Step 1: Write the frame and the normative basis**

```markdown
# Pravidla zápisu fyzikálních veličin

Proč značky vypadají tak, jak vypadají. Seznam značek je v `glossary.md`,
technický zápis v `authoring.md`.

## 1. Odkud pravidla plynou

| Norma | Co určuje |
|---|---|
| ČSN EN ISO 80000-1 (01 1300), ed. 10/2023, kap. 7 | kurzíva vs. stojaté písmo, indexy, násobení |
| ČSN EN ISO 80000-4, -5, -9 | značky pro mechaniku, termodynamiku, fyzikální chemii |
| ČSN 01 6910:2014 | česká úprava písemností — mezery, čárka, pomlčka |
| ÚJČ, Internetová jazyková příručka | veřejně dostupný výklad téhož |

Plné texty ČSN jsou placené. Pravidla níže se proto citují z NIST SP 811 (obsahově
shodný s ISO 80000) a z IJP, kterou vede tentýž ústav, jenž se podílel na ČSN 01 6910.
```

- [ ] **Step 2: Write the italic/upright section**

From `_research-source.md` §2.1–§2.4. Must contain the decision table, the verbatim
NIST SP 811 §10.2 subscript quote, the IUPAC value-vs-label test, and the multi-letter
abbreviation rule with the *G*·*F* argument.

- [ ] **Step 3: Write the case-sensitivity section**

From §3.1–§3.3: unit case (`m` vs `M`, `bar` lowercase), quantity case where a swap changes
meaning, and the *t* = time vs *t* = Celsius temperature collision. State the project rule:
**in DecoJS *t* is always time**; ϑ is not introduced.

- [ ] **Step 4: Write the Czech typography section**

From §4.1–§4.7, with the verbatim IJP quotes (§785, §880, §791, §165) kept as blockquotes —
they are what makes the document defensible to a commission.

Covers: non-breaking space between number and unit; decimal comma and thousands grouping;
en dash for ranges; U+2212 minus; `×` vs `·`; the percent adjective/substantive distinction;
symbols are never declined.

Carry over both "looks wrong but isn't" notes:

```markdown
- `12litrový přístroj` je **správná složenina**, ne chybějící mezera.
- `kPa` v kvízech je **doslovná citace** oficiálního zadání SPČR a zůstává.
```

- [ ] **Step 5: Write the project-decisions section**

Heading exactly `## Rozhodnutí projektu` so the Task 4 anchor resolves.

From §6.1–§6.4, one subsection per decision, each stating the alternatives, the choice, and
the reason — so the garant has something to contest:

| Rozhodnutí | Jádro odůvodnění |
|---|---|
| malé *p* pro tlak | ISO 80000-4/-9, IUPAC, česká škola; Pappenheimerovo velké *P* je konzistentní jen s celým svým aparátem (P<sub>A</sub>O₂, F<sub>I</sub>O₂) |
| *p*<sub>O₂</sub> kanonicky, `ppO₂` hovorově | odstraňuje rozpor CZ vs. EN/ES; garant #61 |
| *t*<sub>1/2</sub> pro poločas | Bühlmannova vlastní notace; *τ* je jiná veličina |
| bar, m, min, l, °C | potvrzení stávající praxe; kPa jen jako citace zadání |

- [ ] **Step 6: Add the sources appendix**

Numbered list of the normative documents with their full titles and the IJP paragraph
numbers cited above. Keep the footnote markers from the research file only if the targets
are carried over too; otherwise write plain references. **A dangling `[^22]` is a defect.**

- [ ] **Step 7: Verify**

```bash
python3 /tmp/notation-check.py docs/notation/style-guide.md
grep -o '\[\^[0-9]*\]' docs/notation/style-guide.md | sort -u
```

Expected: `OK — dokument dodržuje vlastní pravidla`, and every footnote marker listed by the
second command must have a matching `[^n]:` definition. Verify with:

```bash
python3 - <<'PY'
import re
t = open('docs/notation/style-guide.md', encoding='utf-8').read()
used = set(re.findall(r'\[\^(\w+)\]', t)) - set(re.findall(r'\[\^(\w+)\]:', t))
defined = set(re.findall(r'\[\^(\w+)\]:', t))
print('nedefinované:', sorted(used - defined) or 'žádné')
print('nepoužité:', sorted(defined - used) or 'žádné')
PY
```

Expected: both `žádné`.

- [ ] **Step 8: Commit**

```bash
git add docs/notation/style-guide.md
git commit -m "docs(notation): add the notation style guide

Italic vs upright, case sensitivity, Czech typography with verbatim
UJC quotes, and the project decisions with their reasoning so the
garant can contest them on the merits.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `docs/notation/authoring.md`

**Files:**
- Create: `docs/notation/authoring.md`
- Read: `docs/notation/_research-source.md` §7, §8, §9

**Interfaces:**
- Produces: the CSS block and the `PHYSICS_MACROS` object as **proposals**. Neither is
  installed by this plan; phase 2 consumes them.

- [ ] **Step 1: Write the HTML pattern library**

From §7.1–§7.2, with one mandatory change: **`&#8239;` becomes `&nbsp;`** in pattern 5.

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

State why `<em>` is wrong: it carries prosodic stress, whereas the HTML spec §4.5.16 names
"a symbol identifying a physical quantity" as a `<var>` use case.

State the project's preferred form: **`<var>p</var><sub>amb</sub>`** — subscript outside
`<var>`, which needs no CSS reset.

- [ ] **Step 2: Write the CSS section**

Copy the block from §7.3 verbatim. Add the verified note that `css/styles.css` contains no
`var`, `sub` or `sup` selector, so adding these cannot conflict, and that `var(--x)` is
property-value syntax rather than a selector.

Mark the block clearly:

```markdown
> Tento blok **zatím není v `css/styles.css`**. Instaluje ho fáze 2.
```

- [ ] **Step 3: Write the KaTeX/LaTeX section**

From §8.1–§8.4. Must contain:

- Why `P_{amb}` is wrong: LaTeX sets `amb` in italic and spaces it as the product a·m·b.
- Why `\mathrm{}` beats `\text{}`: `\text{}` inherits the surrounding font style.
- The current→correct conversion table from §8.2, verbatim.
- The `PHYSICS_MACROS` object from §8.3, verbatim, marked as a phase-2 proposal.
- The shared-object constraint: the same `macros` object must be passed to every render call;
  a fresh `{}` per call breaks `\gdef` persistence.
- The wiki constraint: GitHub math supports **no user-defined macros**, so wiki pages must
  spell `\mathrm{...}` out every time. `\ce{}` is unsupported there. `<sub>`, `<sup>` and
  `<var>` are in GitHub's sanitization allowlist and do work.

- [ ] **Step 4: Write the number-formatting section**

From §9.1–§9.4, plus the U+202F decision from spec §D1. This section must be unambiguous
about the split between authoring and generated output:

```markdown
## Čísla

**Při psaní** používej entitu `&nbsp;` (U+00A0). Repozitář jich má 67, U+202F ani jeden.

**Ve vygenerovaném výstupu** se ale U+202F objeví: `Intl.NumberFormat` s `cs-CZ` ho sází
jako oddělovač tisíců. Kód ani testy proto **nesmějí předpokládat mezeru ASCII** při
porovnávání nebo parsování formátovaných čísel — `parseFloat` na takovém řetězci selže.

Další úskalí: `cs-CZ` má `minimumGroupingDigits = 2`, takže `1000` → `"1000"`,
ale `10000` → `"10 000"`.

`style: 'unit'` zná `bar`, `meter`, `minute`, `liter`, `celsius`. **Nezná** `msw`, `fsw`,
`ata`, `atm` — u nich vyhodí `RangeError` a je nutné spojení ručně.
```

Include the §9.2 `js/format.js` proposal, marked as phase 2. Note the current diagnosis:
`js/i18n.js` has no number logic, every chart carries its own `fmt()`, and only
`chartTheme.js:166-173` is locale-aware.

- [ ] **Step 5: Write the Unicode table**

From §7.5, with the U+202F row's `Použití` column rewritten from "preferovaná" to:

```markdown
| (nnbsp) | úzká nedělitelná mezera | U+202F | `&#8239;` | **nepoužívat při psaní**; objevuje se jen ve výstupu `Intl.NumberFormat` |
```

Keep the U+2103 warning and the accessibility table from §7.4.

- [ ] **Step 6: Verify**

Run: `python3 /tmp/notation-check.py docs/notation/authoring.md`
Expected: `OK — dokument dodržuje vlastní pravidla`

The `&#8239;` pattern will fire on the Unicode table row and on any leftover in the HTML
patterns. The table row is a deliberate counter-example: add `✗` to it. A hit anywhere in
the HTML pattern library is a **real defect** — fix it to `&nbsp;`.

- [ ] **Step 7: Confirm no stray characters survived the copy**

```bash
python3 - <<'PY'
import unicodedata
allowed = set('áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽüö×·−–—°₀₁₂₃₄₅₆₇₈₉✗✓…→↔„“”\u00a0\u202f§½τρΔπηµμλ├└─≈≤≥≠⁻¹²³′')
bad = 0
for i, line in enumerate(open('docs/notation/authoring.md', encoding='utf-8'), 1):
    for ch in line:
        if ord(ch) > 127 and ch not in allowed:
            print(f'{i}: U+{ord(ch):04X} {ch!r} {unicodedata.name(ch, "?")}')
            bad += 1
print('neočekávané znaky:', bad)
PY
```

Expected: `neočekávané znaky: 0`. Anything else is copy damage — a CJK or Cyrillic
lookalike that slipped in.

- [ ] **Step 8: Commit**

```bash
git add docs/notation/authoring.md
git commit -m "docs(notation): add authoring patterns

HTML pattern library built on <var>, the proposed CSS block, KaTeX
\\mathrm{} conversion and macro set, and locale-aware number
formatting.

Authoring uses the &nbsp; entity; U+202F is documented only because
Intl.NumberFormat emits it for cs-CZ, so code must not assume an
ASCII space.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `.github/instructions/notation.instructions.md`

**Files:**
- Create: `.github/instructions/notation.instructions.md`
- Read: `docs/notation/glossary.md` §7 (for the wrong × right rows)

**Interfaces:**
- Consumes: the glossary anchors produced by Task 1 and the `#rozhodnutí-projektu` anchor
  from Task 2.
- Produces: the five hard rules, reused verbatim by Task 5 in `CLAUDE.md`.

- [ ] **Step 1: Write the file**

Target ~50 lines. Longer means it is turning into a copy of the glossary, which is exactly
what must not happen.

The heading `## Pět pravidel` must be spelled exactly as below — Task 5 Step 3 matches on it.

```markdown
---
applyTo: "**/*.html, wiki/**/*.md, data/*.json, locales/*.json, js/charts/*.js, js/components/*.js"
---

# Zápis fyzikálních veličin

Závazné znění: [`docs/notation/glossary.md`](../../docs/notation/glossary.md).
**Při rozporu platí `docs/notation/`, ne tento soubor.**

## Pět pravidel

1. **Značka veličiny kurzívou, jednotka stojatě.** `<var>p</var><sub>celk</sub>`, `bar` nikdy kurzívou.
2. **Mezi číslem a jednotkou `&nbsp;`.** `20&nbsp;m`, nikdy `20m`.
3. **V češtině desetinná čárka.** `2,81&nbsp;bar`, nikdy `2.81 bar`.
4. **Tlak je malé *p*.** Parciální tlak *p*<sub>O₂</sub>, ne `ppO2`.
5. **Víceznakové zkratky stojatě.** GF, MOD, NDL, SAC, OTU.

## Špatně × správně

| ✗ | ✓ |
|---|---|
| `20m` | `20&nbsp;m` |
| `2.81 bar` | `2,81&nbsp;bar` |
| `10-20 m` | `10–20&nbsp;m` |
| `20°C` | `20&nbsp;°C` |
| `<em>p</em>` | `<var>p</var>` |
| `P_{amb}` | `p_{\mathrm{amb}}` |
| `T_{1/2}` | `t_{1/2}` |
| `ppO2`, `CO2` | *p*<sub>O₂</sub>, CO₂ |

Není chyba: `12litrový` (složenina), `60°` (úhel bez mezery), `kPa` v kvízech (citace SPČR).

## Indexy

Popisný index **stojatě** (*p*<sub>amb</sub>), index, který je veličinou nebo běžícím
indexem, **kurzívou** (*c*<sub>*p*</sub>, *a*<sub>*i*</sub>).

Chemické indexy se nepřekládají; popisné ano — `p_celk` v češtině, `p_tot` v angličtině.
Převodní tabulka: [glossary.md §3](../../docs/notation/glossary.md#3-popisné-indexy-czen).

## Nová veličina

Zapiš ji do [`glossary.md`](../../docs/notation/glossary.md) **ve stejném commitu**.

Podrobnosti: [`style-guide.md`](../../docs/notation/style-guide.md) (pravidla a normy),
[`authoring.md`](../../docs/notation/authoring.md) (HTML, KaTeX, čísla).
```

- [ ] **Step 2: Verify the length budget**

Run: `wc -l .github/instructions/notation.instructions.md`
Expected: 55 or fewer. Over budget means normative content leaked in — move it to
`docs/notation/` and link instead.

- [ ] **Step 3: Verify every relative link resolves**

```bash
python3 - <<'PY'
import os, re
src = '.github/instructions/notation.instructions.md'
base = os.path.dirname(src)
bad = []
for target in re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)', open(src, encoding='utf-8').read()):
    if target.startswith(('http', 'mailto')):
        continue
    p = os.path.normpath(os.path.join(base, target))
    if not os.path.exists(p):
        bad.append(f'{target} -> {p}')
print('\n'.join(bad) if bad else 'OK — všechny odkazy vedou na existující soubor')
PY
```

Expected: `OK — všechny odkazy vedou na existující soubor`

- [ ] **Step 4: Verify the anchor exists in the glossary**

```bash
grep -n '^## 3\. Popisné indexy' docs/notation/glossary.md
```

Expected: one match. GitHub derives the anchor `#3-popisné-indexy-czen` from this heading;
no match means the link in Step 1 is dead and the heading in Task 1 Step 4 was altered.

- [ ] **Step 5: Verify the frontmatter parses**

```bash
python3 -c "
import re
t = open('.github/instructions/notation.instructions.md', encoding='utf-8').read()
m = re.match(r'^---\n(.*?)\n---\n', t, re.S)
print('frontmatter OK:', bool(m))
print(m.group(1) if m else 'CHYBÍ — soubor se nenačte')
"
```

Expected: `frontmatter OK: True` followed by the `applyTo` line.

- [ ] **Step 6: Commit**

```bash
git add .github/instructions/notation.instructions.md
git commit -m "docs(notation): add conditionally-loaded agent instructions

Digest with applyTo frontmatter so the rules load only for files that
carry user-visible notation. Links to docs/notation/ rather than
copying it, and says so explicitly.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Pointers and the maintenance rule

**Files:**
- Modify: `CLAUDE.md` — insert before `## Key Conventions` (line 113)
- Modify: `.github/copilot-instructions.md` — insert before `## ⚠️ IMPORTANT: Before Every Push` (line 37)

**Interfaces:**
- Consumes: the five rules from Task 4, reproduced verbatim in `CLAUDE.md`.

- [ ] **Step 1: Add the section to `CLAUDE.md`**

Insert immediately before `## Key Conventions`. The rules are inline **because Claude Code
does not read `.github/instructions/`** — without them a Claude Code session gets no
notation guidance at all.

```markdown
## Notation (CRITICAL)

Physical quantities follow ČSN EN ISO 80000-1 and Czech typographic convention. Full rules
in [`docs/notation/`](docs/notation/): `glossary.md` (which symbol for what),
`style-guide.md` (why), `authoring.md` (how to type it).

These five are repeated here because Claude Code does not load
`.github/instructions/notation.instructions.md` — VS Code Copilot and the coding agent do.
Keep the two lists identical.

1. **Quantity symbol italic, unit upright.** `<var>p</var><sub>celk</sub>`, `bar` never italic.
2. **`&nbsp;` between number and unit.** `20&nbsp;m`, never `20m`.
3. **Decimal comma in Czech content.** `2,81&nbsp;bar`, never `2.81 bar`.
4. **Pressure is lowercase *p*.** Partial pressure *p*<sub>O₂</sub>, not `ppO2`.
5. **Multi-letter abbreviations upright.** GF, MOD, NDL, SAC, OTU.

Introducing a new quantity or symbol? Add it to `docs/notation/glossary.md` in the same
commit. A glossary that has fallen behind is worse than none.
```

- [ ] **Step 2: Add the pointer to `.github/copilot-instructions.md`**

Insert immediately before `## ⚠️ IMPORTANT: Before Every Push`. Short — the digest already
reaches this agent automatically.

```markdown
## Notation

Physical quantities follow ČSN EN ISO 80000-1 and Czech typographic convention:
quantity symbols italic, units upright, `&nbsp;` between number and unit, decimal comma
in Czech, lowercase *p* for pressure.

Full rules: [`docs/notation/`](../docs/notation/). The digest in
`.github/instructions/notation.instructions.md` loads automatically when you edit HTML,
wiki pages, quiz data, or chart components.

Introducing a new quantity or symbol? Add it to `docs/notation/glossary.md` in the same
commit.
```

- [ ] **Step 3: Verify the five rules match across both files**

The two lists are worded in different languages — `CLAUDE.md` is an English file, the
instructions digest is Czech — so comparing prose would always fail. Compare the canonical
examples instead; those are language-independent and are what actually drifts.

```bash
python3 - <<'PY'
import re
def tokens(path, heading):
    t = open(path, encoding='utf-8').read()
    m = re.search(rf'^##+ {re.escape(heading)}.*?$(.*?)(?=^##\s|\Z)', t, re.M | re.S)
    if not m:
        return None, None
    rules = re.findall(r'^\d\.\s+(.+)$', m.group(1), re.M)
    return len(rules), sorted({x for r in rules for x in re.findall(r'`([^`]+)`', r)})

na, ta = tokens('.github/instructions/notation.instructions.md', 'Pět pravidel')
nb, tb = tokens('CLAUDE.md', 'Notation (CRITICAL)')
print('instructions:', na, 'pravidel')
print('CLAUDE.md   :', nb, 'pravidel')
print('shodné:', na == nb == 5 and ta == tb)
print('jen v instructions:', sorted(set(ta or []) - set(tb or [])) or '—')
print('jen v CLAUDE.md   :', sorted(set(tb or []) - set(ta or [])) or '—')
PY
```

Expected: both files report 5 rules, `shodné: True`, and both difference lines `—`.

The match is **scoped to the two headings** because `CLAUDE.md` already contains 12 other
numbered list items — an unscoped regex picks up `npm test` and the quiz steps and is
useless. Both headings must therefore be spelled exactly as written in Steps 1 and 2 of
this task and in Task 4.

Verified behaviour: with the rules in sync this prints `shodné: True`; changing
`20&nbsp;m` to `20 m` in one file alone prints `shodné: False` and names the token on each
side. A mismatch is the drift this structure exists to prevent — fix it before committing.

- [ ] **Step 4: Verify the relative link from `.github/` resolves**

```bash
test -d .github/../docs/notation && echo "OK — ../docs/notation/ existuje" || echo "ROZBITÝ ODKAZ"
```

Expected: `OK — ../docs/notation/ existuje`

- [ ] **Step 5: Confirm nothing else in the two files moved**

```bash
git --no-pager diff --stat CLAUDE.md .github/copilot-instructions.md
```

Expected: insertions only, zero deletions. A deletion means an existing section was
clobbered — revert and redo the insert.

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: `273/273 passed`

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md .github/copilot-instructions.md
git commit -m "docs(notation): wire the notation rules into agent instructions

CLAUDE.md carries the five rules inline because Claude Code does not
read .github/instructions/; copilot-instructions.md only points, since
the digest reaches that agent automatically. Both files say so, so the
duplication is not mistaken for an oversight and tidied away.

Adds the glossary-drift rule, phrased to match the existing wiki-drift
warning.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Hand the audit to the issues and remove the scratch file

**Files:**
- Delete: `docs/notation/_research-source.md`

**Interfaces:**
- Consumes: `_research-source.md` §10 (audit) and §11 (phase-2 plan) — the only sections
  not distributed into the three documents.

- [ ] **Step 1: Confirm nothing references the scratch file**

```bash
grep -rn '_research-source' docs/ .github/ CLAUDE.md wiki/ 2>/dev/null | grep -v 'docs/notation/_research-source.md:'
```

Expected: no output. Any hit is a link that will break on deletion — remove it first.

- [ ] **Step 2: Post the audit to the four issues**

Each issue gets the slice of `§10` that concerns it, with file:line evidence, plus a link to
the now-committed rules. Keep them short; the detail lives in the documents.

```bash
gh issue comment 60 --body "Rozsah doložen auditem: ~190 výskytů čísla nalepeného na jednotku v 19 souborech — \`pressure.html\` 57, \`tissue-loading.html\` 28, \`gradient-factors.html\` 21.

Pravidlo je nově zapsané v \`docs/notation/style-guide.md\` (mezera povinná a **nedělitelná**, ÚJČ §785 a §880) a zapisuje se entitou \`&nbsp;\`.

Pozor na dvě věci, které chybami nejsou: \`12litrový\` je správná složenina a \`60°\` se píše bez mezery."

gh issue comment 61 --body "Zapracováno do \`docs/notation/glossary.md\`.

Kanonicky *p*<sub>O₂</sub> — malé kurzívní *p*, stojatý index — přesně podle \`p_celk = p_O₂ + p_N₂\`. \`ppO₂\` zůstává jako hovorové synonymum, ve vzorci ne.

Audit našel i rozpor mezi jazyky: české stránky používaly \`ppO₂\`, anglické a španělské \`pO₂\` — tedy různé značky pro tutéž veličinu. Sjednotí se.

K nevykresleným indexům: příčinou je, že \`<em>\` se používá jako značka veličiny (58× v datech kvízů). Správně je \`<var>\` + \`<sub>\`, vzory jsou v \`docs/notation/authoring.md\`."

gh issue comment 62 --body "Konvence sepsány v \`docs/notation/\`.

Klíčové zjištění k LaTeXu: \`P_{amb}\` vysází index **kurzívou** a proloží ho jako součin a·m·b. Správně \`p_{\\mathrm{amb}}\`. Týká se ~49 bloků vzorců v 6 souborech a pěti stránek wiki.

Dále: \`T_{1/2}\` → \`t_{1/2}\` (Bühlmannova notace) a \`GF\` stojatě, protože kurzíva se čte jako součin *G*·*F*.

Převodní tabulka současný stav → správně je v \`docs/notation/authoring.md\`."

gh issue comment 56 --body "Zaznamenáno v \`docs/notation/glossary.md\` §4: *f*<sub>O₂</sub> je objemový zlomek (0–1), koncentrace se uvádí v procentech.

Ve výkladu se tedy počítá z koncentrace (21 %), jak ji ukazují analyzátory; zlomek zůstává jen uvnitř výpočtu.

Pozor na české pravidlo, které tu hraje roli: \`32 %\` je podstatné jméno („třicet dva procent\"), \`32%\` přídavné („dvaatřicetiprocentní\"). Ve větě „obsah kyslíku je 32 %\" musí být mezera."
```

- [ ] **Step 3: Verify the comments landed**

```bash
for n in 56 60 61 62; do
  echo "--- #$n"
  gh issue view $n --json comments -q '.comments[-1].body' | head -3
done
```

Expected: the first lines of each comment posted in Step 2.

- [ ] **Step 4: Delete the scratch file**

```bash
git rm docs/notation/_research-source.md
```

- [ ] **Step 5: Verify the three documents stand alone**

```bash
ls docs/notation/
python3 /tmp/notation-check.py docs/notation/*.md
```

Expected: exactly `authoring.md  glossary.md  style-guide.md`, and
`OK — dokument dodržuje vlastní pravidla`.

- [ ] **Step 6: Final gate**

```bash
npm test
git --no-pager status --short
git --no-pager diff HEAD --stat -- sw.js css/styles.css
```

Expected: `273/273 passed`; a clean tree apart from the staged deletion; and **empty output**
from the third command — confirming no cache-version bump, as intended for documentation.

- [ ] **Step 7: Commit**

```bash
git commit -m "docs(notation): drop the research scratch file

Its content now lives in glossary.md, style-guide.md and authoring.md.
The current-state audit and the phase-2 plan went to issues #56, #60,
#61 and #62 instead — they describe a state that changes as soon as
the cleanup starts, and a document that lies within a month does not
belong in the repo.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## What this plan deliberately does not do

Recorded so a reviewer does not mistake these for omissions. Each is phase 2:

- The content sweep: ~190 number–unit spaces, 58 `<em>` → `<var>`, LaTeX `\mathrm{}`
  conversion in wiki and theory pages, decimal comma in chart output.
- Installing the CSS block into `css/styles.css`.
- Creating `js/katexMacros.js` and `js/format.js`.
- Lint wired into `npm test`.
- Renaming `ambientPressure` → `pAmb` and friends.
- Czech diving **vocabulary** (#58 `Nádrž`, #59 `odvětí`) — word choice, not notation.
