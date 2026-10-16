# Status and gates (as of 2026-10-16)

Built and verified on a Linux build machine (Node 22, headless Chromium, Electron under Xvfb). **Nothing here has been
run on Windows, from a Windows installer, or listened to by a person.** "Verified" means an automated check, a decoded WAV
or a headless run. It never means "sounds right".

## Milestones
| Milestone | State | Evidence |
|---|---|---|
| **M0** audio proof | Done | Energy sidearm renders to 48 kHz mono PCM24; decoded by ffprobe and Python `wave`. The gate's "plays in an independent application" needs **you** to open a file in a player. |
| **M1** workspace | Done | Real UI driven in Chromium and in Electron: render, edit, stale status, Advanced view, loop seam readout, export. Undo/redo, layers, curve editor, WAV import, crop/fades, tail modes, save/open. |
| **M2** variations and loops | Partly | Loops, seam audition, exact length, filename pattern, sidecars, seeded variations with locks (CLI/MCP only), manifest. **Not built:** variations tray UI, A/B snapshots, stems. |
| **M3** performance and content | Done, with one approximation | XY pad (static, capture, replay, curve editing, shapes), 40 factory presets (5 per family), 5 sample templates, search/favourites/recent/my presets. **Not built:** named project collections. Footsteps "sample-choice variation" is approximated with speed/level variation of one recording (one imported file), not multiple files. |
| **M4** desktop reliability | Partly | Electron shell: sandboxed renderer, context isolation, custom `vhsfx://` origin, narrow validated IPC, no-overwrite atomic writes, autosave recovery (3 rolling snapshots, 300 MB cap), no network use. 19/19 desktop checks pass from source **and from a packaged Linux build**. **Not done:** Windows installer/portable build (needs a Windows machine), `.vhsfx.zip` archives, relink dialog, memory-limit UI. |
| **M5** automation | Partly | CLI and MCP built and tested; GUI/CLI parity checked in browser. **Not done:** parity on a packaged Windows runtime. |

## Acceptance checks
| ID | Result | Notes |
|---|---|---|
| A01 | Pass | Identical floats for same recipe/seed; new seed changes content. |
| A02 | By design | Play schedules the stored buffer; it re-renders only if the recipe changed. Not separately tested. |
| A03 | Pass | PCM16/24/float32 decode with ffprobe and Python `wave`; frames/rate/channels match. |
| A04 | Pass for all 40 | Finite, audible (> -40 dBFS), peak ≤ -1 dBFS, no engine warnings (`tests/presets.test.ts`). Every macro of every preset measurably changes the sound; no two presets share a similar spectrum/level/length. Measurable ≠ pleasant. |
| A05 | Pass | float32 exact; PCM within quantisation. Monitor gain is not in the export path. |
| A06 | Pass | 30 s loop = 1,440,000 frames; no fade to silence; every factory loop has exactly its frame count. |
| A07 | Partial | Seam diagnostic flags a discontinuous fixture and passes all 9 factory loops (it ignores natural modulation slope). **Repeated-seam listening review pending.** |
| A08 | Pass | 100 candidates: locked macros constant, others vary within bounds, distinct seeds. |
| A09 | Pass (CLI) | A candidate's sidecar re-renders byte-identically. In-app candidate tray not built. |
| A10 | Pass | Matrix and phase-cancellation fixture. |
| A11 | Pass | Start delay preserved; include-tail vs fixed length differ as specified. |
| A12 | Not built | Stems. |
| A13 | Implemented, not unit-tested | Revision guard and frozen-snapshot export; exercised indirectly by e2e. |
| A14 | Partial | Sample layer renders from embedded project data; missing sample → exit 3 / blocked open, no substitution. No relink UI, no zip archive. |
| A15 | Pass | `tests/state.test.ts`. |
| A16 | Pass (engine) | Capture → canonical curves (200 Hz resample, 0.5-unit tolerance) → JSON round-trip → replay is byte-identical; motion measurably changes the sound over time. UI capture driven in Chromium. |
| A17 | Pass on this runtime | Browser export and CLI render of a loop are SHA-256 identical (Node vs Chromium). Packaged Windows runtime untested. |
| A18 | Partial | Exports are temp-file + hard-link/rename, never overwrite (tested incl. 8 concurrent writers); batch cancellation not implemented. |
| A19 | Partial | Corrupt/unsupported WAV, future schema, invalid CLI/recipe input, path-traversal IPC names fail clearly without losing the open project; memory budget enforced in the engine but not tested. |
| A20 | Partial | Packaged **Linux** build launches, browses presets, renders, exports, recovers autosave, and made zero requests outside its own origin. Not run on Windows. |

Test run: `npm test` → 102 tests in 7 files, all passing. `npm run test:desktop` → 19/19. `npm run test:e2e` → browser smoke including XY capture.

## Pending human sign-off
- **Listening review (all of it).** Attacks, stop clicks, harshness, low-end build-up, repetition, loop pumping, stereo cancellation, dry usefulness for all 40 presets. Levels come from `tools/level-presets.ts` (peak targets: one-shots -6 dBFS, loops -16 dBFS), not from ears; macro ranges were checked by measurement only.
- **First-time-user tasks and the 3-minute first-export target.** Not tested with a person.
- Keyboard-only walkthrough, 150% scaling, screen-reader names: built in, not manually checked.
- **Build and run on Windows** (`npm run dist:win`), open an exported WAV in an independent player, and confirm the installer works on a clean machine. The Windows icon is generated from `build/icon.png`; a Windows `.exe` could not be produced here (the sandbox has no wine).

## Known limitations
No live audition while dragging (press Play or use Auto preview); drive is not oversampled; sample import is whole-file ≤ 60 s with linear-interpolated resampling; XY motion automates only level, oscillator pitch and filter cutoff (other targets keep the control's value and the render says so); user presets live in browser/app storage; no code signing; `npm audit` reports 8 moderate findings in electron-builder's build-time dependencies (sprintf-js), which are not part of the packaged app; Open does not notice concurrent edits by Claude (reopen the file).
