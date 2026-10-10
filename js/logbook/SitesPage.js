/**
 * The Sites tab and the site page.
 *
 * List: with the community directory (migration 0011) "All sites" (every site members may see, with who added it
 * and a conditions line) and "My sites"; as a list (by distance when the location is known, else by name) or a
 * map. Without 0011 only the user's own sites.
 * Site page: any visible site — header, map, Conditions (visibility and water temperature), visits; for the
 * creator also the edit form (rename, water, altitude, notes, link, who can see it), move pin, merge, delete.
 * Dives reference sites by id, so a rename shows up everywhere without touching the dives.
 */

import { DiveStoreError } from '../backend/supabaseStore.js';
import { parseDecimal } from './entryModel.js';
import { mapLinkButtonHtml } from './mapLinks.js';
import { duplicateNameCounts, siteNameKey, mapyStaticMapUrl, parseSiteUrl, siteInfoLinkHtml, distanceMeters } from './geo.js';
import { MAPY_API_KEY } from '../backend/config.js';
import { routeHref } from './router.js';
import { openSitePicker } from './SitePicker.js';
import { translate } from '../i18n.js';
import { currentLang, fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { loadSiteVisits } from './visits.js';
import { visitListHtml } from './SiteVisits.js';
import { siteStatsFromRows, siteSummaryLine } from './siteStats.js';
import { conditionsCardHtml } from './SiteConditions.js';
import { displayName } from './community.js';
import { mountSitesMap, sitePopupHtml } from './SitesMap.js';

const ts = (key, fallback) => translate(`diveLog.logbook.sites.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const NB = ' ';
const PREFS_KEY = 'decojs.logbook.sitesView';

const hasPosition = s => Number.isFinite(s?.lat) && Number.isFinite(s?.lon);

const readPrefs = () => {
    try {
        const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
        return { scope: p.scope === 'mine' ? 'mine' : 'all', view: p.view === 'map' ? 'map' : 'list' };
    } catch { return { scope: 'all', view: 'list' }; }
};
const savePrefs = prefs => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };

/** Sites sorted by name, locale-aware. Pure. */
export function sortSites(sites, lang = currentLang()) {
    return [...sites].sort((a, b) => String(a.name).localeCompare(String(b.name), lang, { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
}

/**
 * The sites of a scope ('all' | 'mine'), nearest first when `here` is known (sites without a position last, by
 * name), else by name. Each gets `distance` (metres) when both positions are known. Pure.
 */
export function orderSites(sites, { scope = 'all', here = null, lang = currentLang() } = {}) {
    const chosen = scope === 'mine' ? sites.filter(s => s.own !== false) : sites;
    const byName = sortSites(chosen, lang);
    if (!hasPosition(here)) return byName.map(s => ({ ...s, distance: null }));
    const withDistance = byName.map(s => ({ ...s, distance: hasPosition(s) ? distanceMeters(here, s) : null }));
    return withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

/** "350 m" / "4,2 km" / "120 km". */
export function distanceText(m, lang = currentLang()) {
    if (!Number.isFinite(m)) return '';
    if (m < 1000) return `${Math.round(m / 10) * 10}${NB}m`;
    return m < 10000 ? `${fmtNum(m / 1000, 1, lang)}${NB}km` : `${Math.round(m / 1000)}${NB}km`;
}

/** "3 dives" in the plural form of the UI language. */
export function diveCountText(n, lang = currentLang()) {
    let category = 'other';
    try { category = new Intl.PluralRules(lang).select(n); } catch { /* keep other */ }
    const form = category === 'one' ? 'diveCountOne' : category === 'few' ? 'diveCountFew' : 'diveCountOther';
    const fallback = { diveCountOne: '{0} dive', diveCountFew: '{0} dives', diveCountOther: '{0} dives' }[form];
    return fill(ts(form, fallback), n);
}

/**
 * Parse the altitude field: empty is none, otherwise a whole number of metres.
 * @returns {{ok: true, value: number|null}|{ok: false}}
 */
export function parseAltitude(text) {
    if (String(text ?? '').trim() === '') return { ok: true, value: null };
    const n = parseDecimal(text);
    return n !== null && Number.isInteger(n) ? { ok: true, value: n } : { ok: false };
}

const valuesFromSite = site => ({
    name: site.name ?? '', water: site.water ?? '', altitude: site.altitude_m ?? '', notes: site.notes ?? '', url: site.url ?? '',
    visibility: site.visibility === 'private' ? 'private' : 'members',
});

/**
 * Remove a Mapy.com static map that failed. A key refused here (another referrer, quota) answers with a small
 * error picture and no error event: anything but the requested size (or its 2× version) counts as failed.
 */
function watchMapImage(img) {
    const drop = () => (img.closest('.lb-site-preview-wrap') ?? img).remove();
    const wrong = () => { const w = Number(img.getAttribute('width')); return img.naturalWidth === 0 || ![w, w * 2].includes(img.naturalWidth); };
    if (img.complete && img.getAttribute('src')) { if (wrong()) drop(); return; }
    img.addEventListener('error', drop, { once: true });
    img.addEventListener('load', () => { if (wrong()) drop(); }, { once: true });
}

const LOCK = '<svg class="lb-lock-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export class SitesPage {
    /**
     * @param {HTMLElement} container
     * @param {{store: Object, siteId?: string|null, userId?: string|null, siteLink?: boolean, onDone?: () => void, onMissing?: () => void}} options
     * `siteId` null shows the list, otherwise the page of that site. `siteLink`: the database has site links
     * (migration 0006). `onDone` is called after save, merge or delete.
     */
    constructor(container, { store, siteId = null, userId = null, siteLink = false, onDone = () => {}, onMissing = () => {} }) {
        this.container = container;
        this.store = store;
        this.siteId = siteId;
        this.userId = userId;
        this.siteLink = siteLink;
        this.community = false; // the community directory (0011) is available
        this.prefs = readPrefs();
        this.here = null;
        this.locating = false;
        this.locateFailed = false;
        this.visits = null; // null while loading, else {rows, capped} | {failed: true}
        this.stats = null; // null while loading, else the site_stats shape | {failed: true}
        this.members = new Map();
        this.avatars = new Map();
        this.showAllVisits = false;
        this.onDone = onDone;
        this.onMissing = onMissing;
        this.destroyed = false;
        this.sites = null;
        this.usage = new Map();
        this.site = null;
        this.values = null;
        this.mergeTarget = '';
        this.confirm = null; // 'merge' | 'delete'
        this.busy = false;
        this.error = '';
        this._pickAbort = null;
        this._mapCleanup = null;
        this.render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this._pickAbort?.abort();
        this._mapCleanup?.();
        this.container.innerHTML = '';
    }

    /** Re-render after a language change, keeping what was typed. */
    relabel() {
        if (this.destroyed) return;
        this._readDom();
        this.render();
    }

    async _load() {
        try {
            const listAll = typeof this.store.listAllSites === 'function' ? () => this.store.listAllSites() : () => this.store.listSites();
            const [sites, usage, siteLink, community] = await Promise.all([listAll(), this.store.siteUsage(),
                this.siteId && typeof this.store.descriptionStatus === 'function'
                    ? this.store.descriptionStatus().catch(error => { console.warn(error); return false; }) : this.siteLink,
                typeof this.store.communitySitesStatus === 'function'
                    ? this.store.communitySitesStatus().catch(error => { console.warn(error); return false; }) : false]);
            if (this.destroyed) return;
            this.siteLink = siteLink;
            this.community = community === true;
            this.sites = sites.map(s => ({ ...s, own: s.own ?? (s.owner ? s.owner === this.userId : true) }));
            this.usage = usage;
            if (this.siteId) {
                this.site = this.sites.find(s => s.id === this.siteId) ?? null;
                if (!this.site) { this.onMissing(); return; }
                this.values = valuesFromSite(this.site);
            }
            this.render();
            if (this.community) this._loadMembers();
            if (this.site) this._loadSiteData();
            else this._autoLocate();
        } catch (error) {
            if (this.destroyed) return;
            console.error(error);
            this.loadFailed = true;
            this.error = this._errorText(error);
            this.render();
        }
    }

    /** Names and avatars of the members (who added a site, who dived it). */
    async _loadMembers() {
        if (typeof this.store.listMembers !== 'function') return;
        const members = await this.store.listMembers().catch(e => { console.error(e); return []; });
        if (this.destroyed) return;
        this.members = new Map((members ?? []).map(m => [m.id, m]));
        this._readDom();
        this.render();
    }

    /** Use the position when the browser already has permission (no prompt); otherwise wait for the button. */
    async _autoLocate() {
        try {
            const p = await navigator.permissions?.query?.({ name: 'geolocation' });
            if (p?.state === 'granted') this._locate();
        } catch { /* no Permissions API: keep the name order */ }
    }

    _locate() {
        if (!navigator.geolocation || this.locating) return;
        this.locating = true;
        this.locateFailed = false;
        this.render();
        navigator.geolocation.getCurrentPosition(p => {
            if (this.destroyed) return;
            this.locating = false;
            this.here = { lat: p.coords.latitude, lon: p.coords.longitude };
            this.render();
        }, () => {
            if (this.destroyed) return;
            this.locating = false;
            this.locateFailed = true;
            this.render();
        }, { timeout: 10000, maximumAge: 600000 });
    }

    /** Conditions and visits of the site; each failure only affects its own card. */
    async _loadSiteData() {
        const site = this.site;
        try {
            if (this.community) {
                const [stats, rows] = await Promise.all([this.store.siteStats(site.id), this.store.siteVisits(site.id, { limit: 200 })]);
                if (this.destroyed) return;
                this.stats = stats ?? siteStatsFromRows([]);
                this.visits = { rows: rows ?? [], capped: (rows ?? []).length >= 200 };
            } else {
                const visits = await loadSiteVisits(this.store, site, { userId: this.userId });
                if (this.destroyed) return;
                this.visits = visits;
                this.stats = siteStatsFromRows(visits.rows);
            }
        } catch (error) {
            if (this.destroyed) return;
            console.error(error);
            this.visits = { failed: true };
            this.stats = { failed: true };
        }
        this._readDom();
        this.render();
        await this._loadAvatars();
    }

    async _loadAvatars() {
        const rows = this.visits?.rows ?? [];
        const others = rows.some(r => r.owner && r.owner !== this.userId) || (this.site && !this.site.own);
        if (!others || typeof this.store.listMembers !== 'function') return;
        if (!this.members.size) {
            const members = await this.store.listMembers().catch(e => { console.error(e); return []; });
            if (this.destroyed) return;
            this.members = new Map((members ?? []).map(m => [m.id, m]));
        }
        const ids = new Set(rows.map(r => r.owner));
        const paths = [...this.members.values()].filter(m => ids.has(m.id)).map(m => m.avatar_path).filter(Boolean);
        if (paths.length && this.store.avatarUrls) {
            const urls = await this.store.avatarUrls(paths).catch(e => { console.error(e); return new Map(); });
            if (this.destroyed) return;
            this.avatars = urls;
        }
        this._readDom();
        this.render();
    }

    /** "You" for own sites, else the member's name (null while unknown). */
    _ownerName(site) {
        if (site.own) return translate('diveLog.trail.you', 'You');
        const m = this.members.get(site.owner);
        return m ? displayName(m, key => translate(`diveLog.${key}`, 'Diver')) : null;
    }

    _addedBy(site) {
        if (site.own) return ts('addedByYou', 'Added by you');
        const name = this._ownerName(site);
        return name ? fill(ts('addedBy', 'Added by {0}'), name) : '';
    }

    _visitsHtml() {
        const title = `<h2 class="lb-sv-title">${escHtml(ts('visits.title', 'Visits'))}</h2>`;
        if (!this.visits) return `<section class="rda-card lb-sv-card" aria-busy="true">${title}<p class="lb-muted">${escHtml(tb('loading', 'Loading…'))}</p></section>`;
        if (this.visits.failed) return `<section class="rda-card lb-sv-card">${title}<p class="lb-muted" role="alert">${escHtml(ts('visits.failed', 'Could not load the visits.'))}</p></section>`;
        if (!this.visits.rows.length) return `<section class="rda-card lb-sv-card">${title}<p class="lb-muted">${escHtml(ts('visits.empty', 'No dives here yet.'))}</p></section>`;
        return `<section class="rda-card lb-sv-card">${title}${visitListHtml({
            rows: this.visits.rows, showAll: this.showAllVisits, userId: this.userId, members: this.members, avatars: this.avatars, capped: this.visits.capped,
        })}</section>`;
    }

    _errorText(error) {
        if (error instanceof DiveStoreError && error.kind === 'site-in-use') return ts('inUseNow', 'Dives use this site now. Reload and merge it into another site instead.');
        if (error instanceof DiveStoreError && error.kind === 'site-shared') return ts('sharedNow', 'Other members\' dives use this site, so it stays visible to members.');
        if (error instanceof DiveStoreError && error.kind === 'site-unavailable') return ts('unavailable', 'That site is no longer available. Reload and choose another one.');
        return error instanceof DiveStoreError && error.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. If it hasn\'t been used for a week, resume the project in the Supabase dashboard.')
            : tb('genericError', 'Something went wrong. Please try again.');
    }

    _back(href, text) {
        return `<p class="lb-back"><a href="${href}">${escHtml(text)}</a></p>`;
    }

    render() {
        if (this.destroyed) return;
        this._mapCleanup?.();
        this._mapCleanup = null;
        if (this.loadFailed) {
            this.container.innerHTML = `<section class="rda-card lb-message"><p role="alert">${escHtml(this.error)}</p>
                ${this._back(routeHref({ name: 'list' }), ts('backToLogbook', '← Back to the logbook'))}</section>`;
            return;
        }
        if (!this.sites) {
            this.container.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
            return;
        }
        if (this.siteId) this._renderSite();
        else this._renderList();
    }

    // ---- List ----

    _summary(site) {
        return siteSummaryLine(site);
    }

    _cardHtml(site, dupes, scope) {
        const n = scope === 'mine' ? (this.usage.get(site.id) ?? 0) : (site.visits ?? this.usage.get(site.id) ?? 0);
        const dup = scope === 'mine' ? dupes.get(siteNameKey(site.name)) : null;
        const map = hasPosition(site) ? mapyStaticMapUrl({
            lat: site.lat, lon: site.lon, apiKey: MAPY_API_KEY, width: 120, height: 90, zoom: 11,
            scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
        }) : '';
        const summary = this._summary(site);
        const by = this.community ? this._addedBy(site) : '';
        const meta = [by, diveCountText(n)].filter(Boolean).join(' · ');
        return `<a class="rda-card lb-card lb-site-card" href="${routeHref({ name: 'site', id: site.id })}">
            ${map ? `<img class="lb-site-map" src="${escHtml(map)}" width="120" height="90" alt="" loading="lazy">` : '<span class="lb-site-map lb-site-map--none" aria-hidden="true"></span>'}
            <div class="lb-card-body">
                <div class="lb-card-head"><strong class="lb-site-name">${escHtml(site.name)}${site.visibility === 'private'
                    ? `<span class="lb-site-private" title="${escHtml(ts('privateBadge', 'Only you'))}">${LOCK}<span class="rda-visually-hidden">${escHtml(ts('privateBadge', 'Only you'))}</span></span>` : ''}</strong>
                    ${Number.isFinite(site.distance) ? `<span class="lb-date lb-site-dist">${escHtml(distanceText(site.distance))}</span>` : ''}</div>
                <div class="lb-muted lb-site-meta">${escHtml(meta)}</div>
                ${summary ? `<div class="lb-site-sum">${escHtml(summary)}</div>` : ''}
                ${hasPosition(site) ? '' : `<div class="lb-muted">${escHtml(ts('noPosition', 'No position'))}</div>`}
                ${dup ? `<span class="lb-badge">${escHtml(fill(ts('sameName', '{0} sites named {1}'), dup, site.name.trim()))}</span>` : ''}
            </div></a>`;
    }

    _renderList() {
        const scope = this.community ? this.prefs.scope : 'mine';
        const view = this.prefs.view;
        const sites = orderSites(this.sites, { scope, here: this.here });
        const dupes = duplicateNameCounts(this.sites.filter(s => s.own !== false));
        const seg = (attr, value, label, current) => `<button type="button" class="lb-seg" data-${attr}="${value}" aria-pressed="${value === current}">${escHtml(label)}</button>`;
        const scopeSeg = this.community ? `<div class="lb-switch" role="group" aria-label="${escHtml(ts('scopeLabel', 'Which sites'))}">
                ${seg('scope', 'all', ts('allSites', 'All sites'), scope)}${seg('scope', 'mine', ts('mySites', 'My sites'), scope)}</div>` : '';
        const viewSeg = `<div class="lb-switch" role="group" aria-label="${escHtml(ts('viewLabel', 'Show as'))}">
                ${seg('view', 'list', ts('viewList', 'List'), view)}${seg('view', 'map', ts('viewMap', 'Map'), view)}</div>`;
        let near = '';
        if (view === 'list' && !this.here && navigator.geolocation) {
            near = `<button type="button" class="btn btn-secondary lb-sites-near" id="lb-sites-near"${this.locating ? ' disabled aria-busy="true"' : ''}>${escHtml(
                this.locating ? ts('locating', 'Finding your location…') : ts('sortByDistance', 'Sort by distance'))}</button>`;
        }
        const failed = this.locateFailed ? `<p class="lb-muted" role="status">${escHtml(ts('locationFailed', 'Your location is not available, so the sites stay sorted by name.'))}</p>` : '';
        const intro = this.community && scope === 'all'
            ? `<p class="lb-muted lb-sites-intro">${escHtml(ts('directoryIntro', 'Sites added by all members. Pick one for your dive instead of adding it again.'))}</p>` : '';
        let body;
        if (!sites.length) {
            body = `<p class="rda-account-msg">${escHtml(ts('empty', 'No sites yet. Sites are created when you pick a place for a dive.'))}</p>`;
        } else if (view === 'map') {
            body = '<div class="lb-sites-map" role="region"></div>';
        } else {
            body = `<div class="lb-cards">${sites.map(s => this._cardHtml(s, dupes, scope)).join('')}</div>`;
        }
        this.container.innerHTML = `<div class="lb-sites-head">
                <h2 class="lb-sites-title">${escHtml(ts('title', 'Sites'))}</h2>
                <div class="lb-sites-controls">${scopeSeg}${viewSeg}</div></div>
            ${intro}${near}${failed}${body}`;
        const regionLabel = ts('mapTitle', 'Map of the sites');
        this.container.querySelector('.lb-sites-map')?.setAttribute('aria-label', regionLabel);
        for (const img of this.container.querySelectorAll('img.lb-site-map')) watchMapImage(img);
        for (const b of this.container.querySelectorAll('[data-scope]')) b.addEventListener('click', () => this._setPrefs({ scope: b.dataset.scope }, `[data-scope="${b.dataset.scope}"]`));
        for (const b of this.container.querySelectorAll('[data-view]')) b.addEventListener('click', () => this._setPrefs({ view: b.dataset.view }, `[data-view="${b.dataset.view}"]`));
        this.container.querySelector('#lb-sites-near')?.addEventListener('click', () => this._locate());
        const mapEl = this.container.querySelector('.lb-sites-map');
        if (mapEl) {
            this._mapCleanup = mountSitesMap(mapEl, {
                sites, here: this.here,
                popupHtml: site => sitePopupHtml(site, { by: this.community ? this._addedBy(site) : '', summary: this._summary(site) }),
            });
        }
    }

    _setPrefs(patch, focusSel) {
        this.prefs = { ...this.prefs, ...patch };
        savePrefs(this.prefs);
        this.render();
        this.container.querySelector(focusSel)?.focus(); // re-render must not drop keyboard focus
    }

    // ---- Site page ----

    _readDom() {
        const form = this.container.querySelector('.lb-site-form');
        if (form && this.values) {
            this.values = {
                name: form.elements.name.value, water: form.elements.water.value,
                altitude: form.elements.altitude.value, notes: form.elements.notes.value,
                url: form.elements.url ? form.elements.url.value : this.values.url,
                visibility: form.elements.visibility ? form.elements.visibility.value : this.values.visibility,
            };
        }
        const select = this.container.querySelector('#lb-merge-into');
        if (select) this.mergeTarget = select.value;
    }

    /** Sites the user's own site can be merged into: every other visible site, own first. */
    _others() {
        const others = this.sites.filter(s => s.id !== this.siteId);
        return [...sortSites(others.filter(s => s.own !== false)), ...sortSites(others.filter(s => s.own === false))];
    }

    _headHtml() {
        const site = this.site;
        const preview = hasPosition(site) && MAPY_API_KEY ? `<div class="lb-site-preview-wrap lb-map"><img class="lb-site-preview" src="${escHtml(mapyStaticMapUrl({
            lat: site.lat, lon: site.lon, apiKey: MAPY_API_KEY, width: 640, height: 240, zoom: 13,
            scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
        }))}" width="640" height="240" alt="${escHtml(site.name)}">${mapLinkButtonHtml({ lat: site.lat, lon: site.lon, label: site.name, exact: true })}</div>` : '';
        const info = siteInfoLinkHtml(site.url, ts('siteInfo', 'Site info'));
        const dives = this.usage.get(this.siteId) ?? 0;
        const facts = [];
        if (this.community) { const by = this._addedBy(site); if (by) facts.push(by); }
        if (dives) facts.push(fill(ts('inYourLog', '{0} in your log'), diveCountText(dives)));
        if (site.water) facts.push(site.water === 'salt' ? ts('salt', 'Salt') : ts('fresh', 'Fresh'));
        if (Number.isFinite(Number(site.altitude_m)) && site.altitude_m !== null && Number(site.altitude_m) !== 0) {
            facts.push(fill(ts('altitudeFact', 'altitude {0}'), `${fmtNum(Number(site.altitude_m))}${NB}m`));
        }
        const privacy = site.visibility === 'private'
            ? `<p class="lb-site-privacy">${LOCK}<span>${escHtml(ts('privateNote', 'Only you can see this site.'))}</span></p>` : '';
        return `<section class="rda-card lb-sv-head">
                <div class="lb-sv-titlebar">
                    <h2 class="lb-sv-name-h">${escHtml(site.name)}</h2>
                    ${info}
                </div>
                ${facts.length ? `<p class="lb-muted lb-sv-own">${escHtml(facts.join(' · '))}</p>` : ''}
                ${privacy}
                ${preview}
            </section>`;
    }

    _renderSite() {
        const site = this.site;
        const statsHtml = conditionsCardHtml(this.stats?.failed ? null : this.stats, { failed: this.stats?.failed === true });
        const owner = site.own !== false ? this._ownerSectionsHtml() : `<p class="lb-muted lb-site-readonly">${escHtml(ts('readOnly', 'Only the member who added this site can change it.'))}</p>`;
        this.container.innerHTML = `${this._back(routeHref({ name: 'sites' }), ts('backToSites', '← Back to the sites'))}
            ${this._headHtml()}
            ${statsHtml}
            ${this._visitsHtml()}
            ${owner}`;
        const q = sel => this.container.querySelector(sel);
        const preview = q('.lb-site-preview');
        if (preview) watchMapImage(preview);
        q('#lb-sv-all')?.addEventListener('click', () => { this._readDom(); this.showAllVisits = true; this.render(); });
        if (site.own === false) return;
        q('.lb-site-form').addEventListener('submit', e => { e.preventDefault(); this._save(); });
        q('#lb-move-pin').addEventListener('click', () => this._movePin());
        q('#lb-merge')?.addEventListener('click', () => this._askMerge());
        q('#lb-delete')?.addEventListener('click', () => { this._readDom(); this.confirm = 'delete'; this.error = ''; this.render(); });
        q('#lb-confirm-no')?.addEventListener('click', () => { this._readDom(); this.confirm = null; this.render(); });
        q('#lb-confirm-yes')?.addEventListener('click', () => (this.confirm === 'merge' ? this._merge() : this._delete()));
        if (this.confirm) q('#lb-confirm-yes')?.focus();
    }

    _ownerSectionsHtml() {
        const v = this.values;
        const site = this.site;
        const dives = Math.max(this.usage.get(this.siteId) ?? 0, this.stats?.visits ?? 0);
        const inUse = dives > 0 || site.used_by_others === true;
        const others = this._others();
        const disabled = this.busy ? ' disabled' : '';
        const position = hasPosition(site) ? `${fmtNum(site.lat, 5)}, ${fmtNum(site.lon, 5)}` : ts('noPosition', 'No position');
        const target = others.find(s => s.id === this.mergeTarget);
        let confirmHtml = '';
        if (this.confirm === 'merge' && target) {
            confirmHtml = `<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(ts('confirm', 'Confirm'))}">
                <p>${escHtml(fill(ts('mergeConfirm', 'Move {0} to {1} and delete the site {2}? This cannot be undone.'), diveCountText(dives), target.name, site.name))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-confirm-yes"${disabled}>${escHtml(ts('merge', 'Merge'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-confirm-no">${escHtml(ts('cancel', 'Cancel'))}</button></div></div>`;
        } else if (this.confirm === 'delete') {
            confirmHtml = `<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(ts('confirm', 'Confirm'))}">
                <p>${escHtml(fill(ts('deleteConfirm', 'Delete the site {0}? This cannot be undone.'), site.name))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-confirm-yes"${disabled}>${escHtml(ts('delete', 'Delete'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-confirm-no">${escHtml(ts('cancel', 'Cancel'))}</button></div></div>`;
        }
        const label = s => (s.own === false && this._ownerName(s) ? fill(ts('mergeOption', '{0} (added by {1})'), s.name, this._ownerName(s)) : s.name);
        const mergeBlock = others.length ? `<div class="lb-site-block">
                <h3>${escHtml(ts('mergeTitle', 'Merge into another site'))}</h3>
                ${this.community ? `<p class="lb-muted">${escHtml(ts('mergeHint', 'Moves every dive at this site, also other members\' dives, then deletes this site.'))}</p>` : ''}
                <label class="lb-field"><span>${escHtml(ts('mergeInto', 'Merge into…'))}</span>
                    <select id="lb-merge-into"><option value="">–</option>${others.map(s =>
                        `<option value="${escHtml(s.id)}"${s.id === this.mergeTarget ? ' selected' : ''}>${escHtml(label(s))}</option>`).join('')}</select></label>
                <div class="lb-actions"><button type="button" class="btn btn-secondary" id="lb-merge"${disabled}>${escHtml(ts('merge', 'Merge'))}</button></div>
            </div>` : '';
        const deleteBlock = `<div class="lb-site-block">
                <h3>${escHtml(ts('deleteTitle', 'Delete'))}</h3>
                ${!inUse
                    ? `<div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-delete"${disabled}>${escHtml(ts('delete', 'Delete'))}</button></div>`
                    : `<p class="lb-muted">${escHtml(site.used_by_others ? ts('mergeFirstShared', 'Other members\' dives use this site. Merge it into another site to remove it.') : ts('mergeFirst', 'Merge it into another site first.'))}</p>`}
            </div>`;
        const urlField = this.siteLink || site.url ? `<label class="lb-field"><span>${escHtml(ts('url', 'Site info link'))}</span>
                        <input type="url" name="url" inputmode="url" value="${escHtml(v.url)}" placeholder="https://" autocomplete="off" spellcheck="false">
                        <small class="lb-hint">${escHtml(ts('urlHint', 'A page about the site, e.g. in a dive-site directory.'))}</small></label>` : '';
        const visibilityField = this.community ? `<label class="lb-field"><span>${escHtml(ts('visibility', 'Who can see this site'))}</span>
                        <select name="visibility">
                            <option value="members"${v.visibility === 'members' ? ' selected' : ''}>${escHtml(ts('visibilityMembers', 'All members'))}</option>
                            <option value="private"${v.visibility === 'private' ? ' selected' : ''}>${escHtml(ts('visibilityPrivate', 'Only me (secret spot)'))}</option></select>
                        <small class="lb-hint">${escHtml(ts('visibilityHint', 'Members can pick a shared site for their dives. Notes always stay private.'))}</small></label>` : '';
        return `<section class="rda-card lb-form">
                <h2>${escHtml(ts('editTitle', 'Edit site'))}</h2>
                <form class="lb-site-form" novalidate>
                    <label class="lb-field"><span>${escHtml(ts('name', 'Site name'))}</span>
                        <input type="text" name="name" value="${escHtml(v.name)}" maxlength="120" autocomplete="off"></label>
                    <div class="lb-row">
                        <label class="lb-field"><span>${escHtml(ts('water', 'Water'))}</span>
                            <select name="water"><option value="">–</option>
                                <option value="salt"${v.water === 'salt' ? ' selected' : ''}>${escHtml(ts('salt', 'Salt'))}</option>
                                <option value="fresh"${v.water === 'fresh' ? ' selected' : ''}>${escHtml(ts('fresh', 'Fresh'))}</option></select></label>
                        <label class="lb-field"><span>${escHtml(ts('altitude', 'Altitude (m)'))}</span>
                            <input type="text" name="altitude" inputmode="numeric" value="${escHtml(v.altitude)}" autocomplete="off"></label>
                    </div>
                    <label class="lb-field"><span>${escHtml(ts('notes', 'Notes'))}</span>
                        <textarea name="notes" rows="3">${escHtml(v.notes)}</textarea>
                        ${this.community ? `<small class="lb-hint">${escHtml(ts('notesHint', 'Only you see your notes.'))}</small>` : ''}</label>
                    ${urlField}
                    ${visibilityField}
                    <div class="lb-site-position"><span class="${hasPosition(site) ? '' : 'lb-muted'}">${escHtml(position)}</span>
                        <button type="button" class="btn btn-secondary" id="lb-move-pin"${disabled}>${escHtml(ts('movePin', 'Move pin'))}</button></div>
                    <p class="lb-form-error" role="alert"${this.error ? '' : ' hidden'}>${escHtml(this.error)}</p>
                    <div class="lb-actions">
                        <button type="submit" class="btn btn-primary"${disabled}>${escHtml(ts('save', 'Save'))}</button>
                        <a class="btn btn-secondary" href="${routeHref({ name: 'sites' })}">${escHtml(ts('cancel', 'Cancel'))}</a>
                    </div>
                </form>
                ${confirmHtml}
            </section>
            ${mergeBlock ? `<section class="rda-card lb-form">${mergeBlock}</section>` : ''}
            <section class="rda-card lb-form">${deleteBlock}</section>`;
    }

    _setError(text) {
        this.error = text;
        const el = this.container.querySelector('.lb-site-form .lb-form-error');
        if (el) { el.textContent = text; el.hidden = !text; }
    }

    async _run(action) {
        this.busy = true;
        this._readDom();
        this.render();
        try {
            await action();
            return true;
        } catch (error) {
            console.error(error);
            if (!this.destroyed) { this.busy = false; this.confirm = null; this.error = this._errorText(error); this.render(); }
            return false;
        }
    }

    async _save() {
        this._readDom();
        const v = this.values;
        const name = v.name.trim();
        if (!name) { this._setError(ts('nameRequired', 'Enter a name for the site.')); return; }
        const altitude = parseAltitude(v.altitude);
        if (!altitude.ok) { this._setError(ts('altitudeInvalid', 'Enter the altitude as a whole number of metres.')); return; }
        const url = parseSiteUrl(v.url);
        if (!url.ok) { this._setError(ts('urlInvalid', 'Enter a web address that starts with https://')); return; }
        this.error = '';
        const row = {
            name, water: v.water === 'salt' || v.water === 'fresh' ? v.water : null,
            altitude_m: altitude.value, notes: v.notes.trim() || null,
        };
        if (this.siteLink || url.value !== null) row.url = url.value; // without 0006 the store drops it (and an empty one is not sent)
        if (this.community) row.visibility = v.visibility === 'private' ? 'private' : 'members';
        const ok = await this._run(() => this.store.saveSite(row, this.siteId));
        if (ok && !this.destroyed) this.onDone();
    }

    async _movePin() {
        this._readDom();
        this._pickAbort = new AbortController();
        const picked = await openSitePicker({
            store: this.store, sites: this.sites, initial: this.site, editSite: this.site, signal: this._pickAbort.signal,
            ownerName: site => this._ownerName(site),
        });
        this._pickAbort = null;
        if (!picked || this.destroyed) return;
        this.site = { ...this.site, ...picked, own: true };
        this.sites = this.sites.map(s => (s.id === picked.id ? this.site : s));
        // The picker also saved name, water and altitude; unsaved notes, link and visibility stay as typed.
        this.values = { ...valuesFromSite(picked), notes: this.values.notes, url: this.values.url, visibility: this.values.visibility };
        this.error = '';
        this.render();
    }

    _askMerge() {
        this._readDom();
        if (!this._others().some(s => s.id === this.mergeTarget)) { this._setError(ts('mergePick', 'Choose the site to merge into.')); return; }
        this.confirm = 'merge';
        this.error = '';
        this.render();
    }

    async _merge() {
        const ok = await this._run(() => this.store.mergeSite(this.siteId, this.mergeTarget));
        if (ok && !this.destroyed) this.onDone();
    }

    async _delete() {
        const ok = await this._run(() => this.store.deleteSite(this.siteId));
        if (ok && !this.destroyed) this.onDone();
    }
}
