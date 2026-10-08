/**
 * Recorded dive analysis page component.
 *
 * Opens Divesoft .DLF dive logs, lists them, and shows the selected dive in
 * DecoTheory's profile, P-P (M-value) and GF charts. GF sliders redraw the
 * limits over the fixed recorded profile; the summary panel reports how close
 * the dive came to them. Without a dive store, dives live only in the open page;
 * with one (and a logged-in user) they are uploaded to and listed from the server.
 */

import { parseDivesoftDLF } from '../import/divesoftDlf.js';
import { prepareRecordedSetup } from '../import/recordedDive.js';
import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M } from '../import/recordedDiveSummary.js';
import { startStateFor, CHAIN_MAX_GAP_MIN } from '../import/diveChain.js';
import { recordedGasSetup, ASSUMED_SAC_LPM, ASSUMED_CYLINDER_L, ASSUMED_START_BAR } from '../import/recordedGas.js';
import { sha256Hex } from '../backend/sync.js';
import { uploadDivelog, exportZip } from '../logbook/transfer.js';
import { DiveStoreError } from '../backend/supabaseStore.js';
import { MIN_GF_PERCENT, MAX_GF_PERCENT } from '../gfLimits.js';
import { GF_PRESETS } from '../gfPresets.js';
import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

/** True for file names that look like Divesoft dive logs. */
export function isDlfFileName(name) {
    return /.\.dlf$/i.test(name ?? '');
}

/**
 * Parse every .DLF file among `files`; skip everything else.
 *
 * @param {Iterable<{name: string, arrayBuffer: () => Promise<ArrayBuffer>}>} files
 * @returns {Promise<{dives: Object[], items: Array<{dive: Object, bytes: Uint8Array, sha256: string}>, errors: Array<{fileName: string, message: string}>}>}
 *   `items` holds the raw bytes and hash of each dive, in the same order as `dives`.
 */
export async function loadDiveFiles(files) {
    const items = [];
    const errors = [];
    for (const file of files) {
        if (!isDlfFileName(file.name)) continue;
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const dive = parseDivesoftDLF(bytes, { fileName: file.name });
            items.push({ dive, bytes, sha256: await sha256Hex(bytes) });
        } catch (error) {
            errors.push({ fileName: file.name, message: error.message || String(error) });
        }
    }
    items.sort((x, y) => {
        const a = x.dive;
        const b = y.dive;
        const na = a.source.diveNumber ?? Infinity;
        const nb = b.source.diveNumber ?? Infinity;
        if (na !== nb) return na - nb;
        return a.start.local.localeCompare(b.start.local);
    });
    return { dives: items.map(i => i.dive), items, errors };
}

/**
 * A lightweight dive for the list, built from a stored summary row (no samples yet).
 * @param {Object} row - Summary row from the dive store
 */
export function summaryToListDive(row) {
    const s = row.summary ?? {};
    return {
        id: row.id,
        source: { diveNumber: row.diveNumber, fileName: null },
        start: { local: row.startLocal },
        device: { serial: row.deviceSerial },
        maxDepth: s.maxDepth,
        duration: s.duration,
        mode: s.mode,
        deco: { gfLow: s.gfLow, gfHigh: s.gfHigh },
        environment: { waterSetting: s.waterSetting },
        warnings: s.warnings ?? [],
        samples: null,
    };
}

/**
 * The list dives that started within the chain limit before `target`, excluding unreliable dates.
 * @param {Object} target - Dive (full or list dive)
 * @param {Object[]} listDives
 */
export function chainWindow(target, listDives) {
    const ms = d => Date.parse(`${d.start.local}Z`);
    const end = ms(target);
    return listDives.filter(d => d !== target && !d.warnings.includes('implausible-date')
        && ms(d) < end && end - ms(d) <= CHAIN_MAX_GAP_MIN * 60000);
}

/**
 * Fetch demo DLF files into file-like objects.
 * @param {string[]} urls
 * @param {Function} [fetchImpl=fetch]
 * @returns {Promise<Array<{name: string, arrayBuffer: Function}>>}
 * @throws {Error} on a failed or non-ok response
 */
export async function fetchDemoFiles(urls, fetchImpl = (...a) => fetch(...a)) {
    return Promise.all(urls.map(async url => {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return { name: url.split('/').pop(), arrayBuffer: async () => buffer };
    }));
}

/** Clamp a GF pair to the allowed range and make sure GF high is not below GF low. */
export function clampGfPair(gfLow, gfHigh) {
    const clamp = v => Math.min(MAX_GF_PERCENT, Math.max(MIN_GF_PERCENT, Math.round(Number(v) || 0)));
    const low = clamp(gfLow);
    return { gfLow: low, gfHigh: Math.max(low, clamp(gfHigh)) };
}

/** The GF the dive computer used, or 100/100 when the log has none. */
export function deviceGf(dive) {
    return { gfLow: dive.deco?.gfLow ?? 100, gfHigh: dive.deco?.gfHigh ?? 100 };
}

/** Only open-circuit dives with a profile can be analysed. */
export function canAnalyze(dive) {
    return dive.mode === 'oc' && (dive.samples?.length ?? 0) >= 2;
}

const t = (key, fallback) => translate(`diveLog.${key}`, fallback);

const viewPreset = (showCeiling, showAmbientPressure, showPartialPressures, showTissueLoading, showGasConsumption) =>
    ({ showCeiling, showAmbientPressure, showPartialPressures, showTissueLoading, showGasConsumption, showLabels: false });

/**
 * Profile chart views, the Sandbox's five presets (sandbox/index.html) with labels hidden.
 * `key`/`fallback`: translation under `diveLog.view.*`.
 */
export const CHART_VIEWS = [
    { id: 'profile', key: 'view.profile', fallback: 'Profile', options: viewPreset(true, false, false, false, false) },
    { id: 'pressure', key: 'view.pressure', fallback: 'Pressure', options: viewPreset(false, true, false, false, false) },
    { id: 'pp', key: 'view.pp', fallback: 'Partial pressure', options: viewPreset(false, false, true, false, false) },
    { id: 'tissue', key: 'view.tissue', fallback: 'Tissues', options: viewPreset(true, true, false, true, false) },
    { id: 'gas', key: 'view.gas', fallback: 'Gas', options: viewPreset(false, false, false, false, true) },
];

/**
 * DiveProfileChart options for a view; unknown ids fall back to Profile. The recorded overlays
 * (dive computer ceiling, above-ceiling shading) belong to the Profile view only.
 * @param {string} viewId
 * @param {{referenceCeiling?: Object[]|null, referenceCeilingLabel?: string}} ref
 */
export function chartViewOptions(viewId, { referenceCeiling = null, referenceCeilingLabel } = {}) {
    const view = CHART_VIEWS.find(v => v.id === viewId) ?? CHART_VIEWS[0];
    const profile = view.id === 'profile';
    return {
        ...view.options,
        referenceCeiling: profile ? referenceCeiling ?? null : null,
        referenceCeilingLabel,
        highlightCeilingViolations: profile,
    };
}

/**
 * Translate the `[data-i18n]` elements under `root` (js/i18n.js only does this once at load).
 * The element's first innerHTML is kept as the English fallback.
 * @param {{querySelectorAll: Function}} root
 * @param {(key: string, fallback: string) => string} [translateFn]
 */
export function translateStatic(root, translateFn = translate) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
        if (el.dataset.i18nFallback === undefined) el.dataset.i18nFallback = el.innerHTML;
        el.innerHTML = translateFn(el.getAttribute('data-i18n'), el.dataset.i18nFallback);
    }
}

/**
 * Readable label for a mode or water-setting code; unknown codes stay raw, absent ones show a dash.
 * @param {'mode'|'water'} kind
 * @param {string|null|undefined} code
 */
export function codeLabel(kind, code, translateFn = translate) {
    if (code == null || code === '') return '–';
    return translateFn(`diveLog.${kind}.${code}`, String(code));
}

/** The # column: the dive number, or the file name / a dash when the dive has none (server rows use 0). */
export function diveNumberLabel(dive) {
    const n = dive.source.diveNumber;
    return n ? String(n) : (dive.source.fileName ?? '–');
}
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const minSec = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export class RecordedDiveAnalysis {
    /**
     * @param {HTMLElement} root - Element the page UI is built in
     * @param {{demoFiles?: string[], store?: Object|null, embedded?: boolean, focusRecordingId?: string|null, entryGases?: Object[]}} [config]
     *   URLs of example .DLF files loaded when nothing is picked; the dive store (null without a configured
     *   backend). `embedded` (inside the logbook, user already logged in): no account bar, no pickers, dives
     *   come from the store. `focusRecordingId`: the stored recording selected once loaded (its list is then hidden).
     *   `entryGases`: the logbook entry's cylinders (gasesFromEntry rows) for the Gas view.
     */
    constructor(root, { demoFiles = [], store = null, embedded = false, focusRecordingId = null, entryGases = [] } = {}) {
        this.root = root;
        this.embedded = embedded;
        this.focusRecordingId = focusRecordingId;
        this.entryGases = entryGases ?? [];
        this.view = 'profile';
        this.gasCache = new Map();
        this.destroyed = false;
        this._unsubscribe = null;
        this.demoFiles = demoFiles;
        this.store = store;
        this.user = null;
        this.serverMode = false;
        this.serverFailed = false;
        this.full = new Map();
        this.current = null;
        this.report = null;
        this.busy = null;
        this.working = false;
        this.accountMsg = null;
        this.email = '';
        this.linkSent = false;
        this._userKnown = false;
        this._selectToken = 0;
        this.dives = [];
        this.errors = [];
        this.isDemo = false;
        this.selected = null;
        this.gf = { gfLow: 100, gfHigh: 100 };
        this.charts = null;
        this.chainEnabled = true;
        this.startStates = new Map();
        this._buildDom();
        translateStatic(this.root);
        this._onLanguage = () => this._renderAll();
        document.addEventListener('languagechange', this._onLanguage);
        if (this.embedded && this.store) {
            this.user = { id: null, email: '' };
            this.serverMode = true;
            this._userKnown = true;
            this._loadServer();
        } else if (this.store) this._initStore();
        else this._loadDemo();
    }

    /** Remove listeners and charts; the instance is unusable afterwards. */
    destroy() {
        this.destroyed = true;
        this._selectToken++;
        document.removeEventListener('languagechange', this._onLanguage);
        this._unsubscribe?.();
        this._unsubscribe = null;
        if (this.charts) {
            for (const chart of Object.values(this.charts)) chart.destroy?.();
            this.charts = null;
        }
        this.root.innerHTML = '';
    }

    // ---- Account bar and server mode ----

    _initStore() {
        if (/error_code=otp_expired/.test(globalThis.location?.hash ?? '')) {
            this.accountMsg = { key: 'linkExpired', fallback: 'This login link has expired. Send a new one.' };
            try {
                history.replaceState(null, '', location.pathname + location.search);
            } catch { /* keep the hash */ }
        }
        this._renderAccount();
        this._unsubscribe = this.store.onAuthChange(user => this._onUser(user));
        this.store.currentUser().then(user => this._onUser(user), error => {
            if (this.destroyed) return;
            this._storeError(error);
            this._onUser(null);
        });
    }

    _onUser(user) {
        if (this.destroyed) return;
        const same = this._userKnown && (user?.id ?? null) === (this.user?.id ?? null);
        this._userKnown = true;
        if (same) return;
        this.user = user;
        this.serverMode = Boolean(user);
        this.serverFailed = false;
        this.report = null;
        this.full.clear();
        if (user) {
            this.accountMsg = null;
            this.linkSent = false;
            this._renderAccount();
            this._loadServer();
        } else {
            this._renderAccount();
            this._setDives({ dives: [], errors: [] });
            this._loadDemo();
        }
    }

    /** Explain a store failure; details only go to the console. */
    _storeError(error) {
        console.error(error);
        if (this.destroyed) return;
        this.accountMsg = error instanceof DiveStoreError && error.kind === 'unreachable'
            ? { key: 'unreachable', fallback: 'Can\'t reach your dive log. If it hasn\'t been used for a week, resume the project in the Supabase dashboard.' }
            : { key: 'genericError', fallback: 'Something went wrong. Please try again.' };
        this._renderAccount();
        if (this.embedded && !this.destroyed) this._renderList();
    }

    async _loadServer() {
        this.isDemo = false;
        this.full.clear();
        this.busy = { key: 'loading', fallback: 'Loading…' };
        this._setDives({ dives: [], errors: [] });
        try {
            const rows = await this.store.listDives();
            this.busy = null;
            if (!this.serverMode || this.destroyed) return;
            this._setDives({ dives: rows.map(summaryToListDive), errors: [] });
            this.store.reparseOutdated(rows).catch(error => console.error(error));
        } catch (error) {
            this.busy = null;
            if (this.destroyed) return;
            this.serverFailed = true;
            if (this.focusRecordingId) this.focusMissing = true;
            this._storeError(error);
            this._renderAccount();
            this._renderList();
            if (!this.embedded) this._loadDemo();
        }
    }

    _renderAccount() {
        if (this.destroyed) return;
        if (!this.store || this.embedded) return;
        const el = this.root.querySelector('#rda-account');
        el.hidden = false;
        const msg = this.accountMsg ? `<p class="rda-account-msg">${escHtml(t(`backend.${this.accountMsg.key}`, this.accountMsg.fallback))}</p>` : '';
        const label = (key, fallback) => escHtml(t(`backend.${key}`, fallback));
        if (this.user) {
            el.innerHTML = `
                <span class="rda-account-who">${escHtml(fill(t('backend.loggedInAs', 'Logged in as {0}'), this.user.email))}</span>
                <label class="btn btn-small btn-secondary rda-upload"><span>${label('upload', 'Upload DIVELOG')}</span>
                    <input type="file" id="rda-upload" webkitdirectory class="rda-visually-hidden"${this.working ? ' disabled' : ''}></label>
                <button type="button" class="btn btn-small btn-secondary" id="rda-export"${this.working ? ' disabled' : ''}>${label('export', 'Export')}</button>
                <button type="button" class="btn btn-small btn-secondary" id="rda-logout">${label('logout', 'Log out')}</button>
                ${msg}`;
            el.querySelector('#rda-upload').addEventListener('change', e => this._upload(e.target));
            el.querySelector('#rda-export').addEventListener('click', () => this._export());
            el.querySelector('#rda-logout').addEventListener('click', () => this._logout());
        } else {
            el.innerHTML = `
                <strong>${label('loginHeading', 'Your dive log')}</strong>
                <form class="rda-login" id="rda-login">
                    <label>${label('emailLabel', 'Email')}
                        <input type="email" id="rda-email" required autocomplete="email" value="${escHtml(this.email)}"></label>
                    <button type="submit" class="btn btn-small btn-secondary">${label(this.linkSent ? 'sendAgain' : 'sendLink', this.linkSent ? 'Send again' : 'Send login link')}</button>
                </form>
                ${this.linkSent ? `<p class="rda-account-msg">${label('linkSent', 'Check your email for the login link.')}</p>` : ''}
                ${msg}`;
            const input = el.querySelector('#rda-email');
            input.addEventListener('input', () => { this.email = input.value; });
            el.querySelector('#rda-login').addEventListener('submit', e => {
                e.preventDefault();
                this._sendLink(input.value.trim());
            });
        }
    }

    async _sendLink(email) {
        if (!email) return;
        this.email = email;
        try {
            await this.store.sendLoginLink(email, `${location.origin}${location.pathname}`);
            this.linkSent = true;
            this.accountMsg = null;
            this._renderAccount();
        } catch (error) {
            console.error(error);
            this.linkSent = false;
            const rateLimited = /429|only request this after|rate limit/i.test(error?.message ?? '');
            this.accountMsg = rateLimited
                ? { key: 'tooManyLinks', fallback: 'Too many login emails were sent. Wait up to an hour and try again.' }
                : error instanceof DiveStoreError && error.kind === 'auth'
                    ? { key: 'cannotLogin', fallback: 'This email can\'t log in here.' }
                    : null;
            if (this.accountMsg) this._renderAccount();
            else this._storeError(error);
        }
    }

    async _logout() {
        try {
            await this.store.signOut();
            this._onUser(null);
        } catch (error) {
            this._storeError(error);
        }
    }

    _setWorking(on) {
        this.working = on;
        this._renderAccount();
    }

    async _upload(input) {
        if (this.working) return;
        const files = Array.from(input.files);
        input.value = '';
        this._setWorking(true);
        this.report = null;
        try {
            this.busy = { key: 'progress', fallback: 'Saving {0} / {1}…', args: [0, 0] };
            this._renderList();
            const { report } = await uploadDivelog(this.store, files, (done, total) => {
                this.busy = { key: 'progress', fallback: 'Saving {0} / {1}…', args: [done, total] };
                this._renderList();
            });
            this.report = report;
            this.busy = null;
            if (this.serverMode) await this._loadServer();
        } catch (error) {
            this.busy = null;
            this._storeError(error);
            this._renderList();
        } finally {
            this._setWorking(false);
        }
    }

    async _export() {
        if (this.working) return;
        this._setWorking(true);
        try {
            await exportZip(this.store);
        } catch (error) {
            this._storeError(error);
        } finally {
            this._setWorking(false);
        }
    }

    /** Full record for a list dive (cached); already-full dives are returned as they are. */
    async _fullDive(dive) {
        if (dive.samples !== null) return dive;
        if (!this.full.has(dive.id)) this.full.set(dive.id, await this.store.loadDive(dive.id));
        return this.full.get(dive.id);
    }

    _buildDom() {
        this.root.innerHTML = `
            <section class="rda-account rda-card" id="rda-account" hidden></section>
            <section class="rda-open rda-card" id="rda-open">
                <label class="rda-picker" id="rda-pick-folder"><span data-i18n="diveLog.openFolder">Open a DIVELOG folder</span>
                    <input type="file" id="rda-folder" webkitdirectory></label>
                <label class="rda-picker" id="rda-pick-files"><span data-i18n="diveLog.openFiles">or pick .DLF files</span>
                    <input type="file" id="rda-files" multiple accept=".dlf,.DLF"></label>
                <p class="rda-status" id="rda-status"></p>
            </section>
            <section class="rda-list rda-card"><div><table class="rda-table">
                <thead><tr>
                    <th data-i18n="diveLog.colDive">#</th>
                    <th data-i18n="diveLog.colStart">Start (device time)</th>
                    <th data-i18n="diveLog.colDepth">Max depth</th>
                    <th data-i18n="diveLog.colDuration">Duration</th>
                    <th data-i18n="diveLog.colMode">Mode</th>
                    <th data-i18n="diveLog.colGf">GF</th>
                    <th data-i18n="diveLog.colWater">Water</th>
                    <th data-i18n="diveLog.colWarnings">Warnings</th>
                </tr></thead>
                <tbody id="rda-rows"></tbody>
            </table></div></section>
            <section class="rda-analysis" id="rda-analysis" hidden>
                <div class="rda-controls rda-card">
                    <h2 data-i18n="diveLog.gfHeading">Gradient factors</h2>
                    <label for="rda-gf-low">GF Low <output id="rda-gf-low-out"></output></label>
                    <input type="range" id="rda-gf-low" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <label for="rda-gf-high">GF High <output id="rda-gf-high-out"></output></label>
                    <input type="range" id="rda-gf-high" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <div class="rda-presets" id="rda-presets"></div>
                    <button type="button" class="btn btn-small btn-secondary" id="rda-reset" data-i18n="diveLog.resetGf">Reset to device GF</button>
                    <label class="rda-chain-toggle"><input type="checkbox" id="rda-chain" checked>
                        <span data-i18n="diveLog.chainToggle">Include earlier dives (repetitive diving)</span></label>
                </div>
                <div class="rda-summary rda-card" id="rda-summary"></div>
                <p class="rda-note" id="rda-note" hidden></p>
                <div class="rda-charts" id="rda-charts">
                    <div class="rda-views" role="group" id="rda-views"></div>
                    <div class="chart-wrapper" id="rda-profile" style="height: 520px;"></div>
                    <p class="rda-note rda-gas-note" id="rda-gas-note" hidden></p>
                    <div class="chart-wrapper" id="rda-mvalue" style="height: 640px;"></div>
                    <div class="chart-wrapper" id="rda-gf" style="height: 640px;"></div>
                </div>
                <details class="rda-help rda-card">
                    <summary data-i18n="diveLog.helpHeading">How the ceilings compare</summary>
                    <p data-i18n="diveLog.helpText"></p>
                </details>
            </section>`;
        const $ = id => this.root.querySelector(`#${id}`);
        if (this.embedded) {
            $('rda-pick-folder').hidden = true;
            $('rda-pick-files').hidden = true;
            if (this.focusRecordingId) this.root.querySelector('.rda-list').hidden = true;
        }
        this.el = {
            status: $('rda-status'), rows: $('rda-rows'), analysis: $('rda-analysis'),
            gfLow: $('rda-gf-low'), gfHigh: $('rda-gf-high'), gfLowOut: $('rda-gf-low-out'), gfHighOut: $('rda-gf-high-out'),
            presets: $('rda-presets'), reset: $('rda-reset'), summary: $('rda-summary'), note: $('rda-note'),
            charts: $('rda-charts'), profile: $('rda-profile'), mvalue: $('rda-mvalue'), gfChart: $('rda-gf'),
            views: $('rda-views'), gasNote: $('rda-gas-note'),
        };
        this.el.views.addEventListener('click', e => {
            const btn = e.target.closest('button[data-view]');
            if (!btn || btn.dataset.view === this.view) return;
            this.view = btn.dataset.view;
            this._renderViews();
            this._renderAnalysis();
        });
        this._renderViews();
        const pick = async (input) => {
            const result = await loadDiveFiles(input.files);
            this.isDemo = false;
            this._setDives(result);
        };
        $('rda-folder').addEventListener('change', e => pick(e.target));
        $('rda-files').addEventListener('change', e => pick(e.target));
        const onSlider = () => this._setGf(clampGfPair(this.el.gfLow.value, this.el.gfHigh.value));
        this.el.gfLow.addEventListener('input', onSlider);
        this.el.gfHigh.addEventListener('input', onSlider);
        this.el.reset.addEventListener('click', () => this.current && this._setGf(deviceGf(this.current)));
        $('rda-chain').addEventListener('change', e => {
            this.chainEnabled = e.target.checked;
            this._renderAnalysis();
        });
        this.el.presets.innerHTML = GF_PRESETS.map(p =>
            `<button type="button" class="btn btn-small btn-secondary" data-gf-low="${p.gfLow}" data-gf-high="${p.gfHigh}">${escHtml(translate(p.labelKey, p.label))}</button>`).join('');
        this.el.presets.addEventListener('click', e => {
            const btn = e.target.closest('button[data-gf-low]');
            if (btn) this._setGf(clampGfPair(btn.dataset.gfLow, btn.dataset.gfHigh));
        });
    }

    async _loadDemo() {
        if (this.demoFiles.length === 0) return;
        try {
            const files = await fetchDemoFiles(this.demoFiles);
            if (this.destroyed) return;
            if (this.dives.length > 0) return; // the user picked files meanwhile
            const result = await loadDiveFiles(files);
            if (this.destroyed) return;
            this.isDemo = true;
            this._setDives(result);
        } catch (error) {
            if (this.destroyed || this.dives.length > 0) return;
            this._setDives({ dives: [], errors: [{ fileName: this.demoFiles[0]?.split('/').pop() ?? '', message: error.message || String(error) }] });
        }
    }

    _setDives({ dives, errors }) {
        if (this.destroyed) return;
        this.dives = dives;
        this.errors = errors;
        this.selected = null;
        this.current = null;
        this._selectToken++;
        this.startStates = new Map();
        this._renderList();
        this.focusMissing = false;
        const focus = this.focusRecordingId ? dives.find(d => d.id === this.focusRecordingId) : null;
        if (this.focusRecordingId && !focus) {
            this.focusMissing = true; // never show an unrelated dive in its place
            this.el.analysis.hidden = true;
            this._renderList();
        } else if (dives.length > 0) this._select(focus ?? dives.at(-1));
        else this.el.analysis.hidden = true;
    }

    async _select(dive) {
        this.selected = dive;
        this._renderList();
        const token = ++this._selectToken;
        if (this.destroyed) return;
        if (this.serverMode || dive.samples === null) {
            this.current = null;
            this.el.analysis.hidden = false;
            this.el.charts.hidden = true;
            this.el.summary.innerHTML = '';
            this.el.note.hidden = false;
            this.el.note.textContent = t('backend.loading', 'Loading…');
            try {
                const full = await this._fullDive(dive);
                if (canAnalyze(full)) {
                    const window = await Promise.all(chainWindow(dive, this.dives).map(d => this._fullDive(d)));
                    this.startStates.set(full, startStateFor(full, [...window, full]));
                }
                if (token !== this._selectToken) return;
                this.current = full;
            } catch (error) {
                if (token === this._selectToken) this._storeError(error);
                return;
            }
        } else {
            this.current = dive;
        }
        this._setGf(deviceGf(this.current));
    }

    _setGf(gf) {
        if (this.destroyed) return;
        this.gf = gf;
        this.el.gfLow.value = gf.gfLow;
        this.el.gfHigh.value = gf.gfHigh;
        this.el.gfLowOut.textContent = `${gf.gfLow}\u00a0%`;
        this.el.gfHighOut.textContent = `${gf.gfHigh}\u00a0%`;
        this._renderAnalysis();
    }

    _renderAll() {
        if (this.destroyed) return;
        translateStatic(this.root);
        this._renderViews();
        this._renderAccount();
        this._renderList();
        this._renderAnalysis();
    }

    /** The view switch above the profile chart (re-rendered for a language change). */
    _renderViews() {
        this.el.views.setAttribute('aria-label', t('view.label', 'Chart view'));
        this.el.views.innerHTML = CHART_VIEWS.map(v =>
            `<button type="button" class="rda-seg" data-view="${v.id}" aria-pressed="${v.id === this.view}">${escHtml(t(v.key, v.fallback))}</button>`).join('');
    }

    _renderList() {
        if (this.destroyed) return;
        const statusParts = [];
        const hidePickers = this.embedded || (this.serverMode && !this.serverFailed);
        this.root.querySelector('#rda-pick-folder').hidden = hidePickers;
        this.root.querySelector('#rda-pick-files').hidden = hidePickers;
        if (this.busy) statusParts.push(fill(t(`backend.${this.busy.key}`, this.busy.fallback), ...(this.busy.args ?? [])));
        if (this.report) {
            const r = this.report;
            if (r.saved) statusParts.push(fill(t('backend.reportSaved', '{0} new dives saved'), r.saved));
            if (r.updated) statusParts.push(fill(t('backend.reportUpdated', '{0} updated'), r.updated));
            if (r.unchanged) statusParts.push(fill(t('backend.reportUnchanged', '{0} already stored'), r.unchanged));
            if (r.failed.length) {
                statusParts.push(fill(t('backend.reportFailed', '{0} could not be saved: {1}'), r.failed.length,
                    r.failed.map(f => `${f.fileName} (${f.message})`).join('; ')));
            }
        }
        if (this.focusMissing) statusParts.push(t('logbook.notFound', 'Dive not found'));
        if (this.embedded && this.accountMsg) statusParts.push(t(`backend.${this.accountMsg.key}`, this.accountMsg.fallback));
        if (this.isDemo) statusParts.push(t('demoNote', 'Showing example dives. Open your own DIVELOG folder above.'));
        if (this.dives.length === 0 && !this.busy) statusParts.push(t('noDives', 'No dive logs found. Pick the DIVELOG folder from the dive computer, or its .DLF files.'));
        for (const e of this.errors) statusParts.push(fill(t('unreadable', 'Could not read {0}: {1}'), e.fileName, e.message));
        this.el.status.innerHTML = statusParts.map(s => `<span>${escHtml(s)}</span>`).join('<br>');
        this.root.querySelector('#rda-open').hidden = hidePickers && statusParts.length === 0; // no empty card

        this.el.rows.innerHTML = '';
        for (const dive of this.dives) {
            const tr = document.createElement('tr');
            if (dive === this.selected) tr.classList.add('rda-selected');
            const gf = dive.deco?.gfLow != null ? `${dive.deco.gfLow}/${dive.deco.gfHigh}` : '–';
            tr.innerHTML = `
                <td>${escHtml(diveNumberLabel(dive))}</td>
                <td>${escHtml(dive.start.local.replace('T', ' '))}</td>
                <td class="num">${fmtNum(dive.maxDepth, 1)}\u00a0m</td>
                <td class="num">${minSec(dive.duration)}</td>
                <td>${escHtml(codeLabel('mode', dive.mode))}</td>
                <td>${gf}</td>
                <td>${escHtml(codeLabel('water', dive.environment.waterSetting))}</td>
                <td class="rda-warn">${escHtml(dive.warnings.join(', '))}</td>`;
            tr.tabIndex = 0;
            tr.addEventListener('click', () => this._select(dive));
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') this._select(dive); });
            this.el.rows.appendChild(tr);
        }
    }

    _renderAnalysis() {
        if (this.destroyed) return;
        const dive = this.current;
        if (!dive) return;
        this.el.analysis.hidden = false;
        if (!canAnalyze(dive)) {
            this.el.charts.hidden = true;
            this.el.summary.innerHTML = '';
            this.el.note.hidden = false;
            this.el.note.textContent = (dive.samples?.length ?? 0) < 2
                ? t('noSamplesNote', 'This log has no depth profile to analyse.')
                : fill(t('nonOcNote', 'Analysis currently supports open-circuit dives only (this dive: {0}).'), dive.mode);
            return;
        }
        this.el.charts.hidden = false;
        const { setup, deviceCeiling } = prepareRecordedSetup(dive, this.gf);
        const start = this.chainEnabled ? this._startState(dive) : null;
        setup.initialTissuePressures = start?.initialTissuePressures ?? null;
        const summary = summarizeRecordedDive(analyzeRecordedDive(setup));
        this._renderSummary(dive, summary, start);
        if (this.view === 'gas') {
            const { gases, assumed } = this._gasSetup(dive, setup);
            setup.gases = gases;
            this.el.gasNote.textContent = this._gasNote(assumed);
            this.el.gasNote.hidden = false;
        } else {
            this.el.gasNote.hidden = true;
            this.el.gasNote.textContent = '';
        }
        this._renderCharts(setup, deviceCeiling, dive);
    }

    /**
     * Cylinder data for the Gas view. Gas use depends only on the recorded profile and the mixes
     * (not on GF or the tissue start state), so it is cached per dive.
     */
    _gasSetup(dive, setup) {
        if (!this.gasCache.has(dive)) {
            const { results } = analyzeRecordedDive({ ...setup, initialTissuePressures: null });
            this.gasCache.set(dive, recordedGasSetup(setup.gases, this.entryGases, results));
        }
        return this.gasCache.get(dive);
    }

    _gasNote(assumed) {
        if (assumed.length === 0) {
            return t('gasNoteLogbook', 'Cylinder pressures from your logbook entry; the line between them is modelled from the depth profile.');
        }
        return fill(t('gasNoteAssumed', 'No cylinder data for {0} — assumed SAC {1}\u00a0l/min, {2}\u00a0l cylinder filled to {3}\u00a0bar. Add start and end pressure to the logbook entry to see your own.'),
            assumed.join(', '), fmtNum(ASSUMED_SAC_LPM, 0), fmtNum(ASSUMED_CYLINDER_L, 0), fmtNum(ASSUMED_START_BAR, 0));
    }

    /** Start state from earlier loaded dives; independent of GF, so cached per dive. */
    _startState(dive) {
        if (!this.startStates.has(dive) && !this.serverMode) this.startStates.set(dive, startStateFor(dive, this.dives));
        return this.startStates.get(dive) ?? null;
    }

    _describeStart(start) {
        if (!start) return t('startDisabled', 'fresh start — earlier dives are ignored');
        const hours = min => fmtNum(min / 60, 1);
        switch (start.reason) {
            case 'chained': {
                const numbers = start.chain.map(c => `#${c.dive.source.diveNumber ?? '?'}`).join(', ');
                return fill(t('startChained', 'carries nitrogen from {0} ({1}); last surface interval {2}\u00a0h'),
                    fill(t('startChainCount', '{0} earlier dive(s)'), start.chain.length), numbers, hours(start.chain.at(-1).surfaceIntervalMin));
            }
            case 'long-gap':
                return fill(t('startLongGap', 'fresh start — previous dive {0}\u00a0days earlier'), fmtNum(start.previousGapMin / 1440, 0));
            case 'settled':
                return fill(t('startSettled', 'fresh start — tissues settled during {0}\u00a0h at the surface'), hours(start.previousGapMin));
            case 'clock-overlap':
                return t('startClock', 'fresh start — the previous dive overlaps in time (dive computer clock)');
            case 'unreliable-date':
                return t('startUnreliable', 'fresh start — this dive’s date looks wrong, so earlier dives cannot be matched');
            case 'not-chainable':
                return t('startNotChainable', 'fresh start — an earlier dive could not be modelled');
            default:
                return t('startFirst', 'fresh start — no earlier dive loaded');
        }
    }

    _renderSummary(dive, s, start) {
        const pct = v => `${fmtNum(v * 100, 0)}\u00a0%`;
        const device = deviceGf(dive);
        const rows = [
            [t('startState', 'Start state'), this._describeStart(start)],
            [t('peakGf', 'Peak tissue GF during the dive'), s.peakGf
                ? fill(t('peakGfValue', '{0} (compartment {1} at {2}\u00a0min)'), pct(s.peakGf.value), s.peakGf.compartment, fmtNum(s.peakGf.t, 1))
                : '–'],
            [t('surfaceGf', 'Surface GF at the end'), s.surfaceGfEnd
                ? fill(t('surfaceGfValue', '{0} (compartment {1})'), pct(s.surfaceGfEnd.value), s.surfaceGfEnd.compartment)
                : t('surfaceGfNone', 'no tissue supersaturated')],
            [t('aboveCeiling', 'Time above ceiling'), s.aboveCeiling.seconds > 0
                ? fill(t('aboveCeilingValue', '{0} (up to {1}\u00a0m above)'), minSec(s.aboveCeiling.seconds), fmtNum(s.aboveCeiling.worstM, 1))
                : t('aboveCeilingNone', 'none — the dive stayed below the ceiling')],
            [t('decoObligation', 'Deco obligation'), s.deco
                ? fill(t('decoValue', 'deepest ceiling {0}\u00a0m, from {1} to {2}\u00a0min'), fmtNum(s.deco.maxCeiling, 1), fmtNum(s.deco.start, 1), fmtNum(s.deco.end, 1))
                : t('noDeco', 'no deco')],
        ];
        this.el.summary.innerHTML = `<h2>${escHtml(t('summaryHeading', 'At this GF'))}</h2><dl>${
            rows.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>`;
        const differs = this.gf.gfLow !== device.gfLow || this.gf.gfHigh !== device.gfHigh;
        this.el.note.hidden = !differs;
        this.el.note.textContent = differs
            ? fill(t('gfDiffers', 'GF {0}/{1} differs from the GF {2}/{3} the dive computer used. Its dashed ceiling still shows its own GF.'),
                this.gf.gfLow, this.gf.gfHigh, device.gfLow, device.gfHigh)
            : '';
    }

    async _renderCharts(setup, deviceCeiling, dive) {
        if (this.destroyed) return;
        if (!this.charts) {
            const [{ DiveProfileChart }, { MValueChart }, { GFChart }] = await Promise.all([
                import('../charts/DiveProfileChart.js'),
                import('../charts/MValueChart.js'),
                import('../charts/GFChart.js'),
            ]);
            if (this.destroyed) return;
            if (this.charts) return this._renderCharts(setup, deviceCeiling, dive);
            this.charts = {
                profile: new DiveProfileChart(this.el.profile, {
                    diveSetup: setup,
                    options: {
                        ...this._profileOptions(deviceCeiling, dive),
                        showDecoStops: false, showGasSwitches: true,
                        violationToleranceM: CEILING_VIOLATION_TOLERANCE_M,
                        narrowLayout: true,
                    },
                }),
                mvalue: new MValueChart(this.el.mvalue, {
                    diveSetup: setup,
                    options: { compartments: [1], showMValueLines: true, showGFLines: true, showAmbientLine: true, showTrail: true, compartmentSelector: true, narrowLayout: true },
                }),
                gf: new GFChart(this.el.gfChart, {
                    diveSetup: setup,
                    options: { compartments: [1, 2, 3, 4, 5, 6], showTrail: true, compartmentSelector: true, narrowLayout: true },
                }),
            };
            this._chartsDive = dive;
            this.charts.mvalue.options.onTimeIndexChange = i => this.charts.gf.setTimeIndex(i);
            this.charts.gf.options.onTimeIndexChange = i => this.charts.mvalue.setTimeIndex(i);
            return;
        }
        this.charts.profile.update(setup, this._profileOptions(deviceCeiling, dive));
        // Keep the timeline position when only GF changed; reset for a different dive.
        const index = this._chartsDive === dive ? this.charts.mvalue.currentTimeIndex : 0;
        this._chartsDive = dive;
        this.charts.mvalue.update(setup);
        this.charts.gf.update(setup);
        this.charts.mvalue.setTimeIndex(index);
        this.charts.gf.setTimeIndex(index);
    }

    _profileOptions(deviceCeiling, dive) {
        return chartViewOptions(this.view, {
            referenceCeiling: deviceCeiling.length ? deviceCeiling : null,
            referenceCeilingLabel: this._deviceCeilingLabel(dive),
        });
    }

    _deviceCeilingLabel(dive) {
        const gf = deviceGf(dive);
        return fill(t('deviceCeilingLabel', 'Dive computer ceiling, GF {0}/{1} (m)'), gf.gfLow, gf.gfHigh);
    }
}
