/** Hash routes of the logbook page. Pure. */

const DIVE = /^#\/dive\/([A-Za-z0-9-]+)(?:\/(edit|analysis))?$/;

/** @returns {{name: string, id?: string}} */
export function parseRoute(hash) {
    if (!hash || hash === '#' || hash === '#/' || !hash.startsWith('#/')) return { name: 'list' };
    if (hash === '#/new') return { name: 'new' };
    const m = DIVE.exec(hash);
    if (m) return { name: m[2] === 'edit' ? 'edit' : m[2] === 'analysis' ? 'analysis' : 'detail', id: m[1] };
    return { name: 'notFound' };
}

/** @param {{name: string, id?: string}} route */
export function routeHref(route) {
    switch (route.name) {
        case 'new': return '#/new';
        case 'detail': return `#/dive/${route.id}`;
        case 'edit': return `#/dive/${route.id}/edit`;
        case 'analysis': return `#/dive/${route.id}/analysis`;
        default: return '#/';
    }
}
