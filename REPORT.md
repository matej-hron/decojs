# SW fresh updates (PR #207, v0.6.214)
Changed sw.js: install uses cache:'reload'; network-first (cache:'no-cache', 3s fallback) for navigations and same-origin html/js/css/json; cache-first for media; cross-origin bypassed except cdn.jsdelivr.net.
Test: tests/sw-routing.test.mjs. Browser: verified fresh JS on first fetch and offline reload on localhost:5520. No screenshots (no UI change).
Gap: the site never registers sw.js and index.html/gradient-factors.html unregister it (commit 4b12080); fix only helps lingering registrations.
