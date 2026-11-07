// Bundle of the shared effect systems and services handed to every cracker and prop, so each one can
// emit sparks, smoke, light and shake without knowing how the engine was wired together.
import type * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { SparkSystem } from './SparkSystem';
import type { SmokeSystem } from './SmokeSystem';
import type { FlashLights } from './FlashLights';
import type { CameraShake } from './CameraShake';

/** Everything an effect needs: the scene and camera plus the pooled FX systems and audio. */
export interface FxContext {
  /** Scene the effects are added to. */
  scene: THREE.Scene;
  /** Player camera, used for shake and any view-dependent effect. */
  camera: THREE.PerspectiveCamera;
  /** Pooled GPU sparks. */
  sparks: SparkSystem;
  /** Pooled soft smoke puffs. */
  smoke: SmokeSystem;
  /** Pooled brief point-light flashes. */
  flashes: FlashLights;
  /** Trauma-based camera shake. */
  shake: CameraShake;
  /** Sound playback; a stub until the Web Audio engine lands. */
  audio: AudioEngine;
}
