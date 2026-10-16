# Architecture and deviations from the specification

## Shape
```
src/domain   recipe schema (zod), validation, macro mappings, seeded random streams, hashing   (no DOM, no Node)
src/audio    DSP, sources, reverb, render.ts (the engine), analysis                            (no DOM, no Node)
src/export   WAV encode/decode, output stage (downmix, peak policy, dither), sidecar            (no DOM, no Node)
src/presets  factory recipes + local search
src/core     Node-side operations shared by CLI and MCP (files, atomic writes, variations)
src/cli      vh-sfx command line          src/mcp   MCP server (stdio) wrapping src/core
src/ui       React app; render.worker.ts runs the engine off the main thread
```
`domain`, `audio` and `export` have no environment dependencies, so the browser worker, the CLI, the MCP server and the tests run **the same code**. That is what makes GUI/CLI parity structural: a loop rendered by the browser export and by `vh-sfx render` are byte-identical (checked by SHA-256 on this runtime; cross-machine bit-identity is not promised).

## Rendering
`renderRecipe(recipe)`:
1. `applyMappings` evaluates macros into *effective* values without touching base values: `effective = clamp(base + Σ amount·polarity·(curve(n) − curve(n₀)))`, or `clamp(base · 2^Σ…)` for log2 targets. Because the delta is relative to the macro's default, the preset sounds as authored at its default position.
2. Each audible layer is rendered into its own buffer: source → amplitude envelope/tremolo → filters (cutoff can sweep) → effects (drive, delay) → gain. Mute/solo decide which layers are audible.
3. Layers are panned onto a dry bus; sends feed a shared algorithmic reverb (Freeverb topology, original code, feedback derived from the requested T60, seeded delay-length jitter).
4. One-shots: tail room is estimated (reverb decay, delay repeats), then trimmed where the signal falls below −72 dBFS (warning if still above at the cap). Crop and fades are applied afterwards by `cropAndFade`.
5. Loops: render warm-up + N + crossfade frames, take N frames, blend the extra frames into the head (circular overlap). The fade law adapts to correlation (linear for identical content, equal-power for uncorrelated). Sustained oscillators without pitch motion are snapped to a whole number of cycles per loop. Exactly N = round(duration × rate) frames are produced.
6. NaN/Infinity are replaced with silence and reported.

The output stage (`processOutput`) downmixes (0.5L + 0.5R, reporting phase cancellation), applies export gain and the peak policy (attenuate-only to −1 dBFS by default; never raises quiet sounds), then `encodeWav` quantises with seeded TPDF dither for integer formats.

**Seeds:** `stream(masterSeed, layerId, purpose, …)` → cyrb53 hash → mulberry32. Adding a layer does not change another layer's noise. `Math.random()` is never used in the sound path.

**Render state in the UI:** every edit bumps `revision`. A render result is installed only if its revision still equals the current one; otherwise the app renders the latest instead. Only one render runs at a time per worker; a newer waiting request replaces an older one (`Superseded`). Export uses its own worker and a frozen snapshot, so editing during an export cannot change the file.

## Deviations (and what they mean for you)
| Spec says | What was built | Impact |
|---|---|---|
| Web Audio API + OfflineAudioContext | Pure TypeScript DSP, rendered offline | One engine for UI, CLI and MCP; testable and deterministic here. **No live audition mode**: moving a slider does not change sound until you press Play/Auto preview. No 200 Hz control-rate automation; curves are evaluated per sample. |
| Electron desktop app | Local web app (Vite), `Start SFX Lab.bat` | Works in Chrome/Edge on Windows. **No installer, no sandboxed IPC, no "Show in Folder"** yet. Authoring this was not verifiable on the Linux build machine. |
| MCP server deferred (LATER) | stdio MCP server included | Added at the owner's request. It wraps `src/core`; it opens no port. |
| Project = folder + `assets/` + zip archive | Single `.vhsfx.json` with embedded samples | Portable and reopens after originals move; large samples inflate the file. No relink dialog (a missing sample blocks opening with a clear message; nothing is substituted). Autosave recovery is not built. |
| Import long files via range selection | Files over 60 s are rejected with a message | Trim long recordings first. |
| Stems, A/B, variation tray, XY pad, 40 presets, 5 sample templates | Not built yet | See STATUS. Variations and locks exist in the CLI/MCP only. |
| Modest FM, "oversampling" must be real | FM, drive implemented without oversampling; nothing claims it | Drive at high gain can alias. |

Dependency versions are fixed by `package-lock.json` (Zod 4, TypeScript 7, Vite 8, Vitest 5, React 19).
