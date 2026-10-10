/**
 * The Share button on the owner's own dives in lists (My dives cards, tiles, table rows; own cards in the
 * Feed). A dive that is not link-shared yet asks first ("Create a public link for this dive?") and turns the
 * link on (the same `store.setSharing` the Share card uses); then the phone's share sheet opens, or on a
 * desktop the link is copied with a short toast.
 *
 * `shareDive` takes its UI as callbacks (tests); `confirmSheet` and `toast` are the DOM versions.
 */

import { shareUrl } from './share.js';
import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

const ts = (key, fallback) => translate(`diveLog.trail.share.${key}`, fallback);
const TOAST_MS = 2600;

/** Whether the dive already has a working public link. */
export const isLinkShared = entry => entry?.visibility === 'link' && Boolean(entry?.share_token);

/**
 * Share one own dive.
 * @param {Object} o
 * @param {Object} o.store - with `setSharing(id, on, before)`
 * @param {Object} o.entry - the own log_entries row
 * @param {() => Promise<boolean>} o.confirm - asked only when the link must be created
 * @param {(text: string) => void} o.notify - toast
 * @param {string} o.pageHref - base of the link (the logbook page)
 * @param {Object} [o.nav] - navigator (share, clipboard)
 * @returns {Promise<{entry: Object, outcome: 'cancelled'|'shared'|'copied'|'failed'}>}
 */
export async function shareDive({ store, entry, confirm, notify, pageHref, nav = globalThis.navigator }) {
    let current = entry;
    if (!isLinkShared(current)) {
        if (!await confirm()) return { entry: current, outcome: 'cancelled' };
        try {
            const saved = await store.setSharing(current.id, true, current.visibility);
            current = { ...current, ...saved };
        } catch (error) {
            console.error(error);
            notify(error?.kind === 'unreachable'
                ? translate('diveLog.backend.unreachable', 'Can\'t reach your dive log.')
                : translate('diveLog.backend.genericError', 'Something went wrong. Please try again.'));
            return { entry: current, outcome: 'failed' };
        }
    }
    const url = isLinkShared(current) ? shareUrl(current.share_token, pageHref) : null;
    if (!url) {
        notify(translate('diveLog.backend.genericError', 'Something went wrong. Please try again.'));
        return { entry: current, outcome: 'failed' };
    }
    if (typeof nav?.share === 'function') {
        try {
            await nav.share({ title: ts('shareTitle', 'DecoTrail dive'), url });
            return { entry: current, outcome: 'shared' };
        } catch (error) {
            if (error?.name === 'AbortError') return { entry: current, outcome: 'cancelled' };
            console.warn('Share sheet failed; copying instead', error); // e.g. the tap's activation expired while the link was made
        }
    }
    try {
        await nav.clipboard.writeText(url);
        notify(ts('copied', 'Link copied'));
        return { entry: current, outcome: 'copied' };
    } catch {
        notify(`${ts('copyFailed', 'Select the link and copy it')}: ${url}`);
        return { entry: current, outcome: 'failed' };
    }
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>';

/** The 44 px Share button of a list item (`data-share` carries the dive id). */
export function shareButtonHtml(entryId, { shared = false } = {}) {
    const label = shared ? ts('shareShared', 'Share (public link is on)') : ts('shareDive', 'Share this dive');
    return `<button type="button" class="lb-share-btn${shared ? ' lb-share-btn--on' : ''}" data-share="${escHtml(entryId)}" aria-label="${escHtml(label)}" title="${escHtml(label)}">${SHARE_ICON}</button>`;
}

/**
 * A small confirmation sheet; resolves true for "Create link". Esc, a tap outside and Cancel resolve false.
 * @returns {Promise<boolean>}
 */
export function confirmSheet({ text = ts('createConfirm', 'Create a public link for this dive?'),
    help = ts('createConfirmHelp', 'Anyone with the link can see the dive, its photos and your name. Never your notes.'),
    yes = ts('createLink', 'Create link'), no = translate('diveLog.logbook.detail.cancel', 'Cancel') } = {}) {
    return new Promise(resolve => {
        const back = document.activeElement;
        const el = document.createElement('div');
        el.className = 'lb-sheet';
        el.innerHTML = `<div class="lb-sheet-box" role="alertdialog" aria-modal="true" aria-labelledby="lb-sheet-t" aria-describedby="lb-sheet-d">
            <p class="lb-sheet-title" id="lb-sheet-t">${escHtml(text)}</p>
            <p class="lb-sheet-help" id="lb-sheet-d">${escHtml(help)}</p>
            <div class="lb-sheet-actions"><button type="button" class="btn btn-primary" data-yes>${escHtml(yes)}</button>
            <button type="button" class="btn btn-secondary" data-no>${escHtml(no)}</button></div></div>`;
        const done = ok => {
            document.removeEventListener('keydown', onKey, true);
            el.remove();
            back?.focus?.();
            resolve(ok);
        };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
        el.addEventListener('click', e => {
            if (e.target.closest('[data-yes]')) done(true);
            else if (e.target.closest('[data-no]') || e.target === el) done(false);
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
        el.querySelector('[data-yes]').focus();
    });
}

let toastEl = null;
let toastTimer = null;

/** A short status message at the bottom of the screen. */
export function toast(text) {
    if (!toastEl || !toastEl.isConnected) {
        toastEl = document.createElement('p');
        toastEl.className = 'lb-toast';
        toastEl.setAttribute('role', 'status');
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.hidden = true; }, TOAST_MS);
}
