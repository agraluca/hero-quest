# Hero Quest: Bone Cavern, a Scrambly playable

A short 3D playable ad for **Scrambly**. It opens straight into the action: drag to move, and the warrior attacks on his own. Survive three skeleton waves to reach the reward chest. The chest **redeems** your demo coins and ends on an **Explore Scrambly** CTA. A full run lasts about 30 seconds.

> All coins and balances are a demo with no real value. The game makes no earnings or payout claims.

**▶ Play it live:** <https://hero-quest-gules.vercel.app/> (Stage 2, works on phone and desktop)

**Versions**

- **Stage 2 (this version, tag `v1.1-stage2`):** a single level, one-touch controls, about 30 s per run. This is what the live link serves.
- **Stage 1 (tag `v1.0-stage1`, unchanged):** four hero games on a Discover hub, then the reward chest. The live link now serves Stage 2, so run Stage 1 from its tag or its production ZIP.

---

## Stage 2 change log

Reviewer feedback: an ad needs a much tighter scope and faster pacing. Four games plus a reward chest is too much to ask in a short session. Each change below answers one point of that feedback:

| Feedback | Change |
| --- | --- |
| Turn one representative level into a standalone playable that leads straight into the reward and CTA | **Bone Cavern** (Warrior) is the whole playable. Clearing wave 3 shows _Victory!_, then goes straight to the existing reward chest → reward card → **Explore Scrambly** CTA. The portal walk at the end is gone. |
| Simplify like Archero 2: no attack button, the player auto-attacks | The player only **moves**. The warrior swings automatically at any skeleton inside a visible **reach ring** and turns to the closest one. **Fire Spin** casts by itself when 3+ skeletons crowd in, or as an escape when you're down to 2 hearts or fewer. The Attack and Special buttons are removed. Drag anywhere on the screen to move. |
| Being knocked out had no consequence | A knock-out **ends the run**. The arena freezes and a fail card shows the wave reached and the coins earned, with **Try again** (instant restart from 0 coins) and the same **Explore Scrambly** CTA. |
| No instructions or level selection at the start; use hand indicators to make it obvious | No title, hub or intro card. The level loads, and an animated **hand** drags across the screen with "Drag to move". Nothing spawns until the first move, which also unlocks audio. A one-time "Auto attack!" tip shows on first contact, and "FIRE SPIN!" when the spin fires. If you stop for 3 s, the hand comes back with "Keep moving!". |
| Reuse existing systems and assets; no new heroes, enemies or mechanics | Same warrior, skeletons, captains, arena, Fire Spin, reward chest and CTA. The only new visuals are a reach ring, a hand icon and a skull icon on the fail card. |

**Tuning to fit an ad.** Waves grew from 6 / 8+1 / 10+2 to **8 / 11+1 / 14+2**. They spawn faster (0.18 s apart, 0.8 s between waves). With auto-attack, standing still had to stop being safe, so:

- auto-swing reach is shorter (1.8) and its knockback lower
- skeleton reach is longer (1.5)
- only Fire Spin, not ordinary swings, interrupts a skeleton's wind-up

Checked with scripted runs:

- A player who never moves gets knocked out in wave 2 or 3, around 17–23 s.
- A hit-and-run player wins in about 23–27 s.

Real players land around 30–40 s.

**Removed** (Stage 1 is kept intact at its tag):

- the Mage, Archer and Rogue stages and their mechanics: projectiles, pits, runes, stealth, Vanish, Frost, Inferno, dash
- the Discover hub, title, intro and clear screens
- 11 unused models, unused animation clips, sounds, icons and CSS

The ZIP went from **2.45 MB to 1.58 MB**, and the source from about 5,800 lines to about 3,200.

---

## Run it

**From the production ZIP (no install):** serve the ZIP root with any static HTTP server:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# or: npx serve .
```

The build makes **no external requests** (no CDN, fonts or analytics). It needs no login, backend or API keys.

**From source** (`source/` in the ZIP, or the repo):

```bash
npm install
npm run dev        # http://localhost:5199 (also on your LAN for phone testing)
npm run release    # type-check + build + zip -> release/scrambly-hero-quest.zip (fails if > 5,000,000 bytes)
```

**Review helpers**

- `window.__debug` in the console shows the live listener count, timer counts, scene object count, mode, pause state, game time, audio state and the current stage object.
- `test/devices.html` (dev server only) shows the game side by side at 320×568, 390×844 and 568×320.
- `test/anims.html` (dev server only) shows the warrior and skeleton rigs cycling each animation clip.

## Controls

|                         | Touch                   | Mouse / keyboard                      |
| ----------------------- | ----------------------- | ------------------------------------- |
| Move                    | Press and drag anywhere | WASD / arrow keys, or drag with mouse |
| Attack, Fire Spin       | Automatic               | Automatic                             |
| Pause / restart / sound | ⏸ button, top-right     | same                                  |

## How a run plays

1. **Open:** you're in Bone Cavern with the warrior. A hand shows "Drag to move".
2. **First move:** wave 1 rises from the cave mouths. Skeletons inside the reach ring get hit automatically. A red flash means a skeleton is about to strike, so step out.
3. **Waves 2–3:** more skeletons, then captains. Fire Spin goes off by itself when you're surrounded.
4. **Win:** _Victory!_ plus bonus demo coins, then the reward chest → coin burst → reward card → **Explore Scrambly** (shows "CTA clicked: demo only" and logs to the console, with no navigation) → **Play again**.
5. **Knocked out:** the fail card offers **Try again** or **Explore Scrambly**.

## How it connects to Scrambly

The run is a small version of Scrambly's loop:

- you **play** to make progress (the waves)
- you collect demo coins on the way
- you **redeem** them at the reward chest

The reward card then explains the full Discover → Play → Redeem loop before the CTA.

## Art direction

[`concept-art/`](concept-art/README.md) holds the Stage 1 turnaround sheets. The warrior's colours (red hair, steel plate, crimson tabard) come from `warrior-turnaround.jpg`. Characters are KayKit CC0 low-poly stand-ins. The sheets are a ready-made brief for custom models with more time and budget.

## Tech & structure

Three.js 0.170 + TypeScript + Vite. One JS bundle (~180 KB gzipped).

**Audio:** sound effects and the background music are synthesised with WebAudio at runtime, so **no audio files** ship. The music, _Salt & Steel_ (`src/core/Music.ts`), is an original sea-shanty loop. It starts on the first touch, follows the mute button and stops while the page is hidden.

**Characters** are KayKit models (CC0), about 0.8 MB under `/models`:

- the Knight from _Adventurers 2.0_
- the Skeleton Minion and Warrior from _Skeletons 1.0_

The hero pack has no attack clips, so the swing and spin clips come from the Skeletons pack, retargeted by bone name. Action clips are scrubbed to the gameplay timer, so animation always matches hit timing and pauses. If a model fails to load, a procedural rig takes its place.

`scripts/build-models.mjs` rebuilds `public/models` from the source packs in `assets-src/`. Those packs aren't shipped; download links are under Credits. The script keeps only the clips in use, then quantizes and meshopt-compresses everything.

```text
src/
  main.ts                 entry (loads models, starts the game)
  core/Game.ts            shell: renderer, camera, flow (play -> chest / fail card), pause/visibility/rotate, restart
  core/Clock.ts           pausable clock (50 ms delta clamp) + game-time Scheduler (no setTimeout in gameplay)
  core/Input.ts           drag-anywhere joystick + WASD/arrows; resets on pointercancel / lost capture / blur
  core/Audio.ts, Music.ts WebAudio SFX + music: unlock on first gesture, mute (persisted), suspended while hidden
  core/Disposer.ts        listener bookkeeping (global live count for leak checks)
  game/Hero.ts, Enemy.ts  warrior state; skeleton/captain melee AI (rise, chase, red wind-up, strike)
  game/models.ts          KayKit GLB loader, GltfRig (mixer + scrubbed action clips), factories
  game/rigs.ts            Rig interface + procedural fallback rigs
  game/fx.ts              pooled particles, rings, coin pickups
  game/physics.ts         circle-vs-AABB, angle helpers
  stages/BaseStage.ts     movement, auto-attack, auto Fire Spin, enemies, coins, knock-out
  stages/WarriorStage.ts  Bone Cavern: layout, waves, first-move start, idle hint
  stages/env.ts           cavern scenery (floor, rock walls, stalagmites, crystals, torches)
  ui/UI.ts, icons.ts      DOM overlay (HUD, hand hint, pause/fail/resume modals, reward chest, toasts)
scripts/zip.mjs           release packaging + 5 MB budget check
scripts/build-models.mjs  model pipeline (assets-src -> public/models)
scripts/glb-info.mjs      prints a GLB's meshes/skins/clips (dev helper)
test/devices.html         dev-only multi-size viewer
test/anims.html           dev-only view of every rig × action clip
```

**Reliability notes**

- **Pausing:** all gameplay timing runs on the pausable clock, including the idle-hint timer. A hidden tab, the pause menu, the fail card and the rotate prompt all stop it, so nothing jumps forward on resume. Coming back to a hidden tab mid-run shows **Tap to resume**.
- **Restart:** each run owns its scheduler, meshes and effects, and restarts dispose them before rebuilding. Shell listeners are registered once. Screens are re-rendered with `onclick` properties, so showing one again never stacks handlers.
- **Interrupted input:** `pointercancel`, `lostpointercapture`, window `blur` and tab hide all clear the joystick and keys.

---

## Testing (Stage 2, repeated)

| Environment | Real / emulated | What was checked |
| --- | --- | --- |
| Chrome (desktop, macOS) | Real | Full runs: first move → 3 waves → chest → CTA → Play again, and a knock-out → fail card → Try again. Mouse drag and keyboard. Console clean |
| Chrome desktop, iframes at 320×568 and 390×844 CSS px | Emulated size (mouse pointer, not touch) | HUD, hand hint, reach ring and modals fit; rotate prompt at 568×320 |
| Production ZIP served with `python3 -m http.server` | Real | Loads and plays; `performance` resource list shows 13 requests, all same-origin (0 external) |
| iPhone, Safari, dev build over an ngrok tunnel | **Real** | Full Stage 2 touch pass: drag-anywhere movement, hand hint, auto-attack, Fire Spin, knock-out → Try again, win → chest → CTA. Passed |
| Android (Chrome) | **Not tested** | No Android device available |

**Edge cases verified** (scripted in the browser console against `window.__debug`):

- **Repeated restarts** (pause → Restart, Try again, Play again): listener count stays at 16, with 0 pending shell timers after every restart. It was 24 in Stage 1, because the attack and special buttons had their own listeners.
- **Hidden tab for 3 s:** game time advanced 0 s, the audio context was `suspended`, then `running` again, and the resume prompt showed. The arena stays frozen until tapped.
- **Audio:**
  - a real mouse drag creates and starts the AudioContext and music
  - mute and unmute from the pause menu work
  - nothing plays before the first gesture
- **First move:** nothing spawns before it. The hint hides on the first move, comes back after 3 s idle, and hides again on the next move.
- **Knock-out:** the fail card shows the right wave, game time stops behind it, and Try again gives full hearts, 0 coins and the hand hint again.
- **Balance bots:**
  - standing still: KO at 17.4 / 22.9 / 21.8 / 22.2 s, all in wave 2–3
  - hit-and-run: wins at 24.4 / 26.2 / 26.8 / 24.1 / 23.1 s
- **CTA:** toast plus `console.log`, URL unchanged, on both the reward card and the fail card.
- **ZIP:** `index.html` at the root, about 1.58 MB (31.5% of the 5,000,000-byte budget), checked by `npm run zip`.

**Known issues / limitations**

- **Android not tested** (no device available). Touch was tested on a real iPhone only.
- **Very quick swipes:** a swipe that ends within a single frame can miss the first move. A normal drag works.
- **Running in circles:** a player who only circles the arena outruns the skeletons. They never get hit, but never clear a wave either. The "Keep moving!" hint and the waves push the player to engage, but there's no timer.
- **Same Stage 1 asset limits:**
  - chibi KayKit stand-ins
  - combat clips borrowed from another rig, so a few poses are approximate
  - landscape handled with a rotate prompt
  - synthesised (chiptune-style) audio
- **Balance:** tuned with scripted bots, desktop playtests and one iPhone. Real-device feel may need small changes to `SPAWN_GAP` and wave sizes (`WarriorStage.ts`) or skeleton `reach` (`Enemy.ts`).

## Credits & tools

- **Code libraries:**
  - Three.js (MIT) for rendering
  - Vite + TypeScript for the build
  - fflate (MIT) for zip packaging, build-time only
  - glTF-Transform + meshoptimizer (MIT) for the model pipeline
- **Fox artwork:** Simula's Scrambly reference kit, supplied for the assessment.
- **3D characters and weapons:** **KayKit by Kay Lousberg** (www.kaylousberg.com), CC0: [Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers) (free tier) and [Skeletons 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0).
- **Hero concept art** (`concept-art/`): generated with GPT Image 2 (OpenAI), reference only.
- **Icons:** hand-written inline SVG, including the new hand and skull.
- **Sound effects and music:** procedurally synthesised, no samples. The theme is original.

## Time, tools and AI use

**Time spent:** Stage 1 about 3 hours. Stage 2 about 1 hour.

**Tools:** Claude Code (Claude Opus 5.5) for planning, implementation, checks and the change log. The Stage 1 tools are listed under Credits.

**Stage 2 process**

- **Plan first:** I started in plan mode with the reviewer feedback. Claude explored the code and proposed a 7-step plan, and I made the four design calls:
  1. the Warrior / Bone Cavern as the level
  2. a knock-out ends the run with a fail card that keeps the CTA
  3. Fire Spin casts automatically instead of having a button
  4. delete the unused stages rather than keep them as dead code
- **Step by step:** each step was implemented on its own and then stopped for my review. I playtested and read the diff before it was committed, one commit per step on the `stage2` branch.
- **My corrections and requests during review:**
  - The first fail card used a sword icon; I asked for a dedicated skull icon.
  - After the auto-attack step, the game was too easy: standing still cleared the waves. I asked for more skeletons and a real penalty for not moving. Bots then measured the change: before it, an idle player won with 1 heart; after it, an idle player is knocked out in wave 2–3.
- **Caught during the checks:**
  - A swing-interrupt rule from Stage 1 made auto-attack stun-lock every skeleton. It now applies only to Fire Spin.
  - The resting joystick was placed using the HUD's size while the HUD was still hidden, so it sat half off-screen. It's now placed in CSS units.
  - The joystick also overlapped the hand hint on 320 px screens, so it now hides while the hint is visible.
  - A circling bot showed that pure kiting never fights. It's documented as a known limitation instead of adding a timer, which would be a new mechanic.

**Recording of the changed behaviour:** `stage2-changed-behaviour.gif` captures, as screenshots of a real Chrome run:

- the hand hint and first drag
- the waves, auto-attack and Fire Spin
- Victory → reward chest → CTA → Play again
- the idle "Keep moving!" hint, then knock-out → fail card → Try again

A full screen recording of the changed behaviour was also recorded and is shared with the Stage 2 submission.

---

## Requirements checklist

From the [assessment brief](https://simula-ad.notion.site/Simula-Playable-Game-Developer-Take-Home-321af70f6f0d80f4b560ef057587f77b).

### Stage 2

- [x] Stage 1 kept unchanged at tag `v1.0-stage1`; the revision is tagged `v1.1-stage2`
- [x] Work time within 1–2 hours (about 1 hour)
- [x] One representative level (Bone Cavern) as a standalone playable that leads straight into the existing reward and CTA flow
- [x] Archero-style auto-attack; the player only moves
- [x] Knock-out has a consequence (run over, fail card with retry + CTA)
- [x] No instructions or level select at the start; hand indicators show how to play
- [x] Existing systems and assets reused; no new heroes, enemies or mechanics; no extra features beyond the request
- [x] Updated ZIP + source (`npm run release` → `release/scrambly-hero-quest.zip`)
- [x] Change log, repeated checks, known issues (above)
- [x] Screen recording of the changed behaviour + AI-use note

### Technical (repeated for Stage 2)

1. - [x] Production ZIP: `index.html` at root, runnable build, readable source, libraries, assets, run instructions
2. - [x] ZIP ≤ 5,000,000 bytes (about 1.58 MB, checked by `npm run zip`)
3. - [x] Static server, no external requests, no login/backend/keys
4. - [x] Touch + mouse; 320×568 and 390×844 portrait checked; rotate prompt for landscape; no page scroll during play
5. - [x] CTA: local confirmation + console log, no navigation
6. - [x] Pause gameplay and clocks while hidden, resume without jumps; audio after interaction, mute, silent while hidden
7. - [x] Resize, interrupted input, all outcomes (win, knock-out); clean restart
8. - [x] Handoff: run instructions, tested browsers/devices (real/emulated, including a real iPhone), limitations, untested behaviour
