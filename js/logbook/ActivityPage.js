/**
 * "New for you": dives buddies sent you (0013) on top, then kudos and comments by other members on the caller's
 * dives, newest first. Items since the last visit are marked new; opening the page marks them seen (the badge then
 * counts only the offers still waiting for an answer).
 */

import { inboxLine, relativeTime } from './social.js';
import { ts } from './SocialBar.js';
import { displayName } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { formatDiveDate, formatDuration } from './entryModel.js';
import { sameDiveCandidates } from './buddies.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { currentLang, localeTag, fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

export class ActivityPage {
    /**
     * @param {HTMLElement} host
     * @param {{store: Object, onSeen?: (waiting: number) => void, onError?: (error: Error) => void,
     *   onOpenDive?: (entryId: string) => void}} o - `onSeen` gets the number of buddy offers still waiting
     */
    constructor(host, { store, onSeen = null, onError = null, onOpenDive = null }) {
        this.host = host;
        this.store = store;
        this.onSeen = onSeen;
        this.onError = onError;
        this.onOpenDive = onOpenDive ?? (id => { location.hash = routeHref({ name: 'detail', id }); });
        this.rows = null;
        this.offers = []; // pending buddy offers (0013)
        this.own = []; // the user's own entries (is the offered dive one they logged already?)
        this.busy = null; // { id, text } while an offer is being answered
        this.offerError = null; // { id, text }
        this.avatars = new Map();
        this.destroyed = false;
        this._onImg = e => avatarImgFallback(e);
        host.addEventListener('error', this._onImg, true);
        this._onClick = e => this._click(e);
        host.addEventListener('click', this._onClick);
        this._render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this.host.removeEventListener('error', this._onImg, true);
        this.host.removeEventListener('click', this._onClick);
        this.host.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this._render();
    }

    /** Pending buddy offers and the own dives to match them against; none without 0013. */
    async _loadOffers() {
        if (typeof this.store.sharesStatus !== 'function' || !await this.store.sharesStatus().catch(() => false)) return [];
        const [offers, own] = await Promise.all([this.store.incomingDiveShares(), this.store.listEntries?.() ?? []]);
        this.own = own ?? [];
        return offers ?? [];
    }

    async _load() {
        try {
            const [rows, offers] = await Promise.all([
                this.store.socialInbox(50),
                this._loadOffers().catch(error => { console.error(error); return []; }),
            ]);
            if (this.destroyed) return;
            this.rows = rows;
            this.offers = offers;
            this._render();
            if (rows.some(r => r.is_new)) {
                this.store.markSocialSeen().then(() => { if (!this.destroyed) this.onSeen?.(this.offers.length); }, error => console.error(error));
            } else {
                this.onSeen?.(this.offers.length);
            }
            const paths = [...rows, ...offers].map(r => r.avatar_path).filter(Boolean);
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
                ${excerpt ? `<span class="tr-inbox-excerpt">${escHtml(ts('quote', '“{0}”').replace('{0}', () => excerpt))}</span>` : ''}
                <span class="tr-inbox-when">${escHtml(when)}</span></span>
            </a></li>`;
    }

    // ---- Dives buddies sent ----

    _offer(o) {
        const lang = currentLang();
        const name = displayName(o, k => translate(`diveLog.${k}`, 'Diver'));
        const url = o.avatar_path ? this.avatars.get(o.avatar_path) ?? null : null;
        const when = [formatDiveDate(o.dive_date, lang), o.entry_time ? String(o.entry_time).slice(0, 5) : ''].filter(Boolean).join(', ');
        const facts = [
            o.max_depth_m != null ? `${fmtNum(Number(o.max_depth_m), 1)}\u00A0m` : '',
            o.duration_s != null ? `${formatDuration(Number(o.duration_s))}\u00A0min` : '',
            o.has_recording ? ts('offerProfile', 'depth profile') : '',
            o.photo_count ? ts('offerPhotos', '{0} photos').replace('{0}', o.photo_count) : '',
        ].filter(Boolean).join(' · ');
        const busy = this.busy?.id === o.id;
        const dis = this.busy ? ' disabled' : '';
        const err = this.offerError?.id === o.id ? `<p class="lb-form-error" role="alert">${escHtml(this.offerError.text)}</p>` : '';
        const matches = sameDiveCandidates(o, this.own).slice(0, 2);
        const link = matches.map(e => {
            const label = [e.entry_time ? String(e.entry_time).slice(0, 5) : '', e.max_depth_m != null ? `${fmtNum(Number(e.max_depth_m), 1)}\u00A0m` : '']
                .filter(Boolean).join(', ') || `#${e.log_number}`;
            return `<button type="button" class="btn btn-secondary" data-offer-link="${escHtml(o.id)}" data-entry="${escHtml(e.id)}"${dis}>${escHtml(ts('offerLink', 'It’s my dive #{0} ({1})').replace('{0}', e.log_number ?? '').replace('{1}', label))}</button>`;
        }).join('');
        return `<li class="tr-offer">
            <div class="tr-offer-head"><span class="tr-inbox-av" aria-hidden="true">${avatarHtml({ preset: o.avatar_preset, url, name, id: o.sender, size: 40 })}</span>
                <span class="tr-inbox-text"><span class="tr-inbox-what">${escHtml(ts('offerFrom', '{0} sent you a dive you did together').replace('{0}', name))}</span>
                <span class="tr-offer-dive"><strong>${escHtml(o.site_name || ts('offerNoSite', 'Dive'))}</strong> · ${escHtml(when)}</span>
                ${facts ? `<span class="tr-inbox-when">${escHtml(facts)}</span>` : ''}</span></div>
            ${o.description ? `<p class="tr-inbox-excerpt">${escHtml(ts('quote', '“{0}”').replace('{0}', () => String(o.description).slice(0, 200)))}</p>` : ''}
            ${matches.length ? `<p class="tr-offer-match">${escHtml(ts('offerMatch', 'You may have logged this dive already. Link it instead of adding it twice:'))}</p>` : ''}
            <div class="lb-actions tr-offer-actions">
                <button type="button" class="btn btn-primary" data-offer-accept="${escHtml(o.id)}"${dis}>${escHtml(busy ? this.busy.text : matches.length ? ts('offerAddNew', 'Add as a new dive') : ts('offerAdd', 'Add to my log'))}</button>
                ${link}
                <button type="button" class="btn btn-secondary" data-offer-decline="${escHtml(o.id)}"${dis}>${escHtml(ts('offerDecline', 'Decline'))}</button>
            </div>${err}</li>`;
    }

    _offersHtml() {
        if (!this.offers.length) return '';
        // A plain div: the site styles every <section> as a card.
        return `<div class="tr-offers" role="region" aria-labelledby="tr-offers-h"><h3 class="tr-section-head" id="tr-offers-h">${escHtml(ts('offersTitle', 'Dives from your buddies'))}</h3>
            <ol class="tr-offer-list">${this.offers.map(o => this._offer(o)).join('')}</ol></div>`;
    }

    _click(e) {
        const accept = e.target.closest('[data-offer-accept]');
        const link = e.target.closest('[data-offer-link]');
        const decline = e.target.closest('[data-offer-decline]');
        if (accept) this._answer(accept.dataset.offerAccept, { mode: 'copy' });
        else if (link) this._answer(link.dataset.offerLink, { mode: 'link', entryId: link.dataset.entry });
        else if (decline) this._answer(decline.dataset.offerDecline, { mode: 'decline' });
    }

    async _answer(id, { mode, entryId = null }) {
        const offer = this.offers.find(o => o.id === id);
        if (!offer || this.busy) return;
        this.offerError = null;
        this.busy = { id, text: ts('offerSaving', 'Adding…') };
        this._render();
        try {
            if (mode === 'decline') {
                await this.store.declineDiveShare(id);
                this._drop(id);
                return;
            }
            const { entryId: target, copied } = await this.store.acceptDiveShare(id, mode === 'link' ? entryId : null);
            if (copied && (offer.photo_count || 0) > 0) {
                const { failed } = await this.store.copySharedMedia(id, target, (done, total) => {
                    this.busy = { id, text: ts('offerCopying', 'Copying photos {0}/{1}…').replace('{0}', done).replace('{1}', total) };
                    this._render();
                });
                if (failed) console.warn(`${failed} photo(s) could not be copied`);
            }
            this._drop(id);
            if (!this.destroyed && target) this.onOpenDive(target);
        } catch (error) {
            console.error(error);
            if (this.destroyed) return;
            this.busy = null;
            this.offerError = { id, text: translate('diveLog.backend.genericError', 'Something went wrong. Please try again.') };
            this._render();
        }
    }

    _drop(id) {
        this.busy = null;
        this.offers = this.offers.filter(o => o.id !== id);
        if (this.destroyed) return;
        this._render();
        this.onSeen?.(this.offers.length);
    }

    _render() {
        if (this.destroyed) return;
        let body;
        if (!this.rows) body = `<p class="rda-account-msg">${escHtml(translate('diveLog.backend.loading', 'Loading…'))}</p>`;
        else if (!this.rows.length && this.offers.length) body = '';
        else if (!this.rows.length) body = `<p class="tr-inbox-empty">${escHtml(ts('inboxEmpty', 'Nothing yet. When members give kudos or comment on your dives, you’ll see it here.'))}</p>`;
        else body = `<ol class="tr-inbox">${this.rows.map(r => this._item(r)).join('')}</ol>`;
        this.host.innerHTML = `<div class="tr-activity"><h2 class="tr-feed-title">${escHtml(ts('inboxTitle', 'New for you'))}</h2>${this.rows ? this._offersHtml() : ''}${body}</div>`;
    }
}
