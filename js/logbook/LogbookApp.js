/**
 * Dive logbook shell.
 *
 * Logged out (or without a store) the page is the plain dive analysis. Once the
 * user is logged in it shows the logbook: a list of entries, routed by location.hash.
 */

import { RecordedDiveAnalysis, translateStatic } from '../components/RecordedDiveAnalysis.js';
import { DiveStoreError } from '../backend/supabaseStore.js';
import { uploadDivelog, exportZip } from './transfer.js';
import { parseRoute, routeHref } from './router.js';
import { needsDetails, formatDiveDate, formatDuration } from './entryModel.js';
import { EntryForm, TAGS } from './EntryForm.js';
import { NewDive } from './NewDive.js';
import { EntryDetail } from './EntryDetail.js';
import { SitesPage, diveCountText } from './SitesPage.js';
import { groupByMonth, sortEntries, entryFacts, firstLine, sparklinePath, formatWeekdayDate } from './listViews.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const tl = (key, fallback) => translate(`diveLog.logbook.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

/** Text for the entry card: depth, duration, buddies. Pure. */
export function cardFacts(entry) {
    const facts = [];
    if (entry.max_depth_m != null) facts.push(`${fmtNum(entry.max_depth_m, 1)} m`);
    if (entry.duration_s != null) facts.push(`${fmtNum(entry.duration_s / 60, 0)} min`);
    return facts;
}

const VIEW_KEY = 'decojs.logbook.view';
const VIEWS = ['tiles', 'list', 'table'];
const SPARK_W = 120;
const SPARK_H = 48;
const SPARK_CONCURRENCY = 3;
const TABLE_COLUMNS = [
    ['number', false], ['date', false], ['site', false], ['maxDepth', true], ['duration', true],
    ['avgDepth', true], ['temp', true], ['buddies', false],
];

function loadView() {
    try {
        const v = localStorage.getItem(VIEW_KEY);
        return VIEWS.includes(v) ? v : 'tiles';
    } catch { return 'tiles'; }
}

export class LogbookApp {
    /**
     * @param {HTMLElement} root
     * @param {{store?: Object|null, demoFiles?: string[]}} [config]
     */
    constructor(root, { store = null, demoFiles = [] } = {}) {
        this.root = root;
        this.store = store;
        this.demoFiles = demoFiles;
        this.user = null;
        this.analysis = null; // the mounted RecordedDiveAnalysis (plain or embedded)
        this.entries = null;
        this.sites = new Map();
        this.thumbs = new Map(); // entry id -> signed URL
        this.msg = [];
        this.working = false;
        this.ensured = null;
        this.destroyed = false;
        this._viewToken = 0;
        this.form = null; // the mounted EntryForm or NewDive step
        this.viewMode = loadView(); // tiles | list | table
        this.sort = { key: 'number', dir: 'desc' };
        this.sparks = new Map(); // recording id -> SVG path ('' when none or failed)
        this._sparkQueue = [];
        this._sparkActive = 0;
        this._onHash = () => this._renderRoute();
        this._onLanguage = () => this._onLanguageChange();
        if (!store) {
            this._mountAnalysis();
            return;
        }
        this._unsubscribe = store.onAuthChange(user => this._setUser(user));
        // The stored session is read locally, so a logged-in visitor never sees the login form first.
        store.currentUser().then(user => this._setUser(user), () => this._setUser(null));
    }

    destroy() {
        this.destroyed = true;
        this._unsubscribe?.();
        this._leaveLogbook();
        this._unmountAnalysis();
        this.root.innerHTML = '';
    }

    // ---- Switching between the plain page and the logbook ----

    _setUser(user) {
        if (this.destroyed) return;
        const same = this._known && (user?.id ?? null) === (this.user?.id ?? null);
        this._known = true;
        if (same) return;
        this.user = user;
        if (user) {
            this._unmountAnalysis();
            this._enterLogbook();
        } else {
            this._leaveLogbook();
            this._mountAnalysis();
        }
    }

    _mountAnalysis() {
        this.root.innerHTML = '';
        this.analysis = new RecordedDiveAnalysis(this.root, { demoFiles: this.demoFiles, store: this.store });
    }

    _unmountAnalysis() {
        this.analysis?.destroy();
        this.analysis = null;
    }

    _enterLogbook() {
        this.entries = null;
        this.msg = [];
        this.root.innerHTML = '';
        this.view = document.createElement('div');
        this.view.className = 'lb-root';
        this.root.appendChild(this.view);
        window.addEventListener('hashchange', this._onHash);
        document.addEventListener('languagechange', this._onLanguage);
        this.ensured = this.store.ensureEntries().then(() => this.store.fillComputerFields?.()).catch(error => this._storeError(error, { background: true }));
        this._renderRoute();
    }

    _leaveLogbook() {
        window.removeEventListener('hashchange', this._onHash);
        document.removeEventListener('languagechange', this._onLanguage);
        this._viewToken++;
        this._stopSparks();
        this._unmountForm();
        this._unmountAnalysis();
        this.entries = null;
    }

    _unmountForm() {
        this.form?.destroy();
        this.form = null;
    }

    _onLanguageChange() {
        const name = parseRoute(location.hash).name;
        if (this.user && this.form && (name === 'new' || name === 'edit' || name === 'detail' || name === 'sites' || name === 'site')) this.form.relabel(); // keep what was typed
        else if (this.user && name !== 'analysis') this._renderRoute();
        else translateStatic(this.view);
    }

    // ---- Routing ----

    _renderRoute() {
        if (this.destroyed || !this.user) return;
        this._unmountAnalysis();
        this._unmountForm();
        const token = ++this._viewToken;
        const route = parseRoute(location.hash);
        switch (route.name) {
            case 'list': this._showList(token); break;
            case 'analysis': this._showAnalysis(route.id, token); break;
            case 'detail': this._showDetail(route, token); break;
            case 'edit': this._showEdit(route.id, token); break;
            case 'new': this._showNew(); break;
            case 'sites': this._showSites(null); break;
            case 'site': this._showSites(route.id); break;
            default: this._showNotFound();
        }
    }

    _showNotFound() {
        this.view.innerHTML = `<section class="rda-card lb-message">
            <h2>${escHtml(tl('notFound', 'Dive not found'))}</h2>
            <p><a href="${routeHref({ name: 'list' })}">${escHtml(tl('toList', 'Back to the list'))}</a></p></section>`;
    }

    async _showDetail(route, token) {
        this.view.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        let entry;
        try {
            entry = await this._findEntry(route.id);
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
            return;
        }
        if (token !== this._viewToken) return;
        if (!entry) this._showNotFound();
        else {
            this.view.innerHTML = '<div class="lb-form-host"></div>';
            this.form = new EntryDetail(this.view.firstChild, {
                store: this.store, entry,
                onDeleted: () => { this.entries = null; location.hash = routeHref({ name: 'list' }); },
            });
        }
    }

    async _findEntry(id) {
        return this.entries?.find(e => e.id === id) ?? await this.store.getEntry(id);
    }

    // ---- Sites ----

    _showSites(siteId) {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new SitesPage(this.view.firstChild, {
            store: this.store, siteId,
            onDone: () => { this.entries = null; location.hash = routeHref({ name: 'sites' }); },
            onMissing: () => { location.hash = routeHref({ name: 'sites' }); },
        });
    }

    // ---- New and edit ----

    _showNew() {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        const host = this.view.firstChild;
        const token = this._viewToken;
        this.form = new NewDive(host, {
            store: this.store, ready: this.ensured,
            onChoose: ({ prefill, recordingId }) => {
                if (token !== this._viewToken) return;
                this._unmountForm();
                this.form = new EntryForm(host, {
                    store: this.store, prefill, recordingId,
                    onSaved: entry => { this.entries = null; location.hash = routeHref({ name: 'detail', id: entry.id }); },
                    onCancel: () => { location.hash = routeHref({ name: 'list' }); },
                });
            },
        });
    }

    async _showEdit(id, token) {
        this.view.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        let entry;
        try {
            entry = await this._findEntry(id);
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
            return;
        }
        if (token !== this._viewToken) return;
        if (!entry) {
            this._showNotFound();
            return;
        }
        const back = () => { this.entries = null; location.hash = routeHref({ name: 'detail', id }); };
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new EntryForm(this.view.firstChild, { store: this.store, entry, onSaved: back, onCancel: back });
    }

    async _showAnalysis(id, token) {
        this.view.innerHTML = `<p class="lb-back"><a href="${routeHref({ name: 'detail', id })}">${escHtml(tl('back', '← Back'))}</a></p>
            <div class="rda-root lb-analysis"></div>`;
        let entry = this.entries?.find(e => e.id === id);
        try {
            if (!entry) entry = await this.store.getEntry(id);
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
            return;
        }
        if (token !== this._viewToken) return;
        if (!entry || !entry.recording_id) {
            this._showNotFound();
            return;
        }
        this.analysis = new RecordedDiveAnalysis(this.view.querySelector('.lb-analysis'), {
            store: this.store, embedded: true, focusRecordingId: entry.recording_id,
        });
    }

    // ---- List ----

    async _showList(token) {
        this._renderList();
        try {
            await this.ensured;
            const [entries, sites, photos] = await Promise.all([
                this.store.listEntries(), this.store.listSites(), this.store.listPhotoMedia().catch(error => { console.error(error); return []; }),
            ]);
            if (token !== this._viewToken) return;
            this.entries = entries;
            this.sites = new Map(sites.map(s => [s.id, s]));
            const first = new Map();
            for (const m of photos) if (m.path && !first.has(m.entry_id)) first.set(m.entry_id, m.path);
            this._renderList();
            const urls = await this.store.photoUrls([...first.values()]).catch(error => { console.error(error); return new Map(); });
            if (token !== this._viewToken) return;
            this.thumbs = new Map([...first].filter(([, path]) => urls.has(path)).map(([id, path]) => [id, urls.get(path)]));
            this._renderList();
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
        }
    }

    _renderBar() {
        const busy = this.working;
        return `<section class="rda-account rda-card lb-bar">
            <span class="rda-account-who">${escHtml(fill(tb('loggedInAs', 'Logged in as {0}'), this.user.email))}</span>
            <label class="btn btn-small btn-secondary rda-upload"><span>${escHtml(tb('upload', 'Upload DIVELOG'))}</span>
                <input type="file" id="lb-upload" webkitdirectory class="rda-visually-hidden"${busy ? ' disabled' : ''}></label>
            <button type="button" class="btn btn-small btn-secondary" id="lb-export"${busy ? ' disabled' : ''}>${escHtml(tb('export', 'Export'))}</button>
            <a class="btn btn-small btn-secondary" id="lb-sites" href="${routeHref({ name: 'sites' })}">${escHtml(tl('sites.title', 'Sites'))}</a>
            <button type="button" class="btn btn-small btn-secondary" id="lb-logout">${escHtml(tb('logout', 'Log out'))}</button>
            <a class="btn btn-small lb-new" href="${routeHref({ name: 'new' })}">${escHtml(tl('newDive', '+ New dive'))}</a>
            ${this.msg.length ? `<p class="rda-account-msg">${this.msg.map(m => `<span>${escHtml(m)}</span>`).join('<br>')}</p>` : ''}
        </section>`;
    }

    _card(entry) {
        const site = entry.site_id ? this.sites.get(entry.site_id)?.name : null;
        const facts = cardFacts(entry);
        const buddies = (entry.buddies ?? []).join(', ');
        const thumb = this.thumbs.get(entry.id);
        return `<a class="rda-card lb-card" href="${routeHref({ name: 'detail', id: entry.id })}">
            ${thumb ? `<img class="lb-thumb" src="${escHtml(thumb)}" alt="" loading="lazy">` : ''}
            <div class="lb-card-body">
                <div class="lb-card-head"><strong>${escHtml(fill(tl('number', '#{0}'), entry.log_number ?? '–'))}</strong>
                    <span class="lb-date">${escHtml(formatDiveDate(entry.dive_date, currentLang()))}</span></div>
                <div class="lb-site${site ? '' : ' lb-muted'}">${escHtml(site || tl('siteNotSet', 'Site not set'))}</div>
                ${facts.length ? `<div class="lb-facts">${escHtml(facts.join(' · '))}</div>` : ''}
                ${buddies ? `<div class="lb-buddies lb-muted">${escHtml(buddies)}</div>` : ''}
                ${needsDetails(entry) ? `<span class="lb-badge">${escHtml(tl('addDetails', 'Add details'))}</span>` : ''}
            </div></a>`;
    }

    // ---- List view ----

    _tagText(tag) {
        return TAGS.includes(tag) ? tl(`form.choices.tags.${tag}`, tag) : String(tag);
    }

    _timeText(entry) {
        return entry.entry_time ? String(entry.entry_time).slice(0, 5) : '';
    }

    _row(entry) {
        const site = entry.site_id ? this.sites.get(entry.site_id)?.name : null;
        const facts = entryFacts(entry, fmtNum);
        const buddies = (entry.buddies ?? []).join(', ');
        const tags = (Array.isArray(entry.details?.tags) ? entry.details.tags : []).map(t => this._tagText(t)).join(', ');
        const people = [buddies ? fill(tl('views.with', 'with {0}'), buddies) : '', tags].filter(Boolean).join(' · ');
        const notes = firstLine(entry.notes);
        const thumb = this.thumbs.get(entry.id);
        const media = thumb ? `<img class="lb-thumb lb-row-media" src="${escHtml(thumb)}" alt="" loading="lazy">`
            : entry.recording_id ? `<span class="lb-row-media lb-spark" data-rec="${escHtml(entry.recording_id)}" aria-hidden="true"></span>`
                : '<span class="lb-row-media" aria-hidden="true"></span>';
        const head = [formatWeekdayDate(entry.dive_date, currentLang()), this._timeText(entry)].filter(Boolean).join(' · ');
        return `<a class="rda-card lb-card lb-row" href="${routeHref({ name: 'detail', id: entry.id })}">${media}
            <div class="lb-card-body">
                <div class="lb-row-head"><strong>${escHtml(fill(tl('number', '#{0}'), entry.log_number ?? '–'))}</strong>
                    <span class="lb-date">${escHtml(head)}</span>
                    <span class="lb-row-site${site ? '' : ' lb-muted'}">${escHtml(site || tl('siteNotSet', 'Site not set'))}</span></div>
                ${facts.length ? `<div class="lb-facts">${escHtml(facts.join(' · '))}</div>` : ''}
                ${people ? `<div class="lb-muted">${escHtml(people)}</div>` : ''}
                ${notes ? `<div class="lb-muted lb-notes">${escHtml(notes)}</div>` : ''}
                ${needsDetails(entry) ? `<span class="lb-badge">${escHtml(tl('addDetails', 'Add details'))}</span>` : ''}
            </div></a>`;
    }

    _renderRows() {
        const tag = localeTag(currentLang());
        return groupByMonth(this.entries, tag).map(g => `<section class="lb-month">
            <h3 class="lb-month-head">${escHtml(g.label ? fill(tl('views.monthHeader', '{0} · {1}'), g.label, diveCountText(g.entries.length)) : diveCountText(g.entries.length))}</h3>
            <div class="lb-rows">${g.entries.map(e => this._row(e)).join('')}</div></section>`).join('');
    }

    _renderTable() {
        const sorted = sortEntries(this.entries, this.sort.key, this.sort.dir, this.sites);
        const head = TABLE_COLUMNS.map(([key, numeric]) => {
            const active = this.sort.key === key;
            const label = tl(`views.columns.${key}`, key);
            const aria = active ? (this.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
            return `<th scope="col" aria-sort="${aria}"${numeric ? ' class="lb-num"' : ''}>
                <button type="button" class="lb-sort" data-sort="${key}" title="${escHtml(fill(tl('views.sortBy', 'Sort by {0}'), label))}">${escHtml(label)}<span class="lb-sort-mark" aria-hidden="true">${active ? (this.sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button></th>`;
        }).join('');
        const lang = currentLang();
        const dash = '–';
        const rows = sorted.map(e => {
            const href = routeHref({ name: 'detail', id: e.id });
            const site = e.site_id ? this.sites.get(e.site_id)?.name : null;
            const nb = '\u00A0';
            const m = v => (Number.isFinite(Number(v)) && v !== null ? `${fmtNum(Number(v), 1)}${nb}m` : dash);
            const temp = Number.isFinite(Number(e.water_temp_c)) && e.water_temp_c !== null ? `${fmtNum(Number(e.water_temp_c), 1)}${nb}°C` : dash;
            const dur = e.duration_s != null ? formatDuration(e.duration_s) || dash : dash;
            return `<tr data-href="${href}">
                <td class="lb-num"><a href="${href}">${escHtml(String(e.log_number ?? dash))}</a></td>
                <td><a href="${href}">${escHtml(formatDiveDate(e.dive_date, lang) || dash)}</a></td>
                <td${site ? '' : ' class="lb-muted"'}>${escHtml(site || tl('siteNotSet', 'Site not set'))}</td>
                <td class="lb-num">${escHtml(m(e.max_depth_m))}</td>
                <td class="lb-num">${escHtml(dur)}</td>
                <td class="lb-num">${escHtml(m(e.details?.avgDepthM))}</td>
                <td class="lb-num">${escHtml(temp)}</td>
                <td>${escHtml((e.buddies ?? []).join(', ') || dash)}</td></tr>`;
        }).join('');
        return `<div class="lb-table-wrap" tabindex="0"><table class="lb-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    _renderSwitch() {
        const buttons = VIEWS.map(v => `<button type="button" class="lb-seg" data-view="${v}" aria-pressed="${v === this.viewMode}">${escHtml(tl(`views.${v}`, v))}</button>`).join('');
        return `<div class="lb-switch" role="group" aria-label="${escHtml(tl('views.label', 'Dive list view'))}">${buttons}</div>`;
    }

    _setViewMode(mode) {
        if (!VIEWS.includes(mode) || mode === this.viewMode) return;
        this.viewMode = mode;
        try { localStorage.setItem(VIEW_KEY, mode); } catch { /* remembered for this visit only */ }
        this._renderList();
    }

    _sortBy(key) {
        const numeric = TABLE_COLUMNS.find(c => c[0] === key)?.[1];
        this.sort = this.sort.key === key
            ? { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'number' || key === 'date' || numeric ? 'desc' : 'asc' };
        this._renderList();
    }

    // ---- Lazy depth sparklines (List view, rows without a photo) ----

    _stopSparks() {
        this._sparkObserver?.disconnect();
        this._sparkObserver = null;
        this._sparkQueue = [];
    }

    _watchSparks() {
        this._stopSparks();
        const slots = [...this.view.querySelectorAll('.lb-spark[data-rec]')];
        for (const el of slots) if (this.sparks.has(el.dataset.rec)) this._paintSpark(el);
        const pending = slots.filter(el => !this.sparks.has(el.dataset.rec));
        if (!pending.length) return;
        if (typeof IntersectionObserver === 'undefined') {
            pending.forEach(el => this._enqueueSpark(el));
            return;
        }
        this._sparkObserver = new IntersectionObserver(items => {
            for (const item of items) {
                if (!item.isIntersecting) continue;
                this._sparkObserver?.unobserve(item.target);
                this._enqueueSpark(item.target);
            }
        }, { rootMargin: '200px' });
        pending.forEach(el => this._sparkObserver.observe(el));
    }

    _enqueueSpark(el) {
        this._sparkQueue.push(el);
        this._pumpSparks();
    }

    _pumpSparks() {
        while (this._sparkActive < SPARK_CONCURRENCY && this._sparkQueue.length) {
            const el = this._sparkQueue.shift();
            if (!el.isConnected) continue;
            const id = el.dataset.rec;
            if (this.sparks.has(id)) { this._paintSpark(el); continue; }
            this._sparkActive++;
            this.store.loadDive(id)
                .then(dive => sparklinePath(dive?.samples, SPARK_W, SPARK_H), () => '')
                .catch(() => '')
                .then(path => {
                    this.sparks.set(id, path);
                    if (el.isConnected) this._paintSpark(el);
                })
                .finally(() => { this._sparkActive--; if (!this.destroyed) this._pumpSparks(); });
        }
    }

    _paintSpark(el) {
        const path = this.sparks.get(el.dataset.rec);
        if (!path || el.firstChild) return;
        el.innerHTML = `<svg viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" focusable="false"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
    }

    _renderList() {
        this._stopSparks();
        let body;
        if (!this.entries) body = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        else if (!this.entries.length) body = `<p class="rda-account-msg">${escHtml(tl('emptyList', 'No dives yet.'))}</p>`;
        else {
            const list = this.viewMode === 'list' ? this._renderRows()
                : this.viewMode === 'table' ? this._renderTable()
                    : `<div class="lb-cards">${this.entries.map(e => this._card(e)).join('')}</div>`;
            body = this._renderSwitch() + list;
        }
        this.view.innerHTML = this._renderBar() + body;
        this.view.querySelectorAll('.lb-seg').forEach(b => b.addEventListener('click', () => this._setViewMode(b.dataset.view)));
        this.view.querySelectorAll('.lb-sort').forEach(b => b.addEventListener('click', () => this._sortBy(b.dataset.sort)));
        this.view.querySelector('.lb-table tbody')?.addEventListener('click', e => {
            const row = e.target.closest('tr[data-href]');
            if (row && !e.target.closest('a')) location.hash = row.dataset.href;
        });
        if (this.viewMode === 'list' && this.entries?.length) this._watchSparks();
        this.view.querySelector('#lb-upload').addEventListener('change', e => this._upload(e.target));
        this.view.querySelector('#lb-export').addEventListener('click', () => this._export());
        this.view.querySelector('#lb-logout').addEventListener('click', () => this._logout());
    }

    // ---- Account actions ----

    /**
     * Remember and show a store failure. A failure of the current view's own load replaces the view with a
     * message; a background failure (login-time ensureEntries, upload, export, logout) never does: the list
     * re-renders with the message, any other view gets a banner and keeps what the user is working on.
     */
    _storeError(error, { background = false } = {}) {
        console.error(error);
        this.msg = [error instanceof DiveStoreError && error.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. If it hasn\'t been used for a week, resume the project in the Supabase dashboard.')
            : tb('genericError', 'Something went wrong. Please try again.')];
        if (this.destroyed || !this.user) return;
        if (parseRoute(location.hash).name === 'list') this._renderList();
        else if (background) this._showBanner(this.msg[0]);
        else this._showMessage(this.msg[0]);
    }

    /** A non-destructive notice above the current view. */
    _showBanner(text) {
        let banner = this.view.querySelector(':scope > .lb-banner');
        if (!banner) {
            banner = document.createElement('p');
            banner.className = 'lb-banner rda-account-msg';
            banner.setAttribute('role', 'alert');
            this.view.prepend(banner);
        }
        banner.textContent = text;
    }

    /** Show a plain message in the current (non-list) view. */
    _showMessage(text) {
        this._unmountForm();
        this.analysis?.destroy();
        this.analysis = null;
        this.view.innerHTML = `<section class="rda-card lb-message"><p>${escHtml(text)}</p>
            <p><a href="${routeHref({ name: 'list' })}">${escHtml(tl('toList', 'Back to the list'))}</a></p></section>`;
    }

    _setWorking(on) {
        this.working = on;
        if (this.user && parseRoute(location.hash).name === 'list') this._renderList();
    }

    async _logout() {
        try {
            await this.store.signOut();
            this._setUser(null);
        } catch (error) {
            this._storeError(error, { background: true });
        }
    }

    async _upload(input) {
        if (this.working) return;
        const files = Array.from(input.files);
        input.value = '';
        this.msg = [];
        this._setWorking(true);
        try {
            const { report, ensureError } = await uploadDivelog(this.store, files, (done, total) => {
                this.msg = [fill(tb('progress', 'Saving {0} / {1}…'), done, total)];
                if (parseRoute(location.hash).name === 'list') this._renderList();
            });
            this.msg = this._reportLines(report);
            if (ensureError) {
                this._storeError(ensureError, { background: true });
                this.msg = [...this._reportLines(report), ...this.msg];
            }
            this.working = false;
            if (parseRoute(location.hash).name === 'list') this._showList(++this._viewToken);
        } catch (error) {
            this._storeError(error, { background: true });
        } finally {
            this._setWorking(false);
        }
    }

    _reportLines(r) {
        if (!r) return [];
        const lines = [];
        if (r.saved) lines.push(fill(tb('reportSaved', '{0} new dives saved'), r.saved));
        if (r.updated) lines.push(fill(tb('reportUpdated', '{0} updated'), r.updated));
        if (r.unchanged) lines.push(fill(tb('reportUnchanged', '{0} already stored'), r.unchanged));
        if (r.failed.length) {
            lines.push(fill(tb('reportFailed', '{0} could not be saved: {1}'), r.failed.length,
                r.failed.map(f => `${f.fileName} (${f.message})`).join('; ')));
        }
        return lines;
    }

    async _export() {
        if (this.working) return;
        this._setWorking(true);
        try {
            await exportZip(this.store);
        } catch (error) {
            this._storeError(error, { background: true });
        } finally {
            this._setWorking(false);
        }
    }
}
