/**
 * Zámek kurzu na webu. Publikované `p1/*.html` obsahují jen šifrovaný obsah (šifruje
 * `scripts/course-encrypt.mjs` při sestavení), kód kurzu je klíčem k šifře: kód ani jeho hash
 * se nikam neukládá, prohlížeč si po zadání pamatuje jen odvozený klíč.
 * Ze zdroje (`python3 -m http.server`) stránky běží čitelně a tenhle zámek se nespouští.
 *
 * Soubor načítá prohlížeč i Node (sestavení), proto žádné importy a nic na úrovni modulu bez `document`.
 */

/** Sestavení v `_site` přepíše na `true`. Řídí jen to, jestli je kurz vidět v menu a na úvodní stránce. */
export const COURSE_ENCRYPTED = false;

export const PBKDF2_ITERATIONS = 600000;
/** Pevná sůl: redeploy nesmí studenty odhlásit. */
const PBKDF2_SALT = 'aDiOwsTeYUe0NBlBa/iEtg==';
const KEY_STORAGE = 'deco-theory-p1-course-key';

/** @param {Uint8Array} bytes @returns {string} */
export function toBase64(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

/** @param {string} text @returns {Uint8Array} */
export function fromBase64(text) {
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

/** @param {string} code @returns {string} kód bez okrajových mezer, s jednotným zápisem diakritiky */
export function normalizeCode(code) {
    return code.trim().normalize('NFC');
}

/**
 * Odvodí klíč z kódu kurzu (PBKDF2-SHA-256).
 * @param {string} code
 * @returns {Promise<Uint8Array>} 256 bitů pro AES-GCM
 */
export async function deriveCourseKey(code) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(PBKDF2_SALT), iterations: PBKDF2_ITERATIONS }, material, 256);
    return new Uint8Array(bits);
}

/**
 * @param {{iv: string, data: string}} cipher
 * @param {Uint8Array} rawKey
 * @returns {Promise<{bodyAttrs: [string, string][], main: string, footer: string, module: string}>}
 * @throws když klíč nesedí (AES-GCM obsah zároveň ověřuje)
 */
export async function decryptPage(cipher, rawKey) {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(cipher.iv) }, key, fromBase64(cipher.data));
    return JSON.parse(new TextDecoder().decode(plain));
}

/** @returns {string|null} uložený klíč; úložiště může být zablokované */
function readStoredKey() {
    try {
        return localStorage.getItem(KEY_STORAGE);
    } catch {
        return null;
    }
}

function storeKey(rawKey) {
    try {
        localStorage.setItem(KEY_STORAGE, toBase64(rawKey));
    } catch { /* bez úložiště se student zeptá znovu na další stránce */ }
}

function forgetKey() {
    try {
        localStorage.removeItem(KEY_STORAGE);
    } catch { /* není co mazat */ }
}

/**
 * Patří kurz do menu a na úvodní stránku? Ze zdroje vždy, na webu až po odemčení.
 * @param {boolean} [encrypted]
 * @param {string|null} [storedKey]
 * @returns {boolean}
 */
export function courseVisible(encrypted = COURSE_ENCRYPTED, storedKey = encrypted ? readStoredKey() : null) {
    return !encrypted || Boolean(storedKey);
}

/** Vloží obsah a teprve pak načte modul stránky: ten počítá s hotovým obsahem. */
async function reveal(page) {
    for (const [name, value] of page.bodyAttrs) document.body.setAttribute(name, value);
    document.querySelector('main').outerHTML = page.main;
    document.querySelector('footer').outerHTML = page.footer;
    document.dispatchEvent(new CustomEvent('courseunlocked'));
    await import(`./${page.module}`);
}

function showForm(cipher) {
    const main = document.querySelector('main');
    main.innerHTML = `<section class="course-section"><div class="course-slide" data-slide-type="content">
        <h1>Kurz</h1>
        <div class="course-core">
            <form class="course-lock-form">
                <p>Stránka je jen pro účastníky kurzu.</p>
                <label for="kod-kurzu">Zadej kód kurzu</label>
                <div class="course-lock-row">
                    <input id="kod-kurzu" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus>
                    <button type="submit" class="btn course-step-btn">Odemknout</button>
                </div>
                <p class="course-lock-error" role="alert"></p>
            </form>
        </div>
    </div></section>`;
    const form = main.querySelector('form');
    const input = form.querySelector('input');
    const button = form.querySelector('button');
    const error = form.querySelector('.course-lock-error');
    input.focus();
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        button.disabled = true;
        error.textContent = '';
        let page = null;
        let rawKey = null;
        try {
            rawKey = await deriveCourseKey(input.value);
            page = await decryptPage(cipher, rawKey);
        } catch {
            error.textContent = 'Kód nesedí.';
            button.disabled = false;
            input.select();
            return;
        }
        storeKey(rawKey);
        await reveal(page);
    });
}

/** Se zapamatovaným klíčem rovnou odemkne; neplatný klíč (změna kódu) smaže a ukáže formulář. */
async function initCourseLock(cipher) {
    const stored = readStoredKey();
    if (stored) {
        let page = null;
        try {
            page = await decryptPage(cipher, fromBase64(stored));
        } catch {
            forgetKey();
        }
        if (page) {
            await reveal(page);
            return;
        }
    }
    showForm(cipher);
}

const cipherElement = typeof document !== 'undefined' ? document.getElementById('course-cipher') : null;
if (cipherElement) initCourseLock(JSON.parse(cipherElement.textContent));
