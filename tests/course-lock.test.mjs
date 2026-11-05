import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    COURSE_ENCRYPTED, PBKDF2_ITERATIONS, courseVisible, decryptPage, deriveCourseKey,
} from '../js/course/courseLock.js';
import { encryptCoursePage, encryptPayload, requireCourseCode } from '../scripts/course-encrypt.mjs';
import { registerServiceWorker } from '../js/swRegister.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CODE = 'jen-pro-test';
const source = (page) => readFileSync(join(ROOT, page), 'utf8');
const cipherOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="course-cipher">(.*?)<\/script>/)[1]);

/** Věty ze slidů a výkladu, které bez kódu nesmí být vidět. */
const SECRET = {
    'p1/hustota.html': ['„Těžká“ voda vlivem gravitace klesá dolů', 'Led je lehčí než voda, plave na hladině', 'Jezero je v zimě zamrzlé', 'Modelový lom hluboký'],
    'p1/index.html': ['Fyzika – plán', 'Deco for Divers', 'Základy potápěčské fyziky', 'Přednáška fyziky pro kurz'],
};

const runBuild = (out, code) => {
    const env = { ...process.env };
    delete env.P1_COURSE_CODE;
    if (code !== undefined) env.P1_COURSE_CODE = code;
    return spawnSync(process.execPath, ['scripts/build-pages.mjs', out], { cwd: ROOT, env, encoding: 'utf8' });
};

describe('šifra kurzu', () => {
    it('tam a zpět se správným kódem, i s mezerami okolo', async () => {
        const cipher = await encryptPayload({ main: 'Příliš žluťoučký' }, await deriveCourseKey(CODE));
        assert.deepEqual(await decryptPage(cipher, await deriveCourseKey(` ${CODE} `)), { main: 'Příliš žluťoučký' });
    });

    it('špatný kód selže', async () => {
        const cipher = await encryptPayload({ main: 'x' }, await deriveCourseKey(CODE));
        await assert.rejects(decryptPage(cipher, await deriveCourseKey('jiny-kod')));
    });

    it('PBKDF2 s 600 000 iteracemi dává 256bitový klíč', async () => {
        assert.equal(PBKDF2_ITERATIONS, 600000);
        assert.equal((await deriveCourseKey(CODE)).length, 32);
    });

    it('každé zašifrování má jiné IV', async () => {
        const key = await deriveCourseKey(CODE);
        const [a, b] = await Promise.all([encryptPayload({}, key), encryptPayload({}, key)]);
        assert.notEqual(a.iv, b.iv);
    });

    it('prázdný kód se nepřijme', () => {
        for (const code of [undefined, '', '   ']) assert.throws(() => requireCourseCode(code), /P1_COURSE_CODE/);
    });
});

describe('stránka kurzu', () => {
    for (const page of Object.keys(SECRET)) {
        it(`${page} má ve zdroji noindex a věty z kontroly`, () => {
            assert.match(source(page), /<meta name="robots" content="noindex">/);
            for (const text of SECRET[page]) assert.ok(source(page).includes(text), text);
        });
    }

    it('stránku bez noindex nebo bez známé stavby šifrování odmítne', async () => {
        const key = await deriveCourseKey(CODE);
        await assert.rejects(encryptCoursePage(source('p1/index.html').replace(/<meta name="robots"[^>]*>/, ''), key), /noindex/);
        await assert.rejects(encryptCoursePage('<main>text</main>', key));
    });

    it('zdroj zůstává čitelný a kurz je v něm v menu; na webu až po odemčení', () => {
        assert.equal(COURSE_ENCRYPTED, false);
        assert.equal(courseVisible(false, null), true);
        assert.equal(courseVisible(true, null), false);
        assert.equal(courseVisible(true, 'klic'), true);
    });

    it('úvodní stránka má kartu kurzu ve výchozím stavu skrytou', () => {
        assert.match(source('index.html'), /<div class="topic-card available" data-course-card hidden>/);
    });

    it('zámek je v STATIC_ASSETS', () => {
        assert.match(source('sw.js'), /'\.\/js\/course\/courseLock\.js'/);
    });

    it('workflow: Pages bere kód ze secretu, CI má jen testovací hodnotu', () => {
        assert.match(source('.github/workflows/pages.yml'), /P1_COURSE_CODE: \$\{\{ secrets\.P1_COURSE_CODE \}\}/);
        assert.match(source('.github/workflows/ci.yml'), /P1_COURSE_CODE: ci-test-value/);
    });
});

describe('service worker po odemčení', () => {
    const run = (readyState) => {
        const registered = [];
        const waiting = [];
        const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { serviceWorker: { register: async (url) => { registered.push(url); } } },
        });
        globalThis.document = { readyState };
        globalThis.window = { addEventListener: (name, fn) => waiting.push([name, fn]) };
        try {
            registerServiceWorker('../sw.js');
            return { registered, waiting };
        } finally {
            Object.defineProperty(globalThis, 'navigator', saved);
            delete globalThis.document;
            delete globalThis.window;
        }
    };

    it('modul načtený až po události load se zaregistruje hned', () => {
        assert.deepEqual(run('complete'), { registered: ['../sw.js'], waiting: [] });
    });

    it('během načítání stránky čeká na load', () => {
        const { registered, waiting } = run('interactive');
        assert.deepEqual(registered, []);
        assert.deepEqual(waiting.map(w => w[0]), ['load']);
    });
});

describe('sestavení', () => {
    const dir = mkdtempSync(join(tmpdir(), 'course-lock-'));
    const out = join(dir, 'site');
    let built;

    before(() => { built = runBuild(out, CODE); });
    after(() => rmSync(dir, { recursive: true, force: true }));

    it('bez P1_COURSE_CODE selže a nic nepublikuje', () => {
        for (const code of [undefined, '']) {
            const failed = join(dir, 'failed');
            const r = runBuild(failed, code);
            assert.equal(r.status, 1);
            assert.match(r.stderr, /P1_COURSE_CODE/);
            assert.equal(existsSync(failed), false);
        }
    });

    it('s kódem projde', () => {
        assert.equal(built.status, 0, built.stderr);
        assert.ok(!built.stdout.includes(CODE), 'kód se nevypisuje');
    });

    for (const page of Object.keys(SECRET)) {
        it(`${page}: věty ze slidů a výkladu ani kód v něm nejsou, noindex ano`, () => {
            const html = readFileSync(join(out, page), 'utf8');
            for (const text of [...SECRET[page], CODE]) assert.ok(!html.includes(text), text);
            assert.ok(!/course-slide|data-slide-number|<section/.test(html), 'žádná kostra slidů');
            assert.match(html, /<meta name="robots" content="noindex">/);
            assert.ok(!html.includes('<meta name="description"'));
        });

        it(`${page}: správný kód obsah vrátí, špatný ne`, async () => {
            const cipher = cipherOf(readFileSync(join(out, page), 'utf8'));
            const decrypted = await decryptPage(cipher, await deriveCourseKey(CODE));
            for (const text of SECRET[page].slice(0, 3)) assert.ok(decrypted.main.includes(text), text);
            assert.match(decrypted.module, /Page\.js$/);
            assert.ok(existsSync(join(out, 'js/course', decrypted.module)));
            await assert.rejects(decryptPage(cipher, await deriveCourseKey('jiny-kod')));
        });
    }

    it('každá stránka má vlastní IV a kapitola si nese body atributy', async () => {
        const [hub, chapter] = Object.keys(SECRET).reverse().map(p => cipherOf(readFileSync(join(out, p), 'utf8')));
        assert.notEqual(hub.iv, chapter.iv);
        const page = await decryptPage(chapter, await deriveCourseKey(CODE));
        assert.deepEqual(page.bodyAttrs, [['data-course-chapter', 'hustota']]);
    });

    it('příznak zámku je přepnutý jen ve výstupu', () => {
        assert.match(readFileSync(join(out, 'js/course/courseLock.js'), 'utf8'), /export const COURSE_ENCRYPTED = true;/);
    });

    it('pojmy kurzu zůstávají veřejné', () => {
        assert.equal(readFileSync(join(out, 'concepts/cs/lake-stratification.html'), 'utf8'), source('concepts/cs/lake-stratification.html'));
    });
});
