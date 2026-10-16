import { A, O, N, IMP, SEQ, lp, hp, bp, drive, delay, ly, mac, mp, oct, P } from "./dsl";

// ---------- Communications (mono, no synthetic speech) ----------
export const radioOpen = P({
  id: "radio-open", name: "Radio open", family: "communications", seed: 7101, duration: 0.5, fileCategory: "Comms", fileName: "RadioOpen",
  description: "A transmit key-up: a click, a short squelch burst and a quick confirm tone.", hint: "Bandwidth narrows the radio; Interference adds hiss.",
  tags: ["radio", "comms", "open", "key", "squelch", "transmit", "beep"],
  layers: [
    ly("click", "Key click", IMP([[1800, 0, 0.012], [3600, -4, 0.008]], 0.6, 0.6), 0.04, A([0, 1], [0.04, 1]), { gain: -12 }),
    ly("squelch", "Squelch", N("white"), 0.16, A([0, 0], [0.004, 1], [0.1, 0.8], [0.16, 0]), { start: 0.015, gain: -22, filters: [bp(1700, 0.9), hp(500)] }),
    ly("beep", "Confirm tone", O("sine", 1250), 0.1, A([0, 0], [0.008, 1], [0.08, 1], [0.1, 0]), { start: 0.17, gain: -20, filters: [bp(1400, 0.8)] }),
    ly("hiss", "Carrier hiss", N("pink"), 0.3, A([0, 0], [0.01, 1], [0.3, 0]), { start: 0.1, gain: -40, filters: [bp(2200, 0.7)] }),
  ],
  macros: [mac("bandwidth", "Bandwidth", "Narrow", "Wide", "Radio filter width."), mac("interference", "Interference", "Clean", "Noisy", "Squelch and hiss."), mac("pitch", "Pitch", "Low", "High", "Tone pitch."), mac("duration", "Duration", "Short", "Long", "Length of the squelch.")],
  mappings: [oct("bandwidth", "layers.squelch.filters.0.cutoffHz", 0.8), oct("bandwidth", "layers.squelch.filters.0.q", 1.0, { polarity: -1 }), oct("bandwidth", "layers.beep.filters.0.q", 1.0, { polarity: -1 }), mp("interference", "layers.squelch.gainDb", 14), mp("interference", "layers.hiss.gainDb", 20), oct("pitch", "layers.beep.source.frequencyHz", 1), oct("duration", "layers.squelch.timeScale", 0.8), mp("duration", "layers.beep.startSeconds", 0.06)],
});

export const radioClose = P({
  id: "radio-close", name: "Radio close", family: "communications", seed: 7102, duration: 0.45, fileCategory: "Comms", fileName: "RadioClose",
  description: "A transmit key-down: a short end tone, a squelch tail and a closing click.", hint: "Bandwidth narrows the radio; Interference adds the noise tail.",
  tags: ["radio", "comms", "close", "release", "squelch", "end", "click"],
  layers: [
    ly("beep", "End tone", O("sine", 900), 0.1, A([0, 0], [0.008, 1], [0.08, 1], [0.1, 0]), { gain: -20, filters: [bp(1100, 0.8)] }),
    ly("tail", "Squelch tail", N("white"), 0.22, A([0, 0], [0.01, 1], [0.05, 0.9], [0.22, 0]), { start: 0.1, gain: -22, filters: [bp(1500, 0.9), hp(400)] }),
    ly("click", "Close click", IMP([[1500, 0, 0.012], [3000, -4, 0.008]], 0.6, 0.6), 0.04, A([0, 1], [0.04, 1]), { start: 0.32, gain: -12 }),
    ly("hiss", "Carrier hiss", N("pink"), 0.3, A([0, 1], [0.1, 0.8], [0.3, 0]), { start: 0.05, gain: -42, filters: [bp(2000, 0.7)] }),
  ],
  macros: [mac("bandwidth", "Bandwidth", "Narrow", "Wide", "Radio filter width."), mac("interference", "Interference", "Clean", "Noisy", "Tail and hiss."), mac("pitch", "Pitch", "Low", "High", "Tone pitch."), mac("duration", "Duration", "Short", "Long", "Length of the tail.")],
  mappings: [oct("bandwidth", "layers.tail.filters.0.cutoffHz", 0.8), oct("bandwidth", "layers.tail.filters.0.q", 1.0, { polarity: -1 }), oct("bandwidth", "layers.beep.filters.0.q", 1.0, { polarity: -1 }), mp("interference", "layers.tail.gainDb", 14), mp("interference", "layers.hiss.gainDb", 20), oct("pitch", "layers.beep.source.frequencyHz", 1), oct("duration", "layers.tail.timeScale", 0.8), mp("duration", "layers.click.startSeconds", 0.06)],
});

export const staticBurst = P({
  id: "static-burst", name: "Static burst", family: "communications", seed: 7103, duration: 1.1, fileCategory: "Comms", fileName: "StaticBurst",
  description: "A burst of radio static with crackling pops and a pulsing envelope.", hint: "Pulse rate sets the chopping; Bandwidth sets how thin it sounds.",
  tags: ["static", "radio", "noise", "interference", "crackle", "burst", "comms"],
  layers: [
    ly("static", "Static", N("white"), 1.1, A([0, 0], [0.01, 1], [0.8, 0.8], [1.1, 0]), { gain: -22, filters: [bp(2200, 0.5), hp(300)], tremolo: { rateHz: 14, depth: 0.55 } }),
    ly("pops", "Pops", SEQ(IMP([[2600, 0, 0.01], [4800, -4, 0.007]], 0.9, 0.5), 22, { intervalJitter: 0.95, pitchRangeSemitones: 10, gainRangeDb: 14, eventDecaySeconds: 0.01 }), 1.1, A([0, 1], [1.1, 1]), { gain: -26 }),
    ly("low", "Low crunch", N("brown"), 1.1, A([0, 0], [0.02, 1], [1.1, 0]), { gain: -34, filters: [lp(500)] }),
  ],
  macros: [mac("bandwidth", "Bandwidth", "Narrow", "Wide", "Filter width."), mac("interference", "Interference", "Light", "Heavy", "Static and pop level."), mac("pulse", "Pulse rate", "Slow", "Fast", "Chopping speed."), mac("duration", "Duration", "Short", "Long", "Length.")],
  mappings: [oct("bandwidth", "layers.static.filters.0.cutoffHz", 0.8), oct("bandwidth", "layers.static.filters.0.q", 1.0, { polarity: -1 }), mp("interference", "layers.static.gainDb", 10), mp("interference", "layers.pops.gainDb", 12), oct("pulse", "layers.static.tremolo.rateHz", 1.6), oct("duration", "layers.static.timeScale", 0.8), oct("duration", "layers.pops.timeScale", 0.8), oct("duration", "layers.low.timeScale", 0.8)],
});

export const corruptedTransmission = P({
  id: "corrupted-transmission", name: "Corrupted transmission", family: "communications", seed: 7104, duration: 2.2, fileCategory: "Comms", fileName: "CorruptedTx",
  description: "A transmission breaking up: stuttering tone fragments, glitching chirps and a noisy carrier. No speech.", hint: "Instability scatters the glitches; Pulse rate sets how often they chatter.",
  tags: ["corrupted", "glitch", "transmission", "radio", "data", "comms", "broken", "interference"],
  layers: [
    ly("carrier", "Carrier", O("sine", 1000, { fm: { ratio: 1.3, index: 1.2 } }), 2.1, A([0, 0], [0.05, 1], [0.5, 0.8], [0.56, 0], [0.7, 0], [0.74, 1], [1.4, 0.8], [1.46, 0], [1.6, 0], [1.64, 1], [2.1, 0]), { gain: -26, pitch: A([0, 0], [0.5, 4], [0.7, -6], [1.4, 8], [1.6, -3], [2.1, 2]), filters: [bp(1300, 1)] }),
    ly("glitch", "Glitch chirps", SEQ(O("square", 1400), 10, { intervalJitter: 0.9, pitchRangeSemitones: 14, gainRangeDb: 14, eventDecaySeconds: 0.035 }), 2.1, A([0, 1], [2.1, 1]), { gain: -30, filters: [bp(2000, 0.9)] }),
    ly("noise", "Noisy carrier", N("white"), 2.1, A([0, 0.3], [0.5, 1], [1, 0.5], [1.5, 1], [2.1, 0.3]), { gain: -34, filters: [bp(1800, 0.6)], tremolo: { rateHz: 9, depth: 0.6 } }),
  ],
  macros: [mac("instability", "Instability", "Steady", "Breaking up", "FM wildness and glitch spread."), mac("pulse", "Pulse rate", "Slow", "Chattering", "Glitch frequency."), mac("bandwidth", "Bandwidth", "Narrow", "Wide", "Filter width."), mac("interference", "Interference", "Light", "Heavy", "Noise level.")],
  mappings: [mp("instability", "layers.carrier.source.fm.index", 3), mp("instability", "layers.glitch.source.pitchRangeSemitones", 10), oct("pulse", "layers.glitch.source.ratePerSecond", 1.5), oct("pulse", "layers.noise.tremolo.rateHz", 1.5), mp("pulse", "layers.glitch.gainDb", 8), oct("bandwidth", "layers.carrier.filters.0.cutoffHz", 0.8), oct("bandwidth", "layers.noise.filters.0.cutoffHz", 0.8), mp("interference", "layers.noise.gainDb", 16), mp("interference", "layers.glitch.gainDb", 6)],
});

export const distantBeacon = P({
  id: "distant-beacon", name: "Distant beacon", family: "communications", seed: 7105, duration: 4, fileCategory: "Comms", fileName: "DistantBeacon",
  description: "A far-off beacon pinging through space: a soft tone, long echoes and a faint carrier hiss.", hint: "Distance dulls and quietens the ping and adds echo; Pulse rate sets the ping spacing.",
  tags: ["beacon", "ping", "distant", "signal", "radar", "comms", "echo", "space"],
  layers: [
    ly("ping", "Ping", SEQ(O("sine", 740), 0.7, { intervalJitter: 0, pitchRangeSemitones: 0, gainRangeDb: 0, eventDecaySeconds: 0.35 }), 4, A([0, 1], [4, 1]), { gain: -12, filters: [lp(2200, 0.8)], effects: [delay(520, 0.45, 0.45)], send: -2 }),
    ly("over", "Overtone", SEQ(O("sine", 1480), 0.7, { intervalJitter: 0, pitchRangeSemitones: 0, gainRangeDb: 0, eventDecaySeconds: 0.18 }), 4, A([0, 1], [4, 1]), { gain: -30, effects: [delay(520, 0.45, 0.45)], send: -4 }),
    ly("carrier", "Carrier hiss", N("pink"), 4, A([0, 0.7], [2, 1], [4, 0.7]), { gain: -46, filters: [bp(3000, 0.6)] }),
  ],
  macros: [mac("pitch", "Pitch", "Low", "High", "Ping pitch."), mac("distance", "Distance", "Near", "Far", "Dulls, quietens and adds room."), mac("pulse", "Pulse rate", "Slow", "Fast", "Ping spacing."), mac("echo", "Echo", "Single", "Long", "Echo repeats.")],
  mappings: [oct("pitch", "layers.ping.source.inner.frequencyHz", 1), oct("pitch", "layers.over.source.inner.frequencyHz", 1), oct("distance", "layers.ping.filters.0.cutoffHz", 1.2, { polarity: -1 }), mp("distance", "layers.ping.gainDb", 8, { polarity: -1 }), mp("distance", "layers.ping.spaceSendDb", 10), mp("distance", "master.space.returnDb", 12), oct("pulse", "layers.ping.source.ratePerSecond", 1), oct("pulse", "layers.over.source.ratePerSecond", 1), mp("echo", "layers.ping.effects.0.feedback", 0.3), mp("echo", "layers.ping.effects.0.mix", 0.3)],
  space: { decaySeconds: 2.2, returnDb: -16 },
});

// ---------- Motion and transitions ----------
export const airWhoosh = P({
  id: "air-whoosh", name: "Air whoosh", family: "motion", seed: 8101, duration: 1.0, fileCategory: "Motion", fileName: "AirWhoosh",
  description: "A passing rush of air: a filtered swell that sweeps up and away.", hint: "Speed shortens and quickens the pass; Texture adds grit.",
  tags: ["whoosh", "air", "swish", "pass", "motion", "transition", "wind"],
  layers: [
    ly("air", "Air", N("pink"), 1.0, A([0, 0], [0.4, 1], [0.7, 0.6], [1.0, 0]), { gain: -16, filters: [bp(900, 0.9, A([0, -1.2], [0.4, 1.2], [1.0, -0.4]))], send: -10 }),
    ly("body", "Low body", N("brown"), 1.0, A([0, 0], [0.4, 1], [1.0, 0]), { gain: -26, filters: [lp(260, 0.8, A([0, 0], [0.4, 0.6], [1.0, -0.5]))] }),
    ly("grit", "Grit", N("white"), 1.0, A([0, 0], [0.38, 1], [1.0, 0]), { gain: -36, filters: [hp(4000)], effects: [drive(0.2)] }),
  ],
  macros: [mac("speed", "Speed", "Slow", "Fast", "How quickly it passes."), mac("pitch", "Pitch", "Low", "High", "Tone of the air."), mac("weight", "Weight", "Light", "Heavy", "Low body."), mac("texture", "Texture", "Smooth", "Gritty", "Grit level."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 10)],
  mappings: [oct("speed", "layers.air.timeScale", 0.8, { polarity: -1 }), oct("speed", "layers.body.timeScale", 0.8, { polarity: -1 }), oct("speed", "layers.grit.timeScale", 0.8, { polarity: -1 }), oct("pitch", "layers.air.filters.0.cutoffHz", 1.2), mp("weight", "layers.body.gainDb", 16), mp("texture", "layers.grit.gainDb", 18), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.8, returnDb: -26 },
});

export const mechanicalSweep = P({
  id: "mechanical-sweep", name: "Mechanical sweep", family: "motion", seed: 8102, duration: 1.4, fileCategory: "Motion", fileName: "MechSweep",
  description: "A machine winding up and sweeping past: rising whine, clattering gears and a metallic wash.", hint: "Pitch travel is set by Speed; Texture adds grit and clatter.",
  tags: ["sweep", "mechanical", "machine", "wind", "transition", "gears", "motion", "rise"],
  layers: [
    ly("whine", "Whine", O("saw", 180), 1.4, A([0, 0], [0.5, 1], [1.0, 0.8], [1.4, 0]), { gain: -22, pitch: A([0, -4], [0.9, 22], [1.4, 24]), filters: [bp(1200, 1.4, A([0, -1], [0.9, 1.5], [1.4, 1.5]))], effects: [drive(0.2)], send: -10 }),
    ly("gears", "Gear clatter", SEQ(IMP([[900, 0, 0.025], [2100, -5, 0.015]], 0.6, 1), 18, { intervalJitter: 0.25, pitchRangeSemitones: 3, gainRangeDb: 6, eventDecaySeconds: 0.03 }), 1.4, A([0, 0.2], [0.9, 1], [1.4, 0]), { gain: -30, send: -10 }),
    ly("wash", "Metal wash", N("pink"), 1.4, A([0, 0], [0.8, 1], [1.4, 0]), { gain: -34, filters: [bp(2400, 1.8, A([0, -1], [1.0, 1], [1.4, 1]))] }),
  ],
  macros: [mac("speed", "Speed", "Slow", "Fast", "Pitch of the whine."), mac("travel", "Pitch travel", "Narrow", "Wide", "Wash and sweep depth."), mac("texture", "Texture", "Smooth", "Rough", "Grit and clatter."), mac("weight", "Weight", "Light", "Heavy", "Whine level."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 12)],
  mappings: [oct("speed", "layers.whine.source.frequencyHz", 1.2), oct("speed", "layers.gears.source.ratePerSecond", 1.0), mp("travel", "layers.wash.gainDb", 14), oct("travel", "layers.wash.filters.0.cutoffHz", 0.8), mp("texture", "layers.whine.effects.0.amount", 0.5), mp("texture", "layers.gears.gainDb", 14), mp("weight", "layers.whine.gainDb", 10), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.8, returnDb: -26 },
});

export const energyPassBy = P({
  id: "energy-pass-by", name: "Energy pass-by", family: "motion", seed: 8103, duration: 1.6, channels: 2, fileCategory: "Motion", fileName: "EnergyPassBy",
  description: "A bolt of energy flying past from left to right: a falling Doppler-like whine with a sizzling trail.", hint: "Speed shortens the pass; Pitch moves the whole sweep. Exports stereo so the movement is kept.",
  tags: ["energy", "pass", "flyby", "projectile", "bolt", "whoosh", "motion", "stereo"],
  layers: [
    ly("whineL", "Whine (left)", O("saw", 900, { fm: { ratio: 1.01, index: 0.3 } }), 1.2, A([0, 0], [0.35, 1], [0.7, 0.2], [1.2, 0]), { gain: -22, pan: -0.8, pitch: A([0, 10], [0.7, -6], [1.2, -10]), filters: [lp(5000)], send: -10 }),
    ly("whineR", "Whine (right)", O("saw", 900, { fm: { ratio: 1.01, index: 0.3 } }), 1.3, A([0, 0], [0.4, 0.1], [0.75, 1], [1.3, 0]), { start: 0.1, gain: -22, pan: 0.8, pitch: A([0, 10], [0.7, -6], [1.3, -10]), filters: [lp(5000)], send: -10 }),
    ly("trail", "Sizzling trail", N("white"), 1.5, A([0, 0], [0.5, 0.8], [0.9, 1], [1.5, 0]), { gain: -32, filters: [hp(3500)], pan: 0.2, send: -10 }),
    ly("sub", "Sub rush", O("sine", 70), 1.4, A([0, 0], [0.7, 1], [1.4, 0]), { gain: -22, pitch: A([0, 5], [1.4, -7]) }),
  ],
  macros: [mac("speed", "Speed", "Slow", "Fast", "How quickly it passes."), mac("pitch", "Pitch", "Low", "High", "Pitch of the sweep."), mac("texture", "Texture", "Clean", "Fizzy", "FM edge and trail."), mac("weight", "Weight", "Light", "Heavy", "Sub rush."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [oct("speed", "layers.whineL.timeScale", 0.6, { polarity: -1 }), oct("speed", "layers.whineR.timeScale", 0.6, { polarity: -1 }), oct("speed", "layers.trail.timeScale", 0.6, { polarity: -1 }), oct("speed", "layers.sub.timeScale", 0.6, { polarity: -1 }), oct("pitch", "layers.whineL.source.frequencyHz", 1), oct("pitch", "layers.whineR.source.frequencyHz", 1), mp("texture", "layers.whineL.source.fm.index", 2), mp("texture", "layers.whineR.source.fm.index", 2), mp("texture", "layers.trail.gainDb", 12), mp("weight", "layers.sub.gainDb", 14), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.9, returnDb: -26 },
});

export const pressureRelease = P({
  id: "pressure-release", name: "Pressure release", family: "motion", seed: 8104, duration: 1.3, fileCategory: "Motion", fileName: "PressureRelease",
  description: "A sharp venting of pressure: a hard hiss that fades long and dull, over a low thump.", hint: "Brightness opens the hiss; Duration lengthens the venting.",
  tags: ["pressure", "release", "hiss", "vent", "steam", "air", "transition", "purge"],
  layers: [
    ly("hiss", "Hiss", N("white"), 1.3, A([0, 0], [0.01, 1], [0.35, 0.7], [1.3, 0]), { gain: -16, filters: [hp(1800), lp(9000, 0.8, A([0, 0], [1.3, -2.5]))], send: -10 }),
    ly("body", "Rush body", N("pink"), 1.3, A([0, 0], [0.02, 1], [0.6, 0.5], [1.3, 0]), { gain: -26, filters: [bp(600, 0.8, A([0, 0.5], [1.3, -1]))] }),
    ly("thump", "Valve thump", O("sine", 80), 0.2, A([0, 0], [0.004, 1], [0.2, 0]), { gain: -12, pitch: A([0, 10], [0.15, 0]) }),
    ly("clack", "Valve clack", IMP([[1300, 0, 0.03], [2800, -6, 0.02]], 0.5, 1), 0.08, A([0, 1], [0.08, 1]), { gain: -22 }),
  ],
  macros: [mac("weight", "Weight", "Light", "Heavy", "Valve thump and rush body."), mac("brightness", "Brightness", "Dull", "Sharp", "Opening of the hiss."), mac("duration", "Duration", "Short", "Long", "Length of the venting."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 12)],
  mappings: [mp("weight", "layers.thump.gainDb", 12), mp("weight", "layers.body.gainDb", 12), oct("brightness", "layers.hiss.filters.0.cutoffHz", 1.2), oct("brightness", "layers.hiss.filters.1.cutoffHz", 1.0), oct("duration", "layers.hiss.timeScale", 0.9), oct("duration", "layers.body.timeScale", 0.9), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.8, returnDb: -26 },
});

export const ominousRiser = P({
  id: "ominous-riser", name: "Ominous riser", family: "motion", seed: 8105, duration: 6, fileCategory: "Motion", fileName: "OminousRiser",
  description: "A slow-building tension riser: climbing dissonant tones, swelling air and a deepening sub that cuts off at the peak.", hint: "Tension raises the climb; Weight deepens the sub.",
  tags: ["riser", "ominous", "tension", "build", "transition", "swell", "horror", "motion"],
  layers: [
    ly("tone1", "Rising tone", O("saw", 110), 6, A([0, 0], [4.5, 0.5], [5.7, 1], [5.9, 0], [6, 0]), { gain: -26, pitch: A([0, 0], [5.7, 14]), filters: [lp(600, 1.5, A([0, 0], [5.7, 3]))], send: -8 }),
    ly("tone2", "Dissonant tone", O("saw", 116.5), 6, A([0, 0], [4.5, 0.5], [5.7, 1], [5.9, 0], [6, 0]), { gain: -26, pitch: A([0, 0], [5.7, 15]), filters: [lp(600, 1.5, A([0, 0], [5.7, 3]))], send: -8 }),
    ly("air", "Swelling air", N("pink"), 6, A([0, 0], [4, 0.3], [5.7, 1], [5.9, 0], [6, 0]), { gain: -30, filters: [bp(700, 0.8, A([0, -1], [5.7, 2.5]))], send: -6 }),
    ly("sub", "Sub swell", O("sine", 45), 6, A([0, 0], [3, 0.4], [5.7, 1], [5.9, 0], [6, 0]), { gain: -20, pitch: A([0, 0], [5.7, 7]) }),
    ly("tick", "Heartbeat ticks", SEQ(IMP([[190, 0, 0.12]], 0.4, 3), 1.4, { intervalJitter: 0, pitchRangeSemitones: 0, gainRangeDb: 0, eventDecaySeconds: 0.12 }), 6, A([0, 0], [3, 0.3], [5.7, 1], [5.9, 0], [6, 0]), { gain: -26, send: -10 }),
  ],
  macros: [mac("tension", "Tension", "Subtle", "Intense", "Climb and air."), mac("brightness", "Brightness", "Dark", "Piercing", "Filter opening."), mac("weight", "Weight", "Light", "Crushing", "Sub level."), mac("space", "Space", "Dry", "Vast", "Shared reverb.", 40)],
  mappings: [oct("tension", "layers.tone1.source.frequencyHz", 0.6), oct("tension", "layers.tone2.source.frequencyHz", 0.6), mp("tension", "layers.air.gainDb", 10), mp("tension", "layers.tick.gainDb", 8), oct("brightness", "layers.tone1.filters.0.cutoffHz", 1.2), oct("brightness", "layers.tone2.filters.0.cutoffHz", 1.2), mp("weight", "layers.sub.gainDb", 12), mp("space", "master.space.returnDb", 24), mp("space", "master.space.decaySeconds", 2)],
  space: { decaySeconds: 2.2, returnDb: -16 },
});
