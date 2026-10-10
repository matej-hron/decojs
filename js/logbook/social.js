/**
 * Pure helpers and markup for DecoTrail kudos, comments and "New for you". Callers pass translated text;
 * everything user-typed is escaped here.
 */

import { escHtml } from '../utils/escHtml.js';
import { avatarHtml } from './avatars.js';

/** The server's limit (characters = code points, like Postgres char_length). */
export const COMMENT_MAX = 1000;
/** The counter shows from this many characters on. */
export const COMMENT_WARN = 900;

/**
 * A comment as it will be saved: line endings unified, outer whitespace trimmed.
 * @returns {{body: string, length: number, empty: boolean, tooLong: boolean, ok: boolean}}
 */
export function normalizeComment(text) {
    const body = String(text ?? '').replace(/\r\n?/g, '\n').trim();
    const length = Array.from(body).length;
    const empty = length === 0;
    const tooLong = length > COMMENT_MAX;
    return { body, length, empty, tooLong, ok: !empty && !tooLong };
}

/** Counts after the caller gave (`on`) or took back their kudos. */
export function applyKudos(counts, on) {
    const c = counts ?? { kudos: 0, kudoed: false, comments: 0, commentsEnabled: true };
    if (Boolean(on) === c.kudoed) return { ...c };
    return { ...c, kudoed: Boolean(on), kudos: Math.max(0, c.kudos + (on ? 1 : -1)) };
}

/** Badge text: '' for none, '99+' above 99. */
export function badgeText(n) {
    const v = Math.floor(Number(n) || 0);
    if (v <= 0) return '';
    return v > 99 ? '99+' : String(v);
}

/**
 * "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", else the date.
 * @param {string|Date} when
 * @param {{now?: Date|number, locale?: string, justNow?: string}} [o]
 */
export function relativeTime(when, { now = Date.now(), locale = 'en', justNow = 'just now' } = {}) {
    const t = new Date(when).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.round((Number(now) - t) / 1000);
    if (s < 45) return justNow;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
    const sameYear = new Date(t).getFullYear() === new Date(Number(now)).getFullYear();
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(new Date(t));
}

const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

/**
 * The kudos/comments row of a feed card or dive detail.
 * @param {Object} o
 * @param {string} o.entryId
 * @param {{kudos: number, kudoed: boolean, comments: number, commentsEnabled: boolean}} o.counts
 * @param {boolean} o.own - own dive: no kudos button, the count only
 * @param {boolean} [o.listOpen] - the list of who gave kudos is open
 * @param {string|null} [o.commentsHref] - feed cards: link to the dive's comments
 * @param {boolean} [o.busy] - a kudos toggle is in flight
 * @param {Object} o.text - translated: kudos (tooltip/name), countLabel ("{0} kudos, show who"),
 *   commentsLabel ("{0} comments")
 */
export function socialBarHtml({ entryId, counts, own, listOpen = false, commentsHref = null, busy = false, text }) {
    const id = escHtml(entryId);
    const c = counts ?? { kudos: 0, kudoed: false, comments: 0, commentsEnabled: true };
    const name = escHtml(text.kudos);
    const button = own
        ? `<span class="tr-kudos-icon" aria-hidden="true">👏</span>`
        : `<button type="button" class="tr-kudos-btn" data-kudos="${id}" aria-pressed="${c.kudoed}" aria-label="${name}" title="${name}"${busy ? ' aria-busy="true"' : ''}><span aria-hidden="true">👏</span></button>`;
    const count = c.kudos > 0
        ? `<button type="button" class="tr-kudos-count" data-kudos-list="${id}" aria-expanded="${listOpen}"${listOpen ? ` aria-controls="tr-kl-${id}"` : ''} aria-label="${escHtml(fill(text.countLabel, c.kudos))}">${c.kudos}</button>`
        : '';
    const kudos = own && c.kudos === 0 ? '' : `<span class="tr-kudos">${button}${count}</span>`; // nothing to show on an own dive yet
    const comments = commentsHref && c.commentsEnabled
        ? `<a class="tr-comments-link" href="${escHtml(commentsHref)}" aria-label="${escHtml(fill(text.commentsLabel, c.comments))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/></svg>${c.comments > 0 ? `<span>${c.comments}</span>` : ''}</a>`
        : '';
    if (!kudos && !comments) return '';
    return `<div class="tr-social" data-social="${id}">${kudos}${comments}</div>`;
}

/**
 * The list of who gave kudos (under the bar).
 * @param {Object} o
 * @param {string} o.entryId
 * @param {Object[]|null|'error'} o.rows - null while loading
 * @param {Map<string, string>} o.avatarUrls - avatar path -> signed URL
 * @param {(row: Object) => string} o.nameOf - display name (translated fallback)
 * @param {{loading: string, failed: string, title: string}} o.text
 */
export function kudosListHtml({ entryId, rows, avatarUrls = new Map(), nameOf, text }) {
    const id = `tr-kl-${escHtml(entryId)}`;
    let body;
    if (rows === null) body = `<p class="tr-kudos-note">${escHtml(text.loading)}</p>`;
    else if (rows === 'error') body = `<p class="tr-kudos-note" role="alert">${escHtml(text.failed)}</p>`;
    else {
        body = `<ul class="tr-kudos-people">${rows.map(r => {
            const name = nameOf(r);
            const url = r.avatar_path ? avatarUrls.get(r.avatar_path) ?? null : null;
            return `<li><a class="tr-kudos-person" href="#/member/${escHtml(r.member_id)}"><span aria-hidden="true">${avatarHtml({ preset: r.avatar_preset, url, name, id: r.member_id, size: 28, zoom: true })}</span><span>${escHtml(name)}</span></a></li>`;
        }).join('')}</ul>`;
    }
    return `<div class="tr-kudos-list" id="${id}" role="region" aria-label="${escHtml(text.title)}">${body}</div>`;
}

/**
 * One "New for you" line: who did what on which dive.
 * @param {Object} row - a social_inbox row
 * @param {{name: string, dive: string, kudos: string, comment: string}} t - name and dive title already resolved;
 *   `kudos`/`comment` are templates with {0} = name, {1} = dive
 * @returns {{text: string, excerpt: string|null}}
 */
export function inboxLine(row, t) {
    const template = row.kind === 'comment' ? t.comment : t.kudos;
    const excerpt = row.kind === 'comment' && row.excerpt ? String(row.excerpt).replace(/\s+/g, ' ').trim() : null;
    return { text: fill(template, t.name, t.dive), excerpt: excerpt || null };
}
