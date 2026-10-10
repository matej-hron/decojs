/**
 * Dive detail screen: facts, site with a small map, photos, video links and
 * the Edit / Analysis / Add photos / Add video link / Delete actions.
 * With `readOnly` (another member's dive) it shows an author row instead and
 * offers nothing that writes; notes are never shown then.
 *
 * `detailRows` and `isHttpsUrl` are pure and covered by tests.
 */

import { CHOICES, TAGS } from './EntryForm.js';
import { DETAIL_KEYS, formatDiveDate, formatDuration } from './entryModel.js';
import { routeHref } from './router.js';
import { readExif, resizeImage, isSupportedImage } from './photo.js';
import { loadLeaflet, TILE_URL, TILE_ATTRIBUTION } from './SitePicker.js';
import { gasName } from '../import/recordedDive.js';
import { gasesFromEntry, gasUsage, cylinderText } from './gasModel.js';
import { diveTitle, feedStats } from './feed.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { avatarImgFallback } from './avatars.js';
import { ShareCard } from './ShareCard.js';
import { SocialController, ts } from './SocialBar.js';
import { CommentsSection } from './CommentsSection.js';

const NB = ' ';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Unit shown after the value of a numeric detail. */
const DETAIL_UNITS = Object.freeze({
    surfaceTempC: '°C', airTempC: '°C',
    weightsKg: 'kg', suitMm: 'mm', avgDepthM: 'm',
});
const NUMERIC = new Set(Object.keys(DETAIL_UNITS));

const present = v => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''));

/** True for a well-formed https:// link without whitespace. */
export function isHttpsUrl(text) {
    const s = String(text ?? '');
    if (s === '' || /\s/.test(s)) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'https:' && u.hostname !== '';
    } catch {
        return false;
    }
}

/**
 * Rows of the detail card. Empty values are left out.
 * @param {Object} entry - log_entries row
 * @param {(key: string) => string} t - label lookup below `diveLog.logbook.`
 * @returns {{core: {key: string, label: string, value: string}[], groups: {group: string, rows: Object[]}[], notes: string|null}}
 */
export function detailRows(entry, t) {
    const core = [];
    const add = (list, key, value, labelKey = `detail.label.${key}`) => {
        if (value !== null) list.push({ key, label: t(labelKey), value });
    };
    const num = (v, decimals, unit) => (v === null || v === undefined ? null : `${fmtNum(v, decimals)}${NB}${unit}`);

    add(core, 'duration', formatDuration(entry.duration_s) === '' ? null : `${formatDuration(entry.duration_s)}${NB}min`);
    add(core, 'depth', num(entry.max_depth_m, 1, 'm'));
    add(core, 'gas', entry.gas && Number.isFinite(entry.gas.o2) ? gasName({ o2: entry.gas.o2, he: entry.gas.he ?? 0 }) : null);
    add(core, 'waterTemp', num(entry.water_temp_c, 1, '°C'));
    const surface = entry.details?.surfaceTempC;
    add(core, 'surfaceTempC', !present(surface) ? null : Number.isFinite(Number(surface)) ? `${fmtNum(surface)}${NB}°C` : String(surface));
    add(core, 'visShallow', num(entry.vis_shallow_m, 1, 'm'));
    add(core, 'visDeep', num(entry.vis_deep_m, 1, 'm'));
    add(core, 'buddies', entry.buddies?.length ? entry.buddies.join(', ') : null);

    const details = entry.details ?? {};
    const groups = [];
    for (const [group, keys] of Object.entries(DETAIL_KEYS)) {
        const rows = [];
        for (const key of keys) {
            const v = details[key];
            if (!present(v)) continue;
            let value;
            if (NUMERIC.has(key)) value = Number.isFinite(Number(v)) ? `${fmtNum(v)}${NB}${DETAIL_UNITS[key]}` : String(v);
            else if (key === 'rating') value = `${fmtNum(v)}${NB}/${NB}5`;
            else if (key === 'tags') {
                value = (Array.isArray(v) ? v : [v]).map(tag => (TAGS.includes(tag) ? t(`form.choices.tags.${tag}`) : String(tag))).join(', ');
            } else if (CHOICES[key]) value = CHOICES[key].includes(v) ? t(`form.choices.${key}.${v}`) : String(v);
            else value = String(v);
            rows.push({ key, label: t(`detail.label.${key}`), value });
        }
        if (rows.length) groups.push({ group, rows });
    }
    const notes = typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : null;
    return { core, groups, notes };
}

/**
 * Gas cards of the detail screen (new `details.gases` or the legacy single cylinder) and the
 * consumption summary. Empty strings for what is not known; `fill` is the remaining gas in %.
 * @param {Object} entry - log_entries row
 * @param {(key: string) => string} t - label lookup below `diveLog.logbook.`
 * @param {(value: number, decimals?: number) => string} fmt - number formatting (fmtNum)
 * @returns {{cards: Object[], summary: ?string}}
 */
export function gasCards(entry, t, fmt) {
    const rows = gasesFromEntry(entry);
    const usage = gasUsage(rows, { durationS: entry.duration_s, avgDepthM: entry.details?.avgDepthM });
    const material = m => t(`form.choices.cylinderMaterial.${m}`);
    const cards = rows.map((r, i) => {
        const u = usage.rows[i];
        const known = v => v !== null && v !== undefined;
        let pressures = '';
        if (known(r.startBar) && known(r.endBar)) pressures = `${fmt(r.startBar)} → ${fmt(r.endBar)}${NB}bar`;
        else if (known(r.startBar)) pressures = `${fmt(r.startBar)}${NB}bar`;
        const used = u.usedBar === null ? ''
            : `${u.usedBar > 0 ? '−' : ''}${fmt(u.usedBar)}${NB}bar${u.usedL === null ? '' : ` · ${fmt(u.usedL, 0)}${NB}l`}`;
        return {
            role: r.role,
            roleLabel: t(r.role === 'deco' ? 'detail.roleDeco' : 'detail.roleBottom'),
            mix: Number.isFinite(r.o2) ? gasName({ o2: r.o2, he: r.he ?? 0 }) : t('detail.mixUnknown'),
            cylinder: cylinderText(r, { fmt, material }),
            pressures,
            used,
            fill: u.usedBar !== null && r.startBar > 0 ? Math.round((r.endBar / r.startBar) * 100) : null,
        };
    });
    let summary = null;
    if (usage.totalL !== null) {
        summary = `${t('detail.gasUsed')} ${fmt(usage.totalL, 0)}${NB}l`;
        if (usage.sacLpm !== null) summary += ` · ${t('detail.sac')} ${fmt(usage.sacLpm, 1)}${NB}l/min`;
    }
    return { cards, summary };
}

const td = (key, fallback) => translate(`diveLog.logbook.detail.${key}`, fallback ?? key);
const tp = (key, fallback) => translate(`diveLog.logbook.photo.${key}`, fallback ?? key);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const label = key => translate(`diveLog.logbook.${key}`, key);
const TITLE_FALLBACK = { 'feed.untitled': 'Dive #{0}', 'feed.untitledNoNumber': 'Dive' };
const STAT_FALLBACK = { depth: 'Max depth', duration: 'Time', avgDepth: 'Avg depth', temp: 'Water', gas: 'Gas' };
const VISIBILITY_FALLBACK = { private: 'Private', members: 'Visible to members', link: 'Public link' };

export class EntryDetail {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {Object} options.store
     * @param {Object} options.entry - log_entries row
     * @param {() => void} options.onDeleted - called after the entry was deleted
     * @param {(error: Error) => void} [options.onError] - for failures the screen cannot show itself
     * @param {boolean} [options.readOnly] - another member's dive: no edit, delete, upload or notes
     * @param {{name: string, avatarHtml: string, href: ?string}|null} [options.author] - author row (read-only view; no link without href)
     * @param {string|false} [options.backHref] - target of the back link (default: My dives; read-only: the Feed); false: none
     * @param {string|false} [options.analysisHref] - target of the Analysis button (default: the analysis route); false: none
     * @param {{store: Object, userId: string}|null} [options.social] - kudos and comments (migration 0010), when available
     * @param {number|null} [options.kudosCount] - the share page: a kudos count only, no names, no comments
     */
    constructor(container, { store, entry, onDeleted, onError, readOnly = false, author = null, backHref = null, analysisHref = null, social = null, kudosCount = null }) {
        this.container = container;
        this.store = store;
        this.entry = entry;
        this.readOnly = Boolean(readOnly);
        this.author = author;
        this.backHref = backHref === false ? null : backHref ?? routeHref({ name: this.readOnly ? 'feed' : 'list' });
        this.analysisHref = analysisHref;
        this.shareCard = null;
        this.social = social;
        this.socialOn = false; // the backend has kudos and comments
        this.socialCtl = null;
        this.comments = null;
        this.kudosCount = kudosCount;
        this.togglingComments = false;
        this.onDeleted = onDeleted;
        this.onError = onError;
        this.destroyed = false;
        this.site = null;
        this.loaded = false;
        this._urlRetried = false;
        this.media = [];
        this.urls = new Map();
        this.confirm = null; // { kind: 'entry' } | { kind: 'media', media }
        this.videoOpen = false;
        this.status = ''; // progress line while uploading
        this.errors = []; // per-file failures
        this.busy = false;
        this.map = null;
        this.viewer = null;
        this._onKey = e => { if (e.key === 'Escape' && this.viewer) this._closeViewer(); };
        document.addEventListener('keydown', this._onKey);
        this._onImgError = e => avatarImgFallback(e); // an author photo that fails falls back to the preset
        this.container.addEventListener('error', this._onImgError, true);
        this.container.innerHTML = `<section class="rda-card lb-detail"><div class="lb-d-main"></div><div class="lb-d-media"></div><div class="lb-d-social"></div><div class="lb-d-share"></div><div class="lb-d-actions"></div><div class="lb-d-panel"></div><div class="lb-d-comments"></div></section>`;
        this.main = this.container.querySelector('.lb-d-main');
        this.mediaEl = this.container.querySelector('.lb-d-media');
        this.actionsEl = this.container.querySelector('.lb-d-actions');
        this.panel = this.container.querySelector('.lb-d-panel');
        this.shareEl = this.container.querySelector('.lb-d-share');
        this.socialEl = this.container.querySelector('.lb-d-social');
        this.commentsEl = this.container.querySelector('.lb-d-comments');
        this._onSocialClick = e => this.socialCtl?.onClick(e);
        this.socialEl.addEventListener('click', this._onSocialClick);
        this.renderMain();
        this.renderMedia();
        this.renderPanel();
        this._renderSocial();
        this._load();
        if (!this.readOnly) this._mountShare();
        if (this.social) this._mountSocial();
    }

    /** Kudos bar and comments, only when the backend has them (migration 0010). */
    async _mountSocial() {
        const { store, userId } = this.social;
        let counts;
        try {
            if (typeof store.socialStatus !== 'function' || !await store.socialStatus()) return;
            counts = (await store.socialCounts([this.entry.id])).get(this.entry.id);
        } catch (error) {
            console.warn('Kudos and comments unavailable', error);
            return;
        }
        if (this.destroyed || !counts) return;
        this.socialOn = true;
        this.entry = { ...this.entry, comments_enabled: counts.commentsEnabled };
        this.socialCtl = new SocialController({ store, userId, onChange: () => this._renderSocial() });
        this.socialCtl.counts.set(this.entry.id, counts);
        this.comments = new CommentsSection(this.commentsEl, {
            store, entry: this.entry, userId,
            onCount: n => this.socialCtl?.set(this.entry.id, { comments: n }),
        });
        this._renderSocial();
        if (!this.readOnly) this.renderMain(); // the ⋯ menu
    }

    _renderSocial() {
        if (this.destroyed) return;
        if (this.socialCtl) {
            this.socialEl.innerHTML = this.socialCtl.barHtml(this.entry);
            return;
        }
        const n = Number(this.kudosCount) || 0;
        this.socialEl.innerHTML = n > 0
            ? `<div class="tr-social-wrap"><p class="tr-social tr-social--static" role="img" aria-label="${escHtml(fill(ts('kudosTotal', '{0} kudos'), n))}"><span class="tr-kudos-icon" aria-hidden="true">👏</span><span aria-hidden="true">${n}</span></p></div>`
            : '';
    }

    /** The share page's kudos count arrived. */
    setKudosCount(n) {
        this.kudosCount = n;
        this._renderSocial();
    }

    /** ⋯ menu of an own dive: turn comments off or on. */
    async _toggleComments() {
        if (this.togglingComments) return;
        const on = this.entry.comments_enabled === false;
        this.togglingComments = true;
        this.errors = [];
        try {
            const saved = await this.social.store.setCommentsEnabled(this.entry.id, on);
            if (this.destroyed) return;
            this.entry = { ...this.entry, comments_enabled: saved?.comments_enabled ?? on };
            this.comments?.setEnabled(this.entry.comments_enabled);
            this.socialCtl?.set(this.entry.id, { commentsEnabled: this.entry.comments_enabled });
        } catch (error) {
            if (this.destroyed) return;
            this._fail(error);
        }
        this.togglingComments = false;
        this.renderMain();
        this.renderPanel();
        this.main.querySelector('.lb-d-menu > summary')?.focus();
    }

    /** The public-link card, only when the backend has share links (migration 0005). */
    async _mountShare() {
        let available = false;
        try {
            available = typeof this.store.shareStatus === 'function' && await this.store.shareStatus();
        } catch (error) {
            console.warn('Share links unavailable', error);
        }
        if (!available || this.destroyed) return;
        this.shareCard = new ShareCard(this.shareEl, {
            store: this.store, entry: this.entry,
            onChange: saved => {
                this.entry = { ...this.entry, ...saved };
                if (!this.destroyed) this.renderMain();
            },
        });
    }

    destroy() {
        this.destroyed = true;
        this.shareCard?.destroy();
        this.socialCtl?.destroy();
        this.comments?.destroy();
        this.socialEl.removeEventListener('click', this._onSocialClick);
        document.removeEventListener('keydown', this._onKey);
        this.container.removeEventListener('error', this._onImgError, true);
        this._removeMap();
        this._closeViewer();
        this.container.innerHTML = '';
    }

    /** Re-render texts after a language change. */
    relabel() {
        if (this.destroyed) return;
        this.renderMain();
        this.renderMedia();
        this.renderPanel();
        this._renderSocial();
        this.comments?.relabel();
        this.shareCard?.relabel();
    }

    async _load() {
        try {
            const [sites, media] = await Promise.all([
                this.entry.site_id ? this.store.listSites() : Promise.resolve([]),
                this.store.listMedia(this.entry.id),
            ]);
            if (this.destroyed) return;
            this.loaded = true;
            this.site = sites.find(s => s.id === this.entry.site_id) ?? null;
            this.media = media;
            this.renderMain();
            this.renderMedia();
            await this._loadUrls();
        } catch (error) {
            if (!this.destroyed) this._fail(error);
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
        if (!this.destroyed) this.renderMedia();
    }

    _fail(error) {
        console.error(error);
        this.errors = [error?.kind === 'unreachable' ? tb('unreachable', 'Can\'t reach your dive log.') : tb('genericError', 'Something went wrong. Please try again.')];
        this.renderPanel();
    }

    // ---- Facts and site ----

    _removeMap() {
        this.map?.remove();
        this.map = null;
    }

    _menuHtml() {
        if (!this.socialOn) return '';
        const more = translate('diveLog.logbook.bar.more', 'More actions');
        const off = this.entry.comments_enabled === false;
        return `<details class="lb-menu lb-d-menu">
            <summary class="btn btn-secondary lb-menu-btn" aria-label="${escHtml(more)}" title="${escHtml(more)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></summary>
            <div class="lb-menu-pop"><button type="button" class="lb-menu-item" id="lb-comments-toggle"${this.togglingComments ? ' disabled' : ''}>${escHtml(off ? ts('turnOn', 'Turn on comments') : ts('turnOff', 'Turn off comments'))}</button></div>
        </details>`;
    }

    renderMain() {
        this._removeMap();
        const e = this.entry;
        const { core, groups, notes: ownNotes } = detailRows(e, label);
        const notes = this.readOnly ? null : ownNotes; // notes are private, whatever the entry object carries
        const time = e.entry_time ? String(e.entry_time).slice(0, 5) : '';
        // Another diver's log number is not shared.
        const number = this.readOnly && (e.log_number === null || e.log_number === undefined) ? '' : fill(label('number'), e.log_number ?? '–');
        const visibility = !this.readOnly && Object.hasOwn(VISIBILITY_FALLBACK, e.visibility ?? '')
            ? translate(`diveLog.trail.visibility.${e.visibility}`, VISIBILITY_FALLBACK[e.visibility]) : '';
        const a = this.readOnly ? this.author : null;
        const sub = [number, formatDiveDate(e.dive_date, currentLang()), time].filter(Boolean).join(', ');
        const dl = rows => `<dl class="lb-dl">${rows.map(r => `<div><dt>${escHtml(r.label)}</dt><dd>${escHtml(r.value)}</dd></div>`).join('')}</dl>`;
        const hasCoords = this.site && Number.isFinite(this.site.lat) && Number.isFinite(this.site.lon);
        // Until the sites are loaded show an ellipsis; a site that is not found after loading counts as not set.
        const siteName = e.site_id ? (this.site ? this.site.name : (this.loaded ? null : '…')) : null;
        const stats = feedStats(e, fmtNum);
        const statKeys = new Set(['duration', 'depth', 'gas', 'waterTemp']); // shown as big stats
        const rest = core.filter(r => !statKeys.has(r.key));
        // The average depth is in the stat row already; leave it out of "More details".
        const moreGroups = stats.some(st => st.key === 'avgDepth')
            ? groups.map(g => ({ ...g, rows: g.rows.filter(r => r.key !== 'avgDepthM') })).filter(g => g.rows.length)
            : groups;
        const statLabel = key => translate(`diveLog.logbook.feed.stats.${key}`, STAT_FALLBACK[key]);
        const gas = gasCards(e, label, fmtNum);
        this.main.innerHTML = `
            <div class="lb-d-top">
                ${this.backHref ? `<a class="lb-d-backlink" href="${escHtml(this.backHref)}">${escHtml(label('back'))}</a>` : ''}
                ${this.readOnly ? '' : `<span class="lb-d-topacts">${this._menuHtml()}<a class="btn btn-primary lb-d-edit" href="${routeHref({ name: 'edit', id: e.id })}">${escHtml(td('edit', 'Edit'))}</a></span>`}
            </div>
            ${a ? `<div class="tr-author lb-d-author">${a.href
                ? `<a class="tr-author-link" href="${escHtml(a.href)}">${a.avatarHtml}<span class="tr-author-name">${escHtml(a.name)}</span></a>`
                : `<span class="tr-author-link">${a.avatarHtml}<span class="tr-author-name">${escHtml(a.name)}</span></span>`}</div>` : ''}
            <div class="lb-d-title">
                <h2 class="lb-d-head${siteName ? '' : ' lb-untitled'}">${escHtml(siteName ?? diveTitle(e, null, k => translate(`diveLog.logbook.${k}`, TITLE_FALLBACK[k])))}</h2>
                <p class="lb-d-sub">${escHtml(sub)}${e.site_id || siteName ? '' : `, <span class="lb-muted">${escHtml(label('siteNotSet'))}</span>`}</p>
                ${visibility ? `<p class="lb-d-visibility lb-d-visibility--${escHtml(e.visibility)}">${escHtml(visibility)}</p>` : ''}
            </div>
            ${stats.length ? `<dl class="lb-stats lb-d-stats">${stats.map(st => `<div class="lb-stat"><dt>${escHtml(statLabel(st.key))}</dt>
                <dd>${escHtml(st.value)}${st.unit ? `<span class="lb-unit">${NB}${escHtml(st.unit)}</span>` : ''}</dd></div>`).join('')}</dl>` : ''}
            ${gas.cards.length ? `<section class="lb-d-gases" aria-labelledby="lb-d-gases-h"><h3 id="lb-d-gases-h">${escHtml(label('detail.gases'))}</h3>
                <ul class="lb-d-gas-list">${gas.cards.map(c => `<li class="lb-d-gas${c.role === 'deco' ? ' lb-d-gas--deco' : ''}${c.fill === null ? ' lb-d-gas--unknown' : ''}">
                    <span class="lb-gas-gauge" aria-hidden="true"${c.fill === null ? '' : ` style="--fill: ${c.fill}%"`}></span>
                    <p class="lb-d-gas-head"><strong>${escHtml(c.mix)}</strong> <span class="lb-d-gas-role">${escHtml(c.roleLabel)}</span></p>
                    ${c.cylinder || c.pressures ? `<p class="lb-d-gas-line">${escHtml([c.cylinder, c.pressures].filter(Boolean).join(', '))}</p>` : ''}
                    ${c.used ? `<p class="lb-d-gas-use">${escHtml(c.used)}</p>` : ''}</li>`).join('')}</ul>
                ${gas.summary ? `<p class="lb-d-gas-summary">${escHtml(gas.summary)}</p>` : ''}</section>` : ''}
            ${hasCoords ? '<div class="lb-d-map" aria-hidden="true"></div>' : ''}
            ${rest.length ? dl(rest) : ''}
            ${notes ? `<p class="lb-d-notes">${escHtml(notes)}</p>` : ''}
            ${moreGroups.length ? `<details class="lb-d-more"><summary>${escHtml(label('form.more'))}</summary>
                ${moreGroups.map(g => `<h3>${escHtml(label(`form.${g.group}`))}</h3>${dl(g.rows)}`).join('')}</details>` : ''}
`;
        this.main.querySelector('#lb-comments-toggle')?.addEventListener('click', () => this._toggleComments());
        // Below the photos, right above the panel where Delete asks for confirmation.
        const analysisLink = e.recording_id && this.analysisHref !== false
            ? `<a class="btn btn-secondary" href="${escHtml(this.analysisHref ?? routeHref({ name: this.readOnly ? 'memberAnalysis' : 'analysis', id: e.id }))}">${escHtml(td('analysis', 'Analysis'))}</a>` : '';
        if (this.readOnly) {
            this.actionsEl.innerHTML = analysisLink;
            if (hasCoords) this._mountMap(this.site);
            return;
        }
        this.actionsEl.innerHTML = `
                ${analysisLink}
                <label class="btn btn-secondary lb-file"><span>${escHtml(td('addPhotos', 'Add photos'))}</span>
                    <input type="file" class="rda-visually-hidden" id="lb-add-photos" accept="${IMAGE_ACCEPT}" multiple></label>
                <button type="button" class="btn btn-secondary" id="lb-add-video">${escHtml(td('addVideo', 'Add video link'))}</button>
                <button type="button" class="btn btn-danger lb-d-delete" id="lb-delete">${escHtml(td('delete', 'Delete'))}</button>`;
        const photoInput = this.actionsEl.querySelector('#lb-add-photos');
        photoInput.disabled = this.busy;
        photoInput.addEventListener('change', () => this._addPhotos(photoInput));
        this.actionsEl.querySelector('#lb-add-video').addEventListener('click', () => { this.videoOpen = true; this.confirm = null; this.renderPanel(); });
        this.actionsEl.querySelector('#lb-delete').addEventListener('click', () => { this.confirm = { kind: 'entry' }; this.videoOpen = false; this.renderPanel(); });
        if (hasCoords) this._mountMap(this.site);
    }

    async _mountMap(site) {
        const el = this.main.querySelector('.lb-d-map');
        try {
            const L = await loadLeaflet();
            if (this.destroyed || this.main.querySelector('.lb-d-map') !== el) return;
            this.map = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
            L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(this.map);
            this.map.setView([site.lat, site.lon], 12);
            L.circleMarker([site.lat, site.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#d62d20', fillOpacity: 1 }).addTo(this.map);
        } catch (error) {
            console.warn('Site map unavailable', error);
            el.remove();
        }
    }

    // ---- Media ----

    renderMedia() {
        const photos = this.media.filter(m => m.kind === 'photo');
        const videos = this.media.filter(m => m.kind === 'video_link');
        const grid = photos.map(m => {
            const url = this.urls.get(m.path);
            return `<figure class="lb-photo">
                ${url ? `<button type="button" class="lb-photo-open" data-open="${escHtml(m.id)}" aria-label="${escHtml(td('enlarge', 'Enlarge photo'))}"><img src="${escHtml(url)}" alt="${escHtml(tp('alt', 'Photo'))}" loading="lazy"></button>`
                    : `<div class="lb-photo-wait" aria-hidden="true"></div>`}
                ${this.readOnly ? '' : `<button type="button" class="lb-photo-x" data-remove="${escHtml(m.id)}" aria-label="${escHtml(td('removePhoto', 'Remove photo'))}">×</button>`}</figure>`;
        }).join('');
        const links = videos.map(m => `<li>${isHttpsUrl(m.url)
            ? `<a href="${escHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escHtml(m.caption || m.url)}</a>`
            : `<span>${escHtml(m.caption || m.url || '')}</span>`}
            ${this.readOnly ? '' : `<button type="button" class="lb-chip-x" data-remove="${escHtml(m.id)}" aria-label="${escHtml(td('removeVideo', 'Remove link'))}">×</button>`}</li>`).join('');
        this.mediaEl.innerHTML = `${photos.length ? `<h3>${escHtml(td('photos', 'Photos'))}</h3><div class="lb-photos">${grid}</div>` : ''}
            ${videos.length ? `<h3>${escHtml(td('videos', 'Videos'))}</h3><ul class="lb-videos">${links}</ul>` : ''}`;
        for (const img of this.mediaEl.querySelectorAll('.lb-photo img')) {
            img.addEventListener('load', () => { this._urlRetried = false; });
            img.addEventListener('error', () => {
                if (this._urlRetried || this.destroyed) return; // signed URLs expire after an hour
                this._urlRetried = true;
                this._loadUrls();
            });
        }
        for (const b of this.mediaEl.querySelectorAll('[data-open]')) b.addEventListener('click', () => this._openViewer(b.dataset.open));
        for (const b of this.mediaEl.querySelectorAll('[data-remove]')) {
            b.addEventListener('click', () => {
                this.confirm = { kind: 'media', media: this.media.find(m => m.id === b.dataset.remove) };
                this.videoOpen = false;
                this.renderPanel();
            });
        }
    }

    _openViewer(id) {
        const m = this.media.find(x => x.id === id);
        const url = m && this.urls.get(m.path);
        if (!url) return;
        this._closeViewer();
        const v = document.createElement('div');
        v.className = 'lb-viewer';
        v.setAttribute('role', 'dialog');
        v.setAttribute('aria-modal', 'true');
        v.setAttribute('aria-label', tp('alt', 'Photo'));
        v.innerHTML = `<img src="${escHtml(url)}" alt="${escHtml(tp('alt', 'Photo'))}"><button type="button" class="lb-viewer-x" aria-label="${escHtml(td('close', 'Close'))}">×</button>`;
        v.addEventListener('click', () => this._closeViewer());
        document.body.appendChild(v);
        v.querySelector('button').focus();
        this.viewer = v;
    }

    _closeViewer() {
        this.viewer?.remove();
        this.viewer = null;
    }

    // ---- Panel: confirmations, video form, progress and errors ----

    renderPanel() {
        const parts = [];
        if (this.status) parts.push(`<p class="lb-d-status" role="status">${escHtml(this.status)}</p>`);
        if (this.errors.length) parts.push(`<p class="lb-form-error" role="alert">${this.errors.map(escHtml).join('<br>')}</p>`);
        if (this.confirm) {
            const isEntry = this.confirm.kind === 'entry';
            parts.push(`<div class="lb-confirm" role="alertdialog" aria-label="${escHtml(td('confirm', 'Confirm'))}">
                <p>${escHtml(isEntry ? td('deleteEntryText', 'Delete this dive and its photos? The dive computer recording is kept.') : td('deleteMediaText', 'Remove this item?'))}</p>
                <div class="lb-actions"><button type="button" class="btn btn-danger" id="lb-confirm-yes"${this.busy ? ' disabled' : ''}>${escHtml(isEntry ? td('delete', 'Delete') : td('remove', 'Remove'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-confirm-no">${escHtml(td('cancel', 'Cancel'))}</button></div></div>`);
        }
        if (this.videoOpen) {
            parts.push(`<form class="lb-video-form" novalidate>
                <label class="lb-field"><span>${escHtml(td('videoUrl', 'Video link (https://…)'))}</span><input type="text" name="url" inputmode="url" autocomplete="off"></label>
                <label class="lb-field"><span>${escHtml(td('videoCaption', 'Caption (optional)'))}</span><input type="text" name="caption" autocomplete="off"></label>
                <p class="lb-form-error" role="alert" hidden></p>
                <div class="lb-actions"><button type="submit" class="btn btn-primary">${escHtml(td('videoSave', 'Add link'))}</button>
                <button type="button" class="btn btn-secondary" id="lb-video-cancel">${escHtml(td('cancel', 'Cancel'))}</button></div></form>`);
        }
        this.panel.innerHTML = parts.join('');
        this.panel.querySelector('#lb-confirm-no')?.addEventListener('click', () => { this.confirm = null; this.renderPanel(); });
        this.panel.querySelector('#lb-confirm-yes')?.addEventListener('click', () => this._confirmed());
        this.panel.querySelector('#lb-video-cancel')?.addEventListener('click', () => { this.videoOpen = false; this.renderPanel(); });
        this.panel.querySelector('.lb-video-form')?.addEventListener('submit', e => { e.preventDefault(); this._saveVideo(e.target); });
        if (this.confirm || this.videoOpen) this.panel.querySelector('button, input')?.focus();
    }

    async _confirmed() {
        const { kind, media } = this.confirm;
        this.busy = true;
        this.errors = [];
        this.renderPanel();
        try {
            if (kind === 'entry') {
                await this.store.deleteEntry(this.entry.id);
                if (!this.destroyed) this.onDeleted?.();
                return;
            }
            await this.store.deleteMedia(media);
            if (this.destroyed) return;
            this.media = this.media.filter(m => m.id !== media.id);
            this.confirm = null;
            this.renderMedia();
        } catch (error) {
            if (this.destroyed) return;
            this._fail(error);
        }
        this.busy = false;
        if (!this.destroyed) this.renderPanel();
    }

    async _saveVideo(form) {
        const url = form.elements.url.value.trim();
        const caption = form.elements.caption.value.trim() || null;
        const err = form.querySelector('.lb-form-error');
        if (!isHttpsUrl(url)) {
            err.textContent = td('videoInvalid', 'Enter a link that starts with https://');
            err.hidden = false;
            return;
        }
        form.querySelector('[type="submit"]').disabled = true;
        try {
            const row = await this.store.addVideoLink(this.entry.id, url, caption);
            if (this.destroyed) return;
            this.media = [...this.media, row];
            this.videoOpen = false;
            this.renderMedia();
            this.renderPanel();
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            form.querySelector('[type="submit"]').disabled = false;
            err.textContent = tb('genericError', 'Something went wrong. Please try again.');
            err.hidden = false;
        }
    }

    async _addPhotos(input) {
        const files = Array.from(input.files);
        input.value = '';
        if (!files.length || this.busy) return;
        this.busy = true;
        input.disabled = true;
        this.errors = [];
        const failures = [];
        let added = 0;
        for (const [i, file] of files.entries()) {
            if (this.destroyed) return;
            this.status = fill(tp('progress', 'Uploading {0} / {1}…'), i + 1, files.length);
            this.renderPanel();
            if (!isSupportedImage(file.type) && !isSupportedImage(file.name)) {
                failures.push(fill(tp('unsupported', '{0}: save as JPEG first'), file.name));
                continue;
            }
            try {
                const exif = await readExif(file); // before resizing: the resized copy has no EXIF
                const { blob, width, height } = await resizeImage(file);
                const row = await this.store.addPhoto(this.entry.id, { blob, width, height, ...exif });
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
        const fresh = this.actionsEl.querySelector('#lb-add-photos');
        if (fresh) fresh.disabled = false;
        this.renderPanel();
        if (added) {
            this.renderMedia();
            await this._loadUrls();
        }
    }
}
