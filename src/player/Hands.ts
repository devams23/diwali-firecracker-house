// Stylised first-person hands: a slim cream kurta sleeve that flares open toward the bottom of the screen, warm
// brown skin from the wrist down, a rounded palm and two-segment fingers curled into a loose grip, with a thumb.
// They are parented to the player camera; the right hand grips the agarbatti and jabs forward to light fuses, and
// the left hand cradles the thaali. With the left hand empty it rests lower, partly out of frame.
// The caller must add the camera to the scene, since children of a camera only render when it is in the scene.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Updatable } from '../core/Engine';

/** Off-white kurta cream for the sleeves and cuffs; warmer than white so the blue night light does not grey it. */
const KURTA = 0xd9c49a;
/** Natural warm brown skin for the hands and wrists. */
const SKIN = 0x9a6a4a;
/** Camera-local rest position of the right wrist; well clear of the 0.05 m near plane. */
const RIGHT_BASE = new THREE.Vector3(0.3, -0.34, -0.5);
/**
 * Camera-local rest position of the left wrist when it holds the thaali. Pulled forward and up so the near rim of a
 * plate held here sits within the 35° half-field of view below the centre of the screen.
 */
const LEFT_BASE = new THREE.Vector3(-0.32, -0.32, -0.6);
/**
 * Camera-local rest position of the left wrist when empty: lower and further out, so the hand sits partly below the
 * bottom edge of the frame.
 */
const LEFT_REST = new THREE.Vector3(-0.3, -0.42, -0.5);
/** How fast the left hand glides between its held and empty rest positions, per second. */
const LEFT_SETTLE = 6;
/** Radius of the sleeve at the wrist end, in metres. */
const SLEEVE_WRIST_RADIUS = 0.028;
/** Radius of the sleeve's open end, nearest the camera, in metres; the cloth flares a little toward it. */
const SLEEVE_OPEN_RADIUS = 0.04;
/** Length of the sleeve from the wrist toward the camera, in metres. Long enough to leave the bottom of the frame. */
const SLEEVE_LENGTH = 0.26;
/** Radius of the cream cuff band at the wrist, slightly wider than the sleeve, in metres. */
const CUFF_RADIUS = 0.033;
/** Radius of the wrist skin where it meets the sleeve, in metres. */
const WRIST_RADIUS = 0.026;
/** Uniform scale of both hand groups; about three quarters of the earlier size. */
const HAND_SCALE = 0.975;
/** Radius of each finger and the thumb, in metres. */
const FINGER_RADIUS = 0.012;
/** Straight length of the proximal and distal finger segments, in metres. */
const FINGER_SEG_1 = 0.026;
const FINGER_SEG_2 = 0.02;
/** Curl of the right fingers over the grip (radians): the first segment at about 45°, the second about 70° in all. */
const RIGHT_CURL: [number, number] = [-0.78, -0.44];
/** Curl of the left fingers up over the plate's near rim (radians): about 40° then 65° in all. */
const LEFT_CURL: [number, number] = [0.7, 0.4];
/**
 * Pose of each hand relative to its wrist (radians). The palms turn so the back of the hand faces the camera and
 * up, the way a hand looks when held in front of the face; the left palm still cups the plate from below.
 */
const RIGHT_POSE = new THREE.Euler(0.35, -0.2, 0.3);
const LEFT_POSE = new THREE.Euler(0.2, 0.1, -0.3);
/** Warm fill light at the camera so the hands and the thaali stay readable in any lighting. */
const FILL_COLOR = 0xffb070;
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
  private readonly leftPos = LEFT_REST.clone();
  private leftFull = false;
  private pokeLeft = 0;

  /** Builds both hands and attaches them to the camera; the camera itself must be added to the scene. */
  constructor(camera: THREE.PerspectiveCamera) {
    const kurta = new THREE.MeshStandardMaterial({
      color: KURTA,
      roughness: 0.9,
      emissive: 0x2a1a0c,
      emissiveIntensity: 0.4,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN,
      roughness: 0.6,
      emissive: SKIN,
      emissiveIntensity: 0.25,
    });

    this.right.position.copy(RIGHT_BASE);
    this.left.position.copy(LEFT_REST);
    this.right.scale.setScalar(HAND_SCALE);
    this.left.scale.setScalar(HAND_SCALE);

    // Each hand has a pose group, so the palm, fingers, grip and sleeve all turn together around the wrist.
    const rightPose = new THREE.Group();
    rightPose.rotation.copy(RIGHT_POSE);
    this.rightGrip.position.set(0, 0.02, -0.1);
    rightPose.add(
      ...sleeveAndWrist(kurta, skin),
      palm(0.09, 0.035, 0.1, skin, 0, 0, -0.06),
      this.rightGrip,
    );
    for (let i = 0; i < 4; i++) {
      rightPose.add(finger(skin, -0.039 + i * 0.026, 0.024, -0.13, RIGHT_CURL));
    }
    rightPose.add(thumb(skin, -0.05, 0.016, -0.09, 0.5));
    this.right.add(rightPose);

    // Left hand: palm flat under the thaali, fingers curling up over its near rim, thumb on the outer side.
    const leftPose = new THREE.Group();
    leftPose.rotation.copy(LEFT_POSE);
    this.leftGrip.position.set(0, 0, -0.1);
    leftPose.add(
      ...sleeveAndWrist(kurta, skin),
      palm(0.13, 0.03, 0.11, skin, 0.005, -0.015, -0.07),
      this.leftGrip,
    );
    for (let i = 0; i < 4; i++) {
      leftPose.add(finger(skin, -0.045 + i * 0.03, 0.006, -0.16, LEFT_CURL));
    }
    leftPose.add(thumb(skin, 0.075, 0.012, -0.1, -0.5));
    this.left.add(leftPose);

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
    // The fill sits with the hands on the camera, so whatever the player holds is always lit.
    const fill = new THREE.PointLight(FILL_COLOR, 0.6, 1.5, 2);
    fill.position.set(0, -0.1, -0.2);
    camera.add(fill);
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
    this.leftFull = obj !== null;
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

  /** Applies the idle breathing bob, the mouse-sway lag, the poke jab and the left hand's rest to the two groups. */
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

    // The left hand rises to the plate when one is held and sinks out of frame when the hand is empty.
    const target = this.leftFull ? LEFT_BASE : LEFT_REST;
    this.leftPos.lerp(target, 1 - Math.exp(-LEFT_SETTLE * dt));

    this.right.position.set(
      RIGHT_BASE.x + this.swayPos.x + breathX,
      RIGHT_BASE.y + this.swayPos.y + breathY,
      RIGHT_BASE.z - jab,
    );
    this.left.position.set(
      this.leftPos.x + this.swayPos.x * 0.6 + breathX * 0.5,
      this.leftPos.y + this.swayPos.y * 0.6 + breathY * 0.6,
      this.leftPos.z,
    );
  }
}

/**
 * The forearm parts shared by both hands: the slim cream sleeve running back toward the viewer and flaring open at
 * its far end, the cuff band at the wrist, and the short skin wrist that joins the sleeve to the palm. All sit on the
 * wrist axis (the z axis).
 */
function sleeveAndWrist(kurta: THREE.Material, skin: THREE.Material): THREE.Mesh[] {
  // CylinderGeometry's first radius is the top (+y end); a quarter turn about x points that end at the camera (+z),
  // so the open end flares toward the viewer and the narrow end sits at the wrist.
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(SLEEVE_OPEN_RADIUS, SLEEVE_WRIST_RADIUS, SLEEVE_LENGTH, 16, 1, true),
    kurta,
  );
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(0, 0, SLEEVE_LENGTH / 2);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(CUFF_RADIUS, CUFF_RADIUS, 0.012, 16), kurta);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, 0.02);
  const wrist = limb(WRIST_RADIUS, 0.05, skin, 0, 0, 0);
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
 * One finger: two capsule segments joined at knuckles. The root sits at the palm's front edge and each joint has its
 * own curl, so the finger bends into a loose grip instead of lying flat. `curl` holds the two joint angles in radians.
 */
function finger(
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  curl: [number, number],
): THREE.Group {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.rotation.x = curl[0];
  const seg1 = segment(FINGER_RADIUS, FINGER_SEG_1, mat);
  root.add(seg1.mesh);
  const joint = new THREE.Group();
  joint.position.z = -seg1.span;
  joint.rotation.x = curl[1];
  const seg2 = segment(FINGER_RADIUS, FINGER_SEG_2, mat);
  joint.add(seg2.mesh);
  root.add(joint);
  return root;
}

/** The thumb: a two-segment limb angled across the palm from its base, sitting at a given side of the hand. */
function thumb(mat: THREE.Material, x: number, y: number, z: number, roll: number): THREE.Group {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.rotation.set(-0.35, 0, roll);
  const seg1 = segment(FINGER_RADIUS, FINGER_SEG_1, mat);
  root.add(seg1.mesh);
  const joint = new THREE.Group();
  joint.position.z = -seg1.span;
  joint.rotation.x = -0.3;
  const seg2 = segment(FINGER_RADIUS, FINGER_SEG_2, mat);
  joint.add(seg2.mesh);
  root.add(joint);
  return root;
}

/**
 * A capsule segment that starts at the local origin and points along -z. The mesh is centred so its near end sits on
 * the origin; `span` is the distance from the origin to the far end, where the next joint attaches.
 */
function segment(radius: number, length: number, mat: THREE.Material): { mesh: THREE.Mesh; span: number } {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), mat);
  // CapsuleGeometry runs along y; a quarter turn about x lays it along z.
  mesh.rotation.x = Math.PI / 2;
  const span = length + 2 * radius;
  mesh.position.z = -span / 2;
  return { mesh, span };
}

/**
 * A capsule limb (the wrist) of the given radius and straight length at a position. The capsule lies along the z axis,
 * pointing forward from the wrist.
 */
function limb(radius: number, length: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), mat);
  mesh.rotation.set(Math.PI / 2, 0, 0);
  mesh.position.set(x, y, z);
  return mesh;
}
