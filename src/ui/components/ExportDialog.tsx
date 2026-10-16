import { useState } from "react";
import type { ExportSettings, Recipe } from "../../domain/schema";
import { Modal } from "./Modal";
import { Slider } from "./Slider";
import type { OutputReport } from "../../export/output";

interface Props {
  recipe: Recipe;
  report: OutputReport | null;
  previewStale: boolean;
  onClose: () => void;
  onSettings: (patch: Partial<ExportSettings>) => void;
  onRestoreLayers: () => void;
  onRun: (o: { variant: number; sfxPrefix: boolean; sidecar: boolean }) => Promise<string[]>;
  folderName: string | null;
  canPickFolder: boolean;
  onPickFolder: () => void;
}

const PROFILES: { id: string; label: string; help: string; patch: Partial<ExportSettings>; loopOnly?: boolean }[] = [
  { id: "spatial", label: "Spatial one-shot", help: "Mono, 48 kHz, 24-bit. Dry by default. Good for positional effects.", patch: { channels: 1, sampleRate: 48000, encoding: "pcm24", tailMode: "include", peakPolicy: "attenuateOnly" } },
  { id: "interface", label: "Interface", help: "Mono, 48 kHz, 24-bit. Keeps your authored timing.", patch: { channels: 1, sampleRate: 48000, encoding: "pcm24", tailMode: "include", peakPolicy: "attenuateOnly" } },
  { id: "loop", label: "Ambience loop", help: "Stereo, 48 kHz, 24-bit, exact loop length, no tail.", patch: { channels: 2, sampleRate: 48000, encoding: "pcm24", peakPolicy: "attenuateOnly" }, loopOnly: true },
  { id: "master", label: "Editable master", help: "Stereo, 48 kHz, 32-bit float. Keeps level exactly as rendered.", patch: { channels: 2, sampleRate: 48000, encoding: "float32", peakPolicy: "none", dither: false } },
];

export function ExportDialog({ recipe, report, previewStale, onClose, onSettings, onRestoreLayers, onRun, folderName, canPickFolder, onPickFolder }: Props) {
  const s = recipe.exportDefaults;
  const loop = recipe.mode === "loop";
  const [variant, setVariant] = useState(1);
  const [sfx, setSfx] = useState(false);
  const [sidecar, setSidecar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const omitted = recipe.layers.filter((l) => l.mute || (recipe.layers.some((x) => x.solo) && !l.solo));
  const fileName = `${sfx ? "SFX_" : ""}VH_${recipe.fileCategory}_${recipe.fileName}_${String(variant).padStart(3, "0")}.wav`;

  return (
    <Modal title="Export WAV" onClose={onClose} wide>
      <div className="export-grid">
        <div>
          <h3>Profile</h3>
          <div className="profiles">
            {PROFILES.map((pr) => (
              <button key={pr.id} className="profile" disabled={pr.loopOnly && !loop} title={pr.loopOnly && !loop ? "Only for loop sounds" : pr.help} onClick={() => onSettings(pr.patch)}>
                <strong>{pr.label}</strong><span>{pr.help}</span>
              </button>
            ))}
          </div>
          <p className="muted small">These are convenient starting points, not Unreal requirements. Exporting a WAV does not set attenuation, spatialisation, concurrency or looping inside your game engine.</p>
          <h3>Format</h3>
          <div className="row wrap">
            <label className="field"><span>Channels</span><select value={s.channels} onChange={(e) => onSettings({ channels: Number(e.target.value) as 1 | 2 })}><option value={1}>Mono</option><option value={2}>Stereo</option></select></label>
            <label className="field"><span>Sample rate</span><select value={s.sampleRate} onChange={(e) => onSettings({ sampleRate: Number(e.target.value) as 44100 | 48000 })}><option value={48000}>48 kHz</option><option value={44100}>44.1 kHz</option></select></label>
            <label className="field"><span>Encoding</span><select value={s.encoding} onChange={(e) => onSettings({ encoding: e.target.value as ExportSettings["encoding"] })}><option value="pcm24">PCM 24-bit</option><option value="pcm16">PCM 16-bit</option><option value="float32">Float 32-bit</option></select></label>
            {!loop && <label className="field"><span>Timing</span><select value={s.tailMode} onChange={(e) => onSettings({ tailMode: e.target.value as "include" | "fixed" })}><option value="include">Include tail</option><option value="fixed">Fixed length</option></select></label>}
          </div>
          {!loop && s.tailMode === "include" && <Slider label="Longest tail allowed" min={0} max={30} step={0.5} unit="s" decimals={1} value={s.tailMaxSeconds} onCommit={(v) => onSettings({ tailMaxSeconds: v })} help="Echo or reverb beyond this is cut off, and you are warned." />}
          <h3>Level</h3>
          <label className="field"><span>Peak handling</span>
            <select value={s.peakPolicy} onChange={(e) => onSettings({ peakPolicy: e.target.value as ExportSettings["peakPolicy"] })}>
              <option value="attenuateOnly">Attenuate only if needed (recommended)</option>
              <option value="normalize">Normalise peak to a target</option>
              <option value="none">Leave level as rendered</option>
            </select></label>
          {s.peakPolicy === "attenuateOnly" && <Slider label="Peak ceiling" min={-12} max={0} step={0.5} unit="dBFS" decimals={1} value={s.samplePeakCeilingDbfs} onCommit={(v) => onSettings({ samplePeakCeilingDbfs: v })} help="Sample peak, not true-peak. Quiet sounds are never raised." />}
          {s.peakPolicy === "normalize" && <Slider label="Normalise to" min={-24} max={0} step={0.5} unit="dBFS" decimals={1} value={s.normalizeTargetDbfs} onCommit={(v) => onSettings({ normalizeTargetDbfs: v })} />}
          <Slider label="Export gain" min={-24} max={24} step={0.5} unit="dB" decimals={1} value={s.exportGainDb} onCommit={(v) => onSettings({ exportGainDb: v })} help="Applied to the file only. Separate from your monitor level." />
          {s.encoding !== "float32" && <label className="check"><input type="checkbox" checked={s.dither} onChange={(e) => onSettings({ dither: e.target.checked })} />Dither when converting to {s.encoding === "pcm16" ? "16" : "24"}-bit (TPDF, repeatable)</label>}
        </div>
        <div>
          <h3>Result preview</h3>
          {report ? (
            <table className="report">
              <tbody>
                <tr><th>Peak before gain handling</th><td>{report.prePeakDbfs.toFixed(1)} dBFS</td></tr>
                <tr><th>Gain applied</th><td>{report.appliedGainDb.toFixed(1)} dB</td></tr>
                <tr><th>Peak in the file</th><td>{report.postPeakDbfs.toFixed(1)} dBFS</td></tr>
              </tbody>
            </table>
          ) : <p className="muted">Press Play once so there is something to measure.</p>}
          {previewStale && <p className="warn small">The preview is from an earlier edit. The export always renders your latest state.</p>}
          {report?.warnings.map((w) => <p key={w} className="warn small">{w}</p>)}
          {omitted.length > 0 && (
            <div className="banner warn-box">
              <strong>{omitted.length} layer{omitted.length > 1 ? "s are" : " is"} muted or excluded by solo:</strong> {omitted.map((l) => l.name).join(", ")}.
              <div className="row"><span className="muted small">“Export as heard” leaves them out.</span><button className="btn small" onClick={onRestoreLayers}>Restore all layers</button></div>
            </div>
          )}
          <h3>File</h3>
          <div className="row wrap">
            <label className="field"><span>Variant number</span><input type="number" min={1} max={999} value={variant} onChange={(e) => setVariant(Math.min(999, Math.max(1, Math.round(Number(e.target.value) || 1))))} /></label>
            <label className="check"><input type="checkbox" checked={sfx} onChange={(e) => setSfx(e.target.checked)} />Add “SFX_” prefix</label>
            <label className="check"><input type="checkbox" checked={sidecar} onChange={(e) => setSidecar(e.target.checked)} />Also save recipe file</label>
          </div>
          <p className="filename" aria-live="polite">{fileName}</p>
          <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setResults(null); try { setResults(await onRun({ variant, sfxPrefix: sfx, sidecar })); } catch (e) { setResults([(e as Error).message]); } finally { setBusy(false); } }}>
            {busy ? "Rendering…" : omitted.length ? "Export as heard" : "Export"}
          </button>
          {results && <ul className="results" aria-live="polite">{results.map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="row wrap">
            <span className="muted small">{folderName ? `Saving into the folder “${folderName}”. Existing files are never overwritten; a number is added instead.` : canPickFolder ? "No folder chosen: files go to your browser's Downloads folder." : "Your browser saves files to its Downloads folder."}</span>
            {canPickFolder && <button className="btn small" onClick={onPickFolder}>{folderName ? "Change folder" : "Choose folder"}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
