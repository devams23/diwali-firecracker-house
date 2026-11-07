// Entry point: boots the render engine on #app and places a placeholder ground and cube
// so the engine can be verified before the real village is built (later tasks replace this).
import './style.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { PALETTE } from './core/palette';

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container missing from index.html');

const engine = new Engine(container);

// Player eye height, looking north (-z) from the gate, per the village layout spec.
engine.camera.position.set(0, 1.6, 6);
engine.camera.lookAt(0, 1.6, -1);

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

engine.start();
