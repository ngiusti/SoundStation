/**
 * Node-side operations shared by the CLI and the MCP server. Both call these functions so
 * GUI/CLI/MCP parity is structural: there is one renderer and one output pipeline.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { validateRecipe } from "../domain/recipe";
import { cloneRecipe } from "../domain/clone";
import { applyMappings, setMacro } from "../domain/mapping";
import { canonicalJson, hashText, sha256Hex } from "../domain/hash";
import { stream } from "../domain/random";
import { ENGINE_VERSION, type ExportSettings, type Recipe } from "../domain/schema";
import { FACTORY_PRESETS, getPreset, searchPresets } from "../presets";
import { renderRecipe, RenderError, type RenderOutput } from "../audio/render";
import type { AssetProvider } from "../audio/sources";
import { analyze, type Analysis } from "../audio/analysis";
import { encodeOutput, processOutput } from "../export/output";
import { decodeWav, WavError } from "../export/wav";
import { sidecarFor } from "../export/sidecar";

export class CliError extends Error {
  constructor(public exitCode: 2 | 3 | 4 | 5 | 130, message: string) { super(message); }
}

export interface RecipeSource {
  preset?: string;
  recipePath?: string;
  recipe?: unknown;
  /** macroId -> 0..100 */
  set?: Record<string, number>;
  seed?: number;
}

export function listPresets(query?: string) {
  const list = query ? searchPresets(query) : FACTORY_PRESETS;
  return list.map((p) => ({
    id: p.id, name: p.name, family: p.family, mode: p.mode, durationSeconds: p.durationSeconds,
    description: p.description, hint: p.hint, tags: p.tags,
    macros: p.macros.map((m) => ({ id: m.id, label: m.label, default: m.defaultValue, low: m.lowLabel, high: m.highLabel, help: m.help })),
  }));
}

/** Accepts a bare recipe, an app project file (.vhsfx.json with embedded samples) or an export sidecar (.recipe.json). */
export function unwrapRecipeFile(raw: unknown): { recipe: unknown; embedded?: Map<string, Uint8Array> } {
  if (raw && typeof raw === "object") {
    const o = raw as { format?: string; tool?: string; recipe?: unknown; assets?: { hash: string; dataBase64: string }[] };
    if (o.format === "vhsfx-project" && o.recipe) {
      const embedded = new Map<string, Uint8Array>();
      for (const a of o.assets ?? []) if (a?.hash && typeof a.dataBase64 === "string") embedded.set(a.hash, new Uint8Array(Buffer.from(a.dataBase64, "base64")));
      return { recipe: o.recipe, embedded };
    }
    if (o.tool === "vh-sfx-lab" && o.recipe) return { recipe: o.recipe };
  }
  return { recipe: raw };
}

export function loadRecipe(src: RecipeSource): { recipe: Recipe; baseDir: string; embedded?: Map<string, Uint8Array> } {
  let raw: unknown;
  let baseDir = process.cwd();
  let embedded: Map<string, Uint8Array> | undefined;
  if (src.recipe !== undefined) { const u = unwrapRecipeFile(src.recipe); raw = u.recipe; embedded = u.embedded; }
  else if (src.recipePath) {
    const p = resolve(src.recipePath);
    if (!existsSync(p)) throw new CliError(2, `Recipe file not found: ${src.recipePath}`);
    try { const u = unwrapRecipeFile(JSON.parse(readFileSync(p, "utf8"))); raw = u.recipe; embedded = u.embedded; } catch (e) { throw new CliError(2, `Recipe is not valid JSON: ${(e as Error).message}`); }
    baseDir = dirname(p);
  } else if (src.preset) {
    const pr = getPreset(src.preset);
    if (!pr) throw new CliError(2, `Unknown preset "${src.preset}". Run list-presets to see ids.`);
    raw = cloneRecipe(pr);
  } else throw new CliError(2, "Provide a preset id or a recipe file.");
  const v = validateRecipe(raw);
  if (!v.ok || !v.recipe) throw new CliError(2, "Invalid recipe:\n  " + v.errors.join("\n  "));
  let recipe = v.recipe;
  for (const [id, val] of Object.entries(src.set ?? {})) {
    try { recipe = setMacro(recipe, id, val); } catch (e) { throw new CliError(2, (e as Error).message); }
  }
  if (src.seed !== undefined) {
    if (!Number.isInteger(src.seed) || src.seed < 0 || src.seed > 0xffffffff) throw new CliError(2, "Seed must be an integer between 0 and 4294967295.");
    recipe = { ...recipe, seed: src.seed };
  }
  return { recipe, baseDir, embedded };
}

/** Assets live in <projectDir>/assets/<sha256>.wav, referenced by hash. Missing or altered files fail loudly. */
export function directoryAssetProvider(recipe: Recipe, baseDir: string, embedded?: Map<string, Uint8Array>): AssetProvider {
  const cache = new Map<string, ReturnType<typeof decodeWav>>();
  return (id) => {
    const ref = recipe.assets.find((a) => a.id === id);
    if (!ref) return undefined;
    if (cache.has(id)) return cache.get(id);
    const file = join(baseDir, "assets", `${ref.hash}.wav`);
    const emb = embedded?.get(ref.hash);
    if (!emb && !existsSync(file)) return undefined;
    const bytes = emb ?? new Uint8Array(readFileSync(file));
    if (sha256Hex(bytes) !== ref.hash) throw new CliError(3, `Asset "${ref.originalName}" does not match its saved hash; it was changed or corrupted.`);
    const d = decodeWav(bytes);
    cache.set(id, d);
    return d;
  };
}

export interface RenderRequest extends RecipeSource {
  out: string;
  sampleRate?: 44100 | 48000;
  channels?: 1 | 2;
  encoding?: ExportSettings["encoding"];
  overwrite?: boolean;
  sidecar?: boolean;
}

export interface RenderResultJson {
  ok: true;
  file: string;
  sidecar?: string;
  recipeId: string;
  seed: number;
  engineVersion: string;
  sampleRate: number;
  channels: number;
  encoding: string;
  frames: number;
  durationSeconds: number;
  loop: boolean;
  audioSha256: string;
  output: { prePeakDbfs: number; postPeakDbfs: number; appliedGainDb: number };
  analysis: Analysis;
  warnings: string[];
}

export function exportSettingsFor(recipe: Recipe, req: Pick<RenderRequest, "sampleRate" | "channels" | "encoding">): ExportSettings {
  return {
    ...recipe.exportDefaults,
    ...(req.sampleRate ? { sampleRate: req.sampleRate } : {}),
    ...(req.channels ? { channels: req.channels } : {}),
    ...(req.encoding ? { encoding: req.encoding } : {}),
  };
}

export function renderToBytes(recipe: Recipe, baseDir: string, settings: ExportSettings, embedded?: Map<string, Uint8Array>) {
  let rendered: RenderOutput;
  try {
    rendered = renderRecipe(recipe, { sampleRate: settings.sampleRate, assets: directoryAssetProvider(recipe, baseDir, embedded), tailMaxSeconds: settings.tailMaxSeconds, tailMode: settings.tailMode });
  } catch (e) {
    if (e instanceof CliError) throw e;
    if (e instanceof RenderError) throw new CliError(e.code === "asset" ? 3 : 4, e.message);
    throw new CliError(4, `Render failed: ${(e as Error).message}`);
  }
  const processed = processOutput(rendered, settings);
  const bytes = encodeOutput(processed, settings, recipe.seed);
  const analysis = analyze(processed.channels, processed.sampleRate, { loop: rendered.loop });
  return { rendered, processed, bytes, analysis };
}

export function atomicWrite(path: string, data: Uint8Array | string, overwrite: boolean) {
  const target = resolve(path);
  if (existsSync(target) && !overwrite) throw new CliError(5, `Output already exists: ${path}. Pass --overwrite to replace it.`);
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw new CliError(5, `Could not write ${path}: ${(e as Error).message}`);
  }
}

export function renderToFile(req: RenderRequest): RenderResultJson {
  const { recipe, baseDir, embedded } = loadRecipe(req);
  const settings = exportSettingsFor(recipe, req);
  const { rendered, processed, bytes, analysis } = renderToBytes(recipe, baseDir, settings, embedded);
  atomicWrite(req.out, bytes, !!req.overwrite);
  const result: RenderResultJson = {
    ok: true, file: req.out, recipeId: recipe.id, seed: recipe.seed, engineVersion: ENGINE_VERSION,
    sampleRate: settings.sampleRate, channels: settings.channels, encoding: settings.encoding,
    frames: rendered.frames, durationSeconds: rendered.frames / settings.sampleRate, loop: rendered.loop,
    audioSha256: sha256Hex(bytes), output: { prePeakDbfs: round(processed.report.prePeakDbfs), postPeakDbfs: round(processed.report.postPeakDbfs), appliedGainDb: round(processed.report.appliedGainDb) },
    analysis, warnings: [...rendered.warnings, ...processed.report.warnings],
  };
  if (req.sidecar !== false) {
    const sc = req.out.replace(/\.wav$/i, "") + ".recipe.json";
    atomicWrite(sc, JSON.stringify(sidecarFor(recipe, settings, result), null, 2), !!req.overwrite);
    result.sidecar = sc;
  }
  return result;
}

const round = (x: number) => Math.round(x * 100) / 100;

export function inspectRecipe(src: RecipeSource) {
  const { recipe } = loadRecipe(src);
  const { table } = applyMappings(recipe);
  return {
    id: recipe.id, name: recipe.name, family: recipe.family, mode: recipe.mode, seed: recipe.seed,
    durationSeconds: recipe.durationSeconds, description: recipe.description, hint: recipe.hint,
    layers: recipe.layers.map((l) => ({ id: l.id, name: l.name, source: l.source.type, startSeconds: l.startSeconds, durationSeconds: l.durationSeconds, gainDb: l.gainDb, mute: l.mute, solo: l.solo })),
    macros: recipe.macros.map((m) => ({ id: m.id, label: m.label, value: m.value, default: m.defaultValue, low: m.lowLabel, high: m.highLabel, help: m.help, locked: m.locked })),
    mappings: recipe.mappings.map((m) => ({ id: m.id, macro: m.source, target: m.target, domain: m.domain, amount: m.amount * m.polarity, curve: m.curve })),
    effectiveValues: table,
    assets: recipe.assets.map((a) => ({ id: a.id, originalName: a.originalName, hash: a.hash.slice(0, 12) })),
    export: recipe.exportDefaults,
  };
}

export function analyzeWavFile(path: string, loop = false) {
  const p = resolve(path);
  if (!existsSync(p)) throw new CliError(2, `File not found: ${path}`);
  try {
    const d = decodeWav(new Uint8Array(readFileSync(p)));
    return analyze(d.channels, d.sampleRate, { loop });
  } catch (e) {
    if (e instanceof WavError) throw new CliError(3, e.message);
    throw e;
  }
}

export const STRENGTHS = { subtle: 0.1, moderate: 0.25, bold: 0.5 } as const;
export type Strength = keyof typeof STRENGTHS;

export interface VariationRequest extends RecipeSource {
  count: number;
  strength: Strength | number;
  outDir: string;
  /** Macro ids to hold constant, in addition to macros marked locked in the recipe. */
  lock?: string[];
  sampleRate?: 44100 | 48000;
  channels?: 1 | 2;
  encoding?: ExportSettings["encoding"];
  overwrite?: boolean;
  /** Candidate numbers to export; default all. */
  only?: number[];
}

/** Resolve one candidate: jitter unlocked macros and derive a fresh seed. Deterministic in (master seed, index). */
export function resolveCandidate(parent: Recipe, index: number, strength: number, lock: Set<string>): { recipe: Recipe; deviations: string[] } {
  const rng = stream(parent.seed, "variation", index);
  const r = cloneRecipe(parent);
  r.seed = Math.floor(rng.next() * 0xffffffff) >>> 0;
  r.id = `${parent.id}-v${String(index).padStart(3, "0")}`;
  const deviations: string[] = [];
  for (const m of r.macros) {
    if (m.locked || lock.has(m.id)) continue;
    const delta = rng.bipolar() * strength * 50;
    const v = Math.min(100, Math.max(0, m.value + delta));
    if (Math.abs(v - m.value) > 0.5) deviations.push(`${m.label} ${v >= m.value ? "+" : "-"}${Math.abs(v - m.value).toFixed(0)}`);
    m.value = Math.round(v * 10) / 10;
  }
  return { recipe: r, deviations };
}

export function variationFileName(r: Recipe, index: number): string {
  return `VH_${r.fileCategory}_${r.fileName}_${String(index).padStart(3, "0")}.wav`;
}

export function renderVariations(req: VariationRequest) {
  if (!Number.isInteger(req.count) || req.count < 1 || req.count > 100) throw new CliError(2, "Count must be a whole number from 1 to 100.");
  const strength = typeof req.strength === "number" ? req.strength : STRENGTHS[req.strength];
  if (strength === undefined || !(strength >= 0 && strength <= 1)) throw new CliError(2, "Strength must be subtle, moderate, bold or a number from 0 to 1.");
  const { recipe: parent, baseDir, embedded } = loadRecipe(req);
  for (const id of req.lock ?? []) if (!parent.macros.some((m) => m.id === id)) throw new CliError(2, `Cannot lock unknown macro "${id}".`);
  const lock = new Set(req.lock ?? []);
  const settings = exportSettingsFor(parent, req);
  const files: unknown[] = [];
  let failed = 0;
  for (let i = 1; i <= req.count; i++) {
    if (req.only && !req.only.includes(i)) continue;
    const { recipe, deviations } = resolveCandidate(parent, i, strength, lock);
    const name = variationFileName(parent, i);
    try {
      const { rendered, processed, bytes, analysis } = renderToBytes(recipe, baseDir, settings, embedded);
      const out = join(req.outDir, name);
      atomicWrite(out, bytes, !!req.overwrite);
      const entry = {
        ok: true, candidate: i, file: out, seed: recipe.seed, frames: rendered.frames, durationSeconds: rendered.frames / settings.sampleRate,
        peakDbfs: analysis.peakDbfs, rmsDbfs: analysis.rmsDbfs, deviations, audioSha256: sha256Hex(bytes),
        warnings: [...rendered.warnings, ...processed.report.warnings],
      };
      atomicWrite(out.replace(/\.wav$/i, "") + ".recipe.json", JSON.stringify(sidecarFor(recipe, settings, { frames: rendered.frames, audioSha256: entry.audioSha256, output: { prePeakDbfs: processed.report.prePeakDbfs, postPeakDbfs: processed.report.postPeakDbfs, appliedGainDb: processed.report.appliedGainDb }, loop: rendered.loop, warnings: entry.warnings }, { parentRecipeId: parent.id, candidate: i, deviations }), null, 2), !!req.overwrite);
      files.push(entry);
    } catch (e) {
      failed++;
      files.push({ ok: false, candidate: i, file: join(req.outDir, name), error: (e as Error).message });
      if (e instanceof CliError && e.exitCode === 5) break; // disk problems: stop early
    }
  }
  const manifest = { tool: "vh-sfx-lab", engineVersion: ENGINE_VERSION, parent: parent.id, parentSeed: parent.seed, strength, locked: [...lock, ...parent.macros.filter((m) => m.locked).map((m) => m.id)], settings, files };
  try { atomicWrite(join(req.outDir, `VH_${parent.fileCategory}_${parent.fileName}_manifest.json`), JSON.stringify(manifest, null, 2), true); } catch { /* manifest is best effort */ }
  return { ok: failed === 0, failed, manifest };
}

export { hashText, canonicalJson };
