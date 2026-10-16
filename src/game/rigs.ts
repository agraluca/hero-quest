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

export type RigAction = 'none' | 'swing' | 'cast' | 'castBig' | 'shoot' | 'windup' | 'stab' | 'spin' | 'roll';

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
  setOpacity(o: number): void;
}

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  cone: new THREE.ConeGeometry(1, 1, 18),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  torusHalf: new THREE.TorusGeometry(1, 0.08, 6, 20, Math.PI),
  shadow: new THREE.CircleGeometry(1, 20),
};

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
markShared(shadowMat, ...Object.values(G));

interface HumanoidSpec {
  skin: number;
  torso: number;
  legs: number;
  robe?: boolean;
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
  /** optional per-rig extra animation (wings, glowing orbs, ...) */
  extra: ((dt: number, pose: RigPose, rig: ProceduralRig) => void) | null = null;
  humanoid = true;
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
    if (s.robe) {
      const robe = b.mesh(G.cone, s.torso);
      robe.scale.set(0.42, 0.85, 0.42);
      robe.position.y = 0.62;
      this.body.add(robe);
    } else {
      const torso = b.mesh(G.capsule, s.torso);
      torso.scale.set(0.27, 0.16, 0.22);
      torso.position.y = 0.78;
      this.body.add(torso);
    }

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

    if (this.humanoid) {
      // locomotion
      this.legL.rotation.x = s * 0.8 * sp;
      this.legR.rotation.x = -s * 0.8 * sp;
      let armLx = -s * 0.6 * sp;
      let armRx = s * 0.6 * sp;
      let armRz = 0;
      let armLz = 0;
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
        case 'stab': {
          const e = Math.sin(t * Math.PI);
          armRx = -1.5 * e;
          armLx = -1.2 * e;
          twist = -0.3 * e;
          break;
        }
        case 'cast': {
          const e = Math.sin(Math.min(t, 1) * Math.PI * 0.5);
          armRx = -1.7 * e;
          armLx = -1.2 * e;
          armLz = 0.3 * e;
          break;
        }
        case 'shoot':
          armLx = -1.55;
          armRx = -1.45;
          armRz = 0.35 * (1 - t);
          twist = -0.15;
          break;
        case 'windup': {
          armRx = -2.6;
          armLx = -1.0;
          twist = 0.35;
          break;
        }
      }
      this.armL.rotation.set(armLx, 0, armLz);
      this.armR.rotation.set(armRx, 0, armRz);
      this.body.rotation.y = twist;
    }

    // death: tip over backwards and sink
    if (pose.dead > 0) {
      const d = Math.min(pose.dead, 1);
      this.body.rotation.x = -Math.PI * 0.5 * Math.min(d * 2, 1);
      this.body.position.y = -d * 0.45;
    } else {
      this.body.rotation.x = 0;
    }

    this.extra?.(dt, pose, this);
  }

  flash(amount: number, color = 0xffffff): void {
    this.flashColor.set(color);
    const { mats, baseEmissive } = this.b;
    for (let i = 0; i < mats.length; i++) {
      mats[i].emissive.copy(baseEmissive[i]).lerp(this.flashColor, amount);
    }
  }

  setOpacity(o: number): void {
    for (const m of this.b.mats) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
    }
  }
}

// ---------------------------------------------------------------- heroes

export type HeroKind = 'warrior' | 'mage' | 'archer' | 'rogue';

/** Spiky/messy hair cap built from a sphere + a few cones (colours from the concept sheets). */
function hair(r: ProceduralRig, color: number, spikes: number, ponytail = false): void {
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
  if (ponytail) {
    const tail = b.mesh(G.capsule, color);
    tail.scale.set(0.08, 0.14, 0.08);
    tail.position.set(0, 0.12, -0.36);
    tail.rotation.x = 0.6;
    r.head.add(tail);
  }
}

/**
 * Hero stand-ins. Colour identities follow concept-art/*.png:
 * warrior = red hair + steel plate + crimson tabard; fire mage = crimson robe
 * + charcoal hooded mantle; archer = green hooded cape + brown ponytail;
 * rogue = black hair + dark leather + torn purple scarf.
 */
export function makeProceduralHero(kind: HeroKind): ProceduralRig {
  const r = new ProceduralRig();
  const b = r.builder;
  switch (kind) {
    case 'warrior': {
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
      break;
    }
    case 'mage': {
      r.buildHumanoid({ skin: 0xf6c9a0, torso: 0x8a1f30, legs: 0x2a2228, robe: true });
      hair(r, 0x1d1a22, 6);
      // charcoal hooded mantle over the shoulders, gold trim
      const mantle = b.mesh(G.cone, 0x34303a);
      mantle.scale.set(0.5, 0.4, 0.46);
      mantle.position.y = 0.93;
      const trim = b.mesh(G.cyl, 0xd9a441);
      trim.scale.set(0.5, 0.025, 0.46);
      trim.position.y = 0.74;
      const hood = b.mesh(G.sphere, 0x34303a);
      hood.scale.set(0.26, 0.22, 0.2);
      hood.position.set(0, 1.08, -0.24);
      r.body.add(mantle, trim, hood);
      const staff = b.mesh(G.cyl, 0x5a3a2a);
      staff.scale.set(0.035, 1.2, 0.035);
      staff.rotation.x = Math.PI / 2;
      staff.position.z = 0.15;
      const orb = b.mesh(G.sphere, 0xffb057, 0xf58324);
      orb.scale.setScalar(0.13);
      orb.position.z = 0.78;
      r.handR.add(staff, orb);
      r.extra = (_dt, pose) => {
        const s = pose.action === 'cast' ? 0.13 + 0.07 * pose.t : 0.13;
        orb.scale.setScalar(s);
      };
      break;
    }
    case 'archer': {
      r.buildHumanoid({ skin: 0xf6c9a0, torso: 0x3f6b3a, legs: 0x2e2626 });
      hair(r, 0x6b4226, 4, true);
      // green hooded cape, leather corset
      const cape = b.mesh(G.cone, 0x355c32);
      cape.scale.set(0.42, 0.36, 0.4);
      cape.position.y = 0.95;
      const corset = b.mesh(G.cyl, 0x7a4b2e);
      corset.scale.set(0.27, 0.16, 0.22);
      corset.position.y = 0.72;
      r.body.add(cape, corset);
      const bow = b.mesh(G.torusHalf, 0x5a3a24);
      bow.scale.setScalar(0.48);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      bow.position.z = 0.05;
      r.handL.add(bow);
      const quiver = b.mesh(G.cyl, 0x6b4428);
      quiver.scale.set(0.09, 0.42, 0.09);
      quiver.position.set(0.12, 0.9, -0.22);
      quiver.rotation.x = 0.3;
      const fletch = b.mesh(G.cone, 0xfff6e8);
      fletch.scale.set(0.08, 0.14, 0.08);
      fletch.position.set(0.12, 1.15, -0.28);
      r.body.add(quiver, fletch);
      break;
    }
    case 'rogue': {
      r.buildHumanoid({ skin: 0xf6c9a0, torso: 0x2b2530, legs: 0x1e1a22 });
      hair(r, 0x15131a, 7);
      // torn purple scarf/cape
      const scarf = b.mesh(G.cyl, 0x5b3a8a);
      scarf.scale.set(0.25, 0.11, 0.25);
      scarf.position.y = 1.0;
      const tail = b.mesh(G.box, 0x5b3a8a);
      tail.scale.set(0.34, 0.55, 0.04);
      tail.position.set(0, 0.68, -0.22);
      tail.rotation.x = 0.15;
      const pauldron = b.mesh(G.sphere, 0x3a3440);
      pauldron.scale.set(0.14, 0.1, 0.14);
      pauldron.position.set(0.3, 1.0, 0);
      r.body.add(scarf, tail, pauldron);
      for (const hand of [r.handL, r.handR]) {
        const dagger = b.mesh(G.cone, 0xe9edf7);
        dagger.scale.set(0.05, 0.42, 0.05);
        dagger.rotation.x = Math.PI / 2;
        dagger.position.z = 0.22;
        hand.add(dagger);
      }
      break;
    }
  }
  return r;
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'skeleton' | 'captain' | 'caster' | 'warlock' | 'bat' | 'brute';

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
    case 'caster':
    case 'warlock': {
      const warlock = kind === 'warlock';
      r.buildHumanoid({
        skin: 0xf3ead8,
        torso: warlock ? 0x1e1030 : 0x3a2266,
        legs: 0x1a1028,
        skull: true,
        robe: true,
        eyes: warlock ? 0xff3a6a : 0xc89bff,
        scale: warlock ? 1.45 : 1,
      });
      const hood = b.mesh(G.cone, warlock ? 0x120a1e : 0x2a1650);
      hood.scale.set(0.34, 0.45, 0.34);
      hood.position.y = 0.22;
      r.head.add(hood);
      if (warlock) {
        // crown of dark horns
        for (const x of [-0.2, 0, 0.2]) {
          const horn = b.mesh(G.cone, 0x8a3cff, 0x5a1ab0);
          horn.scale.set(0.05, 0.2, 0.05);
          horn.position.set(x, 0.42, 0.05);
          r.head.add(horn);
        }
      }
      const orb = b.mesh(G.sphere, 0x6a2cc0, 0x5a1ab0);
      orb.scale.setScalar(0.14);
      orb.position.set(0, -0.05, 0.12);
      r.handR.add(orb);
      r.extra = (_dt, pose) => {
        orb.scale.setScalar(pose.action === 'windup' ? 0.14 + 0.12 * pose.t : 0.14);
      };
      break;
    }
    case 'bat': {
      r.humanoid = false;
      r.height = 0.8;
      const body = b.mesh(G.sphere, 0x3a1f70);
      body.scale.set(0.3, 0.26, 0.3);
      r.body.add(body);
      for (const x of [-0.11, 0.11]) {
        const eye = new THREE.Mesh(G.sphere, glow(0xf58324));
        eye.scale.setScalar(0.06);
        eye.position.set(x, 0.05, 0.25);
        r.body.add(eye);
      }
      const ears = [-0.12, 0.12].map((x) => {
        const e = b.mesh(G.cone, 0x3a1f70);
        e.scale.set(0.07, 0.18, 0.07);
        e.position.set(x, 0.28, 0);
        return e;
      });
      r.body.add(...ears);
      const wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.x = side * 0.22;
        const w = b.mesh(G.box, 0x5a2fb0);
        w.scale.set(0.55, 0.03, 0.32);
        w.position.x = side * 0.27;
        pivot.add(w);
        r.body.add(pivot);
        return { pivot, side };
      });
      r.extra = (dt, pose, rig) => {
        const t = performance.now() * 0.02;
        for (const w of wings) w.pivot.rotation.z = w.side * Math.sin(t) * 0.8;
        if (pose.dead > 0) {
          rig.body.position.y = -pose.dead * 1.2;
          rig.body.rotation.z += dt * 8;
        }
      };
      break;
    }
    case 'brute': {
      r.buildHumanoid({ skin: 0x6f8a5a, torso: 0x7a4b32, legs: 0x4a3426, scale: 1.65, eyes: 0xffd34d });
      for (const x of [-0.17, 0.17]) {
        const horn = b.mesh(G.cone, 0xfff6e8);
        horn.scale.set(0.07, 0.22, 0.07);
        horn.position.set(x, 0.28, 0);
        horn.rotation.z = -x * 2;
        r.head.add(horn);
      }
      const club = b.mesh(G.cyl, 0x5a3a2a);
      club.scale.set(0.09, 0.75, 0.09);
      club.rotation.x = Math.PI / 2;
      club.position.z = 0.4;
      const knob = b.mesh(G.sphere, 0x5a3a2a);
      knob.scale.setScalar(0.17);
      knob.position.z = 0.8;
      r.handR.add(club, knob);
      break;
    }
  }
  return r;
}
