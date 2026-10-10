# Plan: profile qualifications and medical checks

Spec: `docs/superpowers/specs/2026-10-10-profile-documents-design.md`.

1. `supabase/migrations/0007_profile_documents.sql` + `supabase/tests/0007_documents.sql`, wired into `run.sh`
   (applied twice). Opus adversarial review (health-data leakage); apply findings.
2. `js/logbook/documents.js` (pure, TDD): agency list and labels, `normalizeQualification`,
   `normalizeMedicalCheck`, `qualificationErrors`, `medicalStatus(checks, today)`, `badgeText`,
   `documentPath(uid, kind, ext)`, `scanKind(file)`.
3. `js/backend/documentsStore.js` (injected like communityStore): probe, list/save/delete for both tables,
   upload/remove/sign files, `memberQualifications`, `exportDocuments`; `deleteAllMyData` step `documents`.
   Fake-client tests.
4. `js/logbook/ProfileDocuments.js`: `QualificationsCard`, `MedicalCard` (jsdom tests); mount in `ProfilePage`;
   badges in the profile preview and `MemberPage`; banner in `LogbookApp` list; export in `transfer.js`;
   DeleteData summary/step.
5. Strings en/cs/es, privacy (3 languages), CSS in `css/trail.css` (light/dark), `sw.js` STATIC_ASSETS.
6. Browser check 390×844 and desktop, light/dark (harness with a fake store); npm test; PR.
