import { useEffect, useId, useRef, useState } from "react";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Logarithmic scale (frequencies, time scales). Requires min > 0. */
  log?: boolean;
  unit?: string;
  decimals?: number;
  defaultValue?: number;
  help?: string;
  lowLabel?: string;
  highLabel?: string;
  /** Value after macros/mappings, shown when it differs from the base value. */
  effective?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}

const toPos = (v: number, min: number, max: number, log?: boolean) =>
  log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
const fromPos = (p: number, min: number, max: number, log?: boolean) =>
  log ? min * Math.pow(max / min, p) : min + p * (max - min);

/**
 * One drag = one undo step: the thumb moves a local draft, and the value is committed on release,
 * a key press, or blur. Double-click the value to type a number. Shift+arrows steps finely.
 */
export function Slider(p: SliderProps) {
  const id = useId();
  const dec = p.decimals ?? (p.step && p.step < 1 ? 2 : 0);
  const [draft, setDraft] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const dragging = useRef(false);
  const shown = draft ?? p.value;
  useEffect(() => { if (!dragging.current) setDraft(null); }, [p.value]);

  const commit = (v: number) => {
    dragging.current = false;
    const c = Math.min(p.max, Math.max(p.min, v));
    setDraft(null);
    if (Math.abs(c - p.value) > 1e-9) p.onCommit(c);
  };
  const fmt = (v: number) => v.toFixed(dec) + (p.unit ? ` ${p.unit}` : "");
  const fine = p.step ? p.step / 10 : (p.max - p.min) / 1000;
  const divergent = p.effective !== undefined && Math.abs(p.effective - p.value) > Math.max(1e-6, Math.abs(p.value) * 1e-4);

  return (
    <div className={"slider" + (p.disabled ? " disabled" : "")}>
      <div className="slider-head">
        <label htmlFor={id} title={p.help}>{p.label}</label>
        {editing ? (
          <input
            className="slider-edit" autoFocus aria-label={`${p.label} value`} value={text} inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { const n = Number(text); if (Number.isFinite(n)) commit(n); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
            onBlur={() => { const n = Number(text); if (text !== "" && Number.isFinite(n)) commit(n); setEditing(false); }}
          />
        ) : (
          <button className="slider-value" title="Double-click to type a value" onDoubleClick={() => { setText(String(Number(shown.toFixed(4)))); setEditing(true); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "F2") { setText(String(Number(shown.toFixed(4)))); setEditing(true); } }}>
            {fmt(shown)}
          </button>
        )}
        {p.defaultValue !== undefined && Math.abs(p.defaultValue - p.value) > 1e-9 && (
          <button className="icon-btn" aria-label={`Reset ${p.label}`} title="Reset to preset value" onClick={() => commit(p.defaultValue!)}>↺</button>
        )}
      </div>
      <input
        id={id} type="range" min={0} max={1000} step={1} disabled={p.disabled}
        value={Math.round(toPos(shown, p.min, p.max, p.log) * 1000)}
        aria-valuetext={fmt(shown)}
        onPointerDown={() => { dragging.current = true; }}
        onChange={(e) => setDraft(fromPos(Number(e.target.value) / 1000, p.min, p.max, p.log))}
        onPointerUp={() => { if (draft !== null) commit(draft); else dragging.current = false; }}
        onBlur={() => { if (draft !== null) commit(draft); }}
        onKeyDown={(e) => {
          const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const stepV = e.shiftKey ? fine : p.step ?? (p.max - p.min) / 100;
          const next = p.log ? p.value * Math.pow(p.max / p.min, (dir * (e.shiftKey ? 0.002 : 0.02))) : p.value + dir * stepV;
          commit(next);
        }}
      />
      {(p.lowLabel || p.highLabel) && <div className="slider-ends"><span>{p.lowLabel}</span><span>{p.highLabel}</span></div>}
      {divergent && <div className="slider-eff" title="Base value after macros and mappings">now {fmt(p.effective!)} <span className="muted">(macro-driven)</span></div>}
    </div>
  );
}
