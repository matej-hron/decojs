/**
 * "Open in maps": links that take a site position to Mapy.com, Google Maps, turn-by-turn navigation and (on
 * Android) the system's map-app chooser, plus the small sheet that offers them. Every map we show carries a
 * `[data-map-link]` trigger (mapLinkButtonHtml); one delegated listener (wireMapLinks) opens the sheet.
 *
 * `mapLinks` and `mapLinkButtonHtml` are pure (tests); the rest is DOM.
 * Mapy.com URL scheme: https://mapy.com/fnc/v1/showmap (mapset, center=LON,LAT, zoom, marker).
 */

import { escHtml } from '../utils/escHtml.js';
import { translate } from '../i18n.js';

const tm = (key, fallback) => translate(`diveLog.logbook.mapLinks.${key}`, fallback);
const coord = n => String(Math.round(n * 1e6) / 1e6);
const VALID = p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/**
 * External links for a position.
 * @param {{lat: number, lon: number, label?: string, exact?: boolean, android?: boolean}} p - `exact: false` is an approximate
 *   area: it gets a wider zoom, no marker and no turn-by-turn navigation (there is no exact place to drive to).
 * @returns {{mapy: string, google: string, navigate: string|null, geo: string|null}|null} null for an invalid position
 */
export function mapLinks(p) {
    if (!VALID(p)) return null;
    const lat = coord(Number(p.lat));
    const lon = coord(Number(p.lon));
    const exact = p.exact !== false;
    const label = String(p.label ?? '').replace(/[()\s]+/g, ' ').trim();
    const mapy = `https://mapy.com/fnc/v1/showmap?mapset=outdoor&center=${lon},${lat}&zoom=${exact ? 16 : 13}&marker=${exact}`;
    const google = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const navigate = exact ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` : null;
    const geo = p.android ? `geo:${lat},${lon}?q=${lat},${lon}${label ? `(${encodeURIComponent(label)})` : ''}` : null;
    return { mapy, google, navigate, geo };
}

/**
 * The trigger that sits on a map. `tag` is 'span' inside a link (a feed card is an <a>; a nested button would be invalid).
 * @param {{lat: number, lon: number, label?: string, exact?: boolean}} p
 * @param {{tag?: 'button'|'span', text?: string, className?: string}} [o]
 * @returns {string} '' for an invalid position
 */
export function mapLinkButtonHtml(p, { tag = 'button', text = tm('open', 'Open in maps'), className = '' } = {}) {
    if (!VALID(p)) return '';
    const attrs = `class="lb-map-open${className ? ` ${className}` : ''}" data-map-link data-lat="${Number(p.lat)}" data-lon="${Number(p.lon)}"`
        + ` data-exact="${p.exact !== false}" data-label="${escHtml(p.label ?? '')}" aria-label="${escHtml(text)}" title="${escHtml(text)}"`;
    const icon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>';
    return tag === 'span' ? `<span role="button" tabindex="0" ${attrs}>${icon}</span>` : `<button type="button" ${attrs}>${icon}</button>`;
}

const isAndroid = () => /android/i.test(globalThis.navigator?.userAgent ?? '');

function sheetHtml(links, exact) {
    const link = (href, text, extra = '') => `<a class="lb-maplinks-item" role="menuitem" href="${escHtml(href)}"${extra}>${escHtml(text)}</a>`;
    const ext = ' target="_blank" rel="noopener noreferrer"';
    return `<div class="lb-maplinks-sheet" role="dialog" aria-modal="true" aria-label="${escHtml(tm('title', 'Open in maps'))}">
        <p class="lb-maplinks-title">${escHtml(tm('title', 'Open in maps'))}${exact ? '' : ` <span class="lb-maplinks-approx">· ${escHtml(tm('approx', 'approximate area'))}</span>`}</p>
        <div class="lb-maplinks-list" role="menu">
            ${link(links.mapy, tm('mapy', 'Mapy.com'), ext)}
            ${link(links.google, tm('google', 'Google Maps'), ext)}
            ${links.navigate ? link(links.navigate, tm('navigate', 'Navigate'), ext) : ''}
            ${links.geo ? link(links.geo, tm('chooser', 'Other map app'), '') : ''}
        </div>
        <button type="button" class="btn btn-secondary lb-maplinks-close">${escHtml(tm('close', 'Close'))}</button>
    </div>`;
}

/** Open the sheet for a trigger element; returns a close function. Exposed for tests of the DOM wiring. */
export function openMapLinksSheet(trigger) {
    const p = { lat: Number(trigger.dataset.lat), lon: Number(trigger.dataset.lon), exact: trigger.dataset.exact !== 'false', label: trigger.dataset.label, android: isAndroid() };
    const links = mapLinks(p);
    if (!links) return () => {};
    const doc = trigger.ownerDocument;
    const overlay = doc.createElement('div');
    overlay.className = 'lb-maplinks';
    overlay.innerHTML = sheetHtml(links, p.exact);
    const close = () => { overlay.remove(); doc.removeEventListener('keydown', onKey, true); trigger.focus?.(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.lb-maplinks-close') || e.target.closest('.lb-maplinks-item')) close(); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.append(overlay);
    overlay.querySelector('.lb-maplinks-item')?.focus();
    return close;
}

let wired = false;
/** Install the one delegated listener (idempotent): a tap on a trigger, or anywhere on a `.lb-map`, opens the sheet. */
export function wireMapLinks(doc = globalThis.document) {
    if (wired || !doc) return;
    wired = true;
    const open = (e, trigger) => { e.preventDefault(); e.stopPropagation(); openMapLinksSheet(trigger); };
    doc.addEventListener('click', e => {
        const trigger = e.target.closest?.('[data-map-link]') ?? e.target.closest?.('.lb-map')?.querySelector('[data-map-link]');
        if (trigger) open(e, trigger);
    }, true);
    doc.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('span[data-map-link]')) open(e, e.target);
    }, true);
}

wireMapLinks(); // a no-op without a document (tests)
