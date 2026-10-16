import { useMemo, useRef } from "react";
import type { Recipe } from "../../domain/schema";
import { searchPresets } from "../../presets";
import { SAMPLE_TEMPLATES, type SampleTemplate } from "../../presets/templates";

export type Filter = "factory" | "templates" | "user" | "favorites" | "recent";

interface Props {
  factory: Recipe[];
  user: Recipe[];
  favorites: string[];
  recent: string[];
  query: string;
  filter: Filter;
  family: string | null;
  currentId: string | null;
  onQuery: (q: string) => void;
  onFilter: (f: Filter) => void;
  onFamily: (f: string | null) => void;
  onPick: (r: Recipe) => void;
  onPickTemplate: (t: SampleTemplate) => void;
  onFavorite: (id: string) => void;
  onDeleteUser: (id: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

const FILTERS: [Filter, string][] = [["factory", "Factory"], ["templates", "Add your recording"], ["user", "My presets"], ["favorites", "Favorites"], ["recent", "Recent"]];

export function Browser(p: Props) {
  const all = useMemo(() => [...p.factory, ...p.user], [p.factory, p.user]);
  const pool = useMemo(() => {
    switch (p.filter) {
      case "factory": return p.factory;
      case "templates": return [];
      case "user": return p.user;
      case "favorites": return all.filter((r) => p.favorites.includes(r.id));
      case "recent": return p.recent.map((id) => all.find((r) => r.id === id)).filter((r): r is Recipe => !!r);
    }
  }, [p.filter, p.factory, p.user, p.favorites, p.recent, all]);
  const shown = useMemo(() => searchPresets(p.query, p.family ?? undefined, pool), [pool, p.query, p.family]);
  const families = useMemo(() => [...new Set(all.map((r) => r.family))].sort(), [all]);
  const first = useRef<HTMLButtonElement>(null);

  return (
    <aside className="browser" aria-label="Sound browser">
      <input ref={p.searchRef} className="search" type="search" placeholder="Search sounds (gun, door, loop…)" aria-label="Search sounds" value={p.query}
        onChange={(e) => p.onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); first.current?.focus(); } }} />
      <div className="chips" role="tablist" aria-label="Library">
        {FILTERS.map(([f, label]) => <button key={f} role="tab" aria-selected={p.filter === f} className={"chip" + (p.filter === f ? " on" : "")} onClick={() => p.onFilter(f)}>{label}</button>)}
      </div>
      <div className="chips" aria-label="Categories">
        <button className={"chip" + (p.family === null ? " on" : "")} aria-pressed={p.family === null} onClick={() => p.onFamily(null)}>All</button>
        {families.map((f) => <button key={f} className={"chip" + (p.family === f ? " on" : "")} aria-pressed={p.family === f} onClick={() => p.onFamily(p.family === f ? null : f)}>{f}</button>)}
      </div>
      {p.filter === "templates" ? (
        <ul className="cards">
          {SAMPLE_TEMPLATES.filter((t) => !p.query || `${t.name} ${t.tags.join(" ")} ${t.description}`.toLowerCase().includes(p.query.toLowerCase())).map((t) => (
            <li key={t.id} className="card">
              <button className="card-main" onClick={() => p.onPickTemplate(t)}>
                <span className="card-title">{t.name}</span>
                <span className="card-desc">{t.description}</span>
                <span className="card-desc"><strong>What to record:</strong> {t.record}</span>
                <span className="badges"><span className="badge">Needs your WAV</span><span className="badge">Choose file…</span></span>
              </button>
            </li>
          ))}
          <li className="empty">No audio is included. These templates build a sound around a recording you provide (WAV, up to 60 s).</li>
        </ul>
      ) : (
      <ul className="cards">
        {shown.map((r, i) => (
          <li key={r.id} className={"card" + (r.id === p.currentId ? " current" : "")}>
            <button ref={i === 0 ? first : undefined} className="card-main" onClick={() => p.onPick(r)} aria-current={r.id === p.currentId}>
              <span className="card-title">{r.name}</span>
              <span className="card-desc">{r.description}</span>
              <span className="badges"><span className="badge">{r.mode === "loop" ? "Loop" : "One-shot"}</span><span className="badge">{r.durationSeconds < 10 ? r.durationSeconds.toFixed(1) : r.durationSeconds.toFixed(0)} s</span><span className="badge">{r.family}</span></span>
            </button>
            <button className={"star" + (p.favorites.includes(r.id) ? " on" : "")} aria-pressed={p.favorites.includes(r.id)} aria-label={`${p.favorites.includes(r.id) ? "Remove" : "Add"} ${r.name} ${p.favorites.includes(r.id) ? "from" : "to"} favorites`} onClick={() => p.onFavorite(r.id)}>★</button>
            {p.filter === "user" && <button className="icon-btn" aria-label={`Delete ${r.name}`} title="Delete this preset" onClick={() => p.onDeleteUser(r.id)}>🗑</button>}
          </li>
        ))}
        {shown.length === 0 && (
          <li className="empty">
            {p.query ? <>No sounds match “{p.query}”. Try a broader word such as <button className="link" onClick={() => p.onQuery("door")}>door</button>, <button className="link" onClick={() => p.onQuery("weapon")}>weapon</button> or <button className="link" onClick={() => p.onQuery("loop")}>loop</button>.</>
              : p.filter === "user" ? "You have not saved any presets yet. Shape a sound, then press Save Preset."
              : p.filter === "favorites" ? "Star a sound to keep it here." : p.filter === "recent" ? "Sounds you open will appear here." : "Nothing here."}
          </li>
        )}
      </ul>
      )}
    </aside>
  );
}
