import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import {
  CliError, analyzeWavFile, inspectRecipe, listPresets, loadRecipe, renderToFile, renderVariations, type Strength,
} from "../core/api";
import { validateRecipe } from "../domain/recipe";
import { ENGINE_VERSION } from "../domain/schema";

const HELP = `vh-sfx ${ENGINE_VERSION} - Void Haulers SFX Lab command line

  vh-sfx list-presets [--query text] [--json]
  vh-sfx show-preset <id>                       print a preset recipe as JSON (edit it, then render it)
  vh-sfx inspect  (--recipe file | --preset id) [--set macro=0..100] [--json]
  vh-sfx validate (--recipe file | --preset id) [--json]
  vh-sfx render   (--recipe file | --preset id) --out file.wav [--set macro=value ...] [--seed n]
                  [--sample-rate 48000|44100] [--channels mono|stereo] [--encoding pcm16|pcm24|float32]
                  [--overwrite] [--no-sidecar] [--json]
  vh-sfx variations (--recipe file | --preset id) --out-dir dir [--count 8] [--strength subtle|moderate|bold|0..1]
                  [--seed n] [--lock macro,macro] [--only 1,3] [--overwrite] [--json]
  vh-sfx analyze file.wav [--loop] [--json]     measurements of any WAV (peak, RMS, spectrum, envelope, seam)

Exit codes: 0 ok, 2 invalid input, 3 missing/corrupt asset, 4 render failure, 5 write failure, 130 cancelled.
Machine-readable results go to stdout with --json; diagnostics go to stderr.`;

function parseSets(list: string[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list ?? []) {
    const m = /^([A-Za-z0-9_-]+)=(-?\d+(\.\d+)?)$/.exec(s);
    if (!m) throw new CliError(2, `--set expects macroId=number, got "${s}"`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}
const channelsOf = (v?: string): 1 | 2 | undefined => {
  if (v === undefined) return undefined;
  if (v === "mono" || v === "1") return 1;
  if (v === "stereo" || v === "2") return 2;
  throw new CliError(2, `--channels must be mono or stereo, got "${v}"`);
};
const rateOf = (v?: string): 44100 | 48000 | undefined => {
  if (v === undefined) return undefined;
  if (v === "44100" || v === "48000") return Number(v) as 44100 | 48000;
  throw new CliError(2, `--sample-rate must be 44100 or 48000, got "${v}"`);
};
const encOf = (v?: string) => {
  if (v === undefined) return undefined;
  if (v === "pcm16" || v === "pcm24" || v === "float32") return v;
  throw new CliError(2, `--encoding must be pcm16, pcm24 or float32, got "${v}"`);
};
const intOf = (v: string | undefined, name: string) => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new CliError(2, `--${name} must be a whole number`);
  return Number(v);
};

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      recipe: { type: "string" }, preset: { type: "string" }, out: { type: "string" }, "out-dir": { type: "string" },
      set: { type: "string", multiple: true }, seed: { type: "string" }, "sample-rate": { type: "string" },
      channels: { type: "string" }, encoding: { type: "string" }, overwrite: { type: "boolean" }, "no-sidecar": { type: "boolean" },
      json: { type: "boolean" }, query: { type: "string" }, count: { type: "string" }, strength: { type: "string" },
      lock: { type: "string" }, only: { type: "string" }, loop: { type: "boolean" }, help: { type: "boolean", short: "h" },
    },
  });
  const cmd = positionals[0];
  if (!cmd || values.help) { console.log(HELP); return cmd ? 0 : 2; }
  const src = { recipePath: values.recipe, preset: values.preset, set: parseSets(values.set), seed: intOf(values.seed, "seed") };
  const out = (obj: unknown, text: () => string) => console.log(values.json ? JSON.stringify(obj, null, 2) : text());

  switch (cmd) {
    case "list-presets": {
      const list = listPresets(values.query);
      out(list, () => list.map((p) => `${p.id.padEnd(24)} ${p.family.padEnd(14)} ${p.mode.padEnd(8)} ${p.name}\n    ${p.description}\n    macros: ${p.macros.map((m) => m.id).join(", ")}`).join("\n") || "No presets match. Try a broader word such as 'door' or 'weapon'.");
      return 0;
    }
    case "show-preset": {
      const id = positionals[1];
      if (!id) throw new CliError(2, "show-preset needs a preset id");
      console.log(JSON.stringify(loadRecipe({ preset: id }).recipe, null, 2));
      return 0;
    }
    case "inspect": {
      const info = inspectRecipe(src);
      out(info, () => `${info.name} (${info.family}, ${info.mode}, ${info.durationSeconds}s, seed ${info.seed})\n${info.description}\nlayers: ${info.layers.map((l) => `${l.id}[${l.source}]`).join(" ")}\nmacros: ${info.macros.map((m) => `${m.id}=${m.value}`).join(" ")}`);
      return 0;
    }
    case "validate": {
      let raw: unknown;
      if (values.recipe) {
        try { raw = JSON.parse(readFileSync(values.recipe, "utf8")); } catch (e) { throw new CliError(2, `Cannot read recipe: ${(e as Error).message}`); }
      } else raw = loadRecipe(src).recipe;
      const v = validateRecipe(raw);
      out({ ok: v.ok, errors: v.errors }, () => (v.ok ? "Recipe is valid." : "Invalid recipe:\n  " + v.errors.join("\n  ")));
      return v.ok ? 0 : 2;
    }
    case "render": {
      if (!values.out) throw new CliError(2, "render needs --out file.wav");
      const r = renderToFile({ ...src, out: values.out, sampleRate: rateOf(values["sample-rate"]), channels: channelsOf(values.channels), encoding: encOf(values.encoding), overwrite: values.overwrite, sidecar: !values["no-sidecar"] });
      out(r, () => `Wrote ${r.file}\n  ${r.durationSeconds.toFixed(3)} s, ${r.sampleRate} Hz, ${r.channels === 1 ? "mono" : "stereo"}, ${r.encoding}, peak ${r.analysis.peakDbfs} dBFS, RMS ${r.analysis.rmsDbfs} dBFS${r.warnings.length ? "\n  warnings: " + r.warnings.join("; ") : ""}`);
      return 0;
    }
    case "variations": {
      if (!values["out-dir"]) throw new CliError(2, "variations needs --out-dir");
      const st = values.strength ?? "subtle";
      const strength = (["subtle", "moderate", "bold"].includes(st) ? st : Number(st)) as Strength | number;
      if (typeof strength === "number" && !Number.isFinite(strength)) throw new CliError(2, "--strength must be subtle, moderate, bold or a number");
      const r = renderVariations({
        ...src, count: intOf(values.count, "count") ?? 8, strength, outDir: values["out-dir"], overwrite: values.overwrite,
        lock: values.lock?.split(",").filter(Boolean), only: values.only?.split(",").map(Number),
        sampleRate: rateOf(values["sample-rate"]), channels: channelsOf(values.channels), encoding: encOf(values.encoding),
      });
      out(r.manifest, () => (r.manifest.files as { ok: boolean; candidate: number; file: string; peakDbfs?: number; deviations?: string[]; error?: string }[]).map((f) => f.ok ? `${String(f.candidate).padStart(3)}  ${f.file}  peak ${f.peakDbfs}  ${f.deviations?.join("; ") || "(no change)"}` : `${String(f.candidate).padStart(3)}  FAILED ${f.error}`).join("\n"));
      return r.ok ? 0 : 4;
    }
    case "analyze": {
      const file = positionals[1];
      if (!file) throw new CliError(2, "analyze needs a WAV file");
      const a = analyzeWavFile(file, values.loop);
      out(a, () => `${a.durationSeconds.toFixed(3)} s, peak ${a.peakDbfs} dBFS, RMS ${a.rmsDbfs} dBFS, centroid ${a.spectralCentroidHz} Hz, attack ${a.attackMs} ms\nbands (dB re loudest): ${a.bands.map((b) => `${b.label}:${b.relDb}`).join(" ")}\nenvelope dBFS: ${a.envelopeDbfs.join(" ")}${a.notes.length ? "\nnotes: " + a.notes.join("; ") : ""}`);
      return 0;
    }
    default:
      throw new CliError(2, `Unknown command "${cmd}". Run vh-sfx --help.`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
    process.exitCode = e.exitCode;
  } else if ((e as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" || (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
    console.error((e as Error).message + "\nRun vh-sfx --help.");
    process.exitCode = 2;
  } else {
    console.error("Unexpected error: " + (e as Error).message);
    process.exitCode = 4;
  }
}
