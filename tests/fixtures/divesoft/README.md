# Divesoft Freedom fixtures

Ten real dive logs (`DIVELOG/00000092.DLF` … `00000101.DLF`, July–September 2026)
copied read-only from a Divesoft Freedom (serial 7044-00006107, firmware 1.16.1) and
committed with the owner's permission.

`expected.json` holds reference values per dive. Header and sample values come from
the libdivecomputer reference decoder (`dctool parse`), which agreed with an
independent decoder on all 101 dives on the device. GF comes from the **first** GF
pair in the deco configuration record (libdivecomputer reports the second). `points`
is every 25th sample after keeping the first record per second; `ndl` is `null` for
unlimited and `0` in deco; `ndl` and `tts` are whole minutes. The generator lived
outside this repository (spike of 2026-10-05).
