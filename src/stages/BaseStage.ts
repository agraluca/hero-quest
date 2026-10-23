import * as THREE from 'three';
import type { Audio } from '../core/Audio';
import { Scheduler } from '../core/Clock';
import type { Input } from '../core/Input';
import { Enemy, type EnemyWorld } from '../game/Enemy';
import { Coins, Fx } from '../game/fx';
import { Hero, INFERNO_WINDUP, SPIN_TIME, VANISH_TIME } from '../game/Hero';
import { disposeTree } from '../game/materials';
import { angleDiff, inBox, resolveCircle, yawTo, type Box } from '../game/physics';
import { Projectiles, type Projectile } from '../game/Projectiles';
import type { EnemyKind, HeroKind } from '../game/rigs';
import { flickerTorches, Portal } from './env';

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

/** Something the hero can shoot that is not an enemy (levers, ...). */
export interface Target {
  pos: THREE.Vector3;
  radius: number;
  active: boolean;
  onHit(p: Projectile): void;
}

const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();

/**
 * Shared gameplay for every stage: hero control, auto-aim, combat, enemies,
 * projectiles, coins, pits, respawn and the exit portal. Subclasses provide
 * the layout (build), the objective text and their specific rules (tick + hooks).
 */
export abstract class BaseStage implements EnemyWorld {
  readonly root = new THREE.Group();
  readonly hero: Hero;
  readonly sched = new Scheduler();
  /** block movement */
  obstacles: Box[] = [];
  /** block projectiles (defaults to `obstacles`) */
  projectileWalls: Box[] | null = null;
  /** block brute vision */
  sightBlockers: Box[] = [];
  /** fall-through areas, and bridges that cancel them while active */
  pits: Box[] = [];
  bridges: { box: Box; active: boolean }[] = [];
  enemies: Enemy[] = [];
  targets: Target[] = [];
  torches: THREE.Object3D[] = [];
  readonly projectiles = new Projectiles();
  readonly fx = new Fx();
  readonly coins = new Coins();
  readonly spawnPoint = new THREE.Vector3(0, 0, 0);
  spawnFacing = Math.PI;
  exit: Portal | null = null;
  /** desired visible ground width, in world units */
  viewWidth = 10;
  /** how far ahead (-Z, up the screen) the camera looks past the hero */
  camLead = 1.6;
  atmosphere: Atmosphere = DEFAULT_ATMOSPHERE;
  time = 0;
  done = false;
  private fallV = 0;
  private spinHitT = 0;
  private spinRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  private handledDead = new Set<Enemy>();

  constructor(
    protected host: StageHost,
    heroKind: HeroKind,
  ) {
    this.hero = new Hero(heroKind);
  }

  abstract build(): void;
  abstract objective(): string;
  /** optional extra HUD markup under the objective (e.g. the rune order) */
  hudExtra(): string | null {
    return null;
  }
  /** one line for the fail card (e.g. how far the player got) */
  failSummary(): string {
    return '';
  }
  /** stage-specific per-frame logic */
  protected tick(_dt: number): void {}
  protected onEnemyKilled(_e: Enemy): void {}
  protected onHeroRespawn(): void {}
  /** return true to stop a hero projectile (shields, ...) */
  protected projectileBlocked(_p: Projectile): boolean {
    return false;
  }

  init(): void {
    this.build();
    this.root.add(this.projectiles.group, this.fx.group, this.coins.group, this.hero.rig.root);
    this.hero.respawn(this.spawnPoint, this.spawnFacing);
    this.hero.invulnT = 0;
    this.hero.syncVisual(0);
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
    this.updateProjectiles(dt);
    this.fx.update(dt);
    const got = this.coins.update(dt, this.hero.pos);
    if (got > 0) {
      this.host.addCoins(got);
      this.host.audio.play('coin');
    }
    this.exit?.update(dt);
    flickerTorches(this.torches, this.time);
    if (!this.done) {
      this.tick(dt);
      if (this.exit?.reached(this.hero.pos) && !this.hero.dead) this.finish();
    }
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    const input = this.host.input;
    h.tick(dt);
    const wantMain = input.takeMain() || input.mainHeld;
    const wantAlt = input.takeAlt();

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
    if (h.falling) {
      this.fallV += 22 * dt;
      h.pos.y -= this.fallV * dt;
      h.moveAmount = 0;
      if (h.pos.y < -7) this.endFall();
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
    if (h.dashing) {
      h.dashT -= dt;
      h.pos.addScaledVector(h.dashDir, Hero.DASH_SPEED * dt);
      if (Math.random() < 0.6) this.fx.burst(h.pos, h.spec.kind === 'mage' ? 0xc89bff : 0xfff6e8, 1, 0.5, { up: 0.5, gravity: 0, life: 0.3, y: 0.6 });
      h.moveAmount = 1;
    } else if (h.staggerT <= 0) {
      const slow = h.windupT > 0 ? 0.35 : h.spinT > 0 ? 0.8 : h.actionT > 0 && h.action === 'swing' ? 0.55 : 1;
      if (mlen > 0.01) {
        h.pos.x += (mx / mlen) * mlen * h.spec.speed * slow * dt;
        h.pos.z += (mz / mlen) * mlen * h.spec.speed * slow * dt;
        if (h.windupT <= 0) {
          const target = yawTo(mx, mz);
          const d = angleDiff(h.facing, target);
          h.facing += d * Math.min(1, dt * 16);
        }
      }
      h.moveAmount = mlen * slow;
    } else {
      h.moveAmount = 0;
    }
    h.pos.addScaledVector(h.knock, dt);
    h.knock.multiplyScalar(Math.max(0, 1 - dt * 10));
    resolveCircle(h.pos, h.radius, this.obstacles);
    if (!h.dashing && this.overPit(h.pos)) this.startFall();

    // actions
    if (h.windupT > 0) {
      h.windupT -= dt;
      if (h.windupT <= 0) this.releaseShot();
    } else if (wantMain && h.canAct && h.attackCd <= 0 && !h.dashing && h.spinT <= 0) {
      this.heroAttack();
    }
    // specials work even while staggered: they're the escape button when surrounded
    if (wantAlt && !h.dead && !h.falling && h.specialCd <= 0 && h.windupT <= 0) this.heroSpecial(mx, mz, mlen);
    this.updateSpin(dt);
    h.syncVisual(dt);
  }

  // ------------------------------------------------------------ hero combat

  /** Best target in a cone around the hero's facing; null if none. */
  protected autoAim(range: number, halfCone: number, withTargets: boolean): THREE.Vector3 | null {
    const h = this.hero;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    const consider = (p: THREE.Vector3) => {
      const dx = p.x - h.pos.x;
      const dz = p.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) return;
      const ad = Math.abs(angleDiff(h.facing, yawTo(dx, dz)));
      if (ad > halfCone) return;
      const score = ad + dist * 0.03;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    };
    for (const e of this.enemies) if (e.targetable) consider(e.pos);
    if (withTargets) for (const t of this.targets) if (t.active) consider(t.pos);
    return best;
  }

  private faceTowards(p: THREE.Vector3 | null): void {
    if (!p) return;
    this.hero.facing = yawTo(p.x - this.hero.pos.x, p.z - this.hero.pos.z);
  }

  private heroAttack(): void {
    const h = this.hero;
    const kind = h.spec.kind;
    h.attackCd = h.spec.attackCd;
    switch (kind) {
      case 'warrior': {
        this.faceTowards(this.autoAim(3.2, Math.PI * 0.75, false));
        h.startAction('swing', 0.3);
        this.host.audio.play('swing');
        let hits = 0;
        for (const e of this.enemies) {
          if (!e.targetable) continue;
          const dx = e.pos.x - h.pos.x;
          const dz = e.pos.z - h.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 2.1 + e.spec.radius) continue;
          if (Math.abs(angleDiff(h.facing, yawTo(dx, dz))) > 1.25) continue;
          this.hitEnemy(e, 1, h.pos, 8);
          hits++;
        }
        if (hits > 0) this.fx.shake = Math.max(this.fx.shake, 0.18);
        break;
      }
      case 'mage':
        this.faceTowards(this.autoAim(18, 0.6, false));
        h.windupT = h.windupDur = h.spec.windup;
        h.pendingShot = 'fireball';
        break;
      case 'archer':
        this.faceTowards(this.autoAim(20, 0.42, true));
        h.windupT = h.windupDur = h.spec.windup;
        h.pendingShot = 'arrow';
        break;
      case 'rogue': {
        this.faceTowards(this.autoAim(2.6, Math.PI * 0.6, false));
        h.startAction('stab', 0.25);
        this.host.audio.play('swing');
        const e = this.nearestEnemyInFront(1.9, 1.1);
        if (e) this.rogueStrike(e);
        break;
      }
    }
  }

  private releaseShot(): void {
    const h = this.hero;
    if (!h.canAct) return;
    const dir = h.forward(tmpF);
    switch (h.pendingShot) {
      case 'fireball':
        this.projectiles.spawn('fireball', h.pos, dir, true);
        this.host.audio.play('fireball');
        h.startAction('cast', 0.2);
        break;
      case 'inferno':
        this.projectiles.spawn('inferno', h.pos, dir, true);
        this.host.audio.play('fireball');
        this.host.audio.play('boom');
        this.fx.shake = Math.max(this.fx.shake, 0.25);
        h.startAction('cast', 0.3);
        break;
      case 'arrow':
        this.projectiles.spawn('arrow', h.pos, dir, true);
        this.host.audio.play('arrow');
        h.startAction('shoot', 0.15);
        break;
    }
  }

  /** Warrior fire spin: a flame ring that hits everything around the hero several times. */
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
        if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > 2.6 + e.spec.radius) continue;
        this.hitEnemy(e, 1, h.pos, 9);
        hits++;
      }
      if (hits) this.fx.shake = Math.max(this.fx.shake, 0.22);
    }
  }

  private heroSpecial(mx: number, mz: number, mlen: number): void {
    const h = this.hero;
    h.specialCd = h.spec.specialCd;
    if (h.spec.special === 'vanish') {
      h.invisT = VANISH_TIME;
      this.host.audio.play('vanish');
      this.fx.burst(h.pos, 0x9a6cff, 14, 3, { up: 2, gravity: 2, life: 0.6 });
      this.fx.ring(h.pos, 0x9a6cff, 2.5);
      // brutes lose track of the rogue
      for (const e of this.enemies) {
        if (e.kind === 'brute' && (e.state === 'charge' || e.state === 'alert')) e.setState('search', 1.6);
      }
      return;
    }
    if (h.spec.special === 'firespin') {
      h.spinT = SPIN_TIME;
      h.invulnT = Math.max(h.invulnT, SPIN_TIME + 0.1);
      this.spinHitT = 0;
      this.host.audio.play('swing');
      this.host.audio.play('fireball');
      this.fx.ring(h.pos, 0xf58324, 3.2, 0.5);
      return;
    }
    if (h.spec.special === 'frost') {
      // three frost arrows in a fan: they freeze what they hit (and can freeze shields)
      this.faceTowards(this.autoAim(20, 0.5, true));
      for (const a of [-0.2, 0, 0.2]) {
        this.projectiles.spawn('ice', h.pos, tmpF.set(Math.sin(h.facing + a), 0, Math.cos(h.facing + a)), true);
      }
      h.startAction('shoot', 0.2);
      this.host.audio.play('arrow');
      this.host.audio.play('vanish');
      this.fx.burst(h.pos, 0x8ae6ff, 10, 2.5, { y: 1, life: 0.4 });
      return;
    }
    if (h.spec.special === 'inferno') {
      this.faceTowards(this.autoAim(18, 0.8, false));
      h.windupT = h.windupDur = INFERNO_WINDUP;
      h.pendingShot = 'inferno';
      this.fx.ring(h.pos, 0xff5a1f, 1.6, 0.45);
      return;
    }
    const dir = mlen > 0.1 ? tmpV.set(mx, 0, mz) : h.forward(tmpV);
    h.facing = yawTo(dir.x, dir.z);
    h.startDash(dir);
    this.host.audio.play('dash');
  }

  private nearestEnemyInFront(reach: number, halfCone: number): Enemy | null {
    const h = this.hero;
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - h.pos.x;
      const dz = e.pos.z - h.pos.z;
      const d = Math.hypot(dx, dz) - e.spec.radius;
      if (d > reach || d >= bestD) continue;
      if (Math.abs(angleDiff(h.facing, yawTo(dx, dz))) > halfCone) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  /** Rogue rules: from behind = instant takedown; from the front = the brute retaliates. */
  protected rogueStrike(e: Enemy): void {
    const h = this.hero;
    if (e.isBehind(h.pos)) {
      this.hitEnemy(e, 999, h.pos, 0);
      this.host.audio.play('backstab');
      this.host.floatText(e.pos, 'BACKSTAB!', 'good');
      this.fx.burst(e.pos, 0xf58324, 18, 5, { up: 4 });
      this.fx.ring(e.pos, 0xf58324, 3);
      this.fx.shake = 0.35;
    } else {
      this.host.floatText(e.pos, 'Blocked! Get behind it', 'bad');
      this.host.audio.play('hit');
      if (!h.invisible) {
        e.lastSeen.copy(h.pos);
        e.facing = yawTo(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
        e.setState('smash', 0.3);
        this.onAlert(e);
      }
    }
  }

  protected hitEnemy(e: Enemy, dmg: number, from: THREE.Vector3, knock: number): void {
    const killed = e.damage(dmg, from, knock);
    this.host.audio.play('hit');
    this.fx.burst(e.pos, e.kind === 'bat' ? 0x9a6cff : 0xfff6e8, killed ? 14 : 6, killed ? 4 : 2.5, {
      y: e.kind === 'bat' ? e.y : undefined,
    });
  }

  // ------------------------------------------------------------ EnemyWorld

  hurtHero(dmg: number, from: THREE.Vector3, opts: { stagger?: number; knock?: number; kill?: boolean } = {}): void {
    const h = this.hero;
    if (h.dead || h.falling || this.done) return;
    if (h.invulnT > 0 || h.dashing) return;
    h.hp = opts.kill ? 0 : h.hp - dmg;
    h.flashT = 0.25;
    h.invulnT = 0.9;
    h.staggerT = opts.stagger ?? 0.15;
    if (h.windupT > 0) {
      h.windupT = 0; // a hit interrupts the draw / cast
      this.host.floatText(h.pos, 'Interrupted!', 'bad');
    }
    tmpV.subVectors(h.pos, from).setY(0).normalize();
    h.knock.addScaledVector(tmpV, opts.knock ?? 6);
    this.host.audio.play('hurt');
    this.fx.shake = Math.max(this.fx.shake, 0.3);
    this.fx.burst(h.pos, 0xff5a6a, 8, 3);
    if (h.hp <= 0) this.killHero();
  }

  fireOrb(from: THREE.Vector3, target: THREE.Vector3, spread = 0): void {
    tmpV.subVectors(target, from).setY(0);
    const base = Math.atan2(tmpV.x, tmpV.z);
    const angles = spread > 0 ? [-spread, 0, spread] : [0];
    for (const a of angles) {
      this.projectiles.spawn('orb', from, tmpF.set(Math.sin(base + a), 0, Math.cos(base + a)), false);
    }
  }

  onAlert(_e: Enemy): void {
    this.host.audio.play('alert');
  }

  // ------------------------------------------------------------ hero life cycle

  protected killHero(): void {
    const h = this.hero;
    h.hp = 0;
    h.dead = true;
    h.deadT = 0;
    h.windupT = 0;
    h.invisT = 0;
    this.host.audio.play('death');
    this.host.banner('Knocked out!');
  }

  private overPit(p: THREE.Vector3): boolean {
    for (const b of this.bridges) if (b.active && inBox(p.x, p.z, b.box)) return false;
    for (const pit of this.pits) if (inBox(p.x, p.z, pit, -0.15)) return true;
    return false;
  }

  private startFall(): void {
    const h = this.hero;
    h.falling = true;
    h.windupT = 0;
    this.fallV = 0;
    this.host.audio.play('death');
  }

  private endFall(): void {
    const h = this.hero;
    const hp = h.hp - 1;
    h.respawn(this.spawnPoint, this.spawnFacing);
    if (hp > 0) h.hp = hp;
    this.host.banner('Mind the abyss!', hp > 0 ? 'You lost a heart' : 'Hearts restored');
  }

  // ------------------------------------------------------------ enemies & projectiles

  /** Soft push so enemies don't stack on each other or on the hero. */
  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.kind === 'bat') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.kind === 'bat') continue;
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
      const h = this.hero;
      if (!h.dead && !h.falling && !h.invisible) {
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
        this.coins.spawn(e.kind === 'bat' ? tmpV.set(e.pos.x, 0, e.pos.z) : e.pos, e.spec.coins, 5);
        this.onEnemyKilled(e);
      }
      if (e.deadT > 1.1) {
        this.root.remove(e.rig.root);
        disposeTree(e.rig.root);
        this.enemies.splice(i, 1);
        this.handledDead.delete(e);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    this.projectiles.update(dt, this.projectileWalls ?? this.obstacles, (p, wall) => {
      if ((p.kind === 'fireball' && wall) || p.kind === 'inferno') this.explode(p);
      else if (wall) this.fx.burst(p.pos, 0xfff6e8, 4, 2, { y: p.pos.y, life: 0.25 });
    });
    const h = this.hero;
    for (const p of this.projectiles.list) {
      if (p.dead) continue;
      if (p.fromHero) {
        if (this.projectileBlocked(p)) {
          this.projectiles.kill(p);
          this.fx.burst(p.pos, 0xfff6e8, 6, 3, { y: p.pos.y, life: 0.3 });
          this.host.audio.play('hit');
          continue;
        }
        let hit = false;
        for (const e of this.enemies) {
          if (!e.targetable) continue;
          const r = p.radius + e.spec.radius;
          if ((e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2 > r * r) continue;
          if (p.kind === 'fireball' || p.kind === 'inferno') this.explode(p, e);
          else if (p.kind === 'ice') this.frostBurst(p);
          else this.hitEnemy(e, p.damage, p.pos, 5);
          hit = true;
          break;
        }
        if (!hit) {
          for (const t of this.targets) {
            if (!t.active) continue;
            const r = p.radius + t.radius;
            if ((t.pos.x - p.pos.x) ** 2 + (t.pos.z - p.pos.z) ** 2 > r * r) continue;
            t.onHit(p);
            hit = true;
            break;
          }
        }
        if (hit) this.projectiles.kill(p);
      } else if (!h.dead && !h.falling) {
        const r = p.radius + h.radius;
        if ((h.pos.x - p.pos.x) ** 2 + (h.pos.z - p.pos.z) ** 2 < r * r) {
          this.projectiles.kill(p);
          this.fx.burst(p.pos, 0x9a6cff, 8, 3, { y: p.pos.y });
          this.hurtHero(p.damage, p.pos, { knock: 5 });
        }
      }
    }
    this.projectiles.sweep();
  }

  /** Frost arrow impact: freezes everything nearby for a few seconds. */
  private frostBurst(p: Projectile): void {
    this.host.audio.play('lever');
    this.fx.burst(p.pos, 0x8ae6ff, 16, 4, { y: p.pos.y });
    this.fx.burst(p.pos, 0xffffff, 6, 2, { y: p.pos.y });
    this.fx.ring(p.pos, 0x8ae6ff, 3.2, 0.45);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 2.2 + e.spec.radius) e.freeze(4);
    }
    this.host.floatText(p.pos, 'Frozen!', 'info');
  }

  /** Fireball impact: direct hit + small splash. */
  private explode(p: Projectile, direct?: Enemy): void {
    const big = p.kind === 'inferno';
    this.host.audio.play('boom');
    this.fx.burst(p.pos, 0xf58324, big ? 40 : 16, big ? 9 : 5, { y: p.pos.y, up: big ? 5 : 3 });
    this.fx.burst(p.pos, big ? 0xff5a1f : 0xffe0a0, big ? 24 : 8, big ? 6 : 3, { y: p.pos.y });
    this.fx.ring(p.pos, 0xf58324, big ? 6.5 : 2.4, big ? 0.6 : 0.4);
    if (big) this.fx.ring(p.pos, 0xffd27a, 4.5, 0.45);
    this.fx.shake = Math.max(this.fx.shake, big ? 0.55 : 0.2);
    if (direct) this.hitEnemy(direct, p.damage, p.pos, 6);
    const radius = big ? 3.6 : 1.7;
    const splash = big ? 3 : 1;
    for (const e of this.enemies) {
      if (e === direct || !e.targetable) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < radius) this.hitEnemy(e, splash, p.pos, 6);
    }
  }

  // ------------------------------------------------------------ completion

  protected openExit(): void {
    if (!this.exit || this.exit.isOpen) return;
    this.exit.open();
    this.host.audio.play('clear');
    this.host.banner('Portal open!', 'Step into the portal');
  }

  private finish(): void {
    this.done = true;
    const rest = this.coins.flush();
    if (rest > 0) this.host.addCoins(rest);
    this.fx.burst(this.hero.pos, 0xf58324, 24, 5, { up: 6 });
    this.host.audio.play('clear');
    this.host.stageCleared();
  }

  dispose(): void {
    this.sched.clear();
    this.projectiles.clear();
    this.coins.flush();
    this.fx.clear();
    this.root.removeFromParent();
    disposeTree(this.root);
    this.enemies.length = 0;
    this.targets.length = 0;
  }
}
