/** Browser storage is a per-viewer convenience only; every access is guarded and the app works without it. */
import { validateRecipe } from "../domain/recipe";
import type { Recipe } from "../domain/schema";

export function safeGet(key: string): string | null {
  try { return localStorage.getItem("vhsfx." + key); } catch { return null; }
}
export function safeSet(key: string, value: string) {
  try { localStorage.setItem("vhsfx." + key, value); } catch { /* storage unavailable */ }
}
export function loadJson<T>(key: string, fallback: T): T {
  const s = safeGet(key);
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
export const saveJson = (key: string, v: unknown) => safeSet(key, JSON.stringify(v));

export function loadUserPresets(): Recipe[] {
  const raw = loadJson<unknown[]>("userPresets", []);
  const out: Recipe[] = [];
  for (const r of raw) { const v = validateRecipe(r); if (v.ok && v.recipe) out.push(v.recipe); }
  return out;
}
export const saveUserPresets = (p: Recipe[]) => saveJson("userPresets", p);

export interface ExportTarget {
  /** Folder name for display, or null when files go to the browser's Downloads folder. */
  folder: string | null;
  /** Writes a file and returns the name actually used. Never overwrites an existing file. */
  write(name: string, data: BlobPart, mime: string): Promise<string>;
}

type Dir = {
  name: string;
  getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>;
};
let dir: Dir | null = null;

export const canPickFolder = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
export const currentFolderName = () => dir?.name ?? null;

/** Must be called from a click handler (the browser requires a user gesture to open the folder picker). */
export async function pickExportFolder(): Promise<boolean> {
  const w = window as unknown as { showDirectoryPicker?: (o: unknown) => Promise<Dir> };
  if (!w.showDirectoryPicker) return false;
  try { dir = await w.showDirectoryPicker({ mode: "readwrite", id: "vhsfx-export" }); return true; }
  catch (e) { if ((e as DOMException).name === "AbortError") return false; throw e; }
}

export function exportTarget(): ExportTarget {
  const d = dir;
  if (d) {
    return {
      folder: d.name,
      async write(name, data, mime) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
        let candidate = name;
        for (let n = 2; n < 1000; n++) {
          try { await d.getFileHandle(candidate); candidate = `${base}_${n}${ext}`; }
          catch (e) { if ((e as DOMException).name === "NotFoundError") break; throw e; }
        }
        const h = await d.getFileHandle(candidate, { create: true });
        const w = await h.createWritable();
        try { await w.write(new Blob([data], { type: mime })); await w.close(); }
        catch (e) { try { await w.abort(); } catch { /* ignore */ } throw e; }
        return candidate;
      },
    };
  }
  return {
    folder: null,
    async write(name, data, mime) {
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return name;
    },
  };
}

/** One-off save with the native picker (project files), falling back to a download. */
export async function saveFile(name: string, data: BlobPart, mime: string): Promise<string> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ name: string; createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (w.showSaveFilePicker) {
    const h = await w.showSaveFilePicker({ suggestedName: name });
    const wr = await h.createWritable();
    await wr.write(new Blob([data], { type: mime }));
    await wr.close();
    return h.name;
  }
  return pickDownload(name, data, mime);
}
function pickDownload(name: string, data: BlobPart, mime: string): string {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
