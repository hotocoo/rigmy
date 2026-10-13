// Adaptive quality: watches how long frames take and steps the render cost down when the device can't keep up
// (software GL, weak GPUs), and back up when headroom returns. Pure logic; the stage applies the levels.

/** One quality level. `pixelRatio` is a cap (never above the device's full-quality ratio). */
export interface Quality {
  pixelRatio: number;
  /** Bloom + chromatic/vignette/grain passes. */
  effects: boolean;
  /** Spot shadow map size as a fraction of the full size. */
  shadowScale: number;
  /** Fraction of dust motes drawn. */
  dust: number;
  /** Multisampling on the post-processing target. */
  msaa: boolean;
  /** Spot-light shadow casting. */
  shadows: boolean;
  /** Environment-map (PMREM) face size. Only read when the stage is created, from the starting level. */
  envMapSize: number;
}

/** Levels from full quality (0) down. Each step removes the next most expensive thing. */
export const QUALITY_LEVELS: readonly Quality[] = [
  { pixelRatio: Infinity, effects: true, shadowScale: 1, dust: 1, msaa: true, shadows: true, envMapSize: 256 },
  { pixelRatio: 1, effects: true, shadowScale: 1, dust: 1, msaa: true, shadows: true, envMapSize: 256 },
  { pixelRatio: 0.75, effects: true, shadowScale: 1, dust: 1, msaa: true, shadows: true, envMapSize: 256 },
  { pixelRatio: 0.75, effects: false, shadowScale: 1, dust: 1, msaa: true, shadows: true, envMapSize: 256 },
  { pixelRatio: 0.75, effects: false, shadowScale: 0.5, dust: 0.5, msaa: false, shadows: true, envMapSize: 256 },
  { pixelRatio: 0.5, effects: false, shadowScale: 0.25, dust: 0.25, msaa: false, shadows: false, envMapSize: 128 },
];

/** Frame load = max(JS cost of the frame, time since the previous rendered frame excluding deliberate idling). Above this (ms, ≈40 fps) the
 *  device is not keeping up. */
export const FRAME_OVER_BUDGET_MS = 25;
/** Headroom to try the next level up: the frame's JS cost is below `cost` and the load stays near vsync (ms). */
export const FRAME_HEADROOM_MS = { cost: 8, load: 20 } as const;
/** How long the smoothed load must stay over budget before stepping down. */
export const SUSTAIN_DOWN_MS = 700;
/** How long headroom must last before stepping up; doubled (up to the max) each time a step up is undone within
 *  `UPGRADE_PROBATION_MS`, so a device on the edge does not oscillate. */
export const SUSTAIN_UP_MS = { initial: 4000, max: 64000 } as const;
export const UPGRADE_PROBATION_MS = 10000;
/** Ignore samples for this long after start, resume or a level change (shader compiles, reallocations). */
export const WARMUP_MS = 500;
/** Weight of each new sample in the smoothed values. */
const EMA_WEIGHT = 0.25;

export function createQualityGovernor(apply: (q: Quality) => void, startLevel = 0) {
  let level = startLevel, load = 0, cost = 0, overSince = -1, underSince = -1, settleUntil = 0;
  let upDelay: number = SUSTAIN_UP_MS.initial, lastUpAt = -Infinity;
  const reset = (now: number): void => { settleUntil = now + WARMUP_MS; overSince = underSince = -1; load = cost = 0; };
  const setLevel = (next: number, now: number): void => {
    if (next > level && now - lastUpAt < UPGRADE_PROBATION_MS) upDelay = Math.min(upDelay * 2, SUSTAIN_UP_MS.max);
    if (next < level) lastUpAt = now;
    level = next;
    reset(now);
    apply(QUALITY_LEVELS[level]);
  };
  apply(QUALITY_LEVELS[level]);
  const ema = (prev: number, v: number): number => (prev ? prev + (v - prev) * EMA_WEIGHT : v);
  return {
    get level(): number { return level; },
    /** Restart the warm-up window (after a pause the first intervals are meaningless). */
    settle: reset,
    /** Feed one rendered frame: its JS cost and the time since the previous animation frame (ms). */
    sample(frameCost: number, interval: number, now: number): void {
      if (now < settleUntil) return;
      cost = ema(cost, frameCost);
      load = ema(load, Math.max(frameCost, interval));
      if (load > FRAME_OVER_BUDGET_MS) {
        underSince = -1;
        if (overSince < 0) overSince = now;
        else if (now - overSince >= SUSTAIN_DOWN_MS && level < QUALITY_LEVELS.length - 1) setLevel(level + 1, now);
      } else if (cost < FRAME_HEADROOM_MS.cost && load < FRAME_HEADROOM_MS.load) {
        overSince = -1;
        if (underSince < 0) underSince = now;
        else if (now - underSince >= upDelay && level > 0) setLevel(level - 1, now);
      } else overSince = underSince = -1;
    },
  };
}
