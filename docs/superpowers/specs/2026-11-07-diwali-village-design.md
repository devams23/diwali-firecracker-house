# Diwali Village — Design

## Intent
A first-person browser game where you spend Diwali night in the aangan (courtyard) of a traditional Indian
village home. You pick crackers from the family stash onto a brass thaali, light an agarbatti at the diya,
and burst crackers yourself — sparklers in your own hand. It is not a score-chasing game. It should feel
like the Diwali you remember: warm diya light, smoke hanging in the air, neighbours' crackers going off in
the distance, kids running around with phuljhadis.

## Goals
- Satisfying, tactile lighting loop: take → carry → place → light → fuse sputter → burst.
- 10 authentic Indian crackers, each with distinct look, sound and behaviour.
- A believable village home, not a fantasy palace. Mature art direction.
- Clear, gentle onboarding — the player always knows the next action.
- 60fps on a mid laptop; phone touch controls are a stretch goal.

## Non-goals
- No levels, currency, store, login, leaderboards.
- No downloaded 3D models/textures — everything built in code (procedural geometry, canvas textures,
  Web Audio synthesis), so the repo is self-contained.

## Anti-goals ("AI slop" checklist — reject the build if any appear)
- Neon purple/cyan gradients, glassmorphism, emoji in UI, glow on everything.
- Generic sci-fi HUD, big arcade "PRESS START" text.
- Over-saturated colour. Palette: warm orange/gold against deep blue night and earthy walls.
- Perfectly clean geometry — walls slightly uneven, plaster patchy, ground is beaten earth.
- Uncanny human figures. Villagers are simple, stylised, quiet — never pseudo-realistic.

## Setting: the village home
- **Aangan**: beaten-earth courtyard (~18 × 14 m) enclosed by mud-plastered walls ~2 m high.
  Lime-white upper, geru (red ochre) lower band. Niches (aale) holding diyas; diyas along wall tops.
- **House** along the north side: verandah (osaara) on wooden posts, sloped khaprail (clay-tile) roof,
  wooden double door with brass kunda, marigold toran over the door, shubh-labh painted beside it,
  rangoli at the threshold, akash kandil (paper lantern) hanging in the verandah.
- **Props**: tulsi chaura in the centre with the main diya and the agarbatti stand; charpai (rope cot) holding
  the thaali at start; matkas; brass lota; hand pump (nalka); wooden takht in the verandah holding the cracker
  stash in labelled boxes; neem tree in a corner; low wooden gate in the south wall toward the lane.
- **Beyond**: silhouettes of neighbouring houses with diya rows, fields, temple shikhara on the horizon,
  occasional distant fireworks, soft smoke haze.
- **Light**: night. Cool dim moonlight fill + strong warm points (diyas, lantern). Bloom tuned for flames/sparks.
  Light fog. ACES tone mapping, sRGB output.

## Player & controls
- First-person, pointer-lock mouse look, WASD walk, Shift slow, eye height 1.6 m, collision with walls/props.
- **Visible hands**: right hand holds the agarbatti; left hand holds the thaali OR a hand-held cracker.
- `E` interact (contextual), `F` place selected cracker on the ground, `Q`/mouse wheel cycle selected cracker in
  thaali, `G` put down / pick up thaali, `LMB` use (light fuse, light sparkler), `M` mute, `Esc` pause.
- Contextual prompt at bottom-centre always shows the next action, e.g. "E — Pick up the thaali (plate)",
  "E — Put an Anar on the thaali", "E — Light the agarbatti at the diya", "Click — Light the fuse", "Step back!".
- A small thaali strip (bottom-right) shows what's on the plate with the selected one highlighted.

## Core loop
1. Pick up the thaali from the charpai (first prompt). It rests in the left hand, visible in view.
2. At the takht, `E` on a cracker box adds one to the thaali (max 10 items, shown on the thaali).
3. Take the agarbatti from its stand at the tulsi chaura and light it at the diya (`E`) — tip glows, thin smoke.
   It stays lit for the session.
4. `Q`/wheel selects a cracker; `F` places it on the ground ~1.2 m ahead.
   Hand-held ones (phuljhadi, pencil) go into the left hand; the thaali is set down at your feet automatically.
5. Click while the agarbatti tip is near a placed cracker's fuse → fuse sputters (1.5–4 s) → effect.
6. Hand-held: click to touch agarbatti to it → burns in hand; mouse movement waves it. Burnt out → stub dropped,
   thaali auto picked up if within 2 m.
7. Too close to a big bomb: stronger shake + brief ear-ring tone. No damage.

## Crackers
| Name | Placement | Fuse | Effect | Sound |
|---|---|---|---|---|
| Phuljhadi | hand | instant | 20 s golden crackling sparks, wave-able | soft fizz/crackle |
| Pencil | hand | instant | 12 s green/red spark jet | hiss |
| Anar | ground | 2.5 s | fountain growing to ~3 m, gold/silver, lights the area | rising roar |
| Chakri | ground | 2 s | spins and wanders, spark ring | whistle + fizz |
| Rocket | ground, in a glass bottle | 2 s | whoosh up with trail, coloured burst at ~40 m | whoosh, pop, crackle |
| Sutli bomb | ground | 4 s | big flash, dust ring, paper debris | deep boom + echo, strong shake |
| Laxmi bomb | ground | 2.5 s | sharp flash, paper bits | sharp crack |
| Ladi | ground, laid in a line | 2 s | chain of ~60 small pops walking along the string | rapid crackle |
| Saanp goli | ground | 1.5 s | black snake grows and curls, smoke | faint sizzle |
| Sky shot | ground box | 3 s | 12 timed aerial bursts | thump-whistle-pop |

## Emotional UX
- **Opening**: dark screen with distant crackers, dogs and crickets audible; fades in:
  "Deepavali ki raat. Ghar aa gaye ho." / "Diwali night. You're home." Click to begin (unlocks audio + pointer
  lock); the scene fades in at the gate, looking into the lit aangan.
- **Ritual first**: after the thaali, the next prompt points to lighting the agarbatti at the tulsi diya.
- **Life around you**: 4–6 villagers — two kids waving sparklers in small loops, an elder on a second charpai,
  a woman in the doorway. Everyone bobs/cheers when something big goes off.
- **Ambience**: distant crackle bed, occasional far booms, faint temple bell, crickets.
- **Finale**: after 10 crackers burst, a neighbour's sky-show fills the sky ~20 s and
  "शुभ दीपावली — Shubh Deepavali" appears softly, then fades back to play (stash is unlimited).
- **Typography**: Tiro Devanagari Hindi for Hindi, Cormorant Garamond for English display, Inter for prompts.
  Prompt chip: dark translucent warm-brown, gold hairline, key as a small keycap.
- **Pause** (Esc): Resume, Controls, Sound on/off — small, calm.

## Tech
- Vite (latest) + TypeScript + three (latest). EffectComposer + UnrealBloomPass + OutputPass from three/addons.
- No physics engine; custom circle-vs-AABB collision and ballistic particles.
- One pooled GPU `Points` spark system (additive, per-particle colour/size/life) shared by all crackers;
  a pooled smoke system (normal blending, soft sprite); pooled point lights (max 8) for flashes.
- Audio: Web Audio API, fully procedural (filtered noise bursts, envelopes, oscillators), master compressor,
  PannerNode for position.
- Textures generated on canvas at startup (plaster, earth, khaprail, wood, rangoli, cracker labels).
- Layout: `core/` `world/` `player/` `items/` `crackers/` `fx/` `audio/` `people/` `ui/`.
  Every file has a header comment explaining its role; every class/exported function has a short doc comment.
- Tests: Vitest for pure logic (thaali inventory, fuse timer, interaction targeting); Playwright smoke test that
  loads the page, starts the game, and screenshots the canvas.

## Repo & git
- Work on branch `worktree-diwali-village` (git worktree), one commit per plan task, conventional messages,
  no AI attribution lines. The user merges into `main`. GitHub repo is created and pushed after completion.

## Left to the builder
Exact dimensions, colours within the palette, particle counts, sound recipe parameters.
