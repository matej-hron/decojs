/**
 * "New for you": kudos and comments by other members on the caller's dives, newest first. Items since the last
 * visit are marked new; opening the page marks everything seen (the badge goes to zero).
 */

import { inboxLine, relativeTime } from './social.js';
import { ts } from './SocialBar.js';
import { displayName } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { formatDiveDate } from './entryModel.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

export class ActivityPage {
    /**
     * @param {HTMLElement} host
     * @param {{store: Object, onSeen?: () => void, onError?: (error: Error) => void}} o
     */
    constructor(host, { store, onSeen = null, onError = null }) {
        this.host = host;
        this.store = store;
        this.onSeen = onSeen;
        this.onError = onError;
        this.rows = null;
        this.avatars = new Map();
        this.destroyed = false;
        this._onImg = e => avatarImgFallback(e);
        host.addEventListener('error', this._onImg, true);
        this._render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this.host.removeEventListener('error', this._onImg, true);
        this.host.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this._render();
    }

    async _load() {
        try {
            const rows = await this.store.socialInbox(50);
            if (this.destroyed) return;
            this.rows = rows;
            this._render();
            if (rows.some(r => r.is_new)) {
                this.store.markSocialSeen().then(() => { if (!this.destroyed) this.onSeen?.(); }, error => console.error(error));
            } else {
                this.onSeen?.();
            }
            const paths = rows.map(r => r.avatar_path).filter(Boolean);
            if (paths.length && this.store.avatarUrls) {
                const urls = await this.store.avatarUrls(paths).catch(() => new Map());
                if (this.destroyed) return;
                this.avatars = urls;
                this._render();
            }
        } catch (error) {
            if (this.destroyed) return;
            if (this.onError) this.onError(error);
            else console.error(error);
        }
    }

    _item(r) {
        const name = displayName(r, k => translate(`diveLog.${k}`, 'Diver'));
        const dive = r.site_name || (r.dive_date ? formatDiveDate(r.dive_date, currentLang()) : ts('yourDive', 'your dive'));
        const { text, excerpt } = inboxLine(r, {
            name, dive, kudos: ts('inboxKudos', '{0} gave kudos to {1}'), comment: ts('inboxComment', '{0} commented on {1}'),
        });
        const url = r.avatar_path ? this.avatars.get(r.avatar_path) ?? null : null;
        const when = relativeTime(r.created_at, { locale: localeTag(currentLang()), justNow: ts('justNow', 'just now') });
        return `<li class="tr-inbox-item${r.is_new ? ' is-new' : ''}">
            <a class="tr-inbox-link" href="${routeHref({ name: 'detail', id: r.entry_id })}">
                <span class="tr-inbox-av" aria-hidden="true">${avatarHtml({ preset: r.avatar_preset, url, name, id: r.actor_id, size: 40 })}<span class="tr-inbox-kind">${r.kind === 'comment' ? '💬' : '👏'}</span></span>
                <span class="tr-inbox-text"><span class="tr-inbox-what">${r.is_new ? `<span class="rda-visually-hidden">${escHtml(ts('newItem', 'New:'))} </span>` : ''}${escHtml(text)}</span>
                ${excerpt ? `<span class="tr-inbox-excerpt">${escHtml(ts('quote', '“{0}”').replace('{0}', excerpt))}</span>` : ''}
                <span class="tr-inbox-when">${escHtml(when)}</span></span>
            </a></li>`;
    }

    _render() {
        if (this.destroyed) return;
        let body;
        if (!this.rows) body = `<p class="rda-account-msg">${escHtml(translate('diveLog.backend.loading', 'Loading…'))}</p>`;
        else if (!this.rows.length) body = `<p class="tr-inbox-empty">${escHtml(ts('inboxEmpty', 'Nothing yet. When members give kudos or comment on your dives, you’ll see it here.'))}</p>`;
        else body = `<ol class="tr-inbox">${this.rows.map(r => this._item(r)).join('')}</ol>`;
        this.host.innerHTML = `<div class="tr-activity"><h2 class="tr-feed-title">${escHtml(ts('inboxTitle', 'New for you'))}</h2>${body}</div>`;
    }
}
