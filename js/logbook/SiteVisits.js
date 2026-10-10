/**
 * Markup of the site page's visits: the summary (visits, visibility, water by month) and the list of
 * dives at the site that the user may see. State lives in SitesPage; this module only renders.
 */

import { siteVisitStats } from './visits.js';
import { formatDuration, formatDiveDate } from './entryModel.js';
import { displayName, isOwn } from './community.js';
import { avatarHtml } from './avatars.js';
import { routeHref } from './router.js';
import { translate } from '../i18n.js';
import { fmtNum, currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

/** Visits listed before "Show all". */
export const VISITS_SHOWN = 20;

const NB = ' ';
const tv = (key, fallback) => translate(`diveLog.logbook.sites.visits.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const metres = v => (has(v) ? `${fmtNum(Number(v), 1)}${NB}m` : '–');
/** Range "8–12 °C"; one value when min equals max. */
const tempRange = (min, max) => (min === max ? fmtNum(min) : `${fmtNum(min)}–${fmtNum(max)}`);
// The water strip tints each month between these temperatures (°C).
const COLD = 4;
const WARM = 28;

/** Short month names (January first) in the UI language. */
function monthNames(lang) {
    try {
        const f = new Intl.DateTimeFormat(localeTag(lang), { month: 'short', timeZone: 'UTC' });
        return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2026, i, 15))).replace(/\.$/, ''));
    } catch {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
}

function visTile(key, label, v) {
    const value = v ? `${fmtNum(v.avg, 1)}<span class="lb-unit">${NB}m</span>` : '–';
    const sub = v ? fill(tv('best', 'best {0}'), `${fmtNum(v.best, 1)}${NB}m`) : tv('noData', 'no data');
    return `<div class="lb-stat lb-sv-stat lb-sv-${key}"><dt>${escHtml(label)}</dt><dd>${value}</dd>
        <p class="lb-sv-sub">${escHtml(sub)}</p></div>`;
}

/** The 12-month water strip: every month has a cell; months with data show their range and a tint. */
function waterStrip(months, lang) {
    if (!months.length) return '';
    const names = monthNames(lang);
    const byMonth = new Map(months.map(m => [m.month, m]));
    const cells = names.map((name, i) => {
        const m = byMonth.get(i + 1);
        if (!m) return `<li class="lb-sv-month lb-sv-month--none"><span class="lb-sv-mname">${escHtml(name)}</span></li>`;
        const mid = (m.min + m.max) / 2;
        const warmth = Math.round(Math.min(1, Math.max(0, (mid - COLD) / (WARM - COLD))) * 100);
        const label = fill(tv('monthLabel', '{0}: {1} °C, {2} dives'), name, tempRange(m.min, m.max), m.n);
        return `<li class="lb-sv-month" style="--warmth:${warmth}%" aria-label="${escHtml(label)}" title="${escHtml(label)}">
            <span class="lb-sv-mname" aria-hidden="true">${escHtml(name)}</span>
            <span class="lb-sv-mtemp" aria-hidden="true">${escHtml(tempRange(m.min, m.max))}°</span></li>`;
    });
    return `<div class="lb-sv-water"><h3 class="lb-sv-h">${escHtml(tv('waterByMonth', 'Water by month'))}</h3>
        <ol class="lb-sv-months">${cells.join('')}</ol></div>`;
}

/**
 * The summary card body: stat tiles and the water strip.
 * @param {Object[]} rows - visits (see loadSiteVisits)
 */
export function visitSummaryHtml(rows, lang = currentLang()) {
    const s = siteVisitStats(rows);
    if (!s.count) return '';
    const temp = s.temp ? `${escHtml(tempRange(s.temp.min, s.temp.max))}<span class="lb-unit">${NB}°C</span>` : '–';
    return `<dl class="lb-stats lb-sv-stats">
            <div class="lb-stat lb-sv-stat"><dt>${escHtml(tv('count', 'Visits'))}</dt><dd>${s.count}</dd></div>
            ${visTile('shallow', tv('visShallow', 'Visibility, shallow'), s.visShallow)}
            ${visTile('deep', tv('visDeep', 'Visibility, deep'), s.visDeep)}
            <div class="lb-stat lb-sv-stat"><dt>${escHtml(tv('water', 'Water'))}</dt><dd>${temp}</dd></div>
        </dl>
        ${waterStrip(s.months, lang)}`;
}

/**
 * The list of visits.
 * @param {Object} o
 * @param {Object[]} o.rows
 * @param {boolean} o.showAll
 * @param {string|null} o.userId
 * @param {Map<string, Object>} o.members - id -> community_members row
 * @param {Map<string, string>} o.avatars - avatar path -> signed URL
 * @param {boolean} [o.capped] - only the newest dives were searched
 */
export function visitListHtml({ rows, showAll, userId, members, avatars, capped = false }) {
    const lang = currentLang();
    const shown = showAll ? rows : rows.slice(0, VISITS_SHOWN);
    const items = shown.map(r => {
        const own = isOwn(r, userId) || !r.owner;
        const member = members.get(r.owner) ?? null;
        const name = own ? translate('diveLog.trail.you', 'You') : displayName(member, key => translate(`diveLog.${key}`, 'Diver'));
        const url = member?.avatar_path ? avatars.get(member.avatar_path) ?? null : null;
        const href = own ? routeHref({ name: 'detail', id: r.id }) : routeHref({ name: 'memberDive', id: r.id });
        const facts = [];
        if (has(r.max_depth_m)) facts.push(`<span class="lb-sv-fact">${escHtml(metres(r.max_depth_m))}</span>`);
        if (has(r.duration_s)) facts.push(`<span class="lb-sv-fact">${escHtml(`${formatDuration(Number(r.duration_s))}${NB}min`)}</span>`);
        if (has(r.vis_shallow_m) || has(r.vis_deep_m)) {
            const vis = `${has(r.vis_shallow_m) ? fmtNum(Number(r.vis_shallow_m), 1) : '–'}${NB}/${NB}${has(r.vis_deep_m) ? fmtNum(Number(r.vis_deep_m), 1) : '–'}${NB}m`;
            facts.push(`<span class="lb-sv-fact" title="${escHtml(tv('visTitle', 'Visibility shallow / deep'))}">${escHtml(fill(tv('vis', 'vis {0}'), vis))}</span>`);
        }
        if (has(r.water_temp_c)) facts.push(`<span class="lb-sv-fact">${escHtml(`${fmtNum(Number(r.water_temp_c), 1)}${NB}°C`)}</span>`);
        return `<li><a class="lb-sv-visit" href="${escHtml(href)}">
            <span class="lb-sv-av" aria-hidden="true">${avatarHtml({ preset: member?.avatar_preset, url, name, id: r.owner, size: 36 })}</span>
            <span class="lb-sv-who"><span class="lb-sv-name">${escHtml(name)}</span>
                <span class="lb-sv-date">${escHtml(formatDiveDate(r.dive_date, lang))}</span></span>
            <span class="lb-sv-facts">${facts.join('')}</span></a></li>`;
    });
    const more = !showAll && rows.length > VISITS_SHOWN
        ? `<button type="button" class="btn btn-secondary lb-sv-all" id="lb-sv-all">${escHtml(fill(tv('showAll', 'Show all ({0})'), rows.length))}</button>` : '';
    return `<ol class="lb-sv-list">${items.join('')}</ol>${more}
        ${capped ? `<p class="lb-muted lb-sv-capped">${escHtml(tv('capped', 'Only the newest dives of the community were searched.'))}</p>` : ''}`;
}
