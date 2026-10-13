# DecoTrail: buddy field with @members, and sending a dive to a buddy (migration 0013)

Date: 2026-10-13. Request: "Add buddy seems to be a drop down but it does not really show them. Can we add @ sign and
auto completion? I would like to have option to share dive to buddy who was with me and is community member. When he
accepts it should appear in his feed." User rulings (asked): accepting copies the dive into the buddy's log; when the
buddy has logged that dive already, offer to link instead; the copy carries the basics, the depth profile, the photos
and the dive story.

## Buddy field

- The `<datalist>` goes: Android Chrome shows it only as chips above the keyboard, which reads as a broken dropdown.
  A combobox (`role="combobox"`, `aria-activedescendant`, listbox under the field) opens on focus and filters as you
  type, without diacritics ("krystof" finds "Kryštof"), also by a member's full name. Arrow keys, Enter, Escape;
  options are picked on `pointerdown` so the phone keyboard stays open.
- `@` narrows the list to DecoTrail members. A member pick becomes a member chip (avatar, `@`); a typed name that is
  exactly a member's name (or `@name`) does too; anything else stays a plain name. `buddies` stays `text[]`.
- Pure helpers in `js/logbook/buddies.js` (`matchBuddies`, `buddyKey`, `memberBuddyName`, `sameDiveCandidates`).

## Sending the dive (`0013_dive_shares.sql`)

- `dive_shares(entry_id, sender, recipient, status pending|accepted|declined, result_entry_id)`, one per dive and
  recipient. Sender and recipient read their rows; every write goes through security definer functions.
- On save, the form calls `set_dive_shares(entry, member ids)`: missing offers are added, pending ones whose chip was
  removed are withdrawn, answered ones stay (a declined buddy is not asked again). Recipients must be active, invited
  members other than the sender. Works for private dives too: naming the buddy is the sender's consent.
- The chip says *will be offered*, *offered*, *in their log* or *declined*.
- The recipient sees offers on top of *New for you* (`incoming_dive_shares`), and the bell counts them until answered.
  Each offer shows sender, site, date and time, depth, duration, profile, photo count and the dive story.
- `accept_dive_share(share, link_entry)`:
  - with `link_entry` (an own dive): the sender joins that dive's buddies; nothing is copied. The page offers this
    for own dives on the same date starting within 90 minutes (`sameDiveCandidates`), and then the main button reads
    *Add as a new dive*;
  - without: a new entry in the recipient's log: date, time, duration, depth, water temperature, visibility,
    conditions (`airTempC, weather, current, waves, entry, avgDepthM, tags, guide, surfaceTempC`), the dive story,
    a members site (never the sender's private one), buddies = the sender plus the sender's other buddies minus the
    recipient. Next log number after the recipient's own offset, their default visibility (a public link becomes
    members: that stays an explicit per-dive step) and exact-location default. Never notes, gas, rating, weights,
    suit or the computer field.
  - The recording: a copy of the `dives` row (samples and summary) owned by the recipient, keeping the sender's
    `file_path`. The app treats a recording whose file is outside the own folder as a copy: no re-parse, no file in the
    export (its samples stay in `dives.json`), no file delete (`ownFile` in `supabaseStore.js`).
  - Photos are re-uploaded by the app (`copySharedMedia`): a storage policy lets the recipient read the photos of a
    dive offered to them; each photo goes through the normal `addPhoto`, so it is theirs. Video links are copied.
    A failed photo does not undo the accept.
- `decline_dive_share` marks it declined. Deleting the sender's dive removes its offers; copies stay with the recipient.

Tested in `supabase/tests/0013_dive_shares.sql` (grants, who may offer, recipients, copy contents, link, decline,
answered offers, storage) and `tests/buddy-shares.test.mjs`.

## Out of scope

- Notifying the sender when an offer is answered (the chip shows it on the next edit).
- Copying the sender's gas: cylinders and pressures are per diver.
