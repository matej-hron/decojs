/**
 * Registers the service worker so pages open offline (e.g. DecoTrail at the dive site).
 * sw.js is network-first, so an online visit always gets the latest files.
 */

/** @param {string} swUrl - URL of sw.js, resolved against the page */
export function registerServiceWorker(swUrl) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(swUrl).catch(error => console.warn('[SW] registration failed', error));
    });
}
