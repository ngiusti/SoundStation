import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { decodeWav } from "../src/export/wav";
import { getPreset } from "../src/presets";
import { renderRecipe } from "../src/audio/render";
import { processOutput, encodeOutput } from "../src/export/output";

const run = (args: string[]) => spawnSync(process.execPath, ["bin/vh-sfx.mjs", ...args], { encoding: "utf8" });
const tmp = () => mkdtempSync(join(tmpdir(), "vhsfx-cli-"));
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

describe("CLI", () => {
  it("list-presets --json prints machine-readable output", () => {
    const r = run(["list-presets", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.map((p: { id: string }) => p.id)).toContain("energy-sidearm");
    expect(j[0].macros.length).toBeGreaterThan(0);
  });

  it("A17: CLI render equals an in-process engine render of the same frozen recipe", () => {
    const d = tmp();
    const r = run(["render", "--preset", "scanner-ping", "--out", join(d, "a.wav"), "--set", "pitch=70", "--json"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    const p = getPreset("scanner-ping")!;
    const rec = { ...p, macros: p.macros.map((m) => (m.id === "pitch" ? { ...m, value: 70 } : m)) };
    const inproc = encodeOutput(processOutput(renderRecipe(rec), rec.exportDefaults), rec.exportDefaults, rec.seed);
    expect(createHash("sha256").update(inproc).digest("hex")).toBe(json.audioSha256);
    expect(sha(join(d, "a.wav"))).toBe(json.audioSha256);
    expect(existsSync(join(d, "a.recipe.json"))).toBe(true);
  });

  it("is deterministic across runs, and --seed changes stochastic content", () => {
    const d = tmp();
    run(["render", "--preset", "idle-generator", "--out", join(d, "1.wav"), "--no-sidecar"]);
    run(["render", "--preset", "idle-generator", "--out", join(d, "2.wav"), "--no-sidecar"]);
    run(["render", "--preset", "idle-generator", "--out", join(d, "3.wav"), "--no-sidecar", "--seed", "99"]);
    expect(sha(join(d, "1.wav"))).toBe(sha(join(d, "2.wav")));
    expect(sha(join(d, "1.wav"))).not.toBe(sha(join(d, "3.wav")));
  });

  it("rejects bad input before rendering with exit code 2", () => {
    const d = tmp();
    expect(run(["render", "--preset", "nope", "--out", join(d, "x.wav")]).status).toBe(2);
    expect(run(["render", "--preset", "scanner-ping", "--out", join(d, "x.wav"), "--set", "pitch=101"]).status).toBe(2);
    expect(run(["render", "--preset", "scanner-ping", "--out", join(d, "x.wav"), "--set", "bogus=5"]).status).toBe(2);
    expect(run(["render", "--preset", "scanner-ping", "--out", join(d, "x.wav"), "--set", "pitch=abc"]).status).toBe(2);
    expect(run(["render", "--preset", "scanner-ping"]).status).toBe(2);
    expect(run(["frobnicate"]).status).toBe(2);
    expect(readdirSync(d)).toEqual([]);
    const bad = join(d, "bad.json"); writeFileSync(bad, JSON.stringify({ schemaVersion: 1, nope: true }));
    expect(run(["validate", "--recipe", bad]).status).toBe(2);
    writeFileSync(bad, "{not json");
    expect(run(["render", "--recipe", bad, "--out", join(d, "y.wav")]).status).toBe(2);
  });

  it("refuses to overwrite without --overwrite (exit 5) and leaves no temp files", () => {
    const d = tmp(); const out = join(d, "o.wav");
    expect(run(["render", "--preset", "scanner-ping", "--out", out, "--no-sidecar"]).status).toBe(0);
    const before = sha(out);
    const again = run(["render", "--preset", "scanner-ping", "--out", out, "--no-sidecar", "--set", "pitch=10"]);
    expect(again.status).toBe(5);
    expect(sha(out)).toBe(before);
    expect(run(["render", "--preset", "scanner-ping", "--out", out, "--no-sidecar", "--set", "pitch=10", "--overwrite"]).status).toBe(0);
    expect(readdirSync(d).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("output options: 44.1 kHz stereo PCM16 decodes with the right shape", () => {
    const d = tmp(); const out = join(d, "s.wav");
    expect(run(["render", "--preset", "energy-sidearm", "--out", out, "--sample-rate", "44100", "--channels", "stereo", "--encoding", "pcm16", "--no-sidecar"]).status).toBe(0);
    const w = decodeWav(new Uint8Array(readFileSync(out)));
    expect([w.sampleRate, w.channels.length, w.encoding]).toEqual([44100, 2, "pcm16"]);
  });

  it("A08: locked macros stay constant across 100 candidates while others vary within bounds", () => {
    const d = tmp();
    const r = run(["variations", "--preset", "energy-sidearm", "--out-dir", d, "--count", "100", "--strength", "bold", "--lock", "space,decay", "--json"]);
    expect(r.status).toBe(0);
    const files = readdirSync(d).filter((f) => f.endsWith(".recipe.json"));
    expect(files.length).toBe(100);
    const parent = getPreset("energy-sidearm")!;
    const crack = new Set<number>();
    const seeds = new Set<number>();
    for (const f of files) {
      const rec = JSON.parse(readFileSync(join(d, f), "utf8")).recipe;
      const val = (id: string) => rec.macros.find((m: { id: string }) => m.id === id).value;
      expect(val("space")).toBe(parent.macros.find((m) => m.id === "space")!.value);
      expect(val("decay")).toBe(parent.macros.find((m) => m.id === "decay")!.value);
      expect(val("crack")).toBeGreaterThanOrEqual(0); expect(val("crack")).toBeLessThanOrEqual(100);
      crack.add(val("crack")); seeds.add(rec.seed);
    }
    expect(crack.size).toBeGreaterThan(50);
    expect(seeds.size).toBe(100);
    expect(existsSync(join(d, "VH_Weapon_EnergySidearm_001.wav"))).toBe(true);
  }, 120000);

  it("A09: a candidate's sidecar reproduces its audio exactly", () => {
    const d = tmp();
    run(["variations", "--preset", "energy-sidearm", "--out-dir", d, "--count", "3", "--strength", "moderate", "--json"]);
    const wav = join(d, "VH_Weapon_EnergySidearm_003.wav");
    const re = join(d, "re.wav");
    // The sidecar is a valid input as-is: it wraps the fully resolved recipe, seed included.
    expect(run(["render", "--recipe", join(d, "VH_Weapon_EnergySidearm_003.recipe.json"), "--out", re, "--no-sidecar"]).status).toBe(0);
    expect(sha(re)).toBe(sha(wav));
  });

  it("analyze reports measurements for any WAV; corrupt files fail clearly", () => {
    const d = tmp(); const out = join(d, "p.wav");
    run(["render", "--preset", "scanner-ping", "--out", out, "--no-sidecar"]);
    const a = JSON.parse(run(["analyze", out, "--json"]).stdout);
    expect(a.durationSeconds).toBeGreaterThan(0.5);
    expect(a.bands.length).toBe(10);
    const bad = join(d, "bad.wav"); writeFileSync(bad, Buffer.from("not a wav file at all, definitely not riff"));
    expect(run(["analyze", bad]).status).toBe(3);
  });
});

describe("CLI accepts app project files and sidecars", () => {
  it("renders from an export sidecar and from a project file with embedded samples", () => {
    const d = tmp();
    run(["render", "--preset", "scanner-ping", "--out", join(d, "a.wav")]);
    const out1 = join(d, "b.wav");
    expect(run(["render", "--recipe", join(d, "a.recipe.json"), "--out", out1, "--no-sidecar"]).status).toBe(0);
    expect(sha(out1)).toBe(sha(join(d, "a.wav")));
    const rec = JSON.parse(readFileSync(join(d, "a.recipe.json"), "utf8")).recipe;
    const proj = join(d, "p.vhsfx.json");
    writeFileSync(proj, JSON.stringify({ format: "vhsfx-project", version: 1, recipe: rec, assets: [] }));
    const out2 = join(d, "c.wav");
    expect(run(["render", "--recipe", proj, "--out", out2, "--no-sidecar"]).status).toBe(0);
    expect(sha(out2)).toBe(sha(out1));
  });
  it("A14: a sample layer renders from embedded project data, and a missing sample fails with exit 3 (no substitution)", () => {
    const d = tmp();
    // Build a 0.3 s test tone WAV and a recipe that uses it.
    const n = 14400, ch = new Float32Array(n).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000));
    const wavBytes = encodeWavForTest(ch);
    const hash = createHash("sha256").update(wavBytes).digest("hex");
    const rec = { schemaVersion: 1, engineVersion: "1.0.0", id: "sample-test", name: "Sample test", family: "custom", seed: 5, durationSeconds: 0.3,
      assets: [{ id: "s1", hash, originalName: "tone.wav", sampleRate: 48000, channels: 1, frames: n }],
      layers: [{ id: "rec", name: "Recording", source: { type: "sample", assetId: "s1" }, durationSeconds: 0.3, gainDb: -6, amplitudeCurve: [[0, 1], [0.3, 1]] }] };
    const withData = join(d, "with.vhsfx.json");
    writeFileSync(withData, JSON.stringify({ format: "vhsfx-project", version: 1, recipe: rec, assets: [{ hash, dataBase64: Buffer.from(wavBytes).toString("base64") }] }));
    const ok = run(["render", "--recipe", withData, "--out", join(d, "ok.wav"), "--no-sidecar", "--json"]);
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).analysis.spectralCentroidHz).toBeGreaterThan(300);
    const without = join(d, "without.json");
    writeFileSync(without, JSON.stringify(rec));
    const bad = run(["render", "--recipe", without, "--out", join(d, "no.wav"), "--no-sidecar"]);
    expect(bad.status).toBe(3);
    expect(bad.stderr).toMatch(/missing/i);
    expect(existsSync(join(d, "no.wav"))).toBe(false);
  });
});

import { encodeWav } from "../src/export/wav";
function encodeWavForTest(ch: Float32Array) { return encodeWav([ch], 48000, "pcm16"); }
