/**
 * Android app-install banner.
 *
 * On Android devices, shows a small dismissible banner at the bottom of the page
 * linking to the DecoTheory app on the Google Play Store. Dismissal is remembered
 * in localStorage so it doesn't reappear on later visits.
 *
 * `isAndroid()` is a pure, unit-tested helper; `initAppBanner()` touches the DOM and
 * is safe to call on every page (it self-guards: non-Android, already-dismissed, or
 * already-shown are all no-ops).
 */
import { translate } from './i18n.js';

/** Google Play listing for the DecoTheory Android app. */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=eu.decotheory.mobile';

const DISMISS_KEY = 'decoAppBannerDismissed';

/**
 * Heuristic check for an Android user agent. Pure (no DOM), so it's testable.
 * @param {string} ua - a user-agent string (e.g. navigator.userAgent)
 * @returns {boolean}
 */
export function isAndroid(ua) {
    return /android/i.test(ua || '');
}

/**
 * Show the Android app banner if appropriate. No-op when the device isn't Android,
 * the banner was previously dismissed, or it's already on the page.
 * @param {Object} [opts]
 * @param {string} [opts.ua] - user agent (defaults to navigator.userAgent)
 * @param {Storage} [opts.storage] - a localStorage-like store (defaults to window.localStorage)
 */
export function initAppBanner(opts = {}) {
    const ua = opts.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (!isAndroid(ua)) return;

    const storage = opts.storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    try {
        if (storage && storage.getItem(DISMISS_KEY) === '1') return;
    } catch (e) { /* storage blocked (private mode) — just show it */ }

    if (typeof document === 'undefined' || !document.body) return;
    if (document.querySelector('.app-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'app-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', translate('app.banner.aria', 'Android app'));

    const text = document.createElement('span');
    text.className = 'app-banner-text';
    text.textContent = translate('app.banner.text', '📱 Plan dives on your phone — get the DecoTheory Android app.');

    const cta = document.createElement('a');
    cta.className = 'app-banner-cta btn btn-primary';
    cta.href = PLAY_STORE_URL;
    cta.target = '_blank';
    cta.rel = 'noopener';
    cta.textContent = translate('app.banner.cta', 'Google Play');

    const close = document.createElement('button');
    close.className = 'app-banner-close';
    close.type = 'button';
    close.setAttribute('aria-label', translate('app.banner.dismiss', 'Dismiss'));
    close.textContent = '×';
    close.addEventListener('click', () => {
        try { if (storage) storage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
        banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(cta);
    banner.appendChild(close);
    document.body.appendChild(banner);
}
