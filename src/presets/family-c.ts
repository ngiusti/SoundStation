import { A, O, N, IMP, SEQ, lp, hp, bp, drive, delay, ly, mac, mp, oct, P } from "./dsl";

// ---------- Atmosphere (loops) ----------
export const reactorChamber = P({
  id: "reactor-chamber", name: "Reactor chamber", family: "atmosphere", seed: 5101, duration: 20, loop: { crossfadeMs: 250, warmupSeconds: 4 }, fileCategory: "Amb", fileName: "ReactorChamber",
  description: "A vast, deep reactor hall: a pulsing low drone, soft rumble and a faint high shimmer. Loops seamlessly.", hint: "Increase Pulse for a stronger throb; Movement adds a slow wobble to the shimmer.",
  tags: ["reactor", "ambience", "drone", "hum", "engine room", "loop", "atmosphere", "deep"],
  layers: [
    ly("core", "Core drone", O("sine", 40), 20, A([0, 1], [20, 1]), { gain: -18, tremolo: { rateHz: 0.25, depth: 0.5 }, send: -10 }),
    ly("octave", "Octave", O("sine", 80), 20, A([0, 0.6], [10, 1], [20, 0.6]), { gain: -26, tremolo: { rateHz: 0.5, depth: 0.35 }, send: -10 }),
    ly("rumble", "Rumble", N("brown"), 20, A([0, 0.8], [10, 1], [20, 0.8]), { gain: -22, filters: [lp(140)], send: -16 }),
    ly("shimmer", "High shimmer", O("sine", 1200, { vibrato: { rateHz: 0.2, depthSemitones: 0.4 } }), 20, A([0, 0.4], [7, 1], [14, 0.5], [20, 0.4]), { gain: -46, send: -4 }),
    ly("hiss", "Coolant hiss", N("pink"), 20, A([0, 0.7], [6, 1], [13, 0.6], [20, 0.7]), { gain: -40, filters: [bp(2400, 0.7)], send: -8 }),
  ],
  macros: [mac("intensity", "Intensity", "Calm", "Oppressive", "Overall level."), mac("pulse", "Pulse", "Steady", "Throbbing", "Depth of the slow throb."), mac("movement", "Movement", "Still", "Shifting", "Shimmer wobble and hiss."), mac("space", "Space", "Dry", "Cavernous", "Shared reverb.", 60)],
  mappings: [mp("intensity", "layers.core.gainDb", 8), mp("intensity", "layers.rumble.gainDb", 8), mp("pulse", "layers.core.tremolo.depth", 0.45), mp("pulse", "layers.octave.tremolo.depth", 0.4), mp("movement", "layers.shimmer.source.vibrato.depthSemitones", 1.2), mp("movement", "layers.hiss.gainDb", 12), mp("space", "master.space.returnDb", 24), mp("space", "master.space.decaySeconds", 3)],
  space: { decaySeconds: 4, returnDb: -14 },
});

export const cargoHoldAir = P({
  id: "cargo-hold-air", name: "Cargo hold air", family: "atmosphere", seed: 5102, duration: 24, loop: { crossfadeMs: 250, warmupSeconds: 4 }, fileCategory: "Amb", fileName: "CargoHoldAir",
  description: "A big metal hold: draughty air, slow gusts, and far-off clanks and settling creaks. Loops seamlessly.", hint: "Increase Event density for more clanks; Air movement adds gustiness.",
  tags: ["cargo", "hold", "ambience", "air", "wind", "clank", "loop", "atmosphere", "empty"],
  layers: [
    ly("air", "Air", N("pink"), 24, A([0, 0.8], [6, 1], [12, 0.7], [18, 0.95], [24, 0.8]), { gain: -26, filters: [lp(500, 0.8, A([0, 0], [8, 0.5], [16, -0.4], [24, 0]))], send: -10 }),
    ly("gusts", "Gusts", N("white"), 24, A([0, 0], [4, 0], [7, 0.8], [10, 0], [16, 0], [19, 1], [22, 0], [24, 0]), { gain: -38, filters: [bp(700, 0.9, A([0, 0], [7, 0.6], [10, 0], [19, 0.7], [22, 0], [24, 0]))], send: -8 }),
    ly("clanks", "Distant clanks", SEQ(IMP([[310, 0, 0.5], [740, -5, 0.3], [1650, -10, 0.15]], 0.4, 2), 0.12, { intervalJitter: 0.9, pitchRangeSemitones: 6, gainRangeDb: 10, eventDecaySeconds: 0.5 }), 24, A([0, 1], [24, 1]), { gain: -30, pan: 0.4, send: -2 }),
    ly("creaks", "Settling creaks", SEQ(O("saw", 180, { vibrato: { rateHz: 5, depthSemitones: 0.5 } }), 0.1, { intervalJitter: 0.9, pitchRangeSemitones: 7, gainRangeDb: 8, eventDecaySeconds: 0.7 }), 24, A([0, 1], [24, 1]), { gain: -46, filters: [bp(600, 3)], pan: -0.5, send: -4 }),
    ly("hum", "Low hum", O("sine", 55), 24, A([0, 1], [24, 1]), { gain: -38 }),
  ],
  macros: [mac("intensity", "Intensity", "Calm", "Oppressive", "Overall level."), mac("air", "Air movement", "Still", "Gusty", "Air and gusts."), mac("events", "Event density", "Sparse", "Busy", "Clanks and creaks."), mac("space", "Space", "Dry", "Cavernous", "Shared reverb.", 60)],
  mappings: [mp("intensity", "layers.air.gainDb", 8), mp("intensity", "layers.hum.gainDb", 10), mp("air", "layers.gusts.gainDb", 18), oct("air", "layers.air.filters.0.cutoffHz", 1.0), oct("events", "layers.clanks.source.ratePerSecond", 2.5), oct("events", "layers.creaks.source.ratePerSecond", 2.5), mp("space", "master.space.returnDb", 24), mp("space", "master.space.decaySeconds", 3)],
  space: { decaySeconds: 3.5, returnDb: -12 },
});

export const damagedPowerGrid = P({
  id: "damaged-power-grid", name: "Damaged power grid", family: "atmosphere", seed: 5104, duration: 16, loop: { crossfadeMs: 200, warmupSeconds: 3 }, fileCategory: "Amb", fileName: "DamagedGrid",
  description: "A failing electrical network: an uneven mains hum, buzzing, scattered crackle and the occasional arc. Loops seamlessly.", hint: "Increase Instability for more crackle and buzz; Event density adds arcs.",
  tags: ["power", "grid", "electric", "damaged", "crackle", "buzz", "ambience", "loop", "atmosphere"],
  layers: [
    ly("mains", "Mains hum", O("sine", 50), 16, A([0, 1], [3, 0.7], [6, 1], [9, 0.5], [12, 0.9], [16, 1]), { gain: -22, tremolo: { rateHz: 0.5, depth: 0.2 }, send: -14 }),
    ly("buzz", "Buzz", O("saw", 100), 16, A([0, 0.6], [4, 1], [8, 0.4], [12, 0.9], [16, 0.6]), { gain: -36, filters: [bp(900, 1)], effects: [drive(0.4)], send: -14 }),
    ly("crackle", "Crackle", SEQ(IMP([[3000, 0, 0.01], [5200, -4, 0.007]], 0.9, 0.5), 7, { intervalJitter: 0.95, pitchRangeSemitones: 10, gainRangeDb: 16, eventDecaySeconds: 0.01 }), 16, A([0, 1], [16, 1]), { gain: -30, pan: 0.2, send: -12 }),
    ly("arcs", "Arc bursts", SEQ(N("white"), 0.25, { intervalJitter: 0.9, pitchRangeSemitones: 0, gainRangeDb: 12, eventDecaySeconds: 0.2 }), 16, A([0, 1], [16, 1]), { gain: -30, filters: [bp(2600, 0.6)], effects: [drive(0.5)], pan: -0.3, send: -6 }),
    ly("surge", "Voltage sag", O("sine", 38), 16, A([0, 0], [5, 0], [6.5, 1], [8, 0], [16, 0]), { gain: -32 }),
  ],
  macros: [mac("intensity", "Intensity", "Calm", "Oppressive", "Overall level."), mac("instability", "Instability", "Steady", "Failing", "Crackle and buzz."), mac("events", "Event density", "Sparse", "Busy", "Arcs and sags."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 40)],
  mappings: [mp("intensity", "layers.mains.gainDb", 8), mp("intensity", "layers.buzz.gainDb", 6), oct("instability", "layers.crackle.source.ratePerSecond", 2), mp("instability", "layers.buzz.effects.0.amount", 0.4), mp("instability", "layers.buzz.gainDb", 12), oct("events", "layers.arcs.source.ratePerSecond", 2.5), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 2.2, returnDb: -16 },
});

export const anomalyDrone = P({
  id: "anomaly-drone", name: "Anomaly drone", family: "atmosphere", seed: 5104, duration: 30, loop: { crossfadeMs: 300, warmupSeconds: 5 }, fileCategory: "Amb", fileName: "AnomalyDrone",
  description: "An unsettling alien drone: slowly beating tones, a shifting metallic texture and cold air. Loops seamlessly.", hint: "Increase Movement for faster beating and wobble; Brightness opens the cold texture.",
  tags: ["anomaly", "drone", "alien", "eerie", "ambience", "loop", "atmosphere", "dark", "unsettling"],
  layers: [
    ly("a", "Drone A", O("sine", 110), 30, A([0, 1], [30, 1]), { gain: -22, send: -8 }),
    ly("b", "Drone B (beating)", O("sine", 111.3), 30, A([0, 1], [30, 1]), { gain: -22, send: -8 }),
    ly("fifth", "Wavering fifth", O("sine", 165, { vibrato: { rateHz: 0.15, depthSemitones: 0.35 } }), 30, A([0, 0.3], [10, 1], [20, 0.4], [30, 0.3]), { gain: -32, send: -6 }),
    ly("metal", "Metal texture", O("sine", 740, { fm: { ratio: 1.414, index: 2.4 } }), 30, A([0, 0.2], [12, 1], [22, 0.3], [30, 0.2]), { gain: -46, filters: [lp(2200, 1, A([0, 0], [12, 1], [22, -0.5], [30, 0]))], send: -2 }),
    ly("cold", "Cold air", N("pink"), 30, A([0, 0.8], [15, 1], [30, 0.8]), { gain: -34, filters: [bp(3200, 0.8, A([0, 0], [15, 0.5], [30, 0]))], send: -4 }),
  ],
  macros: [mac("intensity", "Intensity", "Faint", "Overwhelming", "Overall level."), mac("movement", "Movement", "Still", "Writhing", "Wobble and shimmer."), mac("brightness", "Brightness", "Dark", "Cold", "Texture and air."), mac("space", "Space", "Dry", "Vast", "Shared reverb.", 70)],
  mappings: [mp("intensity", "layers.a.gainDb", 6), mp("intensity", "layers.b.gainDb", 6), mp("movement", "layers.fifth.source.vibrato.depthSemitones", 0.8), mp("movement", "layers.metal.gainDb", 10), oct("brightness", "layers.metal.filters.0.cutoffHz", 1.2), mp("brightness", "layers.cold.gainDb", 12), mp("space", "master.space.returnDb", 24), mp("space", "master.space.decaySeconds", 4)],
  space: { decaySeconds: 5, returnDb: -10 },
});

// ---------- Material impacts ----------
export const smallMetalTick = P({
  id: "small-metal-tick", name: "Small metal tick", family: "material-impacts", seed: 6101, duration: 0.3, fileCategory: "Impact", fileName: "MetalTick",
  description: "A light, bright metallic tick, like a small part tapped on a plate. Stylised, not a recording.", hint: "Material moves the ring frequencies; Damping shortens the ring.",
  tags: ["metal", "tick", "tap", "impact", "small", "stylised", "light"],
  layers: [
    ly("ring", "Metal ring", IMP([[2300, 0, 0.09], [3700, -3, 0.06], [5600, -7, 0.04]], 0.35, 0.8), 0.3, A([0, 1], [0.3, 1]), { gain: -10 }),
    ly("body", "Plate body", IMP([[640, 0, 0.05]], 0.5, 1.5), 0.15, A([0, 1], [0.15, 1]), { gain: -22 }),
  ],
  macros: [mac("material", "Material", "Dull", "Bright", "Ring frequencies."), mac("weight", "Weight", "Light", "Heavier", "Plate body level."), mac("damping", "Damping", "Ringing", "Dead", "How quickly the ring dies."), mac("brightness", "Brightness", "Soft", "Hard", "Strike hardness.")],
  mappings: [oct("material", "layers.ring.source.modes.0.frequencyHz", 1), oct("material", "layers.ring.source.modes.1.frequencyHz", 1), oct("material", "layers.ring.source.modes.2.frequencyHz", 1), mp("weight", "layers.body.gainDb", 16), oct("damping", "layers.ring.timeScale", 1.2, { polarity: -1 }), mp("brightness", "layers.ring.source.excitation.noiseAmount", 0.5)],
});

export const heavyPanelHit = P({
  id: "heavy-panel-hit", name: "Heavy panel hit", family: "material-impacts", seed: 6102, duration: 1.1, fileCategory: "Impact", fileName: "PanelHit",
  description: "A heavy blow on a large metal panel: a deep thud, a booming ring and a rattling decay. Stylised.", hint: "Weight lowers and deepens the boom; Material changes the metal's character.",
  tags: ["metal", "panel", "hit", "heavy", "impact", "clang", "boom", "stylised"],
  layers: [
    ly("thud", "Thud", O("sine", 68), 0.4, A([0, 0], [0.004, 1], [0.4, 0]), { gain: -8, pitch: A([0, 8], [0.2, 0]), send: -10 }),
    ly("panel", "Panel ring", IMP([[95, 0, 0.9], [188, -2, 0.7], [362, -4, 0.5], [731, -8, 0.3], [1480, -12, 0.2]], 0.55, 4), 1.1, A([0, 1], [1.1, 1]), { gain: -12, send: -8 }),
    ly("rattle", "Loose rattle", SEQ(IMP([[900, 0, 0.04], [2100, -6, 0.025]], 0.6, 1), 18, { intervalJitter: 0.7, pitchRangeSemitones: 5, gainRangeDb: 14, eventDecaySeconds: 0.04 }), 1.0, A([0, 0], [0.08, 1], [1.0, 0]), { gain: -34, send: -8 }),
  ],
  macros: [mac("weight", "Weight", "Light", "Heavy", "Size of the thud and boom."), mac("material", "Material", "Thick", "Thin", "Ring frequencies."), mac("damping", "Damping", "Ringing", "Dead", "How quickly it dies."), mac("scatter", "Scatter", "Clean", "Rattly", "Loose rattles.")],
  mappings: [mp("weight", "layers.thud.gainDb", 8), oct("weight", "layers.panel.source.modes.0.frequencyHz", 0.8, { polarity: -1 }), oct("weight", "layers.thud.source.frequencyHz", 0.6, { polarity: -1 }), oct("material", "layers.panel.source.modes.1.frequencyHz", 0.8), oct("material", "layers.panel.source.modes.2.frequencyHz", 0.8), oct("damping", "layers.panel.timeScale", 1.2, { polarity: -1 }), mp("scatter", "layers.rattle.gainDb", 20), oct("scatter", "layers.rattle.source.ratePerSecond", 1)],
  space: { decaySeconds: 0.7, returnDb: -26 },
});

export const hollowContainer = P({
  id: "hollow-container", name: "Hollow container", family: "material-impacts", seed: 6103, duration: 0.8, fileCategory: "Impact", fileName: "HollowContainer",
  description: "A knock on an empty drum or locker: a woody boom with an airy, tube-like ring. Stylised.", hint: "Size lowers the whole resonance; Hardness changes the strike from soft to sharp.",
  tags: ["hollow", "container", "knock", "drum", "locker", "barrel", "impact", "boom", "stylised"],
  layers: [
    ly("shell", "Shell", IMP([[210, 0, 0.35], [420, -3, 0.25], [640, -6, 0.2], [1060, -10, 0.12]], 0.4, 2.5), 0.8, A([0, 1], [0.8, 1]), { gain: -10, send: -10 }),
    ly("air", "Air cavity", O("sine", 135), 0.4, A([0, 0], [0.005, 1], [0.4, 0]), { gain: -16, pitch: A([0, 3], [0.2, 0]), send: -10 }),
    ly("tap", "Strike", IMP([[2500, 0, 0.012]], 0.7, 0.8), 0.05, A([0, 1], [0.05, 1]), { gain: -26 }),
  ],
  macros: [mac("size", "Size", "Small", "Large", "Lowers all resonances."), mac("damping", "Damping", "Ringing", "Dead", "How quickly it dies."), mac("hardness", "Hardness", "Soft", "Hard", "Strike sharpness."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [oct("size", "layers.shell.source.modes.0.frequencyHz", 1, { polarity: -1 }), oct("size", "layers.shell.source.modes.1.frequencyHz", 1, { polarity: -1 }), oct("size", "layers.shell.source.modes.2.frequencyHz", 1, { polarity: -1 }), oct("size", "layers.shell.source.modes.3.frequencyHz", 1, { polarity: -1 }), oct("size", "layers.air.source.frequencyHz", 1, { polarity: -1 }), oct("damping", "layers.shell.timeScale", 1.2, { polarity: -1 }), mp("hardness", "layers.tap.gainDb", 20), mp("hardness", "layers.shell.source.excitation.noiseAmount", 0.4), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.6, returnDb: -26 },
});

export const droppedTool = P({
  id: "dropped-tool", name: "Dropped tool", family: "material-impacts", seed: 6104, duration: 1.3, fileCategory: "Impact", fileName: "DroppedTool",
  description: "A metal tool hitting the floor and bouncing to rest: a clang, three shrinking bounces and a skitter. Stylised.", hint: "Spacing sets how fast it bounces; Weight changes the clang.",
  tags: ["tool", "drop", "bounce", "metal", "clang", "impact", "wrench", "stylised"],
  layers: [
    ly("b1", "Impact", IMP([[420, 0, 0.35], [1130, -3, 0.2], [2700, -8, 0.1]], 0.5, 2), 0.5, A([0, 1], [0.5, 1]), { gain: -8, send: -10 }),
    ly("b2", "Bounce 1", IMP([[470, 0, 0.3], [1250, -3, 0.18], [2950, -8, 0.09]], 0.5, 2), 0.4, A([0, 1], [0.4, 1]), { start: 0.3, gain: -14, send: -10 }),
    ly("b3", "Bounce 2", IMP([[500, 0, 0.25], [1340, -3, 0.15], [3100, -8, 0.08]], 0.5, 2), 0.35, A([0, 1], [0.35, 1]), { start: 0.5, gain: -20, send: -10 }),
    ly("b4", "Bounce 3", IMP([[530, 0, 0.2], [1420, -3, 0.12], [3300, -8, 0.06]], 0.5, 2), 0.3, A([0, 1], [0.3, 1]), { start: 0.64, gain: -26, send: -10 }),
    ly("skitter", "Skitter", SEQ(IMP([[1500, 0, 0.02], [3400, -5, 0.012]], 0.7, 0.8), 38, { intervalJitter: 0.8, pitchRangeSemitones: 6, gainRangeDb: 12, eventDecaySeconds: 0.02 }), 0.45, A([0, 1], [0.45, 0]), { start: 0.78, gain: -34, send: -10 }),
  ],
  macros: [mac("weight", "Weight", "Light", "Heavy", "Size of the clang."), mac("material", "Material", "Dull", "Bright", "Ring frequencies."), mac("spacing", "Bounce spacing", "Tight", "Loose", "Time between bounces."), mac("damping", "Damping", "Ringing", "Dead", "How quickly each hit dies."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [mp("weight", "layers.b1.gainDb", 8), oct("weight", "layers.b1.source.modes.0.frequencyHz", 0.8, { polarity: -1 }), oct("material", "layers.b1.source.modes.1.frequencyHz", 0.8), oct("material", "layers.b2.source.modes.1.frequencyHz", 0.8), oct("material", "layers.b3.source.modes.1.frequencyHz", 0.8), mp("spacing", "layers.b2.startSeconds", 0.2), mp("spacing", "layers.b3.startSeconds", 0.34), mp("spacing", "layers.b4.startSeconds", 0.44), mp("spacing", "layers.skitter.startSeconds", 0.5), oct("damping", "layers.b1.timeScale", 1.0, { polarity: -1 }), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.7, returnDb: -26 },
});

export const debrisRattle = P({
  id: "debris-rattle", name: "Debris rattle", family: "material-impacts", seed: 6105, duration: 1.8, fileCategory: "Impact", fileName: "DebrisRattle",
  description: "Loose scraps and fragments shaken and settling: clattering scatter that thins out and stops. Stylised.", hint: "Increase Scatter for more pieces; Weight adds heavier clunks among the small ones.",
  tags: ["debris", "rattle", "scatter", "rubble", "fragments", "shake", "impact", "stylised"],
  layers: [
    ly("small", "Small pieces", SEQ(IMP([[1800, 0, 0.03], [3300, -4, 0.02], [5200, -8, 0.012]], 0.7, 0.8), 34, { intervalJitter: 0.8, pitchRangeSemitones: 9, gainRangeDb: 18, eventDecaySeconds: 0.035 }), 1.7, A([0, 0], [0.04, 1], [0.6, 0.7], [1.7, 0]), { gain: -22, send: -10 }),
    ly("mid", "Medium pieces", SEQ(IMP([[700, 0, 0.06], [1500, -5, 0.04]], 0.6, 1.2), 11, { intervalJitter: 0.8, pitchRangeSemitones: 7, gainRangeDb: 12, eventDecaySeconds: 0.06 }), 1.5, A([0, 0], [0.05, 1], [0.5, 0.6], [1.5, 0]), { gain: -22, send: -10 }),
    ly("heavy", "Heavy pieces", SEQ(IMP([[240, 0, 0.12], [560, -5, 0.07]], 0.5, 2), 3, { intervalJitter: 0.8, pitchRangeSemitones: 5, gainRangeDb: 10, eventDecaySeconds: 0.12 }), 1.2, A([0, 0], [0.05, 1], [0.4, 0.7], [1.2, 0]), { gain: -20, send: -10 }),
  ],
  macros: [mac("scatter", "Scatter", "Few", "Many", "How many pieces."), mac("weight", "Weight", "Light", "Heavy", "Heavy clunks."), mac("damping", "Damping", "Ringing", "Dead", "Ring of each piece."), mac("brightness", "Brightness", "Dull", "Bright", "Small-piece level."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [oct("scatter", "layers.small.source.ratePerSecond", 1.2), oct("scatter", "layers.mid.source.ratePerSecond", 1.0), mp("weight", "layers.heavy.gainDb", 14), oct("weight", "layers.heavy.source.ratePerSecond", 0.8), oct("damping", "layers.small.source.eventDecaySeconds", 1.2, { polarity: -1 }), oct("damping", "layers.mid.source.eventDecaySeconds", 1.2, { polarity: -1 }), mp("brightness", "layers.small.gainDb", 12), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.7, returnDb: -26 },
});
