# Preset authoring

A preset is a recipe (JSON validated by `src/domain/schema.ts`). Factory presets live as typed objects in `src/presets/heroes.ts` and are validated at startup, so a broken preset fails immediately. List and inspect with the CLI: `node bin/vh-sfx.mjs show-preset energy-sidearm`.

## Recipe essentials
- `seed` (integer), `durationSeconds`, `mode` (`oneShot` | `loop`), `fileCategory` / `fileName` (used for `VH_{Category}_{Name}_{NNN}.wav`).
- `layers` (1-8): `id`, `name`, `source`, `startSeconds`, `durationSeconds`, `timeScale`, `gainDb`, `pan`, `amplitudeCurve [[t,v]…]`, optional `pitchCurveSemitones`, `tremolo`, `filters`, `effects`, `spaceSendDb`.
- Sources: `oscillator` (sine/triangle/saw/square, FM, vibrato), `noise` (white/pink/brown, equal RMS), `resonantImpact` (≤6 damped modes + strike burst), `sample` (imported asset), `eventSequence` (seeded repeated oscillator/noise/impact with rate, jitter, pitch and level spread).
- Levels: start dominant layers near −12 dB; check the sum with `render` and `analysis.peakDbfs`.

## Macros and mappings (≤6 macros)
Each macro has `value` and `defaultValue` (0-100), labels for both ends and help text. A mapping connects a macro to **one numeric parameter** by path:
`layers.<layerId>.<path>` (e.g. `layers.body.source.frequencyHz`, `layers.crack.filters.0.cutoffHz`, `layers.clang.source.modes.0.decaySeconds`) or `master.<path>` (`master.space.returnDb`) or a top-level key.
- `domain: "linear"` adds `amount` in the parameter's units (use for dB, seconds, 0-1 values).
- `domain: "log2"` multiplies by 2^delta, `amount` in octaves (use for Hz, `timeScale`).
- `polarity: -1` flips direction. `curve`: linear, easeIn, easeOut, smooth. Optional `min`/`max` clamp. Parameters named in `PARAM_BOUNDS` (`src/domain/mapping.ts`) are clamped to their declared domain automatically; others need explicit `min`/`max`.
- A macro at its `defaultValue` leaves the authored base value unchanged. Several mappings to one target must share a domain.
- Make macros change *character*, not just volume: pair level changes with frequency, decay (`timeScale`) or filter changes.

## Loops
- `mode: "loop"`; layers run for the whole cycle and ignore start/length/timeScale. Curve times are over `[0, durationSeconds]` and repeat each cycle: **end the curve at the same value it starts**.
- Prefer slow modulation; keep deliberate impacts away from the seam. Pick `loop.warmupSeconds` ≥ reverb decay.
- Tremolo/vibrato rates that give a whole number of cycles per loop line up perfectly; others rely on the seam crossfade.

## Checklist before adding a preset
1. It validates (`npm test` covers every factory preset: finite, audible, peak ≤ −1 dBFS, no warnings).
2. It differs audibly from existing presets in more than name.
3. `description`, `hint`, `tags` (use search synonyms: gun/weapon, door/hatch, engine/motor, radio/comms) are filled in.
4. Procedural electronics and stylised impacts only: do not call a preset "realistic" because it runs.
5. Listening review by the owner is recorded in `docs/STATUS.md` (not by tests).
