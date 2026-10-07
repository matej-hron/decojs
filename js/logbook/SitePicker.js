/**
 * Full-screen site picker: an OpenStreetMap map (Leaflet, loaded on demand)
 * with the existing sites as markers, a tap-to-place pin and a small form.
 *
 * `siteFromForm` is pure (covered by tests); the rest needs a browser.
 */

import { parseDecimal } from './entryModel.js';
import { loadScript } from './photo.js';
import { parseCoordinates, nearbySameNameSite, mapySuggestUrl, mapyTileUrl, mapyProbeUrl, placesFromMapy, placesFromNominatim } from './geo.js';
import { MAPY_API_KEY } from '../backend/config.js';

export { parseCoordinates };
import { translate, getCurrentLanguage } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAPY_LOGO = 'https://api.mapy.com/img/api/logo.svg';
const MAPY_COPYRIGHT = '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">Seznam.cz a.s. a další</a>';
const MAPY_ATTRIBUTION = `${MAPY_COPYRIGHT}, ${'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}`;
const LAYER_STORAGE_KEY = 'decojs.logbook.mapLayer';
/** Mapy.com allows 100 requests per second per key; keep typing-speed submits well below that. */
export const MAPY_MIN_INTERVAL_MS = 250;
/** A new site this close to a same-named one is probably the same place. */
export const DUPLICATE_RADIUS_M = 300;
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const DEFAULT_VIEW = Object.freeze({ lat: 49.8, lon: 15.5, zoom: 6 });

const readLayerChoice = () => { try { return localStorage.getItem(LAYER_STORAGE_KEY) === 'aerial' ? 'aerial' : 'map'; } catch { return 'map'; } };
const saveLayerChoice = choice => { try { localStorage.setItem(LAYER_STORAGE_KEY, choice); } catch { /* storage unavailable */ } };

const ts = (key, fallback) => translate(`diveLog.logbook.site.${key}`, fallback ?? key);

let leafletPromise = null;

/** Load Leaflet (script and stylesheet) once. */
export function loadLeaflet() {
    if (globalThis.L?.map) return Promise.resolve(globalThis.L);
    if (!leafletPromise) {
        if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = LEAFLET_CSS;
            document.head.appendChild(css);
        }
        leafletPromise = loadScript(LEAFLET_JS).then(() => globalThis.L, error => { leafletPromise = null; throw error; });
    }
    return leafletPromise;
}

/**
 * Site row from the picker form and the placed pin. Null without a name.
 * @param {{name?: string, water?: string, altitude?: string}} form
 * @param {{lat: number, lon: number}|null} pin
 */
export function siteFromForm(form, pin) {
    const name = String(form.name ?? '').trim();
    if (!name) return null;
    const altitude = parseDecimal(form.altitude);
    return {
        name,
        lat: pin?.lat ?? null,
        lon: pin?.lon ?? null,
        water: form.water === 'salt' || form.water === 'fresh' ? form.water : null,
        altitude_m: altitude === null ? null : Math.round(altitude),
    };
}

/** Nominatim usage policy: at most one request per second. */
export const SEARCH_MIN_INTERVAL_MS = 1000;
export const nominatimUrl = (query, lang) =>
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}&accept-language=${encodeURIComponent(lang)}`;

/**
 * Open the picker.
 * @param {{store: Object, sites?: Object[], initial?: Object|null, initialName?: string, editSite?: Object|null, signal?: AbortSignal}} options
 * `signal` closes the picker (as a cancel) when aborted.
 * `editSite` opens the picker in edit mode: the form is prefilled from that site, other sites are not selectable,
 * and saving updates that very site (no duplicate guard, no merge by name).
 * @returns {Promise<Object|null>} the chosen or saved site, or null when cancelled
 */
export function openSitePicker({ store, sites = [], initial = null, initialName = '', editSite = null, signal = null }) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'lb-picker';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', ts('title', 'Pick the site on the map'));
        overlay.innerHTML = `
            <div class="lb-picker-bar">
                <strong>${escHtml(ts('title', 'Pick the site on the map'))}</strong>
                <button type="button" class="btn btn-secondary" data-act="locate">${escHtml(ts('locate', 'Use my location'))}</button>
                <button type="button" class="btn btn-secondary" data-act="cancel">${escHtml(ts('cancel', 'Cancel'))}</button>
            </div>
            <form class="lb-picker-search" role="search" novalidate>
                <input type="search" name="q" autocomplete="off" enterkeyhint="search" aria-label="${escHtml(ts('searchLabel', 'Search for a place'))}" placeholder="${escHtml(ts('searchPlaceholder', 'Place or 49.79, 13.40'))}">
                <button type="submit" class="btn btn-secondary">${escHtml(ts('search', 'Search'))}</button>
            </form>
            <div class="lb-picker-results" hidden>
                <p class="lb-picker-status" role="status" hidden></p>
                <ul class="lb-picker-result-list" hidden></ul>
                <p class="lb-picker-credit" hidden>${escHtml(ts('searchCredit', 'Search by Nominatim / OpenStreetMap'))}</p>
            </div>
            <div class="lb-picker-map" role="application" aria-label="${escHtml(ts('map', 'Map'))}"></div>
            <form class="lb-picker-form" novalidate>
                <p class="lb-picker-hint">${escHtml(ts('hint', 'Tap an existing site to choose it, or tap the map to place a new one.'))}</p>
                <div class="lb-row">
                    <label class="lb-field"><span>${escHtml(ts('name', 'Site name'))}</span><input type="text" name="name" autocomplete="off"></label>
                    <label class="lb-field"><span>${escHtml(ts('water', 'Water'))}</span>
                        <select name="water"><option value="">–</option>
                            <option value="salt">${escHtml(ts('salt', 'Salt'))}</option><option value="fresh">${escHtml(ts('fresh', 'Fresh'))}</option></select></label>
                    <label class="lb-field"><span>${escHtml(ts('altitude', 'Altitude (m)'))}</span><input type="text" name="altitude" inputmode="decimal" autocomplete="off"></label>
                </div>
                <p class="lb-form-error" role="alert" hidden></p>
                <div class="lb-confirm lb-dup" role="alertdialog" hidden>
                    <p class="lb-dup-text"></p>
                    <div class="lb-actions">
                        <button type="button" class="btn btn-primary" data-act="dup-use"></button>
                        <button type="button" class="btn btn-secondary" data-act="dup-new">${escHtml(ts('duplicateNew', 'Save as new'))}</button>
                    </div>
                </div>
                <div class="lb-actions lb-picker-actions">
                    <button type="submit" class="btn btn-primary">${escHtml(ts('save', 'Save site'))}</button>
                    <button type="button" class="btn btn-secondary" data-act="cancel">${escHtml(ts('cancel', 'Cancel'))}</button>
                </div>
            </form>`;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.appendChild(overlay);

        let map = null;
        let pinMarker = null;
        let pin = null;
        let userMoved = false;
        let closed = false;
        const form = overlay.querySelector('.lb-picker-form');
        const searchForm = overlay.querySelector('.lb-picker-search');
        const resultsEl = overlay.querySelector('.lb-picker-results');
        const statusEl = resultsEl.querySelector('.lb-picker-status');
        const listEl = resultsEl.querySelector('.lb-picker-result-list');
        const creditEl = resultsEl.querySelector('.lb-picker-credit');
        const errorEl = overlay.querySelector('.lb-form-error');
        const dupEl = overlay.querySelector('.lb-dup');
        const setError = text => { errorEl.textContent = text; errorEl.hidden = !text; };
        const hideDup = () => { dupEl.hidden = true; };

        const close = result => {
            if (closed) return;
            closed = true;
            signal?.removeEventListener('abort', onAbort);
            document.removeEventListener('keydown', onKey, true);
            map?.remove();
            overlay.remove();
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
            resolve(result);
        };
        const onKey = e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        };
        const onAbort = () => close(null);
        document.addEventListener('keydown', onKey, true);
        if (signal?.aborted) { close(null); return; }
        signal?.addEventListener('abort', onAbort);
        form.elements.name.value = editSite ? editSite.name ?? '' : initialName;
        if (editSite) {
            form.elements.water.value = editSite.water ?? '';
            form.elements.altitude.value = editSite.altitude_m ?? '';
            form.querySelector('.lb-picker-hint').textContent = ts('editHint', 'Tap the map to move the pin, then save.');
        }
        for (const b of overlay.querySelectorAll('[data-act="cancel"]')) b.addEventListener('click', () => close(null));

        const placePin = (L, lat, lon) => {
            const round6 = v => Math.round(v * 1e6) / 1e6;
            pin = { lat: round6(lat), lon: round6(lon) };
            if (pinMarker) pinMarker.setLatLng([lat, lon]);
            else pinMarker = L.circleMarker([lat, lon], { radius: 11, color: '#fff', weight: 3, fillColor: '#d62d20', fillOpacity: 1, className: 'lb-picker-pin' }).addTo(map);
            setError('');
            hideDup();
        };

        let mapApi = null; // { L } once Leaflet has loaded
        const lastSearchAt = { mapy: 0, nominatim: 0 };
        const MIN_INTERVAL = { mapy: MAPY_MIN_INTERVAL_MS, nominatim: SEARCH_MIN_INTERVAL_MS };
        let mapyActive = false; // Mapy.com layers and search are in use (key set and not failed)
        /** Wait for the provider's rate-limit slot; the slot is reserved immediately so racing submits queue up. */
        const waitForSlot = async provider => {
            const wait = lastSearchAt[provider] + MIN_INTERVAL[provider] - Date.now();
            lastSearchAt[provider] = Math.max(Date.now(), lastSearchAt[provider] + MIN_INTERVAL[provider]);
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
        };
        let mapFailed = false;
        let searchSeq = 0; // the newest submit wins; older responses are dropped
        const showStatus = text => {
            resultsEl.hidden = !text && listEl.hidden;
            statusEl.textContent = text;
            statusEl.hidden = !text;
        };
        const goTo = (lat, lon, bbox) => {
            const { L } = mapApi;
            placePin(L, lat, lon);
            if (bbox) map.flyToBounds(L.latLngBounds([bbox[0], bbox[2]], [bbox[1], bbox[3]]), { maxZoom: 16 });
            else map.flyTo([lat, lon], 14);
            userMoved = true;
        };
        const prefillName = name => {
            const nameInput = form.elements.name;
            const first = String(name ?? '').split(',')[0].trim();
            if (first && !nameInput.value.trim()) nameInput.value = first;
        };
        const renderResults = (places, creditText) => {
            listEl.replaceChildren();
            for (const place of places) {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                if (place.detail && place.detail !== place.name) {
                    const strong = document.createElement('strong');
                    strong.textContent = place.name;
                    const small = document.createElement('small');
                    small.textContent = place.detail;
                    btn.append(strong, document.createElement('br'), small);
                } else {
                    btn.textContent = place.name;
                }
                btn.addEventListener('click', () => {
                    goTo(place.lat, place.lon, place.bbox);
                    prefillName(place.name);
                    resultsEl.hidden = true;
                });
                li.appendChild(btn);
                listEl.appendChild(li);
            }
            creditEl.textContent = creditText;
            listEl.hidden = places.length === 0;
            creditEl.hidden = places.length === 0;
            resultsEl.hidden = false;
        };
        const searchNominatim = async query => {
            const response = await fetch(nominatimUrl(query, getCurrentLanguage()), { signal: signal ?? undefined });
            if (!response.ok) throw new Error(`Nominatim ${response.status}`);
            return placesFromNominatim(await response.json());
        };
        searchForm.addEventListener('submit', async e => {
            e.preventDefault();
            const query = searchForm.elements.q.value.trim();
            if (!query) return;
            const seq = ++searchSeq;
            if (!mapApi) {
                showStatus(mapFailed ? ts('mapFailed', 'The map could not be loaded. Check your connection.')
                    : ts('mapLoading', 'The map is still loading…'));
                return;
            }
            const coords = parseCoordinates(query);
            if (coords) {
                listEl.hidden = true;
                creditEl.hidden = true;
                showStatus('');
                goTo(coords.lat, coords.lon, null);
                return;
            }
            const stale = () => closed || seq !== searchSeq;
            try {
                listEl.hidden = true;
                creditEl.hidden = true;
                showStatus(ts('searching', 'Searching…'));
                let places = null;
                let credit = ts('searchCredit', 'Search by Nominatim / OpenStreetMap');
                if (mapyActive) {
                    try {
                        await waitForSlot('mapy');
                        if (stale()) return;
                        const center = map.getCenter();
                        const response = await fetch(mapySuggestUrl(query, { lang: getCurrentLanguage(), apiKey: MAPY_API_KEY, center: { lat: center.lat, lon: center.lng } }), { signal: signal ?? undefined });
                        if (!response.ok) throw new Error(`Mapy.com suggest ${response.status}`);
                        places = placesFromMapy(await response.json());
                        credit = ts('searchCreditMapy', 'Search by Mapy.com');
                    } catch (mapyError) {
                        if (stale()) return;
                        console.warn('Mapy.com search failed, using Nominatim:', mapyError?.message); // message never contains the URL
                    }
                }
                if (!places?.length) { // Mapy failed or found nothing: try OpenStreetMap
                    credit = ts('searchCredit', 'Search by Nominatim / OpenStreetMap');
                    await waitForSlot('nominatim');
                    if (stale()) return;
                    places = await searchNominatim(query);
                }
                if (stale()) return;
                if (places.length === 0) { showStatus(ts('noResults', 'No places found')); return; }
                showStatus('');
                renderResults(places, credit);
            } catch (error) {
                if (stale()) return;
                console.error(error);
                showStatus(ts('searchFailed', 'Search is not available right now. Check your connection or tap the map.'));
            }
        });

        let dupUse = null;
        let skipGuard = false;
        dupEl.querySelector('[data-act="dup-use"]').addEventListener('click', () => close(dupUse));
        dupEl.querySelector('[data-act="dup-new"]').addEventListener('click', () => { skipGuard = true; form.requestSubmit(); });
        form.elements.name.addEventListener('input', hideDup);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            const row = siteFromForm(data, pin);
            if (!row) { setError(ts('nameRequired', 'Enter a name for the site.')); return; }
            if (!pin) { setError(ts('pinRequired', 'Tap the map to place the site.')); return; }
            if (!editSite && !skipGuard) {
                const near = nearbySameNameSite(sites, row.name, pin, DUPLICATE_RADIUS_M);
                if (near) {
                    dupEl.querySelector('.lb-dup-text').textContent = fill(
                        ts('duplicateText', 'A site named {0} is already here ({1}\u00a0m away).'), near.site.name, Math.round(near.distance));
                    dupEl.querySelector('[data-act="dup-use"]').textContent = ts('duplicateUse', 'Use it');
                    dupUse = near.site;
                    dupEl.hidden = false;
                    return;
                }
            }
            skipGuard = false;
            hideDup();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                // A known site that only lacks coordinates gets them instead of a duplicate.
                const known = editSite ? null : sites.find(s => s.name.toLocaleLowerCase() === row.name.toLocaleLowerCase() && !(Number.isFinite(s.lat) && Number.isFinite(s.lon)));
                const saved = editSite ? await store.saveSite(row, editSite.id)
                    : known ? await store.saveSite(row, known.id) : await store.saveSite(row);
                close(saved);
            } catch (error) {
                console.error(error);
                if (closed) return;
                submit.disabled = false;
                setError(ts('saveFailed', 'The site could not be saved. Please try again.'));
            }
        });

        const setupLayers = L => {
            const osm = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION });
            if (!MAPY_API_KEY) { osm.addTo(map); return; }
            const mapyLayer = (mapset, extra = {}) => L.tileLayer(mapyTileUrl(mapset, MAPY_API_KEY), { maxZoom: 20, attribution: MAPY_ATTRIBUTION, ...extra });
            const outdoor = mapyLayer('outdoor');
            const aerial = L.layerGroup([mapyLayer('aerial'), mapyLayer('names-overlay', { attribution: '' })]);
            const logo = L.control({ position: 'bottomleft' });
            logo.onAdd = () => {
                const a = L.DomUtil.create('a', 'lb-mapy-logo');
                a.href = 'https://mapy.com/';
                a.target = '_blank';
                a.rel = 'noopener';
                a.innerHTML = `<img src="${MAPY_LOGO}" alt="Mapy.com" height="30">`;
                L.DomEvent.disableClickPropagation(a); // a click on the logo must not place a pin
                return a;
            };
            const choices = { [ts('layerMap', 'Map')]: outdoor, [ts('layerAerial', 'Aerial')]: aerial };
            const switcher = L.control.layers(choices, null, { position: 'topright', collapsed: true });
            (readLayerChoice() === 'aerial' ? aerial : outdoor).addTo(map);
            switcher.addTo(map);
            logo.addTo(map);
            mapyActive = true;
            map.on('baselayerchange', ev => saveLayerChoice(ev.layer === aerial ? 'aerial' : 'map'));
            let fellBack = false;
            const fallBack = () => {
                if (fellBack || closed) return;
                fellBack = true;
                mapyActive = false;
                switcher.remove();
                logo.remove();
                map.removeLayer(outdoor);
                map.removeLayer(aerial);
                if (map.getZoom() > 19) map.setZoom(19); // OSM tiles stop at 19
                osm.addTo(map);
            };
            // Tiles answer 401/403 with an error picture, which Leaflet sees as success: probe the key once.
            fetch(mapyProbeUrl('outdoor', MAPY_API_KEY)).then(r => { if (!r.ok) fallBack(); }, fallBack);
            // Single tile errors (e.g. no aerial imagery at that zoom abroad) are not a reason to drop Mapy.
        };

        loadLeaflet().then(L => {
            if (closed) return;
            mapApi = { L };
            const mapEl = overlay.querySelector('.lb-picker-map');
            map = L.map(mapEl, { zoomControl: true });
            setupLayers(L);

            const located = sites.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
            for (const site of located) {
                if (editSite && site.id === editSite.id) continue; // the pin stands for it
                const marker = L.circleMarker([site.lat, site.lon], { radius: 10, color: '#fff', weight: 2, fillColor: '#2980b9', fillOpacity: 0.95, interactive: !editSite })
                    .bindTooltip(escHtml(site.name)).addTo(map);
                if (!editSite) marker.on('click', ev => { L.DomEvent.stopPropagation(ev); close(site); });
            }
            map.on('click', ev => placePin(L, ev.latlng.lat, ev.latlng.lng));
            map.on('dragstart zoomstart', () => { userMoved = true; });

            if (editSite && Number.isFinite(editSite.lat) && Number.isFinite(editSite.lon)) {
                placePin(L, editSite.lat, editSite.lon);
                map.setView([editSite.lat, editSite.lon], 14);
            } else if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lon)) {
                map.setView([initial.lat, initial.lon], 13);
            } else if (located.length === 1) {
                map.setView([located[0].lat, located[0].lon], 11);
            } else if (located.length > 1) {
                map.fitBounds(L.latLngBounds(located.map(s => [s.lat, s.lon])), { padding: [30, 30] });
            } else {
                map.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lon], DEFAULT_VIEW.zoom);
                // Start near the diver when no site is known; a refusal just leaves the default view.
                navigator.geolocation?.getCurrentPosition(
                    p => { if (!closed && !userMoved) map.setView([p.coords.latitude, p.coords.longitude], 11); },
                    () => {}, { timeout: 5000, maximumAge: 600000 });
            }
            requestAnimationFrame(() => map?.invalidateSize());

            overlay.querySelector('[data-act="locate"]').addEventListener('click', () => {
                if (!navigator.geolocation) { setError(ts('locationDenied', 'Location is not available. Tap the map instead.')); return; }
                navigator.geolocation.getCurrentPosition(
                    p => {
                        if (closed) return;
                        placePin(L, p.coords.latitude, p.coords.longitude);
                        map.setView([p.coords.latitude, p.coords.longitude], 14);
                    },
                    () => { if (!closed) setError(ts('locationDenied', 'Location is not available. Tap the map instead.')); },
                    { timeout: 10000 });
            });
        }).catch(error => {
            console.error(error);
            mapFailed = true;
            if (!closed) setError(ts('mapFailed', 'The map could not be loaded. Check your connection.'));
        });

        overlay.querySelector('[data-act="cancel"]').focus();
    });
}
