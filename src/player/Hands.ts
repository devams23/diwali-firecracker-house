// Stylised first-person hands: a cream kurta sleeve with its cuff at the wrist, warm brown skin from the wrist down,
// a rounded palm with four finger capsules and a thumb. They are parented to the player camera; the right hand
// grips the agarbatti and jabs forward to light fuses, and the left hand cradles the thaali.
// The caller must add the camera to the scene, since children of a camera only render when it is in the scene.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Updatable } from '../core/Engine';

/** Off-white kurta cream for the sleeves and cuffs; warmer than white so the blue night light does not grey it. */
const KURTA = 0xf3e0b5;
/** Warm brown skin for the hands and wrists. */
const SKIN = 0x8a5a3c;
/** Camera-local rest position of the right wrist; well clear of the 0.05 m near plane. */
const RIGHT_BASE = new THREE.Vector3(0.28, -0.3, -0.5);
/**
 * Camera-local rest position of the left wrist. Pulled forward and up so the near rim of a plate held here
 * sits within the 35° half-field of view below the centre of the screen.
 */
const LEFT_BASE = new THREE.Vector3(-0.3, -0.28, -0.6);
/** Radius of the forearm sleeve, in metres. */
const SLEEVE_RADIUS = 0.058;
/** Radius of the cream cuff band at the wrist, slightly wider than the sleeve, in metres. */
const CUFF_RADIUS = 0.063;
/** Radius of the wrist skin where it meets the sleeve, in metres. */
const WRIST_RADIUS = 0.034;
const POKE_TIME = 0.25;
const POKE_DIST = 0.12;
const BREATH_AMP = 0.004;
const SWAY_GAIN = 0.0012;
const SWAY_MAX = 0.04;
/** How fast the sway target relaxes back to rest, per second. */
const SWAY_DECAY = 4;
/** How fast the hands catch up to the sway target, per second. */
const SWAY_FOLLOW = 10;

/** Clamps v into [-limit, limit]. */
function clamp(v: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, v));
}

/** Both hands with their sleeves, parented to the camera; holds items, pokes forward and sways with the mouse. */
export class Hands implements Updatable {
  /** Right hand group, a child of the camera. */
  readonly right = new THREE.Group();
  /** Left hand group, a child of the camera. */
  readonly left = new THREE.Group();

  private readonly rightGrip = new THREE.Group();
  private readonly leftGrip = new THREE.Group();
  private readonly swayTarget = new THREE.Vector2();
  private readonly swayPos = new THREE.Vector2();
  private pokeLeft = 0;

  /** Builds both hands and attaches them to the camera; the camera itself must be added to the scene. */
  constructor(camera: THREE.PerspectiveCamera) {
    const kurta = new THREE.MeshStandardMaterial({ color: KURTA, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });

    this.right.position.copy(RIGHT_BASE);
    this.left.position.copy(LEFT_BASE);
    this.rightGrip.position.set(0, 0.02, -0.1);
    this.leftGrip.position.set(0, 0.015, -0.1);

    // Right hand: the wrist is the origin, the forearm runs back toward the viewer (+z), and the palm closes
    // around the agarbatti grip in front of it. Four fingers curl over the grip, the thumb sits on the inner side.
    this.right.add(
      ...sleeveAndWrist(kurta, skin),
      palm(0.09, 0.035, 0.1, skin, 0, 0, -0.06),
      this.rightGrip,
    );
    for (let i = 0; i < 4; i++) {
      this.right.add(limb(0.011, 0.06, skin, -0.033 + i * 0.022, 0.028, -0.13, 0.5));
    }
    this.right.add(limb(0.012, 0.05, skin, -0.05, 0.02, -0.09, 0, 0.5));

    // Left hand: palm flat under the thaali, four fingers curling up over its near rim, thumb on the outer side.
    this.left.add(
      ...sleeveAndWrist(kurta, skin),
      palm(0.13, 0.03, 0.11, skin, 0.005, -0.015, -0.07),
      this.leftGrip,
    );
    for (let i = 0; i < 4; i++) {
      this.left.add(limb(0.011, 0.05, skin, -0.045 + i * 0.03, 0.012, -0.16, -0.35));
    }
    this.left.add(limb(0.012, 0.05, skin, 0.075, 0.02, -0.1, 0, -0.5));

    // Hands skip frustum culling (their bounds sit at the screen edge) and draw after other opaque
    // geometry; depth testing still hides them behind anything nearer, which is the desired result.
    for (const hand of [this.right, this.left]) {
      hand.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.frustumCulled = false;
          o.renderOrder = 10;
        }
      });
    }
    camera.add(this.right, this.left);
  }

  /** Object that items held in the left hand are attached to; HandHeld.attach() takes this anchor. */
  get leftHold(): THREE.Object3D {
    return this.leftGrip;
  }

  /** Puts an object (the agarbatti) into the right hand, or clears the hand when given null. */
  holdRight(obj: THREE.Object3D | null): void {
    this.rightGrip.clear();
    if (obj) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(-0.25, 0, 0);
      this.rightGrip.add(obj);
    }
  }

  /** Puts an object (the thaali) into the left hand, or clears the hand when given null. */
  holdLeft(obj: THREE.Object3D | null): void {
    this.leftGrip.clear();
    if (obj) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0.2, 0, 0);
      this.leftGrip.add(obj);
    }
  }

  /** Starts the right-hand forward jab used to touch a fuse; it lasts POKE_TIME seconds. */
  poke(): void {
    this.pokeLeft = POKE_TIME;
  }

  /** Nudges the hands opposite to the mouse movement this frame; the hands lag and then settle back. */
  sway(mouseDx: number, mouseDy: number): void {
    this.swayTarget.x = clamp(this.swayTarget.x - mouseDx * SWAY_GAIN, SWAY_MAX);
    this.swayTarget.y = clamp(this.swayTarget.y - mouseDy * SWAY_GAIN, SWAY_MAX);
  }

  /** Applies the idle breathing bob, the mouse-sway lag and the poke jab to the two hand groups. */
  update(dt: number, t: number): void {
    this.swayTarget.multiplyScalar(Math.exp(-SWAY_DECAY * dt));
    this.swayPos.lerp(this.swayTarget, 1 - Math.exp(-SWAY_FOLLOW * dt));

    const breathY = Math.sin(t * 1.7) * BREATH_AMP;
    const breathX = Math.sin(t * 0.85) * BREATH_AMP * 0.5;

    let jab = 0;
    if (this.pokeLeft > 0) {
      this.pokeLeft = Math.max(0, this.pokeLeft - dt);
      jab = Math.sin((1 - this.pokeLeft / POKE_TIME) * Math.PI) * POKE_DIST;
    }

    this.right.position.set(
      RIGHT_BASE.x + this.swayPos.x + breathX,
      RIGHT_BASE.y + this.swayPos.y + breathY,
      RIGHT_BASE.z - jab,
    );
    this.left.position.set(
      LEFT_BASE.x + this.swayPos.x * 0.6 + breathX * 0.5,
      LEFT_BASE.y + this.swayPos.y * 0.6 + breathY * 0.6,
      LEFT_BASE.z,
    );
  }
}

/**
 * The forearm parts shared by both hands: the cream sleeve running back toward the viewer, the cuff band at the
 * wrist, and the short skin wrist that joins the sleeve to the palm. All sit on the wrist axis (the z axis).
 */
function sleeveAndWrist(kurta: THREE.Material, skin: THREE.Material): THREE.Mesh[] {
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(SLEEVE_RADIUS, SLEEVE_RADIUS, 0.28, 16), kurta);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(0, 0, 0.2);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(CUFF_RADIUS, CUFF_RADIUS, 0.03, 16), kurta);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, 0.05);
  const wrist = limb(WRIST_RADIUS, 0.04, skin, 0, 0, 0);
  return [sleeve, cuff, wrist];
}

/**
 * A rounded palm box at a position. Its size is the hand's width, thickness and length; the length runs along z so
 * the fingers sit beyond it.
 */
function palm(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.014), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * A capsule limb (a finger, the thumb or the wrist) of the given radius and straight length at a position. The
 * capsule lies along the z axis, pointing forward from the wrist, and `tiltX` and `tiltZ` (radians) bend it: a finger
 * tilts down over the grip, and the thumb angles across the palm.
 */
function limb(
  radius: number,
  length: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  tiltX = 0,
  tiltZ = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), mat);
  // CapsuleGeometry runs along y; a quarter turn about x lays it along z.
  mesh.rotation.set(Math.PI / 2 + tiltX, 0, tiltZ);
  mesh.position.set(x, y, z);
  return mesh;
}
