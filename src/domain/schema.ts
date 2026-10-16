import { z } from "zod";

export const ENGINE_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;
export const MAX_LAYERS = 8;
export const MAX_DURATION_SECONDS = 120;

const finite = z.number().refine(Number.isFinite, "must be a finite number");
const id = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/, "ids use letters, digits, - and _");

/** Breakpoint curve [timeSeconds, value]; times strictly increasing. */
export const CurveSchema = z
  .array(z.tuple([finite, finite]))
  .min(2)
  .max(256)
  .refine((c) => c.every((p, i) => i === 0 || p[0] > c[i - 1][0]), "curve times must increase");
export type Curve = z.infer<typeof CurveSchema>;

const OscillatorSource = z.object({
  type: z.literal("oscillator"),
  wave: z.enum(["sine", "triangle", "saw", "square"]).default("sine"),
  frequencyHz: z.number().min(10).max(16000),
  phaseDegrees: z.number().min(0).max(360).default(0),
  /** Modest FM: modulator at frequency*ratio, index in radians. */
  fm: z
    .object({ ratio: z.number().min(0.1).max(16), index: z.number().min(0).max(8) })
    .optional(),
  vibrato: z
    .object({ rateHz: z.number().min(0.05).max(40), depthSemitones: z.number().min(0).max(12) })
    .optional(),
});

const NoiseSource = z.object({
  type: z.literal("noise"),
  color: z.enum(["white", "pink", "brown"]).default("white"),
});

const ImpactSource = z.object({
  type: z.literal("resonantImpact"),
  modes: z
    .array(
      z.object({
        frequencyHz: z.number().min(20).max(16000),
        gainDb: z.number().min(-60).max(12).default(0),
        decaySeconds: z.number().min(0.003).max(8),
      }),
    )
    .min(1)
    .max(6),
  excitation: z
    .object({
      noiseAmount: z.number().min(0).max(1).default(0.5),
      burstMs: z.number().min(0.2).max(80).default(4),
    })
    .default({ noiseAmount: 0.5, burstMs: 4 }),
});

const SampleSource = z.object({
  type: z.literal("sample"),
  assetId: id,
  startSeconds: z.number().min(0).default(0),
  endSeconds: z.number().min(0).nullable().default(null),
  reverse: z.boolean().default(false),
  playbackRate: z.number().min(0.1).max(8).default(1),
  channelMode: z.enum(["keep", "mono"]).default("keep"),
  fadeInMs: z.number().min(0).max(5000).default(2),
  fadeOutMs: z.number().min(0).max(5000).default(5),
});

const InnerSource = z.discriminatedUnion("type", [OscillatorSource, NoiseSource, ImpactSource]);

const EventSequenceSource = z.object({
  type: z.literal("eventSequence"),
  inner: InnerSource,
  ratePerSecond: z.number().min(0.05).max(200),
  intervalJitter: z.number().min(0).max(1).default(0.3),
  pitchRangeSemitones: z.number().min(0).max(24).default(0),
  gainRangeDb: z.number().min(0).max(24).default(0),
  eventDecaySeconds: z.number().min(0.002).max(4).default(0.05),
});

export const SourceSchema = z.discriminatedUnion("type", [
  OscillatorSource,
  NoiseSource,
  ImpactSource,
  SampleSource,
  EventSequenceSource,
]);
export type Source = z.infer<typeof SourceSchema>;

const FilterSchema = z.object({
  type: z.enum(["lowpass", "highpass", "bandpass"]),
  cutoffHz: z.number().min(20).max(20000),
  q: z.number().min(0.3).max(20).default(0.707),
  /** Octave offset of cutoff over layer time (e.g. closing sweep). */
  cutoffCurveOctaves: CurveSchema.optional(),
  bypass: z.boolean().default(false),
});

const EffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("drive"),
    inputDb: z.number().min(-24).max(36).default(0),
    amount: z.number().min(0).max(1).default(0.5),
    outputDb: z.number().min(-36).max(12).default(0),
    bypass: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("delay"),
    timeMs: z.number().min(1).max(2000),
    feedback: z.number().min(0).max(0.85).default(0.3),
    mix: z.number().min(0).max(1).default(0.3),
    bypass: z.boolean().default(false),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const LayerSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  source: SourceSchema,
  startSeconds: z.number().min(0).max(MAX_DURATION_SECONDS).default(0),
  durationSeconds: z.number().min(0.002).max(MAX_DURATION_SECONDS),
  /** Scales curve times and duration; macro targets use this for "decay"/"weight". */
  timeScale: z.number().min(0.05).max(20).default(1),
  gainDb: z.number().min(-60).max(12).default(-12),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  amplitudeCurve: CurveSchema,
  pitchCurveSemitones: CurveSchema.optional(),
  tremolo: z
    .object({ rateHz: z.number().min(0.05).max(60), depth: z.number().min(0).max(1) })
    .optional(),
  filters: z.array(FilterSchema).max(3).default([]),
  effects: z.array(EffectSchema).max(4).default([]),
  spaceSendDb: z.number().min(-80).max(12).default(-80),
});
export type Layer = z.infer<typeof LayerSchema>;

export const MacroSchema = z.object({
  id,
  label: z.string().min(1).max(40),
  value: z.number().min(0).max(100),
  defaultValue: z.number().min(0).max(100),
  lowLabel: z.string().max(40).default(""),
  highLabel: z.string().max(40).default(""),
  help: z.string().max(300).default(""),
  locked: z.boolean().default(false),
});
export type Macro = z.infer<typeof MacroSchema>;

export const MappingSchema = z.object({
  id,
  source: id,
  /** e.g. layers.body.source.frequencyHz, master.gainDb, durationSeconds */
  target: z.string().min(1).max(120),
  op: z.literal("add").default("add"),
  /** linear: delta in the parameter's own units. log2: delta in octaves (value * 2^delta). */
  domain: z.enum(["linear", "log2"]).default("linear"),
  amount: finite,
  polarity: z.union([z.literal(1), z.literal(-1)]).default(1),
  curve: z.enum(["linear", "easeIn", "easeOut", "smooth"]).default("linear"),
  min: finite.optional(),
  max: finite.optional(),
});
export type Mapping = z.infer<typeof MappingSchema>;

const SpaceSchema = z.object({
  enabled: z.boolean().default(false),
  decaySeconds: z.number().min(0.1).max(12).default(1.2),
  damping: z.number().min(0).max(1).default(0.5),
  returnDb: z.number().min(-60).max(6).default(-12),
  preDelayMs: z.number().min(0).max(200).default(8),
});

export const MasterSchema = z.object({
  gainDb: z.number().min(-60).max(12).default(0),
  space: SpaceSchema.default({ enabled: false, decaySeconds: 1.2, damping: 0.5, returnDb: -12, preDelayMs: 8 }),
  crop: z
    .object({ startSeconds: z.number().min(0).default(0), endSeconds: z.number().min(0).nullable().default(null) })
    .default({ startSeconds: 0, endSeconds: null }),
  fadeInMs: z.number().min(0).max(5000).default(0),
  fadeOutMs: z.number().min(0).max(5000).default(0),
});

export const ExportDefaultsSchema = z.object({
  sampleRate: z.union([z.literal(44100), z.literal(48000)]).default(48000),
  channels: z.union([z.literal(1), z.literal(2)]).default(1),
  encoding: z.enum(["pcm16", "pcm24", "float32"]).default("pcm24"),
  tailMode: z.enum(["include", "fixed"]).default("include"),
  tailMaxSeconds: z.number().min(0).max(MAX_DURATION_SECONDS).default(10),
  exportGainDb: z.number().min(-60).max(24).default(0),
  peakPolicy: z.enum(["attenuateOnly", "normalize", "none"]).default("attenuateOnly"),
  samplePeakCeilingDbfs: z.number().min(-24).max(0).default(-1),
  normalizeTargetDbfs: z.number().min(-24).max(0).default(-3),
  dither: z.boolean().default(true),
});
export type ExportSettings = z.infer<typeof ExportDefaultsSchema>;

export const LoopSchema = z.object({
  crossfadeMs: z.number().min(0).max(5000).default(50),
  warmupSeconds: z.number().min(0).max(30).default(3),
  equalPower: z.boolean().default(true),
});

export const AssetRefSchema = z.object({
  id,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  originalName: z.string().max(200),
  sampleRate: z.number().int().min(8000).max(384000),
  channels: z.union([z.literal(1), z.literal(2)]),
  frames: z.number().int().min(1),
  license: z.string().max(300).default(""),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

/** Motion for the XY performance pad: two macro value curves (0-100) over recipe time. */
export const PerformSchema = z.object({
  enabled: z.boolean().default(false),
  xMacro: id,
  yMacro: id,
  xCurve: CurveSchema.refine((c) => c.every((p) => p[1] >= 0 && p[1] <= 100), "motion values must be 0-100"),
  yCurve: CurveSchema.refine((c) => c.every((p) => p[1] >= 0 && p[1] <= 100), "motion values must be 0-100"),
});
export type Perform = z.infer<typeof PerformSchema>;

export const RecipeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engineVersion: z.string(),
  id,
  name: z.string().min(1).max(80),
  family: z.string().min(1).max(40),
  description: z.string().max(400).default(""),
  hint: z.string().max(300).default(""),
  tags: z.array(z.string().max(30)).max(20).default([]),
  fileCategory: z.string().regex(/^[A-Za-z0-9]{1,24}$/).default("Sfx"),
  fileName: z.string().regex(/^[A-Za-z0-9]{1,40}$/).default("Sound"),
  seed: z.number().int().min(0).max(0xffffffff),
  durationSeconds: z.number().min(0.005).max(MAX_DURATION_SECONDS),
  mode: z.enum(["oneShot", "loop"]).default("oneShot"),
  loop: LoopSchema.default({ crossfadeMs: 50, warmupSeconds: 3, equalPower: true }),
  layers: z.array(LayerSchema).min(1).max(MAX_LAYERS),
  macros: z.array(MacroSchema).max(6).default([]),
  mappings: z.array(MappingSchema).max(64).default([]),
  perform: PerformSchema.optional(),
  assets: z.array(AssetRefSchema).max(32).default([]),
  master: MasterSchema.default({
    gainDb: 0,
    space: { enabled: false, decaySeconds: 1.2, damping: 0.5, returnDb: -12, preDelayMs: 8 },
    crop: { startSeconds: 0, endSeconds: null },
    fadeInMs: 0,
    fadeOutMs: 0,
  }),
  exportDefaults: ExportDefaultsSchema.default({
    sampleRate: 48000, channels: 1, encoding: "pcm24", tailMode: "include", tailMaxSeconds: 10,
    exportGainDb: 0, peakPolicy: "attenuateOnly", samplePeakCeilingDbfs: -1, normalizeTargetDbfs: -3, dither: true,
  }),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;
