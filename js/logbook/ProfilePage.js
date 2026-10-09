/**
 * DecoTrail own profile: a live preview of how members see you, the avatar (12 presets or an uploaded
 * photo), display name, default visibility of new dives and home country; then the account (email, sign out).
 *
 * Upload and Remove photo act at once (the photo is its own storage object); everything else waits for Save.
 * Picking a preset while a photo is used replaces the photo on Save.
 */

import { AVATARS, AVATAR_KEYS, avatarHtml, avatarImgFallback, fallbackAvatarKey } from './avatars.js';
import { COUNTRY_CODES, OFFERED_VISIBILITIES, countryName } from './community.js';
import { avatarBlob } from './photo.js';
import { translate } from '../i18n.js';
import { currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const NAME_MAX = 60;
const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const tp = (key, fallback) => tt(`profile.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const VIS_FALLBACK = {
    private: ['Private', 'Only you.'],
    members: ['Members', 'Everyone invited to DecoTrail. Your notes stay private.'],
};

/** Options of the home-country select: "—" (none) first, then every country sorted by its name in `lang`. */
export function countryOptions(lang) {
    const named = COUNTRY_CODES.map(code => ({ code, name: countryName(code, lang) }));
    named.sort((a, b) => a.name.localeCompare(b.name, lang || 'en'));
    return [{ code: '', name: '—' }, ...named];
}

export class ProfilePage {
    /**
     * @param {HTMLElement} host
     * @param {Object} options
     * @param {Object} options.store - DiveStore with the community API
     * @param {{id: string, email?: string}} options.user - the signed-in user
     * @param {() => void} [options.onSignOut] - default: store.signOut()
     * @param {(error: Error) => void} [options.onError] - loading the profile failed (default: a message in place)
     */
    constructor(host, { store, user, onSignOut = null, onError = null }) {
        this.host = host;
        this.store = store;
        this.user = user;
        this.onSignOut = onSignOut;
        this.onError = onError;
        this.profile = undefined; // undefined while loading
        this.draft = null; // { display_name, avatar_preset, default_visibility, home_country } as typed
        this.photoUrl = null; // signed URL of the uploaded photo (or, right after an upload, a local object URL)
        this._localUrl = null; // object URL to revoke
        this.pickedPreset = false; // a preset was picked while a photo is used: Save replaces the photo
        this.busy = null; // null | 'save' | 'upload' | 'remove'
        this.status = { kind: '', text: '' };
        this.failed = false;
        this.destroyed = false;
        this._onImgError = e => { if (avatarImgFallback(e)) this.photoUrl = null; };
        this.host.addEventListener('error', this._onImgError, true); // image errors do not bubble
        this._render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this._revokeLocal();
        this.host.removeEventListener('error', this._onImgError, true);
        this.host.innerHTML = '';
    }

    /** Language changed: re-render, keeping what was typed. */
    relabel() {
        if (this.destroyed) return;
        this._readDom();
        this._render();
    }

    async _load() {
        let profile;
        try {
            profile = await this.store.getMyProfile();
        } catch (error) {
            if (this.destroyed) return;
            if (this.onError) this.onError(error);
            else {
                console.error(error);
                this.failed = true;
                this._render();
            }
            return;
        }
        if (this.destroyed) return;
        this._take(profile ?? { id: this.user?.id });
        this._render();
        await this._signPhoto();
    }

    /** Adopt a saved profile row: it becomes the draft. */
    _take(profile) {
        this.profile = profile;
        this.draft = {
            display_name: typeof profile.display_name === 'string' ? profile.display_name : '',
            avatar_preset: Object.hasOwn(AVATARS, profile.avatar_preset ?? '') ? profile.avatar_preset : null,
            default_visibility: OFFERED_VISIBILITIES.includes(profile.default_visibility) ? profile.default_visibility : 'members',
            home_country: typeof profile.home_country === 'string' ? profile.home_country : '',
        };
        if (!profile.avatar_path) this.photoUrl = null;
    }

    async _signPhoto() {
        const path = this.profile?.avatar_path;
        if (!path || !this.store.avatarUrls) return;
        try {
            const url = (await this.store.avatarUrls([path]))?.get(path) ?? null;
            if (this.destroyed || this.profile?.avatar_path !== path || !url) return;
            this.photoUrl = url;
            this._renderPreview();
            this._revokeLocal();
        } catch (error) {
            console.error(error); // the preset stays in the preview
        }
    }

    _revokeLocal() {
        if (this._localUrl) URL.revokeObjectURL?.(this._localUrl);
        this._localUrl = null;
    }

    // ---- State helpers ----

    /** Whether the uploaded photo is what members see (and keep seeing after Save). */
    _photoShown() {
        return Boolean(this.profile?.avatar_path) && !this.pickedPreset;
    }

    _name() {
        const name = (this.draft?.display_name ?? '').trim();
        return name || tt('diver', 'Diver');
    }

    _readDom() {
        const form = this.host.querySelector('form.tr-profile-form');
        if (!form || !this.draft) return;
        this.draft.display_name = form.querySelector('[name="display_name"]').value;
        const preset = form.querySelector('[name="avatar_preset"]:checked')?.value;
        if (preset) this.draft.avatar_preset = preset;
        this.draft.default_visibility = form.querySelector('[name="default_visibility"]:checked')?.value ?? this.draft.default_visibility;
        this.draft.home_country = form.querySelector('[name="home_country"]').value;
    }

    _setStatus(kind, text) {
        this.status = { kind, text };
        const el = this.host.querySelector('.tr-profile-status');
        if (!el) return;
        el.textContent = text;
        el.className = `tr-profile-status${kind ? ` tr-profile-status--${kind}` : ''}`;
    }

    _errorText(error) {
        return error?.kind === 'unreachable'
            ? tb('unreachable', 'Can\'t reach your dive log. Please try again later.')
            : tb('genericError', 'Something went wrong. Please try again.');
    }

    /** Disable or enable every control while a request runs, without re-rendering (keeps focus and typing). */
    _setBusy(busy) {
        this.busy = busy;
        for (const el of this.host.querySelectorAll('.tr-profile-form button, .tr-profile-form input[type="file"]')) el.disabled = Boolean(busy);
        this.host.querySelector('.tr-avatar-upload')?.classList.toggle('lb-disabled', Boolean(busy));
        const save = this.host.querySelector('#tr-profile-save');
        if (save) save.textContent = busy === 'save' ? tp('saving', 'Saving…') : tp('save', 'Save');
    }

    // ---- Actions ----

    async _save() {
        if (this.busy || !this.draft) return;
        this._readDom();
        const name = Array.from(this.draft.display_name.trim()).slice(0, NAME_MAX).join('').trim();
        const patch = {
            display_name: name || null,
            avatar_preset: this.draft.avatar_preset,
            default_visibility: this.draft.default_visibility,
            home_country: this.draft.home_country || null,
        };
        const replacePhoto = this.pickedPreset && Boolean(this.profile?.avatar_path);
        this._setBusy('save');
        this._setStatus('', '');
        try {
            let saved = await this.store.saveProfile(patch);
            if (replacePhoto) saved = await this.store.removeAvatar();
            if (this.destroyed) return;
            this.pickedPreset = false;
            this._take(saved);
            this.busy = null;
            this.status = { kind: 'ok', text: tp('saved', 'Saved ✓') };
            this._render();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this._setBusy(null);
            this._setStatus('error', this._errorText(error));
        }
    }

    async _upload(input) {
        const file = input.files?.[0];
        input.value = '';
        if (!file || this.busy) return;
        this._readDom();
        this._setBusy('upload');
        this._setStatus('', tp('uploading', 'Uploading photo…'));
        try {
            let blob;
            try {
                blob = await avatarBlob(file);
            } catch (error) {
                if (error?.message !== 'unreadable-image') throw error;
                if (this.destroyed) return;
                this._setBusy(null);
                this._setStatus('error', tp('unreadable', 'Couldn’t read this image. Choose a JPEG, PNG or WebP photo.'));
                return;
            }
            const saved = await this.store.uploadAvatar(blob);
            if (this.destroyed) return;
            this.profile = saved;
            this.pickedPreset = false;
            // A local preview right away; the signed URL replaces it (members see that one).
            this._revokeLocal();
            this._localUrl = URL.createObjectURL?.(blob) ?? null;
            this.photoUrl = this._localUrl;
            this.busy = null;
            this.status = { kind: 'ok', text: tp('uploaded', 'Photo uploaded ✓') };
            this._render();
            this.host.querySelector('.tr-avatar-upload input')?.focus({ preventScroll: true });
            this._revealPreview();
            await this._signPhoto();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this._setBusy(null);
            this._setStatus('error', this._errorText(error));
        }
    }

    async _removePhoto() {
        if (this.busy) return;
        this._readDom();
        this._setBusy('remove');
        this._setStatus('', '');
        try {
            const saved = await this.store.removeAvatar();
            if (this.destroyed) return;
            this.profile = saved;
            this.photoUrl = null;
            this.pickedPreset = false;
            this.busy = null;
            this.status = { kind: 'ok', text: tp('removed', 'Photo removed ✓') };
            this._render();
            this.host.querySelector('.tr-avatar-upload input')?.focus();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this._setBusy(null);
            this._setStatus('error', this._errorText(error));
        }
    }

    async _signOut() {
        try {
            if (this.onSignOut) await this.onSignOut();
            else await this.store.signOut();
        } catch (error) {
            console.error(error);
            if (!this.destroyed) this._setStatus('error', this._errorText(error));
        }
    }

    // ---- Rendering ----

    _previewHtml() {
        const lang = currentLang();
        const name = this._name();
        const preset = this.draft?.avatar_preset ?? fallbackAvatarKey(this.user?.id);
        const avatar = avatarHtml({ preset, url: this._photoShown() ? this.photoUrl : null, name, id: this.user?.id, size: 96 });
        const country = countryName(this.draft?.home_country, lang);
        return `<span class="tr-member-head-av" aria-hidden="true">${avatar}</span>
            <div class="tr-member-head-text">
                <p class="tr-profile-preview-note">${escHtml(tp('previewNote', 'This is how other members see you.'))}</p>
                <p class="tr-member-head-name">${escHtml(name)}</p>
                ${country ? `<p class="tr-member-head-country">${escHtml(country)}</p>` : ''}
            </div>`;
    }

    /** Bring the preview into view (the new photo shows there), unless it is already visible. */
    _revealPreview() {
        const el = this.host.querySelector('.tr-profile-preview');
        const r = el?.getBoundingClientRect?.();
        if (r && (r.bottom < 0 || r.top > (globalThis.innerHeight ?? 0) - 40)) el.scrollIntoView?.({ block: 'start' });
    }

    _renderPreview() {
        const el = this.host.querySelector('.tr-profile-preview');
        if (el) el.innerHTML = this._previewHtml();
    }

    _avatarGridHtml() {
        const lang = currentLang();
        const checked = this._photoShown() ? null : this.draft.avatar_preset;
        return AVATAR_KEYS.map(key => {
            const label = AVATARS[key].label[lang] ?? AVATARS[key].label.en;
            return `<label class="tr-avatar-opt"><input type="radio" name="avatar_preset" value="${key}" aria-label="${escHtml(label)}"${key === checked ? ' checked' : ''}>
                ${avatarHtml({ preset: key, name: label, size: 56 })}</label>`;
        }).join('');
    }

    _visibilityHtml() {
        return OFFERED_VISIBILITIES.map(value => {
            const [label, help] = VIS_FALLBACK[value];
            return `<label class="lb-vis-option"><input type="radio" name="default_visibility" value="${value}"${value === this.draft.default_visibility ? ' checked' : ''}>
                <span class="lb-vis-text"><span class="lb-vis-label">${escHtml(tt(`form.visibility.${value}`, label))}</span>
                <span class="lb-vis-help">${escHtml(tt(`form.visibilityHelp.${value}`, help))}</span></span></label>`;
        }).join('');
    }

    _render() {
        if (this.destroyed) return;
        if (this.failed) {
            this.host.innerHTML = `<p class="rda-account-msg" role="alert">${escHtml(tb('genericError', 'Something went wrong. Please try again.'))}</p>`;
            return;
        }
        if (this.profile === undefined) {
            this.host.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
            return;
        }
        const lang = currentLang();
        const d = this.draft;
        const hasPhoto = Boolean(this.profile.avatar_path);
        const countries = countryOptions(lang).map(o => `<option value="${o.code}"${o.code === d.home_country ? ' selected' : ''}>${escHtml(o.name)}</option>`).join('');
        const email = this.user?.email ?? '';
        const [before, after = ''] = tp('signedInAs', 'Signed in as {0}').split('{0}');
        const status = this.status;
        this.host.innerHTML = `<div class="tr-profile">
            <h2 class="tr-feed-title">${escHtml(tp('title', 'Your profile'))}</h2>
            <div class="tr-member-head tr-profile-preview">${this._previewHtml()}</div>
            <form class="rda-card lb-form tr-profile-form" novalidate>
                <fieldset class="tr-avatar-field">
                    <legend>${escHtml(tp('avatar', 'Avatar'))}</legend>
                    <div class="tr-avatar-grid">${this._avatarGridHtml()}</div>
                    <p class="tr-profile-hint" id="tr-replace-note"${this.pickedPreset && hasPhoto ? '' : ' hidden'}>${escHtml(tp('replaceNote', 'Saving replaces your photo with this avatar.'))}</p>
                    <div class="tr-avatar-actions">
                        <label class="btn btn-secondary tr-avatar-upload"><span>${escHtml(tp('upload', 'Upload photo'))}</span>
                            <input type="file" id="tr-avatar-file" accept="image/*" class="rda-visually-hidden"></label>
                        ${hasPhoto ? `<button type="button" class="btn btn-secondary" id="tr-avatar-remove">${escHtml(tp('remove', 'Remove photo'))}</button>` : ''}
                    </div>
                </fieldset>
                <label class="lb-field tr-profile-name"><span>${escHtml(tp('name', 'Display name'))}</span>
                    <input type="text" name="display_name" maxlength="${NAME_MAX}" value="${escHtml(d.display_name)}" placeholder="${escHtml(tt('diver', 'Diver'))}" autocomplete="nickname" aria-describedby="tr-name-help">
                    <span class="tr-profile-hint" id="tr-name-help">${escHtml(tp('nameHelp', 'Shown next to your dives. Leave it empty to appear as “Diver”.'))}</span></label>
                <fieldset class="lb-field lb-visibility">
                    <legend>${escHtml(tp('defaultVisibility', 'Who sees your new dives'))}</legend>
                    <div class="lb-vis-options">${this._visibilityHtml()}</div>
                    <p class="tr-profile-hint">${escHtml(tp('defaultVisibilityHelp', 'You can change it for each dive.'))}</p>
                </fieldset>
                <label class="lb-field"><span>${escHtml(tp('country', 'Home country'))}</span>
                    <select name="home_country" autocomplete="country">${countries}</select></label>
                <div class="lb-actions tr-profile-actions">
                    <button type="submit" class="btn btn-primary" id="tr-profile-save">${escHtml(tp('save', 'Save'))}</button>
                    <p class="tr-profile-status${status.kind ? ` tr-profile-status--${status.kind}` : ''}" role="status">${escHtml(status.text)}</p>
                </div>
            </form>
            <div class="rda-card tr-profile-account">
                <h3 class="tr-section-head">${escHtml(tp('account', 'Account'))}</h3>
                <p class="tr-profile-email">${escHtml(before)}<strong>${escHtml(email)}</strong>${escHtml(after)}</p>
                <p class="tr-profile-hint">${escHtml(tp('emailPrivate', 'Your email is never shown to other members.'))}</p>
                <button type="button" class="btn btn-secondary" id="tr-signout">${escHtml(tp('signOut', 'Sign out'))}</button>
            </div>
        </div>`;
        this._wire();
        if (this.busy) this._setBusy(this.busy);
    }

    _wire() {
        const form = this.host.querySelector('form.tr-profile-form');
        form.addEventListener('submit', e => { e.preventDefault(); this._save(); });
        form.addEventListener('input', e => {
            if (e.target.name === 'display_name' || e.target.name === 'home_country') {
                this._readDom();
                this._renderPreview();
            }
            if (this.status.kind) this._setStatus('', '');
        });
        form.addEventListener('change', e => {
            const name = e.target.name;
            if (name === 'avatar_preset') {
                this.draft.avatar_preset = e.target.value;
                if (this.profile?.avatar_path) this.pickedPreset = true;
                const note = this.host.querySelector('#tr-replace-note');
                if (note) note.hidden = !(this.pickedPreset && this.profile?.avatar_path);
                this._renderPreview();
            } else if (name === 'home_country') {
                this._readDom();
                this._renderPreview();
            }
            if (this.status.kind && e.target.type !== 'file') this._setStatus('', '');
        });
        this.host.querySelector('#tr-avatar-file').addEventListener('change', e => this._upload(e.target));
        this.host.querySelector('#tr-avatar-remove')?.addEventListener('click', () => this._removePhoto());
        this.host.querySelector('#tr-signout').addEventListener('click', () => this._signOut());
    }
}
