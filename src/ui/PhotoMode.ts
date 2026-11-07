// Photo mode: P hides the HUD and the hands, adds a soft vignette and a warm grade to the final frame, and shows
// a small hint. K saves the current frame as a PNG named diwali-<timestamp>.png. The grade is one ShaderPass
// inserted before the composer's OutputPass, so it works in linear light and the tone mapping still runs after it.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { Engine, Updatable } from '../core/Engine';
import type { Input } from '../core/Input';

/** Strength of the vignette and warm grade while photo mode is on, from 0 (none) to 1 (strong). */
const GRADE_STRENGTH = 0.6;
/** Text shown in the hint while photo mode is on. */
const HINT_TEXT = 'P — exit · K — save photo';

/** Vignette and warm grade in linear light: darkens the corners and lifts the centre toward gold. */
const VignetteGrade = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: GRADE_STRENGTH },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float r = length((vUv - 0.5) * vec2(1.0, 0.8));
      float vig = 1.0 - strength * smoothstep(0.3, 0.85, r);
      vec3 warm = mix(vec3(1.0), vec3(1.08, 1.0, 0.86), strength);
      gl_FragColor = vec4(c.rgb * vig * warm, c.a);
    }
  `,
};

/**
 * Photo mode, toggled with P. While it is on the HUD and the hands are hidden, the vignette and warm grade run on
 * the final frame, and K writes the frame out as a PNG download.
 */
export class PhotoMode implements Updatable {
  private active = false;
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly ui: HTMLElement;
  private readonly hidden: THREE.Object3D[];
  private readonly pass: ShaderPass;
  private readonly hint: HTMLElement;

  /**
   * Adds the grade pass before the output pass and creates the hint. `hidden` lists the objects (the hands) that
   * disappear while photo mode is on.
   */
  constructor(engine: Engine, input: Input, ui: HTMLElement, hidden: THREE.Object3D[]) {
    this.engine = engine;
    this.input = input;
    this.ui = ui;
    this.hidden = hidden;

    this.pass = new ShaderPass(VignetteGrade);
    this.pass.enabled = false;
    const composer = engine.composer;
    composer.insertPass(this.pass, composer.passes.length - 1);

    this.hint = document.createElement('div');
    this.hint.textContent = HINT_TEXT;
    this.hint.setAttribute('aria-live', 'polite');
    this.hint.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:none;' +
      'color:#ffe2a0;font:600 14px/1.2 system-ui,sans-serif;letter-spacing:0.04em;' +
      'text-shadow:0 1px 3px #0a0712;pointer-events:none;z-index:50;';
    document.body.appendChild(this.hint);
  }

  /** Whether photo mode is currently on. */
  get isActive(): boolean {
    return this.active;
  }

  /** Reads P and K for this frame: P flips photo mode, and K saves a frame while it is on. */
  update(): void {
    if (this.input.pressed('KeyP')) this.setActive(!this.active);
    if (this.active && this.input.pressed('KeyK')) this.savePhoto();
  }

  /** Turns photo mode on or off: shows or hides the HUD, the hands, the grade and the hint. */
  private setActive(on: boolean): void {
    this.active = on;
    this.pass.enabled = on;
    this.ui.style.display = on ? 'none' : '';
    for (const o of this.hidden) o.visible = !on;
    this.hint.style.display = on ? 'block' : 'none';
  }

  /**
   * Renders the frame now and writes it out as a PNG. The canvas is read in the same task as the render, because the
   * drawing buffer is cleared after each frame is shown. toBlob takes its snapshot when it is called.
   */
  private savePhoto(): void {
    this.engine.composer.render();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `diwali-${stamp}.png`;
    this.engine.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}
