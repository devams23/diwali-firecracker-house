// Bombs (Laxmi and Sutli): instant, loud explosions that go off when the fuse runs out. Both share one routine
// and differ only by the spec table below: the Laxmi is a sharp crack with paper scraps and a puff of smoke,
// the Sutli a heavy big blast with paper scraps, a ring of dust and more sparks. Players within 2.5 m of the
// big blast also get extra shake and a ringing ear.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import type { SoundName } from '../audio/AudioEngine';

/** Which bomb this is. */
export type BombVariant = 'laxmi' | 'sutli';

/** Per-variant tuning for the explosion; every value is used directly by Bomb.explode(). */
interface BombSpec {
  /** Colour of the flash light. */
  flashColor: number;
  /** Peak intensity of the flash light. */
  flashIntensity: number;
  /** Reach of the flash light, in metres. */
  flashDistance: number;
  /** Seconds the flash lasts. */
  flashDuration: number;
  /** Sound played at the blast. */
  sound: SoundName;
  /** Bright sparks thrown in every direction. */
  sparks: number;
  /** Dark red paper scraps thrown with the sparks; zero for none. */
  paper: number;
  /** Camera shake trauma added by the blast. */
  shake: number;
  /** Burst power announced on the game event bus. */
  power: number;
  /** True for the big blast: a player standing close gets extra shake and a ringing ear. */
  bigBlast: boolean;
}

/** Explosion tuning for each bomb variant. */
const SPECS: Record<BombVariant, BombSpec> = {
  laxmi: {
    flashColor: 0xfff0d0,
    flashIntensity: 12,
    flashDistance: 12,
    flashDuration: 0.18,
    sound: 'crack',
    sparks: 200,
    paper: 60,
    shake: 0.35,
    power: 0.5,
    bigBlast: false,
  },
  sutli: {
    flashColor: 0xffe6b8,
    flashIntensity: 16,
    flashDistance: 18,
    flashDuration: 0.3,
    sound: 'boomBig',
    sparks: 400,
    paper: 40,
    shake: 0.8,
    power: 1.0,
    bigBlast: true,
  },
};

/** Distance within which the player's ears ring, in metres. */
const EAR_RING_RANGE = 2.5;
/** Extra shake trauma when the player is close to a blast. */
const CLOSE_SHAKE = 0.4;
/** Radius of the dust ring a sutli throws up, in metres. */
const DUST_RING_RADIUS = 1.5;
/** Number of dust puffs around the sutli's ring. */
const DUST_PUFFS = 12;
/** Dark red shades for the paper scraps. */
const PAPER_COLORS = [0x7a1c14, 0x5c1510];
const TAU = Math.PI * 2;

/** A Laxmi or Sutli bomb: lights its fuse, then explodes once; the model disappears after the blast. */
export class Bomb extends Cracker {
  /** Tuning for this variant. */
  private readonly spec: BombSpec;
  /** Variant-specific blast position, reused each explosion. */
  private readonly blast = new THREE.Vector3();
  /** Scratch vector for the camera position, used by the distance check. */
  private readonly eye = new THREE.Vector3();
  /** Scratch vector for each dust puff's position around the sutli ring. */
  private readonly puffAt = new THREE.Vector3();

  /** Creates a bomb of the given variant around its model. */
  constructor(variant: BombVariant, fx: FxContext, model: THREE.Group) {
    super(variant, fx, model);
    this.spec = SPECS[variant];
  }

  /** Explodes the moment the fuse runs out. */
  protected onIgnite(): void {
    this.explode();
  }

  /** Bombs are instant, so the effect is over on the frame it starts. */
  protected onActive(): boolean {
    return true;
  }

  /** Runs the blast: light, sound, sparks, paper, smoke, shake and the burst event; then hides the model. */
  private explode(): void {
    const s = this.spec;
    this.object.getWorldPosition(this.blast);

    this.fx.flashes.flash(this.blast, s.flashColor, s.flashIntensity, s.flashDistance, s.flashDuration);
    this.fx.audio.play(s.sound, this.blast);

    // Bright sparks spread over the whole sphere.
    this.fx.sparks.emit({
      position: this.blast,
      speed: [4, 10],
      spread: Math.PI,
      count: s.sparks,
      colors: [0xfff0d0, 0xffb347, 0xffffff],
      life: [0.4, 0.8],
      size: [0.03, 0.06],
      crackle: true,
    });

    // Paper scraps: heavier and draggier than sparks so they fall close to the blast.
    if (s.paper > 0) {
      this.fx.sparks.emit({
        position: this.blast,
        speed: [1, 3],
        spread: Math.PI,
        count: s.paper,
        colors: PAPER_COLORS,
        life: [1.5, 2.5],
        size: [0.02, 0.035],
        gravity: 3,
        drag: 2,
      });
    }

    if (this.kind === 'laxmi') {
      this.fx.smoke.puff(this.blast, { count: 3, size: 0.3, life: 3, rise: 0.6 });
    } else {
      this.dustRing();
    }

    this.fx.shake.add(s.shake);
    // Only the big blast rings the ear and adds extra shake to a player who is close.
    if (s.bigBlast && this.playerIsClose()) {
      this.fx.shake.add(CLOSE_SHAKE);
      // The ringing is in the listener's head, so it plays without a position.
      this.fx.audio.play('earRing');
    }

    this.object.visible = false;
    this.burst(s.power);
  }

  /** Throws a ring of dust puffs out along the ground, as a sutli's ground blast does. */
  private dustRing(): void {
    for (let i = 0; i < DUST_PUFFS; i++) {
      const a = (i / DUST_PUFFS) * TAU;
      this.puffAt.set(
        this.blast.x + Math.cos(a) * DUST_RING_RADIUS,
        this.blast.y + 0.05,
        this.blast.z + Math.sin(a) * DUST_RING_RADIUS,
      );
      this.fx.smoke.puff(this.puffAt, { count: 2, size: 0.5, life: 4, rise: 0.2, color: 0x8a7a66 });
    }
  }

  /** True when the camera is within the ear-ringing range of the blast. */
  private playerIsClose(): boolean {
    this.fx.camera.getWorldPosition(this.eye);
    return this.eye.distanceTo(this.blast) < EAR_RING_RANGE;
  }
}
