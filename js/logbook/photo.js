/** Photo helpers for logbook uploads. */

export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_QUALITY = 0.85;

/** Target size: longest edge at most maxEdge, aspect kept, never upscaled. */
export function resizeTarget(width, height, maxEdge = PHOTO_MAX_EDGE) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** JPEG, PNG and WebP can be resized in every browser; HEIC cannot. */
export function isSupportedImage(mimeOrName) {
    return /(jpe?g|png|webp)$/i.test(String(mimeOrName ?? ''));
}

// ---- Browser only below: these touch the DOM, canvas and the network ----

const EXIFR_URL = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js';
let exifrPromise = null;

/** Append a script once and resolve when it has loaded. */
export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => { el.remove(); reject(new Error(`Could not load ${src}`)); };
        document.head.appendChild(el);
    });
}

function loadExifr() {
    if (globalThis.exifr) return Promise.resolve(globalThis.exifr);
    exifrPromise ??= loadScript(EXIFR_URL).then(() => globalThis.exifr, error => { exifrPromise = null; throw error; });
    return exifrPromise;
}

/**
 * Capture time and GPS position of a photo. Any failure gives nulls: a photo
 * without EXIF is still a photo.
 * @param {Blob} file
 * @returns {Promise<{takenAt: string|null, lat: number|null, lon: number|null}>}
 */
export async function readExif(file) {
    const none = { takenAt: null, lat: null, lon: null };
    try {
        const exifr = await loadExifr();
        const tags = await exifr.parse(file);
        if (!tags) return none;
        const when = tags.DateTimeOriginal ?? tags.CreateDate;
        const takenAt = when instanceof Date && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
        const ok = Number.isFinite(tags.latitude) && Number.isFinite(tags.longitude);
        return { takenAt, lat: ok ? tags.latitude : null, lon: ok ? tags.longitude : null };
    } catch (error) {
        console.debug('EXIF not read', error);
        return none;
    }
}

/**
 * Downscale an image to at most PHOTO_MAX_EDGE on the long edge, as JPEG.
 * Honours the EXIF orientation (createImageBitmap does by default).
 * @param {Blob} file
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function resizeImage(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const { width, height } = resizeTarget(bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG/WebP transparency would turn black in JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise((resolve, reject) =>
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))), 'image/jpeg', PHOTO_QUALITY));
        return { blob, width, height };
    } finally {
        bitmap.close?.();
    }
}
