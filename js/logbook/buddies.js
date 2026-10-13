/**
 * Buddy field helpers (pure): which suggestions match what is typed, and when a buddy dive offer looks like a dive
 * the recipient already logged. "@" narrows the suggestions to DecoTrail members.
 */

/** Lower case without diacritics and extra spaces: "Kryštof " and "krystof" are the same key. */
export function buddyKey(name) {
    return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** How a member appears in a buddy list: the nickname, else the display name; null without either. */
export function memberBuddyName(member) {
    const nick = typeof member?.nickname === 'string' ? member.nickname.trim() : '';
    const name = typeof member?.display_name === 'string' ? member.display_name.trim() : '';
    return nick || name || null;
}

/**
 * Suggestions for the buddy field.
 * @param {string} typed - the field's text ("@kry" asks for members only)
 * @param {Object} o
 * @param {string[]} [o.names] - buddy names used before, most used first
 * @param {Object[]} [o.members] - community members (id, nickname, display_name, avatar_*)
 * @param {string|null} [o.userId] - the user (never suggested)
 * @param {string[]} [o.added] - names already on the dive (not suggested again)
 * @param {number} [o.limit]
 * @returns {Array<{name: string, member: Object|null}>} members first when "@" is typed, otherwise in the order
 *   past names, then the other members
 */
export function matchBuddies(typed, { names = [], members = [], userId = null, added = [], limit = 8 } = {}) {
    const text = String(typed ?? '').trim();
    const membersOnly = text.startsWith('@');
    const query = buddyKey(membersOnly ? text.slice(1) : text);
    const taken = new Set(added.map(buddyKey));
    const out = [];
    const seen = new Set();
    const push = (name, member) => {
        const key = buddyKey(name);
        if (!key || taken.has(key) || seen.has(key)) return;
        const full = member ? buddyKey(member.display_name) : '';
        if (query && !key.includes(query) && !full.includes(query)) return;
        seen.add(key);
        out.push({ name, member });
    };
    const memberByKey = new Map();
    for (const m of members ?? []) {
        const name = memberBuddyName(m);
        if (!name || m.id === userId) continue;
        memberByKey.set(buddyKey(name), m);
    }
    if (membersOnly) {
        for (const m of memberByKey.values()) push(memberBuddyName(m), m);
    } else {
        // A past name that is also a member's name suggests that member.
        for (const n of names ?? []) if (typeof n === 'string') push(n.trim(), memberByKey.get(buddyKey(n)) ?? null);
        for (const m of memberByKey.values()) push(memberBuddyName(m), m);
    }
    return out.slice(0, limit);
}

/** Minutes since midnight of "21:05" / "21:05:00"; null when absent or malformed. */
function minutes(time) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** How close a start time must be for "this looks like your dive". */
export const SAME_DIVE_MINUTES = 90;

/**
 * The user's own dives that may be the offered one: the same date and, when both have a time, starting within
 * SAME_DIVE_MINUTES. Closest first.
 * @param {{dive_date: string, entry_time?: string|null}} offer
 * @param {Object[]} entries - the user's own log entries
 */
export function sameDiveCandidates(offer, entries) {
    const at = minutes(offer?.entry_time);
    return (entries ?? [])
        .filter(e => e.dive_date === offer?.dive_date)
        .map(e => {
            const t = minutes(e.entry_time);
            return { entry: e, gap: at === null || t === null ? null : Math.abs(t - at) };
        })
        .filter(c => c.gap === null || c.gap <= SAME_DIVE_MINUTES)
        .sort((a, b) => (a.gap ?? SAME_DIVE_MINUTES + 1) - (b.gap ?? SAME_DIVE_MINUTES + 1))
        .map(c => c.entry);
}
