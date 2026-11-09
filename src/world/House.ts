// Builds the village house on the north side of the aangan: a plastered body under a sloped
// khaprail roof, a verandah on wooden posts, a double door with brass rings, arched windows filled with amber light,
// jharokha balconies, cornices and painted bands, a marigold toran, fairy lights on the eave, shubh-labh lettering and a
// rangoli on the threshold. The lavender facade is washed with baked warm-to-cool vertex colour instead of real lights.
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import type { CollisionWorld } from '../core/Collision';
import { tile, type Textures } from './textures';
import { FACE_CLEARANCE, jitteredBox, plasterMaterial, woodMaterial } from './Aangan';

/** Anchor points other systems (lanterns, props, diyas) attach to. */
export interface HouseAnchors {
  /** Centre of the door's base on the verandah floor. */
  doorPosition: THREE.Vector3;
  /** Point under the roof where the akash kandil hangs. */
  verandahLanternAnchor: THREE.Vector3;
  /** Floor spots in front of each verandah post, for diyas. */
  diyaSpots: THREE.Vector3[];
}

const FRONT_Z = -8.6;
const BACK_Z = -11;
const WALL_H = 3.2;
const HALF_W = 9;
const VERANDAH_H = 0.3;
const VERANDAH_FRONT_Z = -7;
const POST_Z = -7.15;
export const POST_X = [-5.5, -3, -1.4, 1.4, 3, 5.5];
const WINDOW_X = [-4.6, 4.6];
/** X of the two jharokha balconies. */
const JHAROKHA_X = [-7, 7];
/** Lavender facade paint and cream trim: the Varanasi-ghat palette, with geru and ochre bands added below. */
const BODY_PAINT = 0xa592e8;
const TRIM = 0xfff1d6;
/** Warm amber light behind every pane: unlit basic colour, below the bloom threshold so it stays crisp. */
const AMBER = new THREE.Color(1.0, 0.81, 0.42);
const DOOR_TOP = 2.35;
/** Roof profile in the z/y plane: front eave, ridge, back eave. */
const EAVE = { z: -6.8, y: 2.6 };
const RIDGE = { z: -9.8, y: 4.2 };
const BACK_EAVE = { z: -11.2, y: 3.2 };
const ROOF_HALF_W = 9.6;
/** One roof texture tile spans this many metres, so a khaprail is about 20 cm wide. */
const TILE_UNIT = 1.6;

/** Height of the roof surface above a given z: rises from the front eave to the ridge, then falls. */
function roofY(z: number): number {
  if (z >= RIDGE.z) return EAVE.y + ((RIDGE.y - EAVE.y) * (z - EAVE.z)) / (RIDGE.z - EAVE.z);
  return RIDGE.y - ((RIDGE.y - BACK_EAVE.y) * (RIDGE.z - z)) / (RIDGE.z - BACK_EAVE.z);
}

/** Hex colour as a CSS string, for canvas drawing. */
function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Two-triangle quad from four corners with explicit UVs, used for roof planes and gable ends. */
function quad(pts: THREE.Vector3[], uvs: [number, number][], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Builds the house and verandah into the scene and returns the anchor points for other systems. */
export function buildHouse(scene: THREE.Scene, world: CollisionWorld, tex: Textures): HouseAnchors {
  buildBody(scene, world, tex);
  buildVerandah(scene, world, tex);
  buildRoof(scene, tex);
  buildDoor(scene, tex);
  for (const x of WINDOW_X) buildWindow(scene, tex, x);
  buildToran(scene);
  buildDecals(scene, tex);
  buildDetails(scene, tex);
  for (const x of JHAROKHA_X) buildJharokha(scene, tex, x);
  buildEaveLights(scene);

  return {
    doorPosition: new THREE.Vector3(0, VERANDAH_H, FRONT_Z),
    verandahLanternAnchor: new THREE.Vector3(0, roofY(-7.6) - 0.15, -7.6),
    // Diyas sit on the courtyard floor just in front of each post, clear of the verandah.
    diyaSpots: POST_X.map((x) => new THREE.Vector3(x, 0.06, VERANDAH_FRONT_Z - 0.4)),
  };
}

/** Plastered house body, with infill above the front and back walls where the roof pitch leaves a gap. */
function buildBody(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const w = HALF_W * 2;
  const d = FRONT_Z - BACK_Z;
  const body = jitteredBox(w, WALL_H, d, [36, 6, 4], plasterMaterial(tex, w / 2.4, BODY_PAINT, true));
  body.position.set(0, WALL_H / 2, (FRONT_Z + BACK_Z) / 2);
  scene.add(body);
  world.addBox({ minX: -HALF_W, maxX: HALF_W, minZ: BACK_Z, maxZ: FRONT_Z });

  // The front pitch sits above the wall top, so a plaster infill closes the triangle under it.
  const infillMat = plasterMaterial(tex, w / 2.4, BODY_PAINT);
  const frontTop = roofY(FRONT_Z + 0.15) - 0.03;
  const front = new THREE.Mesh(new THREE.BoxGeometry(w, frontTop - 3.1, 0.3), infillMat);
  front.position.set(0, (3.1 + frontTop) / 2, FRONT_Z);
  scene.add(front);
  // The back pitch falls from the ridge; the infill is kept under it at the wall line.
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 0.3), infillMat);
  back.position.set(0, 3.2, BACK_Z + 0.15);
  scene.add(back);
}

/** Raised mud plinth, a plastered beam and six posts that carry the verandah eave. */
function buildVerandah(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  // Plinth: a raised mud floor the same depth as the verandah.
  const plinthMat = new THREE.MeshStandardMaterial({
    map: tile(tex.earth, 4, 1),
    roughness: 0.95,
    metalness: 0,
  });
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(12, VERANDAH_H, VERANDAH_FRONT_Z - FRONT_Z),
    plinthMat,
  );
  plinth.position.set(0, VERANDAH_H / 2, (FRONT_Z + VERANDAH_FRONT_Z) / 2);
  scene.add(plinth);

  // Wall plate along the front, which the posts run up into.
  const woodMat = woodMaterial(tex, 1, 1);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.12, 0.2), woodMat);
  beam.position.set(0, 2.56, POST_Z);
  scene.add(beam);

  // Posts run from the plinth to just under the roof surface at their position.
  const top = roofY(POST_Z) - 0.1;
  for (const x of POST_X) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, top - VERANDAH_H, 10),
      woodMat,
    );
    post.position.set(x, (top + VERANDAH_H) / 2, POST_Z);
    scene.add(post);
    world.addCircle(x, POST_Z, 0.14);
  }
}

/** Two roof planes meeting at the ridge, plus gable ends; tiled with the khaprail texture. */
function buildRoof(scene: THREE.Scene, tex: Textures): void {
  const roofMat = new THREE.MeshStandardMaterial({
    map: tile(tex.tiles, 1, 1),
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const R = ROOF_HALF_W;
  const frontLen = Math.hypot(RIDGE.z - EAVE.z, RIDGE.y - EAVE.y);
  const backLen = Math.hypot(BACK_EAVE.z - RIDGE.z, BACK_EAVE.y - RIDGE.y);
  const u = (x: number) => x / TILE_UNIT;

  // Front pitch: eave over the verandah rising to the ridge.
  scene.add(
    quad(
      [
        new THREE.Vector3(-R, EAVE.y, EAVE.z),
        new THREE.Vector3(R, EAVE.y, EAVE.z),
        new THREE.Vector3(R, RIDGE.y, RIDGE.z),
        new THREE.Vector3(-R, RIDGE.y, RIDGE.z),
      ],
      [
        [u(-R), 0],
        [u(R), 0],
        [u(R), frontLen / TILE_UNIT],
        [u(-R), frontLen / TILE_UNIT],
      ],
      roofMat,
    ),
  );
  // Back pitch: falls from the ridge to the back eave.
  const backV = (frontLen + backLen) / TILE_UNIT;
  scene.add(
    quad(
      [
        new THREE.Vector3(-R, RIDGE.y, RIDGE.z),
        new THREE.Vector3(R, RIDGE.y, RIDGE.z),
        new THREE.Vector3(R, BACK_EAVE.y, BACK_EAVE.z),
        new THREE.Vector3(-R, BACK_EAVE.y, BACK_EAVE.z),
      ],
      [
        [u(-R), frontLen / TILE_UNIT],
        [u(R), frontLen / TILE_UNIT],
        [u(R), backV],
        [u(-R), backV],
      ],
      roofMat,
    ),
  );

  // Gable triangles close the side ends between the wall tops and the roof planes.
  const gableMat = plasterMaterial(tex, 1, BODY_PAINT);
  gableMat.side = THREE.DoubleSide;
  for (const s of [-1, 1]) {
    const x = s * (HALF_W + 0.02);
    scene.add(
      quad(
        [
          new THREE.Vector3(x, WALL_H, FRONT_Z),
          new THREE.Vector3(x, roofY(BACK_Z), BACK_Z),
          new THREE.Vector3(x, RIDGE.y, RIDGE.z),
          new THREE.Vector3(x, roofY(FRONT_Z), FRONT_Z),
        ],
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        gableMat,
      ),
    );
  }
}

/** Double wooden door with a dark frame, two leaves and brass ring handles. */
function buildDoor(scene: THREE.Scene, tex: Textures): void {
  const frameMat = woodMaterial(tex, 1, 1, 0x6f4a2c);
  const leafMat = woodMaterial(tex, 1.5, 1);
  const brass = new THREE.MeshStandardMaterial({
    color: PALETTE.brass,
    metalness: 0.8,
    roughness: 0.35,
  });
  const doorH = DOOR_TOP - VERANDAH_H;
  const doorY = (VERANDAH_H + DOOR_TOP) / 2;

  // Dark frame sits proud of the jittered wall face by FACE_CLEARANCE and shows as a border around the leaves.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, doorH + 0.05, 0.04), frameMat);
  frame.position.set(0, doorY, FRONT_Z + FACE_CLEARANCE);
  scene.add(frame);

  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.8, doorH, 0.05), leafMat);
    leaf.position.set(side * 0.4, doorY, FRONT_Z + 0.07);
    scene.add(leaf);
    // Ring handle near the meeting stiles, set on the leaf face.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 8, 14), brass);
    ring.position.set(side * 0.08, 1.1, FRONT_Z + 0.1);
    scene.add(ring);
  }
}

/** Arch-topped outline of width `w` and height `h`, centred on the origin; used for panes, frames and niches. */
function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, -h / 2);
  s.lineTo(r, -h / 2);
  s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

/** Shared amber pane material: unlit, so every window and niche stays crisp and costs no lights. */
const amberMat = new THREE.MeshBasicMaterial({ color: AMBER, side: THREE.DoubleSide });

/** Box strip helper for trim: size, centre and material in one call. */
function strip(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Arched window: amber pane, a cream arched frame behind it, a cross of dark mullions, a sill and a lintel cap. */
function buildWindow(scene: THREE.Scene, tex: Textures, cx: number): void {
  const y = 1.85;
  // Everything on the window sits FACE_CLEARANCE proud of the jittered front wall.
  const z = FRONT_Z + FACE_CLEARANCE;
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.85, metalness: 0 });
  const woodDark = woodMaterial(tex, 1, 1, 0x7a4a2a);

  // Cream frame, slightly larger than the pane, then the amber pane in front of it.
  const frame = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.98, 1.1)), trim);
  frame.position.set(cx, y, z + 0.005);
  scene.add(frame);
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.8, 0.94)), amberMat);
  pane.position.set(cx, y, z + 0.012);
  scene.add(pane);
  // Mullions: one vertical and one horizontal bar across the glass.
  strip(scene, woodDark, 0.035, 0.94, 0.02, cx, y, z + 0.025);
  strip(scene, woodDark, 0.8, 0.035, 0.02, cx, y - 0.1, z + 0.025);
  // Projecting sill and a lintel cap over the arch.
  strip(scene, trim, 1.2, 0.07, 0.2, cx, y - 0.58, z + 0.08);
  strip(scene, trim, 1.1, 0.06, 0.12, cx, y + 0.6, z + 0.05);

  // Shutters hinged at the window edges, swung out to show they are left ajar, painted teal.
  const shutterMat = new THREE.MeshStandardMaterial({ color: 0x1f8a8a, roughness: 0.85, metalness: 0 });
  shutter(scene, shutterMat, cx - 0.5, 1, -0.95, y, z + 0.03);
  shutter(scene, shutterMat, cx + 0.5, -1, 0.95, y, z + 0.03);
}

/** One shutter leaf pivoting at its hinge; `side` is +1 when the leaf extends toward +x. */
function shutter(
  scene: THREE.Scene,
  mat: THREE.Material,
  hingeX: number,
  side: 1 | -1,
  swing: number,
  y: number,
  z: number,
): void {
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, y, z);
  pivot.rotation.y = swing;
  scene.add(pivot);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.03), mat);
  leaf.position.set(side * 0.22, 0, 0);
  pivot.add(leaf);
}

/** Marigold toran: a sagging string with ~40 small flower spheres over the door, as one InstancedMesh. */
function buildToran(scene: THREE.Scene): void {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.05, 2.5, -8.46),
    new THREE.Vector3(-0.5, 2.3, -8.44),
    new THREE.Vector3(0, 2.2, -8.43),
    new THREE.Vector3(0.5, 2.3, -8.44),
    new THREE.Vector3(1.05, 2.5, -8.46),
  ]);
  const string = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.0035, 4),
    new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.9, metalness: 0 }),
  );
  scene.add(string);

  const COUNT = 41;
  const flowers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 }),
    COUNT,
  );
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    curve.getPointAt(i / (COUNT - 1), p);
    p.y -= 0.03; // flowers hang just below the string
    // Deterministic size and tint variation, so the garland looks hand-strung.
    const k = 0.9 + 0.2 * (((i * 37) % 7) / 6);
    s.set(k, k * 0.85, k);
    m.compose(p, q, s);
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, c.set(i % 3 === 0 ? PALETTE.flame : PALETTE.marigold));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);
}

/** Draws one line of shubh-labh lettering in geru red onto a transparent canvas. */
function drawLabel(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = css(PALETTE.geru);
  ctx.font = '96px "Tiro Devanagari Hindi", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
}

/** Painted shubh-labh lettering either side of the door, and the rangoli on the threshold. */
function buildDecals(scene: THREE.Scene, tex: Textures): void {
  const labels: [number, string][] = [
    [-2.4, 'शुभ'],
    [2.4, 'लाभ'],
  ];
  for (const [x, text] of labels) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    drawLabel(canvas, text);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    decal.position.set(x, 1.6, FRONT_Z + FACE_CLEARANCE);
    scene.add(decal);
    // The Devanagari face loads from Google Fonts; redraw once it is ready so the first paint is not a fallback.
    document.fonts
      ?.load(`96px "Tiro Devanagari Hindi"`, text)
      .then(() => {
        drawLabel(canvas, text);
        map.needsUpdate = true;
      })
      .catch(() => undefined);
  }

  // Rangoli on the verandah floor at the threshold, drawn flat with a small lift to avoid z-fight.
  const rangoliMat = new THREE.MeshStandardMaterial({
    map: tex.rangoli,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    roughness: 0.9,
    metalness: 0,
  });
  const rangoli = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), rangoliMat);
  rangoli.rotation.x = -Math.PI / 2;
  rangoli.position.set(0, VERANDAH_H + 0.01, -7.8);
  scene.add(rangoli);
}


/** Cornices, painted bands, door surround, amber door cracks and arched niches across the front facade. */
function buildDetails(scene: THREE.Scene, tex: Textures): void {
  const z = FRONT_Z;
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.85, metalness: 0 });
  const geru = new THREE.MeshStandardMaterial({ color: PALETTE.geru, emissive: PALETTE.geru, emissiveIntensity: 0.15, roughness: 0.85 });
  const ochre = new THREE.MeshStandardMaterial({ color: 0xe8a020, emissive: 0xc07010, emissiveIntensity: 0.15, roughness: 0.85 });
  const wood = woodMaterial(tex, 1, 1, 0x7a4a2a);
  const W = HALF_W * 2;

  // Cornice: a deep cream ledge under the roof line with a thinner drip strip below it.
  strip(scene, trim, W + 0.3, 0.14, 0.34, 0, 2.92, z + 0.12);
  strip(scene, trim, W + 0.2, 0.05, 0.2, 0, 2.8, z + 0.07);
  // Painted bands: geru dado near the floor and an ochre stripe above it, split around the door.
  for (const s of [-1, 1]) {
    strip(scene, geru, 8, 0.14, 0.05, s * 5, 0.58, z + 0.03);
    strip(scene, ochre, 8, 0.08, 0.05, s * 5, 0.76, z + 0.03);
  }
  // Frieze under the cornice: ochre with a thin geru line.
  strip(scene, ochre, W, 0.1, 0.05, 0, 2.7, z + 0.03);
  strip(scene, geru, W, 0.05, 0.05, 0, 2.62, z + 0.03);

  // Projecting wooden beam ends (rafter tails) along the cornice, as one instanced mesh.
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.28), wood, 36);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    m.makeTranslation(-8.75 + i * 0.5, 2.74, z + 0.2);
    beams.setMatrixAt(i, m);
  }
  beams.instanceMatrix.needsUpdate = true;
  scene.add(beams);

  // Door surround: cream pilasters, a lintel and a geru cap above it.
  for (const s of [-1, 1]) {
    strip(scene, trim, 0.14, DOOR_TOP - VERANDAH_H + 0.1, 0.1, s * 1.02, (DOOR_TOP + VERANDAH_H) / 2, z + 0.06);
  }
  strip(scene, trim, 2.3, 0.12, 0.14, 0, DOOR_TOP + 0.08, z + 0.07);
  strip(scene, geru, 2.1, 0.05, 0.16, 0, DOOR_TOP + 0.17, z + 0.07);
  // Lamplight leaking round the double door: a lit crack at the meeting stiles and a glow under the sill.
  strip(scene, amberMat, 0.03, DOOR_TOP - VERANDAH_H - 0.1, 0.02, 0, (DOOR_TOP + VERANDAH_H) / 2 - 0.05, z + 0.105);
  strip(scene, amberMat, 1.7, 0.025, 0.02, 0, VERANDAH_H + 0.02, z + 0.1);

  // Arched niches above the shubh-labh lettering, each with a little diya flame.
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.6) });
  for (const x of [-2.4, 2.4]) {
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.5, 0.62)), trim);
    frame.position.set(x, 2.15, z + 0.04);
    scene.add(frame);
    const niche = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.38, 0.5)), amberMat);
    niche.position.set(x, 2.14, z + 0.048);
    scene.add(niche);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flameMat);
    flame.position.set(x, 1.98, z + 0.07);
    scene.add(flame);
  }
}

/** Jharokha: a projecting balcony on corbels with a lit arched opening, side panes and a small chhatri dome. */
function buildJharokha(scene: THREE.Scene, tex: Textures, cx: number): void {
  const g = new THREE.Group();
  g.position.set(cx, 0, FRONT_Z);
  scene.add(g);
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.85, metalness: 0 });
  const geru = new THREE.MeshStandardMaterial({ color: PALETTE.geru, emissive: PALETTE.geru, emissiveIntensity: 0.15, roughness: 0.85 });
  const wood = woodMaterial(tex, 1, 1, 0x7a4a2a);
  const D = 0.62;

  // Floor slab with a geru edge, carried on three tapered corbels.
  strip(g, trim, 1.5, 0.1, D + 0.1, 0, 1.35, D / 2);
  strip(g, geru, 1.52, 0.04, D + 0.12, 0, 1.3, D / 2);
  for (const x of [-0.55, 0, 0.55]) {
    const corbel = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 4), wood);
    corbel.rotation.set(Math.PI, Math.PI / 4, 0);
    corbel.position.set(x, 1.15, 0.15);
    g.add(corbel);
  }
  // Pillars at the front corners and a cream lintel carrying the dome.
  for (const x of [-0.7, 0.7]) strip(g, trim, 0.1, 0.95, 0.1, x, 1.88, D);
  strip(g, trim, 1.5, 0.1, D + 0.1, 0, 2.38, D / 2);
  // Front arched opening, lit amber from inside, and two small side panes.
  const arch = new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.1, 0.88)), amberMat);
  arch.position.set(0, 1.86, D - 0.02);
  g.add(arch);
  strip(g, wood, 0.03, 0.86, 0.02, 0, 1.86, D - 0.005);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.2, 0.7), amberMat);
    side.rotation.y = (s * Math.PI) / 2;
    side.position.set(s * 0.69, 1.86, D / 2);
    g.add(side);
  }
  // Glow on the wall behind the balcony.
  const back = new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.0, 0.85)), amberMat);
  back.position.set(0, 1.86, FACE_CLEARANCE + 0.01);
  g.add(back);
  // Chhatri dome, a geru ring and a brass finial.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), trim);
  dome.scale.set(1.1, 0.55, 0.55);
  dome.position.set(0, 2.43, D / 2);
  g.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 18), geru);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 2.45, D / 2);
  ring.scale.set(1.7, 1.1, 1);
  g.add(ring);
  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.8, roughness: 0.35 }),
  );
  finial.position.set(0, 2.78, D / 2);
  g.add(finial);
}

/** Fairy-light string along the front eave: small coloured bulbs on a gentle sag between hooks, one InstancedMesh. */
function buildEaveLights(scene: THREE.Scene): void {
  const COUNT = 48;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), COUNT);
  const palette = [0xffc04a, 0xff5a7a, 0x4cd47a, 0x6ab0ff, 0xfff0d0].map((h) => new THREE.Color(h).multiplyScalar(1.4));
  const m = new THREE.Matrix4();
  for (let i = 0; i < COUNT; i++) {
    const t = i / (COUNT - 1);
    const x = (t - 0.5) * ROOF_HALF_W * 2;
    // The sag repeats every 1.6 m so the wire looks hung between hooks.
    const sag = 0.1 * Math.sin((((x + ROOF_HALF_W) % 1.6) / 1.6) * Math.PI);
    m.makeTranslation(x, EAVE.y - 0.1 - sag, EAVE.z + 0.04);
    bulbs.setMatrixAt(i, m);
    bulbs.setColorAt(i, palette[i % palette.length]);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  scene.add(bulbs);
}
