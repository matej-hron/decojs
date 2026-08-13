/**
 * Lightweight i18n (internationalization) module.
 *
 * Loads JSON translation files from the locales/ directory and applies
 * translations to DOM elements with `data-i18n` attributes. Supports
 * HTML content in translations, browser language detection, and
 * localStorage persistence.
 *
 * @module i18n
 */

/** @type {string} Default/fallback language */
const DEFAULT_LANG = 'en';

/** @type {string[]} Supported language codes */
const SUPPORTED_LANGS = ['en', 'cs', 'es'];

/** @type {string} localStorage key for language preference */
const STORAGE_KEY = 'deco-theory-lang';

/** @type {Object<string, Object>} Cache of loaded translation data by language */
const translationCache = {};

/** @type {string} Currently active language */
let currentLanguage = DEFAULT_LANG;

/**
 * Detect the path prefix for locales based on current page location.
 * Handles pages in subdirectories (e.g., sandbox/).
 * @returns {string} Path prefix ('' or '../')
 */
function getLocalePrefix() {
    const path = window.location.pathname;
    if (path.includes('/sandbox/')) {
        return '../';
    }
    return '';
}

/**
 * Load translations for a given language.
 * Fetches the JSON file and caches the result.
 * @param {string} lang - Language code (e.g., 'en', 'cs')
 * @returns {Promise<Object>} Translation key-value map
 */
async function loadTranslations(lang) {
    if (translationCache[lang]) {
        return translationCache[lang];
    }

    const prefix = getLocalePrefix();
    const url = `${prefix}locales/${lang}.json`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`i18n: Could not load translations for "${lang}" (${response.status})`);
            return null;
        }
        const data = await response.json();
        translationCache[lang] = data;
        return data;
    } catch (error) {
        console.warn(`i18n: Error loading translations for "${lang}":`, error);
        return null;
    }
}

/**
 * Resolve a nested key from a translations object.
 * Supports dot-notation keys like "header.title".
 * @param {Object} translations - Translation data
 * @param {string} key - Dot-notation key
 * @returns {string|undefined} Resolved translation string
 */
function resolveKey(translations, key) {
    const parts = key.split('.');
    let value = translations;
    for (const part of parts) {
        if (value == null || typeof value !== 'object') return undefined;
        value = value[part];
    }
    return typeof value === 'string' ? value : undefined;
}

/**
 * Apply translations to all elements with `data-i18n` attributes.
 * Sets innerHTML for elements (supports HTML tags in translations).
 * Also updates the page title if a "page.title" key exists.
 * @param {Object} translations - Translation key-value map
 */
function applyTranslations(translations) {
    if (!translations) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = resolveKey(translations, key);
        if (translated !== undefined) {
            el.innerHTML = translated;
        }
    });

    // Update page title if available
    const pageTitle = resolveKey(translations, 'page.title');
    if (pageTitle) {
        document.title = pageTitle;
    }

    // Update html lang attribute
    document.documentElement.lang = currentLanguage;
}

/**
 * Detect the user's preferred language from browser settings.
 * Returns the first supported language found, or the default.
 * @returns {string} Detected language code
 */
function detectBrowserLanguage() {
    const languages = navigator.languages || [navigator.language || navigator.userLanguage];
    for (const lang of languages) {
        const code = lang.split('-')[0].toLowerCase();
        if (SUPPORTED_LANGS.includes(code)) {
            return code;
        }
    }
    return DEFAULT_LANG;
}

/**
 * Get the initial language preference.
 * Priority: localStorage > browser detection > default.
 * @returns {string} Language code
 */
function getInitialLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) {
        return stored;
    }
    return detectBrowserLanguage();
}

// Publish the language on <html lang> at module-evaluation time.
//
// `initI18n()` cannot do this on its own: it has to await the locale JSON,
// and pages render charts synchronously in the same module block. Anything
// formatting a number before that fetch resolves would read a stale "en" and
// print "0.75 bar" into an otherwise Czech page (see js/format.js).
//
// A module's dependencies evaluate before the importing module's body, so
// every page that imports i18n.js gets the correct language from the first
// tick. Detection here is synchronous - localStorage and navigator only.
if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    currentLanguage = getInitialLanguage();
    document.documentElement.lang = currentLanguage;
}

/**
 * Set the active language and apply translations.
 * Saves preference to localStorage.
 * @param {string} lang - Language code to switch to
 * @returns {Promise<void>}
 */
async function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) {
        console.warn(`i18n: Unsupported language "${lang}"`);
        return;
    }

    currentLanguage = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    // Synchronously, before the fetch: number formatting reads this attribute
    // and must not lag a language switch by a network round trip.
    document.documentElement.lang = lang;

    const translations = await loadTranslations(lang);
    applyTranslations(translations);

    // Update any rendered language switchers
    document.querySelectorAll('.lang-switcher').forEach(sw => {
        const label = sw.querySelector('.lang-switcher-current');
        if (label) label.textContent = lang.toUpperCase();
        sw.querySelectorAll('.lang-switcher-menu button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    });

    // Notify listeners that language has changed
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

/**
 * Get the currently active language code.
 * @returns {string} Current language code
 */
function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * Synchronously look up a translation key in the current-language cache.
 * If the key is missing in the current language, falls back to English if
 * available. If that also fails, returns the provided fallback string.
 *
 * Use this for dynamically-generated UI labels (chart tooltips, runtime
 * button text, nav labels, etc.) where `data-i18n` attributes can't be
 * used because the element doesn't exist yet at translation time.
 *
 * @param {string} key - Dot-notation key (e.g. "nav.home")
 * @param {string} [fallback] - String to return if key resolves to nothing
 * @returns {string} The translated string, or the fallback
 */
function translate(key, fallback = '') {
    const current = translationCache[currentLanguage];
    if (current) {
        const val = resolveKey(current, key);
        if (val !== undefined) return val;
    }
    // Fallback to English cache if it's loaded and different
    if (currentLanguage !== DEFAULT_LANG && translationCache[DEFAULT_LANG]) {
        const val = resolveKey(translationCache[DEFAULT_LANG], key);
        if (val !== undefined) return val;
    }
    return fallback;
}

/**
 * Initialize the i18n system.
 * Detects language, loads translations, and applies them.
 * Call this once when the page loads.
 * @returns {Promise<void>}
 */
async function initI18n() {
    const lang = getInitialLanguage();
    await setLanguage(lang);
}

/** @type {Object<string, {name: string, label: string}>} Native names per language */
const LANG_OPTIONS = {
    en: { name: 'English', label: 'Switch to English' },
    cs: { name: 'Čeština', label: 'Přepnout na češtinu' },
    es: { name: 'Español', label: 'Cambiar a español' }
};

/**
 * Build a compact language-switcher dropdown (toggle + menu).
 * @returns {HTMLDivElement}
 */
function buildSwitcherElement() {
    const switcher = document.createElement('div');
    switcher.className = 'lang-switcher';
    switcher.dataset.open = 'false';

    const options = SUPPORTED_LANGS
        .map(code => {
            const opt = LANG_OPTIONS[code] || { name: code.toUpperCase(), label: `Switch to ${code}` };
            const active = code === currentLanguage ? ' active' : '';
            return `<li><button class="lang-switcher-option${active}" data-lang="${code}" aria-label="${opt.label}">${opt.name}</button></li>`;
        })
        .join('');

    switcher.innerHTML = `
        <button class="lang-switcher-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="Change language">
            <span class="lang-switcher-current">${currentLanguage.toUpperCase()}</span>
            <span class="lang-switcher-caret" aria-hidden="true">▾</span>
        </button>
        <ul class="lang-switcher-menu" role="listbox">${options}</ul>
    `;

    const toggle = switcher.querySelector('.lang-switcher-toggle');
    const closeMenu = () => {
        switcher.dataset.open = 'false';
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = switcher.dataset.open === 'true';
        // Close other open switchers on the page first
        document.querySelectorAll('.lang-switcher[data-open="true"]').forEach(other => {
            if (other !== switcher) {
                other.dataset.open = 'false';
                const t = other.querySelector('.lang-switcher-toggle');
                if (t) t.setAttribute('aria-expanded', 'false');
            }
        });
        switcher.dataset.open = isOpen ? 'false' : 'true';
        toggle.setAttribute('aria-expanded', String(!isOpen));
    });

    switcher.querySelectorAll('.lang-switcher-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setLanguage(btn.dataset.lang);
            closeMenu();
        });
    });

    return switcher;
}

// Close any open language switcher when clicking elsewhere or pressing Escape.
if (typeof document !== 'undefined') {
    document.addEventListener('click', () => {
        document.querySelectorAll('.lang-switcher[data-open="true"]').forEach(sw => {
            sw.dataset.open = 'false';
            const t = sw.querySelector('.lang-switcher-toggle');
            if (t) t.setAttribute('aria-expanded', 'false');
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.lang-switcher[data-open="true"]').forEach(sw => {
                sw.dataset.open = 'false';
                const t = sw.querySelector('.lang-switcher-toggle');
                if (t) t.setAttribute('aria-expanded', 'false');
            });
        }
    });
}

/**
 * Create and inject language switchers into the nav bar and presentation nav.
 * Renders an EN | CZ toggle styled to match each context.
 */
function createLanguageSwitcher() {
    // Main nav bar
    const navContainer = document.querySelector('.nav-container');
    if (navContainer) {
        const switcher = buildSwitcherElement();
        const wipBadge = navContainer.querySelector('.nav-wip-badge');
        if (wipBadge) {
            navContainer.insertBefore(switcher, wipBadge);
        } else {
            navContainer.appendChild(switcher);
        }
    }

    // Presentation mode nav bar (inserted before the exit button)
    const presentationNav = document.querySelector('.presentation-nav');
    if (presentationNav) {
        const switcher = buildSwitcherElement();
        const exitBtn = presentationNav.querySelector('.presentation-exit');
        if (exitBtn) {
            presentationNav.insertBefore(switcher, exitBtn);
        } else {
            presentationNav.appendChild(switcher);
        }
    }
}

export { initI18n, setLanguage, getCurrentLanguage, createLanguageSwitcher, translate, SUPPORTED_LANGS };
