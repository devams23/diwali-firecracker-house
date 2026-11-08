// The village around the courtyard: lime-washed box houses with gable roofs and glowing windows, lanes with lamp posts
// running past the aangan on all four sides, and fairy lights along the eaves. Houses, roofs, windows and lamp poles
// are instanced, and every glow is an emissive dot (see glowPoints.ts), so the whole village adds no real lights and
// only a handful of draw calls.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { GlowField, type GlowDot } from './glowPoints';
import { rng } from './textures';
import { INNER_X, SOUTH_INNER_Z } from './Aangan';

/** Centre line of the lanes beside the courtyard: east and west at x = LANE_X, south at z = LANE_Z, north at z = -LANE_Z_N. */
const LANE_X = INNER_X + 6;
const LANE_Z = SOUTH_INNER_Z + 7;
const LANE_Z_N = 18;
/** Width of a lane, in metres. */
const LANE_W = 4;
/** Distance between lane lamp posts, in metres. */
const LAMP_SPACING = 8;
/** Lamp post height, in metres. */
const LAMP_H = 3.2;
/** Wall tints for the houses: lime, peach, turmeric, rose, mint, sky. */
const WALL_COLORS = [0xf2ead0, 0xf6c9a0, 0xf2d060, 0xf0a0a8, 0xb8e0c0, 0xa8d0f0];
/** Roof tints: terracotta tiles and a few dark slate ones. */
const ROOF_COLORS = [0xb85a3a, 0xa8482e, 0xc8683c, 0x6a4a52];
/** Eave fairy light colours: gold, saffron, rose, green, white. */
const FAIRY = [0xffc04a, 0xff8a1a, 0xff4a6a, 0x4cd47a, 0xfff0d0].map((h) => new THREE.Color(h).multiplyScalar(1.7));
/** Warm window glow, above 1 so the bloom picks it up. */
const WINDOW_GLOW = new THREE.Color(1.9, 1.3, 0.6);

/** One neighbour house: centre on the ground, size, and the yaw that turns its front (local +z) to face the lane. */
interface House {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
}

/** True when a house centred here would stand on, or hang over, one of the lanes. */
function onLane(x: number, z: number): boolean {
  const nearEw = Math.abs(Math.abs(x) - LANE_X) < 6 && z > -45 && z < 50;
  const nearS = Math.abs(z - LANE_Z) < 6 && Math.abs(x) < 50;
  const nearN = Math.abs(z + LANE_Z_N) < 6 && Math.abs(x) < 50;
  return nearEw || nearS || nearN;
}

/** The houses, placed in two rows on each side of the courtyard, fronts toward the nearest lane. */
function houseLayout(): House[] {
  const r = rng(515);
  const out: House[] = [];
  const add = (x: number, z: number, yaw: number): void => {
    // Skip a spot that would sit on a lane or crowd a house already placed (the east rows and south rows meet).
    if (onLane(x, z) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) return;
    out.push({ x, z, w: 6 + r() * 3, d: 5 + r() * 2, h: 3 + r() * 1.4, yaw });
  };
  // East and west: two rows facing the lane, fronts turned toward the courtyard.
  for (const side of [-1, 1]) {
    for (let z = -30; z <= 40; z += 9.5) {
      add(side * (LANE_X + 6.5 + r()), z + (r() - 0.5) * 2, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      add(side * (LANE_X + 19 + r() * 3), z + 4 + (r() - 0.5) * 2, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // South: houses beyond the south lane, fronts turned north, leaving the lane view from the gate open at x = 0.
  for (let x = -40; x <= 40; x += 10) {
    if (Math.abs(x) < 6) continue;
    add(x + (r() - 0.5) * 2, LANE_Z + 6.5 + r(), Math.PI);
    add(x + 5 + (r() - 0.5) * 2, LANE_Z + 19 + r() * 3, Math.PI);
  }
  // North: houses behind the courtyard house, fronts turned south toward the back lane.
  for (let x = -40; x <= 40; x += 11) {
    add(x + (r() - 0.5) * 2, -LANE_Z_N - 6.5 - r(), 0);
    add(x + 5 + (r() - 0.5) * 2, -LANE_Z_N - 19 - r() * 3, 0);
  }
  return out;
}

/** Triangular prism roof of unit width, height and depth, ridge along z, base at y = 0. */
function roofGeometry(): THREE.BufferGeometry {
  const hw = 0.5;
  const hd = 0.5;
  const v = [
    -hw, 0, -hd, -hw, 0, hd, 0, 1, hd,
    -hw, 0, -hd, 0, 1, hd, 0, 1, -hd,
    hw, 0, -hd, 0, 1, -hd, 0, 1, hd,
    hw, 0, -hd, 0, 1, hd, hw, 0, hd,
    -hw, 0, hd, hw, 0, hd, 0, 1, hd,
    -hw, 0, -hd, 0, 1, -hd, hw, 0, -hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Builds the village and registers its twinkling lights; add once. */
export class Village implements Updatable {
  private readonly glow: GlowField;

  /** Builds houses, lanes and lights into the scene. */
  constructor(scene: THREE.Scene) {
    const houses = houseLayout();
    const r = rng(616);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dots: GlowDot[] = [];

    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6a4a30, emissiveIntensity: 0.5, roughness: 0.95 }),
      houses.length,
    );
    const roofs = new THREE.InstancedMesh(
      roofGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
      houses.length,
    );
    const windowMat = new THREE.MeshBasicMaterial({ color: WINDOW_GLOW });
    const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.1), windowMat, houses.length * 3);
    let wi = 0;
    const c = new THREE.Color();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();

    houses.forEach((h, i) => {
      q.setFromAxisAngle(up, h.yaw);
      p.set(h.x, h.h / 2, h.z);
      m.compose(p, q, s.set(h.w, h.h, h.d));
      bodies.setMatrixAt(i, m);
      bodies.setColorAt(i, c.setHex(WALL_COLORS[Math.floor(r() * WALL_COLORS.length)]));
      // The roof ridge runs along the house's width (local x), so the pitch faces front and back.
      const roofQ = new THREE.Quaternion().setFromAxisAngle(up, h.yaw + Math.PI / 2);
      p.set(h.x, h.h, h.z);
      m.compose(p, roofQ, s.set(h.d + 0.8, 1.7 + r() * 0.5, h.w + 0.8));
      roofs.setMatrixAt(i, m);
      roofs.setColorAt(i, c.setHex(ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)]));

      // Local frame: front is +z, right is +x; world = rotateY(yaw) * local.
      const fwd = new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
      const right = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw));
      // Two or three lit windows on the front face.
      const n = 2 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n - 0.5) * h.w * 0.75;
        p.set(h.x, h.h * 0.55, h.z).addScaledVector(fwd, h.d / 2 + 0.03).addScaledVector(right, u);
        m.compose(p, q, s.set(1, 1, 1));
        windows.setMatrixAt(wi++, m);
      }
      // Fairy lights along the front eave, a bulb every 0.45 m, colours cycling.
      const bulbs = Math.floor(h.w / 0.45);
      for (let k = 0; k <= bulbs; k++) {
        const u = (k / bulbs - 0.5) * (h.w + 0.4);
        const sag = 0.18 * Math.sin((k / bulbs) * Math.PI);
        const pos = new THREE.Vector3(h.x, h.h - 0.2 - sag, h.z)
          .addScaledVector(fwd, h.d / 2 + 0.12)
          .addScaledVector(right, u);
        dots.push({ pos, color: FAIRY[(k + i) % FAIRY.length], size: 0.28 });
      }
    });
    windows.count = wi;
    for (const mesh of [bodies, roofs, windows]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;

    this.buildLanes(scene, dots);

    this.glow = new GlowField(dots, 0.5);
    scene.add(this.glow.points);
  }

  /** Lane strips on the ground and a lamp post every LAMP_SPACING metres, each with a warm glow at its top. */
  private buildLanes(scene: THREE.Scene, dots: GlowDot[]): void {
    const strip = new THREE.MeshStandardMaterial({
      color: 0xb48a60,
      roughness: 1,
      emissive: 0x3a2412,
      emissiveIntensity: 0.5,
      // Pulled toward the camera so the thin strip never z-fights the ground at a distance.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lanes: { x: number; z: number; w: number; d: number }[] = [
      { x: LANE_X, z: 5, w: LANE_W, d: 90 },
      { x: -LANE_X, z: 5, w: LANE_W, d: 90 },
      { x: 0, z: LANE_Z, w: 90, d: LANE_W },
      { x: 0, z: -LANE_Z_N, w: 90, d: LANE_W },
    ];
    for (const l of lanes) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), strip);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(l.x, 0.012, l.z);
      scene.add(mesh);
    }
    // A short path from the gate across to the south lane.
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, LANE_Z - SOUTH_INNER_Z), strip);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.013, (LANE_Z + SOUTH_INNER_Z) / 2);
    scene.add(path);

    // Lamp posts: thin iron poles with a warm lamp head, on the inner edge of each lane.
    const spots: THREE.Vector3[] = [];
    for (let t = -40; t <= 45; t += LAMP_SPACING) {
      spots.push(new THREE.Vector3(LANE_X - LANE_W / 2 - 0.3, 0, t), new THREE.Vector3(-LANE_X + LANE_W / 2 + 0.3, 0, t));
    }
    for (let t = -40; t <= 40; t += LAMP_SPACING) {
      if (Math.abs(t) < 3) continue;
      spots.push(new THREE.Vector3(t, 0, LANE_Z - LANE_W / 2 - 0.3), new THREE.Vector3(t, 0, -LANE_Z_N + LANE_W / 2 + 0.3));
    }
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.05, 0.07, LAMP_H, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.7 }),
      spots.length,
    );
    const m = new THREE.Matrix4();
    spots.forEach((sp, i) => {
      m.makeTranslation(sp.x, LAMP_H / 2, sp.z);
      poles.setMatrixAt(i, m);
      // A large soft halo plus a small hot core, so the lamp reads as a real light on the lane.
      dots.push({ pos: new THREE.Vector3(sp.x, LAMP_H + 0.1, sp.z), color: new THREE.Color(1.6, 1.1, 0.5), size: 1.4 });
      dots.push({ pos: new THREE.Vector3(sp.x, LAMP_H + 0.1, sp.z), color: new THREE.Color(3, 2.6, 1.8), size: 0.45 });
    });
    poles.frustumCulled = false;
    scene.add(poles);
  }

  /** Twinkles the village lights. */
  update(dt: number, t: number): void {
    this.glow.update(dt, t);
  }
}
