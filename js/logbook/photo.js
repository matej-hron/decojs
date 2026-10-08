/** Photo helpers for logbook uploads. */

export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_QUALITY = 0.85;

/** Target size: longest edge at most maxEdge, aspect kept, never upscaled. */
export function resizeTarget(width, height, maxEdge = PHOTO_MAX_EDGE) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Edge of an uploaded avatar in pixels (square JPEG). */
export const AVATAR_EDGE = 256;
export const AVATAR_QUALITY = 0.85;

/** The centred square of a width × height image: its top-left corner and side, in source pixels. */
export function squareCrop(width, height) {
    const side = Math.min(width, height);
    return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
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

const OFFSET = /^[+-]\d{2}:\d{2}$/;

/**
 * ISO timestamp of an EXIF capture time. EXIF stores wall-clock time without a zone and
 * exifr reads it as a Date in the uploader's zone, so the wall-clock fields are taken from
 * the local getters and combined with the camera's offset (OffsetTimeOriginal/OffsetTime).
 * Without an offset we can only assume the uploader's zone (today's behaviour).
 * @param {Date|*} date
 * @param {string|null} [offset] e.g. "+02:00"
 * @returns {string|null}
 */
export function exifTimestamp(date, offset = null) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    if (typeof offset !== 'string' || !OFFSET.test(offset)) return date.toISOString();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    const wall = `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
    const t = new Date(`${wall}${offset}`);
    return Number.isNaN(t.getTime()) ? date.toISOString() : t.toISOString();
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
        const original = tags.DateTimeOriginal;
        const takenAt = exifTimestamp(original ?? tags.CreateDate, original ? (tags.OffsetTimeOriginal ?? tags.OffsetTime) : (tags.OffsetTimeDigitized ?? tags.OffsetTime));
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
    const bitmap = await decodeImage(file);
    const { width, height } = resizeTarget(bitmap.width, bitmap.height);
    return drawJpeg(bitmap, { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height }, width, height, PHOTO_QUALITY);
}

/**
 * An uploaded profile photo: the centred square, scaled to AVATAR_EDGE, as JPEG (EXIF orientation honoured,
 * metadata dropped by the canvas). Throws `Error('unreadable-image')` when the browser cannot decode the file
 * (HEIC on most desktop browsers, a broken file).
 * @param {Blob} file
 * @returns {Promise<Blob>}
 */
export async function avatarBlob(file) {
    let bitmap;
    try {
        bitmap = await decodeImage(file);
    } catch (error) {
        console.debug('Image not decoded', error);
        throw new Error('unreadable-image');
    }
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const { blob } = await drawJpeg(bitmap, { sx, sy, sw: side, sh: side }, AVATAR_EDGE, AVATAR_EDGE, AVATAR_QUALITY);
    return blob;
}

/** Decode an image, honouring the EXIF orientation (createImageBitmap does by default). */
async function decodeImage(file) {
    try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        return createImageBitmap(file); // engines that do not know the option
    }
}

/** Draw a source rectangle of a bitmap onto a width × height canvas and encode it as JPEG; closes the bitmap. */
async function drawJpeg(bitmap, { sx, sy, sw, sh }, width, height, quality) {
    const canvas = document.createElement('canvas');
    try {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG/WebP transparency would turn black in JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
        const blob = await new Promise((resolve, reject) =>
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('JPEG encoding failed'))), 'image/jpeg', quality));
        return { blob, width, height };
    } finally {
        bitmap.close?.();
        canvas.width = canvas.height = 0; // release the pixel memory at once
    }
}
