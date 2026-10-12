// Scene colour palette. Every colour the WebGL scene uses lives here as a number (or, for canvas-drawn textures, a
// canvas colour string), so engine / stage / model code never carries colour literals.
//
// Colours that mirror a brand token in app/globals.css (the blue accent, the per-mode background, the mono face)
// are read from the computed CSS custom property when a studio is created (see `resolveBrand`), so a token change
// propagates to the scene. The values in `BRAND_FALLBACK` are only used when the variable is missing or cannot be
// parsed (for example when the engine runs on a page without globals.css); they equal the tokens at time of writing.
import type { StudioMode } from './types';

// ---------- brand tokens mirrored by the scene ----------
/** CSS custom property each brand-mirrored scene colour is read from. */
const BRAND_VARS = {
  accent: '--blue',
  bg: { hero: '--bg', studio: '--bg-raised', solo: '--surface' },
  mono: '--mono',
} as const satisfies { accent: string; bg: Record<StudioMode, string>; mono: string };

/** Used when a brand variable is unset or unparseable. Mirrors globals.css: --blue, --bg / --bg-raised / --surface, --mono. */
export const BRAND_FALLBACK: { accent: number; bg: Record<StudioMode, number>; mono: string } = {
  accent: 0x3d8bff,
  bg: { hero: 0x07080b, studio: 0x0b0d12, solo: 0x0c0e13 },
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

/** Brand values resolved for one studio instance. */
export interface Brand {
  /** Accent (--blue): glows, mood default, plinth rim, halo, scan fill, cable highlight, accent softbox, front area light. */
  accent: number;
  /** Backdrop base colour for the studio's mode (--bg / --bg-raised / --surface). */
  bg: number;
  /** Font family for canvas-drawn text (--mono). */
  mono: string;
}

let probeCtx: CanvasRenderingContext2D | null | undefined;
/** Parse any CSS colour the browser understands into 0xRRGGBB (alpha ignored), or null. */
export function cssColorToHex(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return parseInt(hex[1], 16);
  // Let the canvas normalise other syntaxes (rgb(), hsl(), named, short hex…) to #rrggbb / rgba().
  if (probeCtx === undefined) probeCtx = document.createElement('canvas').getContext('2d');
  if (!probeCtx) return null;
  const sentinel = '#010203';
  probeCtx.fillStyle = sentinel;
  probeCtx.fillStyle = v;
  const out = String(probeCtx.fillStyle);
  if (out === sentinel && v.toLowerCase() !== sentinel) return null;
  const h = /^#([0-9a-f]{6})$/i.exec(out);
  if (h) return parseInt(h[1], 16);
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(out);
  return rgb ? (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]) : null;
}

/** Read the brand tokens the scene mirrors from `el`'s computed style, falling back to `BRAND_FALLBACK`. */
export function resolveBrand(el: Element, mode: StudioMode): Brand {
  const cs = getComputedStyle(el);
  const read = (name: string) => cs.getPropertyValue(name).trim();
  return {
    accent: cssColorToHex(read(BRAND_VARS.accent)) ?? BRAND_FALLBACK.accent,
    bg: cssColorToHex(read(BRAND_VARS.bg[mode])) ?? BRAND_FALLBACK.bg[mode],
    mono: read(BRAND_VARS.mono) || BRAND_FALLBACK.mono,
  };
}

// ---------- scene lighting & dressing ----------
export const SCENE_COLOR = {
  white: 0xffffff,
  /** Clear colour when `transparent` is on (drawn at alpha 0). */
  clear: 0x000000,
  hemiSky: 0xa9bddc,
  hemiGround: 0x07080a,
  key: 0xf2f5ff,
  fill: 0xb9cfff,
  spot: 0xfff3e6,
  rim: 0x6ea6ff,
  rim2: 0xffc7a0,
  /** Interior point light, idle / issues. */
  innerCool: 0x4d8dff,
  innerWarm: 0xff6b5a,
  areaTop: 0xeaf1ff,
  /** Backdrop, grid and plinth rim tint while issues are flagged. */
  issueWarm: 0xff5d4d,
  floor: 0x0b0c10,
  plinth: 0x111318,
  plinthRimBase: 0x050608,
  dust: 0xcfe0ff,
  /** Volumetric light cone base colour (mixed toward the mood colour each frame). */
  cone: 0xfff1e2,
  scanLine: 0x9fc6ff,
  bracketSelect: 0x4d9bff,
  bracketHover: 0xffffff,
  bracketIssue: 0xff5d5d,
} as const;

/** Environment softboxes rendered into the PMREM: [colour | 'accent', intensity multiplier]. Positions live in stage.ts. */
export const ENV_COLOR = {
  dome: 0x07090c,
  top: [0xffffff, 3.2],
  left: [0xdde8ff, 2.6],
  right: [0xffe6d2, 1.8],
  back: ['accent', 1.6],
  front: [0xffffff, 3.4],
  floor: [0x161a22, 1],
} as const;

/** Canvas gradient stops (offset, CSS colour) for the floor alpha map and the contact shadow. */
export const FLOOR_ALPHA_STOPS: [number, string][] = [[0, '#fff'], [0.28, '#bbb'], [1, '#000']];
export const CONTACT_SHADOW_STOPS: [number, string][] = [[0, 'rgba(0,0,0,0.92)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']];

// ---------- part materials ----------
export const PART_COLOR = {
  /** Base colour under emissive RGB glows. */
  glowBase: 0x07080a,
  glass: 0xdfe8f2,
  /** RAM lightbar default when `vis.rgb` is not a colour. */
  ramRgb: 0x6fb0ff,
  lcdBase: 0x000000,
  lcdEmissive: 0xffffff,
} as const;

/** Pump-head LCD (canvas texture). The arc uses the brand accent and the text the brand mono face. */
export const LCD_COLOR = { bg: '#04060a', track: '#13233a', value: '#eef2f8', caption: '#7f8ba0' } as const;

/** Procedural texture colours (canvas). */
export const TEX_COLOR = {
  brushedBase: '#d0d0d0',
  pcbBase: '#16191e',
  pcbTraceHi: '#2a3240',
  pcbTrace: '#20252d',
  pcbPadGold: '#8a7442',
  pcbPad: '#2c323b',
  pcbEdge: '#353c47',
} as const;

export type TexKey = 'noise' | 'brushed' | 'pcb';

/** Physical material presets. */
export interface PalDef {
  color: number; metalness: number; roughness: number;
  rmap?: TexKey; map?: TexKey;
  clearcoat?: number; clearcoatRoughness?: number;
  sheen?: number; sheenColor?: number; sheenRoughness?: number;
}
export type PalKey = 'graphite' | 'black' | 'white' | 'pcb' | 'alu' | 'dark_alu' | 'chrome' | 'copper' | 'rubber' | 'blade' | 'mesh' | 'sleeve' | 'white_sleeve' | 'blue_sleeve';
export const PAL: Record<PalKey, PalDef> = {
  graphite: { color: 0x30343b, metalness: 0.55, roughness: 0.5, rmap: 'noise', clearcoat: 0.35, clearcoatRoughness: 0.4 },
  black: { color: 0x131418, metalness: 0.3, roughness: 0.62, rmap: 'noise', clearcoat: 0.25, clearcoatRoughness: 0.5 },
  white: { color: 0xe6e8ec, metalness: 0, roughness: 0.5, rmap: 'noise', clearcoat: 0.45, clearcoatRoughness: 0.35 },
  pcb: { color: 0xffffff, map: 'pcb', metalness: 0.2, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.3 },
  alu: { color: 0xb5bcc6, metalness: 1, roughness: 0.38, rmap: 'brushed' },
  dark_alu: { color: 0x4a5059, metalness: 1, roughness: 0.42, rmap: 'brushed' },
  chrome: { color: 0xe4e8ee, metalness: 1, roughness: 0.08 },
  copper: { color: 0xd88f63, metalness: 1, roughness: 0.2, clearcoat: 0.3 },
  rubber: { color: 0x0c0c0e, metalness: 0, roughness: 0.9 },
  blade: { color: 0x15171b, metalness: 0, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 },
  mesh: { color: 0x0b0c0f, metalness: 0.6, roughness: 0.65 },
  sleeve: { color: 0x1a1c21, metalness: 0, roughness: 0.75, sheen: 1, sheenColor: 0x6a7280, sheenRoughness: 0.45 },
  white_sleeve: { color: 0xdcdfe4, metalness: 0, roughness: 0.7, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.5 },
  blue_sleeve: { color: 0x2f62c9, metalness: 0, roughness: 0.7, sheen: 1, sheenColor: 0x9fc2ff, sheenRoughness: 0.45 },
};
