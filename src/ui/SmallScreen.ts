// Small-screen greeting. The game needs a mouse, a keyboard and room to look around, so on phones and small tablets the
// page shows a festive "Happy Diwali" card instead, asking the visitor to open the link on a laptop or desktop. The
// decision (needsBigScreen) is pure so it can be tested under Node; the card builds its own DOM and styles.

/** Narrowest window (CSS px) the game is offered on. */
export const MIN_GAME_WIDTH = 900;

/**
 * True when the game should not start: the window is narrower than MIN_GAME_WIDTH, or the device has no fine pointer
 * (a touch-only phone or tablet, which cannot lock a mouse to look around).
 */
export function needsBigScreen(width: number, hasFinePointer: boolean): boolean {
  return width < MIN_GAME_WIDTH || !hasFinePointer;
}

/** Reads the current window and pointer and applies needsBigScreen. */
export function isSmallScreen(): boolean {
  const fine = typeof matchMedia === 'function' ? matchMedia('(any-pointer: fine)').matches : true;
  return needsBigScreen(window.innerWidth, fine);
}

/** Styles for the card: a deep violet night, a glowing diya, soft drifting sparks and warm gold type. */
const CSS = `
.ss-root{position:fixed;inset:0;display:flex;padding:24px 16px;overflow-x:hidden;overflow-y:auto;
  background:radial-gradient(120% 80% at 50% 100%,#5a2a6e 0%,#2a1446 45%,#120a24 100%);color:#fbe9c8;
  font-family:Nunito,system-ui,sans-serif;text-align:center}
.ss-card{position:relative;margin:auto;max-width:400px;width:100%;padding:34px 24px 28px;border-radius:22px;
  background:rgba(24,12,40,.62);border:1px solid rgba(255,196,110,.28);box-shadow:0 18px 60px rgba(0,0,0,.45);
  backdrop-filter:blur(6px)}
.ss-diya{font-size:56px;line-height:1;filter:drop-shadow(0 0 18px rgba(255,170,60,.85));animation:ss-flicker 2.4s ease-in-out infinite}
.ss-hindi{margin:14px 0 2px;font-family:'Tiro Devanagari Hindi','Noto Serif Devanagari',serif;font-size:34px;color:#ffc46e}
.ss-title{margin:0;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:26px;letter-spacing:.2px}
.ss-text{margin:16px 0 0;font-size:16px;line-height:1.55;color:#f1dcc0}
.ss-note{margin:14px 0 0;font-size:14px;color:#c9b3d6}
.ss-btn{margin-top:22px;padding:12px 22px;border:0;border-radius:999px;font:700 15px Nunito,system-ui,sans-serif;
  color:#2a1446;background:linear-gradient(180deg,#ffd27a,#f2a541);box-shadow:0 6px 18px rgba(242,165,65,.35);cursor:pointer}
.ss-spark{position:absolute;bottom:-10px;width:4px;height:4px;border-radius:50%;background:#ffd27a;
  box-shadow:0 0 8px 2px rgba(255,190,90,.8);opacity:0;animation:ss-rise linear infinite}
.ss-reel{position:relative;margin:-14px -10px 18px;border-radius:14px;overflow:hidden;aspect-ratio:960/414;
  background:#1a0d2e;border:1px solid rgba(255,196,110,.22);box-shadow:0 10px 30px rgba(0,0,0,.4)}
.ss-reel video,.ss-reel img{display:block;width:100%;height:100%;object-fit:cover}
.ss-tag{position:absolute;left:10px;top:10px;padding:4px 10px;border-radius:999px;font:800 11px Nunito,system-ui,sans-serif;
  letter-spacing:.6px;text-transform:uppercase;color:#ffe2a8;background:rgba(18,10,36,.72)}
.ss-reel+.ss-diya{font-size:40px}
@keyframes ss-flicker{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes ss-rise{0%{transform:translateY(0);opacity:0}10%{opacity:.9}100%{transform:translateY(-105vh);opacity:0}}
@media (prefers-reduced-motion: reduce){.ss-diya,.ss-spark{animation:none}.ss-spark{display:none}}
`;

/** Number of drifting sparks behind the card. */
const SPARKS = 18;
/** Short muted gameplay reel (about 20 s, 2 MB) and its first frame, relative to the site base. Phones only. */
const REEL = 'media/gameplay.mp4';
const REEL_POSTER = 'media/gameplay-poster.jpg';

/**
 * The gameplay preview at the top of the card: a looping, muted, inline video, so visitors see the village come alive
 * and want to try it. With Data Saver on or reduced motion requested, only the still poster is shown and the video is
 * never downloaded. Only this card creates it, so laptops (which get the game) never load it.
 */
function buildReel(): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'ss-reel';
  const base = import.meta.env.BASE_URL;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const still = conn?.saveData === true || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    const img = document.createElement('img');
    img.src = base + REEL_POSTER;
    img.alt = 'A courtyard lit with diyas and a rangoli, from the game';
    box.appendChild(img);
  } else {
    // Muted and playsinline must be set before the source, or phones refuse to autoplay it.
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.poster = base + REEL_POSTER;
    v.src = base + REEL;
    v.setAttribute('aria-label', 'Gameplay preview: lighting diyas, a drone show and fireworks over the village');
    box.appendChild(v);
    void v.play().catch(() => {});
  }
  const tag = document.createElement('span');
  tag.className = 'ss-tag';
  tag.textContent = '▶ Gameplay';
  box.appendChild(tag);
  return box;
}

/** Replaces the page with the greeting card. `root` is the element to fill (the game's #app container). */
export function showSmallScreenCard(root: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'ss-root';

  // Sparks at random columns, speeds and delays, rising like embers from a phuljhadi.
  for (let i = 0; i < SPARKS; i++) {
    const s = document.createElement('span');
    s.className = 'ss-spark';
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${6 + Math.random() * 6}s`;
    s.style.animationDelay = `${Math.random() * 8}s`;
    wrap.appendChild(s);
  }

  // The card itself: diya, greeting, the ask, and a button to share the link to a laptop.
  const card = document.createElement('div');
  card.className = 'ss-card';
  card.innerHTML = `
    <div class="ss-diya" aria-hidden="true">🪔</div>
    <p class="ss-hindi" lang="hi">शुभ दीपावली</p>
    <h1 class="ss-title">Happy Diwali!</h1>
    <p class="ss-text">This little village is waiting with diyas, anars and rockets, but it needs a bigger screen.
      Open this link on a laptop or desktop to walk in and light them yourself.</p>
    <p class="ss-note">Best with a mouse, a keyboard and the sound on 🔊</p>
    <button class="ss-btn" type="button">Copy link for later</button>`;
  // The gameplay preview sits above the diya, like a trailer for what waits on the big screen.
  card.prepend(buildReel());
  wrap.appendChild(card);

  // Copy (or share, where the phone offers it) the page link, so the visitor can open it on their laptop.
  const btn = card.querySelector<HTMLButtonElement>('.ss-btn')!;
  btn.addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: 'Happy Diwali', url });
      else {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Link copied ✨';
      }
    } catch {
      // Share sheet dismissed or clipboard blocked: show the link so it can be copied by hand.
      btn.textContent = url;
    }
  });

  root.replaceChildren(wrap);
}
