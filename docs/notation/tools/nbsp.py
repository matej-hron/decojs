#!/usr/bin/env python3
"""Nedělitelná mezera mezi číslem a jednotkou.

    python3 docs/notation/tools/nbsp.py --check pressure.html
    python3 docs/notation/tools/nbsp.py --fix locales/cs.json

Pravidla jsou v docs/notation/. Nástroj řeší jen třídu 1 (mezera mezi
číslem a jednotkou); desetinnou čárku, značky tlaku a <var> nechává být,
aby byl diff po jedné třídě přehledný.

Oddělovač podle typu souboru:
  *.html  ->  &nbsp;    autor to píše ručně, ať je to v kódu vidět
  *.json  ->  U+00A0    data můžou skončit na canvasu i v textContent,
                        kde by se entita vypsala doslova

Do vzorců KaTeX, <script>, <style> ani do komentářů nesahá.
"""
import argparse
import json
import re
import sys
import unicodedata

NBSP = "\u00a0"

# Jednotky, u kterých je mezera povinná. '%' schválně chybí: '32% roztok'
# (přívlastek) i '32 %' (podstatné jméno) jsou správně, rozhodnout to umí
# jen člověk. Samotný stupeň '°' také ne - '60°' je azimut, píše se bez mezery.
UNITS = [
    "mmHg", "msw", "fsw", "kPa", "MPa", "hPa", "mbar", "bar", "Pa",
    "km", "cm³", "cm²", "cm2", "cm", "mm³", "mm²", "mm", "dm³", "dm²",
    "m³", "m²", "m2", "ml", "mg", "kg", "min", "°C", "°F", "atm", "at",
    "m", "l", "L", "h", "s", "g",
]
UNIT_RE = "|".join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True))

# Znaková třída se vypisuje ručně a neopírá se o \w. Python počítá mezi \w
# i horní index '²' (protože '²'.isalnum() je True), JavaScript ne - a stejné
# pravidlo hlídá i test v tests/run-tests.mjs. Kdyby se třídy rozešly, skript
# by '10 mm²' přeskočil a test by ho hlásil. Držet obě definice shodné.
CZ = "áäčďéěíĺľňóôöŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ"
WORD = "0-9A-Za-z_" + CZ

# Po jednotce nesmí následovat písmeno ani číslice, jinak je to slovo
# nebo identifikátor: '12litrový', '2hodinový', 'm3'.
PATTERN = re.compile(
    r"(?<![" + WORD + r".,])(\d+(?:[.,]\d+)?)([ ]?)("
    + UNIT_RE
    + r")(?![" + WORD + r"°])"
)

# Vypadá to jako chyba, ale není. Rozsah těchto shod se přeskakuje.
#   „12l lahev" = zkrácené „12litrová lahev", tedy složené přídavné jméno.
#   Mezera by z toho udělala „12 l lahev", což se česky nečte.
SKIP_LITERAL = re.compile(r"\d+\s?l\s+(lahv|láhv|lahev|láhev)", re.I)

# Vypsaný název jednotky, který čeština skloňuje: „2 bary", „v 10 metrech".
# Opravuje se jen mezera; tvar slova zůstává, jinak vznikne negramatická věta.
# Slepený zápis se tu neřeší - „10metrů" nikdo nepíše a „12litrový" je správně.
CS_WORDS = (
    r"bar|metr|centimetr|milimetr|kilometr|litr|mililitr|minut|sekund|vteřin|"
    r"hodin|den|dny|dnů|dní|kilogram|gram|tun|stupň|stupe|procent|promile|"
    r"atmosfér|pascal|kilopascal"
)
CS_WORD_PATTERN = re.compile(
    r"(?<![" + WORD + r".,])(\d+(?:[.,]\d+)?)( )("
    + CS_WORDS
    + r")([a-z" + CZ + r"]*)\b"
)

# Oddělovač tisíců (ČSN 01 6910): „600 000 Pa" se sází nedělitelnou mezerou,
# jinak číslo přeteče na konci řádku. Skupiny musí být přesně po třech
# číslicích, jinak jde o dvě čísla za sebou („v roce 1990 200 lidí").
# Vedoucí nula je vyloučená - žádné číslo nezačíná „0 123". Chrání to před
# souřadnicemi typu viewBox="0 0 480 180", i když ty vyřadí už zóny v HTML.
THOUSANDS_PATTERN = re.compile(
    r"(?<![" + WORD + r".,])([1-9]\d{0,2})((?:[ ]\d{3})+)(?![.,]?\d)"
)
# Jednotka hned za číslem, aby ji nález tisíců pohltil. Bez toho by se
# v „600 000 Pa" obě třídy překryly a mezera před Pa by zůstala obyčejná.
TRAILING_UNIT = re.compile(
    r"[ ](" + UNIT_RE + r")(?![" + WORD + r"°])"
)


def is_czech_word_char(ch):
    return ch.isalpha() or ch == "_"


# ---------------------------------------------------------------- HTML

def html_masked_ranges(text):
    """Úseky HTML, kam se nesmí sahat."""
    bad = []

    def add_all(pattern, flags=re.S | re.I):
        for m in re.finditer(pattern, text, flags):
            bad.append((m.start(), m.end()))

    add_all(r"<!--.*?-->")
    add_all(r"<script\b.*?</script\s*>")
    add_all(r"<style\b.*?</style\s*>")
    # Ukázky kódu se citují doslova - nedělitelná mezera by se zkopírovala s nimi.
    add_all(r"<pre\b.*?</pre\s*>")
    add_all(r"<code\b.*?</code\s*>")
    # Vzorce: <div class="formula">, <span class="formula-inline">
    add_all(r'<(\w+)[^>]*\bclass="[^"]*\bformula(-inline)?\b[^"]*"[^>]*>.*?</\1\s*>')
    # LaTeX v atributu
    add_all(r'\bdata-latex="[^"]*"')
    # $$...$$ a $...$
    add_all(r"\$\$.*?\$\$")
    add_all(r"(?<!\$)\$[^$\n]+\$(?!\$)")
    return bad


# Atributy, které uživatel opravdu vidí a které prohlížeč dekóduje.
VISIBLE_ATTRS = ("title", "alt", "placeholder", "aria-label", "content")


def html_allowed(text):
    """Vrátí funkci allowed(start, end) -> bool."""
    bad = html_masked_ranges(text)

    # Vnitřek každého tagu je zakázaný...
    tag_spans = [(m.start(), m.end()) for m in re.finditer(r"<[^>]*>", text)]
    bad.extend(tag_spans)

    # ...kromě hodnot viditelných atributů.
    good = []
    for ts, te in tag_spans:
        tag = text[ts:te]
        for m in re.finditer(
            r'\b(' + "|".join(VISIBLE_ATTRS) + r')\s*=\s*"([^"]*)"', tag, re.I
        ):
            good.append((ts + m.start(2), ts + m.end(2)))

    def allowed(s, e):
        for gs, ge in good:
            if gs <= s and e <= ge:
                return True
        for bs, be in bad:
            if s < be and bs < e:
                return False
        return True

    return allowed


def scan(text, use_words, allowed=None, use_thousands=False):
    """Vrátí seřazené nepřekrývající se nálezy: (start, end, náhrada, druh)."""
    skip = [(m.start(), m.end()) for m in SKIP_LITERAL.finditer(text)]

    def is_skipped(s, e):
        return any(ss < e and s < se for ss, se in skip)

    found = []
    for m in PATTERN.finditer(text):
        if m.group(2) == "":
            kind = "slepené"
        elif m.group(2) == " ":
            kind = "obyčejná mezera"
        else:
            continue
        found.append((m.start(), m.end(), m.group(1), m.group(3), kind, m))
    if use_thousands:
        for m in THOUSANDS_PATTERN.finditer(text):
            end = m.end()
            tail = TRAILING_UNIT.match(text, end)
            rest = m.group(2).lstrip(" ").replace(" ", "\0")
            if tail:
                end = tail.end()
                rest += "\0" + tail.group(1)
            found.append(
                (m.start(), end, m.group(1), rest, "oddělovač tisíců", m)
            )
    if use_words:
        for m in CS_WORD_PATTERN.finditer(text):
            found.append(
                (m.start(), m.end(), m.group(1), m.group(3) + m.group(4),
                 "skloňovaný název jednotky", m)
            )
    found.sort(key=lambda x: (x[0], -(x[1] - x[0])))

    out = []
    last_end = -1
    for start, end, num, unit, kind, m in found:
        if start < last_end:
            continue
        if is_skipped(start, end):
            continue
        if allowed is not None and not allowed(start, end):
            continue
        out.append((start, end, num, unit, kind, m))
        last_end = end
    return out


def apply(text, sep, use_words, report, label=None, allowed=None,
          use_thousands=False):
    hits = scan(text, use_words, allowed, use_thousands)
    if not hits:
        return text, 0
    out = []
    last = 0
    for start, end, num, unit, kind, m in hits:
        out.append(text[last:start])
        out.append((num + "\0" + unit).replace("\0", sep))
        last = end
        ctx = context(text, m, pad=22)
        report.append((kind, "{}: …{}…".format(label, ctx) if label else ctx))
    out.append(text[last:])
    return "".join(out), len(hits)


def fix_html(text, sep, report, use_words, use_thousands=False):
    allowed = html_allowed(text)
    new, _ = apply(text, sep, use_words, report, allowed=allowed,
                   use_thousands=use_thousands)
    return new


def context(text, m, pad=28):
    s = text[max(0, m.start() - pad):m.end() + pad].replace("\n", " ")
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- JSON

# Hodnoty pod těmito klíči nejsou text pro čtenáře, ale identifikátory,
# odkazy a technické kódy. „30m-deco-air" je id profilu; mezera by rozbila
# vyhledávání. Do těchto klíčů se nesahá bez ohledu na obsah.
SKIP_KEYS = {
    "id", "key", "slug", "code", "type", "href", "url", "src",
    "icon", "class", "className", "ref", "category",
}


def walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, "{}.{}".format(path, k) if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, "{}[{}]".format(path, i))
    elif isinstance(obj, str):
        yield path, obj


def fix_json(raw, sep, report, use_words, use_thousands=False):
    """Bodová záměna v surovém textu.

    json.load + json.dump by přeformátoval celý soubor (projekt odsazuje
    4 mezerami, json.dump píše 2) a z třinácti řádků by byly čtyři tisíce.
    """
    data = json.loads(raw)
    edits = {}

    for key, value in walk(data):
        leaf = key.rsplit(".", 1)[-1].split("[")[0]
        if leaf in SKIP_KEYS:
            continue
        local = []
        new, n = apply(value, sep, use_words, local, label=key,
                       use_thousands=use_thousands)
        if not n:
            continue
        edits.setdefault(value, [new, key, []])
        edits[value][2].extend(local)

    for old, (new, key, hits) in edits.items():
        enc_old = json.dumps(old, ensure_ascii=False)
        enc_new = json.dumps(new, ensure_ascii=False)
        if raw.count(enc_old) == 0:
            print("  ! {} – řetězec nenalezen".format(key), file=sys.stderr)
            continue
        raw = raw.replace(enc_old, enc_new)
        report.extend(hits)
    return raw


# ---------------------------------------------------------------- main

def separator_for(path):
    return "&nbsp;" if path.endswith(".html") else NBSP


def process(path, do_fix, use_words, use_thousands=False):
    raw = open(path, encoding="utf-8").read()
    sep = separator_for(path)
    report = []
    if path.endswith(".html"):
        new = fix_html(raw, sep, report, use_words, use_thousands)
    elif path.endswith(".json"):
        new = fix_json(raw, sep, report, use_words, use_thousands)
    else:
        print("přeskočeno (neznámý typ): {}".format(path), file=sys.stderr)
        return []
    if do_fix and new != raw:
        open(path, "w", encoding="utf-8").write(new)
    return report


def is_czech(path):
    """České soubory: cs.json a kvízy bez jazykové přípony."""
    if path.endswith("locales/cs.json"):
        return True
    if "/quiz-" in path or path.startswith("data/quiz-"):
        return not re.search(r"-(en|es)\.json$", path)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fix", action="store_true", help="zapsat změny")
    ap.add_argument("--check", action="store_true", help="jen vypsat")
    ap.add_argument(
        "--words",
        action="store_true",
        help="i skloňované názvy jednotek (jen české soubory)",
    )
    ap.add_argument(
        "--thousands",
        action="store_true",
        help="i oddělovač tisíců (600 000 -> 600<nbsp>000)",
    )
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    total = 0
    for f in a.files:
        rep = process(f, a.fix, a.words and is_czech(f), a.thousands)
        if not rep:
            continue
        total += len(rep)
        kinds = {}
        for k, _ in rep:
            kinds[k] = kinds.get(k, 0) + 1
        print("{:44} {:4}  {}".format(f, len(rep), kinds))
        if a.verbose:
            for k, ctx in rep[:500]:
                print("    [{}] {}".format(k, ctx))
    print("\ncelkem: {}  ({})".format(total, "zapsáno" if a.fix else "jen kontrola"))
    return 1 if (total and not a.fix) else 0


if __name__ == "__main__":
    sys.exit(main())
