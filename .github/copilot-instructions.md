# Copilot Instructions for Deco Theory PWA

## Project Overview
This is a Progressive Web App (PWA) for learning decompression theory. It runs on GitHub Pages at https://matej-hron.github.io/decojs/

## ⚠️ IMPORTANT: Before Every Push

### 1. Bump the Cache Version
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

```bash
# Start local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

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
