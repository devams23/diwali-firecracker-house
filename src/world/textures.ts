// Procedural canvas textures for the village: lime-and-geru plaster, beaten earth, khaprail roof
// tiles, wood grain and a transparent rangoli. Generated at load time so no image assets ship.
// Noise is tileable and seeded, so every build looks the same and repeated surfaces show no seams.
import * as THREE from 'three';

type Rgb = [number, number, number];

const TAU = Math.PI * 2;
const LIME: Rgb = [232, 220, 196];
const LIME_DUST: Rgb = [196, 180, 156];
const GERU: Rgb = [156, 59, 34];
const EARTH: Rgb = [122, 90, 60];
const WOOD: Rgb = [90, 59, 34];
const TERRACOTTA: Rgb = [138, 74, 46];

/** The five canvas textures used across the village. */
export type Textures = ReturnType<typeof makeTextures>;

/** Builds every procedural texture; call once and share the result across the world builders. */
export function makeTextures(): {
  plaster: THREE.CanvasTexture;
  earth: THREE.CanvasTexture;
  tiles: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  rangoli: THREE.CanvasTexture;
} {
  const plasterCanvas = paint(512, makePlasterShade());
  drawCracks(plasterCanvas.getContext('2d')!, 512, 7);

  const earthCanvas = paint(512, makeEarthShade());
  drawBroomStreaks(earthCanvas.getContext('2d')!, 512, 13);

  const tilesCanvas = document.createElement('canvas');
  tilesCanvas.width = tilesCanvas.height = 512;
  drawTiles(tilesCanvas.getContext('2d')!, 512, 19);

  const woodCanvas = paint(512, makeWoodShade());

  const rangoliCanvas = document.createElement('canvas');
  rangoliCanvas.width = rangoliCanvas.height = 1024;
  drawRangoli(rangoliCanvas.getContext('2d')!, 1024);

  return {
    plaster: toTexture(plasterCanvas, true),
    earth: toTexture(earthCanvas, true),
    tiles: toTexture(tilesCanvas, true),
    wood: toTexture(woodCanvas, true),
    rangoli: toTexture(rangoliCanvas, false),
  };
}

/** Clones a texture with its own repeat so one canvas can tile differently on each surface. */
export function tile(tex: THREE.CanvasTexture, rx: number, ry: number): THREE.CanvasTexture {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** Wraps a canvas as an sRGB texture; `wrap` enables repeating (off for decals). */
function toTexture(canvas: HTMLCanvasElement, wrap: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Seeded PRNG (mulberry32) so the procedural layout is identical on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value-noise sampler over (u, v) in [0,1); `px` and `py` set the lattice size. */
function valueNoise(px: number, py: number, seed: number): (u: number, v: number) => number {
  const r = rng(seed);
  const grid = new Float32Array(px * py);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (ix: number, iy: number) =>
    grid[(((iy % py) + py) % py) * px + (((ix % px) + px) % px)];
  return (u, v) => {
    const x = u * px;
    const y = v * py;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  };
}

/** Sums octaves of value noise into one [0,1] field; `period` is the coarsest lattice count. */
function fbm(period: number, seed: number, octaves = 4): (u: number, v: number) => number {
  const layers: { n: (u: number, v: number) => number; w: number }[] = [];
  let p = period;
  for (let i = 0; i < octaves; i++) {
    layers.push({ n: valueNoise(p, p, seed + i * 17), w: 0.5 ** i });
    p *= 2;
  }
  const wsum = layers.reduce((s, l) => s + l.w, 0);
  return (u, v) => layers.reduce((s, l) => s + l.n(u, v) * l.w, 0) / wsum;
}

/** Hermite step from 0 at `a` to 1 at `b`; used to soften thresholds on noise. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Linear blend of two channel values. */
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fills a square canvas per pixel; v = 1 is the top row, matching a flipY canvas texture. */
function paint(size: number, shade: (u: number, v: number) => Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, 1 - (y + 0.5) / size);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Plaster: lime-white upper 60%, geru band lower 40% with a wobbly hand-painted edge,
 * greyed lime-wash patches and brush streaks in the band.
 */
function makePlasterShade(): (u: number, v: number) => Rgb {
  const blotch = fbm(4, 11, 4);
  const mottle = fbm(16, 29, 3);
  const grain = fbm(128, 37, 2);
  const brush = valueNoise(4, 96, 43);
  const edgeNoise = valueNoise(32, 1, 53);
  return (u, v) => {
    // The geru edge sits near 40% height and wobbles with a few low harmonics plus noise.
    const edge =
      0.4 +
      0.022 * Math.sin(TAU * 2 * u + 1.3) +
      0.012 * Math.sin(TAU * 5 * u + 0.4) +
      0.006 * Math.sin(TAU * 13 * u + 2.1) +
      0.012 * (edgeNoise(u, 0) * 2 - 1);
    if (v < edge) {
      const s = 0.86 + 0.2 * brush(u, v);
      const t = 0.94 + 0.1 * mottle(u, v);
      return [GERU[0] * s * t, GERU[1] * s * t, GERU[2] * s * t];
    }
    const dust = smooth(0.55, 0.75, 1 - blotch(u, v)) * 0.45;
    const light = 0.95 + 0.05 * mottle(u, v) + 0.03 * (grain(u, v) * 2 - 1);
    return [
      mix(LIME[0], LIME_DUST[0], dust) * light,
      mix(LIME[1], LIME_DUST[1], dust) * light,
      mix(LIME[2], LIME_DUST[2], dust) * light,
    ];
  };
}

/** Beaten earth: soft mottling, scattered pebbles; broom streaks are added on the canvas. */
function makeEarthShade(): (u: number, v: number) => Rgb {
  const mottle = fbm(4, 61, 4);
  const fine = fbm(64, 71, 3);
  const pebble = valueNoise(64, 64, 79);
  return (u, v) => {
    const k = (0.8 + 0.4 * mottle(u, v)) * (0.92 + 0.16 * fine(u, v));
    const p = pebble(u, v);
    const t = p > 0.84 ? Math.min(1, (p - 0.84) * 12) * 0.55 : 0;
    return [
      mix(EARTH[0] * k, 168, t),
      mix(EARTH[1] * k, 150, t),
      mix(EARTH[2] * k, 122, t),
    ];
  };
}

/** Wood grain: long lines running along v, warped by low-frequency noise. */
function makeWoodShade(): (u: number, v: number) => Rgb {
  const warp = fbm(4, 83, 3);
  const fine = fbm(96, 89, 2);
  return (u, v) => {
    // 14 integer cycles across u keeps the pattern seamless when repeated.
    const g = 0.5 + 0.5 * Math.sin(TAU * (14 * u + 0.9 * warp(u, v)));
    const k = (0.72 + 0.38 * g * g) * (0.9 + 0.2 * fine(u, v));
    return [WOOD[0] * k, WOOD[1] * k, WOOD[2] * k];
  };
}

/**
 * Hairline cracks: short random-walk polylines in a dark, translucent brown. Each one is stroked at
 * every wrap offset, so a crack that leaves one edge re-enters at the opposite edge.
 */
function drawCracks(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const r = rng(seed);
  for (let c = 0; c < 7; c++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * TAU;
    const pts: [number, number][] = [[x, y]];
    ctx.strokeStyle = `rgba(96,66,44,${(0.25 + 0.2 * r()).toFixed(3)})`;
    ctx.lineWidth = 0.6 + 0.5 * r();
    const steps = 10 + Math.floor(r() * 18);
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 3.2;
      y += Math.sin(a) * 3.2;
      pts.push([x, y]);
    }
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
        ctx.stroke();
      }
    }
  }
}

/** Faint broom-sweep streaks drawn over the earth so the ground reads as swept, not poured. */
function drawBroomStreaks(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 60; i++) {
    const y = r() * size;
    const x0 = r() * size;
    const len = 80 + r() * 160;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(60,40,24,0.06)' : 'rgba(190,160,120,0.05)';
    ctx.lineWidth = 1 + r() * 2;
    const y1 = y + (r() - 0.5) * 6;
    // Streaks are wider than the canvas edge can clip, so each is drawn at both wrap offsets.
    for (const dx of [-size, 0, size]) {
      ctx.beginPath();
      ctx.moveTo(x0 + dx, y);
      ctx.lineTo(x0 + len + dx, y1);
      ctx.stroke();
    }
  }
}

/**
 * Khaprail (pan tile) rows in terracotta. The grid is 8 columns by 16 rows; each tile's shade is read
 * from its grid cell, so the pattern is periodic. Every tile is also drawn at the four wrap offsets,
 * so tiles cut by an edge show their other half on the opposite edge.
 */
function drawTiles(ctx: CanvasRenderingContext2D, size: number, seed: number): void {
  const r = rng(seed);
  const COLS = 8;
  const ROWS = 16;
  const shades: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) shades.push(0.82 + 0.3 * r());
  const css = (c: Rgb, k: number) =>
    `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
  ctx.fillStyle = css(TERRACOTTA, 1);
  ctx.fillRect(0, 0, size, size);

  const rowH = size / ROWS;
  const tileW = size / COLS;
  // The lower half-disc spans exactly one row, so neighbouring rows never overlap and no draw
  // order can show a seam between them.
  const ry = rowH;
  const rx = tileW * 0.46;
  for (let row = 0; row < ROWS; row++) {
    const shift = row % 2 ? tileW / 2 : 0;
    for (let col = 0; col < COLS; col++) {
      const k = shades[row * COLS + col];
      const x0 = col * tileW + shift;
      const y0 = row * rowH;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const x = x0 + dx;
          const y = y0 + dy;
          const g = ctx.createRadialGradient(x, y, 2, x, y, ry);
          g.addColorStop(0, css(TERRACOTTA, k * 1.18));
          g.addColorStop(1, css(TERRACOTTA, k * 0.6));
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
          ctx.closePath();
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = 'rgba(42,20,10,0.55)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }
}

/** Eight-fold rangoli in marigold, red, white, green and turmeric on a transparent background. */
function drawRangoli(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const scale = size / 1024;
  const MARIGOLD = '#f2a01f';
  const RED = '#b8322a';
  const GREEN = '#4f7a3a';
  const TURMERIC = '#e0b020';
  const WHITE = '#f4ecdc';
  const SOLID = (n: number) => Math.round(n * scale);

  // Each petal is an ellipse whose near edge sits at radius r0 and which extends outward by len.
  const petal = (angle: number, r0: number, len: number, halfW: number, fill: string, edge: string) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -SOLID(r0 + len / 2), SOLID(halfW), SOLID(len / 2), 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.restore();
  };
  const dot = (angle: number, r: number, rad: number, fill: string) => {
    ctx.beginPath();
    // Same placement as petal(): angle 0 points up (-y), angle grows clockwise on screen.
    ctx.arc(c + Math.sin(angle) * SOLID(r), c - Math.cos(angle) * SOLID(r), SOLID(rad), 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const ring = (r: number) => {
    ctx.beginPath();
    ctx.arc(c, c, SOLID(r), 0, TAU);
    ctx.strokeStyle = '#7a3a1c';
    ctx.lineWidth = 4 * scale;
    ctx.stroke();
  };

  ring(300);
  ring(195);
  for (let i = 0; i < 16; i++) dot((i * TAU) / 16, 478, 8, WHITE);
  for (let i = 0; i < 8; i++) petal((i * TAU) / 8, 260, 200, 58, MARIGOLD, '#b06a10');
  for (let i = 0; i < 8; i++) petal((i * TAU) / 8 + TAU / 16, 250, 110, 34, RED, '#6b1e14');
  for (let i = 0; i < 16; i++) dot((i * TAU) / 16, 215, 10, TURMERIC);
  for (let i = 0; i < 8; i++) petal((i * TAU) / 8, 150, 80, 24, GREEN, '#2f4d22');
  for (let i = 0; i < 8; i++) petal((i * TAU) / 8 + TAU / 16, 90, 60, 22, WHITE, '#9a8a70');

  ctx.beginPath();
  ctx.arc(c, c, SOLID(70), 0, TAU);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, SOLID(40), 0, TAU);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, SOLID(18), 0, TAU);
  ctx.fillStyle = MARIGOLD;
  ctx.fill();
}
