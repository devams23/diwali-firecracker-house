// Village props: the tulsi chaura with its diya ledge and agarbatti stand, two charpais, the cracker stall (built in Stall.ts), a stack of matkas, a brass lota, a hand pump, a neem tree and
// the akash kandil. Floor props register their footprints as colliders; items resting on a prop (the
// diya, incense, cracker boxes) rely on the collider of the thing they sit on.
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import type { CollisionWorld } from '../core/Collision';
import { CLAY } from '../items/Diya';
import { DIYA_SPACING, FACE_CLEARANCE, GATE_HALF, INNER_X, SOUTH_INNER_Z, jitteredBox, plasterMaterial, woodMaterial, wallTopSpots } from './Aangan';
import type { HouseAnchors } from './House';
import { buildStall, type StallBox } from './Stall';
import { rng, tile, type Textures } from './textures';

const IRON = 0x3a3d44;
const CHARPAI_L = 1.9;
const CHARPAI_W = 1.0;

/** Local css hex string for canvas drawing. */
function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Brass finish shared by the agarbatti stand and lota. */
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
 * Props layout result: the diya and agarbatti spots on the chaura and the stall's cracker boxes in CRACKER_ORDER.
 */
export interface PropsResult {
  /** Flame base spot for the main diya on the chaura ledge. */
  tulsiDiyaPos: THREE.Vector3;
  /** Brass agarbatti stand beside the diya on the same ledge. */
  agarbattiStandPos: THREE.Vector3;
  /** The stand's group, which the crosshair aims at and highlights. */
  agarbattiStand: THREE.Group;
  /** The stall's cracker boxes, one per kind, each an E interactable. */
  stallBoxes: StallBox[];
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
  const agarbattiStand = buildAgarbattiStand(scene, agarbattiStandPos);

  const rope = ropeTexture();
  buildCharpai(scene, world, tex, rope, 4.5, 3.5);
  buildCharpai(scene, world, tex, rope, -6, 2);

  const stallBoxes = buildStall(scene, world, tex);
  buildMatkas(scene, world);
  buildLota(scene, world);
  buildHandPump(scene, world, tex);
  buildNeem(scene, world, tex);
  buildAkashKandil(scene, house.verandahLanternAnchor);

  return { tulsiDiyaPos, agarbattiStandPos, agarbattiStand, stallBoxes };
}

/**
 * Extra decorative diya spots so the courtyard reaches about 100 lamps: a staggered row between the
 * existing wall-top spots, and a floor row just inside the south wall. Lit diyas are not included.
 */
export function extraDiyaSpots(): THREE.Vector3[] {
  // Wall tops: a half-spacing offset from the main row, so the two rows interleave.
  const out: THREE.Vector3[] = wallTopSpots(DIYA_SPACING / 2);
  // Floor row just inside the south wall, on the beaten earth, and a second row in front of the house plinth.
  for (let x = -INNER_X + 0.6; x < INNER_X - 0.4; x += DIYA_SPACING) {
    if (Math.abs(x) < GATE_HALF + 0.9) continue;
    out.push(new THREE.Vector3(x, 0, SOUTH_INNER_Z - 0.7));
  }
  for (let x = -INNER_X + 0.6; x < INNER_X - 0.4; x += DIYA_SPACING * 1.5) {
    if (Math.abs(x) < 7) continue;
    out.push(new THREE.Vector3(x, 0, -7.6));
  }
  return out;
}

/** Arch-topped outline of width `w` and height `h`, centred on the origin, for the chaura niches. */
function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-r, -h / 2);
  sh.lineTo(r, -h / 2);
  sh.lineTo(r, h / 2 - r);
  sh.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  sh.lineTo(-r, -h / 2);
  return sh;
}

/** Engraved plaque texture: gold Devanagari and Latin lettering on deep geru red, with a gold border. */
function plaqueTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#7a2a18';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#f2c14a';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '52px "Tiro Devanagari Hindi", serif';
    ctx.fillText('तुलसी चौरा', 256, 42);
    ctx.font = 'bold 34px serif';
    ctx.fillText('Tulsi Chaura', 256, 94);
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The Devanagari face loads from Google Fonts; redraw once it is ready so the first paint is not a fallback.
  document.fonts
    ?.load('52px "Tiro Devanagari Hindi"', 'तुलसी चौरा')
    .then(() => {
      draw();
      tex.needsUpdate = true;
    })
    .catch(() => undefined);
  return tex;
}

/**
 * Tulsi vrindavan: a cream stepped plinth with geru borders and corner pilasters, a carved arched niche on each face
 * (lit amber from inside, with a tiny diya), a plaque on the front, a marigold garland, a diya ledge for the player's
 * diya and a lush tulsi plant on top. All glow is unlit amber colour, below the bloom threshold, plus tiny flame cores.
 */
function buildTulsiChaura(scene: THREE.Scene, world: CollisionWorld, tex: Textures): void {
  const cream = 0xfff3dc;
  const geru = new THREE.MeshStandardMaterial({ color: PALETTE.geru, emissive: PALETTE.geru, emissiveIntensity: 0.12, roughness: 0.85, metalness: 0 });
  const creamMat = plasterMaterial(tex, 1, cream);
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.3), side: THREE.DoubleSide });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.6) });
  const clay = clayMaterial();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };

  // Stepped plinth: a broad base step, a geru border step on top of it, then the body block.
  box(1.3, 0.07, 1.3, 0, 0.035, 0, creamMat);
  box(1.16, 0.05, 1.16, 0, 0.095, 0, geru);
  // Body: a cream block (y 0.12 to 0.86) with baked warm-to-cool uplight; collision stays the original 1 m footprint.
  const body = jitteredBox(1.0, 0.74, 1.0, [8, 4, 8], plasterMaterial(tex, 1, cream, true));
  body.position.set(0, 0.49, 0);
  scene.add(body);
  world.addBox({ minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 });
  // Geru borders: a foot band, a top band and a cornice slab that overhangs the body.
  box(1.04, 0.05, 1.04, 0, 0.145, 0, geru);
  box(1.04, 0.05, 1.04, 0, 0.835, 0, geru);
  box(1.12, 0.06, 1.12, 0, 0.89, 0, creamMat);
  // Corner pilasters in geru.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.07, 0.7, 0.07, sx * 0.5, 0.49, sz * 0.5, geru);

  // Carved arched niches, one per face, each lit amber with a clay diya and a flame core. `face` turns local +z to the side.
  const niche = (face: number, x: number): void => {
    const g = new THREE.Group();
    g.rotation.y = face;
    scene.add(g);
    const z = 0.5 + FACE_CLEARANCE + 0.01;
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.3, 0.42)), geru);
    frame.position.set(x, 0.5, z);
    g.add(frame);
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.24, 0.36)), amber);
    pane.position.set(x, 0.49, z + 0.004);
    g.add(pane);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.025, 10), clay);
    cup.position.set(x, 0.37, z + 0.03);
    g.add(cup);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), flameMat);
    flame.position.set(x, 0.41, z + 0.03);
    g.add(flame);
  };
  // Front (south, +z) has two niches either side of a central motif; the other three faces have one each.
  niche(0, -0.28);
  niche(0, 0.28);
  niche(Math.PI / 2, 0);
  niche(-Math.PI / 2, 0);
  niche(Math.PI, 0);
  // Painted marigold motif between the front niches.
  const motif = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.3),
    new THREE.MeshStandardMaterial({ map: motifTexture(), roughness: 0.9, metalness: 0 }),
  );
  motif.position.set(0, 0.5, 0.5 + FACE_CLEARANCE + 0.01);
  scene.add(motif);

  // Plaque: "तुलसी चौरा / Tulsi Chaura", lit a little from within so it reads at night.
  const plaqueMap = plaqueTexture();
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.175),
    new THREE.MeshStandardMaterial({ map: plaqueMap, emissive: 0xffffff, emissiveMap: plaqueMap, emissiveIntensity: 0.45, roughness: 0.8, metalness: 0 }),
  );
  plaque.position.set(0, 0.25, 0.5 + FACE_CLEARANCE + 0.01);
  scene.add(plaque);

  // Diya ledge: a shelf the main diya and the agarbatti stand sit on, top flush with y = 0.95.
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.14), creamMat);
  ledge.position.set(0, 0.925, 0.57);
  scene.add(ledge);

  // Marigold garland draped round all four faces between the niches and the cornice, one instanced mesh.
  const per = 14;
  const garland = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), per * 4);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let gi = 0;
  for (let face = 0; face < 4; face++) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const u = (t - 0.5) * 1.08;
      const sag = 0.05 * Math.sin(t * Math.PI);
      const v = new THREE.Vector3(u, 0.79 - sag, 0.535).applyAxisAngle(new THREE.Vector3(0, 1, 0), (face * Math.PI) / 2);
      m.makeTranslation(v.x, v.y, v.z);
      garland.setMatrixAt(gi, m);
      garland.setColorAt(gi++, col.setHex(k % 3 === 0 ? 0xe8650a : PALETTE.marigold));
    }
  }
  garland.instanceMatrix.needsUpdate = true;
  if (garland.instanceColor) garland.instanceColor.needsUpdate = true;
  scene.add(garland);

  // Soil mound on top, ringed by a geru lip, under the plant.
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.4, 0.06, 24),
    new THREE.MeshStandardMaterial({ map: tile(tex.earth, 1, 1), roughness: 0.95, metalness: 0 }),
  );
  soil.position.y = 0.95;
  scene.add(soil);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 28), geru);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.93;
  scene.add(lip);

  buildTulsiPlant(scene);
}

/** Tulsi plant: stems fanning out of the soil with ~220 leaves in clusters and purple manjari flower spikes. */
function buildTulsiPlant(scene: THREE.Scene): void {
  const r = rng(303);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5a6a2e, roughness: 0.9, metalness: 0 });
  const stems: { base: THREE.Vector3; dir: THREE.Vector3; h: number }[] = [];
  const STEMS = 12;
  const BASE_Y = 0.98;
  for (let s = 0; s < STEMS; s++) {
    const a = (s / STEMS) * Math.PI * 2 + r() * 0.5;
    const rad = 0.04 + r() * 0.16;
    const h = 0.35 + r() * 0.3;
    const lean = 0.15 + r() * 0.35;
    const base = new THREE.Vector3(Math.cos(a) * rad, BASE_Y, Math.sin(a) * rad);
    const dir = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, h, 4), stemMat);
    stem.position.copy(base).addScaledVector(dir, h / 2);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(stem);
    stems.push({ base, dir, h });
  }

  // Leaves: instanced, in small clusters of four around points along each stem, tinted from deep to fresh green.
  const CLUSTERS = 56;
  const leaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.075, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    CLUSTERS * 4,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  const tip = new THREE.Vector3();
  let li = 0;
  for (let i = 0; i < CLUSTERS; i++) {
    const st = stems[i % STEMS];
    tip.copy(st.base).addScaledVector(st.dir, st.h * (0.35 + 0.65 * r()));
    for (let k = 0; k < 4; k++) {
      p.copy(tip).add(new THREE.Vector3((r() - 0.5) * 0.06, (r() - 0.5) * 0.05, (r() - 0.5) * 0.06));
      euler.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
      q.setFromEuler(euler);
      m.compose(p, q, one);
      leaves.setMatrixAt(li, m);
      leaves.setColorAt(li++, c.setHSL(0.27 + r() * 0.05, 0.55, 0.2 + r() * 0.16));
    }
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  scene.add(leaves);

  // Manjari: small purple flower spikes at the stem tips.
  const spikes = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.012, 0.07, 5),
    new THREE.MeshStandardMaterial({ color: 0x8a4ab0, roughness: 0.8 }),
    STEMS,
  );
  stems.forEach((st, i) => {
    p.copy(st.base).addScaledVector(st.dir, st.h + 0.03);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), st.dir);
    m.compose(p, q, one);
    spikes.setMatrixAt(i, m);
  });
  spikes.instanceMatrix.needsUpdate = true;
  scene.add(spikes);
}

/**
 * Brass agarbatti stand on the diya ledge: a flat base and a cup. The incense itself is carried by the
 * player, so the stand holds no sticks.
 */
function buildAgarbattiStand(scene: THREE.Scene, pos: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  const brass = brassMaterial();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 16), brass);
  base.position.y = 0.006;
  group.add(base);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 12), brass);
  cup.position.y = 0.027;
  group.add(cup);
  scene.add(group);
  return group;
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

  const light = new THREE.PointLight(0xffa040, 2.5, 12);
  light.position.set(0, -0.06, 0.05);
  group.add(light);
  scene.add(group);
}
