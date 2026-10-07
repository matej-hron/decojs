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
import { needsDetails, formatDiveDate } from './entryModel.js';
import { EntryForm } from './EntryForm.js';
import { NewDive } from './NewDive.js';
import { EntryDetail } from './EntryDetail.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang } from '../format.js';
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
        if (this.user && this.form && (name === 'new' || name === 'edit' || name === 'detail')) this.form.relabel(); // keep what was typed
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

    _renderList() {
        let body;
        if (!this.entries) body = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        else if (!this.entries.length) body = `<p class="rda-account-msg">${escHtml(tl('emptyList', 'No dives yet.'))}</p>`;
        else body = `<div class="lb-cards">${this.entries.map(e => this._card(e)).join('')}</div>`;
        this.view.innerHTML = this._renderBar() + body;
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
