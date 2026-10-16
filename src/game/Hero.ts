import * as THREE from 'three';
import { makeHeroRig } from './models';
import type { HeroKind, Rig, RigAction } from './rigs';

export interface HeroSpec {
  kind: HeroKind;
  name: string;
  maxHp: number;
  speed: number;
  /** main attack cooldown, s */
  attackCd: number;
  /** wind-up before a ranged shot leaves (can be interrupted), s */
  windup: number;
  special: 'dash' | 'vanish' | 'firespin' | 'inferno' | 'frost';
  specialLabel: string;
  specialCd: number;
}

export const HERO_SPECS: Record<HeroKind, HeroSpec> = {
  warrior: { kind: 'warrior', name: 'Warrior', maxHp: 6, speed: 5.2, attackCd: 0.36, windup: 0, special: 'firespin', specialLabel: 'Fire Spin', specialCd: 4.5 },
  mage: { kind: 'mage', name: 'Fire Mage', maxHp: 5, speed: 4.8, attackCd: 0.5, windup: 0.2, special: 'inferno', specialLabel: 'Inferno', specialCd: 5 },
  archer: { kind: 'archer', name: 'Archer', maxHp: 6, speed: 5.0, attackCd: 0.4, windup: 0.22, special: 'frost', specialLabel: 'Frost Volley', specialCd: 4.5 },
  rogue: { kind: 'rogue', name: 'Rogue', maxHp: 1, speed: 5.4, attackCd: 0.35, windup: 0, special: 'vanish', specialLabel: 'Vanish', specialCd: 7 },
};

export const VANISH_TIME = 3.5;
export const SPIN_TIME = 0.85;
export const INFERNO_WINDUP = 0.45;
const DASH_TIME = 0.18;
const DASH_SPEED = 17;

export class Hero {
  readonly spec: HeroSpec;
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  facing = Math.PI; // facing -Z ("up" the screen)
  readonly radius = 0.42;
  hp: number;

  attackCd = 0;
  specialCd = 0;
  /** >0 while the action animation plays */
  actionT = 0;
  actionDur = 0.3;
  action: RigAction = 'none';
  /** >0 while a ranged shot is being drawn; fires when it reaches 0 */
  windupT = 0;
  windupDur = 0.2;
  /** what leaves the hand when the wind-up completes */
  pendingShot: 'fireball' | 'inferno' | 'arrow' = 'fireball';
  /** >0 while the warrior's fire spin is active */
  spinT = 0;
  private spinAngle = 0;
  dashT = 0;
  readonly dashDir = new THREE.Vector3();
  invulnT = 0;
  staggerT = 0;
  invisT = 0;
  flashT = 0;
  readonly knock = new THREE.Vector3();
  dead = false;
  deadT = 0;
  falling = false;
  moveAmount = 0;

  constructor(kind: HeroKind) {
    this.spec = HERO_SPECS[kind];
    this.hp = this.spec.maxHp;
    this.rig = makeHeroRig(kind);
  }

  get invisible(): boolean {
    return this.invisT > 0;
  }

  get dashing(): boolean {
    return this.dashT > 0;
  }

  get canAct(): boolean {
    return !this.dead && !this.falling && this.staggerT <= 0;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  startAction(a: RigAction, dur: number): void {
    this.action = a;
    this.actionDur = dur;
    this.actionT = dur;
  }

  startDash(dir: THREE.Vector3): void {
    this.dashDir.copy(dir).normalize();
    this.dashT = DASH_TIME;
    this.invulnT = Math.max(this.invulnT, DASH_TIME + 0.05);
    this.windupT = 0;
  }

  /** Per-frame timers + visual sync. Movement is handled by the stage. */
  tick(dt: number): void {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.invisT = Math.max(0, this.invisT - dt);
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
      action: this.poseAction(),
      t: this.spinT > 0
        ? 1 - this.spinT / SPIN_TIME
        : this.dashT > 0
          ? 1 - this.dashT / DASH_TIME
          : this.windupT > 0
            ? 1 - this.windupT / Math.max(this.windupDur, 0.01)
            : t,
      dead: this.dead ? Math.min(this.deadT * 2, 1) : 0,
    });
    // hurt flash, plus blinking while invulnerable after a hit
    const blink = this.invulnT > 0 && !this.dashing && this.flashT <= 0 ? (Math.sin(performance.now() * 0.04) > 0 ? 0.35 : 0) : 0;
    r.flash(Math.max(this.flashT * 4, blink), this.flashT > 0 ? 0xff4060 : 0xffffff);
    r.setOpacity(this.invisible ? 0.28 : 1);
  }

  private poseAction(): RigAction {
    if (this.spinT > 0) return this.rig.animatedSpin ? 'spin' : 'swing';
    if (this.dashT > 0) return 'roll';
    if (this.windupT > 0) return this.pendingShot === 'inferno' ? 'castBig' : this.pendingShot === 'arrow' ? 'shoot' : 'cast';
    return this.action;
  }

  respawn(at: THREE.Vector3, facing = Math.PI): void {
    this.pos.copy(at);
    this.facing = facing;
    this.hp = this.spec.maxHp;
    this.dead = false;
    this.deadT = 0;
    this.falling = false;
    this.invulnT = 1.5;
    this.staggerT = 0;
    this.windupT = 0;
    this.dashT = 0;
    this.spinT = 0;
    this.actionT = 0;
    this.action = 'none';
    this.knock.set(0, 0, 0);
  }

  static readonly DASH_SPEED = DASH_SPEED;
}
