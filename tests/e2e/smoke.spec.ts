// Browser smoke test: loads the game in headless Chromium and checks that it starts without console errors, that the
// intro hands over to the village, and that the scene is not black. A second run uses the ?debug hook to light three
// crackers, checks that the first burst is counted and that sparks show on screen, and writes screenshots to
// screenshots/ as deliverables.
import { test, expect, type Page } from '@playwright/test';

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
/** Real milliseconds to keep recording once the first burst is counted, so the ground shot shows the anar burning. */
const AFTER_BURST_MS = 1500;
/** Real milliseconds to let the hands settle into their held pose before the held shot is taken. */
const HELD_SETTLE_MS = 1500;
/** Downward tilt in radians: a cracker 3 m ahead sits about 28° below the eye, so this centres it in the view. */
const LOOK_DOWN = -0.5;
/** Upward tilt in radians for the sky shot: about 25 degrees, so a burst 30 to 40 m up sits in the upper view. */
const SKY_LOOK_UP = 0.44;

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

  // The start view, with the hands and the thaali on the charpai in the foreground.
  await page.screenshot({ path: 'screenshots/hands.png' });
  const aangan = await page.screenshot({ path: 'screenshots/aangan.png' });
  expect((await pixelStats(page, aangan)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);

  expect(errors).toEqual([]);
});

test('the held shot shows the thaali with crackers and the lit agarbatti', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // The thaali on the left palm with crackers on it, and the agarbatti lit in the right fist. The hands ease into
  // their held pose over a few frames, so the shot waits briefly before it is taken.
  await page.evaluate(() => window.__diwali!.pickupAll());
  await page.waitForTimeout(HELD_SETTLE_MS);
  const held = await page.screenshot({ path: 'screenshots/held.png' });

  expect((await pixelStats(page, held)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);
  expect(errors).toEqual([]);
});

test('the debug hook places, lights and fires crackers', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // Anar, sutli and rocket go down 3 m ahead of the player, 2 m apart, each from a spot the player steps to.
  await page.evaluate((pitch: number) => {
    const d = window.__diwali!;
    d.teleport(-2, 6, 0, pitch);
    d.place('anar');
    d.teleport(0, 6, 0, pitch);
    d.place('sutli');
    d.teleport(2, 6, 0, pitch);
    d.place('rocket');
    d.teleport(0, 6, 0, pitch);
  }, LOOK_DOWN);

  // A baseline of the same ground view, taken before any fuse is lit, to measure what the fire adds.
  const beforeDown = await pixelStats(page, await page.screenshot());
  await page.evaluate(() => window.__diwali!.lightAll());

  const burstCount = () => page.evaluate(() => window.__diwali!.state().burstCount);
  // Waits inside the page until the first burst is counted (the rocket, at about 3.6 s of game time).
  await page.waitForFunction(() => window.__diwali!.state().burstCount >= 1, undefined, { timeout: BURST_TIMEOUT_MS });
  // The anar is still fountaining, so the ground view shows its sparks. The rocket bursts about 36 m up, out of this
  // view, and software WebGL screenshots take about 2 s, so the sky burst has faded by capture; it is not shot.
  await page.waitForTimeout(AFTER_BURST_MS);
  const down = await page.screenshot({ path: 'screenshots/burst.png' });

  expect(await burstCount()).toBeGreaterThanOrEqual(1);
  const afterDown = await pixelStats(page, down);
  expect(afterDown.bright - beforeDown.bright).toBeGreaterThan(MIN_SPARK_PIXELS);
  expect(errors).toEqual([]);
});

test('the sky show is shot from a tilted view during a burst', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/?debug');
  await startFromIntro(page);

  // A rocket 3 m ahead with the view tilted up to the sky. The burst is captured as soon as the game counts it.
  await page.evaluate((pitch: number) => {
    const d = window.__diwali!;
    d.teleport(0, 6, 0, pitch);
    d.place('rocket');
  }, SKY_LOOK_UP);
  await page.evaluate(() => window.__diwali!.lightAll());
  await page.waitForFunction(() => window.__diwali!.state().burstCount >= 1, undefined, { timeout: BURST_TIMEOUT_MS });
  const sky = await page.screenshot({ path: 'screenshots/sky.png' });

  expect((await pixelStats(page, sky)).mean).toBeGreaterThan(MIN_MEAN_LUMINANCE);
  expect(errors).toEqual([]);
});
