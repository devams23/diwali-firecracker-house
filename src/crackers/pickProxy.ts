// Pick proxy: an invisible box around a ground cracker that the crosshair ray can hit. Some crackers are tiny or
// mostly air (a 2 cm saanp goli, a ladi of 1.4 cm tubes strung along a curve), so aiming at the real meshes misses
// more often than it lands. The box covers the model's bounds, padded to a comfortable minimum, and is never drawn.
import * as THREE from 'three';

/** Smallest footprint (metres, x and z) of the pick box, so the smallest crackers are still easy to aim at. */
const MIN_FOOTPRINT = 0.3;
/** Smallest height (metres) of the pick box, so flat crackers lying on the ground stick up enough to be hit. */
const MIN_HEIGHT = 0.2;

/** Never rendered (`visible: false` makes the renderer skip it) but still raycast, since raycasts ignore visibility. */
const PROXY_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

/** The model's bounds in its own local space, from every mesh under it. */
function localBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const toLocal = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    part.copy(o.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(toLocal, o.matrixWorld));
    box.union(part);
  });
  return box;
}

/** Adds the invisible pick box as a child of `root`, so a ray hit on it resolves to that cracker. */
export function addPickProxy(root: THREE.Object3D): THREE.Mesh {
  const b = localBounds(root);
  const size = b.getSize(new THREE.Vector3());
  const centre = b.getCenter(new THREE.Vector3());
  const w = Math.max(size.x, MIN_FOOTPRINT);
  const h = Math.max(size.y, MIN_HEIGHT);
  const d = Math.max(size.z, MIN_FOOTPRINT);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), PROXY_MATERIAL);
  // Sits on the ground under the model's centre, rising from its lowest point.
  proxy.position.set(centre.x, b.min.y + h / 2, centre.z);
  proxy.name = 'pickProxy';
  root.add(proxy);
  return proxy;
}
