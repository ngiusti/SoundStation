# User guide

## The idea
**Choose a sound → shape it → listen and compare → export.** Nothing plays until you press Play.

## Screen
- **Left:** search, library tabs (Factory, My presets, Favorites, Recent), category chips. Star a sound to favourite it.
- **Centre, top:** the sound's description, a "Try changing…" hint, its length, and up to six main controls (macros).
- **Centre, middle:** the rendered waveform. Drag the yellow handles (or focus one and use arrow keys; Shift for fine steps) to crop what exports. Dashed lines mark full scale; "tail" marks where echo or reverb begins.
- **Bottom bar:** Play/Stop, Repeat, Mono check, Auto preview, Monitor level and meter, peak/RMS of the current render, status, Save Preset, Export.
- **Advanced view** adds the layer timeline, a per-layer inspector, and a table showing what each main control changes.

## Shaping
- **Main controls** are named for what you hear. Each has a reset arrow when it differs from the preset. Double-click a value to type one.
- **One drag = one undo step.** Undo and Redo are in the top bar (Ctrl+Z, Ctrl+Shift+Z). 100 steps are kept.
- **Status** tells you whether what you hear is the latest edit. "Preview is from an earlier edit" means press Play to render again (or turn on Auto preview).
- **Base vs "now":** editing a layer in the inspector changes its base value; if a main control also drives that value you see "now …(macro-driven)". **Bake controls into values** resolves the controls into the layers and removes the connections (one undo step).
- **Mute / Solo** are saved in the sound and applied to exports. The Export window warns when layers are left out and offers **Restore all layers**.
- **Monitor level** only changes how loud you hear it. It never changes a file. Start low.
- **Mono check** sums the stereo result to mono for listening only.

## Layers (Advanced)
Add a tone, noise, impact, repeating events, or a **WAV recording** (button or drag a WAV onto the page). Up to eight layers. Drag a bar to move its start; drag its right edge to change its length. In the inspector edit the source, volume/pitch envelope (drag points, double-click to add or remove, or edit as numbers), filters and effects.

Recordings: WAV only (16/24-bit PCM or 32-bit float, mono/stereo, up to 60 s). Your file is never changed; trims, reverse and speed are saved in the recipe. Changing speed changes pitch **and** length. Samples are held in the browser while the app is open; **Save** embeds them in the project file.

## Loops
Loop sounds (e.g. Abandoned corridor) render exactly the loop length with a seam crossfade. The panel under the waveform shows the seam numbers. They cannot prove a good loop: press **Listen across seam**, which plays the end joined to the start four times.

## Saving
- **Save / Open** use a single `.vhsfx.json` file with any imported samples embedded. **Open** also accepts a bare recipe or an exported `.recipe.json` (for example one Claude edited).
- **Save Preset** stores a copy in *My presets* in this browser. Factory presets are never changed.

## Exporting
Press **Export** (Ctrl+E). Choose a profile or set channels, sample rate, encoding and timing. Default peak handling only turns a sound **down** if it would pass −1 dBFS (sample peak, not true-peak). Chrome/Edge: **Choose folder** once and files go there without overwriting (a number is added if the name exists). Other browsers save to Downloads. A `.recipe.json` is saved beside each WAV by default: it records the seed and every setting so the sound can be recreated.

File names follow `VH_{Category}_{Name}_{NNN}.wav`; tick "Add SFX_ prefix" if your project uses one.

## Shortcuts
Space play/stop · Esc stop/close · Ctrl+Z / Ctrl+Shift+Z · Ctrl+S save · Ctrl+O open · Ctrl+E export · Ctrl+F search · Ctrl+Shift+P action palette (try "make mono", "show layers", "export").

## Limits
Up to 8 layers, 120 s output, 60 s per imported recording, 512 MiB audio working memory per render. Peaks are sample peaks; LUFS and true-peak are not provided. Nothing has been checked by ear: set levels by listening.
