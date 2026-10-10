/**
 * Profile qualifications and medical checks: pure helpers, store and UI (jsdom).
 * Run: node --test tests/profile-documents.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    AGENCIES, agencyLabel, badgeText, normalizeQualification, qualificationErrors, normalizeMedicalCheck,
    medicalErrors, medicalStatus, documentPath, scanKind, isoDate, sortQualifications, sortMedical, scanPaths,
    DOC_MAX_BYTES, EXPIRY_WARN_DAYS,
} from '../js/logbook/documents.js';

test('AGENCIES: the brief\'s list, "other" last', () => {
    assert.deepEqual(AGENCIES, ['CMAS', 'PADI', 'SSI', 'NAUI', 'TDI-SDI', 'IANTD', 'GUE', 'RAID', 'BSAC', 'other']);
});

test('agencyLabel and badgeText', () => {
    assert.equal(agencyLabel('TDI-SDI'), 'TDI/SDI');
    assert.equal(agencyLabel('CMAS'), 'CMAS');
    assert.equal(agencyLabel('other', 'UDI'), 'UDI');
    assert.equal(agencyLabel('other', '  ', 'Jiná'), 'Jiná');
    assert.equal(badgeText({ agency: 'CMAS', level: 'P2' }), 'CMAS · P2');
    assert.equal(badgeText({ agency: 'other', agency_other: 'UDI', level: 'OWD' }), 'UDI · OWD');
});

test('normalizeQualification: trims, empties to null, other name only with other, show defaults off', () => {
    const row = normalizeQualification({
        agency: 'PADI', agency_other: 'ignored', level: '  Rescue Diver ', card_number: ' ', issued_on: '2021-05-03',
        instructor: '', notes: ' n ',
    });
    assert.deepEqual(row, {
        agency: 'PADI', agency_other: null, level: 'Rescue Diver', card_number: null, issued_on: '2021-05-03',
        instructor: null, notes: 'n', show_on_profile: false,
    });
    const other = normalizeQualification({ agency: 'other', agency_other: ' UDI ', level: 'x', issued_on: '2021-13-40', show_on_profile: true });
    assert.equal(other.agency_other, 'UDI');
    assert.equal(other.issued_on, null);
    assert.equal(other.show_on_profile, true);
    assert.equal(normalizeQualification({ agency: 'nope', level: 'x' }).agency, null);
    assert.equal(Array.from(normalizeQualification({ agency: 'CMAS', level: '😀'.repeat(150) }).level).length, 100);
});

test('qualificationErrors: agency and level are required', () => {
    assert.deepEqual(qualificationErrors(normalizeQualification({ agency: 'CMAS', level: 'P1' })), []);
    assert.deepEqual(qualificationErrors(normalizeQualification({ agency: '', level: ' ' })), ['agency', 'level']);
});

test('normalizeMedicalCheck and medicalErrors', () => {
    const row = normalizeMedicalCheck({ checked_on: '2026-01-10', valid_until: '', doctor: ' Dr X ', notes: '' });
    assert.deepEqual(row, { checked_on: '2026-01-10', valid_until: null, doctor: 'Dr X', notes: null });
    assert.deepEqual(medicalErrors(row), []);
    assert.deepEqual(medicalErrors(normalizeMedicalCheck({ checked_on: '' })), ['checked_on']);
    assert.deepEqual(medicalErrors(normalizeMedicalCheck({ checked_on: '2026-01-10', valid_until: '2025-01-01' })), ['valid_until']);
});

test('medicalStatus: latest valid-until wins; soon within 30 days; expired after', () => {
    assert.equal(EXPIRY_WARN_DAYS, 30);
    assert.deepEqual(medicalStatus([], '2026-10-10'), { state: 'none', validUntil: null, days: null });
    assert.deepEqual(medicalStatus([{ checked_on: '2026-01-01', valid_until: null }], '2026-10-10'), { state: 'none', validUntil: null, days: null });
    const checks = [{ checked_on: '2025-01-01', valid_until: '2026-01-01' }, { checked_on: '2026-01-01', valid_until: '2027-01-01' }];
    assert.deepEqual(medicalStatus(checks, '2026-10-10'), { state: 'ok', validUntil: '2027-01-01', days: 83 });
    assert.deepEqual(medicalStatus(checks, '2026-12-01'), { state: 'ok', validUntil: '2027-01-01', days: 31 });
    assert.deepEqual(medicalStatus(checks, '2026-12-02'), { state: 'soon', validUntil: '2027-01-01', days: 30 });
    assert.equal(medicalStatus(checks, '2027-01-01').state, 'soon'); // last valid day
    assert.deepEqual(medicalStatus(checks, '2027-01-02'), { state: 'expired', validUntil: '2027-01-01', days: -1 });
});

test('medicalStatus: exactly 30 days left is "soon"', () => {
    assert.equal(medicalStatus([{ checked_on: '2026-01-01', valid_until: '2026-11-09' }], '2026-10-10').state, 'soon');
    assert.equal(medicalStatus([{ checked_on: '2026-01-01', valid_until: '2026-11-10' }], '2026-10-10').state, 'ok');
});

test('documentPath, scanPaths and scanKind', () => {
    const id = '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
    assert.equal(documentPath('u1', 'medical', id, 'pdf'), `u1/medical/${id}.pdf`);
    assert.equal(documentPath('u1', 'qualifications', id, 'jpg'), `u1/qualifications/${id}.jpg`);
    assert.throws(() => documentPath('u1', 'avatars', id, 'jpg'));
    assert.throws(() => documentPath('u1', 'medical', id, 'png'));
    assert.deepEqual(scanPaths({ scan_front: 'a', scan_back: null }), ['a']);
    assert.deepEqual(scanPaths({ scan_path: 'm' }), ['m']);
    assert.equal(scanKind({ type: 'image/jpeg', name: 'a.jpg' }), 'image');
    assert.equal(scanKind({ type: 'image/png', name: 'a.png' }), 'image');
    assert.equal(scanKind({ type: 'application/pdf', name: 'a.pdf' }), 'pdf');
    assert.equal(scanKind({ type: '', name: 'Card.PDF' }), 'pdf');
    assert.equal(scanKind({ type: 'image/heic', name: 'a.heic' }), 'image'); // decoding decides (Android/iOS Safari can)
    assert.equal(scanKind({ type: 'text/plain', name: 'a.txt' }), null);
    assert.equal(DOC_MAX_BYTES, 10 * 1024 * 1024);
});

test('isoDate uses the local calendar date', () => {
    assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('sorting: newest first, undated last', () => {
    const q = sortQualifications([
        { id: 'a', issued_on: null, created_at: '2026-01-01' },
        { id: 'b', issued_on: '2020-01-01', created_at: '2026-01-01' },
        { id: 'c', issued_on: '2024-01-01', created_at: '2026-01-01' },
    ]);
    assert.deepEqual(q.map(x => x.id), ['c', 'b', 'a']);
    const m = sortMedical([{ id: 'x', checked_on: '2024-01-01' }, { id: 'y', checked_on: '2026-01-01' }]);
    assert.deepEqual(m.map(x => x.id), ['y', 'x']);
});
