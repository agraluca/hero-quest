import * as THREE from 'three';
import { glow, markShared, toon } from '../game/materials';
import { box, type Box } from '../game/physics';
import type { Projectile } from '../game/Projectiles';
import { BaseStage, type StageHost, type Target } from './BaseStage';
import { bush, floor, mushroom, Portal, rock, standingStone, torch, tree, treeLine } from './env';

/**
 * Stage 3: Rune Forest.
 * The gate shows a rune sequence; shoot the three rune levers in that order.
 * A wrong rune resets the puzzle and wakes more bats. One lever hides behind a
 * rotating shield, so you need to time the shot through its gap. Bats swoop in
 * to interrupt the archer's draw.
 */

interface Rune {
  name: string;
  color: number;
  geo: THREE.BufferGeometry;
}

const RUNES: Rune[] = [
  { name: 'Sun', color: 0xf58324, geo: new THREE.IcosahedronGeometry(0.32, 0) },
  { name: 'Moon', color: 0x9a6cff, geo: new THREE.TorusGeometry(0.24, 0.09, 8, 16) },
  { name: 'Star', color: 0x3ccf91, geo: new THREE.OctahedronGeometry(0.34, 0) },
];

markShared(...RUNES.map((r) => r.geo));

/** Fisher–Yates shuffle of the three rune ids */
function shuffled(): number[] {
  const a = [0, 1, 2];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SHIELD_R = 1.35;
const SHIELD_ARC = Math.PI * 1.5; // the gap is the remaining quarter
const SHIELD_SPEED = (Math.PI * 2) / 3.6;

class Lever implements Target {
  readonly pos: THREE.Vector3;
  readonly radius = 0.45;
  active = true;
  lit = false;
  readonly group = new THREE.Group();
  private crystal: THREE.Mesh;
  private handle: THREE.Group;
  private glowMat: THREE.MeshBasicMaterial;

  constructor(
    parent: THREE.Object3D,
    readonly rune: number,
    x: number,
    z: number,
    readonly onShot: (l: Lever) => void,
  ) {
    this.pos = new THREE.Vector3(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.5, 10), toon(0x77778a));
    base.position.y = 0.25;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), toon(0x5a566a));
    post.position.y = 0.8;
    const r = RUNES[rune];
    this.glowMat = new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.55 });
    this.crystal = new THREE.Mesh(r.geo, this.glowMat);
    this.crystal.position.y = 1.35;
    this.handle = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), toon(0x8a5a3a));
    stick.position.y = 0.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xf58324));
    knob.position.y = 0.6;
    this.handle.add(stick, knob);
    this.handle.position.set(0.4, 0.5, 0);
    this.handle.rotation.z = 0.6;
    this.group.add(base, post, this.crystal, this.handle);
    this.group.position.copy(this.pos);
    parent.add(this.group);
  }

  onHit(_p: Projectile): void {
    this.onShot(this);
  }

  setLit(on: boolean): void {
    this.lit = on;
    this.active = !on;
    this.glowMat.opacity = on ? 1 : 0.55;
    this.handle.rotation.z = on ? -0.6 : 0.6;
  }

  update(t: number): void {
    this.crystal.rotation.y = t * (this.lit ? 3 : 1.2);
    this.crystal.position.y = 1.35 + Math.sin(t * 2 + this.rune) * 0.06;
    this.crystal.scale.setScalar(this.lit ? 1.15 : 1);
  }
}

export class ArcherStage extends BaseStage {
  private levers: Lever[] = [];
  private sequence: number[] = [];
  private progress = 0;
  private slots: THREE.MeshBasicMaterial[] = [];
  private slotIcons: THREE.Mesh[] = [];
  private shield!: THREE.Mesh;
  private shieldCenter = new THREE.Vector3(0, 0, -5);
  private gate!: THREE.Group;
  private gateBox!: Box;
  private gateOpenT = -1;
  private maxBats = 2;
  private shieldFrozenT = 0;
  private shieldMat!: THREE.MeshBasicMaterial;

  constructor(host: StageHost) {
    super(host, 'archer');
    this.viewWidth = 10;
    this.camLead = 3;
    this.atmosphere = {
      bg: 0x14261e,
      fogNear: 20,
      fogFar: 48,
      sky: 0xe8ffd8,
      ground: 0x2a4a2a,
      hemi: 1.55,
      sun: 0xfff0c8,
      sunI: 1.6,
    };
  }

  build(): void {
    const r = this.root;
    // forest clearing: grass, a ring of trees, and a standing-stone rune gate to the north
    floor(r, 0, -0.5, 14, 17, 0x5f8a4a, 2, 0x57804a);
    floor(r, 0, -11, 4, 4, 0x4f7444);
    this.obstacles.push(
      treeLine(r, -4.5, -9.4, 5, 1.4, 21),
      treeLine(r, 4.5, -9.4, 5, 1.4, 22),
      treeLine(r, -7.6, -0.5, 1.4, 18, 23),
      treeLine(r, 7.6, -0.5, 1.4, 18, 24),
      treeLine(r, -2.9, -11.6, 1.2, 4, 25),
      treeLine(r, 2.9, -11.6, 1.2, 4, 26),
      treeLine(r, 0, -13.8, 6.4, 1.2, 27),
      standingStone(r, -2.1, -9, 2.8),
      standingStone(r, 2.1, -9, 2.8),
    );
    // camera side: low hedge so it never hides the hero
    const hedge = { minX: -7.5, maxX: 7.5, minZ: 7.9, maxZ: 8.9 };
    for (let x = -6.8; x <= 6.8; x += 1.1) bush(r, x, 8.4, 0.55);
    this.obstacles.push(hedge);
    this.gateBox = box(0, -9, 3.4, 1);
    this.obstacles.push(this.gateBox);
    // wooden gate between the stones
    this.gate = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.3, 6), toon(i % 2 ? 0x6b4428 : 0x5a3a24));
      bar.position.set(-1.2 + i * 0.6, 1.15, -9);
      this.gate.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 0.2), toon(0x5a3a24));
    cross.position.set(0, 1.5, -8.95);
    this.gate.add(cross);
    r.add(this.gate);

    // the rune sequence (random every run, reshuffled after every mistake), carved on the lintel stone
    this.sequence = shuffled();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 0.6), toon(0x77778a));
    panel.position.set(0, 3.25, -9.1);
    const moss = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.22, 0.65), toon(0x4a8a42));
    moss.position.set(0, 3.95, -9.1);
    r.add(panel, moss);
    this.sequence.forEach((rune, i) => {
      const m = new THREE.MeshBasicMaterial({ color: RUNES[rune].color, transparent: true, opacity: 0.45 });
      const icon = new THREE.Mesh(RUNES[rune].geo, m);
      icon.position.set(-1.4 + i * 1.4, 3.25, -8.75);
      icon.scale.setScalar(1.1);
      r.add(icon);
      this.slots.push(m);
      this.slotIcons.push(icon);
      // small step arrows between slots
      if (i < 2) {
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3), glow(0xfff6e8));
        arrow.rotation.z = -Math.PI / 2;
        arrow.position.set(-0.7 + i * 1.4, 3.25, -8.75);
        r.add(arrow);
      }
    });

    // levers: left, right, and the shielded one in the middle
    const shot = (l: Lever) => this.onLeverShot(l);
    this.levers = [
      new Lever(r, 0, -4.2, -1.5, shot),
      new Lever(r, 1, 4.2, -3.5, shot),
      new Lever(r, 2, this.shieldCenter.x, this.shieldCenter.z, shot),
    ];
    this.targets.push(...this.levers);
    // levers and the shield block walking but not arrows (arrows hit them via targets/projectileBlocked)
    this.projectileWalls = [...this.obstacles];
    for (const l of this.levers) this.obstacles.push(box(l.pos.x, l.pos.z, 1, 1));
    this.obstacles.push(box(this.shieldCenter.x, this.shieldCenter.z, SHIELD_R * 2, SHIELD_R * 2));

    const shieldGeo = new THREE.CylinderGeometry(SHIELD_R, SHIELD_R, 1.9, 36, 1, true, 0, SHIELD_ARC);
    this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x9a6cff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    this.shield = new THREE.Mesh(shieldGeo, this.shieldMat);
    this.shield.position.set(this.shieldCenter.x, 0.95, this.shieldCenter.z);
    r.add(this.shield);

    // a few trees inside the clearing: cover from bats, and they block arrows
    const trees = [tree(r, -3.6, 3.5, 0.9, 31), tree(r, 3.6, 3.5, 1, 32), tree(r, -5.8, -6.6, 0.8, 33), tree(r, 5.8, -6.8, 0.85, 34)];
    this.obstacles.push(...trees);
    this.projectileWalls.push(...trees);
    this.torches.push(torch(r, -3.2, -8.3, 1.6), torch(r, 3.2, -8.3, 1.6));
    bush(r, -6.2, 5.6, 0.6);
    bush(r, 6.1, 6.2, 0.55);
    bush(r, -6.3, -3.2, 0.5);
    bush(r, 6.3, 1.8, 0.5);
    rock(r, -6.2, 1.5, 0.5, 0x77778a);
    rock(r, 6.2, -1.2, 0.45, 0x77778a);
    rock(r, 1.5, 6.5, 0.35, 0x77778a);
    for (const [x, z] of [
      [-2.5, 6.4],
      [5.4, 4.6],
      [-5.6, -1],
      [2.6, -7.6],
      [-1.2, 1.2],
    ]) {
      mushroom(r, x, z);
    }
    this.sightBlockers = this.obstacles;

    this.spawnPoint.set(0, 0, 5.5);
    this.exit = new Portal(r, new THREE.Vector3(0, 0, -11.2));
    this.sched.after(4, () => this.spawnBat(2));
    this.sched.every(6, () => {
      if (this.aliveBats() < this.maxBats && !this.exit?.isOpen) this.spawnBat(1);
    });
  }

  private aliveBats(): number {
    return this.enemies.filter((e) => e.alive && e.kind === 'bat').length;
  }

  private spawnBat(n: number): void {
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 10;
      const e = this.addEnemy('bat', x, -7.5);
      e.y = 3;
      this.fx.burst(e.pos, 0x9a6cff, 8, 2, { y: 3 });
    }
  }

  objective(): string {
    if (this.exit?.isOpen) return 'Through the gate to the portal';
    const next = RUNES[this.sequence[this.progress]];
    return `Shoot the runes in order (${this.progress}/3). Next: ${next.name}`;
  }

  hudExtra(): string {
    return this.sequence
      .map((rune, i) => {
        const r = RUNES[rune];
        const state = i < this.progress ? 'done' : i === this.progress ? 'next' : '';
        const hex = '#' + r.color.toString(16).padStart(6, '0');
        return `<span class="rune ${state}" style="--c:${hex}"><i class="shape-${r.name.toLowerCase()}"></i>${r.name}</span>`;
      })
      .join('<b>›</b>');
  }

  private onLeverShot(l: Lever): void {
    if (this.gateOpenT >= 0) return;
    const expected = this.sequence[this.progress];
    if (l.rune === expected) {
      l.setLit(true);
      this.slots[this.progress].opacity = 1;
      this.progress++;
      this.host.audio.play('lever');
      this.host.floatText(l.pos, `${RUNES[l.rune].name} ✓`, 'good');
      this.fx.burst(l.pos, RUNES[l.rune].color, 14, 3, { y: 1.35 });
      if (this.progress === 3) this.openGate();
    } else {
      this.host.audio.play('wrong');
      this.host.floatText(l.pos, 'Wrong rune!', 'bad');
      this.host.banner('Wrong order!', 'The runes reshuffle and the bats wake up');
      this.fx.burst(l.pos, 0xff5a6a, 14, 3, { y: 1.35 });
      this.progress = 0;
      for (const lv of this.levers) lv.setLit(false);
      // a fresh order (never the same one twice in a row), so guessing doesn't pay
      const old = this.sequence.join();
      do this.sequence = shuffled();
      while (this.sequence.join() === old);
      this.sequence.forEach((rune, i) => {
        this.slotIcons[i].geometry = RUNES[rune].geo;
        this.slots[i].color.set(RUNES[rune].color);
        this.slots[i].opacity = 0.45;
        this.fx.burst(this.slotIcons[i].position, RUNES[rune].color, 6, 2, { y: 3.25 });
      });
      this.maxBats = Math.min(this.maxBats + 1, 4);
      this.spawnBat(1);
    }
  }

  private openGate(): void {
    this.gateOpenT = 0;
    this.host.banner('The gate opens!');
    this.host.audio.play('bridge');
    this.fx.shake = 0.35;
    // bats flee
    for (const e of this.enemies) if (e.alive && e.kind === 'bat') e.damage(99, e.pos, 0);
  }

  protected projectileBlocked(p: Projectile): boolean {
    const dx = p.pos.x - this.shieldCenter.x;
    const dz = p.pos.z - this.shieldCenter.z;
    const d = Math.hypot(dx, dz);
    if (d < SHIELD_R - 0.35 || d > SHIELD_R + 0.35) return false;
    // shield-local angle (matches CylinderGeometry's theta: x = sinθ, z = cosθ)
    let a = Math.atan2(dx, dz) - this.shield.rotation.y;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const blocked = a <= SHIELD_ARC;
    if (blocked && p.kind === 'ice' && this.shield.visible) {
      // frost arrows freeze the spinning shield in place
      this.shieldFrozenT = 4.5;
      this.host.floatText(this.shieldCenter, 'Shield frozen!', 'info');
      this.fx.burst(p.pos, 0x8ae6ff, 14, 3, { y: p.pos.y });
    }
    return blocked;
  }

  protected tick(dt: number): void {
    if (this.shieldFrozenT > 0) {
      this.shieldFrozenT -= dt;
      this.shieldMat.color.set(0x8ae6ff);
      this.shieldMat.opacity = 0.6;
    } else {
      this.shield.rotation.y += SHIELD_SPEED * dt;
      this.shieldMat.color.set(0x9a6cff);
      this.shieldMat.opacity = 0.45;
    }
    for (const l of this.levers) l.update(this.time);
    if (this.gateOpenT >= 0 && this.gateOpenT < 1) {
      this.gateOpenT = Math.min(this.gateOpenT + dt / 1.2, 1);
      this.gate.position.y = -2.3 * this.gateOpenT;
      if (this.gateOpenT >= 1) {
        this.obstacles.splice(this.obstacles.indexOf(this.gateBox), 1);
        this.projectileWalls?.splice(this.projectileWalls.indexOf(this.gateBox), 1);
        this.shield.visible = false;
        this.openExit();
      }
    }
  }
}
