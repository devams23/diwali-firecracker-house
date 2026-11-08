// Target highlight: while the crosshair rests on an object, every mesh under it gets a warm emissive lift (0x3a2410)
// on its own cloned material. When the aim moves on, the original materials go back and the clones are disposed.
// Cloning keeps the lift from leaking into other objects that share a material, such as the cracker labels.
import * as THREE from 'three';

/** Warm emissive colour added to an aimed-at object, a faint amber that reads as lit from within. */
export const HIGHLIGHT_EMISSIVE = 0x3a2410;

/** One mesh whose material was swapped for a lifted clone, with what to restore when the aim moves. */
interface Swap {
  /** The mesh that was lifted. */
  mesh: THREE.Mesh;
  /** The mesh's material before the swap, put back on clear. */
  original: THREE.Material | THREE.Material[];
  /** The lifted clones that replaced it, disposed on clear. */
  clones: THREE.Material[];
}

/** Returns a clone of a standard material with the highlight emissive, or the same material if it cannot glow. */
function liftedClone(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m;
  const c = m.clone();
  c.emissive.setHex(HIGHLIGHT_EMISSIVE);
  return c;
}

/** Lifts the meshes under one aimed-at object and restores them when the aim changes. */
export class Highlighter {
  /** The object currently highlighted, or null. */
  private root: THREE.Object3D | null = null;
  /** The swaps made for the current root, undone on the next change. */
  private swaps: Swap[] = [];

  /**
   * Highlights `root` and everything under it, first restoring whatever was highlighted before. Calling with the object
   * already highlighted does nothing, so it is cheap to call every frame.
   */
  set(root: THREE.Object3D | null): void {
    if (root === this.root) return;
    this.clear();
    this.root = root;
    if (!root) return;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) this.lift(o);
    });
  }

  /** Swaps one mesh's material for lifted clones, remembering the originals. */
  private lift(mesh: THREE.Mesh): void {
    const original = mesh.material;
    const clones: THREE.Material[] = [];
    if (Array.isArray(original)) {
      mesh.material = original.map((m) => {
        const c = liftedClone(m);
        if (c !== m) clones.push(c);
        return c;
      });
    } else {
      const c = liftedClone(original);
      if (c !== original) clones.push(c);
      mesh.material = c;
    }
    this.swaps.push({ mesh, original, clones });
  }

  /** Puts every lifted mesh's original material back and disposes the clones. */
  private clear(): void {
    for (const s of this.swaps) {
      s.mesh.material = s.original;
      for (const c of s.clones) c.dispose();
    }
    this.swaps = [];
    this.root = null;
  }
}
