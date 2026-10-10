/**
 * Comments under a dive: the list (oldest first), the composer, editing and deleting with in-page confirmation.
 * The author edits and deletes their own comments; the dive owner deletes any. While the owner has comments off,
 * nothing is listed and nobody can write.
 */

import { normalizeComment, relativeTime, COMMENT_MAX, COMMENT_WARN } from './social.js';
import { ts } from './SocialBar.js';
import { displayName } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);

export class CommentsSection {
    /**
     * @param {HTMLElement} host
     * @param {Object} o
     * @param {Object} o.store - with listComments, addComment, editComment, deleteComment, avatarUrls
     * @param {{id: string, owner: string, comments_enabled?: boolean}} o.entry
     * @param {string} o.userId
     * @param {(count: number) => void} [o.onCount] - the number of comments changed
     */
    constructor(host, { store, entry, userId, onCount = null }) {
        this.host = host;
        this.store = store;
        this.entry = entry;
        this.userId = userId;
        this.onCount = onCount;
        this.enabled = entry.comments_enabled !== false;
        this.rows = null; // null while loading
        this.failed = false;
        this.avatars = new Map();
        this.draft = '';
        this.sending = false;
        this.sendError = '';
        this.editing = null; // { id, draft, saving, error }
        this.confirming = null; // comment id
        this.deleting = false;
        this.destroyed = false;
        this._onClick = e => this._click(e);
        this._onInput = e => this._input(e);
        this._onSubmit = e => { e.preventDefault(); this._submit(e.target); };
        this._onKey = e => this._key(e);
        this._onImg = e => avatarImgFallback(e);
        host.addEventListener('click', this._onClick);
        host.addEventListener('input', this._onInput);
        host.addEventListener('submit', this._onSubmit);
        host.addEventListener('keydown', this._onKey);
        host.addEventListener('error', this._onImg, true);
        this._render();
        if (this.enabled) this._load();
    }

    destroy() {
        this.destroyed = true;
        this.host.removeEventListener('click', this._onClick);
        this.host.removeEventListener('input', this._onInput);
        this.host.removeEventListener('submit', this._onSubmit);
        this.host.removeEventListener('keydown', this._onKey);
        this.host.removeEventListener('error', this._onImg, true);
        this.host.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this._render();
    }

    /** The owner turned comments on or off. */
    setEnabled(on) {
        this.enabled = Boolean(on);
        this.editing = null;
        this.confirming = null;
        if (this.enabled) {
            this.rows = null;
            this._load();
        }
        this._render();
    }

    async _load() {
        this.failed = false;
        try {
            const rows = await this.store.listComments(this.entry.id);
            if (this.destroyed) return;
            this.rows = rows;
            this._render();
            const paths = rows.map(r => r.avatar_path).filter(p => p && !this.avatars.has(p));
            if (paths.length && this.store.avatarUrls) {
                const urls = await this.store.avatarUrls(paths).catch(() => new Map());
                if (this.destroyed) return;
                for (const [k, v] of urls) this.avatars.set(k, v);
                this._render();
            }
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.failed = true;
            this._render();
        }
    }

    _isOwner() {
        return this.entry.owner === this.userId;
    }

    _errorText(error) {
        if (error?.kind === 'rate') return ts('rate', 'Too many comments in a short time. Wait a minute and try again.');
        return ts('sendFailed', 'Couldn’t save the comment. Try again.');
    }

    // ---- Events ----

    _input(e) {
        if (e.target.id === 'tr-comment-new') {
            this.draft = e.target.value;
            this.sendError = '';
            this._renderComposerState();
        } else if (e.target.classList.contains('tr-comment-edit') && this.editing) {
            this.editing.draft = e.target.value;
            this.editing.error = '';
            this._renderEditState();
        }
    }

    _key(e) {
        // Ctrl/Cmd+Enter sends, like most chat boxes; Enter alone is a new line.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') {
            e.preventDefault();
            e.target.form?.requestSubmit();
        }
        if (e.key === 'Escape' && (this.editing || this.confirming)) {
            const id = this.editing?.id ?? this.confirming;
            this.editing = null;
            this.confirming = null;
            this._render();
            this.host.querySelector(`[data-comment="${CSS.escape(id)}"] .tr-comment-act`)?.focus();
        }
    }

    _click(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        switch (btn.dataset.act) {
            case 'edit': {
                const row = this.rows?.find(r => r.id === id);
                if (!row) return;
                this.editing = { id, draft: row.body, saving: false, error: '' };
                this.confirming = null;
                this._render();
                const ta = this.host.querySelector('.tr-comment-edit');
                ta?.focus();
                ta?.setSelectionRange(ta.value.length, ta.value.length);
                break;
            }
            case 'cancel-edit':
                this.editing = null;
                this._render();
                this.host.querySelector(`[data-comment="${CSS.escape(id)}"] [data-act="edit"]`)?.focus();
                break;
            case 'delete':
                this.confirming = id;
                this.editing = null;
                this._render();
                this.host.querySelector('[data-act="confirm-delete"]')?.focus();
                break;
            case 'cancel-delete':
                this.confirming = null;
                this._render();
                this.host.querySelector(`[data-comment="${CSS.escape(id)}"] [data-act="delete"]`)?.focus();
                break;
            case 'confirm-delete':
                this._delete(id);
                break;
            default:
        }
    }

    async _submit(form) {
        if (form.classList.contains('tr-comment-editform')) return this._saveEdit();
        const c = normalizeComment(this.draft);
        if (!c.ok || this.sending) return;
        this.sending = true;
        this.sendError = '';
        this._renderComposerState();
        try {
            const row = await this.store.addComment(this.entry.id, c.body);
            if (this.destroyed) return;
            this.draft = '';
            this.sending = false;
            await this._load(); // names and avatars come from the server
            if (this.destroyed) return;
            if (this.rows && !this.rows.some(r => r.id === row.id)) this.rows = [...this.rows, { ...row }];
            this._render();
            this.onCount?.(this.rows?.length ?? 0);
            this.host.querySelector('#tr-comment-new')?.focus();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.sending = false;
            this.sendError = this._errorText(error);
            this._renderComposerState();
        }
    }

    async _saveEdit() {
        const ed = this.editing;
        if (!ed || ed.saving) return;
        const c = normalizeComment(ed.draft);
        if (!c.ok) return;
        ed.saving = true;
        this._renderEditState();
        try {
            const saved = await this.store.editComment(ed.id, c.body);
            if (this.destroyed) return;
            this.rows = this.rows.map(r => (r.id === ed.id ? { ...r, body: saved?.body ?? c.body, edited_at: saved?.edited_at ?? new Date().toISOString() } : r));
            this.editing = null;
            this._render();
            this.host.querySelector(`[data-comment="${CSS.escape(ed.id)}"] [data-act="edit"]`)?.focus();
        } catch (error) {
            console.error(error);
            if (this.destroyed || this.editing !== ed) return;
            ed.saving = false;
            ed.error = this._errorText(error);
            this._render();
        }
    }

    async _delete(id) {
        if (this.deleting) return;
        this.deleting = true;
        this._render();
        try {
            await this.store.deleteComment(id);
            if (this.destroyed) return;
            const at = this.rows.findIndex(r => r.id === id);
            this.rows = this.rows.filter(r => r.id !== id);
            this.confirming = null;
            this.deleting = false;
            this._render();
            this.onCount?.(this.rows.length);
            const next = this.host.querySelectorAll('.tr-comment')[Math.min(at, this.rows.length - 1)];
            (next?.querySelector('.tr-comment-act') ?? this.host.querySelector('#tr-comment-new'))?.focus();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.deleting = false;
            this.confirming = null;
            this.sendError = ts('deleteFailed', 'Couldn’t delete the comment. Try again.');
            this._render();
        }
    }

    // ---- Rendering ----

    _counter(c) {
        if (c.length < COMMENT_WARN) return '';
        return fill(ts(c.tooLong ? 'tooLong' : 'counter', c.tooLong ? '{0} / {1} characters, too long' : '{0} / {1}'), c.length, COMMENT_MAX);
    }

    _renderComposerState() {
        const c = normalizeComment(this.draft);
        const counter = this.host.querySelector('.tr-comment-count');
        if (counter) {
            counter.textContent = this._counter(c);
            counter.classList.toggle('is-over', c.tooLong);
        }
        const send = this.host.querySelector('.tr-comment-send');
        if (send) {
            send.disabled = !c.ok || this.sending;
            send.textContent = this.sending ? ts('sending', 'Sending…') : ts('send', 'Send');
        }
        const err = this.host.querySelector('.tr-comment-senderr');
        if (err) {
            err.textContent = this.sendError;
            err.hidden = !this.sendError;
        }
    }

    _renderEditState() {
        const ed = this.editing;
        if (!ed) return;
        const c = normalizeComment(ed.draft);
        const counter = this.host.querySelector('.tr-comment-editcount');
        if (counter) {
            counter.textContent = this._counter(c);
            counter.classList.toggle('is-over', c.tooLong);
        }
        const save = this.host.querySelector('.tr-comment-save');
        if (save) save.disabled = !c.ok || ed.saving;
    }

    _commentHtml(r) {
        const mine = r.author_id === this.userId;
        const name = mine ? translate('diveLog.trail.you', 'You') : displayName(r, k => translate(`diveLog.${k}`, 'Diver'));
        const url = r.avatar_path ? this.avatars.get(r.avatar_path) ?? null : null;
        const when = relativeTime(r.created_at, { locale: localeTag(currentLang()), justNow: ts('justNow', 'just now') });
        const exact = new Date(r.created_at);
        const dt = Number.isFinite(exact.getTime()) ? exact.toISOString() : '';
        const title = Number.isFinite(exact.getTime()) ? new Intl.DateTimeFormat(localeTag(currentLang()), { dateStyle: 'medium', timeStyle: 'short' }).format(exact) : '';
        const id = escHtml(r.id);
        const canDelete = mine || this._isOwner();
        let body;
        if (this.editing?.id === r.id) {
            const ed = this.editing;
            const c = normalizeComment(ed.draft);
            body = `<form class="tr-comment-editform" novalidate>
                <label class="rda-visually-hidden" for="tr-comment-edit-${id}">${escHtml(ts('editLabel', 'Edit your comment'))}</label>
                <textarea class="tr-comment-edit" id="tr-comment-edit-${id}" rows="3">${escHtml(ed.draft)}</textarea>
                <div class="tr-comment-row"><span class="tr-comment-editcount${c.tooLong ? ' is-over' : ''}" aria-live="polite">${escHtml(this._counter(c))}</span>
                <button type="button" class="btn btn-secondary" data-act="cancel-edit" data-id="${id}">${escHtml(ts('cancel', 'Cancel'))}</button>
                <button type="submit" class="btn btn-primary tr-comment-save"${!c.ok || ed.saving ? ' disabled' : ''}>${escHtml(ts('save', 'Save'))}</button></div>
                ${ed.error ? `<p class="lb-form-error" role="alert">${escHtml(ed.error)}</p>` : ''}</form>`;
        } else {
            body = `<p class="tr-comment-body">${escHtml(r.body)}</p>`;
        }
        let actions = '';
        if (this.confirming === r.id) {
            actions = `<div class="tr-comment-confirm" role="group" aria-label="${escHtml(ts('deleteConfirm', 'Delete this comment?'))}"><span>${escHtml(ts('deleteConfirm', 'Delete this comment?'))}</span>
                <button type="button" class="btn btn-danger" data-act="confirm-delete" data-id="${id}"${this.deleting ? ' disabled aria-busy="true"' : ''}>${escHtml(ts('delete', 'Delete'))}</button>
                <button type="button" class="btn btn-secondary" data-act="cancel-delete" data-id="${id}">${escHtml(ts('cancel', 'Cancel'))}</button></div>`;
        } else if (this.editing?.id !== r.id && (mine || canDelete)) {
            actions = `<div class="tr-comment-acts">${mine ? `<button type="button" class="tr-comment-act" data-act="edit" data-id="${id}">${escHtml(ts('edit', 'Edit'))}</button>` : ''}
                ${canDelete ? `<button type="button" class="tr-comment-act" data-act="delete" data-id="${id}">${escHtml(ts('delete', 'Delete'))}</button>` : ''}</div>`;
        }
        const who = mine ? `<span class="tr-comment-name">${escHtml(name)}</span>`
            : `<a class="tr-comment-name" href="${routeHref({ name: 'member', id: r.author_id })}">${escHtml(name)}</a>`;
        return `<li class="tr-comment" data-comment="${id}">
            <span class="tr-comment-av" aria-hidden="true">${avatarHtml({ preset: r.avatar_preset, url, name, id: r.author_id, size: 32 })}</span>
            <div class="tr-comment-main">
                <p class="tr-comment-head">${who} <time datetime="${escHtml(dt)}" title="${escHtml(title)}">${escHtml(when)}</time>${r.edited_at ? ` <span class="tr-comment-edited">· ${escHtml(ts('edited', 'edited'))}</span>` : ''}</p>
                ${body}${actions}
            </div></li>`;
    }

    _render() {
        if (this.destroyed) return;
        const focusedId = this.host.contains(document.activeElement) ? document.activeElement.id : '';
        const heading = `<h3 class="tr-comments-title" id="tr-comments-h">${escHtml(ts('comments', 'Comments'))}${this.enabled && this.rows?.length ? ` <span class="tr-comments-n">${this.rows.length}</span>` : ''}</h3>`;
        if (!this.enabled) {
            this.host.innerHTML = `<section class="tr-comments" aria-labelledby="tr-comments-h">${heading}
                <p class="tr-comments-off">${escHtml(this._isOwner() ? ts('offOwner', 'Comments are off for this dive. Turn them on in the ⋯ menu.') : ts('off', 'Comments are off for this dive.'))}</p></section>`;
            return;
        }
        let list;
        if (this.failed) list = `<p class="lb-form-error" role="alert">${escHtml(ts('loadFailed', 'Couldn’t load the comments.'))} <button type="button" class="tr-comment-act" data-act="retry">${escHtml(ts('retry', 'Try again'))}</button></p>`;
        else if (!this.rows) list = `<p class="tr-comments-note">${escHtml(tb('loading', 'Loading…'))}</p>`;
        else if (!this.rows.length) list = `<p class="tr-comments-note">${escHtml(ts('none', 'No comments yet.'))}</p>`;
        else list = `<ol class="tr-comment-list">${this.rows.map(r => this._commentHtml(r)).join('')}</ol>`;
        const c = normalizeComment(this.draft);
        this.host.innerHTML = `<section class="tr-comments" aria-labelledby="tr-comments-h">${heading}${list}
            <form class="tr-comment-form" novalidate>
                <label class="rda-visually-hidden" for="tr-comment-new">${escHtml(ts('write', 'Write a comment'))}</label>
                <textarea id="tr-comment-new" rows="2" placeholder="${escHtml(ts('write', 'Write a comment'))}">${escHtml(this.draft)}</textarea>
                <div class="tr-comment-row"><span class="tr-comment-count${c.tooLong ? ' is-over' : ''}" aria-live="polite">${escHtml(this._counter(c))}</span>
                <button type="submit" class="btn btn-primary tr-comment-send"${!c.ok || this.sending ? ' disabled' : ''}>${escHtml(this.sending ? ts('sending', 'Sending…') : ts('send', 'Send'))}</button></div>
                <p class="lb-form-error tr-comment-senderr" role="alert"${this.sendError ? '' : ' hidden'}>${escHtml(this.sendError)}</p>
            </form></section>`;
        this.host.querySelector('[data-act="retry"]')?.addEventListener('click', () => { this.rows = null; this._render(); this._load(); });
        if (focusedId) {
            const el = this.host.querySelector(`#${CSS.escape(focusedId)}`);
            if (el) {
                el.focus({ preventScroll: true });
                if (el.tagName === 'TEXTAREA') el.setSelectionRange(el.value.length, el.value.length);
            }
        }
    }
}
