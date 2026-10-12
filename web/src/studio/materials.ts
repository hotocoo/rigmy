// Shared utilities, canvas textures, the material palette and the Part container.
import * as THREE from 'three';
import { PAL, PART_COLOR, TEX_COLOR, type Brand, type PalKey, type TexKey } from './palette';
import type { PartId } from './types';

export type { PalKey, TexKey } from './palette';

/** Anisotropic filtering for the shared procedural textures. */
const TEX_ANISOTROPY = 8;
/** Emissive RGB glows: default strength, and the emissive-intensity multiplier applied to it. */
const GLOW = { k: 2.4, emissiveScale: 1.8, roughness: 0.5 } as const;
/** Tempered-glass panel (side panel, glass front). */
const GLASS = { metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.004, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02 } as const;
/** Part.apply(): how far a dimmed part darkens, the colour floor while faded out, how much glows dim, and the
 *  opacity above which a material is treated as opaque again. */
const LOOK = { dimColor: 0.6, fadeFloor: 0.2, dimGlow: 0.45, opaqueAbove: 0.995 } as const;

export const V3 = THREE.Vector3;
export type V3 = THREE.Vector3;

// ---------- utils ----------
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export type Ease = (t: number) => number;
export const E = {
  inOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Ease,
  out: ((t) => 1 - Math.pow(1 - t, 3)) as Ease,
  expo: ((t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))) as Ease,
};

interface Tween { t: number; dur: number; fn: (k: number) => void; e: Ease; res: () => void }
/** Frame-driven tweens (advanced by the render loop, so they pause with it). */
export class Tweens {
  private list: Tween[] = [];
  add(dur: number, fn: (k: number) => void, o: { delay?: number; e?: Ease } = {}): Promise<void> {
    return new Promise((res) => this.list.push({ t: -(o.delay || 0) / 1000, dur: dur / 1000, fn, e: o.e || E.inOut, res }));
  }
  step(dt: number): void {
    const tweens = this.list;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = clamp(tw.t / tw.dur);
      tw.fn(tw.e(k));
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }
  clear(): void { this.list.length = 0; }
}

export const cnv = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // CPU-backed canvas: these are drawn once and uploaded as textures, and a GPU-accelerated 2D canvas would sync with
  // the (possibly busy) GPU process while drawing.
  const g = c.getContext('2d', { willReadFrequently: true });
  if (g) draw(g, w, h);
  return c;
};

// ---------- procedural textures ----------
type TexDef = [size: number, srgb: boolean, repeat: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void];
const TEXDEF: Record<TexKey, TexDef> = {
  noise: [256, false, 3, (g, w, h) => { const id = g.createImageData(w, h); for (let i = 0; i < id.data.length; i += 4) { const v = 205 + Math.random() * 50; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); }],
  brushed: [512, false, 1, (g, w, h) => { g.fillStyle = TEX_COLOR.brushedBase; g.fillRect(0, 0, w, h); for (let i = 0; i < 2400; i++) { const v = (150 + Math.random() * 105) | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + Math.random() * 0.5) + ')'; g.fillRect(0, Math.random() * h, w, 0.6 + Math.random() * 1.2); } }],
  pcb: [512, true, 1, (g, w, h) => { g.fillStyle = TEX_COLOR.pcbBase; g.fillRect(0, 0, w, h); g.lineCap = 'round'; for (let i = 0; i < 90; i++) { let x = Math.random() * w, y = Math.random() * h; g.strokeStyle = Math.random() < 0.15 ? TEX_COLOR.pcbTraceHi : TEX_COLOR.pcbTrace; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (k % 2) x += (Math.random() - 0.5) * 200; else y += (Math.random() - 0.5) * 200; g.lineTo(x, y); } g.stroke(); } for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.3 ? TEX_COLOR.pcbPadGold : TEX_COLOR.pcbPad; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } g.strokeStyle = TEX_COLOR.pcbEdge; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10); }],
};

/** Per-studio cache of the shared procedural textures (disposed with the studio). */
export class TexCache {
  private cache: Partial<Record<TexKey, THREE.CanvasTexture>> = {};
  get(k: TexKey): THREE.CanvasTexture {
    const hit = this.cache[k];
    if (hit) return hit;
    const d = TEXDEF[k];
    const t = new THREE.CanvasTexture(cnv(d[0], d[0], d[3]));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(d[2], d[2]);
    t.anisotropy = TEX_ANISOTROPY;
    if (d[1]) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
    return (this.cache[k] = t);
  }
  dispose(): void { for (const t of Object.values(this.cache)) t?.dispose(); this.cache = {}; }
}

// ---------- palette ----------
/** What part builders need from the studio instance: the shared textures and the resolved brand colours. */
export interface Kit {
  tex: TexCache;
  brand: Brand;
  /** Called when a part is finalized (meshes and materials complete), so the scene can pre-compile its shaders. */
  onPartReady?: (p: Part) => void;
}

export function palMat(tex: TexCache, k: PalKey, name?: string): THREE.MeshPhysicalMaterial {
  const { rmap, map, ...rest } = PAL[k];
  const o: THREE.MeshPhysicalMaterialParameters = { name: name || k, ...rest };
  if (rmap) o.roughnessMap = tex.get(rmap);
  if (map) o.map = tex.get(map);
  return new THREE.MeshPhysicalMaterial(o);
}

// ---------- parts ----------
/** Snapshot of a material's authored look, stored on userData by Part.finalize(). */
export interface MatData { c0?: THREE.Color; e0?: number; o0?: number; t0?: boolean; isGlass?: boolean }
export const matData = (m: THREE.Material): MatData => m.userData as MatData;
/** Every material a Part owns is Standard or Physical. */
export type PartMat = THREE.MeshStandardMaterial;

export interface Rotor { rotor: THREE.Group; speed: number }

export class Part {
  readonly id: PartId;
  readonly group: THREE.Group;
  mats: PartMat[] = [];
  glows: PartMat[] = [];
  cache: Record<string, PartMat> = {};
  rotors: Rotor[] = [];
  base = new V3();
  offset = new V3();
  /** explode spring position / velocity / target */
  e = 0; v = 0; eT = 0;
  fade = 1; fadeT = 1;
  dim = 0;
  glowK = 1; glowT = 1;
  leaving = false;
  cableMats: Record<string, THREE.MeshPhysicalMaterial> | null = null;

  constructor(id: PartId, private kit: Kit) {
    this.id = id;
    this.group = new THREE.Group();
    this.group.name = id;
  }
  m(k: PalKey): PartMat {
    if (!this.cache[k]) { const m = palMat(this.kit.tex, k); this.cache[k] = m; this.mats.push(m); }
    return this.cache[k];
  }
  /** Brand accent (resolved --blue), the default glow colour. */
  get accent(): number { return this.kit.brand.accent; }
  glow(color = this.accent, k: number = GLOW.k): PartMat {
    const id = 'g' + color;
    if (!this.cache[id]) {
      const m = new THREE.MeshStandardMaterial({ name: 'rgb_glow', color: PART_COLOR.glowBase, emissive: color, emissiveIntensity: k * GLOW.emissiveScale, roughness: GLOW.roughness });
      this.cache[id] = m; this.mats.push(m); this.glows.push(m);
    }
    return this.cache[id];
  }
  glass(): PartMat {
    if (!this.cache.glass) {
      const m = new THREE.MeshPhysicalMaterial({ name: 'tempered_glass', color: PART_COLOR.glass, ...GLASS });
      m.userData.isGlass = true;
      this.cache.glass = m; this.mats.push(m);
    }
    return this.cache.glass;
  }
  finalize(): this {
    for (const m of this.mats) Object.assign(m.userData, { c0: m.color.clone(), e0: m.emissiveIntensity || 0, o0: m.opacity, t0: m.transparent } satisfies MatData);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.Material;
        o.userData.part = this.id;
        o.castShadow = !mat.transparent && !matData(mat).isGlass;
        o.receiveShadow = true;
      }
    });
    this.kit.onPartReady?.(this);
    return this;
  }
  apply(): void {
    const f = this.fade, d = 1 - LOOK.dimColor * this.dim;
    for (const m of this.mats) {
      const u = matData(m);
      if (!u.c0) continue;
      m.color.copy(u.c0).multiplyScalar(d * (LOOK.fadeFloor + (1 - LOOK.fadeFloor) * f));
      if (u.e0) m.emissiveIntensity = u.e0 * this.glowK * (1 - LOOK.dimGlow * this.dim) * f;
      const wantT = !!u.t0 || f < LOOK.opaqueAbove;
      if (m.transparent !== wantT) { m.transparent = wantT; m.needsUpdate = true; }
      m.opacity = (u.o0 ?? 1) * f;
    }
  }
  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose(); });
    this.mats.forEach((m) => {
      if (m.map && !m.map.userData.shared) m.map.dispose();
      if (m.emissiveMap) m.emissiveMap.dispose();
      m.dispose();
    });
  }
}

/** Dispose every geometry, material and material texture under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as Partial<THREE.Mesh>;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
        mat.dispose();
      }
    }
  });
}
