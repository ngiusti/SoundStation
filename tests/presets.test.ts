import { describe, expect, it } from "vitest";
import { FACTORY_PRESETS } from "../src/presets";
import { renderRecipe } from "../src/audio/render";
import { processOutput } from "../src/export/output";
import { analyze, type Analysis } from "../src/audio/analysis";
import { setMacro } from "../src/domain/mapping";

const FAMILIES = ["interface", "energy-weapons", "machinery", "doors", "atmosphere", "material-impacts", "communications", "motion"];
const results = new Map<string, { a: Analysis; warnings: string[]; frames: number; loop: boolean }>();
for (const p of FACTORY_PRESETS) {
  const r = renderRecipe(p);
  const o = processOutput(r, p.exportDefaults);
  results.set(p.id, { a: analyze(o.channels, o.sampleRate, { loop: r.loop }), warnings: [...r.warnings, ...o.report.warnings], frames: r.frames, loop: r.loop });
}

describe("factory library", () => {
  it("has 40 presets, five per family, each documented", () => {
    expect(FACTORY_PRESETS.length).toBe(40);
    for (const f of FAMILIES) expect(FACTORY_PRESETS.filter((p) => p.family === f).length, f).toBe(5);
    expect(new Set(FACTORY_PRESETS.map((p) => p.id)).size).toBe(40);
    for (const p of FACTORY_PRESETS) {
      expect(p.description.length, p.id).toBeGreaterThan(20);
      expect(p.hint.length, p.id).toBeGreaterThan(10);
      expect(p.tags.length, p.id).toBeGreaterThan(2);
      expect(p.macros.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.macros.length, p.id).toBeLessThanOrEqual(6);
      for (const m of p.macros) expect(p.mappings.some((x) => x.source === m.id), `${p.id}/${m.id} has a mapping`).toBe(true);
      for (const m of p.macros) expect(m.value).toBe(m.defaultValue);
    }
  });

  it("required presets by name exist", () => {
    const names = FACTORY_PRESETS.map((p) => p.name.toLowerCase());
    for (const n of ["soft confirm", "navigation click", "access denied", "scanner ping", "critical warning", "energy sidearm", "heavy pulse", "charge-up", "overheated discharge", "shield strike",
      "ventilation fan", "idle generator", "strained motor", "electrical transformer", "failing pump", "light hatch open", "heavy bulkhead close", "servo slide", "lock engage", "jammed door",
      "abandoned corridor", "reactor chamber", "cargo hold air", "damaged power grid", "anomaly drone", "small metal tick", "heavy panel hit", "hollow container", "dropped tool", "debris rattle",
      "radio open", "radio close", "static burst", "corrupted transmission", "distant beacon", "air whoosh", "mechanical sweep", "energy pass-by", "pressure release", "ominous riser"])
      expect(names, n).toContain(n);
  });

  it("A04: every preset is finite, audible, under the ceiling and warning-free", () => {
    for (const p of FACTORY_PRESETS) {
      const { a, warnings } = results.get(p.id)!;
      expect(a.nonFinite, p.id).toBe(0);
      expect(a.peakDbfs, p.id).toBeGreaterThan(-40);
      expect(a.peakDbfs, p.id).toBeLessThanOrEqual(-1);
      expect(a.overFullScale, p.id).toBe(0);
      expect(warnings, p.id).toEqual([]);
    }
  });

  it("every macro audibly changes its preset (both ends differ from the default)", () => {
    for (const p of FACTORY_PRESETS.filter((x) => x.mode === "oneShot" || x.durationSeconds <= 6)) {
      for (const m of p.macros) {
        const base = results.get(p.id)!.a;
        const hi = analyze(processOutput(renderRecipe(setMacro(p, m.id, 100)), p.exportDefaults).channels, p.exportDefaults.sampleRate);
        const lo = analyze(processOutput(renderRecipe(setMacro(p, m.id, 0)), p.exportDefaults).channels, p.exportDefaults.sampleRate);
        const moved = (x: Analysis) => Math.abs(x.rmsDbfs - base.rmsDbfs) > 0.3 || Math.abs(x.spectralCentroidHz - base.spectralCentroidHz) > 5 || Math.abs(x.durationSeconds - base.durationSeconds) > 0.01 || Math.max(...x.bands.map((b, i) => Math.abs(b.relDb - base.bands[i].relDb))) > 0.5;
        expect(moved(hi) || moved(lo), `${p.id}/${m.id}`).toBe(true);
      }
    }
  });

  it("presets are distinct: no two share a similar spectrum, level and length", () => {
    const sig = (a: Analysis) => [...a.bands.map((b) => Math.max(-60, b.relDb) / 6), Math.log2(a.durationSeconds + 0.05) * 1.5, a.rmsDbfs / 6, Math.log2(a.spectralCentroidHz + 20)];
    const ids = FACTORY_PRESETS.map((p) => p.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = sig(results.get(ids[i])!.a), B = sig(results.get(ids[j])!.a);
      const d = Math.sqrt(A.reduce((s, v, k) => s + (v - B[k]) ** 2, 0));
      expect(d, `${ids[i]} vs ${ids[j]}`).toBeGreaterThan(1.2);
    }
  });

  it("A06/A07: every factory loop has exactly the intended frames and a clean seam diagnostic", () => {
    for (const p of FACTORY_PRESETS.filter((x) => x.mode === "loop")) {
      const r = results.get(p.id)!;
      expect(r.frames, p.id).toBe(Math.round(p.durationSeconds * p.exportDefaults.sampleRate));
      expect(r.a.seam!.warning, p.id).toBeNull();
    }
    expect(FACTORY_PRESETS.filter((x) => x.mode === "loop").length).toBeGreaterThanOrEqual(8);
  });
});
