# Recorded Dive Analysis Page

**Date:** 2026-10-06
**Status:** Design approved in chat, awaiting written-spec review
**Roadmap position:** step 3 of 5 (1 format spike ✔ · 2 DLF parser ✔ · **3 analysis page** · 4 backend dive log · 5 device import on web and Android)
**Depends on:** `js/import/divesoftDlf.js` and `js/import/recordedDive.js` (step 2, same branch)

## Background

Step 2 turned Divesoft Freedom `.DLF` files into a RecordedDive and a DiveSetup the
engine accepts. The sandbox (`sandbox/index.html`) already shows a planned dive with
three linked charts: `DiveProfileChart` (profile and ceiling), `MValueChart` (the P-P
diagram: tissue pressure against ambient pressure with M-value and GF lines) and
`GFChart` (each tissue's momentary GF). All three take a DiveSetup.

The user wants to see their own recorded dives in these charts, with a particular
interest in the P-P diagram, and to change GF to see how a different setting relates
to the recorded profile.

## Goals

- A page that opens recorded dives and shows one at a time in the existing profile,
  P-P and GF charts, on a shared timeline.
- GF sliders that redraw ceilings, GF lines and corridors over the **fixed** recorded
  profile, and highlight where the diver was shallower than the ceiling.
- The computer's own logged ceiling drawn next to DecoTheory's.
- A summary of how close the dive came to the limits at the chosen GF.

## Non-goals

- **Repetitive-dive chaining.** Every dive starts from a fresh surface-saturated tissue
  state. Chaining with earlier dives through surface intervals is the planned follow-up
  (step 3b): the engine supports `initialTissuePressures`, and dives flagged
  `implausible-date` must never be chained.
- Re-planning the ascent for a different GF, or fitting the GF that best matches the
  computer.
- Storing dives between visits, uploading, accounts. That is step 4.
- CCR/SCR analysis. Non-OC dives are listed but show a note instead of charts.
- Matching the Freedom's own GF-ramp rule.

## Page

`sandbox/recorded-dive.html`, linked from the sandbox index and the site navigation
next to the other sandbox pages. It follows the sandbox page conventions: shared CSS,
`data-i18n` strings in `locales/en.json`, `cs.json` and `es.json`, the disclaimer
banner, and notation rules (italic quantity symbols, `&nbsp;` before units, decimal
comma in Czech).

Layout, top to bottom:

1. **Open dives:** a folder picker (`webkitdirectory`, desktop Chrome/Edge) and a
   multi-file picker (all browsers). Only files ending in `.dlf` (any case) are read.
   With nothing picked, the ten committed fixtures (`tests/fixtures/divesoft/`) load as
   a demo, labelled as example dives.
2. **Dive list:** number, device start time, max depth, duration, mode, device GF,
   water setting, warnings. Selecting a row loads that dive. The latest dive is
   selected on load.
3. **GF controls:** GF low and GF high sliders (10–100 %, the project's `gfLimits`),
   the existing GF presets (`js/gfPresets.js`), and "Reset to device GF". They start at
   the dive's device GF, or 100/100 when the dive has none.
4. **Summary panel** (see below).
5. **Profile chart**, then the **P-P chart** and the **GF chart**, sharing one timeline
   as in the sandbox.
6. **Help note** on how DecoTheory's ceiling relates to the computer's (see "Ceilings").

Dives exist only in the open page. Nothing is stored or sent anywhere.

## Data flow

```
files ──► parseDivesoftDLF ──► RecordedDive[] ──(selected)──► prepareRecordedSetup(dive, gf)
                                                                     │
                                       { setup, deviceCeiling, profileSamples }
                                                                     │
                       DiveProfileChart ◄──┬──► MValueChart ◄── timeline ──► GFChart
                                           └──► summarizeRecordedDive(...) ──► summary panel
```

### `prepareRecordedSetup(dive, { gfLow, gfHigh })` (new, `js/import/recordedDive.js`)

Returns:

- `setup`: `toDiveSetup(dive)` with the chosen GF and the waypoints **thinned**.
- `deviceCeiling`: `[{ t: minutes, depth }]` from every sample that carries `ceiling`,
  full resolution, for drawing only.
- `samples`: the untouched samples, for the summary.

Thinning keeps the profile's shape with far fewer waypoints. Recorded dives have about
700 one-second samples; the charts were built for planned dives with about ten
waypoints, and every waypoint becomes a time step. The thinning:

- uses the Ramer–Douglas–Peucker algorithm on (time, depth) with a maximum depth
  deviation of 0.1 m, measuring time in seconds;
- always keeps the first and last point, the deepest point, and every waypoint that
  carries a `gasId`;
- is a pure function `thinProfile(waypoints, toleranceM)` in
  `js/import/thinProfile.js`, tested on its own.

Target: a typical 50-minute dive drops from about 700 to between 60 and 200 waypoints.
The summary uses the same thinned setup the charts use, so their numbers agree.

## Ceilings and GF changes

The recorded profile never changes. Moving the sliders changes only the limits drawn
against it:

| Chart | With a new GF |
|---|---|
| Profile | DecoTheory's ceiling is recalculated. Where the recorded depth is shallower than it, the stretch is shaded as "above ceiling". The Freedom's logged ceiling stays as a fixed dashed line, labelled with the device GF. |
| P-P | GF lines and corridor move; tissue points and trail stay, because tissue loading does not depend on GF. |
| GF chart | The corridor moves; each tissue's momentary GF stays. |

**Which ceiling counts:** DecoTheory's ceiling is the one the profile chart already
draws (`calculateCeilingTimeSeriesDetailed`: GF low held until the ascent starts, then
ramping to GF high; see `wiki/Algo-06-Ceiling-Time-Series.md`). Violations and the
summary use that same series, so they match what the chart shows. The page's help note
explains that the computer uses its own rule and that, on deco dives, the Freedom's
ceiling falls faster during the ascent than DecoTheory's (observed in the 2026-10-05
spike).

## Summary panel

Recalculated whenever the dive or GF changes. `summarizeRecordedDive(results,
ceilingDepths, gfLow, gfHigh)` is a pure function in `js/import/recordedDiveSummary.js`
returning:

- **Peak tissue GF:** the highest momentary gradient as a percentage of the M-value
  over all compartments and time points, with compartment number and time.
- **Surface GF at the end:** the highest compartment GF at the last time point,
  evaluated at surface pressure.
- **Time above ceiling:** total seconds where depth < ceiling − 0.1 m (the tolerance
  avoids flicker at the limit), and the largest shortfall in metres. Zero means the
  recorded dive stayed within this GF.
- **Deco obligation:** deepest ceiling, and the times deco started and cleared
  (ceiling > 0.05 m), or "no deco".

Momentary GF uses the same definition as `GFChart`, so the panel and the chart agree.
When the sliders differ from the device GF, the panel shows a one-line note naming
both.

## Chart changes

All are new options that default to off, so existing pages are unchanged.

- `DiveProfileChart`
  - `referenceCeiling: [{ t, depth }] | null`: a dashed line in its own colour, with a
    legend label taken from `referenceCeilingLabel`.
  - `highlightCeilingViolations: boolean`: a translucent fill between the depth line
    and the DecoTheory ceiling wherever depth is shallower than the ceiling. It uses
    the same tolerance as the summary.
- `MValueChart`, `GFChart`: no API change expected. The plan's first task verifies
  them with a thinned recorded dive (about 150 waypoints): render time, trail
  smoothness, timeline stepping, and no per-waypoint label clutter. Any fix found
  there stays behind an option.

## Error handling

- A file that throws `DlfFormatError` is skipped. The list shows a line naming the
  file and saying it could not be read. Other files still load.
- Dives with warnings load normally; warnings show in the list.
- A dive with no samples, or a non-OC mode, is listed but shows a note in place of the
  charts.
- With no dives at all (for example an empty folder), the list says no dive logs were
  found and how to pick the `DIVELOG` folder.

## Testing

- `thinProfile`: point count bounds on fixture #100, maximum deviation ≤ 0.1 m against
  the original samples, kept endpoints, deepest point and gas-switch waypoints,
  idempotence.
- `prepareRecordedSetup`: GF override, device ceiling series in minutes, thinned
  waypoint count for #100 within 60–200.
- `summarizeRecordedDive` on #100:
  - at the device GF 60/90: zero time above ceiling, deco present (deepest ceiling
    about 2.2 m);
  - at GF 30/70: still zero time above ceiling (closest approach about 0.85 m) but a
    much deeper ceiling (about 11.5 m);
  - at GF 20/50: time above ceiling > 0 (about 150 s, worst shortfall about 0.9 m);
  - peak tissue GF is the same at all settings, because GF does not change loading.
  (Values measured on the unthinned profile on 2026-10-06; tests assert the
  qualitative relations plus the thinning tolerance, not these exact numbers.)
- Engine agreement stays as in step 2: thinning must not move #100's peak DecoTheory
  ceiling by more than 0.1 m compared with the unthinned profile.
- `DiveProfileChart` options: a jsdom test that the reference-ceiling dataset and the
  violation fill exist when enabled and are absent by default.
- Browser smoke test before shipping: load the page from a static server, open the
  demo dives, switch dives, move the sliders, step the timeline, check the console
  for errors, in English and Czech.

## Open questions

- Step 3b (repetitive chaining): the chaining window (proposed 48 h) and how to show
  which earlier dives were included.
- Whether the page moves out of the sandbox to the top level once the backend exists.
