import { A, O, N, IMP, SEQ, lp, hp, bp, drive, delay, ly, mac, mp, oct, P } from "./dsl";

// ---------- Interface ----------
export const softConfirm = P({
  id: "soft-confirm", name: "Soft confirm", family: "interface", seed: 1101, duration: 0.4, fileCategory: "UI", fileName: "SoftConfirm",
  description: "A gentle two-note rising chime for accepting a choice.", hint: "Increase Pitch for a brighter chime; Softness lengthens and rounds it.",
  tags: ["ui", "confirm", "accept", "chime", "button", "interface"],
  layers: [
    ly("n1", "First note", O("sine", 660), 0.22, A([0, 0], [0.012, 1], [0.08, 0.5], [0.22, 0]), { gain: -10, filters: [lp(5200)] }),
    ly("n2", "Second note", O("sine", 880), 0.3, A([0, 0], [0.012, 1], [0.1, 0.45], [0.3, 0]), { start: 0.08, gain: -11, filters: [lp(5200)] }),
    ly("air", "Overtone", O("triangle", 1760), 0.2, A([0, 0], [0.01, 1], [0.2, 0]), { start: 0.08, gain: -26 }),
  ],
  macros: [mac("pitch", "Pitch", "Low", "High", "Pitch of both notes."), mac("brightness", "Brightness", "Round", "Glassy", "Overtone level and filter opening."), mac("softness", "Softness", "Crisp", "Soft", "Length of each note.")],
  mappings: [oct("pitch", "layers.n1.source.frequencyHz", 1), oct("pitch", "layers.n2.source.frequencyHz", 1), oct("pitch", "layers.air.source.frequencyHz", 1),
    mp("brightness", "layers.air.gainDb", 18), oct("brightness", "layers.n1.filters.0.cutoffHz", 1.5), oct("brightness", "layers.n2.filters.0.cutoffHz", 1.5),
    oct("softness", "layers.n1.timeScale", 0.9), oct("softness", "layers.n2.timeScale", 0.9)],
  space: { decaySeconds: 0.4, returnDb: -30 },
});

export const navigationClick = P({
  id: "navigation-click", name: "Navigation click", family: "interface", seed: 1102, duration: 0.09, fileCategory: "UI", fileName: "NavClick",
  description: "A tiny dry tick for moving through menus.", hint: "Increase Snap for a shorter, drier tick; Pitch moves the whole click.",
  tags: ["ui", "click", "tick", "menu", "navigation", "button"],
  layers: [
    ly("tick", "Tick", IMP([[2600, 0, 0.025], [4100, -5, 0.018]], 0.25, 0.8), 0.08, A([0, 1], [0.08, 1]), { gain: -10 }),
    ly("snap", "Noise snap", N("white"), 0.012, A([0, 1], [0.012, 0]), { gain: -24, filters: [hp(5000)] }),
  ],
  macros: [mac("pitch", "Pitch", "Low", "High", "Pitch of the tick.", 50), mac("snap", "Snap", "Soft", "Snappy", "How short and dry the tick is."), mac("click", "Click", "None", "Strong", "Level of the noise snap.", 40)],
  mappings: [oct("pitch", "layers.tick.source.modes.0.frequencyHz", 1.2), oct("pitch", "layers.tick.source.modes.1.frequencyHz", 1.2), oct("snap", "layers.tick.timeScale", 1.2, { polarity: -1 }), mp("click", "layers.snap.gainDb", 18)],
});

export const accessDenied = P({
  id: "access-denied", name: "Access denied", family: "interface", seed: 1103, duration: 0.7, fileCategory: "UI", fileName: "AccessDenied",
  description: "Two low, buzzy beeps falling in pitch: a clear 'no'.", hint: "Increase Urgency for faster, harsher beeps; Pitch shifts the pair.",
  tags: ["ui", "denied", "error", "buzz", "warning", "no", "alarm"],
  layers: [
    ly("b1", "Beep one", O("square", 220), 0.24, A([0, 0], [0.006, 1], [0.2, 0.9], [0.24, 0]), { gain: -16, filters: [lp(1800, 1.1)], effects: [drive(0.25)] }),
    ly("b2", "Beep two", O("square", 165), 0.3, A([0, 0], [0.006, 1], [0.26, 0.9], [0.3, 0]), { start: 0.3, gain: -16, filters: [lp(1500, 1.1)], effects: [drive(0.25)] }),
    ly("sub", "Sub weight", O("sine", 82), 0.6, A([0, 0], [0.01, 1], [0.24, 0.8], [0.3, 0], [0.31, 0.9], [0.6, 0]), { gain: -18 }),
  ],
  macros: [mac("pitch", "Pitch", "Low", "High", "Pitch of the pair."), mac("urgency", "Urgency", "Calm", "Urgent", "Harder buzz and a tighter gap."), mac("harshness", "Harshness", "Mellow", "Harsh", "Filter opening.")],
  mappings: [oct("pitch", "layers.b1.source.frequencyHz", 1), oct("pitch", "layers.b2.source.frequencyHz", 1), oct("pitch", "layers.sub.source.frequencyHz", 1),
    mp("urgency", "layers.b1.effects.0.amount", 0.5), mp("urgency", "layers.b2.effects.0.amount", 0.5), mp("urgency", "layers.b2.startSeconds", 0.1, { polarity: -1 }),
    oct("harshness", "layers.b1.filters.0.cutoffHz", 1.5), oct("harshness", "layers.b2.filters.0.cutoffHz", 1.5)],
  space: { decaySeconds: 0.3, returnDb: -34 },
});

export const criticalWarning = P({
  id: "critical-warning", name: "Critical warning", family: "interface", seed: 1104, duration: 1.3, fileCategory: "UI", fileName: "CriticalWarning",
  description: "A repeating two-tone alarm that is hard to ignore, with a low pulse under it.", hint: "Increase Urgency for a harder, rougher alarm; Pitch moves both tones.",
  tags: ["alarm", "warning", "critical", "alert", "siren", "ui", "interface"],
  layers: [
    ly("tone", "Alarm tone", O("square", 880), 1.25, A([0, 0], [0.01, 1], [0.27, 1], [0.3, 0.1], [0.32, 1], [0.58, 1], [0.6, 0.1], [0.62, 1], [0.88, 1], [0.9, 0.1], [0.92, 1], [1.2, 1], [1.25, 0]),
      { gain: -20, pitch: A([0, 0], [0.29, 0], [0.3, -5], [0.59, -5], [0.6, 0], [0.89, 0], [0.9, -5], [1.25, -5]), filters: [lp(3200, 1)], effects: [drive(0.2)] }),
    ly("fifth", "Fifth", O("saw", 1320), 1.25, A([0, 0], [0.01, 0.5], [1.2, 0.5], [1.25, 0]), { gain: -30, pitch: A([0, 0], [0.29, 0], [0.3, -5], [0.59, -5], [0.6, 0], [0.89, 0], [0.9, -5], [1.25, -5]), filters: [lp(2600)] }),
    ly("pulse", "Low pulse", O("sine", 110), 1.25, A([0, 0], [0.01, 1], [0.3, 0.2], [0.6, 1], [0.9, 0.2], [1.2, 0.8], [1.25, 0]), { gain: -18 }),
  ],
  macros: [mac("pitch", "Pitch", "Low", "High", "Pitch of the alarm."), mac("urgency", "Urgency", "Steady", "Frantic", "Grit and weight."), mac("brightness", "Brightness", "Dull", "Piercing", "Filter opening.")],
  mappings: [oct("pitch", "layers.tone.source.frequencyHz", 1), oct("pitch", "layers.fifth.source.frequencyHz", 1), oct("pitch", "layers.pulse.source.frequencyHz", 1),
    mp("urgency", "layers.tone.effects.0.amount", 0.6), mp("urgency", "layers.pulse.gainDb", 10), oct("brightness", "layers.tone.filters.0.cutoffHz", 1.5), mp("brightness", "layers.fifth.gainDb", 12)],
  space: { decaySeconds: 0.6, returnDb: -30 },
});

// ---------- Energy weapons ----------
export const heavyPulse = P({
  id: "heavy-pulse", name: "Heavy pulse", family: "energy-weapons", seed: 2101, duration: 0.9, fileCategory: "Weapon", fileName: "HeavyPulse",
  description: "A big, slow pulse cannon: deep dropping thump, wide crack and a long ringing decay.", hint: "Increase Body for more chest-thump; Instability adds a wobbling FM edge.",
  tags: ["gun", "weapon", "cannon", "heavy", "pulse", "energy", "shot"],
  layers: [
    ly("sub", "Sub thump", O("sine", 62), 0.7, A([0, 0], [0.004, 1], [0.12, 0.6], [0.7, 0]), { gain: -6, pitch: A([0, 19], [0.1, 0], [0.7, -10]), send: -8 }),
    ly("mid", "Mid body", O("saw", 140, { fm: { ratio: 1.5, index: 0.6 } }), 0.5, A([0, 0], [0.003, 1], [0.15, 0.4], [0.5, 0]), { gain: -16, pitch: A([0, 12], [0.15, 0], [0.5, -7]), filters: [lp(1400, 1.2, A([0, 1], [0.5, -1]))], send: -8 }),
    ly("crack", "Crack", N("white"), 0.2, A([0, 0], [0.001, 1], [0.03, 0.35], [0.2, 0]), { gain: -12, filters: [hp(1800)], send: -10 }),
    ly("ring", "Ringing tail", IMP([[310, 0, 0.7], [780, -6, 0.45], [1900, -10, 0.25]], 0.3, 6), 0.9, A([0, 1], [0.9, 1]), { gain: -22, send: -4 }),
  ],
  macros: [mac("body", "Body", "Light", "Heavy", "Depth and weight of the thump."), mac("crack", "Crack", "Soft", "Sharp", "Level of the noise crack."), mac("instability", "Instability", "Stable", "Unstable", "FM wobble and edge."), mac("decay", "Decay", "Short", "Long", "How long it rings."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 20)],
  mappings: [mp("body", "layers.sub.gainDb", 10), oct("body", "layers.sub.source.frequencyHz", 0.8, { polarity: -1 }), mp("crack", "layers.crack.gainDb", 16),
    mp("instability", "layers.mid.source.fm.index", 3), mp("instability", "layers.mid.gainDb", 6), oct("decay", "layers.sub.timeScale", 0.8), oct("decay", "layers.ring.timeScale", 1.0), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.2, returnDb: -26 },
});

export const chargeUp = P({
  id: "charge-up", name: "Charge-up", family: "energy-weapons", seed: 2102, duration: 1.8, fileCategory: "Weapon", fileName: "ChargeUp",
  description: "A rising whine that builds tension before a shot, with swelling air and a flutter.", hint: "Increase Charge for a higher final pitch; Instability adds flutter.",
  tags: ["charge", "weapon", "energy", "rise", "buildup", "power", "gun"],
  layers: [
    ly("whine", "Rising whine", O("saw", 220, { vibrato: { rateHz: 9, depthSemitones: 0.1 } }), 1.8, A([0, 0], [0.2, 0.3], [1.6, 1], [1.8, 0]), { gain: -20, pitch: A([0, 0], [1.6, 24], [1.8, 24]), filters: [lp(900, 2, A([0, 0], [1.6, 3], [1.8, 3]))], send: -10 }),
    ly("tone", "Pure tone", O("sine", 440), 1.8, A([0, 0], [0.3, 0.2], [1.6, 1], [1.8, 0]), { gain: -18, pitch: A([0, 0], [1.6, 19], [1.8, 19]), send: -10 }),
    ly("air", "Swelling air", N("pink"), 1.8, A([0, 0], [1.6, 1], [1.8, 0]), { gain: -26, filters: [bp(1200, 1.2, A([0, -1.5], [1.6, 1.5], [1.8, 1.5]))], send: -8 }),
    ly("sub", "Sub", O("sine", 55), 1.8, A([0, 0], [1.6, 1], [1.8, 0]), { gain: -22, pitch: A([0, 0], [1.6, 12], [1.8, 12]) }),
  ],
  macros: [mac("charge", "Charge", "Low", "High", "How high the whine climbs and how much air swells."), mac("instability", "Instability", "Smooth", "Fluttering", "Flutter and edge."), mac("weight", "Weight", "Thin", "Heavy", "Sub level."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 10)],
  mappings: [oct("charge", "layers.whine.source.frequencyHz", 1), oct("charge", "layers.tone.source.frequencyHz", 1), mp("charge", "layers.air.gainDb", 14),
    mp("instability", "layers.whine.source.vibrato.depthSemitones", 2.5), oct("instability", "layers.whine.source.vibrato.rateHz", 1.2), oct("instability", "layers.whine.filters.0.q", 1.5), mp("instability", "layers.whine.gainDb", 6), mp("weight", "layers.sub.gainDb", 14), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.8, returnDb: -28 },
});

export const overheatedDischarge = P({
  id: "overheated-discharge", name: "Overheated discharge", family: "energy-weapons", seed: 2103, duration: 1.4, fileCategory: "Weapon", fileName: "OverheatDischarge",
  description: "A ragged, sputtering blast: crackling sparks, a sagging low body and a rough noise burst.", hint: "Increase Instability for more sputter and grit; Body adds the sagging low end.",
  tags: ["gun", "weapon", "overheat", "discharge", "sparks", "broken", "energy", "crackle"],
  layers: [
    ly("burst", "Noise burst", N("white"), 0.9, A([0, 0], [0.002, 1], [0.1, 0.6], [0.35, 0.5], [0.9, 0]), { gain: -16, filters: [bp(1800, 0.7)], effects: [drive(0.45)], send: -10 }),
    ly("body", "Sagging body", O("saw", 120), 1.2, A([0, 0], [0.004, 1], [0.2, 0.5], [1.2, 0]), { gain: -10, pitch: A([0, 7], [0.25, 0], [1.2, -14]), filters: [lp(900, 1.5)], effects: [drive(0.3)], send: -10 }),
    ly("sparks", "Sparks", SEQ(IMP([[3400, 0, 0.012], [5200, -6, 0.008]], 0.8, 0.5), 45, { intervalJitter: 0.9, pitchRangeSemitones: 10, gainRangeDb: 14, eventDecaySeconds: 0.012 }), 1.3, A([0, 0.3], [0.1, 1], [0.7, 0.6], [1.3, 0]), { gain: -22, send: -10 }),
    ly("pop", "Pop", O("sine", 90), 0.25, A([0, 0], [0.003, 1], [0.25, 0]), { gain: -8, pitch: A([0, 18], [0.12, 0], [0.25, -8]) }),
  ],
  macros: [mac("instability", "Instability", "Steady", "Ragged", "Sputter, grit and spark density."), mac("body", "Body", "Light", "Heavy", "Low sagging body."), mac("crack", "Crack", "Soft", "Harsh", "Noise burst level."), mac("decay", "Decay", "Short", "Long", "Length of the burst."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [oct("instability", "layers.sparks.source.ratePerSecond", 1.2), mp("instability", "layers.burst.effects.0.amount", 0.45), mp("instability", "layers.sparks.gainDb", 8), mp("body", "layers.body.gainDb", 10), mp("body", "layers.pop.gainDb", 8),
    mp("crack", "layers.burst.gainDb", 14), oct("decay", "layers.burst.timeScale", 0.9), oct("decay", "layers.body.timeScale", 0.6), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.9, returnDb: -26 },
});

export const shieldStrike = P({
  id: "shield-strike", name: "Shield strike", family: "energy-weapons", seed: 2104, duration: 0.9, fileCategory: "Weapon", fileName: "ShieldStrike",
  description: "A bright shimmering impact on an energy barrier: glassy ring, falling sweep and an echo.", hint: "Increase Shimmer for more glassy ring; Impact adds the hard hit.",
  tags: ["shield", "hit", "impact", "energy", "barrier", "deflect", "weapon"],
  layers: [
    ly("hit", "Hard hit", IMP([[240, 0, 0.18], [610, -4, 0.12]], 0.7, 3), 0.4, A([0, 1], [0.4, 1]), { gain: -9, send: -10 }),
    ly("ring", "Glassy ring", IMP([[2100, 0, 0.9], [3150, -3, 0.7], [4700, -6, 0.5], [6300, -9, 0.35]], 0.2, 1.5), 0.9, A([0, 1], [0.9, 1]), { gain: -20, send: -6, effects: [delay(110, 0.35, 0.3)] }),
    ly("sweep", "Falling sweep", O("sine", 1800, { fm: { ratio: 2.76, index: 1.2 } }), 0.35, A([0, 0], [0.003, 1], [0.35, 0]), { gain: -18, pitch: A([0, 4], [0.3, -22]) }),
    ly("fizz", "Fizz", N("white"), 0.5, A([0, 0], [0.002, 1], [0.5, 0]), { gain: -26, filters: [hp(6000), bp(7500, 0.8)] }),
  ],
  macros: [mac("shimmer", "Shimmer", "Dull", "Glassy", "Level of the high ring."), mac("impact", "Impact", "Soft", "Hard", "Level of the hard hit."), mac("decay", "Decay", "Short", "Long", "How long it rings."), mac("pitch", "Pitch", "Low", "High", "Pitch of the whole strike."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 20)],
  mappings: [mp("shimmer", "layers.ring.gainDb", 16), mp("shimmer", "layers.fizz.gainDb", 12), mp("impact", "layers.hit.gainDb", 14), oct("decay", "layers.ring.timeScale", 1.0), oct("decay", "layers.hit.timeScale", 0.6),
    oct("pitch", "layers.ring.source.modes.0.frequencyHz", 1), oct("pitch", "layers.sweep.source.frequencyHz", 1), oct("pitch", "layers.hit.source.modes.0.frequencyHz", 0.8), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.0, returnDb: -24 },
});
