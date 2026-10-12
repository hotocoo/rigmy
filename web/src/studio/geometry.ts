// Mesh-building helpers for the procedural model: mesh placement, rounded boxes, geometry merging, fans, pump LCD.
import * as THREE from 'three';
import type { Kit, PalKey, Part, PartMat } from './materials';
import { LCD_COLOR } from './palette';

export function add(p: Part, geo: THREE.BufferGeometry, mk: PalKey | PartMat, x: number, y: number, z: number, name?: string, parent?: THREE.Object3D): THREE.Mesh {
  const mat = typeof mk === 'string' ? p.m(mk) : mk;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name || mat.name;
  mesh.position.set(x, y, z);
  (parent || p.group).add(mesh);
  return mesh;
}
export const B = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);
function rrShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
/** Box rounded in the XY cross-section, extruded along Z. */
export function rbox(w: number, h: number, d: number, r = 0.004): THREE.ExtrudeGeometry {
  const bs = Math.min(r * 0.5, d * 0.25, 0.0018);
  const W = w - 2 * bs, H = h - 2 * bs, R = Math.max(Math.min(r - bs, W / 2 - 1e-4, H / 2 - 1e-4), 2e-4);
  const depth = Math.max(d - 2 * bs, 2e-4);
  const g = new THREE.ExtrudeGeometry(rrShape(W, H, R), { depth, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const attr = (g: THREE.BufferGeometry, k: string): THREE.BufferAttribute => g.getAttribute(k) as THREE.BufferAttribute;
/** Merge indexed geometries (position/normal/uv) into one, disposing the inputs. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0, ni = 0;
  geos.forEach((g) => { n += attr(g, 'position').count; ni += g.index ? g.index.count : 0; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(attr(g, 'position').array, o * 3); nor.set(attr(g, 'normal').array, o * 3); uv.set(attr(g, 'uv').array, o * 2);
    const ix = g.index ? g.index.array : [];
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += attr(g, 'position').count; oi += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const bladeGeo = (len: number, chord: number): THREE.ExtrudeGeometry => {
  const s = new THREE.Shape(); s.moveTo(0, -chord * 0.28); s.quadraticCurveTo(len * 0.6, -chord * 0.62, len, -chord * 0.42); s.quadraticCurveTo(len * 1.04, 0, len, chord * 0.46); s.quadraticCurveTo(len * 0.5, chord * 0.5, 0, chord * 0.28); s.lineTo(0, -chord * 0.28);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0011, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, -0.00055);
  return g;
};

/** Default emissive strength of a fan's RGB rings. */
const FAN_RING_GLOW = 2.2;
interface FanOpts { frameless?: boolean; frame?: PalKey; rgb?: boolean; color?: number; k?: number; cap?: PalKey; blades?: number; bladeMat?: PalKey; speed?: number }
/** Fan facing +z. */
export function makeFan(p: Part, size: number, o: FanOpts = {}): THREE.Group {
  const g = new THREE.Group(); g.name = 'fan'; const t = 0.025;
  if (!o.frameless) {
    const s = rrShape(size, size, 0.009); const hole = new THREE.Path(); hole.absarc(0, 0, size * 0.47, 0, Math.PI * 2, true); s.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 40 }); fg.translate(0, 0, -t / 2);
    add(p, fg, o.frame || 'black', 0, 0, 0, 'fan_frame', g);
  } else {
    add(p, new THREE.TorusGeometry(size * 0.485, 0.0035, 10, 80), o.frame || 'graphite', 0, 0, t * 0.15, 'fan_bezel', g);
    add(p, new THREE.CircleGeometry(size * 0.48, 48), 'mesh', 0, 0, -t * 0.25, 'fan_well', g);
  }
  if (o.rgb !== false) {
    const gm = p.glow(o.color ?? p.accent, o.k || FAN_RING_GLOW);
    add(p, new THREE.TorusGeometry(size * 0.468, 0.0019, 6, 90), gm, 0, 0, t / 2 - 0.001, 'fan_rgb_ring', g);
    if (!o.frameless) add(p, new THREE.TorusGeometry(size * 0.468, 0.0019, 6, 90), gm, 0, 0, -t / 2 + 0.001, 'fan_rgb_ring', g);
  }
  const rotor = new THREE.Group(); rotor.name = 'fan_rotor'; g.add(rotor);
  const hub = add(p, new THREE.CylinderGeometry(size * 0.165, size * 0.165, t * 0.7, 40), 'blade', 0, 0, 0, 'fan_hub', rotor); hub.rotation.x = Math.PI / 2;
  add(p, new THREE.CircleGeometry(size * 0.115, 40), o.cap || 'dark_alu', 0, 0, t * 0.35 + 0.0006, 'fan_cap', rotor);
  const len = size * 0.3, bg = bladeGeo(len, size * 0.2), nb = o.blades || 9;
  for (let i = 0; i < nb; i++) { const piv = new THREE.Group(); piv.rotation.z = i / nb * Math.PI * 2; const b = add(p, bg, o.bladeMat || 'blade', size * 0.16, 0, 0, 'fan_blade', piv); b.rotation.x = 0.62; rotor.add(piv); }
  p.rotors.push({ rotor, speed: (o.speed || 1) * (5.2 + Math.random() * 0.8) });
  return g;
}
/** Pump-head LCD artwork (256 px canvas): a temperature gauge arc and readout. Decorative, not live data. */
const LCD = { size: 256, ringR: 98, ringW: 9, arcTurns: 0.58, value: { text: '41°', weight: 600, px: 62, x: 136, y: 122 }, caption: { text: 'CPU  ·  RIGMY', weight: 500, px: 17, y: 176 } } as const;
export function screenTex(kit: Kit): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = LCD.size; const g = c.getContext('2d');
  if (g) {
    const mid = LCD.size / 2, top = -Math.PI / 2, accent = '#' + kit.brand.accent.toString(16).padStart(6, '0');
    g.fillStyle = LCD_COLOR.bg; g.fillRect(0, 0, LCD.size, LCD.size);
    g.lineWidth = LCD.ringW; g.strokeStyle = LCD_COLOR.track; g.beginPath(); g.arc(mid, mid, LCD.ringR, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = accent; g.lineCap = 'round'; g.beginPath(); g.arc(mid, mid, LCD.ringR, top, top + Math.PI * 2 * LCD.arcTurns); g.stroke();
    g.fillStyle = LCD_COLOR.value; g.font = `${LCD.value.weight} ${LCD.value.px}px ${kit.brand.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LCD.value.text, LCD.value.x, LCD.value.y);
    g.fillStyle = LCD_COLOR.caption; g.font = `${LCD.caption.weight} ${LCD.caption.px}px ${kit.brand.mono}`; g.fillText(LCD.caption.text, mid, LCD.caption.y);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
