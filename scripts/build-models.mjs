// Build-time model pipeline (not shipped): assets-src/*  ->  public/models/*.glb
//
// For each entry in MODELS:
//   1. keep only the animation clips we use, renamed to our rig states
//      (idle / run / attack / cast / shoot / special / hit / death / spawn)
//   2. resample keyframes, prune unused data, dedup
//   3. quantize + meshopt-compress (decoded at runtime by three's bundled MeshoptDecoder)
// KayKit packs are CC0 (Kay Lousberg, https://kaylousberg.itch.io).
//
// usage: node scripts/build-models.mjs
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SKEL = 'assets-src/kaykit-skeletons/addons/kaykit_character_pack_skeletons';
const ADV = 'assets-src/kaykit-adventurers'; // KayKit Adventurers 2.0 (free tier), unzipped here

/**
 * Entries:
 *   clips      our state name -> source clip name (all other clips are dropped)
 *   meshless   strip meshes: the file becomes a pure animation library
 *   coreBones  keep only tracks for the shared core bones (drops the old rig's IK/control bones
 *              and non-hip translations, so clips retarget onto Rig_Medium heroes by bone name)
 */
const SKEL_GLB = `${SKEL}/Characters/gltf`;
const ADV_CHAR = `${ADV}/Characters/gltf`;
const ADV_ANIM = `${ADV}/Animations/gltf/Rig_Medium`;
const ADV_ASSET = `${ADV}/Assets/gltf`;

const MODELS = [
  // ---- hero: KayKit Adventurers 2.0 Knight (ships without clips)
  { out: 'hero-knight', src: `${ADV_CHAR}/Knight.glb`, clips: {} },
  // ---- shared hero clips (Rig_Medium): locomotion + reactions
  { out: 'anims-hero-base', src: `${ADV_ANIM}/Rig_Medium_General.glb`, meshless: true, clips: { idle: 'Idle_A', hit: 'Hit_A', death: 'Death_A' } },
  { out: 'anims-hero-move', src: `${ADV_ANIM}/Rig_Medium_MovementBasic.glb`, meshless: true, clips: { run: 'Running_A' } },
  // ---- combat clips borrowed from the Skeletons rig (same core bone names)
  {
    out: 'anims-combat',
    src: `${SKEL_GLB}/Skeleton_Minion.glb`,
    meshless: true,
    coreBones: true,
    clips: {
      swing: '2H_Melee_Attack_Slice',
      spin: '2H_Melee_Attack_Spinning',
    },
  },
  // ---- enemies: skeleton minion + captain meshes, one shared skeleton clip library
  { out: 'skeleton-minion', src: `${SKEL_GLB}/Skeleton_Minion.glb`, clips: {} },
  { out: 'skeleton-warrior', src: `${SKEL_GLB}/Skeleton_Warrior.glb`, clips: {} },
  {
    out: 'anims-skeleton',
    src: `${SKEL_GLB}/Skeleton_Minion.glb`,
    meshless: true,
    coreBones: true,
    clips: { idle: 'Idle_Combat', run: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons' },
  },
  // ---- weapons (static, attached to hand bones at runtime)
  { out: 'w-sword', src: `${ADV_ASSET}/sword_2handed.gltf` },
  { out: 'w-skel-blade', src: `${SKEL}/Assets/gltf/Skeleton_Blade.gltf` },
  { out: 'w-skel-axe', src: `${SKEL}/Assets/gltf/Skeleton_Axe.gltf` },
];

const CORE = new Set([
  'root', 'hips', 'spine', 'chest', 'head',
  'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',
  'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r',
  'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
  'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r',
]);

const OUT = 'public/models';
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
mkdirSync(OUT, { recursive: true });

let total = 0;
for (const m of MODELS) {
  if (!existsSync(m.src)) {
    console.log(`skip ${m.out}: ${m.src} not found`);
    continue;
  }
  const doc = await io.read(m.src);
  const root = doc.getRoot();
  if (m.clips) {
    const wanted = new Map(Object.entries(m.clips).map(([ours, theirs]) => [theirs, ours]));
    const found = new Set();
    for (const anim of root.listAnimations()) {
      const ours = wanted.get(anim.getName());
      if (ours && !found.has(ours)) {
        anim.setName(ours);
        found.add(ours);
      } else {
        // dispose channels/samplers too, or their keyframe accessors survive prune()
        // (accessors themselves may be shared with kept clips, so prune decides)
        for (const c of anim.listChannels()) c.dispose();
        for (const sm of anim.listSamplers()) sm.dispose();
        anim.dispose();
      }
    }
    const missing = Object.keys(m.clips).filter((k) => !found.has(k));
    if (missing.length) console.warn(`  ! ${m.out}: missing clips ${missing.join(', ')}`);
  }
  if (m.coreBones) {
    for (const anim of root.listAnimations()) {
      for (const c of anim.listChannels()) {
        const name = c.getTargetNode()?.getName() ?? '';
        const path = c.getTargetPath();
        const keep = CORE.has(name) && (path === 'rotation' || (path === 'translation' && name === 'hips'));
        if (!keep) {
          c.getSampler()?.dispose();
          c.dispose();
        }
      }
    }
  }
  if (m.meshless) {
    for (const node of root.listNodes()) {
      if (node.getMesh()) {
        node.setMesh(null);
        node.setSkin(null);
      }
    }
    for (const t of root.listTextures()) t.dispose();
  }
  await doc.transform(
    resample(),
    prune(),
    dedup(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = join(OUT, `${m.out}.glb`);
  await io.write(out, doc);
  const kb = statSync(out).size / 1024;
  total += kb;
  console.log(`${m.out.padEnd(18)} ${kb.toFixed(0).padStart(5)} KB  (from ${(statSync(m.src).size / 1024).toFixed(0)} KB)`);
}
console.log(`total ${total.toFixed(0)} KB`);
