import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_ITEMS } from '../js/nav.js';
import { P1_CHAPTERS } from '../js/course/p1Course.js';
import { selectSiteFiles } from '../scripts/build-pages.mjs';

const KEYS = [
    ['nav', 'courses', 'label'],
    ['nav', 'courses', 'p1'],
    ['nav', 'courses', 'p1Density'],
    ['home', 'topics', 'courseP1'],
    ['home', 'topics', 'courseP1Desc'],
    ['home', 'topics', 'courseP1Links', 'overview'],
    ['home', 'topics', 'courseP1Links', 'density'],
    ['home', 'topics', 'statusNew'],
];

describe('Courses menu', () => {
    it('lists exactly the ready P1 chapters', () => {
        const courses = NAV_ITEMS.find(i => i.labelKey === 'nav.courses.label');
        assert.ok(courses, 'Courses menu item exists');
        const menu = courses.submenu.map(s => s.href).filter(h => h !== 'p1/index.html').sort();
        const ready = P1_CHAPTERS.filter(c => c.status === 'ready').map(c => `p1/${c.slug}.html`).sort();
        assert.deepEqual(menu, ready);
    });

    it('sits between Home and Sandbox', () => {
        const labels = NAV_ITEMS.map(i => i.labelKey);
        assert.equal(labels.indexOf('nav.courses.label'), labels.indexOf('nav.home') + 1);
        assert.equal(labels.indexOf('nav.sandbox.label'), labels.indexOf('nav.courses.label') + 1);
    });
});

describe('publishing', () => {
    it('ships p1/ and concepts/', () => {
        assert.deepEqual(selectSiteFiles(['p1/index.html', 'concepts/cs/x.html']), ['p1/index.html', 'concepts/cs/x.html']);
    });
});

describe('locales', () => {
    for (const lang of ['cs', 'en', 'es']) {
        it(`${lang} has all course keys`, () => {
            const data = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            for (const path of KEYS) {
                const v = path.reduce((o, k) => o?.[k], data);
                assert.equal(typeof v, 'string', path.join('.'));
                assert.ok(v.length > 0, path.join('.'));
            }
        });
    }
});
