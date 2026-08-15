# Export slovníčku do Wordu

`slovnicek-velicin.docx` je verze [`../glossary.md`](../glossary.md) pro sdílení
s garantem / školitelem, který markdown nečte.

## Regenerace

Po každé změně `glossary.md`:

```bash
npm install --no-save docx     # není závislost projektu
node docs/notation/export/md-to-docx.cjs docs/notation/glossary.md \
     docs/notation/export/slovnicek-velicin.docx
```

Přípona je **`.cjs`** schválně: `package.json` má `"type": "module"`, takže
soubor s `require()` a příponou `.js` skončí na `ReferenceError: require is
not defined`. (Do #106 tu byl `.js` a dokumentovaný příkaz nešel spustit.)

## Na regeneraci se nesmí zapomenout

Konvertor ukládá vedle dokumentu `slovnicek-velicin.sha256` — otisk předlohy,
ze které byl vyroben. Test `the exported glossary was generated from the
current source` ho porovnává s aktuálním `glossary.md`, takže **úprava
slovníčku bez přegenerování shodí `npm test`**.

Bez té pojistky export tiše zestárl: `glossary.md` se změnil v #91 a #98,
ale `.docx` zůstal z #81 a garantovi chyběla celá tabulka popisných indexů.

## Co konvertor dělá navíc

Slovníček je dokument **o typografii**, takže se markup nesmí ztratit:

- `*p*` → skutečná kurzíva, `<sub>amb</sub>` → skutečný dolní index
  (včetně vnořených případů jako `*c*<sub>*p*</sub>`)
- `&nbsp;` → U+00A0, ne doslovný text
- vypouští vývojářské sloupce (`V kódu`, `Legacy alias`, `Doloženo`) a sloupce
  vyplněné jen `—`; pro čtenáře, který kód needituje, jsou to prázdná místa
  a na A4 by tabulky rozbily

## Kontrola po vygenerování

```bash
python3 - <<'PY'
import zipfile
from xml.etree import ElementTree as ET
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
r=ET.fromstring(zipfile.ZipFile('docs/notation/export/slovnicek-velicin.docx').read('word/document.xml'))
on=lambda p,t:(e:=p.find(W+t)) is not None and e.get(W+'val') not in ('false','0')
it=sum(1 for x in r.iter(W+'r') if (p:=x.find(W+'rPr')) is not None and on(p,'i'))
sb=sum(1 for x in r.iter(W+'r') if (p:=x.find(W+'rPr')) is not None and (v:=p.find(W+'vertAlign')) is not None and v.get(W+'val')=='subscript')
txt=''.join(e.text or '' for e in r.iter(W+'t'))
leaks=sum(txt.count(x) for x in ['<sub>','&nbsp;','**','<var>'])
print(f'kurzíva={it} indexy={sb} nbsp={txt.count(chr(0xA0))} uniklý_markup={leaks}')
assert it>100 and sb>60 and leaks==0, 'konverze ztratila formátování'
print('OK')
PY
```

Očekávané hodnoty rostou se slovníčkem; podstatné je, že **uniklý markup je 0**
a že kurzíva i indexy jsou v řádu stovek, resp. desítek (po #106: 130 a 71).
