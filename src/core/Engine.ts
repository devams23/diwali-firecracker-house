// Owns the three.js renderer, scene, camera and post-processing chain, and drives a
// fixed-order update loop for every registered Updatable system.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { viewport } from './viewport';

/** Anything that needs per-frame updates; dt is seconds (clamped), t is total elapsed seconds. */
export interface Updatable {
  update(dt: number, t: number): void;
}

/** Largest frame step fed to systems, so a tab switch does not teleport physics or fireworks. */
const MAX_DT = 0.05;
/** Violet dusk for the sky fog and background: a festive evening glow, so distant things melt into purple rather than black. */
const NIGHT_FOG = 0x2a1650;

/** Rendering core: renderer, scene, camera, bloom composer and the frame loop. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  private readonly container: HTMLElement;
  private readonly updatables = new Set<Updatable>();
  private readonly clock = new THREE.Clock();
  private elapsed = 0;

  /** Builds the renderer and post chain inside the container and wires resize handling. */
  constructor(container: HTMLElement) {
    this.container = container;
    const { width, height } = this.size();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Cap pixel ratio at 2: beyond that bloom cost grows much faster than visible gain.
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    // Shadows are off for performance; the diyas provide fake local light instead.
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NIGHT_FOG);
    this.scene.fog = new THREE.FogExp2(NIGHT_FOG, 0.006);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.05, 400);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.35, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.syncViewport();
    window.addEventListener('resize', () => this.resize());
  }

  /** Registers a system to receive update(dt, t) every frame. */
  add(u: Updatable): void {
    this.updatables.add(u);
  }

  /** Unregisters a system previously added with add(). */
  remove(u: Updatable): void {
    this.updatables.delete(u);
  }

  /** Starts the render loop; each frame updates all systems then renders through the composer. */
  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), MAX_DT);
      this.elapsed += dt;
      for (const u of this.updatables) u.update(dt, this.elapsed);
      this.composer.render();
    });
  }

  /**
   * Fast-forwards every system by `seconds` without rendering, in fixed 1/30 s slices, as if that many frames had run.
   * Debug and test use only: software WebGL draws too slowly to wait out a fuse or a climb in real time.
   */
  advance(seconds: number): void {
    const step = 1 / 30;
    for (let t = 0; t < seconds; t += step) {
      this.elapsed += step;
      for (const u of this.updatables) u.update(step, this.elapsed);
    }
  }

  /** Copies the device-pixel scale of the current view into the shared viewport. */
  private syncViewport(): void {
    viewport.pixelRatio = Math.min(window.devicePixelRatio, 2);
    viewport.pxPerMetre =
      this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  private size(): { width: number; height: number } {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    return { width, height };
  }

  private resize(): void {
    const { width, height } = this.size();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.syncViewport();
  }
}
