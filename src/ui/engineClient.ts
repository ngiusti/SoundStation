import type { Recipe } from "../domain/schema";
import type { WorkerIn, WorkerOut } from "./render.worker";

export type RenderDone = Extract<WorkerOut, { type: "done" }>;
export class RenderFailed extends Error { constructor(public code: string, message: string) { super(message); } }
export class Superseded extends Error { constructor() { super("superseded"); } }

interface Job {
  reqId: number; recipe: Recipe; sampleRate: number; tailMode?: "include" | "fixed"; tailMaxSeconds?: number;
  resolve: (r: RenderDone) => void; reject: (e: Error) => void;
}

/**
 * One worker, one active render. While busy only the newest waiting request is kept
 * (older waiting requests reject with Superseded), so stale work never becomes the preview
 * and memory stays bounded. `fifo` clients (export) never supersede.
 */
export class RenderClient {
  private worker: Worker;
  private active: Job | null = null;
  private waiting: Job[] = [];
  private nextId = 1;
  private sentAssets = new Set<string>();

  constructor(private fifo = false) {
    this.worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      const job = this.active;
      if (!job || m.reqId !== job.reqId) return;
      this.active = null;
      if (m.type === "done") job.resolve(m); else job.reject(new RenderFailed(m.code, m.message));
      this.pump();
    };
  }

  provideAsset(hash: string, sampleRate: number, channels: Float32Array[]) {
    if (this.sentAssets.has(hash)) return;
    this.sentAssets.add(hash);
    // Copies, so the main thread keeps its own decoded data for the other worker and for saving.
    this.worker.postMessage({ type: "asset", hash, sampleRate, channels: channels.map((c) => c.slice()) } satisfies WorkerIn);
  }

  render(recipe: Recipe, opts: { sampleRate: number; tailMode?: "include" | "fixed"; tailMaxSeconds?: number }): Promise<RenderDone> {
    return new Promise((resolve, reject) => {
      const job: Job = { reqId: this.nextId++, recipe: JSON.parse(JSON.stringify(recipe)), sampleRate: opts.sampleRate, tailMode: opts.tailMode, tailMaxSeconds: opts.tailMaxSeconds, resolve, reject };
      if (!this.fifo) { for (const w of this.waiting) w.reject(new Superseded()); this.waiting = []; }
      this.waiting.push(job);
      this.pump();
    });
  }

  get busy() { return this.active !== null; }

  private pump() {
    if (this.active || this.waiting.length === 0) return;
    const job = this.waiting.shift()!;
    this.active = job;
    this.worker.postMessage({ type: "render", reqId: job.reqId, recipe: job.recipe, sampleRate: job.sampleRate, tailMode: job.tailMode, tailMaxSeconds: job.tailMaxSeconds } satisfies WorkerIn);
  }
}
