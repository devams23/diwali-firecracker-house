// The brass thaali (plate) that carries the crackers: a lathe-turned brass dish with a red cloth and a diya
// decal, holding its crackers in a ring with the selected one raised. It can sit on the charpai, be held in
// the left hand, or be set on the ground; the caller decides which and places it.
import * as THREE from 'three';
import type { CrackerKind } from '../crackers/catalog';
import { PALETTE } from '../core/palette';
import { ThaaliInventory } from './ThaaliInventory';
import { makeCrackerModel } from './crackerModels';

const PLATE_RADIUS = 0.2;
const CLOTH_RADIUS = 0.13;
const CLOTH_Y = 0.0115;
/**
 * Ring radius for the crackers. With the longest on-plate item (half-length 0.078 m) this keeps every
 * model inside the 0.2 m rim.
 */
const RING_RADIUS = 0.12;
const SELECTED_LIFT = 0.02;
/**
 * Display scale per kind, applied only to the thaali's copy so the world-scale models stay unchanged for
 * the ground. Long kinds shrink to fit the plate; ladi drops to about 0.15 m. Unlisted kinds keep scale 1.
 */
const DISPLAY_SCALE: Partial<Record<CrackerKind, number>> = {
  phuljhadi: 0.5,
  pencil: 0.7,
  rocket: 0.5,
  ladi: 0.125,
  skyshot: 0.7,
};
/** Kinds whose stick runs along Y in the model; these are turned onto the plate so the stick lies flat. */
const LAID_FLAT: ReadonlySet<CrackerKind> = new Set<CrackerKind>(['phuljhadi', 'pencil', 'rocket']);

let diyaTex: THREE.CanvasTexture | null = null;

/** Small clay diya with a flame drawn on canvas, used as the decal at the centre of the cloth. */
function diyaTexture(): THREE.CanvasTexture {
  if (diyaTex) return diyaTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#9a5a34';
    g.beginPath();
    g.ellipse(64, 88, 42, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffb347';
    g.beginPath();
    g.moveTo(64, 14);
    g.bezierCurveTo(84, 44, 80, 66, 64, 76);
    g.bezierCurveTo(48, 66, 44, 44, 64, 14);
    g.fill();
  }
  diyaTex = new THREE.CanvasTexture(canvas);
  diyaTex.colorSpace = THREE.SRGBColorSpace;
  return diyaTex;
}

/** Builds the brass dish: a lathe profile with a slightly raised rim, flat enough in the middle for the cloth. */
function brassDish(): THREE.Mesh {
  const profile = [
    [0, 0],
    [0.12, 0.002],
    [PLATE_RADIUS, 0.016],
    [0.205, 0.024],
    [0.2, 0.026],
    [0.14, 0.0105],
    [0, 0.0095],
  ];
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.brass,
    metalness: 0.9,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

/** Creates the thaali: a brass plate with cloth, decal and a ring of cracker slots that refresh() rebuilds. */
export class Thaali {
  /** The crackers carried on this plate; add or take crackers here, then call refresh(). */
  readonly inventory = new ThaaliInventory();
  /** Root group for the whole plate; add or remove it from the scene and move it with placeAt(). */
  readonly object = new THREE.Group();
  /** Where the plate is right now; set by the caller since charpai and ground placements share placeAt(). */
  location: 'charpai' | 'hand' | 'ground' = 'charpai';

  private readonly slots = new THREE.Group();
  private readonly templates = new Map<CrackerKind, THREE.Group>();

  /** Builds the plate with an empty ring; call refresh() after adding crackers. */
  constructor() {
    const cloth = new THREE.Mesh(
      new THREE.CircleGeometry(CLOTH_RADIUS, 32),
      new THREE.MeshStandardMaterial({ color: PALETTE.geru, roughness: 1 }),
    );
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = CLOTH_Y;

    // Polygon offset pulls the decal toward the camera so it does not z-fight with the cloth beneath.
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshStandardMaterial({
        map: diyaTexture(),
        transparent: true,
        depthWrite: false,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = CLOTH_Y + 0.001;

    this.object.add(brassDish(), cloth, decal, this.slots);
  }

  /** Rebuilds the ring of cracker models from the inventory, raising the selected one slightly. */
  refresh(): void {
    this.slots.clear();
    const items = this.inventory.items;
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const kind = items[i];
      const angle = (i / n) * Math.PI * 2;
      const slot = new THREE.Group();
      slot.add(this.template(kind).clone());
      const lift = i === this.inventory.selected ? SELECTED_LIFT : 0;
      slot.position.set(Math.sin(angle) * RING_RADIUS, CLOTH_Y + lift, Math.cos(angle) * RING_RADIUS);
      // Local +x runs along the ring's tangent at this angle, so long items lie across the plate, not out of it.
      slot.rotation.y = angle;
      this.slots.add(slot);
    }
  }

  /** Moves the plate to a world position; the caller sets `location` to match where it was put. */
  placeAt(position: THREE.Vector3): void {
    this.object.position.copy(position);
  }

  /** Returns a cached, fitted model per kind so refresh() clones instead of rebuilding geometry. */
  private template(kind: CrackerKind): THREE.Group {
    let t = this.templates.get(kind);
    if (!t) {
      t = fittedModel(kind);
      this.templates.set(kind, t);
    }
    return t;
  }
}

/**
 * Builds the on-plate copy of one cracker: scaled by its display scale, turned flat where needed, then
 * centred on the origin in X and Z with its lowest point at Y = 0 so it rests on the plate surface.
 */
function fittedModel(kind: CrackerKind): THREE.Group {
  const holder = new THREE.Group();
  const model = makeCrackerModel(kind, { bottle: false });
  model.scale.setScalar(DISPLAY_SCALE[kind] ?? 1);
  if (LAID_FLAT.has(kind)) model.rotation.z = -Math.PI / 2;
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  return holder;
}
