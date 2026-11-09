// A ghat-style village water tank (kund) beyond the south wall, straight down the gate's axis so it is seen from the
// courtyard. A broad flight of terracotta flagstone steps climbs to a raised landing and a still pool with a low
// parapet; a row of small clay diyas burns along every step edge and the tank rim. The lamps are one InstancedMesh and
// their flames are glow dots (see glowPoints.ts), so the whole thing adds no point lights. Village.ts blocks the whole
// footprint (KUND_FOOTPRINT) so the player cannot walk onto the steps or into the water.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { bowlGeometry, CLAY } from '../items/Diya';
import { GlowField, type GlowDot } from './glowPoints';
import { makeTextures, type Textures } from './textures';

/** The z where the first step starts, just past the south lane; the ghat is centred on x = 0, the gate's axis. */
const START_Z = 22.2;
/** Steps in the flight, their depth (run) and height (rise), in metres. */
const STEPS = 6;
const TREAD = 0.6;
const RISE = 0.18;
/** Half the width of the whole ghat, in metres. */
const HALF_W = 4.5;
/** Depth of the landing at the top of the flight and of the pool basin behind it. */
const LANDING = 1.0;
const BASIN = 6.6;
/** Height of the landing (top of the last step) and of the water surface just below it. */
const TOP_Y = STEPS * RISE;
const WATER_Y = TOP_Y - 0.05;
/** Width of the parapet around the pool and how far it stands above the landing. */
const RIM_W = 0.5;
const RIM_H = 0.22;
/** Distance between neighbouring diyas on a row, and the scale that makes them read from the courtyard. */
const DIYA_GAP = 0.78;
const DIYA_SCALE = 2.2;
/** Height of a flame above the bowl base, in metres at the diya scale. */
const FLAME_Y = 0.07 * DIYA_SCALE;
/** Ground rectangle of the whole ghat (steps, landing and basin), used as its collision box. */
export const KUND_FOOTPRINT = {
  minX: -HALF_W,
  maxX: HALF_W,
  minZ: START_Z,
  maxZ: START_Z + STEPS * TREAD + LANDING + BASIN,
};
/** Brick-red tint over the paving flags so the ghat reads warmer and browner than the lanes. */
const STONE_TINT = 0xe6a888;
/** Flame core and halo colours, above 1 so the bloom catches them. */
const FLAME_CORE = new THREE.Color(2.8, 2.0, 0.9);
const FLAME_HALO = new THREE.Color(1.1, 0.55, 0.14);
/** Faint reflection of the flames on the water. */
const REFLECT = new THREE.Color(0.9, 0.45, 0.12);

/** A box with its UVs scaled to the paving's 2.7 x 2.4 m flag size, so flags stay the same size on every face. */
function stoneBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z, four vertices each; pick each face's two spanning sizes.
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = spans[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * a) / 2.7, (uv.getY(i) * b) / 2.4);
  }
  return g;
}

/** Still-water texture: violet sky reflected at the back, warm lamp-gold streaks near the front where the diyas are. */
function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    // Row 0 of the canvas maps to the back of the pool (far side), the last row to the front by the steps.
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#4a2a7a');
    g.addColorStop(0.55, '#2c1a5a');
    g.addColorStop(1, '#6a3068');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    // Soft horizontal ripples of gold light, brighter toward the front.
    for (let i = 0; i < 26; i++) {
      const y = 120 + (i / 26) * 136;
      const a = 0.04 + (i / 26) * 0.14;
      ctx.fillStyle = `rgba(255,170,80,${a.toFixed(3)})`;
      ctx.fillRect(8 + ((i * 37) % 50), y, 40 + ((i * 53) % 60), 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The ghat and pool; add once and register with the engine for the flame flicker. */
export class Kund implements Updatable {
  private readonly glow: GlowField;

  /** Builds the steps, pool, parapet, diyas and flames into the scene. */
  constructor(scene: THREE.Scene, tex: Textures = makeTextures()) {
    const stone = new THREE.MeshStandardMaterial({
      map: tex.paving,
      color: STONE_TINT,
      emissive: 0xff8a50,
      emissiveMap: tex.paving,
      emissiveIntensity: 0.18,
      roughness: 1,
    });
    /** Adds one stone slab centred at (cx, cz) with its x/z size and its bottom and top heights. */
    const slab = (cx: number, cz: number, w: number, d: number, y0: number, y1: number): void => {
      const mesh = new THREE.Mesh(stoneBox(w, y1 - y0, d), stone);
      mesh.position.set(cx, (y0 + y1) / 2, cz);
      scene.add(mesh);
    };

    // The flight: each step is its own slab from the ground up, so the risers show their full height.
    for (let i = 0; i < STEPS; i++) {
      slab(0, START_Z + TREAD * (i + 0.5), HALF_W * 2, TREAD, 0, (i + 1) * RISE);
    }
    const landingZ = START_Z + STEPS * TREAD;
    slab(0, landingZ + LANDING / 2, HALF_W * 2, LANDING, 0, TOP_Y);
    // The pool basin: a stone block the water sits in the top of, with the parapet standing on three sides.
    const basinZ = landingZ + LANDING;
    slab(0, basinZ + BASIN / 2, HALF_W * 2, BASIN, 0, TOP_Y);
    const backZ = basinZ + BASIN;
    slab(0, backZ - RIM_W / 2, HALF_W * 2, RIM_W, TOP_Y, TOP_Y + RIM_H);
    for (const side of [-1, 1]) {
      slab(side * (HALF_W - RIM_W / 2), basinZ + BASIN / 2, RIM_W, BASIN, TOP_Y, TOP_Y + RIM_H);
    }

    // Water: an unlit textured plane just under the landing so it reads as still, dark and lamp-lit.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry((HALF_W - RIM_W) * 2, BASIN - RIM_W),
      new THREE.MeshBasicMaterial({ map: waterTexture() }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, WATER_Y + 0.06, basinZ + (BASIN - RIM_W) / 2);
    scene.add(water);

    // Diya spots: along each step's front edge, along the landing's front edge and on top of the parapet.
    const spots: THREE.Vector3[] = [];
    const row = (z: number, y: number, x0: number, x1: number): void => {
      const n = Math.max(1, Math.round((x1 - x0) / DIYA_GAP));
      for (let k = 0; k <= n; k++) spots.push(new THREE.Vector3(x0 + ((x1 - x0) * k) / n, y, z));
    };
    for (let i = 0; i < STEPS; i++) row(START_Z + TREAD * i + 0.14, (i + 1) * RISE, -HALF_W + 0.3, HALF_W - 0.3);
    row(landingZ + 0.14, TOP_Y, -HALF_W + 0.3, HALF_W - 0.3);
    row(backZ - RIM_W / 2, TOP_Y + RIM_H, -HALF_W + 0.3, HALF_W - 0.3);
    for (const side of [-1, 1]) {
      const x = side * (HALF_W - RIM_W / 2);
      const n = Math.round((BASIN - RIM_W) / DIYA_GAP);
      for (let k = 1; k < n; k++) spots.push(new THREE.Vector3(x, TOP_Y + RIM_H, basinZ + ((BASIN - RIM_W) * k) / n));
    }

    // Clay cups (one instanced mesh) and a core plus halo glow dot per flame; none of it is a real light.
    const cups = new THREE.InstancedMesh(bowlGeometry(), new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.85, emissive: 0x4a2208 }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(DIYA_SCALE, DIYA_SCALE, DIYA_SCALE);
    const dots: GlowDot[] = [];
    spots.forEach((sp, i) => {
      cups.setMatrixAt(i, m.compose(sp, q, scale));
      const flame = sp.clone();
      flame.y += FLAME_Y;
      dots.push({ pos: flame, color: FLAME_CORE, size: 0.14 }, { pos: flame.clone(), color: FLAME_HALO, size: 0.5 });
    });
    cups.frustumCulled = false;
    scene.add(cups);
    // Reflections: a faint glow on the water in front of the back rim's lamps, so the pool picks up their light.
    for (let k = 0; k < 9; k++) {
      const x = -HALF_W + RIM_W + 0.5 + ((HALF_W - RIM_W - 0.5) * 2 * k) / 8;
      dots.push({ pos: new THREE.Vector3(x, WATER_Y + 0.1, backZ - RIM_W - 0.9), color: REFLECT, size: 0.9 });
    }

    // A gentle flicker: a shallow twinkle depth keeps the flames alive without strobing.
    this.glow = new GlowField(dots, 0.3);
    scene.add(this.glow.points);
  }

  /** Advances the flame flicker. */
  update(dt: number, t: number): void {
    this.glow.update(dt, t);
  }
}
