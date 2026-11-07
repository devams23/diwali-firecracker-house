// Short-lived coloured light flashes for bursts and crackers. A fixed pool of PointLights is created up
// front (always in the scene, so materials never recompile), and each flash borrows the least recently used one.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';

/** One pooled light slot and its current flash state. */
interface Slot {
  light: THREE.PointLight;
  start: number;
  duration: number;
  elapsed: number;
  lastUsed: number;
  active: boolean;
}

/** Fixed pool of point lights for brief flashes; intensity falls off quadratically over the flash. */
export class FlashLights implements Updatable {
  private readonly slots: Slot[] = [];
  private stamp = 0;

  /** Creates `count` idle point lights and adds them to the scene. */
  constructor(scene: THREE.Scene, count = 4) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      this.slots.push({
        light,
        start: 0,
        duration: 1,
        elapsed: 0,
        lastUsed: -1,
        active: false,
      });
    }
  }

  /** Starts a flash, reusing the least recently used light slot if all are busy. */
  flash(position: THREE.Vector3, color: number, intensity: number, distance: number, duration: number): void {
    let slot = this.slots[0];
    for (const s of this.slots) {
      if (s.lastUsed < slot.lastUsed) slot = s;
    }
    slot.light.position.copy(position);
    slot.light.color.setHex(color);
    slot.light.distance = distance;
    slot.light.intensity = intensity;
    slot.start = intensity;
    slot.duration = Math.max(duration, 1e-3);
    slot.elapsed = 0;
    slot.active = true;
    slot.lastUsed = ++this.stamp;
  }

  /** Decays every active flash quadratically and switches a light off when its time is up. */
  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.elapsed += dt;
      if (s.elapsed >= s.duration) {
        s.active = false;
        s.light.intensity = 0;
        continue;
      }
      const k = 1 - s.elapsed / s.duration;
      s.light.intensity = s.start * k * k;
    }
  }
}
