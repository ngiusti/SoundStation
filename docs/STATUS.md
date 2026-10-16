# Status and gates (as of 2026-10-16)

Built and verified on a Linux build machine with Node 22 and headless Chromium. **Nothing here has been run on
Windows, in a packaged app, or listened to by a person.** "Verified" below means an automated check, a decoded WAV
or a headless-browser run; it never means "sounds right".

## Milestones
| Milestone | State | Evidence |
|---|---|---|
| **M0** audio proof | Done | Energy sidearm renders to 48 kHz mono PCM24; decoded by ffprobe (`pcm_s24le`, 48000 Hz, 1 ch, correct duration) and Python `wave`; peak −8 dBFS. The gate's "plays in an independent application" needs **you** to open a file in a player (see below). |
| **M1** creation workspace | Done, with deviations | UI driven in headless Chromium (`npm run test:e2e`): select preset → Play → render → edit → stale status → Advanced view → loop preset → seam readout → Export download, zero console errors. 5 hero presets, macros/mappings with base-vs-effective display and Bake, undo/redo (100), layers/timeline/inspector, WAV import, crop/fades, tail modes, mono/stereo, peak/RMS and live meter, Save/Open. |
| **M2** variations and loops | Partly | Loop render, seam diagnostics, seam audition, exact length, filename pattern, sidecars, variations with locks and seeds (CLI/MCP only), manifest. **Not built:** variations tray UI, A/B snapshots, stems, batch cancel UI. |
| **M3** performance and content | Not started | XY pad, 35 more presets, 5 sample templates, collections. |
| **M4** desktop reliability | Not started | Electron package, IPC, autosave/recovery, `.vhsfx.zip`, relink dialog, offline packaged run. |
| **M5** automation | Partly | CLI and MCP built and tested; GUI/CLI parity checked. **Not done:** packaged-runtime parity, installer. |

## Acceptance checks
| ID | Result | Notes |
|---|---|---|
| A01 | Pass | `tests/engine.test.ts`: identical floats for same recipe/seed, different seed changes content. |
| A02 | By design, not separately tested | Play schedules the stored buffer; it never re-renders unless the recipe changed. |
| A03 | Pass | PCM16/24/float32 decode with ffprobe and Python `wave`; frames/rate/channels match. |
| A04 | Pass for the 5 presets | Finite, audible, peak ≤ −1 dBFS, no warnings. 35 presets do not exist yet. |
| A05 | Pass | float32 exact; PCM within quantisation. Monitor gain is not in the export path. |
| A06 | Pass | 30 s loop = 1,440,000 frames; no fade to silence; 44.1 kHz length checked. |
| A07 | Partial | Seam diagnostic flags a discontinuous fixture; noise/tone/sparse/reverb fixtures are covered only by the factory loops. **Listening review pending.** |
| A08 | Pass | 100 candidates: locked macros constant, others vary in bounds, distinct seeds. |
| A09 | Pass (CLI) | A candidate's sidecar re-renders to a byte-identical file. UI candidate tray not built. |
| A10 | Pass | Matrix and phase-cancellation fixture. |
| A11 | Pass | Start delay preserved; include-tail vs fixed length differ as specified. |
| A12 | Not built | Stems. |
| A13 | Implemented, not unit-tested | Revision guard and frozen-snapshot export; exercised only indirectly by the e2e run. |
| A14 | Partial | Sample layer renders from embedded project data; missing sample → exit 3, no substitution (tested). No relink UI, no zip archive. |
| A15 | Pass | `tests/state.test.ts`. |
| A16 | Not built | XY pad. |
| A17 | Pass on this runtime | Browser export and CLI render of the Abandoned corridor loop: identical SHA-256. Node-vs-Chromium only; packaged runtime untested. |
| A18 | Partial | Writes are temp-file + rename and refuse overwrite (tested); batch cancellation not implemented. |
| A19 | Partial | Corrupt/unsupported WAV, future schema, invalid CLI/recipe input fail clearly; memory budget enforced in the engine but not tested; no IPC yet. |
| A20 | Not built | No packaged app. |

Test run: `npm test` → 41 tests in 3 files, all passing.

## Pending human sign-off
- **Listening review (all of it).** Attacks, stop clicks, harshness, low-end build-up, repetition, loop pumping, stereo cancellation, dry usefulness. Levels and balance of the five presets were set from meters, not ears.
- **First-time-user tasks and the 3-minute first-export target.** Not tested with a person.
- Keyboard-only walkthrough, 150% scaling, screen-reader names: built in, not manually checked.
- **Run on Windows** (`Start SFX Lab.bat`), and open an exported WAV in an independent player to close the M0 gate.

## Known limitations
No live audition while dragging; drive is not oversampled; sample import is whole-file ≤ 60 s with linear-interpolated resampling; `Show in Folder` and installer do not exist; user presets live in browser storage (clearing site data deletes them); autosave recovery is not built; Open warns nothing about concurrent edits by Claude (reopen the file to pick up its changes).
