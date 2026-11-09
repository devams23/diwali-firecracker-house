// The village around the courtyard: lime-washed box houses with gable roofs and glowing windows, lanes with lamp posts
// running past the aangan on all four sides, and fairy lights along the eaves. Houses, roofs, windows and lamp poles
// are instanced, and every glow is an emissive dot (see glowPoints.ts), so the whole village adds no real lights and
// only a handful of draw calls.
import * as THREE from 'three';
import type { CollisionWorld } from '../core/Collision';
import type { Updatable } from '../core/Engine';
import { GlowField, type GlowDot } from './glowPoints';
import { makeTextures, rng, tile, type Textures } from './textures';
import { INNER_X, SOUTH_INNER_Z } from './Aangan';
import { Kund, KUND_FOOTPRINT } from './Kund';

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
/** Wall paints for the houses: indigo-blue, teal, turmeric yellow, rose-pink, geru red and lavender. */
const WALL_COLORS = [0x4a5cc8, 0x1fa6a0, 0xf0b428, 0xe8708c, 0xc4482c, 0xa88ce0, 0x2a4fd0, 0x6a78a8];
/** Roof tints: terracotta tiles and a few dark slate ones. */
const ROOF_COLORS = [0xb85a3a, 0xa8482e, 0xc8683c, 0x6a4a52];
/** Eave fairy light colours: gold, saffron, rose, green, white. */
const FAIRY = [0xffc04a, 0xff8a1a, 0xff4a6a, 0x4cd47a, 0xfff0d0].map((h) => new THREE.Color(h).multiplyScalar(1.3));
/** Warm window glow, above 1 so the bloom picks it up. */
const WINDOW_GLOW = new THREE.Color(1.0, 0.81, 0.42);
/** Cream trim for cornices and sills. */
const TRIM = 0xfff1d6;

/** One neighbour house: centre on the ground, size, and the yaw that turns its front (local +z) to face the lane. */
export interface House {
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
export function houseLayout(): House[] {
  const r = rng(515);
  const out: House[] = [];
  const add = (x: number, z: number, yaw: number): void => {
    // Skip a spot that would sit on a lane or crowd a house already placed (the east rows and south rows meet).
    if (onLane(x, z) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) return;
    out.push({ x, z, w: 6 + r() * 3, d: 5 + r() * 2, h: 5.6 + r() * 3, yaw });
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

/** Lamp post positions: thin poles on the inner edge of each lane, skipping the gate's axis on the south and north lanes. */
export function lampSpots(): THREE.Vector3[] {
  const spots: THREE.Vector3[] = [];
  for (let t = -40; t <= 45; t += LAMP_SPACING) {
    spots.push(new THREE.Vector3(LANE_X - LANE_W / 2 - 0.3, 0, t), new THREE.Vector3(-LANE_X + LANE_W / 2 + 0.3, 0, t));
  }
  for (let t = -40; t <= 40; t += LAMP_SPACING) {
    if (Math.abs(t) < 3) continue;
    spots.push(new THREE.Vector3(t, 0, LANE_Z - LANE_W / 2 - 0.3), new THREE.Vector3(t, 0, -LANE_Z_N + LANE_W / 2 + 0.3));
  }
  return spots;
}

/** Extra metres added around each house footprint so the player never clips the eaves or plinth. */
const HOUSE_MARGIN = 0.2;
/** How far outside the outermost house the invisible fence stands, in metres. */
const FENCE_MARGIN = 3;
/** Thickness of each invisible fence slab (thick, so a fast step cannot skip over it). */
const FENCE_T = 4;

/** Ground rectangle (min/max x and z) the player may roam: the built-up village plus a small margin. */
export function villageBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const h of houseLayout()) {
    // A yaw of +-pi/2 swaps which side is the width; the footprint's half extents follow.
    const turned = Math.abs(Math.sin(h.yaw)) > 0.5;
    const hx = (turned ? h.d : h.w) / 2;
    const hz = (turned ? h.w : h.d) / 2;
    b.minX = Math.min(b.minX, h.x - hx);
    b.maxX = Math.max(b.maxX, h.x + hx);
    b.minZ = Math.min(b.minZ, h.z - hz);
    b.maxZ = Math.max(b.maxZ, h.z + hz);
  }
  // The kund is not a house, but the fence must clear it too.
  b.maxZ = Math.max(b.maxZ, KUND_FOOTPRINT.maxZ);
  return { minX: b.minX - FENCE_MARGIN, maxX: b.maxX + FENCE_MARGIN, minZ: b.minZ - FENCE_MARGIN, maxZ: b.maxZ + FENCE_MARGIN };
}

/** Registers the village's solid parts: every house, the kund, the lamp posts and an invisible fence round the lot. */
export function addVillageCollision(world: CollisionWorld): void {
  // Houses: the rotated footprint, inflated a little.
  for (const h of houseLayout()) {
    const turned = Math.abs(Math.sin(h.yaw)) > 0.5;
    const hx = (turned ? h.d : h.w) / 2 + HOUSE_MARGIN;
    const hz = (turned ? h.w : h.d) / 2 + HOUSE_MARGIN;
    world.addBox({ minX: h.x - hx, maxX: h.x + hx, minZ: h.z - hz, maxZ: h.z + hz });
  }
  // The whole ghat tank is blocked, so nobody walks through the steps or into the water.
  world.addBox({ ...KUND_FOOTPRINT });
  // Lamp posts are thin: a small circle each.
  for (const p of lampSpots()) world.addCircle(p.x, p.z, 0.12);
  // Four slabs outside the bounds; they overshoot at the corners so there are no gaps.
  const f = villageBounds();
  world.addBox({ minX: f.minX - FENCE_T, maxX: f.minX, minZ: f.minZ - FENCE_T, maxZ: f.maxZ + FENCE_T });
  world.addBox({ minX: f.maxX, maxX: f.maxX + FENCE_T, minZ: f.minZ - FENCE_T, maxZ: f.maxZ + FENCE_T });
  world.addBox({ minX: f.minX, maxX: f.maxX, minZ: f.minZ - FENCE_T, maxZ: f.minZ });
  world.addBox({ minX: f.minX, maxX: f.maxX, minZ: f.maxZ, maxZ: f.maxZ + FENCE_T });
}

/** Unit box with baked uplight vertex colours: warm orange at the foot fading to cool violet at the top, so house walls look lit from below. */
function washedBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const warm = new THREE.Color(1.0, 0.8, 0.6);
  const cool = new THREE.Color(0.75, 0.78, 1.0);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(warm).lerp(cool, pos.getY(i) + 0.5);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Arch-topped pane of width `w` and height `h`, centred on the origin: the shape of every village window. */
function archGeometry(w: number, h: number): THREE.BufferGeometry {
  const r = w / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-r, -h / 2);
  sh.lineTo(r, -h / 2);
  sh.lineTo(r, h / 2 - r);
  sh.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  sh.lineTo(-r, -h / 2);
  return new THREE.ShapeGeometry(sh);
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
  /** The ghat water tank beyond the south lane, seen down the gate's axis. */
  private readonly kund: Kund;

  /** Builds houses, lanes and lights into the scene, and registers their collision in `world`. */
  constructor(scene: THREE.Scene, world: CollisionWorld) {
    addVillageCollision(world);
    // makeTextures is memoised, so this shares the canvases Game already built.
    const tex = makeTextures();
    const houses = houseLayout();
    const r = rng(616);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dots: GlowDot[] = [];

    const bodies = new THREE.InstancedMesh(
      washedBox(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x3a2418, emissiveIntensity: 0.25, roughness: 0.95 }),
      houses.length,
    );
    const roofs = new THREE.InstancedMesh(
      roofGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
      houses.length,
    );
    const windowMat = new THREE.MeshBasicMaterial({ color: WINDOW_GLOW });
    const windows = new THREE.InstancedMesh(archGeometry(0.9, 1.2), windowMat, houses.length * 9);
    // Cornice and plinth trim: one cream box per house, slightly larger than the body, plus a sill strip per window.
    const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.9 }), houses.length * 5);
    let ti = 0;
    const sills = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.9 }), houses.length * 9);
    // Brown wooden beam ends projecting under each floor's ledge.
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x6a4228, roughness: 0.9 }), houses.length * 40);
    let bi = 0;
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
      // Storeys of about 2.8 m: each has a row of arched windows (lit amber, a few left dark), a sill, a cream ledge and
      // a row of wooden beam ends beneath it.
      const floors = Math.max(2, Math.round(h.h / 2.8));
      const fh = h.h / floors;
      const n = 2 + (r() < 0.5 ? 1 : 0);
      for (let f = 0; f < floors; f++) {
        for (let k = 0; k < n; k++) {
          const u = ((k + 0.5) / n - 0.5) * h.w * 0.75;
          p.set(h.x, f * fh + fh * 0.5, h.z).addScaledVector(fwd, h.d / 2 + 0.03).addScaledVector(right, u);
          m.compose(p, q, s.set(1, 1, 1));
          windows.setMatrixAt(wi, m);
          // About one pane in five is dark: nobody home.
          windows.setColorAt(wi, r() < 0.2 ? c.setRGB(0.1, 0.08, 0.16) : c.setRGB(1, 1, 1));
          // Sill under the window, standing proud of the wall.
          const sp = p.clone().addScaledVector(fwd, 0.08);
          sp.y -= 0.65;
          sills.setMatrixAt(wi++, m.compose(sp, q, s.set(1, 1, 1)));
        }
        // Ledge across the whole house at the top of this storey (the cornice for the last one).
        p.set(h.x, (f + 1) * fh - 0.1, h.z);
        trims.setMatrixAt(ti++, m.compose(p, q, s.set(h.w + 0.3, 0.2, h.d + 0.3)));
        // Beam ends under the ledge on the front face.
        const nb = Math.min(15, Math.floor(h.w / 0.6));
        for (let k = 0; k < nb; k++) {
          const u = ((k + 0.5) / nb - 0.5) * (h.w - 0.4);
          p.set(h.x, (f + 1) * fh - 0.3, h.z).addScaledVector(fwd, h.d / 2 + 0.1).addScaledVector(right, u);
          beams.setMatrixAt(bi++, m.compose(p, q, s.set(1, 1, 1)));
        }
      }
      // Plinth band at the foot.
      p.set(h.x, 0.2, h.z);
      trims.setMatrixAt(ti++, m.compose(p, q, s.set(h.w + 0.12, 0.4, h.d + 0.12)));
      // Fairy lights along the front eave, a bulb every 0.45 m, colours cycling.
      const bulbs = Math.floor(h.w / 0.45);
      for (let k = 0; k <= bulbs; k++) {
        const u = (k / bulbs - 0.5) * (h.w + 0.4);
        const sag = 0.18 * Math.sin((k / bulbs) * Math.PI);
        const pos = new THREE.Vector3(h.x, h.h - 0.2 - sag, h.z)
          .addScaledVector(fwd, h.d / 2 + 0.12)
          .addScaledVector(right, u);
        dots.push({ pos, color: FAIRY[(k + i) % FAIRY.length], size: 0.15 });
      }
    });
    windows.count = wi;
    sills.count = wi;
    trims.count = ti;
    beams.count = bi;
    for (const mesh of [bodies, roofs, windows, trims, sills, beams]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;

    this.buildLanes(scene, dots, tex);

    this.glow = new GlowField(dots, 0.5);
    scene.add(this.glow.points);
    this.kund = new Kund(scene, tex);
  }

  /** Lane strips on the ground and a lamp post every LAMP_SPACING metres, each with a warm glow at its top. */
  private buildLanes(scene: THREE.Scene, dots: GlowDot[], tex: Textures): void {
    // Lane paving: terracotta flagstones with a faint self-lit copy; each strip gets its own repeat so flags stay ~0.9 m.
    const stripMat = (w: number, d: number): THREE.MeshStandardMaterial => {
      const map = tile(tex.paving, w / 2.7, d / 2.4);
      return new THREE.MeshStandardMaterial({
        map,
        emissive: 0xff8a50,
        emissiveMap: map,
        emissiveIntensity: 0.16,
        roughness: 1,
        // Pulled toward the camera so the thin strip never z-fights the ground at a distance.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    };
    const lanes: { x: number; z: number; w: number; d: number }[] = [
      { x: LANE_X, z: 5, w: LANE_W, d: 90 },
      { x: -LANE_X, z: 5, w: LANE_W, d: 90 },
      { x: 0, z: LANE_Z, w: 90, d: LANE_W },
      { x: 0, z: -LANE_Z_N, w: 90, d: LANE_W },
    ];
    for (const l of lanes) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), stripMat(l.w, l.d));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(l.x, 0.012, l.z);
      scene.add(mesh);
    }
    // A short path from the gate across to the south lane.
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, LANE_Z - SOUTH_INNER_Z), stripMat(2.4, LANE_Z - SOUTH_INNER_Z));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.013, (LANE_Z + SOUTH_INNER_Z) / 2);
    scene.add(path);

    // Lamp posts: thin iron poles with a warm lamp head, on the inner edge of each lane.
    const spots = lampSpots();
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
      dots.push({ pos: new THREE.Vector3(sp.x, LAMP_H + 0.1, sp.z), color: new THREE.Color(1.3, 0.9, 0.4), size: 0.7 });
      dots.push({ pos: new THREE.Vector3(sp.x, LAMP_H + 0.1, sp.z), color: new THREE.Color(3, 2.6, 1.8), size: 0.45 });
    });
    poles.frustumCulled = false;
    scene.add(poles);
  }

  /** Twinkles the village lights. */
  update(dt: number, t: number): void {
    this.glow.update(dt, t);
    this.kund.update(dt, t);
  }
}
