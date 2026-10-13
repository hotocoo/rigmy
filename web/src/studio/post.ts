// Post-processing chain: NaN guard → bloom → output (tone map / sRGB) → chromatic fringe, vignette and grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { U } from './atmosphere';

/** Post-processing: MSAA samples on the half-float target, bloom (strength, radius, threshold) and its base resolution. */
const POST = { samples: 4, bloom: { strength: 0.32, radius: 0.4, threshold: 0.92, res: 512 } };


export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: POST.samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (c.r != c.r || c.g != c.g || c.b != c.b) c.rgb = vec3(0.0); c.rgb = clamp(c.rgb, 0.0, 5.0); gl_FragColor = c; }' }));
  const bl = POST.bloom;
  const bloomP = new UnrealBloomPass(new THREE.Vector2(bl.res, bl.res), bl.strength, bl.radius, bl.threshold); composer.addPass(bloomP);
  const output = new OutputPass();
  composer.addPass(output);
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } void main(){ vec2 dc = vUv - 0.5; vec2 off = dc * dot(dc, dc) * 0.014; vec4 c = texture2D(tDiffuse, vUv); c.r = texture2D(tDiffuse, vUv + off).r; c.b = texture2D(tDiffuse, vUv - off).b; float v = smoothstep(0.86, 0.22, length(vUv - 0.5)); c.rgb *= mix(0.66, 1.0, v); c.rgb += (h(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.016; gl_FragColor = c; }',
  });
  composer.addPass(fin);
  const finU = fin.uniforms as { uTime: U<number>; uRes: U<THREE.Vector2> };


  return {
    setSize(w: number, h: number): void { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); finU.uRes.value.set(w, h); },
    /** Toggle the costly passes (bloom, chromatic/vignette/grain); the NaN guard and output pass always run. */
    setEffects(on: boolean): void { bloomP.enabled = on; fin.enabled = on; },
    /** Toggle multisampling on the composer's targets (they reallocate on next use). */
    setMsaa(on: boolean): void {
      const samples = on ? POST.samples : 0;
      for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples !== samples) { t.samples = samples; t.dispose(); }
    },
    /** Every material the passes own (for shader warm-up). */
    materials(): THREE.Material[] {
      const out = new Set<THREE.Material>();
      for (const p of composer.passes) for (const v of Object.values(p) as unknown[]) {
        for (const m of Array.isArray(v) ? v : [v]) if (m instanceof THREE.Material) out.add(m);
      }
      return [...out];
    },
    /** OutputPass picks its defines (tone mapping, sRGB) on first render, compiling then. Run it once into a 1×1
     *  target so that compile happens during warm-up rather than in the first visible frame. */
    primeOutput(): void {
      const scratch = new THREE.WebGLRenderTarget(1, 1);
      const prev = renderer.getRenderTarget();
      try { output.render(renderer, scratch, composer.renderTarget1, 0, false); } finally { renderer.setRenderTarget(prev); scratch.dispose(); }
    },
    /** The target the scene is rendered into (programs compiled for it match the real render). */
    sceneTarget: composer.renderTarget1,
    render(dt: number): void { finU.uTime.value += dt; composer.render(dt); },
    dispose(): void { for (const p of composer.passes) p.dispose(); composer.dispose(); rt.dispose(); },
  };
}
