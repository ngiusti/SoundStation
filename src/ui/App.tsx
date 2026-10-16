import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FACTORY_PRESETS } from "../presets";
import { parseRecipeOrThrow, validateRecipe } from "../domain/recipe";
import { applyMappings, bakeMappings } from "../domain/mapping";
import { ENGINE_VERSION, SCHEMA_VERSION, type ExportSettings, type Layer, type Recipe } from "../domain/schema";
import { cloneRecipe } from "../domain/clone";
import { sha256Hex } from "../domain/hash";
import { cropAndFade, type RenderOutput } from "../audio/render";
import { analyze, type Analysis } from "../audio/analysis";
import { encodeOutput, processOutput, type OutputReport } from "../export/output";
import { sidecarFor } from "../export/sidecar";
import { RenderClient, Superseded, type RenderDone } from "./engineClient";
import { player, seamBuffer } from "./player";
import { initialState, isDirty, newLayer, reducer, type AppState } from "./state";
import { ImportError, getAsset, getAssetBytes, importWav, restoreAsset } from "./assets";
import { canPickFolder, currentFolderName, exportTarget, loadJson, loadUserPresets, pickExportFolder, safeGet, safeSet, saveFile, saveJson, saveUserPresets } from "./storage";
import { Slider } from "./components/Slider";
import { Waveform } from "./components/Waveform";
import { Timeline } from "./components/Timeline";
import { Inspector } from "./components/Inspector";
import { Browser, type Filter } from "./components/Browser";
import { ExportDialog } from "./components/ExportDialog";
import { Help, Tour } from "./components/Help";
import { Palette, type PaletteAction } from "./components/Palette";
import { Modal } from "./components/Modal";

interface Preview {
  rev: number;
  processed: { channels: Float32Array[]; sampleRate: number };
  display: Float32Array;
  report: OutputReport;
  analysis: Analysis;
  warnings: string[];
  bodyFrames: number;
  loop: boolean;
  ms: number;
}

function blankRecipe(): Recipe {
  return parseRecipeOrThrow({
    schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION, id: "new-sound", name: "New sound", family: "custom",
    description: "A blank sound: one tone layer to build from.", seed: 1, durationSeconds: 0.5,
    layers: [newLayer("oscillator", [], undefined, 0.4)],
  });
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as AppState, () => initialState(cloneRecipe(FACTORY_PRESETS[0]), FACTORY_PRESETS[0].id));
  const { recipe } = state;
  const stateRef = useRef(state); stateRef.current = state;

  // ---- library state
  const [userPresets, setUserPresets] = useState<Recipe[]>(() => loadUserPresets());
  const [favorites, setFavorites] = useState<string[]>(() => loadJson<string[]>("favorites", []));
  const [recent, setRecent] = useState<string[]>(() => loadJson<string[]>("recent", []));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("factory");
  const [family, setFamily] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- rendering
  const previewClient = useRef<RenderClient | null>(null);
  const exportClient = useRef<RenderClient | null>(null);
  if (!previewClient.current && typeof Worker !== "undefined") { previewClient.current = new RenderClient(false); exportClient.current = new RenderClient(true); }
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const inflight = useRef<{ rev: number; p: Promise<Preview> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [autoPreview, setAutoPreview] = useState(false);
  const [loopAudition, setLoopAudition] = useState(false);
  const [monoCheck, setMonoCheck] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [monitorDb, setMonitorDb] = useState(player.monitorDb);

  // ---- dialogs
  const [dialog, setDialog] = useState<null | "export" | "help" | "tour" | "palette" | "savePreset">(() => (safeGet("tourDone") ? null : "tour"));
  const [pending, setPending] = useState<null | { run: () => void }>(null);
  const [presetName, setPresetName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(currentFolderName());
  const fileInput = useRef<HTMLInputElement>(null);
  const sampleInput = useRef<HTMLInputElement>(null);
  const suppressAuto = useRef(true);

  const say = useCallback((t: string) => { setToast(t); window.setTimeout(() => setToast((c) => (c === t ? null : c)), 6000); }, []);
  useEffect(() => { if (state.notice) say(state.notice); }, [state.notice, say]);

  // Hand decoded samples to the workers.
  useEffect(() => {
    for (const a of recipe.assets) {
      const d = getAsset(a.hash);
      if (d) { previewClient.current?.provideAsset(a.hash, d.sampleRate, d.channels); exportClient.current?.provideAsset(a.hash, d.sampleRate, d.channels); }
    }
  }, [recipe.assets]);

  const ensurePreview = useCallback((): Promise<Preview> => {
    const rev = stateRef.current.revision;
    if (previewRef.current?.rev === rev) return Promise.resolve(previewRef.current);
    if (inflight.current?.rev === rev) return inflight.current.p;
    const rec = stateRef.current.recipe;
    const client = previewClient.current;
    if (!client) return Promise.reject(new Error("This browser cannot run the audio engine (no Web Workers)."));
    setBusy(true); setRenderError(null);
    const p = (async (): Promise<Preview> => {
      let done: RenderDone;
      try {
        done = await client.render(rec, { sampleRate: rec.exportDefaults.sampleRate });
      } catch (e) {
        if (e instanceof Superseded) return ensurePreview();
        const msg = (e as Error).message;
        setRenderError(msg); setBusy(false);
        throw e;
      }
      if (stateRef.current.revision !== rev) return ensurePreview(); // edited while rendering: the result is stale
      let [L, R] = done.channels;
      if (!done.loop) [L, R] = cropAndFade(L, R, done.sampleRate, rec.master);
      const fake = { channels: [L, R], sampleRate: done.sampleRate, frames: L.length, warnings: done.warnings, loop: done.loop, bodyFrames: done.bodyFrames, tailTruncated: done.tailTruncated, effective: rec } as RenderOutput;
      const processed = processOutput(fake, rec.exportDefaults);
      const analysis = analyze(processed.channels, done.sampleRate, { loop: done.loop });
      const display = new Float32Array(done.channels[0].length);
      for (let i = 0; i < display.length; i++) display[i] = 0.5 * (done.channels[0][i] + done.channels[1][i]);
      const pv: Preview = { rev, processed: { channels: processed.channels, sampleRate: done.sampleRate }, display, report: processed.report, analysis, warnings: [...done.warnings, ...processed.report.warnings], bodyFrames: done.bodyFrames, loop: done.loop, ms: done.ms };
      previewRef.current = pv; setPreview(pv); setBusy(false);
      return pv;
    })();
    inflight.current = { rev, p };
    p.finally(() => { if (inflight.current?.p === p) inflight.current = null; }).catch(() => undefined);
    return p;
  }, []);

  const stop = useCallback(() => player.stop(), []);
  useEffect(() => player.subscribe(() => setPlaying(player.playing)), []);

  const play = useCallback(async (opts?: { seam?: boolean }) => {
    if (player.playing && !opts?.seam) { player.stop(); return; }
    try {
      const pv = await ensurePreview();
      const ch = opts?.seam ? seamBuffer(pv.processed.channels, pv.processed.sampleRate, 4) : pv.processed.channels;
      player.play(ch, pv.processed.sampleRate, { loop: opts?.seam ? false : loopAudition, monoCheck });
    } catch { /* error already surfaced in the status area */ }
  }, [ensurePreview, loopAudition, monoCheck]);

  // Optional auto preview: re-render and play shortly after the user stops editing.
  useEffect(() => {
    if (suppressAuto.current) { suppressAuto.current = false; return; }
    if (!autoPreview) return;
    const t = window.setTimeout(() => { void play(); }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.revision, autoPreview]);

  // ---- editing helpers
  const edit = useCallback((fn: (d: Recipe) => void) => dispatch({ type: "edit", fn }), []);
  const editLayer = useCallback((id: string, fn: (l: Layer) => void) => dispatch({ type: "edit", fn: (d) => { const l = d.layers.find((x) => x.id === id); if (l) fn(l); } }), []);
  const setExport = useCallback((patch: Partial<ExportSettings>) => edit((d) => { Object.assign(d.exportDefaults, patch); }), [edit]);

  const { effective, table } = useMemo(() => { try { return applyMappings(recipe); } catch { return { effective: recipe, table: [] }; } }, [recipe]);
  const dirty = isDirty(state);

  const requestLoad = useCallback((run: () => void) => { if (isDirty(stateRef.current)) setPending({ run }); else run(); }, []);
  const loadRecipe = useCallback((r: Recipe, presetId: string | null) => {
    stop(); suppressAuto.current = true;
    dispatch({ type: "load", recipe: cloneRecipe(r), presetId });
    if (presetId) setRecent((cur) => { const n = [presetId, ...cur.filter((x) => x !== presetId)].slice(0, 12); saveJson("recent", n); return n; });
  }, [stop]);

  const projectJson = useCallback(() => {
    const r = stateRef.current.recipe;
    const assets = r.assets.map((a) => { const b = getAssetBytes(a.hash); return b ? { hash: a.hash, dataBase64: toBase64(b) } : null; });
    if (assets.some((a) => a === null)) throw new Error("A sample used by this sound is missing from memory, so the project cannot be saved completely.");
    return JSON.stringify({ format: "vhsfx-project", version: 1, engineVersion: ENGINE_VERSION, recipe: r, assets }, null, 1);
  }, []);
  const saveProject = useCallback(async () => {
    try {
      const name = await saveFile(`${stateRef.current.recipe.fileName}.vhsfx.json`, projectJson(), "application/json");
      dispatch({ type: "markClean" }); say(`Saved ${name}`);
      return true;
    } catch (e) { if ((e as DOMException).name !== "AbortError") say((e as Error).message); return false; }
  }, [projectJson, say]);

  const openProjectFile = useCallback(async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const isProject = raw?.format === "vhsfx-project";
      if (isProject && typeof raw.version === "number" && raw.version > 1) throw new Error("This project was saved by a newer version of the app. Nothing was changed.");
      // Also accepts a bare recipe or an export sidecar (.recipe.json), e.g. one edited by Claude.
      const candidate = isProject ? raw.recipe : raw?.tool === "vh-sfx-lab" && raw.recipe ? raw.recipe : raw;
      const v = validateRecipe(candidate);
      if (!v.ok || !v.recipe) throw new Error("That file is not a valid sound: " + v.errors[0]);
      const missing: string[] = [];
      for (const a of v.recipe.assets) {
        const entry = isProject ? (raw.assets as { hash: string; dataBase64: string }[] | undefined)?.find((x) => x.hash === a.hash) : undefined;
        if (entry) restoreAsset(a.hash, fromBase64(entry.dataBase64));
        else if (!getAsset(a.hash)) missing.push(a.originalName);
      }
      if (missing.length) throw new Error(`These samples are missing: ${missing.join(", ")}. Open the project (.vhsfx.json) that contains them. Nothing was opened, and no other sample was substituted.`);
      requestLoad(() => { loadRecipe(v.recipe!, null); say(`Opened ${file.name}`); });
    } catch (e) { say(e instanceof SyntaxError ? "That file is not valid JSON." : (e as Error).message); }
  }, [loadRecipe, requestLoad, say]);

  const addSampleLayer = useCallback(async (file: File) => {
    try {
      const { ref } = await importWav(file);
      let assetId = "sample1", n = 1;
      const cur = stateRef.current.recipe;
      const existing = cur.assets.find((a) => a.hash === ref.hash);
      while (!existing && cur.assets.some((a) => a.id === assetId)) assetId = `sample${++n}`;
      const useId = existing?.id ?? assetId;
      const dur = Math.min(10, ref.frames / ref.sampleRate);
      edit((d) => {
        if (!existing) d.assets.push({ id: useId, ...ref });
        if (d.layers.length >= 8) throw new Error("A sound can have at most 8 layers.");
        const l = newLayer("sample", d.layers, useId, dur);
        d.layers.push(l);
      });
      say(`Added ${file.name}. Your original file is untouched.`);
    } catch (e) { say(e instanceof ImportError ? e.message : (e as Error).message); }
  }, [edit, say]);

  const addLayer = (kind: Parameters<typeof newLayer>[0]) => {
    if (recipe.layers.length >= 8) { say("A sound can have at most 8 layers."); return; }
    const l = newLayer(kind, recipe.layers, undefined, recipe.mode === "loop" ? recipe.durationSeconds : Math.max(0.2, recipe.durationSeconds * 0.6));
    edit((d) => { d.layers.push(l); });
    dispatch({ type: "select", layerId: l.id });
  };
  const removeLayer = (id: string) => {
    if (recipe.layers.length <= 1) return;
    edit((d) => { d.layers = d.layers.filter((l) => l.id !== id); d.mappings = d.mappings.filter((m) => !m.target.startsWith(`layers.${id}.`)); });
  };

  const setLength = (v: number) => edit((d) => {
    if (d.mode === "loop" && v !== d.durationSeconds) {
      const k = v / d.durationSeconds;
      for (const l of d.layers) {
        l.durationSeconds = v;
        l.amplitudeCurve = l.amplitudeCurve.map(([t, x]) => [t * k, x]);
        if (l.pitchCurveSemitones) l.pitchCurveSemitones = l.pitchCurveSemitones.map(([t, x]) => [t * k, x]);
        for (const f of l.filters) if (f.cutoffCurveOctaves) f.cutoffCurveOctaves = f.cutoffCurveOctaves.map(([t, x]) => [t * k, x]);
      }
    }
    d.durationSeconds = v;
  });

  // ---- export
  const runExport = useCallback(async (o: { variant: number; sfxPrefix: boolean; sidecar: boolean }): Promise<string[]> => {
    const rec = cloneRecipe(stateRef.current.recipe);
    const s = rec.exportDefaults;
    const client = exportClient.current;
    if (!client) throw new Error("This browser cannot run the audio engine.");
    const done = await client.render(rec, { sampleRate: s.sampleRate, tailMode: s.tailMode, tailMaxSeconds: s.tailMaxSeconds });
    let [L, R] = done.channels;
    if (!done.loop) [L, R] = cropAndFade(L, R, done.sampleRate, rec.master);
    const fake = { channels: [L, R], sampleRate: done.sampleRate, frames: L.length, warnings: done.warnings, loop: done.loop, bodyFrames: done.bodyFrames, tailTruncated: done.tailTruncated, effective: rec } as RenderOutput;
    const processed = processOutput(fake, s);
    const bytes = encodeOutput(processed, s, rec.seed);
    const target = exportTarget();
    const name = `${o.sfxPrefix ? "SFX_" : ""}VH_${rec.fileCategory}_${rec.fileName}_${String(o.variant).padStart(3, "0")}.wav`;
    const written = await target.write(name, bytes as unknown as BlobPart, "audio/wav");
    const out = [`Saved ${written}: ${(L.length / done.sampleRate).toFixed(3)} s, peak ${processed.report.postPeakDbfs.toFixed(1)} dBFS, gain ${processed.report.appliedGainDb.toFixed(1)} dB${target.folder ? ` in “${target.folder}”` : " (Downloads)"}`];
    if (o.sidecar) {
      const sc = sidecarFor(rec, s, { frames: L.length, audioSha256: sha256Hex(bytes), output: processed.report, loop: done.loop, warnings: [...done.warnings, ...processed.report.warnings] });
      out.push(`Saved ${await target.write(written.replace(/\.wav$/i, "") + ".recipe.json", JSON.stringify(sc, null, 2), "application/json")}`);
    }
    for (const w of [...done.warnings, ...processed.report.warnings]) out.push("Note: " + w);
    return out;
  }, []);

  const savePreset = () => {
    const name = presetName.trim().slice(0, 80);
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "preset";
    let id = `user-${slug}`, n = 2;
    while (userPresets.some((p) => p.id === id)) id = `user-${slug}-${n++}`;
    const r = cloneRecipe(stateRef.current.recipe);
    r.id = id; r.name = name; r.family = r.family || "custom";
    const list = [...userPresets, r];
    setUserPresets(list); saveUserPresets(list);
    setDialog(null); setPresetName(""); say(`Saved “${name}” to My presets`);
    setFilter("user");
  };

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range" && (t as HTMLInputElement).type !== "checkbox");
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") { if (player.playing) player.stop(); return; }
      if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); }
      else if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); dispatch({ type: "redo" }); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveProject(); }
      else if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); fileInput.current?.click(); }
      else if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); setDialog("export"); }
      else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); searchRef.current?.focus(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); setDialog("palette"); }
      else if (e.key === " " && !typing && t.tagName !== "BUTTON" && !dialogOpen.current) { e.preventDefault(); void play(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, saveProject]);
  const dialogOpen = useRef(false); dialogOpen.current = dialog !== null || pending !== null;

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => { if (isDirty(stateRef.current)) { e.preventDefault(); } };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  // ---- meters
  const meter = useRef<HTMLDivElement>(null);
  const meterPeak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, hold = 0;
    const tick = () => {
      const { peak, rms } = player.level();
      hold = Math.max(peak, hold * 0.95);
      const pct = (x: number) => `${Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(x, 1e-5)) + 60) / 60) * 100))}%`;
      if (meter.current) meter.current.style.width = pct(rms);
      if (meterPeak.current) { meterPeak.current.style.left = pct(hold); meterPeak.current.className = "meter-peak" + (hold > 0.98 ? " hot" : ""); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- derived UI status
  const stale = preview !== null && preview.rev !== state.revision;
  const status = busy ? "Rendering…" : renderError ? "Render failed" : !preview ? "Not rendered yet" : stale ? "Preview is from an earlier edit" : `Ready · rendered in ${Math.round(preview.ms)} ms`;
  const selected = recipe.layers.find((l) => l.id === state.selectedLayerId) ?? recipe.layers[0];
  const anyExcluded = recipe.layers.some((l) => l.mute) || recipe.layers.some((l) => l.solo);
  const soloed = recipe.layers.filter((l) => l.solo);
  const advanced = state.view === "advanced";
  const totalSeconds = preview ? preview.display.length / preview.processed.sampleRate : Math.max(recipe.durationSeconds, ...recipe.layers.map((l) => l.startSeconds + l.durationSeconds * l.timeScale));

  const macroLabel = (id: string) => recipe.macros.find((m) => m.id === id)?.label ?? id;
  const layerName = (id: string) => recipe.layers.find((l) => l.id === id)?.name ?? id;
  const friendlyTarget = (t: string) => { const p = t.split("."); return p[0] === "layers" ? `${layerName(p[1])} › ${p.slice(2).join(" › ")}` : p.join(" › "); };

  const actions: PaletteAction[] = [
    { id: "play", label: "Play / stop", keywords: "preview listen audition", run: () => void play() },
    { id: "export", label: "Export WAV…", keywords: "save file wav render selected", run: () => setDialog("export") },
    { id: "mono", label: playing || monoCheck ? "Toggle mono check" : "Mono check on/off", keywords: "make mono sum check", run: () => setMonoCheck((m) => !m) },
    { id: "layers", label: "Show layers (Advanced view)", keywords: "advanced inspector timeline", run: () => dispatch({ type: "view", view: "advanced" }) },
    { id: "simple", label: "Simple view", keywords: "hide layers basic", run: () => dispatch({ type: "view", view: "simple" }) },
    { id: "undo", label: "Undo", keywords: "revert back", run: () => dispatch({ type: "undo" }) },
    { id: "redo", label: "Redo", keywords: "forward", run: () => dispatch({ type: "redo" }) },
    { id: "save", label: "Save project", keywords: "write file", run: () => void saveProject() },
    { id: "open", label: "Open project…", keywords: "load file", run: () => fileInput.current?.click() },
    { id: "preset", label: "Save as user preset…", keywords: "library favourite my presets", run: () => setDialog("savePreset") },
    { id: "bake", label: "Bake controls into values", keywords: "macros mappings resolve", run: () => edit((d) => { Object.assign(d, bakeMappings(d)); }), enabled: recipe.mappings.length > 0 },
    { id: "help", label: "Help and glossary", keywords: "shortcuts unreal checklist", run: () => setDialog("help") },
    { id: "restore", label: "Restore all layers (unmute, unsolo)", keywords: "mute solo", run: () => edit((d) => { for (const l of d.layers) { l.mute = false; l.solo = false; } }), enabled: anyExcluded },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <h1 title="Void Haulers SFX Lab">VH <span>SFX Lab</span></h1>
        <div className="doc-title" aria-live="polite">{recipe.name}{dirty && <span className="dirty" title="Unsaved changes" aria-label="Unsaved changes"> ●</span>}</div>
        <div className="row">
          <button className="btn" onClick={() => requestLoad(() => loadRecipe(blankRecipe(), null))}>New</button>
          <button className="btn" onClick={() => fileInput.current?.click()}>Open</button>
          <button className="btn" onClick={() => void saveProject()}>Save</button>
          <span className="sep" />
          <button className="btn" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })} title="Undo (Ctrl+Z)">Undo</button>
          <button className="btn" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <span className="sep" />
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={!advanced} className={!advanced ? "on" : ""} onClick={() => dispatch({ type: "view", view: "simple" })}>Simple</button>
            <button aria-pressed={advanced} className={advanced ? "on" : ""} onClick={() => dispatch({ type: "view", view: "advanced" })}>Advanced</button>
          </div>
          <button className="btn" onClick={() => setDialog("palette")} title="Action palette (Ctrl+Shift+P)">Actions</button>
          <button className="btn" onClick={() => setDialog("help")}>Help</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openProjectFile(f); e.target.value = ""; }} />
        <input ref={sampleInput} type="file" accept=".wav,audio/wav,audio/x-wav" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addSampleLayer(f); e.target.value = ""; }} />
      </header>

      <div className={"main" + (advanced ? " with-inspector" : "")}>
        <Browser factory={FACTORY_PRESETS} user={userPresets} favorites={favorites} recent={recent} query={query} filter={filter} family={family} currentId={state.presetId}
          onQuery={setQuery} onFilter={setFilter} onFamily={setFamily} searchRef={searchRef}
          onPick={(r) => requestLoad(() => loadRecipe(r, r.id))}
          onFavorite={(id) => setFavorites((f) => { const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]; saveJson("favorites", n); return n; })}
          onDeleteUser={(id) => { const gone = userPresets.find((p) => p.id === id); const n = userPresets.filter((p) => p.id !== id); setUserPresets(n); saveUserPresets(n); if (gone) say(`Deleted “${gone.name}”.`); }} />

        <main className="center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /\.wav$/i.test(f.name)) void addSampleLayer(f); else if (f) say("Drop a WAV file to add it as a layer."); }}>
          <section className="sound-head">
            <div>
              <h2>{recipe.name} <span className="badge">{recipe.mode === "loop" ? "Loop" : "One-shot"}</span></h2>
              <p>{recipe.description}</p>
              {recipe.hint && <p className="hint"><strong>Try changing…</strong> {recipe.hint}</p>}
            </div>
            <div className="length">
              <Slider label={recipe.mode === "loop" ? "Loop length" : "Length"} min={0.05} max={120} log unit="s" decimals={2} value={recipe.durationSeconds} onCommit={setLength}
                help={recipe.mode === "loop" ? "Exact loop length. The exported file has exactly this many frames." : "Intended length. Echo and reverb tails are added after it when Include tail is on."} />
            </div>
          </section>

          <section className="macros" aria-label="Main controls">
            {recipe.macros.length === 0 && <p className="muted">This sound has no macro controls. Switch to Advanced to edit its layers.</p>}
            {recipe.macros.map((m) => (
              <div key={m.id} className="macro">
                <Slider label={m.label} min={0} max={100} step={1} value={m.value} defaultValue={m.defaultValue} lowLabel={m.lowLabel} highLabel={m.highLabel} help={m.help}
                  onCommit={(v) => edit((d) => { const x = d.macros.find((q) => q.id === m.id); if (x) x.value = v; })} />
                {advanced && <label className="check small"><input type="checkbox" checked={m.locked} onChange={(e) => edit((d) => { const x = d.macros.find((q) => q.id === m.id); if (x) x.locked = e.target.checked; })} />Hold when making variations</label>}
              </div>
            ))}
          </section>

          <section className="wave-panel">
            <Waveform samples={preview?.display ?? null} sampleRate={preview?.processed.sampleRate ?? 48000} gain={preview ? Math.pow(10, preview.report.appliedGainDb / 20) : 1}
              cropStart={recipe.master.crop.startSeconds} cropEnd={recipe.master.crop.endSeconds} loop={recipe.mode === "loop"} bodyFrames={preview?.bodyFrames ?? 0} stale={stale}
              onCrop={(a, b) => edit((d) => { d.master.crop = { startSeconds: Math.round(a * 1000) / 1000, endSeconds: b === null ? null : Math.round(b * 1000) / 1000 }; })} />
            <div className="wave-controls">
              <span className="muted small">{recipe.mode === "oneShot" ? "Exports the unshaded part between the two handles (crop)." : "Loops export exactly the loop length; edge fades are not used."}</span>
              {recipe.mode === "oneShot" && advanced && (
                <>
                  <Slider label="Fade in" min={0} max={2000} step={1} unit="ms" value={recipe.master.fadeInMs} onCommit={(v) => edit((d) => { d.master.fadeInMs = v; })} />
                  <Slider label="Fade out" min={0} max={5000} step={1} unit="ms" value={recipe.master.fadeOutMs} onCommit={(v) => edit((d) => { d.master.fadeOutMs = v; })} />
                  <button className="btn small" disabled={recipe.master.crop.startSeconds === 0 && recipe.master.crop.endSeconds === null} onClick={() => edit((d) => { d.master.crop = { startSeconds: 0, endSeconds: null }; })}>Reset crop</button>
                </>
              )}
            </div>
            {preview && preview.warnings.map((w) => <p key={w} className="warn small">{w}</p>)}
            {preview?.analysis.notes.map((w) => <p key={w} className="warn small">{w}</p>)}
            {preview?.analysis.seam && (
              <p className={"small " + (preview.analysis.seam.warning ? "warn" : "muted")}>
                Loop seam: jump {preview.analysis.seam.boundaryJump} ({preview.analysis.seam.jumpRatio}× a typical sample step), level difference {preview.analysis.seam.windowLevelDiffDb} dB between the last and first 50 ms. {preview.analysis.seam.warning ?? "No abrupt step found, but numbers cannot prove a good loop. Use “Listen across seam”."}
              </p>
            )}
            {soloed.length > 0 && <p className="small solo-note">Solo is on for: {soloed.map((l) => l.name).join(", ")}. Exports are made as heard.</p>}
          </section>

          {advanced && (
            <section className="layers-panel">
              <div className="panel-head">
                <h3>Layers</h3>
                <div className="row wrap">
                  <button className="btn small" onClick={() => addLayer("oscillator")}>+ Tone</button>
                  <button className="btn small" onClick={() => addLayer("noise")}>+ Noise</button>
                  <button className="btn small" onClick={() => addLayer("resonantImpact")}>+ Impact</button>
                  <button className="btn small" onClick={() => addLayer("eventSequence")}>+ Repeating events</button>
                  <button className="btn small" onClick={() => sampleInput.current?.click()} title="Add a WAV recording (or drop one here)">+ Recording (WAV)</button>
                </div>
              </div>
              <Timeline layers={recipe.layers} selectedId={selected?.id ?? null} totalSeconds={Math.max(totalSeconds, 0.05)} loop={recipe.mode === "loop"} onSelect={(id) => dispatch({ type: "select", layerId: id })} onEdit={editLayer} />
              {recipe.mappings.length > 0 && (
                <details open className="mappings">
                  <summary>What the main controls change ({recipe.mappings.length})</summary>
                  <table className="report">
                    <thead><tr><th>Control</th><th>Changes</th><th>Amount</th><th>Base → now</th></tr></thead>
                    <tbody>
                      {recipe.mappings.map((m) => {
                        const row = table.find((t) => t.target === m.target);
                        return (
                          <tr key={m.id}>
                            <td>{macroLabel(m.source)}</td><td>{friendlyTarget(m.target)}</td>
                            <td>{m.amount * m.polarity > 0 ? "+" : "−"}{Math.abs(m.amount)} {m.domain === "log2" ? "oct" : ""}{m.curve !== "linear" ? ` (${m.curve})` : ""}</td>
                            <td>{row ? `${+row.base.toFixed(3)} → ${+row.effective.toFixed(3)}` : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="muted small">Moving a main control never changes a layer's base value. Editing a layer in the inspector keeps the macro connection.</p>
                  <button className="btn small" onClick={() => edit((d) => { Object.assign(d, bakeMappings(d)); })} title="Resolve current macro positions into the layer values and remove the connections (one undo step)">Bake controls into values</button>
                </details>
              )}
            </section>
          )}
        </main>

        {advanced && selected && (
          <aside className="right" aria-label="Layer inspector">
            <Inspector layer={selected} effective={effective.layers.find((l) => l.id === selected.id)} recipe={recipe}
              onEdit={(fn) => editLayer(selected.id, fn)} onRemove={() => removeLayer(selected.id)} canRemove={recipe.layers.length > 1} />
          </aside>
        )}
      </div>

      <footer className="bottombar">
        <div className="transport">
          <button className="btn primary big" onClick={() => void play()} aria-label={playing ? "Stop" : "Play"}>{playing ? "■ Stop" : "▶ Play"}</button>
          <label className="check"><input type="checkbox" checked={loopAudition} onChange={(e) => setLoopAudition(e.target.checked)} />Repeat</label>
          {recipe.mode === "loop" && <button className="btn" onClick={() => void play({ seam: true })} title="Plays the end of the loop joined to its start, four times">Listen across seam</button>}
          <label className="check" title="Monitoring only: sums the stereo result to mono. Does not change the export."><input type="checkbox" checked={monoCheck} onChange={(e) => setMonoCheck(e.target.checked)} />Mono check</label>
          <label className="check" title="Re-render and play shortly after each edit"><input type="checkbox" checked={autoPreview} onChange={(e) => setAutoPreview(e.target.checked)} />Auto preview</label>
        </div>
        <div className="monitor">
          <Slider label="Monitor level" min={-60} max={0} step={1} unit="dB" value={monitorDb} onCommit={(v) => { player.setMonitorDb(v); setMonitorDb(v); }} help="Listening level only. It never changes exported files, and it cannot make a physical listening level safe." />
          <div className="meter" role="img" aria-label="Output level meter"><div className="meter-fill" ref={meter} /><div className="meter-peak" ref={meterPeak} /></div>
        </div>
        <div className="readouts" aria-live="polite">
          <span className={"status" + (renderError ? " err" : stale || !preview ? " stale" : "")}>{status}</span>
          {preview && <span>Peak {preview.analysis.peakDbfs} dBFS · RMS {preview.analysis.rmsDbfs} dBFS · {preview.analysis.durationSeconds.toFixed(2)} s · {preview.processed.channels.length === 1 ? "mono" : "stereo"}</span>}
          {renderError && <span className="warn">{renderError}</span>}
        </div>
        <div className="row">
          <button className="btn" onClick={() => { setPresetName(recipe.name); setDialog("savePreset"); }}>Save Preset</button>
          <button className="btn primary" onClick={() => setDialog("export")} title="Ctrl+E">Export</button>
        </div>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      {dialog === "export" && (
        <ExportDialog recipe={recipe} report={preview?.report ?? null} previewStale={stale || !preview} onClose={() => setDialog(null)} onSettings={setExport}
          onRestoreLayers={() => edit((d) => { for (const l of d.layers) { l.mute = false; l.solo = false; } })} onRun={runExport}
          folderName={folderName} canPickFolder={canPickFolder()} onPickFolder={() => void pickExportFolder().then(() => setFolderName(currentFolderName()))} />
      )}
      {dialog === "help" && <Help onClose={() => setDialog(null)} onTour={() => setDialog("tour")} />}
      {dialog === "tour" && <Tour onClose={() => { safeSet("tourDone", "1"); setDialog(null); }} />}
      {dialog === "palette" && <Palette actions={actions} onClose={() => setDialog(null)} />}
      {dialog === "savePreset" && (
        <Modal title="Save as my preset" onClose={() => setDialog(null)}>
          <p className="muted small">Saved in this browser on this computer. Factory presets are never changed.</p>
          <input autoFocus className="search" aria-label="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }} />
          <div className="row"><button className="btn primary" disabled={!presetName.trim()} onClick={savePreset}>Save</button><button className="btn" onClick={() => setDialog(null)}>Cancel</button></div>
        </Modal>
      )}
      {pending && (
        <Modal title="Unsaved changes" onClose={() => setPending(null)}>
          <p>You have changes to “{recipe.name}” that are not saved. Switching now would lose them.</p>
          <div className="row">
            <button className="btn primary" onClick={async () => { const ok = await saveProject(); if (ok) { const p = pending; setPending(null); p.run(); } }}>Save project first</button>
            <button className="btn danger" onClick={() => { const p = pending; setPending(null); p.run(); }}>Discard changes</button>
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
