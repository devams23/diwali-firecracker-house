// The cracker stall in the open aangan: a low wooden counter with ten tilted cardboard boxes, one per cracker kind, each
// holding a sample cracker. A striped awning on four posts shades it, a signboard reads "पटाखे · Patakhe", a row of bulbs
// runs along the awning edge, and one warm point light makes it the brightest spot in the courtyard. The boxes are the
// only restock: each is an interactable whose E press adds one pack of its kind.
import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import { CRACKER_ORDER, CRACKERS, type CrackerKind } from '../crackers/catalog';
import { makeCrackerModel } from '../items/crackerModels';
import { woodMaterial } from './Aangan';
import { STALL_CENTRE, STALL_D, STALL_W, stallFootprint } from './stallLayout';
import { rng, type Textures } from './textures';

/** Cardboard of the cracker boxes, muted to match the lime and earth tones. */
const CARDBOARD = 0xb08a58;
const CARDBOARD_INSIDE = 0x3a2a18;
/** Height of the counter top above the courtyard floor, in metres. */
const COUNTER_H = 0.5;
/** Height of the awning posts, in metres. */
const POST_H = 1.85;
/** Size of one cracker box in metres: width along x, height, and depth along z (the label end faces the player). */
const BOX_W = 0.14;
const BOX_H = 0.11;
const BOX_D = 0.46;
/** Spacing between neighbouring boxes along x, in metres. */
const BOX_PITCH = 0.15;
/** Bulbs strung along the front of the awning, and the radius of each. */
const BULB_COUNT = 9;
const BULB_R = 0.022;

/** One cracker box on the stall: its kind, where it stands in the world, and the mesh the crosshair aims at. */
export interface StallBox {
  /** The cracker kind this box sells. */
  kind: CrackerKind;
  /** The box's world position, used for the sound of a purchase. */
  position: THREE.Vector3;
  /** The box mesh, which is the root the crosshair aims at and highlights. */
  object: THREE.Mesh;
}

/**
 * Builds the counter, boxes, awning, signboard and lamp of the stall into the scene, registers the counter as a floor
 * collider and returns the ten boxes in CRACKER_ORDER.
 */
export function buildStall(scene: THREE.Scene, world: CollisionWorld, tex: Textures): StallBox[] {
  const stall = new THREE.Group();
  stall.position.set(STALL_CENTRE.x, 0, STALL_CENTRE.z);
  scene.add(stall);
  world.addBox(stallFootprint());

  // Counter: a wooden plinth the boxes stand on.
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(STALL_W, COUNTER_H, STALL_D),
    woodMaterial(tex, 1.5, 1, 0xc49a62),
  );
  counter.position.y = COUNTER_H / 2;
  stall.add(counter);

  // Four posts at the corners carry the awning.
  const postMat = woodMaterial(tex, 0.3, 1.5, 0x9c7048);
  const postX = STALL_W / 2 - 0.03;
  const postZ = STALL_D / 2 - 0.03;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, POST_H, 8), postMat);
      post.position.set(sx * postX, POST_H / 2, sz * postZ);
      stall.add(post);
    }
  }

  // Striped cloth canopy, pitched over the counter and overhanging the front, with a valance along its front edge.
  const cloth = new THREE.MeshStandardMaterial({
    map: stripeTexture(),
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W + 0.3, STALL_D + 0.5), cloth);
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.set(0, POST_H, 0.1);
  stall.add(canopy);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W + 0.3, 0.18), cloth);
  valance.position.set(0, POST_H - 0.09, STALL_D / 2 + 0.35);
  stall.add(valance);

  // Bulbs hung just under the valance, all one shared geometry and material.
  const bulbGeo = new THREE.SphereGeometry(BULB_R, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  for (let i = 0; i < BULB_COUNT; i++) {
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-0.85 + (i * 1.7) / (BULB_COUNT - 1), POST_H - 0.19, STALL_D / 2 + 0.37);
    stall.add(bulb);
  }

  // Signboard on the front of the counter, between the posts.
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, metalness: 0 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W - 0.12, 0.36), signMat);
  sign.position.set(0, 0.84, STALL_D / 2 + 0.03);
  stall.add(sign);

  // One warm lamp under the canopy: the stall's share of the point-light budget.
  const lamp = new THREE.PointLight(0xffc27a, 3, 9, 2);
  lamp.position.set(0, POST_H - 0.2, 0.3);
  stall.add(lamp);

  // Ten boxes, one per kind, tilted by hand so the row looks loose.
  const r = rng(616);
  const boxes: StallBox[] = [];
  CRACKER_ORDER.forEach((kind, i) => {
    const cardboard = new THREE.MeshStandardMaterial({ color: CARDBOARD, roughness: 0.95, metalness: 0 });
    const inside = new THREE.MeshStandardMaterial({ color: CARDBOARD_INSIDE, roughness: 1, metalness: 0 });
    const label = new THREE.MeshStandardMaterial({ map: boxLabelTexture(kind), roughness: 0.9, metalness: 0 });
    // Box faces in BoxGeometry order: +x, -x, +y (open top), -y, +z (label end), -z.
    const mats = [cardboard, cardboard, inside, cardboard, label, cardboard];
    const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), mats);
    // A small turn, lean and tip, lifted so no corner sinks into the counter.
    box.rotation.set((r() - 0.5) * 0.08, (r() - 0.5) * 0.5, (r() - 0.5) * 0.16);
    box.position.set((i - (CRACKER_ORDER.length - 1) / 2) * BOX_PITCH, COUNTER_H + BOX_H / 2 + 0.012, 0);
    // A sample cracker rests in each open box, so the box reads as the one that sells it.
    const sample = makeCrackerModel(kind);
    sample.position.y = BOX_H / 2 - 0.02;
    sample.rotation.y = r() * Math.PI;
    box.add(sample);
    stall.add(box);
    boxes.push({ kind, position: new THREE.Vector3(), object: box });
  });

  // Box positions in world space, now that the stall group has its transform.
  stall.updateMatrixWorld(true);
  for (const b of boxes) b.object.getWorldPosition(b.position);
  return boxes;
}

/** Vertical stripes of festive red and gold for the awning cloth. */
function stripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const band = canvas.width / 8;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#b3261e' : '#f2c14e';
      ctx.fillRect(i * band, 0, band, canvas.height);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Draws the signboard: "पटाखे · Patakhe" in gold on maroon, inside a gold border. */
function drawSign(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#5a1a14';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8b84a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#f6d77a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '50px "Tiro Devanagari Hindi", Inter, serif';
  ctx.fillText('पटाखे · Patakhe', w / 2, h / 2);
}

/** Signboard canvas texture, redrawn once the Devanagari font is ready so the first paint is not a fallback. */
function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 128;
  drawSign(canvas);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  document.fonts
    ?.load('50px "Tiro Devanagari Hindi"')
    .then(() => {
      drawSign(canvas);
      map.needsUpdate = true;
    })
    .catch(() => undefined);
  return map;
}

/** Local css hex string for canvas drawing. */
function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
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
