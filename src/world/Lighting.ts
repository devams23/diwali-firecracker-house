// Scene lighting for the night courtyard: a dim cool moon fill from the sky and a faint directional
// moonlight, both kept low so the diyas and the akash kandil carry the warm light. No shadow maps.
import * as THREE from 'three';

/** Unit vector from the scene origin toward the moon; the sky draws the moon here and the key light comes from it. */
export const MOON_DIRECTION = new THREE.Vector3(0.45, 0.42, -0.8).normalize();

/** Hemisphere sky tone: a lit indigo that fills the courtyard from above. */
const HEMI_SKY = 0xa592e6;
/** Hemisphere ground bounce: warm earth, so the lower walls and floor carry lamp colour. */
const HEMI_GROUND = 0x9a5a30;

/** Adds the hemisphere fill and the moonlight directional to the scene. */
export function buildLighting(scene: THREE.Scene): void {
  // Sky colour is the cool moon tone, ground bounce is a dark warm earth.
  scene.add(new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, 1.6));

  const moon = new THREE.DirectionalLight(0xb4b4f0, 1.0);
  moon.position.copy(MOON_DIRECTION).multiplyScalar(40);
  scene.add(moon);
}
