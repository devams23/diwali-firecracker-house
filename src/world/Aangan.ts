// Builds the aangan courtyard: beaten-earth ground, lime-and-geru mud walls on the east, west and
// south sides with slightly uneven faces, a 1.6 m gate with open wooden leaves, wall niches and the
// diya spots along the wall tops. Walls and the gate blocker are registered as collision boxes.
import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import { tile, type Textures } from './textures';

/** Boundary parapet height: low enough (eye is 1.6 m) that the player sees over it into the village. */
export const WALL_H = 1.15;
/** Height of the gate pillars and the wall pilasters that carry the jhalar. */
export const POST_H = 2.7;
export const WALL_T = 0.35;
/** Inner face of the east and west walls (metres from the centre line). */
export const INNER_X = 13;
/** Inner face of the south (gate) wall. */
export const SOUTH_INNER_Z = 12;
/** The side walls run up to the house front, so the house closes the courtyard on the north. */
export const NORTH_Z = -8.6;
/** Half-width of the house body; the north return walls run from here out to the side walls. */
const HOUSE_HALF = 9;
/** Spacing of the wall pilasters along the boundary, in metres. */
export const POST_SPACING = 4;
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
    emissiveIntensity: 0.12,
    roughness: 0.92,
    metalness: 0,
  });
}

/** Saffron and indigo festive paint for the wall bands; emissive so they read at night without extra lights. */
const BAND_SAFFRON = new THREE.MeshStandardMaterial({
  color: 0xff9a1e,
  emissive: 0xff7a10,
  emissiveIntensity: 0.3,
  roughness: 0.85,
});
const BAND_INDIGO = new THREE.MeshStandardMaterial({
  color: 0x3a4fc0,
  emissive: 0x2a3ca8,
  emissiveIntensity: 0.3,
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
      [BAND_SAFFRON, s.maxY - 0.12, 0.1],
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
  recess.position.set(faceX + inward * FACE_CLEARANCE, 0.62, z);
  recess.rotation.y = (inward * Math.PI) / 2;
  scene.add(recess);

  // Sill and lintel frame the opening so it reads as cut into the mud.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.46), mat);
  sill.position.set(faceX + inward * 0.05, 0.36, z);
  scene.add(sill);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.46), mat);
  lintel.position.set(faceX + inward * 0.05, 0.89, z);
  scene.add(lintel);

  return new THREE.Vector3(faceX + inward * 0.09, 0.41, z);
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
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ map: tile(tex.earth, 32, 32), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Walls: east and west, the two short returns beside the house, and the south wall split around the gate.
  // They are low parapets, so the player sees over them into the village. Each is also a collision box.
  const topNorth = NORTH_Z - WALL_T;
  const span = (minX: number, maxX: number, minZ: number, maxZ: number, maxY = WALL_H): Span => ({
    minX,
    maxX,
    minY: 0,
    maxY,
    minZ,
    maxZ,
  });
  const pillarX = GATE_HALF + 0.4;
  const spans: Span[] = [
    span(INNER_X, INNER_X + WALL_T, topNorth, OUTER_Z),
    span(-INNER_X - WALL_T, -INNER_X, topNorth, OUTER_Z),
    span(HOUSE_HALF, INNER_X, topNorth, NORTH_Z),
    span(-INNER_X, -HOUSE_HALF, topNorth, NORTH_Z),
    span(-INNER_X - WALL_T, -pillarX, SOUTH_INNER_Z, OUTER_Z),
    span(pillarX, INNER_X + WALL_T, SOUTH_INNER_Z, OUTER_Z),
  ];
  for (const s of spans) {
    addWall(scene, tex, s, true);
    world.addBox({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ });
  }

  // Gate: two tall pillars carry a lintel over a 1.6 m opening. The opening stays visibly open; a blocker across
  // its depth, starting 0.1 m inside the courtyard face, keeps the player in the courtyard.
  const gateMat = woodMaterial(tex, 1.5, 1);
  for (const side of [-1, 1]) {
    const x0 = side * GATE_HALF;
    const x1 = side * pillarX;
    addWall(
      scene,
      tex,
      span(Math.min(x0, x1), Math.max(x0, x1), SOUTH_INNER_Z, OUTER_Z, POST_H),
      true,
    );
  }
  addWall(
    scene,
    tex,
    { minX: -pillarX, maxX: pillarX, minY: POST_H - 0.4, maxY: POST_H, minZ: SOUTH_INNER_Z, maxZ: OUTER_Z },
    false,
  );
  addGateLeaf(scene, gateMat, -GATE_HALF, 1, -1.2);
  addGateLeaf(scene, gateMat, GATE_HALF, -1, 1.2);
  world.addBox({ minX: -GATE_HALF, maxX: GATE_HALF, minZ: SOUTH_INNER_Z + 0.1, maxZ: OUTER_Z });

  // Pilasters along the boundary carry the jhalar swags and the lanterns; each wears a glowing finial.
  const postMat = plasterMaterial(tex, 1);
  for (const p of wallPosts()) addPost(scene, postMat, p);

  // Niches: six per side wall, evenly spaced between the pilasters, each with a diya spot.
  const diyaSpots: THREE.Vector3[] = [];
  const niche = plasterMaterial(tex, 1);
  for (let i = 0; i < NICHES_PER_WALL; i++) {
    const z = -6 + i * 2.4;
    diyaSpots.push(addNiche(scene, niche, INNER_X, -1, z));
    diyaSpots.push(addNiche(scene, niche, -INNER_X, 1, z));
  }

  // Diyas along the wall tops every 1.2 m, clear of the pilasters; the south wall skips the gate.
  diyaSpots.push(...wallTopSpots(0));

  return { diyaSpots };
}

/** Centre of a pilaster on the boundary, in world x and z. */
export interface WallPost {
  x: number;
  z: number;
  /** Which wall it stands on: the side it faces inward from, used to offset anchors into the courtyard. */
  wall: 'east' | 'west' | 'south';
}

/** Z of the side-wall pilasters (the last one stands at the south corner). */
const SIDE_POST_Z = [-7.2, -2.4, 2.4, 7.2, SOUTH_INNER_Z - 0.2];
/** X of the south-wall pilasters on the east half; the west half mirrors it, and the gate pillars stand inside these. */
const SOUTH_POST_X = [INNER_X - 0.2, 8.4, 4.6];

/** Every boundary pilaster, ordered along each wall from the house toward the gate. */
export function wallPosts(): WallPost[] {
  const out: WallPost[] = [];
  const sideX = INNER_X + WALL_T / 2;
  for (const z of SIDE_POST_Z) {
    out.push({ x: sideX, z, wall: 'east' }, { x: -sideX, z, wall: 'west' });
  }
  const southZ = SOUTH_INNER_Z + WALL_T / 2;
  for (const x of SOUTH_POST_X) out.push({ x, z: southZ, wall: 'south' }, { x: -x, z: southZ, wall: 'south' });
  return out;
}

/** Every bay between two neighbouring pilasters on the same wall, so strings and lanterns follow the same spans; none crosses the gate. */
export function wallBays(): [WallPost, WallPost][] {
  const posts = wallPosts();
  const bays: [WallPost, WallPost][] = [];
  for (const wall of ['east', 'west', 'south'] as const) {
    const side = posts.filter((p) => p.wall === wall);
    // The south posts run by x, the side walls by z, so each wall is walked from one end to the other.
    side.sort((a, b) => (wall === 'south' ? a.x - b.x : a.z - b.z));
    for (let k = 0; k < side.length - 1; k++) {
      // The two south posts nearest the gate stand on opposite sides of the opening; no bay crosses it.
      if (wall === 'south' && side[k].x < 0 && side[k + 1].x > 0) continue;
      bays.push([side[k], side[k + 1]]);
    }
  }
  return bays;
}

/** Top of a pilaster pulled 0.25 m into the courtyard, where the jhalar swags tie on. */
export function postAnchor(p: WallPost, y = POST_H - 0.15): THREE.Vector3 {
  const inset = WALL_T / 2 + 0.1;
  if (p.wall === 'east') return new THREE.Vector3(p.x - inset, y, p.z);
  if (p.wall === 'west') return new THREE.Vector3(p.x + inset, y, p.z);
  return new THREE.Vector3(p.x, y, p.z - inset);
}

/** A square pilaster with a lime cap and a glowing saffron finial. */
function addPost(scene: THREE.Scene, mat: THREE.Material, p: WallPost): void {
  const w = WALL_T + 0.14;
  const post = new THREE.Mesh(new THREE.BoxGeometry(w, POST_H, w), mat);
  post.position.set(p.x, POST_H / 2, p.z);
  scene.add(post);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, w + 0.1), mat);
  cap.position.set(p.x, POST_H + 0.04, p.z);
  scene.add(cap);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), BAND_SAFFRON);
  finial.position.set(p.x, POST_H + 0.17, p.z);
  scene.add(finial);
}

/**
 * Diya spots along the wall tops, every DIYA_SPACING metres and shifted by `offset` metres so a second call with a
 * half-spacing offset interleaves with the first. Spots within 0.4 m of a pilaster or beside the gate are skipped.
 */
export function wallTopSpots(offset: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const topY = WALL_H + 0.12;
  const sideX = INNER_X + WALL_T / 2;
  for (let z = -8 + offset; z < SOUTH_INNER_Z - 0.5; z += DIYA_SPACING) {
    if (SIDE_POST_Z.some((pz) => Math.abs(pz - z) < 0.4)) continue;
    out.push(new THREE.Vector3(sideX, topY, z), new THREE.Vector3(-sideX, topY, z));
  }
  const southZ = SOUTH_INNER_Z + WALL_T / 2;
  for (let x = -INNER_X + 0.4 + offset; x < INNER_X - 0.3; x += DIYA_SPACING) {
    if (Math.abs(x) < GATE_HALF + 0.9) continue;
    if (SOUTH_POST_X.some((px) => Math.abs(Math.abs(x) - px) < 0.4)) continue;
    out.push(new THREE.Vector3(x, topY, southZ));
  }
  return out;
}
