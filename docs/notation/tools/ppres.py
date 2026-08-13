#!/usr/bin/env python3
"""Parciální tlaky: ppO2 / <em>pp</em>O₂ -> <var>p</var><sub>O₂</sub>.

    python3 docs/notation/tools/ppres.py --check pressure.html
    python3 docs/notation/tools/ppres.py --fix locales/cs.json data/quiz-physics.json

Glossary §4 to říká přesně:

    „ppO₂ je hovorové synonymum, ne značka. Kanonicky p_O₂. ppO₂ smí zůstat
    ve varovných hláškách a popiscích grafů; ve vzorci nikdy."

Ta výjimka není libovůle - na canvasu Chart.js a v `alert()` se HTML nevykreslí,
takže tam kurzívu ani dolní index zapsat nelze a `ppO₂` je nejmenší zlo. Nástroj
proto sahá jen na text, o kterém umí dokázat, že končí v `innerHTML`, plus na
vzorce KaTeX. Prostý text nechává být.

Důkaz cíle: hodnota obsahující libovolný HTML tag prokazatelně jde do innerHTML -
jinak by uživatel ten tag viděl doslova. Klíč sám o sobě nic nedokazuje.

Angličtina a španělština už `pp` zahodily (`<em>p</em>O₂`), čeština ne
(`<em>pp</em>O₂`). Sjednocuje se na kanonický tvar podle glossary.

Zároveň se sází stojatě značka objemového zlomku: `F_{O_2}` -> `f_{\\mathrm{O_2}}`
(glossary §4 má *f*, malé a kurzívou - velké F je značka síly).
"""
import argparse
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from nbsp import walk  # noqa: E402
from psym import process_html, process_json, CANVAS_HINT  # noqa: E402

# Plyny, u kterých má značka smysl. `H₂O` je tlak vodní páry, ne parciální
# tlak dýchaného plynu, ale zapisuje se stejně.
GASES = ["O₂", "O2", "N₂", "N2", "CO₂", "CO2", "H₂O", "H2O", "He"]
GAS = "(?:%s)" % "|".join(GASES)

SUBSCRIPT = {"0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
             "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉"}


def norm(gas):
    """O2 -> O₂. V dolním indexu se číslice píše jako dolní index."""
    return "".join(SUBSCRIPT.get(c, c) for c in gas)


# <em>pp</em>O₂ i <em>p</em>O₂ - obojí je značka vysázená obyčejným
# zvýrazněním. <em> je sémanticky důraz, ne značka veličiny (authoring.md §1.2).
EM = re.compile(r"<em>pp?</em>\s*(%s)\b" % GAS)
# Holé ppO₂ / pO₂ v próze. Před značkou nesmí být písmeno, tečka ani `<` -
# to by byl identifikátor (`options.ppO2`, `datasetPpO2`), konec jiného slova
# nebo název tagu (`<p>O₂`). `>` se naopak vylučovat nesmí: text hned za tagem
# (`<li>ppN₂`) je běžná próza a dřív kvůli tomu propadal.
BARE = re.compile(r"(?<![\w.<\/])pp?(%s)\b" % GAS)
# `ppN₂<sub>tissue</sub>` nese druhý index hned za značkou. Musí se chytit
# jedním vzorem - process_html predava fixeru jen samotnou shodu, takze
# dodatecne slucovani indexu by tam nemelo co slucovat.
BARE_SUB = re.compile(r"(?<![\w.<\/])pp?(%s)<sub>([^<]{1,14})</sub>" % GAS)
# KaTeX. ppO_2 i pp_{inert}; index popisný -> \mathrm, chemický vzorec taky
# (H_2O ve stojatém řezu, číslice jsou dolní index sazby).
KTX_BRACE = re.compile(r"\bpp(O|N|CO|H)_\{([^}]+)\}")
KTX_GAS = re.compile(r"\bpp(%s)\b" % "(?:O_2|N_2|CO_2|He)")
KTX_SUB = re.compile(r"\bpp_\{([^}]+)\}")
# Objemový zlomek: glossary §4 má *f*, ne F (velké F je síla).
KTX_FRAC = re.compile(r"\bF_\{([^}]+)\}")
EM_FRAC = re.compile(r"<em>f</em>\s*(%s)\b" % GAS)
BARE_FRAC = re.compile(r"(?<![\w.<\/])f(%s)\b" % GAS)
MERGE_SUB = re.compile(r"(<var>[pf]</var><sub>[^<]*)</sub>\s*<sub>([^<]*)</sub>")


def fix_text(s, html_ok):
    """html_ok: smí se vložit <var>/<sub>? Na canvasu a v alertu ne.

    Bez html_ok se nedělá nic - `ppO₂` je tam podle glossary přípustné a
    `pO₂` by byla změna bez přínosu.
    """
    n = [0]

    def bump(f):
        def g(m):
            n[0] += 1
            return f(m)
        return g

    # KaTeX projde vždy; ve vzorci je `pp` zakázané bez výjimky.
    s = KTX_BRACE.sub(bump(lambda m: "p_{\\mathrm{%s_%s}}" % (m.group(1), m.group(2))), s)
    s = KTX_GAS.sub(bump(lambda m: "p_{\\mathrm{%s}}" % m.group(1)), s)
    s = KTX_SUB.sub(bump(lambda m: "p_{\\mathrm{%s}}" % m.group(1)), s)
    s = KTX_FRAC.sub(bump(lambda m: "f_{\\mathrm{%s}}" % m.group(1)), s)
    if html_ok:
        s = EM.sub(bump(lambda m: "<var>p</var><sub>%s</sub>" % norm(m.group(1))), s)
        s = EM_FRAC.sub(bump(lambda m: "<var>f</var><sub>%s</sub>" % norm(m.group(1))), s)
        s = BARE_SUB.sub(bump(lambda m: "<var>p</var><sub>%s,%s</sub>" % (norm(m.group(1)), m.group(2))), s)
        s = BARE.sub(bump(lambda m: "<var>p</var><sub>%s</sub>" % norm(m.group(1))), s)
        s = BARE_FRAC.sub(bump(lambda m: "<var>f</var><sub>%s</sub>" % norm(m.group(1))), s)
        # `ppN₂<sub>max</sub>` nese druhý index už v předloze. Bez sloučení by
        # vznikly dva sousední <sub> vedle sebe, což je typograficky nesmysl -
        # víceslovný index se odděluje čárkou (ISO 80000-1, čl. 7.2.2).
        s = MERGE_SUB.sub(r"\1,\2</sub>", s)
    return s, n[0]


PATS = [KTX_BRACE, KTX_GAS, BARE_SUB, KTX_SUB, KTX_FRAC, EM, EM_FRAC, BARE, BARE_FRAC]

# HTML tag v hodnotě dokazuje innerHTML. Popisek grafu takový tag nikdy nemá -
# vykreslil by se doslova - takže se rozhodnutí neopírá o jméno klíče.
HAS_TAG = re.compile(r"<(?:em|strong|sub|sup|var|b|i|br|a|span|code)\b[^>]*>")


def family(path):
    """Soubory téhož klíčového prostoru napříč jazyky -> jedna rodina.

    Dva různé způsoby pojmenování:
      locales/cs.json, locales/en.json, locales/es.json    -> jazyk je název
      data/quiz-physics{,-en,-es}.json                     -> jazyk je přípona
    """
    d, _, name = path.rpartition("/")
    if re.fullmatch(r"(?:cs|en|es)\.json", name):
        return d or "."
    return (d or ".") + "/" + re.sub(r"-(?:en|es)\.json$", ".json", name)


def sink_keys(files):
    """Klíče, které prokazatelně končí v innerHTML - napříč jazyky.

    Sink je vlastnost klíče, ne jazykové mutace: `<em>` v české hodnotě
    dokazuje, že tentýž klíč projde `innerHTML` i v angličtině. Bez sjednocení
    by čeština dostala <var> a angličtina ne, což je přesně ta jazyková
    disparita, kterou má sjednocení odstranit.
    """
    out = {}
    for f in files:
        if not f.endswith(".json"):
            continue
        try:
            data = json.loads(open(f, encoding="utf-8").read())
        except ValueError:
            continue
        fam = family(f)
        for key, value in walk(data):
            if HAS_TAG.search(value):
                out.setdefault(fam, set()).add(key)
    return out


def i18n_sink_keys(files):
    """Klíče uvedené v `data-i18n` - průkazně innerHTML.

    js/i18n.js:99 dělá `el.innerHTML = translated`, bez výjimky. Přítomnost
    klíče v `data-i18n` je tedy tvrdší důkaz než hledání tagu v hodnotě:
    záhlaví tabulky `<th data-i18n="...">ppO₂ (bar)</th>` žádný tag nemá,
    a přesto se vykreslí jako HTML.

    `page.title` se naopak přiřazuje do `document.title` (i18n.js:106), což je
    prostý text - a `<title>` HTML nevykresluje vůbec.
    """
    keys = set()
    for f in files:
        if not f.endswith(".html"):
            continue
        raw = open(f, encoding="utf-8").read()
        for m in re.finditer(r'<(\w+)[^>]*\bdata-i18n="([^"]+)"', raw):
            tag, key = m.group(1).lower(), m.group(2)
            if tag == "title" or key == "page.title":
                continue
            keys.add(key)
    return keys


def make_html_ok(keys, i18n_keys=frozenset()):
    def html_ok_for(key, value):
        if CANVAS_HINT.search(key):
            return False
        return bool(HAS_TAG.search(value)) or key in keys or key in i18n_keys
    return html_ok_for


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    keys = sink_keys(a.files)
    i18n = i18n_sink_keys(a.files)
    total = 0
    for f in a.files:
        raw = open(f, encoding="utf-8").read()
        report = []
        if f.endswith(".html"):
            new, n = process_html(raw, report, f, pats=PATS, fixer=fix_text)
        elif f.endswith(".json"):
            new, n = process_json(raw, report, f, fixer=fix_text,
                                  html_ok_for=make_html_ok(keys.get(family(f), set()), i18n))
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
