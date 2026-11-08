// Stylised first-person hands for the Diwali aangan: a warm brown fist gripping the agarbatti (right) or a hand-held
// sparkler (left), wrapped in a deep maroon silk kurta sleeve that runs out of the bottom corner of the frame. The
// cuff is a gold zari band, with a gold kada and a red and saffron kalava on the wrist.
// Everything is procedural (three.js primitives). The fist is built in its own frame: wrist at the origin, forearm
// along +z, palm below the origin in -z, palm normal +y, with the curled fingers on the +y side. A pose quaternion
// turns that frame so the finger side faces the viewer and the wrist points down and out of frame. The left hand is
// the same fist mirrored by a negative scale. Both hands are children of the player camera, which the caller must
// add to the scene.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Updatable } from '../core/Engine';

/** URLs of the vendored MIT-licensed WebXR generic hand meshes (see public/models/hands/LICENSE.md). */
const HAND_URL = { right: 'models/hands/right.glb', left: 'models/hands/left.glb' };
/** Centre of the cut wrist end of the right-hand mesh, in mesh space (the left mesh is its x mirror). */
const MESH_WRIST = new THREE.Vector3(0.039, 0.074, 0.01);
/** Uniform scale of the real hand mesh; sized so the hand fills about a fifth of the screen height. */
const MESH_SCALE = 1.75;
/** Per-joint curl of each finger in degrees [proximal, intermediate, distal], progressive from index to pinky. */
const CURL: ReadonlyArray<readonly [string, number, number, number]> = [
  ['index', 62, 72, 55],
  ['middle', 68, 76, 58],
  ['ring', 74, 80, 60],
  ['pinky', 80, 82, 62],
];
/** Where the stick passes through the mesh-space fist, between the curled fingers and the thumb. */
const MESH_GRIP = new THREE.Vector3(0.012, -0.03, 0.015);

/** Camera-local wrist position of the right hand: the fist sits lower right, about a quarter in from the right edge. */
const RIGHT_BASE = new THREE.Vector3(0.34, -0.24, -0.5);
/** Camera-local wrist position of the left hand while it holds a sparkler: lower left, cradling the stick. */
const LEFT_BASE = new THREE.Vector3(-0.3, -0.07, -0.5);
/** Camera-local wrist position of the left hand when empty: well below the bottom edge of the frame. */
const LEFT_REST = new THREE.Vector3(-0.36, -0.7, -0.5);
/** How fast the left hand glides between its held and empty positions, per second. An empty hand clears in ~0.3 s. */
const LEFT_SETTLE = 8;

/** Wrist direction in camera space: the sleeve runs down and toward the viewer, out the bottom-right corner. */
const WRIST_DIR = new THREE.Vector3(0.5, -0.7, 0.5).normalize();
/** Rough finger-side direction in camera space; it is made perpendicular to the wrist when the pose is built. */
const FINGER_DIR = new THREE.Vector3(-0.4, 0.2, 0.9);
/** Direction the agarbatti or sparkler leaves the fist, in fist space: out the front of the knuckles and a little up. */
const STICK_DIR = new THREE.Vector3(0, 0.35, -1).normalize();
/** Point in fist space where the stick is held: the gap between the curled fingers and the thumb. */
const GRIP_POINT = new THREE.Vector3(0, 0.058, -0.085);

/** Radius of the sleeve at the wrist end, in metres. */
const SLEEVE_WRIST_RADIUS = 0.026;
/** Radius of the sleeve's open end, in metres; the kurta flares toward it. */
const SLEEVE_OPEN_RADIUS = 0.04;
/** Length of the sleeve, in metres. Long enough to run out of the bottom of the frame. */
const SLEEVE_LENGTH = 0.244;
/** Radius of the gold zari cuff band, slightly wider than the sleeve. */
const CUFF_RADIUS = 0.0285;
/** Height of the cuff band along the wrist, in metres. */
const CUFF_HEIGHT = 0.016;
/** Radius of the wrist skin between the fist and the cuff, in metres. */
const WRIST_RADIUS = 0.024;
/** Length of the wrist skin along the forearm, in metres. */
const WRIST_LENGTH = 0.04;
/** Radius of each finger segment, in metres. */
const FINGER_RADIUS = 0.0105;
/** Radius of the soft knuckle bump at each finger root, in metres. */
const KNUCKLE_RADIUS = 0.0125;
/** Radius of each thumb segment, in metres. */
const THUMB_RADIUS = 0.0115;

/** Warm fill colour from the camera, so the hands are lit whatever the scene's lighting. */
const FILL_COLOR = 0xffc89a;
const POKE_TIME = 0.25;
const POKE_DIST = 0.12;
const BREATH_AMP = 0.004;
const SWAY_GAIN = 0.0012;
const SWAY_MAX = 0.04;
/** How fast the sway target relaxes back to rest, per second. */
const SWAY_DECAY = 4;
/** How fast the hands catch up to the sway target, per second. */
const SWAY_FOLLOW = 10;

/** The shared materials for one set of hands. */
interface HandMaterials {
  /** Warm brown skin for the fist and wrist. */
  skin: THREE.Material;
  /** Deep maroon silk kurta sleeve. */
  kurta: THREE.Material;
  /** Gold zari cuff band with its paisley border. */
  zari: THREE.Material;
  /** Gold metal for the kada. */
  gold: THREE.Material;
  /** Red thread of the kalava. */
  red: THREE.Material;
  /** Saffron thread of the kalava. */
  saffron: THREE.Material;
}

/** Clamps v into [-limit, limit]. */
function clamp(v: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, v));
}

/** Both hands with their sleeves, parented to the camera; holds items, pokes forward and sways with the mouse. */
export class Hands implements Updatable {
  /** Right hand group, a child of the camera. */
  readonly right = new THREE.Group();
  /** Left hand group, a child of the camera; mirrored so it is the right hand's reflection. */
  readonly left = new THREE.Group();

  private readonly rightGrip = new THREE.Group();
  private readonly leftGrip = new THREE.Group();
  private readonly swayTarget = new THREE.Vector2();
  private readonly swayPos = new THREE.Vector2();
  private readonly leftPos = LEFT_REST.clone();
  private pokeLeft = 0;

  /** Builds both hands and attaches them to the camera; the camera itself must be added to the scene. */
  constructor(camera: THREE.PerspectiveCamera) {
    const mats = handMaterials();

    this.right.position.copy(RIGHT_BASE);
    this.left.position.copy(LEFT_REST);

    // The procedural fists show at once; each is swapped for the posed hand mesh as soon as its GLB has loaded.
    const fallbacks = [buildHand(mats, this.rightGrip, 1), buildHand(mats, this.leftGrip, -1)];
    this.right.add(fallbacks[0]);
    this.left.add(fallbacks[1]);
    markHand(this.right);
    markHand(this.left);
    const loader = new GLTFLoader();
    for (const [side, group, grip, sx, fallback] of [
      ['right', this.right, this.rightGrip, 1, fallbacks[0]],
      ['left', this.left, this.leftGrip, -1, fallbacks[1]],
    ] as const) {
      loader.load(
        import.meta.env.BASE_URL + HAND_URL[side],
        (gltf) => {
          group.remove(fallback);
          group.add(buildMeshHand(gltf.scene, mats, grip, sx));
          markHand(group);
        },
        undefined,
        // A failed load simply keeps the procedural fist.
        () => undefined,
      );
    }
    camera.add(this.right, this.left);
    addLighting(camera);
  }

  /** Object that items held in the left hand are attached to; HandHeld.attach() takes this anchor. */
  get leftHold(): THREE.Object3D {
    return this.leftGrip;
  }

  /** Puts an object (the agarbatti) into the right fist, or clears the hand when given null. */
  holdRight(obj: THREE.Object3D | null): void {
    this.rightGrip.clear();
    if (obj) {
      // The agarbatti's base sits a little inside the fist, so its stick leaves between the fingers and the thumb.
      obj.position.set(0, -0.02, 0);
      obj.rotation.set(0, 0, 0);
      this.rightGrip.add(obj);
    }
  }

  /** Puts an object into the left fist at the grip point, or clears the hand when given null. */
  holdLeft(obj: THREE.Object3D | null): void {
    this.leftGrip.clear();
    if (obj) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
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

    // The left hand rises when it holds something and sinks out of frame when it is empty. Checking the children
    // catches sparklers attached through leftHold as well as objects placed with holdLeft.
    const holding = this.leftGrip.children.length > 0;
    const target = holding ? LEFT_BASE : LEFT_REST;
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

/** Builds the skin, silk, zari, gold and thread materials shared by both hands. */
function handMaterials(): HandMaterials {
  return {
    // Warm brown skin; the emissive keeps the fist from ever going dark in the blue night light.
    skin: new THREE.MeshStandardMaterial({
      color: 0xb07a55,
      roughness: 0.6,
      emissive: 0x3a1a0c,
      emissiveIntensity: 0.25,
    }),
    // Deep maroon silk with a soft sheen at grazing angles, so the sleeve catches the light like cloth.
    kurta: new THREE.MeshPhysicalMaterial({
      color: 0x6a1020,
      roughness: 0.45,
      sheen: 0.35,
      sheenColor: new THREE.Color(0x9a3a48),
      sheenRoughness: 0.5,
      emissive: 0x2a0508,
      emissiveIntensity: 0.05,
      side: THREE.DoubleSide,
    }),
    zari: new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      map: zariTexture(),
      metalness: 0.6,
      roughness: 0.35,
      emissive: 0x3a2a08,
      emissiveIntensity: 0.3,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xd4a84a,
      metalness: 0.7,
      roughness: 0.3,
      emissive: 0x3a2a08,
      emissiveIntensity: 0.3,
    }),
    red: new THREE.MeshStandardMaterial({ color: 0xb3202a, roughness: 0.8 }),
    saffron: new THREE.MeshStandardMaterial({ color: 0xe8901c, roughness: 0.8 }),
  };
}

/**
 * A canvas-drawn zari border for the cuff: maroon paisley drops and dots on a cream ground, with thin maroon rules at
 * the top and bottom. The cuff material tints it gold. Returns null where there is no document (for example in tests).
 */
function zariTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const maroon = '#7a1424';
  g.fillStyle = '#fff6e0';
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = maroon;
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 29, 256, 3);
  for (let i = 0; i < 4; i++) {
    const cx = i * 64 + 32;
    const cy = 16;
    // A paisley drop: a tilted ellipse with a small bead on its narrow end.
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    g.beginPath();
    g.ellipse(0, 0, 6, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.beginPath();
    g.arc(cx + 9, cy - 8, 2.2, 0, Math.PI * 2);
    g.fill();
    // A dot between the drops.
    g.beginPath();
    g.arc(cx + 32, cy, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Stops frustum culling on a hand (its bounds sit at the screen edge) and draws it after other opaque geometry. */
function markHand(hand: THREE.Object3D): void {
  hand.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.frustumCulled = false;
      o.renderOrder = 10;
    }
  });
}

/** Rotates a bone by `angle` about a mesh-space axis, pivoting on the bone itself so its child bones follow. */
function bendBone(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  const parentQ = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentQ);
  // Carry the mesh-space axis into the parent's frame so the turn can be pre-multiplied onto the local rotation.
  const local = axis.clone().applyQuaternion(parentQ.clone().invert());
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local, angle));
  bone.updateMatrixWorld(true);
}

/**
 * Turns a loaded WebXR generic hand into a relaxed grip. The mesh's bones come as a flat list, so each finger is first
 * re-parented into a chain (metacarpal to tip); bending a joint then carries the joints beyond it. Mesh space: fingers
 * run along -y, the palm side is -x on the right hand, the little finger is at +z. `sx` is -1 for the mirrored left hand.
 */
function poseHandBones(root: THREE.Object3D, sx: number): void {
  const bone = (n: string) => root.getObjectByName(n) as THREE.Object3D;
  const wrist = bone('wrist');
  const across = new THREE.Vector3(0, 0, 1);
  const rad = THREE.MathUtils.degToRad;
  const chains: string[][] = CURL.map(([f]) => [
    `${f}-finger-metacarpal`,
    `${f}-finger-phalanx-proximal`,
    `${f}-finger-phalanx-intermediate`,
    `${f}-finger-phalanx-distal`,
    `${f}-finger-tip`,
  ]);
  chains.push(['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']);
  for (const names of chains) {
    // attach() keeps each bone's world transform while changing its parent, so the rest pose is unchanged.
    wrist.attach(bone(names[0]));
    for (let i = 1; i < names.length; i++) bone(names[i - 1]).attach(bone(names[i]));
  }
  root.updateMatrixWorld(true);

  // Curl: a negative turn about the across-the-palm axis folds a finger toward -x, the palm side (mirrored for left).
  for (const [f, p, m, d] of CURL) {
    bendBone(bone(`${f}-finger-phalanx-proximal`), across, -rad(p) * sx);
    bendBone(bone(`${f}-finger-phalanx-intermediate`), across, -rad(m) * sx);
    bendBone(bone(`${f}-finger-phalanx-distal`), across, -rad(d) * sx);
  }
  // Thumb: swing it in toward the index finger (about y), then fold it over the stick.
  bendBone(bone('thumb-metacarpal'), new THREE.Vector3(0, 1, 0), rad(25) * sx);
  bendBone(bone('thumb-metacarpal'), across, -rad(20) * sx);
  bendBone(bone('thumb-phalanx-proximal'), across, -rad(25) * sx);
  bendBone(bone('thumb-phalanx-distal'), across, -rad(30) * sx);
}

/**
 * One whole hand from the WebXR generic hand mesh: the skinned mesh in the skin material, posed into a grip, with the
 * kurta sleeve, zari cuff, kada and kalava on its wrist and the grip anchor between fingers and thumb.
 * The wrist is the origin of the returned group.
 */
function buildMeshHand(scene: THREE.Object3D, mats: HandMaterials, grip: THREE.Group, sx: number): THREE.Group {
  const model = cloneSkinned(scene);
  poseHandBones(model, sx);
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = mats.skin;
  });

  // Wrist-centred, scaled up a little for a sturdy, slightly stylised hand.
  const wristAt = new THREE.Vector3(MESH_WRIST.x * sx, MESH_WRIST.y, MESH_WRIST.z);
  const handFrame = new THREE.Group();
  handFrame.scale.setScalar(MESH_SCALE);
  model.position.copy(wristAt).negate();
  handFrame.add(model);

  // The forearm parts are built along +z; a quarter turn about x lays them along the mesh's +y wrist axis.
  const forearm = new THREE.Group();
  forearm.add(...wristAndSleeve(mats, sx));
  forearm.rotation.x = -Math.PI / 2;
  forearm.position.y = -0.004;
  handFrame.add(forearm);

  // The grip anchor: the stick runs across the palm (mesh z) and leaves past the little-finger side (+z).
  const anchor = new THREE.Group();
  anchor.position.set(MESH_GRIP.x * sx, MESH_GRIP.y, MESH_GRIP.z).sub(wristAt).multiplyScalar(MESH_SCALE);
  anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  grip.position.set(0, 0, 0);
  grip.quaternion.identity();
  anchor.add(grip);

  // Turn mesh space into the camera-facing pose.
  const pose = new THREE.Group();
  pose.quaternion.copy(meshPoseQuaternion(sx));
  pose.add(handFrame, anchor);
  return pose;
}

/**
 * Orientation of the mesh hand in camera space: the wrist (+y) runs down and toward the viewer out of the bottom-right,
 * and the stick axis (+z, toward the little finger) points up and slightly forward. Mirrored for the left hand.
 */
function meshPoseQuaternion(sx: number): THREE.Quaternion {
  const y = new THREE.Vector3(0.55, -0.55, 0.62).normalize();
  // z (toward the little finger) runs up the stick, so the back of the hand faces the viewer and the thumb is below; made perpendicular to the wrist.
  const up = new THREE.Vector3(0, 1, -0.25);
  const z = up.clone().addScaledVector(y, -up.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const mirror = new THREE.Matrix4().makeScale(sx, 1, 1);
  const m = new THREE.Matrix4().multiplyMatrices(mirror, basis).multiply(mirror);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/**
 * Builds one whole hand in its own frame: the sleeve, wrist, cuff and kalava, the fist with its palm, four curled
 * fingers and wrapping thumb, and the grip anchor for the held stick. The pose quaternion turns the frame into place.
 */
function buildHand(mats: HandMaterials, grip: THREE.Group, sx: number): THREE.Group {
  const pose = new THREE.Group();
  pose.quaternion.copy(poseQuaternion(sx));
  pose.add(...wristAndSleeve(mats, sx), palm(mats.skin));
  for (const [x, k] of FINGERS) pose.add(finger(sx * x, k, mats.skin));
  pose.add(thumb(mats.skin, sx));

  // The grip anchor sits in the gap between the fingers and the thumb and points along the stick.
  grip.position.copy(GRIP_POINT);
  grip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), STICK_DIR);
  pose.add(grip);
  return pose;
}

/**
 * Rotation that turns the fist frame so the finger side faces the viewer and the wrist points down and out. For the
 * left hand (sx = -1) the geometry is built mirrored in x, so the rotation is conjugated by the same mirror, S R S.
 */
function poseQuaternion(sx: number): THREE.Quaternion {
  const z = WRIST_DIR.clone();
  // Make the finger side perpendicular to the wrist, then complete a right-handed basis.
  const y = FINGER_DIR.clone().addScaledVector(z, -FINGER_DIR.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const mirror = new THREE.Matrix4().makeScale(sx, 1, 1);
  const m = new THREE.Matrix4().multiplyMatrices(mirror, basis).multiply(mirror);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/**
 * The forearm parts: a short skin wrist, the gold zari cuff, the maroon kurta sleeve flaring out toward its open end,
 * the gold kada and the red and saffron kalava. All sit on the wrist axis (+z) in fist space.
 */
function wristAndSleeve(mats: HandMaterials, sx: number): THREE.Object3D[] {
  const wrist = cylinderAlongZ(WRIST_RADIUS, WRIST_LENGTH, mats.skin, WRIST_LENGTH / 2);

  const cuffZ = WRIST_LENGTH + CUFF_HEIGHT / 2;
  const cuff = cylinderAlongZ(CUFF_RADIUS, CUFF_HEIGHT, mats.zari, cuffZ);

  // The sleeve's wide end (the cylinder's top) points away from the wrist, so the cloth opens toward the viewer.
  const sleeveZ = WRIST_LENGTH + CUFF_HEIGHT + SLEEVE_LENGTH / 2;
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(SLEEVE_OPEN_RADIUS, SLEEVE_WRIST_RADIUS, SLEEVE_LENGTH, 20, 1, true),
    mats.kurta,
  );
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = sleeveZ;

  // Kada: a thin gold bangle on the wrist skin, just above the fist.
  const kada = new THREE.Mesh(new THREE.TorusGeometry(0.0245, 0.0032, 10, 28), mats.gold);
  kada.position.z = 0.02;

  // Kalava: a red and a saffron thread, each a torus, tilted differently so the pair reads as a twist.
  const redThread = new THREE.Mesh(new THREE.TorusGeometry(0.0248, 0.0014, 6, 24), mats.red);
  redThread.position.z = 0.005;
  redThread.rotation.set(0.15, 0, 0.4 * sx);
  const saffronThread = new THREE.Mesh(new THREE.TorusGeometry(0.0248, 0.0014, 6, 24), mats.saffron);
  saffronThread.position.z = 0.0095;
  saffronThread.rotation.set(-0.15, 0, -0.4 * sx);

  return [wrist, cuff, sleeve, kada, redThread, saffronThread];
}

/** A short solid cylinder laid along the fist's +z axis, centred at z. Used for the wrist and the cuff. */
function cylinderAlongZ(radius: number, height: number, mat: THREE.Material, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), mat);
  // CylinderGeometry runs along y; a quarter turn about x lays it along z.
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = z;
  return mesh;
}

/**
 * The fist's palm: a rounded box 0.085 wide, 0.045 thick and 0.09 long, its front (knuckle) edge at z = -0.09 and its
 * back at the wrist, z = 0.
 */
function palm(mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.045, 0.09, 2, 0.014), mat);
  mesh.position.set(0, 0, -0.045);
  return mesh;
}

/** Finger columns across the knuckle row, as [x, length scale]: the little finger is shortest, the middle longest. */
const FINGERS: ReadonlyArray<readonly [number, number]> = [
  [-0.0315, 0.86],
  [-0.0105, 0.95],
  [0.0105, 1.0],
  [0.0315, 0.94],
];

/**
 * One curled finger: a soft knuckle bump at the root, then three segments. The proximal segment rises from the knuckle,
 * the middle one folds back over the palm, and the distal tip tucks down toward the palm. Each joint is a rounded ball,
 * and the tips fan slightly outward. `x` is its column across the knuckle row and `k` scales its lengths.
 */
function finger(x: number, k: number, mat: THREE.Material): THREE.Group {
  const root = new THREE.Vector3(x, 0, -0.084);
  const pip = new THREE.Vector3(x, 0.04 * k, -0.09);
  const dip = new THREE.Vector3(x, 0.04 * k, -0.09 + 0.03 * k);
  const tip = new THREE.Vector3(x * 1.06, 0.024, dip.z + 0.01);
  return chain(
    [root, pip, dip, tip],
    [KNUCKLE_RADIUS, FINGER_RADIUS, FINGER_RADIUS, FINGER_RADIUS * 0.95],
    mat,
  );
}

/**
 * The thumb: it rises from the thenar mound on the index side, arches over the curled fingers so it holds the stick
 * against them, and its tip wraps down over the front of the knuckles toward the little finger.
 */
function thumb(mat: THREE.Material, sx: number): THREE.Group {
  const pts: [number, number, number][] = [
    [0.046, 0.018, -0.03],
    [0.034, 0.066, -0.05],
    [0.01, 0.078, -0.086],
    [-0.02, 0.072, -0.1],
    [-0.04, 0.052, -0.088],
  ];
  return chain(
    pts.map(([x, y, z]) => new THREE.Vector3(sx * x, y, z)),
    [0.0125, THUMB_RADIUS, THUMB_RADIUS, THUMB_RADIUS, THUMB_RADIUS * 0.95],
    mat,
  );
}

/**
 * A jointed chain of rounded segments through the given points. Each joint is a ball of its own radius, so the bends
 * look soft rather than like sausages, and each segment is a capsule between two joints.
 */
function chain(points: THREE.Vector3[], radii: number[], mat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < points.length; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(radii[i], 12, 8), mat);
    ball.position.copy(points[i]);
    group.add(ball);
    if (i > 0) group.add(bone(points[i - 1], points[i], Math.min(radii[i - 1], radii[i]), mat));
  }
  return group;
}

/** A capsule of the given radius spanning from point a to point b, with its rounded ends on the two points. */
function bone(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.001, dir.length() - 2 * radius);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
  mesh.position.lerpVectors(a, b, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/**
 * The lighting that keeps the hands readable in every part of the aangan. A warm fill sits on the camera close to the
 * hands, and a second, fainter point light sits above them so the silhouette reads against the dark ground.
 * Both are children of the camera, so they stay with the hands as the player turns.
 */
function addLighting(camera: THREE.PerspectiveCamera): void {
  const fill = new THREE.PointLight(FILL_COLOR, 0.6, 1.2, 2);
  fill.position.set(0.15, -0.05, -0.1);
  camera.add(fill);

  const rim = new THREE.PointLight(FILL_COLOR, 0.4, 0.8, 2);
  rim.position.set(0.2, 0.15, -0.15);
  camera.add(rim);
}
