import * as THREE from 'three';
import { makeHeroRig } from './models';
import type { Rig, RigAction } from './rigs';

export interface HeroSpec {
  maxHp: number;
  speed: number;
  /** auto-attack cooldown, s */
  attackCd: number;
  /** fire spin cooldown, s */
  specialCd: number;
}

export const WARRIOR: HeroSpec = { maxHp: 6, speed: 5.2, attackCd: 0.5, specialCd: 4.5 };

export const SPIN_TIME = 0.85;

/** The warrior: state + timers. Movement and combat are handled by the stage. */
export class Hero {
  readonly spec = WARRIOR;
  readonly rig: Rig = makeHeroRig();
  readonly pos = new THREE.Vector3();
  facing = Math.PI; // facing -Z ("up" the screen)
  readonly radius = 0.42;
  hp = WARRIOR.maxHp;

  attackCd = 0;
  specialCd = 0;
  /** >0 while the action animation plays */
  actionT = 0;
  actionDur = 0.3;
  action: RigAction = 'none';
  /** >0 while the fire spin is active */
  spinT = 0;
  private spinAngle = 0;
  invulnT = 0;
  staggerT = 0;
  flashT = 0;
  readonly knock = new THREE.Vector3();
  dead = false;
  deadT = 0;
  moveAmount = 0;

  get canAct(): boolean {
    return !this.dead && this.staggerT <= 0;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  startAction(a: RigAction, dur: number): void {
    this.action = a;
    this.actionDur = dur;
    this.actionT = dur;
  }

  /** Per-frame timers. */
  tick(dt: number): void {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    if (this.actionT > 0) {
      this.actionT -= dt;
      if (this.actionT <= 0) this.action = 'none';
    }
    if (this.dead) this.deadT += dt;
  }

  syncVisual(dt: number): void {
    const r = this.rig;
    r.root.position.copy(this.pos);
    // procedural rigs spin the whole body; GLB rigs play their own spin clip
    if (this.spinT > 0 && !r.animatedSpin) this.spinAngle += dt * 22;
    else this.spinAngle = 0;
    r.root.rotation.y = this.facing + this.spinAngle;
    const t = this.action === 'none' ? 0 : 1 - this.actionT / this.actionDur;
    r.update(dt, {
      speed: this.dead ? 0 : this.moveAmount,
      action: this.spinT > 0 ? (r.animatedSpin ? 'spin' : 'swing') : this.action,
      t: this.spinT > 0 ? 1 - this.spinT / SPIN_TIME : t,
      dead: this.dead ? Math.min(this.deadT * 2, 1) : 0,
    });
    // hurt flash, plus blinking while invulnerable after a hit
    const blink = this.invulnT > 0 && this.flashT <= 0 ? (Math.sin(performance.now() * 0.04) > 0 ? 0.35 : 0) : 0;
    r.flash(Math.max(this.flashT * 4, blink), this.flashT > 0 ? 0xff4060 : 0xffffff);
  }

  /** Place the hero at the start position. */
  spawn(at: THREE.Vector3, facing = Math.PI): void {
    this.pos.copy(at);
    this.facing = facing;
    this.invulnT = 0;
  }
}
