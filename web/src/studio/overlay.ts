// DOM layered over the canvas: selection callout, hover tooltip and the "3D preview unavailable" fallback.
// Styling comes only from the design tokens in app/globals.css (CSS variables, via lib/tokens), so the overlays follow
// any token change. Browser-only; nothing here touches the DOM at module scope.
import type { CSSProperties } from 'react';
import { color, font, radius, tint, type } from '@/lib/tokens';
import { IDX, LABEL } from './model';
import type { PickTarget, StudioMode, StudioUnavailableReason } from './types';

// ---------- layout constants (px) ----------
/** Callout box size limits, inner padding, entry slide distance and backdrop blur. */
const CALLOUT = { minW: 180, maxW: 260, pad: '10px 12px 11px', enterY: 6, blur: 8, keyGap: 8, keyMb: 7, subMt: 6 } as const;
/** Callout placement: gap to the part's screen bounds, edge margin, and the size assumed before first layout. */
const PLACE = { gap: 14, margin: 12, fallbackW: 220, fallbackH: 70 } as const;
/** Tooltip padding and offset from the pointer. */
const TIP = { pad: '6px 8px', offset: 14 } as const;
/** Fallback: grid cell size, content width, list spacing. */
const FALLBACK = { cell: 32, maxW: 360, gap: 10, rowGap: 8 } as const;
/** Prototype overlay values that have no exact global token. Emitted as studio-scoped custom properties on
 *  `.rigmy-studio` so they are named in one place (and overridable) rather than snapped to the nearest token. */
const STUDIO_VARS = {
  '--rs-callout-bg': 'rgba(9, 11, 15, 0.88)',
  '--rs-callout-edge': 'rgba(77, 155, 255, 0.45)',
  '--rs-error-edge': 'rgba(255, 93, 93, 0.6)',
  '--rs-error-key': '#ff8a8a',
  '--rs-warn-key': '#f2c27a',
  '--rs-tip-bg': 'rgba(9, 11, 15, 0.9)',
  '--rs-callout-fade': '260ms',
  '--rs-tip-fade': '160ms',
} as const;
const v = (name: keyof typeof STUDIO_VARS): string => `var(${name})`;
/** Warn edge: exactly --warn at 60 % (the prototype's rgba(242,177,76,.6)). */
const WARN_EDGE_PCT = 60;
/** Callout text styles that have no `type` token: title (sans) and spec line (mono). */
const CALLOUT_TYPE = { title: `550 13.5px/1.3 ${font.sans}`, sub: `500 11.5px/1.4 ${font.mono}` } as const;
/** Callout key row: the `tag` style with the prototype's wider tracking; tooltip: `kicker` with tighter tracking. */
const CALLOUT_KEY_TRACKING = '0.12em', TIP_TRACKING = '0.08em';
/** Fallback backdrop per mode: the same tokens the scene backdrop mirrors. */
const MODE_BG: Record<StudioMode, string> = { hero: color.bg, studio: color.bgRaised, solo: color.surface };

/** React-style declarations → CSS text (`fontStretch` → `font-stretch`). Lets the overlays reuse the `type` scale. */
const decl = (style: CSSProperties | Readonly<Record<string, string>>): string =>
  Object.entries(style).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${String(v)}`).join(';');

const CSS = `
.rigmy-studio{position:absolute;inset:0;overflow:hidden;${decl(STUDIO_VARS)}}
.rigmy-studio .rs-callout{box-sizing:content-box;position:absolute;left:0;top:0;pointer-events:none;opacity:0;transform:translate3d(0,${CALLOUT.enterY}px,0);transition:opacity ${v('--rs-callout-fade')} var(--ease-out),transform ${v('--rs-callout-fade')} var(--ease-out);min-width:${CALLOUT.minW}px;max-width:${CALLOUT.maxW}px;padding:${CALLOUT.pad};background:${v('--rs-callout-bg')};border:1px solid ${v('--rs-callout-edge')};border-radius:${radius};color:${color.fg};font-family:${font.sans};backdrop-filter:blur(${CALLOUT.blur}px);-webkit-backdrop-filter:blur(${CALLOUT.blur}px);z-index:1}
.rigmy-studio .rs-callout.on{opacity:1;transform:translate3d(0,0,0)}
.rigmy-studio .rs-callout .k{${decl({ ...type.tag, letterSpacing: CALLOUT_KEY_TRACKING })};color:${color.blueSoft};margin-bottom:${CALLOUT.keyMb}px;display:flex;gap:${CALLOUT.keyGap}px;justify-content:space-between}
.rigmy-studio .rs-callout .n{font:${CALLOUT_TYPE.title};text-wrap:pretty}
.rigmy-studio .rs-callout .s{font:${CALLOUT_TYPE.sub};color:${color.fgSoft};margin-top:${CALLOUT.subMt}px}
.rigmy-studio .rs-callout.err{border-color:${v('--rs-error-edge')}} .rigmy-studio .rs-callout.err .k{color:${v('--rs-error-key')}}
.rigmy-studio .rs-callout.warn{border-color:${tint(color.warn, WARN_EDGE_PCT)}} .rigmy-studio .rs-callout.warn .k{color:${v('--rs-warn-key')}}
.rigmy-studio .rs-tip{box-sizing:content-box;position:absolute;left:0;top:0;pointer-events:none;opacity:0;transition:opacity ${v('--rs-tip-fade')};padding:${TIP.pad};background:${v('--rs-tip-bg')};border:1px solid ${color.line2};border-radius:${radius};${decl({ ...type.kicker, letterSpacing: TIP_TRACKING })};color:${color.fgBright};white-space:nowrap;z-index:2}
.rigmy-studio .rs-fallback{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;padding:var(--gutter);background-image:linear-gradient(${color.lineFaint} 1px,transparent 1px),linear-gradient(90deg,${color.lineFaint} 1px,transparent 1px);background-size:${FALLBACK.cell}px ${FALLBACK.cell}px;background-position:center;overflow:auto}
.rigmy-studio .rs-fallback[hidden]{display:none}
.rigmy-studio .rs-fallback .rs-fb{max-width:${FALLBACK.maxW}px;width:100%;display:flex;flex-direction:column;gap:${FALLBACK.gap}px}
.rigmy-studio .rs-fallback .rs-fb-eyebrow{margin:0;${decl(type.eyebrow)}}
.rigmy-studio .rs-fallback .rs-fb-msg{margin:0;${decl(type.bodySm)}}
.rigmy-studio .rs-fallback .rs-fb-parts{list-style:none;margin:${FALLBACK.gap}px 0 0;padding:0;border-top:1px solid ${color.line};display:grid;grid-template-columns:auto 1fr auto;column-gap:${FALLBACK.gap}px}
.rigmy-studio .rs-fallback .rs-fb-parts[hidden]{display:none}
.rigmy-studio .rs-fallback .rs-fb-parts li{grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:baseline;padding:${FALLBACK.rowGap}px 0;border-bottom:1px solid ${color.lineFaint}}
.rigmy-studio .rs-fallback .rs-fb-cat{${decl(type.eyebrowSm)}}
.rigmy-studio .rs-fallback .rs-fb-name{${decl(type.uiSm)};color:${color.fg2};min-width:0;overflow-wrap:anywhere}
.rigmy-studio .rs-fallback .rs-fb-price{${decl(type.dataSm)};color:${color.fg3}}
@media (prefers-reduced-motion: reduce){.rigmy-studio .rs-callout,.rigmy-studio .rs-tip{transition:none}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/** The studio's root element (with its stylesheet), appended to `container`. */
export function mountRoot(container: HTMLElement): HTMLDivElement {
  const wrap = el('div', 'rigmy-studio');
  const style = el('style');
  style.textContent = CSS;
  wrap.appendChild(style);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(wrap);
  return wrap;
}

// ---------- selection callout ----------
export interface CalloutContent { cat: PickTarget; price: string; title: string; sub: string; tone: 'error' | 'warn' | null }
export function createCallout(wrap: HTMLElement) {
  const box = el('div', 'rs-callout');
  const key = el('span'), price = el('span');
  const kRow = el('div', 'k'); kRow.append(key, price);
  const name = el('div', 'n'), sub = el('div', 's');
  box.append(kRow, name, sub);
  wrap.appendChild(box);
  return {
    /** Fill and show (or hide with `null`). */
    render(c: CalloutContent | null): void {
      if (!c) { box.classList.remove('on'); return; }
      key.textContent = IDX[c.cat] + ' · ' + LABEL[c.cat];
      price.textContent = c.price;
      name.textContent = c.title;
      sub.textContent = c.sub; sub.style.display = c.sub ? '' : 'none';
      box.className = 'rs-callout on' + (c.tone === 'error' ? ' err' : c.tone === 'warn' ? ' warn' : '');
    },
    /** Position beside a part's screen-space bounds (container px): right of it, or left if it would overflow. */
    place(minX: number, maxX: number, minY: number): void {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      const cw = box.offsetWidth || PLACE.fallbackW, ch = box.offsetHeight || PLACE.fallbackH;
      let x = maxX + PLACE.gap; if (x + cw > W - PLACE.margin) x = Math.max(PLACE.margin, minX - cw - PLACE.gap);
      const y = Math.min(H - ch - PLACE.margin, Math.max(PLACE.margin, minY));
      box.style.left = x.toFixed(1) + 'px'; box.style.top = y.toFixed(1) + 'px';
    },
    remove(): void { box.remove(); },
  };
}

// ---------- hover tooltip ----------
export function createTooltip(wrap: HTMLElement) {
  const tip = el('div', 'rs-tip');
  wrap.appendChild(tip);
  return {
    /** Show `text` next to a pointer at container coordinates (x, y). */
    show(text: string, x: number, y: number): void {
      tip.textContent = text; tip.style.opacity = '1';
      tip.style.left = (x + TIP.offset) + 'px'; tip.style.top = (y + TIP.offset) + 'px';
    },
    hide(): void { tip.style.opacity = '0'; },
    remove(): void { tip.remove(); },
  };
}

// ---------- WebGL support + fallback ----------
/** What the device offers: no WebGL2 at all, WebGL2 only through a software rasteriser or another major performance
 *  caveat (e.g. SwiftShader), or hardware WebGL2. Probe contexts are released at once. */
export type GlTier = 'none' | 'software' | 'hardware';
/** Renderer strings of software rasterisers (Chrome/ANGLE SwiftShader, Mesa llvmpipe/softpipe, Windows WARP). */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
export function probeWebGL(): GlTier {
  const probe = (attrs?: WebGLContextAttributes): WebGL2RenderingContext | null => {
    try { return document.createElement('canvas').getContext('webgl2', attrs); } catch { return null; }
  };
  const release = (gl: WebGL2RenderingContext): void => { gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  const strict = probe({ failIfMajorPerformanceCaveat: true });
  if (strict) {
    const info = strict.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(strict.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    release(strict);
    return SOFTWARE_RENDERER.test(name) ? 'software' : 'hardware';
  }
  const any = probe();
  if (!any) return 'none';
  release(any);
  return 'software';
}

/** One row of the textual build summary shown in the fallback. */
export interface SummaryRow { cat: PickTarget; label: string; price?: string }

const EYEBROW = '3D preview unavailable';
const MESSAGE: Record<StudioUnavailableReason, string> = {
  unsupported: 'This browser or device can’t run WebGL, so the interactive 3D view is turned off.',
  error: 'WebGL failed to start on this browser or device, so the interactive 3D view is turned off.',
  'context-lost': 'The graphics context was lost. The 3D view resumes automatically when the browser restores it.',
};

/** Designed, accessible stand-in for the canvas. Hidden until `show()`. */
export function createFallback(wrap: HTMLElement, opts: { mode: StudioMode; transparent: boolean }) {
  const root = el('div', 'rs-fallback');
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  if (!opts.transparent) root.style.backgroundColor = MODE_BG[opts.mode];
  const body = el('div', 'rs-fb');
  const eyebrow = el('p', 'rs-fb-eyebrow'); eyebrow.textContent = EYEBROW;
  const msg = el('p', 'rs-fb-msg');
  const list = el('ul', 'rs-fb-parts'); list.setAttribute('aria-label', 'Parts in this build');
  body.append(eyebrow, msg, list);
  root.appendChild(body);
  wrap.appendChild(root);

  let rows: SummaryRow[] = [];
  const renderRows = () => {
    list.replaceChildren(...rows.map((r) => {
      const li = el('li');
      const cat = el('span', 'rs-fb-cat'); cat.textContent = LABEL[r.cat];
      const name = el('span', 'rs-fb-name'); name.textContent = r.label;
      const price = el('span', 'rs-fb-price'); price.textContent = r.price || '';
      li.append(cat, name, price);
      return li;
    }));
    list.hidden = !rows.length;
  };
  renderRows();

  return {
    get visible(): boolean { return !root.hidden; },
    show(reason: StudioUnavailableReason): void { msg.textContent = MESSAGE[reason]; root.hidden = false; },
    hide(): void { root.hidden = true; },
    /** Replace the textual summary (sorted in callout order). */
    setRows(next: SummaryRow[]): void {
      rows = [...next].sort((a, b) => IDX[a.cat].localeCompare(IDX[b.cat]));
      renderRows();
    },
  };
}
