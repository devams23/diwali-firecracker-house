// Browser smoke test: loads the game in headless Chromium and checks that it starts without console errors, that the
// intro hands over to the village, and that the scene is not black. Further runs use the ?debug hook to take the held
// shot, the anar fountain at its peak and a salvo of sky shells, check that sparks show on screen, and write the
// screenshots to screenshots/ as deliverables.
import { test, expect, type Page } from '@playwright/test';
import { STALL_CENTRE } from '../../src/world/stallLayout';

/** A PNG screenshot as returned by Page.screenshot(). */
type Png = Awaited<ReturnType<Page['screenshot']>>;

/** Brightness of one image: its mean luminance and how many pixels are bright enough to read as sparks or flame. */
interface PixelStats {
  /** Mean relative luminance, 0 (black) to 1 (white). */
  mean: number;
  /** Count of pixels with relative luminance above BRIGHT_LUMA. */
  bright: number;
}

/**
 * Mean luminance above which the aangan view counts as lit rather than black (0 is black, 1 is white). The night
 * scene measures about 0.05, so 0.03 still rejects a failed or black render (which reads about 0) with margin.
 */
const MIN_MEAN_LUMINANCE = 0.03;
/** Relative luminance above which a pixel counts as a bright spark or flame. */
const BRIGHT_LUMA = 0.6;
/**
 * Extra bright pixels a burst frame must have over the same view before any fuse was lit. The diya glow is in both
 * frames, so only sparks, flashes and smoke-lit pixels add to the difference.
 */
const MIN_SPARK_PIXELS = 300;

/** Milliseconds the intro card needs to fade out and be removed, plus margin. */
const INTRO_GONE_MS = 3000;

/**
 * Longest real time to wait for the first burst after lightAll(). Software WebGL runs well below 60 fps and the game
 * clock is clamped per frame, so the wait is on the game's own burst count, not on wall-clock seconds.
 */
const BURST_TIMEOUT_MS = 60000;
/** Real milliseconds to let the hands settle into their held pose before the held shot is taken. */
const HELD_SETTLE_MS = 1500;
/**
 * Real milliseconds to let a fresh view render before a wide shot. Software WebGL draws about a frame a second, so a
 * shot taken straight after a move can catch a frame that has not been drawn yet.
 */
const VIEW_SETTLE_MS = 2500;
/** Stall shot: the eye stands 2.4 m south of the counter, turned to face it, and tipped 20 degrees down to the sign. */
const STALL_VIEW_Z = STALL_CENTRE.z + 2.4;
const STALL_VIEW_PITCH = -0.35;
/**
 * Seconds fast-forwarded after the anar is lit for its shot: the 2.5 s fuse plus 2.2 s, so the spray is at its full
 * height rather than still ramping up.
 */
const ANAR_PEAK_SECONDS = 4.7;
/** Upward tilt in radians for the sky shot: about 20 degrees, so shells bursting 40 to 70 m up sit in the upper view. */
const SKY_LOOK_UP = 0.35;
/** Shells that must be bursting together before the sky shot is taken, so the frame shows a real show. */
const SKY_SHOT_BURSTS = 5;

/**
 * Records every console error and uncaught page error. Font requests are answered locally so the run does not depend
 * on the network; the empty answers are not errors.
 */
async function watchErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  return errors;
}

/** Clicks the intro card on an already open page; resolves once the card has been removed. */
async function startFromIntro(page: Page): Promise<void> {
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('.intro')).toBeVisible();
  await page.locator('.intro').click();
  await page.waitForTimeout(INTRO_GONE_MS);
  await expect(page.locator('.intro')).toHaveCount(0);
}

/** Decodes a PNG inside the page and measures its mean luminance and bright-pixel count. */
async function pixelStats(page: Page, png: Png): Promise<PixelStats> {
  return page.evaluate(
    async ({ b64, brightLuma }: { b64: string; brightLuma: number }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        sum += luma;
        if (luma > brightLuma) bright++;
      }
      return { mean: sum / (d.length / 4), bright };
    },
    { b64: png.toString('base64'), brightLuma: BRIGHT_LUMA },
  );
}

test('loads without console errors, starts from the intro and renders a lit village', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/');
  await startFromIntro(page);

  // The start view, with the hands and the hotbar of crackers in the foreground.
  await page.screenshot({ path: 'screenshots/hands.png' });
  // The wide shot waits for the view to settle, so it is not caught between two software-rendered frames.
  await page.waitForTimeout(VIEW_SETTLE_MS);
  const aangan = await page.screenshot({ path: 'screenshots/aangan.png' });
  expect((await pixelStats(page, aangan)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);

  expect(errors).toEqual([]);
});

test('the cracker stall reads bright from the walk, with the hotbar in view', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // Stand south of the counter, facing it and tipped down to the signboard.
  await page.evaluate(
    ({ x, z, pitch }: { x: number; z: number; pitch: number }) => window.__diwali!.teleport(x, z, 0, pitch),
    { x: STALL_CENTRE.x, z: STALL_VIEW_Z, pitch: STALL_VIEW_PITCH },
  );
  await page.waitForTimeout(VIEW_SETTLE_MS);
  const stall = await page.screenshot({ path: 'screenshots/stall.png' });

  expect((await pixelStats(page, stall)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);
  expect(errors).toEqual([]);
});

test('the held shot shows a phuljhadi in the left hand and the lit agarbatti in the right', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // A phuljhadi on the left palm, and the agarbatti lit in the right fist. The hands ease into their held pose over a
  // few frames, so the shot waits briefly before it is taken.
  await page.evaluate(() => window.__diwali!.heldShot());
  await page.waitForTimeout(HELD_SETTLE_MS);
  const held = await page.screenshot({ path: 'screenshots/held.png' });

  expect((await pixelStats(page, held)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);
  expect(errors).toEqual([]);
});

test('the anar fountain is shot at its peak, three metres away', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // One anar 3 m ahead of the player, with the view turned level so the spray fills the frame from the pot upward.
  await page.evaluate(() => {
    const d = window.__diwali!;
    d.teleport(0, 6, 0, 0);
    d.place('anar');
  });

  // A baseline of the same view before the fuse is lit, to measure what the fountain adds.
  const beforeDown = await pixelStats(page, await page.screenshot());
  await page.evaluate(() => window.__diwali!.lightAll());
  // The fuse and the spray's ramp-up are fast-forwarded, so the frame is drawn with the fountain at full height.
  await page.evaluate((seconds: number) => window.__diwali!.advance(seconds), ANAR_PEAK_SECONDS);
  const down = await page.screenshot({ path: 'screenshots/burst.png' });

  const afterDown = await pixelStats(page, down);
  expect(afterDown.bright - beforeDown.bright).toBeGreaterThan(MIN_SPARK_PIXELS);
  expect(errors).toEqual([]);
});

test('the sky show is shot from a tilted view during a salvo', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // Look up 20 degrees and fire a salvo aimed the same way, so the shells burst in the view.
  await page.evaluate((pitch: number) => {
    const d = window.__diwali!;
    d.teleport(0, 6, 0, pitch);
    d.skyShow(0);
  }, SKY_LOOK_UP);
  // Software WebGL is slow, so the wait polls in short steps until several shells are open at once, then shoots.
  await page.waitForFunction((n: number) => window.__diwali!.skyBursting() >= n, SKY_SHOT_BURSTS, {
    timeout: BURST_TIMEOUT_MS,
    polling: 100,
  });
  const sky = await page.screenshot({ path: 'screenshots/sky.png' });

  expect((await pixelStats(page, sky)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);
  expect(errors).toEqual([]);
});
