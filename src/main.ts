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
// Clicking the canvas captures the pointer so mouse movement turns the view.
engine.renderer.domElement.addEventListener('click', () => input.requestLock());
// Registered last so per-frame input state is cleared only after every system read it.
engine.add({
  update() {
    input.endFrame();
  },
});

engine.start();
