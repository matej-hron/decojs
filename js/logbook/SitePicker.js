/**
 * Full-screen site picker: an OpenStreetMap map (Leaflet, loaded on demand)
 * with the existing sites as markers, a tap-to-place pin and a small form.
 *
 * `siteFromForm` is pure (covered by tests); the rest needs a browser.
 */

import { parseDecimal } from './entryModel.js';
import { loadScript } from './photo.js';
import { translate, getCurrentLanguage } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_VIEW = Object.freeze({ lat: 49.8, lon: 15.5, zoom: 6 });

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

/**
 * Parse pasted coordinates such as `49.7856, 13.4012`, `49,7856 13,4012` or
 * `49.7856N 13.4012E`. Decimal commas and N/S/E/W prefixes or suffixes are accepted;
 * S and W make the value negative. Null when the text is not a valid latitude/longitude pair.
 * @param {string} text
 * @returns {{lat: number, lon: number}|null}
 */
export function parseCoordinates(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(/[°º]/g, ' ').trim();
    if (!clean || !/^[\s\d.,;+\-NSEWnsew]+$/.test(clean)) return null;
    const tokens = clean.match(/[NSEWnsew]|[+-]?\d+(?:[.,]\d+)?/g) ?? [];
    const nums = [];
    let pending = null;
    for (const tok of tokens) {
        if (/^[a-z]$/i.test(tok)) {
            const letter = tok.toUpperCase();
            const prev = nums[nums.length - 1];
            if (prev && !prev.letter) prev.letter = letter;
            else if (!pending) pending = letter;
            else return null;
        } else {
            nums.push({ value: Number(tok.replace(',', '.')), letter: pending });
            pending = null;
        }
    }
    if (pending || nums.length !== 2 || nums.some(n => !Number.isFinite(n.value))) return null;
    let [first, second] = nums;
    if (first.letter || second.letter) {
        if (!first.letter || !second.letter) return null;
        if ('EW'.includes(first.letter)) [first, second] = [second, first];
        if (!'NS'.includes(first.letter) || !'EW'.includes(second.letter)) return null;
        first = { value: Math.abs(first.value) * (first.letter === 'S' ? -1 : 1) };
        second = { value: Math.abs(second.value) * (second.letter === 'W' ? -1 : 1) };
    }
    const lat = first.value;
    const lon = second.value;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

/** Nominatim usage policy: at most one request per second. */
export const SEARCH_MIN_INTERVAL_MS = 1000;
export const nominatimUrl = (query, lang) =>
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}&accept-language=${encodeURIComponent(lang)}`;

/**
 * Open the picker.
 * @param {{store: Object, sites?: Object[], initial?: Object|null, initialName?: string, signal?: AbortSignal}} options
 * `signal` closes the picker (as a cancel) when aborted.
 * @returns {Promise<Object|null>} the chosen or saved site, or null when cancelled
 */
export function openSitePicker({ store, sites = [], initial = null, initialName = '', signal = null }) {
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
                <div class="lb-actions">
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
        const setError = text => { errorEl.textContent = text; errorEl.hidden = !text; };

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
        form.elements.name.value = initialName;
        for (const b of overlay.querySelectorAll('[data-act="cancel"]')) b.addEventListener('click', () => close(null));

        const placePin = (L, lat, lon) => {
            const round6 = v => Math.round(v * 1e6) / 1e6;
            pin = { lat: round6(lat), lon: round6(lon) };
            if (pinMarker) pinMarker.setLatLng([lat, lon]);
            else pinMarker = L.circleMarker([lat, lon], { radius: 11, color: '#fff', weight: 3, fillColor: '#d62d20', fillOpacity: 1, className: 'lb-picker-pin' }).addTo(map);
            setError('');
        };

        let mapApi = null; // { L } once Leaflet has loaded
        let lastSearchAt = 0;
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
        const prefillName = displayName => {
            const nameInput = form.elements.name;
            const first = String(displayName ?? '').split(',')[0].trim();
            if (first && !nameInput.value.trim()) nameInput.value = first;
        };
        const renderResults = places => {
            listEl.replaceChildren();
            for (const place of places) {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = place.display_name;
                btn.addEventListener('click', () => {
                    const lat = Number(place.lat);
                    const lon = Number(place.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                    const bb = Array.isArray(place.boundingbox) ? place.boundingbox.map(Number) : null;
                    goTo(lat, lon, bb && bb.length === 4 && bb.every(Number.isFinite) ? bb : null);
                    prefillName(place.display_name);
                    resultsEl.hidden = true;
                });
                li.appendChild(btn);
                listEl.appendChild(li);
            }
            listEl.hidden = places.length === 0;
            creditEl.hidden = places.length === 0;
            resultsEl.hidden = false;
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
                const wait = lastSearchAt + SEARCH_MIN_INTERVAL_MS - Date.now();
                listEl.hidden = true;
                creditEl.hidden = true;
                showStatus(ts('searching', 'Searching…'));
                lastSearchAt = Math.max(Date.now(), lastSearchAt + SEARCH_MIN_INTERVAL_MS); // reserve the slot
                if (wait > 0) await new Promise(r => setTimeout(r, wait));
                if (stale()) return;
                const response = await fetch(nominatimUrl(query, getCurrentLanguage()), { signal: signal ?? undefined });
                if (!response.ok) throw new Error(`Nominatim ${response.status}`);
                const places = await response.json();
                if (stale()) return;
                if (!Array.isArray(places) || places.length === 0) { showStatus(ts('noResults', 'No places found')); return; }
                showStatus('');
                renderResults(places);
            } catch (error) {
                if (stale()) return;
                console.error(error);
                showStatus(ts('searchFailed', 'Search is not available right now. Check your connection or tap the map.'));
            }
        });

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            const row = siteFromForm(data, pin);
            if (!row) { setError(ts('nameRequired', 'Enter a name for the site.')); return; }
            if (!pin) { setError(ts('pinRequired', 'Tap the map to place the site.')); return; }
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                // A known site that only lacks coordinates gets them instead of a duplicate.
                const known = sites.find(s => s.name.toLocaleLowerCase() === row.name.toLocaleLowerCase() && !(Number.isFinite(s.lat) && Number.isFinite(s.lon)));
                const saved = known ? await store.saveSite(row, known.id) : await store.saveSite(row);
                close(saved);
            } catch (error) {
                console.error(error);
                if (closed) return;
                submit.disabled = false;
                setError(ts('saveFailed', 'The site could not be saved. Please try again.'));
            }
        });

        loadLeaflet().then(L => {
            if (closed) return;
            mapApi = { L };
            const mapEl = overlay.querySelector('.lb-picker-map');
            map = L.map(mapEl, { zoomControl: true });
            L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

            const located = sites.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
            for (const site of located) {
                L.circleMarker([site.lat, site.lon], { radius: 10, color: '#fff', weight: 2, fillColor: '#2980b9', fillOpacity: 0.95 })
                    .bindTooltip(escHtml(site.name)).addTo(map)
                    .on('click', ev => { L.DomEvent.stopPropagation(ev); close(site); });
            }
            map.on('click', ev => placePin(L, ev.latlng.lat, ev.latlng.lng));
            map.on('dragstart zoomstart', () => { userMoved = true; });

            if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lon)) {
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
