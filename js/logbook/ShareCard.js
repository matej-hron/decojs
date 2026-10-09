/**
 * "Public link" card on the owner's dive detail: a switch that turns the share link on
 * (visibility `link`, the database makes a new token) or off (the token is cleared at once),
 * and, while on, the link with Copy and the phone's share sheet.
 */

import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';
import { shareUrl } from './share.js';

const ts = (key, fallback) => translate(`diveLog.trail.share.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const COPIED_MS = 2500;

export class ShareCard {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {Object} options.store - with `setSharing(id, on, before)`
     * @param {Object} options.entry - the own log_entries row
     * @param {(entry: Object) => void} [options.onChange] - the saved entry after a switch
     * @param {string} [options.pageHref] - base for the link (default: location.href)
     */
    constructor(container, { store, entry, onChange, pageHref = globalThis.location?.href }) {
        this.container = container;
        this.store = store;
        this.entry = entry;
        this.onChange = onChange;
        this.pageHref = pageHref;
        this.before = entry.visibility === 'link' ? null : entry.visibility; // restored when turned off
        this.busy = false;
        this.error = '';
        this.note = ''; // "Copied" / "Link turned off"
        this.destroyed = false;
        this._timer = null;
        this.render();
    }

    destroy() {
        this.destroyed = true;
        clearTimeout(this._timer);
        this.container.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this.render();
    }

    get on() {
        return this.entry.visibility === 'link' && Boolean(this.entry.share_token);
    }

    get url() {
        return this.on ? shareUrl(this.entry.share_token, this.pageHref) : null;
    }

    render() {
        if (this.destroyed) return;
        const on = this.on;
        const canShare = typeof globalThis.navigator?.share === 'function';
        this.container.innerHTML = `<section class="lb-share${on ? ' lb-share--on' : ''}" aria-labelledby="lb-share-h">
            <div class="lb-share-head">
                <h3 id="lb-share-h">${escHtml(ts('title', 'Public link'))}</h3>
                <button type="button" class="lb-switch" role="switch" aria-checked="${on}" aria-labelledby="lb-share-h"${this.busy ? ' disabled' : ''}>
                    <span class="lb-switch-track" aria-hidden="true"><span class="lb-switch-thumb"></span></span></button>
            </div>
            <p class="lb-share-help">${escHtml(on
                ? ts('helpOn', 'Anyone with this link can see the dive, its photos, buddies and your name — no account needed. Never your notes.')
                : ts('helpOff', 'Turn on to get a link anyone can open, no account needed. Your notes are never shown.'))}</p>
            ${on ? `<div class="lb-share-link">
                <input type="text" class="lb-share-url" readonly value="${escHtml(this.url)}" aria-label="${escHtml(ts('linkLabel', 'Link to this dive'))}">
                <div class="lb-share-buttons">
                    <button type="button" class="btn btn-primary lb-share-copy">${escHtml(ts('copy', 'Copy link'))}</button>
                    ${canShare ? `<button type="button" class="btn btn-secondary lb-share-native">${escHtml(ts('share', 'Share…'))}</button>` : ''}
                </div>
                <p class="lb-share-off-note">${escHtml(ts('offNote', 'Turning it off stops the link at once. Turning it on again makes a new link.'))}</p>
            </div>` : ''}
            <p class="lb-share-status" role="status">${escHtml(this.note)}</p>
            ${this.error ? `<p class="lb-form-error" role="alert">${escHtml(this.error)}</p>` : ''}
        </section>`;
        const c = this.container;
        c.querySelector('.lb-switch').addEventListener('click', () => this.toggle());
        c.querySelector('.lb-share-copy')?.addEventListener('click', () => this.copy());
        c.querySelector('.lb-share-native')?.addEventListener('click', () => this.share());
        c.querySelector('.lb-share-url')?.addEventListener('focus', e => e.target.select());
    }

    async toggle() {
        if (this.busy) return;
        const turnOn = !this.on;
        if (turnOn) this.before = this.entry.visibility;
        this.busy = true;
        this.error = '';
        this.note = '';
        this.render();
        try {
            const saved = await this.store.setSharing(this.entry.id, turnOn, this.before);
            if (this.destroyed) return;
            this.entry = { ...this.entry, ...saved };
            if (turnOn && !this.on) throw new Error('No share token came back');
            this.note = turnOn ? '' : ts('turnedOff', 'Link turned off. The old link no longer works.');
            this.onChange?.(this.entry);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.error = error?.kind === 'unreachable' ? tb('unreachable', 'Can\'t reach your dive log.') : tb('genericError', 'Something went wrong. Please try again.');
        }
        this.busy = false;
        this.render();
        this.container.querySelector('.lb-switch')?.focus();
    }

    async copy() {
        const url = this.url;
        if (!url) return;
        let ok = false;
        try {
            await globalThis.navigator.clipboard.writeText(url);
            ok = true;
        } catch {
            const input = this.container.querySelector('.lb-share-url');
            input?.focus();
            input?.select();
            try { ok = document.execCommand?.('copy') === true; } catch { ok = false; }
        }
        this._flash(ok ? ts('copied', 'Link copied') : ts('copyFailed', 'Select the link and copy it'));
    }

    async share() {
        const url = this.url;
        if (!url) return;
        try {
            await globalThis.navigator.share({ title: ts('shareTitle', 'DecoTrail dive'), url });
        } catch (error) {
            if (error?.name !== 'AbortError') console.warn('Share sheet failed', error);
        }
    }

    _flash(text) {
        this.note = text;
        const el = this.container.querySelector('.lb-share-status');
        if (el) el.textContent = text;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this.note = '';
            const s = this.container.querySelector('.lb-share-status');
            if (s && !this.destroyed) s.textContent = '';
        }, COPIED_MS);
    }
}
