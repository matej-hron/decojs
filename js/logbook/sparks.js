/**
 * Lazy depth profiles of feed cards and tiles: each `.lb-spark[data-rec]` slot that scrolls near
 * the screen loads its recording (a few at a time) and is painted as a "water column" sparkline.
 */

import { sparklinePath, profileAreaPath } from './listViews.js';

const SPARK_W = 300;
const SPARK_H = 100;

export class SparkLoader {
    /**
     * @param {(recordingId: string) => Promise<{samples?: Object[]}>} load
     * @param {{concurrency?: number}} [options]
     */
    constructor(load, { concurrency = 3 } = {}) {
        this.load = load;
        this.concurrency = concurrency;
        this.paths = new Map(); // recording id -> {line, area} | null (none or failed)
        this.queue = [];
        this.active = 0;
        this.loads = new Map(); // recording id -> in-flight promise
        this.observer = null;
        this.destroyed = false;
    }

    /** Paint known profiles in `root` and observe the others (replaces any earlier watch). */
    watch(root) {
        this.stop();
        const slots = [...root.querySelectorAll('.lb-spark[data-rec]')];
        for (const el of slots) if (this.paths.has(el.dataset.rec)) this._paint(el);
        const pending = slots.filter(el => !this.paths.has(el.dataset.rec));
        if (!pending.length) return;
        if (typeof IntersectionObserver === 'undefined') return; // no lazy loading: skip profiles rather than load every dive
        this.observer = new IntersectionObserver(items => {
            for (const item of items) {
                if (!item.isIntersecting) continue;
                this.observer?.unobserve(item.target);
                this.queue.push(item.target);
                this._pump();
            }
        }, { rootMargin: '200px' });
        pending.forEach(el => this.observer.observe(el));
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
        this.queue = [];
    }

    destroy() {
        this.destroyed = true;
        this.stop();
    }

    _pump() {
        while (this.active < this.concurrency && this.queue.length) {
            const el = this.queue.shift();
            if (!el.isConnected) continue;
            const id = el.dataset.rec;
            if (this.paths.has(id)) { this._paint(el); continue; }
            const inFlight = this.loads.get(id);
            if (inFlight) { inFlight.then(() => { if (el.isConnected) this._paint(el); }); continue; } // same dive already loading
            this.active++;
            const load = Promise.resolve()
                .then(() => this.load(id))
                .then(dive => ({ line: sparklinePath(dive?.samples, SPARK_W, SPARK_H, 0), area: profileAreaPath(dive?.samples, SPARK_W, SPARK_H, 0) }), () => null)
                .catch(() => null)
                .then(paths => {
                    this.paths.set(id, paths);
                    if (el.isConnected) this._paint(el);
                })
                .finally(() => { this.loads.delete(id); this.active--; if (!this.destroyed) this._pump(); });
            this.loads.set(id, load);
        }
    }

    /** The profile as a "water column": the dived shape hangs from the surface; the bottom 15 % stays free. */
    _paint(el) {
        const paths = this.paths.get(el.dataset.rec);
        if (!paths?.line || el.firstChild) return;
        el.innerHTML = `<svg viewBox="0 -3 ${SPARK_W} ${SPARK_H + 18}" preserveAspectRatio="none" focusable="false" aria-hidden="true">
            <path class="lb-spark-area" d="${paths.area}"/><path class="lb-spark-line" d="${paths.line}" vector-effect="non-scaling-stroke"/></svg>`;
    }
}
