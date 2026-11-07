// Builds the village house on the north side of the aangan: a plastered body under a sloped
// khaprail roof, a verandah on wooden posts, a double door with brass rings, shuttered windows with
// a warm glow, a marigold toran over the door, shubh-labh lettering and a rangoli on the threshold.
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
  /** Base centre of the wooden takht on the verandah. */
  takhtPosition: THREE.Vector3;
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
const POST_X = [-5.5, -3, -1.4, 1.4, 3, 5.5];
const WINDOW_X = [-4.6, 4.6];
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
  buildTakht(scene, world, tex);

  return {
    doorPosition: new THREE.Vector3(0, VERANDAH_H, FRONT_Z),
    verandahLanternAnchor: new THREE.Vector3(0, roofY(-7.6) - 0.15, -7.6),
    takhtPosition: new THREE.Vector3(-3.5, VERANDAH_H, -7.8),
    // Diyas sit on the courtyard floor just in front of each post, clear of the verandah.
    diyaSpots: POST_X.map((x) => new THREE.Vector3(x, 0.06, VERANDAH_FRONT_Z - 0.4)),
  };
}

/** Plastered house body, with infill above the front and back walls where the roof pitch leaves a gap. */
function buildBody(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const w = HALF_W * 2;
  const d = FRONT_Z - BACK_Z;
  const body = jitteredBox(w, WALL_H, d, [36, 6, 4], plasterMaterial(tex, w / 2.4));
  body.position.set(0, WALL_H / 2, (FRONT_Z + BACK_Z) / 2);
  scene.add(body);
  world.addBox({ minX: -HALF_W, maxX: HALF_W, minZ: BACK_Z, maxZ: FRONT_Z });

  // The front pitch sits above the wall top, so a plaster infill closes the triangle under it.
  const infillMat = plasterMaterial(tex, w / 2.4);
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
  const gableMat = plasterMaterial(tex, 1);
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

/** Two small shuttered windows with a warm interior glow plane and half-open shutters. */
function buildWindow(scene: THREE.Scene, tex: Textures, cx: number): void {
  const y = 1.85;
  // Everything on the window sits FACE_CLEARANCE proud of the jittered front wall.
  const z = FRONT_Z + FACE_CLEARANCE;
  const frameMat = woodMaterial(tex, 1, 1);

  // Warm glow from inside; emissive so it reads as lit without adding a light.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.72),
    new THREE.MeshStandardMaterial({
      color: 0x2a1608,
      emissive: PALETTE.flame,
      emissiveIntensity: 0.6,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  glow.position.set(cx, y, z);
  scene.add(glow);

  // Four frame strips around the glow.
  const strips: [number, number, number, number, number][] = [
    [0.9, 0.06, cx, y + 0.37, z + 0.02],
    [0.9, 0.06, cx, y - 0.37, z + 0.02],
    [0.06, 0.8, cx - 0.42, y, z + 0.02],
    [0.06, 0.8, cx + 0.42, y, z + 0.02],
  ];
  for (const [w, h, x, sy, sz] of strips) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat);
    strip.position.set(x, sy, sz);
    scene.add(strip);
  }

  // Shutters hinged at the window edges, swung out to show they are left ajar.
  shutter(scene, frameMat, cx - 0.45, 1, -0.95, y, z + 0.03);
  shutter(scene, frameMat, cx + 0.45, -1, 0.95, y, z + 0.03);
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

/** Wooden takht on the verandah, the plinth that will hold the cracker boxes. */
function buildTakht(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const takht = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.7), woodMaterial(tex, 1, 1));
  takht.position.set(-3.5, VERANDAH_H + 0.225, -7.8);
  scene.add(takht);
  world.addBox({ minX: -4.3, maxX: -2.7, minZ: -8.15, maxZ: -7.45 });
}
