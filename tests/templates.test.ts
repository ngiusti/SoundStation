import { describe, expect, it } from "vitest";
import { SAMPLE_TEMPLATES, buildTemplate } from "../src/presets/templates";
import { renderRecipe } from "../src/audio/render";
import { processOutput } from "../src/export/output";
import { analyze } from "../src/audio/analysis";
import { setMacro } from "../src/domain/mapping";
import { Rng } from "../src/domain/random";
import { sha256Hex } from "../src/domain/hash";
import { encodeWav } from "../src/export/wav";

// A generated "recording": a decaying noise burst with a little leading silence. No bundled audio is needed.
const sr = 48000, frames = Math.round(0.4 * sr);
const rng = new Rng(7);
const rec = new Float32Array(frames).map((_, i) => (i < 480 ? 0 : (rng.bipolar() * 0.6 * Math.exp(-(i - 480) / 5000))));
const bytes = encodeWav([rec], sr, "pcm16");
const info = { assetId: "sample1", seconds: frames / sr, ref: { hash: sha256Hex(bytes), originalName: "step.wav", sampleRate: sr, channels: 1 as const, frames, license: "" } };
const provider = (id: string) => (id === "sample1" ? { sampleRate: sr, channels: [rec] } : undefined);

describe("sample templates", () => {
  it("there are five, each saying what to record, and none bundle audio", () => {
    expect(SAMPLE_TEMPLATES.length).toBe(5);
    for (const t of SAMPLE_TEMPLATES) { expect(t.record.length).toBeGreaterThan(40); expect(t.description.length).toBeGreaterThan(20); }
  });
  for (const t of SAMPLE_TEMPLATES) {
    it(`${t.name}: builds a valid recipe, renders audibly, every macro changes it, original recording untouched`, () => {
      const before = Array.from(rec.slice(0, 2000));
      const r = buildTemplate(t, info);
      expect(r.assets[0].hash).toBe(info.ref.hash);
      const base = renderRecipe(r, { assets: provider });
      const out = processOutput(base, r.exportDefaults);
      const a = analyze(out.channels, sr);
      expect(a.nonFinite).toBe(0);
      expect(a.peakDbfs).toBeGreaterThan(-45);
      expect(a.peakDbfs).toBeLessThanOrEqual(-1);
      for (const m of r.macros) {
        const diff = (v: number) => { const x = renderRecipe(setMacro(r, m.id, v), { assets: provider }); let d = 0; const n = Math.min(x.frames, base.frames); for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(x.channels[0][i] - base.channels[0][i])); return d + Math.abs(x.frames - base.frames); };
        expect(Math.max(diff(0), diff(100)), `${t.id}/${m.id}`).toBeGreaterThan(1e-4);
      }
      expect(Array.from(rec.slice(0, 2000))).toEqual(before);
    });
  }
  it("a template without its recording fails with a clear asset message", () => {
    const r = buildTemplate(SAMPLE_TEMPLATES[0], info);
    expect(() => renderRecipe(r)).toThrow(/missing/i);
  });
});
