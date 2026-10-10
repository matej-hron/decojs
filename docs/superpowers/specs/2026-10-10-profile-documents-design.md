# DecoTrail profile: qualifications and medical checks (design)

Status: autonomous build (brief-docs), 2026-10-10. Migration `0007_profile_documents.sql` (0006 is taken by sites/description).

## Goal

The Profile tab keeps a diver's certification cards and dive medical checks, each with scans,
phone-first. Qualifications can optionally show as a small badge (agency + level) to other members.
Medical data is health data (GDPR Art. 9): strictly owner-only, never in any community, share or feed path.

## Decisions (each with a one-line why)

| Decision | Why |
|---|---|
| Two tables `qualifications`, `medical_checks`; owner-only RLS `for all` with `owner = auth.uid()` (same shape as 0002) | Proven pattern; anon gets nothing (revoke all). |
| Agency is a fixed code list `CMAS, PADI, SSI, NAUI, TDI-SDI, IANTD, GUE, RAID, BSAC, other`, plus free `agency_other` (≤ 60) | A check constraint keeps badges clean; "other" still lets a diver name e.g. "UDI". |
| Scans live in a new private bucket `documents`, path `<uid>/<qualifications|medical>/<uuid>.<jpg|pdf>`; 10 MiB, `image/jpeg` + `application/pdf` | Owner-folder RLS like dive-logs; JPEG because images are resized in the browser (like photos); PDF as-is. |
| Rows store the paths (`scan_front`, `scan_back`, `scan_path`), checked by a constraint to sit in the owner's folder of the right kind | A row cannot point at someone else's file, and the app can always find its files for deletion. |
| No storage UPDATE policy on `documents` | Same reason as avatars (0004): an update lets a file move between buckets past their limits; the app always uploads a new name. |
| Badge projection = security-definer `community_qualifications(p_owner uuid)` returning only `agency, agency_other, level` where `show_on_profile` and `is_member()` | A function returns a fixed column list, so a later column (card number, scans, notes) can never leak by accident; members cannot select the table at all. |
| `show_on_profile` default false | Opt-in, per card, as the brief says. |
| Medical tables have **no** security-definer reader at all; tests assert that no function in `public` other than the trigger reads them | The strongest guarantee that no member/anon path exists. |
| Images: decoded and re-encoded as JPEG, long edge ≤ 2560 px (`resizeImage` of photos) — EXIF/GPS dropped by the canvas | Legible card scans at a fraction of the size, and no location metadata in health documents. |
| PDF uploaded as-is when ≤ 10 MiB; HEIC/other types refused with a message | Browsers cannot render HEIC; the bucket allows only JPEG/PDF. |
| One file picker per scan slot, `accept="image/*,application/pdf"` | On Android Chrome this offers Camera, Gallery and Files in one chooser — the "scan via camera/gallery" requirement without two buttons per slot. |
| Scans viewed through short signed URLs (5 min) with `referrerpolicy="no-referrer"`; the service worker never caches Supabase (already `bypass`) | Nothing about a health document lingers in a cache or a Referer. |
| Edits are staged: picked scans are kept as local blobs (object-URL previews) and uploaded on Save; replaced/removed files are deleted after the row update succeeds; a failed row write deletes the just-uploaded files | No orphan files and no row pointing to a missing file in the common failure paths. |
| A new card is inserted first (gets its id), then scans upload, then the row is updated with paths | Simple, and a scan failure still leaves the typed data saved (status tells the user). |
| Medical status = the latest `valid_until` over all checks: `ok` / `soon` (≤ 30 days) / `expired` / `none` | A renewed check supersedes an old expiring one. |
| Logbook banner: a subtle one-line notice above My dives when status is `soon` or `expired`, link to Profile, dismiss for the session | Brief: "subtle banner"; the Profile shows the full status. |
| Feature hidden when 0007 has not run (probe `qualifications` like the community probe) | The code can ship before the user runs the migration. |
| Delete all my data: new step `documents` removes every file under `<uid>/` in `documents`, then all rows of both tables | GDPR erasure covers the new data; listing the folder also catches orphans. |
| Export: the zip gets `documents.json` (both tables) and the scan files under `documents/` | GDPR access: "Export downloads everything" stays true. |
| Member page and the own profile preview show the shown badges (chips: "CMAS · P2") | Where members meet you; the preview is "how others see you". |

## Data model (0007)

```
qualifications(id uuid pk, owner uuid default auth.uid() → auth.users on delete cascade,
  agency text not null check (in list), agency_other text ≤ 60 (only with 'other'), level text 1..100 not null,
  card_number ≤ 60, issued_on date, instructor ≤ 100, notes ≤ 2000,
  scan_front, scan_back text (path checks), show_on_profile bool not null default false,
  created_at, updated_at — server-kept by trigger)
medical_checks(id, owner, checked_on date not null, valid_until date (≥ checked_on), doctor ≤ 200,
  notes ≤ 2000, scan_path text (path check), created_at, updated_at)
bucket documents: private, 10485760 bytes, {image/jpeg, application/pdf}
storage policies: select / insert / delete on bucket documents, own folder only (no update).
community_qualifications(p_owner uuid) security definer, authenticated only.
```

Idempotent: `create table if not exists`, `drop policy if exists` + create, `create or replace function`,
`on conflict do update` for the bucket. Runs in one transaction.

## UI

Profile tab, after the profile form and before Dive numbering:

- **Qualifications** card: list of certification tiles (agency chip, level, "No. … · Issued …", instructor,
  front/back thumbnails, "Shown to members" tag, Edit). "Add qualification" opens an inline form:
  agency select (+ name when "Other"), level, card number, date issued, instructor, notes, two scan slots
  (Front / Back: Add, Replace, Remove), checkbox "Show level on my profile to members" with the hint
  "Members see only the agency and level — never the card number or scans." Save / Cancel / Delete (inline confirm).
- **Medical fitness** card with a lock line "Only you can see this. Never shared with members or in the feed."
  Status line (valid until … / expires in n days / expired on …). List of checks, newest first; form: date of
  the check (required), valid until, doctor or institution, notes, one scan.

Phone first (single column, 44 px targets, thumbnails 72 px), dark mode via the existing tokens, en/cs/es.

## Out of scope

Badge in the feed cards (brief: never in feed for medical; badges stay on the member page), reminders by
email, OCR of card numbers.

## Adversarial review

See the end of this file (filled after the Opus review).
