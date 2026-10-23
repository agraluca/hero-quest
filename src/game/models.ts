import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { markShared, ramp } from './materials';
import {
  makeProceduralEnemy,
  makeProceduralHero,
  type EnemyKind,
  type Rig,
  type RigAction,
  type RigPose,
} from './rigs';

/**
 * KayKit models (CC0, Kay Lousberg). Built by scripts/build-models.mjs into
 * public/models. Everything is loaded once at boot; if any file fails, that
 * character falls back to its procedural rig so the game still runs.
 */

const FILES = [
  'hero-knight',
  'anims-hero-base',
  'anims-hero-move',
  'anims-combat',
  'skeleton-minion',
  'skeleton-warrior',
  'anims-skeleton',
  'w-sword',
  'w-skel-blade',
  'w-skel-axe',
] as const;
type ModelName = (typeof FILES)[number];

const scenes = new Map<ModelName, THREE.Object3D>();
const clips = new Map<ModelName, THREE.AnimationClip[]>();
let heroClips: Map<string, THREE.AnimationClip> | null = null;
let skeletonClips: Map<string, THREE.AnimationClip> | null = null;

export async function loadModels(onProgress?: (done: number, total: number) => void, base = './models/'): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  await Promise.all(
    FILES.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${base}${name}.glb`);
        // toon-shade KayKit textures so they match the rest of the scene
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const src = m.material as THREE.MeshStandardMaterial;
          const map = src.map;
          m.material = new THREE.MeshToonMaterial({ map, color: src.color, gradientMap: ramp });
          markShared(m.geometry);
          if (map) markShared(map);
        });
        scenes.set(name, gltf.scene);
        clips.set(name, gltf.animations);
      } catch (err) {
        console.warn(`[models] ${name} failed to load, using fallback`, err);
      }
      onProgress?.(++done, FILES.length);
    }),
  );
  const collect = (...names: ModelName[]) => {
    const map = new Map<string, THREE.AnimationClip>();
    for (const n of names) for (const c of clips.get(n) ?? []) map.set(c.name, c);
    return map;
  };
  heroClips = collect('anims-hero-base', 'anims-hero-move', 'anims-combat');
  skeletonClips = collect('anims-skeleton');
}

// ---------------------------------------------------------------- GLB rig

interface Attach {
  model: ModelName;
  bone: 'handslotr' | 'handslotl';
}

interface GltfRigOpts {
  height: number;
  attach?: Attach[];
  /** action -> clip name in this rig's clip set */
  actions: Partial<Record<RigAction, string>>;
}

const shadowGeo = new THREE.CircleGeometry(1, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
markShared(shadowGeo, shadowMat);

/**
 * Skinned GLB character. Locomotion clips loop on the mixer; action and death
 * clips are *scrubbed* to the gameplay timer (pose.t), so animation always
 * lines up with hit frames, pauses and interrupts.
 */
export class GltfRig implements Rig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly height: number;
  readonly animatedSpin: boolean;
  private mixer: THREE.AnimationMixer;
  private loops: { idle?: THREE.AnimationAction; run?: THREE.AnimationAction };
  private acts = new Map<string, THREE.AnimationAction>();
  private death?: THREE.AnimationAction;
  private weights = new Map<THREE.AnimationAction, number>();
  private mats: THREE.MeshToonMaterial[] = [];
  private baseColor: THREE.Color[] = [];
  private flashColor = new THREE.Color();

  constructor(model: THREE.Object3D, set: Map<string, THREE.AnimationClip>, opts: GltfRigOpts) {
    const inst = cloneSkinned(model);
    // scale to the gameplay height
    const box = new THREE.Box3().setFromObject(inst);
    const h = Math.max(box.max.y - box.min.y, 0.01);
    inst.scale.setScalar(opts.height / h);
    this.height = opts.height;
    this.body.add(inst);
    this.root.add(this.body);

    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.scale.setScalar(0.5 * (opts.height / 1.6));
    sh.renderOrder = -1;
    this.root.add(sh);

    // per-instance materials so flashes/fades don't leak to other characters
    inst.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshToonMaterial).clone();
      m.material = mat;
      this.mats.push(mat);
      this.baseColor.push(mat.emissive.clone());
    });

    for (const a of opts.attach ?? []) {
      const src = scenes.get(a.model);
      const bone = inst.getObjectByName(a.bone);
      if (!src || !bone) continue;
      const w = src.clone();
      w.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshToonMaterial).clone();
          m.material = mat;
        this.mats.push(mat);
        this.baseColor.push(mat.emissive.clone());
      });
      bone.add(w);
    }

    this.mixer = new THREE.AnimationMixer(inst);
    const make = (clipName: string | undefined, loop: boolean) => {
      const clip = clipName ? set.get(clipName) : undefined;
      if (!clip) return undefined;
      const act = this.mixer.clipAction(clip);
      act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      act.clampWhenFinished = !loop;
      act.enabled = true;
      act.setEffectiveWeight(0);
      act.play();
      if (!loop) act.paused = true; // scrubbed manually
      this.weights.set(act, 0);
      return act;
    };
    this.loops = { idle: make('idle', true), run: make('run', true) };
    this.death = make('death', false);
    for (const [action, clipName] of Object.entries(opts.actions)) {
      const act = make(clipName, false);
      if (act) this.acts.set(action, act);
    }
    this.animatedSpin = this.acts.has('spin');
    this.update(0, { speed: 0, action: 'none', t: 0, dead: 0 });
  }

  update(dt: number, pose: RigPose): void {
    // what should be showing
    let scrub: THREE.AnimationAction | undefined;
    let scrubT = 0;
    if (pose.dead > 0 && this.death) {
      scrub = this.death;
      scrubT = Math.min(pose.dead, 1);
    } else if (pose.action !== 'none') {
      scrub = this.acts.get(pose.action) ?? (pose.action === 'windup' ? this.acts.get('swing') : undefined);
      // wind-ups hold the anticipation part of the swing
      scrubT = pose.action === 'windup' ? 0.15 + Math.min(pose.t, 1) * 0.15 : Math.min(Math.max(pose.t, 0), 1);
    }
    const target = new Map<THREE.AnimationAction, number>();
    if (scrub) {
      target.set(scrub, 1);
      scrub.time = scrubT * scrub.getClip().duration * 0.999;
    } else {
      const moving = pose.speed > 0.08;
      if (this.loops.run) {
        target.set(this.loops.run, moving ? 1 : 0);
        this.loops.run.timeScale = 0.75 + 0.5 * Math.min(pose.speed, 1.4);
      }
      if (this.loops.idle) target.set(this.loops.idle, moving ? 0 : 1);
    }
    // smooth weight blending (fast enough to read as a cut, slow enough to not pop)
    const k = dt > 0 ? Math.min(1, dt * 14) : 1;
    for (const [act, w] of this.weights) {
      const goal = target.get(act) ?? 0;
      const nw = scrub === act ? 1 : w + (goal - w) * k;
      this.weights.set(act, nw);
      act.setEffectiveWeight(scrub && act !== scrub ? 0 : nw);
    }
    this.body.position.set(0, 0, 0);
    this.mixer.update(dt);
  }

  flash(amount: number, color = 0xffffff): void {
    this.flashColor.set(color);
    for (let i = 0; i < this.mats.length; i++) this.mats[i].emissive.copy(this.baseColor[i]).lerp(this.flashColor, amount * 0.8);
  }
}

// ---------------------------------------------------------------- factories

export function makeHeroRig(): Rig {
  const model = scenes.get('hero-knight');
  if (!model || !heroClips) return makeProceduralHero();
  return new GltfRig(model, heroClips, { height: 1.75, attach: [{ model: 'w-sword', bone: 'handslotr' }], actions: { swing: 'swing', spin: 'spin' } });
}

const ENEMY: Record<EnemyKind, { model: ModelName; height: number; attach: Attach[] }> = {
  skeleton: { model: 'skeleton-minion', height: 1.6, attach: [{ model: 'w-skel-blade', bone: 'handslotr' }] },
  captain: { model: 'skeleton-warrior', height: 2.25, attach: [{ model: 'w-skel-axe', bone: 'handslotr' }] },
};

export function makeEnemyRig(kind: EnemyKind): Rig {
  const e = ENEMY[kind];
  const model = scenes.get(e.model);
  if (!model || !skeletonClips) return makeProceduralEnemy(kind);
  return new GltfRig(model, skeletonClips, { height: e.height, attach: e.attach, actions: { swing: 'attack', windup: 'attack' } });
}
