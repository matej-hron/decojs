# Kudos + comments — plan

Spec: `docs/superpowers/specs/2026-10-10-kudos-comments-design.md`.

1. Migration `0010_social.sql` + `supabase/tests/0010_social.sql` (seed in the test itself), `run.sh` applies it twice. Gate: `bash supabase/tests/run.sh`.
2. Opus adversarial review of 0010 (leakage of private dives, author spoofing, comments-off bypass, anon writes); apply findings, re-run.
3. `js/backend/socialStore.js` + wiring in `supabaseStore.js` (incl. deleteAllMyData step 'social') + `shareStore.kudosCount`; tests with the fake client (`tests/social.test.mjs`).
4. `js/logbook/social.js` pure helpers (TDD, same test file).
5. `SocialBar.js` on feed cards (CommunityFeed) and detail; `CommentsSection.js`; ⋯ menu in EntryDetail; CSS in `css/trail.css`.
6. `ActivityPage.js`, route `#/activity`, bell + badge in AppShell/top bar, refresh + mark-seen in LogbookApp.
7. Share page kudos count.
8. Locales en/cs/es, privacy.html en/cs/es, sw.js STATIC_ASSETS for new files.
9. npm test; browser harness at 390×844 and desktop, light/dark, en/cs/es; code review (opus); fix.
10. Merge origin/main, bump version above live, npm test, push, PR, CI green, REPORT.md.
