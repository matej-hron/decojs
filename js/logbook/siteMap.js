/**
 * The site map of a dive (detail screen and public share page): a Mapy.com static image (as on feed cards;
 * the key's referrer list allows decotheory.eu) that falls back to a still Leaflet map with OpenStreetMap tiles
 * when the image fails or there is no key. An exact position gets a pin; an approximate area (a public link
 * without "Show the exact location") gets a soft circle of about 1 km and no pin.
 *
 * `siteMapHtml` is pure (tests); `wireSiteMap` adds the fallback.
 */

import { mapyStaticMapUrl, metersPerPixel } from './geo.js';
import { escHtml } from '../utils/escHtml.js';

/** Radius of the approximate area: the server rounds to 2 decimals (up to ~0.56 km off), so 1 km covers it. */
export const AREA_RADIUS_M = 1000;

/**
 * Markup of a site map.
 * @param {Object} o
 * @param {{lat: number, lon: number, exact: boolean}} o.area
 * @param {string} o.apiKey - Mapy.com key ('' → the Leaflet fallback is mounted at once)
 * @param {number} o.width - CSS pixels of the image (≤ 1024)
 * @param {number} o.height
 * @param {number} [o.zoom]
 * @param {number} [o.scale] - 2 on high-density screens
 * @param {string} [o.lang]
 * @param {string} o.alt - text alternative ("Map of Lom Barbora")
 * @param {string} [o.areaLabel] - shown on an approximate map ("Approximate area")
 * @param {string} [o.className]
 */
export function siteMapHtml({ area, apiKey, width, height, zoom = 13, scale = 1, lang = 'en', alt, areaLabel = '', className = '' }) {
    const src = mapyStaticMapUrl({ lat: area.lat, lon: area.lon, apiKey, width, height, zoom, scale, lang, marker: area.exact });
    const r = Math.round(AREA_RADIUS_M / metersPerPixel(area.lat, zoom));
    // The circle lives in the image's pixel space; "slice" crops like the image's object-fit: cover.
    const circle = area.exact ? '' : `<svg class="lb-map-area" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
            <circle cx="${width / 2}" cy="${height / 2}" r="${r}"/></svg>`;
    const data = `data-lat="${area.lat}" data-lon="${area.lon}" data-exact="${area.exact}" data-zoom="${zoom}"`;
    return `<div class="lb-map${area.exact ? '' : ' lb-map--approx'}${className ? ` ${className}` : ''}" ${data} role="img" aria-label="${escHtml(alt)}">
        ${src ? `<img class="lb-map-static" src="${escHtml(src)}" width="${width}" height="${height}" alt="" loading="lazy">${circle}` : ''}
        ${area.exact || !areaLabel ? '' : `<span class="lb-map-label">${escHtml(areaLabel)}</span>`}
    </div>`;
}

/**
 * Mount the fallback where the static image fails or is missing. Returns a cleanup function.
 * @param {HTMLElement} root - contains `.lb-map` elements from siteMapHtml
 * @param {{loadLeaflet: () => Promise<Object>, tileUrl: string, attribution: string}} leaflet
 */
export function wireSiteMap(root, { loadLeaflet, tileUrl, attribution }) {
    const maps = [];
    let gone = false;
    const fallBack = async el => {
        el.querySelector('.lb-map-static')?.remove();
        el.querySelector('.lb-map-area')?.remove();
        const lat = Number(el.dataset.lat);
        const lon = Number(el.dataset.lon);
        const exact = el.dataset.exact === 'true';
        const box = document.createElement('div');
        box.className = 'lb-map-leaflet';
        el.prepend(box);
        try {
            const L = await loadLeaflet();
            if (gone || !box.isConnected) return;
            const map = L.map(box, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
            L.tileLayer(tileUrl, { maxZoom: 19, attribution }).addTo(map);
            map.setView([lat, lon], Number(el.dataset.zoom) || 13);
            if (exact) L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#d62d20', fillOpacity: 1 }).addTo(map);
            else L.circle([lat, lon], { radius: AREA_RADIUS_M, color: '#2980b9', weight: 2, fillColor: '#2980b9', fillOpacity: 0.15 }).addTo(map);
            maps.push(map);
        } catch (error) {
            console.warn('Site map unavailable', error);
            el.remove();
        }
    };
    // Mapy.com answers a key it refuses here (another referrer, quota) with a small 256 × 256 error picture and
    // an HTTP error, which an <img> shows without an error event: anything but the requested size falls back too.
    const wrong = img => { const w = Number(img.getAttribute('width')); return img.naturalWidth === 0 || ![w, w * 2].includes(img.naturalWidth); };
    for (const el of root.querySelectorAll('.lb-map')) {
        const img = el.querySelector('.lb-map-static');
        if (!img) fallBack(el);
        else if (img.complete && img.getAttribute('src')) { if (wrong(img)) fallBack(el); }
        else {
            img.addEventListener('error', () => fallBack(el), { once: true });
            img.addEventListener('load', () => { if (wrong(img)) fallBack(el); }, { once: true });
        }
    }
    return () => {
        gone = true;
        for (const m of maps) m.remove();
        maps.length = 0;
    };
}
