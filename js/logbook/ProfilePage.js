/**
 * DecoTrail own profile: a live preview of how members see you, the avatar (12 presets or an uploaded
 * photo), display name, default visibility of new dives and home country; then the account (email, sign out).
 *
 * Upload and Remove photo act at once (the photo is its own storage object); everything else waits for Save.
 * Picking a preset while a photo is used replaces the photo on Save.
 */

import { AVATARS, AVATAR_KEYS, avatarHtml, avatarImgFallback, fallbackAvatarKey } from './avatars.js';
import { COUNTRY_CODES, OFFERED_VISIBILITIES, countryName, NICKNAME_MAX } from './community.js';
import { avatarBlob } from './photo.js';
import { translate } from '../i18n.js';
import { currentLang, fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { normalizeLogOffset, formatDiveDate } from './entryModel.js';
import { sacSummary, sacChartModel } from './sacStats.js';

const NAME_MAX = 60;
const PREVIEW_ROWS = 6;
const NB = '\u00a0';
const PLAN_DEPTH_M = 30;
const PLAN_TIME_MIN = 20;
const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const tp = (key, fallback) => tt(`profile.${key}`, fallback);
const ts = (key, fallback) => tp(`sac.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
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
        this.sac = null; // sacSummary of the logbook; null = not loaded / unsupported
        this.num = { offset: null, plan: null, busy: null, status: { kind: '', text: '' } }; // offset null = not loaded / unsupported
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
        this._loadNumbering();
        this._loadSac();
        await this._signPhoto();
    }

    async _loadNumbering() {
        if (typeof this.store.getLogOffset !== 'function') return;
        try {
            const offset = await this.store.getLogOffset();
            if (this.destroyed) return;
            this.num.offset = offset;
        } catch (error) {
            console.error(error); // the card simply stays hidden
            return;
        }
        this._renderNumbering();
    }

    async _loadSac() {
        if (typeof this.store.listEntries !== 'function') return;
        try {
            const summary = sacSummary(await this.store.listEntries());
            if (this.destroyed) return;
            this.sac = summary;
        } catch (error) {
            console.error(error); // the card simply stays hidden
            return;
        }
        this._renderSac();
    }

    /** Adopt a saved profile row: it becomes the draft. */
    _take(profile) {
        this.profile = profile;
        this.draft = {
            display_name: typeof profile.display_name === 'string' ? profile.display_name : '',
            nickname: typeof profile.nickname === 'string' ? profile.nickname : '',
            avatar_preset: Object.hasOwn(AVATARS, profile.avatar_preset ?? '') ? profile.avatar_preset : null,
            default_visibility: OFFERED_VISIBILITIES.includes(profile.default_visibility) ? profile.default_visibility : 'members',
            home_country: typeof profile.home_country === 'string' ? profile.home_country : '',
        };
        if (!profile.avatar_path) this.photoUrl = null;
        this.hasNickname = Object.hasOwn(profile, 'nickname'); // the column comes with migration 0010
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
        const nick = this.hasNickname ? (this.draft?.nickname ?? '').trim() : '';
        const name = (this.draft?.display_name ?? '').trim();
        return nick || name || tt('diver', 'Diver');
    }

    _readDom() {
        const form = this.host.querySelector('form.tr-profile-form');
        if (!form || !this.draft) return;
        this.draft.display_name = form.querySelector('[name="display_name"]').value;
        const nick = form.querySelector('[name="nickname"]');
        if (nick) this.draft.nickname = nick.value;
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
        if (this.hasNickname) patch.nickname = Array.from(this.draft.nickname.trim()).slice(0, NICKNAME_MAX).join('').trim() || null;
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

    async _saveOffset() {
        const n = this.num;
        if (n.busy) return;
        const input = this.host.querySelector('[name="log_offset"]');
        const raw = String(input?.value ?? '').trim();
        if (raw !== '' && !/^\d{1,5}$/.test(raw)) {
            this._numStatus('error', tp('offsetInvalid', 'Enter a whole number, 0 or more.'));
            return;
        }
        n.busy = 'offset';
        n.plan = null;
        this._renderNumbering(raw);
        try {
            n.offset = await this.store.setLogOffset(normalizeLogOffset(raw));
            n.status = { kind: 'ok', text: tp('offsetSaved', 'Saved ✓') };
        } catch (error) {
            console.error(error);
            n.status = { kind: 'error', text: this._errorText(error) };
        }
        n.busy = null;
        if (!this.destroyed) this._renderNumbering();
    }

    async _previewRenumber() {
        const n = this.num;
        if (n.busy) return;
        n.busy = 'plan';
        n.status = { kind: '', text: '' };
        this._renderNumbering();
        try {
            n.plan = await this.store.planRenumber();
            if (!n.plan.changes.length) n.status = { kind: 'ok', text: tp('renumberNothing', 'Your dives are already numbered by date.') };
        } catch (error) {
            console.error(error);
            n.plan = null;
            n.status = { kind: 'error', text: this._errorText(error) };
        }
        n.busy = null;
        if (!this.destroyed) this._renderNumbering();
    }

    async _confirmRenumber() {
        const n = this.num;
        if (n.busy || !n.plan) return;
        n.busy = 'renumber';
        this._renderNumbering();
        try {
            const count = await this.store.renumberByDate();
            n.status = { kind: 'ok', text: tp('renumbered', '{0} dives renumbered ✓').replace('{0}', count) };
        } catch (error) {
            console.error(error);
            n.status = { kind: 'error', text: this._errorText(error) };
        }
        n.plan = null;
        n.busy = null;
        if (!this.destroyed) this._renderNumbering();
    }

    _numStatus(kind, text) {
        this.num.status = { kind, text };
        const el = this.host.querySelector('.tr-numbering-status');
        if (!el) return;
        el.textContent = text;
        el.className = `tr-profile-status tr-numbering-status${kind ? ` tr-profile-status--${kind}` : ''}`;
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
        const full = (this.draft?.display_name ?? '').trim();
        const preset = this.draft?.avatar_preset ?? fallbackAvatarKey(this.user?.id);
        const avatar = avatarHtml({ preset, url: this._photoShown() ? this.photoUrl : null, name, id: this.user?.id, size: 96 });
        const country = countryName(this.draft?.home_country, lang);
        return `<span class="tr-member-head-av" aria-hidden="true">${avatar}</span>
            <div class="tr-member-head-text">
                <p class="tr-profile-preview-note">${escHtml(tp('previewNote', 'This is how other members see you.'))}</p>
                <p class="tr-member-head-name">${escHtml(name)}</p>
                ${full && full !== name ? `<p class="tr-member-head-full">${escHtml(full)}</p>` : ''}
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
                <div class="tr-profile-names${this.hasNickname ? ' tr-profile-names--two' : ''}">
                <label class="lb-field tr-profile-name"><span>${escHtml(tp('name', 'Display name'))}</span>
                    <input type="text" name="display_name" maxlength="${NAME_MAX}" value="${escHtml(d.display_name)}" placeholder="${escHtml(tt('diver', 'Diver'))}" autocomplete="${this.hasNickname ? 'name' : 'nickname'}" aria-describedby="tr-name-help">
                    <span class="tr-profile-hint" id="tr-name-help">${escHtml(this.hasNickname ? tp('nameHelpNick', 'Your full name, e.g. “Jaroslav Fiala”.') : tp('nameHelp', 'Shown next to your dives. Leave it empty to appear as “Diver”.'))}</span></label>
                ${this.hasNickname ? `<label class="lb-field tr-profile-nick"><span>${escHtml(tp('nickname', 'Nickname'))}</span>
                    <input type="text" name="nickname" maxlength="${NICKNAME_MAX}" value="${escHtml(d.nickname)}" autocomplete="nickname" aria-describedby="tr-nick-help">
                    <span class="tr-profile-hint" id="tr-nick-help">${escHtml(tp('nicknameHelp', 'What friends call you, e.g. “Luis”. Shown instead of your name.'))}</span></label>` : ''}
                </div>
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
            <div class="rda-card tr-sac" hidden></div>
            <div class="rda-card tr-numbering" hidden></div>
            <div class="rda-card tr-profile-account">
                <h3 class="tr-section-head">${escHtml(tp('account', 'Account'))}</h3>
                <p class="tr-profile-email">${escHtml(before)}<strong>${escHtml(email)}</strong>${escHtml(after)}</p>
                <p class="tr-profile-hint">${escHtml(tp('emailPrivate', 'Your email is never shown to other members.'))}</p>
                <button type="button" class="btn btn-secondary" id="tr-signout">${escHtml(tp('signOut', 'Sign out'))}</button>
            </div>
        </div>`;
        this._wire();
        this._renderSac();
        this._renderNumbering();
        if (this.busy) this._setBusy(this.busy);
    }

    _sacChartHtml(points, lang) {
        const m = sacChartModel(points);
        const grid = m.ticks.map(t => `<line class="tr-sac-grid" x1="${m.plotLeft}" x2="${m.plotRight}" y1="${t.y}" y2="${t.y}"/>`
            + `<text class="tr-sac-tick" x="${m.plotLeft - 6}" y="${t.y}" text-anchor="end" dominant-baseline="middle">${fmtNum(t.value, 0)}</text>`).join('');
        const dots = m.dots.map((d, i) => {
            const p = points[i];
            const label = fill(ts('dot', '{0}, {1}'), formatDiveDate(p.date, lang), `${fmtNum(p.sacLpm, 1)}${NB}l/min`);
            return `<a class="tr-sac-dot${d.used ? '' : ' tr-sac-dot-off'}" href="#/dive/${escHtml(d.id)}" aria-label="${escHtml(label)}">`
                + `<title>${escHtml(label)}</title><circle class="tr-sac-hit" cx="${Math.round(d.x * 10) / 10}" cy="${Math.round(d.y * 10) / 10}" r="15"/>`
                + `<circle class="tr-sac-pt" cx="${Math.round(d.x * 10) / 10}" cy="${Math.round(d.y * 10) / 10}" r="4"/></a>`;
        }).join('');
        const first = formatDiveDate(points[0].date, lang);
        const last = formatDiveDate(points.at(-1).date, lang);
        return `<svg class="tr-sac-chart" viewBox="0 0 ${m.width} ${m.height}" role="group" aria-label="${escHtml(ts('chart', 'SAC per dive'))}">
                ${grid}<text class="tr-sac-tick" x="${m.plotLeft - 6}" y="6" text-anchor="end" dominant-baseline="middle">l/min</text><path class="tr-sac-line" d="${m.line}"/>${dots}</svg>
            <p class="tr-sac-axis"><span>${escHtml(first)}</span><span>${escHtml(last)}</span></p>`;
    }

    _sacHtml() {
        const s = this.sac;
        const lang = currentLang();
        const head = `<h3 class="tr-section-head">${escHtml(ts('title', 'Gas consumption'))}</h3>`;
        if (!s.points.length) return `${head}<p class="tr-profile-hint">${escHtml(ts('none', 'Add cylinder pressures and an average depth to your dives and your SAC shows up here.'))}</p>`;
        const val = v => (v === null ? '–' : `${fmtNum(v, 1)}<span class="lb-unit">${NB}l/min</span>`);
        const tile = (label, v) => `<div class="lb-stat"><dt>${escHtml(label)}</dt><dd>${val(v)}</dd></div>`;
        const recent = s.recentLpm === null ? '' : tile(fill(ts('recent', 'Last {0} dives'), s.recentCount), s.recentLpm);
        const plan = s.overallLpm === null ? '' : `<a class="tr-sac-plan" href="../sandbox/index.html?v=1&amp;d=${PLAN_DEPTH_M}&amp;t=${PLAN_TIME_MIN}&amp;sac=${Math.round(s.overallLpm * 10) / 10}">${escHtml(ts('plan', 'Plan a dive with this SAC →'))}</a>`;
        const off = s.points.some(p => !p.used) ? ` ${escHtml(ts('notCounted', 'Hollow dots are not counted.'))}` : '';
        return `${head}
            <dl class="lb-stats tr-sac-stats">${tile(ts('overall', 'Your SAC'), s.overallLpm)}${recent}</dl>
            <p class="tr-profile-hint">${escHtml(fill(ts('counted', 'Dives counted: {0}'), s.count))}</p>
            ${this._sacChartHtml(s.points, lang)}
            <p class="tr-profile-hint">${escHtml(ts('note', 'Litres per minute at the surface, from your cylinder pressures and weighted by dive time. Dives under 10 min, outside 3–60 l/min or far from your usual are left out.'))}${off}</p>
            ${plan}`;
    }

    _renderSac() {
        const el = this.host.querySelector('.tr-sac');
        if (!el || this.destroyed) return;
        if (this.sac === null) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = this._sacHtml();
    }

    _numberingHtml(typed) {
        const n = this.num;
        const busy = Boolean(n.busy);
        const value = typed ?? String(n.offset);
        let plan = '';
        if (n.plan?.changes.length) {
            const rows = n.plan.changes.slice(0, PREVIEW_ROWS)
                .map(c => `<li><span>#${c.from ?? '–'}</span> → <strong>#${c.to}</strong></li>`).join('');
            const more = n.plan.changes.length - PREVIEW_ROWS;
            plan = `<div class="lb-confirm tr-renumber-plan" role="alertdialog" aria-label="${escHtml(tp('renumberConfirmLabel', 'Confirm renumbering'))}">
                <p>${escHtml(tp('renumberPreview', '{0} dives get a new number, in date order, after your {1} earlier dives:').replace('{0}', n.plan.changes.length).replace('{1}', n.plan.offset))}</p>
                <ul class="tr-renumber-list">${rows}</ul>
                ${more > 0 ? `<p class="tr-profile-hint">${escHtml(tp('renumberMore', '…and {0} more').replace('{0}', more))}</p>` : ''}
                <div class="lb-actions"><button type="button" class="btn btn-primary" id="tr-renumber-yes"${busy ? ' disabled' : ''}>${escHtml(n.busy === 'renumber' ? tp('renumbering', 'Renumbering…') : tp('renumberConfirm', 'Renumber'))}</button>
                <button type="button" class="btn btn-secondary" id="tr-renumber-no"${busy ? ' disabled' : ''}>${escHtml(tp('cancel', 'Cancel'))}</button></div></div>`;
        }
        return `<h3 class="tr-section-head">${escHtml(tp('numbering', 'Dive numbering'))}</h3>
            <form class="tr-offset-form" novalidate>
                <label class="lb-field"><span>${escHtml(tp('offset', 'Dives logged before DecoTrail'))}</span>
                    <input type="number" name="log_offset" inputmode="numeric" min="0" max="99999" step="1" value="${escHtml(value)}" aria-describedby="tr-offset-help"${busy ? ' disabled' : ''}>
                    <span class="tr-profile-hint" id="tr-offset-help">${escHtml(tp('offsetHelp', 'New dives are numbered after this count, so your DecoTrail log continues your earlier logbook.'))}</span></label>
                <div class="lb-actions tr-profile-actions">
                    <button type="submit" class="btn btn-primary" id="tr-offset-save"${busy ? ' disabled' : ''}>${escHtml(n.busy === 'offset' ? tp('saving', 'Saving…') : tp('save', 'Save'))}</button>
                    <button type="button" class="btn btn-secondary" id="tr-renumber"${busy || n.plan ? ' disabled' : ''}>${escHtml(n.busy === 'plan' ? tp('renumberChecking', 'Checking…') : tp('renumber', 'Renumber all dives by date'))}</button>
                </div>
            </form>
            <p class="tr-profile-hint">${escHtml(tp('renumberHelp', 'Numbers your dives 1, 2, 3… after that count, oldest first. You see what changes before anything happens.'))}</p>
            ${plan}
            <p class="tr-profile-status tr-numbering-status${n.status.kind ? ` tr-profile-status--${n.status.kind}` : ''}" role="status">${escHtml(n.status.text)}</p>`;
    }

    _renderNumbering(typed) {
        const el = this.host.querySelector('.tr-numbering');
        if (!el || this.destroyed) return;
        if (this.num.offset === null) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = this._numberingHtml(typed);
        el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); this._saveOffset(); });
        el.querySelector('[name="log_offset"]').addEventListener('input', () => {
            if (this.num.plan) { // the plan was for the old offset: drop it without re-rendering (keeps focus)
                this.num.plan = null;
                el.querySelector('.tr-renumber-plan')?.remove();
                el.querySelector('#tr-renumber').disabled = false;
            }
            if (this.num.status.kind) this._numStatus('', '');
        });
        el.querySelector('#tr-renumber').addEventListener('click', () => this._previewRenumber());
        el.querySelector('#tr-renumber-yes')?.addEventListener('click', () => this._confirmRenumber());
        el.querySelector('#tr-renumber-no')?.addEventListener('click', () => { this.num.plan = null; this._renderNumbering(); });
        if (this.num.plan && this.num.busy === null) el.querySelector('#tr-renumber-yes')?.focus({ preventScroll: true });
    }

    _wire() {
        const form = this.host.querySelector('form.tr-profile-form');
        form.addEventListener('submit', e => { e.preventDefault(); this._save(); });
        form.addEventListener('input', e => {
            if (e.target.name === 'display_name' || e.target.name === 'nickname' || e.target.name === 'home_country') {
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
