/**
 * DecoTrail member profile: big avatar, name and country, stat tiles, favourite sites,
 * then the member's recent dives (a CommunityFeed filtered by owner). The own page adds "Edit profile".
 */

import { routeHref } from './router.js';
import { isOwn, countryName, memberStatsView } from './community.js';
import { avatarHtml, avatarImgFallback } from './avatars.js';
import { memberName } from './MembersPage.js';
import { CommunityFeed } from './CommunityFeed.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const NB = ' ';
const tt = (key, fallback) => translate(`diveLog.trail.${key}`, fallback);
const tb = (key, fallback) => translate(`diveLog.backend.${key}`, fallback);
const STAT_FALLBACK = { dives: 'Dives', deepest: 'Deepest', time: 'Total time' };

export class MemberPage {
    /**
     * @param {HTMLElement} host
     * @param {Object} options
     * @param {Object} options.store - DiveStore with the community API
     * @param {string} options.userId - the signed-in user
     * @param {string} options.memberId - whose page
     * @param {(error: Error) => void} [options.onError] - loading the member failed (default: a message in place)
     */
    constructor(host, { store, userId, memberId, onError = null }) {
        this.host = host;
        this.store = store;
        this.userId = userId;
        this.memberId = memberId;
        this.onError = onError;
        this.member = undefined; // undefined while loading, null when not found
        this.avatarUrl = null;
        this.failed = false;
        this.feed = null;
        this.destroyed = false;
        this.host.innerHTML = '<div class="tr-member-page"><div class="tr-member-top"></div></div>';
        this.top = this.host.querySelector('.tr-member-top');
        // Only the header's avatar: the feed below handles its own author avatars.
        this._onImgError = e => { if (avatarImgFallback(e)) this.avatarUrl = null; };
        this.top.addEventListener('error', this._onImgError, true); // image errors do not bubble
        this._renderTop();
        this._load();
    }

    destroy() {
        this.destroyed = true;
        this.feed?.destroy();
        this.feed = null;
        this.top.removeEventListener('error', this._onImgError, true);
        this.host.innerHTML = '';
    }

    relabel() {
        if (this.destroyed) return;
        this._renderTop();
        this._renderDivesHead();
        this.feed?.relabel();
    }

    async _load() {
        let member;
        try {
            member = await this.store.getMember(this.memberId);
        } catch (error) {
            if (this.destroyed) return;
            if (this.onError) this.onError(error);
            else {
                console.error(error);
                this.failed = true;
                this._renderTop();
            }
            return;
        }
        if (this.destroyed) return;
        this.member = member ?? null;
        this._renderTop();
        if (!this.member) return;
        this._mountFeed();
        if (!this.member.avatar_path || !this.store.avatarUrls) return;
        try {
            const urls = await this.store.avatarUrls([this.member.avatar_path]);
            const url = urls?.get(this.member.avatar_path);
            if (this.destroyed || !url) return;
            this.avatarUrl = url;
            this._renderTop();
        } catch (error) {
            console.error(error); // the preset stays
        }
    }

    _mountFeed() {
        // Plain divs: the site styles every <section> as a card.
        const section = document.createElement('div');
        section.className = 'tr-member-dives';
        section.innerHTML = '<h3 class="tr-section-head" id="tr-member-dives-h"></h3><div class="tr-member-feed"></div>';
        this.host.firstChild.appendChild(section);
        this._renderDivesHead();
        this.feed = new CommunityFeed(section.querySelector('.tr-member-feed'), {
            store: this.store, userId: this.userId, owner: this.memberId, title: false,
        });
    }

    _renderDivesHead() {
        const head = this.host.querySelector('#tr-member-dives-h');
        if (head) head.textContent = tt('member.recentDives', 'Recent dives');
    }

    _renderTop() {
        if (this.destroyed) return;
        if (this.failed) {
            this.top.innerHTML = `<p class="rda-account-msg" role="alert">${escHtml(tb('genericError', 'Something went wrong. Please try again.'))}</p>`;
            return;
        }
        if (this.member === undefined) {
            this.top.innerHTML = `<p class="rda-account-msg">${escHtml(tb('loading', 'Loading…'))}</p>`;
            return;
        }
        if (this.member === null) {
            this.top.innerHTML = `<section class="rda-card lb-message">
                <h2>${escHtml(tt('member.notFound', 'Member not found'))}</h2>
                <p><a href="${routeHref({ name: 'community' })}">${escHtml(tt('member.toCommunity', 'Back to Community'))}</a></p></section>`;
            return;
        }
        const m = this.member;
        const own = isOwn(m, this.userId);
        const name = memberName(m);
        const country = countryName(m.home_country, currentLang());
        // The heading carries the name: the picture is decoration here.
        const avatar = avatarHtml({ preset: m.avatar_preset, url: this.avatarUrl, name, id: m.id, size: 96 });
        const tiles = memberStatsView(m, (n, d) => fmtNum(n, d)).map(s => `<div class="tr-tile tr-tile-${s.key}">
                <dt>${escHtml(tt(`member.stats.${s.key}`, STAT_FALLBACK[s.key]))}</dt>
                <dd>${escHtml(s.value)}${s.unit ? `<span class="tr-tile-unit">${NB}${escHtml(s.unit)}</span>` : ''}</dd></div>`).join('');
        const sites = (Array.isArray(m.top_sites) ? m.top_sites : []).filter(s => typeof s === 'string' && s.trim());
        this.top.innerHTML = `<div class="tr-member-head${own ? ' tr-member-head-own' : ''}">
                <span class="tr-member-head-av" aria-hidden="true">${avatar}</span>
                <div class="tr-member-head-text">
                    <h2 class="tr-member-head-name">${escHtml(name)}${own ? ` <span class="tr-you-tag">${escHtml(tt('you', 'You'))}</span>` : ''}</h2>
                    ${country ? `<p class="tr-member-head-country">${escHtml(country)}</p>` : ''}
                    ${own ? `<a class="btn btn-secondary tr-member-edit" href="${routeHref({ name: 'profile' })}">${escHtml(tt('member.editProfile', 'Edit profile'))}</a>` : ''}
                </div>
            </div>
            <dl class="tr-tiles">${tiles}</dl>
            ${sites.length ? `<div class="tr-member-sites">
                <h3 class="tr-section-head" id="tr-member-sites-h">${escHtml(tt('member.favouriteSites', 'Favourite sites'))}</h3>
                <ul class="tr-chips" role="list">${sites.map(s => `<li class="tr-chip">${escHtml(s.trim())}</li>`).join('')}</ul></div>` : ''}`;
    }
}
