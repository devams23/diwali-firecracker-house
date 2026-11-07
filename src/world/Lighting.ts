// Scene lighting for the night courtyard: a dim cool moon fill from the sky and a faint directional
// moonlight, both kept low so the diyas and the akash kandil carry the warm light. No shadow maps.
import * as THREE from 'three';
import { PALETTE } from '../core/palette';

/** Unit vector from the scene origin toward the moon; the sky draws the moon here and the key light comes from it. */
export const MOON_DIRECTION = new THREE.Vector3(0.45, 0.42, -0.8).normalize();

/** Adds the hemisphere fill and the moonlight directional to the scene. */
export function buildLighting(scene: THREE.Scene): void {
  // Sky colour is the cool moon tone, ground bounce is a dark warm earth.
  scene.add(new THREE.HemisphereLight(PALETTE.moon, 0x20140a, 0.28));

  const moon = new THREE.DirectionalLight(0x8fa3d0, 0.35);
  moon.position.copy(MOON_DIRECTION).multiplyScalar(40);
  scene.add(moon);
}
