# Mares Quad 2 → DecoTrail over Web Bluetooth

**Date:** 2026-11-01
**Status:** Built and verified on a real Quad 2 (macOS Chrome 156); Pixel 8a pending
**Branch:** `feat/mares-ble`

## Goal

"Download from dive computer" in DecoTrail: the browser talks to a Mares Quad 2 directly over
Web Bluetooth, downloads new dives and saves them as recorded dives with the same quality as the
Divesoft DLF import (profile, gas, GF, temperature, water), so the analysis charts work unchanged.

## Findings (phase 1 recon, real device)

- The Quad 2 advertises as `Quad2`. GATT: Mares BlueLink service `544e326b-5b72-c6b0-1c46-41c1bc448118`,
  notify `1d1aae28-…`, write-without-response `99a91ebd-…`. There's also a Device Information service.
- No bonding and no PIN on macOS. Chrome connects straight away.
- Packets are variable length (libdivecomputer `VARIABLE` mode for Sirius-class models, not
  `FIXED` as first assumed): a whole answer of up to 244 bytes arrives in one notification. A round trip
  takes about 60 ms; three dives (≈ 64 KB) download in about 4 s.
- Firmware 01.02.00. Serial object `0841102519008190`; libdivecomputer reports the last six digits (8190).

## Decisions

| Decision | Why |
|---|---|
| libdivecomputer runs in the browser as WebAssembly, unmodified, at a pinned commit (`scripts/libdivecomputer/build.sh`). | It already speaks the protocol and parses the Genius format. Keeping it as a separate module keeps the LGPL-2.1 boundary clean and the module replaceable. |
| One small C bridge (`glue.c`): a `dc_custom_open` stream whose read/write/sleep are async JS (Asyncify). It also walks the parser and hands fields and samples to JS. | Asyncify works in every Chrome; the whole module is 78 KB. |
| The `.wasm` is precached by the service worker, not lazy-loaded from the network. | It is small, and offline use at the dive site matters. It is still only *instantiated* on demand (dynamic `import`). |
| `maresDive.js` maps parsed dives onto the existing RecordedDive. There is no parallel model. | The logbook, the charts and the engine take it unchanged. |
| GF, alternative GF and the dive number are read from the raw header by our own code (`readMaresExtras`), and only for the Quad 2. | libdivecomputer doesn't decode them for Mares. Each was verified against the watch: header word 0x14 = GF 70/80, 0x18 = alt GF 85/85 (7 + 7 bits each), dive start record = dive number. Other models stay "unknown" until verified. |
| Stop depth goes into `sample.ceiling`. | Mares logs the current stop depth, not a continuous ceiling; it is the closest equivalent for the "dive computer ceiling" line. |
| The surface-timeout tail is dropped (one 0 m sample kept). | Mares keeps sampling for the surface timeout (5 min here); DLF dives don't have that tail. |
| The newest downloaded fingerprint is remembered per computer and serial in `localStorage`, and written only after a successful save. | The next download fetches only new dives; cancelling leaves nothing behind. No Supabase migration is needed. "Download every dive again" ignores it. |
| Duplicates: same serial/number/start or same start as a stored recording → hidden ("already in DecoTrail"); a hand-typed entry on the same day within ±20 min → shown, unticked, with "already in your logbook". | Saving creates logbook entries (`ensureEntries`), so a second entry for a dive typed by hand is what we want to avoid. |
| Mares rows keep their own `parser_version`, and `reparseOutdated` only re-parses `.DLF` files. | A future DLF parser bump must never feed Mares bytes to the DLF parser. |
| Entry points: the ⋯ menu, the empty logbook, and New dive. | They match where Upload DIVELOG lives. |

## Errors shown to the diver

Unsupported browser (iOS, Firefox) · Bluetooth off · lost connection (the Bluetooth screen timed out) · stopped by
the diver · data the parser can't read (newer firmware) · could not save · anything else ("check the
Bluetooth screen, keep it close, try again"). Closing the device chooser is silent.

## Licence

libdivecomputer is LGPL-2.1, shipped unmodified as `js/vendor/libdivecomputer/libdc.{mjs,wasm}` with
`COPYING` and `UPSTREAM_COMMIT`. The privacy page names it and links the upstream source and our build script.
DecoTheory's own code (MIT) only calls the module's exported functions.

## Tests

`tests/mares-ble.test.mjs` (25): the WASM module in Node, parsing a synthetic Genius-format dive,
the mapping (units, gas switches, surface tail, GF, water), downloads against a simulated Quad 2
(fingerprint stop, small packets, lost connection, cancel), the BLE packet queue, the import plan,
the fingerprint store and the error wording. The real dives were used only locally to verify; none is
committed.

## Known gaps

- Only the Quad 2 is enabled. Other Genius-family Mares models would need their GF bytes verified first.
- Altitude and conservatism settings are not decoded.
- Stored Mares dives cannot be re-parsed server-side yet (they would need the WASM module).
