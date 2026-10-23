import * as THREE from 'three';
import type { Hero } from './Hero';
import { angleDiff, approachAngle, lineOfSight, resolveCircle, yawTo, type Box } from './physics';
import { makeEnemyRig } from './models';
import type { EnemyKind, Rig, RigAction } from './rigs';

/** What enemy AI needs from the stage. */
export interface EnemyWorld {
  hero: Hero;
  obstacles: readonly Box[];
  sightBlockers: readonly Box[];
  hurtHero(dmg: number, from: THREE.Vector3, opts?: { stagger?: number; knock?: number; kill?: boolean }): void;
  /** dark orb toward target; `spread` > 0 fires a 3-orb fan (radians between orbs) */
  fireOrb(from: THREE.Vector3, target: THREE.Vector3, spread?: number): void;
  onAlert(e: Enemy): void;
}

interface EnemySpec {
  hp: number;
  speed: number;
  radius: number;
  coins: number;
  /** melee reach */
  reach: number;
  damage: number;
}

const SPECS: Record<EnemyKind, EnemySpec> = {
  skeleton: { hp: 2, speed: 2.6, radius: 0.4, coins: 2, reach: 1.5, damage: 1 },
  captain: { hp: 7, speed: 2.2, radius: 0.6, coins: 6, reach: 1.7, damage: 2 },
  caster: { hp: 2, speed: 1.2, radius: 0.4, coins: 2, reach: 0, damage: 1 },
  warlock: { hp: 7, speed: 0.8, radius: 0.6, coins: 8, reach: 0, damage: 1 },
  bat: { hp: 1, speed: 3.5, radius: 0.45, coins: 1, reach: 0.9, damage: 1 },
  brute: { hp: 99, speed: 2.3, radius: 0.7, coins: 6, reach: 1.5, damage: 99 },
};

export type EnemyState =
  | 'spawn'
  | 'chase'
  | 'windup'
  | 'recover'
  | 'stun'
  | 'idle'
  | 'cast'
  | 'circle'
  | 'dive'
  | 'retreat'
  | 'patrol'
  | 'alert'
  | 'charge'
  | 'smash'
  | 'search'
  | 'dead';

export const BRUTE_VIEW = { range: 7.5, halfAngle: (52 * Math.PI) / 180 };

const tmp = new THREE.Vector3();

export class Enemy {
  readonly kind: EnemyKind;
  readonly spec: EnemySpec;
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  readonly knock = new THREE.Vector3();
  facing = 0;
  hp: number;
  state: EnemyState = 'idle';
  stateT = 0;
  flashT = 0;
  deadT = 0;
  /** optional area the enemy is not allowed to leave */
  leash: Box | null = null;
  /** brute patrol route */
  route: THREE.Vector3[] = [];
  routeIdx = 0;
  readonly lastSeen = new THREE.Vector3();
  /** brute: direction it was facing when it stopped to look around */
  private lookBase = 0;
  private lookPhase = Math.random() * Math.PI * 2;
  lostT = 0;
  /** caster: time until next shot */
  castTimer = 2 + Math.random() * 2;
  /** bat: orbit angle */
  orbit = Math.random() * Math.PI * 2;
  /** flying height (bats) */
  y = 0;
  /** >0 while frozen solid by a frost arrow: no AI, harmless, shatters on any hit */
  frozenT = 0;
  moveAmount = 0;
  /** brute vision cone visual */
  cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | null = null;
  readonly alertMark: THREE.Mesh | null = null;

  constructor(kind: EnemyKind) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.hp = this.spec.hp;
    this.rig = makeEnemyRig(kind);
    if (kind === 'bat') {
      this.state = 'circle';
      this.stateT = 2 + Math.random() * 1.5;
      this.y = 2.2;
    }
    if (kind === 'brute') {
      this.state = 'patrol';
      const geo = new THREE.CircleGeometry(BRUTE_VIEW.range, 24, -Math.PI / 2 - BRUTE_VIEW.halfAngle, BRUTE_VIEW.halfAngle * 2);
      this.cone = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, depthWrite: false }),
      );
      this.cone.rotation.x = -Math.PI / 2;
      this.cone.position.y = 0.04;
      this.cone.renderOrder = -1;
      this.rig.root.add(this.cone);
      const mark = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.5, 4),
        new THREE.MeshBasicMaterial({ color: 0xff5a6a }),
      );
      mark.rotation.x = Math.PI;
      mark.position.y = 3.3;
      mark.visible = false;
      this.rig.root.add(mark);
      (this as { alertMark: THREE.Mesh | null }).alertMark = mark;
    }
    if (kind === 'skeleton' || kind === 'captain') {
      this.state = 'spawn';
      this.stateT = 0.8;
    }
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** can be damaged right now */
  get targetable(): boolean {
    return this.alive && this.state !== 'spawn';
  }

  setState(s: EnemyState, t = 0): void {
    this.state = s;
    this.stateT = t;
  }

  /** Returns true when this hit killed the enemy. */
  damage(n: number, from: THREE.Vector3, knock = 5): boolean {
    if (!this.targetable) return false;
    // frozen enemies shatter on the next hit
    this.hp -= this.frozenT > 0 ? Math.max(n, this.hp) : n;
    this.frozenT = 0;
    this.flashT = 0.15;
    if (this.kind !== 'brute' && this.kind !== 'caster' && this.kind !== 'warlock') {
      tmp.subVectors(this.pos, from).setY(0).normalize();
      const k = this.kind === 'captain' ? knock * 0.4 : knock;
      this.knock.addScaledVector(tmp, k);
    }
    if (this.hp <= 0) {
      this.setState('dead');
      this.deadT = 0;
      if (this.cone) this.cone.visible = false;
      if (this.alertMark) this.alertMark.visible = false;
      return true;
    }
    // only heavy hits (fire spin) interrupt melee wind-ups, so auto-swings alone can't stun-lock
    if (this.state === 'windup' && this.kind === 'skeleton' && knock >= 8) this.setState('stun', 0.3);
    if (this.kind === 'bat') this.setState('retreat', 0.6);
    return false;
  }

  freeze(seconds: number): void {
    if (!this.targetable) return;
    this.frozenT = Math.max(this.frozenT, seconds);
    this.knock.set(0, 0, 0);
    if (this.kind === 'bat') this.setState('retreat', 0.5);
  }

  update(dt: number, w: EnemyWorld): void {
    this.flashT = Math.max(0, this.flashT - dt);
    const hero = w.hero;

    if (this.state === 'dead') {
      this.deadT += dt;
      this.syncVisual(dt);
      return;
    }
    if (this.frozenT > 0) {
      // frozen: bats drop out of the air, everything stops moving
      this.frozenT -= dt;
      if (this.kind === 'bat') this.y += (0.55 - this.y) * Math.min(1, dt * 8);
      this.moveAmount = 0;
      this.syncVisual(0);
      this.rig.flash(0.55, 0x8ae6ff);
      return;
    }
    this.stateT -= dt;

    tmp.subVectors(hero.pos, this.pos).setY(0);
    const dist = tmp.length();
    const heroAngle = yawTo(tmp.x, tmp.z);
    let moveSpeed = 0;
    let moveDir = this.facing;
    const heroAvailable = !hero.dead && !hero.falling;

    switch (this.kind) {
      case 'skeleton':
      case 'captain':
        ({ moveSpeed, moveDir } = this.meleeAI(dt, w, dist, heroAngle, heroAvailable));
        break;
      case 'caster':
      case 'warlock':
        this.facing = approachAngle(this.facing, heroAngle, dt * 4);
        if (this.state === 'cast') {
          if (this.stateT <= 0) {
            const warlock = this.kind === 'warlock';
            if (heroAvailable) w.fireOrb(this.pos, hero.pos, warlock ? 0.32 : 0);
            this.setState('idle');
            this.castTimer = warlock ? 3.2 + Math.random() : 2.8 + Math.random() * 1.8;
          }
        } else if (heroAvailable) {
          this.castTimer -= dt;
          if (this.castTimer <= 0) this.setState('cast', this.kind === 'warlock' ? 0.9 : 0.6);
          // slow strafe while idle
          moveSpeed = this.spec.speed * 0.5;
          moveDir = this.facing + Math.PI / 2 * Math.sign(Math.sin(performance.now() * 0.0004 + this.orbit));
        }
        break;
      case 'bat':
        ({ moveSpeed, moveDir } = this.batAI(dt, w, dist, heroAvailable));
        break;
      case 'brute':
        ({ moveSpeed, moveDir } = this.bruteAI(dt, w, dist, heroAngle, heroAvailable));
        break;
    }

    // integrate movement + knockback
    if (moveSpeed > 0) {
      this.pos.x += Math.sin(moveDir) * moveSpeed * dt;
      this.pos.z += Math.cos(moveDir) * moveSpeed * dt;
    }
    this.moveAmount = Math.min(moveSpeed / Math.max(this.spec.speed, 0.01), 1.4);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    if (this.kind !== 'bat') resolveCircle(this.pos, this.spec.radius, w.obstacles);
    if (this.leash) {
      const l = this.leash;
      this.pos.x = Math.min(Math.max(this.pos.x, l.minX), l.maxX);
      this.pos.z = Math.min(Math.max(this.pos.z, l.minZ), l.maxZ);
    }
    this.syncVisual(dt);
  }

  private meleeAI(dt: number, w: EnemyWorld, dist: number, heroAngle: number, heroAvailable: boolean) {
    let moveSpeed = 0;
    let moveDir = this.facing;
    const spec = this.spec;
    switch (this.state) {
      case 'spawn':
        if (this.stateT <= 0) this.setState('chase');
        break;
      case 'chase':
        if (!heroAvailable) {
          this.setState('idle', 1);
          break;
        }
        this.facing = approachAngle(this.facing, heroAngle, dt * 6);
        if (dist < spec.reach) {
          this.setState('windup', this.kind === 'captain' ? 0.7 : 0.5);
        } else {
          moveSpeed = spec.speed;
          moveDir = this.facing;
        }
        break;
      case 'windup':
        this.facing = approachAngle(this.facing, heroAngle, dt * 2);
        if (this.stateT <= 0) {
          const inFront = Math.abs(angleDiff(this.facing, heroAngle)) < 1.1;
          if (heroAvailable && dist < spec.reach + 0.45 && inFront) {
            w.hurtHero(spec.damage, this.pos, { knock: this.kind === 'captain' ? 9 : 6 });
          }
          this.setState('recover', 0.6);
        }
        break;
      case 'recover':
      case 'stun':
        if (this.stateT <= 0) this.setState('chase');
        break;
      case 'idle':
        if (heroAvailable && this.stateT <= 0) this.setState('chase');
        break;
    }
    return { moveSpeed, moveDir };
  }

  private batAI(dt: number, w: EnemyWorld, dist: number, heroAvailable: boolean) {
    const hero = w.hero;
    let moveSpeed = 0;
    let moveDir = this.facing;
    switch (this.state) {
      case 'circle': {
        // orbit around the hero, high up
        this.orbit += dt * 0.75;
        const tx = hero.pos.x + Math.cos(this.orbit) * 4.2;
        const tz = hero.pos.z + Math.sin(this.orbit) * 4.2;
        const dx = tx - this.pos.x;
        const dz = tz - this.pos.z;
        moveDir = yawTo(dx, dz);
        moveSpeed = Math.min(Math.hypot(dx, dz) * 2, 4.2);
        this.facing = approachAngle(this.facing, yawTo(hero.pos.x - this.pos.x, hero.pos.z - this.pos.z), dt * 5);
        this.y += (2.2 - this.y) * dt * 3;
        if (this.stateT <= 0 && heroAvailable) {
          this.setState('dive', 1.9);
          this.lastSeen.copy(hero.pos);
        }
        break;
      }
      case 'dive': {
        // swoop at where the hero was (+ a little tracking)
        this.lastSeen.lerp(hero.pos, dt * 0.8);
        const dx = this.lastSeen.x - this.pos.x;
        const dz = this.lastSeen.z - this.pos.z;
        moveDir = yawTo(dx, dz);
        this.facing = moveDir;
        moveSpeed = 5.2;
        this.y += (0.9 - this.y) * dt * 3.5;
        if (heroAvailable && dist < this.spec.reach + hero.radius) {
          w.hurtHero(this.spec.damage, this.pos, { stagger: 0.55, knock: 7 });
          this.setState('retreat', 0.9);
        } else if (this.stateT <= 0 || Math.hypot(dx, dz) < 0.3) {
          this.setState('retreat', 0.7);
        }
        break;
      }
      case 'retreat':
        moveDir = this.facing + Math.PI;
        moveSpeed = 3;
        this.y += (2.4 - this.y) * dt * 3;
        if (this.stateT <= 0) this.setState('circle', 2.4 + Math.random() * 1.8);
        break;
    }
    return { moveSpeed, moveDir };
  }

  private bruteAI(dt: number, w: EnemyWorld, dist: number, heroAngle: number, heroAvailable: boolean) {
    const hero = w.hero;
    let moveSpeed = 0;
    let moveDir = this.facing;
    const sees = heroAvailable && !hero.invisible && this.canSee(w, dist, heroAngle);

    switch (this.state) {
      case 'patrol': {
        const target = this.route[this.routeIdx];
        if (target) {
          const dx = target.x - this.pos.x;
          const dz = target.z - this.pos.z;
          if (Math.hypot(dx, dz) < 0.3) {
            this.routeIdx = (this.routeIdx + 1) % this.route.length;
            this.lookAround(0.6 + Math.random() * 1.4); // unpredictable pause at each waypoint
          } else if (Math.random() < dt * 0.14) {
            // now and then (about every 7 s) turn back mid-route, so patrols can't be timed
            this.routeIdx = (this.routeIdx - 1 + this.route.length) % this.route.length;
            this.lookAround(0.35 + Math.random() * 0.5);
          } else {
            this.facing = approachAngle(this.facing, yawTo(dx, dz), dt * 3);
            moveSpeed = this.spec.speed;
          }
        }
        if (sees) this.alert(w);
        break;
      }
      case 'idle':
        // sweep the vision cone left and right while standing
        this.lookPhase += dt * 3.2;
        this.facing = approachAngle(this.facing, this.lookBase + Math.sin(this.lookPhase) * 0.9, dt * 4);
        if (sees) this.alert(w);
        else if (this.stateT <= 0) this.setState('patrol');
        break;
      case 'alert':
        this.facing = approachAngle(this.facing, heroAngle, dt * 8);
        if (this.stateT <= 0) this.setState('charge');
        break;
      case 'charge':
        if (sees) {
          this.lastSeen.copy(hero.pos);
          this.lostT = 0;
        } else {
          this.lostT += dt;
        }
        {
          const dx = this.lastSeen.x - this.pos.x;
          const dz = this.lastSeen.z - this.pos.z;
          this.facing = approachAngle(this.facing, yawTo(dx, dz), dt * 7);
          moveSpeed = 8;
          if (heroAvailable && !hero.invisible && dist < this.spec.reach) {
            this.setState('smash', 0.28);
          } else if (Math.hypot(dx, dz) < 0.5 || this.lostT > 1.6) {
            this.setState('search', 1.8);
          }
        }
        break;
      case 'smash':
        this.facing = approachAngle(this.facing, heroAngle, dt * 6);
        if (this.stateT <= 0) {
          if (heroAvailable && !hero.invisible && dist < this.spec.reach + 0.6) {
            w.hurtHero(this.spec.damage, this.pos, { kill: true, knock: 10 });
          }
          this.setState('search', 1.2);
        }
        break;
      case 'search':
        this.facing += dt * 1.8; // look around
        if (sees) this.alert(w);
        else if (this.stateT <= 0) this.setState('patrol');
        break;
    }

    // cone colour communicates the brute's state
    if (this.cone) {
      const hot = this.state === 'alert' || this.state === 'charge' || this.state === 'smash';
      this.cone.material.color.set(hot ? 0xff5a6a : this.state === 'search' ? 0xffa640 : 0xffd34d);
      this.cone.material.opacity = hot ? 0.34 : 0.24;
    }
    if (this.alertMark) {
      this.alertMark.visible = this.state === 'alert' || this.state === 'charge' || this.state === 'smash';
      this.alertMark.position.y = 3.3 + Math.sin(performance.now() * 0.015) * 0.1;
    }
    return { moveSpeed, moveDir };
  }

  private lookAround(seconds: number): void {
    this.lookBase = this.facing;
    this.lookPhase = 0;
    this.setState('idle', seconds);
  }

  canSee(w: EnemyWorld, dist: number, heroAngle: number): boolean {
    if (dist > BRUTE_VIEW.range) return false;
    if (Math.abs(angleDiff(this.facing, heroAngle)) > BRUTE_VIEW.halfAngle) return false;
    return lineOfSight(this.pos.x, this.pos.z, w.hero.pos.x, w.hero.pos.z, w.sightBlockers);
  }

  alert(w: EnemyWorld): void {
    if (this.state === 'alert' || this.state === 'charge' || this.state === 'smash') return;
    this.lastSeen.copy(w.hero.pos);
    this.lostT = 0;
    this.setState('alert', 0.45);
    w.onAlert(this);
  }

  /** Rogue backstab test: is `p` behind this enemy, within reach? */
  isBehind(p: THREE.Vector3): boolean {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const a = yawTo(dx, dz);
    return Math.abs(angleDiff(this.facing, a)) > Math.PI * 0.55;
  }

  private syncVisual(dt: number): void {
    const r = this.rig;
    r.root.position.set(this.pos.x, this.kind === 'bat' ? this.y : 0, this.pos.z);
    r.root.rotation.y = this.facing;
    let action: RigAction = 'none';
    let t = 0;
    if (this.state === 'windup' || this.state === 'smash' || this.state === 'alert') {
      action = 'windup';
    } else if (this.state === 'cast') {
      action = 'windup';
      t = 1 - Math.max(this.stateT, 0) / (this.kind === 'warlock' ? 0.9 : 0.6);
    } else if (this.state === 'recover' && this.stateT > 0.4) {
      action = 'swing';
      t = (0.6 - this.stateT) / 0.2;
    }
    const spawnK = this.state === 'spawn' ? Math.max(this.stateT, 0) / 0.8 : 0;
    r.update(dt, {
      speed: this.moveAmount,
      action,
      t,
      dead: this.state === 'dead' ? Math.min(this.deadT * 2.2, 1) : 0,
    });
    // rising out of the ground when spawning
    if (spawnK > 0) r.body.position.y -= spawnK * 1.6;
    const telegraph = this.state === 'windup' || this.state === 'smash' ? 0.35 + 0.35 * Math.sin(performance.now() * 0.03) : 0;
    r.flash(this.flashT > 0 ? 1 : telegraph, this.flashT > 0 ? 0xffffff : 0xff3040);
  }
}
