/**
 * Kurz P1 – Fyzika: pořadí kapitol a motivační otázky.
 *
 * Kostra kurzu = pořadí kapitol přednášky FyzikaP12_2025 (od jednoduchého ke složitému).
 * Kapitola se stavem 'ready' má stránku `p1/<slug>.html` a odkaz na rozcestníku;
 * 'planned' se jen vypíše na rozcestníku jako „připravujeme“.
 *
 * Otázky ze slidu 6 jsou motivační háčky — neřídí pořadí. `answeredIn` říká, ve které
 * kapitole je student poprvé umí zodpovědět (rozcestník na ni odkáže).
 */

/** @typedef {'ready'|'planned'} ChapterStatus */

/**
 * @typedef {Object} Chapter
 * @property {string} slug    Název souboru bez přípony (`p1/<slug>.html`)
 * @property {string} title   Název kapitoly (česky, jako v přednášce)
 * @property {string} slides  Slidy přednášky, ze kterých kapitola vychází (jen pro dohledání v PowerPointu)
 * @property {'P★'|'P★★'} level
 * @property {ChapterStatus} status
 * @property {number} [courseSlides] Počet slidů kapitoly v kurzu, včetně titulního a „Procvič si“ (bez překryvů
 *   modelů), tj. počet zastávek `collectStops` na stránce. Povinný u hotové kapitoly, hlídá ho test proti HTML.
 */

/** Počet slidů rozcestníku `p1/index.html` (titulní slide až Obsah); čísluje se od nich. */
export const P1_INDEX_SLIDES = 7;

/** @type {Chapter[]} */
export const P1_CHAPTERS = [
    { slug: 'hustota', title: 'Hustota', slides: '8–9', level: 'P★', status: 'ready', courseSlides: 3 },
    { slug: 'tlak', title: 'Tlak', slides: '10–22', level: 'P★', status: 'ready', courseSlides: 14 },
    { slug: 'stlacovani-plynu', title: 'Stlačování plynů', slides: '23–30', level: 'P★', status: 'ready', courseSlides: 10 },
    { slug: 'archimeduv-zakon', title: 'Archimédův zákon a kontrola vztlaku', slides: '31–37', level: 'P★', status: 'ready', courseSlides: 9 },
    { slug: 'dalton', title: 'Složení vzduchu a Daltonův zákon', slides: '38–41', level: 'P★', status: 'ready', courseSlides: 6 },
    { slug: 'henry', title: 'Rozpouštění plynů v kapalinách', slides: '42–47', level: 'P★', status: 'ready', courseSlides: 8 },
    { slug: 'videni', title: 'Vidění pod vodou', slides: '48–54', level: 'P★★', status: 'ready', courseSlides: 8 },
    { slug: 'slyseni', title: 'Slyšení pod vodou', slides: '55–56', level: 'P★★', status: 'ready', courseSlides: 2 },
    { slug: 'teplo', title: 'Přenos tepla', slides: '57–60', level: 'P★★', status: 'ready', courseSlides: 7 },
];

/**
 * Otázky ze slidu 6 („Fyzika – proč“) a kapitoly, které je zodpoví.
 * @type {{question: string, answeredIn: string[]}[]}
 */
export const P1_QUESTIONS = [
    { question: 'Jak hluboko můžu?', answeredIn: ['dalton'] },
    { question: 'Co mám dělat, když chci hloub?', answeredIn: ['dalton'] },
    { question: 'Jak dlouho tam můžu být?', answeredIn: ['henry'] },
    { question: 'Jak mám naplánovat ponor? Jak rychle dolů, jak zpátky?', answeredIn: ['tlak', 'henry'] },
    { question: 'Jak dlouho mi vydrží vzduch v lahvi?', answeredIn: ['stlacovani-plynu'] },
    { question: 'Jak předcházet nehodám?', answeredIn: ['tlak', 'stlacovani-plynu', 'archimeduv-zakon', 'henry'] },
];

/**
 * Číslování slidů v patičce: pořadí slidu v celém kurzu (rozcestník, pak hotové kapitoly v pořadí obsahu),
 * včetně titulních slidů a „Procvič si“. Číslo z přednášky (`data-slide-number`) se nezobrazuje.
 * @param {string|null} slug kapitola, `null` rozcestník
 * @param {Chapter[]} [chapters]
 * @returns {{first: number, total: number}|null} číslo prvního slidu stránky a počet slidů kurzu;
 *   `null` pro stránku, která se nečísluje (nehotová nebo neznámá kapitola)
 */
export function courseSlideNumbering(slug, chapters = P1_CHAPTERS) {
    const ready = chapters.filter(c => c.status === 'ready');
    const total = ready.reduce((sum, c) => sum + (c.courseSlides ?? 0), P1_INDEX_SLIDES);
    if (slug === null) return { first: 1, total };
    const i = ready.findIndex(c => c.slug === slug);
    if (i < 0) return null;
    const first = ready.slice(0, i).reduce((sum, c) => sum + (c.courseSlides ?? 0), P1_INDEX_SLIDES + 1);
    return { first, total };
}

/**
 * Sousední kapitoly v pořadí kurzu (jen hotové — na nehotovou se nedá přejít).
 * @param {string} slug
 * @returns {{prev: Chapter|null, next: Chapter|null}}
 */
export function chapterNeighbours(slug) {
    const ready = P1_CHAPTERS.filter(c => c.status === 'ready');
    const i = ready.findIndex(c => c.slug === slug);
    if (i < 0) return { prev: null, next: null };
    return { prev: ready[i - 1] || null, next: ready[i + 1] || null };
}

/**
 * @param {string} slug
 * @returns {Chapter|undefined}
 */
export function chapterBySlug(slug) {
    return P1_CHAPTERS.find(c => c.slug === slug);
}
