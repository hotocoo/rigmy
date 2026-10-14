// Public types for the RigMY 3D build studio (port of project/pc-studio.html).
// Pure type module: safe to import from server components.

/** Which scene the studio runs.
 *  - `hero`   — scroll-driven landing hero (no orbit input, camera follows `scroll` / `pointer` / `frame`).
 *  - `studio` — full build studio (orbit, hover tooltips, click-to-pick, callouts, camera flights).
 *               Also used by the cable view, build guide and review pages.
 *  - `solo`   — single-part product viewer on a turntable (browse / part pages). */
export type StudioMode = 'studio' | 'hero' | 'solo';

/** Component categories the studio understands (same ids as `CatId` in lib/types). */
export type StudioCat = 'cpu' | 'cooler' | 'mobo' | 'ram' | 'ssd' | 'gpu' | 'case' | 'psu';
/** Categories the studio has models for (extra slots such as a monitor or a second drive have none). */
export const STUDIO_CATS: readonly StudioCat[] = ['cpu', 'cooler', 'mobo', 'ram', 'ssd', 'gpu', 'case', 'psu'];
export const isStudioCat = (c: string | null | undefined): c is StudioCat => !!c && (STUDIO_CATS as readonly string[]).includes(c);
/** Anything that can be selected / picked / flagged: a category, or the cable runs. */
export type PickTarget = StudioCat | 'cables';
/** Internal scene parts. `case` is split into `case` (chassis), `fans` (front intake) and `glass` (side panel). */
export type PartId = 'case' | 'glass' | 'fans' | 'mobo' | 'cpu' | 'cooler' | 'ram' | 'ssd' | 'gpu' | 'psu' | 'cables';
/** Individual cable runs that can be highlighted with `{ rig: 'cable' }`. */
export type CableRunId = 'cable_24pin' | 'cable_eps' | 'cable_gpu' | 'cable_fp';
export type ViewName = 'hero' | 'side' | 'top' | 'front';

/** Visual hints for one product (Product.vis in the catalogue). Dimensions in metres. */
export interface PartVis {
  // case
  style?: 'mesh' | 'glass';
  w?: number;
  h?: number;
  d?: number;
  /** 'white' switches shells / shrouds / fan frames to white; anything else is dark. */
  color?: string;
  // motherboard
  ff?: 'atx' | 'matx';
  // cooler
  type?: 'aio' | 'air';
  /** Air-cooler tower height (m). */
  height?: number;
  // gpu
  L?: number;
  T?: number;
  H?: number;
  fans?: number;
  /** z-shift of the GPU fan row (m). */
  shift?: number;
  /** GPU: `true` lights the fan rings. RAM: lightbar colour as a hex number (default 0x6fb0ff). */
  rgb?: boolean | number;
}

/** One selected component, as the host sends it in `build`. */
export interface BuildItem {
  id: string;
  /** Product name — shown in the callout and hover tooltip. */
  label: string;
  /** Formatted price, e.g. "RM 2,249" (callout corner). */
  price?: string;
  /** Key-spec line (callout footer). */
  sub?: string;
  vis: PartVis;
}
export type StudioBuild = Partial<Record<StudioCat, BuildItem>>;

/** Product passed to solo mode. */
export interface SoloItem {
  id: string;
  label: string;
  vis: PartVis;
  /** Show the part as it sits in a build (graphics card seated horizontally, fans down) instead of the showcase pose. */
  installed?: boolean;
}

export interface CableOpts {
  /** 'stock' = loose as-shipped loops; anything else = tidy managed routing. */
  route: 'tidy' | 'stock';
  sleeve: 'black' | 'white' | 'blue';
}

/** Overrides for the selection callout text. */
export interface CalloutNote {
  title?: string;
  sub?: string;
  price?: string;
  tone?: 'error' | 'warn';
}

/** Colour accepted by THREE.Color#set: '#3d8bff', 'rgb(...)', or 0x3d8bff. */
export type MoodColor = string | number;

/** Every message the studio accepts — exactly the prototype's `{ rig: … }` postMessage protocol. */
export type StudioMsg =
  | { rig: 'build'; build: StudioBuild }
  | { rig: 'solo'; cat: StudioCat; item: SoloItem }
  | { rig: 'select'; part: PickTarget | null; note?: CalloutNote | null }
  | { rig: 'explode'; v: number; stagger?: boolean }
  | { rig: 'issues'; parts: PickTarget[] }
  | { rig: 'view'; name: ViewName }
  | { rig: 'cables'; opts?: Partial<CableOpts> }
  | { rig: 'cable'; id: CableRunId | null }
  | { rig: 'xray'; v: boolean }
  | { rig: 'stage'; show: PartId[] | null }
  | { rig: 'scroll'; p: number }
  | { rig: 'pointer'; x: number; y: number }
  | { rig: 'frame'; shiftX?: number }
  | { rig: 'mood'; color?: MoodColor }
  | { rig: 'pulse'; part?: PickTarget | null };

/** Why the 3D view is not showing.
 *  - `unsupported`  — the browser/device cannot create a WebGL2 context (detected up front).
 *  - `error`        — WebGL looked available but the renderer failed to start.
 *  - `context-lost` — the GPU context was lost mid-session; a `restored` event follows if the browser restores it. */
export type StudioUnavailableReason = 'unsupported' | 'error' | 'context-lost';

/** Outbound events (the prototype's posts to the parent window). */
export interface StudioEvents {
  /** Scene is built and accepting messages (prototype: `{ rig: 'ready', mode }`). */
  ready: { mode: StudioMode };
  /** User clicked a part (or empty space → null) in studio mode, or pressed Escape with a selection. */
  pick: { part: PickTarget | null };
  /** Intro reveal finished (~2.7 s after the first build). */
  revealed: Record<string, never>;
  /** The 3D view cannot run (or stopped running); the studio now shows its fallback. Fires before `ready` when
   *  WebGL is unavailable at start, so state pushed from `ready` still reaches the fallback's build summary. */
  unavailable: { reason: StudioUnavailableReason };
  /** A lost WebGL context was restored and rendering resumed (follows `unavailable` with `context-lost`). */
  restored: Record<string, never>;
}
export type StudioEventName = keyof StudioEvents;

export interface StudioOptions {
  mode: StudioMode;
  /** Hide the backdrop dome and clear to transparent so the page shows through. Default false. */
  transparent?: boolean;
  /** Backdrop base colour (hex, with or without '#'). Defaults to the mode's background token from globals.css:
   *  hero `--bg`, studio `--bg-raised`, solo `--surface` (the prototype host's 07080b / 0b0d12 / 0c0e13). */
  bg?: string;
  /** Disable idle auto-rotate (studio + solo turntable) and floating dust. */
  reducedMotion?: boolean;
  /** Opt-in demo: if nothing has been built this many ms after start, show the prototype's demo build (solo: a GPU).
   *  Off by default (`undefined` / `null`), so the app only ever shows builds the user chose; standalone or dev pages
   *  can pass `DEMO_BUILD_DELAY` from engine.ts (the prototype's 1400 ms). */
  fallbackDelay?: number | null;
}

export interface StudioHandle {
  send(msg: StudioMsg): void;
  on<E extends StudioEventName>(event: E, cb: (payload: StudioEvents[E]) => void): () => void;
  dispose(): void;
}
