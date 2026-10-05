# Divesoft DLF Import (Parser + RecordedDive)

**Date:** 2026-10-05
**Status:** Design approved in chat, awaiting written-spec review
**Roadmap position:** step 2 of 5 toward dive download, management and analysis
(1 format spike ✔ · **2 parser** · 3 analysis page · 4 backend · 5 device sync)

## Background

A Divesoft Freedom in its USB screen mounts as a small FAT drive (`INTERNAL`) with one
binary `.DLF` file per dive in `DIVELOG/`. The spike of 2026-10-05
([findings page](https://claude.ai/artifact/DGnfXrk1hPAAw1YbvNiPFz)) showed:

- A decoder agreed with the libdivecomputer reference on all 101 dives and 34 769
  samples.
- The deco configuration record holds **two GF pairs**. The first (bytes +6/+7) is
  the one the computer uses; libdivecomputer reports the second (bytes +8/+9, always
  80/95 on this unit). With the first pair, DecoTheory's replay matches the
  computer's peak ceiling within 0.1 m on every heavy deco dive.
- Some dives need care: duplicate records for the same second, clock resets, junk
  records, no time zone.

DecoTheory is MIT-licensed; libdivecomputer is LGPL-2.1. The parser is therefore
written from the format notes on the findings page, not ported from libdivecomputer
or from the spike's throwaway decoder.

## Goals

- `parseDivesoftDLF(bytes)` turns one `.DLF` file into a brand-neutral **RecordedDive**.
- `toDiveSetup(dive)` turns a RecordedDive into the existing **DiveSetup** shape, so
  the current engine and pages can work with recorded dives unchanged.
- Tests against 10 real dives prove field-level agreement with the verified spike
  output and engine-level agreement with the computer's own ceiling.

## Non-goals

- No UI. The analysis page is step 3.
- No storage, accounts or sync. That is steps 4–5.
- No decoding of type-8 tissue-state records, CCR O₂ cells, tank pressures, GPS or
  `CONFIG.DCF`. The parser skips them; adding them later extends the shape without
  changing it.
- No matching of the computer's GF ramp. That modelling question belongs to step 3.

## Modules

```
js/import/
  divesoftDlf.js     parseDivesoftDLF(bytes, { fileName }?) → RecordedDive
                     class DlfFormatError extends Error
  recordedDive.js    toDiveSetup(dive) → DiveSetup
tests/
  divesoft-dlf.test.mjs
  fixtures/divesoft/00000092.DLF … 00000101.DLF    (10 real dives)
  fixtures/divesoft/expected.json                    (verified reference values)
```

Both modules are pure ES modules: no DOM, no Node APIs. Input is a `Uint8Array`
(or `ArrayBuffer`), so the same code runs in the browser, in Node tests and on a
future backend.

## RecordedDive shape

Units: time s (samples, events, duration), depth m, pressure bar, temperature °C,
gas fractions 0–1, GF in % (matching DiveSetup). Sample `ndl` and `tts` are whole
minutes, as the computer displays them.

```js
{
  source:   { format: 'divesoft-dlf', formatVersion: 1, fileName: '00000100.DLF', diveNumber: 100 },
  device:   { vendor: 'Divesoft', model: 'Freedom', serial: '7044-00006107',
              firmware: '1.16.1', hardware: '3.0' },
  start:    { local: '2026-09-27T12:01:01', utcOffsetMin: null },
  duration: 3109,            // s, from header
  maxDepth: 38.56,           // m, from header
  minTemp:  4.8,             // °C, from header
  mode:     'oc',            // 'oc' | 'ccr' | 'scr' | 'gauge' | 'freedive' | 'unknown'
  environment: { surfacePressure: 0.9816, waterDensity: 1028, waterSetting: 'salt' },
  deco:     { model: 'buhlmann', gfLow: 60, gfHigh: 90, gfAlt: [80, 95] },
  gases:    [{ id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' }],
  samples:  [{ t: 0, depth: 2.21, temp: 18.5, ppO2: 0.2518, ndl: null, tts: 0, ceiling: 0 }],
  events:   [{ t: 983, type: 'ndlEnded' }, { t: 2730, type: 'safetyStopDone' }],
  warnings: ['duplicate-seconds:1']
}
```

Field rules:

- `diveNumber` comes from the file name when it is eight digits, otherwise `null`.
- `start.local` is the header timestamp (seconds since 2000-01-01) formatted as an
  ISO local date-time without an offset. The v1 header has no time zone, so
  `utcOffsetMin` is `null`. The v2 header carries one; use it when present.
- `waterDensity` is 1028 for the salt setting and 1000 for fresh, matching the
  depth conversion the computer used. `waterSetting` records the raw setting.
- `deco.model` is `'vpm'` when the VPM flag is set; `gfLow`/`gfHigh` are then still
  reported as stored.
- `gases` holds each distinct mix seen in configuration or gas-switch events, in
  order of first appearance. An air-only dive with no gas record gets a single
  21/0 gas. `role` is `'oc'`, `'diluent'` or `'oxygen'`.
- Sample `ndl` is `null` when the computer stored 1000 (unlimited) and 0 when in deco;
  `ceiling` is 0 outside deco. `ppO2`, `temp`, `ndl`, `tts` and `ceiling` are
  omitted from a sample when its record does not carry them.
- `events[].type` covers: `gasSwitch` (with `gasId`), `bookmark`, `safetyStopDone`,
  `decoStopDone`, `safetyStopMissed`, `ndlEnded`, `ascentTooFast`, `ceilingViolated`, `cns` (with
  `value`), `setpoint` (with `value`). Other codes are skipped.

## Parser behaviour

1. Check the magic: `DivE` → v1 (32-byte header), `DiVE` → v2 (64-byte header).
   Anything else throws `DlfFormatError`.
2. Verify the header CRC-16/ARC (bytes 6 to header end, init 0xFFFF). A mismatch adds
   the warning `header-crc-mismatch` and parsing continues.
3. Walk the 16-byte records in order, skipping all-`0xFF` padding records.
4. Configuration records set device, deco and gas fields. GF comes from the
   **first** pair; the second is kept as `gfAlt`.
5. Point records become samples. Keep only the first record per second; count the
   rest in a `duplicate-seconds:<n>` warning. A time step backwards of ≤ 5 s drops
   the record (warning `time-backstep:<n>`); a larger one throws `DlfFormatError`.
6. Event records become events (see field rules). Unknown types and codes are skipped
   silently, so newer firmware does not break import.

Errors vs warnings:

| Condition | Result |
|---|---|
| File shorter than its header, wrong magic, time backwards > 5 s | throw `DlfFormatError` |
| Header CRC mismatch | warning `header-crc-mismatch` |
| Duplicate seconds / small time backstep | warning with count |
| Start before 2010-01-01 or more than a day in the future | warning `implausible-date` |
| Gauge mode with max depth > 200 m | warning `gauge-test-record` |
| Duration over 6 h | warning `implausible-duration` |
| No point records | warning `no-samples` |

The parser never filters dives; the caller decides what to do with warnings.

## toDiveSetup

Produces a DiveSetup the existing engine accepts:

- `name`: `Divesoft #<diveNumber> · <start date>`; `description` names the source file.
- `gases`: RecordedDive gases mapped to `{ id, name, o2, n2, he }` with names such as
  `Air`, `EAN32`, `Tx 18/45`.
- `gfLow`, `gfHigh`: copied (already %).
- `environment`: `{ surfacePressure, waterDensity }`. The engine's
  `getPressurePerMeter` already honours `waterDensity` when no `waterType` is set.
- `surfaceInterval`: 0.
- `dives[0].waypoints`: `{ time: t / 60, depth }` per sample, framed by a surface
  point at time 0 when the first sample is not at the surface. A gas switch sets
  `gasId` on the waypoint at its time.

## Testing

Fixtures: the 10 most recent dives (#92–#101), the user's own dives (dives #1–#77 were
the previous owner's and stay out of the repository). Together they cover a deco dive
(#100), a clock reset (#99, dated 2006), duplicate seconds (#92, #95, #99, #100) and the
two-GF-pair layout (60/90 vs 80/95).

`expected.json` is generated once from the spike's verified output, using the
libdivecomputer reference for header and sample values and the first GF pair. It holds
per dive: header fields, GF, gas list, sample count, and every 25th sample (t, depth,
temp, ceiling, ndl, tts). The generator stays outside the repository; the file is
checked in as data.

Test cases (`tests/divesoft-dlf.test.mjs`, using Node's built-in `node:test`; the
`npm test` script runs it after `tests/run-tests.mjs`):

1. **Field agreement:** each fixture's header fields, GF pair, gases, sample count and
   sampled points equal `expected.json`.
2. **Warnings:** #99 has `implausible-date`; the duplicate-second dives report the
   right counts; #101 has no warnings.
3. **Errors:** a truncated buffer and a wrong magic throw `DlfFormatError`; a header
   with one flipped byte still parses and reports `header-crc-mismatch`.
4. **Engine agreement:** `toDiveSetup(#100)` run through `calculateTissueLoading` and
   `calculateCeilingTimeSeriesDetailed` gives a peak ceiling within 1.2 m of the
   computer’s 3.1 m and starts deco within 90 s of the computer.
5. **Shape:** `toDiveSetup` output passes through the same path the tissue-loading
   page uses without throwing.

Done means: `npm test` green including the new suite, and the existing suites
unaffected.

## Open questions

- Report the GF-pair finding to libdivecomputer after checking one dive in Divesoft's
  own app or cloud. Not a blocker for this step.
