/**
 * Feed card markup shared by My dives and the DecoTrail Feed. Pure string builders:
 * callers pass translated, formatted text; everything user-typed is escaped here.
 */

import { escHtml } from '../utils/escHtml.js';

const NB = ' ';

/**
 * A feed card: (author row,) number badge, title and date, the stat row, buddies and notes, then the picture.
 *
 * Without `author` it is the My dives card: the whole card is one link (or, with `pick`, a selectable box).
 * With `author = {name, avatarHtml, href, own}` the card is an `<article>`: the author row links to the member,
 * the title links to the dive and stretches over the card (links must not nest). Its date sits in the author
 * row, under the name, and the number badge shows only when the dive has a number (other members' numbers are hidden).
 *
 * @param {Object} o
 * @param {Object} o.entry - needs `id`, `log_number`
 * @param {string|null} o.href - the dive's route (unused with `pick`)
 * @param {string} o.title - plain text
 * @param {boolean} [o.untitled] - the title is a fallback ("Dive #7"), shown muted
 * @param {string} [o.whenText] - plain text
 * @param {string|null} [o.numberLabel] - screen-reader number ("#7"); null for none
 * @param {string} [o.statsHtml] - markup (see statsHtml)
 * @param {string} [o.peopleText] - plain text: buddies and tags
 * @param {string} [o.notesText] - plain text
 * @param {string} [o.visualHtml] - markup (see visualHtml)
 * @param {{name: string, avatarHtml: string, href: string, own?: boolean}|null} [o.author]
 * @param {string} [o.badgeHtml] - markup at the end of the head ("Add details")
 * @param {string} [o.lockHtml] - markup after the title (see lockHtml): the dive is private
 * @param {string} [o.selectHtml] - markup at the start of the head (select-mode checkbox)
 * @param {{id: string, selected: boolean}|null} [o.pick] - select mode (My dives only)
 */
export function feedCardHtml({
    entry, href = null, title, untitled = false, whenText = '', numberLabel = null, statsHtml: stats = '',
    peopleText = '', notesText = '', visualHtml: visual = '', author = null, badgeHtml = '', selectHtml = '', pick = null, lockHtml: lock = '',
}) {
    const titleCls = `lb-feed-title${untitled ? ' lb-untitled' : ''}`;
    const srNumber = numberLabel ? `<span class="rda-visually-hidden">${escHtml(numberLabel)}, </span>` : '';
    const badge = `<span class="lb-num-badge" aria-hidden="true">${escHtml(String(entry.log_number ?? '–'))}</span>`;
    const rest = `${stats}
                ${peopleText ? `<p class="lb-feed-people">${escHtml(peopleText)}</p>` : ''}
                ${notesText ? `<p class="lb-feed-notes">${escHtml(notesText)}</p>` : ''}
            </div>${visual}`;
    if (!author) {
        const [open, close] = pick
            ? [`<div class="lb-feed-card lb-selectable${pick.selected ? ' lb-selected' : ''}" data-pick="${escHtml(pick.id)}">`, '</div>']
            : [`<a class="lb-feed-card" href="${escHtml(href)}">`, '</a>'];
        return `${open}<div class="lb-feed-main">
                <div class="lb-feed-head">${selectHtml}
                    ${badge}
                    <div class="lb-feed-who">
                        <h4 class="${titleCls}">${escHtml(title)}${lock}</h4>
                        <p class="lb-feed-when">${srNumber}<span class="lb-date">${escHtml(whenText)}</span></p>
                    </div>
                    ${badgeHtml}
                </div>
                ${rest}${close}`;
    }
    const numbered = entry.log_number !== null && entry.log_number !== undefined && entry.log_number !== '';
    return `<article class="lb-feed-card tr-feed-card${author.own ? ' tr-feed-own' : ''}"><div class="lb-feed-main">
                <div class="tr-author"><a class="tr-author-link" href="${escHtml(author.href)}">${author.avatarHtml}<span class="tr-author-name">${escHtml(author.name)}</span></a>`
        + `${whenText ? `<span class="tr-author-when">${escHtml(whenText)}</span>` : ''}</div>
                <div class="lb-feed-head">${selectHtml}
                    ${numbered ? badge : ''}
                    <div class="lb-feed-who">
                        <h4 class="${titleCls}"><a class="tr-feed-link" href="${escHtml(href)}">${numbered ? srNumber : ''}${escHtml(title)}</a>${lock}</h4>
                    </div>
                    ${badgeHtml}
                </div>
                ${rest}</article>`;
}

/**
 * The stat row of a card.
 * @param {{key: string, value: string, unit: string}[]} stats - from feedStats
 * @param {(key: string) => string} label - translated label of a stat
 */
export function statsHtml(stats, label) {
    if (!stats.length) return '';
    return `<dl class="lb-stats">${stats.map(s => `<div class="lb-stat lb-stat-${s.key}"><dt>${escHtml(label(s.key))}</dt>
            <dd>${escHtml(s.value)}${s.unit ? `<span class="lb-unit">${NB}${escHtml(s.unit)}</span>` : ''}</dd></div>`).join('')}</dl>`;
}

/**
 * The picture of a card or tile. A tile without a picture shows `numberText`; a feed card shows nothing.
 * @param {Object} o
 * @param {'photo'|'map'|'profile'|'none'} o.kind
 * @param {string} o.entryId
 * @param {'feed'|'tile'} o.variant
 * @param {string} [o.photoUrl]
 * @param {number} [o.more] - further photos of the dive
 * @param {string} [o.moreText] - screen-reader text for `more`
 * @param {{src: string, width: number, height: number, alt: string}} [o.map]
 * @param {string} [o.recordingId]
 * @param {string} [o.profileAlt]
 * @param {string} [o.depthText] - shown on the profile ("18,4 m")
 * @param {string} [o.numberText] - tile fallback ("#7")
 */
export function visualHtml({ kind, entryId, variant, photoUrl, more = 0, moreText = '', map, recordingId, profileAlt = '', depthText = '', numberText = '' }) {
    const id = ` data-entry="${escHtml(entryId)}" data-variant="${variant}"`;
    if (kind === 'photo') {
        return `<div class="lb-visual lb-visual-photo"${id}><img class="lb-visual-img" src="${escHtml(photoUrl)}" alt="" loading="lazy">
                ${more > 0 ? `<span class="lb-more-photos"><span aria-hidden="true">+${more}</span><span class="rda-visually-hidden">${escHtml(moreText)}</span></span>` : ''}</div>`;
    }
    if (kind === 'map') {
        return `<div class="lb-visual lb-visual-map"${id}><img class="lb-visual-img lb-map-img" src="${escHtml(map.src)}" width="${map.width}" height="${map.height}" alt="${escHtml(map.alt)}" loading="lazy"></div>`;
    }
    if (kind === 'profile') {
        return `<div class="lb-visual lb-visual-profile"${id}><span class="lb-spark" data-rec="${escHtml(recordingId)}" role="img" aria-label="${escHtml(profileAlt)}"></span>
                ${depthText ? `<span class="lb-visual-depth" aria-hidden="true">${escHtml(depthText)}</span>` : ''}</div>`;
    }
    if (variant === 'tile') return `<div class="lb-visual lb-visual-none"${id} aria-hidden="true"><span>${escHtml(numberText)}</span></div>`;
    return '';
}

/**
 * The small lock of a private dive (own cards, tiles and table rows).
 * @param {string} label - translated "Private": the accessible name and the tooltip
 */
export function lockHtml(label) {
    const text = escHtml(label);
    return `<span class="tr-lock" role="img" aria-label="${text}" title="${text}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">`
        + '<rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>';
}
