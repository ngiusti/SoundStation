import { useRef, useState } from "react";
import type { Layer } from "../../domain/schema";

interface Props {
  layers: Layer[];
  selectedId: string | null;
  totalSeconds: number;
  loop: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string, fn: (l: Layer) => void) => void;
}

export function Timeline({ layers, selectedId, totalSeconds, loop, onSelect, onEdit }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ id: string; start: number; dur: number } | null>(null);
  const anySolo = layers.some((l) => l.solo);

  const begin = (l: Layer, mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (loop) return;
    e.preventDefault(); e.stopPropagation();
    onSelect(l.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = area.current!.getBoundingClientRect();
    const x0 = e.clientX;
    const start0 = l.startSeconds, dur0 = l.durationSeconds;
    let latest = { start: start0, dur: dur0 };
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - x0) / rect.width) * totalSeconds;
      latest = mode === "move" ? { start: Math.max(0, start0 + dt), dur: dur0 } : { start: start0, dur: Math.max(0.002, dur0 + dt / l.timeScale) };
      setLive({ id: l.id, ...latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLive(null);
      const r = (n: number) => Math.round(n * 1000) / 1000;
      if (r(latest.start) !== r(start0) || r(latest.dur) !== r(dur0)) onEdit(l.id, (d) => { d.startSeconds = r(latest.start); d.durationSeconds = r(latest.dur); });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div className="timeline" aria-label="Layer timeline">
      {layers.map((l) => {
        const lv = live?.id === l.id ? live : null;
        const start = loop ? 0 : lv?.start ?? l.startSeconds;
        const dur = loop ? totalSeconds : (lv?.dur ?? l.durationSeconds) * l.timeScale;
        const audible = !l.mute && (!anySolo || l.solo);
        const pts = l.amplitudeCurve.map(([t, v]) => `${Math.min(1, t / (l.durationSeconds || 1))},${1 - Math.min(1, Math.max(0, v))}`).join(" ");
        return (
          <div key={l.id} className={"lane" + (selectedId === l.id ? " selected" : "") + (audible ? "" : " silent")} onClick={() => onSelect(l.id)}>
            <div className="lane-label">
              <button className="lane-name" onClick={() => onSelect(l.id)} aria-pressed={selectedId === l.id}>{l.name}</button>
              <button className={"tiny" + (l.mute ? " on" : "")} aria-pressed={l.mute} aria-label={`Mute ${l.name}`} title="Mute (saved in the recipe and applied to exports)" onClick={(e) => { e.stopPropagation(); onEdit(l.id, (d) => { d.mute = !d.mute; }); }}>M</button>
              <button className={"tiny solo" + (l.solo ? " on" : "")} aria-pressed={l.solo} aria-label={`Solo ${l.name}`} title="Solo (saved in the recipe and applied to exports)" onClick={(e) => { e.stopPropagation(); onEdit(l.id, (d) => { d.solo = !d.solo; }); }}>S</button>
            </div>
            <div className="lane-track" ref={l === layers[0] ? area : undefined}>
              <div className="bar" style={{ left: `${(start / totalSeconds) * 100}%`, width: `${Math.max(0.5, (dur / totalSeconds) * 100)}%` }} onPointerDown={begin(l, "move")}>
                <svg viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={pts} /></svg>
                {!loop && <div className="bar-resize" role="presentation" onPointerDown={begin(l, "resize")} />}
              </div>
            </div>
          </div>
        );
      })}
      {loop && <p className="muted small">Loop beds run for the whole cycle; their envelope repeats every loop.</p>}
      {!loop && <p className="muted small">Drag a bar to move its start, or its right edge to change its length. Select a layer to edit exact numbers.</p>}
    </div>
  );
}
