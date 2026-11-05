/**
 * Šifrování kurzu při sestavení: z `p1/*.html` ve výstupu zbude prázdná stránka se zámkem
 * (`js/course/courseLock.js`), text slidů a výkladu je v ní jen v AES-256-GCM. Zdrojové soubory
 * zůstávají čitelné, kontrola odkazů v build-pages.mjs běží nad nimi.
 * Stránka, která nemá očekávanou stavbu, sestavení shodí: nikdy se nepublikuje čitelně.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveCourseKey, normalizeCode, toBase64 } from '../js/course/courseLock.js';

const FLAG_SOURCE = 'export const COURSE_ENCRYPTED = false;';
const FLAG_BUILT = 'export const COURSE_ENCRYPTED = true;';

/** @param {string} code hodnota P1_COURSE_CODE @throws když chybí nebo je prázdná */
export function requireCourseCode(code) {
    if (!code || !normalizeCode(code)) throw new Error('P1_COURSE_CODE is not set: refusing to publish the course unencrypted');
    return code;
}

/**
 * @param {object} payload
 * @param {Uint8Array} rawKey
 * @returns {Promise<{iv: string, data: string}>} s novým náhodným IV při každém volání
 */
export async function encryptPayload(payload, rawKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/**
 * Ze zdrojové stránky kurzu udělá prázdnou stránku se zámkem.
 * @param {string} html
 * @param {Uint8Array} rawKey
 * @returns {Promise<string>}
 */
export async function encryptCoursePage(html, rawKey) {
    const part = (re, what) => {
        const m = html.match(re);
        if (!m) throw new Error(`course page without ${what}`);
        return m;
    };
    part(/<meta name="robots" content="noindex">/, 'noindex');
    const description = part(/\s*<meta name="description"[^>]*>/, 'description');
    const body = part(/<body([^>]*)>/, '<body>');
    const main = part(/<main\b[\s\S]*<\/main>/, '<main>');
    const footer = part(/<footer\b[\s\S]*<\/footer>/, '<footer>');
    const script = part(/<script type="module" src="\.\.\/js\/course\/(\w+Page\.js)"><\/script>/, 'page module');
    if (/<script\b/.test(main[0])) throw new Error('course page with a script inside <main>: it would not run after decryption');

    const cipher = await encryptPayload({
        bodyAttrs: [...body[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]),
        main: main[0],
        footer: footer[0],
        module: script[1],
    }, rawKey);

    return html
        .replace(description[0], '')
        .replace(body[0], '<body>')
        .replace(main[0], '<main class="course-page" lang="cs"><noscript><p>Kurz potřebuje zapnutý JavaScript.</p></noscript></main>')
        .replace(footer[0], '<footer><span class="version-number"></span></footer>')
        .replace(script[0], () => `<script type="application/json" id="course-cipher">${JSON.stringify(cipher)}</script>\n    <script type="module" src="../js/course/courseLock.js"></script>`);
}

/**
 * Zašifruje všechny stránky kurzu ve výstupu a přepne příznak v jeho kopii zámku.
 * @param {string} outDir
 * @param {string[]} files publikované soubory
 * @param {string} code
 */
export async function encryptCourse(outDir, files, code) {
    const leaked = files.filter(f => f.startsWith('p1/') && !f.endsWith('.html'));
    if (leaked.length) throw new Error(`unencrypted files in p1/: ${leaked.join(', ')}`);

    const rawKey = await deriveCourseKey(requireCourseCode(code));
    for (const f of files.filter(f => f.startsWith('p1/'))) {
        const path = join(outDir, f);
        writeFileSync(path, await encryptCoursePage(readFileSync(path, 'utf8'), rawKey));
    }

    const lockPath = join(outDir, 'js/course/courseLock.js');
    const lock = readFileSync(lockPath, 'utf8');
    if (!lock.includes(FLAG_SOURCE)) throw new Error('COURSE_ENCRYPTED flag not found in courseLock.js');
    writeFileSync(lockPath, lock.replace(FLAG_SOURCE, FLAG_BUILT));
}
