// Paper akash kandils: star-shaped Diwali lanterns hung from cords, glowing in festive colours. Each is two instanced
// pieces (an elongated octahedron body and a tapering tail), drawn with an unlit material pushed above 1 so the bloom
// pass makes it glow. No lights are added; the glow is emissive only, and the lanterns sway a little in the breeze.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { postAnchor, wallBays } from './Aangan';

/** Where one lantern hangs: the point its cord is tied to, and its paper colour. */
export interface KandilSpot {
  anchor: THREE.Vector3;
  color: number;
  /** Length of the cord below the anchor, in metres. */
  drop: number;
}

/** Brightness multiplier on the paper colour; above 1 so the bloom catches it. */
const GLOW_GAIN = 2.2;
/** Body half-width and half-height of one lantern, in metres. */
const BODY_R = 0.17;
const BODY_H = 0.26;
/** Length of the tail below the body. */
const TAIL_LEN = 0.3;
/** Paper colours: saffron, rose, gold, turquoise and violet. */
export const KANDIL_COLORS = [0xff8a1a, 0xff4a7a, 0xffd23a, 0x30d0c0, 0xb060ff];

/** The hanging lanterns and their sway. */
export class Kandils implements Updatable {
  private readonly body: THREE.InstancedMesh;
  private readonly tail: THREE.InstancedMesh;
  private readonly cords: THREE.LineSegments;
  private readonly spots: KandilSpot[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  /** Builds every lantern and its cord and adds them to the scene. */
  constructor(scene: THREE.Scene, spots: KandilSpot[]) {
    this.spots = spots;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    // An octahedron stretched tall reads as the eight-pointed paper star seen from any side.
    const bodyGeo = new THREE.OctahedronGeometry(1, 0).scale(BODY_R, BODY_H, BODY_R);
    const tailGeo = new THREE.ConeGeometry(0.05, TAIL_LEN, 6, 1, true).translate(0, -TAIL_LEN / 2, 0);
    this.body = new THREE.InstancedMesh(bodyGeo, mat, spots.length);
    this.tail = new THREE.InstancedMesh(tailGeo, mat, spots.length);
    this.tail.rotation.x = 0;
    const c = new THREE.Color();
    const cord: number[] = [];
    spots.forEach((s, i) => {
      c.setHex(s.color).multiplyScalar(GLOW_GAIN);
      this.body.setColorAt(i, c);
      this.tail.setColorAt(i, c);
      cord.push(s.anchor.x, s.anchor.y, s.anchor.z, s.anchor.x, s.anchor.y - s.drop, s.anchor.z);
    });
    this.body.frustumCulled = false;
    this.tail.frustumCulled = false;
    this.cords = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cord, 3)),
      new THREE.LineBasicMaterial({ color: 0x5a3a20 }),
    );
    scene.add(this.body, this.tail, this.cords);
    this.update(0, 0);
  }

  /** Swings each lantern gently about its anchor; the phase differs per lantern so they never move in step. */
  update(_dt: number, t: number): void {
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const sway = 0.06 * Math.sin(t * 1.3 + i * 1.7);
      this.e.set(sway * 0.6, i, sway);
      this.q.setFromEuler(this.e);
      // The body hangs `drop` below the anchor, rotated about the anchor so the cord stays taut.
      this.pos.set(Math.sin(sway) * s.drop, -Math.cos(sway) * s.drop, 0).add(s.anchor);
      this.m.compose(this.pos, this.q, this.one);
      this.body.setMatrixAt(i, this.m);
      this.pos.y -= BODY_H * 0.9;
      this.m.compose(this.pos, this.q, this.one);
      this.tail.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
  }
}

/** Where the lanterns hang under the verandah eave, one per bay, alternating colours. */
export function verandahKandilSpots(postX: readonly number[]): KandilSpot[] {
  const spots: KandilSpot[] = [];
  const edges = [-8.6, ...postX, 8.6];
  for (let i = 0; i < edges.length - 1; i++) {
    const x = (edges[i] + edges[i + 1]) / 2;
    spots.push({
      anchor: new THREE.Vector3(x, 2.55, -6.55),
      color: KANDIL_COLORS[i % KANDIL_COLORS.length],
      drop: 0.35 + (i % 2) * 0.12,
    });
  }
  return spots;
}

/** Lanterns hung at the middle of every bay of the boundary wall, below the upper jhalar swag. */
export function wallKandilSpots(): KandilSpot[] {
  return wallBays().map(([a, b], i) => {
    const mid = postAnchor(a).add(postAnchor(b)).multiplyScalar(0.5);
    mid.y = 2.0;
    return { anchor: mid, color: KANDIL_COLORS[(i + 2) % KANDIL_COLORS.length], drop: 0.3 };
  });
}
