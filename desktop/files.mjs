// File-safety helpers for the desktop shell. No Electron imports, so they are unit-tested directly.
import { promises as fs } from "node:fs";
import path from "node:path";

export const MAX_FILE = 512 * 1024 * 1024;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/;
const ALLOWED_EXT = new Set([".wav", ".json"]);

/** Plain file names only: no separators, no "..", only .wav and .json. */
export function checkName(name) {
  if (typeof name !== "string" || !SAFE_NAME.test(name) || name.includes("..")) throw new Error("That file name is not allowed.");
  if (!ALLOWED_EXT.has(path.extname(name).toLowerCase())) throw new Error("Only .wav and .json files can be saved.");
  return name;
}

export function toBuffer(data) {
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === "string") return Buffer.from(data, "utf8");
  throw new Error("Unsupported data.");
}

/**
 * Writes dir/name without ever overwriting: data goes to a temp file, then a hard link puts it at the final name
 * (the link fails if the name exists, so a number is added instead). A cancelled or failed write leaves no
 * partial file under the intended name. Returns the name actually used.
 */
export async function writeUnique(dir, name, buf) {
  checkName(name);
  if (buf.length > MAX_FILE) throw new Error("That file is too large to save.");
  const real = await fs.realpath(dir);
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  const tmp = path.join(real, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  try {
    await fs.writeFile(tmp, buf, { flag: "wx" });
    for (let n = 1; n < 1000; n++) {
      const candidate = n === 1 ? name : `${base}_${n}${ext}`;
      const target = path.join(real, candidate);
      if (path.dirname(target) !== real) throw new Error("Blocked: path escapes the chosen folder.");
      try { await fs.link(tmp, target); return candidate; }
      catch (e) {
        if (e.code === "EEXIST") continue;
        if (e.code === "EPERM" || e.code === "ENOSYS" || e.code === "EXDEV") { // filesystem without hard links
          try { await fs.access(target); continue; } catch { /* name is free */ }
          await fs.rename(tmp, target);
          return candidate;
        }
        throw e;
      }
    }
    throw new Error("Could not find a free file name.");
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
