/**
 * Add-dive dialog with two modes:
 *   - Custom: depth + bottom-time (editable)
 *   - No-deco: depth → bottom-time = computed NDL (read-only)
 *
 * Physics is injected: `computeNdl(startDateTime, maxDepth, gases) => minutes`.
 * Emits 'add' { startDateTime, maxDepth, bottomTime, gases } and 'cancel'.
 */
export class AddDiveDialog extends EventTarget {
    constructor(container) {
        super();
        this.container = container;
    }

    /**
     * @param {Object} opts - { startDateTime, gases, defaultDepth=18, defaultTime=40, computeNdl }
     */
    open(opts) {
        this.opts = opts;
        const depth = opts.defaultDepth ?? 18;
        const time = opts.defaultTime ?? 40;
        this.container.innerHTML = `
          <div class="add-dialog-backdrop">
            <div class="add-dialog">
              <h3>Add dive</h3>
              <label>Name <input class="ad-name" type="text" value="${opts.defaultName || ''}"></label>
              <label>Max depth <input class="ad-depth" type="number" min="1" max="100" value="${depth}"> m</label>
              <div class="ad-modes">
                <label><input type="radio" name="ad-mode" class="ad-mode-custom" checked> Custom time
                  <input class="ad-time" type="number" min="1" max="200" value="${time}"> min</label>
                <label><input type="radio" name="ad-mode" class="ad-mode-ndl"> No-deco (NDL <span class="ad-ndl">–</span> min)</label>
              </div>
              <div class="ad-hint"></div>
              <div class="ad-actions"><button class="ad-cancel">Cancel</button><button class="ad-add">Add</button></div>
            </div>
          </div>`;

        const el = (s) => this.container.querySelector(s);
        const depthEl = el('.ad-depth');
        const timeEl = el('.ad-time');
        const ndlEl = el('.ad-ndl');
        const hintEl = el('.ad-hint');
        const modeCustom = el('.ad-mode-custom');

        const refresh = () => {
            const d = parseFloat(depthEl.value) || depth;
            const ndl = opts.computeNdl(opts.startDateTime, d, opts.gases);
            ndlEl.textContent = Number.isFinite(ndl) ? ndl : '∞';
            const customMode = modeCustom.checked;
            timeEl.disabled = !customMode;
            if (!customMode && Number.isFinite(ndl)) timeEl.value = ndl;
            const t = parseFloat(timeEl.value) || 0;
            hintEl.textContent = (customMode && Number.isFinite(ndl) && t > ndl)
                ? `⚠ deco — exceeds NDL (${ndl} min) for this depth at this point in the trip`
                : (Number.isFinite(ndl) ? `NDL here: ${ndl} min` : 'NDL here: no limit (very shallow)');
        };

        depthEl.addEventListener('input', refresh);
        timeEl.addEventListener('input', refresh);
        el('.ad-mode-custom').addEventListener('change', refresh);
        el('.ad-mode-ndl').addEventListener('change', refresh);
        el('.ad-cancel').addEventListener('click', () => { this.close(); this.dispatchEvent(new CustomEvent('cancel')); });
        el('.ad-add').addEventListener('click', () => {
            const maxDepth = parseFloat(depthEl.value) || depth;
            const bottomTime = parseFloat(timeEl.value) || time;
            const name = (el('.ad-name').value || opts.defaultName || '').trim();
            const detail = { name, startDateTime: opts.startDateTime, maxDepth, bottomTime, gases: opts.gases };
            this.close();
            this.dispatchEvent(new CustomEvent('add', { detail }));
        });

        refresh();
    }

    close() { this.container.innerHTML = ''; }
}
