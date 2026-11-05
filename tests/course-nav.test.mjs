import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_ITEMS, isLinkActive } from '../js/nav.js';
import { P1_CHAPTERS } from '../js/course/p1Course.js';
import { selectSiteFiles } from '../scripts/build-pages.mjs';

const KEYS = [
    ['nav', 'courses', 'label'],
    ['nav', 'courses', 'p1'],
    ['home', 'topics', 'courseP1'],
    ['home', 'topics', 'courseP1Desc'],
    ['home', 'topics', 'courseP1Links', 'overview'],
    ['home', 'topics', 'courseP1Links', 'density'],
    ['home', 'topics', 'statusNew'],
];

describe('Courses menu', () => {
    const courses = NAV_ITEMS.find(i => i.labelKey === 'nav.courses.label');

    it('lists only courses, no chapters', () => {
        assert.ok(courses, 'Courses menu item exists');
        assert.deepEqual(courses.submenu.map(s => s.href), ['p1/index.html']);
    });

    it('stays active on the course overview and on every chapter', () => {
        const pages = ['p1/index.html', ...P1_CHAPTERS.map(c => `p1/${c.slug}.html`)];
        for (const page of pages) {
            assert.ok(isLinkActive(courses, page), page);
        }
    });

    it('is not active outside the course', () => {
        for (const page of ['index.html', 'pressure.html', 'sandbox/index.html']) {
            assert.equal(isLinkActive(courses, page), false, page);
        }
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
            assert.equal(data.nav.courses.p1Density, undefined, 'chapters have no menu key');
        });
    }
});
