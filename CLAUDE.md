# CLAUDE.md

All project knowledge lives in `.github/copilot-instructions.md` — read it at the start of every session.

When working on HTML, wiki pages, JSON data, or JS files, also read `.github/instructions/notation.instructions.md` (VS Code Copilot applies this automatically by file pattern; Claude Code must read it manually).

When fixing or auditing notation, follow `.github/skills/fixing-physics-notation/SKILL.md`.

## Notation quick-reference

Physical quantities follow ČSN EN ISO 80000-1. Full rules in `docs/notation/` and `.github/instructions/notation.instructions.md`.

1. **Quantity symbol italic, unit upright.** `<var>p</var><sub>celk</sub>`, `bar` never italic.
2. **`&nbsp;` between number and unit.** Correct: `20&nbsp;m`; ✗ never `20m`, `20 m`, nor `&#8239;`/U+202F.
3. **Decimal comma in Czech content.** Correct: `2,81&nbsp;bar`; ✗ never `2.81 bar`.
4. **Pressure is lowercase *p*.** Partial pressure *p*<sub>O₂</sub>, not `ppO2`.
5. **Multi-letter abbreviations upright.** GF, MOD, NDL, SAC, OTU.

Introducing a new quantity or symbol? Add it to `docs/notation/glossary.md` in the same commit.
