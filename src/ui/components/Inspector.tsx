import { useMemo, type ReactNode } from "react";
import type { Layer, Recipe } from "../../domain/schema";
import { Slider } from "./Slider";
import { CurveEditor } from "./CurveEditor";
import { getAsset } from "../assets";

type Path = (string | number)[];
const getIn = (o: unknown, path: Path): unknown => path.reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string | number, unknown>)[k]), o);
function setIn(o: unknown, path: Path, v: unknown) {
  let cur = o as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
  cur[path[path.length - 1]] = v;
}

interface Props {
  layer: Layer;
  effective: Layer | undefined;
  recipe: Recipe;
  onEdit: (fn: (l: Layer) => void) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function Inspector({ layer, effective, recipe, onEdit, onRemove, canRemove }: Props) {
  const num = (path: Path, label: string, min: number, max: number, o: { step?: number; log?: boolean; unit?: string; decimals?: number; help?: string } = {}) => (
    <Slider key={path.join(".")} label={label} min={min} max={max} value={getIn(layer, path) as number} effective={getIn(effective, path) as number | undefined}
      onCommit={(v) => onEdit((l) => setIn(l, path, v))} {...o} />
  );
  const select = <T extends string>(path: Path, label: string, options: readonly T[]) => (
    <label className="field"><span>{label}</span>
      <select value={getIn(layer, path) as string} onChange={(e) => onEdit((l) => setIn(l, path, e.target.value))}>{options.map((o) => <option key={o}>{o}</option>)}</select>
    </label>
  );
  const check = (path: Path, label: string) => (
    <label className="check"><input type="checkbox" checked={!!getIn(layer, path)} onChange={(e) => onEdit((l) => setIn(l, path, e.target.checked))} />{label}</label>
  );

  const sourceEditor = (src: Layer["source"] | Extract<Layer["source"], { type: "eventSequence" }>["inner"], base: Path): ReactNode => {
    switch (src.type) {
      case "oscillator":
        return (
          <>
            {select([...base, "wave"], "Waveform", ["sine", "triangle", "saw", "square"] as const)}
            {num([...base, "frequencyHz"], "Frequency", 10, 16000, { log: true, unit: "Hz", decimals: 1, help: "Base pitch. The layer's pitch curve moves it in semitones." })}
            {num([...base, "phaseDegrees"], "Start phase", 0, 360, { unit: "°" })}
            <label className="check"><input type="checkbox" checked={!!src.fm} onChange={(e) => onEdit((l) => setIn(l, [...base, "fm"], e.target.checked ? { ratio: 2, index: 1 } : undefined))} />FM (adds metallic overtones)</label>
            {src.fm && <>{num([...base, "fm", "ratio"], "FM ratio", 0.1, 16, { log: true, decimals: 2 })}{num([...base, "fm", "index"], "FM amount", 0, 8, { step: 0.05, decimals: 2 })}</>}
            <label className="check"><input type="checkbox" checked={!!src.vibrato} onChange={(e) => onEdit((l) => setIn(l, [...base, "vibrato"], e.target.checked ? { rateHz: 5, depthSemitones: 0.3 } : undefined))} />Slow pitch wobble</label>
            {src.vibrato && <>{num([...base, "vibrato", "rateHz"], "Wobble rate", 0.05, 40, { log: true, unit: "Hz", decimals: 2 })}{num([...base, "vibrato", "depthSemitones"], "Wobble depth", 0, 12, { step: 0.05, unit: "st", decimals: 2 })}</>}
          </>
        );
      case "noise":
        return select([...base, "color"], "Colour", ["white", "pink", "brown"] as const);
      case "resonantImpact":
        return (
          <>
            {src.modes.map((_, i) => (
              <fieldset key={i} className="mode">
                <legend>Resonance {i + 1} <button className="icon-btn" disabled={src.modes.length <= 1} aria-label={`Remove resonance ${i + 1}`} onClick={() => onEdit((l) => { (getIn(l, [...base, "modes"]) as unknown[]).splice(i, 1); })}>✕</button></legend>
                {num([...base, "modes", i, "frequencyHz"], "Frequency", 20, 16000, { log: true, unit: "Hz", decimals: 0 })}
                {num([...base, "modes", i, "gainDb"], "Level", -60, 12, { unit: "dB", decimals: 1 })}
                {num([...base, "modes", i, "decaySeconds"], "Ring time", 0.003, 8, { log: true, unit: "s", decimals: 3, help: "Time for this resonance to die away by 60 dB." })}
              </fieldset>
            ))}
            <button className="btn small" disabled={src.modes.length >= 6} onClick={() => onEdit((l) => { (getIn(l, [...base, "modes"]) as unknown[]).push({ frequencyHz: 800, gainDb: -6, decaySeconds: 0.2 }); })}>Add resonance</button>
            {num([...base, "excitation", "noiseAmount"], "Strike roughness", 0, 1, { step: 0.01, decimals: 2, help: "Noise versus clean click in the first instant." })}
            {num([...base, "excitation", "burstMs"], "Strike length", 0.2, 80, { log: true, unit: "ms", decimals: 1 })}
          </>
        );
      case "sample": {
        const ref = recipe.assets.find((a) => a.id === src.assetId);
        const asset = ref ? getAsset(ref.hash) : undefined;
        const notes: string[] = [];
        if (asset) {
          const ch = asset.channels[0];
          let peak = 0; for (const c of asset.channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
          let lead = 0; while (lead < ch.length && Math.abs(ch[lead]) < Math.max(peak * 0.02, 1e-4)) lead++;
          if (peak >= 0.999) notes.push("This recording clips (reaches full scale). Lower the layer level.");
          if (lead / asset.sampleRate > 0.02) notes.push(`${Math.round((lead / asset.sampleRate) * 1000)} ms of leading silence.`);
          (notes as string[] & { lead?: number }).lead = lead / asset.sampleRate;
        }
        const lead = (notes as string[] & { lead?: number }).lead ?? 0;
        return (
          <>
            <p className="muted small">{ref ? `${ref.originalName}, ${(ref.frames / ref.sampleRate).toFixed(2)} s, ${ref.channels === 1 ? "mono" : "stereo"}, ${ref.sampleRate} Hz. The original file is never changed; edits here are saved in the recipe.` : "Sample is missing."}</p>
            {!asset && <p className="warn">This sample is missing. Re-open the project that contains it, or remove this layer.</p>}
            {notes.map((n) => <p key={n} className="warn small">{n}</p>)}
            {lead > 0.02 && <button className="btn small" onClick={() => onEdit((l) => setIn(l, [...base, "startSeconds"], Math.round(lead * 1000) / 1000))}>Trim leading silence</button>}
            {num([...base, "startSeconds"], "Use from", 0, ref ? ref.frames / ref.sampleRate : 60, { step: 0.001, unit: "s", decimals: 3 })}
            <label className="field"><span>Use until (blank = end)</span>
              <input defaultValue={src.endSeconds ?? ""} key={String(src.endSeconds)} inputMode="decimal" onBlur={(e) => { const t = e.target.value.trim(); const n = Number(t); onEdit((l) => setIn(l, [...base, "endSeconds"], t === "" || !Number.isFinite(n) ? null : n)); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </label>
            {check([...base, "reverse"], "Reverse the selected range")}
            {num([...base, "playbackRate"], "Playback speed", 0.1, 8, { log: true, decimals: 2, help: "Changes pitch and duration together. Independent time-stretching is not in version 1." })}
            {select([...base, "channelMode"], "Channels", ["keep", "mono"] as const)}
            {num([...base, "fadeInMs"], "Fade in", 0, 5000, { unit: "ms", decimals: 0 })}
            {num([...base, "fadeOutMs"], "Fade out", 0, 5000, { unit: "ms", decimals: 0 })}
          </>
        );
      }
      case "eventSequence":
        return (
          <>
            {num([...base, "ratePerSecond"], "Events per second", 0.05, 200, { log: true, decimals: 2 })}
            {num([...base, "intervalJitter"], "Timing looseness", 0, 1, { step: 0.01, decimals: 2 })}
            {num([...base, "pitchRangeSemitones"], "Pitch spread", 0, 24, { step: 0.1, unit: "st", decimals: 1 })}
            {num([...base, "gainRangeDb"], "Level spread", 0, 24, { step: 0.5, unit: "dB", decimals: 1 })}
            {num([...base, "eventDecaySeconds"], "Event length", 0.002, 4, { log: true, unit: "s", decimals: 3 })}
            <h4>Each event is a</h4>
            <p className="muted small">{src.inner.type === "resonantImpact" ? "resonant hit" : src.inner.type}</p>
            {sourceEditor(src.inner, [...base, "inner"])}
          </>
        );
    }
  };

  const ampMax = useMemo(() => Math.max(layer.durationSeconds, layer.amplitudeCurve[layer.amplitudeCurve.length - 1][0], 0.05), [layer]);

  return (
    <div className="inspector">
      <div className="insp-head">
        <input className="name-input" aria-label="Layer name" value={layer.name} onChange={(e) => onEdit((l) => { l.name = e.target.value.slice(0, 60) || l.name; })} />
        <button className="btn small danger" disabled={!canRemove} onClick={onRemove} title="Remove this layer">Remove</button>
      </div>
      <p className="muted small">Source: {layer.source.type === "resonantImpact" ? "resonant impact" : layer.source.type === "eventSequence" ? "event sequence" : layer.source.type}</p>
      <section>
        <h3>Timing and level</h3>
        {recipe.mode === "oneShot" && <>
          {num(["startSeconds"], "Starts at", 0, 120, { step: 0.001, unit: "s", decimals: 3, help: "When this ingredient begins." })}
          {num(["durationSeconds"], "Length", 0.002, 120, { log: true, unit: "s", decimals: 3 })}
          {num(["timeScale"], "Time stretch", 0.05, 20, { log: true, decimals: 2, help: "Scales this layer's length and envelope. Macros like Decay use this." })}
        </>}
        {num(["gainDb"], "Level", -60, 12, { unit: "dB", decimals: 1, step: 0.5 })}
        {num(["pan"], "Pan", -1, 1, { step: 0.01, decimals: 2, help: "Left to right. Mono exports sum both sides." })}
        {num(["spaceSendDb"], "Send to Space", -80, 12, { unit: "dB", decimals: 1, step: 0.5, help: "How much of this layer feeds the shared reverb." })}
      </section>
      <section><h3>Source</h3>{sourceEditor(layer.source, ["source"])}</section>
      <section>
        <h3>Envelope</h3>
        <CurveEditor label="Volume envelope" curve={layer.amplitudeCurve} yMin={0} yMax={1.2} xMax={ampMax} onChange={(c) => onEdit((l) => { l.amplitudeCurve = c; })} />
        {layer.pitchCurveSemitones
          ? <><CurveEditor label="Pitch curve" curve={layer.pitchCurveSemitones} yMin={-36} yMax={36} yUnit=" st" xMax={ampMax} onChange={(c) => onEdit((l) => { l.pitchCurveSemitones = c; })} />
              <button className="btn small" onClick={() => onEdit((l) => { l.pitchCurveSemitones = undefined; })}>Remove pitch curve</button></>
          : <button className="btn small" onClick={() => onEdit((l) => { l.pitchCurveSemitones = [[0, 0], [Math.max(0.01, l.durationSeconds), 0]]; })}>Add pitch curve</button>}
        <label className="check"><input type="checkbox" checked={!!layer.tremolo} onChange={(e) => onEdit((l) => { l.tremolo = e.target.checked ? { rateHz: 6, depth: 0.3 } : undefined; })} />Pulsing level (tremolo)</label>
        {layer.tremolo && <>{num(["tremolo", "rateHz"], "Pulse rate", 0.05, 60, { log: true, unit: "Hz", decimals: 2 })}{num(["tremolo", "depth"], "Pulse depth", 0, 1, { step: 0.01, decimals: 2 })}</>}
      </section>
      <section>
        <h3>Filters</h3>
        {layer.filters.map((f, i) => (
          <fieldset key={i} className="mode">
            <legend>Filter {i + 1}
              <label className="check inline"><input type="checkbox" checked={f.bypass} onChange={(e) => onEdit((l) => { l.filters[i].bypass = e.target.checked; })} />Bypass</label>
              <button className="icon-btn" aria-label={`Remove filter ${i + 1}`} onClick={() => onEdit((l) => { l.filters.splice(i, 1); })}>✕</button></legend>
            {select(["filters", i, "type"], "Type", ["lowpass", "highpass", "bandpass"] as const)}
            {num(["filters", i, "cutoffHz"], f.type === "bandpass" ? "Centre" : "Cutoff", 20, 20000, { log: true, unit: "Hz", decimals: 0, help: "Brightness: lower cuts more high detail." })}
            {num(["filters", i, "q"], "Resonance", 0.3, 20, { log: true, decimals: 2, help: "A ringing emphasis near the cutoff." })}
            {f.cutoffCurveOctaves
              ? <><CurveEditor label="Cutoff sweep" curve={f.cutoffCurveOctaves} yMin={-4} yMax={4} yUnit=" oct" xMax={ampMax} onChange={(c) => onEdit((l) => { l.filters[i].cutoffCurveOctaves = c; })} />
                  <button className="btn small" onClick={() => onEdit((l) => { l.filters[i].cutoffCurveOctaves = undefined; })}>Remove sweep</button></>
              : <button className="btn small" onClick={() => onEdit((l) => { l.filters[i].cutoffCurveOctaves = [[0, 0], [Math.max(0.01, l.durationSeconds), 0]]; })}>Add cutoff sweep</button>}
          </fieldset>
        ))}
        <button className="btn small" disabled={layer.filters.length >= 3} onClick={() => onEdit((l) => { l.filters.push({ type: "lowpass", cutoffHz: 4000, q: 0.707, bypass: false }); })}>Add filter</button>
      </section>
      <section>
        <h3>Effects</h3>
        {layer.effects.map((e, i) => (
          <fieldset key={i} className="mode">
            <legend>{e.type === "drive" ? "Drive (grit)" : "Delay (echo)"}
              <label className="check inline"><input type="checkbox" checked={e.bypass} onChange={(ev) => onEdit((l) => { l.effects[i].bypass = ev.target.checked; })} />Bypass</label>
              <button className="icon-btn" aria-label={`Remove effect ${i + 1}`} onClick={() => onEdit((l) => { l.effects.splice(i, 1); })}>✕</button></legend>
            {e.type === "drive" ? <>
              {num(["effects", i, "inputDb"], "Input", -24, 36, { unit: "dB", decimals: 1 })}
              {num(["effects", i, "amount"], "Amount", 0, 1, { step: 0.01, decimals: 2 })}
              {num(["effects", i, "outputDb"], "Output trim", -36, 12, { unit: "dB", decimals: 1 })}
            </> : <>
              {num(["effects", i, "timeMs"], "Time", 1, 2000, { log: true, unit: "ms", decimals: 0 })}
              {num(["effects", i, "feedback"], "Repeats", 0, 0.85, { step: 0.01, decimals: 2, help: "Capped below 0.85 so echoes always die away." })}
              {num(["effects", i, "mix"], "Wet mix", 0, 1, { step: 0.01, decimals: 2 })}
            </>}
          </fieldset>
        ))}
        <div className="row">
          <button className="btn small" disabled={layer.effects.length >= 4} onClick={() => onEdit((l) => { l.effects.push({ type: "drive", inputDb: 0, amount: 0.3, outputDb: 0, bypass: false }); })}>Add drive</button>
          <button className="btn small" disabled={layer.effects.length >= 4} onClick={() => onEdit((l) => { l.effects.push({ type: "delay", timeMs: 180, feedback: 0.3, mix: 0.3, bypass: false }); })}>Add delay</button>
        </div>
      </section>
    </div>
  );
}
