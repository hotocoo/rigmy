import type { CSSProperties } from 'react';
import type { Tone } from './types';

/**
 * Typed mirror of the CSS custom properties in app/globals.css. Components must reference colours, fonts and
 * motion through these (never raw hex / rgba / font stacks), so the palette has one source of truth.
 */
export const color = {
  bg: 'var(--bg)',
  bgRaised: 'var(--bg-raised)',
  bgDeep: 'var(--bg-deep)',
  surface: 'var(--surface)',
  surfaceHover: 'var(--surface-hover)',
  surfaceGlyph: 'var(--surface-glyph)',
  surfaceTip: 'var(--surface-tip)',
  surfaceSunken: 'var(--surface-sunken)',
  surfaceBand: 'var(--surface-band)',
  surfaceOverlay: 'var(--surface-overlay)',
  surfaceGlass: 'var(--surface-glass)',
  surfaceGlassSoft: 'var(--surface-glass-soft)',
  scrim: 'var(--scrim)',
  scrimStrong: 'var(--scrim-strong)',
  fg: 'var(--fg)',
  fg2: 'var(--fg-2)',
  fgGlyph: 'var(--fg-glyph)',
  fg3: 'var(--fg-3)',
  fg4: 'var(--fg-4)',
  fgSoft: 'var(--fg-soft)',
  fgBright: 'var(--fg-bright)',
  fgMax: 'var(--fg-max)',
  muted: 'var(--muted)',
  dim: 'var(--dim)',
  faint: 'var(--faint)',
  blue: 'var(--blue)',
  blueHi: 'var(--blue-hi)',
  blueSoft: 'var(--blue-soft)',
  bluePale: 'var(--blue-pale)',
  blueText: 'var(--blue-text)',
  ink: 'var(--ink)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  warnSoft: 'var(--warn-soft)',
  error: 'var(--error)',
  errorSoft: 'var(--error-soft)',
  info: 'var(--info)',
  pending: 'var(--pending)',
  lineGhost: 'var(--line-ghost)',
  lineFaint: 'var(--line-faint)',
  lineHair: 'var(--line-hair)',
  lineSoft: 'var(--line-soft)',
  line: 'var(--line)',
  lineLight: 'var(--line-light)',
  lineMid: 'var(--line-mid)',
  line2: 'var(--line-2)',
  lineStrong: 'var(--line-strong)',
  lineFirm: 'var(--line-firm)',
  line20: 'var(--line-20)',
  line22: 'var(--line-22)',
  line3: 'var(--line-3)',
  line28: 'var(--line-28)',
  lineBold: 'var(--line-bold)',
  line32: 'var(--line-32)',
  lineHover: 'var(--line-hover)',
  fillGhost: 'var(--fill-ghost)',
  fillWhisper: 'var(--fill-whisper)',
  fillFaint: 'var(--fill-faint)',
  fillSoft: 'var(--fill-soft)',
  fillMid: 'var(--fill-mid)',
  transparent: 'transparent',
} as const;
export type ColorToken = (typeof color)[keyof typeof color];

/** Status colours keyed by the engine's Tone. */
export const tone: Record<Tone, string> = { ok: color.ok, warn: color.warn, error: color.error, pending: color.pending, info: color.info };

/** `color` at `pct`% opacity (any CSS colour, including the tokens above). */
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export const font = { sans: 'var(--sans)', mono: 'var(--mono)' } as const;
/** Web-font stylesheet for the two families named by --sans / --mono (Archivo with its width axis, JetBrains Mono). */
export const fontStylesheet = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;500;600&display=swap';
export const radius = 'var(--radius)';
export const shadow = { pop: 'var(--shadow-pop)', toast: 'var(--shadow-toast)', modal: 'var(--shadow-modal)' } as const;
export const glow = (c: string, px = 14) => `0 0 ${px}px ${c}`;
/**
 * Easing curves as literal values: the Web Animations API (element.animate) cannot resolve CSS variables, so script-driven
 * motion reads these. They mirror --ease-* in globals.css, which CSS uses.
 */
export const ease = { out: 'cubic-bezier(.16,1,.3,1)', io: 'cubic-bezier(.76,0,.24,1)', draw: 'cubic-bezier(.65,0,.35,1)', scan: 'cubic-bezier(.45,0,.2,1)' } as const;
/** Durations in ms, mirroring --dur-* in globals.css. */
export const dur = { quick: 150, fast: 200, base: 300, mid: 400, glide: 600, bar: 800, slow: 840, rail: 1200 } as const;
/**
 * The page background as a literal, for browser chrome that cannot read CSS variables (the viewport `theme-color` meta).
 * Mirrors --bg in globals.css.
 */
export const themeColor = '#07080b';

const f = (weight: number, size: string, lh: string, family: string) => `${weight} ${size}/${lh} ${family}`;
const caps = (ls: string): CSSProperties => ({ letterSpacing: ls, textTransform: 'uppercase' });

/**
 * The type scale. Every text style in the app is one of these (optionally with a colour). Values are the prototype's
 * (project/RigMY.dc.html); titles keep its exact clamps, stretches and tracking.
 *
 * `<Text v>` applies a style inline, so a `style` prop on Text wins over it; a CSS-module `className` on Text is for
 * non-type properties (layout, wrapping, transitions) and cannot change the font.
 */
export const type = {
  // mono — labels, data, metadata
  eyebrow: { font: f(500, '10.5px', '1.2', font.mono), ...caps('0.12em'), color: color.muted },
  kicker: { font: f(500, '10.5px', '1', font.mono), ...caps('0.14em'), color: color.muted },
  eyebrowSm: { font: f(500, '9.5px', '1.2', font.mono), ...caps('0.12em'), color: color.muted },
  tag: { font: f(500, '10px', '1', font.mono), ...caps('0.08em') },
  /** Form labels and table heads. */
  capsWide: { font: f(500, '10.5px', '1.2', font.mono), ...caps('0.1em'), color: color.muted },
  tagLoose: { font: f(500, '10.5px', '18px', font.mono), ...caps('0.1em'), color: color.muted },
  meta: { font: f(400, '11.5px', '1.4', font.mono), color: color.muted },
  metaTight: { font: f(400, '11.5px', '1.3', font.mono), color: color.muted },
  caption: { font: f(400, '10.5px', '1.2', font.mono), color: color.muted },
  data: { font: f(500, '12px', '1.3', font.mono) },
  dataSm: { font: f(500, '11.5px', '1', font.mono) },
  dataLg: { font: f(500, '13px', '18px', font.mono) },
  priceMd: { font: f(600, '14px', '1', font.mono) },
  figureSm: { font: f(600, '15px', '1', font.mono) },
  price16: { font: f(600, '16px', '1', font.mono) },
  priceLg: { font: f(600, '20px', '1', font.mono) },
  price22: { font: f(600, '22px', '1', font.mono) },
  figure: { font: f(600, '24px', '1', font.mono) },
  figureLg: { font: f(600, '26px', '1', font.mono) },
  figureXl: { font: f(600, '34px', '1', font.mono) },
  // sans — UI and reading
  body: { font: f(400, '15px', '1.55', font.sans), color: color.fgSoft },
  bodySm: { font: f(400, '14px', '1.5', font.sans), color: color.fgSoft },
  uiSm: { font: f(500, '13px', '1.3', font.sans) },
  label: { font: f(500, '14px', '18px', font.sans) },
  strong: { font: f(600, '14px', '1.3', font.sans) },
  titleSm: { font: f(600, '15px', '1.3', font.sans) },
  title: { font: f(650, '16px', '1.2', font.sans) },
  titleMd: { margin: 0, font: f(650, '18px', '1.2', font.sans) },
  previewTitle: { margin: 0, font: f(650, '19px', '1.25', font.sans) },
  panelTitle: { margin: 0, font: f(650, '20px', '1.2', font.sans), fontStretch: '108%' },
  h3: { margin: 0, font: f(650, '22px', '1.1', font.sans), fontStretch: '110%' },
  cardTitle: { margin: 0, font: f(650, '24px', '1.1', font.sans), fontStretch: '110%' },
  dialogTitle: { margin: 0, font: f(650, '26px', '1.15', font.sans), fontStretch: '110%' },
  name: { margin: 0, font: f(650, '28px', '1', font.sans), fontStretch: '112%' },
  presetName: { margin: 0, font: f(700, '28px', '1', font.sans), fontStretch: '120%' },
  titleXl: { margin: 0, font: f(650, '30px', '1.05', font.sans), fontStretch: '112%' },
  titleXlLoose: { margin: 0, font: f(650, '30px', '1.1', font.sans), fontStretch: '112%' },
  pageTitle: { margin: 0, font: f(650, '32px', '1.05', font.sans), fontStretch: '112%' },
  h2: { margin: 0, font: f(650, '34px', '1.05', font.sans), fontStretch: '112%' },
  titleXxl: { margin: 0, font: f(650, '36px', '1.02', font.sans), fontStretch: '112%' },
  brand: { font: f(800, '20px', '1', font.sans), fontStretch: '125%', letterSpacing: '-0.01em' },
  // fluid titles
  productTitle: { margin: 0, font: f(650, 'clamp(28px, 2.8vw, 40px)', '1.06', font.sans), fontStretch: '110%' },
  feature: { margin: 0, font: f(650, 'clamp(28px, 3vw, 42px)', '1.04', font.sans), fontStretch: '112%' },
  headline: { margin: 0, font: f(650, 'clamp(30px, 3.2vw, 44px)', '1.04', font.sans), fontStretch: '112%' },
  chapter: { margin: 0, font: f(650, 'clamp(30px, 3.2vw, 46px)', '1.02', font.sans), fontStretch: '112%', letterSpacing: '-0.01em' },
  section: { margin: 0, font: f(650, 'clamp(32px, 3.6vw, 52px)', '1.02', font.sans), fontStretch: '112%', letterSpacing: '-0.01em' },
  done: { margin: 0, font: f(700, 'clamp(34px, 4vw, 54px)', '1', font.sans), fontStretch: '116%', letterSpacing: '-0.01em' },
  pageHero: { margin: 0, font: f(650, 'clamp(34px, 4vw, 60px)', '1', font.sans), fontStretch: '114%', letterSpacing: '-0.015em' },
  heroEnd: { margin: 0, font: f(700, 'clamp(36px, 4.6vw, 64px)', '0.98', font.sans), fontStretch: '118%', letterSpacing: '-0.02em' },
  hero: { margin: 0, font: f(700, 'clamp(40px, 5.2vw, 76px)', '0.95', font.sans), fontStretch: '118%', letterSpacing: '-0.02em' },
  display: { margin: 0, font: f(700, 'clamp(44px, 7vw, 104px)', '1', font.sans), fontStretch: '122%', letterSpacing: '-0.02em' },
} satisfies Record<string, CSSProperties>;
export type TypeName = keyof typeof type;
