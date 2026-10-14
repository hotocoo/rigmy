// Camera: flights between poses, per-part focus, view presets, the studio intro and the scroll/pointer-driven hero rig.
import * as THREE from 'three';
import { V3 } from './materials';
import { DEFAULT_CASE } from './model';
import { FLOOR_Y } from './stage';
import type { SceneState, Vec3 } from './state';
import type { PickTarget, ViewName } from './types';

// ---------- tuning (prototype values) ----------
/** Default flight time, orbit limits, distance boost on portrait viewports, and the look-at height (fraction of case
 *  height above the plinth; `emptyY` before anything is built). Distances scale with case height relative to the
 *  default case. */
export const CAM = { flightMs: 1100, minDistance: 0.22, maxDistance: 3.2, maxPolar: Math.PI * 0.53, portraitK: 1.45, targetK: 0.47, emptyY: 0.25, refCaseH: DEFAULT_CASE.h };
/** `{ rig: 'view' }` presets: direction, base distance (× case scale) and extra distance per unit of explode. */
const VIEW: { dirs: Record<ViewName, Vec3>; dist: number; explodeK: number } = {
  dirs: { hero: [1, 0.42, 1.05], side: [1, 0.06, 0.02], top: [0.35, 1.2, 0.3], front: [0.25, 0.15, 1] },
  dist: 1.18,
  explodeK: 0.38,
};
/** Studio focus pose per category: view direction, distance as a multiple of the part's bounding radius, minimum distance. */
const FOCUS: Record<PickTarget, { dir: Vec3; radiusK: number; minDist: number }> = {
  cables: { dir: [1, 0.12, 0.35], radiusK: 1.35, minDist: 0.5 },
  gpu: { dir: [1, 0.55, 0.3], radiusK: 2.4, minDist: 0.5 },
  cpu: { dir: [1, 0.3, 0.45], radiusK: 5, minDist: 0.3 },
  cooler: { dir: [1, 0.14, 0.42], radiusK: 1.25, minDist: 0.5 },
  ram: { dir: [1, 0.2, 0.6], radiusK: 3.2, minDist: 0.32 },
  mobo: { dir: [1, 0.2, 0.3], radiusK: 1.6, minDist: 0.62 },
  ssd: { dir: [1, 0.3, 0.4], radiusK: 4, minDist: 0.3 },
  psu: { dir: [1, 0.2, 0.6], radiusK: 2.6, minDist: 0.48 },
  case: { dir: [1, 0.42, 1.05], radiusK: 1.0, minDist: 1.3 },
};
/** Extra focus distance per unit of explode. */
const FOCUS_EXPLODE_K = 0.25;
/** Studio intro fly-in: start swung round (rad) and pushed out (× distance), slightly above the target, then fly home. */
const INTRO = { swing: 0.9, distK: 1.9, lift: 0.05, ms: 2600 };
/** Hero camera: azimuth/elevation/distance terms driven by scroll, sway, pointer, explode and the intro, plus how
 *  strongly it pulls toward a selection and how fast it follows. `start` is the initial (pre-first-frame) pose. */
const HERO = {
  az: { base: 0.62, scroll: 1.35, sway: 0.07, swaySpeed: 0.18, pointer: 0.16, intro: 0.9 },
  el: { base: 0.27, pointer: 0.07, explode: 0.07, intro: -0.2 },
  dist: { base: 1.3, explode: 0.45, intro: 0.9 },
  select: { pull: 0.45, dist: 0.82 },
  follow: 2.6,
  start: { az: 0.62, el: 0.3, dist: 1.3 },
};

export type CameraRig = ReturnType<typeof createCamera>;

export function createCamera(st: SceneState) {
  const { camera, controls } = st.S;
  let camTween: object | null = null;
  const sph0 = new THREE.Spherical(), sph1 = new THREE.Spherical();
  const UP = new V3(0, 1, 0);
  /** Scene handedness (stage.ts): pose directions are authored for the unmirrored model, so their x follows it. */
  const hx = st.S.handed;
  const dirOf = (d: Vec3): THREE.Vector3 => new V3(d[0] * hx, d[1], d[2]).normalize();

  function flyTo(target: THREE.Vector3, pos: THREE.Vector3, dur = CAM.flightMs): Promise<void> {
    const id = {}; camTween = id; st.lastInteract = st.T + dur / 1000;
    const t0 = controls.target.clone(), off0 = camera.position.clone().sub(t0), off1 = pos.clone().sub(target);
    sph0.setFromVector3(off0); sph1.setFromVector3(off1);
    let dth = sph1.theta - sph0.theta; if (dth > Math.PI) dth -= Math.PI * 2; if (dth < -Math.PI) dth += Math.PI * 2;
    const a = { r: sph0.radius, th: sph0.theta, ph: sph0.phi };
    const r1 = sph1.radius, ph1 = sph1.phi;
    return st.tween(dur, (k) => {
      if (camTween !== id) return;
      controls.target.lerpVectors(t0, target, k);
      const s = new THREE.Spherical(a.r + (r1 - a.r) * k, a.ph + (ph1 - a.ph) * k, a.th + dth * k);
      camera.position.setFromSpherical(s).add(controls.target);
    });
  }
  // Any user orbit cancels flights and suspends idle rotation until released (only solo keeps its turntable).
  const onCtlStart = () => { camTween = null; st.lastInteract = Infinity; controls.autoRotate = st.mode === 'solo' && controls.autoRotate; };
  const onCtlEnd = () => { st.lastInteract = st.T; };
  controls.addEventListener('start', onCtlStart);
  controls.addEventListener('end', onCtlEnd);

  const aspectK = (): number => (st.wrap.clientWidth / Math.max(1, st.wrap.clientHeight) < 1 ? CAM.portraitK : 1);
  const caseScale = (): number => (st.L ? st.L.h / CAM.refCaseH : 1);
  function homeTarget(): THREE.Vector3 { return new V3(0, st.L ? st.L.h * CAM.targetK + FLOOR_Y : CAM.emptyY, 0); }
  function viewPose(name: ViewName): [THREE.Vector3, THREE.Vector3] {
    const d = VIEW.dirs[name] || VIEW.dirs.hero;
    const t = homeTarget(); const dir = dirOf(d);
    return [t, t.clone().addScaledVector(dir, VIEW.dist * caseScale() * aspectK() * (1 + VIEW.explodeK * st.explodeG))];
  }
  function focus(cat: PickTarget | null, dur = CAM.flightMs): Promise<void> | undefined {
    if (st.mode !== 'studio' || !st.L) return;
    if (!cat || cat === 'case') { const [t, p] = viewPose('hero'); return flyTo(t, p, dur); }
    const box = st.partCenter(cat); if (box.isEmpty()) return;
    const c = box.getCenter(new V3()), r = box.getBoundingSphere(new THREE.Sphere()).radius;
    const f = FOCUS[cat]; const dir = dirOf(f.dir);
    const dist = Math.max(f.minDist, r * f.radiusK) * aspectK() * (1 + FOCUS_EXPLODE_K * st.explodeG);
    return flyTo(c, c.clone().addScaledVector(dir, dist), dur);
  }
  function studioIntro(): void {
    const [t, p] = viewPose('hero');
    const far = t.clone().add(p.clone().sub(t).applyAxisAngle(UP, INTRO.swing * hx).multiplyScalar(INTRO.distK)); far.y = t.y + INTRO.lift;
    camera.position.copy(far); controls.target.copy(t);
    void flyTo(t, p, INTRO.ms);
  }

  controls.minDistance = CAM.minDistance; controls.maxDistance = CAM.maxDistance; controls.maxPolarAngle = CAM.maxPolar;
  if (st.mode === 'hero') { controls.enabled = false; controls.enableZoom = false; }
  const heroCam = { ...HERO.start, t: new V3(0, CAM.emptyY, 0) };

  /** Hero mode: ease the camera toward the pose implied by scroll, pointer, explode, intro and selection. */
  function updateHero(dt: number, selection: THREE.Box3 | null): void {
    if (st.mode !== 'hero' || !st.L) return;
    const H = HERO, out = 1 - st.intro.k;
    const az = H.az.base + st.heroP * H.az.scroll + Math.sin(st.T * H.az.swaySpeed) * H.az.sway + st.ptr.x * H.az.pointer * hx + out * H.az.intro;
    const el = H.el.base - st.ptr.y * H.el.pointer + st.explodeG * H.el.explode + out * H.el.intro;
    let dist = H.dist.base * caseScale() * aspectK() * (1 + H.dist.explode * st.explodeG) * (1 + out * H.dist.intro);
    const tgt = homeTarget();
    if (selection && !selection.isEmpty()) { const c = selection.getCenter(new V3()); tgt.lerp(c, H.select.pull); dist *= H.select.dist; }
    const f = Math.min(1, dt * H.follow);
    heroCam.az += (az - heroCam.az) * f; heroCam.el += (el - heroCam.el) * f; heroCam.dist += (dist - heroCam.dist) * f; heroCam.t.lerp(tgt, f);
    camera.position.set(hx * Math.sin(heroCam.az) * Math.cos(heroCam.el), Math.sin(heroCam.el), Math.cos(heroCam.az) * Math.cos(heroCam.el)).multiplyScalar(heroCam.dist).add(heroCam.t);
    controls.target.copy(heroCam.t);
  }

  return {
    flyTo, focus, viewPose, studioIntro, aspectK, updateHero,
    dispose(): void { controls.removeEventListener('start', onCtlStart); controls.removeEventListener('end', onCtlEnd); },
  };
}
