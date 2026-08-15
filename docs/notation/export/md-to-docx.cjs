const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber, VerticalAlign,
} = require('docx');

const SRC = process.argv[2];
const OUT = process.argv[3];

const CONTENT_WIDTH = 9026; // A4 (11906) minus 2x 1440 margins

/* ---------- inline parser ---------- */
// Produces TextRun[] honouring: **bold**, *italic*, `code`, <sub>, <sup>,
// <var>/<em> (quantity symbol -> italic), <strong>, &nbsp; and &amp; entities.
function inline(text, inherited = {}) {
  const runs = [];
  let buf = '';

  const flush = () => {
    if (!buf) return;
    runs.push(new TextRun({
      text: decode(buf),
      italics: !!inherited.italics,
      bold: !!inherited.bold,
      subScript: !!inherited.sub,
      superScript: !!inherited.sup,
      font: inherited.code ? 'Consolas' : undefined,
      size: inherited.code ? 20 : undefined,
      color: inherited.code ? '8B2500' : undefined,
    }));
    buf = '';
  };

  const decode = (s) => s
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&#8239;/g, '\u202F')
    .replace(/&times;/g, '\u00D7')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // HTML tags carrying typographic meaning
    const tag = rest.match(/^<(sub|sup|var|em|strong|b|i|code)>([\s\S]*?)<\/\1>/);
    if (tag) {
      flush();
      const [, name, innerText] = tag;
      const next = { ...inherited };
      if (name === 'sub') next.sub = true;
      if (name === 'sup') next.sup = true;
      if (name === 'var' || name === 'em' || name === 'i') next.italics = true;
      if (name === 'strong' || name === 'b') next.bold = true;
      if (name === 'code') next.code = true;
      runs.push(...inline(innerText, next));
      i += tag[0].length;
      continue;
    }

    // stray/unsupported tag -> drop it rather than printing markup
    const stray = rest.match(/^<\/?[a-zA-Z][^>]*>/);
    if (stray) { flush(); i += stray[0].length; continue; }

    if (!inherited.code) {
      const code = rest.match(/^`([^`]+)`/);
      if (code) {
        flush();
        runs.push(...inline(code[1], { ...inherited, code: true }));
        i += code[0].length;
        continue;
      }
      const bold = rest.match(/^\*\*([^*]+)\*\*/);
      if (bold) {
        flush();
        runs.push(...inline(bold[1], { ...inherited, bold: true }));
        i += bold[0].length;
        continue;
      }
      const ital = rest.match(/^\*([^*]+)\*/);
      if (ital) {
        flush();
        runs.push(...inline(ital[1], { ...inherited, italics: true }));
        i += ital[0].length;
        continue;
      }
      // markdown link -> keep the label only; targets are repo-internal
      const link = rest.match(/^\[([^\]]+)\]\([^)]*\)/);
      if (link) {
        flush();
        runs.push(...inline(link[1], inherited));
        i += link[0].length;
        continue;
      }
    }

    buf += text[i];
    i++;
  }
  flush();
  return runs.length ? runs : [new TextRun({ text: '' })];
}

/* ---------- block parser ---------- */
const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const children = [];
let i = 0;

const isTableSep = (s) => /^\|[\s:|-]+\|$/.test(s.trim()) && s.includes('-');
const cells = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'B8C4CE' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Columns that exist for developers, not for a reviewer of the notation itself.
const DROP_COLUMNS = ['V kódu (kanonicky)', 'Legacy alias, ponechat', 'Doloženo'];

// Drop columns whose body cells are all empty or "—" (developer placeholders
// that would render as blank columns for a non-developer reader).
function pruneEmptyColumns(header, rows) {
  const keep = header.map((h, c) =>
    !DROP_COLUMNS.includes(h.trim()) &&
    rows.some((r) => {
      const v = (r[c] || '').trim();
      return v !== '' && v !== '—' && v !== '-';
    }));
  if (keep.every(Boolean) || !keep.some(Boolean)) return [header, rows];
  return [header.filter((_, c) => keep[c]), rows.map((r) => r.filter((_, c) => keep[c]))];
}

function makeTable(header0, rows0) {
  const [header, rows] = pruneEmptyColumns(header0, rows0);
  const n = header.length;
  const w = Math.floor(CONTENT_WIDTH / n);
  const widths = Array(n).fill(w);
  widths[n - 1] = CONTENT_WIDTH - w * (n - 1);

  const mkRow = (vals, isHead) => new TableRow({
    tableHeader: isHead,
    children: vals.slice(0, n).concat(Array(Math.max(0, n - vals.length)).fill('')).map((v, c) =>
      new TableCell({
        borders: BORDERS,
        width: { size: widths[c], type: WidthType.DXA },
        shading: isHead ? { fill: 'DCE6F1', type: ShadingType.CLEAR } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { before: 20, after: 20 },
          children: inline(v, isHead ? { bold: true } : {}),
        })],
      })),
  });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [mkRow(header, true), ...rows.map((r) => mkRow(r, false))],
  });
}

while (i < lines.length) {
  const line = lines[i];
  const t = line.trim();

  if (!t) { i++; continue; }

  // table
  if (t.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    const header = cells(t);
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      rows.push(cells(lines[i]));
      i++;
    }
    children.push(makeTable(header, rows));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    continue;
  }

  // headings
  const h = t.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    children.push(new Paragraph({
      heading: [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][lvl - 1],
      children: inline(h[2]),
    }));
    i++;
    continue;
  }

  // horizontal rule
  if (/^---+$/.test(t)) {
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } },
      spacing: { before: 120, after: 160 }, children: [],
    }));
    i++;
    continue;
  }

  // blockquote (may wrap over several lines)
  if (t.startsWith('>')) {
    const parts = [];
    while (i < lines.length && lines[i].trim().startsWith('>')) {
      parts.push(lines[i].trim().replace(/^>\s?/, ''));
      i++;
    }
    children.push(new Paragraph({
      indent: { left: 480 },
      spacing: { before: 80, after: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '8FAADC', space: 8 } },
      children: inline(parts.join(' ')),
    }));
    continue;
  }

  // list item (numbered or bulleted); continuation lines are indented
  const li = t.match(/^(\d+)\.\s+(.*)$/) || t.match(/^[-*]\s+(.*)$/);
  if (li) {
    const numbered = /^\d+\./.test(t);
    let body = numbered ? li[2] : li[1];
    i++;
    while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*\d]/.test(lines[i].trim().slice(0, 2))) {
      body += ' ' + lines[i].trim();
      i++;
    }
    children.push(new Paragraph({
      numbering: { reference: numbered ? 'nums' : 'bullets', level: 0 },
      spacing: { after: 60 },
      children: inline(body),
    }));
    continue;
  }

  // paragraph (join wrapped lines)
  const parts = [];
  while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|')
         && !lines[i].trim().startsWith('>') && !/^#{1,4}\s/.test(lines[i].trim())
         && !/^---+$/.test(lines[i].trim()) && !/^(\d+\.|[-*])\s/.test(lines[i].trim())) {
    parts.push(lines[i].trim());
    i++;
  }
  children.push(new Paragraph({
    spacing: { after: 120 },
    children: inline(parts.join(' ')),
  }));
}

/* ---------- document ---------- */
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Calibri', size: 21 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, font: 'Calibri', color: '1F3864' },
        paragraph: { spacing: { after: 160 }, outlineLevel: 0 } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Calibri', color: '2E75B6' },
        paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Calibri', color: '1F3864' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Calibri' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022',
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
      { reference: 'nums', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'DecoJS \u2014 decotheory.eu', size: 18, color: '808080' })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '', size: 18, color: '808080' }),
                   new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '808080' })],
      })] }),
    },
    children,
  }],
});

// Otisk předlohy se ukládá vedle dokumentu. Test v run-tests.mjs ho porovnává
// s aktuálním glossary.md, takže úprava slovníčku bez přegenerování shodí
// build — jinak školitel dostane tiše zastaralou verzi (stalo se u #91 a #98).
const stamp = () => {
  const hash = require('crypto').createHash('sha256')
    .update(fs.readFileSync(SRC)).digest('hex');
  fs.writeFileSync(OUT.replace(/\.docx$/, '.sha256'), `${hash}  ${SRC}\n`);
  return hash.slice(0, 12);
};

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(OUT, b);
  console.log('wrote', OUT, b.length, 'bytes; předloha', stamp());
});
