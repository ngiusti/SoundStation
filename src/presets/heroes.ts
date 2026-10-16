/** The five M1 hero presets. Original synthesis recipes; no external audio. */
import { ENGINE_VERSION, SCHEMA_VERSION, type RecipeInput } from "../domain/schema";

const base = { schemaVersion: SCHEMA_VERSION as 1, engineVersion: ENGINE_VERSION };
type M = { id: string; label: string; value: number; defaultValue: number; lowLabel: string; highLabel: string; help: string };
const macro = (id: string, label: string, v: number, low: string, high: string, help: string): M =>
  ({ id, label, value: v, defaultValue: v, lowLabel: low, highLabel: high, help });
let n = 0;
const map = (source: string, target: string, amount: number, extra: Record<string, unknown> = {}) =>
  ({ id: `m${++n}`, source, target, amount, ...extra });

export const energySidearm: RecipeInput = {
  ...base, id: "energy-sidearm", name: "Energy sidearm", family: "energy-weapons",
  description: "A short sci-fi pistol shot: a pitch-dropping body, a bright crack and a zappy FM snap.",
  hint: "Increase Body for a deeper thump; increase Crack for a sharper, rougher attack.",
  tags: ["gun", "weapon", "pistol", "energy", "laser", "shot"], fileCategory: "Weapon", fileName: "EnergySidearm",
  seed: 104729, durationSeconds: 0.45,
  layers: [
    { id: "body", name: "Energy body", source: { type: "oscillator", wave: "sine", frequencyHz: 180 }, durationSeconds: 0.3, gainDb: -8,
      amplitudeCurve: [[0, 0], [0.002, 1], [0.08, 0.25], [0.3, 0]], pitchCurveSemitones: [[0, 12], [0.08, 0], [0.3, -12]], spaceSendDb: -6 },
    { id: "crack", name: "Noise crack", source: { type: "noise", color: "white" }, durationSeconds: 0.14, gainDb: -13,
      amplitudeCurve: [[0, 0], [0.001, 1], [0.02, 0.3], [0.14, 0]], filters: [{ type: "highpass", cutoffHz: 2400, q: 0.9 }], spaceSendDb: -12 },
    { id: "zap", name: "FM zap", source: { type: "oscillator", wave: "sine", frequencyHz: 900, fm: { ratio: 2.01, index: 2.5 } }, durationSeconds: 0.18, gainDb: -16,
      amplitudeCurve: [[0, 0], [0.002, 1], [0.05, 0.4], [0.18, 0]], pitchCurveSemitones: [[0, 24], [0.15, -12]],
      filters: [{ type: "lowpass", cutoffHz: 7000, q: 0.707 }], spaceSendDb: -8 },
  ],
  macros: [
    macro("crack", "Crack", 50, "Soft", "Sharp", "How sharp and rough the first instant is (noise level and how low the noise reaches)."),
    macro("body", "Body", 50, "Light", "Heavy", "Depth and size of the thump: lower pitch, more level, longer ring."),
    macro("zap", "Zap pitch", 50, "Low", "High", "Pitch of the FM zap layer."),
    macro("decay", "Decay", 50, "Snappy", "Long", "How long the shot rings out."),
    macro("space", "Space", 10, "Dry", "Roomy", "Amount of shared reverb. Keep low for positional game sounds."),
  ],
  mappings: [
    map("crack", "layers.crack.gainDb", 18),
    map("crack", "layers.crack.filters.0.cutoffHz", 1.5, { domain: "log2", polarity: -1 }),
    map("body", "layers.body.gainDb", 12),
    map("body", "layers.body.source.frequencyHz", 1, { domain: "log2", polarity: -1 }),
    map("body", "layers.body.timeScale", 0.7, { domain: "log2" }),
    map("zap", "layers.zap.source.frequencyHz", 2, { domain: "log2" }),
    map("decay", "layers.body.timeScale", 1.3, { domain: "log2" }),
    map("decay", "layers.zap.timeScale", 1.0, { domain: "log2" }),
    map("decay", "layers.crack.timeScale", 0.6, { domain: "log2" }),
    map("space", "master.space.returnDb", 24),
  ],
  master: { gainDb: 0, space: { enabled: true, decaySeconds: 0.7, damping: 0.5, returnDb: -24, preDelayMs: 6 } },
  exportDefaults: { channels: 1, encoding: "pcm24" },
};

export const heavyBulkheadClose: RecipeInput = {
  ...base, id: "heavy-bulkhead-close", name: "Heavy bulkhead close", family: "doors",
  description: "A heavy pressure door: servo whine and scraping travel, then a deep metallic slam and latch.",
  hint: "Increase Weight for a deeper impact; increase Wear for a rougher motor.",
  tags: ["door", "hatch", "bulkhead", "heavy", "close", "slam", "metal"], fileCategory: "Door", fileName: "BulkheadClose",
  seed: 2231, durationSeconds: 2.2,
  layers: [
    { id: "motor", name: "Servo motor", source: { type: "oscillator", wave: "saw", frequencyHz: 85 }, startSeconds: 0, durationSeconds: 0.95, gainDb: -17,
      amplitudeCurve: [[0, 0], [0.15, 1], [0.8, 1], [0.95, 0]], pitchCurveSemitones: [[0, -6], [0.5, 4], [0.95, 2]],
      filters: [{ type: "lowpass", cutoffHz: 1100, q: 2.2 }], effects: [{ type: "drive", inputDb: 0, amount: 0.15, outputDb: 0 }], spaceSendDb: -14 },
    { id: "friction", name: "Scraping travel", source: { type: "noise", color: "pink" }, startSeconds: 0.05, durationSeconds: 0.9, gainDb: -20,
      amplitudeCurve: [[0, 0], [0.2, 0.7], [0.7, 1], [0.9, 0]], filters: [{ type: "bandpass", cutoffHz: 700, q: 1.4 }], spaceSendDb: -16 },
    { id: "thud", name: "Impact thump", source: { type: "oscillator", wave: "sine", frequencyHz: 55 }, startSeconds: 0.95, durationSeconds: 0.9, gainDb: -7,
      amplitudeCurve: [[0, 0], [0.003, 1], [0.15, 0.5], [0.9, 0]], pitchCurveSemitones: [[0, 7], [0.2, 0], [0.9, -4]], spaceSendDb: -8 },
    { id: "clang", name: "Metal ring", source: { type: "resonantImpact", modes: [
        { frequencyHz: 118, gainDb: 0, decaySeconds: 1.1 }, { frequencyHz: 247, gainDb: -3, decaySeconds: 0.8 },
        { frequencyHz: 531, gainDb: -6, decaySeconds: 0.5 }, { frequencyHz: 1130, gainDb: -10, decaySeconds: 0.3 } ],
        excitation: { noiseAmount: 0.6, burstMs: 5 } },
      startSeconds: 0.95, durationSeconds: 1.2, gainDb: -10, amplitudeCurve: [[0, 1], [1.2, 1]], spaceSendDb: -6 },
    { id: "latch", name: "Latch click", source: { type: "resonantImpact", modes: [
        { frequencyHz: 1900, gainDb: 0, decaySeconds: 0.12 }, { frequencyHz: 3100, gainDb: -4, decaySeconds: 0.08 } ],
        excitation: { noiseAmount: 0.3, burstMs: 1.5 } },
      startSeconds: 1.12, durationSeconds: 0.3, gainDb: -16, amplitudeCurve: [[0, 1], [0.3, 1]], spaceSendDb: -14 },
  ],
  macros: [
    macro("weight", "Weight", 50, "Light", "Heavy", "Size of the impact: deeper thump, louder body, longer ring."),
    macro("speed", "Motor speed", 50, "Slow", "Fast", "How fast the door travels. Faster means a higher motor pitch and an earlier slam."),
    macro("wear", "Wear", 30, "Smooth", "Rough", "Roughness of the motor: more scrape and grit."),
    macro("impact", "Impact", 50, "Gentle", "Violent", "Strength of the slam and latch."),
    macro("space", "Space", 10, "Dry", "Roomy", "Amount of shared reverb."),
  ],
  mappings: [
    map("weight", "layers.thud.gainDb", 10),
    map("weight", "layers.thud.source.frequencyHz", 1, { domain: "log2", polarity: -1 }),
    map("weight", "layers.clang.timeScale", 0.8, { domain: "log2" }),
    map("weight", "layers.clang.source.modes.0.frequencyHz", 0.7, { domain: "log2", polarity: -1 }),
    map("speed", "layers.motor.source.frequencyHz", 1, { domain: "log2" }),
    map("speed", "layers.thud.startSeconds", 0.5, { polarity: -1 }),
    map("speed", "layers.clang.startSeconds", 0.5, { polarity: -1 }),
    map("speed", "layers.latch.startSeconds", 0.5, { polarity: -1 }),
    map("wear", "layers.friction.gainDb", 16),
    map("wear", "layers.motor.effects.0.amount", 0.7),
    map("wear", "layers.motor.filters.0.q", 3),
    map("impact", "layers.clang.gainDb", 12),
    map("impact", "layers.latch.gainDb", 10),
    map("space", "master.space.returnDb", 24),
  ],
  master: { gainDb: 0, space: { enabled: true, decaySeconds: 1.1, damping: 0.55, returnDb: -24, preDelayMs: 10 } },
  exportDefaults: { channels: 1, encoding: "pcm24" },
};

export const idleGenerator: RecipeInput = {
  ...base, id: "idle-generator", name: "Idle generator", family: "machinery", mode: "loop",
  description: "A steady low generator bed with a pulsing hum, rumble and sparse mechanical ticks. Loops seamlessly.",
  hint: "Increase Wear for more ticking and rattle; increase Rumble for a heavier floor.",
  tags: ["generator", "machine", "engine", "motor", "hum", "loop", "idle"], fileCategory: "Machine", fileName: "IdleGenerator",
  seed: 5081, durationSeconds: 6, loop: { crossfadeMs: 80, warmupSeconds: 2, equalPower: true },
  layers: [
    { id: "hum", name: "Hum", source: { type: "oscillator", wave: "sine", frequencyHz: 50 }, durationSeconds: 6, gainDb: -16,
      amplitudeCurve: [[0, 1], [6, 1]], tremolo: { rateHz: 8, depth: 0.25 }, spaceSendDb: -20 },
    { id: "buzz", name: "Motor buzz", source: { type: "oscillator", wave: "saw", frequencyHz: 100 }, durationSeconds: 6, gainDb: -26,
      amplitudeCurve: [[0, 1], [6, 1]], tremolo: { rateHz: 16, depth: 0.4 },
      filters: [{ type: "lowpass", cutoffHz: 420, q: 1.2 }], effects: [{ type: "drive", inputDb: 0, amount: 0.2, outputDb: 0 }], spaceSendDb: -22 },
    { id: "rumble", name: "Rumble", source: { type: "noise", color: "brown" }, durationSeconds: 6, gainDb: -14,
      amplitudeCurve: [[0, 0.85], [3, 1], [6, 0.85]], filters: [{ type: "lowpass", cutoffHz: 220, q: 0.7 }], spaceSendDb: -26 },
    { id: "ticks", name: "Mechanical ticks", source: { type: "eventSequence", ratePerSecond: 8, intervalJitter: 0.08, pitchRangeSemitones: 2, gainRangeDb: 6, eventDecaySeconds: 0.03,
        inner: { type: "resonantImpact", modes: [{ frequencyHz: 420, gainDb: 0, decaySeconds: 0.05 }, { frequencyHz: 1250, gainDb: -6, decaySeconds: 0.03 }], excitation: { noiseAmount: 0.5, burstMs: 2 } } },
      durationSeconds: 6, gainDb: -26, amplitudeCurve: [[0, 1], [6, 1]], spaceSendDb: -16 },
  ],
  macros: [
    macro("hum", "Hum", 50, "Quiet", "Strong", "Level of the steady electrical hum."),
    macro("rumble", "Rumble", 50, "Light", "Heavy", "Low-frequency floor of the engine."),
    macro("wear", "Wear", 30, "Smooth", "Rattly", "How much ticking, buzz and grit you hear."),
    macro("space", "Space", 15, "Dry", "Roomy", "Amount of shared reverb."),
  ],
  mappings: [
    map("hum", "layers.hum.gainDb", 14),
    map("rumble", "layers.rumble.gainDb", 14),
    map("rumble", "layers.rumble.filters.0.cutoffHz", 0.8, { domain: "log2" }),
    map("wear", "layers.ticks.gainDb", 16),
    map("wear", "layers.ticks.source.ratePerSecond", 1.2, { domain: "log2" }),
    map("wear", "layers.buzz.gainDb", 14),
    map("wear", "layers.buzz.effects.0.amount", 0.6),
    map("space", "master.space.returnDb", 24),
  ],
  master: { gainDb: 0, space: { enabled: true, decaySeconds: 1.4, damping: 0.6, returnDb: -26, preDelayMs: 12 } },
  exportDefaults: { channels: 2, encoding: "pcm24" },
};

export const scannerPing: RecipeInput = {
  ...base, id: "scanner-ping", name: "Scanner ping", family: "interface",
  description: "A clean sonar-style ping with a bell-like overtone and a soft echo.",
  hint: "Increase Pitch for a higher ping; increase Echo for a longer repeat.",
  tags: ["ui", "ping", "scan", "sonar", "beep", "interface"], fileCategory: "UI", fileName: "ScannerPing",
  seed: 7919, durationSeconds: 1.1,
  layers: [
    { id: "tone", name: "Ping tone", source: { type: "oscillator", wave: "sine", frequencyHz: 1480 }, durationSeconds: 0.9, gainDb: -7,
      amplitudeCurve: [[0, 0], [0.004, 1], [0.12, 0.45], [0.9, 0]],
      effects: [{ type: "delay", timeMs: 210, feedback: 0.3, mix: 0.3 }], spaceSendDb: -12 },
    { id: "bell", name: "Bell overtone", source: { type: "oscillator", wave: "sine", frequencyHz: 2960, fm: { ratio: 1.5, index: 0.8 } }, durationSeconds: 0.5, gainDb: -17,
      amplitudeCurve: [[0, 0], [0.003, 1], [0.08, 0.3], [0.5, 0]], effects: [{ type: "delay", timeMs: 210, feedback: 0.3, mix: 0.3 }], spaceSendDb: -14 },
  ],
  macros: [
    macro("pitch", "Pitch", 50, "Low", "High", "Pitch of the ping."),
    macro("brightness", "Brightness", 50, "Pure", "Bell-like", "Level of the shimmering overtone."),
    macro("echo", "Echo", 50, "Single", "Repeating", "Strength of the repeat."),
    macro("space", "Space", 10, "Dry", "Roomy", "Amount of shared reverb."),
  ],
  mappings: [
    map("pitch", "layers.tone.source.frequencyHz", 1.2, { domain: "log2" }),
    map("pitch", "layers.bell.source.frequencyHz", 1.2, { domain: "log2" }),
    map("brightness", "layers.bell.gainDb", 18),
    map("echo", "layers.tone.effects.0.mix", 0.5),
    map("echo", "layers.tone.effects.0.feedback", 0.4),
    map("space", "master.space.returnDb", 24),
  ],
  master: { gainDb: 0, space: { enabled: true, decaySeconds: 0.9, damping: 0.4, returnDb: -26, preDelayMs: 4 } },
  exportDefaults: { channels: 1, encoding: "pcm24" },
};

export const abandonedCorridor: RecipeInput = {
  ...base, id: "abandoned-corridor", name: "Abandoned corridor", family: "atmosphere", mode: "loop",
  description: "A quiet, empty ship corridor: slow air movement, a faint electrical hum, distant thumps and the odd drip. Loops seamlessly.",
  hint: "Increase Event density for more drips and thumps; increase Air movement for a draftier space.",
  tags: ["ambience", "corridor", "air", "drone", "quiet", "loop", "atmosphere", "empty"], fileCategory: "Amb", fileName: "AbandonedCorridor",
  seed: 31337, durationSeconds: 30, loop: { crossfadeMs: 200, warmupSeconds: 4, equalPower: true },
  layers: [
    { id: "air", name: "Air movement", source: { type: "noise", color: "pink" }, durationSeconds: 30, gainDb: -26,
      amplitudeCurve: [[0, 0.8], [8, 1], [17, 0.65], [24, 0.95], [30, 0.8]],
      filters: [{ type: "lowpass", cutoffHz: 650, q: 0.8, cutoffCurveOctaves: [[0, 0], [9, 0.5], [17, -0.4], [24, 0.3], [30, 0]] }], spaceSendDb: -10 },
    { id: "hum", name: "Electrical hum", source: { type: "oscillator", wave: "sine", frequencyHz: 60 }, durationSeconds: 30, gainDb: -34,
      amplitudeCurve: [[0, 1], [30, 1]], spaceSendDb: -18 },
    { id: "hum2", name: "Hum harmonic", source: { type: "oscillator", wave: "sine", frequencyHz: 180 }, durationSeconds: 30, gainDb: -42,
      amplitudeCurve: [[0, 0.6], [15, 1], [30, 0.6]], spaceSendDb: -18 },
    { id: "drips", name: "Distant drips", source: { type: "eventSequence", ratePerSecond: 0.2, intervalJitter: 0.8, pitchRangeSemitones: 5, gainRangeDb: 10, eventDecaySeconds: 0.18,
        inner: { type: "resonantImpact", modes: [{ frequencyHz: 1350, gainDb: 0, decaySeconds: 0.15 }, { frequencyHz: 2180, gainDb: -5, decaySeconds: 0.1 }], excitation: { noiseAmount: 0.2, burstMs: 1.2 } } },
      durationSeconds: 30, gainDb: -30, amplitudeCurve: [[0, 1], [30, 1]], pan: 0.3, spaceSendDb: 0 },
    { id: "thumps", name: "Distant machinery", source: { type: "eventSequence", ratePerSecond: 0.1, intervalJitter: 0.9, pitchRangeSemitones: 3, gainRangeDb: 8, eventDecaySeconds: 0.5,
        inner: { type: "resonantImpact", modes: [{ frequencyHz: 62, gainDb: 0, decaySeconds: 0.7 }, { frequencyHz: 135, gainDb: -6, decaySeconds: 0.4 }], excitation: { noiseAmount: 0.4, burstMs: 8 } } },
      durationSeconds: 30, gainDb: -26, amplitudeCurve: [[0, 1], [30, 1]], pan: -0.4, spaceSendDb: -6 },
  ],
  macros: [
    macro("intensity", "Intensity", 50, "Calm", "Oppressive", "Overall level of the air and hum."),
    macro("air", "Air movement", 50, "Still", "Drafty", "How strong and how bright the moving air is."),
    macro("events", "Event density", 50, "Sparse", "Busy", "How often drips and distant thumps occur."),
    macro("space", "Space", 55, "Dry", "Cavernous", "Amount of shared reverb."),
  ],
  mappings: [
    map("intensity", "layers.air.gainDb", 8),
    map("intensity", "layers.hum.gainDb", 10),
    map("intensity", "layers.hum2.gainDb", 10),
    map("air", "layers.air.gainDb", 10),
    map("air", "layers.air.filters.0.cutoffHz", 1.2, { domain: "log2" }),
    map("events", "layers.drips.source.ratePerSecond", 2.5, { domain: "log2" }),
    map("events", "layers.thumps.source.ratePerSecond", 2.5, { domain: "log2" }),
    map("space", "master.space.returnDb", 24),
    map("space", "master.space.decaySeconds", 2.5),
  ],
  master: { gainDb: 6, space: { enabled: true, decaySeconds: 3.2, damping: 0.55, returnDb: -10, preDelayMs: 20 } },
  exportDefaults: { channels: 2, encoding: "pcm24" },
};

export const HERO_INPUTS: RecipeInput[] = [energySidearm, heavyBulkheadClose, idleGenerator, scannerPing, abandonedCorridor];
