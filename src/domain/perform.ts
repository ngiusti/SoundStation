/** Pure helpers for the XY performance pad: turning a captured gesture into canonical curves, and shape presets. */
import type { Curve, Recipe } from "./schema";

export interface PadSample { t: number; x: number; y: number }

/** Control rate used when resampling a captured gesture. */
export const CAPTURE_RATE_HZ = 200;
/** Maximum deviation (in 0-100 units) allowed when simplifying a resampled gesture. */
export const SIMPLIFY_TOLERANCE = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function rdp(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const [t0, v0] = pts[0], [t1, v1] = pts[pts.length - 1];
  let worst = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const expected = v0 + ((v1 - v0) * (pts[i][0] - t0)) / (t1 - t0);
    const d = Math.abs(pts[i][1] - expected);
    if (d > worst) { worst = d; idx = i; }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, idx + 1), tol), right = rdp(pts.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}

/** Piecewise-linear lookup, held at both ends. */
export function valueAt(curve: Curve, t: number): number {
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return curve[curve.length - 1][1];
}

function toCurve(samples: { t: number; v: number }[], duration: number): Curve {
  // Sort, clamp, hold the last value to the end of the window, and resample at 200 Hz.
  const s = samples.map((p) => ({ t: clamp(p.t, 0, duration), v: clamp(p.v, 0, 100) })).sort((a, b) => a.t - b.t);
  if (s[0].t > 0) s.unshift({ t: 0, v: s[0].v });
  if (s[s.length - 1].t < duration) s.push({ t: duration, v: s[s.length - 1].v });
  const n = Math.max(2, Math.round(duration * CAPTURE_RATE_HZ) + 1);
  const dense: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * duration;
    while (j < s.length - 2 && s[j + 1].t < t) j++;
    const a = s[j], b = s[j + 1];
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    dense.push([t, a.v + (b.v - a.v) * f]);
  }
  const simp = rdp(dense, SIMPLIFY_TOLERANCE);
  const out: [number, number][] = [];
  for (const [t, v] of simp) {
    const tt = r4(t);
    if (out.length && tt <= out[out.length - 1][0]) continue;
    out.push([tt, r2(v)]);
  }
  if (out.length < 2) out.push([r4(duration), out[0][1]]);
  return out;
}

/** Canonicalise a recorded gesture: resample at 200 Hz, simplify within SIMPLIFY_TOLERANCE, round. */
export function captureToCurves(samples: PadSample[], duration: number): { xCurve: Curve; yCurve: Curve } {
  if (samples.length === 0) throw new Error("Nothing was captured. Move the pad while capturing.");
  if (!(duration > 0)) throw new Error("Capture duration must be positive.");
  return {
    xCurve: toCurve(samples.map((p) => ({ t: p.t, v: p.x })), duration),
    yCurve: toCurve(samples.map((p) => ({ t: p.t, v: p.y })), duration),
  };
}

export type MotionShape = "rise" | "fall" | "pulse" | "swell";
export const MOTION_SHAPES: { id: MotionShape; label: string }[] = [
  { id: "rise", label: "Rise" }, { id: "fall", label: "Fall" }, { id: "pulse", label: "Pulse" }, { id: "swell", label: "Swell" },
];

/** A few original starting shapes for a motion lane over `duration` seconds. */
export function shapeCurve(kind: MotionShape, duration: number): Curve {
  const d = Math.max(0.05, duration);
  switch (kind) {
    case "rise": return [[0, 5], [r4(d), 95]];
    case "fall": return [[0, 95], [r4(d), 5]];
    case "swell": return [[0, 5], [r4(d * 0.5), 95], [r4(d), 5]];
    case "pulse": {
      const out: [number, number][] = [];
      const cycles = 4;
      for (let i = 0; i < cycles; i++) {
        const a = (i / cycles) * d, b = ((i + 0.5) / cycles) * d;
        out.push([r4(a), 10], [r4(a + (b - a) * 0.15), 90], [r4(b), 90], [r4(b + (b - a) * 0.15), 10]);
      }
      out.push([r4(d), 10]);
      return out.filter((p, i, arr) => i === 0 || p[0] > arr[i - 1][0]);
    }
  }
}

/** Length of the motion window: the loop cycle for loops, the sound's intended length for one-shots. */
export const performDuration = (r: Pick<Recipe, "durationSeconds">) => r.durationSeconds;
