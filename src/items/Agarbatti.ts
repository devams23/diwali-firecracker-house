// The agarbatti (incense stick) held in the right hand: a thin dark stick with a bamboo base. Once lit, its
// ember pulses, throws small sparks and releases a thin grey smoke wisp. tipWorld tracks the ember each frame.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { PALETTE } from '../core/palette';
import type { FxContext } from '../fx/FxContext';

const STICK_LENGTH = 0.25;
const BAMBOO_LENGTH = 0.05;
const SMOKE_INTERVAL = 0.25;
const SPARK_INTERVAL = 0.12;
const EMBER_COLOR = 0xff6a1a;
/** Ember position in the stick's local space, at its tip. */
const TIP_LOCAL = new THREE.Vector3(0, STICK_LENGTH, 0);

/** A single incense stick that can be lit at a diya and used to light cracker fuses. */
export class Agarbatti implements Updatable {
  /** Root group; the Hands class holds this, so move it with the hand rather than in the world. */
  readonly object = new THREE.Group();
  /** True once the ember has been lit; unlit sticks show no glow and make no smoke. */
  lit = false;
  /** World position of the ember tip, refreshed every frame from the object's world matrix. */
  readonly tipWorld = new THREE.Vector3();

  private readonly fx: FxContext;
  private readonly ember: THREE.Mesh;
  private readonly emberMat: THREE.MeshStandardMaterial;
  private smokeTimer = 0;
  private sparkTimer = 0;

  /** Builds the stick and its ember (hidden until lit); fx supplies the smoke, sparks and audio. */
  constructor(fx: FxContext) {
    this.fx = fx;
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.8 });
    const bamboo = new THREE.MeshStandardMaterial({ color: 0xc8a46a, roughness: 0.7 });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, STICK_LENGTH - BAMBOO_LENGTH, 6),
      wood,
    );
    body.position.y = BAMBOO_LENGTH + (STICK_LENGTH - BAMBOO_LENGTH) / 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, BAMBOO_LENGTH, 6), bamboo);
    base.position.y = BAMBOO_LENGTH / 2;

    this.emberMat = new THREE.MeshStandardMaterial({
      color: EMBER_COLOR,
      emissive: EMBER_COLOR,
      emissiveIntensity: 0,
    });
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 5), this.emberMat);
    this.ember.position.copy(TIP_LOCAL);
    this.ember.visible = false;

    this.object.add(body, base, this.ember);
  }

  /** Lights the ember; the glow, sparks and smoke start on the next update. */
  light(): void {
    this.lit = true;
    this.ember.visible = true;
  }

  /** Refreshes tipWorld; when lit, pulses the ember and emits sparks and smoke at the intervals set above. */
  update(dt: number, t: number): void {
    this.object.updateWorldMatrix(true, false);
    this.tipWorld.copy(TIP_LOCAL).applyMatrix4(this.object.matrixWorld);
    if (!this.lit) return;

    this.emberMat.emissiveIntensity = 1.6 + 0.5 * Math.sin(t * 9) + 0.3 * Math.sin(t * 23);

    this.smokeTimer += dt;
    if (this.smokeTimer >= SMOKE_INTERVAL) {
      this.smokeTimer -= SMOKE_INTERVAL;
      this.fx.smoke.puff(this.tipWorld, { count: 1, size: 0.04, life: 2.6, rise: 0.3, color: 0xb9b4ac });
    }

    this.sparkTimer += dt;
    if (this.sparkTimer >= SPARK_INTERVAL) {
      this.sparkTimer -= SPARK_INTERVAL;
      if (Math.random() < 0.6) {
        this.fx.sparks.emit({
          position: this.tipWorld,
          speed: [0.2, 0.5],
          spread: 0.7,
          count: 2,
          colors: [PALETTE.flame, 0xff8a30],
          life: [0.25, 0.5],
          size: [0.004, 0.008],
          gravity: 1.5,
          drag: 1.5,
        });
      }
    }
  }
}
