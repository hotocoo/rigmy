// Case/motherboard-derived layout and per-part placements (assembled position + explode offset).
import * as THREE from 'three';
import { V3 } from './materials';
import type { PartId, PartVis } from './types';

export interface Layout {
  w: number; h: number; d: number; y0: number;
  /** top of the PSU shroud */
  ys: number;
  xi0: number; xi1: number;
  mH: number; mW: number;
  mobo: THREE.Vector3;
  sy: number; sz: number;
  socket: THREE.Vector3;
  radLen: number;
  rad: THREE.Vector3;
}
export interface LayoutInput { case?: { vis: PartVis } | null; mobo?: { vis: PartVis } | null }
/** Case used when none is given (and as the scale reference for camera distances): a 235 × 490 × 460 mm mid-tower. */
export const DEFAULT_CASE = { w: 0.235, h: 0.49, d: 0.46 } as const;
/** Radiator length for a 360 mm AIO (fits cases at least 0.44 m deep; shallower cases get a 240). */
export const RAD_360 = 0.394;
const RAD_240 = 0.274, RAD_360_MIN_DEPTH = 0.44;
export function computeLayout(b: LayoutInput): Layout {
  const cv = (b.case && b.case.vis) || DEFAULT_CASE;
  const c = { w: cv.w ?? DEFAULT_CASE.w, h: cv.h ?? DEFAULT_CASE.h, d: cv.d ?? DEFAULT_CASE.d };
  const mf = (b.mobo && b.mobo.vis.ff) || 'atx';
  const y0 = 0.022;
  const ys = y0 + 0.006 + 0.095;
  const xi0 = -c.w / 2 + 0.004, xi1 = c.w / 2 - 0.004;
  const mH = mf === 'matx' ? 0.244 : 0.305, mW = 0.244;
  const mobo = new V3(xi0 + 0.013, c.h - 0.03 - mH / 2, -c.d / 2 + 0.026 + mW / 2);
  const sy = mH / 2 - 0.092, sz = -mW / 2 + 0.105;
  const socket = mobo.clone().add(new V3(0.0008, sy, sz));
  const radLen = c.d >= RAD_360_MIN_DEPTH ? RAD_360 : RAD_240;
  const rad = new V3(xi1 - 0.075, c.h - 0.012 - 0.0145, -c.d / 2 + 0.03 + radLen / 2);
  return { w: c.w, h: c.h, d: c.d, y0, ys, xi0, xi1, mH, mW, mobo, sy, sz, socket, radLen, rad };
}

export const gpuDims = (v: PartVis) => ({ L: v.L ?? 0.3, H: v.H || 0.137, T: v.T || 0.066 });


/** [assembled position, explode offset] per part. */
type Place = (v: PartVis, L: Layout) => [THREE.Vector3, THREE.Vector3];
export const PLACE: Record<PartId, Place> = {
  cables: () => [new V3(), new V3()],
  case: () => [new V3(), new V3(0, 0, 0)],
  glass: () => [new V3(), new V3(0.34, 0, 0)],
  fans: () => [new V3(), new V3(0, 0, 0.17)],
  mobo: (_v, L) => [L.mobo.clone(), new V3(0.03, 0.02, 0)],
  cpu: (_v, L) => [L.socket.clone().add(new V3(0.0032, 0, 0)), new V3(0.105, 0.03, 0)],
  cooler: (_v, L) => [L.socket.clone().add(new V3(0.0024, 0, 0)), new V3(0.17, 0.13, 0)],
  ram: (_v, L) => [new V3(L.mobo.x + 0.0008 + 0.0078 + 0.02, L.mobo.y + L.sy - 0.004, L.mobo.z), new V3(0.13, 0.05, 0.02)],
  ssd: (_v, L) => [L.mobo.clone().add(new V3(0.0045, L.sy - 0.088, -L.mW / 2 + 0.11)), new V3(0.19, -0.06, 0)],
  gpu: (v, L) => { const d = gpuDims(v); return [new V3(L.xi1 - 0.032 - d.T / 2, L.ys + 0.014 + d.H / 2, -L.d / 2 + 0.022 + d.L / 2), new V3(0.27, -0.03, 0.06)]; },
  psu: (_v, L) => [new V3(-L.w / 2 + 0.006 + 0.077, L.y0 + 0.006 + 0.045, -L.d / 2 + 0.012 + 0.088), new V3(0.3, -0.03, -0.02)],
};
