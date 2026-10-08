/**
 * Photos and video links of one entry, inside the edit form: thumbnails, add photos,
 * add a video link, remove. Uses the same store calls as the detail screen.
 * The element lives in `this.el`, so the form can re-attach it after it re-renders.
 */

import { readExif, resizeImage, isSupportedImage } from './photo.js';
import { isHttpsUrl } from './EntryDetail.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const td = (key, fallback) => translate(`diveLog.logbook.detail.${key}`, fallback ?? key);
const tp = (key, fallback) => translate(`diveLog.logbook.photo.${key}`, fallback ?? key);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

export class MediaSection {
    /**
     * @param {Object} options
     * @param {Object} options.store
     * @param {string} options.entryId
     */
    constructor({ store, entryId }) {
        this.store = store;
        this.entryId = entryId;
        this.el = document.createElement('div');
        this.el.className = 'lb-media-section';
        this.media = [];
        this.urls = new Map();
        this.videoOpen = false;
        this.removing = null; // id of the item waiting for "Remove?" confirmation
        this.status = '';
        this.errors = [];
        this.busy = false;
        this.destroyed = false;
        this._urlRetried = false;
        this.render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this.el.remove();
    }

    async _load() {
        try {
            this.media = await this.store.listMedia(this.entryId);
            if (this.destroyed) return;
            this.render();
            await this._loadUrls();
        } catch (error) {
            this._fail(error);
        }
    }

    async _loadUrls() {
        const paths = this.media.filter(m => m.kind === 'photo' && m.path).map(m => m.path);
        try {
            this.urls = await this.store.photoUrls(paths);
        } catch (error) {
            console.error(error);
            this.urls = new Map();
        }
        if (!this.destroyed) this.render();
    }

    _fail(error) {
        console.error(error);
        if (this.destroyed) return;
        this.errors = [error?.kind === 'unreachable' ? tb('unreachable', 'Can\'t reach your dive log.') : tb('genericError', 'Something went wrong. Please try again.')];
        this.render();
    }

    render() {
        const photos = this.media.filter(m => m.kind === 'photo');
        const videos = this.media.filter(m => m.kind === 'video_link');
        const removeBtn = (m, cls, label) => this.removing === m.id
            ? `<button type="button" class="btn btn-danger lb-media-confirm" data-confirm="${escHtml(m.id)}">${escHtml(td('remove', 'Remove'))}?</button>`
            : `<button type="button" class="${cls}" data-remove="${escHtml(m.id)}" aria-label="${escHtml(label)}">×</button>`;
        const grid = photos.map(m => {
            const url = this.urls.get(m.path);
            return `<figure class="lb-photo">
                ${url ? `<img src="${escHtml(url)}" alt="${escHtml(tp('alt', 'Photo'))}" loading="lazy">` : '<div class="lb-photo-wait" aria-hidden="true"></div>'}
                ${removeBtn(m, 'lb-photo-x', td('removePhoto', 'Remove photo'))}</figure>`;
        }).join('');
        const links = videos.map(m => `<li>${isHttpsUrl(m.url)
            ? `<a href="${escHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escHtml(m.caption || m.url)}</a>`
            : `<span>${escHtml(m.caption || m.url || '')}</span>`}
            ${removeBtn(m, 'lb-chip-x', td('removeVideo', 'Remove link'))}</li>`).join('');
        this.el.innerHTML = `
            ${photos.length ? `<div class="lb-photos">${grid}</div>` : ''}
            ${videos.length ? `<ul class="lb-videos">${links}</ul>` : ''}
            <div class="lb-actions">
                <label class="btn btn-secondary lb-file"><span>${escHtml(td('addPhotos', 'Add photos'))}</span>
                    <input type="file" class="rda-visually-hidden" id="lb-form-photos" accept="${IMAGE_ACCEPT}" multiple${this.busy ? ' disabled' : ''}></label>
                <button type="button" class="btn btn-secondary" id="lb-form-video">${escHtml(td('addVideo', 'Add video link'))}</button>
            </div>
            ${this.status ? `<p class="lb-d-status" role="status">${escHtml(this.status)}</p>` : ''}
            ${this.errors.length ? `<p class="lb-form-error" role="alert">${this.errors.map(escHtml).join('<br>')}</p>` : ''}
            ${this.videoOpen ? `<div class="lb-video-form">
                <label class="lb-field"><span>${escHtml(td('videoUrl', 'Video link (https://…)'))}</span><input type="text" name="media-url" inputmode="url" autocomplete="off"></label>
                <label class="lb-field"><span>${escHtml(td('videoCaption', 'Caption (optional)'))}</span><input type="text" name="media-caption" autocomplete="off"></label>
                <p class="lb-form-error" role="alert" hidden></p>
                <div class="lb-actions"><button type="button" class="btn btn-primary" id="lb-video-add">${escHtml(td('videoSave', 'Add link'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-video-cancel">${escHtml(td('cancel', 'Cancel'))}</button></div></div>` : ''}`;
        this._wire();
    }

    _wire() {
        const el = this.el;
        const photoInput = el.querySelector('#lb-form-photos');
        photoInput.addEventListener('change', () => this._addPhotos(photoInput));
        el.querySelector('#lb-form-video').addEventListener('click', () => { this.videoOpen = true; this.render(); el.querySelector('[name="media-url"]')?.focus(); });
        el.querySelector('#lb-video-cancel')?.addEventListener('click', () => { this.videoOpen = false; this.render(); });
        el.querySelector('#lb-video-add')?.addEventListener('click', () => this._saveVideo());
        for (const b of el.querySelectorAll('[data-remove]')) b.addEventListener('click', () => { this.removing = b.dataset.remove; this.render(); });
        for (const b of el.querySelectorAll('[data-confirm]')) b.addEventListener('click', () => this._remove(b.dataset.confirm));
        for (const img of el.querySelectorAll('.lb-photo img')) {
            img.addEventListener('load', () => { this._urlRetried = false; });
            img.addEventListener('error', () => {
                if (this._urlRetried || this.destroyed) return; // signed URLs expire after an hour
                this._urlRetried = true;
                this._loadUrls();
            });
        }
    }

    async _remove(id) {
        const media = this.media.find(m => m.id === id);
        this.removing = null;
        if (!media) return;
        try {
            await this.store.deleteMedia(media);
            if (this.destroyed) return;
            this.media = this.media.filter(m => m.id !== id);
            this.errors = [];
            this.render();
        } catch (error) {
            this._fail(error);
        }
    }

    async _saveVideo() {
        const url = this.el.querySelector('[name="media-url"]').value.trim();
        const caption = this.el.querySelector('[name="media-caption"]').value.trim() || null;
        const err = this.el.querySelector('.lb-video-form .lb-form-error');
        if (!isHttpsUrl(url)) {
            err.textContent = td('videoInvalid', 'Enter a link that starts with https://');
            err.hidden = false;
            return;
        }
        this.el.querySelector('#lb-video-add').disabled = true;
        try {
            const row = await this.store.addVideoLink(this.entryId, url, caption);
            if (this.destroyed) return;
            this.media = [...this.media, row];
            this.videoOpen = false;
            this.render();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.el.querySelector('#lb-video-add').disabled = false;
            err.textContent = tb('genericError', 'Something went wrong. Please try again.');
            err.hidden = false;
        }
    }

    async _addPhotos(input) {
        const files = Array.from(input.files);
        input.value = '';
        if (!files.length || this.busy) return;
        this.busy = true;
        this.errors = [];
        const failures = [];
        let added = 0;
        for (const [i, file] of files.entries()) {
            if (this.destroyed) return;
            this.status = fill(tp('progress', 'Uploading {0} / {1}…'), i + 1, files.length);
            this.render();
            if (!isSupportedImage(file.type) && !isSupportedImage(file.name)) {
                failures.push(fill(tp('unsupported', '{0}: save as JPEG first'), file.name));
                continue;
            }
            try {
                const exif = await readExif(file); // before resizing: the resized copy has no EXIF
                const { blob, width, height } = await resizeImage(file);
                const row = await this.store.addPhoto(this.entryId, { blob, width, height, ...exif });
                added++;
                if (this.destroyed) return;
                this.media = [...this.media, row];
            } catch (error) {
                console.error(error);
                failures.push(fill(tp('failed', '{0}: could not be uploaded'), file.name));
            }
        }
        if (this.destroyed) return;
        this.busy = false;
        this.status = '';
        this.errors = failures;
        this.render();
        if (added) await this._loadUrls();
    }
}
