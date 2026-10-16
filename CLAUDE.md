# Working on SFX Lab sounds with Claude

This repo is Void Haulers SFX Lab. Read `docs/ARCHITECTURE.md` before changing the engine.

## Rules

- **You cannot hear.** Never claim a sound "sounds good", "punchy" or "natural". Report measurements and
  say what you changed and why. Perceptual judgement belongs to the owner; ask for it ("render 3 is ready, tell me what you hear").
- One engine only: `src/audio/render.ts`. The UI, CLI and MCP all call it. Do not add a second renderer.
- Determinism is a feature. Never use `Math.random()` in the sound path; derive streams with `stream(seed, ...path)`.
- Factory presets are never edited in place; save changes as a new recipe file or user preset.
- Writes go to `./workspace` (git-ignored) unless the owner names a path. Never overwrite exports without being asked.
- Do not claim the Windows app, an Electron package or a listening review is done: they are not (see `docs/STATUS.md`).

## Tuning loop

1. `get_preset` (or open the owner's `.recipe.json` / `.vhsfx.json`) and `inspect_recipe` to see macros and what they map to.
2. Prefer macros (`set`) for broad changes; edit recipe JSON (layers, curves, filters) for structural ones.
3. `render`, then read the analysis: `peakDbfs`, `rmsDbfs`, `attackMs`, `decay20DbMs`, `spectralCentroidHz`, `bands`, `envelopeDbfs`, `seam` for loops, `warnings`.
4. Use `compare_wav` between the previous and new render and describe the measurable change in plain words
   ("centroid fell from 640 to 410 Hz; 62 and 125 Hz bands rose about 4 dB; decay 210 ms to 340 ms").
5. Make one or two changes per round. Keep the seed unless variation is wanted.
6. Hand the owner the file path and recipe path. For loops, tell them to use **Listen across seam**.

## Owner's words to knobs (starting points; verify by measurement)

- "boomy / muddy": lower the 125-250 Hz bands: body gain down, body frequency up, or a highpass on the layer.
- "thin": raise body gain or lower its frequency; check the 62-125 Hz bands.
- "harsh / fizzy": lower the 4-8 kHz bands: lowpass cutoff down, noise layer gain down, drive amount down.
- "dull": raise the centroid: noise/zap layer gain up, filter cutoff up.
- "attack too soft": shorten the first amplitude-curve segment; check `attackMs`.
- "rings too long": layer `timeScale` or mode `decaySeconds` down; check `decay20DbMs`.
- "too roomy": `master.space.returnDb` down or layer `spaceSendDb` down.

## Commands

`npm test`, `npm run typecheck`, `node bin/vh-sfx.mjs --help`.
