import * as THREE from 'three';
import type { Audio } from '../core/Audio';
import { Scheduler } from '../core/Clock';
import type { Input } from '../core/Input';
import { Enemy, type EnemyWorld } from '../game/Enemy';
import { Coins, Fx } from '../game/fx';
import { Hero, SPIN_TIME } from '../game/Hero';
import { disposeTree } from '../game/materials';
import { angleDiff, resolveCircle, yawTo, type Box } from '../game/physics';
import type { EnemyKind } from '../game/rigs';
import { flickerTorches } from './env';

/** What a stage needs from the game shell. */
export interface StageHost {
  audio: Audio;
  input: Input;
  addCoins(n: number): void;
  stageCleared(): void;
  /** the hero was knocked out: the run is over */
  stageFailed(summary: string): void;
  banner(text: string, sub?: string): void;
  floatText(at: THREE.Vector3, text: string, kind?: 'good' | 'bad' | 'info'): void;
  /** animated hand hint with a label; null hides it */
  hint(text: string | null): void;
}

/** Per-stage lighting mood, applied by the game shell when the stage loads. */
export interface Atmosphere {
  bg: number;
  fogNear: number;
  fogFar: number;
  sky: number;
  ground: number;
  hemi: number;
  sun: number;
  sunI: number;
}

export const DEFAULT_ATMOSPHERE: Atmosphere = {
  bg: 0x201338,
  fogNear: 26,
  fogFar: 60,
  sky: 0xffffff,
  ground: 0x4a3a80,
  hemi: 1.6,
  sun: 0xfff4e8,
  sunI: 1.7,
};

/** warrior swing reach (plus the enemy's radius) */
const SWING_REACH = 1.8;
/** fire spin radius: auto-cast when this many skeletons crowd in */
const SPIN_REACH = 2.6;
const SPIN_CROWD = 3;

const tmpV = new THREE.Vector3();

/**
 * Shared gameplay: hero movement, auto-attack and auto Fire Spin, enemies,
 * coins and the knock-out. Subclasses provide the layout (build), the
 * objective text and their specific rules (tick + hooks).
 */
export abstract class BaseStage implements EnemyWorld {
  readonly root = new THREE.Group();
  readonly hero = new Hero();
  readonly sched = new Scheduler();
  /** block movement */
  obstacles: Box[] = [];
  enemies: Enemy[] = [];
  torches: THREE.Object3D[] = [];
  readonly fx = new Fx();
  readonly coins = new Coins();
  readonly spawnPoint = new THREE.Vector3(0, 0, 0);
  spawnFacing = Math.PI;
  /** desired visible ground width, in world units */
  viewWidth = 10;
  /** how far ahead (-Z, up the screen) the camera looks past the hero */
  camLead = 1.6;
  atmosphere: Atmosphere = DEFAULT_ATMOSPHERE;
  time = 0;
  done = false;
  private spinHitT = 0;
  private spinRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  /** faint circle under the hero: anything inside it gets hit automatically */
  private reachRing: THREE.Mesh | null = null;
  private autoTipShown = false;
  private handledDead = new Set<Enemy>();

  constructor(protected host: StageHost) {}

  abstract build(): void;
  abstract objective(): string;
  /** one line for the fail card (e.g. how far the player got) */
  failSummary(): string {
    return '';
  }
  /** stage-specific per-frame logic */
  protected tick(_dt: number): void {}

  init(): void {
    this.build();
    this.root.add(this.fx.group, this.coins.group, this.hero.rig.root);
    this.hero.spawn(this.spawnPoint, this.spawnFacing);
    this.hero.syncVisual(0);
    this.reachRing = new THREE.Mesh(
      new THREE.RingGeometry(SWING_REACH + 0.25, SWING_REACH + 0.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.renderOrder = -1;
    this.root.add(this.reachRing);
  }

  addEnemy(kind: EnemyKind, x: number, z: number, facing = 0): Enemy {
    const e = new Enemy(kind);
    e.pos.set(x, 0, z);
    e.facing = facing;
    this.enemies.push(e);
    this.root.add(e.rig.root);
    e.update(0, this);
    return e;
  }

  get aliveEnemies(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  // ------------------------------------------------------------ main update

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.sched.update(dt);
    this.updateHero(dt);
    for (const e of this.enemies) e.update(dt, this);
    this.separate();
    this.collectDead();
    this.fx.update(dt);
    const got = this.coins.update(dt, this.hero.pos);
    if (got > 0) {
      this.host.addCoins(got);
      this.host.audio.play('coin');
    }
    flickerTorches(this.torches, this.time);
    if (!this.done) this.tick(dt);
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    const input = this.host.input;
    h.tick(dt);
    if (this.reachRing) {
      this.reachRing.position.set(h.pos.x, 0.05, h.pos.z);
      this.reachRing.visible = !h.dead && !this.done;
    }

    if (h.dead) {
      // knocked out = run over: let the fall animation play, then hand over to the fail card
      if (h.deadT > 1.2 && !this.done) {
        this.done = true;
        this.host.stageFailed(this.failSummary());
      }
      h.moveAmount = 0;
      h.syncVisual(dt);
      return;
    }
    if (this.done) {
      h.moveAmount = 0;
      h.syncVisual(dt);
      return;
    }

    // movement: screen up = world -Z
    const mx = input.move.x;
    const mz = input.move.y;
    const mlen = Math.min(Math.hypot(mx, mz), 1);
    if (h.staggerT <= 0) {
      const slow = h.spinT > 0 ? 0.8 : h.actionT > 0 && h.action === 'swing' ? 0.55 : 1;
      if (mlen > 0.01) {
        h.pos.x += (mx / mlen) * mlen * h.spec.speed * slow * dt;
        h.pos.z += (mz / mlen) * mlen * h.spec.speed * slow * dt;
        const d = angleDiff(h.facing, yawTo(mx, mz));
        h.facing += d * Math.min(1, dt * 16);
      }
      h.moveAmount = mlen * slow;
    } else {
      h.moveAmount = 0;
    }
    h.pos.addScaledVector(h.knock, dt);
    h.knock.multiplyScalar(Math.max(0, 1 - dt * 10));
    resolveCircle(h.pos, h.radius, this.obstacles);

    // one-touch controls: the player only moves; attacks and the special fire on their own
    const near = this.enemiesWithin(SWING_REACH);
    const crowd = this.enemiesWithin(SPIN_REACH);
    if (near > 0 && !this.autoTipShown) {
      this.autoTipShown = true;
      this.host.floatText(h.pos, 'Auto attack!', 'good');
    }
    if (near > 0 && h.canAct && h.attackCd <= 0 && h.spinT <= 0) this.heroAttack();
    // the spin also works while staggered: it's the escape when surrounded
    if (h.specialCd <= 0 && (crowd >= SPIN_CROWD || (h.hp <= 2 && crowd > 0))) this.fireSpin();
    this.updateSpin(dt);
    h.syncVisual(dt);
  }

  // ------------------------------------------------------------ hero combat

  /** Targetable enemies within `reach` (+ their radius) of the hero. */
  private enemiesWithin(reach: number): number {
    const h = this.hero;
    let n = 0;
    for (const e of this.enemies) {
      if (e.targetable && Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) <= reach + e.spec.radius) n++;
    }
    return n;
  }

  /** Closest targetable enemy within `range`; null if none. */
  private nearestEnemy(range: number): Enemy | null {
    const h = this.hero;
    let best: Enemy | null = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const d = Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Auto-swing: turn to the closest skeleton and slash everything in front. */
  private heroAttack(): void {
    const h = this.hero;
    h.attackCd = h.spec.attackCd;
    const target = this.nearestEnemy(3.2);
    if (target) h.facing = yawTo(target.pos.x - h.pos.x, target.pos.z - h.pos.z);
    h.startAction('swing', 0.3);
    this.host.audio.play('swing');
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - h.pos.x;
      const dz = e.pos.z - h.pos.z;
      if (Math.hypot(dx, dz) > SWING_REACH + e.spec.radius) continue;
      if (Math.abs(angleDiff(h.facing, yawTo(dx, dz))) > 1.25) continue;
      this.hitEnemy(e, 1, h.pos, 4);
      hits++;
    }
    if (hits > 0) this.fx.shake = Math.max(this.fx.shake, 0.18);
  }

  private fireSpin(): void {
    const h = this.hero;
    h.specialCd = h.spec.specialCd;
    h.spinT = SPIN_TIME;
    h.invulnT = Math.max(h.invulnT, SPIN_TIME + 0.1);
    this.spinHitT = 0;
    this.host.audio.play('swing');
    this.host.audio.play('fireball');
    this.host.floatText(h.pos, 'FIRE SPIN!', 'good');
    this.fx.ring(h.pos, 0xf58324, 3.2, 0.5);
  }

  /** Fire spin: a flame ring that hits everything around the hero several times. */
  private updateSpin(dt: number): void {
    const h = this.hero;
    if (h.spinT <= 0) {
      if (this.spinRing) this.spinRing.visible = false;
      return;
    }
    if (!this.spinRing) {
      this.spinRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.16, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, depthWrite: false }),
      );
      this.spinRing.rotation.x = -Math.PI / 2;
      this.root.add(this.spinRing);
    }
    const k = h.spinT / SPIN_TIME;
    this.spinRing.visible = true;
    this.spinRing.position.set(h.pos.x, 0.7, h.pos.z);
    this.spinRing.scale.setScalar(0.6 + (1 - k) * 0.5);
    this.spinRing.material.opacity = Math.min(1, k * 1.6);
    this.spinRing.rotation.z += dt * 14;
    // flames trail around the ring
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 1.1;
      tmpV.set(h.pos.x + Math.sin(a) * r, 0, h.pos.z + Math.cos(a) * r);
      this.fx.burst(tmpV, Math.random() < 0.5 ? 0xf58324 : 0xffd27a, 1, 1, { up: 2.5, gravity: -1, life: 0.35, y: 0.4 + Math.random() * 0.6 });
    }
    this.spinHitT -= dt;
    if (this.spinHitT <= 0) {
      this.spinHitT = 0.18;
      let hits = 0;
      for (const e of this.enemies) {
        if (!e.targetable) continue;
        if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > SPIN_REACH + e.spec.radius) continue;
        this.hitEnemy(e, 1, h.pos, 9);
        hits++;
      }
      if (hits) this.fx.shake = Math.max(this.fx.shake, 0.22);
    }
  }

  private hitEnemy(e: Enemy, dmg: number, from: THREE.Vector3, knock: number): void {
    const killed = e.damage(dmg, from, knock);
    this.host.audio.play('hit');
    this.fx.burst(e.pos, 0xfff6e8, killed ? 14 : 6, killed ? 4 : 2.5);
  }

  // ------------------------------------------------------------ EnemyWorld

  hurtHero(dmg: number, from: THREE.Vector3, opts: { stagger?: number; knock?: number } = {}): void {
    const h = this.hero;
    if (h.dead || this.done) return;
    if (h.invulnT > 0) return;
    h.hp -= dmg;
    h.flashT = 0.25;
    h.invulnT = 0.9;
    h.staggerT = opts.stagger ?? 0.15;
    tmpV.subVectors(h.pos, from).setY(0).normalize();
    h.knock.addScaledVector(tmpV, opts.knock ?? 6);
    this.host.audio.play('hurt');
    this.fx.shake = Math.max(this.fx.shake, 0.3);
    this.fx.burst(h.pos, 0xff5a6a, 8, 3);
    if (h.hp <= 0) this.knockOut();
  }

  private knockOut(): void {
    const h = this.hero;
    h.hp = 0;
    h.dead = true;
    h.deadT = 0;
    this.host.audio.play('death');
    this.host.banner('Knocked out!');
  }

  // ------------------------------------------------------------ enemies

  /** Soft push so enemies don't stack on each other or on the hero. */
  private separate(): void {
    const list = this.enemies;
    const h = this.hero;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.spec.radius + b.spec.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
      if (!h.dead) {
        const dx = a.pos.x - h.pos.x;
        const dz = a.pos.z - h.pos.z;
        const min = a.spec.radius + h.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          a.pos.x += (dx / d) * (min - d);
          a.pos.z += (dz / d) * (min - d);
        }
      }
    }
  }

  private collectDead(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive) continue;
      if (!this.handledDead.has(e)) {
        this.handledDead.add(e);
        this.coins.spawn(e.pos, e.spec.coins, 5);
      }
      if (e.deadT > 1.1) {
        this.root.remove(e.rig.root);
        disposeTree(e.rig.root);
        this.enemies.splice(i, 1);
        this.handledDead.delete(e);
      }
    }
  }

  // ------------------------------------------------------------ completion

  protected finish(): void {
    this.done = true;
    const rest = this.coins.flush();
    if (rest > 0) this.host.addCoins(rest);
    this.fx.burst(this.hero.pos, 0xf58324, 24, 5, { up: 6 });
    this.host.audio.play('clear');
    this.host.stageCleared();
  }

  dispose(): void {
    this.sched.clear();
    this.coins.flush();
    this.fx.clear();
    this.root.removeFromParent();
    disposeTree(this.root);
    this.enemies.length = 0;
  }
}
