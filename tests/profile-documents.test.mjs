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

// ---- UI (jsdom) ----

import { QualificationsCard, MedicalCard, badgesHtml, badgeTexts } from '../js/logbook/ProfileDocuments.js';
import { ProfilePage } from '../js/logbook/ProfilePage.js';
import { MemberPage } from '../js/logbook/MemberPage.js';
import { summaryLines } from '../js/logbook/DeleteData.js';

async function withDom(fn) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/lab/dive-log.html#/profile' });
    const saved = {};
    for (const k of ['window', 'document', 'location', 'HTMLElement']) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
    try {
        return await fn(dom.window.document.getElementById('host'), dom.window);
    } finally {
        for (const [k, d] of Object.entries(saved)) {
            if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
    }
}
const flush = () => new Promise(r => setTimeout(r, 20));

function docsStore({ quals = [], medical = [], failSave = false } = {}) {
    const log = [];
    let seq = 0;
    const db = { quals: quals.map(q => ({ ...q })), medical: medical.map(m => ({ ...m })) };
    const save = key => async (row, id) => {
        log.push([`save-${key}`, { ...row }, id]);
        if (failSave) throw new Error('boom');
        if (id) { const r = db[key].find(x => x.id === id); Object.assign(r, row); return { ...r }; }
        const r = { id: `${key}-${++seq}`, created_at: '2026-10-10T10:00:00Z', ...row };
        db[key].push(r);
        return { ...r };
    };
    return {
        log, db,
        documentsStatus: async () => true,
        listQualifications: async () => db.quals.map(q => ({ ...q })),
        listMedicalChecks: async () => db.medical.map(m => ({ ...m })),
        saveQualification: save('quals'),
        saveMedicalCheck: save('medical'),
        deleteQualification: async q => { log.push(['delete-quals', q.id]); db.quals = db.quals.filter(x => x.id !== q.id); },
        deleteMedicalCheck: async m => { log.push(['delete-medical', m.id]); db.medical = db.medical.filter(x => x.id !== m.id); },
        uploadDocument: async (path, blob) => { log.push(['upload', path, blob.type]); return path; },
        removeDocuments: async paths => { log.push(['remove', [...paths]]); },
        documentUrls: async paths => new Map(paths.map(p => [p, `https://signed.test/${p}`])),
    };
}

function pickFile(win, input, file) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

test('QualificationsCard: required fields, save sends the normalized row, list shows the badge state', async () => {
    await withDom(async (host, win) => {
        const store = docsStore();
        const card = new QualificationsCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        assert.match(host.textContent, /No qualifications yet/);
        host.querySelector('[data-act="add"]').click();
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        assert.equal(store.log.length, 0);
        assert.equal(host.querySelector('[name="agency"]').getAttribute('aria-invalid'), 'true');
        assert.equal(host.querySelector('[name="level"]').getAttribute('aria-invalid'), 'true');
        const agency = host.querySelector('[name="agency"]');
        agency.value = 'other';
        agency.dispatchEvent(new win.Event('change', { bubbles: true }));
        assert.equal(host.querySelector('.tr-agency-other').hidden, false);
        host.querySelector('[name="agency_other"]').value = ' UDI ';
        host.querySelector('[name="level"]').value = ' OWD ';
        host.querySelector('[name="card_number"]').value = 'C-1';
        host.querySelector('[name="show_on_profile"]').checked = true;
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        const [, row, id] = store.log.find(l => l[0] === 'save-quals');
        assert.equal(id, null);
        assert.deepEqual(row, { agency: 'other', agency_other: 'UDI', level: 'OWD', card_number: 'C-1', issued_on: null,
            instructor: null, notes: null, show_on_profile: true });
        assert.match(host.textContent, /UDI/);
        assert.match(host.textContent, /Level shown on your profile/);
        assert.deepEqual(card.shownBadges(), ['UDI · OWD']);
        assert.equal(host.querySelector('.tr-doc-status').textContent, 'Saved ✓');
    });
});

test('QualificationsCard: a picked PDF uploads to the own folder on Save; the replaced scan is removed after', async () => {
    await withDom(async (host, win) => {
        const old = 'me/qualifications/11111111-1111-4111-8111-111111111111.jpg';
        const store = docsStore({ quals: [{ id: 'q1', agency: 'CMAS', level: 'P1', scan_front: old, show_on_profile: false }] });
        const card = new QualificationsCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        assert.ok(host.querySelector(`a.tr-thumb[href="https://signed.test/${old}"][rel~="noreferrer"]`), 'saved scan links to a signed URL');
        host.querySelector('[data-act="edit"][data-id="q1"]').click();
        const input = host.querySelector('input[type="file"][data-slot="scan_front"]');
        assert.equal(input.getAttribute('accept'), 'image/*,application/pdf');
        pickFile(win, input, new win.File(['%PDF-1.4'], 'card.pdf', { type: 'application/pdf' }));
        await flush();
        assert.equal(store.log.length, 0, 'nothing uploads before Save');
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        const up = store.log.find(l => l[0] === 'upload');
        assert.match(up[1], /^me\/qualifications\/[0-9a-f-]{36}\.pdf$/);
        const saveIdx = store.log.findIndex(l => l[0] === 'save-quals');
        assert.equal(store.log[saveIdx][1].scan_front, up[1]);
        assert.equal(store.log[saveIdx][2], 'q1');
        const rm = store.log.findIndex(l => l[0] === 'remove');
        assert.ok(rm > saveIdx, 'old file removed only after the row update');
        assert.deepEqual(store.log[rm][1], [old]);
    });
});

test('QualificationsCard: a failed save deletes the files it just uploaded and keeps the form', async () => {
    await withDom(async (host, win) => {
        const store = docsStore({ failSave: true });
        const card = new QualificationsCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        host.querySelector('[data-act="add"]').click();
        host.querySelector('[name="agency"]').value = 'PADI';
        host.querySelector('[name="level"]').value = 'OW';
        pickFile(win, host.querySelector('input[data-slot="scan_back"]'), new win.File(['x'], 'b.pdf', { type: 'application/pdf' }));
        await flush();
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        const up = store.log.find(l => l[0] === 'upload')[1];
        assert.deepEqual(store.log.find(l => l[0] === 'remove')[1], [up]);
        assert.ok(host.querySelector('form.tr-doc-form'));
        assert.equal(host.querySelector('[name="level"]').value, 'OW');
        assert.equal(host.querySelector('.tr-doc-status').className.includes('error'), true);
    });
});

test('QualificationsCard: refuses other file types and oversized PDFs', async () => {
    await withDom(async (host, win) => {
        const store = docsStore();
        const card = new QualificationsCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        host.querySelector('[data-act="add"]').click();
        pickFile(win, host.querySelector('input[data-slot="scan_front"]'), new win.File(['x'], 'a.txt', { type: 'text/plain' }));
        await flush();
        assert.match(host.querySelector('.tr-scan-slot[data-slot="scan_front"] .lb-form-error').textContent, /photo or a PDF/);
        const big = new win.File(['x'], 'big.pdf', { type: 'application/pdf' });
        Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
        pickFile(win, host.querySelector('input[data-slot="scan_front"]'), big);
        await flush();
        assert.match(host.querySelector('.tr-scan-slot[data-slot="scan_front"] .lb-form-error').textContent, /10 MB/);
    });
});

test('QualificationsCard: delete asks first, then deletes', async () => {
    await withDom(async host => {
        const store = docsStore({ quals: [{ id: 'q1', agency: 'GUE', level: 'Fundamentals' }] });
        const card = new QualificationsCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        host.querySelector('[data-act="edit"]').click();
        host.querySelector('[data-act="ask-delete"]').click();
        assert.ok(host.querySelector('.tr-doc-confirm'));
        host.querySelector('[data-act="delete"]').click();
        await flush();
        assert.deepEqual(store.log, [['delete-quals', 'q1']]);
        assert.match(host.textContent, /No qualifications yet/);
    });
});

test('MedicalCard: private notice, expiry status, valid-until before the check is refused', async () => {
    await withDom(async (host, win) => {
        const store = docsStore({ medical: [{ id: 'm1', checked_on: '2020-01-01', valid_until: '2021-01-01', doctor: 'Dr X' }] });
        const card = new MedicalCard({ store, user: { id: 'me' } });
        card.mount(host);
        await card.load();
        assert.match(host.querySelector('.tr-doc-private').textContent, /Only you can see this/);
        assert.ok(host.querySelector('.tr-med-status--expired'));
        assert.equal(card.state('2026-10-10').state, 'expired');
        host.querySelector('[data-act="add"]').click();
        host.querySelector('[name="checked_on"]').value = '2026-05-01';
        host.querySelector('[name="valid_until"]').value = '2026-04-01';
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        assert.equal(host.querySelector('[name="valid_until"]').getAttribute('aria-invalid'), 'true');
        host.querySelector('[name="valid_until"]').value = '2027-05-01';
        host.querySelector('form.tr-doc-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
        await flush();
        assert.deepEqual(store.log.find(l => l[0] === 'save-medical')[1], { checked_on: '2026-05-01', valid_until: '2027-05-01', doctor: null, notes: null });
        assert.equal(card.state('2026-10-10').state, 'ok');
        assert.equal(card.items[0].checked_on, '2026-05-01', 'newest first');
    });
});

test('badgesHtml / badgeTexts escape and skip empty rows', () => {
    assert.equal(badgesHtml([]), '');
    assert.deepEqual(badgeTexts([{ agency: 'TDI-SDI', level: 'Deco <b>' }, { agency: 'CMAS', level: '' }]), ['TDI/SDI · Deco <b>']);
    assert.match(badgesHtml(['TDI/SDI · Deco <b>']), /Deco &lt;b&gt;/);
});

function profileStore(extra = {}) {
    return {
        getMyProfile: async () => ({ id: 'me', display_name: 'Me' }),
        saveProfile: async p => ({ id: 'me', ...p }),
        avatarUrls: async () => new Map(),
        ...extra,
    };
}

test('ProfilePage: document cards only with 0007; the preview shows shown badges', async () => {
    await withDom(async host => {
        const page = new ProfilePage(host, { store: profileStore({ documentsStatus: async () => false }), user: { id: 'me' } });
        await flush();
        assert.equal(host.querySelector('.tr-quals').hidden, true);
        assert.equal(host.querySelector('.tr-medical').hidden, true);
        page.destroy();
    });
    await withDom(async host => {
        const store = { ...profileStore(), ...docsStore({ quals: [{ id: 'q1', agency: 'CMAS', level: 'P2', show_on_profile: true }, { id: 'q2', agency: 'PADI', level: 'Secret', show_on_profile: false }] }) };
        const page = new ProfilePage(host, { store, user: { id: 'me' } });
        await flush();
        assert.equal(host.querySelector('.tr-quals').hidden, false);
        assert.equal(host.querySelector('.tr-medical').hidden, false);
        const badges = [...host.querySelectorAll('.tr-profile-preview .tr-qual-badge')].map(b => b.textContent);
        assert.deepEqual(badges, ['CMAS · P2']);
        // a profile re-render keeps an open card form and its typed text
        host.querySelector('.tr-quals [data-act="add"]').click();
        host.querySelector('.tr-quals [name="level"]').value = 'typed';
        page.relabel();
        assert.equal(host.querySelector('.tr-quals [name="level"]').value, 'typed');
        page.destroy();
    });
});

test('MemberPage: shows the member\'s shown badges', async () => {
    await withDom(async host => {
        const store = {
            getMember: async () => ({ id: 'u2', display_name: 'Jana' }),
            memberQualifications: async id => (id === 'u2' ? [{ agency: 'SSI', agency_other: null, level: 'AOWD' }] : []),
            listCommunityEntries: async () => [], listMembers: async () => [], photoUrls: async () => new Map(), avatarUrls: async () => new Map(),
        };
        const page = new MemberPage(host, { store, userId: 'me', memberId: 'u2' });
        await flush();
        assert.deepEqual([...host.querySelectorAll('.tr-qual-badge')].map(b => b.textContent), ['SSI · AOWD']);
        page.destroy();
    });
});

test('DeleteData summary lists qualifications and medical checks', () => {
    assert.ok(summaryLines({ documents: 3 }).some(l => /Qualifications and medical checks: 3/.test(l)));
});
