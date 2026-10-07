/**
 * First steps of "New dive": pick the date, then optionally a dive computer dive
 * from the server or from the computer folder. Choosing hands over to the entry form.
 *
 * The folder handle is kept in IndexedDB (`decojs-logbook` / `handles` / `divelog`) so a later
 * visit only needs one permission click. Browsers without `showDirectoryPicker` use a file input.
 */

import { loadDiveFiles } from '../components/RecordedDiveAnalysis.js';
import { planSync, diveKey } from '../backend/sync.js';
import { entryFromRecording, entriesOnDate } from './entryModel.js';
import { recordingsOnDate } from './EntryForm.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const NBSP = ' ';
const DB_NAME = 'decojs-logbook';
const STORE = 'handles';
const KEY = 'divelog';

const tn = key => translate(`diveLog.logbook.new.${key}`, key);
const tl = key => translate(`diveLog.logbook.${key}`, key);
const tb = key => translate(`diveLog.backend.${key}`, key);

// ---- Folder handle in IndexedDB (verified in a browser) ----

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idb(mode, run) {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = run(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

export const loadFolderHandle = () => idb('readonly', s => s.get(KEY)).catch(() => null);
export const saveFolderHandle = handle => idb('readwrite', s => s.put(handle, KEY));

/** All `.dlf` files in a directory handle, looking two levels down. */
async function collectFiles(dir, depth = 2) {
    const files = [];
    for await (const handle of dir.values()) {
        if (handle.kind === 'file' && /\.dlf$/i.test(handle.name)) files.push(await handle.getFile());
        else if (handle.kind === 'directory' && depth > 1) files.push(...await collectFiles(handle, depth - 1));
    }
    return files;
}

const pad = n => String(n).padStart(2, '0');
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "12:01 · 38,6 m · 52 min" for a recording or a parsed dive. */
function describe(startLocal, depth, durationS) {
    const parts = [String(startLocal).slice(11, 16)];
    if (Number.isFinite(depth)) parts.push(`${fmtNum(depth, 1)}${NBSP}m`);
    if (Number.isFinite(durationS)) parts.push(`${fmtNum(durationS / 60, 0)}${NBSP}min`);
    return parts.join(' · ');
}

export class NewDive {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {Object} options.store - dive store
     * @param {(choice: {prefill: Object, recordingId: ?string}) => void} options.onChoose
     */
    constructor(container, { store, onChoose, ready = null }) {
        this.ready = ready;
        this.container = container;
        this.store = store;
        this.onChoose = onChoose;
        this.date = today();
        this.rows = [];
        this.entries = [];
        this.loading = true;
        this.busy = false;
        this.error = '';
        this.hint = '';
        this.folder = 'unsupported'; // unsupported | none | permission | ready
        this.handle = null;
        this.folderItems = [];
        this.destroyed = false;
        this.render();
        this._init();
    }

    destroy() {
        this.destroyed = true;
        this.container.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this.render();
    }

    async _init() {
        await Promise.resolve(this.ready).catch(() => {}); // entries for new recordings may still be created
        if (this.destroyed) return;
        try {
            [this.rows, this.entries] = await Promise.all([this.store.listDives(), this.store.listEntries()]);
        } catch (error) {
            this._fail(error);
        }
        if (this.destroyed) return;
        if (typeof window.showDirectoryPicker === 'function') {
            this.folder = 'none';
            this.handle = await loadFolderHandle();
            if (this.handle) {
                try {
                    const perm = await this.handle.queryPermission({ mode: 'read' });
                    if (perm === 'granted') await this._readFolder(true);
                    else this.folder = 'permission';
                } catch (error) {
                    console.error(error);
                    this.hint = tl('folderUnavailable');
                }
            }
        }
        if (this.destroyed) return;
        this.loading = false;
        this.render();
    }

    async _readFolder(soft = false) {
        this.hint = '';
        try {
            const files = await collectFiles(this.handle);
            this.folderItems = (await loadDiveFiles(files)).items;
            this.folder = 'ready';
        } catch (error) {
            console.error(error);
            if (soft) this.hint = tl('folderUnavailable'); // e.g. the computer is not plugged in
            else this.error = tn('folderError');
            this.folder = 'none';
        }
    }

    _fail(error) {
        console.error(error);
        this.error = error?.kind === 'unreachable' ? tb('unreachable') : tb('genericError');
    }

    // ---- Candidates for the chosen date ----

    _candidates() {
        const server = recordingsOnDate(this.rows, this.entries, this.date).map(row => ({
            label: describe(row.startLocal, row.summary?.maxDepth, row.summary?.duration),
            key: `s:${row.id}`, start: row.startLocal, row,
        }));
        const fresh = new Set(planSync(this.folderItems, this.rows).upload);
        const local = this.folderItems
            .filter(item => fresh.has(item) && item.dive.start.local.slice(0, 10) === this.date)
            .map(item => ({
                label: describe(item.dive.start.local, item.dive.maxDepth, item.dive.duration),
                key: `f:${diveKey(item.dive)}`, start: item.dive.start.local, item, fromFolder: true,
            }));
        return [...server, ...local].sort((a, b) => a.start.localeCompare(b.start));
    }

    /** "#31 · 12:01 · 38,6 m" for an existing entry. */
    _describeEntry(e) {
        const parts = [translate('diveLog.logbook.number', '#{0}').replace('{0}', e.log_number ?? '–')];
        if (e.entry_time) parts.push(String(e.entry_time).slice(0, 5));
        if (e.max_depth_m != null) parts.push(`${fmtNum(e.max_depth_m, 1)}${NBSP}m`);
        return parts.join(' · ');
    }

    // ---- Rendering ----

    render() {
        const list = this._candidates();
        let body;
        if (this.loading) body = `<p class="lb-muted">${escHtml(tb('loading'))}</p>`;
        else if (!list.length) body = `<p class="lb-muted">${escHtml(tn('noneFound'))}</p>`;
        else {
            body = `<ul class="lb-picks">${list.map((c, i) => `<li><button type="button" class="btn btn-secondary lb-pick" data-i="${i}"${this.busy ? ' disabled' : ''}>
                <strong>${escHtml(c.label)}</strong>${c.fromFolder ? `<span class="lb-muted"> · ${escHtml(tn('inFolder'))}</span>` : ''}</button></li>`).join('')}</ul>`;
        }
        const logged = this.loading ? [] : entriesOnDate(this.entries, this.date);
        const loggedHtml = logged.length ? `<h3>${escHtml(tl('alreadyLogged'))}</h3>
            <ul class="lb-logged">${logged.map(e => `<li><a href="${routeHref({ name: 'detail', id: e.id })}">${escHtml(this._describeEntry(e))}</a>
                · <a href="${routeHref({ name: 'edit', id: e.id })}">${escHtml(translate('diveLog.logbook.detail.edit', 'Edit'))}</a></li>`).join('')}</ul>` : '';
        let folderControl = '';
        if (!this.loading) {
            if (this.folder === 'permission') folderControl = `<button type="button" class="btn btn-secondary" id="nd-allow">${escHtml(tn('folderAllow'))}</button>`;
            if (this.folder === 'permission' || this.folder === 'none' || this.folder === 'ready') {
                folderControl += `<button type="button" class="btn btn-secondary" id="nd-folder">${escHtml(tn('folderUse'))}</button>`;
            } else if (this.folder === 'unsupported') {
                folderControl = `<label class="btn btn-secondary lb-file"><span>${escHtml(tn('folderChoose'))}</span>
                    <input type="file" id="nd-files" webkitdirectory multiple class="rda-visually-hidden"></label>`;
            }
        }
        this.container.innerHTML = `<section class="rda-card lb-newdive">
            <h2>${escHtml(translate('diveLog.logbook.form.newTitle', 'New dive'))}</h2>
            <label class="lb-field"><span>${escHtml(tn('date'))}</span>
                <input type="date" id="nd-date" value="${escHtml(this.date)}"></label>
            <h3>${escHtml(tn('fromComputer'))}</h3>
            ${body}
            ${loggedHtml}
            ${this.hint ? `<p class="lb-muted">${escHtml(this.hint)}</p>` : ''}
            <p class="lb-form-error" role="alert"${this.error ? '' : ' hidden'}>${escHtml(this.error)}</p>
            <div class="lb-actions">
                ${folderControl}
                <button type="button" class="btn btn-primary" id="nd-without"${this.busy ? ' disabled' : ''}>${escHtml(tn('without'))}</button>
                <a class="btn btn-secondary lb-cancel" href="${routeHref({ name: 'list' })}">${escHtml(translate('diveLog.logbook.form.cancel', 'Cancel'))}</a>
            </div>
        </section>`;
        this._wire(list);
    }

    _wire(list) {
        const c = this.container;
        c.querySelector('#nd-date').addEventListener('change', e => {
            if (!e.target.value) return;
            this.date = e.target.value;
            this.error = '';
            this.render();
        });
        c.querySelector('#nd-without').addEventListener('click', () => {
            this.onChoose({ prefill: { dive_date: this.date }, recordingId: null });
        });
        for (const b of c.querySelectorAll('.lb-pick')) b.addEventListener('click', () => this._choose(list[Number(b.dataset.i)]));
        c.querySelector('#nd-folder')?.addEventListener('click', () => this._pickFolder());
        c.querySelector('#nd-allow')?.addEventListener('click', () => this._allow());
        c.querySelector('#nd-files')?.addEventListener('change', e => this._fromFiles(e.target));
    }

    async _pickFolder() {
        try {
            this.handle = await window.showDirectoryPicker({ mode: 'read' });
        } catch (error) {
            if (error?.name !== 'AbortError') console.error(error);
            return;
        }
        await saveFolderHandle(this.handle).catch(error => console.error(error)); // remembering it is a convenience
        this.error = '';
        await this._readFolder();
        this.render();
    }

    async _allow() {
        try {
            const perm = await this.handle.requestPermission({ mode: 'read' });
            if (perm === 'granted') await this._readFolder();
            else if (perm === 'denied') this.error = tl('folderDenied');
        } catch (error) {
            console.error(error);
            this.error = tn('folderError');
        }
        this.render();
    }

    async _fromFiles(input) {
        const files = Array.from(input.files);
        input.value = '';
        this.error = '';
        try {
            this.folderItems = (await loadDiveFiles(files)).items;
        } catch (error) {
            console.error(error);
            this.error = tn('folderError');
        }
        this.render();
    }

    async _choose(candidate) {
        if (this.busy || !candidate) return;
        this.busy = true;
        this.error = '';
        this.render();
        try {
            let dive;
            let recordingId;
            if (candidate.fromFolder) {
                const { item } = candidate;
                const report = await this.store.saveDives([{ ...item, action: 'upload' }]);
                if (report.failed.length) throw new Error(report.failed[0].message);
                const key = diveKey(item.dive);
                const row = (await this.store.listDives()).find(r => `${r.deviceSerial}|${r.diveNumber}|${r.startLocal}` === key);
                if (!row) throw new Error('Saved dive not found');
                dive = item.dive;
                recordingId = row.id;
            } else {
                dive = await this.store.loadDive(candidate.row.id);
                recordingId = candidate.row.id;
            }
            if (this.destroyed) return;
            this.onChoose({ prefill: entryFromRecording(dive), recordingId });
        } catch (error) {
            if (this.destroyed) return;
            this.busy = false;
            this._fail(error);
            this.render();
        }
    }
}
