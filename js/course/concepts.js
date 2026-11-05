/**
 * Sdílené bloky pojmů (výklad „Více“ v kapitolách kurzů).
 *
 * Pojem = jeden blok výkladu o jedné věci, napsaný jednou v `concepts/<jazyk>/<id>.html`
 * (HTML fragment bez <html>/<body>). Kapitola kurzu ho **vloží** (ne odkáže) prvkem
 *
 *     <div class="course-concept" data-concept="water-anomaly"></div>
 *
 * typicky uvnitř `<details class="course-more">`. Jiný kurz může stejný blok vložit
 * znovu; hlubší verze pro pokročilý kurz = další blok s vlastním id.
 *
 * Offline: každý blok musí být v `sw.js` STATIC_ASSETS (hlídá test).
 * Cesta se odvozuje od umístění tohoto modulu, takže funguje z libovolné podsložky.
 */

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {string} id
 * @returns {boolean} id je bezpečné jméno souboru (malá písmena, číslice, pomlčky)
 */
export function isValidConceptId(id) {
    return typeof id === 'string' && ID_RE.test(id);
}

/**
 * Cesta k bloku relativně ke kořeni webu.
 * @param {string} id
 * @param {string} [lang='cs']
 * @returns {string}
 */
export function conceptPath(id, lang = 'cs') {
    if (!isValidConceptId(id)) throw new Error(`concepts: neplatné id „${id}“`);
    return `concepts/${lang}/${id}.html`;
}

const FAILED_HTML = '<p class="course-concept-error">Výklad se nepodařilo načíst. '
    + 'Jsi offline a stránka se ještě neuložila? Zkus ji načíst znovu s připojením.</p>';

/**
 * Vloží všechny bloky pojmů pod `root`.
 * @param {ParentNode} [root=document]
 * @param {{lang?: string, fetchImpl?: typeof fetch, base?: string|URL}} [options]
 * @returns {Promise<number>} počet úspěšně vložených bloků
 */
export async function loadConcepts(root = document, options = {}) {
    const { lang = 'cs', fetchImpl = globalThis.fetch, base = new URL('../../', import.meta.url) } = options;
    const slots = [...root.querySelectorAll('[data-concept]')];
    const cache = new Map();
    let loaded = 0;
    await Promise.all(slots.map(async (slot) => {
        const id = slot.dataset.concept;
        try {
            const url = new URL(conceptPath(id, lang), base).href;
            if (!cache.has(url)) {
                cache.set(url, fetchImpl(url).then(r => {
                    if (!r.ok) throw new Error(`${url} → ${r.status}`);
                    return r.text();
                }));
            }
            slot.innerHTML = await cache.get(url);
            slot.dataset.conceptState = 'loaded';
            loaded++;
        } catch (err) {
            console.warn('concepts:', err);
            slot.innerHTML = FAILED_HTML;
            slot.dataset.conceptState = 'error';
        }
    }));
    return loaded;
}
