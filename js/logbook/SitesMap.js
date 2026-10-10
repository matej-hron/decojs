/**
 * The Sites tab's map view: every positioned site as a pin (own blue, other members' teal, private ringed dark),
 * a popup with the name, who added it, the conditions line and a link to the site page. Leaflet is loaded on demand.
 */

import { loadLeaflet, setupMapLayers, OWN_PIN, OTHER_PIN } from './SitePicker.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const ts = (key, fallback) => translate(`diveLog.logbook.sites.${key}`, fallback);
const DEFAULT_VIEW = Object.freeze({ lat: 49.8, lon: 15.5, zoom: 6 });
const hasPosition = s => Number.isFinite(s.lat) && Number.isFinite(s.lon);

/**
 * Mount the map into `el`.
 * @param {HTMLElement} el
 * @param {{sites: Object[], here?: {lat: number, lon: number}|null, popupHtml: (site: Object) => string}} options
 * @returns {() => void} cleanup
 */
export function mountSitesMap(el, { sites, here = null, popupHtml }) {
    let map = null;
    let closed = false;
    el.innerHTML = `<p class="lb-muted lb-sites-map-msg">${escHtml(translate('diveLog.backend.loading', 'Loading…'))}</p>`;
    loadLeaflet().then(L => {
        if (closed) return;
        el.innerHTML = '';
        map = L.map(el, { zoomControl: true });
        setupMapLayers(L, map, { isClosed: () => closed, labels: { map: translate('diveLog.logbook.site.layerMap', 'Map'), aerial: translate('diveLog.logbook.site.layerAerial', 'Aerial') } });
        const located = sites.filter(hasPosition);
        for (const site of located) {
            L.circleMarker([site.lat, site.lon], {
                radius: 9, weight: site.visibility === 'private' ? 3 : 2,
                color: site.visibility === 'private' ? '#1f2d3a' : '#fff',
                fillColor: site.own ? OWN_PIN : OTHER_PIN, fillOpacity: 0.95,
            }).bindPopup(popupHtml(site), { className: 'lb-sites-popup', maxWidth: 260 }).addTo(map);
        }
        if (here) {
            L.circleMarker([here.lat, here.lon], { radius: 6, weight: 2, color: '#fff', fillColor: '#d62d20', fillOpacity: 1, interactive: false }).addTo(map);
        }
        if (located.length > 1) map.fitBounds(L.latLngBounds(located.map(s => [s.lat, s.lon])), { padding: [24, 24], maxZoom: 13 });
        else if (located.length === 1) map.setView([located[0].lat, located[0].lon], 12);
        else if (here) map.setView([here.lat, here.lon], 10);
        else map.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lon], DEFAULT_VIEW.zoom);
        requestAnimationFrame(() => map?.invalidateSize());
    }).catch(error => {
        console.error(error);
        if (!closed) el.innerHTML = `<p class="lb-muted lb-sites-map-msg" role="alert">${escHtml(translate('diveLog.logbook.site.mapFailed', 'The map could not be loaded. Check your connection.'))}</p>`;
    });
    return () => { closed = true; map?.remove(); map = null; };
}

/** The popup body of one site. */
export function sitePopupHtml(site, { by, summary }) {
    return `<div class="lb-pop"><strong class="lb-pop-name">${escHtml(site.name)}</strong>
        ${by ? `<span class="lb-pop-by">${escHtml(by)}</span>` : ''}
        ${summary ? `<span class="lb-pop-sum">${escHtml(summary)}</span>` : ''}
        <a class="lb-pop-open" href="${routeHref({ name: 'site', id: site.id })}">${escHtml(ts('openSite', 'Open site'))}</a></div>`;
}
