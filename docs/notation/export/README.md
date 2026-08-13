# Export slovníčku do Wordu

`slovnicek-velicin.docx` je verze [`../glossary.md`](../glossary.md) pro sdílení
s garantem / školitelem, který markdown nečte.

## Regenerace

Po každé změně `glossary.md`:

```bash
npm install docx          # není závislost projektu, instaluj mimo repo nebo globálně
node docs/notation/export/md-to-docx.js docs/notation/glossary.md \
     docs/notation/export/slovnicek-velicin.docx
```

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

Očekávané hodnoty: kurzíva ≈ 121, indexy ≈ 65, uniklý markup **0**.
