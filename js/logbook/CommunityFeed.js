/**
 * DecoTrail Feed: the caller's and other members' visible dives, newest first, as feed cards with an
 * author row, 30 per page with "Load more". With `owner` it lists one member's dives (member page).
 */

import { routeHref } from './router.js';
import { ratingOf } from './entryModel.js';
import { feedCardHtml, statsHtml, visualHtml, lockHtml, ratingHtml } from './feedCard.js';
import { SparkLoader } from './sparks.js';
import { SocialController } from './SocialBar.js';
import { displayName, isOwn, chooseCommunityVisual, entryFromCommunityRow } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { diveTitle, feedStats } from './feed.js';
import { groupByMonth, formatWeekdayDate } from './listViews.js';
import { TAGS } from './EntryForm.js';
import { mapyStaticMapUrl } from './geo.js';
import { MAPY_API_KEY } from '../backend/config.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

export const FEED_PAGE_SIZE = 30;

const NB = ' ';
const tl = (key, fallback) => translate(`diveLog.logbook.${key}`, fallback);
const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const TITLE_FALLBACK = { 'feed.untitled': 'Dive #{0}', 'feed.untitledNoNumber': 'Dive' };
const STAT_FALLBACK = { depth: 'Max depth', duration: 'Time', avgDepth: 'Avg depth', temp: 'Water', gas: 'Gas', sac: 'SAC' };

export class CommunityFeed {
    /**
     * @param {HTMLElement} host
     * @param {Object} options
     * @param {Object} options.store - DiveStore with the community API
     * @param {string} options.userId - the signed-in user
     * @param {string|null} [options.owner] - only this member's dives
     * @param {boolean} [options.title] - show the "Feed" heading
     * @param {(error: Error) => void} [options.onError] - the first page failed (default: a message in place)
     * @param {number} [options.pageSize]
     */
    constructor(host, { store, userId, owner = null, title = true, onError = null, pageSize = FEED_PAGE_SIZE }) {
        this.host = host;
        this.store = store;
        this.userId = userId;
        this.owner = owner;
        this.title = title;
        this.onError = onError;
        this.pageSize = pageSize;
        this.rows = null; // null while the first page loads
        this.members = new Map(); // id -> member row
        this.avatars = new Map(); // avatar path -> signed URL
        this.photos = new Map(); // photo path -> signed URL
        this.offset = 0; // rows fetched so far (before de-duplication): where the next page starts
        this.more = false; // the last page was full: there may be more
        this.loadingMore = false;
        this.moreFailed = false;
        this.failed = false;
        this.mapFailed = false;
        this.destroyed = false;
        this._token = 0;
        this.sparks = new SparkLoader(id => this.store.loadCommunityRecording(id));
        this._onVisualFail = e => this._onVisualError(e);
        this.host.addEventListener('error', this._onVisualFail, true); // image errors do not bubble
        this.social = typeof store.socialStatus === 'function'
            ? new SocialController({ store, userId, onChange: () => this._render() }) : null;
        this.socialOn = null; // promise of whether kudos/comments exist (migration 0010)
        this._onClick = e => {
            if (this.social?.onClick(e)) return;
            if (e.target.closest('#tr-feed-more')) this._loadMore();
        };
        this.host.addEventListener('click', this._onClick);
        this._render();
        this._loadFirst();
    }

    destroy() {
        this.destroyed = true;
        this._token++;
        this.sparks.destroy();
        this.social?.destroy();
        this.host.removeEventListener('error', this._onVisualFail, true);
        this.host.removeEventListener('click', this._onClick);
        this.host.innerHTML = '';
    }

    /** Language changed: re-render what is loaded. */
    relabel() {
        if (!this.destroyed) this._render();
    }

    // ---- Loading ----

    async _loadFirst() {
        const token = ++this._token;
        try {
            const [members, rows, me] = await Promise.all([
                this.store.listMembers ? this.store.listMembers() : [],
                this._fetchPage(0),
                // The main Feed nudges a member without a name (e.g. just invited) to complete the profile.
                !this.owner && this.store.getMyProfile ? this.store.getMyProfile().catch(() => null) : null,
            ]);
            if (token !== this._token) return;
            this.me = me ?? null;
            this.members = new Map((members ?? []).map(m => [m.id, m]));
            this.rows = rows;
            this.offset = rows.length;
            this.more = rows.length >= this.pageSize;
            this._render();
            this._loadSocial(rows);
            await this._signUrls(rows, members ?? [], token);
        } catch (error) {
            if (token !== this._token) return;
            if (this.onError) this.onError(error);
            else {
                console.error(error);
                this.failed = true;
                this._render();
            }
        }
    }

    async _loadMore() {
        if (this.loadingMore || !this.more || this.destroyed) return;
        const token = this._token;
        this.loadingMore = true;
        this.moreFailed = false;
        this._render();
        try {
            const known = new Set(this.rows.map(r => r.id));
            const page = await this._fetchPage(this.offset);
            if (token !== this._token) return;
            // Advance by the page, not by the de-duplicated rows: else a shifted page is fetched again forever.
            this.offset += page.length;
            const fresh = page.filter(r => !known.has(r.id)); // a dive added meanwhile shifts the pages
            this.rows = [...this.rows, ...fresh];
            this.more = page.length >= this.pageSize;
            this.loadingMore = false;
            this._render();
            if (fresh[0]) this.host.querySelector(`.tr-feed-link[href="${this._href(fresh[0])}"]`)?.focus({ preventScroll: true });
            this._loadSocial(fresh);
            await this._signUrls(fresh, [], token);
        } catch (error) {
            if (token !== this._token) return;
            console.error(error);
            this.loadingMore = false;
            this.moreFailed = true;
            this._render();
        }
    }

    /** Kudos and comment counts of these rows, when the backend has them. */
    async _loadSocial(rows) {
        if (!this.social || !rows.length) return;
        this.socialOn ??= this.store.socialStatus().catch(() => false);
        if (await this.socialOn) this.social.load(rows.map(r => r.id));
    }

    _fetchPage(offset) {
        return this.store.listCommunityEntries({ owner: this.owner, limit: this.pageSize, offset }).then(rows => rows ?? []);
    }

    /** Signed URLs of the rows' first photos and the members' uploaded avatars; failures leave the fallbacks. */
    async _signUrls(rows, members, token) {
        const photoPaths = rows.map(r => r.photo_path).filter(p => p && !this.photos.has(p));
        const avatarPaths = members.map(m => m.avatar_path).filter(p => p && !this.avatars.has(p));
        const quiet = error => { console.error(error); return new Map(); };
        const [photos, avatars] = await Promise.all([
            photoPaths.length ? this.store.photoUrls(photoPaths).catch(quiet) : new Map(),
            avatarPaths.length && this.store.avatarUrls ? this.store.avatarUrls(avatarPaths).catch(quiet) : new Map(),
        ]);
        if (token !== this._token || (!photos.size && !avatars.size)) return;
        for (const [k, v] of photos) this.photos.set(k, v);
        for (const [k, v] of avatars) this.avatars.set(k, v);
        this._render();
    }

    // ---- Cards ----

    _href(row) {
        return isOwn(row, this.userId) ? routeHref({ name: 'detail', id: row.id }) : routeHref({ name: 'memberDive', id: row.id });
    }

    _author(row) {
        const own = isOwn(row, this.userId);
        const member = this.members.get(row.owner) ?? null;
        const name = own ? tt('you', 'You') : displayName(member, key => translate(`diveLog.${key}`, 'Diver'));
        const url = member?.avatar_path ? this.avatars.get(member.avatar_path) : null;
        // The name follows in the same link: the picture is decoration there.
        const avatar = avatarHtml({ preset: member?.avatar_preset, url, name, id: row.owner, size: 40 });
        return {
            name, own, href: routeHref({ name: 'member', id: row.owner }),
            avatarHtml: `<span class="tr-author-av" aria-hidden="true">${avatar}</span>`,
        };
    }

    _visual(row, entry, site) {
        const photoUrl = row.photo_path ? this.photos.get(row.photo_path) ?? null : null;
        const { kind } = chooseCommunityVisual({ photoUrl, entry: row, apiKey: this.mapFailed ? '' : MAPY_API_KEY });
        const more = Math.max(0, (Number(row.photo_count) || 1) - 1);
        let map;
        if (kind === 'map') {
            map = {
                width: 640, height: 280, alt: fill(tl('feed.mapAlt', 'Map of {0}'), site?.name ?? ''),
                src: mapyStaticMapUrl({
                    lat: Number(row.site_lat), lon: Number(row.site_lon), apiKey: MAPY_API_KEY, width: 640, height: 280,
                    scale: (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1, lang: currentLang(),
                }),
            };
        }
        const depth = entry.max_depth_m != null && Number.isFinite(Number(entry.max_depth_m)) ? `${fmtNum(Number(entry.max_depth_m), 1)}${NB}m` : '';
        return visualHtml({
            kind, entryId: row.id, variant: 'feed', photoUrl, more, moreText: fill(tl('feed.morePhotos', '{0} more photos'), more), map,
            recordingId: entry.recording_id, profileAlt: tl('feed.profileAlt', 'Depth profile'), depthText: depth,
        });
    }

    _rating(entry) {
        const r = ratingOf(entry.details?.rating);
        return ratingHtml(r, fill(tl('form.ratingValue', 'Rating {0} / 5'), r));
    }

    _card(row) {
        const { entry, site } = entryFromCommunityRow(row);
        const buddies = (entry.buddies ?? []).join(', ');
        const tags = (Array.isArray(entry.details?.tags) ? entry.details.tags : [])
            .map(t => (TAGS.includes(t) ? tl(`form.choices.tags.${t}`, t) : String(t))).join(', ');
        const people = [buddies ? fill(tl('views.with', 'with {0}'), buddies) : '', tags].filter(Boolean).join(' · ');
        const when = [formatWeekdayDate(entry.dive_date, currentLang()), entry.entry_time ? String(entry.entry_time).slice(0, 5) : '']
            .filter(Boolean).join(', ');
        const numbered = entry.log_number !== null && entry.log_number !== undefined;
        return feedCardHtml({
            entry, href: this._href(row), author: this._author(row),
            title: diveTitle(entry, site?.name, key => tl(key, TITLE_FALLBACK[key] ?? key)), untitled: !site?.name,
            whenText: when, numberLabel: numbered ? fill(tl('number', '#{0}'), entry.log_number) : null,
            statsHtml: statsHtml(feedStats(entry, fmtNum), key => tl(`feed.stats.${key}`, STAT_FALLBACK[key])),
            peopleText: people, ratingHtml: this._rating(entry), visualHtml: this._visual(row, entry, site),
            lockHtml: isOwn(row, this.userId) && row.visibility === 'private' ? lockHtml(tt('visibility.private', 'Private')) : '',
            socialHtml: this.social?.barHtml(row, { commentsHref: this._href(row) }) ?? '',
        });
    }

    /** A card picture that failed: a photo falls back to the map or profile; one failed map stops all maps. */
    _onVisualError(e) {
        const failedAvatar = avatarImgFallback(e);
        if (failedAvatar) {
            for (const [k, v] of this.avatars) if (v === failedAvatar) this.avatars.set(k, null); // re-renders keep the preset, no re-signing
            return;
        }
        const img = e.target;
        if (img?.tagName !== 'IMG' || !img.classList.contains('lb-visual-img')) return;
        const box = img.closest('.lb-visual');
        const row = this.rows?.find(r => r.id === box?.dataset.entry);
        if (!box || !row) return;
        if (img.classList.contains('lb-map-img')) this.mapFailed = true;
        else this.photos.delete(row.photo_path);
        const { entry, site } = entryFromCommunityRow(row);
        box.outerHTML = this._visual(row, entry, site);
        this.sparks.watch(this.host);
    }

    // ---- Rendering ----

    _body() {
        if (this.failed) return `<p class="rda-account-msg" role="alert">${escHtml(tb('genericError', 'Something went wrong. Please try again.'))}</p>`;
        if (!this.rows) return `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        if (!this.rows.length) {
            return `<div class="lb-empty"><p class="rda-account-msg">${escHtml(this.owner ? tt('member.noDives', 'No dives to show yet.') : tt('feed.empty', 'No dives from members yet.'))}</p>
                ${this.owner ? '' : `<a class="btn btn-primary lb-empty-upload" href="${routeHref({ name: 'new' })}">${escHtml(tl('newDive', '+ New dive'))}</a>`}</div>`;
        }
        // Month heads carry no count: with paging the count of a month is only what is loaded so far.
        const months = groupByMonth(this.rows, localeTag(currentLang())).map(g => `<section class="lb-month">
            ${g.label ? `<h3 class="lb-month-head">${escHtml(g.label)}</h3>` : ''}
            <div class="lb-feed">${g.entries.map(r => this._card(r)).join('')}</div></section>`).join('');
        const more = this.more ? `<div class="tr-feed-foot">
            ${this.moreFailed ? `<p class="lb-form-error" role="alert">${escHtml(tt('feed.moreFailed', 'Couldn’t load more dives. Try again.'))}</p>` : ''}
            <button type="button" class="btn btn-secondary tr-feed-more" id="tr-feed-more"${this.loadingMore ? ' aria-disabled="true" aria-busy="true"' : ''}>${escHtml(this.loadingMore ? tb('loading', 'Loading…') : tt('feed.loadMore', 'Load more'))}</button></div>` : '';
        return months + more;
    }

    /** "Complete your profile" for a member whose profile has no name yet. */
    _nudgeHtml() {
        const p = this.me;
        const has = v => typeof v === 'string' && v.trim() !== '';
        if (!p || has(p.display_name) || has(p.nickname)) return '';
        const nick = Object.hasOwn(p, 'nickname');
        return `<section class="tr-nudge" aria-labelledby="tr-nudge-h">
            <h3 id="tr-nudge-h">${escHtml(tt('nudge.title', 'Complete your profile'))}</h3>
            <p>${escHtml(nick ? tt('nudge.textNick', 'Add your name and a nickname so other members know whose dives they see.') : tt('nudge.text', 'Add your name so other members know whose dives they see.'))}</p>
            <a class="btn btn-primary" href="${routeHref({ name: 'profile' })}">${escHtml(tt('nudge.go', 'Complete profile'))}</a></section>`;
    }

    _render() {
        if (this.destroyed) return;
        // A re-render (photos arriving, a page appended) must not drop focus: find the same control again by position.
        const controls = () => [...this.host.querySelectorAll('a, button')];
        const focused = this.host.contains(document.activeElement) ? document.activeElement : null;
        const at = focused ? controls().indexOf(focused) : -1;
        const key = focused && (focused.id || focused.getAttribute('href'));
        this.host.innerHTML = `<div class="tr-feed">
            ${this.title ? `<h2 class="tr-feed-title">${escHtml(tt('feed.title', 'Feed'))}</h2>` : ''}
            ${this._nudgeHtml()}
            ${this._body()}</div>`;
        if (at >= 0) {
            const el = controls()[at];
            if (el && (el.id || el.getAttribute('href')) === key) el.focus({ preventScroll: true });
        }
        this.sparks.watch(this.host);
    }
}
