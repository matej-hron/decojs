/**
 * The public share page (`lab/dive.html#s=<token>`): one dive, read-only, for anyone with the link.
 * The read-only dive detail (author row without a link, no back link, never notes) and the embedded
 * analysis below it. Unknown or revoked links get a plain "this link does not work" card.
 */

import { EntryDetail } from './EntryDetail.js';
import { RecordedDiveAnalysis, translateStatic } from '../components/RecordedDiveAnalysis.js';
import { sharedDiveAdapter } from '../backend/shareStore.js';
import { gasesFromEntry } from './gasModel.js';
import { displayName } from './community.js';
import { avatarHtml } from './avatars.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const ts = (key, fallback) => translate(`diveLog.trail.share.${key}`, fallback);

/** Stable per author, never per dive: the server's one-way author key, else the display name. */
export function authorKey(author, name) {
    return author?.author_key || author?.display_name || name || '';
}

export class SharedDivePage {
    /**
     * @param {HTMLElement} root
     * @param {Object} options
     * @param {Object|null} options.store - from `createShareStore` (null: bad link or no backend)
     */
    constructor(root, { store }) {
        this.root = root;
        this.store = store;
        this.detail = null;
        this.analysis = null;
        this.state = 'loading'; // loading | ready | missing | error
        this.destroyed = false;
        this._onLanguage = () => this.relabel();
        document.addEventListener('languagechange', this._onLanguage);
        this._render();
        this.load();
    }

    destroy() {
        this.destroyed = true;
        document.removeEventListener('languagechange', this._onLanguage);
        this._unmount();
        this.root.innerHTML = '';
    }

    _unmount() {
        this.detail?.destroy();
        this.detail = null;
        this.analysis?.destroy();
        this.analysis = null;
    }

    async load() {
        if (!this.store) {
            this.state = 'missing';
            this._render();
            return;
        }
        this.state = 'loading';
        this._render();
        let parts;
        try {
            parts = await this.store.loadSharedDive();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.state = error?.kind === 'unavailable' ? 'missing' : 'error';
            this._render();
            return;
        }
        if (this.destroyed) return;
        if (!parts) {
            this.state = 'missing';
            this._render();
            return;
        }
        this.parts = parts;
        this.avatarUrl = null;
        this.state = 'ready';
        this._render();
        if (parts.author.avatar_path) {
            try {
                this.avatarUrl = await this.store.avatarUrl(parts.author.avatar_path);
            } catch (error) {
                console.warn('Avatar unavailable', error); // the preset stands in
            }
            if (this.avatarUrl && !this.destroyed && this.detail) this.detail.relabel();
        }
    }

    relabel() {
        if (this.destroyed) return;
        if (this.state !== 'ready') {
            this._render();
            return;
        }
        this.detail?.relabel();
        const head = this.root.querySelector('.tr-share-analysis-h');
        if (head) head.textContent = ts('analysisTitle', 'Profile and analysis');
        const intro = this.root.querySelector('.tr-share-intro');
        if (intro) intro.textContent = ts('pageIntro', 'A dive shared from DecoTrail.');
        if (this.analysis) translateStatic(this.root.querySelector('.lb-analysis'));
    }

    /** Author row: display name (else "Diver") and avatar; no link, the visitor has no member pages. */
    _author() {
        const page = this;
        const a = this.parts.author;
        return {
            get name() { return displayName(a, key => translate(`diveLog.${key}`, 'Diver')); },
            href: null,
            get avatarHtml() {
                return `<span class="tr-author-av" aria-hidden="true">${avatarHtml({ preset: a.avatar_preset, url: page.avatarUrl, name: this.name, id: authorKey(a, this.name), size: 40 })}</span>`;
            },
        };
    }

    _render() {
        if (this.destroyed) return;
        this._unmount();
        if (this.state === 'loading') {
            this.root.innerHTML = `<p class="rda-account-msg">${escHtml(translate('diveLog.backend.loading', 'Loading…'))}</p>`;
            return;
        }
        if (this.state === 'missing' || this.state === 'error') {
            const missing = this.state === 'missing';
            this.root.innerHTML = `<section class="rda-card tr-share-missing">
                <h1>${escHtml(missing ? ts('missingTitle', 'This link does not work') : ts('errorTitle', 'The dive could not be loaded'))}</h1>
                <p>${escHtml(missing
                    ? ts('missingText', 'The diver may have turned the link off, or it was copied incompletely. Ask them for a new link.')
                    : ts('errorText', 'Check your connection and try again.'))}</p>
                ${missing ? '' : `<button type="button" class="btn btn-primary tr-share-retry">${escHtml(ts('retry', 'Try again'))}</button>`}
                <p><a href="../index.html">${escHtml(ts('toDecoTheory', 'Learn how decompression works on DecoTheory'))}</a></p>
            </section>`;
            this.root.querySelector('.tr-share-retry')?.addEventListener('click', () => this.load());
            return;
        }
        const { entry } = this.parts;
        this.root.innerHTML = `<p class="tr-share-intro">${escHtml(ts('pageIntro', 'A dive shared from DecoTrail.'))}</p>
            <div class="lb-form-host tr-share-detail"></div>
            ${entry.recording_id ? `<section class="tr-share-analysis" id="analysis" aria-labelledby="tr-share-analysis-h">
                <h2 class="tr-share-analysis-h" id="tr-share-analysis-h">${escHtml(ts('analysisTitle', 'Profile and analysis'))}</h2>
                <a class="tr-learn" href="../gradient-factors.html">${escHtml(translate('diveLog.trail.learnWhy', 'Learn why on DecoTheory ↗'))}</a>
                <div class="rda-root lb-analysis"></div>
            </section>` : ''}`;
        const adapter = sharedDiveAdapter(this.store, this.parts);
        this.detail = new EntryDetail(this.root.querySelector('.tr-share-detail'), {
            store: adapter, entry, readOnly: true, author: this._author(), backHref: false, analysisHref: false,
        });
        if (entry.recording_id) {
            this.analysis = new RecordedDiveAnalysis(this.root.querySelector('.lb-analysis'), {
                store: adapter, embedded: true, focusRecordingId: entry.recording_id, entryGases: gasesFromEntry(entry),
            });
        }
    }
}
