import { useCallback, useEffect, useRef, useState } from "react";
import type { Macro, Recipe } from "../../domain/schema";
import { captureToCurves, MOTION_SHAPES, shapeCurve, valueAt, type PadSample } from "../../domain/perform";
import { player } from "../player";
import { Slider } from "./Slider";
import { CurveEditor } from "./CurveEditor";

interface Props {
  recipe: Recipe;
  /** Plays the current rendered preview once from its start (no repeat). Resolves when playback has started. */
  onPlayForCapture: () => Promise<void>;
  /** Seconds of recipe time skipped at the start of the playing buffer (crop start for one-shots). */
  timeOffset: number;
  onEdit: (fn: (d: Recipe) => void) => void;
  onNotice: (t: string) => void;
}

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

export function PerformPanel({ recipe, onPlayForCapture, timeOffset, onEdit, onNotice }: Props) {
  const macros = recipe.macros;
  const perform = recipe.perform;
  const [xId, setXId] = useState(perform?.xMacro ?? macros[0]?.id ?? "");
  const [yId, setYId] = useState(perform?.yMacro ?? macros[1]?.id ?? macros[0]?.id ?? "");
  const mx = macros.find((m) => m.id === xId), my = macros.find((m) => m.id === yId);
  const [pos, setPos] = useState({ x: mx?.value ?? 50, y: my?.value ?? 50 });
  const [capturing, setCapturing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const samples = useRef<PadSample[]>([]);
  const posRef = useRef(pos); posRef.current = pos;
  const cancelled = useRef(false);
  const capRef = useRef(false); capRef.current = capturing;
  const pad = useRef<HTMLDivElement>(null);
  const duration = recipe.durationSeconds;

  // Keep the pad in step with the macro values when not capturing (undo, preset change, slider use).
  useEffect(() => { if (!capRef.current) setPos({ x: mx?.value ?? 50, y: my?.value ?? 50 }); }, [mx?.value, my?.value, xId, yId]);
  useEffect(() => { if (perform) { setXId(perform.xMacro); setYId(perform.yMacro); } }, [perform?.xMacro, perform?.yMacro]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = useCallback((x: number, y: number) => {
    if (!capRef.current) return;
    const p = player.position();
    if (p === null) return;
    samples.current.push({ t: p + timeOffset, x, y });
  }, [timeOffset]);

  const setPad = useCallback((x: number, y: number, commit: boolean) => {
    const nx = clamp100(x), ny = clamp100(y);
    setPos({ x: nx, y: ny });
    record(nx, ny);
    if (commit && !capRef.current) {
      onEdit((d) => {
        const a = d.macros.find((m) => m.id === xId), b = d.macros.find((m) => m.id === yId);
        if (a) a.value = Math.round(nx * 10) / 10;
        if (b) b.value = Math.round(ny * 10) / 10;
      });
    }
  }, [onEdit, record, xId, yId]);

  const fromPointer = (e: { clientX: number; clientY: number }) => {
    const r = pad.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: (1 - (e.clientY - r.top) / r.height) * 100 };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!mx || !my) return;
    e.preventDefault();
    pad.current!.setPointerCapture(e.pointerId);
    const p = fromPointer(e);
    setPad(p.x, p.y, false);
    const move = (ev: PointerEvent) => { const q = fromPointer(ev); setPad(q.x, q.y, false); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const q = fromPointer(ev); setPad(q.x, q.y, true);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const s = e.shiftKey ? 1 : 5;
    const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setPad(posRef.current.x + v[0], posRef.current.y + v[1], true);
  };

  const finish = useCallback((keep: boolean) => {
    if (!capRef.current) return;
    capRef.current = false;
    setCapturing(false);
    player.stop();
    if (!keep) { onNotice("Capture cancelled. Nothing was changed."); return; }
    try {
      const { xCurve, yCurve } = captureToCurves(samples.current, duration);
      onEdit((d) => { d.perform = { enabled: true, xMacro: xId, yMacro: yId, xCurve, yCurve }; });
      onNotice("Motion captured. Press Play to hear it; edit the curves below if you like.");
    } catch (e) { onNotice((e as Error).message); }
  }, [duration, onEdit, onNotice, xId, yId]);

  const start = async () => {
    if (!mx || !my) return;
    cancelled.current = false;
    samples.current = [];
    try { await onPlayForCapture(); } catch { return; }
    capRef.current = true;
    setCapturing(true);
    samples.current.push({ t: timeOffset, x: posRef.current.x, y: posRef.current.y });
  };

  // Elapsed time, automatic end of the capture window, and end when playback stops.
  useEffect(() => {
    if (!capturing) return;
    let raf = 0;
    const tick = () => {
      const p = player.position();
      if (p === null) { finish(!cancelled.current); return; }
      const t = p + timeOffset;
      setElapsed(t);
      if (t >= duration) { finish(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [capturing, duration, finish, timeOffset]);

  // Escape cancels the capture (registered in the capture phase so it runs before the global stop handler).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && capRef.current) { cancelled.current = true; finish(false); } };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [finish]);

  const changeAxis = (axis: "x" | "y", id: string) => {
    if (axis === "x") setXId(id); else setYId(id);
    if (perform) onEdit((d) => { d.perform = undefined; });
  };

  if (macros.length < 2) return <p className="muted">Performance needs a sound with at least two main controls.</p>;
  const lane = (axis: "x" | "y", m: Macro | undefined) => {
    if (!perform || !m) return null;
    const curve = axis === "x" ? perform.xCurve : perform.yCurve;
    return (
      <div className="lane-edit" key={axis}>
        <CurveEditor label={`${m.label} motion (${m.lowLabel || "0"} to ${m.highLabel || "100"})`} curve={curve} yMin={0} yMax={100} xMax={duration}
          onChange={(c) => onEdit((d) => { if (d.perform) d.perform[axis === "x" ? "xCurve" : "yCurve"] = c; })} />
        <div className="row wrap">
          <span className="muted small">Start from a shape:</span>
          {MOTION_SHAPES.map((s) => <button key={s.id} className="btn small" onClick={() => onEdit((d) => { if (d.perform) d.perform[axis === "x" ? "xCurve" : "yCurve"] = shapeCurve(s.id, duration); })}>{s.label}</button>)}
        </div>
      </div>
    );
  };

  return (
    <div className="perform">
      <div className="perform-top">
        <div>
          <div className="row wrap">
            <label className="field"><span>Horizontal axis</span><select value={xId} onChange={(e) => changeAxis("x", e.target.value)} disabled={capturing}>{macros.filter((m) => m.id !== yId).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
            <label className="field"><span>Vertical axis</span><select value={yId} onChange={(e) => changeAxis("y", e.target.value)} disabled={capturing}>{macros.filter((m) => m.id !== xId).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
          </div>
          <div className="pad-wrap">
            <div className="pad-y" aria-hidden="true"><span>{my?.highLabel}</span><span>{my?.label}</span><span>{my?.lowLabel}</span></div>
            <div ref={pad} className={"pad" + (capturing ? " capturing" : "")} tabIndex={0} role="group" aria-label={`XY pad. Horizontal ${mx?.label}, ${mx?.lowLabel} to ${mx?.highLabel}. Vertical ${my?.label}, ${my?.lowLabel} to ${my?.highLabel}. Arrow keys move it.`}
              onPointerDown={onDown} onKeyDown={onKey}>
              <div className="pad-thumb" style={{ left: `${pos.x}%`, bottom: `${pos.y}%` }} />
            </div>
            <div className="pad-x" aria-hidden="true"><span>{mx?.lowLabel}</span><span>{mx?.label}</span><span>{mx?.highLabel}</span></div>
          </div>
        </div>
        <div className="perform-side">
          <Slider label={`${mx?.label ?? "X"}`} min={0} max={100} step={1} value={Math.round(pos.x)} onCommit={(v) => setPad(v, pos.y, true)} lowLabel={mx?.lowLabel} highLabel={mx?.highLabel} />
          <Slider label={`${my?.label ?? "Y"}`} min={0} max={100} step={1} value={Math.round(pos.y)} onCommit={(v) => setPad(pos.x, v, true)} lowLabel={my?.lowLabel} highLabel={my?.highLabel} />
          <p className="muted small">Without capturing, the pad (or these sliders) just sets the two main controls.</p>
          <div className="row wrap">
            {!capturing
              ? <button className="btn primary" onClick={() => void start()}>● Capture motion</button>
              : <button className="btn danger" onClick={() => finish(true)}>■ Stop capture</button>}
            {capturing && <span className="elapsed" aria-live="off">{elapsed.toFixed(2)} / {duration.toFixed(2)} s · Esc cancels</span>}
          </div>
          <p className="muted small">Capture plays the sound once; move the pad (or press its arrow keys) while it plays. The gesture is saved with the sound and replays exactly.</p>
          {perform && (
            <div className="row wrap">
              <label className="check"><input type="checkbox" checked={perform.enabled} onChange={(e) => onEdit((d) => { if (d.perform) d.perform.enabled = e.target.checked; })} />Use recorded motion</label>
              <button className="btn small" onClick={() => onEdit((d) => { d.perform = undefined; })}>Clear motion</button>
            </div>
          )}
          {!perform && <button className="btn small" onClick={() => onEdit((d) => { d.perform = { enabled: true, xMacro: xId, yMacro: yId, xCurve: shapeCurve("rise", duration), yCurve: shapeCurve("swell", duration) }; })}>Start from shapes (no capture)</button>}
        </div>
      </div>
      {perform && <div className="lanes-edit">{lane("x", macros.find((m) => m.id === perform.xMacro))}{lane("y", macros.find((m) => m.id === perform.yMacro))}</div>}
      {perform?.enabled && <p className="muted small">Motion changes level, oscillator pitch and filter cutoff over time. Other settings driven by these controls keep their static value.</p>}
    </div>
  );
}
