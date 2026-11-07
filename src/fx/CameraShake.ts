// Trauma-based camera shake: impacts add trauma, which decays over time and drives a small rotational
// wobble. It adds an offset to the camera's rotation each frame, so it must run after whatever system
// rewrites the rotation (the first-person controller does) and never accumulates across frames.
import type * as THREE from 'three';

const DECAY_PER_SECOND = 1.4;
const MAX_ANGLE = 0.06;

/** Smooth deterministic noise in [-1, 1] built from sines, so shake needs no per-frame allocation. */
function noise(x: number, seed: number): number {
  return 0.6 * Math.sin(x + seed) + 0.4 * Math.sin(x * 2.37 + seed * 1.7);
}

/** Holds a shake "trauma" value and applies squared-trauma rotational noise to a camera. */
export class CameraShake {
  private trauma = 0;

  /** Adds trauma (clamped to a maximum of 1); bigger impacts shake harder for longer. */
  add(trauma: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, trauma));
  }

  /** Decays trauma by dt and offsets the camera rotation by the current shake amount. */
  apply(camera: THREE.Camera, dt: number, t: number): void {
    this.trauma = Math.max(0, this.trauma - DECAY_PER_SECOND * dt);
    if (this.trauma <= 0) return;
    // Squaring makes small trauma nearly invisible and large trauma strong, which reads as impact.
    const amount = this.trauma * this.trauma * MAX_ANGLE;
    camera.rotation.x += amount * noise(t * 13.1, 0.0);
    camera.rotation.y += amount * noise(t * 11.7, 3.1);
    camera.rotation.z += amount * 0.5 * noise(t * 9.3, 7.7);
  }
}
