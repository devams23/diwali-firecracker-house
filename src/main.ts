// Entry point: boots the render engine on #app, builds the village (procedural textures, aangan
// and house) and hands the first-person controller the shared collision world.
import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { PALETTE } from './core/palette';
import { Input } from './core/Input';
import { CollisionWorld } from './core/Collision';
import { FirstPersonController } from './player/FirstPersonController';
import { makeTextures } from './world/textures';
import { buildAangan } from './world/Aangan';
import { buildHouse } from './world/House';

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container missing from index.html');

const engine = new Engine(container);

// Temporary fill light so the village is visible before the lighting pass (later task).
engine.scene.add(new THREE.HemisphereLight(PALETTE.moon, 0x2a1c10, 0.35));

const world = new CollisionWorld();
const tex = makeTextures();
buildAangan(engine.scene, world, tex);
buildHouse(engine.scene, world, tex);

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
