// Procedural PC model: per-part builders, part catalogue constants, demo build and the part factory.
// Geometry helpers live in geometry.ts, layout + placements in layout.ts, cable runs in cables.ts.
import * as THREE from 'three';
import { Part, V3, type Kit, type PalKey } from './materials';
import { buildCables, type CablesVis } from './cables';
import { add, B, makeFan, merge, rbox, screenTex } from './geometry';
import { DEFAULT_CASE, GPU_ROLL, PLACE, gpuDims, type Layout } from './layout';
import { PART_COLOR } from './palette';
import type { BuildItem, PartId, PartVis, PickTarget, StudioCat } from './types';

export { DEFAULT_CASE, RAD_360, computeLayout, type Layout } from './layout';
export type { CablesVis } from './cables';

// ---------- part builders (local coordinates) ----------
type Builder = (p: Part, v: PartVis, L: Layout, kit: Kit) => void;
type ModelPart = Exclude<PartId, 'cables'>;
const BUILD: Record<ModelPart, Builder> = {
  case(p, v, L) {
    const sh: PalKey = v.color === 'white' ? 'white' : 'graphite', pn: PalKey = v.color === 'white' ? 'white' : 'black';
    const { w, h, d, y0 } = L, H = h - y0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(p, new THREE.CylinderGeometry(0.012, 0.014, y0, 24), 'rubber', sx * (w / 2 - 0.03), y0 / 2, sz * (d / 2 - 0.045), 'foot');
    add(p, B(w, 0.006, d), pn, 0, y0 + 0.003, 0, 'panel_bottom');
    add(p, B(w, 0.008, d), pn, 0, h - 0.004, 0, 'panel_top');
    const vent: THREE.BufferGeometry[] = []; for (let i = 0; i < 16; i++) { const g = B(w * 0.62, 0.0012, 0.006); g.translate(0.01, h + 0.0006, -d / 2 + 0.05 + i * ((d - 0.1) / 15)); vent.push(g); }
    add(p, merge(vent), 'mesh', 0, 0, 0, 'top_vent');
    add(p, B(w, H, 0.004), pn, 0, y0 + H / 2, -d / 2 + 0.002, 'panel_rear');
    add(p, B(0.004, H, d), pn, -w / 2 + 0.002, y0 + H / 2, 0, 'panel_left');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { if (v.style === 'glass' && sx === 1 && sz === 1) continue; add(p, B(0.014, H, 0.014), sh, sx * (w / 2 - 0.007), y0 + H / 2, sz * (d / 2 - 0.007), 'pillar'); }
    add(p, B(0.014, 0.014, d), sh, w / 2 - 0.007, h - 0.007, 0, 'rail_top');
    add(p, B(0.014, 0.014, d), sh, w / 2 - 0.007, y0 + 0.007, 0, 'rail_bottom');
    if (v.style === 'mesh') {
      add(p, B(w - 0.02, H - 0.02, 0.003), 'mesh', 0, y0 + H / 2, d / 2 - 0.006, 'front_mesh');
      const sl: THREE.BufferGeometry[] = []; const n = Math.floor((H - 0.03) / 0.0115);
      for (let i = 0; i < n; i++) { const g = B(w - 0.026, 0.0048, 0.009); g.translate(0, y0 + 0.02 + i * 0.0115, d / 2 - 0.0015); sl.push(g); }
      add(p, merge(sl), sh, 0, 0, 0, 'front_slats');
    } else {
      add(p, B(w - 0.006, H - 0.012, 0.004), p.glass(), 0, y0 + H / 2, d / 2 - 0.002, 'front_glass');
    }
    add(p, B(w - 0.012, 0.095, d - 0.012), sh, 0, y0 + 0.006 + 0.0475, 0, 'psu_shroud');
    add(p, B(0.0022, 0.0022, d - 0.07), p.glow(p.accent, 2.6), w / 2 - 0.013, y0 + 0.006 + 0.095, 0, 'signature_line');
    const rf = makeFan(p, 0.12, { frame: pn }); rf.position.set(0.016, h - 0.105, -d / 2 + 0.0165); p.group.add(rf);
  },
  glass(p, _v, L) { add(p, B(0.004, L.h - L.y0 - 0.02, L.d - 0.022), p.glass(), L.w / 2 - 0.002, L.y0 + (L.h - L.y0) / 2, 0, 'side_glass'); },
  fans(p, v, L) {
    const n = Math.min(3, Math.floor((L.h - L.y0 - 0.03) / 0.124));
    for (let i = 0; i < n; i++) { const f = makeFan(p, 0.12, { frame: v.color === 'white' ? 'white' : 'black', bladeMat: v.color === 'white' ? 'white' : 'blade' }); f.rotation.y = Math.PI; f.position.set(0.012, L.h - 0.085 - i * 0.124, L.d / 2 - 0.024); p.group.add(f); }
  },
  mobo(p, v, L) {
    const H = L.mH, W = L.mW, top = H / 2, back = -W / 2, sy = L.sy, sz = L.sz;
    const sh: PalKey = v.color === 'white' ? 'white' : 'graphite';
    add(p, B(0.0016, H, W), 'pcb', 0, 0, 0, 'pcb');
    add(p, B(0.003, 0.052, 0.052), 'dark_alu', 0.0023, sy, sz, 'cpu_socket');
    add(p, rbox(0.03, 0.026, 0.1, 0.003), 'dark_alu', 0.0158, top - 0.03, sz + 0.005, 'vrm_heatsink_top');
    add(p, rbox(0.03, 0.09, 0.024, 0.003), 'dark_alu', 0.0158, sy + 0.004, back + 0.046, 'vrm_heatsink_rear');
    add(p, rbox(0.036, 0.15, 0.03, 0.004), sh, 0.0188, top - 0.084, back + 0.017, 'io_shroud');
    add(p, B(0.0012, 0.12, 0.0022), p.glow(p.accent, 2.0), 0.0372, top - 0.084, back + 0.028, 'io_light');
    for (let i = 0; i < 4; i++) add(p, B(0.0075, 0.133, 0.0055), 'black', 0.0045, sy - 0.004, sz + 0.062 + i * 0.0095, 'dimm_slot');
    if (sy - 0.122 > -top) add(p, B(0.008, 0.0068, 0.09), 'chrome', 0.0048, sy - 0.122, back + 0.088, 'pcie_x16');
    if (sy - 0.188 > -top) add(p, B(0.008, 0.0068, 0.09), 'black', 0.0048, sy - 0.188, back + 0.088, 'pcie_x4');
    add(p, rbox(0.007, 0.085, 0.105, 0.003), 'dark_alu', 0.0043, -top + 0.052, W / 2 - 0.066, 'chipset_heatsink');
    add(p, B(0.014, 0.055, 0.009), 'black', 0.0075, sy - 0.02, W / 2 - 0.006, 'atx_24pin');
    for (let i = 0; i < 6; i++) { const c = add(p, new THREE.CylinderGeometry(0.0034, 0.0034, 0.008, 16), 'alu', 0.0048, top - 0.052, sz - 0.03 + i * 0.012, 'capacitor'); c.rotation.z = Math.PI / 2; }
  },
  cpu(p) {
    add(p, B(0.0016, 0.04, 0.04), 'pcb', 0, 0, 0, 'cpu_substrate');
    add(p, rbox(0.0042, 0.034, 0.034, 0.003), 'chrome', 0.0028, 0, 0, 'cpu_ihs').rotation.y = 0;
  },
  cooler(p, v, L, kit) {
    const white = v.color === 'white';
    if (v.type === 'air') {
      const H = v.height || 0.155;
      add(p, B(0.012, 0.042, 0.042), 'chrome', 0.006, 0, 0, 'cold_plate');
      for (let i = 0; i < 4; i++) { const hp = add(p, new THREE.CylinderGeometry(0.003, 0.003, H - 0.01, 16), 'copper', H / 2, -0.015 + i * 0.01, 0, 'heatpipe'); hp.rotation.z = Math.PI / 2; }
      const fins: THREE.BufferGeometry[] = []; for (let x = 0.03; x < H - 0.008; x += 0.0032) { const g = B(0.0005, 0.125, 0.052); g.translate(x, 0, 0); fins.push(g); }
      add(p, merge(fins), 'alu', 0, 0, 0, 'fin_stack');
      add(p, rbox(0.006, 0.128, 0.056, 0.003), white ? 'white' : 'black', H, 0, 0, 'top_cover');
      add(p, B(0.0012, 0.11, 0.002), p.glow(p.accent, 2.2), H + 0.0035, 0, 0.018, 'cover_light');
      const f = makeFan(p, 0.12, { frame: white ? 'white' : 'black', rgb: false, cap: 'black', speed: 0.8 }); f.position.set(0.095, 0, 0.026 + 0.0125); p.group.add(f);
    } else {
      const pump = add(p, new THREE.CylinderGeometry(0.036, 0.037, 0.03, 64), white ? 'white' : 'graphite', 0.017, 0, 0, 'pump_head'); pump.rotation.z = Math.PI / 2;
      const sm = new THREE.MeshStandardMaterial({ name: 'pump_lcd', color: PART_COLOR.lcdBase, emissive: PART_COLOR.lcdEmissive, emissiveMap: screenTex(kit), emissiveIntensity: 1.1, roughness: 0.15, metalness: 0 });
      p.mats.push(sm); p.glows.push(sm);
      const scr = add(p, new THREE.CircleGeometry(0.0305, 64), sm, 0.0325, 0, 0, 'pump_screen'); scr.rotation.y = Math.PI / 2;
      const ring = add(p, new THREE.TorusGeometry(0.0335, 0.0014, 8, 90), p.glow(p.accent, 2.4), 0.0322, 0, 0, 'pump_ring'); ring.rotation.y = Math.PI / 2;
      const rl = L.rad.clone().sub(L.socket);
      add(p, rbox(0.12, 0.027, L.radLen - 0.036, 0.003), 'dark_alu', rl.x, rl.y, rl.z, 'radiator_core');
      for (const s of [-1, 1]) add(p, B(0.122, 0.034, 0.018), white ? 'white' : 'black', rl.x, rl.y, rl.z + s * (L.radLen / 2 - 0.009), 'end_tank');
      const n = L.radLen > 0.3 ? 3 : 2;
      for (let i = 0; i < n; i++) { const f = makeFan(p, 0.12, { frame: white ? 'white' : 'black', bladeMat: white ? 'white' : 'blade' }); f.rotation.x = Math.PI / 2; f.position.set(rl.x, rl.y - 0.0135 - 0.0125, rl.z - (n - 1) * 0.0625 + i * 0.125); p.group.add(f); }
      const tm: PalKey = white ? 'white_sleeve' : 'rubber';
      for (const s of [0, 1]) {
        const end = new V3(rl.x - 0.035 + s * 0.022, rl.y - 0.017, rl.z - L.radLen / 2 + 0.009);
        const c = new THREE.CatmullRomCurve3([new V3(0.03, 0.03 + s * 0.006, -0.012 + s * 0.022), new V3(0.06, 0.07, -0.01 + s * 0.02), new V3(end.x, end.y - 0.07, end.z + 0.06), end]);
        add(p, new THREE.TubeGeometry(c, 48, 0.0055, 12), tm, 0, 0, 0, 'coolant_tube');
      }
    }
  },
  ram(p, v, L) {
    const sh: PalKey = v.color === 'white' ? 'white' : 'graphite';
    const rgb = typeof v.rgb === 'number' && v.rgb ? v.rgb : PART_COLOR.ramRgb;
    for (const i of [1, 3]) {
      const z = L.sz + 0.062 + i * 0.0095;
      add(p, rbox(0.04, 0.133, 0.0068, 0.0025), sh, 0, 0, z, 'dimm_heatspreader');
      add(p, B(0.006, 0.13, 0.0056), p.glow(rgb, 2.0), 0.023, 0, z, 'dimm_lightbar');
    }
  },
  ssd(p) {
    add(p, B(0.0016, 0.022, 0.08), 'pcb', 0, 0, 0, 'm2_pcb');
    add(p, rbox(0.007, 0.026, 0.092, 0.002), 'dark_alu', 0.0045, 0, 0, 'm2_heatsink');
    add(p, B(0.0008, 0.0022, 0.06), p.glow(p.accent, 1.6), 0.0084, 0.006, 0, 'm2_light');
  },
  gpu(p, v) {
    const { L, H, T } = gpuDims(v), white = v.color === 'white';
    const sh: PalKey = white ? 'white' : 'graphite';
    const sx = T - 0.016;
    add(p, rbox(sx, H, L, 0.011), sh, T / 2 - sx / 2, 0, 0, 'gpu_shroud');
    const n = v.fans || 3, fs = Math.min(H * 0.82, (L - 0.04) / n - 0.004);
    const span = n * fs + (n - 1) * 0.006;
    for (let i = 0; i < n; i++) {
      const f = makeFan(p, fs, { frameless: true, frame: white ? 'alu' : 'dark_alu', rgb: !!v.rgb, blades: 11, bladeMat: white ? 'white' : 'blade', cap: white ? 'white' : 'dark_alu', speed: 0.9 });
      f.rotation.y = Math.PI / 2; f.position.set(T / 2 + 0.0035, 0, -span / 2 + fs / 2 + i * (fs + 0.006) + (v.shift || 0)); p.group.add(f);
    }
    add(p, B(0.002, 0.0032, L * 0.52), p.glow(p.accent, 2.6), T / 2 + 0.0012, H / 2 - 0.009, -L * 0.12, 'gpu_lightbar');
    add(p, B(0.0026, H - 0.004, L - 0.006), 'dark_alu', -T / 2 + 0.0013, 0, 0, 'gpu_backplate');
    const fins: THREE.BufferGeometry[] = []; for (let z = -L / 2 + 0.01; z < L / 2 - 0.01; z += 0.0042) { const g = B(0.0125, H - 0.016, 0.0006); g.translate(-T / 2 + 0.0026 + 0.0068, 0, z); fins.push(g); }
    add(p, merge(fins), 'alu', 0, 0, 0, 'gpu_fin_stack');
    add(p, B(T + 0.008, H + 0.012, 0.0016), 'chrome', 0, 0.004, -L / 2 - 0.0012, 'io_bracket');
    add(p, B(0.012, 0.008, 0.02), 'black', 0, H / 2 + 0.004, L * 0.12, 'power_12v2x6');
  },
  psu(p) {
    add(p, rbox(0.15, 0.086, 0.16, 0.004), 'black', 0, 0, 0, 'psu_body');
    add(p, B(0.001, 0.05, 0.1), 'dark_alu', 0.0755, 0, 0, 'psu_label_plate');
    add(p, B(0.0008, 0.002, 0.07), p.glow(p.accent, 1.8), 0.0762, 0.019, 0, 'psu_light');
    const ring = add(p, new THREE.TorusGeometry(0.06, 0.003, 8, 60), 'dark_alu', 0, -0.0435, 0, 'psu_fan_grille'); ring.rotation.x = Math.PI / 2;
  },
};

/** Part → selectable category. */
export const CAT: Record<PartId, PickTarget> = { case: 'case', glass: 'case', fans: 'case', mobo: 'mobo', cpu: 'cpu', cooler: 'cooler', ram: 'ram', ssd: 'ssd', gpu: 'gpu', psu: 'psu', cables: 'cables' };
export const ORDER: PartId[] = ['case', 'mobo', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu', 'cables', 'fans', 'glass'];
export const CATS: StudioCat[] = ['cpu', 'cooler', 'mobo', 'ram', 'ssd', 'gpu', 'case', 'psu'];
export const LABEL: Record<PickTarget, string> = { cpu: 'CPU', cooler: 'Cooler', mobo: 'Motherboard', ram: 'Memory', ssd: 'Storage', gpu: 'Graphics', case: 'Case', psu: 'Power supply', cables: 'Cables' };
export const IDX: Record<PickTarget, string> = { cpu: '01', cooler: '02', mobo: '03', ram: '04', ssd: '05', gpu: '06', case: '07', psu: '08', cables: '09' };

/** Demo build used when the host never sends one. Shapes only: no prices, since the studio has no live data for them. */
export const DEFAULT_BUILD: Record<StudioCat, BuildItem> = {
  cpu: { id: 'cpu-9800x3d', label: 'AMD Ryzen 7 9800X3D', vis: {} },
  cooler: { id: 'cool-kraken360', label: 'NZXT Kraken Elite 360', vis: { type: 'aio' } },
  mobo: { id: 'mb-b850f', label: 'ASUS ROG Strix B850-F Gaming WiFi', vis: { ff: 'atx' } },
  ram: { id: 'ram-tz5', label: 'G.Skill Trident Z5 Neo RGB 32GB', vis: {} },
  ssd: { id: 'ssd-990', label: 'Samsung 990 Pro 2TB', vis: {} },
  gpu: { id: 'gpu-5080', label: 'ASUS TUF Gaming RTX 5080 16GB', vis: { L: 0.348, T: 0.072, H: 0.14, fans: 3 } },
  case: { id: 'case-903', label: 'Montech Air 903 Max', vis: { style: 'mesh', color: 'black', ...DEFAULT_CASE } },
  psu: { id: 'psu-rm850e', label: 'Corsair RM850e 850W', vis: {} },
};

/** Build a part's meshes into a fresh Part (local coords, not placed). */
export function buildPart(id: PartId, kit: Kit, vis: PartVis | CablesVis, L: Layout): Part {
  const p = new Part(id, kit);
  if (id === 'cables') buildCables(p, kit, vis as CablesVis, L);
  else BUILD[id](p, vis as PartVis, L, kit);
  return p;
}
/** Build + place + finalize (prototype makePart). */
export function makePart(id: PartId, kit: Kit, vis: PartVis | CablesVis | undefined, L: Layout): Part {
  const v = vis || {};
  const p = buildPart(id, kit, v as PartVis, L);
  const [base, off] = PLACE[id](v as PartVis, L);
  p.base.copy(base); p.offset.copy(off);
  if (id === 'gpu') p.group.rotation.z = GPU_ROLL;
  return p.finalize();
}
