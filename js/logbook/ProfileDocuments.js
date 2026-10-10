/**
 * Profile cards for qualifications (certification cards) and medical checks, each with scans.
 *
 * A card lists its items and edits one at a time inline. Picked scans are prepared in the browser (images
 * re-encoded as JPEG of at most 2560 px, which also drops EXIF/GPS; PDFs as they are) and kept as local
 * blobs until Save: Save uploads them, writes the row with the new paths, and only then deletes the files
 * they replace. A failed row write deletes the files it just uploaded, so nothing is left behind.
 *
 * Everything here is owner-only. Members only ever see a qualification's agency + level badge, and only
 * when "Show on my profile" is ticked; medical checks never leave this card.
 */

import {
    AGENCIES, LIMITS, DOC_MAX_BYTES, agencyLabel, badgeText, normalizeQualification, qualificationErrors,
    normalizeMedicalCheck, medicalErrors, medicalStatus, documentPath, scanKind, isoDate, sortQualifications,
    sortMedical, scanPaths, isPdfPath,
} from './documents.js';
import { resizeImage } from './photo.js';
import { formatDiveDate } from './entryModel.js';
import { translate } from '../i18n.js';
import { currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const td = (key, fallback) => translate(`diveLog.trail.docs.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const fmtDate = iso => formatDiveDate(iso, currentLang());
const ACCEPT = 'image/*,application/pdf';

const ICON_LOCK = '<svg class="tr-doc-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3.5H7.5A2 2 0 0 0 5.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/></svg>';
const ICON_CARD = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5.5" width="18" height="13" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.8 15.5a3 3 0 0 1 5.4 0M14 10h4M14 13h3"/></svg>';

let uidSeq = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${String(++uidSeq).padStart(12, '0')}`;

/** Shared list + inline editor; the two cards below supply the fields. */
class DocumentsCard {
    /**
     * @param {Object} options
     * @param {Object} options.store - DiveStore with the documents API
     * @param {{id: string}} options.user
     * @param {(items: Object[]) => void} [options.onChange] - the list changed (loaded, saved, deleted)
     */
    constructor({ store, user, onChange = () => {} }) {
        this.store = store;
        this.user = user;
        this.onChange = onChange;
        this.el = null;
        this.items = undefined; // undefined while loading
        this.failed = false;
        this.urls = new Map(); // path → signed URL
        this.edit = null; // { id, draft, slots: {name: {path, blob, ext, preview, removed}}, errors, slotError, confirm }
        this.busy = null; // null | 'pick' | 'save' | 'delete'
        this.status = { kind: '', text: '' };
        this.destroyed = false;
        this._onClick = e => this._click(e);
        this._onChange = e => this._change(e);
        this._onInput = e => this._input(e);
        this._onSubmit = e => { e.preventDefault(); this._save(); };
    }

    // ---- Subclass hooks ----
    /* eslint-disable class-methods-use-this */
    get kind() { return ''; }
    get texts() { return {}; }
    get slots() { return []; }
    emptyDraft() { return {}; }
    draftOf(item) { return { ...item }; }
    normalize(draft) { return draft; }
    errorsOf() { return []; }
    sort(items) { return items; }
    async listItems() { return []; }
    async saveItem() { return null; }
    async deleteItem() {}
    headHtml() { return ''; }
    itemHtml() { return ''; }
    fieldsHtml() { return ''; }
    slotLabel() { return ''; }
    readFields() {}
    /* eslint-enable class-methods-use-this */

    /** Render into `el` (the profile page re-creates its DOM, then mounts again). */
    mount(el) {
        if (this.el && this.el !== el) this._unbind();
        this.el = el;
        el.hidden = false;
        el.addEventListener('click', this._onClick);
        el.addEventListener('change', this._onChange);
        el.addEventListener('input', this._onInput);
        el.addEventListener('submit', this._onSubmit);
        this._render();
    }

    /** Keep what is typed in the open form before the page replaces the DOM. */
    capture() {
        if (this.edit && this.el?.isConnected) this._readForm();
    }

    destroy() {
        this.destroyed = true;
        this._dropPreviews();
        this._unbind();
    }

    _unbind() {
        if (!this.el) return;
        this.el.removeEventListener('click', this._onClick);
        this.el.removeEventListener('change', this._onChange);
        this.el.removeEventListener('input', this._onInput);
        this.el.removeEventListener('submit', this._onSubmit);
    }

    async load() {
        try {
            const items = await this.listItems();
            if (this.destroyed) return;
            this.items = this.sort(items ?? []);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.failed = true;
            this.items = [];
        }
        this._render();
        this.onChange(this.items);
        await this._sign(this.items.flatMap(scanPaths));
    }

    async _sign(paths) {
        const need = paths.filter(p => !this.urls.has(p));
        if (!need.length || !this.store.documentUrls) return;
        try {
            const urls = await this.store.documentUrls(need);
            if (this.destroyed) return;
            for (const [p, u] of urls) this.urls.set(p, u);
            this.capture();
            this._render();
        } catch (error) {
            console.error(error); // the tiles show the file icon instead
        }
    }

    _errorText(error) {
        return error?.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. Please try again later.')
            : tb('genericError', 'Something went wrong. Please try again.');
    }

    // ---- Editing ----

    _open(id) {
        if (this.busy) return;
        const item = id ? this.items.find(i => i.id === id) : null;
        if (id && !item) return;
        this._dropPreviews();
        const slots = {};
        for (const s of this.slots) slots[s] = { path: item?.[s] ?? null, blob: null, ext: null, preview: null, removed: false };
        this.edit = { id: item?.id ?? null, draft: item ? this.draftOf(item) : this.emptyDraft(), slots, errors: [], slotError: null, confirm: false };
        this.status = { kind: '', text: '' };
        this._render();
        this.el.querySelector('.tr-doc-form input:not([type="hidden"]), .tr-doc-form select')?.focus({ preventScroll: false });
    }

    _close() {
        const id = this.edit?.id;
        this._dropPreviews();
        this.edit = null;
        this._render();
        const back = id ? [...this.el.querySelectorAll('[data-act="edit"]')].find(b => b.dataset.id === id) : this.el.querySelector('[data-act="add"]');
        back?.focus({ preventScroll: true });
    }

    _dropPreviews() {
        for (const s of Object.values(this.edit?.slots ?? {})) if (s.preview) URL.revokeObjectURL?.(s.preview);
    }

    _readForm() {
        const form = this.el?.querySelector('.tr-doc-form');
        if (!form || !this.edit) return;
        this.readFields(form, this.edit.draft);
    }

    async _pick(input) {
        const file = input.files?.[0];
        const slot = input.dataset.slot;
        input.value = '';
        if (!file || this.busy || !this.edit?.slots[slot]) return;
        this._readForm();
        const kind = scanKind(file);
        const refuse = text => { this.busy = null; this.edit.slotError = { slot, text }; this._render(); };
        if (!kind) return refuse(td('badType', 'Choose a photo or a PDF.'));
        if (kind === 'pdf' && file.size > DOC_MAX_BYTES) return refuse(td('tooBig', 'This file is larger than 10\u00a0MB.'));
        this.busy = 'pick';
        this.edit.slotError = null;
        this._render();
        let blob = file;
        if (kind === 'image') {
            try {
                ({ blob } = await resizeImage(file));
            } catch (error) {
                console.debug('Scan not decoded', error);
                if (this.destroyed || !this.edit) return;
                return refuse(td('unreadable', 'Couldn’t read this image. Choose a JPEG, PNG or WebP photo, or a PDF.'));
            }
            if (blob.size > DOC_MAX_BYTES) return refuse(td('tooBig', 'This file is larger than 10\u00a0MB.'));
        }
        if (this.destroyed || !this.edit) return;
        const s = this.edit.slots[slot];
        if (s.preview) URL.revokeObjectURL?.(s.preview);
        Object.assign(s, { blob, ext: kind === 'pdf' ? 'pdf' : 'jpg', removed: false,
            preview: kind === 'image' ? (URL.createObjectURL?.(blob) ?? null) : null });
        this.busy = null;
        this._render();
        this.el.querySelector(`.tr-scan-slot[data-slot="${slot}"] input[type="file"]`)?.focus({ preventScroll: true });
    }

    _removeScan(slot) {
        const s = this.edit?.slots[slot];
        if (!s || this.busy) return;
        this._readForm();
        if (s.preview) URL.revokeObjectURL?.(s.preview);
        Object.assign(s, { blob: null, ext: null, preview: null, removed: Boolean(s.path) });
        this._render();
        this.el.querySelector(`.tr-scan-slot[data-slot="${slot}"] input[type="file"]`)?.focus({ preventScroll: true });
    }

    async _save() {
        if (this.busy || !this.edit) return;
        this._readForm();
        const e = this.edit;
        const row = this.normalize(e.draft);
        e.errors = this.errorsOf(row);
        if (e.errors.length) {
            this._render();
            this.el.querySelector('.tr-doc-form [aria-invalid="true"]')?.focus();
            return;
        }
        this.busy = 'save';
        this.status = { kind: '', text: '' };
        this._render();
        const uploaded = [];
        const stale = [];
        const patch = { ...row };
        let saved;
        try {
            for (const name of this.slots) {
                const s = e.slots[name];
                if (s.blob) {
                    const path = documentPath(this.user.id, this.kind, newId(), s.ext);
                    await this.store.uploadDocument(path, s.blob);
                    uploaded.push(path);
                    patch[name] = path;
                    if (s.path) stale.push(s.path);
                } else if (s.removed) {
                    patch[name] = null;
                    if (s.path) stale.push(s.path);
                }
            }
            saved = await this.saveItem(patch, e.id);
        } catch (error) {
            console.error(error);
            if (uploaded.length) this.store.removeDocuments(uploaded).catch(err => console.error(err));
            if (this.destroyed) return;
            this.busy = null;
            this.status = { kind: 'error', text: this._errorText(error) };
            this._render();
            return;
        }
        if (stale.length) this.store.removeDocuments(stale).catch(err => console.error(err)); // the row no longer points to them
        if (this.destroyed) return;
        for (const name of this.slots) {
            const s = e.slots[name];
            if (s.preview && saved?.[name]) this.urls.set(saved[name], s.preview); // keep the local preview until signed
            s.preview = null;
        }
        this.items = this.sort([...this.items.filter(i => i.id !== saved.id), saved]);
        this.edit = null;
        this.busy = null;
        this.status = { kind: 'ok', text: td('saved', 'Saved ✓') };
        this._render();
        [...this.el.querySelectorAll('[data-act="edit"]')].find(b => b.dataset.id === saved.id)?.focus({ preventScroll: true });
        this.onChange(this.items);
        const fresh = this.slots.map(n => saved[n]).filter(p => p && uploaded.includes(p));
        for (const p of fresh) this.urls.delete(p);
        await this._sign(fresh);
    }

    async _delete() {
        if (this.busy || !this.edit?.id) return;
        const item = this.items.find(i => i.id === this.edit.id);
        if (!item) return;
        this.busy = 'delete';
        this._render();
        try {
            await this.deleteItem(item);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.busy = null;
            this.status = { kind: 'error', text: this._errorText(error) };
            this._render();
            return;
        }
        if (this.destroyed) return;
        this._dropPreviews();
        this.items = this.items.filter(i => i.id !== item.id);
        this.edit = null;
        this.busy = null;
        this.status = { kind: 'ok', text: td('deleted', 'Deleted ✓') };
        this._render();
        this.el.querySelector('[data-act="add"]')?.focus({ preventScroll: true });
        this.onChange(this.items);
    }

    // ---- Events ----

    _click(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn || !this.el.contains(btn) || btn.disabled) return;
        const act = btn.dataset.act;
        if (act === 'add') this._open(null);
        else if (act === 'edit') this._open(btn.dataset.id);
        else if (act === 'cancel') this._close();
        else if (act === 'scan-remove') this._removeScan(btn.dataset.slot);
        else if (act === 'ask-delete' || act === 'no-delete') {
            this._readForm();
            this.edit.confirm = act === 'ask-delete';
            this._render();
            this.el.querySelector(act === 'ask-delete' ? '[data-act="delete"]' : '[data-act="ask-delete"]')?.focus();
        } else if (act === 'delete') this._delete();
    }

    _change(e) {
        if (e.target.matches('input[type="file"][data-slot]')) this._pick(e.target);
        else this._fieldChanged?.(e.target);
    }

    _input(e) {
        if (!this.edit || !e.target.name) return;
        if (this.edit.errors.length) {
            this._readForm();
            const before = this.edit.errors.length;
            this.edit.errors = this.edit.errors.filter(k => k !== e.target.name && !(k === 'valid_until' && e.target.name === 'checked_on'));
            if (this.edit.errors.length !== before) {
                e.target.removeAttribute('aria-invalid');
                this.el.querySelector(`#${this.kind}-err-${e.target.name}`)?.remove();
            }
        }
        if (this.status.kind) {
            this.status = { kind: '', text: '' };
            const st = this.el.querySelector('.tr-doc-status');
            if (st) { st.textContent = ''; st.className = 'tr-profile-status tr-doc-status'; }
        }
    }

    // ---- Rendering ----

    /** An error under a field, wired with aria-describedby by `fieldAttrs`. */
    errHtml(name, text) {
        return this.edit?.errors.includes(name) ? `<span class="lb-form-error tr-doc-err" id="${this.kind}-err-${name}">${escHtml(text)}</span>` : '';
    }

    fieldAttrs(name) {
        return this.edit?.errors.includes(name) ? ` aria-invalid="true" aria-describedby="${this.kind}-err-${name}"` : '';
    }

    /** A small linked thumbnail of a saved scan (opens the signed URL in a new tab). */
    thumbHtml(path, label) {
        const url = this.urls.get(path);
        const pdf = isPdfPath(path);
        const inner = !pdf && url
            ? `<img src="${escHtml(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : `<span class="tr-thumb-file">${ICON_DOC}<span>${pdf ? 'PDF' : 'JPG'}</span></span>`;
        const a11y = escHtml(fill(td('openScan', '{0} (opens in a new tab)'), label));
        return url
            ? `<a class="tr-thumb" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${a11y}" title="${escHtml(label)}">${inner}</a>`
            : `<span class="tr-thumb" role="img" aria-label="${escHtml(label)}">${inner}</span>`;
    }

    thumbsHtml(item) {
        const tiles = this.slots.filter(s => item[s]).map(s => this.thumbHtml(item[s], this.slotLabel(s)));
        return tiles.length ? `<div class="tr-doc-thumbs">${tiles.join('')}</div>` : '';
    }

    _slotHtml(name) {
        const s = this.edit.slots[name];
        const label = this.slotLabel(name);
        const busy = Boolean(this.busy);
        const has = Boolean(s.blob) || (Boolean(s.path) && !s.removed);
        let box;
        if (s.blob) {
            box = s.preview
                ? `<img src="${escHtml(s.preview)}" alt="${escHtml(label)}">`
                : `<span class="tr-thumb-file">${ICON_DOC}<span>PDF</span></span>`;
        } else if (has) {
            const url = this.urls.get(s.path);
            box = url && !isPdfPath(s.path)
                ? `<img src="${escHtml(url)}" alt="${escHtml(label)}" referrerpolicy="no-referrer">`
                : `<span class="tr-thumb-file">${ICON_DOC}<span>${isPdfPath(s.path) ? 'PDF' : 'JPG'}</span></span>`;
        } else {
            box = `<span class="tr-scan-empty">${ICON_CARD}<span>${escHtml(td('noScan', 'No scan'))}</span></span>`;
        }
        const err = this.edit.slotError?.slot === name ? `<p class="lb-form-error" role="alert">${escHtml(this.edit.slotError.text)}</p>` : '';
        const preparing = this.busy === 'pick' ? `<span class="tr-scan-busy" role="status">${escHtml(td('preparing', 'Preparing…'))}</span>` : '';
        return `<div class="tr-scan-slot" data-slot="${name}">
                <span class="tr-scan-label">${escHtml(label)}</span>
                <div class="tr-scan-box${has ? '' : ' tr-scan-box--empty'}">${box}${preparing}</div>
                <div class="tr-scan-actions">
                    <label class="btn btn-secondary tr-scan-pick${busy ? ' lb-disabled' : ''}"><span>${escHtml(has ? td('replaceScan', 'Replace') : td('addScan', 'Add scan'))}</span>
                        <input type="file" accept="${ACCEPT}" data-slot="${name}" class="rda-visually-hidden" aria-label="${escHtml(`${label}: ${has ? td('replaceScan', 'Replace') : td('addScan', 'Add scan')}`)}"${busy ? ' disabled' : ''}></label>
                    ${has ? `<button type="button" class="btn btn-secondary tr-scan-remove" data-act="scan-remove" data-slot="${name}"${busy ? ' disabled' : ''}>${escHtml(td('removeScan', 'Remove'))}</button>` : ''}
                </div>
                ${err}
            </div>`;
    }

    _formHtml() {
        const e = this.edit;
        const busy = Boolean(this.busy);
        const saving = this.busy === 'save';
        const confirm = e.confirm ? `<div class="lb-confirm tr-doc-confirm" role="alertdialog" aria-label="${escHtml(td('confirmDeleteLabel', 'Confirm deletion'))}">
                <p>${escHtml(this.kt('confirmDelete'))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" data-act="delete"${busy ? ' disabled' : ''}>${escHtml(this.busy === 'delete' ? td('deleting', 'Deleting…') : td('delete', 'Delete'))}</button>
                <button type="button" class="btn btn-secondary" data-act="no-delete"${busy ? ' disabled' : ''}>${escHtml(td('cancel', 'Cancel'))}</button></div></div>` : '';
        return `<form class="tr-doc-form lb-form" novalidate aria-label="${escHtml(e.id ? this.kt('editTitle') : this.kt('addTitle'))}">
                <h4 class="tr-doc-form-title">${escHtml(e.id ? this.kt('editTitle') : this.kt('addTitle'))}</h4>
                ${this.fieldsHtml(e.draft)}
                <fieldset class="tr-scans"><legend>${escHtml(td('scans', 'Scans'))}</legend>
                    <div class="tr-scan-grid tr-scan-grid--${this.slots.length}">${this.slots.map(s => this._slotHtml(s)).join('')}</div>
                    <p class="tr-profile-hint">${escHtml(td('scanHint', 'A photo or a PDF, up to 10\u00a0MB. Photos are scaled down and their location data removed before upload.'))}</p>
                </fieldset>
                <div class="lb-actions tr-doc-actions">
                    <button type="submit" class="btn btn-primary"${busy ? ' disabled' : ''}>${escHtml(saving ? td('saving', 'Saving…') : td('save', 'Save'))}</button>
                    <button type="button" class="btn btn-secondary" data-act="cancel"${busy ? ' disabled' : ''}>${escHtml(td('cancel', 'Cancel'))}</button>
                    ${e.id && !e.confirm ? `<button type="button" class="btn btn-secondary tr-doc-del" data-act="ask-delete"${busy ? ' disabled' : ''}>${escHtml(td('delete', 'Delete'))}</button>` : ''}
                </div>
                ${confirm}
            </form>`;
    }

    _render() {
        if (!this.el || this.destroyed) return;
        const status = this.status;
        let body;
        if (this.items === undefined) body = `<p class="tr-profile-hint">${escHtml(tb('loading', 'Loading…'))}</p>`;
        else if (this.failed) body = `<p class="lb-form-error" role="alert">${escHtml(tb('genericError', 'Something went wrong. Please try again.'))}</p>`;
        else {
            const rows = this.items.map(item => (this.edit?.id === item.id
                ? `<li class="tr-doc tr-doc--editing">${this._formHtml()}</li>`
                : `<li class="tr-doc">${this.itemHtml(item)}<button type="button" class="btn btn-secondary tr-doc-edit" data-act="edit" data-id="${escHtml(item.id)}" aria-label="${escHtml(fill(td('editItem', 'Edit {0}'), this.itemName(item)))}"${this.edit ? ' disabled' : ''}>${escHtml(td('edit', 'Edit'))}</button></li>`)).join('');
            const empty = !this.items.length && !this.edit ? `<p class="tr-doc-empty">${escHtml(this.kt('empty'))}</p>` : '';
            const adding = this.edit && !this.edit.id ? `<div class="tr-doc tr-doc--editing tr-doc--new">${this._formHtml()}</div>` : '';
            body = `${empty}${rows ? `<ul class="tr-doc-list" role="list">${rows}</ul>` : ''}${adding}
                ${this.edit ? '' : `<button type="button" class="btn btn-secondary tr-doc-add" data-act="add">${escHtml(this.kt('add'))}</button>`}`;
        }
        this.el.innerHTML = `${this.headHtml()}${body}
            <p class="tr-profile-status tr-doc-status${status.kind ? ` tr-profile-status--${status.kind}` : ''}" role="status">${escHtml(status.text)}</p>`;
    }

    itemName() { return ''; } // eslint-disable-line class-methods-use-this

    /** A per-kind string: `diveLog.trail.docs.<kind>.<key>`. */
    kt(key) {
        return td(`${this.kind}.${key}`, this.texts[key] ?? key);
    }
}

// ---- Qualifications ----

const QUAL_TEXTS = {
    empty: 'No qualifications yet.', add: 'Add qualification', addTitle: 'New qualification', editTitle: 'Edit qualification',
    confirmDelete: 'Delete this qualification and its scans? This cannot be undone.',
};
const MEDICAL_TEXTS = {
    empty: 'No medical checks yet.', add: 'Add medical check', addTitle: 'New medical check', editTitle: 'Edit medical check',
    confirmDelete: 'Delete this medical check and its scan? This cannot be undone.',
};

export class QualificationsCard extends DocumentsCard {
    get kind() { return 'qualifications'; }
    get texts() { return QUAL_TEXTS; }
    get slots() { return ['scan_front', 'scan_back']; }

    emptyDraft() {
        return { agency: '', agency_other: '', level: '', card_number: '', issued_on: '', instructor: '', notes: '', show_on_profile: false };
    }

    draftOf(q) {
        const s = v => (v == null ? '' : String(v));
        return { agency: s(q.agency), agency_other: s(q.agency_other), level: s(q.level), card_number: s(q.card_number),
            issued_on: s(q.issued_on), instructor: s(q.instructor), notes: s(q.notes), show_on_profile: q.show_on_profile === true };
    }

    normalize(draft) { return normalizeQualification(draft); }
    errorsOf(row) { return qualificationErrors(row); }
    sort(items) { return sortQualifications(items); }
    listItems() { return this.store.listQualifications(); }
    saveItem(row, id) { return this.store.saveQualification(row, id); }
    deleteItem(item) { return this.store.deleteQualification(item); }
    slotLabel(slot) { return slot === 'scan_front' ? td('front', 'Front') : td('back', 'Back'); }
    itemName(q) { return badgeText(q, td('agencyOther', 'Other')); }

    /** Badges of the shown cards (what members see), newest first. */
    shownBadges() {
        return (this.items ?? []).filter(q => q.show_on_profile).map(q => badgeText(q, td('agencyOther', 'Other')));
    }

    headHtml() {
        return `<h3 class="tr-section-head">${escHtml(td('qualifications.title', 'Qualifications'))}</h3>
            <p class="tr-profile-hint tr-doc-lead">${escHtml(td('qualifications.lead', 'Your certification cards. Only you see the details and scans.'))}</p>`;
    }

    itemHtml(q) {
        const agency = agencyLabel(q.agency, q.agency_other, td('agencyOther', 'Other'));
        const meta = [
            q.card_number ? fill(td('qualifications.cardNo', 'No. {0}'), q.card_number) : '',
            q.issued_on ? fill(td('qualifications.issuedOn', 'Issued {0}'), fmtDate(q.issued_on)) : '',
            q.instructor ? fill(td('qualifications.instructorIs', 'Instructor: {0}'), q.instructor) : '',
        ].filter(Boolean);
        return `<div class="tr-doc-body">
                <p class="tr-doc-title"><span class="tr-agency">${escHtml(agency)}</span><span class="tr-doc-level">${escHtml(q.level ?? '')}</span></p>
                ${meta.length ? `<p class="tr-doc-meta">${meta.map(m => `<span>${escHtml(m)}</span>`).join('')}</p>` : ''}
                ${q.notes ? `<p class="tr-doc-notes">${escHtml(q.notes)}</p>` : ''}
                ${q.show_on_profile ? `<p class="tr-doc-shown">${escHtml(td('qualifications.shown', 'Level shown on your profile'))}</p>` : ''}
            </div>${this.thumbsHtml(q)}`;
    }

    fieldsHtml(d) {
        const options = [`<option value=""${d.agency ? '' : ' selected'}>${escHtml(td('qualifications.chooseAgency', 'Choose…'))}</option>`,
            ...AGENCIES.map(a => `<option value="${a}"${a === d.agency ? ' selected' : ''}>${escHtml(a === 'other' ? td('agencyOther', 'Other') : agencyLabel(a))}</option>`)].join('');
        const k = this.kind;
        return `<div class="tr-doc-grid">
                <label class="lb-field"><span>${escHtml(td('qualifications.agency', 'Agency'))} *</span>
                    <select name="agency" required${this.fieldAttrs('agency')}>${options}</select>${this.errHtml('agency', td('qualifications.agencyMissing', 'Choose the agency.'))}</label>
                <label class="lb-field tr-agency-other"${d.agency === 'other' ? '' : ' hidden'}><span>${escHtml(td('qualifications.agencyName', 'Agency name'))}</span>
                    <input type="text" name="agency_other" maxlength="${LIMITS.agency_other}" value="${escHtml(d.agency_other)}" autocomplete="off"></label>
                <label class="lb-field tr-doc-wide"><span>${escHtml(td('qualifications.level', 'Level or course'))} *</span>
                    <input type="text" name="level" required maxlength="${LIMITS.level}" value="${escHtml(d.level)}" placeholder="${escHtml(td('qualifications.levelPlaceholder', 'e.g. P2, Open Water Diver, Nitrox'))}" autocomplete="off"${this.fieldAttrs('level')}>${this.errHtml('level', td('qualifications.levelMissing', 'Enter the level or course.'))}</label>
                <label class="lb-field"><span>${escHtml(td('qualifications.cardNumber', 'Card number'))}</span>
                    <input type="text" name="card_number" maxlength="${LIMITS.card_number}" value="${escHtml(d.card_number)}" autocomplete="off" spellcheck="false"></label>
                <label class="lb-field"><span>${escHtml(td('qualifications.issued', 'Date issued'))}</span>
                    <input type="date" name="issued_on" value="${escHtml(d.issued_on)}" max="${isoDate()}"></label>
                <label class="lb-field tr-doc-wide"><span>${escHtml(td('qualifications.instructor', 'Instructor'))}</span>
                    <input type="text" name="instructor" maxlength="${LIMITS.instructor}" value="${escHtml(d.instructor)}" autocomplete="off"></label>
                <label class="lb-field tr-doc-wide"><span>${escHtml(td('notes', 'Notes'))}</span>
                    <textarea name="notes" rows="2" maxlength="${LIMITS.notes}">${escHtml(d.notes)}</textarea></label>
            </div>
            <label class="tr-doc-check"><input type="checkbox" name="show_on_profile"${d.show_on_profile ? ' checked' : ''} aria-describedby="${k}-show-help">
                <span><span class="tr-doc-check-label">${escHtml(td('qualifications.show', 'Show level on my profile to members'))}</span>
                <span class="tr-profile-hint" id="${k}-show-help">${escHtml(td('qualifications.showHelp', 'Members see only the agency and level — never the card number, dates or scans.'))}</span></span></label>`;
    }

    readFields(form, draft) {
        for (const name of ['agency', 'agency_other', 'level', 'card_number', 'issued_on', 'instructor', 'notes']) {
            const el = form.querySelector(`[name="${name}"]`);
            if (el) draft[name] = el.value;
        }
        draft.show_on_profile = Boolean(form.querySelector('[name="show_on_profile"]')?.checked);
    }

    _fieldChanged(el) {
        if (el.name !== 'agency') return;
        const other = this.el.querySelector('.tr-agency-other');
        if (other) other.hidden = el.value !== 'other';
    }
}

// ---- Medical checks ----

export class MedicalCard extends DocumentsCard {
    get kind() { return 'medical'; }
    get texts() { return MEDICAL_TEXTS; }
    get slots() { return ['scan_path']; }
    emptyDraft() { return { checked_on: '', valid_until: '', doctor: '', notes: '' }; }

    draftOf(m) {
        const s = v => (v == null ? '' : String(v));
        return { checked_on: s(m.checked_on), valid_until: s(m.valid_until), doctor: s(m.doctor), notes: s(m.notes) };
    }

    normalize(draft) { return normalizeMedicalCheck(draft); }
    errorsOf(row) { return medicalErrors(row); }
    sort(items) { return sortMedical(items); }
    listItems() { return this.store.listMedicalChecks(); }
    saveItem(row, id) { return this.store.saveMedicalCheck(row, id); }
    deleteItem(item) { return this.store.deleteMedicalCheck(item); }
    slotLabel() { return td('medical.scan', 'Certificate'); }
    itemName(m) { return fill(td('medical.checkOn', 'Check of {0}'), fmtDate(m.checked_on)); }

    /** Status of all checks today (for the head line and the logbook banner). */
    state(today = isoDate()) {
        return medicalStatus(this.items ?? [], today);
    }

    headHtml() {
        const st = this.items?.length ? this.state() : null;
        let line = '';
        if (st) {
            const text = st.state === 'ok' ? fill(td('medical.validUntil', 'Valid until {0}'), fmtDate(st.validUntil))
                : st.state === 'soon' ? fill(td('medical.expiresOn', 'Expires on {0} — time to renew'), fmtDate(st.validUntil))
                    : st.state === 'expired' ? fill(td('medical.expiredOn', 'Expired on {0}'), fmtDate(st.validUntil))
                        : td('medical.noDate', 'No valid-until date entered');
            line = `<p class="tr-med-status tr-med-status--${st.state}">${escHtml(text)}</p>`;
        }
        return `<h3 class="tr-section-head">${escHtml(td('medical.title', 'Medical fitness'))}</h3>
            <p class="tr-doc-private">${ICON_LOCK}<span>${escHtml(td('medical.private', 'Only you can see this. It is never shared with members, in the feed or through public links.'))}</span></p>
            ${line}`;
    }

    itemHtml(m) {
        const meta = [
            m.valid_until ? fill(td('medical.validUntil', 'Valid until {0}'), fmtDate(m.valid_until)) : '',
            m.doctor ?? '',
        ].filter(Boolean);
        return `<div class="tr-doc-body">
                <p class="tr-doc-title"><span class="tr-doc-level">${escHtml(this.itemName(m))}</span></p>
                ${meta.length ? `<p class="tr-doc-meta">${meta.map(x => `<span>${escHtml(x)}</span>`).join('')}</p>` : ''}
                ${m.notes ? `<p class="tr-doc-notes">${escHtml(m.notes)}</p>` : ''}
            </div>${this.thumbsHtml(m)}`;
    }

    fieldsHtml(d) {
        return `<div class="tr-doc-grid">
                <label class="lb-field"><span>${escHtml(td('medical.checkedOn', 'Date of the check'))} *</span>
                    <input type="date" name="checked_on" required value="${escHtml(d.checked_on)}" max="${isoDate()}"${this.fieldAttrs('checked_on')}>${this.errHtml('checked_on', td('medical.checkedMissing', 'Enter the date of the check.'))}</label>
                <label class="lb-field"><span>${escHtml(td('medical.validUntilLabel', 'Valid until'))}</span>
                    <input type="date" name="valid_until" value="${escHtml(d.valid_until)}"${this.fieldAttrs('valid_until')}>${this.errHtml('valid_until', td('medical.validBefore', 'This is before the date of the check.'))}</label>
                <label class="lb-field tr-doc-wide"><span>${escHtml(td('medical.doctor', 'Doctor or clinic'))}</span>
                    <input type="text" name="doctor" maxlength="${LIMITS.doctor}" value="${escHtml(d.doctor)}" autocomplete="off"></label>
                <label class="lb-field tr-doc-wide"><span>${escHtml(td('notes', 'Notes'))}</span>
                    <textarea name="notes" rows="2" maxlength="${LIMITS.notes}">${escHtml(d.notes)}</textarea></label>
            </div>`;
    }

    readFields(form, draft) {
        for (const name of ['checked_on', 'valid_until', 'doctor', 'notes']) {
            const el = form.querySelector(`[name="${name}"]`);
            if (el) draft[name] = el.value;
        }
    }
}

/** Badge chips (agency · level) for a member head; '' when there are none. */
export function badgesHtml(badges, label = td('qualifications.badgesLabel', 'Qualifications')) {
    const list = (badges ?? []).filter(b => typeof b === 'string' && b.trim());
    if (!list.length) return '';
    return `<ul class="tr-qual-badges" role="list" aria-label="${escHtml(label)}">${list.map(b => `<li class="tr-qual-badge">${escHtml(b)}</li>`).join('')}</ul>`;
}

/** Badge texts from community_qualifications rows. */
export function badgeTexts(rows) {
    return (rows ?? []).filter(r => r && r.level).map(r => badgeText(r, td('agencyOther', 'Other')));
}
