/**
 * Kudos state and clicks for a view that shows dives (the Feed, a dive detail). The view renders the bar with
 * `barHtml(entry)` wherever it likes, passes clicks to `onClick(e)`, and re-renders when `onChange` fires.
 * Kudos toggle optimistically and roll back with a message when the server refuses.
 */

import { socialBarHtml, kudosListHtml, applyKudos } from './social.js';
import { displayName } from './community.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

export const ts = (key, fallback) => translate(`diveLog.trail.social.${key}`, fallback);

export function barText() {
    return {
        kudos: ts('kudos', 'Kudos'),
        countLabel: ts('kudosCount', '{0} kudos, show who'),
        commentsLabel: ts('commentsCount', '{0} comments'),
    };
}

export class SocialController {
    /**
     * @param {Object} o
     * @param {Object} o.store - with the social API (socialCounts, setKudos, listKudos, avatarUrls)
     * @param {string} o.userId
     * @param {() => void} o.onChange - re-render the bars
     */
    constructor({ store, userId, onChange }) {
        this.store = store;
        this.userId = userId;
        this.onChange = onChange;
        this.counts = new Map(); // entry id -> counts
        this.open = new Set(); // entry ids with the kudos list open
        this.lists = new Map(); // entry id -> rows | null (loading) | 'error'
        this.avatars = new Map();
        this.busy = new Set();
        this.errors = new Map(); // entry id -> message
        this.destroyed = false;
    }

    destroy() {
        this.destroyed = true;
    }

    _changed() {
        if (!this.destroyed) this.onChange?.();
    }

    /** Fetch counts for these dives (failures leave the bars out). */
    async load(ids) {
        if (!ids.length) return;
        try {
            const counts = await this.store.socialCounts(ids);
            if (this.destroyed) return;
            for (const [k, v] of counts) this.counts.set(k, v);
            this._changed();
        } catch (error) {
            console.error(error);
        }
    }

    /** Counts known for a dive (e.g. after a comment was added elsewhere on the page). */
    set(entryId, patch) {
        const c = this.counts.get(entryId);
        if (!c) return;
        this.counts.set(entryId, { ...c, ...patch });
        this._changed();
    }

    /**
     * The bar and, when open, the list of who gave kudos; '' while the counts are unknown.
     * @param {{id: string, owner: string}} entry
     * @param {{commentsHref?: string|null}} [o]
     */
    barHtml(entry, { commentsHref = null } = {}) {
        const counts = this.counts.get(entry.id);
        if (!counts) return '';
        const own = entry.owner === this.userId;
        const listOpen = this.open.has(entry.id) && counts.kudos > 0;
        const bar = socialBarHtml({ entryId: entry.id, counts, own, listOpen, commentsHref, busy: this.busy.has(entry.id), text: barText() });
        const error = this.errors.get(entry.id);
        const list = listOpen ? kudosListHtml({
            entryId: entry.id, rows: this.lists.has(entry.id) ? this.lists.get(entry.id) : null, avatarUrls: this.avatars,
            nameOf: r => (r.member_id === this.userId ? translate('diveLog.trail.you', 'You') : displayName(r, k => translate(`diveLog.${k}`, 'Diver'))),
            text: { loading: translate('diveLog.backend.loading', 'Loading…'), failed: ts('kudosListFailed', 'Couldn’t load the list. Try again.'), title: ts('kudosFrom', 'Kudos from') },
        }) : '';
        const msg = error ? `<p class="lb-form-error tr-social-error" role="alert">${escHtml(error)}</p>` : '';
        return bar || msg ? `<div class="tr-social-wrap">${bar}${list}${msg}</div>` : '';
    }

    /** Handle a click inside the view; true when it was a social control. */
    onClick(e) {
        const give = e.target.closest?.('[data-kudos]');
        if (give) {
            e.preventDefault();
            this._toggle(give.dataset.kudos);
            return true;
        }
        const list = e.target.closest?.('[data-kudos-list]');
        if (list) {
            e.preventDefault();
            this._toggleList(list.dataset.kudosList);
            return true;
        }
        return false;
    }

    async _toggle(entryId) {
        const before = this.counts.get(entryId);
        if (!before || this.busy.has(entryId)) return;
        const on = !before.kudoed;
        this.busy.add(entryId);
        this.errors.delete(entryId);
        this.counts.set(entryId, applyKudos(before, on));
        this.lists.delete(entryId); // the list changes too: reload it when open
        this._changed();
        try {
            await this.store.setKudos(entryId, on);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.counts.set(entryId, applyKudos(this.counts.get(entryId), !on));
            this.errors.set(entryId, ts('kudosFailed', 'Couldn’t save your kudos. Try again.'));
        }
        this.busy.delete(entryId);
        if (this.open.has(entryId)) this._loadList(entryId);
        this._changed();
    }

    _toggleList(entryId) {
        if (this.open.has(entryId)) this.open.delete(entryId);
        else {
            this.open.add(entryId);
            if (!Array.isArray(this.lists.get(entryId))) this._loadList(entryId);
        }
        this._changed();
    }

    async _loadList(entryId) {
        this.lists.delete(entryId);
        try {
            const rows = await this.store.listKudos(entryId);
            if (this.destroyed) return;
            this.lists.set(entryId, rows);
            this._changed();
            const paths = rows.map(r => r.avatar_path).filter(p => p && !this.avatars.has(p));
            if (paths.length && this.store.avatarUrls) {
                const urls = await this.store.avatarUrls(paths).catch(() => new Map());
                if (this.destroyed) return;
                for (const [k, v] of urls) this.avatars.set(k, v);
                this._changed();
            }
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.lists.set(entryId, 'error');
            this._changed();
        }
    }
}

/** The route of a dive from the point of view of `userId`. */
export function diveHref(entry, userId) {
    return entry.owner === userId ? routeHref({ name: 'detail', id: entry.id }) : routeHref({ name: 'memberDive', id: entry.id });
}
