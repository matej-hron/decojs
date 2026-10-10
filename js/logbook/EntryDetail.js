/**
 * Dive detail screen, laid out like an activity page: a hero (first photo, else the site map), the title
 * block and big stats, then two columns — main: an optional slot (the share page puts the profile and
 * analysis there), photos, notes and details; the dive story sits full width under the stats; side: map, gases, conditions, buddies and the
 * owner's share card. On phones it is one column in reading order (CSS `order`).
 * Owner actions: Edit / Analysis / Add photos / Add video link / Delete.
 * With `readOnly` (another member's dive) it shows an author row instead and
 * offers nothing that writes; notes are never shown then.
 *
 * `detailRows` and `isHttpsUrl` are pure and covered by tests.
 */

import { isHttpsUrl, siteInfoLinkHtml } from './geo.js';
import { CHOICES, TAGS } from './EntryForm.js';
import { DETAIL_KEYS, formatDiveDate, formatDuration } from './entryModel.js';
import { routeHref } from './router.js';
import { readExif, resizeImage, isSupportedImage } from './photo.js';
import { loadLeaflet, TILE_URL, TILE_ATTRIBUTION } from './SitePicker.js';
import { siteMapHtml, wireSiteMap } from './siteMap.js';
import { ratingHtml } from './feedCard.js';
import { ratingOf } from './entryModel.js';
import { MAPY_API_KEY } from '../backend/config.js';
import { gasName } from '../import/recordedDive.js';
import { gasesFromEntry, gasUsage, cylinderText } from './gasModel.js';
import { diveTitle, feedStats, storyHtml } from './feed.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';
import { avatarImgFallback } from './avatars.js';
import { ShareCard } from './ShareCard.js';

const NB = ' ';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Unit shown after the value of a numeric detail. */
const DETAIL_UNITS = Object.freeze({
    surfaceTempC: '°C', airTempC: '°C',
    weightsKg: 'kg', suitMm: 'mm', avgDepthM: 'm',
});
const NUMERIC = new Set(Object.keys(DETAIL_UNITS));

/** Kept here for older imports; lives in geo.js with the site link helpers. */
export { isHttpsUrl };

const present = v => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''));

/**
 * Rows of the detail card. Empty values are left out.
 * @param {Object} entry - log_entries row
 * @param {(key: string) => string} t - label lookup below `diveLog.logbook.`
 * @returns {{core: {key: string, label: string, value: string}[], groups: {group: string, rows: Object[]}[], notes: string|null, description: string|null}}
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
    const text = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return { core, groups, notes: text(entry.notes), description: text(entry.description) };
}

/**
 * What the hero at the top of the detail shows: the first photo, else the site map, else nothing.
 * Nothing until the photos and the site are loaded, so the map does not jump from the hero to the side.
 * @param {{loaded: boolean, photos: number, area: Object|null}} o
 * @returns {'photo'|'map'|null}
 */
export function heroKind({ loaded, photos, area }) {
    if (!loaded) return null;
    if (photos > 0) return 'photo';
    return area ? 'map' : null;
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
     * @param {{lat: number, lon: number, exact: boolean}|null} [options.area] - where the map points (share page);
     *   default: the site's own position, exact
     */
    constructor(container, { store, entry, onDeleted, onError, readOnly = false, author = null, backHref = null, analysisHref = null, area }) {
        this.container = container;
        this.store = store;
        this.entry = entry;
        this.readOnly = Boolean(readOnly);
        this.author = author;
        this.backHref = backHref === false ? null : backHref ?? routeHref({ name: this.readOnly ? 'feed' : 'list' });
        this.analysisHref = analysisHref;
        this.areaOverride = area;
        this.shareCard = null;
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
        this._mapCleanup = { hero: null, side: null };
        this.viewer = null;
        this._onKey = e => {
            if (!this.viewer) return;
            if (e.key === 'Escape') this._closeViewer();
            else if (e.key === 'ArrowRight') this._stepViewer(1);
            else if (e.key === 'ArrowLeft') this._stepViewer(-1);
        };
        document.addEventListener('keydown', this._onKey);
        this._onImgError = e => avatarImgFallback(e); // an author photo that fails falls back to the preset
        this.container.addEventListener('error', this._onImgError, true);
        this.container.innerHTML = `<section class="lb-detail">
            <div class="lb-d-top"></div>
            <div class="lb-d-hero"></div>
            <div class="lb-d-main"></div>
            <div class="lb-d-story"></div>
            <div class="lb-d-grid">
                <div class="lb-d-col lb-d-col--main"><div class="lb-d-slot"></div><div class="lb-d-media"></div><div class="lb-d-text"></div></div>
                <div class="lb-d-col lb-d-col--side"><div class="lb-d-side"></div><div class="lb-d-share"></div></div>
            </div>
            <div class="lb-d-actions"></div><div class="lb-d-panel"></div></section>`;
        this.topEl = this.container.querySelector('.lb-d-top');
        this.heroEl = this.container.querySelector('.lb-d-hero');
        this.main = this.container.querySelector('.lb-d-main');
        this.sideEl = this.container.querySelector('.lb-d-side');
        this.storyEl = this.container.querySelector('.lb-d-story');
        this.textEl = this.container.querySelector('.lb-d-text');
        /** Empty element in the main column for a caller's content (the share page's analysis); never re-rendered. */
        this.slot = this.container.querySelector('.lb-d-slot');
        this.mediaEl = this.container.querySelector('.lb-d-media');
        this.actionsEl = this.container.querySelector('.lb-d-actions');
        this.panel = this.container.querySelector('.lb-d-panel');
        this.shareEl = this.container.querySelector('.lb-d-share');
        this.renderMain();
        this.renderMedia();
        this.renderPanel();
        this._load();
        if (!this.readOnly) this._mountShare();
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
        document.removeEventListener('keydown', this._onKey);
        this.container.removeEventListener('error', this._onImgError, true);
        this._removeMaps();
        this._closeViewer();
        this.container.innerHTML = '';
    }

    /** Re-render texts after a language change. */
    relabel() {
        if (this.destroyed) return;
        this.renderMain();
        this.renderMedia();
        this.renderPanel();
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
        this.urlsLoaded = true;
        if (!this.destroyed) this.renderMedia();
    }

    _fail(error) {
        console.error(error);
        this.errors = [error?.kind === 'unreachable' ? tb('unreachable', 'Can\'t reach your dive log.') : tb('genericError', 'Something went wrong. Please try again.')];
        this.renderPanel();
    }

    // ---- Layout: hero, title block and stats, side cards, text cards ----

    _removeMaps(which = ['hero', 'side']) {
        for (const k of which) {
            this._mapCleanup[k]?.();
            this._mapCleanup[k] = null;
        }
    }

    /** Where the map points: the caller's area (share page), else the site's own position (exact), else null. */
    get area() {
        if (this.areaOverride !== undefined) return this.entry.site_id ? this.areaOverride : null;
        const s = this.site;
        return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? { lat: s.lat, lon: s.lon, exact: true } : null;
    }

    get photos() {
        return this.media.filter(m => m.kind === 'photo');
    }

    _siteName() {
        // Until the sites are loaded show an ellipsis; a site that is not found after loading counts as not set.
        return this.entry.site_id ? (this.site ? this.site.name : (this.loaded ? null : '…')) : null;
    }

    _mapHtml(area, { width, height, zoom, className }) {
        const name = this._siteName();
        return siteMapHtml({
            area, apiKey: MAPY_API_KEY, width, height, zoom, className, lang: currentLang(),
            scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1,
            alt: name && name !== '…' ? fill(td('mapAlt', 'Map of {0}'), name) : td('mapAltNoName', 'Map of the dive site'),
            areaLabel: td('approxArea', 'Approximate area'),
        });
    }

    /** Set markup only when it changed (keeps a mounted map and a loaded image); true when it changed. */
    _put(el, html) {
        if (el._html === html) return false;
        el._html = html;
        el.innerHTML = html;
        return true;
    }

    /** Photos count for the hero while their URLs load; once loaded, only photos that could be signed. */
    _heroKind() {
        const photos = this.urlsLoaded ? this._viewable().length : this.photos.length;
        return heroKind({ loaded: this.loaded, photos, area: this.area });
    }

    renderHero() {
        const kind = this._heroKind();
        let html = '';
        if (kind === 'photo') {
            const first = this._viewable()[0] ?? this.photos[0];
            const url = this.urls.get(first.path);
            const more = this.photos.length - 1;
            html = url
                ? `<button type="button" class="lb-d-hero-photo" data-open="${escHtml(first.id)}" aria-label="${escHtml(td('enlarge', 'Enlarge photo'))}">
                    <img src="${escHtml(url)}" alt="${escHtml(tp('alt', 'Photo'))}">
                    ${more > 0 ? `<span class="lb-d-hero-count">${escHtml(fill(td('photoCount', '{0} photos'), this.photos.length))}</span>` : ''}</button>`
                : '<div class="lb-d-hero-wait" aria-hidden="true"></div>';
        } else if (kind === 'map') {
            html = this._mapHtml(this.area, { width: 1024, height: 360, zoom: 12, className: 'lb-d-map lb-d-hero-map' });
        }
        this.heroEl.hidden = !html;
        if (this._put(this.heroEl, html)) {
            this._removeMaps(['hero']);
            if (kind === 'map') this._mapCleanup.hero = wireSiteMap(this.heroEl, { loadLeaflet, tileUrl: TILE_URL, attribution: TILE_ATTRIBUTION });
            this.heroEl.querySelector('[data-open]')?.addEventListener('click', e => this._openViewer(e.currentTarget.dataset.open));
            const img = this.heroEl.querySelector('.lb-d-hero-photo img');
            img?.addEventListener('error', () => this._retryUrls());
        }
    }

    renderMain() {
        const e = this.entry;
        const time = e.entry_time ? String(e.entry_time).slice(0, 5) : '';
        // Another diver's log number is not shared.
        const number = this.readOnly && (e.log_number === null || e.log_number === undefined) ? '' : fill(label('number'), e.log_number ?? '–');
        const visibility = !this.readOnly && Object.hasOwn(VISIBILITY_FALLBACK, e.visibility ?? '')
            ? translate(`diveLog.trail.visibility.${e.visibility}`, VISIBILITY_FALLBACK[e.visibility]) : '';
        const a = this.readOnly ? this.author : null;
        const sub = [number, formatDiveDate(e.dive_date, currentLang()), time].filter(Boolean).join(', ');
        const siteName = this._siteName();
        const stats = feedStats(e, fmtNum);
        const statLabel = key => translate(`diveLog.logbook.feed.stats.${key}`, STAT_FALLBACK[key]);
        const rating = ratingOf(e.details?.rating);
        this.topEl.innerHTML = `${this.backHref ? `<a class="lb-d-backlink" href="${escHtml(this.backHref)}">${escHtml(label('back'))}</a>` : ''}
            ${this.readOnly ? '' : `<a class="btn btn-primary lb-d-edit" href="${routeHref({ name: 'edit', id: e.id })}">${escHtml(td('edit', 'Edit'))}</a>`}`.trim();
        this.main.innerHTML = `
            ${a ? `<div class="tr-author lb-d-author">${a.href
                ? `<a class="tr-author-link" href="${escHtml(a.href)}">${a.avatarHtml}<span class="tr-author-name">${escHtml(a.name)}</span></a>`
                : `<span class="tr-author-link">${a.avatarHtml}<span class="tr-author-name">${escHtml(a.name)}</span></span>`}</div>` : ''}
            <div class="lb-d-title">
                <h2 class="lb-d-head${siteName ? '' : ' lb-untitled'}">${escHtml(siteName ?? diveTitle(e, null, k => translate(`diveLog.logbook.${k}`, TITLE_FALLBACK[k])))}</h2>
                <p class="lb-d-sub">${escHtml(sub)}${e.site_id || siteName ? '' : `, <span class="lb-muted">${escHtml(label('siteNotSet'))}</span>`}</p>
                ${ratingHtml(rating, fill(label('form.ratingValue'), rating))}
                ${visibility ? `<p class="lb-d-visibility lb-d-visibility--${escHtml(e.visibility)}">${escHtml(visibility)}</p>` : ''}
                ${siteInfoLinkHtml(this.site?.url, translate('diveLog.logbook.sites.siteInfo', 'Site info'))}
            </div>
            ${stats.length ? `<dl class="lb-stats lb-d-stats">${stats.map(st => `<div class="lb-stat"><dt>${escHtml(statLabel(st.key))}</dt>
                <dd>${escHtml(st.value)}${st.unit ? `<span class="lb-unit">${NB}${escHtml(st.unit)}</span>` : ''}</dd></div>`).join('')}</dl>` : ''}`;
        this.renderHero();
        this.renderStory();
        this.renderSide();
        this.renderText();
        this._renderActions();
    }

    /** Side column: map (unless it is the hero), gases, conditions, buddies. */
    renderSide() {
        const e = this.entry;
        const { core, groups } = detailRows(e, label);
        const area = this.area;
        const kind = this._heroKind();
        const gas = gasCards(e, label, fmtNum);
        const card = (cls, title, body) => `<section class="lb-d-card ${cls}"><h3 class="lb-d-card-h">${escHtml(title)}</h3>${body}</section>`;
        const dl = rows => `<dl class="lb-dl">${rows.map(r => `<div><dt>${escHtml(r.label)}</dt><dd>${escHtml(r.value)}</dd></div>`).join('')}</dl>`;
        const out = [];
        if (this.loaded && area && kind !== 'map') {
            out.push(card('lb-d-mapcard', td('location', 'Location'), // an approximate map says so on the map itself
                this._mapHtml(area, { width: 640, height: 360, zoom: 13, className: 'lb-d-map' })));
        }
        if (gas.cards.length) {
            out.push(card('lb-d-gases', label('detail.gases'), `<ul class="lb-d-gas-list">${gas.cards.map(c => `<li class="lb-d-gas${c.role === 'deco' ? ' lb-d-gas--deco' : ''}${c.fill === null ? ' lb-d-gas--unknown' : ''}">
                    <span class="lb-gas-gauge" aria-hidden="true"${c.fill === null ? '' : ` style="--fill: ${c.fill}%"`}></span>
                    <p class="lb-d-gas-head"><strong>${escHtml(c.mix)}</strong> <span class="lb-d-gas-role">${escHtml(c.roleLabel)}</span></p>
                    ${c.cylinder || c.pressures ? `<p class="lb-d-gas-line">${escHtml([c.cylinder, c.pressures].filter(Boolean).join(', '))}</p>` : ''}
                    ${c.used ? `<p class="lb-d-gas-use">${escHtml(c.used)}</p>` : ''}</li>`).join('')}</ul>
                ${gas.summary ? `<p class="lb-d-gas-summary">${escHtml(gas.summary)}</p>` : ''}`));
        }
        // Water temperature, maximum depth, time and gas are in the stat row; the weather group joins the conditions.
        const conditions = [...core.filter(r => ['surfaceTempC', 'visShallow', 'visDeep'].includes(r.key)),
            ...(groups.find(g => g.group === 'conditions')?.rows ?? [])];
        if (conditions.length) out.push(card('lb-d-cond', td('conditions', 'Conditions'), dl(conditions)));
        if (e.buddies?.length) {
            out.push(card('lb-d-buddies', label('detail.label.buddies'),
                `<ul class="lb-d-chips">${e.buddies.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>`));
        }
        if (this._put(this.sideEl, out.join(''))) {
            this._removeMaps(['side']);
            if (this.sideEl.querySelector('.lb-map')) this._mapCleanup.side = wireSiteMap(this.sideEl, { loadLeaflet, tileUrl: TILE_URL, attribution: TILE_ATTRIBUTION });
        }
    }

    /** The dive story (`description`, written for others): right under the stats, in paragraphs; hidden when empty. */
    renderStory() {
        const { description } = detailRows(this.entry, label);
        this.storyEl.hidden = !description;
        this._put(this.storyEl, description
            ? `<h3 class="lb-d-story-h">${escHtml(translate('diveLog.logbook.form.description', 'How was it?'))}</h3>${storyHtml(description)}` : '');
    }

    /** Main column below the photos: notes (owner only) and the remaining details. */
    renderText() {
        const e = this.entry;
        const { groups, notes: ownNotes } = detailRows(e, label);
        const notes = this.readOnly ? null : ownNotes; // notes are private, whatever the entry object carries
        const dl = rows => `<dl class="lb-dl">${rows.map(r => `<div><dt>${escHtml(r.label)}</dt><dd>${escHtml(r.value)}</dd></div>`).join('')}</dl>`;
        // The stat row has the average depth and the title block the rating; conditions are in the side column.
        const details = groups.filter(g => g.group !== 'conditions')
            .map(g => ({ ...g, rows: g.rows.filter(r => r.key !== 'avgDepthM' && r.key !== 'rating') }))
            .filter(g => g.rows.length);
        const out = [];
        if (notes) {
            out.push(`<section class="lb-d-card lb-d-notes-card"><h3 class="lb-d-card-h">${escHtml(td('notes', 'Notes'))}<span class="lb-d-card-tag">${escHtml(td('onlyYou', 'Only you'))}</span></h3>
                <p class="lb-d-notes">${escHtml(notes)}</p></section>`);
        }
        if (details.length) {
            out.push(`<section class="lb-d-card lb-d-details"><h3 class="lb-d-card-h">${escHtml(td('details', 'Details'))}</h3>
                ${details.map(g => `<h4 class="lb-d-group-h">${escHtml(label(`form.${g.group}`))}</h4>${dl(g.rows)}`).join('')}</section>`);
        }
        this._put(this.textEl, out.join(''));
    }

    _renderActions() {
        const e = this.entry;
        const analysisLink = e.recording_id && this.analysisHref !== false
            ? `<a class="btn btn-secondary" href="${escHtml(this.analysisHref ?? routeHref({ name: this.readOnly ? 'memberAnalysis' : 'analysis', id: e.id }))}">${escHtml(td('analysis', 'Analysis'))}</a>` : '';
        if (this.readOnly) {
            this.actionsEl.innerHTML = analysisLink;
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
    }

    // ---- Media ----

    _retryUrls() {
        if (this._urlRetried || this.destroyed) return; // signed URLs expire
        this._urlRetried = true;
        this._loadUrls();
    }

    renderMedia() {
        const photos = this.photos;
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
        this.mediaEl.innerHTML = `${photos.length ? `<section class="lb-d-card lb-d-photos"><h3 class="lb-d-card-h">${escHtml(td('photos', 'Photos'))}<span class="lb-d-card-tag">${escHtml(String(photos.length))}</span></h3>
                <div class="lb-photos${photos.length === 1 ? ' lb-photos--one' : ''}">${grid}</div></section>` : ''}
            ${videos.length ? `<section class="lb-d-card lb-d-videos"><h3 class="lb-d-card-h">${escHtml(td('videos', 'Videos'))}</h3><ul class="lb-videos">${links}</ul></section>` : ''}`.trim();
        for (const img of this.mediaEl.querySelectorAll('.lb-photo img')) {
            img.addEventListener('load', () => { this._urlRetried = false; });
            img.addEventListener('error', () => this._retryUrls());
        }
        for (const b of this.mediaEl.querySelectorAll('[data-open]')) b.addEventListener('click', () => this._openViewer(b.dataset.open));
        for (const b of this.mediaEl.querySelectorAll('[data-remove]')) {
            b.addEventListener('click', () => {
                this.confirm = { kind: 'media', media: this.media.find(m => m.id === b.dataset.remove) };
                this.videoOpen = false;
                this.renderPanel();
            });
        }
        this.renderHero();
        this.renderSide(); // the map moves between the hero and the side column as photos come and go
    }

    /** Photos that can be shown in the viewer (signed URL known), in gallery order. */
    _viewable() {
        return this.photos.filter(m => this.urls.get(m.path));
    }

    _openViewer(id) {
        const list = this._viewable();
        const index = list.findIndex(m => m.id === id);
        if (index < 0) return;
        this._closeViewer();
        const v = document.createElement('div');
        v.className = 'lb-viewer';
        v.setAttribute('role', 'dialog');
        v.setAttribute('aria-modal', 'true');
        v.setAttribute('aria-label', tp('alt', 'Photo'));
        const many = list.length > 1;
        v.innerHTML = `<img alt="${escHtml(tp('alt', 'Photo'))}">
            <button type="button" class="lb-viewer-x" aria-label="${escHtml(td('close', 'Close'))}">×</button>
            ${many ? `<button type="button" class="lb-viewer-nav lb-viewer-prev" aria-label="${escHtml(td('prevPhoto', 'Previous photo'))}">‹</button>
            <button type="button" class="lb-viewer-nav lb-viewer-next" aria-label="${escHtml(td('nextPhoto', 'Next photo'))}">›</button>
            <p class="lb-viewer-count" aria-live="polite"></p>` : ''}`;
        v.addEventListener('click', e => {
            if (e.target.closest('.lb-viewer-prev')) this._stepViewer(-1);
            else if (e.target.closest('.lb-viewer-next')) this._stepViewer(1);
            else if (e.target.tagName !== 'IMG') this._closeViewer();
        });
        document.body.appendChild(v);
        this.viewer = v;
        this._viewerIndex = index;
        this._showViewer();
        v.querySelector('.lb-viewer-x').focus();
    }

    _showViewer() {
        const list = this._viewable();
        if (!this.viewer || !list.length) return;
        this._viewerIndex = (this._viewerIndex + list.length) % list.length;
        const m = list[this._viewerIndex];
        this.viewer.querySelector('img').src = this.urls.get(m.path);
        const count = this.viewer.querySelector('.lb-viewer-count');
        if (count) count.textContent = `${this._viewerIndex + 1} / ${list.length}`;
    }

    _stepViewer(delta) {
        if (!this.viewer) return;
        this._viewerIndex += delta;
        this._showViewer();
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
