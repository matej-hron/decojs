/**
 * Upload and export for the dive log: DIVELOG folder to the server, and the whole log as a zip.
 * The store is injected; only the default download step touches the DOM.
 */

import { planSync } from '../backend/sync.js';
import { loadDiveFiles } from '../components/RecordedDiveAnalysis.js';

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.2/jszip.min.js';

let jsZipPromise = null;

/** Load JSZip on demand (the script is appended at most once). */
export function loadJsZip() {
    if (globalThis.JSZip) return Promise.resolve(globalThis.JSZip);
    if (!jsZipPromise) {
        jsZipPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = JSZIP_URL;
            script.onload = () => resolve(globalThis.JSZip);
            script.onerror = () => {
                script.remove();
                jsZipPromise = null;
                reject(new Error('Could not load JSZip'));
            };
            document.head.appendChild(script);
        });
    }
    return jsZipPromise;
}

/** Offer a blob as a file download. */
export function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

/**
 * Save the dives found among `files` to the store, then create logbook entries for new recordings.
 *
 * @param {Object} store - Dive store
 * @param {Iterable<{name: string, arrayBuffer: Function}>} files
 * @param {(done: number, total: number) => void} [onProgress] - called as each dive is saved; called with (0, total) first
 * @returns {Promise<{ensureError: (Error|null), report: ({saved: number, updated: number, unchanged: number, failed: Array}|null), items: Object[]}>}
 *   `report` is null when the files held nothing to read at all.
 */
export async function uploadDivelog(store, files, onProgress = () => {}) {
    const picked = await loadDiveFiles(files);
    onProgress(0, picked.items.length);
    const plan = planSync(picked.items, await store.listDives());
    const batch = [
        ...plan.upload.map(i => ({ ...i, action: 'upload' })),
        ...plan.update.map(i => ({ ...i, action: 'update' })),
    ];
    const saved = await store.saveDives(batch, onProgress);
    let ensureError = null;
    try {
        await store.ensureEntries();
        await store.fillComputerFields?.();
    } catch (error) {
        ensureError = error; // the dives are saved; let the page report that and the failure
    }
    const nothingFound = picked.items.length === 0 && picked.errors.length === 0;
    const report = nothingFound ? null : {
        saved: saved.saved, updated: saved.updated, unchanged: plan.unchanged.length,
        failed: [...saved.failed, ...picked.errors],
    };
    return { report, items: picked.items, ensureError };
}

/**
 * Download the whole dive log as a zip: the DIVELOG files, dives.json and logbook.json
 * (entries, sites and media rows), and with migration 0007 documents.json (qualifications and
 * medical checks) with the scans under documents/.
 *
 * @param {Object} store - Dive store
 * @param {{loadZip?: Function, download?: Function, now?: Date}} [deps] - replaceable for tests
 */
export async function exportZip(store, { loadZip = loadJsZip, download = downloadBlob, now = new Date() } = {}) {
    const { files, dives } = await store.exportAll();
    const entries = await store.listEntries();
    const sites = await store.listSites();
    const media = [];
    for (const entry of entries) media.push(...await store.listMedia(entry.id));
    const docs = typeof store.exportDocuments === 'function' ? await store.exportDocuments() : null;
    const JSZip = await loadZip();
    const zip = new JSZip();
    for (const f of files) zip.file(`DIVELOG/${f.name}`, f.bytes);
    zip.file('dives.json', JSON.stringify(dives, null, 1));
    zip.file('logbook.json', JSON.stringify({ entries, sites, media }, null, 1));
    if (docs) {
        zip.file('documents.json', JSON.stringify({ qualifications: docs.qualifications, medical_checks: docs.medical_checks }, null, 1));
        for (const f of docs.files) zip.file(`documents/${f.name}`, f.bytes);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    download(blob, `dive-log-${now.toISOString().slice(0, 10)}.zip`);
}
