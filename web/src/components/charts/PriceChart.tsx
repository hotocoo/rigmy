'use client';

/**
 * PriceChart: price-history / price-index chart drawn from `chartFor()` geometry (SVG space VIEW_W × VIEW_H,
 * stretched to the box).
 *
 *   const geom = chartFor(points, days, fmt, true);                    // null when there are < 2 points
 *   <PriceChart geom={geom} />                                          // part page: interactive, with average line
 *   <PriceChart geom={idx} showAvg={false} interactive={false} />       // trending index chart
 *
 * Reveal: the SVG carries data-draw, so the shell's reveal wipes it in when an ancestor [data-rv] enters view.
 * Call redrawAll() from shell/motion after the range changes.
 */

import { Fragment, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Dot } from '@/components/ui';
import { EMPTY_GRID_D, VIEW_H, VIEW_W, type ChartGeom } from '@/lib/chart';
import { cx } from '@/lib/cx';
import { color as tokens } from '@/lib/tokens';
import s from './PriceChart.module.css';

export interface PriceChartProps {
  /** Geometry from chartFor(); null renders the empty frame (grid + `emptyNote`). */
  geom: ChartGeom | null;
  /** Plot height in px (the x-axis label row sits below it). */
  height?: number;
  /** Colour of the low line and its area gradient (a token from lib/tokens). */
  color?: string;
  /** Draw the dashed average line (needs chartFor(..., withAvg = true)). */
  showAvg?: boolean;
  /** Pointer crosshair + point + tooltip. */
  interactive?: boolean;
  /** Tooltip label for the low series. */
  lowLabel?: string;
  /** Background behind sale-day labels and the empty note; match the card the chart sits on. */
  labelBg?: string;
  /** Message centred in the empty frame. */
  emptyNote?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Gap between the hovered point and the tooltip; the tooltip flips to the left when it would overflow. */
const TIP_GAP_PX = 16;

interface Hover { i: number; x: number; y: number; boxW: number }

export function PriceChart({
  geom, height = VIEW_H, color = tokens.blue, showAvg = true, interactive = true, lowLabel = 'Lowest', labelBg = tokens.surfaceSunken,
  emptyNote = 'History builds up as prices are tracked daily', className, style,
}: PriceChartProps) {
  const gid = 'pc' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const box = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null);
  // The last hovered point stays rendered while the overlay fades out, so it does not jump on leave.
  const [hover, setHover] = useState<Hover | null>(null);
  const [shown, setShown] = useState(false);
  const on = interactive && !!geom && geom.data.length > 0;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = box.current, data = geom?.data;
    if (!el || !data?.length) return;
    const r = el.getBoundingClientRect(), fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    let i = 0;
    data.forEach((q, k) => { if (Math.abs(q.xf - fx) < Math.abs(data[i].xf - fx)) i = k; });
    setHover({ i, x: data[i].xf * r.width, y: (data[i].y / VIEW_H) * r.height, boxW: r.width });
    setShown(true);
  };

  // The tooltip's side depends on its rendered width, so place it after layout.
  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !hover) return;
    const w = el.offsetWidth, left = hover.x + TIP_GAP_PX + w > hover.boxW ? hover.x - w - TIP_GAP_PX : hover.x + TIP_GAP_PX;
    el.style.transform = `translateX(${left.toFixed(1)}px)`;
  }, [hover]);

  const p = hover && geom ? geom.data[hover.i] ?? null : null;
  const vis = shown && !!p;
  const first = geom?.data[0], last = geom?.data[geom.data.length - 1];
  const summary = first && last ? `${lowLabel} price: ${first.lowT} on ${first.date}, ${last.lowT} on ${last.date}` : typeof emptyNote === 'string' ? emptyNote : 'No price history yet';

  return (
    <div className={cx(s.root, className)} style={style}>
      <div ref={box} className={cx(s.plot, on && s.interactive)} style={{ height }} onPointerMove={on ? move : undefined} onPointerLeave={on ? () => setShown(false) : undefined}>
        <svg data-draw="1" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className={s.svg} role="img" aria-label={summary}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopOpacity="0.26" style={{ stopColor: color }} />
              <stop offset="1" stopOpacity="0" style={{ stopColor: color }} />
            </linearGradient>
          </defs>
          <path d={geom ? geom.gridD : EMPTY_GRID_D} className={s.grid} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
          {geom && (
            <>
              <path d={geom.evD} className={s.events} strokeWidth="1" strokeDasharray="2 4" fill="none" vectorEffect="non-scaling-stroke" />
              <path d={geom.area} fill={`url(#${gid})`} />
              {showAvg && geom.avg && <polyline points={geom.avg} className={s.avg} fill="none" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
              <polyline points={geom.low} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {geom?.yl.map((g, i) => <div key={'y' + i} className={s.yLabel} style={{ top: g.top }} aria-hidden>{g.label}</div>)}
        {geom?.evl.map((e, i) => <div key={'e' + i} className={s.evLabel} style={{ left: e.left, background: labelBg }} aria-hidden>{e.label}</div>)}
        {!geom && (
          <div className={s.empty}>
            <span className={s.emptyNote} style={{ background: labelBg }}><Dot c={color} ring />{emptyNote}</span>
          </div>
        )}
        {on && (
          <div aria-hidden>
            <div className={cx(s.cross, vis && s.show)} style={hover ? { transform: `translateX(${hover.x.toFixed(1)}px)` } : undefined} />
            <div className={cx(s.point, vis && s.show)} style={hover ? { transform: `translate(${hover.x.toFixed(1)}px,${hover.y.toFixed(1)}px)` } : undefined} />
            <div ref={tip} className={cx(s.tip, vis && s.show)}>
              {p && (
                <Fragment>
                  <div className={s.tipDate}>{p.date}{p.ev && <> · <span className={s.tipEv}>{p.ev} sale</span></>}</div>
                  <div>{lowLabel} <b className={s.tipLow}>{p.lowT}</b></div>
                  {p.avgT && <div className={s.tipAvg}>Average {p.avgT}</div>}
                </Fragment>
              )}
            </div>
          </div>
        )}
      </div>
      <div className={s.axis} aria-hidden>{(geom ? geom.xl : ['', '', 'Today']).map((x, i) => <span key={i}>{x}</span>)}</div>
    </div>
  );
}
