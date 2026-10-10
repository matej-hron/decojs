/** Pure helpers for the DecoTrail community views (profiles, members, shared dives). */

import { formatTotalTime } from './feed.js';

/** Visibility values stored on an entry; `link` exists in the schema but is not offered yet. */
export const VISIBILITIES = Object.freeze(['private', 'members', 'link']);
export const OFFERED_VISIBILITIES = Object.freeze(['private', 'members']);

const finiteNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Public name of a member: the nickname, else the display name, else the translated "Diver". Never the email. */
export function displayName(member, t) {
    const nick = typeof member?.nickname === 'string' ? member.nickname.trim() : '';
    return nick || fullName(member) || t('trail.diver');
}

/** The trimmed display name ('' when none): shown small under a nickname. */
export function fullName(member) {
    return typeof member?.display_name === 'string' ? member.display_name.trim() : '';
}

/** Longest nickname the server accepts. */
export const NICKNAME_MAX = 40;

/**
 * Buddy suggestions: the names typed before, then other members by nickname (their full name as the hint).
 * Only suggestions — buddies stay free text. Case-insensitive duplicates are dropped.
 * @param {string[]} typed - earlier buddy names
 * @param {Object[]} members - community_members rows
 * @param {string} userId - left out
 * @returns {{value: string, label?: string}[]}
 */
export function buddySuggestions(typed, members, userId) {
    const out = [];
    const seen = new Set();
    const add = (value, label) => {
        const key = value.toLocaleLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        out.push(label && label !== value ? { value, label } : { value });
    };
    for (const name of typed ?? []) if (typeof name === 'string') add(name.trim());
    for (const m of members ?? []) {
        if (!m || m.id === userId) continue;
        const nick = typeof m.nickname === 'string' ? m.nickname.trim() : '';
        if (nick) add(nick, fullName(m));
    }
    return out;
}

/** Whether an entry (by `owner`) or member (by `id`) belongs to `userId`. */
export function isOwn(entryOrMember, userId) {
    if (!entryOrMember || !userId) return false;
    return (entryOrMember.owner ?? entryOrMember.id) === userId;
}

/**
 * Which visual a community dive card shows: its photo, a map (only when an API key
 * exists and the site's coordinates were shared), the recorded profile, or nothing.
 * @returns {{kind: 'photo'|'map'|'profile'|'none'}}
 */
export function chooseCommunityVisual({ photoUrl, entry, apiKey } = {}) {
    if (photoUrl) return { kind: 'photo' };
    if (apiKey && finiteNum(entry?.site_lat) && finiteNum(entry?.site_lon)) return { kind: 'map' };
    if (entry?.recording_id) return { kind: 'profile' };
    return { kind: 'none' };
}

/** Stat tiles of a member card: dive count, deepest dive (when known), total time. */
export function memberStatsView(member, num) {
    const out = [{ key: 'dives', value: String(Number(member?.dive_count) || 0), unit: '' }];
    if (finiteNum(member?.deepest_m)) out.push({ key: 'deepest', value: num(Number(member.deepest_m), 1), unit: 'm' });
    out.push({ key: 'time', value: formatTotalTime(member?.total_s, num), unit: '' });
    return out;
}

/**
 * The summary line of a member card, as parts to join: dive count, deepest dive, last dive date.
 * Parts without data are left out. Pure: the caller passes the formatters.
 * @param {Object} member - a `community_members` row
 * @param {Object} f
 * @param {(n: number) => string} f.count - "12 dives" in the right plural form
 * @param {(n: number, digits: number) => string} f.num - localized number
 * @param {(date: string) => string} f.date - localized date
 * @param {(key: 'deepest'|'lastDive') => string} f.t - templates with {0}: "deepest {0}", "last dive {0}"
 * @returns {string[]}
 */
export function memberSummaryParts(member, { count, num, date, t }) {
    const fill = (text, value) => String(text).replace('{0}', value);
    const parts = [count(Number(member?.dive_count) || 0)];
    if (finiteNum(member?.deepest_m)) parts.push(fill(t('deepest'), `${num(Number(member.deepest_m), 1)}\u00a0m`));
    if (member?.last_dive_date) parts.push(fill(t('lastDive'), date(String(member.last_dive_date))));
    return parts;
}

/** Localized region name for an ISO 3166-1 alpha-2 code; the code itself when unavailable. */
export function countryName(code, lang) {
    if (!code) return '';
    try {
        return new Intl.DisplayNames([lang || 'en'], { type: 'region' }).of(String(code).toUpperCase()) || code;
    } catch {
        return code;
    }
}

/** All officially assigned ISO 3166-1 alpha-2 codes (sort by countryName at render time). */
export const COUNTRY_CODES = Object.freeze((
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
    'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
    'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' '));

/**
 * Split a `community_dives`-style row into the entry and its site. Site (except
 * `site_id`) and photo columns stay off the entry, and notes are never carried (they are private).
 * @returns {{entry: Object, site: Object|null}}
 */
export function entryFromCommunityRow(row) {
    const entry = {};
    for (const [k, v] of Object.entries(row ?? {})) {
        // site_id stays: entry views look the site up by entry.site_id.
        if ((k.startsWith('site_') && k !== 'site_id') || k.startsWith('photo_') || k === 'notes') continue;
        entry[k] = v;
    }
    entry.notes = null;
    const site = row?.site_id ? {
        id: row.site_id,
        name: row.site_name,
        country: row.site_country,
        water: row.site_water,
        altitude_m: row.site_altitude_m,
        lat: row.site_lat ?? null,
        lon: row.site_lon ?? null,
        url: row.site_url ?? null,
    } : null;
    return { entry, site };
}
