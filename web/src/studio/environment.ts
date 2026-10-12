// Procedural studio environment: a dark dome with softboxes, baked into a PMREM texture for image-based lighting.
import * as THREE from 'three';
import { ENV_COLOR } from './palette';
import { disposeTree } from './materials';

/** Procedural environment: dome radius, PMREM blur and softboxes [width, height, x, y, z] (colours in palette.ts). */
const ENV = {
  domeRadius: 20, domeSegments: [32, 16] as const, pmremSigma: 0.015,
  boxes: {
    top: [7, 3.5, 0.5, 9, 1.5], left: [1.4, 8, -8, 2.5, 3], right: [1.1, 8, 8, 2, -2.5],
    back: [9, 0.6, 0, 1.4, -9], front: [6, 0.4, 3, 0.8, 8.5], floor: [14, 6, 0, -4, 0],
  } satisfies Record<Exclude<keyof typeof ENV_COLOR, 'dome'>, [number, number, number, number, number]>,
};

/** Bake the environment map (`size`: PMREM face size). The bake is GPU work queued without waiting. */
export function bakeEnvironment(renderer: THREE.WebGLRenderer, accent: number, size: number): THREE.Texture {
  const env = new THREE.Scene();
  const [ws, hs] = ENV.domeSegments;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(ENV.domeRadius, ws, hs), new THREE.MeshBasicMaterial({ color: ENV_COLOR.dome, side: THREE.BackSide })));
  for (const name of Object.keys(ENV.boxes) as (keyof typeof ENV.boxes)[]) {
    const [w, h, x, y, z] = ENV.boxes[name], [c, k] = ENV_COLOR[name];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c === 'accent' ? accent : c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const baked = pm.fromScene(env, ENV.pmremSigma, undefined, undefined, { size }).texture;
  pm.dispose();
  disposeTree(env);
  return baked;
}
