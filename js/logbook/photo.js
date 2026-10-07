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
