// "View in your room": the assembled build as a true-scale model (parts are modelled in metres).
// iOS Safari opens AR Quick Look with a USDZ export; WebXR browsers (Android Chrome) get an immersive-ar session with
// hit-test placement; everything else can download a GLB. Browser-only: every function touches DOM / WebGL.
import * as THREE from 'three';
import { TexCache, type Kit } from './materials';
import { CAT, ORDER, computeLayout, makePart } from './model';
import { BRAND_FALLBACK } from './palette';
import type { CableOpts, StudioBuild } from './types';

export type ArSupport = 'quicklook' | 'webxr' | 'download';

interface XrNavigator { xr?: { isSessionSupported(mode: string): Promise<boolean>; requestSession(mode: string, init: object): Promise<XRSession> } }

/** Best AR path this browser offers. */
export async function arSupport(): Promise<ArSupport> {
  if (typeof document === 'undefined') return 'download';
  if (document.createElement('a').relList.supports('ar')) return 'quicklook';
  const xr = (navigator as XrNavigator).xr;
  try { if (xr && (await xr.isSessionSupported('immersive-ar'))) return 'webxr'; } catch { /* treated as unsupported */ }
  return 'download';
}

/** The assembled build (no explode, no stage dressing), floor at y = 0 and centred on x/z. Caller disposes `tex`. */
export function buildArModel(build: StudioBuild, cables: CableOpts): { model: THREE.Group; tex: TexCache } {
  const tex = new TexCache();
  const kit: Kit = { tex, brand: { accent: BRAND_FALLBACK.accent, bg: BRAND_FALLBACK.bg.studio, mono: BRAND_FALLBACK.mono } };
  const lay = computeLayout(build);
  const model = new THREE.Group(); model.name = 'rigmy_build';
  for (const id of ORDER) {
    const cat = CAT[id];
    if (cat === 'cables') {
      if (!build.mobo) continue;
      const p = makePart('cables', kit, { ...cables, mobo: true, gpuVis: build.gpu ? build.gpu.vis : null }, lay);
      p.group.position.copy(p.base); model.add(p.group);
      continue;
    }
    const item = build[cat]; if (!item) continue;
    const p = makePart(id, kit, item.vis, lay);
    p.group.position.copy(p.base); model.add(p.group);
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group(); wrap.name = 'rigmy_ar';
  model.position.set(-c.x, -box.min.y, -c.z); wrap.add(model);
  return { model: wrap, tex };
}

export async function exportGlb(model: THREE.Object3D): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const out = await new GLTFExporter().parseAsync(model, { binary: true });
  return new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' });
}

export async function exportUsdz(model: THREE.Object3D): Promise<Blob> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
  const out = await new USDZExporter().parseAsync(model, { quickLookCompatible: true });
  return new Blob([out as BlobPart], { type: 'model/vnd.usdz+zip' });
}

/** Hand a file to the browser (download or, for USDZ with rel="ar", AR Quick Look). */
export function openBlob(blob: Blob, name: string, quickLook: boolean): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (quickLook) { a.rel = 'ar'; a.appendChild(document.createElement('img')); } else a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Reticle ring size (m) and how far one "rotate" press turns the model. */
const RETICLE = { inner: 0.09, outer: 0.11 }, TURN = Math.PI / 4;

/**
 * Immersive WebXR AR: a reticle follows the detected floor, tapping places (or moves) the build there at real size.
 * `overlay` is shown as the DOM overlay (exit / rotate buttons live there). Resolves when the session ends.
 */
export async function runWebXr(model: THREE.Object3D, overlay: HTMLElement, hooks: { onPlaced(placed: boolean): void; bindRotate(fn: () => void): void; bindExit(fn: () => void): void }): Promise<void> {
  const xr = (navigator as XrNavigator).xr;
  if (!xr) throw new Error('WebXR unavailable');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio); renderer.xr.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'none'; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(0.6, 2, 1); scene.add(sun);
  const camera = new THREE.PerspectiveCamera();

  const reticle = new THREE.Mesh(new THREE.RingGeometry(RETICLE.inner, RETICLE.outer, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: BRAND_FALLBACK.accent }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  model.visible = false; scene.add(model);

  await renderer.xr.setSession(session);
  const viewer = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource?.({ space: viewer });
  const local = renderer.xr.getReferenceSpace();

  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    reticle.matrix.decompose(model.position, new THREE.Quaternion(), new THREE.Vector3());
    model.visible = true; hooks.onPlaced(true);
  });
  hooks.bindRotate(() => { model.rotation.y += TURN; });
  hooks.bindExit(() => { void session.end(); });

  renderer.setAnimationLoop((_t, frame) => {
    if (frame && hitSource && local) {
      const hit = frame.getHitTestResults(hitSource)[0];
      const pose = hit?.getPose(local);
      reticle.visible = !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    }
    renderer.render(scene, camera);
  });

  await new Promise<void>((resolve) => session.addEventListener('end', () => resolve(), { once: true }));
  renderer.setAnimationLoop(null);
  hitSource?.cancel();
  pmrem.dispose(); room.dispose(); scene.environment?.dispose();
  reticle.geometry.dispose(); (reticle.material as THREE.Material).dispose();
  renderer.dispose(); renderer.domElement.remove();
  hooks.onPlaced(false);
}
