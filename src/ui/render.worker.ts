/// <reference lib="webworker" />
import { renderRecipe, RenderError } from "../audio/render";
import type { DecodedAsset } from "../audio/sources";
import type { Recipe } from "../domain/schema";

const assets = new Map<string, DecodedAsset>();

export type WorkerIn =
  | { type: "asset"; hash: string; sampleRate: number; channels: Float32Array[] }
  | { type: "render"; reqId: number; recipe: Recipe; sampleRate: number; tailMode?: "include" | "fixed"; tailMaxSeconds?: number };

export type WorkerOut =
  | { type: "done"; reqId: number; channels: [Float32Array, Float32Array]; sampleRate: number; warnings: string[]; loop: boolean; bodyFrames: number; tailTruncated: boolean; ms: number }
  | { type: "error"; reqId: number; code: string; message: string };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === "asset") { assets.set(m.hash, { sampleRate: m.sampleRate, channels: m.channels }); return; }
  const t0 = performance.now();
  try {
    const provider = (id: string) => {
      const ref = m.recipe.assets.find((a) => a.id === id);
      return ref ? assets.get(ref.hash) : undefined;
    };
    const r = renderRecipe(m.recipe, { sampleRate: m.sampleRate, assets: provider, tailMode: m.tailMode, tailMaxSeconds: m.tailMaxSeconds, rawTimeline: true });
    const out: WorkerOut = { type: "done", reqId: m.reqId, channels: r.channels, sampleRate: r.sampleRate, warnings: r.warnings, loop: r.loop, bodyFrames: r.bodyFrames, tailTruncated: r.tailTruncated, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(out, [r.channels[0].buffer, r.channels[1].buffer]);
  } catch (err) {
    const code = err instanceof RenderError ? err.code : "error";
    (self as unknown as Worker).postMessage({ type: "error", reqId: m.reqId, code, message: (err as Error).message } satisfies WorkerOut);
  }
};
