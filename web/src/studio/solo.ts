// Solo product viewer: one part on a turntable, sized to the plinth.
import * as THREE from 'three';
import { V3 } from './materials';
import { DEFAULT_CASE, RAD_360, buildPart, computeLayout } from './model';
import { FLOOR_Y } from './stage';
import type { Builder } from './build';
import type { CameraRig } from './camera';
import type { SceneState, Vec3 } from './state';
import type { PartId, PartVis, SoloItem, StudioCat } from './types';

// ---------- tuning (prototype values) ----------
/** Categories laid flat to face the camera, plinth sizing, framing, turntable and interior light. */
const SOLO = {
  faceCamera: ['gpu', 'ssd', 'cpu', 'mobo', 'ram'] as StudioCat[],
  /** Quarter turn (the epsilon keeps the turntable's first frame from snapping the azimuth). */
  turn: -Math.PI / 2 + 0.0001,
  /** Gap between the part and the plinth top. */
  lift: 0.004,
  plinth: { radiusK: 1.15, min: 0.12 },
  /** Camera distance as a multiple of the fit-to-frustum distance; the fly-in starts `startK` times further out. */
  fit: 1.25, dir: [0.35, 0.32, 1] as Vec3, startK: 1.6, flightMs: 2000,
  spin: 0.9, zoom: { min: 0.4, max: 2.2 },
  inner: { offset: [0.2, 0.1, 0.25] as Vec3, distance: 1.4 },
  /** Mock-mount layouts: an AIO pump at the origin with its radiator above; DIMMs offset to sit centred. */
  aio: { socket: [0, 0, 0] as Vec3, rad: [-0.02, 0.24, -0.08] as Vec3 },
  ramZ: -0.075,
};

export function createSolo(st: SceneState, cam: CameraRig, builder: Builder) {
  const { S, kit } = st;
  const { camera, controls, root, inner, spot } = S;
  // Solo wrapper groups are left in root by the prototype (empty once their parts are removed); track them so they can be pruned.
  const soloGroups: THREE.Group[] = [];
  const prune = (): void => { for (let i = soloGroups.length - 1; i >= 0; i--) if (!soloGroups[i].children.length) { root.remove(soloGroups[i]); soloGroups.splice(i, 1); } };

  function show(cat: StudioCat, item: SoloItem): void {
    for (const id of Object.keys(st.parts) as PartId[]) st.removePart(id);
    const ids: PartId[] = cat === 'case' ? ['case', 'fans', 'glass'] : [cat];
    const vis: PartVis = item.vis || {};
    const mockCase = { vis: { ...DEFAULT_CASE, style: 'mesh', color: 'black' } satisfies PartVis };
    const lay = computeLayout({ case: cat === 'case' ? { vis } : mockCase, mobo: cat === 'mobo' ? { vis } : null });
    if (cat === 'cooler' && vis.type !== 'air') { lay.socket = new V3(...SOLO.aio.socket); lay.rad = new V3(...SOLO.aio.rad); lay.radLen = RAD_360; }
    if (cat === 'ram') lay.sz = SOLO.ramZ;
    const group = new THREE.Group();
    for (const id of ids) { const p = buildPart(id, kit, vis, lay); p.finalize(); p.fade = 0; p.fadeT = 1; st.parts[id] = p; group.add(p.group); }
    root.add(group);
    soloGroups.push(group);
    if (SOLO.faceCamera.includes(cat)) group.rotation.y = SOLO.turn;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group); const c = box.getCenter(new V3());
    group.position.set(-c.x, -box.min.y + SOLO.lift, -c.z);
    group.updateMatrixWorld(true);
    box.setFromObject(group); const sp = box.getBoundingSphere(new THREE.Sphere());
    S.sizePlinth(Math.max(sp.radius * SOLO.plinth.radiusK, SOLO.plinth.min)); root.position.y = FLOOR_Y;
    const dist = sp.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * SOLO.fit * cam.aspectK();
    const t = sp.center.clone().add(new V3(0, FLOOR_Y, 0));
    const dir = new V3(...SOLO.dir).normalize();
    controls.target.copy(t); camera.position.copy(t).addScaledVector(dir, dist * SOLO.startK);
    void cam.flyTo(t, t.clone().addScaledVector(dir, dist), SOLO.flightMs);
    controls.autoRotate = !st.reducedMotion; controls.autoRotateSpeed = SOLO.spin;
    controls.minDistance = dist * SOLO.zoom.min; controls.maxDistance = dist * SOLO.zoom.max;
    inner.position.copy(t).add(new V3(...SOLO.inner.offset)); inner.distance = SOLO.inner.distance;
    spot.target.position.copy(t);
    if (!st.built) { st.built = true; for (const id of ids) { const p = st.parts[id]; if (p) p.fade = 0; } builder.reveal(); }
    prune();
  }

  return { show };
}
