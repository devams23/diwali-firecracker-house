// First-person player: mouse look, WASD walking (Shift to tiptoe), a subtle head-bob, and
// ground collision against the village's CollisionWorld. It drives the engine camera directly
// and only moves while the pointer is locked, so menus and the unlocked state stay still.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import type { Input } from '../core/Input';
import type { CollisionWorld } from '../core/Collision';

const WALK_SPEED = 3.2;
const TIPTOE_SPEED = 1.4;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.6;
const PITCH_LIMIT = 1.35;
const MOUSE_SENSITIVITY = 0.0022;
const BOB_AMPLITUDE = 0.025;
const BOB_FREQUENCY = 1.9;
/** How quickly the bob fades in and out, per second; avoids a jump when starting or stopping. */
const BOB_BLEND_RATE = 8;

/** Walks the camera around the village at eye height, with collision and head-bob. */
export class FirstPersonController implements Updatable {
  /** Heading in radians; 0 looks north (-z), the direction the player starts facing. */
  yaw = 0;
  /** Vertical look angle in radians, clamped to ±PITCH_LIMIT. */
  pitch = 0;
  /** Feet-level position on the ground; y is always the eye height. */
  readonly position = new THREE.Vector3(0, EYE_HEIGHT, 6);
  /** When false the controller stops reading input and moving, but the camera stays in place. */
  enabled = true;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly world: CollisionWorld;
  private bobPhase = 0;
  private bobWeight = 0;

  /** Binds to the camera, input and collision world; the camera pose is set on the next update. */
  constructor(camera: THREE.PerspectiveCamera, input: Input, world: CollisionWorld) {
    this.camera = camera;
    this.input = input;
    this.world = world;
  }

  /** Reads look and walk input, moves with collision, and writes the camera transform. */
  update(dt: number): void {
    if (this.enabled && this.input.locked) {
      const { x: mx, y: my } = this.input.mouseDelta();
      this.yaw -= mx * MOUSE_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - my * MOUSE_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      this.walk(dt);
    }
    this.applyCamera();
  }

  /** Writes the horizontal facing direction (unit length, y = 0) into `out` and returns it. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private walk(dt: number): void {
    const fwd = this.forward(new THREE.Vector3());
    // Right is forward rotated 90 degrees clockwise seen from above.
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (this.input.isDown('KeyW')) wish.add(fwd);
    if (this.input.isDown('KeyS')) wish.sub(fwd);
    if (this.input.isDown('KeyD')) wish.add(right);
    if (this.input.isDown('KeyA')) wish.sub(right);

    const moving = wish.lengthSq() > 0;
    if (moving) {
      wish.normalize();
      const speed = this.input.isDown('ShiftLeft') ? TIPTOE_SPEED : WALK_SPEED;
      const resolved = this.world.resolve(
        this.position.x + wish.x * speed * dt,
        this.position.z + wish.z * speed * dt,
        PLAYER_RADIUS,
      );
      this.position.x = resolved.x;
      this.position.z = resolved.z;
    }

    const target = moving ? 1 : 0;
    this.bobWeight += (target - this.bobWeight) * Math.min(1, BOB_BLEND_RATE * dt);
    if (moving) this.bobPhase += dt * Math.PI * 2 * BOB_FREQUENCY;
  }

  private applyCamera(): void {
    const bob = Math.sin(this.bobPhase) * BOB_AMPLITUDE * this.bobWeight;
    this.camera.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
