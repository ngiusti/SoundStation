import { useMemo, useState } from "react";
import { Modal } from "./Modal";

export interface PaletteAction { id: string; label: string; keywords: string; run: () => void; enabled?: boolean }

export function Palette({ actions, onClose }: { actions: PaletteAction[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return actions.filter((a) => a.enabled !== false && words.every((w) => `${a.label} ${a.keywords}`.toLowerCase().includes(w)));
  }, [q, actions]);
  const run = (a?: PaletteAction) => { if (a) { onClose(); setTimeout(a.run, 0); } };
  return (
    <Modal title="Action palette" onClose={onClose}>
      <input autoFocus className="search" aria-label="Search actions" placeholder="Type an action, e.g. make mono, show layers, export" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === "Enter") run(list[sel]);
        }} />
      <ul className="palette-list" role="listbox">
        {list.map((a, i) => <li key={a.id} role="option" aria-selected={i === sel}><button className={i === sel ? "on" : ""} onClick={() => run(a)}>{a.label}</button></li>)}
        {list.length === 0 && <li className="muted">No action matches. Try “export”, “mono”, “layers” or “undo”.</li>}
      </ul>
    </Modal>
  );
}
