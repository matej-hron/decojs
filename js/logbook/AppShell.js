/**
 * DecoTrail app shell: the tab navigation (inline in the top bar on wide screens,
 * a fixed bottom bar on phones) and the pure route decisions behind it.
 */

import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

/** All tabs, in display order. */
export const SHELL_TABS = Object.freeze(['feed', 'list', 'community', 'sites', 'profile']);

/** Tabs and routes that exist only when the community backend (migration 0004) is available. */
const COMMUNITY_TABS = new Set(['feed', 'community', 'profile']);
const COMMUNITY_ROUTES = new Set(['feed', 'community', 'member', 'memberDive', 'memberAnalysis', 'profile']);

const TAB_OF_ROUTE = {
    feed: 'feed',
    list: 'list', new: 'list', detail: 'list', edit: 'list', analysis: 'list',
    community: 'community', member: 'community', memberDive: 'feed', memberAnalysis: 'feed', // a member's dive is usually opened from the Feed
    sites: 'sites', site: 'sites',
    profile: 'profile',
};

const LABEL_FALLBACK = { feed: 'Feed', list: 'My dives', community: 'Community', sites: 'Sites', profile: 'Profile' };

/** 24×24 line icons (stroke = currentColor). */
const ICONS = {
    feed: '<rect x="4" y="3.5" width="16" height="8.5" rx="2"/><path d="M4 16h16M4 20h10"/>',
    list: '<path d="M6 3.5h10.5A2.5 2.5 0 0 1 19 6v14.5H8.5A2.5 2.5 0 0 1 6 18z"/><path d="M6 18a2.5 2.5 0 0 1 2.5-2.5H19M10 8h5"/>',
    community: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5"/>',
    sites: '<path d="M12 21s-6.5-5.6-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
    profile: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.6 18.4a6.5 6.5 0 0 1 10.8 0"/>',
};

/** The tabs to show: without the community feature only My dives and Sites. */
export function shellTabs(communityOn) {
    return SHELL_TABS.filter(tab => communityOn || !COMMUNITY_TABS.has(tab));
}

/** The tab a route belongs to (`home` → Feed with the community feature, else My dives); null for none. */
export function activeTab(routeName, communityOn = false) {
    if (routeName === 'home') return communityOn ? 'feed' : 'list';
    return TAB_OF_ROUTE[routeName] ?? null;
}

/** Whether a route exists only with the community feature. */
export function isCommunityRoute(name) {
    return COMMUNITY_ROUTES.has(name);
}

/** The route to show: `home` picks Feed or My dives; community routes fall back to My dives when the feature is off. */
export function resolveRoute(route, communityOn) {
    if (route.name === 'home') return { name: communityOn ? 'feed' : 'list' };
    if (!communityOn && COMMUNITY_ROUTES.has(route.name)) return { name: 'list' };
    return route;
}

function tabHtml(tab, active) {
    const label = escHtml(translate(`diveLog.trail.tab.${tab}`, LABEL_FALLBACK[tab]));
    const current = tab === active ? ' aria-current="page"' : '';
    return `<a class="tr-tab" href="${routeHref({ name: tab })}" data-tab="${tab}"${current}>`
        + `<svg class="tr-tab-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[tab]}</svg>`
        + `<span class="tr-tab-label">${label}</span></a>`;
}

export class AppShell {
    /**
     * @param {{topNav?: HTMLElement|null, bottomNav?: HTMLElement|null}} navs
     *   the top-bar tab strip (wide screens) and the bottom tab bar (phones)
     */
    constructor({ topNav = null, bottomNav = null } = {}) {
        this.navs = [topNav, bottomNav].filter(Boolean);
    }

    /** The shell of the page's `.tr-tabs` / `.tr-bottom`, or null when the page has neither. */
    static fromDocument(doc = globalThis.document) {
        const topNav = doc?.querySelector?.('.tr-tabs') ?? null;
        const bottomNav = doc?.querySelector?.('.tr-bottom') ?? null;
        return topNav || bottomNav ? new AppShell({ topNav, bottomNav }) : null;
    }

    /** Show `tabs` with `active` marked; no tabs hides the navigation. */
    render({ tabs = [], active = null } = {}) {
        const html = tabs.map(tab => tabHtml(tab, active)).join('');
        for (const nav of this.navs) {
            nav.innerHTML = html;
            nav.hidden = !tabs.length;
            nav.style.setProperty('--tr-tabs', String(Math.max(tabs.length, 1)));
        }
    }

    destroy() {
        this.render({ tabs: [] });
    }
}
