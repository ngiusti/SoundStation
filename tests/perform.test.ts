import { describe, expect, it } from "vitest";
import { getPreset } from "../src/presets";
import { renderRecipe } from "../src/audio/render";
import { processOutput } from "../src/export/output";
import { analyze } from "../src/audio/analysis";
import { captureToCurves, shapeCurve, valueAt, MOTION_SHAPES, type PadSample } from "../src/domain/perform";
import { validateRecipe } from "../src/domain/recipe";
import { cloneRecipe } from "../src/domain/clone";
import type { Recipe } from "../src/domain/schema";

const motor = () => cloneRecipe(getPreset("strained-motor")!);
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const stats = (r: Recipe) => analyze(processOutput(renderRecipe(r), r.exportDefaults).channels, 48000);

// A synthetic gesture: x ramps 10 -> 90 over 2 s with jitter at 60 Hz, y swells.
const gesture = (): PadSample[] => Array.from({ length: 240 }, (_, i) => { const t = i / 60; return { t, x: 10 + (t / 4) * 80 + Math.sin(i) * 0.1, y: 50 + 40 * Math.sin((t / 4) * Math.PI) }; });

describe("capture to canonical curves", () => {
  it("resamples, simplifies within tolerance, and yields valid increasing curves", () => {
    const { xCurve, yCurve } = captureToCurves(gesture(), 4);
    for (const c of [xCurve, yCurve]) {
      expect(c.length).toBeGreaterThanOrEqual(2);
      expect(c.length).toBeLessThan(200);
      for (let i = 1; i < c.length; i++) expect(c[i][0]).toBeGreaterThan(c[i - 1][0]);
      expect(c[0][0]).toBe(0);
      expect(c[c.length - 1][0]).toBeCloseTo(4, 3);
    }
    // Within tolerance of the raw gesture everywhere (0.5 + rounding + interpolation slack).
    for (const s of gesture()) { expect(Math.abs(valueAt(xCurve, s.t) - s.x)).toBeLessThan(1.2); expect(Math.abs(valueAt(yCurve, s.t) - s.y)).toBeLessThan(1.2); }
  });
  it("is deterministic and rejects empty captures", () => {
    expect(JSON.stringify(captureToCurves(gesture(), 4))).toBe(JSON.stringify(captureToCurves(gesture(), 4)));
    expect(() => captureToCurves([], 4)).toThrow(/Nothing was captured/);
  });
  it("a single sample still yields a flat, valid motion", () => {
    const { xCurve } = captureToCurves([{ t: 0.5, x: 30, y: 60 }], 2);
    expect(xCurve.every((p) => p[1] === 30)).toBe(true);
  });
  it("shape presets are valid curves in range", () => {
    for (const s of MOTION_SHAPES) {
      const c = shapeCurve(s.id, 3);
      expect(c.length).toBeGreaterThanOrEqual(2);
      expect(c.every((p) => p[1] >= 0 && p[1] <= 100)).toBe(true);
      for (let i = 1; i < c.length; i++) expect(c[i][0]).toBeGreaterThan(c[i - 1][0]);
    }
  });
});

describe("A16: capture -> save -> reopen -> replay", () => {
  it("round-trips the motion through JSON and renders identical audio", () => {
    const r = motor();
    const { xCurve, yCurve } = captureToCurves(gesture(), r.durationSeconds);
    r.perform = { enabled: true, xMacro: "speed", yMacro: "strain", xCurve, yCurve };
    const first = renderRecipe(r);
    const reopened = validateRecipe(JSON.parse(JSON.stringify(r)));
    expect(reopened.ok).toBe(true);
    expect(JSON.stringify(reopened.recipe!.perform)).toBe(JSON.stringify(r.perform));
    const second = renderRecipe(reopened.recipe!);
    expect(same(first.channels[0], second.channels[0])).toBe(true);
  });
  it("motion changes the sound over time: a rising Speed gesture gets higher and louder", () => {
    const r = motor();
    r.perform = { enabled: true, xMacro: "speed", yMacro: "strain", xCurve: [[0, 0], [4, 100]], yCurve: [[0, 0], [4, 0]] };
    const out = renderRecipe(r);
    const early = analyze([out.channels[0].slice(0, 48000)], 48000), late = analyze([out.channels[0].slice(48000 * 3, 48000 * 4)], 48000);
    expect(late.spectralCentroidHz).toBeGreaterThan(early.spectralCentroidHz * 1.3);
    expect(out.warnings.join()).toMatch(/cannot change over time|^$/);
  });
  it("disabled motion equals no motion; enabled flat motion at the macro values equals static", () => {
    const r = motor();
    const base = renderRecipe(r);
    const off = { ...r, perform: { enabled: false, xMacro: "speed", yMacro: "strain", xCurve: [[0, 90], [4, 90]], yCurve: [[0, 90], [4, 90]] } } as Recipe;
    expect(same(base.channels[0], renderRecipe(off).channels[0])).toBe(true);
    const flat = { ...r, perform: { enabled: true, xMacro: "speed", yMacro: "strain", xCurve: [[0, 50], [4, 50]], yCurve: [[0, 50], [4, 50]] } } as Recipe;
    const f = renderRecipe(flat);
    let maxDiff = 0;
    for (let i = 0; i < f.frames; i++) maxDiff = Math.max(maxDiff, Math.abs(f.channels[0][i] - base.channels[0][i]));
    expect(maxDiff).toBeLessThan(1e-4);
  });
  it("rejects motion that names unknown or identical macros", () => {
    const r = motor();
    r.perform = { enabled: true, xMacro: "speed", yMacro: "speed", xCurve: [[0, 1], [1, 2]], yCurve: [[0, 1], [1, 2]] };
    expect(validateRecipe(r).errors.join()).toMatch(/different/);
    r.perform = { enabled: true, xMacro: "nope", yMacro: "strain", xCurve: [[0, 1], [1, 2]], yCurve: [[0, 1], [1, 2]] };
    expect(validateRecipe(r).errors.join()).toMatch(/unknown X macro/);
    r.perform = { enabled: true, xMacro: "speed", yMacro: "strain", xCurve: [[0, 1], [1, 200]], yCurve: [[0, 1], [1, 2]] };
    expect(validateRecipe(r).ok).toBe(false);
  });
});
