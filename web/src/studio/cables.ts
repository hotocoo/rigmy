// Cable runs (24-pin, EPS, GPU power, front panel) in tidy or stock routing.
import * as THREE from 'three';
import { palMat, V3, type Kit, type PalKey, type Part } from './materials';
import { add, B, merge } from './geometry';
import { PLACE, gpuDims, type Layout } from './layout';
import type { CableOpts, PartVis } from './types';

/** Inputs for the cable-run builder. */
export interface CablesVis extends CableOpts { mobo: boolean; gpuVis: PartVis | null }

export function buildCables(p: Part, kit: Kit, v: CablesVis, L: Layout): void {
  const cableMats: Record<string, THREE.MeshPhysicalMaterial> = {};
  p.cableMats = cableMats;
  const tidy = v.route !== 'stock';
  const sk: PalKey = v.sleeve === 'white' ? 'white_sleeve' : v.sleeve === 'blue' ? 'blue_sleeve' : 'sleeve';
  const plastic: PalKey = v.sleeve === 'white' ? 'white' : 'black';
  const mk = (id: string) => { const m = palMat(kit.tex, sk, id); p.mats.push(m); cableMats[id] = m; return m; };
  const mb = L.mobo, W = L.mW, H = L.mH, fz = mb.z + W / 2, tray = L.xi0, Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);
  const wob = tidy ? 0 : 0.007;
  const run = (id: string, pts: THREE.Vector3[], n: number, gap: number, r: number, axis: THREE.Vector3, wb: number) => {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap;
      const ps = pts.map((q, k) => { const v2 = q.clone().addScaledVector(axis, o); if (wb && k > 0 && k < pts.length - 1) v2.add(new V3((Math.random() - 0.5) * wb, (Math.random() - 0.5) * wb, (Math.random() - 0.5) * wb)); return v2; });
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps, false, 'catmullrom', 0.35), 72, r, 7));
    }
    return add(p, merge(geos), mk(id), 0, 0, 0, id);
  };
  if (!v.mobo) return;
  // 24-pin ATX
  const c = new V3(mb.x + 0.0075, mb.y + L.sy - 0.02, fz + 0.0045);
  add(p, B(0.0145, 0.057, 0.006), plastic, c.x, c.y, fz + 0.0015, 'atx_plug');
  run('cable_24pin', tidy
    ? [c, c.clone().add(new V3(0, 0, 0.01)), new V3(c.x - 0.002, c.y, fz + 0.021), new V3(tray + 0.012, c.y, fz + 0.029), new V3(tray + 0.001, c.y, fz + 0.029)]
    : [c, c.clone().add(new V3(0.006, 0, 0.014)), new V3(c.x + 0.045, c.y - 0.03, fz + 0.045), new V3(c.x + 0.07, L.ys + 0.07, fz + 0.035), new V3(c.x + 0.03, L.ys + 0.012, fz + 0.015), new V3(c.x + 0.01, L.ys - 0.012, fz + 0.01)],
  12, 0.0044, 0.0021, Y, wob);
  if (tidy) {
    add(p, B(0.006, 0.058, 0.004), plastic, c.x - 0.0015, c.y, fz + 0.018, 'cable_comb');
    const gy0 = L.ys + 0.03, gy1 = c.y + 0.042;
    add(p, B(0.005, gy1 - gy0, 0.026), 'rubber', tray + 0.0025, (gy0 + gy1) / 2, fz + 0.029, 'grommet_front');
    add(p, B(0.005, 0.012, 0.03), 'rubber', tray + 0.0025, mb.y + H / 2 + 0.013, mb.z - W / 2 + 0.034, 'grommet_top');
  }
  // 8-pin EPS
  const e = new V3(mb.x + 0.0075, mb.y + H / 2 - 0.008, mb.z - W / 2 + 0.034);
  add(p, B(0.011, 0.0085, 0.019), 'black', e.x, e.y - 0.002, e.z, 'eps_header');
  add(p, B(0.012, 0.006, 0.02), plastic, e.x, e.y + 0.004, e.z, 'eps_plug');
  run('cable_eps', tidy
    ? [e.clone().add(new V3(0, 0.006, 0)), e.clone().add(new V3(0, 0.014, 0)), new V3(e.x - 0.004, e.y + 0.021, e.z), new V3(tray + 0.001, e.y + 0.021, e.z)]
    : [e.clone().add(new V3(0, 0.006, 0)), e.clone().add(new V3(0.02, 0.014, 0.012)), new V3(e.x + 0.07, mb.y + 0.04, e.z + 0.03), new V3(e.x + 0.06, L.ys + 0.035, -L.d / 2 + 0.05), new V3(e.x + 0.04, L.ys - 0.012, -L.d / 2 + 0.045)],
  8, 0.0024, 0.0016, Z, wob);
  // 12V-2x6 GPU power
  if (v.gpuVis) {
    const gv = v.gpuVis, gd = gpuDims(gv), gb = PLACE.gpu(gv, L)[0], gH = gd.H;
    const g = new V3(gb.x, gb.y + gH / 2 + 0.011, gb.z + gd.L * 0.12);
    add(p, B(0.012, 0.006, 0.02), plastic, g.x, g.y - 0.003, g.z, 'gpu_plug');
    run('cable_gpu', tidy
      ? [g, g.clone().add(new V3(0, 0.012, 0)), new V3(g.x, g.y + 0.02, g.z + 0.02), new V3(g.x - 0.012, g.y + 0.022, fz + 0.03), new V3(tray + 0.012, g.y + 0.022, fz + 0.03), new V3(tray + 0.001, g.y + 0.022, fz + 0.03)]
      : [g, g.clone().add(new V3(0.004, 0.02, 0.01)), new V3(g.x + 0.03, g.y + 0.05, g.z + 0.07), new V3(g.x + 0.035, g.y - 0.01, gb.z + gd.L / 2 + 0.02), new V3(g.x + 0.015, L.ys + 0.03, gb.z + gd.L / 2 + 0.028), new V3(g.x, L.ys - 0.012, gb.z + gd.L / 2 + 0.02)],
    8, 0.0024, 0.0017, Z, wob);
    if (tidy) add(p, B(0.004, 0.006, 0.024), plastic, g.x - 0.03, g.y + 0.022, fz + 0.03, 'cable_comb');
  }
  // front panel + fan headers
  const f0 = new V3(mb.x + 0.006, mb.y - H / 2 + 0.008, fz - 0.035);
  add(p, B(0.008, 0.006, 0.05), 'black', f0.x, f0.y, f0.z, 'fp_headers');
  run('cable_fp', tidy
    ? [new V3(f0.x + 0.004, f0.y, f0.z), new V3(f0.x + 0.006, f0.y - 0.012, f0.z), new V3(f0.x + 0.006, L.ys + 0.004, f0.z), new V3(f0.x + 0.006, L.ys - 0.01, f0.z)]
    : [new V3(f0.x + 0.004, f0.y, f0.z), new V3(f0.x + 0.03, f0.y - 0.004, f0.z + 0.03), new V3(f0.x + 0.06, L.ys + 0.03, f0.z + 0.06), new V3(f0.x + 0.04, L.ys + 0.004, f0.z + 0.085), new V3(f0.x + 0.035, L.ys - 0.01, f0.z + 0.09)],
  6, 0.006, 0.0011, Z, wob * 1.4);
}
