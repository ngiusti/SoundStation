import { useEffect, useRef, useState } from "react";
import { player } from "../player";

export interface WaveformProps {
  /** Full pre-crop timeline, mono for drawing. */
  samples: Float32Array | null;
  sampleRate: number;
  gain: number;
  cropStart: number;
  cropEnd: number | null;
  loop: boolean;
  /** Frames of the intended sound before the effect tail. */
  bodyFrames: number;
  stale: boolean;
  onCrop: (start: number, end: number | null) => void;
}

const HANDLE = 12;

export function Waveform(p: WaveformProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const H = 150;
  const total = p.samples ? p.samples.length / p.sampleRate : 0;
  const [drag, setDrag] = useState<{ which: "start" | "end"; t: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (n: string) => css.getPropertyValue(n).trim() || "#888";
    g.clearRect(0, 0, w, H);
    g.fillStyle = col("--panel-2"); g.fillRect(0, 0, w, H);
    // ruler
    g.fillStyle = col("--muted"); g.strokeStyle = col("--border"); g.font = "11px system-ui"; g.lineWidth = 1;
    if (total > 0) {
      const raw = total / (w / 90);
      const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30];
      const step = steps.find((s) => s >= raw) ?? 30;
      for (let t = 0; t <= total + 1e-9; t += step) {
        const x = Math.round((t / total) * (w - 1)) + 0.5;
        g.beginPath(); g.moveTo(x, 16); g.lineTo(x, H); g.stroke();
        g.fillText(step < 1 ? `${(t * 1000).toFixed(0)} ms` : `${t.toFixed(t % 1 ? 1 : 0)} s`, x + 3, 11);
      }
    }
    g.strokeStyle = col("--border-strong"); g.beginPath(); g.moveTo(0, 16 + (H - 16) / 2); g.lineTo(w, 16 + (H - 16) / 2); g.stroke();
    const s = p.samples;
    if (s && s.length) {
      const mid = 16 + (H - 16) / 2, amp = (H - 16) / 2 - 2;
      const per = s.length / w;
      g.fillStyle = col("--accent");
      for (let x = 0; x < w; x++) {
        let lo = 0, hi = 0;
        const a = Math.floor(x * per), b = Math.min(s.length, Math.max(a + 1, Math.floor((x + 1) * per)));
        for (let i = a; i < b; i++) { const v = s[i] * p.gain; if (v < lo) lo = v; if (v > hi) hi = v; }
        const y1 = mid - Math.min(1, hi) * amp, y2 = mid - Math.max(-1, lo) * amp;
        g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
      // clipping marker line at full scale
      g.strokeStyle = col("--warn"); g.setLineDash([3, 4]);
      for (const f of [1, -1]) { const y = mid - f * amp; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.setLineDash([]);
      // crop shading
      const cs = (drag?.which === "start" ? drag.t : p.cropStart), ce = drag?.which === "end" ? drag.t : p.cropEnd ?? total;
      g.fillStyle = "rgba(0,0,0,0.55)";
      if (!p.loop) {
        g.fillRect(0, 16, (cs / total) * w, H - 16);
        g.fillRect((ce / total) * w, 16, w - (ce / total) * w, H - 16);
      }
      // tail region marker
      if (!p.loop && p.bodyFrames < s.length) {
        const x = (p.bodyFrames / s.length) * w;
        g.strokeStyle = col("--muted"); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, 16); g.lineTo(x, H); g.stroke(); g.setLineDash([]);
        g.fillStyle = col("--muted"); g.fillText("tail", x + 3, H - 5);
      }
    }
  }, [p.samples, p.gain, p.cropStart, p.cropEnd, p.loop, p.bodyFrames, w, total, drag]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pos = player.position();
      const el = head.current;
      if (el) {
        if (pos === null || total <= 0) el.style.display = "none";
        else { el.style.display = "block"; el.style.left = `${((p.loop ? pos : pos + p.cropStart) / total) * w}px`; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, w, p.cropStart, p.loop]);

  const startDrag = (which: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = wrap.current!.getBoundingClientRect();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const t = Math.min(total, Math.max(0, ((ev.clientX - rect.left) / rect.width) * total));
      setDrag({ which, t });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const t = Math.min(total, Math.max(0, ((ev.clientX - rect.left) / rect.width) * total));
      setDrag(null);
      if (which === "start") p.onCrop(Math.min(t, (p.cropEnd ?? total) - 0.005), p.cropEnd);
      else p.onCrop(p.cropStart, Math.max(t, p.cropStart + 0.005) >= total - 1e-6 ? null : Math.max(t, p.cropStart + 0.005));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const keyHandle = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const step = (e.shiftKey ? 0.001 : 0.01) * d;
    if (which === "start") p.onCrop(Math.max(0, Math.min((p.cropEnd ?? total) - 0.005, p.cropStart + step)), p.cropEnd);
    else { const v = (p.cropEnd ?? total) + step; p.onCrop(p.cropStart, v >= total - 1e-6 ? null : Math.max(p.cropStart + 0.005, v)); }
  };
  const xs = total > 0 ? ((drag?.which === "start" ? drag.t : p.cropStart) / total) * w : 0;
  const xe = total > 0 ? ((drag?.which === "end" ? drag.t : p.cropEnd ?? total) / total) * w : w;

  return (
    <div className="waveform" ref={wrap} style={{ height: H }} aria-label="Rendered waveform">
      <canvas ref={canvas} style={{ width: "100%", height: H }} />
      {!p.samples && <div className="wave-empty">Press Play to render this sound</div>}
      {p.stale && p.samples && <div className="wave-stale">Out of date: press Play to render your latest edit</div>}
      <div className="playhead" ref={head} />
      {p.samples && !p.loop && (
        <>
          <div className="crop-handle" role="slider" tabIndex={0} aria-label="Export start (crop)" aria-valuemin={0} aria-valuemax={total} aria-valuenow={p.cropStart} aria-valuetext={`${(p.cropStart * 1000).toFixed(0)} milliseconds`}
            style={{ left: Math.max(0, xs - HANDLE) }} onPointerDown={startDrag("start")} onKeyDown={keyHandle("start")}><span /></div>
          <div className="crop-handle end" role="slider" tabIndex={0} aria-label="Export end (crop)" aria-valuemin={0} aria-valuemax={total} aria-valuenow={p.cropEnd ?? total} aria-valuetext={`${((p.cropEnd ?? total) * 1000).toFixed(0)} milliseconds`}
            style={{ left: Math.min(w - HANDLE, xe) }} onPointerDown={startDrag("end")} onKeyDown={keyHandle("end")}><span /></div>
        </>
      )}
    </div>
  );
}
