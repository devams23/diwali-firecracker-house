// Placed-cracker marker: makes a cracker standing on the courtyard floor easy to spot at night. A warm marigold
// ring glows on the ground under it, and a soft halo lifts the cracker itself, both breathing gently. They show
// only while the cracker waits to be lit; once the fuse is lit the effects take over and the marker vanishes.
import * as THREE from 'three';

/** Per-kind size multiplier for crackers set on the ground, so small ones read clearly from standing height. */
export const GROUND_SCALE: Partial<Record<string, number>> = {
  anar: 1.7,
  chakri: 1.9,
  laxmi: 1.8,
  sutli: 1.7,
  saanp: 2.6,
  rocket: 1.4,
  ladi: 1.4,
  skyshot: 1.5,
};

/** Ring radius (m) in the cracker's local space before its ground scale. */
const RING_RADIUS = 0.26;
/** Breathing speed of the marker (radians per second) and its opacity range. */
const PULSE_RATE = 2.2;
const RING_OPACITY = 0.75;
const HALO_OPACITY = 0.32;

/** Draws a soft ring (bright band with feathered edges) and a filled radial glow into one canvas each, once. */
function makeTexture(kind: 'ring' | 'halo'): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (kind === 'ring') {
    // Clear centre, a marigold band two-thirds out, fading to nothing at the edge.
    grad.addColorStop(0, 'rgba(255,170,60,0.12)');
    grad.addColorStop(0.5, 'rgba(255,170,60,0.25)');
    grad.addColorStop(0.72, 'rgba(255,200,90,1)');
    grad.addColorStop(0.82, 'rgba(255,140,40,0.6)');
    grad.addColorStop(1, 'rgba(255,120,30,0)');
  } else {
    // Warm radial glow, strongest at the centre.
    grad.addColorStop(0, 'rgba(255,220,150,0.9)');
    grad.addColorStop(0.4, 'rgba(255,170,80,0.35)');
    grad.addColorStop(1, 'rgba(255,140,60,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Shared materials, built on first use; every marker reuses them (opacity is set per draw, see below). */
let ringMat: THREE.MeshBasicMaterial | null = null;
let haloMat: THREE.SpriteMaterial | null = null;

/** Additive, unlit and depth-write free, so the glow blends over the floor without hiding anything. */
function materials(): { ring: THREE.MeshBasicMaterial; halo: THREE.SpriteMaterial } {
  ringMat ??= new THREE.MeshBasicMaterial({
    map: makeTexture('ring'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  haloMat ??= new THREE.SpriteMaterial({
    map: makeTexture('halo'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { ring: ringMat, halo: haloMat };
}

/** Never hit by the crosshair or placement rays; the pick proxy handles aiming. */
const noRaycast = (): void => {};

/**
 * Adds the ground ring and halo under `root` (the cracker's model). `isIdle` is asked every frame; while it is
 * false (fuse lit, burning or done) both parts are skipped. The pulse is driven from the draw callback, so the
 * marker needs no update call from the game loop.
 */
export function addPlacedMarker(root: THREE.Object3D, height: number, isIdle: () => boolean): void {
  const { ring, halo } = materials();

  // Ground ring: a flat plane a hair above the floor to avoid z-fighting.
  const ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(RING_RADIUS * 2, RING_RADIUS * 2), ring);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.006;
  ringMesh.renderOrder = 2;
  ringMesh.name = 'placedMarker';
  ringMesh.raycast = noRaycast;

  // Halo: a camera-facing glow around the cracker's middle, so the body itself reads as lit.
  const haloSprite = new THREE.Sprite(halo);
  haloSprite.scale.setScalar(Math.max(0.35, height * 1.6));
  haloSprite.position.y = height * 0.5;
  haloSprite.name = 'placedHalo';
  haloSprite.raycast = noRaycast;

  // Shared materials mean opacity must be set right before each draw, from this marker's own phase.
  const phase = Math.random() * Math.PI * 2;
  const pulse = (): number => 0.75 + 0.25 * Math.sin(performance.now() * 0.001 * PULSE_RATE + phase);
  ringMesh.onBeforeRender = () => {
    ring.opacity = RING_OPACITY * pulse();
  };
  haloSprite.onBeforeRender = () => {
    halo.opacity = HALO_OPACITY * pulse();
  };
  // Hide both once the cracker is lit; checked on the ring's draw so it costs nothing extra per frame.
  ringMesh.onAfterRender = () => {
    if (!isIdle()) {
      ringMesh.visible = false;
      haloSprite.visible = false;
    }
  };

  root.add(ringMesh, haloSprite);
}
