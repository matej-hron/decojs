# Copilot Instructions for Deco Theory PWA

## Project Overview
This is a Progressive Web App (PWA) for learning decompression theory. It runs on GitHub Pages at https://matej-hron.github.io/decojs/

## ⚠️ IMPORTANT: Before Every Push

### 1. Bump the Cache Version
Before pushing ANY changes, update the version number in **two places**:

**File: `sw.js` (line 2)**
```javascript
const CACHE_NAME = 'deco-theory-v1';  // ← Increment this (v1 → v2 → v3...)
```

**File: `css/styles.css` (search for `.version-number::after`)**
```css
.version-number::after {
    content: "v1";  /* ← Keep in sync with sw.js */
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
