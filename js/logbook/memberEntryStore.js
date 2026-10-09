/**
 * Read-only store adapter for another member's dive: gives `EntryDetail` and
 * `RecordedDiveAnalysis` (embedded) the methods they read through, backed by the
 * community RPCs. It offers no write methods, and the entry never carries notes.
 */

import { entryFromCommunityRow } from './community.js';

/**
 * @param {Object} store - the Supabase store with the community API
 * @param {Object} row - a `community_entries` row
 * @returns {{entry: Object, site: Object|null, adapter: Object}}
 */
export function memberEntryStore(store, row) {
    const { entry, site } = entryFromCommunityRow(row);
    const adapter = Object.freeze({
        listSites: async () => (site ? [site] : []),
        listMedia: id => store.listCommunityMedia(id),
        photoUrls: paths => store.photoUrls(paths),
        listDives: () => store.communityRecordings(row.owner),
        loadDive: id => store.loadCommunityRecording(id),
        reparseOutdated: async () => 0, // someone else's recordings are never rewritten
        onAuthChange: () => () => {},
        currentUser: () => store.currentUser(),
    });
    return { entry, site, adapter };
}
