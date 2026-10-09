/**
 * Dive logbook shell.
 *
 * Logged out (or without a store) the page is the plain dive analysis. Once the
 * user is logged in it shows the logbook: a list of entries, routed by location.hash.
 */

import { RecordedDiveAnalysis, translateStatic } from '../components/RecordedDiveAnalysis.js';
import { DiveStoreError } from '../backend/supabaseStore.js';
import { uploadDivelog, exportZip } from './transfer.js';
import { DeleteDataPanel } from './DeleteData.js';
import { parseRoute, routeHref } from './router.js';
import { AppShell, shellTabs, activeTab, resolveRoute, isCommunityRoute } from './AppShell.js';
import { needsDetails, formatDiveDate, formatDuration } from './entryModel.js';
import { EntryForm, TAGS } from './EntryForm.js';
import { NewDive } from './NewDive.js';
import { EntryDetail } from './EntryDetail.js';
import { gasesFromEntry } from './gasModel.js';
import { SitesPage, diveCountText } from './SitesPage.js';
import { groupByMonth, sortEntries, formatWeekdayDate } from './listViews.js';
import { FEED_VIEWS, migrateView, diveTitle, feedStats, chooseVisual, logbookTotals, formatTotalTime, photoIndex, photoFrame } from './feed.js';
import { mapyStaticMapUrl } from './geo.js';
import { feedCardHtml, statsHtml, visualHtml, lockHtml } from './feedCard.js';
import { MembersPage } from './MembersPage.js';
import { MemberPage } from './MemberPage.js';
import { ProfilePage } from './ProfilePage.js';
import { SparkLoader } from './sparks.js';
import { CommunityFeed } from './CommunityFeed.js';
import { memberEntryStore } from './memberEntryStore.js';
import { displayName } from './community.js';
import { avatarHtml } from './avatars.js';
import { MAPY_API_KEY } from '../backend/config.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

/** Probes per login while the answer is 'unknown': at login, once after PROBE_RETRY_MS, once on a later route change. */
const PROBE_ATTEMPTS = 3;
const PROBE_RETRY_MS = 5000;
/** A probe that has not answered by then counts as 'unknown'. */
const PROBE_TIMEOUT_MS = 8000;
/** How long the entry form waits for a probe in flight before it opens without the visibility fields. */
const FORM_PROBE_WAIT_MS = 3000;

const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const tl = (key, fallback) => translate(`diveLog.logbook.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

const NB = '\u00A0';
const TITLE_FALLBACK = { 'feed.untitled': 'Dive #{0}', 'feed.untitledNoNumber': 'Dive' };
const tt = key => tl(key, TITLE_FALLBACK[key] ?? key);
const STAT_FALLBACK = { depth: 'Max depth', duration: 'Time', avgDepth: 'Avg depth', temp: 'Water', gas: 'Gas' };

const VIEW_KEY = 'decojs.logbook.view';
const TABLE_COLUMNS = [
    ['number', false], ['date', false], ['site', false], ['maxDepth', true], ['duration', true],
    ['avgDepth', true], ['temp', true], ['buddies', false],
];
/** Small line icons of the view switch (24×24, stroke = currentColor). */
const VIEW_ICONS = {
    feed: '<rect x="4" y="3" width="16" height="8" rx="1.5"/><path d="M4 15h16M4 19h10"/>',
    tiles: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15"/>',
};

function loadView() {
    try {
        return migrateView(localStorage.getItem(VIEW_KEY));
    } catch { return FEED_VIEWS[0]; }
}

export class LogbookApp {
    /**
     * @param {HTMLElement} root
     * @param {{store?: Object|null, shell?: AppShell|null}} [config]
     *   `shell` defaults to the page's `.tr-tabs` / `.tr-bottom` navigation (none when the page has neither)
     */
    constructor(root, { store = null, shell, probeTimeoutMs = PROBE_TIMEOUT_MS } = {}) {
        this.root = root;
        this.store = store;
        this.shell = shell === undefined ? AppShell.fromDocument(globalThis.document) : shell;
        this.user = null;
        this.community = false; // whether the community backend (migration 0004) is available
        this._communityKnown = false; // false while the probe has not answered 'yes' or 'no'
        this._probe = null; // the probe in flight
        this._probeAttempts = 0;
        this._probeTimer = null;
        this._probeTimeoutMs = probeTimeoutMs;
        this._session = 0;
        this.analysis = null; // the mounted RecordedDiveAnalysis (plain or embedded)
        this.entries = null;
        this.sites = new Map();
        this.thumbs = new Map(); // entry id -> signed URL
        this.photos = new Map(); // entry id -> { path of the first photo, photo count }
        this.msg = [];
        this.working = false;
        this.ensured = null;
        this.destroyed = false;
        this._viewToken = 0;
        this.form = null; // the mounted EntryForm or NewDive step
        this.viewMode = loadView(); // tiles | list | table
        this.sort = { key: 'number', dir: 'desc' };
        this.selecting = false; // select mode of the list
        this.selected = new Set(); // entry ids; survives view switches and sorting
        this.bulk = null; // null | { phase: 'confirm'|'running'|'done', withRecordings, done, total, numbers, result }
        this.sparks = new SparkLoader(id => this.store.loadDive(id)); // lazy depth profiles of the list
        this._hash = null; // the route hash shown, and the one before it (back link of a member's dive)
        this._prevHash = null;
        this._memberBack = null; // { id, href }: where a member's dive goes back to, kept while visiting its analysis
        this._onHash = () => { this._probeCommunity(); this._renderRoute(); }; // a route change retries an 'unknown' probe
        this._onLanguage = () => this._onLanguageChange();
        this._onDocClick = e => { if (!e.target.closest?.('.lb-menu')) this._closeMenu(); };
        this._onDocKey = e => {
            if (e.key !== 'Escape') return;
            const menu = this.view?.querySelector('.lb-menu[open]');
            if (menu?.contains(document.activeElement)) menu.querySelector('summary')?.focus(); // focus must not fall to <body>
            this._closeMenu();
        };
        this._onVisualFail = e => this._onVisualError(e);
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
        this.sparks.destroy();
        this.wipe?.close();
        this._unsubscribe?.();
        this._leaveLogbook();
        this._unmountAnalysis();
        this.shell?.destroy();
        this.root.innerHTML = '';
    }

    // ---- Route and shell ----

    /** The route shown: `home` resolved, community routes → My dives without the feature. */
    _route() {
        return resolveRoute(parseRoute(location.hash), this.community);
    }

    _renderShell() {
        if (!this.shell) return;
        if (!this.user) this.shell.render({ tabs: [] });
        else this.shell.render({ tabs: shellTabs(this.community), active: activeTab(this._route().name, this.community) });
    }

    /**
     * Ask the store whether the community backend exists. Never blocks a view: until the answer the app
     * behaves as without the feature. 'unknown' (a transient failure) is retried once after a few seconds
     * and once on a later route change.
     */
    _probeCommunity() {
        if (this._communityKnown || this._probe || this._probeAttempts >= PROBE_ATTEMPTS) return;
        const store = this.store;
        const ask = typeof store.communityAvailability === 'function' ? () => store.communityAvailability()
            : typeof store.communityStatus === 'function' ? async () => ((await store.communityStatus()) === true ? 'yes' : 'no')
                : null;
        if (!ask) {
            this._communityKnown = true;
            return;
        }
        this._probeAttempts++;
        const session = this._session;
        let giveUp;
        const timeout = new Promise(resolve => { giveUp = setTimeout(() => resolve('unknown'), this._probeTimeoutMs); });
        const probe = Promise.race([
            Promise.resolve().then(ask).catch(error => { console.error(error); return 'unknown'; }),
            timeout,
        ])
            .then(result => {
                clearTimeout(giveUp);
                if (this.destroyed || session !== this._session || this._probe !== probe) return;
                this._probe = null;
                if (result === 'yes' || result === 'no') {
                    this._communityKnown = true;
                    this.community = result === 'yes';
                    if (this.community) Promise.resolve().then(() => store.ensureProfile?.()).catch(error => console.error(error));
                } else if (this._probeAttempts === 1) {
                    this._probeTimer = setTimeout(() => { this._probeTimer = null; this._probeCommunity(); }, PROBE_RETRY_MS);
                }
                this._afterProbe();
            });
        this._probe = probe;
    }

    /** The probe answered: the tabs may change, and so may home and community routes. */
    _afterProbe() {
        if (!this.user) return;
        const name = parseRoute(location.hash).name;
        if (isCommunityRoute(name) || (name === 'home' && this.community)) this._renderRoute();
        else this._renderShell();
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
        // With a backend, logged-out visitors see only the login form: no example dives, no pickers.
        this.root.classList.toggle('rda-login-only', !!this.store);
        this.analysis = new RecordedDiveAnalysis(this.root, { store: this.store });
    }

    _unmountAnalysis() {
        this.root.classList.remove('rda-login-only');
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
        document.addEventListener('click', this._onDocClick);
        document.addEventListener('keydown', this._onDocKey);
        this.view.addEventListener('error', this._onVisualFail, true); // image errors do not bubble
        document.body.classList.add('lb-in', 'tr-logged-in');
        this._resetProbe(); // another user may have signed in directly: forget the previous one's answer
        this.ensured = this.store.ensureEntries().then(() => this.store.fillComputerFields?.()).catch(error => this._storeError(error, { background: true }));
        this._probeCommunity();
        this._renderRoute();
    }

    /** Forget the community probe and its answer (new login, other user, logout); a probe in flight is ignored. */
    _resetProbe() {
        this._session++;
        clearTimeout(this._probeTimer);
        this._probeTimer = null;
        this._probe = null;
        this._probeAttempts = 0;
        this._communityKnown = false;
        this.community = false;
    }

    _leaveLogbook() {
        window.removeEventListener('hashchange', this._onHash);
        document.removeEventListener('languagechange', this._onLanguage);
        document.removeEventListener('click', this._onDocClick);
        document.removeEventListener('keydown', this._onDocKey);
        document.body.classList.remove('lb-in', 'tr-logged-in');
        this._resetProbe();
        this.shell?.render({ tabs: [] });
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
        this._renderShell();
        const name = this._route().name;
        if (this.user && this.form && (name === 'new' || name === 'edit' || name === 'detail' || name === 'sites' || name === 'site' || name === 'feed' || name === 'community' || name === 'member' || name === 'memberDive' || name === 'profile')) this.form.relabel(); // keep what was typed / loaded
        else if (this.user && name !== 'analysis' && name !== 'memberAnalysis') this._renderRoute();
        else {
            translateStatic(this.view);
            this._renderAnalysisAuthor(); // the "Diver" fallback name follows the language
        }
    }

    // ---- Routing ----

    _renderRoute() {
        if (this.destroyed || !this.user) return;
        this._unmountAnalysis();
        this._unmountForm();
        const token = ++this._viewToken;
        if (location.hash !== this._hash) {
            this._prevHash = this._hash;
            this._hash = location.hash;
        }
        this._renderShell();
        if (this._probe && !this._communityKnown && isCommunityRoute(parseRoute(location.hash).name)) {
            // A community route asked for explicitly: wait for the probe instead of flashing My dives.
            this.view.classList.remove('lb-list-view', 'lb-selecting');
            this.view.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
            return;
        }
        const route = this._route();
        this.view.classList.toggle('lb-list-view', route.name === 'list'); // list layout: sidebar on wide screens
        if (route.name !== 'list') this.view.classList.remove('lb-selecting');
        switch (route.name) {
            case 'list': this._showList(token); break;
            case 'analysis': this._showAnalysis(route.id, token); break;
            case 'detail': this._showDetail(route, token); break;
            case 'edit': this._showEdit(route.id, token); break;
            case 'new': this._showNew(); break;
            case 'sites': this._showSites(null); break;
            case 'site': this._showSites(route.id); break;
            case 'feed': this._showFeed(); break;
            case 'community': this._showCommunity(); break;
            case 'member': this._showMember(route.id); break;
            case 'memberDive': this._showMemberDive(route.id, token); break;
            case 'memberAnalysis': this._showMemberAnalysis(route.id, token); break;
            case 'profile': this._showProfile(); break;
            default: this._showNotFound();
        }
    }

    _showNotFound({ href = routeHref({ name: 'list' }), text = tl('toList', 'Back to the list') } = {}) {
        this.view.innerHTML = `<section class="rda-card lb-message">
            <h2>${escHtml(tl('notFound', 'Dive not found'))}</h2>
            <p><a href="${escHtml(href)}">${escHtml(text)}</a></p></section>`;
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

    // ---- Feed (own and other members' dives) ----

    _showFeed() {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new CommunityFeed(this.view.firstChild, {
            store: this.store, userId: this.user.id,
            onError: error => this._viewError(error),
        });
    }

    // ---- Community directory and member pages ----

    _showCommunity() {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new MembersPage(this.view.firstChild, {
            store: this.store, userId: this.user.id,
            onError: error => this._viewError(error),
        });
    }

    _showMember(memberId) {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new MemberPage(this.view.firstChild, {
            store: this.store, userId: this.user.id, memberId,
            onError: error => this._viewError(error),
        });
    }

    // ---- Own profile ----

    _showProfile() {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new ProfilePage(this.view.firstChild, {
            store: this.store, user: this.user,
            onSignOut: () => this._logout(),
            onError: error => this._viewError(error),
        });
    }

    // ---- Another member's dive (read-only) and its analysis ----

    /**
     * The community row of a dive the caller may see; null when missing (not-found shown) or when the
     * view moved on or the dive is the caller's own (then the URL is replaced by the own route).
     */
    async _memberRow(id, token, ownRoute) {
        this.view.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        let row;
        try {
            row = await this.store.getCommunityEntry(id);
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
            return null;
        }
        if (token !== this._viewToken) return null;
        if (!row) {
            this._showNotFound({ href: routeHref({ name: 'feed' }), text: translate('diveLog.trail.toFeed', 'Back to the Feed') });
            return null;
        }
        if (row.owner === this.user.id) {
            location.replace(routeHref({ name: ownRoute, id })); // the own dive has the full, editable view
            return null;
        }
        return row;
    }

    /** Back link of a member's dive: their page when it was opened from there, else the Feed. */
    _memberDiveBack(id, owner) {
        const prev = parseRoute(this._prevHash ?? '');
        if (prev.name === 'member' && prev.id === owner) this._memberBack = { id, href: routeHref(prev) };
        else if (!(prev.name === 'memberAnalysis' && prev.id === id && this._memberBack?.id === id)) this._memberBack = null;
        return this._memberBack?.href ?? routeHref({ name: 'feed' });
    }

    /**
     * The author row of a member's dive. `name` and `avatarHtml` are getters, so a re-render after a
     * language change shows the translated "Diver" fallback.
     * @returns {Promise<{name: string, href: string, avatarHtml: string}>}
     */
    async _memberAuthor(owner) {
        let member = null;
        let avatarUrl = null;
        try {
            member = await this.store.getMember(owner);
            if (member?.avatar_path && this.store.avatarUrls) {
                avatarUrl = (await this.store.avatarUrls([member.avatar_path]).catch(error => { console.error(error); return null; }))?.get(member.avatar_path) ?? null;
            }
        } catch (error) {
            console.error(error); // the author row falls back to "Diver" and a preset
        }
        return {
            get name() { return displayName(member, key => translate(`diveLog.${key}`, 'Diver')); },
            href: routeHref({ name: 'member', id: owner }),
            // The name follows in the same link: the picture is decoration there.
            get avatarHtml() {
                return `<span class="tr-author-av" aria-hidden="true">${avatarHtml({ preset: member?.avatar_preset, url: avatarUrl, name: this.name, id: owner, size: 40 })}</span>`;
            },
        };
    }

    async _showMemberDive(id, token) {
        const row = await this._memberRow(id, token, 'detail');
        if (!row) return;
        const author = await this._memberAuthor(row.owner);
        if (token !== this._viewToken) return;
        const { entry, adapter } = memberEntryStore(this.store, row);
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new EntryDetail(this.view.firstChild, {
            store: adapter, entry, readOnly: true, author, backHref: this._memberDiveBack(id, row.owner),
        });
    }

    async _showMemberAnalysis(id, token) {
        const row = await this._memberRow(id, token, 'analysis');
        if (!row) return;
        const { entry, adapter } = memberEntryStore(this.store, row);
        if (!entry.recording_id) {
            this._showNotFound({ href: routeHref({ name: 'memberDive', id }), text: tl('back', '← Back') });
            return;
        }
        const author = await this._memberAuthor(row.owner);
        if (token !== this._viewToken) return;
        this._mountRecordingAnalysis(routeHref({ name: 'memberDive', id }), adapter, entry, author);
    }

    /** A mounted view could not load: unmount it (a language change must not re-render it detached), show the error. */
    _viewError(error) {
        this._unmountForm();
        this._storeError(error);
    }

    // ---- New and edit ----

    _showNew() {
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        const host = this.view.firstChild;
        const token = this._viewToken;
        this.form = new NewDive(host, {
            store: this.store, ready: this.ensured,
            onChoose: async ({ prefill, recordingId }) => {
                const community = await this._communityForForm();
                const defaultVisibility = community && this.store.defaultVisibility
                    ? await Promise.resolve().then(() => this.store.defaultVisibility()).catch(error => { console.error(error); return null; })
                    : null;
                if (token !== this._viewToken) return;
                this._unmountForm();
                this.form = new EntryForm(host, {
                    store: this.store, prefill, recordingId, community, defaultVisibility,
                    onSaved: entry => { this.entries = null; location.hash = routeHref({ name: 'detail', id: entry.id }); },
                    onCancel: () => { location.hash = routeHref({ name: 'list' }); },
                });
            },
        });
    }

    /**
     * Whether the entry form offers "Who can see this dive": waits briefly for a probe in flight (a form opened
     * right after login must not lose the fieldset). Without an answer the form shows none and sends nothing.
     */
    async _communityForForm() {
        if (!this._communityKnown && this._probe) {
            let timer;
            await Promise.race([this._probe, new Promise(r => { timer = setTimeout(r, FORM_PROBE_WAIT_MS); })]);
            clearTimeout(timer);
        }
        return this.community;
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
        const community = await this._communityForForm();
        if (token !== this._viewToken) return;
        const back = () => { this.entries = null; location.hash = routeHref({ name: 'detail', id }); };
        this.view.innerHTML = '<div class="lb-form-host"></div>';
        this.form = new EntryForm(this.view.firstChild, { store: this.store, entry, community, onSaved: back, onCancel: back });
    }

    /** Back link, "Learn why", (a member's author row,) and the embedded analysis of one recorded dive. */
    _analysisFrame(backHref, author = null) {
        this._analysisAuthor = author;
        this.view.innerHTML = `<p class="lb-back"><a href="${escHtml(backHref)}">${escHtml(tl('back', '← Back'))}</a></p>
            <a class="tr-learn" href="../gradient-factors.html">${escHtml(translate('diveLog.trail.learnWhy', 'Learn why on DecoTheory ↗'))}</a>
            ${author ? '<div class="tr-author lb-analysis-author"></div>' : ''}
            <div class="rda-root lb-analysis"></div>`;
        this._renderAnalysisAuthor();
    }

    /** Fill (or, after a language change, refill) the author row of a member's analysis. */
    _renderAnalysisAuthor() {
        const a = this._analysisAuthor;
        const host = a ? this.view?.querySelector(':scope > .lb-analysis-author') : null;
        if (host) host.innerHTML = `<a class="tr-author-link" href="${escHtml(a.href)}">${a.avatarHtml}<span class="tr-author-name">${escHtml(a.name)}</span></a>`;
    }

    _mountRecordingAnalysis(backHref, store, entry, author = null) {
        this._analysisFrame(backHref, author);
        this.analysis = new RecordedDiveAnalysis(this.view.querySelector('.lb-analysis'), {
            store, embedded: true, focusRecordingId: entry.recording_id,
            entryGases: gasesFromEntry(entry),
        });
    }

    async _showAnalysis(id, token) {
        this.view.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
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
        this._mountRecordingAnalysis(routeHref({ name: 'detail', id }), this.store, entry);
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
            this.photos = photoIndex(photos);
            this._renderList();
            const paths = [...this.photos.values()].map(p => p.path);
            const urls = await this.store.photoUrls(paths).catch(error => { console.error(error); return new Map(); });
            if (token !== this._viewToken) return;
            this.thumbs = new Map([...this.photos].filter(([, p]) => urls.has(p.path)).map(([id, p]) => [id, urls.get(p.path)]));
            this._renderList();
        } catch (error) {
            if (token === this._viewToken) this._storeError(error);
        }
    }

    /** Title, totals, Sites, New dive and the "⋯" menu with the rarely used account actions. */
    _renderBar() {
        const busy = this.working;
        const totals = logbookTotals(this.entries ?? []);
        const facts = totals.count ? [
            diveCountText(totals.count),
            totals.seconds ? fill(tl('bar.timeUnderwater', '{0} underwater'), formatTotalTime(totals.seconds, fmtNum)) : '',
            totals.maxDepth !== null ? fill(tl('bar.deepest', 'deepest {0}'), `${fmtNum(totals.maxDepth, 1)}${NB}m`) : '',
        ].filter(Boolean) : [];
        const more = tl('bar.more', 'More actions');
        return `<section class="lb-bar">
            <div class="lb-bar-head">
                <h2 class="lb-bar-title">${escHtml(tl('bar.title', 'Your dives'))}</h2>
                ${facts.length ? `<p class="lb-totals">${facts.map(f => `<span>${escHtml(f)}</span>`).join('')}</p>` : ''}
            </div>
            <div class="lb-bar-actions">
                <a class="btn btn-secondary lb-bar-btn" id="lb-sites" href="${routeHref({ name: 'sites' })}">${escHtml(tl('sites.title', 'Sites'))}</a>
                <details class="lb-menu">
                    <summary class="btn btn-secondary lb-bar-btn lb-menu-btn" aria-label="${escHtml(more)}" title="${escHtml(more)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></summary>
                    <div class="lb-menu-pop">
                        <p class="lb-menu-who">${escHtml(fill(tb('loggedInAs', 'Logged in as {0}'), this.user.email))}</p>
                        <label class="lb-menu-item rda-upload${busy ? ' lb-disabled' : ''}"${busy ? ' aria-disabled="true"' : ''}><span>${escHtml(tb('upload', 'Upload DIVELOG'))}</span>
                            <input type="file" id="lb-upload" webkitdirectory class="rda-visually-hidden"${busy ? ' disabled' : ''}></label>
                        <button type="button" class="lb-menu-item" id="lb-export"${busy ? ' disabled' : ''}>${escHtml(tb('export', 'Export'))}</button>
                        <button type="button" class="lb-menu-item" id="lb-wipe-open">${escHtml(tl('wipe.menu', 'Delete all my data…'))}</button>
                        <button type="button" class="lb-menu-item" id="lb-logout">${escHtml(tb('logout', 'Log out'))}</button>
                    </div>
                </details>
                <a class="btn btn-primary lb-new" href="${routeHref({ name: 'new' })}">${escHtml(tl('newDive', '+ New dive'))}</a>
            </div>
            ${this.msg.length ? `<p class="rda-account-msg lb-bar-msg" role="status">${this.msg.map(m => `<span>${escHtml(m)}</span>`).join('<br>')}</p>` : ''}
        </section>`;
    }

    // ---- Select mode ----

    /** The element around a dive: a link, or in select mode a plain box that toggles the selection. */
    _wrap(entry, cls) {
        if (!this.selecting) return [`<a class="${cls}" href="${routeHref({ name: 'detail', id: entry.id })}">`, '</a>'];
        const on = this.selected.has(entry.id);
        return [`<div class="${cls} lb-selectable${on ? ' lb-selected' : ''}" data-pick="${escHtml(entry.id)}">`, '</div>'];
    }

    _pick(entry) {
        if (!this.selecting) return '';
        const label = fill(tl('bulk.pick', 'Select dive {0}'), entry.log_number ?? '–');
        return `<input type="checkbox" class="lb-select-box" data-pick-box="${escHtml(entry.id)}" aria-label="${escHtml(label)}"${this.selected.has(entry.id) ? ' checked' : ''}>`;
    }

    _enterSelect() {
        this.selecting = true;
        this._renderList();
        this.view.querySelector('#lb-select-all')?.focus();
    }

    _leaveSelect() {
        this.selecting = false;
        this.selected.clear();
        this.bulk = this.bulk?.phase === 'done' ? this.bulk : null;
        this._renderList();
        this.view.querySelector('#lb-select')?.focus();
    }

    _setPicked(ids, on) {
        for (const id of ids) on ? this.selected.add(id) : this.selected.delete(id);
        this._syncSelection();
    }

    /** Update checkboxes, highlights, counter and buttons in place (no re-render: keeps focus and scroll). */
    _syncSelection() {
        const total = this.entries?.length ?? 0;
        this.view.querySelectorAll('[data-pick]').forEach(el => el.classList.toggle('lb-selected', this.selected.has(el.dataset.pick)));
        this.view.querySelectorAll('[data-pick-box]').forEach(el => { el.checked = this.selected.has(el.dataset.pickBox); });
        const count = this.view.querySelector('.lb-count');
        if (count) count.textContent = fill(tl('bulk.selected', '{0} selected'), this.selected.size);
        const del = this.view.querySelector('#lb-bulk-delete');
        if (del) del.disabled = this.selected.size === 0 || !!this.bulk;
        const all = this.view.querySelector('#lb-select-all');
        if (all) all.disabled = this.selected.size === total;
    }

    _onPickClick(e) {
        if (!this.selecting || this.bulk?.phase === 'running') return;
        const box = e.target.closest('[data-pick-box]');
        const holder = e.target.closest('[data-pick]');
        if (box) { this._setPicked([box.dataset.pickBox], box.checked); return; }
        if (!holder) return;
        e.preventDefault(); // a link inside a table row must not navigate
        this._setPicked([holder.dataset.pick], !this.selected.has(holder.dataset.pick));
    }

    _renderSelectBar() {
        if (!this.entries?.length) return '';
        const busy = this.bulk?.phase === 'running';
        if (!this.selecting) return `<button type="button" class="btn btn-secondary lb-select-btn" id="lb-select">${escHtml(tl('bulk.select', 'Select'))}</button>`;
        // On phones the dock is fixed to the bottom of the screen; the confirmation opens right above the buttons.
        return `<div class="lb-selectdock"><div class="lb-bulk"></div><div class="lb-selectbar" role="group">
            <span class="lb-count" aria-live="polite">${escHtml(fill(tl('bulk.selected', '{0} selected'), this.selected.size))}</span>
            <button type="button" class="btn btn-small btn-secondary" id="lb-select-all"${busy || this.selected.size === this.entries.length ? ' disabled' : ''}>${escHtml(tl('bulk.selectAll', 'Select all'))}</button>
            <button type="button" class="btn btn-small btn-secondary" id="lb-select-none"${busy ? ' disabled' : ''}>${escHtml(tl('bulk.none', 'None'))}</button>
            <button type="button" class="btn btn-small btn-danger" id="lb-bulk-delete"${busy || this.bulk || !this.selected.size ? ' disabled' : ''}>${escHtml(tl('bulk.delete', 'Delete…'))}</button>
            <button type="button" class="btn btn-small btn-secondary" id="lb-select-cancel"${busy ? ' disabled' : ''}>${escHtml(tl('bulk.cancel', 'Cancel'))}</button></div></div>`;
    }

    _numberOf(id) {
        return this.entries?.find(e => e.id === id)?.log_number ?? null;
    }

    _openConfirm() {
        if (!this.selected.size || this.bulk) return;
        const picked = (this.entries ?? []).filter(e => this.selected.has(e.id))
            .sort((a, b) => (b.log_number ?? 0) - (a.log_number ?? 0));
        this.bulk = {
            phase: 'confirm', withRecordings: false, done: 0, total: picked.length, result: null,
            ids: picked.map(e => e.id), numbers: picked.map(e => e.log_number ?? '–'),
        };
        this._renderBulk();
        this.view.querySelector('#lb-bulk-no')?.focus();
        this._syncSelection();
    }

    _bulkHtml() {
        const b = this.bulk;
        if (!b) return '';
        if (b.phase === 'confirm') {
            const shown = b.numbers.slice(0, 10).map(n => `#${n}`).join(', ') + (b.numbers.length > 10 ? ', …' : '');
            return `<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(tl('bulk.delete', 'Delete…'))}">
                <p>${escHtml(fill(tl('bulk.confirm', 'Delete {0} ({1})?'), diveCountText(b.total), shown))}</p>
                <label class="lb-check"><input type="checkbox" id="lb-bulk-rec"${b.withRecordings ? ' checked' : ''}>
                    <span>${escHtml(tl('bulk.withRecordings', 'Also delete the computer recordings. Uploading the DIVELOG again brings them back as new dives.'))}</span></label>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-bulk-yes">${escHtml(tl('bulk.confirmYes', 'Delete'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-bulk-no">${escHtml(tl('bulk.cancel', 'Cancel'))}</button></div></div>`;
        }
        if (b.phase === 'running') {
            return `<div class="lb-confirm"><p role="status">${escHtml(fill(tl('bulk.progress', 'Deleting {0} / {1}…'), Math.min(b.done + 1, b.total), b.total))}</p></div>`;
        }
        const failed = b.result.failed;
        return `<div class="lb-confirm"><p role="status">${escHtml(fill(tl('bulk.done', 'Deleted {0}.'), diveCountText(b.result.deleted)))}</p>
            ${failed.length ? `<p class="lb-form-error" role="alert">${escHtml(fill(tl('bulk.failed', '{0} could not be deleted: {1}'), diveCountText(failed.length),
                failed.map(f => `#${b.numberById.get(f.id) ?? '–'} (${f.message})`).join('; ')))}</p>` : ''}
            <div class="lb-actions"><button type="button" class="btn btn-secondary" id="lb-bulk-close">${escHtml(tl('bulk.close', 'Close'))}</button></div></div>`;
    }

    /** Fill the panel in place and wire its buttons. */
    _renderBulk() {
        const host = this.view.querySelector('.lb-bulk');
        if (!host) return;
        host.innerHTML = this._bulkHtml();
        this._wireBulk(host);
    }

    _wireBulk(host) {
        host.querySelector('#lb-bulk-rec')?.addEventListener('change', e => { this.bulk.withRecordings = e.target.checked; });
        host.querySelector('#lb-bulk-no')?.addEventListener('click', () => { this.bulk = null; this._renderBulk(); this._syncSelection(); this.view.querySelector('#lb-bulk-delete')?.focus(); });
        host.querySelector('#lb-bulk-yes')?.addEventListener('click', () => this._runBulk());
        host.querySelector('#lb-bulk-close')?.addEventListener('click', () => { this.bulk = null; this._renderBulk(); this.view.querySelector('#lb-select')?.focus(); });
    }

    async _runBulk() {
        const b = this.bulk;
        if (!b || b.phase !== 'confirm') return;
        b.phase = 'running';
        b.numberById = new Map(b.ids.map((id, i) => [id, b.numbers[i]]));
        this.working = true;
        this._renderList(); // disables the account buttons and the selection bar
        try {
            b.result = await this.store.deleteEntries(b.ids, {
                withRecordings: b.withRecordings,
                onProgress: (done, total) => {
                    b.done = done; b.total = total;
                    if (!this.destroyed && b.phase === 'running') this._renderBulk();
                },
            });
        } catch (error) {
            b.result = { deleted: 0, failed: b.ids.map(id => ({ id, message: error?.message ?? String(error) })) };
        }
        this.working = false;
        b.phase = 'done';
        this.selecting = false;
        this.selected.clear();
        this.entries = null;
        if (this.destroyed || !this.user) return;
        if (this._route().name === 'list') this._showList(++this._viewToken);
    }

    // ---- List view ----

    _tagText(tag) {
        return TAGS.includes(tag) ? tl(`form.choices.tags.${tag}`, tag) : String(tag);
    }

    _timeText(entry) {
        return entry.entry_time ? String(entry.entry_time).slice(0, 5) : '';
    }

    _site(entry) {
        return entry.site_id ? this.sites.get(entry.site_id) ?? null : null;
    }

    _whenText(entry) {
        return [formatWeekdayDate(entry.dive_date, currentLang()), this._timeText(entry)].filter(Boolean).join(', ');
    }

    /**
     * The picture of a dive: its first photo, else a map of its site, else its depth profile.
     * A tile without any of them shows the dive number instead; a feed card shows nothing.
     * @param {'feed'|'tile'} variant
     */
    _visual(entry, variant) {
        const site = this._site(entry);
        const photoUrl = this.thumbs.get(entry.id) ?? null;
        const apiKey = this._mapFailed ? '' : MAPY_API_KEY; // after one failed map, stop asking for more
        const { kind } = chooseVisual({ photoUrl, site, apiKey, recordingId: entry.recording_id });
        const info = this.photos.get(entry.id);
        const more = (info?.count ?? 1) - 1;
        const frame = kind === 'photo' && variant === 'feed' ? photoFrame(info?.width, info?.height) : '';
        let map;
        if (kind === 'map') {
            const [w, h] = variant === 'tile' ? [320, 240] : [640, 280];
            map = {
                width: w, height: h, alt: fill(tl('feed.mapAlt', 'Map of {0}'), site.name),
                src: mapyStaticMapUrl({
                    lat: site.lat, lon: site.lon, apiKey: MAPY_API_KEY, width: w, height: h,
                    scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
                }),
            };
        }
        const depth = entry.max_depth_m != null && Number.isFinite(Number(entry.max_depth_m)) ? `${fmtNum(Number(entry.max_depth_m), 1)}${NB}m` : '';
        return visualHtml({
            kind, entryId: entry.id, variant, photoUrl, more, moreText: fill(tl('feed.morePhotos', '{0} more photos'), more), map,
            recordingId: entry.recording_id, profileAlt: tl('feed.profileAlt', 'Depth profile'), depthText: depth,
            numberText: fill(tl('number', '#{0}'), entry.log_number ?? '–'), frame,
        });
    }

    /** A map image that failed (key not valid on this site, offline): show the profile instead, or nothing. */
    _onVisualError(e) {
        const img = e.target;
        if (img?.tagName !== 'IMG' || !img.classList.contains('lb-visual-img')) return;
        // Only the My dives list is ours; images of the Feed, member pages and read-only details belong to their views.
        if (this._route().name !== 'list' || img.closest('.lb-form-host')) return;
        const box = img.closest('.lb-visual');
        const entry = this.entries?.find(en => en.id === box?.dataset.entry);
        if (!box || !entry) return;
        if (img.classList.contains('lb-map-img')) this._mapFailed = true;
        else this.thumbs.delete(entry.id); // signed photo URL expired or failed: show the map or profile instead
        box.outerHTML = this._visual(entry, box.dataset.variant);
        this._watchSparks();
    }

    /** The lock of a private own dive, else nothing (other dives keep their markup unchanged). */
    _lock(entry) {
        return entry.visibility === 'private' ? lockHtml(translate('diveLog.trail.visibility.private', 'Private')) : '';
    }

    _stats(entry) {
        return statsHtml(feedStats(entry, fmtNum), key => tl(`feed.stats.${key}`, STAT_FALLBACK[key]));
    }

    /** A feed card: who/where/when, the stat row, buddies and notes, then the picture. */
    _feedCard(entry) {
        const site = this._site(entry);
        const buddies = (entry.buddies ?? []).join(', ');
        const tags = (Array.isArray(entry.details?.tags) ? entry.details.tags : []).map(t => this._tagText(t)).join(', ');
        const people = [buddies ? fill(tl('views.with', 'with {0}'), buddies) : '', tags].filter(Boolean).join(' · ');
        const notes = typeof entry.notes === 'string' ? entry.notes.trim() : '';
        return feedCardHtml({
            entry, href: routeHref({ name: 'detail', id: entry.id }),
            pick: this.selecting ? { id: entry.id, selected: this.selected.has(entry.id) } : null, selectHtml: this._pick(entry),
            title: diveTitle(entry, site?.name, tt), untitled: !site, whenText: this._whenText(entry),
            numberLabel: fill(tl('number', '#{0}'), entry.log_number ?? '–'),
            statsHtml: this._stats(entry), peopleText: people, notesText: notes,
            badgeHtml: needsDetails(entry) ? `<span class="lb-badge">${escHtml(tl('addDetails', 'Add details'))}</span>` : '',
            visualHtml: this._visual(entry, 'feed'), lockHtml: this._lock(entry),
        });
    }

    _renderFeed() {
        const tag = localeTag(currentLang());
        return groupByMonth(this.entries, tag).map(g => `<section class="lb-month">
            <h3 class="lb-month-head">${escHtml(g.label ? fill(tl('views.monthHeader', '{0} · {1}'), g.label, diveCountText(g.entries.length)) : diveCountText(g.entries.length))}</h3>
            <div class="lb-feed">${g.entries.map(e => this._feedCard(e)).join('')}</div></section>`).join('');
    }

    /** A gallery tile: the picture, then title, date and the two headline stats. */
    _tile(entry) {
        const site = this._site(entry);
        const stats = feedStats(entry, fmtNum).filter(s => s.key === 'depth' || s.key === 'duration')
            .map(s => `${s.value}${NB}${s.unit}`);
        const [open, close] = this._wrap(entry, 'lb-tile');
        return `${open}${this._visual(entry, 'tile')}${this._pick(entry)}
            <div class="lb-tile-body">
                <strong class="lb-tile-title${site ? '' : ' lb-untitled'}">${escHtml(diveTitle(entry, site?.name, tt))}${this._lock(entry)}</strong>
                <span class="lb-date">${escHtml([fill(tl('number', '#{0}'), entry.log_number ?? '–'), formatDiveDate(entry.dive_date, currentLang())].filter(Boolean).join(', '))}</span>
                ${stats.length ? `<span class="lb-tile-stats">${stats.map(t => `<span>${escHtml(t)}</span>`).join('')}</span>` : ''}
            </div>${close}`;
    }

    _renderTable() {
        const sorted = sortEntries(this.entries, this.sort.key, this.sort.dir, this.sites);
        const pickHead = this.selecting ? `<th scope="col"><span class="rda-visually-hidden">${escHtml(tl('bulk.select', 'Select'))}</span></th>` : '';
        const head = pickHead + TABLE_COLUMNS.map(([key, numeric]) => {
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
            const pick = this.selecting ? `<td>${this._pick(e)}</td>` : '';
            const link = (h, text) => (this.selecting ? escHtml(text) : `<a href="${h}">${escHtml(text)}</a>`);
            return `<tr ${this.selecting ? `data-pick="${escHtml(e.id)}" class="lb-selectable${this.selected.has(e.id) ? ' lb-selected' : ''}"` : `data-href="${href}"`}>${pick}
                <td class="lb-num">${this._lock(e)}${link(href, String(e.log_number ?? dash))}</td>
                <td>${link(href, formatDiveDate(e.dive_date, lang) || dash)}</td>
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
        const buttons = FEED_VIEWS.map(v => `<button type="button" class="lb-seg" data-view="${v}" aria-pressed="${v === this.viewMode}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">${VIEW_ICONS[v]}</svg><span>${escHtml(tl(`views.${v}`, v))}</span></button>`).join('');
        return `<div class="lb-toolbar"><div class="lb-switch" role="group" aria-label="${escHtml(tl('views.label', 'Dive list view'))}">${buttons}</div>
            ${this._renderSelectBar()}</div>`;
    }

    _setViewMode(mode) {
        if (!FEED_VIEWS.includes(mode) || mode === this.viewMode) return;
        this.viewMode = mode;
        try { localStorage.setItem(VIEW_KEY, mode); } catch { /* remembered for this visit only */ }
        this._renderList();
        this.view.querySelector(`.lb-seg[data-view="${mode}"]`)?.focus(); // re-render must not drop keyboard focus
    }

    _sortBy(key) {
        const numeric = TABLE_COLUMNS.find(c => c[0] === key)?.[1];
        this.sort = this.sort.key === key
            ? { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'number' || key === 'date' || numeric ? 'desc' : 'asc' };
        const scroller = this.view.querySelector('.lb-table')?.parentElement;
        const scrollLeft = scroller?.scrollLeft ?? 0;
        this._renderList();
        const again = this.view.querySelector('.lb-table')?.parentElement;
        if (again) again.scrollLeft = scrollLeft; // keep the column the user scrolled to
        this.view.querySelector(`.lb-sort[data-sort="${key}"]`)?.focus();
    }

    // ---- Lazy depth profiles (Feed and Tiles, dives without a photo or map) ----

    _stopSparks() {
        this.sparks.stop();
    }

    _watchSparks() {
        this.sparks.watch(this.view);
    }

    _renderList() {
        this._stopSparks();
        let body;
        if (!this.entries) body = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        else if (!this.entries.length) {
            // Upload lives in the "⋯" menu; an empty logbook offers it right here.
            body = `<div class="lb-empty"><p class="rda-account-msg">${escHtml(tl('emptyList', 'No dives yet.'))}</p>
                <label class="btn btn-primary rda-upload lb-empty-upload${this.working ? ' lb-disabled' : ''}"${this.working ? ' aria-disabled="true"' : ''}><span>${escHtml(tb('upload', 'Upload DIVELOG'))}</span>
                    <input type="file" id="lb-upload-empty" webkitdirectory class="rda-visually-hidden"${this.working ? ' disabled' : ''}></label></div>`;
        }
        else {
            const list = this.viewMode === 'table' ? this._renderTable()
                : this.viewMode === 'tiles' ? `<div class="lb-tiles">${this.entries.map(e => this._tile(e)).join('')}</div>`
                    : this._renderFeed();
            body = this._renderSwitch() + list;
        }
        const docked = this.selecting && this.entries?.length; // the bulk panel then lives in the select dock
        this.view.classList.toggle('lb-selecting', !!docked);
        const menuOpen = !!this.view.querySelector('.lb-menu[open]'); // a re-render (photos arriving) must not close it
        this.view.innerHTML = `${this._renderBar()}<div class="lb-list-main">${docked ? '' : '<div class="lb-bulk"></div>'}${body}</div>`;
        if (menuOpen) this.view.querySelector('.lb-menu').open = true;
        this._renderBulk();
        this.view.querySelectorAll('.lb-seg').forEach(b => b.addEventListener('click', () => this._setViewMode(b.dataset.view)));
        this.view.querySelectorAll('.lb-sort').forEach(b => b.addEventListener('click', () => this._sortBy(b.dataset.sort)));
        this.view.querySelector('.lb-table tbody')?.addEventListener('click', e => {
            if (this.selecting) return;
            const row = e.target.closest('tr[data-href]');
            if (row && !e.target.closest('a')) location.hash = row.dataset.href;
        });
        this.view.querySelector('#lb-select')?.addEventListener('click', () => this._enterSelect());
        this.view.querySelector('#lb-select-all')?.addEventListener('click', () => this._setPicked(this.entries.map(en => en.id), true));
        this.view.querySelector('#lb-select-none')?.addEventListener('click', () => this._setPicked(this.entries.map(en => en.id), false));
        this.view.querySelector('#lb-select-cancel')?.addEventListener('click', () => this._leaveSelect());
        this.view.querySelector('#lb-bulk-delete')?.addEventListener('click', () => this._openConfirm());
        this.view.querySelectorAll('.lb-feed, .lb-tiles, .lb-table tbody').forEach(el => el.addEventListener('click', e => this._onPickClick(e)));
        if (this.viewMode !== 'table' && this.entries?.length) this._watchSparks();
        this.view.querySelector('#lb-upload').addEventListener('change', e => { this._closeMenu(); this._upload(e.target); });
        this.view.querySelector('#lb-upload-empty')?.addEventListener('change', e => this._upload(e.target));
        this.view.querySelector('#lb-export').addEventListener('click', () => { this._closeMenu(); this._export(); });
        this.view.querySelector('#lb-wipe-open').addEventListener('click', () => { this._closeMenu(); this._openWipe(); });
        this.view.querySelector('#lb-logout').addEventListener('click', () => this._logout());
    }

    _closeMenu() {
        const menu = this.view?.querySelector('.lb-menu[open]');
        if (menu) menu.open = false;
    }

    // ---- Account actions ----

    /**
     * Remember and show a store failure. A failure of the current view's own load replaces the view with a
     * message; a background failure (login-time ensureEntries, upload, export, logout) never does: the list
     * re-renders with the message, any other view gets a banner and keeps what the user is working on.
     */
    _storeError(error, { background = false } = {}) {
        console.error(error);
        this.msg = [typeof navigator !== 'undefined' && navigator.onLine === false
            ? tb('offline', 'You\'re offline. Your dive log needs a connection, so it will load again when you\'re back online.')
            : error instanceof DiveStoreError && error.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. If it hasn\'t been used for a week, resume the project in the Supabase dashboard.')
            : tb('genericError', 'Something went wrong. Please try again.')];
        if (this.destroyed || !this.user) return;
        if (this._route().name === 'list') this._renderList();
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
        if (this.user && this._route().name === 'list') this._renderList();
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
                if (this._route().name === 'list') this._renderList();
            });
            this.msg = this._reportLines(report);
            if (ensureError) {
                this._storeError(ensureError, { background: true });
                this.msg = [...this._reportLines(report), ...this.msg];
            }
            this.working = false;
            if (this._route().name === 'list') this._showList(++this._viewToken);
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

    _openWipe() {
        if (this.wipe) return;
        this.wipe = new DeleteDataPanel({ store: this.store, onExport: () => this._export(), onClosed: () => { this.wipe = null; } });
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
