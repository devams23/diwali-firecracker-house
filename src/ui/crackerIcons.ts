// Procedural hotbar icons: one small canvas drawing per cracker kind, painted from plain shapes (lines, arcs,
// rounded rects, stars) in the kind's catalogue tint. Each painter works in a 100 by 100 unit box, scaled to the
// canvas, so the same drawing holds at any size. No image files are loaded.
import { CRACKERS, type CrackerKind } from '../crackers/catalog';

/** Paints one icon onto a context already scaled so the drawing space is 100 by 100 units. */
type Painter = (g: CanvasRenderingContext2D, tint: string) => void;

/** Paper cream used for fuses, wires and the light parts of each icon. */
const PAPER = '#e8dcc4';
/** Bamboo tan used for sticks and holders. */
const BAMBOO = '#c8a46a';
/** Clay brown used for the anar's pot. */
const CLAY = '#9a5a34';
/** Warm gold used for sparks and star tips. */
const GOLD = '#f2c75c';
/** Dark ground used for the holes in a chakri. */
const HOLE = '#1c120a';

/** Traces a regular star outline centred on (cx, cy), with five points. */
function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Phuljhadi: a thin wire on a stick, with a bright spray of sparks at the tip. */
const paintPhuljhadi: Painter = (g) => {
  g.strokeStyle = BAMBOO;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(30, 88);
  g.lineTo(60, 32);
  g.stroke();
  // The burning wire, a few short strokes fanning out from the tip.
  g.strokeStyle = PAPER;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(60, 32);
  g.lineTo(66, 22);
  g.stroke();
  g.strokeStyle = GOLD;
  g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i * Math.PI * 0.9) / 8;
    g.beginPath();
    g.moveTo(66 + Math.cos(a) * 4, 22 + Math.sin(a) * 4);
    g.lineTo(66 + Math.cos(a) * 16, 22 + Math.sin(a) * 16);
    g.stroke();
  }
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(66, 22, 2.6, 0, Math.PI * 2);
  g.fill();
};

/** Pencil: a long slim stick with a ferrule and a sharpened paper tip. */
const paintPencil: Painter = (g, tint) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.7);
  g.fillStyle = tint;
  g.fillRect(-6, -36, 12, 56);
  g.fillStyle = PAPER;
  g.fillRect(-6, -36, 12, 4);
  g.beginPath();
  g.moveTo(-6, 20);
  g.lineTo(6, 20);
  g.lineTo(0, 34);
  g.closePath();
  g.fill();
  g.restore();
};

/** Anar: a clay pot with a fountain of sparks rising from its mouth. */
const paintAnar: Painter = (g, tint) => {
  g.fillStyle = CLAY;
  g.beginPath();
  g.moveTo(32, 70);
  g.lineTo(68, 70);
  g.lineTo(62, 92);
  g.lineTo(38, 92);
  g.closePath();
  g.fill();
  g.fillStyle = tint;
  g.fillRect(28, 62, 44, 8);
  // The fountain: dots fanned upward from the mouth, alternating tint and gold.
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + ((i - 6.5) / 6.5) * 1.1;
    const r = 26 + (i % 3) * 6;
    g.fillStyle = i % 2 === 0 ? GOLD : tint;
    g.beginPath();
    g.arc(50 + Math.cos(a) * r * 0.9, 60 + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
    g.fill();
  }
};

/** Chakri: a flat disc with a spiral of concentric rings and a dark centre hole. */
const paintChakri: Painter = (g, tint) => {
  g.fillStyle = tint;
  g.beginPath();
  g.arc(50, 50, 36, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAPER;
  g.lineWidth = 2;
  g.setLineDash([7, 4]);
  g.beginPath();
  g.arc(50, 50, 24, 0, Math.PI * 1.6);
  g.stroke();
  g.beginPath();
  g.arc(50, 50, 14, Math.PI, Math.PI * 2.6);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = HOLE;
  g.beginPath();
  g.arc(50, 50, 6, 0, Math.PI * 2);
  g.fill();
};

/** Rocket: a tube on a bamboo stick, with a paper nose cone and two fins. */
const paintRocket: Painter = (g, tint) => {
  g.strokeStyle = BAMBOO;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(50, 70);
  g.lineTo(50, 94);
  g.stroke();
  g.fillStyle = tint;
  g.fillRect(41, 30, 18, 42);
  g.fillStyle = PAPER;
  g.beginPath();
  g.moveTo(41, 30);
  g.lineTo(59, 30);
  g.lineTo(50, 12);
  g.closePath();
  g.fill();
  g.fillStyle = tint;
  g.beginPath();
  g.moveTo(41, 60);
  g.lineTo(31, 74);
  g.lineTo(41, 74);
  g.closePath();
  g.moveTo(59, 60);
  g.lineTo(69, 74);
  g.lineTo(59, 74);
  g.closePath();
  g.fill();
};

/** Laxmi bomb: a round bomb with a short fuse and one spark at its tip. */
const paintLaxmi: Painter = (g, tint) => {
  g.fillStyle = tint;
  g.beginPath();
  g.arc(50, 58, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAPER;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(50, 32);
  g.quadraticCurveTo(54, 20, 64, 18);
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(64, 18, 3, 0, Math.PI * 2);
  g.fill();
};

/** Sutli bomb: a bundle of three cracker bodies bound with string. */
const paintSutli: Painter = (g, tint) => {
  for (const y of [40, 54, 68]) {
    g.fillStyle = tint;
    g.beginPath();
    g.roundRect(22, y, 56, 11, 5);
    g.fill();
  }
  // The binding string: a vertical wrap and two crossing turns.
  g.strokeStyle = PAPER;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(50, 34);
  g.lineTo(50, 82);
  g.moveTo(40, 38);
  g.lineTo(60, 80);
  g.moveTo(60, 38);
  g.lineTo(40, 80);
  g.stroke();
};

/** Ladi: a string of small red tubes on a braided fuse that wanders across the icon. */
const paintLadi: Painter = (g, tint) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 9; i++) pts.push([12 + i * 9, 50 + Math.sin(i * 0.7) * 10]);
  g.strokeStyle = PAPER;
  g.lineWidth = 1.2;
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.stroke();
  g.fillStyle = tint;
  for (const [x, y] of pts) g.fillRect(x - 3, y - 7, 6, 14);
};

/** Saanp goli: a tight spiral pellet, drawn as a thick curling stroke that ends in a dark ash dot. */
const paintSaanp: Painter = (g, tint) => {
  g.strokeStyle = tint;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  for (let t = 0; t <= Math.PI * 4; t += 0.12) {
    const r = 4 + t * 2.6;
    const x = 50 + Math.cos(t) * r;
    const y = 50 + Math.sin(t) * r;
    if (t === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = HOLE;
  g.beginPath();
  g.arc(50, 50, 2.5, 0, Math.PI * 2);
  g.fill();
};

/** Sky shot: an upright tube with a gold star above it and a fuse trailing down. */
const paintSkyshot: Painter = (g, tint) => {
  g.fillStyle = tint;
  g.fillRect(43, 40, 14, 46);
  g.strokeStyle = PAPER;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(50, 40);
  g.lineTo(50, 88);
  g.stroke();
  g.fillStyle = GOLD;
  starPath(g, 50, 26, 13, 5.5);
  g.fill();
};

/** One painter per kind, so adding a kind to the catalogue makes the compiler ask for its icon here too. */
const PAINTERS: Record<CrackerKind, Painter> = {
  phuljhadi: paintPhuljhadi,
  pencil: paintPencil,
  anar: paintAnar,
  chakri: paintChakri,
  rocket: paintRocket,
  laxmi: paintLaxmi,
  sutli: paintSutli,
  ladi: paintLadi,
  saanp: paintSaanp,
  skyshot: paintSkyshot,
};

/**
 * Paints the hotbar icon for `kind` onto a square canvas. The canvas keeps its own pixel size; the drawing is scaled
 * to fill it and cleared first, so the same canvas can be redrawn.
 */
export function drawCrackerIcon(canvas: HTMLCanvasElement, kind: CrackerKind): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const size = canvas.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, size, size);
  // Scale so the 100-unit drawing space fits the whole canvas.
  g.setTransform(size / 100, 0, 0, size / 100, 0, 0);
  const tint = `#${CRACKERS[kind].tint.toString(16).padStart(6, '0')}`;
  PAINTERS[kind](g, tint);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
