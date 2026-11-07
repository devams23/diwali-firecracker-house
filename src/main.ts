// Entry point: boots the render engine on #app, builds the village (procedural textures, aangan, house,
// props, lighting, night sky) and hands the first-person controller the shared collision world.
import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { CollisionWorld } from './core/Collision';
import { FirstPersonController } from './player/FirstPersonController';
import { makeTextures } from './world/textures';
import { buildAangan } from './world/Aangan';
import { buildHouse } from './world/House';
import { buildProps, extraDiyaSpots } from './world/props';
import { buildLighting } from './world/Lighting';
import { Sky } from './world/Sky';
import { Diya, DiyaField } from './items/Diya';
import { SparkSystem } from './fx/SparkSystem';
import { SmokeSystem } from './fx/SmokeSystem';
import { FlashLights } from './fx/FlashLights';
import { CameraShake } from './fx/CameraShake';
import type { FxContext } from './fx/FxContext';
import { AudioEngine } from './audio/AudioEngine';

/** Niche indices (into the aangan diya spots) that hold a real lit lamp instead of a decorative one. */
const LIT_NICHES = [2, 5, 9];

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container missing from index.html');

const engine = new Engine(container);

const world = new CollisionWorld();
const tex = makeTextures();
const aangan = buildAangan(engine.scene, world, tex);
const house = buildHouse(engine.scene, world, tex);
const props = buildProps(engine.scene, world, tex, house);

buildLighting(engine.scene);
const sky = new Sky(engine.scene);
engine.add(sky);

// Six real lit lamps: the tulsi diya, two at the door and three in the aangan niches.
const litPositions: THREE.Vector3[] = [
  props.tulsiDiyaPos,
  new THREE.Vector3(house.doorPosition.x - 1.25, 0.3, -8.2),
  new THREE.Vector3(house.doorPosition.x + 1.25, 0.3, -8.2),
  ...LIT_NICHES.map((i) => aangan.diyaSpots[i]),
];
for (const pos of litPositions) {
  const d = new Diya(pos, { light: true });
  engine.scene.add(d.object);
  engine.add(d);
}

// Decorative lamps: every spot not taken by a lit lamp, batched into one field (about 100 lamps).
const decorative = [
  ...aangan.diyaSpots.filter((_, i) => !LIT_NICHES.includes(i)),
  ...house.diyaSpots,
  ...extraDiyaSpots(),
];
engine.add(new DiyaField(engine.scene, decorative));

const input = new Input(engine.renderer.domElement);

const player = new FirstPersonController(engine.camera, input, world);
engine.add(player);

// Shared effects that every cracker uses: pooled sparks, smoke, flash lights and camera shake.
const shake = new CameraShake();
const audio = new AudioEngine();
const fx: FxContext = {
  scene: engine.scene,
  camera: engine.camera,
  sparks: new SparkSystem(engine.scene),
  smoke: new SmokeSystem(engine.scene),
  flashes: new FlashLights(engine.scene),
  shake,
  audio,
};
engine.add(fx.sparks);
engine.add(fx.smoke);
engine.add(fx.flashes);
// Registered after the controller so the shake offset lands on the rotation it just wrote.
engine.add({
  update(dt, t) {
    shake.apply(engine.camera, dt, t);
  },
});

// Debug fountain (KeyB) at the tulsi diya to exercise the effect systems; removed in Task 10.
const fountainOrigin = props.tulsiDiyaPos.clone();
engine.add({
  update() {
    if (!input.pressed('KeyB')) return;
    fx.sparks.emit({
      position: fountainOrigin,
      speed: [4, 9],
      spread: 0.5,
      count: 400,
      colors: [0xffb347, 0xf2a01f, 0xffe7a0],
      life: [0.8, 1.8],
      size: [0.02, 0.05],
      crackle: true,
    });
    fx.smoke.puff(fountainOrigin, { count: 6, size: 0.4 });
    fx.flashes.flash(fountainOrigin, 0xffb347, 6, 6, 0.4);
    fx.shake.add(0.3);
    audio.play('roar', fountainOrigin, { duration: 3 });
  },
});

// Clicking the canvas captures the pointer so mouse movement turns the view; the first click also unlocks audio.
engine.renderer.domElement.addEventListener('click', () => {
  input.requestLock();
  audio.init();
  audio.startAmbience();
});
// Keeps the listener on the camera after the shake offset is applied, so panning matches what is on screen.
engine.add({
  update() {
    audio.updateListener(engine.camera);
  },
});
// Registered last so per-frame input state is cleared only after every system read it.
engine.add({
  update() {
    input.endFrame();
  },
});

engine.start();
