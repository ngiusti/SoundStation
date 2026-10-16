import { A, O, N, IMP, SEQ, lp, hp, bp, drive, delay, ly, mac, mp, oct, P } from "./dsl";

// ---------- Machinery ----------
export const ventilationFan = P({
  id: "ventilation-fan", name: "Ventilation fan", family: "machinery", seed: 3101, duration: 4, loop: { crossfadeMs: 120, warmupSeconds: 1.5 }, fileCategory: "Machine", fileName: "VentFan",
  description: "A steady ducted fan: rushing air, a blade pulse and a low motor hum. Loops seamlessly.", hint: "Increase Airflow for a louder rush; Speed raises the pitch of the air.",
  tags: ["fan", "vent", "air", "machine", "loop", "ventilation", "hvac", "engine"],
  layers: [
    ly("air", "Rushing air", N("pink"), 4, A([0, 1], [4, 1]), { gain: -22, filters: [bp(900, 0.8)], tremolo: { rateHz: 12, depth: 0.25 }, send: -14 }),
    ly("rumble", "Duct rumble", N("brown"), 4, A([0, 1], [4, 1]), { gain: -24, filters: [lp(180)], send: -22 }),
    ly("motor", "Motor hum", O("sine", 120), 4, A([0, 1], [4, 1]), { gain: -30, send: -22 }),
    ly("whirr", "Blade whirr", O("triangle", 360, { vibrato: { rateHz: 0.5, depthSemitones: 0.15 } }), 4, A([0, 0.6], [4, 0.6]), { gain: -40, tremolo: { rateHz: 24, depth: 0.5 } }),
  ],
  macros: [mac("airflow", "Airflow", "Light", "Strong", "Level of rushing air."), mac("speed", "Speed", "Slow", "Fast", "Pitch of the air and whirr."), mac("hum", "Hum", "Faint", "Strong", "Motor hum level."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 20)],
  mappings: [mp("airflow", "layers.air.gainDb", 14), mp("airflow", "layers.rumble.gainDb", 8), oct("speed", "layers.air.filters.0.cutoffHz", 1.2), oct("speed", "layers.whirr.source.frequencyHz", 0.8), mp("hum", "layers.motor.gainDb", 16), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.0, returnDb: -24 },
});

export const strainedMotor = P({
  id: "strained-motor", name: "Strained motor", family: "machinery", seed: 3102, duration: 4, fileCategory: "Machine", fileName: "StrainedMotor",
  description: "A motor spinning up and labouring: whine, grinding growl and a rough rattle. Made for the Perform pad.", hint: "Open Perform: Speed runs idle to fast, Strain runs smooth to rough. Capture a gesture and replay it.",
  tags: ["motor", "engine", "strain", "machine", "grind", "whine", "perform"],
  layers: [
    ly("whine", "Motor whine", O("saw", 150), 4, A([0, 0.4], [0.3, 1], [3.7, 1], [4, 0]), { gain: -22, filters: [lp(1400, 1.6)], effects: [drive(0.15)], send: -16 }),
    ly("growl", "Growl", O("square", 52), 4, A([0, 0.5], [0.3, 1], [3.7, 1], [4, 0]), { gain: -22, filters: [lp(400, 1.2)], effects: [drive(0.35)], send: -18 }),
    ly("grind", "Grinding", N("brown"), 4, A([0, 0.2], [0.3, 1], [3.7, 1], [4, 0]), { gain: -34, filters: [bp(500, 1.4)], send: -16 }),
    ly("rattle", "Rattle", SEQ(IMP([[620, 0, 0.03], [1750, -5, 0.02]], 0.6, 1.5), 14, { intervalJitter: 0.4, pitchRangeSemitones: 3, gainRangeDb: 8, eventDecaySeconds: 0.03 }), 4, A([0, 0.1], [0.3, 1], [3.7, 1], [4, 0]), { gain: -40, send: -16 }),
  ],
  macros: [mac("speed", "Speed", "Idle", "Fast", "How fast the motor spins: pitch and level."), mac("strain", "Strain", "Smooth", "Rough", "Grinding, drive and rattle."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [oct("speed", "layers.whine.source.frequencyHz", 1.6), oct("speed", "layers.growl.source.frequencyHz", 1.2), mp("speed", "layers.whine.gainDb", 6), oct("speed", "layers.whine.filters.0.cutoffHz", 1.0),
    mp("strain", "layers.grind.gainDb", 22), mp("strain", "layers.rattle.gainDb", 24), mp("strain", "layers.growl.gainDb", 6), oct("strain", "layers.growl.filters.0.cutoffHz", 1.2), oct("strain", "layers.whine.filters.0.q", 1.2), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.8, returnDb: -26 },
  perform: { enabled: false, xMacro: "speed", yMacro: "strain",
    xCurve: A([0, 5], [0.3, 15], [3, 90], [4, 40]), yCurve: A([0, 5], [1.5, 20], [2.5, 85], [4, 60]) },
});

export const electricalTransformer = P({
  id: "electrical-transformer", name: "Electrical transformer", family: "machinery", seed: 3103, duration: 5, loop: { crossfadeMs: 150, warmupSeconds: 1 }, fileCategory: "Machine", fileName: "Transformer",
  description: "A heavy mains hum with buzzing harmonics and the odd crackle of discharge. Loops seamlessly.", hint: "Increase Harmonics for a buzzier hum; Crackle adds sparks.",
  tags: ["electric", "transformer", "hum", "buzz", "power", "machine", "loop", "generator"],
  layers: [
    ly("h1", "Fundamental", O("sine", 100), 5, A([0, 1], [5, 1]), { gain: -18, send: -22 }),
    ly("h2", "Second harmonic", O("sine", 200), 5, A([0, 1], [5, 1]), { gain: -26, send: -22 }),
    ly("h3", "Third harmonic", O("sine", 300), 5, A([0, 1], [5, 1]), { gain: -32, send: -22 }),
    ly("buzz", "Buzz", O("saw", 100), 5, A([0, 0.7], [2.5, 1], [5, 0.7]), { gain: -34, filters: [bp(1400, 0.9)], effects: [drive(0.3)], send: -24 }),
    ly("crackle", "Crackle", SEQ(IMP([[2800, 0, 0.01], [4600, -4, 0.007]], 0.9, 0.5), 3, { intervalJitter: 0.9, pitchRangeSemitones: 8, gainRangeDb: 14, eventDecaySeconds: 0.012 }), 5, A([0, 1], [5, 1]), { gain: -28, send: -14 }),
  ],
  macros: [mac("hum", "Hum", "Faint", "Strong", "Level of the fundamental."), mac("harmonics", "Harmonics", "Pure", "Buzzy", "Upper harmonics and buzz."), mac("crackle", "Crackle", "None", "Sparky", "How often it sparks."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [mp("hum", "layers.h1.gainDb", 14), mp("harmonics", "layers.h2.gainDb", 18), mp("harmonics", "layers.h3.gainDb", 22), mp("harmonics", "layers.buzz.gainDb", 20), oct("crackle", "layers.crackle.source.ratePerSecond", 3), mp("crackle", "layers.crackle.gainDb", 10), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.2, returnDb: -26 },
});

export const failingPump = P({
  id: "failing-pump", name: "Failing pump", family: "machinery", seed: 3104, duration: 6, loop: { crossfadeMs: 200, warmupSeconds: 1 }, fileCategory: "Machine", fileName: "FailingPump",
  description: "A labouring pump: uneven thudding strokes, a straining whine and the odd knock. Loops seamlessly.", hint: "Increase Wear for more knocking; Strain raises the wavering whine.",
  tags: ["pump", "machine", "failing", "broken", "thump", "loop", "engine", "motor"],
  layers: [
    ly("stroke", "Pump stroke", O("sine", 58), 6, A([0, 1], [6, 1]), { gain: -12, tremolo: { rateHz: 2, depth: 0.85 }, send: -18 }),
    ly("slosh", "Fluid slosh", N("pink"), 6, A([0, 1], [6, 1]), { gain: -26, filters: [bp(380, 0.9)], tremolo: { rateHz: 2, depth: 0.8 }, send: -18 }),
    ly("whine", "Straining whine", O("saw", 310, { vibrato: { rateHz: 0.7, depthSemitones: 0.6 } }), 6, A([0, 0.5], [3, 1], [6, 0.5]), { gain: -36, filters: [lp(1200, 1.5)] }),
    ly("knock", "Knocks", SEQ(IMP([[260, 0, 0.12], [690, -5, 0.06]], 0.5, 3), 1.2, { intervalJitter: 0.7, pitchRangeSemitones: 3, gainRangeDb: 10, eventDecaySeconds: 0.1 }), 6, A([0, 1], [6, 1]), { gain: -18, send: -14 }),
  ],
  macros: [mac("wear", "Wear", "Healthy", "Failing", "Knocking and unevenness."), mac("strain", "Strain", "Easy", "Struggling", "Whine level and waver."), mac("hum", "Weight", "Light", "Heavy", "Stroke body."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 20)],
  mappings: [mp("wear", "layers.knock.gainDb", 18), oct("wear", "layers.knock.source.ratePerSecond", 1.5), mp("strain", "layers.whine.gainDb", 20), mp("strain", "layers.whine.source.vibrato.depthSemitones", 1.5), mp("hum", "layers.stroke.gainDb", 10), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.1, returnDb: -24 },
});

// ---------- Doors ----------
export const lightHatchOpen = P({
  id: "light-hatch-open", name: "Light hatch open", family: "doors", seed: 4101, duration: 1.1, fileCategory: "Door", fileName: "LightHatchOpen",
  description: "A small hatch unlatching: click, seal hiss, a short servo and a soft stop.", hint: "Increase Motor speed for a quicker, higher servo; Weight adds a bigger stop.",
  tags: ["door", "hatch", "open", "light", "seal", "hiss", "servo"],
  layers: [
    ly("unlatch", "Unlatch click", IMP([[1500, 0, 0.05], [2700, -4, 0.03]], 0.4, 1.5), 0.15, A([0, 1], [0.15, 1]), { gain: -12, send: -16 }),
    ly("hiss", "Seal hiss", N("white"), 0.5, A([0, 0], [0.02, 1], [0.15, 0.6], [0.5, 0]), { start: 0.06, gain: -26, filters: [hp(3500)], send: -18 }),
    ly("servo", "Servo", O("saw", 320), 0.55, A([0, 0], [0.06, 1], [0.45, 1], [0.55, 0]), { start: 0.18, gain: -28, pitch: A([0, -3], [0.5, 4]), filters: [lp(1800, 1.3)] }),
    ly("stop", "Soft stop", IMP([[180, 0, 0.18], [420, -6, 0.1]], 0.5, 3), 0.3, A([0, 1], [0.3, 1]), { start: 0.76, gain: -12, send: -12 }),
  ],
  macros: [mac("speed", "Motor speed", "Slow", "Fast", "Servo pitch and how soon it stops."), mac("weight", "Weight", "Light", "Heavy", "Size of the stop."), mac("wear", "Wear", "Smooth", "Rough", "Hiss and grit."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 10)],
  mappings: [oct("speed", "layers.servo.source.frequencyHz", 0.8), mp("speed", "layers.stop.startSeconds", 0.2, { polarity: -1 }), mp("weight", "layers.stop.gainDb", 12), oct("weight", "layers.stop.source.modes.0.frequencyHz", 0.8, { polarity: -1 }), mp("wear", "layers.hiss.gainDb", 14), mp("wear", "layers.servo.gainDb", 6), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.5, returnDb: -26 },
});

export const servoSlide = P({
  id: "servo-slide", name: "Servo slide", family: "doors", seed: 4102, duration: 1.4, fileCategory: "Door", fileName: "ServoSlide",
  description: "A sliding door on a servo: rising then falling whine over a soft rail rumble, ending in a click.", hint: "Increase Motor speed for a higher whine; Wear adds scrape.",
  tags: ["door", "slide", "servo", "motor", "whine", "sliding", "sci-fi"],
  layers: [
    ly("whine", "Servo whine", O("sine", 520, { fm: { ratio: 3, index: 0.4 } }), 1.1, A([0, 0], [0.12, 1], [0.9, 1], [1.1, 0]), { gain: -26, pitch: A([0, -5], [0.25, 3], [0.9, 3], [1.1, -4]), filters: [lp(3000)] }),
    ly("rail", "Rail rumble", N("brown"), 1.1, A([0, 0], [0.1, 1], [0.95, 1], [1.1, 0]), { gain: -22, filters: [lp(350)], send: -20 }),
    ly("scrape", "Scrape", N("pink"), 1.1, A([0, 0], [0.15, 0.6], [0.5, 1], [1.1, 0]), { gain: -30, filters: [bp(2200, 1.2)] }),
    ly("end", "End click", IMP([[1100, 0, 0.06], [2300, -5, 0.04]], 0.4, 2), 0.15, A([0, 1], [0.15, 1]), { start: 1.12, gain: -14, send: -14 }),
  ],
  macros: [mac("speed", "Motor speed", "Slow", "Fast", "Pitch of the whine."), mac("wear", "Wear", "Smooth", "Gritty", "Scrape level."), mac("weight", "Weight", "Light", "Heavy", "Rail rumble."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 10)],
  mappings: [oct("speed", "layers.whine.source.frequencyHz", 1), mp("wear", "layers.scrape.gainDb", 18), mp("weight", "layers.rail.gainDb", 12), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.6, returnDb: -26 },
});

export const lockEngage = P({
  id: "lock-engage", name: "Lock engage", family: "doors", seed: 4103, duration: 0.45, fileCategory: "Door", fileName: "LockEngage",
  description: "A solid two-part bolt: a sharp click, then a heavy clunk home.", hint: "Increase Weight for a heavier clunk; Brightness sharpens the click.",
  tags: ["lock", "bolt", "latch", "door", "click", "clunk", "engage"],
  layers: [
    ly("click", "Bolt click", IMP([[1200, 0, 0.04], [2300, -3, 0.025], [3600, -7, 0.015]], 0.3, 1), 0.15, A([0, 1], [0.15, 1]), { gain: -10 }),
    ly("clunk", "Clunk", IMP([[140, 0, 0.14], [330, -3, 0.09], [760, -7, 0.05]], 0.5, 3), 0.3, A([0, 1], [0.3, 1]), { start: 0.1, gain: -9, send: -12 }),
    ly("thump", "Thump", O("sine", 70), 0.2, A([0, 0], [0.004, 1], [0.2, 0]), { start: 0.1, gain: -14, pitch: A([0, 6], [0.15, 0]) }),
  ],
  macros: [mac("weight", "Weight", "Light", "Heavy", "Size of the clunk."), mac("brightness", "Brightness", "Dull", "Sharp", "Click frequencies."), mac("impact", "Impact", "Gentle", "Hard", "Overall hit strength."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 8)],
  mappings: [mp("weight", "layers.clunk.gainDb", 10), mp("weight", "layers.thump.gainDb", 12), oct("weight", "layers.clunk.source.modes.0.frequencyHz", 0.8, { polarity: -1 }), oct("brightness", "layers.click.source.modes.0.frequencyHz", 1.2), oct("brightness", "layers.click.source.modes.1.frequencyHz", 1.2), mp("impact", "layers.click.gainDb", 8), mp("impact", "layers.clunk.gainDb", 8), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 0.35, returnDb: -28 },
});

export const jammedDoor = P({
  id: "jammed-door", name: "Jammed door", family: "doors", seed: 4104, duration: 2.6, fileCategory: "Door", fileName: "JammedDoor",
  description: "A door that tries and fails: straining motor, grinding groan, repeated knocks and a final stuck thud.", hint: "Increase Strain for more labouring; Wear adds groan and knocking.",
  tags: ["door", "jammed", "stuck", "broken", "strain", "groan", "motor"],
  layers: [
    ly("motor", "Straining motor", O("saw", 95), 1.8, A([0, 0], [0.1, 1], [1.5, 0.8], [1.8, 0]), { gain: -20, pitch: A([0, -2], [0.4, 3], [1.0, 5], [1.5, 0.5], [1.8, -4]), tremolo: { rateHz: 9, depth: 0.45 }, filters: [lp(900, 1.8)], effects: [drive(0.3)], send: -14 }),
    ly("groan", "Metal groan", O("saw", 210, { vibrato: { rateHz: 4.5, depthSemitones: 0.7 } }), 1.6, A([0, 0], [0.4, 0.6], [1.1, 1], [1.6, 0]), { start: 0.2, gain: -30, pitch: A([0, 0], [0.6, 3], [1.6, -5]), filters: [bp(700, 2.2)], send: -12 }),
    ly("knocks", "Knocks", SEQ(IMP([[170, 0, 0.14], [430, -4, 0.08], [1100, -9, 0.04]], 0.5, 3), 3.5, { intervalJitter: 0.45, pitchRangeSemitones: 2, gainRangeDb: 8, eventDecaySeconds: 0.12 }), 1.2, A([0, 1], [1.2, 0.8]), { start: 1.3, gain: -14, send: -10 }),
    ly("stuck", "Stuck thud", IMP([[88, 0, 0.35], [190, -3, 0.22], [420, -8, 0.12]], 0.6, 5), 0.6, A([0, 1], [0.6, 1]), { start: 1.75, gain: -8, send: -8 }),
  ],
  macros: [mac("strain", "Strain", "Easy", "Struggling", "Motor labour and drive."), mac("wear", "Wear", "Smooth", "Rough", "Groan and knocking."), mac("weight", "Weight", "Light", "Heavy", "Final thud."), mac("space", "Space", "Dry", "Roomy", "Shared reverb.", 15)],
  mappings: [mp("strain", "layers.motor.effects.0.amount", 0.5), mp("strain", "layers.motor.gainDb", 8), mp("strain", "layers.motor.tremolo.depth", 0.4), mp("wear", "layers.groan.gainDb", 18), mp("wear", "layers.knocks.gainDb", 8), oct("wear", "layers.knocks.source.ratePerSecond", 0.6), mp("weight", "layers.stuck.gainDb", 10), oct("weight", "layers.stuck.source.modes.0.frequencyHz", 0.7, { polarity: -1 }), mp("space", "master.space.returnDb", 24)],
  space: { decaySeconds: 1.0, returnDb: -24 },
});
