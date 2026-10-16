# Hero concept art

Turnaround sheets (front / side / back) for the four heroes, plus a lineup showing each hero's signature ability. Generated with **GPT Image 2** from the hero concept, used as art direction only:

| File | Hero | Key traits |
|---|---|---|
| `warrior-turnaround.jpg` | Warrior | Red spiky hair, steel-blue plate armour, crimson tabard, longsword. Ability: flaming sword sweep |
| `fire-mage-turnaround.jpg` | Fire Mage | Black hair, charcoal hooded mantle over a crimson robe, gold trim, leather straps. Ability: fireballs |
| `archer-turnaround.jpg` | Archer | Brown ponytail, green hooded cape, cream sleeves, leather corset, recurve bow + quiver. Ability: arrow shot |
| `rogue-turnaround.jpg` | Rogue | Black hair, dark leather armour, torn purple scarf/cape, twin daggers. Ability: vanish + backstab |
| `heroes-lineup-with-abilities.jpg` | All four | Side-by-side lineup with ability poses |

The sheets are reference only, so they were downscaled to 1200 px JPEGs (~770 KB for all five, down from ~9 MB of PNGs) to leave the 5 MB ZIP budget for game assets.

## How this art relates to the build

The playable uses **low-poly stand-ins** in the time box: procedural placeholders now, with free CC0 packs (KayKit / Quaternius) as the planned upgrade. The stand-ins already borrow these sheets' **colour identities** (warrior red/steel, mage crimson/charcoal, archer green/brown, rogue purple/black), so each hero is recognisable at a glance on a small screen.

**With more time and budget, these sheets are a ready-made brief for custom 3D characters.** Turnarounds are exactly what a 3D artist models from. A production path would be:

1. **Model**: a stylised low-poly (mobile-friendly) version of each hero from the front/side/back views, with one texture atlas per character.
2. **Rig and animate**: idle, run, attack/cast/shoot, hit, death, plus each signature ability (flame sweep, fireball cast, bow draw, vanish/backstab).
3. **Optimise for playable ads**: about 5–10k triangles per hero, compressed GLB (meshopt + WebP/KTX2), aiming for roughly 300–600 KB per animated hero so all four still fit the 5 MB budget.
4. **Match effects**: the flame trails, fireball and vanish smoke from the lineup as particle/shader effects.

That's typically several days of a 3D artist's and animator's time per character. AI image-to-3D tools plus auto-rigging can speed up a first pass; Meshy (meshy.ai) was tried here but needs a paid plan. They usually need cleanup and a check of their licence terms anyway. It's out of scope for a 4–6 hour take-home, which is why the build uses CC0 stand-ins.
