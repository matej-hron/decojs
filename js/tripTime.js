/**
 * Shared helpers to convert between a trip's epoch-minutes (minutes since the
 * trip's start-date midnight, UTC) and a <input type="datetime-local"> string.
 * Pure — no DOM. Used by DiveEditPanel and AddDiveDialog.
 */

/** UTC-midnight ms for the trip start date (defaults to 2026-01-01). */
export function baseFromStartDate(startDate) {
    const [y, m, d] = (startDate || '2026-01-01').split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

/** epoch-minutes (relative to base) -> 'YYYY-MM-DDTHH:MM'. */
export function epochMinToLocalInput(min, base) {
    const d = new Date(base + min * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 'YYYY-MM-DDTHH:MM' -> epoch-minutes (relative to base). */
export function localInputToEpochMin(value, base) {
    const [datePart, timePart] = value.split('T');
    const [y, mo, da] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    const ms = Date.UTC(y, mo - 1, da, h, mi);
    return Math.round((ms - base) / 60000);
}
