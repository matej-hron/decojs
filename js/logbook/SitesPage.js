/**
 * Sites management: a list of every site (dive count, position, same-name notes) and an edit page
 * (rename, water, altitude, notes, move the pin, merge into another site, delete an unused one).
 * Dives reference sites by id, so a rename shows up everywhere without touching the dives.
 */

import { DiveStoreError } from '../backend/supabaseStore.js';
import { parseDecimal } from './entryModel.js';
import { duplicateNameCounts, siteNameKey, mapyStaticMapUrl, parseSiteUrl, siteInfoLinkHtml } from './geo.js';
import { MAPY_API_KEY } from '../backend/config.js';
import { routeHref } from './router.js';
import { openSitePicker } from './SitePicker.js';
import { translate } from '../i18n.js';
import { currentLang, fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { loadSiteVisits } from './visits.js';
import { visitSummaryHtml, visitListHtml } from './SiteVisits.js';

const ts = (key, fallback) => translate(`diveLog.logbook.sites.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

const hasPosition = s => Number.isFinite(s.lat) && Number.isFinite(s.lon);

/** Sites sorted by name, locale-aware. Pure. */
export function sortSites(sites, lang = currentLang()) {
    return [...sites].sort((a, b) => String(a.name).localeCompare(String(b.name), lang, { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
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
});

export class SitesPage {
    /**
     * @param {HTMLElement} container
     * @param {{store: Object, siteId?: string|null, userId?: string|null, siteLink?: boolean, onDone?: () => void, onMissing?: () => void}} options
     * `siteId` null shows the list, otherwise the page of that site (visits, then the edit form). `siteLink`: the
     * database has site links (migration 0006). `onDone` is called after save, merge or delete.
     */
    constructor(container, { store, siteId = null, userId = null, siteLink = false, onDone = () => {}, onMissing = () => {} }) {
        this.container = container;
        this.store = store;
        this.siteId = siteId;
        this.userId = userId;
        this.siteLink = siteLink;
        this.visits = null; // null while loading, else {rows, capped} | {failed: true}
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
        this.render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this._pickAbort?.abort();
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
            const [sites, usage, siteLink] = await Promise.all([this.store.listSites(), this.store.siteUsage(),
                this.siteId && typeof this.store.descriptionStatus === 'function'
                    ? this.store.descriptionStatus().catch(error => { console.warn(error); return false; }) : this.siteLink]);
            if (this.destroyed) return;
            this.siteLink = siteLink;
            this.sites = sites;
            this.usage = usage;
            if (this.siteId) {
                this.site = sites.find(s => s.id === this.siteId) ?? null;
                if (!this.site) { this.onMissing(); return; }
                this.values = valuesFromSite(this.site);
            }
            this.render();
            if (this.site) this._loadVisits();
        } catch (error) {
            if (this.destroyed) return;
            console.error(error);
            this.loadFailed = true;
            this.error = this._errorText(error);
            this.render();
        }
    }

    /** Visits and the members' names and avatars; a failure only affects the visits block. */
    async _loadVisits() {
        try {
            const visits = await loadSiteVisits(this.store, this.site, { userId: this.userId });
            if (this.destroyed) return;
            const others = visits.rows.some(r => r.owner && r.owner !== this.userId);
            const members = others && this.store.listMembers ? await this.store.listMembers().catch(e => { console.error(e); return []; }) : [];
            if (this.destroyed) return;
            this.members = new Map((members ?? []).map(m => [m.id, m]));
            this.visits = visits;
            this._readDom();
            this.render();
            const ids = new Set(visits.rows.map(r => r.owner));
            const paths = [...this.members.values()].filter(m => ids.has(m.id)).map(m => m.avatar_path).filter(Boolean);
            if (paths.length && this.store.avatarUrls) {
                const urls = await this.store.avatarUrls(paths).catch(e => { console.error(e); return new Map(); });
                if (this.destroyed || !urls.size) return;
                this.avatars = urls;
                this._readDom();
                this.render();
            }
        } catch (error) {
            if (this.destroyed) return;
            console.error(error);
            this.visits = { failed: true };
            this._readDom();
            this.render();
        }
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
        return error instanceof DiveStoreError && error.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. If it hasn\'t been used for a week, resume the project in the Supabase dashboard.')
            : tb('genericError', 'Something went wrong. Please try again.');
    }

    _back(href, text) {
        return `<p class="lb-back"><a href="${href}">${escHtml(text)}</a></p>`;
    }

    render() {
        if (this.destroyed) return;
        if (this.loadFailed) {
            this.container.innerHTML = `<section class="rda-card lb-message"><p role="alert">${escHtml(this.error)}</p>
                ${this._back(routeHref({ name: 'list' }), ts('backToLogbook', '← Back to the logbook'))}</section>`;
            return;
        }
        if (!this.sites) {
            this.container.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
            return;
        }
        if (this.siteId) this._renderEdit();
        else this._renderList();
    }

    // ---- List ----

    _renderList() {
        const dupes = duplicateNameCounts(this.sites);
        const cards = sortSites(this.sites).map(site => {
            const n = this.usage.get(site.id) ?? 0;
            const dup = dupes.get(siteNameKey(site.name));
            const map = hasPosition(site) ? mapyStaticMapUrl({
                lat: site.lat, lon: site.lon, apiKey: MAPY_API_KEY, width: 120, height: 90, zoom: 11,
                scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
            }) : '';
            return `<a class="rda-card lb-card lb-site-card" href="${routeHref({ name: 'site', id: site.id })}">
                ${map ? `<img class="lb-site-map" src="${escHtml(map)}" width="120" height="90" alt="" loading="lazy">` : ''}
                <div class="lb-card-body">
                    <div class="lb-card-head"><strong>${escHtml(site.name)}</strong>
                        <span class="lb-date">${escHtml(diveCountText(n))}</span></div>
                    ${hasPosition(site) ? '' : `<div class="lb-muted">${escHtml(ts('noPosition', 'No position'))}</div>`}
                    ${dup ? `<span class="lb-badge">${escHtml(fill(ts('sameName', '{0} sites named {1}'), dup, site.name.trim()))}</span>` : ''}
                </div></a>`;
        });
        this.container.innerHTML = `${this._back(routeHref({ name: 'list' }), ts('backToLogbook', '← Back to the logbook'))}
            <h2 class="lb-sites-title">${escHtml(ts('title', 'Sites'))}</h2>
            ${cards.length ? `<div class="lb-cards">${cards.join('')}</div>`
                : `<p class="rda-account-msg">${escHtml(ts('empty', 'No sites yet. Sites are created when you pick a place for a dive.'))}</p>`}`;
        for (const img of this.container.querySelectorAll('.lb-site-map')) img.addEventListener('error', () => img.remove()); // key not valid here, offline
    }

    // ---- Edit ----

    _readDom() {
        const form = this.container.querySelector('.lb-site-form');
        if (form && this.values) {
            this.values = {
                name: form.elements.name.value, water: form.elements.water.value,
                altitude: form.elements.altitude.value, notes: form.elements.notes.value,
                url: form.elements.url ? form.elements.url.value : this.values.url,
            };
        }
        const select = this.container.querySelector('#lb-merge-into');
        if (select) this.mergeTarget = select.value;
    }

    _others() {
        return sortSites(this.sites.filter(s => s.id !== this.siteId));
    }

    _renderEdit() {
        const v = this.values;
        const dives = this.usage.get(this.siteId) ?? 0;
        const others = this._others();
        const disabled = this.busy ? ' disabled' : '';
        const position = hasPosition(this.site)
            ? `${fmtNum(this.site.lat, 5)}, ${fmtNum(this.site.lon, 5)}`
            : ts('noPosition', 'No position');
        const target = others.find(s => s.id === this.mergeTarget);
        let confirmHtml = '';
        if (this.confirm === 'merge' && target) {
            confirmHtml = `<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(ts('confirm', 'Confirm'))}">
                <p>${escHtml(fill(ts('mergeConfirm', 'Move {0} to {1} and delete the site {2}? This cannot be undone.'), diveCountText(dives), target.name, this.site.name))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-confirm-yes"${disabled}>${escHtml(ts('merge', 'Merge'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-confirm-no">${escHtml(ts('cancel', 'Cancel'))}</button></div></div>`;
        } else if (this.confirm === 'delete') {
            confirmHtml = `<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(ts('confirm', 'Confirm'))}">
                <p>${escHtml(fill(ts('deleteConfirm', 'Delete the site {0}? This cannot be undone.'), this.site.name))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-confirm-yes"${disabled}>${escHtml(ts('delete', 'Delete'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-confirm-no">${escHtml(ts('cancel', 'Cancel'))}</button></div></div>`;
        }
        const mergeBlock = others.length ? `<div class="lb-site-block">
                <h3>${escHtml(ts('mergeTitle', 'Merge into another site'))}</h3>
                <label class="lb-field"><span>${escHtml(ts('mergeInto', 'Merge into…'))}</span>
                    <select id="lb-merge-into"><option value="">–</option>${others.map(s =>
                        `<option value="${escHtml(s.id)}"${s.id === this.mergeTarget ? ' selected' : ''}>${escHtml(s.name)}</option>`).join('')}</select></label>
                <div class="lb-actions"><button type="button" class="btn btn-secondary" id="lb-merge"${disabled}>${escHtml(ts('merge', 'Merge'))}</button></div>
            </div>` : '';
        const deleteBlock = `<div class="lb-site-block">
                <h3>${escHtml(ts('deleteTitle', 'Delete'))}</h3>
                ${dives === 0
                    ? `<div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-delete"${disabled}>${escHtml(ts('delete', 'Delete'))}</button></div>`
                    : `<p class="lb-muted">${escHtml(ts('mergeFirst', 'Merge it into another site first.'))}</p>`}
            </div>`;
        const preview = hasPosition(this.site) && MAPY_API_KEY ? `<img class="lb-site-preview" src="${escHtml(mapyStaticMapUrl({
            lat: this.site.lat, lon: this.site.lon, apiKey: MAPY_API_KEY, width: 640, height: 240, zoom: 13,
            scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
        }))}" width="640" height="240" alt="${escHtml(this.site.name)}">` : '';
        const info = siteInfoLinkHtml(this.site.url, ts('siteInfo', 'Site info'));
        const summary = this.visits?.rows ? visitSummaryHtml(this.visits.rows) : '';
        // The user's own dives here (the visits below also count other members' dives and same-name sites).
        const sub = fill(ts('inYourLog', '{0} in your log'), diveCountText(dives));
        const urlField = this.siteLink || this.site.url ? `<label class="lb-field"><span>${escHtml(ts('url', 'Site info link'))}</span>
                        <input type="url" name="url" inputmode="url" value="${escHtml(v.url)}" placeholder="https://" autocomplete="off" spellcheck="false">
                        <small class="lb-hint">${escHtml(ts('urlHint', 'A page about the site, e.g. in a dive-site directory.'))}</small></label>` : '';
        this.container.innerHTML = `${this._back(routeHref({ name: 'sites' }), ts('backToSites', '← Back to the sites'))}
            <section class="rda-card lb-sv-head">
                <div class="lb-sv-titlebar">
                    <h2 class="lb-sv-name-h">${escHtml(this.site.name)}</h2>
                    ${info}
                </div>
                <p class="lb-muted lb-sv-own">${escHtml(sub)}</p>
                ${preview}
                ${summary}
            </section>
            ${this._visitsHtml()}
            <section class="rda-card lb-form">
                <h2>${escHtml(ts('editTitle', 'Edit site'))}</h2>
                <form class="lb-site-form" novalidate>
                    <label class="lb-field"><span>${escHtml(ts('name', 'Site name'))}</span>
                        <input type="text" name="name" value="${escHtml(v.name)}" autocomplete="off"></label>
                    <div class="lb-row">
                        <label class="lb-field"><span>${escHtml(ts('water', 'Water'))}</span>
                            <select name="water"><option value="">–</option>
                                <option value="salt"${v.water === 'salt' ? ' selected' : ''}>${escHtml(ts('salt', 'Salt'))}</option>
                                <option value="fresh"${v.water === 'fresh' ? ' selected' : ''}>${escHtml(ts('fresh', 'Fresh'))}</option></select></label>
                        <label class="lb-field"><span>${escHtml(ts('altitude', 'Altitude (m)'))}</span>
                            <input type="text" name="altitude" inputmode="numeric" value="${escHtml(v.altitude)}" autocomplete="off"></label>
                    </div>
                    <label class="lb-field"><span>${escHtml(ts('notes', 'Notes'))}</span>
                        <textarea name="notes" rows="3">${escHtml(v.notes)}</textarea></label>
                    ${urlField}
                    <div class="lb-site-position"><span class="${hasPosition(this.site) ? '' : 'lb-muted'}">${escHtml(position)}</span>
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
        const q = sel => this.container.querySelector(sel);
        this.container.querySelector('.lb-site-preview')?.addEventListener('error', e => e.target.remove());
        q('.lb-site-form').addEventListener('submit', e => { e.preventDefault(); this._save(); });
        q('#lb-sv-all')?.addEventListener('click', () => { this._readDom(); this.showAllVisits = true; this.render(); });
        q('#lb-move-pin').addEventListener('click', () => this._movePin());
        q('#lb-merge')?.addEventListener('click', () => this._askMerge());
        q('#lb-delete')?.addEventListener('click', () => { this._readDom(); this.confirm = 'delete'; this.error = ''; this.render(); });
        q('#lb-confirm-no')?.addEventListener('click', () => { this._readDom(); this.confirm = null; this.render(); });
        q('#lb-confirm-yes')?.addEventListener('click', () => (this.confirm === 'merge' ? this._merge() : this._delete()));
        if (this.confirm) q('#lb-confirm-yes')?.focus();
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
        const ok = await this._run(() => this.store.saveSite(row, this.siteId));
        if (ok && !this.destroyed) this.onDone();
    }

    async _movePin() {
        this._readDom();
        this._pickAbort = new AbortController();
        const picked = await openSitePicker({
            store: this.store, sites: this.sites, initial: this.site, editSite: this.site, signal: this._pickAbort.signal,
        });
        this._pickAbort = null;
        if (!picked || this.destroyed) return;
        this.site = picked;
        this.sites = this.sites.map(s => (s.id === picked.id ? picked : s));
        // The picker also saved name, water and altitude; unsaved notes stay as typed.
        this.values = { ...valuesFromSite(picked), notes: this.values.notes, url: this.values.url };
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
