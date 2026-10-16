# Hero Quest: a Scrambly playable

A short 3D web playable for **Scrambly**. Players **discover** four games (one per hero), **play** through each hero's challenge to make progress and earn **demo** coins, then **redeem** them at a reward chest that ends on an **Explore Scrambly** CTA.

> All coins and balances are a demo with no real value. The game makes no earnings or payout claims.

---

## Run it

**From the production ZIP (no install):** serve the ZIP root with any static HTTP server, for example:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# or: npx serve .
```

The build makes **no external requests** (no CDN, fonts or analytics) and needs no login, backend or API keys.

**From source** (`source/` in the ZIP, or the repo):

```bash
npm install
npm run dev        # http://localhost:5199 (also on your LAN for phone testing)
npm run release    # type-check + build + zip -> release/scrambly-hero-quest.zip (fails if > 5,000,000 bytes)
```

**Review helpers**
- `?stage=N` (1–4) unlocks the earlier games and jumps straight to game N, e.g. `/?stage=4`.
- Cleared games can be replayed from the Discover list.
- `window.__debug` in the console: live listener and timer counts, scene object count, mode, pause state, game time, and the current stage object.
- `test/devices.html` (dev server only) shows the game side by side at 320×568, 390×844 and 568×320.

## Controls

| | Touch | Mouse / keyboard |
|---|---|---|
| Move | Floating joystick (press anywhere in the lower-left area) | WASD / arrow keys, or drag the joystick with the mouse |
| Attack / Cast / Shoot / Strike | Big orange button (hold to repeat) | Space / J / Enter, or click the button |
| Special (Fire Spin · Inferno · Frost Volley · Vanish) | Purple button (ring shows cooldown) | Shift / K |
| Pause / restart / sound | ⏸ button, top-right | same |

Attacks auto-aim at the target in the direction you face, so it plays one-handed on a 320 px screen.

## The four games

| # | Hero | Challenge | Ends when |
|---|---|---|---|
| 1 | Warrior | **Bone Cavern**: skeleton hordes pour out of cave mouths in 3 escalating waves (6 → 8 + captain → 10 + 2 captains). Red wind-ups telegraph hits. **Fire Spin** is a blazing whirl that burns everything around you, with brief invulnerability. | All waves cleared → portal |
| 2 | Fire Mage | **Castle Chasm**: skeleton dark mages and a warlock (3-orb dark fan) hold the keep across a chasm. Fireballs pick them off; **Inferno** is a big charged fireball with a huge blast. A last rank rises near the end. Falling in costs a heart. | Keep cleared → drawbridge rises → portal |
| 3 | Archer | **Rune Forest**: shoot 3 rune stones in the order carved on the forest gate (randomised each run, also shown in the HUD). One rune sits inside a rotating shield, so the shot must go through the gap. A wrong rune resets the puzzle, **reshuffles the order**, and wakes another bat (up to 4). Bats swoop slowly and interrupt the bow draw. **Frost Volley** fires 3 ice arrows that freeze bats in mid-air (the next hit shatters them) and can **freeze the spinning shield** so the hidden rune is easy to hit. | Correct order → gate opens → portal |
| 4 | Rogue | **Orc War Camp** (night): 3 fast brutes patrol between crates and carts with visible vision cones; cover blocks their sight. Patrols are unpredictable: random pauses with a sweeping look-around, and occasional mid-route turn-backs. Strike from **behind** = instant takedown; from the **front** or caught = one-hit KO. **Vanish** gives 3.5 s of invisibility and breaks a chase. | All brutes down → portal |

After each clear: a bonus of demo coins, then a new game unlocks on Discover. After all four: Redeem chest → coin burst → reward card → **Explore Scrambly** CTA (shows "CTA clicked: demo only", logs to the console, no navigation) → Play again.

## How it connects to Scrambly

The game's structure follows Scrambly's loop:
1. **Discover**: the hub is a Scrambly-style "Discover games" list with a fox guide. Each hero is a new game to try.
2. **Play & progress**: each game drops demo coins and a clear bonus, and the journey bar fills as games are played.
3. **Redeem**: the reward chest turns the run into a "redeemed" demo reward, and the final card explains the real product before the CTA.

## Art direction

[`concept-art/`](concept-art/README.md) holds turnaround sheets (front/side/back plus ability poses) for the Warrior, Fire Mage, Archer and Rogue. In the time box the game uses low-poly stand-ins that copy each hero's colour identity from these sheets. With more time and budget, the sheets are a ready-made brief for custom modelled, rigged and animated characters. See that folder's README for the production path and asset budget.

## Tech & structure

Three.js 0.170 + TypeScript + Vite. One JS bundle (~195 KB gzipped). Sound effects and the background music are synthesised with WebAudio at runtime, so **no audio files** ship. The music, *Salt & Steel* (`src/core/Music.ts`), is an original sea-shanty loop written for this game: D minor, 6/8, low volume, scheduled on the AudioContext clock so it stops while the page is hidden. It starts on the first tap and follows the mute button.

**Characters** are KayKit models (CC0), about 1.8 MB in total under `/models`:
- Heroes: Knight, Mage, Ranger and Rogue from *Adventurers 2.0*.
- Enemies: Skeleton Minion, Warrior and Mage from *Skeletons 1.0*. The orc brute is the Adventurers Barbarian, scaled up and tinted green.
- Hero textures are selectively hue-shifted at load time to match `concept-art/`: green Ranger cape, purple Rogue, crimson Fire Mage.
- The free hero pack has no attack clips. Its rig shares core bone names with the Skeletons rig, so the swing, spin, cast, shoot and stab clips are taken from the Skeletons pack and retargeted by bone name.
- Action clips are scrubbed to the gameplay timer, so animation always matches hit timing, pauses and interrupts.
- Bats, plus anything that fails to load, fall back to procedural rigs.

`scripts/build-models.mjs` rebuilds `public/models` from the source packs in `assets-src/` (not shipped; download links under Credits). It keeps only the used clips, strips the old rig's IK bones, then quantizes and meshopt-compresses everything, for example 4.7 MB → 140 KB per skeleton.

```
src/
  main.ts                 entry
  core/Game.ts            shell: renderer, camera, screen flow, pause/visibility/rotate, restart
  core/Clock.ts           pausable clock (50 ms delta clamp) + game-time Scheduler (no setTimeout in gameplay)
  core/Input.ts           floating joystick, buttons, keyboard; resets on pointercancel / lost capture / blur
  core/Audio.ts           WebAudio SFX synth: unlocks on first gesture, mute (persisted), suspended while hidden
  core/Disposer.ts        listener bookkeeping (global live count for leak checks)
  game/Hero.ts, Enemy.ts  hero spec/state and enemy AI (melee, caster, bat, brute w/ vision cone)
  game/Projectiles.ts     fireballs, arrows, orbs (shared geometry)
  game/models.ts          KayKit GLB loader, GltfRig (mixer + scrubbed action clips), texture hue-shifts, factories
  game/rigs.ts            Rig interface + procedural fallback rigs
  game/fx.ts              pooled particles, rings, coin pickups
  game/physics.ts         circle-vs-AABB, segment LOS, angle helpers
  stages/BaseStage.ts     shared stage logic: movement, auto-aim, combat, pits, respawn, exit portal
  stages/*Stage.ts        the four challenges
  stages/registry.ts      hub/intro copy per stage
  ui/UI.ts, icons.ts      DOM overlay (hub, HUD, modals, redeem, toasts)
scripts/zip.mjs           release packaging + 5 MB budget check
scripts/build-models.mjs  model pipeline (assets-src -> public/models)
scripts/glb-info.mjs      prints a GLB's meshes/skins/clips (dev helper)
test/devices.html         dev-only multi-size viewer
test/anims.html           dev-only side view of every character × action clip
```

**Reliability notes**
- **Pausing:** all gameplay timing runs on the pausable clock. A hidden tab, the pause menu, intro cards and the rotate prompt all stop it, so nothing jumps forward on resume. Coming back to a hidden tab mid-game shows **Tap to resume**.
- **Restart:** each stage owns its scheduler, meshes and projectiles, and restart disposes them before rebuilding. Shell listeners are registered once. Screens are re-rendered with `onclick` properties, so re-showing one never stacks handlers.
- **Interrupted input:** `pointercancel`, `lostpointercapture`, window `blur` and tab hide all clear the joystick, buttons and keys.

---

## Testing

| Environment | Real / emulated | What was checked |
|---|---|---|
| Chrome (desktop, macOS) | Real | Full run of all 4 games, hub → redeem → CTA; keyboard + mouse; console clean |
| Chrome desktop, iframes at 320×568 and 390×844 CSS px | Emulated size (mouse pointer, not touch) | Layout of hub, HUD, modals, controls; rotate prompt at 568×320 |
| Production ZIP served with `python3 -m http.server` | Real | Loads and plays; `performance` resource list shows only same-origin files (0 external requests) |
| iPhone, Safari, via `npm run dev` on the LAN | **Real** | Full playthrough with touch: joystick + buttons, all 4 games, hub → redeem → CTA. Worked well |
| Android (Chrome) | **Not tested** | No Android device available |

**Edge cases verified** (scripted in the browser console against `window.__debug`):
- Repeated restarts (checked in the Warrior and Rogue stages, with KayKit models loaded): listener count (24), pending timers (0) and scene object count identical after every restart.
- Hidden tab for 3 s: game time advanced 0 s, resume prompt shown, no jump after resuming.
- Mage: walking off the ledge → fall, lose a heart, respawn. Bridge only walkable after it rises.
- Archer: correct order opens the gate; the shield blocks shots outside its gap.
- Rogue: backstab from behind kills instantly; striking from the front gets the rogue one-shot, then respawn resets the brutes' alert state.
- CTA: toast + `console.log`, URL unchanged.
- ZIP: `index.html` at root, about 2.45 MB (49% of the 5,000,000-byte budget), checked by `npm run zip`.

**Untested / known limitations**
- Android not tested (no device available); touch was only tested on an iPhone.
- Characters are KayKit CC0 models recoloured toward `concept-art/`. They're chibi stand-ins; custom models built from the concept sheets need more time and budget.
- Bats are still procedural (no bat model in the packs used).
- Combat clips come from a different rig (Skeletons 1.0), so a few poses are approximate on the heroes.
- Landscape is handled with a rotate prompt, not an adapted landscape layout.
- Music and sound effects are synthesised (simple chiptune-style timbres), not recorded instruments.
- Balancing was tuned by playtesting on desktop and one iPhone.

## Credits & tools

- Three.js (MIT): rendering. Vite + TypeScript: build. fflate (MIT): zip packaging script (build-time only).
- Fox artwork: Simula's Scrambly reference kit (supplied for the assessment).
- 3D characters and weapons: **KayKit by Kay Lousberg** (www.kaylousberg.com), CC0: [Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers) (free tier) and [Skeletons 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0). glTF-Transform + meshoptimizer (MIT) for the build-time model pipeline.
- Hero concept art (`concept-art/`): generated with GPT Image 2 (OpenAI), reference only.
- Icons: hand-written inline SVG. Sound effects and music: procedurally synthesised (no samples); the theme is original.
## Time, tools and AI use

**Time spent:** about 3 hours (Stage 1).

**Tools**
- **Claude Code (Claude Opus 5.5)** for planning and implementation. I started in plan mode: requirements checklist from the brief, then a scoped plan (4 stages × ~30–45 s, shared systems, build order with a cut line) that I approved before any code.
- **GPT Image 2** for the hero concept sheets in `concept-art/`.
- **Meshy** (meshy.ai) for turning the concepts into 3D characters. I tried it first, but it was paid, so I dropped it. With more time and budget I would model the characters myself from the concept sheets. Instead I used the free CC0 **KayKit Adventurers** and **Skeletons** packs, recoloured toward the concepts.

**My part:** I defined the concept (four heroes, each with a unique challenge), the art direction and the stage themes. After every round of prompts I reviewed the code and playtested manually, then asked for specific improvements.

**Changes I asked for after reviewing and playtesting:**
- Warrior was too easy: more skeletons, a cavern setting, and a fire-spin special.
- Mage: castle setting, a big-fireball special, only skeleton mages with dark magic (sword skeletons made no sense there).
- Archer: first bats too fast, then the stage too hard, so I asked for a frost special (3 freezing arrows). It was later tuned back up with more bats and a rune order that reshuffles after a mistake.
- Rogue was too easy: brutes 20–30% harder. They now move faster, pause randomly and turn back mid-route.
- UI: the special button's label was unreadable (overlapped by Attack). Visual: a glitch on the Mage bridge.
- Characters: use the KayKit models, matched to my concept colours. Background music in a pirate-adventure style, written original to avoid copyright.

**Corrections and rejected first attempts** (caught during review and playtesting):
- The first camera framing hid the hero behind the near wall in the Mage stage, so camera-side walls were made low.
- In the Archer stage, the levers and the rune sequence were off-screen on a portrait phone. The courtyard was narrowed and a rune-order strip was added to the HUD.
- In the Rogue stage, the outpost was too wide to read the brutes' vision cones, so it was narrowed to fit the view.
- Projectile collision first treated the levers and the shield as walls, so arrows could never reach the shielded lever. Movement blockers and projectile walls were split.
- The archer HUD rune strip uses the same colours and shapes as the 3D levers, so the order is readable without the gate being on screen.

---

## Requirements checklist

From the [assessment brief](https://simula-ad.notion.site/Simula-Playable-Game-Developer-Take-Home-321af70f6f0d80f4b560ef057587f77b).

### Timeline
- [ ] Stage 1 submitted within **5 calendar days**
- [x] Stage 1 work time **4–6 hours** (6 h hard max): about 3 h so far. Note anything unfinished or untested
- [ ] (If invited) Stage 2 within **3 calendar days**, **1–2 hours**

### Brief
- [x] One polished playable
- [x] Gameplay + progress connected to Discover → Play & progress → Redeem
- [x] The play/progress/Scrambly link is easy to understand (hub journey bar, fox guide, redeem card)
- [x] Ends with a clearly labeled CTA button (simulated click)
- [x] Balance labelled demo; no guaranteed income or payout claims; no exact reward amounts or withdrawal rules
- [x] Warm, rounded, orange–purple visual treatment; fox from the reference kit

### Stage 1 playable
- [x] Interaction understandable and responsive (intro cards, telegraphs, auto-aim, feedback)
- [x] Purposeful progression with a clear ending
- [x] Touch and mouse on mobile-sized screens (touch verified on a real iPhone)
- [x] Review-friendly restart (pause menu, clear card, hub, redeem screen)
- [x] Project note on AI/tool use with decisions, corrections and rejected outputs (see *Time, tools and AI use*)

### Technical
1. - [x] Production ZIP: `index.html` at root, runnable build, readable source, libraries, assets, run instructions
2. - [x] ZIP ≤ 5,000,000 bytes (checked by `npm run zip`)
3. - [x] Static server, no external requests, no login/backend/keys
4. - [x] Touch + mouse; 320×568 and 390×844 portrait checked; rotate prompt for landscape; no page scroll during play
5. - [x] CTA: local confirmation + console log, no navigation
6. - [x] Pause gameplay and clocks while hidden, resume without jumps; audio after interaction, mute, silent while hidden
7. - [x] Resize, interrupted input, all outcomes (win, death, fall, wrong rune, spotted); clean restart
8. - [x] Handoff: run instructions, tested browsers/devices (real/emulated, including a real iPhone), limitations, untested behaviour

### Deliverables
- [ ] Production ZIP (`npm run release` → `release/scrambly-hero-quest.zip`)
- [ ] Full production-process screen recording (tools, prompts, iterations, accepted/rejected output, own judgment)
- [ ] 5-minute walkthrough: core interaction, progression/ending, CTA, restart, one edge case; decisions, Scrambly connection, time, tools, testing, limitations, changes
- [ ] All links publicly accessible; submitted through the Stage 1 form

### Stage 2 (if invited)
- [ ] Keep Stage 1 unchanged; tag it (e.g. `v1.0-stage1`) and add the revision as a new tag
- [ ] Updated ZIP + source, change log, repeated checks, known issues, recording of changed behaviour + AI use
- [ ] No extra features beyond the request
