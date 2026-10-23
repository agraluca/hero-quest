import * as THREE from 'three';
import { glow, markShared, toonUnique } from './materials';

/**
 * Character visuals.
 *
 * Gameplay code only talks to the `Rig` interface (root, update(pose), flash,
 * setOpacity). These procedural chibi rigs are placeholders built from rounded
 * primitives. A GLB-backed rig with an AnimationMixer can implement the same
 * interface later without touching gameplay.
 */

export type RigAction = 'none' | 'swing' | 'windup' | 'spin';

export interface RigPose {
  /** 0..1 locomotion intensity */
  speed: number;
  action: RigAction;
  /** 0..1 progress of the current action */
  t: number;
  /** 0..1 death progress (0 = alive) */
  dead: number;
}

export interface Rig {
  root: THREE.Group;
  /** the animated model inside root (stages may offset it, e.g. rising from the ground) */
  body: THREE.Group;
  height: number;
  /** true when the model's own clip already spins (fire spin), so code shouldn't rotate it too */
  readonly animatedSpin: boolean;
  update(dt: number, pose: RigPose): void;
  flash(amount: number, color?: number): void;
}

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  cone: new THREE.ConeGeometry(1, 1, 18),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  shadow: new THREE.CircleGeometry(1, 20),
};

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
markShared(shadowMat, ...Object.values(G));

interface HumanoidSpec {
  skin: number;
  torso: number;
  legs: number;
  skull?: boolean;
  scale?: number;
  eyes?: number;
}

class Builder {
  mats: THREE.MeshToonMaterial[] = [];
  baseEmissive: THREE.Color[] = [];

  mat(color: number, emissive = 0): THREE.MeshToonMaterial {
    const m = toonUnique(color, emissive);
    this.mats.push(m);
    this.baseEmissive.push(new THREE.Color(emissive));
    return m;
  }

  mesh(geo: THREE.BufferGeometry, color: number, emissive = 0): THREE.Mesh {
    return new THREE.Mesh(geo, this.mat(color, emissive));
  }
}

export class ProceduralRig implements Rig {
  root = new THREE.Group();
  /** everything that tilts/bobs (excludes the ground shadow) */
  body = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  handL = new THREE.Group();
  handR = new THREE.Group();
  height = 1.5;
  private phase = Math.random() * 10;
  private b = new Builder();
  private flashColor = new THREE.Color();
  readonly animatedSpin = false;

  constructor() {
    this.root.add(this.body);
    const sh = new THREE.Mesh(G.shadow, shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.scale.setScalar(0.5);
    sh.renderOrder = -1;
    this.root.add(sh);
  }

  get builder(): Builder {
    return this.b;
  }

  buildHumanoid(s: HumanoidSpec): this {
    const b = this.b;
    const k = s.scale ?? 1;
    this.body.scale.setScalar(k);
    this.height = 1.55 * k;

    // legs
    for (const [leg, x] of [
      [this.legL, -0.14],
      [this.legR, 0.14],
    ] as const) {
      leg.position.set(x, 0.5, 0);
      const m = b.mesh(G.capsule, s.legs);
      m.scale.set(0.11, 0.16, 0.11);
      m.position.y = -0.24;
      leg.add(m);
      this.body.add(leg);
    }

    // torso
    const torso = b.mesh(G.capsule, s.torso);
    torso.scale.set(0.27, 0.16, 0.22);
    torso.position.y = 0.78;
    this.body.add(torso);

    // head
    this.head.position.y = 1.22;
    const head = b.mesh(G.sphere, s.skin);
    head.scale.setScalar(s.skull ? 0.27 : 0.3);
    this.head.add(head);
    const eyeColor = s.eyes ?? 0x201338;
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(G.sphere, glow(eyeColor));
      eye.scale.setScalar(s.skull ? 0.065 : 0.045);
      eye.position.set(x, 0.02, s.skull ? 0.22 : 0.27);
      this.head.add(eye);
    }
    this.body.add(this.head);

    // arms (pivot at shoulder, hand at the end)
    for (const [arm, hand, x] of [
      [this.armL, this.handL, -0.33],
      [this.armR, this.handR, 0.33],
    ] as const) {
      arm.position.set(x, 0.98, 0);
      const m = b.mesh(G.capsule, s.torso);
      m.scale.set(0.085, 0.14, 0.085);
      m.position.y = -0.18;
      arm.add(m);
      const fist = b.mesh(G.sphere, s.skin);
      fist.scale.setScalar(0.09);
      fist.position.y = -0.38;
      arm.add(fist);
      hand.position.y = -0.38;
      arm.add(hand);
      this.body.add(arm);
    }
    return this;
  }

  update(dt: number, pose: RigPose): void {
    const sp = pose.speed;
    this.phase += dt * (4 + sp * 8);
    const s = Math.sin(this.phase);

    // locomotion
    this.legL.rotation.x = s * 0.8 * sp;
    this.legR.rotation.x = -s * 0.8 * sp;
    let armLx = -s * 0.6 * sp;
    let armRx = s * 0.6 * sp;
    let armRz = 0;
    let twist = 0;
    this.body.position.y = Math.abs(s) * 0.07 * sp + (1 - sp) * Math.sin(this.phase * 0.5) * 0.015;

    const t = pose.t;
    switch (pose.action) {
      case 'swing': {
        // raise high, then slash down across
        const e = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        armRx = -2.7 * e + (t > 0.25 ? 0.6 * (1 - e) : 0);
        armRz = -0.3 * e;
        twist = t < 0.25 ? 0.5 * e : -0.6 * (1 - e) * (1 - t);
        break;
      }
      case 'windup': {
        armRx = -2.6;
        armLx = -1.0;
        twist = 0.35;
        break;
      }
    }
    this.armL.rotation.set(armLx, 0, 0);
    this.armR.rotation.set(armRx, 0, armRz);
    this.body.rotation.y = twist;

    // death: tip over backwards and sink
    if (pose.dead > 0) {
      const d = Math.min(pose.dead, 1);
      this.body.rotation.x = -Math.PI * 0.5 * Math.min(d * 2, 1);
      this.body.position.y = -d * 0.45;
    } else {
      this.body.rotation.x = 0;
    }
  }

  flash(amount: number, color = 0xffffff): void {
    this.flashColor.set(color);
    const { mats, baseEmissive } = this.b;
    for (let i = 0; i < mats.length; i++) {
      mats[i].emissive.copy(baseEmissive[i]).lerp(this.flashColor, amount);
    }
  }
}

// ---------------------------------------------------------------- hero

/** Spiky/messy hair cap built from a sphere + a few cones (colours from the concept sheets). */
function hair(r: ProceduralRig, color: number, spikes: number): void {
  const b = r.builder;
  const cap = b.mesh(G.sphere, color);
  cap.scale.set(0.32, 0.24, 0.33);
  cap.position.set(0, 0.1, -0.03);
  r.head.add(cap);
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const spike = b.mesh(G.cone, color);
    spike.scale.set(0.09, 0.2, 0.09);
    spike.position.set(Math.sin(a) * 0.18, 0.26, Math.cos(a) * 0.14 - 0.04);
    spike.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
    r.head.add(spike);
  }
}

/**
 * Warrior stand-in (fallback if the KayKit model fails to load). Colours follow
 * concept-art/: red hair + steel plate + crimson tabard.
 */
export function makeProceduralHero(): ProceduralRig {
  const r = new ProceduralRig();
  const b = r.builder;
  r.buildHumanoid({ skin: 0xf6c9a0, torso: 0x9db2cf, legs: 0x8fa3bf });
  hair(r, 0xc8323a, 7);
  // crimson tabard with gold trim over the plate
  const tabard = b.mesh(G.box, 0xa8283a);
  tabard.scale.set(0.24, 0.42, 0.04);
  tabard.position.set(0, 0.55, 0.2);
  const trim = b.mesh(G.box, 0xd9a441);
  trim.scale.set(0.26, 0.04, 0.05);
  trim.position.set(0, 0.36, 0.205);
  const belt = b.mesh(G.cyl, 0x6b4428);
  belt.scale.set(0.3, 0.07, 0.25);
  belt.position.y = 0.66;
  r.body.add(tabard, trim, belt);
  for (const x of [-0.3, 0.3]) {
    const pauldron = b.mesh(G.sphere, 0xb8c8de);
    pauldron.scale.set(0.15, 0.11, 0.15);
    pauldron.position.set(x, 1.0, 0);
    r.body.add(pauldron);
  }
  // longsword
  const blade = b.mesh(G.box, 0xe9edf7);
  blade.scale.set(0.07, 0.05, 0.9);
  blade.position.z = 0.5;
  const guard = b.mesh(G.box, 0xc89a4a);
  guard.scale.set(0.3, 0.06, 0.07);
  guard.position.z = 0.06;
  r.handR.add(blade, guard);
  return r;
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'skeleton' | 'captain';

export function makeProceduralEnemy(kind: EnemyKind): ProceduralRig {
  const r = new ProceduralRig();
  const b = r.builder;
  switch (kind) {
    case 'skeleton':
    case 'captain': {
      const captain = kind === 'captain';
      r.buildHumanoid({
        skin: 0xf3ead8,
        torso: 0xe2d6bd,
        legs: 0xd8ccb2,
        skull: true,
        eyes: captain ? 0xf58324 : 0xff5a6a,
        scale: captain ? 1.4 : 1,
      });
      const blade = b.mesh(G.box, 0x9a8f86);
      blade.scale.set(0.06, 0.05, 0.6);
      blade.position.z = 0.35;
      r.handR.add(blade);
      if (captain) {
        const helm = b.mesh(G.cone, 0x7845d8);
        helm.scale.set(0.3, 0.32, 0.3);
        helm.position.y = 0.26;
        r.head.add(helm);
        const cape = b.mesh(G.box, 0x7845d8);
        cape.scale.set(0.5, 0.7, 0.05);
        cape.position.set(0, 0.7, -0.24);
        r.body.add(cape);
      }
      break;
    }
  }
  return r;
}
