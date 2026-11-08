// Kurz P1 a české pojmy: za jednopísmennou předložkou nebo spojkou (k, s, v, z, o, u, a, i) stojí
// v textu nedělitelná mezera, aby slovo nezůstalo samo na konci řádku (NB1, docs/course/slides.md §1).
// Kontroluje se jen text prvků. Atributy, komentáře, <script>, <style>, <code>, <pre> a proměnné
// v <var> do textových uzlů nepatří nebo se přeskakují.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const ROOT = new URL('../', import.meta.url);
const pages = (dir) => readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith('.html')).map((f) => dir + f);
const PAGES = [...pages('p1/'), ...pages('concepts/cs/')];

const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'VAR']);
const NBSP = ' ';
const LETTER = '[ksvzouaiKSVZOUAI]';
// Písmeno na hranici slova, za ním obyčejná mezera nebo zalomení. Před písmenem nesmí být písmeno, číslice
// ani nedělitelná mezera po čísle: „10 s“ je jednotka sekunda, ne předložka.
const BAD = new RegExp(`(^|[^\\p{L}\\p{N}_\\-/.'’${NBSP}]|(?:^|[^\\p{L}\\p{N}])${LETTER}${NBSP})(${LETTER})[ \\t\\n]+(?=\\S|$)`, 'gu');

function offenders(rel) {
    const doc = new JSDOM(readFileSync(new URL(rel, ROOT), 'utf8')).window.document;
    const walker = doc.createTreeWalker(doc.documentElement, 4 /* NodeFilter.SHOW_TEXT */);
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let el = node.parentElement;
        while (el && !SKIP.has(el.tagName.toUpperCase())) el = el.parentElement;
        if (el) continue;
        const t = node.data;
        for (const m of t.matchAll(BAD)) {
            const end = m.index + m[0].length;
            // Mezera na konci uzlu vadí, jen když za ní pokračuje text v dalším prvku („a <strong>…“).
            if (end === t.length && !(node.nextSibling && node.nextSibling.nodeType === 1)) continue;
            found.push(`${rel}: …${t.slice(Math.max(0, m.index - 20), end + 20).replace(/\s+/g, ' ')}…`);
        }
    }
    return found;
}

test('za jednopísmennou předložkou a spojkou je v textu nedělitelná mezera (p1/ a concepts/cs/)', () => {
    assert.ok(PAGES.length >= 19, 'stránky kurzu i české pojmy');
    const bad = PAGES.flatMap(offenders);
    assert.deepEqual(bad, []);
});

test('kontrola nálezy opravdu hlásí a jednotky ani atributy nebere', () => {
    const doc = (body) => new JSDOM(`<p>${body}</p>`).window.document.body.firstChild.firstChild.data;
    const hits = (s) => [...s.matchAll(BAD)].map((m) => m[2]);
    assert.deepEqual(hits(doc('tlak v hloubce a proto')), ['v', 'a']);
    assert.deepEqual(hits(doc('za 10&nbsp;s se vyrovná')), []);
    assert.deepEqual(hits(doc('v&nbsp;hloubce a&nbsp;s&nbsp;tlakem')), []);
    assert.deepEqual(hits(doc('a&nbsp;s tlakem')), ['s']);
    assert.deepEqual(hits(doc('Vitamin A, typ-a b')), []);
    const attr = new JSDOM('<p title="v hloubce">x</p>').window.document.querySelector('p');
    assert.equal(attr.firstChild.data, 'x');
});
