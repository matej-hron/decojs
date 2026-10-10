/**
 * "Delete all my data" dialog of the logbook. It lives on document.body, not inside the logbook view, so it
 * survives the sign-out that follows a successful deletion (that sign-out clears the logbook view).
 * Deleting the login itself needs a server-side key, so the final screen points to the contact email.
 */

import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const tw = (key, fallback) => translate(`diveLog.logbook.wipe.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

export const CONFIRM_WORD = 'DELETE';
export const CONTACT_EMAIL = 'matej.hron@gmail.com';

/** True when the typed text is the confirmation word (surrounding spaces and letter case do not matter). */
export function isConfirmed(text) {
    return String(text ?? '').trim().toUpperCase() === CONFIRM_WORD;
}

/** One line per kind of data that was deleted, skipping kinds with nothing in them. */
export function summaryLines(report) {
    const lines = [];
    const add = (n, key, fallback) => { if (n) lines.push(fill(tw(key, fallback), n)); };
    add(report.entries, 'sumEntries', 'Logbook entries: {0}');
    add(report.recordings, 'sumRecordings', 'Dive computer recordings: {0}');
    add(report.photos, 'sumPhotos', 'Photos: {0}');
    add(report.sites, 'sumSites', 'Sites: {0}');
    add(report.documents, 'sumDocuments', 'Qualifications and medical checks: {0}');
    return lines;
}

export class DeleteDataPanel {
    /**
     * @param {{store: Object, onExport: () => Promise<void>|void, onClosed?: () => void}} deps
     */
    constructor({ store, onExport, onClosed = () => {} }) {
        this.store = store;
        this.onExport = onExport;
        this.onClosed = onClosed;
        this.phase = 'confirm'; // confirm | running | done
        this.typed = '';
        this.step = null;
        this.report = null;
        this.error = null;
        this.signedOut = false;
        this.root = document.createElement('div');
        this.root.className = 'lb-wipe';
        this._onKey = e => { if (e.key === 'Escape' && this.phase !== 'running') this.close(); };
        document.addEventListener('keydown', this._onKey);
        document.body.appendChild(this.root);
        this._render();
        this.root.querySelector('#lb-wipe-type')?.focus();
    }

    close() {
        if (this.phase === 'running') return;
        document.removeEventListener('keydown', this._onKey);
        this.root.remove();
        this.onClosed();
    }

    _body() {
        if (this.phase === 'confirm') {
            return `<h2 id="lb-wipe-title">${escHtml(tw('title', 'Delete all my data'))}</h2>
                <p>${escHtml(tw('what', 'This permanently deletes every logbook entry, dive computer recording, photo and site, and your qualifications and medical checks with their scans. It cannot be undone.'))}</p>
                <p>${escHtml(tw('exportFirst', 'Export your logbook first if you want to keep a copy.'))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-secondary" id="lb-wipe-export">${escHtml(tw('export', 'Export first'))}</button></div>
                <label class="lb-field"><span>${escHtml(fill(tw('typeLabel', 'Type {0} to confirm'), CONFIRM_WORD))}</span>
                    <input type="text" id="lb-wipe-type" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${escHtml(this.typed)}"></label>
                ${this.error ? `<p class="lb-form-error" role="alert">${escHtml(this.error)}</p>` : ''}
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-wipe-go"${isConfirmed(this.typed) ? '' : ' disabled'}>${escHtml(tw('go', 'Delete everything'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-wipe-cancel">${escHtml(tw('cancel', 'Cancel'))}</button></div>`;
        }
        if (this.phase === 'running') {
            const names = { photos: 'stepPhotos', entries: 'stepEntries', sites: 'stepSites', recordings: 'stepRecordings', documents: 'stepDocuments' };
            const fallbacks = { photos: 'Deleting photos…', entries: 'Deleting logbook entries…', sites: 'Deleting sites…', recordings: 'Deleting recordings…', documents: 'Deleting qualifications and medical checks…' };
            return `<h2 id="lb-wipe-title">${escHtml(tw('title', 'Delete all my data'))}</h2>
                <p role="status">${escHtml(tw(names[this.step] ?? 'stepPhotos', fallbacks[this.step] ?? fallbacks.photos))}</p>`;
        }
        const failed = this.report?.failed ?? [];
        const lines = this.report ? summaryLines(this.report) : [];
        const head = failed.length ? tw('doneFailed', 'Some data could not be deleted.') : tw('done', 'Your data has been deleted.');
        return `<h2 id="lb-wipe-title">${escHtml(head)}</h2>
            ${lines.length ? `<ul class="lb-wipe-sum">${lines.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>` : `<p>${escHtml(tw('sumNothing', 'There was nothing to delete.'))}</p>`}
            ${failed.length ? `<p class="lb-form-error" role="alert">${escHtml(fill(tw('failed', 'Failed: {0}'), failed.map(f => `${f.step} (${f.message})`).join('; ')))}</p>
                <p>${escHtml(tw('retryHint', 'You are still logged in. Try again, or write to the address below.'))}</p>`
                : `<p>${escHtml(this.signedOut ? tw('signedOut', 'You have been logged out.') : tw('signOutFailed', 'Could not log you out; use Log out in the menu.'))}</p>`}
            <p>${escHtml(tw('removeLogin', 'To also remove your login, email'))} <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
            <div class="lb-actions">${failed.length ? `<button type="button" class="btn btn-danger" id="lb-wipe-retry">${escHtml(tw('retry', 'Try again'))}</button>` : ''}
            <button type="button" class="btn btn-secondary" id="lb-wipe-close">${escHtml(tw('close', 'Close'))}</button></div>`;
    }

    _render() {
        this.root.innerHTML = `<div class="lb-wipe-card" role="alertdialog" aria-modal="true" aria-labelledby="lb-wipe-title">${this._body()}</div>`;
        const q = id => this.root.querySelector(id);
        const input = q('#lb-wipe-type');
        input?.addEventListener('input', () => {
            this.typed = input.value;
            q('#lb-wipe-go').disabled = !isConfirmed(this.typed);
        });
        input?.addEventListener('keydown', e => { if (e.key === 'Enter' && isConfirmed(this.typed)) this._run(); });
        q('#lb-wipe-go')?.addEventListener('click', () => this._run());
        q('#lb-wipe-cancel')?.addEventListener('click', () => this.close());
        q('#lb-wipe-close')?.addEventListener('click', () => this.close());
        q('#lb-wipe-retry')?.addEventListener('click', () => this._run());
        q('#lb-wipe-export')?.addEventListener('click', async e => {
            e.target.disabled = true;
            try { await this.onExport(); } finally { e.target.disabled = false; }
        });
    }

    async _run() {
        if (this.phase === 'running' || !isConfirmed(this.typed)) return;
        this.phase = 'running';
        this.error = null;
        this._render();
        try {
            this.report = await this.store.deleteAllMyData({ onProgress: step => { this.step = step; this._render(); } });
        } catch (error) {
            this.phase = 'confirm';
            this.error = error?.message ?? String(error);
            this._render();
            return;
        }
        if (!this.report.failed.length) {
            try { await this.store.signOut(); this.signedOut = true; } catch { this.signedOut = false; }
        }
        this.phase = 'done';
        this._render();
        this.root.querySelector('#lb-wipe-close')?.focus();
    }
}
