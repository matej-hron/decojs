# Copilot Instructions for Deco Theory PWA

## Project Overview
This is a Progressive Web App (PWA) for learning decompression theory. It runs on GitHub Pages at https://matej-hron.github.io/decojs/

## Theoretical References

When looking into decompression theory concepts, follow these primary sources:

1. **Decompression Theory PDF** (freely available online):
   https://aquatec.wordpress.com/wp-content/uploads/2011/03/decompression-theory.pdf

2. **"Deco for Divers" by Mark Powell** (book, no online version available):
   The definitive reference for recreational and technical diving decompression. 
   Physical copy only - not available online.

3. **CMAS P*/P** Physics Course** (local file):
   `resources/FyzikaP12_2025.txt` - Czech diving physics course material covering:
   - Density (Hustota) - water density, temperature anomaly
   - Pressure (Tlak) - atmospheric, hydrostatic, total pressure with altitude tables
   - Gas compression (Stlačování plynů) - Boyle-Mariotte's Law, gas consumption calculations
   - Buoyancy (Archimedův zákon) - weight calculations, BCD control
   - Air composition (Složení vzduchu) - N₂ 78%, O₂ 21%
   - Dalton's Law (Daltonův zákon) - partial pressures, ppO₂ limits (0.16-1.6 bar), ppN₂ max 4 bar
   - Henry's Law (Henryho zákon) - gas dissolution, on/off-gassing, tissue saturation
   - Vision underwater (Vidění) - light refraction, objects appear 1/3 larger, 1/4 closer
   - Hearing underwater (Slyšení) - sound speed 1500 m/s vs 330 m/s in air
   - Heat transfer (Přenos tepla) - water conducts heat 25x better than air

## ⚠️ IMPORTANT: Before Every Push

### 1. Run Tests
Always run `npm test` before pushing. All tests must pass.

### 2. Add Tests for Bug Fixes
When fixing a non-UI bug, **always add a test** that would have caught the bug. This prevents regressions.

### 3. Bump the Cache Version
Before pushing ANY changes, update the version number in **two places**:

**File: `sw.js` (line 2)**
```javascript
const CACHE_NAME = 'deco-theory-0.0.1';  // ← Increment this (0.0.1 → 0.0.2 → 0.0.3...)
```

**File: `css/styles.css` (search for `.version-number::after`)**
```css
.version-number::after {
    content: "0.0.1";  /* ← Keep in sync with sw.js */
}
```

### 2. Why This Matters
- The service worker uses `CACHE_NAME` to detect updates
- If you don't bump the version, users won't get the new code
- The footer version helps users confirm they have the latest version

## PWA Structure

| File | Purpose |
|------|---------|
| `manifest.json` | App metadata (name, icons, start URL) |
| `sw.js` | Service worker - caches files for offline use |
| `icons/` | App icons in various sizes (SVG) |

## Key Configuration

### GitHub Pages Paths
Since the app runs at `/decojs/` (not root), manifest uses absolute paths:
```json
"start_url": "/decojs/index.html",
"scope": "/decojs/"
```

### Files Cached for Offline
All static assets are listed in `sw.js` → `STATIC_ASSETS` array.
If you add new files, add them to this array.

## Update Behavior

| What Changes | Auto-updates? | Notes |
|--------------|---------------|-------|
| HTML, CSS, JS | ✅ Yes | Requires version bump in sw.js |
| JSON data files | ✅ Yes | Requires version bump in sw.js |
| manifest.json start_url | ❌ No | Requires user to uninstall/reinstall |
| manifest.json scope | ❌ No | Requires user to uninstall/reinstall |
| App name | ❌ No | Requires user to uninstall/reinstall |

## Testing PWA Locally

Use the **Live Server** VS Code extension (already installed) - just right-click on any HTML file and select "Open with Live Server".

Note: Service workers require HTTPS in production, but work on localhost for testing.

## Chart Standards

### Fullscreen Support
**All charts MUST include a fullscreen toggle button.** Use this pattern:

**HTML Structure:**
```html
<section class="chart-section">
    <div class="chart-header">
        <h2>📈 Chart Title</h2>
        <button id="fullscreen-btn" class="btn btn-small btn-icon" title="Fullscreen">
            <span class="fullscreen-icon">⛶</span>
            <span class="fullscreen-text">Fullscreen</span>
        </button>
    </div>
    <div class="chart-container" id="chart-container">
        <canvas id="chart-canvas"></canvas>
        <button id="exit-fullscreen-btn" class="btn btn-fullscreen-close" title="Exit Fullscreen">✕</button>
    </div>
</section>
```

**JavaScript (add to page script):**
```javascript
// Fullscreen controls
const chartContainer = document.getElementById('chart-container');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');

function toggleFullscreen() {
    const isFullscreen = chartContainer.classList.toggle('fullscreen');
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    if (chartInstance) {
        setTimeout(() => chartInstance.resize(), 50);
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
exitFullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartContainer.classList.contains('fullscreen')) {
        toggleFullscreen();
    }
});
```

The CSS styles for `.chart-header`, `.chart-container.fullscreen`, and `.btn-fullscreen-close` are already defined in `css/styles.css`.
