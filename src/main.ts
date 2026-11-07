// Entry point: boots the render engine on #app and places a placeholder ground and cube
// so the engine can be verified before the real village is built (later tasks replace this).
// The first-person controller walks the camera around the placeholder; the cube is a collider.
import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { PALETTE } from './core/palette';
import { Input } from './core/Input';
import { CollisionWorld } from './core/Collision';
import { FirstPersonController } from './player/FirstPersonController';

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container missing from index.html');

const engine = new Engine(container);

engine.scene.add(new THREE.HemisphereLight(PALETTE.moon, PALETTE.earth, 1.2));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 14),
  new THREE.MeshStandardMaterial({ color: PALETTE.earth }),
);
ground.rotation.x = -Math.PI / 2;
engine.scene.add(ground);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: PALETTE.geru }),
);
cube.position.set(0, 0.5, -3);
engine.scene.add(cube);

engine.add({
  update(dt: number) {
    cube.rotation.y += dt;
  },
});

const input = new Input(engine.renderer.domElement);
const world = new CollisionWorld();
world.addBox({ minX: -0.5, minZ: -3.5, maxX: 0.5, maxZ: -2.5 });

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
