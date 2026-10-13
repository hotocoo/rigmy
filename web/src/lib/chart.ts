import { dFmt } from './format';

/** Chart viewBox and plot geometry (SVG user units). */
export const VIEW_W = 1000, VIEW_H = 240, PLOT_TOP = 14, PLOT_H = 212;
/** Fractions of the value range where horizontal grid lines and y labels sit. */
export const TICKS = [0.15, 0.4, 0.65, 0.9];
/** Horizontal grid at the tick fractions, for a frame with no data yet. */
export const EMPTY_GRID_D = TICKS.map((f) => `M0,${(PLOT_TOP + (1 - f) * PLOT_H).toFixed(1)} H${VIEW_W}`).join(' ');
/** Downsample to at most this many points (sale-day points are always kept). */
const MAX_POINTS = 200;
/** Vertical padding as a fraction of the value range; flat series pad by a fraction of the value instead. */
const RANGE_PAD = 0.14, FLAT_PAD = 0.02;
/** Ranges longer than this many days label the x axis with years. */
const YEAR_LABEL_DAYS = 200;

export interface ChartPt { t: number; low: number; avg?: number; ev?: string | null }
export interface ChartDatum { xf: number; y: number; date: string; lowT: string; avgT: string; ev?: string | null }
export interface ChartGeom {
  low: string; avg: string; area: string; gridD: string;
  yl: { top: string; label: string }[];
  evD: string; evl: { left: string; label: string }[];
  xl: [string, string, string];
  data: ChartDatum[];
  first: number; last: number;
}

/**
 * SVG geometry for the price-history / index charts (viewBox 0 0 VIEW_W VIEW_H), ported from the prototype's chartFor().
 * Returns null when there are fewer than two points.
 */
export function chartFor(H: ChartPt[], days: number, fv: (v: number) => string, withAvg: boolean): ChartGeom | null {
  let pts = H.slice(-days);
  if (pts.length < 2) return null;
  const n0 = pts.length, step = Math.max(1, Math.ceil(n0 / MAX_POINTS));
  if (step > 1) pts = pts.filter((p, i) => i % step === 0 || i === n0 - 1 || p.ev);
  const vals: number[] = [];
  pts.forEach((p) => { vals.push(p.low); if (withAvg && p.avg) vals.push(p.avg); });
  let mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn) * RANGE_PAD || mx * FLAT_PAD;
  mn -= pad; mx += pad;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (q: number) => ((q - t0) / (t1 - t0 || 1)) * VIEW_W, Y = (v: number) => PLOT_TOP + (1 - (v - mn) / (mx - mn)) * PLOT_H;
  const lowS = pts.map((p) => X(p.t).toFixed(1) + ',' + Y(p.low).toFixed(1));
  const ticks = TICKS.map((f) => mn + (mx - mn) * f), evs = pts.filter((p) => p.ev), yr = days > YEAR_LABEL_DAYS;
  return {
    low: lowS.join(' '),
    avg: withAvg ? pts.map((p) => X(p.t).toFixed(1) + ',' + Y(p.avg ?? p.low).toFixed(1)).join(' ') : '',
    area: `M0,${VIEW_H} L` + lowS.join(' L') + ` L${VIEW_W},${VIEW_H} Z`,
    gridD: ticks.map((v) => 'M0,' + Y(v).toFixed(1) + ' H' + VIEW_W).join(' '),
    yl: ticks.map((v) => ({ top: ((Y(v) / VIEW_H) * 100).toFixed(2) + '%', label: fv(v) })),
    evD: evs.map((p) => 'M' + X(p.t).toFixed(1) + ',0 V' + VIEW_H).join(' ') || 'M0,0',
    evl: evs.map((p) => ({ left: ((X(p.t) / VIEW_W) * 100).toFixed(2) + '%', label: p.ev || '' })),
    xl: [dFmt(t0, yr), dFmt((t0 + t1) / 2, yr), 'Today'],
    data: pts.map((p) => ({ xf: X(p.t) / VIEW_W, y: Y(p.low), date: dFmt(p.t, true), lowT: fv(p.low), avgT: withAvg && p.avg ? fv(p.avg) : '', ev: p.ev })),
    first: pts[0].low,
    last: pts[pts.length - 1].low,
  };
}
