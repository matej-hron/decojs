/** Hash routes of the logbook page. Pure. */

const SITE = /^#\/site\/([A-Za-z0-9-]+)$/;
const DIVE = /^#\/dive\/([A-Za-z0-9-]+)(?:\/(edit|analysis))?$/;
const MEMBER = /^#\/member\/([A-Za-z0-9-]+)$/;
const MEMBER_DIVE = /^#\/m\/([A-Za-z0-9-]+)(\/analysis)?$/;

const STATIC = {
    '#/dives': 'list',
    '#/new': 'new',
    '#/sites': 'sites',
    '#/feed': 'feed',
    '#/community': 'community',
    '#/profile': 'profile',
    '#/activity': 'activity',
};

/** @returns {{name: string, id?: string}} */
export function parseRoute(hash) {
    if (!hash || hash === '#' || hash === '#/' || !hash.startsWith('#/')) return { name: 'home' };
    if (Object.hasOwn(STATIC, hash)) return { name: STATIC[hash] };
    const site = SITE.exec(hash);
    if (site) return { name: 'site', id: site[1] };
    const m = DIVE.exec(hash);
    if (m) return { name: m[2] === 'edit' ? 'edit' : m[2] === 'analysis' ? 'analysis' : 'detail', id: m[1] };
    const member = MEMBER.exec(hash);
    if (member) return { name: 'member', id: member[1] };
    const md = MEMBER_DIVE.exec(hash);
    if (md) return { name: md[2] ? 'memberAnalysis' : 'memberDive', id: md[1] };
    return { name: 'notFound' };
}

/** @param {{name: string, id?: string}} route */
export function routeHref(route) {
    switch (route.name) {
        case 'list': return '#/dives';
        case 'new': return '#/new';
        case 'detail': return `#/dive/${route.id}`;
        case 'edit': return `#/dive/${route.id}/edit`;
        case 'analysis': return `#/dive/${route.id}/analysis`;
        case 'sites': return '#/sites';
        case 'site': return `#/site/${route.id}`;
        case 'feed': return '#/feed';
        case 'community': return '#/community';
        case 'profile': return '#/profile';
        case 'activity': return '#/activity';
        case 'member': return `#/member/${route.id}`;
        case 'memberDive': return `#/m/${route.id}`;
        case 'memberAnalysis': return `#/m/${route.id}/analysis`;
        default: return '#/';
    }
}
