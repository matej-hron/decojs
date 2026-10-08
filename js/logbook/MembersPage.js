/**
 * DecoTrail Community: the directory of invited members, own card first.
 * Stats on each card count only the dives the viewer may see (the backend computes them).
 */

import { routeHref } from './router.js';
import { displayName, isOwn, countryName, memberSummaryParts } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { formatDiveDate } from './entryModel.js';
import { diveCountText } from './SitesPage.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const SUMMARY_FALLBACK = { deepest: 'deepest {0}', lastDive: 'last dive {0}' };

/** The member card line: "12 dives · deepest 38,6 m · last dive 30. 9. 2026" in the UI language. */
export function memberSummaryText(member, lang = currentLang()) {
    return summaryParts(member, lang).join(' · ');
}

function summaryParts(member, lang = currentLang()) {
    return memberSummaryParts(member, {
        count: n => diveCountText(n, lang),
        num: (n, d) => fmtNum(n, d, lang),
        date: d => formatDiveDate(d, lang),
        t: key => tt(`community.${key}`, SUMMARY_FALLBACK[key]),
    });
}

/** Name shown for a member: "Diver" when the profile has none. */
export function memberName(member) {
    return displayName(member, key => translate(`diveLog.${key}`, 'Diver'));
}

export class MembersPage {
    /**
     * @param {HTMLElement} host
     * @param {Object} options
     * @param {Object} options.store - DiveStore with the community API
     * @param {string} options.userId - the signed-in user
     * @param {(error: Error) => void} [options.onError] - loading failed (default: a message in place)
     */
    constructor(host, { store, userId, onError = null }) {
        this.host = host;
        this.store = store;
        this.userId = userId;
        this.onError = onError;
        this.members = null; // null while loading
        this.avatars = new Map(); // avatar path -> signed URL (null: failed to load)
        this.failed = false;
        this.destroyed = false;
        this._onImgError = e => {
            const failed = avatarImgFallback(e);
            if (failed) for (const [k, v] of this.avatars) if (v === failed) this.avatars.set(k, null);
        };
        this.host.addEventListener('error', this._onImgError, true); // image errors do not bubble
        this._render();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this.host.removeEventListener('error', this._onImgError, true);
        this.host.innerHTML = '';
    }

    relabel() {
        if (!this.destroyed) this._render();
    }

    async _load() {
        let members;
        try {
            members = (await this.store.listMembers()) ?? [];
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
        // The backend already lists the caller first; keep that even if it does not.
        this.members = [...members].sort((a, b) => Number(isOwn(b, this.userId)) - Number(isOwn(a, this.userId)));
        this._render();
        const paths = this.members.map(m => m.avatar_path).filter(Boolean);
        if (!paths.length || !this.store.avatarUrls) return;
        try {
            const urls = await this.store.avatarUrls(paths);
            if (this.destroyed || !urls?.size) return;
            for (const [k, v] of urls) this.avatars.set(k, v);
            this._render();
        } catch (error) {
            console.error(error); // the presets stay
        }
    }

    _card(member) {
        const own = isOwn(member, this.userId);
        const name = memberName(member);
        const url = member.avatar_path ? this.avatars.get(member.avatar_path) ?? null : null;
        const country = countryName(member.home_country, currentLang());
        // The card is one link and the name is its text: the picture is decoration there.
        const avatar = avatarHtml({ preset: member.avatar_preset, url, name, id: member.id, size: 56 });
        const href = own ? routeHref({ name: 'profile' }) : routeHref({ name: 'member', id: member.id });
        return `<li class="tr-member-item"><a class="tr-member-card${own ? ' tr-member-own' : ''}" href="${escHtml(href)}">
                <span class="tr-member-av" aria-hidden="true">${avatar}</span>
                <span class="tr-member-text">
                    <span class="tr-member-name"><span class="tr-member-name-text">${escHtml(name)}</span>${own ? `<span class="tr-you-tag">${escHtml(tt('you', 'You'))}</span>` : ''}</span>
                    ${country ? `<span class="tr-member-country">${escHtml(country)}</span>` : ''}
                    <span class="tr-member-stats">${summaryParts(member).map(p => `<span class="tr-nowrap">${escHtml(p)}</span>`).join(' · ')}</span>
                </span></a></li>`;
    }

    _body() {
        if (this.failed) return `<p class="rda-account-msg" role="alert">${escHtml(tb('genericError', 'Something went wrong. Please try again.'))}</p>`;
        if (!this.members) return `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
        return `<ul class="tr-members" role="list">${this.members.map(m => this._card(m)).join('')}</ul>`;
    }

    _render() {
        if (this.destroyed) return;
        const focusedHref = this.host.contains(document.activeElement) ? document.activeElement.getAttribute('href') : null;
        this.host.innerHTML = `<div class="tr-community">
            <div class="tr-page-head">
                <h2 class="tr-feed-title">${escHtml(tt('community.title', 'Community'))}</h2>
                <p class="tr-page-intro">${escHtml(tt('community.intro', 'Everyone here was invited. They see your dives unless you make them private.'))}</p>
            </div>
            ${this._body()}</div>`;
        if (focusedHref) [...this.host.querySelectorAll('a')].find(a => a.getAttribute('href') === focusedHref)?.focus({ preventScroll: true });
    }
}
