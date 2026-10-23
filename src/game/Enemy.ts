import * as THREE from 'three';
import type { Hero } from './Hero';
import { angleDiff, approachAngle, resolveCircle, yawTo, type Box } from './physics';
import { makeEnemyRig } from './models';
import type { EnemyKind, Rig, RigAction } from './rigs';

/** What enemy AI needs from the stage. */
export interface EnemyWorld {
  hero: Hero;
  obstacles: readonly Box[];
  hurtHero(dmg: number, from: THREE.Vector3, opts?: { stagger?: number; knock?: number }): void;
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
};

export type EnemyState = 'spawn' | 'chase' | 'windup' | 'recover' | 'stun' | 'idle' | 'dead';

const tmp = new THREE.Vector3();

/** Melee skeletons: rise from the ground, chase, telegraph (red flash), strike. */
export class Enemy {
  readonly kind: EnemyKind;
  readonly spec: EnemySpec;
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  readonly knock = new THREE.Vector3();
  facing = 0;
  hp: number;
  state: EnemyState = 'spawn';
  stateT = 0.8;
  flashT = 0;
  deadT = 0;
  moveAmount = 0;

  constructor(kind: EnemyKind) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.hp = this.spec.hp;
    this.rig = makeEnemyRig(kind);
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
    this.hp -= n;
    this.flashT = 0.15;
    tmp.subVectors(this.pos, from).setY(0).normalize();
    this.knock.addScaledVector(tmp, this.kind === 'captain' ? knock * 0.4 : knock);
    if (this.hp <= 0) {
      this.setState('dead');
      this.deadT = 0;
      return true;
    }
    // only heavy hits (fire spin) interrupt melee wind-ups, so auto-swings alone can't stun-lock
    if (this.state === 'windup' && this.kind === 'skeleton' && knock >= 8) this.setState('stun', 0.3);
    return false;
  }

  update(dt: number, w: EnemyWorld): void {
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.state === 'dead') {
      this.deadT += dt;
      this.syncVisual(dt);
      return;
    }
    this.stateT -= dt;

    const hero = w.hero;
    tmp.subVectors(hero.pos, this.pos).setY(0);
    const dist = tmp.length();
    const heroAngle = yawTo(tmp.x, tmp.z);
    const { moveSpeed, moveDir } = this.meleeAI(dt, w, dist, heroAngle, !hero.dead);

    // integrate movement + knockback
    if (moveSpeed > 0) {
      this.pos.x += Math.sin(moveDir) * moveSpeed * dt;
      this.pos.z += Math.cos(moveDir) * moveSpeed * dt;
    }
    this.moveAmount = Math.min(moveSpeed / Math.max(this.spec.speed, 0.01), 1.4);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    resolveCircle(this.pos, this.spec.radius, w.obstacles);
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

  private syncVisual(dt: number): void {
    const r = this.rig;
    r.root.position.set(this.pos.x, 0, this.pos.z);
    r.root.rotation.y = this.facing;
    let action: RigAction = 'none';
    let t = 0;
    if (this.state === 'windup') {
      action = 'windup';
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
    const telegraph = this.state === 'windup' ? 0.35 + 0.35 * Math.sin(performance.now() * 0.03) : 0;
    r.flash(this.flashT > 0 ? 1 : telegraph, this.flashT > 0 ? 0xffffff : 0xff3040);
  }
}
