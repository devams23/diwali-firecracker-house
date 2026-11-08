// Builds the aangan courtyard: beaten-earth ground, lime-and-geru mud walls on the east, west and
// south sides with slightly uneven faces, a 1.6 m gate with open wooden leaves, wall niches and the
// diya spots along the wall tops. Walls and the gate blocker are registered as collision boxes.
import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import { tile, type Textures } from './textures';

export const WALL_H = 2.0;
export const WALL_T = 0.35;
/** Inner face of the east and west walls (metres from the centre line). */
export const INNER_X = 9;
/** Inner face of the south (gate) wall. */
export const SOUTH_INNER_Z = 7;
/** The side walls run up to the house front, so the house closes the courtyard on the north. */
const NORTH_Z = -8.6;
const OUTER_Z = SOUTH_INNER_Z + WALL_T;
export const GATE_HALF = 0.8;
/** Max displacement of a wall face in metres; enough to read as hand-built, not visible as a bug. */
const JITTER = 0.03;
/** Lift for anything set on a jittered wall face: the largest jitter plus 1 cm, so it never sinks into the plaster. */
export const FACE_CLEARANCE = JITTER + 0.01;
export const DIYA_SPACING = 1.2;
const NICHES_PER_WALL = 6;

/** Axis-aligned wall piece in world space. */
interface Span {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Lime-and-geru plaster material; `rx` repeats the texture along the wall's length. */
export function plasterMaterial(tex: Textures, rx: number): THREE.MeshStandardMaterial {
  const map = tile(tex.plaster, rx, 1);
  return new THREE.MeshStandardMaterial({
    map,
    // A warm lime-wash tint over the texture, plus a self-lit copy of it, so walls glow in the festive light.
    color: 0xfff0dc,
    emissive: 0xffb878,
    emissiveMap: map,
    emissiveIntensity: 0.32,
    roughness: 0.92,
    metalness: 0,
  });
}

/** Saffron and indigo festive paint for the wall bands; emissive so they read at night without extra lights. */
const BAND_SAFFRON = new THREE.MeshStandardMaterial({
  color: 0xff9a1e,
  emissive: 0xff7a10,
  emissiveIntensity: 0.55,
  roughness: 0.85,
});
const BAND_INDIGO = new THREE.MeshStandardMaterial({
  color: 0x3a4fc0,
  emissive: 0x2a3ca8,
  emissiveIntensity: 0.5,
  roughness: 0.85,
});

/** Wood material for doors, posts and the takht; `color` tints the texture when a darker board is needed. */
export function woodMaterial(
  tex: Textures,
  rx: number,
  ry: number,
  color = 0xffffff,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tile(tex.wood, rx, ry),
    color,
    roughness: 0.9,
    metalness: 0,
  });
}

/** Deterministic pseudo-random in [-1, 1] keyed on a local position, so shared corners move together. */
function noise3(x: number, y: number, z: number, salt: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 4.1) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/** Box mesh whose faces are subdivided and nudged by up to JITTER, so no wall is perfectly flat. */
export function jitteredBox(
  w: number,
  h: number,
  d: number,
  segs: [number, number, number],
  mat: THREE.Material,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d, segs[0], segs[1], segs[2]);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // The base stays on the ground; the top is nudged less so the coping line still reads level.
    const onBase = y < -h / 2 + 1e-6;
    p.setXYZ(
      i,
      x + noise3(x, y, z, 1) * JITTER,
      onBase ? y : y + noise3(x, y, z, 2) * JITTER * 0.5,
      z + noise3(x, y, z, 3) * JITTER,
    );
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Adds one plaster wall piece; full-height pieces get a lime coping cap along their top. */
function addWall(scene: THREE.Scene, tex: Textures, s: Span, coping: boolean): void {
  const w = s.maxX - s.minX;
  const h = s.maxY - s.minY;
  const d = s.maxZ - s.minZ;
  const segs: [number, number, number] = [
    Math.max(1, Math.round(w / 0.5)),
    6,
    Math.max(1, Math.round(d / 0.5)),
  ];
  const mat = plasterMaterial(tex, Math.max(w, d) / 2.4);
  const mesh = jitteredBox(w, h, d, segs, mat);
  mesh.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
  scene.add(mesh);
  if (coping) {
    // Painted bands run the wall's length: indigo near the foot and saffron just under the coping. They stand 4 cm
    // proud of the jittered faces so the paint never sinks into the plaster.
    const long = w >= d;
    for (const [band, y, bandH] of [
      [BAND_INDIGO, s.minY + 0.24, 0.16],
      [BAND_SAFFRON, s.maxY - 0.2, 0.12],
    ] as const) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(long ? w + 0.02 : w + 0.08, bandH, long ? d + 0.08 : d + 0.02),
        band,
      );
      strip.position.set((s.minX + s.maxX) / 2, y, (s.minZ + s.maxZ) / 2);
      scene.add(strip);
    }
    // Coping overlaps the wall top slightly so a jittered top never shows a gap.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.1, d + 0.1), mat);
    cap.position.set((s.minX + s.maxX) / 2, s.maxY + 0.03, (s.minZ + s.maxZ) / 2);
    scene.add(cap);
  }
}

/**
 * Adds a niche (aala) on a side wall: a flat, dark, soot-stained panel standing proud of the face,
 * framed by a sill and lintel. It is a plane, not a cut, so it is lifted by FACE_CLEARANCE to stay
 * clear of the wall jitter. Returns the niche's diya spot.
 */
function addNiche(
  scene: THREE.Scene,
  mat: THREE.Material,
  faceX: number,
  inward: number,
  z: number,
): THREE.Vector3 {
  const recess = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.95, metalness: 0 }),
  );
  recess.position.set(faceX + inward * FACE_CLEARANCE, 1.15, z);
  recess.rotation.y = (inward * Math.PI) / 2;
  scene.add(recess);

  // Sill and lintel frame the opening so it reads as cut into the mud.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.46), mat);
  sill.position.set(faceX + inward * 0.05, 0.885, z);
  scene.add(sill);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.46), mat);
  lintel.position.set(faceX + inward * 0.05, 1.43, z);
  scene.add(lintel);

  return new THREE.Vector3(faceX + inward * 0.09, 0.93, z);
}

/** Adds one wooden gate leaf hinged at `hingeX`, swung open by `swing` radians (outward). */
function addGateLeaf(
  scene: THREE.Scene,
  mat: THREE.Material,
  hingeX: number,
  side: 1 | -1,
  swing: number,
): void {
  // The pivot sits on the wall centre line so the leaf swings out past the wall face.
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, 0, SOUTH_INNER_Z + WALL_T / 2);
  pivot.rotation.y = swing;
  scene.add(pivot);

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.8, 0.05), mat);
  board.position.set(side * 0.39, 0.9, 0);
  pivot.add(board);
  // Two ledger battens on the outer face, the usual look of a village plank door.
  for (const y of [0.3, 1.5]) {
    const batten = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.035), mat);
    batten.position.set(side * 0.39, y, 0.04);
    pivot.add(batten);
  }
}

/** Builds the courtyard into the scene, registers its collisions, and returns the diya spots. */
export function buildAangan(
  scene: THREE.Scene,
  world: CollisionWorld,
  tex: Textures,
): { diyaSpots: THREE.Vector3[] } {
  // Ground: beaten earth over a 60 m plot; the repeat keeps the mottling fine up close. A clone
  // carries its own repeat, so the shared earth texture is left untouched for other surfaces.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: tile(tex.earth, 12, 12), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Walls: east, west and south (split around the gate). Each is also a collision box.
  const spans: Span[] = [
    { minX: INNER_X, maxX: INNER_X + WALL_T, minY: 0, maxY: WALL_H, minZ: NORTH_Z, maxZ: OUTER_Z },
    {
      minX: -INNER_X - WALL_T,
      maxX: -INNER_X,
      minY: 0,
      maxY: WALL_H,
      minZ: NORTH_Z,
      maxZ: OUTER_Z,
    },
    {
      minX: -INNER_X - WALL_T,
      maxX: -GATE_HALF,
      minY: 0,
      maxY: WALL_H,
      minZ: SOUTH_INNER_Z,
      maxZ: OUTER_Z,
    },
    {
      minX: GATE_HALF,
      maxX: INNER_X + WALL_T,
      minY: 0,
      maxY: WALL_H,
      minZ: SOUTH_INNER_Z,
      maxZ: OUTER_Z,
    },
  ];
  for (const s of spans) {
    addWall(scene, tex, s, true);
    world.addBox({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ });
  }

  // Gate: a 1.6 m opening with a lintel above it. The opening stays visibly open; a blocker across
  // its depth, starting 0.1 m inside the courtyard face, keeps the player in the courtyard.
  const gateMat = woodMaterial(tex, 1.5, 1);
  addWall(
    scene,
    tex,
    { minX: -GATE_HALF, maxX: GATE_HALF, minY: 1.8, maxY: WALL_H, minZ: SOUTH_INNER_Z, maxZ: OUTER_Z },
    false,
  );
  addGateLeaf(scene, gateMat, -GATE_HALF, 1, -1.2);
  addGateLeaf(scene, gateMat, GATE_HALF, -1, 1.2);
  world.addBox({ minX: -GATE_HALF, maxX: GATE_HALF, minZ: 7.1, maxZ: OUTER_Z });

  // Niches: six per side wall, evenly spaced, each with a diya spot.
  const diyaSpots: THREE.Vector3[] = [];
  const niche = plasterMaterial(tex, 1);
  for (let i = 0; i < NICHES_PER_WALL; i++) {
    const z = -5.5 + i * 2.2;
    diyaSpots.push(addNiche(scene, niche, INNER_X, -1, z));
    diyaSpots.push(addNiche(scene, niche, -INNER_X, 1, z));
  }

  // Diyas along the wall tops every 1.2 m; the south wall skips the gate.
  const topY = WALL_H + 0.12;
  const sideX = INNER_X + WALL_T / 2;
  for (let i = 0; i < 12; i++) {
    const z = -6.6 + i * DIYA_SPACING;
    diyaSpots.push(new THREE.Vector3(sideX, topY, z));
    diyaSpots.push(new THREE.Vector3(-sideX, topY, z));
  }
  const southZ = SOUTH_INNER_Z + WALL_T / 2;
  for (let i = 0; i < 15; i++) {
    const x = -8.4 + i * DIYA_SPACING;
    if (Math.abs(x) < GATE_HALF + 0.6) continue;
    diyaSpots.push(new THREE.Vector3(x, topY, southZ));
  }

  return { diyaSpots };
}

