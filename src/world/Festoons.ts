// Festive decorations for the house and the aangan: jhalar string lights swagged between the verandah posts and
// along the courtyard wall, and marigold garlands on the verandah beam, the posts and over the gate. The bulbs cycle
// colour and brightness in three patterns that switch every PATTERN_SECONDS. Everything is procedural: instanced
// spheres for bulbs and flowers, and line segments for the wires.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { POST_X } from './House';
import { GATE_HALF, SOUTH_INNER_Z } from './Aangan';

/** Seconds each light pattern runs before the next one takes over. */
const PATTERN_SECONDS = 20;
/** Bulb colours in the order the strings cycle through them: warm gold, saffron, rose red, green and warm white. */
const BULB_COLORS = [0xffc04a, 0xff8a1a, 0xe0344a, 0x4cc46a, 0xfff0d0].map((hex) => new THREE.Color(hex));
/** Brightness multiplier on each bulb colour; above 1 so the bright bulbs reach the bloom threshold. */
const BULB_GAIN = 1.8;
/** Radius of one jhalar bulb, in metres. */
const BULB_RADIUS = 0.022;
/** Spacing between bulbs along a string, in metres. */
const BULB_SPACING = 0.1;
/** Marigold colours, mixed across a garland so it reads as hand-strung. */
const FLOWER_COLORS = [0xf2a01f, 0xff7a10, 0xffc83a].map((hex) => new THREE.Color(hex));
/** Radius of one marigold, in metres. */
const FLOWER_RADIUS = 0.04;
/** Spacing between marigolds along a garland, in metres. */
const FLOWER_SPACING = 0.075;
/** Z of the jhalar rows under the verandah eave, just in front of the beam. */
const JHALAR_Z = -6.72;
/** Z of the marigold garlands, a little further out than the jhalar so the two never share a point. */
const GARLAND_Z = -6.9;
/** Z of the courtyard jhalar and the gate arch, on the inner side of the south wall. */
const COURTYARD_Z = SOUTH_INNER_Z - 0.2;
/** Number of distinct bulb colours in BULB_COLORS. */
const COLOR_COUNT = BULB_COLORS.length;

/** A point on a swag between two anchors at parameter s (0 to 1); the swag sags by `sag` metres at its middle. */
function swagPoint(a: THREE.Vector3, b: THREE.Vector3, sag: number, s: number): THREE.Vector3 {
  const p = new THREE.Vector3().lerpVectors(a, b, s);
  p.y -= 4 * sag * s * (1 - s);
  return p;
}

/** Points along a swag between two anchors, about `spacing` metres apart, with both ends included. */
function sampleSwag(a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number): THREE.Vector3[] {
  const count = Math.max(2, Math.ceil(a.distanceTo(b) / spacing) + 1);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) points.push(swagPoint(a, b, sag, i / (count - 1)));
  return points;
}

/** Points along the upper half of a gate arch of the given radius, centred on (0, centreY) in the plane z. */
function gateArch(radius: number, centreY: number, z: number): THREE.Vector3[] {
  const count = Math.ceil((Math.PI * radius) / FLOWER_SPACING) + 1;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / (count - 1)) * Math.PI;
    points.push(new THREE.Vector3(-radius * Math.cos(theta), centreY + radius * Math.sin(theta), z));
  }
  return points;
}

/** Every jhalar string: two rows under the verandah eave, one swag per bay, and two strings along the courtyard wall. */
function jhalarStrands(): THREE.Vector3[][] {
  const strands: THREE.Vector3[][] = [];
  const edges = [-9, ...POST_X, 9];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = edges[i];
    const x1 = edges[i + 1];
    strands.push(sampleSwag(new THREE.Vector3(x0, 2.5, JHALAR_Z), new THREE.Vector3(x1, 2.5, JHALAR_Z), 0.3, BULB_SPACING));
    strands.push(sampleSwag(new THREE.Vector3(x0, 2.38, JHALAR_Z), new THREE.Vector3(x1, 2.38, JHALAR_Z), 0.22, BULB_SPACING));
  }
  const wallY = 2.25;
  const left = [new THREE.Vector3(-8.8, wallY, COURTYARD_Z), new THREE.Vector3(-GATE_HALF - 0.1, wallY, COURTYARD_Z)];
  const right = [new THREE.Vector3(GATE_HALF + 0.1, wallY, COURTYARD_Z), new THREE.Vector3(8.8, wallY, COURTYARD_Z)];
  strands.push(sampleSwag(left[0], left[1], 0.2, BULB_SPACING));
  strands.push(sampleSwag(right[0], right[1], 0.2, BULB_SPACING));
  return strands;
}

/** Every marigold garland: swags along the verandah beam, drops down the outer posts, and an arch over the gate. */
function garlandStrands(): THREE.Vector3[][] {
  const strands: THREE.Vector3[][] = [];
  const beamY = 2.36;
  for (let i = 0; i < POST_X.length - 1; i++) {
    strands.push(
      sampleSwag(
        new THREE.Vector3(POST_X[i], beamY, GARLAND_Z),
        new THREE.Vector3(POST_X[i + 1], beamY, GARLAND_Z),
        0.3,
        FLOWER_SPACING,
      ),
    );
  }
  for (const x of [POST_X[0], POST_X[1], POST_X[4], POST_X[5]]) {
    strands.push(
      sampleSwag(new THREE.Vector3(x, beamY, GARLAND_Z), new THREE.Vector3(x, 1.5, GARLAND_Z), 0.03, FLOWER_SPACING),
    );
  }
  strands.push(gateArch(0.75, 1.7, COURTYARD_Z - 0.02));
  return strands;
}

/**
 * The jhalar string lights and marigold garlands. Bulbs are one InstancedMesh whose instance colours are rewritten
 * each frame; flowers are a second, static InstancedMesh; the wires are one LineSegments object.
 */
export class Festoons implements Updatable {
  private readonly bulbs: THREE.InstancedMesh;
  /** Colour index per bulb (0 to COLOR_COUNT - 1), so neighbours along a string get different colours. */
  private readonly bulbColor: Uint8Array;
  /** Phase offset per bulb, so a chase wave travels along each string and the twinkle does not sync up. */
  private readonly bulbPhase: Float32Array;
  private readonly tint = new THREE.Color();

  /** Builds the strings, bulbs, wires and garlands and adds them to the scene. */
  constructor(scene: THREE.Scene) {
    const bulbPoints: THREE.Vector3[] = [];
    const bulbColor: number[] = [];
    const bulbPhase: number[] = [];
    const wire: number[] = [];

    for (const strand of jhalarStrands()) {
      for (let j = 0; j < strand.length; j++) {
        const p = strand[j];
        bulbPoints.push(p);
        bulbColor.push(j % COLOR_COUNT);
        bulbPhase.push(j * 0.35);
        if (j > 0) {
          const q = strand[j - 1];
          wire.push(q.x, q.y, q.z, p.x, p.y, p.z);
        }
      }
    }
    this.bulbColor = Uint8Array.from(bulbColor);
    this.bulbPhase = Float32Array.from(bulbPhase);

    this.bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(BULB_RADIUS, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      bulbPoints.length,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < bulbPoints.length; i++) {
      m.makeTranslation(bulbPoints[i].x, bulbPoints[i].y, bulbPoints[i].z);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, BULB_COLORS[this.bulbColor[i]]);
    }
    this.bulbs.instanceMatrix.needsUpdate = true;
    scene.add(this.bulbs);

    const wires = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)),
      new THREE.LineBasicMaterial({ color: 0x3a2a1a }),
    );
    scene.add(wires);

    const flowerPoints: THREE.Vector3[] = garlandStrands().flat();
    const flowers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(FLOWER_RADIUS, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, emissive: 0x3a1800, emissiveIntensity: 0.6 }),
      flowerPoints.length,
    );
    for (let i = 0; i < flowerPoints.length; i++) {
      const p = flowerPoints[i];
      m.makeTranslation(p.x, p.y, p.z);
      flowers.setMatrixAt(i, m);
      flowers.setColorAt(i, FLOWER_COLORS[i % FLOWER_COLORS.length]);
    }
    flowers.instanceMatrix.needsUpdate = true;
    scene.add(flowers);
  }

  /**
   * Rewrites the bulb colours for the current pattern. Pattern 0 shifts the colours along each string, pattern 1 runs
   * a brightness wave along the strings, and pattern 2 twinkles each bulb at its own rate; the pattern changes every
   * PATTERN_SECONDS.
   */
  update(_dt: number, t: number): void {
    const pattern = Math.floor(t / PATTERN_SECONDS) % 3;
    const shift = Math.floor(t * 1.5);
    const count = this.bulbColor.length;
    for (let i = 0; i < count; i++) {
      const phase = this.bulbPhase[i];
      let colorIndex = this.bulbColor[i];
      let level = 1;
      if (pattern === 0) {
        colorIndex = (colorIndex + shift) % COLOR_COUNT;
      } else if (pattern === 1) {
        level = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 4 - phase));
      } else {
        level = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.3 + phase * 3));
      }
      this.tint.copy(BULB_COLORS[colorIndex]).multiplyScalar(BULB_GAIN * level);
      this.bulbs.setColorAt(i, this.tint);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
