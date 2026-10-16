import { decodeWav } from "../export/wav";
import { sha256Hex } from "../domain/hash";
import type { AssetRef } from "../domain/schema";
import type { DecodedAsset } from "../audio/sources";

/** Decoded imports live here, outside undo history. Original bytes are kept untouched for saving. */
const decoded = new Map<string, DecodedAsset>();
const original = new Map<string, Uint8Array>();
export const MAX_IMPORT_SECONDS = 60;

export class ImportError extends Error {}

export async function importWav(file: File): Promise<{ ref: Omit<AssetRef, "id">; asset: DecodedAsset }> {
  if (file.size > 200 * 1024 * 1024) throw new ImportError("This file is very large. Trim it to under 60 seconds first.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let d;
  try { d = decodeWav(bytes, { maxFrames: 48000 * MAX_IMPORT_SECONDS * 4 }); }
  catch (e) { throw new ImportError((e as Error).message); }
  if (d.frames / d.sampleRate > MAX_IMPORT_SECONDS) throw new ImportError(`This recording is ${(d.frames / d.sampleRate).toFixed(0)} seconds long. Version 1 imports up to ${MAX_IMPORT_SECONDS} seconds; trim it in an audio editor first.`);
  const hash = sha256Hex(bytes);
  const asset = { sampleRate: d.sampleRate, channels: d.channels };
  decoded.set(hash, asset);
  original.set(hash, bytes);
  return { ref: { hash, originalName: file.name.slice(0, 200), sampleRate: d.sampleRate, channels: d.channels.length as 1 | 2, frames: d.frames, license: "" }, asset };
}
export const getAsset = (hash: string) => decoded.get(hash);
export const getAssetBytes = (hash: string) => original.get(hash);
export function restoreAsset(hash: string, bytes: Uint8Array): DecodedAsset {
  if (sha256Hex(bytes) !== hash) throw new ImportError("A saved sample does not match its recorded fingerprint. It was changed or corrupted.");
  const d = decodeWav(bytes);
  const asset = { sampleRate: d.sampleRate, channels: d.channels };
  decoded.set(hash, asset); original.set(hash, bytes);
  return asset;
}
