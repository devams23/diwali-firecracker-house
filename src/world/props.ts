// Village props: the tulsi chaura with its diya ledge and agarbatti stand, two charpais (one with the
// thaali), the cracker boxes on the takht, a stack of matkas, a brass lota, a hand pump, a neem tree and
// the akash kandil. Floor props register their footprints as colliders; items resting on a prop (the
// diya, incense, thaali, cracker boxes) rely on the collider of the thing they sit on.
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import type { CollisionWorld } from '../core/Collision';
import { CRACKER_ORDER, CRACKERS, type CrackerKind } from '../crackers/catalog';
import { CLAY } from '../items/Diya';
import { DIYA_SPACING, FACE_CLEARANCE, GATE_HALF, INNER_X, SOUTH_INNER_Z, WALL_H, WALL_T, jitteredBox, plasterMaterial, woodMaterial } from './Aangan';
import { TAKHT_H, type HouseAnchors } from './House';
import { rng, tile, type Textures } from './textures';

/** Cardboard of the cracker boxes, muted to match the lime and earth tones. */
const CARDBOARD = 0xb08a58;
const CARDBOARD_INSIDE = 0x3a2a18;
const TULSI_GREEN = 0x4f8a3c;
const IRON = 0x3a3d44;
const CHARPAI_L = 1.9;
const CHARPAI_W = 1.0;

/** Local css hex string for canvas drawing. */
function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Brass finish shared by the agarbatti stand, thaali and lota. */
function brassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.8, roughness: 0.35 });
}

/** Clay finish for matkas and the diya bowls. */
function clayMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
}

/** Geru panel with a painted marigold motif, for the chaura face. */
function motifTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = css(PALETTE.geru);
    ctx.fillRect(0, 0, 256, 192);
    // Thin marigold border, then a row of diamonds with white dots between them.
    ctx.strokeStyle = css(PALETTE.marigold);
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 232, 168);
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 44;
      ctx.fillStyle = css(PALETTE.marigold);
      ctx.beginPath();
      ctx.moveTo(x, 70);
      ctx.lineTo(x + 16, 96);
      ctx.lineTo(x, 122);
      ctx.lineTo(x - 16, 96);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f4ecdc';
      ctx.beginPath();
      ctx.arc(x + 22, 96, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Woven rope pattern for the charpai top: crossed diagonal strands on a tan base. */
function ropeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(0, 0, size, size);
    ctx.lineWidth = 9;
    // Two sets of diagonals, one light and one dark, so the crossings read as a woven pattern.
    for (const [dir, colour] of [
      [1, '#c9a46e'],
      [-1, '#5a3b22'],
    ] as const) {
      ctx.strokeStyle = colour;
      for (let k = -size; k <= size * 2; k += 16) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + dir * size, size);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

/** Foliage clumps for the neem: many dark green ellipses on a transparent canvas, one clump texture. */
function foliageTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = rng(55);
    for (let i = 0; i < 90; i++) {
      const x = 40 + r() * 176;
      const y = 40 + r() * 176;
      const rx = 14 + r() * 18;
      const ry = 8 + r() * 10;
      const g = 0.45 + r() * 0.35;
      ctx.fillStyle = `rgba(${Math.round(40 * g)},${Math.round(74 * g)},${Math.round(34 * g)},0.95)`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Star outline with alternating outer and inner radii, used for the akash kandil ribs. */
function starShape(points: number, outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** Draws one cracker box label: tinted band, cream panel, English name in bold and the Devanagari below. */
function drawBoxLabel(canvas: HTMLCanvasElement, kind: CrackerKind): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const info = CRACKERS[kind];
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = css(info.tint);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#efe3c6';
  ctx.fillRect(12, 16, w - 24, h - 32);
  ctx.fillStyle = '#3a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px Inter, sans-serif';
  ctx.fillText(info.label.toUpperCase(), w / 2, h * 0.4);
  ctx.font = '44px "Tiro Devanagari Hindi", serif';
  ctx.fillText(info.hindi, w / 2, h * 0.7);
}

/** Label canvas texture for one cracker kind, redrawn once the web fonts are ready. */
function boxLabelTexture(kind: CrackerKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 200;
  drawBoxLabel(canvas, kind);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const info = CRACKERS[kind];
  // Fonts load from Google Fonts; redraw after they arrive so the first paint is not a fallback.
  document.fonts
    ?.load(`bold 40px Inter`, info.label)
    .then(() => document.fonts.load(`44px "Tiro Devanagari Hindi"`, info.hindi))
    .then(() => {
      drawBoxLabel(canvas, kind);
      map.needsUpdate = true;
    })
    .catch(() => undefined);
  return map;
}

/** Adds one limb (a thin cylinder) from `from` to `to`, used for the neem's branches. */
function limb(
  group: THREE.Group,
  mat: THREE.Material,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius, len, 6), mat);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  group.add(mesh);
}

/**
 * Props layout result: the diya and agarbatti spots on the chaura, the thaali spot on the first charpai and
 * the takht's cracker boxes in CRACKER_ORDER.
 */
export interface PropsResult {
  /** Flame base spot for the main diya on the chaura ledge. */
  tulsiDiyaPos: THREE.Vector3;
  /** Brass agarbatti stand beside the diya on the same ledge. */
  agarbattiStandPos: THREE.Vector3;
  /** Resting spot of the thaali on the first charpai. */
  charpaiThaaliPos: THREE.Vector3;
  /** Cracker boxes in a row on the takht, one per kind. */
  takhtBoxes: { kind: CrackerKind; position: THREE.Vector3 }[];
}

/** Builds every village prop, registers the floor colliders and returns the spots other systems use. */
export function buildProps(
  scene: THREE.Scene,
  world: CollisionWorld,
  tex: Textures,
  house: HouseAnchors,
): PropsResult {
  const tulsiDiyaPos = new THREE.Vector3(0, 0.95, 0.55);
  const agarbattiStandPos = new THREE.Vector3(0.3, 0.95, 0.55);
  buildTulsiChaura(scene, world, tex);
  buildAgarbatti(scene, agarbattiStandPos);

  const rope = ropeTexture();
  const charpaiThaaliPos = new THREE.Vector3(4.5, 0.48, 3.5);
  buildCharpai(scene, world, tex, rope, 4.5, 3.5);
  buildCharpai(scene, world, tex, rope, -6, 2);
  buildThaali(scene, charpaiThaaliPos);

  const takhtBoxes = buildTakhtBoxes(scene, house.takhtPosition);
  buildMatkas(scene, world);
  buildLota(scene, world);
  buildHandPump(scene, world, tex);
  buildNeem(scene, world, tex);
  buildAkashKandil(scene, house.verandahLanternAnchor);

  return { tulsiDiyaPos, agarbattiStandPos, charpaiThaaliPos, takhtBoxes };
}

/**
 * Extra decorative diya spots so the courtyard reaches about 100 lamps: a staggered row between the
 * existing wall-top spots, and a floor row just inside the south wall. Lit diyas are not included.
 */
export function extraDiyaSpots(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const topY = WALL_H + 0.12;
  const sideX = INNER_X + WALL_T / 2;
  const southZ = SOUTH_INNER_Z + WALL_T / 2;
  // Side walls: a half-spacing offset from the existing row, so the two rows interleave.
  for (let i = 0; i < 12; i++) {
    const z = -6.0 + i * DIYA_SPACING;
    out.push(new THREE.Vector3(sideX, topY, z), new THREE.Vector3(-sideX, topY, z));
  }
  // South wall: the staggered row, skipping the gate like the original row does.
  for (let i = 0; i < 14; i++) {
    const x = -7.8 + i * DIYA_SPACING;
    if (Math.abs(x) < GATE_HALF + 0.6) continue;
    out.push(new THREE.Vector3(x, topY, southZ));
  }
  // Floor row just inside the south wall, on the beaten earth.
  for (let i = 0; i < 15; i++) {
    const x = -8.4 + i * DIYA_SPACING;
    if (Math.abs(x) < GATE_HALF + 0.6) continue;
    out.push(new THREE.Vector3(x, 0, 6.3));
  }
  return out;
}

/** Tulsi chaura: a plastered 1 m block with a painted geru face, a diya ledge and a tulsi plant on top. */
function buildTulsiChaura(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  // Body: a plastered block whose lower band is geru from the plaster texture.
  const body = jitteredBox(1.0, 0.9, 1.0, [8, 4, 8], plasterMaterial(tex, 1));
  body.position.set(0, 0.45, 0);
  scene.add(body);
  world.addBox({ minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 });

  // Painted motif panel on the south face, where the player approaches.
  const motif = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshStandardMaterial({ map: motifTexture(), roughness: 0.9, metalness: 0 }),
  );
  motif.position.set(0, 0.5, 0.5 + FACE_CLEARANCE);
  scene.add(motif);

  // Diya ledge: a shelf the main diya and the agarbatti stand sit on, top flush with y = 0.95.
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.14), plasterMaterial(tex, 1));
  ledge.position.set(0, 0.925, 0.57);
  scene.add(ledge);

  // Soil disc in the top of the chaura, under the plant.
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshStandardMaterial({ map: tile(tex.earth, 1, 1), roughness: 0.95, metalness: 0 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.901;
  scene.add(soil);

  buildTulsiPlant(scene);
}

/** Tulsi plant: thin stems leaning out of the soil, with leaf planes clustered along them. */
function buildTulsiPlant(scene: THREE.Scene): void {
  const r = rng(303);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5a6a2e, roughness: 0.9, metalness: 0 });
  const stems: { base: THREE.Vector3; dir: THREE.Vector3; h: number }[] = [];
  const STEMS = 7;
  for (let s = 0; s < STEMS; s++) {
    const a = (s / STEMS) * Math.PI * 2 + r() * 0.5;
    const rad = 0.08 + r() * 0.12;
    const h = 0.3 + r() * 0.2;
    const lean = 0.15 + r() * 0.2;
    const base = new THREE.Vector3(Math.cos(a) * rad, 0.9, Math.sin(a) * rad);
    const dir = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, h, 4), stemMat);
    stem.position.copy(base).addScaledVector(dir, h / 2);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(stem);
    stems.push({ base, dir, h });
  }

  // Leaves: one instanced mesh, each leaf placed at a random point along a random stem and tilted.
  const LEAVES = 60;
  const leaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.05, 0.035),
    new THREE.MeshStandardMaterial({ color: TULSI_GREEN, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    LEAVES,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < LEAVES; i++) {
    const st = stems[i % STEMS];
    p.copy(st.base).addScaledVector(st.dir, st.h * (0.4 + 0.6 * r()));
    euler.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    q.setFromEuler(euler);
    m.compose(p, q, one);
    leaves.setMatrixAt(i, m);
  }
  leaves.instanceMatrix.needsUpdate = true;
  scene.add(leaves);
}

/** Brass agarbatti stand on the diya ledge: a flat base, a cup and three incense sticks with glowing tips. */
function buildAgarbatti(scene: THREE.Scene, pos: THREE.Vector3): void {
  const group = new THREE.Group();
  group.position.copy(pos);
  const brass = brassMaterial();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 16), brass);
  base.position.y = 0.006;
  group.add(base);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 12), brass);
  cup.position.y = 0.027;
  group.add(cup);

  const stickMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9, metalness: 0 });
  const tipMat = new THREE.MeshBasicMaterial({ color: PALETTE.flame });
  const offsets: [number, number][] = [
    [0, 0],
    [0.008, 0.006],
    [-0.007, -0.005],
  ];
  for (const [ox, oz] of offsets) {
    // Stick, then a small glowing tip where it burns (no light, only the bloom picks it up).
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.2, 4), stickMat);
    stick.position.set(ox, 0.14, oz);
    group.add(stick);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), tipMat);
    tip.position.set(ox, 0.24, oz);
    group.add(tip);
  }
  scene.add(group);
}

/** Charpai: a wooden frame on four legs with a rope-woven top; registers its frame footprint as a collider. */
function buildCharpai(
  scene: THREE.Scene,
  world: CollisionWorld,
  tex: Textures,
  rope: THREE.CanvasTexture,
  x: number,
  z: number,
): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const wood = woodMaterial(tex, 1, 1, 0xb08a5a);
  const legH = 0.42;
  const railY = 0.44;
  const hx = CHARPAI_L / 2 - 0.06;
  const hz = CHARPAI_W / 2 - 0.06;

  // Four legs at the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, legH, 8), wood);
      leg.position.set(sx * hx, legH / 2, sz * hz);
      group.add(leg);
    }
  }
  // Long rails along x, short rails along z, all at the frame height.
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CHARPAI_L, 0.05, 0.05), wood);
    rail.position.set(0, railY, sz * (CHARPAI_W / 2 - 0.03));
    group.add(rail);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, CHARPAI_W), wood);
    rail.position.set(sx * (CHARPAI_L / 2 - 0.03), railY, 0);
    group.add(rail);
  }
  // Rope weave laid across the frame.
  const weave = new THREE.Mesh(
    new THREE.PlaneGeometry(CHARPAI_L - 0.12, CHARPAI_W - 0.12),
    new THREE.MeshStandardMaterial({ map: rope, roughness: 0.95, metalness: 0 }),
  );
  weave.rotation.x = -Math.PI / 2;
  weave.position.y = railY + 0.026;
  group.add(weave);

  scene.add(group);
  world.addBox({
    minX: x - CHARPAI_L / 2,
    maxX: x + CHARPAI_L / 2,
    minZ: z - CHARPAI_W / 2,
    maxZ: z + CHARPAI_W / 2,
  });
}

/** Brass thaali resting on the charpai: a shallow plate with four laddoos on it. */
function buildThaali(scene: THREE.Scene, pos: THREE.Vector3): void {
  const group = new THREE.Group();
  group.position.copy(pos);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24), brassMaterial());
  plate.position.y = 0.0075;
  group.add(plate);
  const laddooMat = new THREE.MeshStandardMaterial({ color: 0xd8a040, roughness: 0.8, metalness: 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), laddooMat);
    ball.position.set(Math.cos(a) * 0.09, 0.045, Math.sin(a) * 0.09);
    group.add(ball);
  }
  scene.add(group);
}

/** Cracker boxes on the takht: open cardboard boxes, one per kind, with a printed label on the south end. */
function buildTakhtBoxes(scene: THREE.Scene, takht: THREE.Vector3): PropsResult['takhtBoxes'] {
  const r = rng(616);
  const out: PropsResult['takhtBoxes'] = [];
  CRACKER_ORDER.forEach((kind, i) => {
    const cardboard = new THREE.MeshStandardMaterial({ color: CARDBOARD, roughness: 0.95, metalness: 0 });
    const inside = new THREE.MeshStandardMaterial({ color: CARDBOARD_INSIDE, roughness: 1, metalness: 0 });
    const label = new THREE.MeshStandardMaterial({
      map: boxLabelTexture(kind),
      roughness: 0.9,
      metalness: 0,
    });
    // Box faces in BoxGeometry order: +x, -x, +y (open top), -y, +z (label end), -z.
    const mats = [cardboard, cardboard, inside, cardboard, label, cardboard];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.46), mats);
    const x = takht.x + (i - (CRACKER_ORDER.length - 1) / 2) * 0.15;
    box.position.set(x, takht.y + TAKHT_H + 0.055, takht.z);
    // Slight hand-placed turn so the row does not look machined.
    box.rotation.y = (r() - 0.5) * 0.1;
    scene.add(box);
    out.push({ kind, position: box.position.clone() });
  });
  return out;
}

/** Stack of three clay matkas by the north-west corner: two side by side and one nested on top. */
function buildMatkas(scene: THREE.Scene, world: CollisionWorld): void {
  const x = -7.6;
  const z = -6.4;
  const profile = [
    [0.12, 0],
    [0.2, 0.08],
    [0.24, 0.22],
    [0.25, 0.33],
    [0.19, 0.43],
    [0.13, 0.48],
    [0.15, 0.5],
    [0.13, 0.5],
    [0.11, 0.44],
    [0, 0.44],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 20);
  const mat = clayMaterial();
  const placements: [number, number, number, number][] = [
    [x, 0, z, 1],
    [x + 0.55, 0, z + 0.1, 1],
    [x, 0.5, z, 0.8],
  ];
  for (const [px, py, pz, s] of placements) {
    const pot = new THREE.Mesh(geo, mat);
    pot.position.set(px, py, pz);
    pot.scale.setScalar(s);
    scene.add(pot);
  }
  world.addBox({ minX: x - 0.3, maxX: x + 0.85, minZ: z - 0.3, maxZ: z + 0.4 });
}

/** Brass lota on the courtyard floor, a round-bodied vessel with a narrow neck. */
function buildLota(scene: THREE.Scene, world: CollisionWorld): void {
  const profile = [
    [0, 0],
    [0.06, 0],
    [0.085, 0.05],
    [0.095, 0.12],
    [0.08, 0.18],
    [0.05, 0.22],
    [0.045, 0.25],
    [0.05, 0.26],
    [0.04, 0.27],
    [0, 0.27],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const lota = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), brassMaterial());
  lota.position.set(-2.4, 0, 1.6);
  scene.add(lota);
  world.addCircle(-2.4, 1.6, 0.1);
}

/** Hand pump (nalka) at the east side: a concrete base, an iron standpipe, a lever and a spout. */
function buildHandPump(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const x = 7.5;
  const z = -5.5;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const iron = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.6, metalness: 0.5 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.5), plasterMaterial(tex, 1));
  base.position.y = 0.05;
  group.add(base);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 10), iron);
  pipe.position.y = 0.675;
  group.add(pipe);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.05), iron);
  lever.position.set(0.1, 1.28, 0);
  group.add(lever);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), iron);
  spout.rotation.z = Math.PI / 2;
  spout.position.set(0.15, 0.55, 0);
  group.add(spout);

  scene.add(group);
  world.addBox({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.25, maxZ: z + 0.25 });
}

/** Neem tree at the south-west: a tapered trunk, branches and nine foliage billboards in its crown. */
function buildNeem(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const x = -7.5;
  const z = 5.5;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const bark = woodMaterial(tex, 1, 3, 0x9a8a7a);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 3.0, 8), bark);
  trunk.position.y = 1.5;
  group.add(trunk);
  // Four limbs splaying out of the trunk top toward the crown.
  const top = new THREE.Vector3(0, 2.6, 0);
  for (const dir of [
    new THREE.Vector3(0.8, 0.6, 0.3),
    new THREE.Vector3(-0.7, 0.6, 0.4),
    new THREE.Vector3(0.2, 0.7, -0.8),
    new THREE.Vector3(-0.3, 0.6, -0.6),
  ]) {
    limb(group, bark, top, top.clone().addScaledVector(dir.normalize(), 1.1), 0.05);
  }

  // Foliage: flat clump planes around the crown, each randomly turned so the crown has depth.
  const r = rng(707);
  const foliage = new THREE.MeshStandardMaterial({
    map: foliageTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  for (let i = 0; i < 9; i++) {
    const clump = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), foliage);
    clump.position.set((r() - 0.5) * 2.2, 3.2 + r() * 1.2, (r() - 0.5) * 2.2);
    clump.rotation.y = r() * Math.PI;
    group.add(clump);
  }

  scene.add(group);
  world.addCircle(x, z, 0.3);
}

/** Akash kandil: a star-shaped paper lantern hung at the verandah, with its own warm PointLight. */
function buildAkashKandil(scene: THREE.Scene, anchor: THREE.Vector3): void {
  const group = new THREE.Group();
  group.position.copy(anchor);
  const paper = new THREE.MeshStandardMaterial({
    color: 0xf0c070,
    emissive: PALETTE.flame,
    emissiveIntensity: 0.9,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const shape = starShape(8, 0.15, 0.075);
  // Two stars turned against each other read as a 3D lantern rather than a flat cut-out.
  const front = new THREE.Mesh(new THREE.ShapeGeometry(shape), paper);
  front.position.set(0, -0.06, 0.01);
  group.add(front);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(shape), paper);
  back.position.set(0, -0.06, -0.01);
  back.rotation.z = Math.PI / 8;
  back.scale.setScalar(0.9);
  group.add(back);

  // Hot core in the middle of the lantern.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
  );
  core.position.set(0, -0.06, 0);
  group.add(core);

  const light = new THREE.PointLight(0xffa040, 1.2, 8);
  light.position.set(0, -0.06, 0.05);
  group.add(light);
  scene.add(group);
}
