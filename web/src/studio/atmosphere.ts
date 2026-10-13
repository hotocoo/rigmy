// Atmosphere: floating dust motes lit inside the spot cone, and the volumetric light cone under the spot.
import * as THREE from 'three';
import { V3 } from './materials';
import { SCENE_COLOR } from './palette';
import type { StudioMode } from './types';

export type U<T> = { value: T };

/** Dust motes: strength per mode (0 with reduced motion), count, and the cylinder they fill. */
const DUST = { k: { hero: 1, studio: 0.45, solo: 0.55 } satisfies Record<StudioMode, number>, count: { solo: 320, other: 900 }, radius: 1.1, height: 1.3, renderOrder: 5 };
/** Volumetric cone under the spot: length, tip radius, base radius relative to the spot angle, segments. */
const CONE = { length: 2.7, tip: 0.01, spread: 0.8, segments: 64, renderOrder: 6 };
/** Shared GLSL value noise + fbm (backdrop dome, light cone). */
export const NOISE_GL = 'float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1,113.7,47.3)))*43758.5453); } float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); } float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }';

/** Dust points (hidden with reduced motion). `DUSTK` is the strength the reveal fades `uK` up to. */
export function createDust(scene: THREE.Scene, MODE: StudioMode, reducedMotion: boolean) {
  const DUSTK = reducedMotion ? 0 : DUST.k[MODE];
  const DUST_N = MODE === 'solo' ? DUST.count.solo : DUST.count.other;
  const dustGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(DUST_N * 3), sd = new Float32Array(DUST_N);
    for (let i = 0; i < DUST_N; i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * DUST.radius; pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.random() * DUST.height; pos[i * 3 + 2] = Math.sin(a) * rr; sd[i] = Math.random(); }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
  }
  const dustMat = new THREE.ShaderMaterial({
    name: 'dust', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uColor: { value: new THREE.Color(SCENE_COLOR.dust) }, uSpot: { value: new V3() }, uDir: { value: new V3(0, -1, 0) }, uScale: { value: 1 } },
    vertexShader: 'attribute float seed; uniform float uTime; uniform vec3 uSpot; uniform vec3 uDir; uniform float uScale; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y + uTime * (0.008 + seed * 0.018), 1.3); p.x += sin(uTime * 0.13 + seed * 40.0) * 0.06; p.z += cos(uTime * 0.11 + seed * 31.0) * 0.06; vec4 wp = modelMatrix * vec4(p, 1.0); vec3 v = wp.xyz - uSpot; float al = dot(v, uDir); float rad = length(v - uDir * al) / max(al * 0.44, 0.01); float inCone = smoothstep(1.0, 0.25, rad) * step(0.0, al); float tw = 0.5 + 0.5 * sin(uTime * (0.8 + seed * 2.2) + seed * 60.0); vA = (0.1 + inCone * 0.9) * (0.35 + 0.65 * tw) * smoothstep(0.0, 0.12, p.y) * smoothstep(1.3, 1.05, p.y); vec4 mv = viewMatrix * wp; gl_PointSize = (0.8 + seed * 2.4) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uK; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a * vA * uK * 0.7; gl_FragColor = vec4(uColor * a, a); }',
  });
  const dustU = dustMat.uniforms as { uTime: U<number>; uK: U<number>; uColor: U<THREE.Color>; uSpot: U<THREE.Vector3>; uDir: U<THREE.Vector3>; uScale: U<number> };
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = DUST.renderOrder; dust.visible = !reducedMotion; scene.add(dust);

  /** Draw only this fraction of the motes (adaptive quality). */
  const setFraction = (f: number): void => { dustGeo.setDrawRange(0, Math.round(DUST_N * f)); };
  return { dustU, DUSTK, setFraction };
}

/** Cone mesh hanging from the spot (positioned/aimed each frame); `spotAngle` sets its spread. */
export function createCone(scene: THREE.Scene, spotAngle: number) {
  const CONE_L = CONE.length;
  const coneGeo = new THREE.CylinderGeometry(CONE.tip, CONE_L * Math.tan(spotAngle) * CONE.spread, CONE_L, CONE.segments, 1, true); coneGeo.translate(0, -CONE_L / 2, 0);
  const coneMat = new THREE.ShaderMaterial({
    name: 'light_cone', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(SCENE_COLOR.cone) }, uTime: { value: 0 } },
    vertexShader: 'varying float vL; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vL = -position.y / ' + CONE_L.toFixed(2) + '; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uK; uniform vec3 uColor; uniform float uTime; varying float vL; varying vec3 vN; varying vec3 vV; varying vec3 vW; ' + NOISE_GL + ' void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, 2.6); float fall = pow(1.0 - clamp(vL, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.1, vL); float fl = smoothstep(0.0, 0.3, vW.y); float n = 0.65 + 0.35 * fbm(vW * 3.0 + vec3(0.0, -uTime * 0.05, uTime * 0.03)); float a = edge * fall * fl * n * uK * 0.055; gl_FragColor = vec4(uColor * a, a); }',
  });
  const coneU = coneMat.uniforms as { uK: U<number>; uColor: U<THREE.Color>; uTime: U<number> };
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.renderOrder = CONE.renderOrder; cone.frustumCulled = false; scene.add(cone);

  return { coneU, cone };
}
