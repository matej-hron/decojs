# Physics Notation Documentation — Glossary, Style Guide, Agent Instructions

**Status:** approved, ready for planning
**Scope:** documentation only. No content sweep, no lint, no code changes.

---

## Background & Motivation

The garant review (Jiří Hovorka, 17 Jun 2026) flagged that our physical notation is
inconsistent. Four issues are still open and all four are notation problems:

| Issue | Feedback |
|---|---|
| #56 | Partial pressure should be presented via concentration (%), not fraction |
| #60 | `20 m`, not `20m` — "20m se čte dvacetimetrový" |
| #61 | Use `p_celk = p_O₂ + p_N₂`; subscripts don't render in small labels |
| #62 | Align all formulas to Czech school/university conventions |

A research pass established the normative basis (ČSN EN ISO 80000-1 ch. 7, ČSN 01 6910,
ÚJČ Internetová jazyková příručka) and audited the current state. The findings currently
live only in local session state — unversioned, invisible to other contributors, invisible
to agents at edit time, and impossible for the garant to review.

The audit found, among others:

- `<var>` appears nowhere in the repo; `<em>` is misused as a variable marker (58×).
- Czech UI renders decimal periods (`2.81 bar`) because every chart has its own `toFixed()` helper.
- LaTeX subscripts render italic (`P_{amb}`), violating ISO 80000-1.
- CZ uses `ppO₂` while EN/ES use `pO₂` — a different symbol, not just different formatting.
- Code carries the same split: `pAmb` (29×) alongside `ambientPressure` (31×).

This spec covers **only** getting the rules into the repository. Fixing the content is a
separate, larger job.

## Goals

1. A glossary of quantities that settles which symbol we use for what, reviewable by the
   garant and citable when two files disagree.
2. Written rules for Czech physics typography, with the reasoning and sources attached, so
   decisions can be challenged on their merits rather than re-litigated from memory.
3. Authoring patterns (HTML, CSS, KaTeX, number formatting) so a developer or agent knows
   the mechanics without reading the standards.
4. Automatic delivery of the rules to coding agents at the moment they edit an affected file.
5. A maintenance rule that keeps the glossary from drifting.

## Non-goals

- **Czech diving terminology.** Word choice — `odvětí` vs `vysycení` (#59), `Nádrž` vs
  `tlak v lahvi` (#58) — is vocabulary, not notation. It is also the area where research was
  weakest, since official SPČR materials were unreachable. Those two issues stay open and get
  resolved on their own, with the garant. This spec covers **how a physical quantity is
  written**, not which Czech word names it.
- The content sweep: ~190 missing number–unit spaces, 58 `<em>` → `<var>`, LaTeX `\mathrm{}`
  conversion, decimal comma in charts. **Phase 2, separate spec.**
- Lint / regex enforcement wired into `npm test`. Separate, and it depends on the sweep
  landing first — otherwise it fails from day one.
- Renaming JavaScript identifiers. The glossary records the canonical name; the rename is
  its own change with its own regression risk.
- Self-hosting KaTeX, `sw.js` caching fixes, i18n number formatting. Tracked elsewhere.

## Priority: Czech first

The Czech content is what an examination commission will judge, so CZ is the target and
EN/ES follow from it. Where a rule cannot be applied to all three languages in one step, the
Czech form is correct first and the others are allowed to lag.

This mainly affects the localized subscripts of section B3: *p*<sub>celk</sub> must be right
in Czech even if the English pages still read *p*<sub>tot</sub> inconsistently for a while.

---

## Decisions this documentation encodes

These are normative choices. Each carries its source so the garant can contest it.

| Decision | Basis |
|---|---|
| Pressure is lowercase italic *p*, never *P* | ISO 80000-4/-9, IUPAC, Czech school practice; garant #61 writes `p_celk` |
| Canonical partial pressure is *p*<sub>O₂</sub>; `ppO₂` is a colloquial diving synonym, never inside a formula | garant #61; resolves the existing CZ↔EN split |
| Half-time is *t*<sub>1/2</sub>, not `T_{1/2}` and not τ | Bühlmann's own notation; τ is a different quantity (t½ = τ·ln 2) |
| Multi-letter abbreviations (GF, SAC, MOD, NDL, OTU) are upright | ISO 80000-1 ch. 7 — italic would read as a product of single-letter symbols |
| Descriptive subscripts are localized; chemical subscripts are not | Hybrid rule, see section B3 |
| Quantity symbols italic, unit symbols upright | ČSN EN ISO 80000-1 ch. 7 |
| Descriptive subscripts upright, quantity/index subscripts italic | NIST SP 811 §10.2; IUPAC test: "quantities can be given a value, but labels cannot" |
| Number–unit binding is written `&nbsp;` | Already the house entity (67 uses); satisfies the ÚJČ non-breaking requirement — see section D1 |

**Language of the documents:** Czech. The garant is a primary reader, and the subject is
Czech typographic convention. This spec and the filenames stay English, matching the
other 15 specs and `docs/algorithm-reference.md`.

---

## A. File layout

```
docs/notation/
├── glossary.md      Slovník veličin — the centerpiece
├── style-guide.md   Notation rules + Czech typography + rationale and citations
└── authoring.md     Mechanics: HTML/CSS, KaTeX, i18n, number formatting

.github/instructions/notation.instructions.md   digest, conditionally loaded
.github/copilot-instructions.md                 pointer
CLAUDE.md                                       pointer + the five hard rules
```

Three documents rather than one because the two audiences want genuinely different things.
The garant needs the glossary and the reasoning; he should not have to wade through KaTeX
macros to verify that we write *p*<sub>celk</sub>. An agent editing `pressure.html` needs the
rule at that moment, not 45 footnotes.

**Normative content lives in exactly one place.** `notation.instructions.md` is deliberately
a digest that links onward, not a copy — there is nothing to drift. Where they disagree,
`docs/notation/` wins, and the instructions file says so.

## B. `docs/notation/glossary.md`

Seven sections rather than one wide table.

| § | Section | Contents |
|---|---|---|
| 1 | Jak slovník číst | symbol italic, unit upright, subscript by nature |
| 2 | Základní veličiny | pressure, depth, time, temperature, volume, density |
| 3 | Popisné indexy CZ↔EN | celk/tot, okol/amb, tkáň/tis — conversion table |
| 4 | Parciální tlaky a podíly plynů | *p*<sub>O₂</sub>, *f*<sub>O₂</sub>, concentration in % |
| 5 | Dekompresní model | *a*, *b*, GF, *t*<sub>1/2</sub>, *M* |
| 6 | Zkratky | MOD, NDL, SAC, OTU, CNS — upright |
| 7 | Špatně × správně | ✗ `ppO2` → ✓ *p*<sub>O₂</sub>; ✗ `20m` → ✓ `20 m` |

Roughly 70 entries, carried over from the research pass.

### B1. Columns

Sections 2, 4 and 5 use: `Veličina | Symbol | EN | Jednotka | V kódu | Pozn.`

Six columns is the practical maximum for GitHub table rendering.

### B2. The `V kódu` column

Records the canonical JavaScript identifier for each quantity. This is the bridge between
the physics symbol and the code, and it is what an agent needs when editing a chart.

The audit found competing names already in use — `pAmb` (29×) vs `ambientPressure` (31×),
`pTissue` (16×) vs `tissuePressure` (9×), `pAlv` vs `alveolarPressure`. The glossary names
one of each pair as canonical and marks the other as legacy. **It does not rename anything.**
The rename is a separate change; documenting the target first is what makes it possible later.

### B3. Section 3 and the hybrid subscript rule

Two kinds of subscript, treated differently:

- **Chemical** (`O₂`, `N₂`, `He`) — element symbols. Never translated, identical in every
  language.
- **Descriptive** (celkový, okolní, tkáňový) — abbreviated *words*, and words translate:
  `celk` ↔ `tot`, `okol` ↔ `amb`.

ISO 80000 is silent on which language a descriptive subscript uses; it only requires upright
type. The garant asked for `p_celk`, and Czech readers get Czech.

Keeping this as its own conversion table means each quantity is listed once with its base
symbol, instead of every row being duplicated per language.

**Consequence, deliberately deferred:** chart labels are shared across CZ/EN/ES, so localized
subscripts eventually require those labels to go through i18n. That cost lands in phase 2.
Documenting the rule now is what makes the phase-2 estimate honest.

### B4. Traceability

Every decision cites its source — an ISO 80000 clause, or the garant's own words with the
issue number. Disputed points (*p* vs *P*, `ppO₂` vs *p*<sub>O₂</sub>) get a short "decided
this way, because…" rather than a bare verdict, so the garant has something to argue with.

## C. `docs/notation/style-guide.md`

Garant-facing. Covers:

- Italic vs upright: quantities, units, subscripts, with the decision table.
- Case sensitivity for units and quantities.
- Czech typography: non-breaking space between number and unit, decimal comma, en dash for
  numeric ranges, U+2212 for minus, `×`/`·` for multiplication, the percent
  adjective/substantive distinction, `20 °C` with a space but `60°` without.
- Appendix: the normative sources and citations.

Two notes worth carrying over from the research, because both look like errors and are not:

- `12litrový` is a correct Czech compound adjective, not a spacing mistake.
- `kPa` in the quizzes is a verbatim citation of official SPČR exam wording and stays.

## D. `docs/notation/authoring.md`

Developer-facing mechanics:

- `<var>` for quantity symbols, and why `<em>` is wrong (it carries prosodic stress; the
  HTML spec names "a symbol identifying a physical quantity" as a `<var>` use case).
- The CSS block for `var`, `sub`, `sup`, `.unit`. No conflicting selectors exist today.
- KaTeX: `\mathrm{}` for descriptive subscripts, the proposed shared macro object, and the
  constraint that GitHub wiki math supports no user-defined macros, so wiki pages spell
  `\mathrm{...}` out every time.
- Number formatting: `Intl.NumberFormat` for `cs-CZ`, including the U+202F group separator
  that breaks `parseFloat` and string-comparison tests.
- Unicode reference: `₂`, `°`, `−`, `–`, `×`, `·`, non-breaking space.

### D1. Which non-breaking space — decided

**Author with the `&nbsp;` entity (U+00A0).** Not U+202F, not a literal character.

The repository already settles this: 67 `&nbsp;` entities are in use, and there is not a
single U+202F or literal U+00A0 anywhere. ÚJČ requires the space to be non-breaking and says
nothing about width; the SI Brochure prefers a thin space, but that is a typographic
refinement, not a Czech requirement. Following the house entity costs nothing and satisfies
the rule the commission would actually check.

The entity also beats a literal character on maintainability: a literal U+00A0 is invisible
in a diff, indistinguishable from a normal space during review, and easily destroyed by
editors and formatters.

**U+202F still has to be documented, for a different reason.** `Intl.NumberFormat` with
`cs-CZ` emits U+202F as the thousands separator — so it appears in *generated* output whether
we ask for it or not. `authoring.md` must warn that code and tests may not assume an ASCII
space when parsing or comparing formatted numbers. That is a consumption rule, not an
authoring one.

Existing `&nbsp;` uses are mostly layout indentation rather than number–unit binding. That is
a separate misuse; this spec neither depends on it nor fixes it.

Presented as patterns to copy. No code is changed by this spec.

## E. `.github/instructions/notation.instructions.md`

About 50 lines. Frontmatter:

```yaml
---
applyTo: "**/*.html, wiki/**/*.md, data/*.json, locales/*.json, js/charts/*.js, js/components/*.js"
---
```

Deliberately excludes `js/decoModel.js`, `js/tissueCompartments.js`, `tests/**` and
`docs/superpowers/**` — no user-visible notation lives there, and including them would spend
agent context for nothing.

Contents: the five hard rules below, the špatně × správně table, a link to the glossary, and
an explicit line stating that `docs/notation/` is canonical if the two ever disagree.

**The five hard rules** — the ones that must be known without opening anything else:

1. Quantity symbol italic, unit upright: `<var>p</var><sub>celk</sub>`, `bar` never italic.
2. Non-breaking space between number and unit, written `&nbsp;`: `20&nbsp;m`, never `20m`.
3. Decimal comma in Czech content: `2,81 bar`, never `2.81 bar`.
4. Pressure is lowercase *p*; partial pressure is *p*<sub>O₂</sub>, not `ppO2`.
5. Multi-letter abbreviations upright: GF, MOD, NDL, SAC, OTU.

## F. Pointers

`.github/copilot-instructions.md` gets a short `## Notation` section pointing at
`docs/notation/`.

`CLAUDE.md` gets the same pointer **plus the five hard rules from section E inline**. This
asymmetry is intentional and must be commented in both files so it does not get "tidied up":
VS Code Copilot and the coding agent read `.github/instructions/`, Claude Code does not — it
only reads `CLAUDE.md`. Without the inline rules, Claude Code sessions get no notation
guidance at all.

Both pointers follow the house heading style already used in those files.

## G. Maintenance

One rule, added to `CLAUDE.md` alongside the existing wiki-drift warning and phrased to match
its tone:

> Zavádíš-li novou veličinu nebo značku, přidej ji do `docs/notation/glossary.md` ve stejném
> commitu. Slovník, který zaostal, je horší než žádný.

## H. Source material

The research pass output (~55k characters, 45 footnotes) is the input:

```
~/.copilot/session-state/20e5f855-e60a-42d1-bde0-f1e495d7c750/research/
  najdi-spravne-znaceni-fyzikalnich-zapisu-v-cr-musi.md
```

**This path is session-local and will not survive.** Before starting, copy the report to
`docs/notation/_research-source.md` as a scratch working copy, and delete it in the final
commit once its content has been distributed. Nothing downstream may reference it.

It is reorganized, not copied wholesale:

| Research section | Destination |
|---|---|
| Normative framework, italic/upright, case, Czech typography | `style-guide.md` |
| Slovníček veličin, disputed points | `glossary.md` |
| HTML/CSS patterns, KaTeX, number formatting | `authoring.md` |
| Current-state audit, phase-2 plan | **Not committed** — posted as comments on #56/#60/#61/#62 |

The audit describes a state that changes the moment phase 2 starts. A document that will lie
within a month does not belong in the repository; on the issues it is exactly the right
evidence for the work it describes.

## I. Verification

This change touches documentation only.

- `npm test` must pass unchanged. No test is added — there is no behaviour to test.
- **No cache version bump.** Verified against history: 28 of the last 28 documentation-only
  commits leave `sw.js` untouched, because nothing served to the browser changes.
- Nothing is added to `STATIC_ASSETS`.
- Manual check: the glossary tables render correctly on GitHub, since that is where the
  garant will read them.

Commit message convention: `docs(notation): …`, matching `docs(wiki):` and `docs(spec):`.

---

## Build Order

1. `docs/notation/glossary.md` — the centerpiece; everything else references it.
2. `docs/notation/style-guide.md` — rules and rationale.
3. `docs/notation/authoring.md` — mechanics.
4. `.github/instructions/notation.instructions.md` — digest with `applyTo`.
5. Pointers in `.github/copilot-instructions.md` and `CLAUDE.md`, plus the maintenance rule.
6. Post the audit as comments on #56/#60/#61/#62.

Steps 1–3 are separable and reviewable on their own. Step 5 is last so the pointers describe
documents that already exist.

## Open Questions

None. The three questions raised during design are settled:

| Question | Resolution |
|---|---|
| Czech diving terminology rests on weak sources | Out of scope — this spec covers physics notation, not vocabulary. #58/#59 stay open separately. |
| U+00A0 or U+202F? | `&nbsp;` (U+00A0), matching the 67 existing uses. U+202F documented only as generated `Intl` output. See D1. |
| Garant review before or after merge? | After. The work lands on `main` and he sees the finished product; his review does not block. |
