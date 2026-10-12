'use client';

import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { fmt, spark } from '@/lib/format';
import { color, glow, tint, type TypeName } from '@/lib/tokens';
import { Text, type DataAttrs } from './Text';
import s from './ui.module.css';

// ---------------------------------------------------------------- Panel
type PanelProps = { as?: ElementType; variant?: 'surface' | 'flat' | 'sunken' | 'sunkenSurface'; on?: boolean; interactive?: boolean; pad?: number | string; gap?: number } & HTMLAttributes<HTMLElement> & DataAttrs;
/** Bordered container. `on` highlights it (selected), `interactive` adds hover affordance. */
export function Panel({ as: As = 'div', variant = 'surface', on, interactive, pad, gap, style, className, children, ...rest }: PanelProps) {
  return (
    <As className={cx(s.panel, variant === 'flat' && s.panelFlat, variant === 'sunken' && s.panelSunken, variant === 'sunkenSurface' && s.panelSunkenSurface, interactive && s.panelInteractive, on && s.panelOn, className)}
      style={{ ...(pad !== undefined ? { padding: pad } : null), ...(gap !== undefined ? { display: 'flex', flexDirection: 'column', gap } : null), ...style }} {...rest}>
      {children}
    </As>
  );
}

// ---------------------------------------------------------------- Dot / Price
/** Small status dot: glowing by default, or with a soft `ring` (`ringWidth` px) instead. */
export function Dot({ c, size = 6, ring, ringWidth = 3, glowPx = 10, style }: { c: string; size?: number; ring?: boolean; ringWidth?: number; glowPx?: number; style?: CSSProperties }) {
  return <span aria-hidden style={{ flex: 'none', width: size, height: size, borderRadius: '50%', background: c, boxShadow: ring ? `0 0 0 ${ringWidth}px ${tint(c, 18)}` : glowPx ? glow(c, glowPx) : undefined, ...style }} />;
}

/** A price, or a calm placeholder when unknown (`empty`, in `emptyV` / `emptyColor`). */
export function Price({ value, empty = 'No price yet', v = 'data', emptyV, c = color.fg, emptyColor = color.muted, style, className }: { value: number | null | undefined; empty?: string; v?: TypeName; emptyV?: TypeName; c?: string; emptyColor?: string; style?: CSSProperties; className?: string }) {
  return value == null
    ? <Text v={emptyV || v} c={emptyColor} style={style} className={className}>{empty}</Text>
    : <Text v={v} c={c} style={style} className={className}>{fmt(value)}</Text>;
}

// ---------------------------------------------------------------- EmptyState
/** Honest, calm empty state used whenever real data is not available yet. */
export function EmptyState({ title, body, action, eyebrow, eyebrowColor = color.blueSoft, style, className }: { title?: ReactNode; body?: ReactNode; action?: ReactNode; eyebrow?: ReactNode; eyebrowColor?: string; style?: CSSProperties; className?: string }) {
  return (
    <div data-rv="" className={cx(s.empty, className)} style={style}>
      {eyebrow && <Text v="eyebrow" c={eyebrowColor}>{eyebrow}</Text>}
      {title && <Text v="title" c={color.fg}>{title}</Text>}
      {body && <Text v="bodySm" c={color.fg3} className={s.emptyBody}>{body}</Text>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Tabs
export interface TabItem { id: string; label: ReactNode; idx?: string; badge?: ReactNode }
/** Underlined tab row. */
export function Tabs({ items, active, onPick, style }: { items: TabItem[]; active: string; onPick: (id: string) => void; style?: CSSProperties }) {
  return (
    <div role="tablist" className={s.tabs} style={style}>
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === active} type="button" onClick={() => onPick(t.id)} className={cx(s.tab, t.id === active && s.tabOn)}>
          {t.idx && <span className={s.tabIdx}>{t.idx}</span>}<span>{t.label}</span>{t.badge}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Progress
/** Thin progress track. `value` 0..1. `grow` animates on reveal; `glowing` adds the accent glow. */
export function Progress({ value, c = color.blue, track, height = 2, grow, glowing, decorative, label, style, className }: { value: number; c?: string; track?: string; height?: number; grow?: boolean; glowing?: boolean; decorative?: boolean; label?: string; style?: CSSProperties; className?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(w), 'aria-label': label };
  return (
    <div className={cx(s.track, className)} style={{ height, ...(track ? { background: track } : null), ...style }} {...a11y}>
      <div className={s.bar} {...(grow ? { 'data-grow': '' } : null)} style={{ width: w + '%', background: c, boxShadow: glowing ? glow(c) : undefined }} />
    </div>
  );
}

// ---------------------------------------------------------------- Sparkline
/** Area + line sparkline drawn on reveal. Renders a dashed baseline when there are fewer than two points. */
export function Sparkline({ values, w = 200, h = 44, c = color.blueSoft, fillPct = 12, strokeWidth = 1.5, draw = true, style, className }: { values: number[]; w?: number; h?: number; c?: string; fillPct?: number; strokeWidth?: number; draw?: boolean; style?: CSSProperties; className?: string }) {
  const sp = spark(values, w, h);
  return (
    <svg className={cx(s.spark, className)} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" {...(draw ? { 'data-draw': '' } : null)} style={{ height: h, ...style }} aria-hidden>
      {sp.line
        ? <><path d={sp.area} fill={tint(c, fillPct)} /><polyline points={sp.line} fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></>
        : <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke={color.line2} strokeWidth={strokeWidth} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
