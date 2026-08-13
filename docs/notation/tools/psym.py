#!/usr/bin/env python3
"""Značka tlaku: velké P -> kurzívní malé p.

    python3 docs/notation/tools/psym.py --check pressure.html
    python3 docs/notation/tools/psym.py --fix locales/cs.json

ČSN EN ISO 80000-1 kap. 7: tlak má značku *p*, malé a kurzívou. Projekt psal
`P<sub>amb</sub>`, `P_{amb}` i `P_amb`. Pravidla jsou v docs/notation/,
kanonický tvar v glossary.md, mechanika v authoring.md §1.2.

Index se NEPŘEKLÁDÁ. Glossary sice chce český index (`p_okol`), ale sama si
poznamenává, že popisky grafů jsou sdílené přes CZ/EN/ES a lokalizace indexů
si vyžádá jejich převod do i18n. To je samostatná úloha; tenhle nástroj mění
jen velikost a řez značky, text indexu nechává být.

Tři povrchy, tři cílové tvary:

  HTML/innerHTML   P<sub>amb</sub>  ->  <var>p</var><sub>amb</sub>
  KaTeX            P_{amb}          ->  p_{\\mathrm{amb}}
  prostý text      P_amb            ->  p_amb

Prostý text je popisek na canvasu Chart.js. HTML se tam nevykreslí a kurzívu
nelze zapnout uprostřed řetězce, takže zbývá opravit aspoň velikost písmene -
což je věcně to, co oponent vytkl.
"""
import argparse
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from nbsp import html_masked_ranges, walk, SKIP_KEYS  # noqa: E402

# Popisný index (slovo nebo zkratka) se v KaTeX sází stojatě přes \mathrm.
# Číslice a jednopísmenné indexy typu P_1, P_2 zůstávají bez \mathrm -
# \mathrm{2} je zbytečné, číslice jsou stojatě samy o sobě.
KATEX = re.compile(r"\bP_\{([A-Za-z][A-Za-z0-9,]*)\}")
KATEX_DIGIT = re.compile(r"\bP_\{(\d+)\}|\bP_(\d)\b")
HTML_SUB = re.compile(r"\bP(<sub>[^<]{1,12}</sub>)")
PLAIN = re.compile(r"\bP_([A-Za-z][A-Za-z0-9]*)\b")
DELTA = re.compile(r"ΔP\b")


def fix_text(s, html_ok):
    """html_ok: smí se vložit <var>? Na canvasu ne."""
    n = [0]

    def bump(f):
        def g(m):
            n[0] += 1
            return f(m)
        return g

    s = KATEX.sub(bump(lambda m: "p_{\\mathrm{%s}}" % m.group(1)), s)
    s = KATEX_DIGIT.sub(
        bump(lambda m: "p_{%s}" % m.group(1) if m.group(1) else "p_%s" % m.group(2)), s
    )
    if html_ok:
        s = HTML_SUB.sub(bump(lambda m: "<var>p</var>" + m.group(1)), s)
    else:
        s = HTML_SUB.sub(bump(lambda m: "p" + m.group(1)), s)
    s = PLAIN.sub(bump(lambda m: "p_" + m.group(1)), s)
    s = DELTA.sub(bump(lambda m: "Δp"), s)
    return s, n[0]


def process_html(raw, report, label):
    """V HTML se opravuje jen text, který uživatel vidí.

    Zóny se nedají převzít z nbsp.py beze změny. Tamní `html_allowed`
    maskuje i vnitřek každého tagu, což je u mezer správně, ale tady ne -
    shoda `P<sub>amb</sub>` přes tagy schválně přesahuje. Rozhoduje proto
    pozice samotného `P`, ne celý rozsah shody.
    """
    masked = html_masked_ranges(raw)
    tags = [(m.start(), m.end()) for m in re.finditer(r"<[^>]*>", raw)]
    # Vzorec smí projít, ale jen KaTeX převodem. Kód a skripty vůbec ne.
    formula = [
        (s, e) for s, e in masked
        if re.match(r"<(?!script|style|pre|code|!--)", raw[s:e], re.I)
        or raw[s:e].startswith("$") or raw[s:e].startswith("data-latex")
    ]

    def zone(pos):
        for s, e in tags:
            if s <= pos < e:
                return "tag"
        for s, e in formula:
            if s <= pos < e:
                return "formula"
        for s, e in masked:
            if s <= pos < e:
                return "skip"
        return "text"

    out = []
    last = 0
    n = 0
    pats = [KATEX, KATEX_DIGIT, HTML_SUB, PLAIN, DELTA]
    hits = sorted({(m.start(), m.end()) for p in pats for m in p.finditer(raw)})
    merged = []
    for s, e in hits:
        if merged and s < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    for s, e in merged:
        if s < last:
            continue
        z = zone(s)
        if z in ("skip", "tag"):
            continue
        frag = raw[s:e]
        new, k = fix_text(frag, html_ok=(z == "text"))
        if k:
            out.append(raw[last:s])
            out.append(new)
            last = e
            n += k
            report.append((label, frag, new))
    out.append(raw[last:])
    return "".join(out), n


# Klíč, jehož hodnota se nikdy nevykreslí jako HTML. Popisky os a legend jdou
# na canvas Chart.js, kde by se <var> vypsal doslova. Poznat je nelze podle
# obsahu, jen podle klíče - proto výčet.
#
# Hint musí sedět na CELÝ segment cesty. Bez toho by `chartFormula` (což je
# HTML popis vzorce, ne popisek osy) propadl jako canvas a přišel by o <var>.
CANVAS_HINT = re.compile(
    r"(?:^|\.)(chart|axis|xAxis|yAxis|legend|tooltip|tissueSim)(?:\.|$)"
)


def process_json(raw, report, label):
    data = json.loads(raw)
    edits = {}
    n = 0
    for key, value in walk(data):
        if key.rsplit(".", 1)[-1].split("[")[0] in SKIP_KEYS:
            continue
        # Hodnota, která už obsahuje <sub>, prokazatelně končí v innerHTML -
        # jinak by se ta značka uživateli ukazovala doslova. Takové hodnotě
        # smíme <var> přidat. Bez <sub> to jistotu nemáme.
        html_ok = "<sub>" in value and not CANVAS_HINT.search(key)
        new, k = fix_text(value, html_ok)
        if not k:
            continue
        n += k
        edits.setdefault(value, (new, key))
        report.append((label + " " + key, value[:70], new[:70]))
    for old, (new, key) in edits.items():
        eo = json.dumps(old, ensure_ascii=False)
        en = json.dumps(new, ensure_ascii=False)
        if eo not in raw:
            print("  ! {} – nenalezeno".format(key), file=sys.stderr)
            continue
        raw = raw.replace(eo, en)
    return raw, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    total = 0
    for f in a.files:
        raw = open(f, encoding="utf-8").read()
        report = []
        if f.endswith(".html"):
            new, n = process_html(raw, report, f)
        elif f.endswith(".json"):
            new, n = process_json(raw, report, f)
        else:
            continue
        if not n:
            continue
        total += n
        print("{:44} {:4}".format(f, n))
        if a.verbose:
            for lbl, o, w in report[:400]:
                print("    {}\n      - {}\n      + {}".format(lbl, o, w))
        if a.fix and new != raw:
            open(f, "w", encoding="utf-8").write(new)
    print("\ncelkem: {}  ({})".format(total, "zapsáno" if a.fix else "jen kontrola"))
    return 1 if (total and not a.fix) else 0


if __name__ == "__main__":
    sys.exit(main())
