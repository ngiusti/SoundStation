import { useRef, useState } from "react";
import type { Curve } from "../../domain/schema";

interface Props {
  label: string;
  curve: Curve;
  yMin: number;
  yMax: number;
  yUnit?: string;
  /** Shown length of the x axis in seconds (curve time, before the layer time scale). */
  xMax: number;
  onChange: (c: Curve) => void;
}

const W = 300, H = 96, PAD = 8;

/** Draggable breakpoint editor. Every action has a keyboard or numeric equivalent. */
export function CurveEditor({ label, curve, yMin, yMax, yUnit = "", xMax, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<Curve | null>(null);
  const c = live ?? curve;
  const X = (t: number) => PAD + (t / xMax) * (W - 2 * PAD);
  const Y = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - 2 * PAD);
  const toT = (px: number) => Math.max(0, ((px - PAD) / (W - 2 * PAD)) * xMax);
  const toV = (py: number) => Math.min(yMax, Math.max(yMin, yMin + ((H - PAD - py) / (H - 2 * PAD)) * (yMax - yMin)));
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const clampT = (arr: Curve, i: number, t: number) => {
    const lo = i > 0 ? arr[i - 1][0] + 0.001 : 0;
    const hi = i < arr.length - 1 ? arr[i + 1][0] - 0.001 : Infinity;
    return Math.min(hi, Math.max(lo, t));
  };
  const round = (n: number) => Math.round(n * 10000) / 10000;

  const drag = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    let latest: Curve = curve;
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      const next = curve.map((pt) => [...pt] as [number, number]);
      next[i] = [round(clampT(curve, i, toT(p.x))), round(toV(p.y))];
      latest = next; setLive(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLive(null); onChange(latest);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const addAt = (e: React.MouseEvent) => {
    const p = local(e);
    const t = round(toT(p.x));
    if (curve.some(([ct]) => Math.abs(ct - t) < 0.002)) return;
    const next = [...curve, [t, round(toV(p.y))] as [number, number]].sort((a, b) => a[0] - b[0]);
    onChange(next);
  };
  const remove = (i: number) => { if (curve.length > 2) onChange(curve.filter((_, k) => k !== i)); };
  const setNum = (i: number, k: 0 | 1, val: number) => {
    if (!Number.isFinite(val)) return;
    const next = curve.map((pt) => [...pt] as [number, number]);
    next[i][k] = k === 0 ? round(clampT(curve, i, Math.max(0, val))) : round(Math.min(yMax * 4, Math.max(yMin * 4, val)));
    onChange(next);
  };
  const pts = c.map(([t, v]) => `${X(t)},${Y(v)}`).join(" ");

  return (
    <div className="curve-editor">
      <div className="curve-title">{label}</div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${label} curve editor. Double-click to add a point.`} onDoubleClick={addAt}>
        <rect x={0} y={0} width={W} height={H} className="curve-bg" />
        <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} className="curve-axis" />
        <polyline points={pts} className="curve-line" />
        {c.map(([t, v], i) => (
          <circle key={i} cx={X(t)} cy={Y(v)} r={6} className="curve-pt" tabIndex={0} role="slider"
            aria-label={`${label} point ${i + 1}: ${t.toFixed(3)} seconds, ${v.toFixed(2)}${yUnit}`} aria-valuenow={v}
            onPointerDown={drag(i)} onDoubleClick={(e) => { e.stopPropagation(); remove(i); }}
            onKeyDown={(e) => {
              const dt = e.shiftKey ? 0.001 : 0.01, dv = (yMax - yMin) * (e.shiftKey ? 0.005 : 0.03);
              if (e.key === "ArrowLeft") { e.preventDefault(); setNum(i, 0, t - dt); }
              else if (e.key === "ArrowRight") { e.preventDefault(); setNum(i, 0, t + dt); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setNum(i, 1, Math.min(yMax, v + dv)); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setNum(i, 1, Math.max(yMin, v - dv)); }
              else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(i); }
            }} />
        ))}
      </svg>
      <details>
        <summary>Edit points as numbers</summary>
        <table className="curve-table">
          <thead><tr><th>#</th><th>time (s)</th><th>value{yUnit && ` (${yUnit})`}</th><th /></tr></thead>
          <tbody>
            {curve.map(([t, v], i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input aria-label={`${label} point ${i + 1} time`} defaultValue={t} key={`t${i}-${t}`} onBlur={(e) => setNum(i, 0, Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></td>
                <td><input aria-label={`${label} point ${i + 1} value`} defaultValue={v} key={`v${i}-${v}`} onBlur={(e) => setNum(i, 1, Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></td>
                <td><button className="icon-btn" aria-label={`Remove point ${i + 1}`} disabled={curve.length <= 2} onClick={() => remove(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn small" onClick={() => onChange([...curve, [round(curve[curve.length - 1][0] + 0.05), curve[curve.length - 1][1]]])}>Add point at end</button>
      </details>
    </div>
  );
}
