/**
 * Qualifications (certification cards) and medical checks of the DecoTrail profile: pure helpers.
 * Limits and the agency list mirror the checks of supabase/migrations/0007_profile_documents.sql.
 */

/** Certification agencies, in display order; 'other' takes a free name. */
export const AGENCIES = Object.freeze(['CMAS', 'PADI', 'SSI', 'NAUI', 'TDI-SDI', 'IANTD', 'GUE', 'RAID', 'BSAC', 'other']);

const AGENCY_LABELS = { 'TDI-SDI': 'TDI/SDI' };

/** Longest text of each field, in code points (the database counts characters). */
export const LIMITS = Object.freeze({ agency_other: 60, level: 100, card_number: 60, instructor: 100, notes: 2000, doctor: 200 });

/** Largest scan the bucket accepts (10 MiB). */
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

/** A medical check expiring within this many days (or already expired) shows a warning. */
export const EXPIRY_WARN_DAYS = 30;

const DOC_KINDS = new Set(['qualifications', 'medical']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Display name of an agency code; 'other' shows its own name, else `otherLabel`. */
export function agencyLabel(code, otherName = null, otherLabel = 'Other') {
    if (code === 'other') return (typeof otherName === 'string' && otherName.trim()) || otherLabel;
    return AGENCY_LABELS[code] ?? String(code ?? '');
}

/** "CMAS · P2": what members see of a shown qualification. */
export function badgeText(q, otherLabel = 'Other') {
    return `${agencyLabel(q.agency, q.agency_other, otherLabel)} · ${String(q.level ?? '').trim()}`;
}

/** Trimmed text cut to `max` code points (never splits an emoji); empty → null. */
function text(value, max) {
    if (typeof value !== 'string') return null;
    const cut = Array.from(value.trim()).slice(0, max).join('').trim();
    return cut || null;
}

/** A real calendar date `YYYY-MM-DD`, else null. */
function date(value) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

/** The row to save from what was typed (scan paths are handled separately). */
export function normalizeQualification(input = {}) {
    const agency = AGENCIES.includes(input.agency) ? input.agency : null;
    return {
        agency,
        agency_other: agency === 'other' ? text(input.agency_other, LIMITS.agency_other) : null,
        level: text(input.level, LIMITS.level),
        card_number: text(input.card_number, LIMITS.card_number),
        issued_on: date(input.issued_on),
        instructor: text(input.instructor, LIMITS.instructor),
        notes: text(input.notes, LIMITS.notes),
        show_on_profile: input.show_on_profile === true,
    };
}

/** Names of the missing required fields of a normalized qualification. */
export function qualificationErrors(row) {
    const errors = [];
    if (!row.agency) errors.push('agency');
    if (!row.level) errors.push('level');
    return errors;
}

export function normalizeMedicalCheck(input = {}) {
    return {
        checked_on: date(input.checked_on),
        valid_until: date(input.valid_until),
        doctor: text(input.doctor, LIMITS.doctor),
        notes: text(input.notes, LIMITS.notes),
    };
}

/** 'checked_on' when missing, 'valid_until' when it is before the check. */
export function medicalErrors(row) {
    const errors = [];
    if (!row.checked_on) errors.push('checked_on');
    else if (row.valid_until && row.valid_until < row.checked_on) errors.push('valid_until');
    return errors;
}

const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`) / 86400000;

/**
 * Fitness to dive from all checks: the latest valid-until date counts (a renewal supersedes an old check).
 * `days` = days left including today's date as 0 (negative once expired).
 * @param {{valid_until?: string|null}[]} checks
 * @param {string} today - local date `YYYY-MM-DD`
 * @returns {{state: 'none'|'ok'|'soon'|'expired', validUntil: string|null, days: number|null}}
 */
export function medicalStatus(checks, today) {
    const dates = (checks ?? []).map(c => date(c?.valid_until)).filter(Boolean).sort();
    const validUntil = dates.at(-1) ?? null;
    if (!validUntil) return { state: 'none', validUntil: null, days: null };
    const days = Math.round(dayNumber(validUntil) - dayNumber(today));
    const state = days < 0 ? 'expired' : days <= EXPIRY_WARN_DAYS ? 'soon' : 'ok';
    return { state, validUntil, days };
}

/** Storage path of a scan: `<uid>/<kind>/<id>.<ext>` (the only shape the database accepts). */
export function documentPath(uid, kind, id, ext) {
    if (!DOC_KINDS.has(kind)) throw new Error(`Unknown document kind: ${kind}`);
    if (ext !== 'jpg' && ext !== 'pdf') throw new Error(`Unsupported document type: ${ext}`);
    return `${uid}/${kind}/${id}.${ext}`;
}

/** Scan paths a row points to. */
export function scanPaths(row) {
    return [row?.scan_front, row?.scan_back, row?.scan_path].filter(p => typeof p === 'string' && p);
}

/** Whether a scan path is a PDF (else a JPEG). */
export function isPdfPath(path) {
    return /\.pdf$/i.test(String(path ?? ''));
}

/** 'pdf', 'image' (decoded and re-encoded as JPEG; the browser decides whether it can) or null (refused). */
export function scanKind(file) {
    const type = String(file?.type ?? '').toLowerCase();
    const name = String(file?.name ?? '').toLowerCase();
    if (type === 'application/pdf' || (!type && name.endsWith('.pdf'))) return 'pdf';
    if (type.startsWith('image/') || (!type && /\.(jpe?g|png|webp|heic|heif|gif)$/.test(name))) return 'image';
    return null;
}

/** Local calendar date `YYYY-MM-DD`. */
export function isoDate(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const byCreatedDesc = (a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));

/** Newest card first; undated ones last. */
export function sortQualifications(list) {
    return [...(list ?? [])].sort((a, b) => {
        if (!a.issued_on !== !b.issued_on) return a.issued_on ? -1 : 1;
        return String(b.issued_on ?? '').localeCompare(String(a.issued_on ?? '')) || byCreatedDesc(a, b);
    });
}

/** Newest check first. */
export function sortMedical(list) {
    return [...(list ?? [])].sort((a, b) => String(b.checked_on ?? '').localeCompare(String(a.checked_on ?? '')) || byCreatedDesc(a, b));
}
