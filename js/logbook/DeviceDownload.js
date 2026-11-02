/**
 * "Download from dive computer" dialog: connects to a dive computer over Web Bluetooth,
 * downloads new dives with libdivecomputer (WebAssembly), lets the diver pick which to keep,
 * then saves them like an uploaded DIVELOG (recordings + logbook entries).
 *
 * Lives on document.body (like the delete-data dialog) so a list re-render cannot remove it.
 */

import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';
import { fmtNum, localeTag, currentLang } from '../format.js';
import { sha256Hex } from '../backend/sync.js';
import { bluetoothSupported, requestDevice, BleSerial } from '../import/bleSerial.js';
import { downloadDives, parseDive } from '../import/libdc.js';
import { mapMaresDive } from '../import/maresDive.js';
import { DIVE_COMPUTERS, planDeviceImport, loadFingerprint, saveFingerprint, explainDownloadError } from './dcImport.js';

const NB = ' ';
const td = (key, fallback) => translate(`diveLog.logbook.dc.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

function storage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

/** A small depth profile (depth drawn downward) for a picker row. */
export function profileSvg(dive, width = 96, height = 36) {
    const samples = dive.samples ?? [];
    const end = samples.at(-1)?.t || dive.duration || 1;
    const max = Math.max(dive.maxDepth || 0, ...samples.map(s => s.depth)) || 1;
    const pts = [[0, 0], ...samples.map(s => [s.t / end, s.depth / max])];
    const r1 = n => Math.round(n * 10) / 10; // SVG coordinates, not display numbers
    const xy = ([x, y]) => `${r1(x * width)},${r1(1 + y * (height - 2))}`;
    const line = pts.map(xy).join(' ');
    return `<svg class="lb-dc-profile" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">
        <polygon class="lb-dc-profile-area" points="0,0 ${line} ${width},0"/>
        <polyline class="lb-dc-profile-line" points="${line}"/></svg>`;
}

export class DeviceDownloadPanel {
    /**
     * @param {Object} deps
     * @param {Object} deps.store - dive store (listDives, listEntries, saveDives, ensureEntries, fillComputerFields)
     * @param {(report: {saved: number, failed: Array}) => void} [deps.onImported] - after dives were saved
     * @param {() => void} [deps.onClosed]
     */
    constructor({ store, onImported = () => {}, onClosed = () => {} }) {
        this.store = store;
        this.onImported = onImported;
        this.onClosed = onClosed;
        this.computer = DIVE_COMPUTERS[0];
        this.phase = bluetoothSupported() ? 'intro' : 'unsupported';
        this.fraction = 0;
        this.rows = [];
        this.serial = null;
        this.newest = null;
        this.error = null;
        this.everything = false;
        this.cancelled = false;
        this.saved = null;
        this.link = null;
        this.root = document.createElement('div');
        this.root.className = 'lb-dc';
        this.root.addEventListener('click', e => { if (e.target === this.root) this.close(); });
        this._onKey = e => { if (e.key === 'Escape') this.close(); };
        this._onLanguage = () => this._render();
        document.addEventListener('keydown', this._onKey);
        document.addEventListener('languagechange', this._onLanguage);
        document.body.appendChild(this.root);
        this._render();
        this.root.querySelector('.lb-dc-card button')?.focus();
    }

    get busy() {
        return ['connecting', 'downloading', 'saving'].includes(this.phase);
    }

    close() {
        if (this.phase === 'saving') return; // half-saved dives would be confusing; it takes seconds
        if (this.busy) {
            this.cancelled = true;
            return;
        }
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('languagechange', this._onLanguage);
        this.link?.close();
        this.root.remove();
        this.onClosed();
    }

    // ---- Steps ----

    async _connect() {
        this.error = null;
        this.cancelled = false;
        let device;
        try {
            device = await requestDevice({ namePrefixes: this.computer.namePrefixes });
        } catch (error) {
            return this._fail(error);
        }
        this.phase = 'connecting';
        this._render();
        try {
            this.link = await new BleSerial(device).open();
            this.phase = 'downloading';
            this.fraction = 0;
            this._render();
            const out = await downloadDives(this.link, {
                model: this.computer.model,
                fingerprintFor: serial => (this.everything ? null : loadFingerprint(storage(), this.computer.id, serial)),
                onProgress: f => this._progress(f),
                cancelled: () => this.cancelled,
            });
            this.link.close();
            this.link = null;
            this.serial = out.serial;
            this.newest = out.dives[0]?.fingerprint ?? null;
            const items = [];
            for (const d of out.dives) {
                const record = await parseDive(d.data, { model: this.computer.model });
                const dive = mapMaresDive(record, { serial: out.serial, model: out.model ?? this.computer.model, fingerprint: d.fingerprint, data: d.data });
                if (record.status !== 0 && dive.samples.length === 0) continue; // unreadable: nothing to show
                items.push({ dive, bytes: d.data, sha256: await sha256Hex(d.data) });
            }
            const [rows, entries] = await Promise.all([this.store.listDives(), this.store.listEntries()]);
            this.rows = planDeviceImport(items, rows, entries);
            this.phase = 'pick';
            this._render();
        } catch (error) {
            this._fail(error);
        } finally {
            this.link?.close();
            this.link = null;
        }
    }

    _progress(fraction) {
        this.fraction = fraction;
        const bar = this.root.querySelector('.lb-dc-bar');
        if (bar) {
            bar.value = Math.round(fraction * 100);
            this.root.querySelector('.lb-dc-pct').textContent = `${fmtNum(fraction * 100, 0)}${NB}%`;
        }
    }

    async _save() {
        const picked = this.rows.filter(r => r.selected && r.status !== 'stored');
        if (!picked.length) return;
        this.phase = 'saving';
        this.fraction = 0;
        this._render();
        try {
            const report = await this.store.saveDives(picked.map(r => ({ ...r.item, action: 'upload' })), (done, total) => this._progress(done / total));
            try {
                await this.store.ensureEntries();
                await this.store.fillComputerFields?.();
            } catch (error) {
                console.error(error); // the recordings are saved; entries are created again on the next visit
            }
            if (!report.failed.length) saveFingerprint(storage(), this.computer.id, this.serial, this.newest);
            this.saved = report;
            this.phase = 'done';
            this.onImported(report);
        } catch (error) {
            this._fail(error);
            return;
        }
        this._render();
    }

    _fail(error) {
        console.error(error);
        this.link?.close();
        this.link = null;
        const why = explainDownloadError(error);
        if (!why) {
            this.phase = 'intro';
        } else {
            this.error = td(why.key, why.fallback);
            this.phase = 'error';
        }
        this._render();
    }

    // ---- Rendering ----

    _when(local) {
        const [date, time] = local.split('T');
        const d = new Date(`${date}T00:00:00Z`);
        const day = new Intl.DateTimeFormat(localeTag(currentLang()), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
        return `${day}, ${time.slice(0, 5)}`;
    }

    _row(r, i) {
        const dive = r.item.dive;
        const facts = `${fmtNum(dive.maxDepth, 1)}${NB}m · ${fmtNum(dive.duration / 60, 0)}${NB}min`;
        let note = '';
        if (r.status === 'logged') {
            const n = r.match.log_number;
            const at = r.match.entry_time ? String(r.match.entry_time).slice(0, 5) : null;
            const text = n != null && at
                ? fill(td('alreadyLogged', 'Your logbook already has dive #{0} at {1}'), n, at)
                : td('alreadyLoggedDay', 'Your logbook already has a dive on this day');
            note = `<span class="lb-dc-note">${escHtml(text)}</span>`;
        }
        return `<li><label class="lb-dc-row${r.selected ? ' lb-dc-on' : ''}">
            <input type="checkbox" data-i="${i}"${r.selected ? ' checked' : ''}>
            ${profileSvg(dive)}
            <span class="lb-dc-what"><strong>${escHtml(this._when(dive.start.local))}</strong>
                <span>${escHtml(facts)}</span>${note}</span></label></li>`;
    }

    _body() {
        const title = `<h2 id="lb-dc-title">${escHtml(td('title', 'Download from dive computer'))}</h2>`;
        const close = label => `<button type="button" class="btn btn-secondary" data-act="close">${escHtml(label)}</button>`;
        const steps = `<ol class="lb-dc-steps">
            <li>${escHtml(td('step1', 'Turn on Bluetooth on this phone or computer.'))}</li>
            <li>${escHtml(td('step2', 'On the Quad 2, press and hold the button with the Bluetooth symbol until the Bluetooth screen appears.'))}</li>
            <li>${escHtml(td('step3', 'Tap Connect and choose Quad2 in the list.'))}</li></ol>`;
        switch (this.phase) {
        case 'unsupported':
            return `${title}<p>${escHtml(td('errUnsupported', explainDownloadError({ kind: 'unsupported' }).fallback))}</p>
                <div class="lb-actions">${close(td('close', 'Close'))}</div>`;
        case 'intro':
            return `${title}<p class="lb-dc-lead">${escHtml(td('supported', 'Works with the Mares Quad 2. New dives are downloaded; the ones you already have are skipped.'))}</p>
                ${steps}
                <label class="lb-dc-all"><input type="checkbox" id="lb-dc-everything"${this.everything ? ' checked' : ''}>
                    <span>${escHtml(td('everything', 'Download every dive again, not only new ones'))}</span></label>
                <div class="lb-actions"><button type="button" class="btn btn-primary" data-act="connect">${escHtml(td('connect', 'Connect'))}</button>
                    ${close(td('cancel', 'Cancel'))}</div>`;
        case 'connecting':
            return `${title}<p role="status">${escHtml(td('connecting', 'Connecting to the Quad 2…'))}</p>
                <progress class="lb-dc-bar"></progress>
                <div class="lb-actions">${close(td('stop', 'Stop'))}</div>`;
        case 'downloading':
        case 'saving': {
            const label = this.phase === 'saving' ? td('saving', 'Saving to your logbook…') : td('downloading', 'Downloading dives. Keep the Quad 2 next to the phone.');
            return `${title}<p role="status">${escHtml(label)} <span class="lb-dc-pct">${fmtNum(this.fraction * 100, 0)}${NB}%</span></p>
                <progress class="lb-dc-bar" max="100" value="${Math.round(this.fraction * 100)}"></progress>
                ${this.phase === 'downloading' ? `<div class="lb-actions">${close(td('stop', 'Stop'))}</div>` : ''}`;
        }
        case 'pick': {
            const visible = this.rows.map((r, i) => [r, i]).filter(([r]) => r.status !== 'stored');
            const storedCount = this.rows.length - visible.length;
            const count = this.rows.filter(r => r.selected).length;
            if (!visible.length) {
                return `${title}<p>${escHtml(td('nothingNew', 'No new dives on the Quad 2 since the last download.'))}</p>
                    ${storedCount ? `<p class="lb-muted">${escHtml(fill(td('storedCount', 'Already in DecoTrail: {0}'), storedCount))}</p>` : ''}
                    <div class="lb-actions"><button type="button" class="btn btn-secondary" data-act="again">${escHtml(td('everythingBtn', 'Download every dive again'))}</button>
                        ${close(td('close', 'Close'))}</div>`;
            }
            return `${title}<p class="lb-dc-lead">${escHtml(fill(td('found', 'Choose the dives to save ({0} found).'), visible.length))}</p>
                <ul class="lb-dc-list">${visible.map(([r, i]) => this._row(r, i)).join('')}</ul>
                ${storedCount ? `<p class="lb-muted">${escHtml(fill(td('storedCount', 'Already in DecoTrail: {0}'), storedCount))}</p>` : ''}
                <div class="lb-actions"><button type="button" class="btn btn-primary" data-act="save"${count ? '' : ' disabled'}>${escHtml(fill(td('save', 'Save selected ({0})'), count))}</button>
                    ${close(td('cancel', 'Cancel'))}</div>`;
        }
        case 'done': {
            const r = this.saved;
            const lines = [fill(td('savedCount', 'Dives saved to your logbook: {0}'), r.saved)];
            if (r.failed.length) lines.push(fill(td('failedCount', '{0} could not be saved: {1}'), r.failed.length, r.failed.map(f => f.message).join('; ')));
            return `${title}${lines.map(l => `<p role="status">${escHtml(l)}</p>`).join('')}
                <div class="lb-actions">${close(td('done', 'Done'))}</div>`;
        }
        case 'error':
        default:
            return `${title}<p class="lb-form-error" role="alert">${escHtml(this.error)}</p>
                ${steps}
                <div class="lb-actions"><button type="button" class="btn btn-primary" data-act="connect">${escHtml(td('retry', 'Try again'))}</button>
                    ${close(td('close', 'Close'))}</div>`;
        }
    }

    _render() {
        this.root.innerHTML = `<div class="lb-dc-card" role="dialog" aria-modal="true" aria-labelledby="lb-dc-title">${this._body()}</div>`;
        const on = (act, fn) => this.root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
        on('connect', () => this._connect());
        on('close', () => this.close());
        on('save', () => this._save());
        on('again', () => {
            this.everything = true;
            this.phase = 'intro';
            this._render();
        });
        this.root.querySelector('#lb-dc-everything')?.addEventListener('change', e => { this.everything = e.target.checked; });
        for (const box of this.root.querySelectorAll('.lb-dc-list input[type="checkbox"]')) {
            box.addEventListener('change', () => {
                this.rows[Number(box.dataset.i)].selected = box.checked;
                this._render();
                this.root.querySelector(`.lb-dc-list input[data-i="${box.dataset.i}"]`)?.focus();
            });
        }
    }
}
