/**
 * The site page's Conditions card: visibility (shallow / deep) and water temperature (surface / bottom) side by
 * side, then a month strip drawn as a small water column per month (surface temperature above, bottom below, a
 * visibility bar underneath). Renders the `site_stats` shape (see siteStats.js). Markup only.
 */

import { fmtShort, fmtShortDate } from './siteStats.js';
import { translate } from '../i18n.js';
import { currentLang, localeTag } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

const NB = ' ';
const tc = (key, fallback) => translate(`diveLog.logbook.sites.conditions.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const has = v => v !== null && v !== undefined && Number.isFinite(Number(v));
// Month cells are tinted between these temperatures (°C).
const COLD = 4;
const WARM = 26;
const warmth = t => Math.round(Math.min(1, Math.max(0, (Number(t) - COLD) / (WARM - COLD))) * 100);

/** Short month names (January first) in the UI language. */
export function monthNames(lang = currentLang()) {
    try {
        const f = new Intl.DateTimeFormat(localeTag(lang), { month: 'short', timeZone: 'UTC' });
        return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2026, i, 15))).replace(/\.$/, ''));
    } catch {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
}

const range = (min, max, lang) => (fmtShort(min, lang) === fmtShort(max, lang) ? fmtShort(min, lang) : `${fmtShort(min, lang)}–${fmtShort(max, lang)}`);

/**
 * One layer row (Shallow / Deep / Surface / Bottom): the average large, the range, and the notes (best, latest).
 * @param {'vis'|'temp'} kind
 */
function layerRow(label, s, unit, kind, lang) {
    if (!s) {
        return `<div class="lb-cond-row lb-cond-row--none"><dt>${escHtml(label)}</dt>
            <dd><span class="lb-cond-big">–</span><span class="lb-cond-note">${escHtml(tc('noData', 'no data yet'))}</span></dd></div>`;
    }
    const notes = [];
    if (kind === 'vis' && s.n > 1 && s.best_date) {
        notes.push(fill(tc('best', 'best {0} on {1}'), `${fmtShort(s.max, lang)}${NB}${unit}`, fmtShortDate(s.best_date, lang)));
    }
    if (has(s.latest) && s.latest_date) {
        notes.push(fill(tc('latest', 'latest {0} on {1}'), `${fmtShort(s.latest, lang)}${NB}${unit}`, fmtShortDate(s.latest_date, lang)));
    }
    const span = s.n > 1 ? `<span class="lb-cond-range">${escHtml(`${range(s.min, s.max, lang)}${NB}${unit}`)}</span>` : '';
    return `<div class="lb-cond-row"><dt>${escHtml(label)}</dt>
        <dd><span class="lb-cond-big">${escHtml(fmtShort(s.avg, lang))}<span class="lb-unit">${NB}${escHtml(unit)}</span></span>${span}
            ${notes.map(n => `<span class="lb-cond-note">${escHtml(n)}</span>`).join('')}</dd></div>`;
}

/** The month strip; '' without any month data. */
function monthStrip(months, lang) {
    const withData = (months ?? []).filter(m => m.bottom || m.surface || m.vis);
    if (!withData.length) return '';
    const names = monthNames(lang);
    const byMonth = new Map(withData.map(m => [m.month, m]));
    const maxVis = Math.max(1, ...withData.map(m => m.vis?.avg ?? 0));
    const cells = names.map((name, i) => {
        const m = byMonth.get(i + 1);
        if (!m) return `<li class="lb-cm lb-cm--none"><span class="lb-cm-name">${escHtml(name)}</span><span class="lb-cm-col" aria-hidden="true"></span></li>`;
        const parts = [];
        if (m.surface) parts.push(fill(tc('monthSurface', 'surface {0}'), `${fmtShort(m.surface.avg, lang)}${NB}°C`));
        if (m.bottom) parts.push(fill(tc('monthBottom', 'bottom {0}'), `${fmtShort(m.bottom.avg, lang)}${NB}°C`));
        if (m.vis) parts.push(fill(tc('monthVis', 'visibility {0}'), `${fmtShort(m.vis.avg, lang)}${NB}m`));
        const label = `${name}: ${parts.join(', ')} (${fill(tc('monthDives', '{0} dives'), m.n)})`;
        const cell = (t, cls) => (t
            ? `<span class="lb-cm-t ${cls}" style="--warmth:${warmth(t.avg)}%">${escHtml(String(Math.round(t.avg)))}</span>`
            : `<span class="lb-cm-t ${cls} lb-cm-t--none"></span>`);
        const vis = m.vis ? `<span class="lb-cm-vis" style="--vis:${Math.max(8, Math.round((m.vis.avg / maxVis) * 100))}%"></span>` : '';
        return `<li class="lb-cm" aria-label="${escHtml(label)}" title="${escHtml(label)}">
            <span class="lb-cm-name" aria-hidden="true">${escHtml(name)}</span>
            <span class="lb-cm-col" aria-hidden="true">${cell(m.surface, 'lb-cm-s')}${cell(m.bottom, 'lb-cm-b')}</span>
            <span class="lb-cm-visbar" aria-hidden="true">${vis}</span></li>`;
    });
    return `<div class="lb-cond-months">
        <h3 class="lb-sv-h">${escHtml(tc('byMonth', 'By month'))}</h3>
        <ol class="lb-cm-strip">${cells.join('')}</ol>
        <p class="lb-cm-legend"><span class="lb-cm-key lb-cm-key--s"></span>${escHtml(tc('legendSurface', 'surface °C'))}
            <span class="lb-cm-key lb-cm-key--b"></span>${escHtml(tc('legendBottom', 'bottom °C'))}
            <span class="lb-cm-key lb-cm-key--v"></span>${escHtml(tc('legendVis', 'visibility'))}</p>
    </div>`;
}

/** "12 visits by 4 divers, last on 27 Sep" (or a shorter form). */
export function visitsSentence(stats, lang = currentLang()) {
    if (!stats?.visits) return tc('noVisits', 'No dives logged here yet.');
    const last = fmtShortDate(stats.last_visit, lang);
    const divers = Number(stats.divers) || 0;
    const base = divers > 1
        ? fill(tc('visitsBy', '{0} visits by {1} divers'), stats.visits, divers)
        : stats.visits === 1 ? tc('oneVisit', '1 visit') : fill(tc('visits', '{0} visits'), stats.visits);
    return last ? `${base}, ${fill(tc('lastOn', 'last on {0}'), last)}` : base;
}

/**
 * The Conditions card.
 * @param {Object|null} stats - `site_stats` shape; null while loading
 * @param {{failed?: boolean, lang?: string}} [o]
 */
export function conditionsCardHtml(stats, { failed = false, lang = currentLang() } = {}) {
    const title = `<h2 class="lb-sv-title">${escHtml(tc('title', 'Conditions'))}</h2>`;
    if (failed) return `<section class="rda-card lb-cond">${title}<p class="lb-muted" role="alert">${escHtml(tc('failed', 'Could not load the conditions. Reload the page to try again.'))}</p></section>`;
    if (!stats) return `<section class="rda-card lb-cond" aria-busy="true">${title}<p class="lb-muted">${escHtml(translate('diveLog.backend.loading', 'Loading…'))}</p></section>`;
    const sentence = `<p class="lb-cond-visits">${escHtml(visitsSentence(stats, lang))}</p>`;
    if (!stats.visits) return `<section class="rda-card lb-cond">${title}${sentence}</section>`;
    return `<section class="rda-card lb-cond">${title}${sentence}
        <div class="lb-cond-grid">
            <div class="lb-cond-panel lb-cond-panel--vis"><h3 class="lb-cond-h">${escHtml(tc('visibility', 'Visibility'))}</h3>
                <dl class="lb-cond-rows">${layerRow(tc('shallow', 'Shallow'), stats.vis?.shallow, 'm', 'vis', lang)}${layerRow(tc('deep', 'Deep'), stats.vis?.deep, 'm', 'vis', lang)}</dl></div>
            <div class="lb-cond-panel lb-cond-panel--temp"><h3 class="lb-cond-h">${escHtml(tc('temperature', 'Water temperature'))}</h3>
                <dl class="lb-cond-rows">${layerRow(tc('surface', 'Surface'), stats.temp?.surface, '°C', 'temp', lang)}${layerRow(tc('bottom', 'Bottom'), stats.temp?.bottom, '°C', 'temp', lang)}</dl></div>
        </div>
        ${monthStrip(stats.months, lang)}
    </section>`;
}
