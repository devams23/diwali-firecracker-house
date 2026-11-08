// The cracker stall in the open aangan: a wooden counter with a maroon cloth front and a marigold garland, a low riser at
// the back, and eleven tilted cardboard boxes in two tiered rows, one per cracker kind, each holding a sample cracker. A
// striped awning on four posts shades it, a glowing header board reads "पटाखे · Patakhe" along the awning's front edge,
// a row of bulbs hangs under the board, and a warm lamp plus a soft spot make it the brightest spot in the courtyard. The
// boxes are the only restock: each is an interactable whose E press adds one pack of its kind.
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
/** Height of the step riser at the back of the counter, in metres, on which the back row of boxes stands. */
const RISER_H = 0.16;
/** Height of the awning posts, in metres. */
const POST_H = 1.85;
/** Size of one cracker box in metres: width along x, height, and depth along z (the label face looks at the player). */
const BOX_W = 0.2;
const BOX_H = 0.14;
const BOX_D = 0.2;
/** Spacing between neighbouring boxes along x in a row, in metres; five boxes make one row. */
const BOX_PITCH = 0.3;
/** Forward tilt of each box, in radians: the label leans up toward the player. */
const BOX_TILT = 0.25;
/** Height the box centre sits above its base so that a tilted corner never sinks into it, in metres. */
const BOX_LIFT = (BOX_H / 2) * Math.cos(BOX_TILT) + (BOX_D / 2) * Math.sin(BOX_TILT) + 0.01;
/** Size of the header signboard along the awning's front edge, in metres. */
const SIGN_W = STALL_W - 0.1;
const SIGN_H = 0.24;
/** Bulbs strung under the signboard, and the radius of each. */
const BULB_COUNT = 9;
const BULB_R = 0.022;
/** Marigold garland swagged along the counter front: bead count and bead radius. */
const GARLAND_N = 24;
const GARLAND_R = 0.026;
/** Half-width of the garland along x, in metres, so it runs just inside the counter's ends. */
const GARLAND_HW = STALL_W / 2 - 0.1;

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
 * Builds the counter, riser, boxes, awning, signboard, garland and lights of the stall into the scene, registers the
 * counter as a floor collider and returns the eleven boxes in CRACKER_ORDER.
 */
export function buildStall(scene: THREE.Scene, world: CollisionWorld, tex: Textures): StallBox[] {
  const stall = new THREE.Group();
  stall.position.set(STALL_CENTRE.x, 0, STALL_CENTRE.z);
  scene.add(stall);
  world.addBox(stallFootprint());

  // Counter: a wooden plinth the boxes stand on. Its front face (index 4 in BoxGeometry order, +z) is maroon cloth with
  // a gold border; the other faces stay wood.
  const wood = woodMaterial(tex, 1.5, 1, 0xe2b77c);
  const clothMap = clothTexture();
  const cloth = new THREE.MeshStandardMaterial({
    map: clothMap,
    // A little emission keeps the cloth from reading as near-black under the courtyard's dim light.
    emissive: 0xffffff,
    emissiveMap: clothMap,
    emissiveIntensity: 0.15,
    roughness: 0.85,
    metalness: 0,
  });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(STALL_W, COUNTER_H, STALL_D), [
    wood,
    wood,
    wood,
    wood,
    cloth,
    wood,
  ]);
  counter.position.y = COUNTER_H / 2;
  stall.add(counter);

  // Marigold garland: a row of small orange beads that swags along the counter front, sagging between its two ends.
  const beadGeo = new THREE.SphereGeometry(GARLAND_R, 8, 6);
  const beadMat = new THREE.MeshStandardMaterial({
    color: 0xff9a1f,
    emissive: 0xff7a00,
    emissiveIntensity: 0.35,
    roughness: 0.6,
    metalness: 0,
  });
  for (let k = 0; k < GARLAND_N; k++) {
    // t runs from -1 at the left end to +1 at the right; the bead dips lowest in the middle of the swag.
    const t = (k / (GARLAND_N - 1)) * 2 - 1;
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.position.set(t * GARLAND_HW, COUNTER_H - 0.05 - 0.05 * (1 - t * t), STALL_D / 2 + 0.02);
    stall.add(bead);
  }

  // Step riser at the back of the counter: the back row of boxes stands on it, so both rows show their labels.
  const riser = new THREE.Mesh(new THREE.BoxGeometry(SIGN_W - 0.1, RISER_H, 0.36), woodMaterial(tex, 1.2, 0.5, 0xe2b77c));
  riser.position.set(0, COUNTER_H + RISER_H / 2, -0.22);
  stall.add(riser);

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

  // Striped cloth canopy, pitched over the counter and overhanging the front. The stripes are emissive so the underside
  // reads as lit by the lamps rather than a dark cut-out.
  const stripes = stripeTexture();
  const clothCanopy = new THREE.MeshStandardMaterial({
    map: stripes,
    emissive: 0xffffff,
    emissiveMap: stripes,
    emissiveIntensity: 0.25,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(STALL_W + 0.3, STALL_D + 0.5), clothCanopy);
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.set(0, POST_H, 0.1);
  stall.add(canopy);

  // Header signboard along the top front edge of the awning, tilted slightly down toward the player. It is a cream and
  // saffron board with maroon lettering, and its emissive map makes it glow softly.
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 0.6,
    roughness: 0.8,
    metalness: 0,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), signMat);
  sign.position.set(0, POST_H - 0.16, STALL_D / 2 + 0.36);
  // A positive x turn tips the face's normal downward, so the board faces the player on the approach.
  sign.rotation.x = 0.2;
  stall.add(sign);

  // Bulbs hung just under the signboard, all one shared geometry and an emissive material so each reads as a lit bulb.
  const bulbGeo = new THREE.SphereGeometry(BULB_R, 8, 6);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffd98a,
    emissive: 0xffb84d,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0,
  });
  for (let i = 0; i < BULB_COUNT; i++) {
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-0.85 + (i * 1.7) / (BULB_COUNT - 1), POST_H - 0.34, STALL_D / 2 + 0.4);
    stall.add(bulb);
  }

  // One warm point lamp under the canopy, just behind the bulbs, lighting the boxes and the board: the stall's share of
  // the point-light budget.
  const lamp = new THREE.PointLight(0xffc27a, 2, 10, 2);
  lamp.position.set(0, POST_H - 0.3, 0.5);
  stall.add(lamp);

  // A soft spot from in front and above the counter, so the top of the table and the boxes are well lit from the
  // approach. It is a spot rather than a point light, so the point-light budget is unchanged.
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, COUNTER_H, 0);
  stall.add(spotTarget);
  const spot = new THREE.SpotLight(0xfff0d8, 3, 9, 0.7, 0.9, 2);
  spot.position.set(0, 2.2, 2.8);
  spot.target = spotTarget;
  stall.add(spot);

  // Eleven boxes, one per kind: the first six form the back row on the riser, the rest the front row on the counter. Each
  // is tipped forward by a hand-chosen amount so the row looks loose.
  const r = rng(616);
  const boxes: StallBox[] = [];
  CRACKER_ORDER.forEach((kind, i) => {
    const cardboard = new THREE.MeshStandardMaterial({ color: CARDBOARD, roughness: 0.95, metalness: 0 });
    const inside = new THREE.MeshStandardMaterial({ color: CARDBOARD_INSIDE, roughness: 1, metalness: 0 });
    const label = new THREE.MeshStandardMaterial({ map: boxLabelTexture(kind), roughness: 0.9, metalness: 0 });
    // Box faces in BoxGeometry order: +x, -x, +y (open top), -y, +z (label face), -z.
    const mats = [cardboard, cardboard, inside, cardboard, label, cardboard];
    const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), mats);

    // With an odd number of kinds the back row takes the extra box; each row is centred on its own length.
    const backCount = Math.ceil(CRACKER_ORDER.length / 2);
    const back = i < backCount;
    const col = back ? i : i - backCount;
    const rowLen = back ? backCount : CRACKER_ORDER.length - backCount;
    const x = (col - (rowLen - 1) / 2) * BOX_PITCH;
    // The back row stands on the riser, the front row on the counter top, and each sits clear of the other row.
    const baseY = back ? COUNTER_H + RISER_H : COUNTER_H;
    const z = back ? -0.22 : 0.14;
    box.rotation.set(-BOX_TILT + (r() - 0.5) * 0.06, (r() - 0.5) * 0.5, (r() - 0.5) * 0.08);
    box.position.set(x, baseY + BOX_LIFT, z);

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

/** Maroon cloth with a gold border for the counter front, drawn as one texture over the whole face. */
function clothTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#6e1a24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Gold border, inset from the edge, and a thin inner line so the band reads as embroidered trim.
    ctx.strokeStyle = '#e0a93a';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Draws the signboard: "पटाखे · Patakhe" in deep maroon on cream, inside a saffron border. */
function drawSign(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  // A deeper saffron-cream ground: the emissive map adds light on top of it, and a near-white ground would clip to glare.
  ctx.fillStyle = '#eeb963';
  ctx.fillRect(0, 0, w, h);
  // Saffron outer border and a thin maroon rule inside it.
  ctx.strokeStyle = '#e89a2a';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = '#7a1c22';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.fillStyle = '#6b1020';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '64px "Tiro Devanagari Hindi", Inter, serif';
  ctx.fillText('पटाखे · Patakhe', w / 2, h / 2 + 2);
}

/** Signboard canvas texture, redrawn once the Devanagari font is ready so the first paint is not a fallback. */
function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // Same proportions as the board (SIGN_W by SIGN_H), so the lettering is not stretched.
  canvas.width = 900;
  canvas.height = Math.round(900 * (SIGN_H / SIGN_W));
  drawSign(canvas);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  document.fonts
    ?.load('64px "Tiro Devanagari Hindi"')
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
  ctx.fillRect(12, 14, w - 24, h - 28);
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
  // Same proportions as the box's label face (BOX_W by BOX_H), so the label is not stretched.
  canvas.width = 256;
  canvas.height = Math.round(256 * (BOX_H / BOX_W));
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
