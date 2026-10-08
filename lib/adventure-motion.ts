/** Visual-only motion; never changes collision geometry or saved learning state. */
export type SwimFamily = "tail" | "wave" | "jelly" | "arms" | "jet" | "flap" | "drift";
export interface SwimProfile {
  family: SwimFamily;
  idleHz: number;
  driveHz: number;
  idleAmplitude: number;
  driveAmplitude: number;
  waveCycles: number;
  headLock: number;
  turnBend: number;
  bob: number;
  upright: boolean;
}
const profiles: Record<SwimFamily, SwimProfile> = {
  tail: { family: "tail", idleHz: .85, driveHz: 1.3, idleAmplitude: .052, driveAmplitude: .035, waveCycles: .7, headLock: .32, turnBend: .017, bob: .006, upright: false },
  wave: { family: "wave", idleHz: .7, driveHz: 1.25, idleAmplitude: .055, driveAmplitude: .038, waveCycles: 1.1, headLock: .18, turnBend: .021, bob: .009, upright: false },
  jelly: { family: "jelly", idleHz: .65, driveHz: .65, idleAmplitude: .021, driveAmplitude: .027, waveCycles: .6, headLock: .42, turnBend: .004, bob: .026, upright: true },
  arms: { family: "arms", idleHz: .55, driveHz: .8, idleAmplitude: .015, driveAmplitude: .025, waveCycles: 1.1, headLock: .42, turnBend: .008, bob: .018, upright: true },
  jet: { family: "jet", idleHz: .7, driveHz: 1.5, idleAmplitude: .006, driveAmplitude: .013, waveCycles: .65, headLock: .55, turnBend: .006, bob: .012, upright: false },
  flap: { family: "flap", idleHz: .65, driveHz: .8, idleAmplitude: .025, driveAmplitude: .018, waveCycles: .45, headLock: .3, turnBend: .006, bob: .012, upright: false },
  drift: { family: "drift", idleHz: .35, driveHz: .65, idleAmplitude: .003, driveAmplitude: .004, waveCycles: .45, headLock: .55, turnBend: .003, bob: .013, upright: true },
};
const waveSpecies = new Set(["tadpole", "mosquito-larva", "loach", "hairtail", "eel", "swamp-eel", "basilosaurus", "leviathan", "jiaolong", "sea-dragon", "azure-sea-dragon"]);
const armsSpecies = new Set(["small-octopus", "octopus", "kraken"]);
const jetSpecies = new Set(["small-cuttlefish", "cuttlefish", "squid"]);
const driftSpecies = new Set(["plankton", "fish-eggs", "brine-shrimp", "water-flea", "tiny-shrimp", "small-seahorse", "small-starfish", "frog", "bullfrog", "crayfish", "small-crab", "poseidon", "sea-guardian"]);
const flapSpecies = new Set(["manta-ray", "softshell-turtle", "turtle", "abyssal-giant-turtle"]);
const mammalSpecies = new Set(["dolphin", "orca", "blue-whale", "seal", "sea-lion"]);
const TAU = Math.PI * 2;
export const clampSwim = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function wrappedAngle(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
export function shortestTurn(from: number, to: number) { return wrappedAngle(to - from); }
export function swimProfileFor(id: string): SwimProfile {
  const family: SwimFamily = id === "small-jellyfish" ? "jelly" : armsSpecies.has(id) ? "arms" : jetSpecies.has(id) ? "jet" : waveSpecies.has(id) ? "wave" : flapSpecies.has(id) ? "flap" : driftSpecies.has(id) ? "drift" : "tail";
  const profile = profiles[family];
  // The illustrations show mammals from the side, so a small vertical fluke
  // wave fits them. No claim that they use the same anatomy as ordinary fish.
  return mammalSpecies.has(id) ? { ...profile, idleHz: .6, driveHz: 1.1, idleAmplitude: .04, driveAmplitude: .032, waveCycles: .55 } : profile;
}
export function stableSwimPhase(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d);
  hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b);
  hash ^= hash >>> 16;
  return ((hash >>> 0) / 4294967296) * TAU;
}
export interface SwimState {
  phase: number;
  heading: number;
  previousHeading: number;
  speed: number;
  turnRate: number;
  facing: 1 | -1;
  bank: number;
  tempo: number;
}
export function createSwimState(id: string, heading: number): SwimState {
  const safeHeading = Number.isFinite(heading) ? wrappedAngle(heading) : 0;
  const facing = Math.cos(safeHeading) < 0 ? -1 : 1;
  const phase = stableSwimPhase(id);
  return { phase, heading: safeHeading, previousHeading: safeHeading, speed: 0, turnRate: 0, facing, bank: facing, tempo: .9 + stableSwimPhase(`${id}:tempo`) / TAU * .2 };
}
/** dt is active simulation/render elapsed, never the wall clock while paused. */
export function advanceSwimState(previous: SwimState, input: {
  dt: number; heading: number; speed: number; width: number;
  active: boolean; reducedMotion: boolean;
}, profile: SwimProfile): SwimState {
  if (!input.active || !Number.isFinite(input.dt) || input.dt <= 0) return previous;
  const dt = Math.min(.1, input.dt), heading = Number.isFinite(input.heading) ? wrappedAngle(input.heading) : previous.previousHeading;
  const speed = Number.isFinite(input.speed) ? clampSwim(input.speed, 0, 1320) : 0;
  const response = 1 - Math.exp(-dt / .12), turnResponse = 1 - Math.exp(-dt / .15);
  const smoothSpeed = previous.speed + (speed - previous.speed) * response;
  const turnRate = previous.turnRate + (clampSwim(shortestTurn(previous.previousHeading, heading) / dt, -4, 4) - previous.turnRate) * turnResponse;
  const smoothHeading = wrappedAngle(previous.heading + shortestTurn(previous.heading, heading) * (1 - Math.exp(-dt / (.065 / Math.max(1, speed / 300)))));
  const width = Number.isFinite(input.width) ? Math.max(24, input.width) : 24;
  const drive = clampSwim(smoothSpeed / width / 2, 0, 1);
  // Hysteresis retains the previous dorsal orientation for vertical swimming.
  // A direct tanh(cos(heading)) would hide a fish swimming exactly vertically.
  const cosine = Math.cos(smoothHeading), facing: 1 | -1 = cosine > .18 ? 1 : cosine < -.18 ? -1 : previous.facing;
  const bank = input.reducedMotion ? facing : previous.bank + (facing - previous.bank) * (1 - Math.exp(-dt / .055));
  return { phase: input.reducedMotion ? previous.phase : (previous.phase + TAU * (profile.idleHz + profile.driveHz * drive) * previous.tempo * dt) % TAU, heading: smoothHeading, previousHeading: heading, speed: smoothSpeed, turnRate, facing, bank, tempo: previous.tempo };
}
export interface SwimSample {
  amplitude: number; curve: number; bob: number; phase: number;
  pulse: number; bank: number;
}
export function sampleSwim(state: SwimState, profile: SwimProfile, width: number, reducedMotion = false): SwimSample {
  if (reducedMotion) return { amplitude: 0, curve: 0, bob: 0, phase: state.phase, pulse: 0, bank: profile.upright ? 1 : state.facing };
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const drive = clampSwim(state.speed / Math.max(24, safeWidth) / 2, 0, 1);
  return {
    amplitude: safeWidth * (profile.idleAmplitude + profile.driveAmplitude * drive),
    curve: safeWidth * profile.turnBend * clampSwim(state.turnRate, -2.5, 2.5),
    bob: safeWidth * profile.bob * Math.sin(state.phase * .34),
    phase: state.phase,
    pulse: Math.sin(state.phase),
    // Optional short temporal banking transition when the facing side changes.
    // Upright species use an independent small tilt instead of full rotation.
    bank: profile.upright ? 1 : state.bank,
  };
}
/** Canonical source always faces +x. u=0 tail, u=1 head. */
export function fishCenterOffset(u: number, profile: SwimProfile, motion: SwimSample) {
  const tailward = 1 - clampSwim(u, 0, 1);
  const weight = clampSwim((tailward - profile.headLock) / (1 - profile.headLock), 0, 1) ** 1.45;
  if (weight === 0) return 0;
  return weight * (motion.amplitude * Math.sin(motion.phase - TAU * profile.waveCycles * tailward) + motion.curve);
}
/** One continuous piecewise-affine strip; Canvas uses transform(1,shearY,0,1,x,y). */
export function fishStrip(index: number, count: number, width: number, profile: SwimProfile, motion: SwimSample, endU = 1) {
  const safeCount = Math.max(1, Math.floor(count)), end = clampSwim(endU, 0, 1), u0 = clampSwim(index / safeCount, 0, 1) * end, u1 = clampSwim((index + 1) / safeCount, 0, 1) * end;
  const x0 = (u0 - .5) * width, x1 = (u1 - .5) * width;
  const y0 = fishCenterOffset(u0, profile, motion), y1 = fishCenterOffset(u1, profile, motion);
  return { u0, u1, x0, width: x1 - x0, y0, shearY: x1 === x0 ? 0 : (y1 - y0) / (x1 - x0) };
}
/** Existing fin pixels flex from their roots; no extra fin is drawn over the photo. */
export function fishFinRows(u: number, height: number, profile: SwimProfile, motion: SwimSample) {
  const tailEnd = 1 - profile.headLock;
  const tailWeight = clampSwim((tailEnd - u) / tailEnd, 0, 1);
  const finWeight = Math.sin(Math.PI * clampSwim((u - .1) / Math.max(.01, tailEnd - .1), 0, 1));
  const fold = 1 - .17 * tailWeight * Math.sin(motion.phase - u) ** 2;
  const flutter = profile.family === "flap" ? .11 : .045;
  const source = [0, .29, .73, 1];
  const destination = [-height / 2 * fold - height * flutter * finWeight * Math.sin(motion.phase + .9), -.21 * height, .23 * height, height / 2 * fold + height * flutter * finWeight * Math.sin(motion.phase + 2.1)];
  return source.slice(0, -1).map((v0, index) => ({ v0, v1: source[index + 1], y: destination[index], height: destination[index + 1] - destination[index] }));
}
/** Horizontal rows retain a fixed mantle/bell; v=0 top, v=1 lower tentacles. */
export function softBodyRow(v: number, profile: SwimProfile, motion: SwimSample, width: number, height: number) {
  const position = clampSwim(v, 0, 1), root = profile.headLock;
  if (profile.family === "jelly" && position < root) {
    const bell = 1 - position / root;
    return { dx: 0, dy: -height * .026 * motion.pulse * bell, scaleX: 1 + .055 * motion.pulse * bell };
  }
  const weight = clampSwim((position - root) / (1 - root), 0, 1);
  if (weight === 0) return { dx: 0, dy: 0, scaleX: 1 };
  return { dx: weight ** 2 * motion.amplitude * Math.sin(motion.phase - TAU * profile.waveCycles * weight), dy: 0, scaleX: 1 };
}
export function swimStripCount(screenWidth: number, player: boolean, reducedMotion: boolean) {
  if (reducedMotion || screenWidth < 14) return 1;
  return player ? 18 : screenWidth < 35 ? 6 : screenWidth < 90 ? 10 : 14;
}
/** Expand renderer culling bounds; never change the engine collision radius. */
export function swimVisualReach(width: number, height: number, motion: SwimSample) {
  return Math.hypot(width, height) / 2 + Math.abs(motion.amplitude) + Math.abs(motion.curve) + Math.abs(motion.bob) + 3;
}
