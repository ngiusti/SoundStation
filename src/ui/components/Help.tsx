import { Modal } from "./Modal";

const GLOSSARY: [string, string][] = [
  ["Layer", "One ingredient in the sound."], ["Attack", "How quickly the sound begins."], ["Decay", "How quickly it loses energy."],
  ["Brightness", "How much sharp, high-frequency detail you hear."], ["Resonance", "A ringing emphasis around certain frequencies."],
  ["Tail", "Sound that continues after the main action, such as echo."], ["Dry", "Without the shared room/reverb effect."],
  ["Mono", "One channel; often useful for an effect positioned in the game world."], ["Stereo", "Two channels; useful for a broad ambience or deliberately wide effect."],
  ["Seed", "A saved number that recreates the same random details."], ["Clipping", "Peaks exceeding the format's available level, potentially causing distortion."],
  ["Loop seam", "The point where the file's end joins its beginning."], ["Stem", "One exported layer or return, aligned so it can be combined with the others."],
];
const KEYS: [string, string][] = [
  ["Space", "Play / stop"], ["Esc", "Stop, or close the open panel"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["Ctrl+S / Ctrl+Shift+S", "Save project"],
  ["Ctrl+O", "Open project"], ["Ctrl+E", "Export"], ["Ctrl+F", "Search sounds"], ["Ctrl+Shift+P", "Action palette"],
  ["Double-click a value", "Type an exact number"], ["Shift + arrows on a slider", "Fine adjustment"],
];

export function Help({ onClose, onTour }: { onClose: () => void; onTour: () => void }) {
  return (
    <Modal title="Help" onClose={onClose} wide>
      <button className="btn" onClick={onTour}>Replay the 3-step introduction</button>
      <h3>Shortcuts</h3>
      <table className="report"><tbody>{KEYS.map(([k, v]) => <tr key={k}><th><kbd>{k}</kbd></th><td>{v}</td></tr>)}</tbody></table>
      <h3>Words used here</h3>
      <dl className="glossary">{GLOSSARY.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h3>After you export: game-engine checklist</h3>
      <ul>
        <li>Import the WAV into your engine. Exporting does not configure anything inside it.</li>
        <li>Set attenuation, spatialisation and concurrency on the engine-side sound asset (positional effects usually want mono).</li>
        <li>For loops, enable looping in the engine; the file is already an exact loop length.</li>
        <li>Set level in the engine mix. The export profiles do not normalise sounds to your game's loudness.</li>
        <li>The recipe file (.recipe.json) beside each WAV records the seed and settings so you can reproduce or tweak it later.</li>
      </ul>
      <h3>Honest limits</h3>
      <ul>
        <li>Everything here is synthesised on your machine, or built from recordings you import. There is no text-to-audio model.</li>
        <li>Electronic, mechanical and stylised sounds are the strong suit. Realistic footsteps, firearms and voices need good recordings.</li>
        <li>Material impacts are stylised resonances, not physical simulations.</li>
        <li>Peak readouts are sample peaks. LUFS and true-peak measurement are not in version 1.</li>
        <li>Numerical loop-seam checks cannot prove a loop sounds good: always listen across the seam.</li>
        <li>Nothing here has been validated by ear yet. Treat levels and balance as a starting point until you have listened.</li>
      </ul>
    </Modal>
  );
}

export function Tour({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Welcome to Void Haulers SFX Lab" onClose={onClose}>
      <ol className="tour">
        <li><strong>Choose.</strong> Pick a sound on the left, for example Doors, then Heavy bulkhead close. Nothing plays until you press Play.</li>
        <li><strong>Shape.</strong> Move the sliders: they are named for what you hear, like Weight and Wear. Press Play again, or turn on Auto Preview.</li>
        <li><strong>Export.</strong> Press Export, choose a profile, and save a game-ready WAV. A recipe file saved beside it recreates the sound exactly.</li>
      </ol>
      <p className="muted small">Keep your monitor level low at first: it is set in the bottom bar and only affects listening, never the exported file.</p>
      <button className="btn primary" onClick={onClose}>Got it</button>
    </Modal>
  );
}
