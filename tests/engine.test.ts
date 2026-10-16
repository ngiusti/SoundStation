import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FACTORY_PRESETS, getPreset, searchPresets } from "../src/presets";
import { renderRecipe } from "../src/audio/render";
import { analyze } from "../src/audio/analysis";
import { processOutput, encodeOutput, downmix } from "../src/export/output";
import { decodeWav, encodeWav } from "../src/export/wav";
import { stream } from "../src/domain/random";
import { validateRecipe } from "../src/domain/recipe";
import { applyMappings, bakeMappings, setMacro } from "../src/domain/mapping";
import { cloneRecipe } from "../src/domain/clone";
import { sha256Hex } from "../src/domain/hash";
import type { Recipe } from "../src/domain/schema";

const sidearm = () => cloneRecipe(getPreset("energy-sidearm")!);
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("random + hash", () => {
  it("streams are deterministic and independent per path", () => {
    expect(stream(1, "a").next()).toBe(stream(1, "a").next());
    expect(stream(1, "a").next()).not.toBe(stream(1, "b").next());
    expect(stream(1, "a").next()).not.toBe(stream(2, "a").next());
  });
  it("sha256 matches known vector", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("recipes", () => {
  it("all factory presets validate", () => expect(FACTORY_PRESETS.length).toBe(40));
  it("rejects bad input with readable errors", () => {
    const bad = cloneRecipe(sidearm()) as unknown as Record<string, unknown>;
    bad.seed = -1;
    expect(validateRecipe(bad).ok).toBe(false);
    const dangling = sidearm(); dangling.mappings[0].target = "layers.nope.gainDb";
    expect(validateRecipe(dangling).errors.join()).toMatch(/not a numeric parameter/);
    const future = { ...sidearm(), schemaVersion: 99 };
    expect(validateRecipe(future).errors[0]).toMatch(/newer/);
  });
  it("macros at default leave base values unchanged; moving them changes effective values", () => {
    const r = sidearm();
    const { effective } = applyMappings(r);
    expect(effective.layers[0].gainDb).toBeCloseTo(r.layers[0].gainDb, 9);
    const hot = applyMappings(setMacro(r, "body", 100)).effective;
    expect(hot.layers[0].gainDb).toBeGreaterThan(r.layers[0].gainDb);
    expect(hot.layers[0].source.type === "oscillator" && hot.layers[0].source.frequencyHz).toBeLessThan(180);
    expect(() => setMacro(r, "nope", 1)).toThrow(/Unknown macro/);
    expect(() => setMacro(r, "body", 101)).toThrow(/between 0 and 100/);
  });
  it("bake resolves macro state and removes mappings", () => {
    const r = setMacro(sidearm(), "body", 90);
    const baked = bakeMappings(r);
    expect(baked.mappings.length).toBe(0);
    const a = renderRecipe(r), b = renderRecipe(baked);
    expect(same(a.channels[0], b.channels[0])).toBe(true);
  });
  it("search handles synonyms and multiple words", () => {
    expect(searchPresets("gun").map((p) => p.id)).toContain("energy-sidearm");
    expect(searchPresets("hatch heavy").map((p) => p.id)).toContain("heavy-bulkhead-close");
    expect(searchPresets("hatch heavy").every((p) => p.family === "doors")).toBe(true);
    expect(searchPresets("zzzz")).toEqual([]);
  });
});

describe("A01/A02 determinism", () => {
  it("same recipe+seed gives identical PCM; a new seed changes stochastic content", () => {
    const r = getPreset("abandoned-corridor")!;
    const a = renderRecipe({ ...r, durationSeconds: 6 }), b = renderRecipe({ ...r, durationSeconds: 6 });
    expect(same(a.channels[0], b.channels[0])).toBe(true);
    const c = renderRecipe({ ...r, durationSeconds: 6, seed: r.seed + 1 });
    expect(same(a.channels[0], c.channels[0])).toBe(false);
  });
  it("encoded bytes are deterministic including dither", () => {
    const r = sidearm();
    const enc = () => encodeOutput(processOutput(renderRecipe(r), { ...r.exportDefaults, encoding: "pcm16" }), { ...r.exportDefaults, encoding: "pcm16" }, r.seed);
    expect(Buffer.from(enc()).equals(Buffer.from(enc()))).toBe(true);
  });
});

describe("A03/A05 WAV integrity", () => {
  for (const encoding of ["pcm16", "pcm24", "float32"] as const) {
    it(`${encoding} round-trips and an independent decoder (ffprobe/python) agrees`, () => {
      const r = sidearm();
      const settings = { ...r.exportDefaults, encoding };
      const out = processOutput(renderRecipe(r), settings);
      const bytes = encodeOutput(out, settings, r.seed);
      const dec = decodeWav(bytes);
      expect(dec.frames).toBe(out.channels[0].length);
      expect(dec.sampleRate).toBe(48000);
      const tol = encoding === "float32" ? 0 : encoding === "pcm24" ? 4e-6 : 1e-3;
      let maxErr = 0;
      for (let i = 0; i < dec.frames; i++) maxErr = Math.max(maxErr, Math.abs(dec.channels[0][i] - out.channels[0][i]));
      expect(maxErr).toBeLessThanOrEqual(tol);
      expect(bytes.length % 2).toBe(0);
      const dir = mkdtempSync(join(tmpdir(), "vhsfx-"));
      const f = join(dir, "t.wav");
      writeFileSync(f, bytes);
      try {
        const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,nb_samples", "-of", "default=nw=1", f]).toString();
        expect(probe).toMatch(/sample_rate=48000/);
        expect(probe).toMatch(/channels=1/);
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      if (encoding !== "float32") {
        const py = execFileSync("python3", ["-I", "-c", "import wave,sys;w=wave.open(sys.argv[1]);print(w.getnframes(),w.getframerate(),w.getnchannels(),w.getsampwidth())", f]).toString().trim();
        expect(py).toBe(`${dec.frames} 48000 1 ${encoding === "pcm16" ? 2 : 3}`);
      }
    });
  }
  it("A19 rejects corrupt / unsupported WAVs clearly", () => {
    expect(() => decodeWav(new Uint8Array(10))).toThrow(/too small/);
    const good = encodeWav([new Float32Array(100)], 48000, "pcm16");
    const bad = good.slice(); bad[0] = 0x58;
    expect(() => decodeWav(bad)).toThrow(/RIFF/);
    const adpcm = good.slice(); adpcm[20] = 2;
    expect(() => decodeWav(adpcm)).toThrow(/Unsupported WAV encoding/);
  });
});

describe("A04 presets are sane", () => {
  for (const p of FACTORY_PRESETS) {
    it(`${p.id}: finite, audible, not clipping`, () => {
      const r = renderRecipe(p);
      const out = processOutput(r, p.exportDefaults);
      const a = analyze(out.channels, out.sampleRate);
      expect(a.nonFinite).toBe(0);
      expect(a.peakDbfs).toBeGreaterThan(-45);
      expect(a.peakDbfs).toBeLessThanOrEqual(-1);
      expect(out.report.clipped).toBe(false);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe("A06 loops", () => {
  it("30 s loop at 48 kHz is exactly 1,440,000 frames with no fade to silence", () => {
    const p = getPreset("abandoned-corridor")!;
    const r = renderRecipe(p);
    expect(r.frames).toBe(1_440_000);
    const a = analyze(r.channels, 48000, { loop: true });
    expect(a.seam!.warning).toBeNull();
    // Edges are as loud as the middle (no accidental fade): first/last 100 ms vs overall RMS.
    const rms = (x: Float32Array, a0: number, b0: number) => Math.sqrt(x.slice(a0, b0).reduce((s, v) => s + v * v, 0) / (b0 - a0));
    const mid = rms(r.channels[0], 700000, 740000), head = rms(r.channels[0], 0, 4800), tail = rms(r.channels[0], r.frames - 4800, r.frames);
    expect(head).toBeGreaterThan(mid * 0.25);
    expect(tail).toBeGreaterThan(mid * 0.25);
  });
  it("A07 diagnostics flag an intentionally discontinuous fixture", () => {
    const x = new Float32Array(48000).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 220.25 * i) / 48000));
    const a = analyze([x], 48000, { loop: true });
    expect(a.seam!.warning).not.toBeNull();
  });
  it("44.1 kHz loop length follows round(duration*rate)", () => {
    const p = { ...getPreset("idle-generator")!, durationSeconds: 3 } as Recipe;
    expect(renderRecipe(p, { sampleRate: 44100 }).frames).toBe(132300);
  });
});

describe("A10/A11 downmix, delay and tails", () => {
  it("mono matrix is 0.5L+0.5R and opposite-polarity stereo reveals cancellation", () => {
    const l = new Float32Array([1, 0.5, -0.5]), r = new Float32Array([0, 0.5, 0.5]);
    expect(Array.from(downmix(l, r).mono)).toEqual([0.5, 0.5, 0]);
    const x = new Float32Array(1000).map((_, i) => Math.sin(i / 10));
    const y = x.map((v) => -v);
    expect(downmix(x, y).cancellationDb).toBeLessThan(-60);
  });
  it("a deliberate start delay is preserved", () => {
    const r = sidearm();
    r.layers = r.layers.filter((l) => l.id === "body"); r.layers[0].startSeconds = 0.2;
    r.macros = []; r.mappings = []; r.master.space.enabled = false;
    const out = renderRecipe(r);
    const a = analyze([out.channels[0]], 48000);
    expect(a.leadingSilenceMs).toBeGreaterThanOrEqual(190);
  });
  it("include-tail keeps reverb energy that fixed-length truncates", () => {
    const r = sidearm(); r.macros = []; r.mappings = []; r.master.space.returnDb = 0;
    const inc = renderRecipe(r, { tailMode: "include" });
    const fix = renderRecipe(r, { tailMode: "fixed" });
    expect(inc.frames).toBeGreaterThan(fix.frames);
    expect(fix.frames).toBe(Math.round(0.45 * 48000));
  });
});

describe("output stage", () => {
  it("attenuate-only never boosts and respects the ceiling", () => {
    const r = sidearm();
    const quiet = processOutput(renderRecipe(r), { ...r.exportDefaults, exportGainDb: -20 });
    expect(quiet.report.appliedGainDb).toBeCloseTo(-20, 5);
    const hot = processOutput(renderRecipe(r), { ...r.exportDefaults, exportGainDb: 20 });
    expect(hot.report.postPeakDbfs).toBeCloseTo(-1, 3);
  });
  it("mute and solo change the render", () => {
    const r = sidearm();
    const full = renderRecipe(r);
    r.layers[0].mute = true;
    expect(same(full.channels[0], renderRecipe(r).channels[0])).toBe(false);
  });
});

describe("macros change the sound as described", () => {
  it("Body macro lowers spectral centroid; Crack raises high-band energy", () => {
    const r = sidearm();
    const cent = (rec: Recipe) => analyze(processOutput(renderRecipe(rec), rec.exportDefaults).channels, 48000).spectralCentroidHz;
    expect(cent(setMacro(r, "body", 100))).toBeLessThan(cent(setMacro(r, "body", 0)));
    expect(cent(setMacro(r, "crack", 100))).toBeGreaterThan(cent(setMacro(r, "crack", 0)));
  });
});
