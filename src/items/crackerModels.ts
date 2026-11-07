// Procedural cracker models: one small, recognisable mesh per cracker kind, each with a canvas label in a muted
// Sivakasi style and a child Object3D named "fuse" at the tip that gets lit. Labels and shared materials are
// cached per kind, so the ten copies of one cracker on a thaali reuse the same GPU textures.
import * as THREE from 'three';
import { CRACKERS, type CrackerKind } from '../crackers/catalog';

/** Name of the child Object3D that marks where a fuse is lit. */
export const FUSE_NAME = 'fuse';
/** Name of the rocket's glass bottle mesh, which stays behind when the rocket body flies off. */
export const BOTTLE_NAME = 'bottle';
/** Name of the braided fuse mesh along the ladi, so the ladi can burn it down as the pops walk. */
export const LADI_BRAID_NAME = 'ladi-braid';
/** Number of red tubes standing on the ladi's fuse. */
export const LADI_TUBE_COUNT = 20;
/** Number of curve segments in the ladi's braided fuse; each is the same number of indices. */
export const LADI_BRAID_SEGMENTS = 80;
/** Bottom of the phuljhadi's wire above its origin, in metres. */
export const PHULJHADI_WIRE_BOTTOM = 0.05;
/** Length of the phuljhadi's burning wire, in metres. */
export const PHULJHADI_WIRE_LENGTH = 0.25;

const CLAY = 0x9a5a34;
const GERU = 0x9c3b22;
const PAPER = 0xe8dcc4;
const BAMBOO = 0xc8a46a;

const labelTextures = new Map<CrackerKind, THREE.CanvasTexture>();
const labelMaterials = new Map<CrackerKind, THREE.MeshStandardMaterial>();
const solidMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared matte or semi-matte material for a flat colour, cached by colour and finish. */
function solid(color: number, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${metalness}`;
  let m = solidMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    solidMaterials.set(key, m);
  }
  return m;
}

/** Draws a small ornament (lotus petals or concentric rings) into the corners of a label. */
function drawMotif(g: CanvasRenderingContext2D, kind: CrackerKind, x: number, y: number): void {
  g.strokeStyle = '#e8dcc4';
  g.fillStyle = '#e8dcc4';
  g.lineWidth = 2;
  if (kind === 'laxmi' || kind === 'anar') {
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(x, y);
      g.rotate((i / 6) * Math.PI * 2);
      g.beginPath();
      g.ellipse(0, -9, 4, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  } else {
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.stroke();
  }
}

/** Canvas label for one kind: tinted band, cream border, English name and Hindi name, cached per kind. */
function labelTexture(kind: CrackerKind): THREE.CanvasTexture {
  const cached = labelTextures.get(kind);
  if (cached) return cached;
  const info = CRACKERS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = `#${info.tint.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#e8dcc4';
    g.lineWidth = 5;
    g.strokeRect(10, 10, 236, 108);
    drawMotif(g, kind, 36, 64);
    drawMotif(g, kind, 220, 64);
    g.fillStyle = '#f3e7cf';
    g.textAlign = 'center';
    g.font = "600 28px 'Cormorant Garamond', Georgia, serif";
    g.fillText(info.label, 128, 58);
    g.font = "500 22px 'Tiro Devanagari Hindi', serif";
    g.fillText(info.hindi, 128, 94);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(kind, tex);
  return tex;
}

/** Paper label material for a kind, cached so every copy of that cracker shares it. */
function labelMaterial(kind: CrackerKind): THREE.MeshStandardMaterial {
  let m = labelMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: labelTexture(kind), roughness: 0.6 });
    labelMaterials.set(kind, m);
  }
  return m;
}

/** Adds a mesh at a local position inside a model group. */
function part(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** Adds the empty "fuse" marker at a local position; the lighting code reads its world position. */
function fuseAt(g: THREE.Group, x: number, y: number, z: number): void {
  const fuse = new THREE.Object3D();
  fuse.name = FUSE_NAME;
  fuse.position.set(x, y, z);
  g.add(fuse);
}

/** Phuljhadi: a grey-coated wire about 30 cm long with a bare handle end and a sparkle head. */
function phuljhadi(): THREE.Group {
  const g = new THREE.Group();
  const wireMid = PHULJHADI_WIRE_BOTTOM + PHULJHADI_WIRE_LENGTH / 2;
  part(g, new THREE.CylinderGeometry(0.002, 0.002, PHULJHADI_WIRE_LENGTH, 6), solid(0x8a9096, 0.45, 0.6), 0, wireMid, 0);
  part(g, new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6), solid(0x6b6b6b, 0.4, 0.8), 0, 0.025, 0);
  part(g, new THREE.SphereGeometry(0.007, 8, 6), solid(0xb9c2cc, 0.6), 0, PHULJHADI_WIRE_BOTTOM + PHULJHADI_WIRE_LENGTH, 0);
  fuseAt(g, 0, PHULJHADI_WIRE_BOTTOM + PHULJHADI_WIRE_LENGTH + 0.01, 0);
  return g;
}

/** Pencil: a thick coloured paper stick about 18 cm long with a dark graphite cap at the fuse end. */
function pencil(): THREE.Group {
  const g = new THREE.Group();
  const cap = solid(0x2b2b2b, 0.8);
  part(g, new THREE.CylinderGeometry(0.011, 0.011, 0.18, 14), [labelMaterial('pencil'), cap, cap], 0, 0.09, 0);
  fuseAt(g, 0, 0.18, 0);
  return g;
}

/** Anar: a paper cone about 10 cm tall standing on a small clay base; the fuse sits at the apex. */
function anar(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.028, 0.034, 0.02, 14), solid(CLAY, 0.9), 0, 0.01, 0);
  const label = labelMaterial('anar');
  part(g, new THREE.ConeGeometry(0.035, 0.1, 16), [label, solid(GERU, 0.8)], 0, 0.07, 0);
  fuseAt(g, 0, 0.12, 0);
  return g;
}

/** Chakri: a flat paper disc with a coil of wound fuse around it, about 7 cm across; fuse on the outer edge. */
function chakri(): THREE.Group {
  const g = new THREE.Group();
  const coil = part(g, new THREE.TorusGeometry(0.027, 0.008, 8, 28), solid(0xd9cdb0, 0.85), 0, 0.012, 0);
  coil.rotation.x = Math.PI / 2;
  const cap = solid(CRACKERS.chakri.tint, 0.7);
  part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), [labelMaterial('chakri'), cap, cap], 0, 0.012, 0);
  fuseAt(g, 0.035, 0.012, 0);
  return g;
}

/**
 * Rocket: a rocket tube on a long thin bamboo stick, standing in a green glass bottle unless `bottle` is false
 * (the thaali drops the bottle); fuse on the tube's top.
 */
function rocket(opts: ModelOptions): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x2e6b3c, roughness: 0.15, transparent: true, opacity: 0.8 });
  const bottleGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.02, 0),
      new THREE.Vector2(0.022, 0.01),
      new THREE.Vector2(0.022, 0.07),
      new THREE.Vector2(0.01, 0.085),
      new THREE.Vector2(0.01, 0.1),
      new THREE.Vector2(0, 0.1),
    ],
    12,
  );
  if (opts.bottle ?? true) part(g, bottleGeo, glass, 0, 0, 0).name = BOTTLE_NAME;
  part(g, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12), solid(GERU, 0.7), 0, 0.115, 0);
  part(g, new THREE.CylinderGeometry(0.0025, 0.0025, 0.25, 6), solid(BAMBOO, 0.8), 0, 0.255, 0);
  fuseAt(g, 0, 0.13, 0);
  return g;
}

/** Laxmi bomb: a fat red paper cylinder with a picture-style label and red caps; fuse on the top cap. */
function laxmi(): THREE.Group {
  const g = new THREE.Group();
  const cap = solid(GERU, 0.7);
  part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 18), [labelMaterial('laxmi'), cap, cap], 0, 0.025, 0);
  fuseAt(g, 0, 0.05, 0);
  return g;
}

/** Sutli bomb: a ball of twine wrapped around a core, with a short tail of fuse on top. */
function sutli(): THREE.Group {
  const g = new THREE.Group();
  const twine = solid(0xd9c49a, 0.95);
  part(g, new THREE.SphereGeometry(0.03, 16, 12), twine, 0, 0.03, 0);
  const wraps: Array<[number, number]> = [
    [0.3, 0],
    [1.2, 0.4],
    [-0.8, 0.9],
    [0.1, 1.6],
  ];
  for (const [rx, ry] of wraps) {
    const ring = part(g, new THREE.TorusGeometry(0.031, 0.0025, 6, 36), solid(0x9c7a4a, 0.9), 0, 0.03, 0);
    ring.rotation.set(rx, ry, 0);
  }
  part(g, new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 5), solid(0x8a7050, 0.9), 0, 0.075, 0);
  fuseAt(g, 0, 0.09, 0);
  return g;
}

/** Half the ladi's length along x, in metres; the laid curve runs from -LADI_HALF to +LADI_HALF. */
const LADI_HALF = 0.6;

/**
 * Point on the ladi's laid curve at parameter `s` (0 at the lit end, 1 at the far end), written into `out` in
 * the model's local space. Shared by the builder and the pops that walk the curve, so both agree exactly.
 */
export function ladiPoint(s: number, out: THREE.Vector3): THREE.Vector3 {
  const x = -LADI_HALF + 2 * LADI_HALF * s;
  const z = -0.1 * (1 - (x / LADI_HALF) ** 2);
  return out.set(x, 0.003, z);
}

/** Ladi: about twenty tiny red tubes standing on a braided fuse laid as a gentle curve about 1.2 m long. */
function ladi(): THREE.Group {
  const g = new THREE.Group();
  const tubeMat = solid(GERU, 0.7);
  const pts: THREE.Vector3[] = [];
  const count = LADI_TUBE_COUNT;
  for (let i = 0; i < count; i++) {
    const p = ladiPoint(i / (count - 1), new THREE.Vector3());
    pts.push(p);
    // Tagged so the ladi can hide each tube as its pop goes off.
    part(g, new THREE.CylinderGeometry(0.007, 0.007, 0.022, 8), tubeMat, p.x, 0.014, p.z).userData.ladiTube = true;
  }
  const braid = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), LADI_BRAID_SEGMENTS, 0.0018, 4, false);
  part(g, braid, solid(0xb08a5a, 0.9), 0, 0, 0).name = LADI_BRAID_NAME;
  fuseAt(g, -LADI_HALF, 0.004, 0);
  return g;
}

/** Saanp goli: a black tablet about 2 cm across sitting on a tiny sheet of paper; fuse on the tablet's top. */
function saanp(): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.03, 0.002, 0.03), solid(PAPER, 0.9), 0, 0.001, 0);
  part(g, new THREE.CylinderGeometry(0.01, 0.01, 0.008, 16), solid(0x1b1b1b, 0.5), 0, 0.006, 0);
  fuseAt(g, 0, 0.01, 0);
  return g;
}

/** Skyshot: a 15 cm card box with four tube holes on top and a fuse tail at the centre. */
function skyshot(): THREE.Group {
  const g = new THREE.Group();
  const label = labelMaterial('skyshot');
  const top = solid(CRACKERS.skyshot.tint, 0.7);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; label on the four sides, tint on top and bottom.
  part(g, new THREE.BoxGeometry(0.15, 0.15, 0.15), [label, label, top, top, label, label], 0, 0.075, 0);
  const hole = solid(0x111111, 1);
  for (const sx of [-0.035, 0.035]) {
    for (const sz of [-0.035, 0.035]) part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), hole, sx, 0.151, sz);
  }
  part(g, new THREE.CylinderGeometry(0.002, 0.002, 0.012, 5), solid(0x8a7050, 0.9), 0, 0.156, 0);
  fuseAt(g, 0, 0.162, 0);
  return g;
}

/** Per-model build options; only the rocket reads them today. */
interface ModelOptions {
  /** Whether the rocket stands in its green glass bottle; defaults to true. */
  bottle?: boolean;
}

const BUILDERS: Record<CrackerKind, (opts: ModelOptions) => THREE.Group> = {
  phuljhadi,
  pencil,
  anar,
  chakri,
  rocket,
  laxmi,
  sutli,
  ladi,
  saanp,
  skyshot,
};

/**
 * Builds a fresh model for one cracker kind; callers that place many copies should clone a cached one.
 * The label textures and materials are shared caches across all models: never dispose them per cracker,
 * or every other copy of that kind goes black.
 */
export function makeCrackerModel(kind: CrackerKind, opts: ModelOptions = {}): THREE.Group {
  return BUILDERS[kind](opts);
}
