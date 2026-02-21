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
const SUPPORTED_LANGS = ['en', 'cs'];

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

    const translations = await loadTranslations(lang);
    applyTranslations(translations);

    // Update active state on language switcher buttons
    document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
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
 * Initialize the i18n system.
 * Detects language, loads translations, and applies them.
 * Call this once when the page loads.
 * @returns {Promise<void>}
 */
async function initI18n() {
    const lang = getInitialLanguage();
    await setLanguage(lang);
}

/**
 * Build a language switcher DOM element.
 * @returns {HTMLDivElement} The switcher element with click handlers wired up
 */
function buildSwitcherElement() {
    const switcher = document.createElement('div');
    switcher.className = 'lang-switcher';
    switcher.innerHTML = `
        <button class="lang-switcher-btn" data-lang="en" aria-label="Switch to English">EN</button>
        <span class="lang-switcher-divider">|</span>
        <button class="lang-switcher-btn" data-lang="cs" aria-label="Switch to Czech">CZ</button>
    `;

    switcher.querySelectorAll('.lang-switcher-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setLanguage(btn.dataset.lang);
        });
        btn.classList.toggle('active', btn.dataset.lang === currentLanguage);
    });

    return switcher;
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

export { initI18n, setLanguage, getCurrentLanguage, createLanguageSwitcher, SUPPORTED_LANGS };
