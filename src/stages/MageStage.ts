import * as THREE from 'three';
import type { Enemy } from '../game/Enemy';
import { glow, toon } from '../game/materials';
import { box } from '../game/physics';
import { BaseStage, type StageHost } from './BaseStage';
import { banner, castleWall, floor, Portal, torch, tower } from './env';

/**
 * Stage 2: Castle Chasm.
 * The fire mage stands on the castle rampart; across a chasm, skeleton dark
 * mages and their warlock hold the keep and hurl dark orbs (the warlock
 * throws a 3-orb fan). Fireballs pick them off; Inferno blasts whole groups.
 * Clear the keep and a bridge rises. Falling in costs a heart.
 */
const PIT = box(0, -0.5, 16, 7);
const BRIDGE = box(0, -0.5, 2.4, 7.6);
const KEEP_LEASH = box(0, -8.6, 12, 5.6);

export class MageStage extends BaseStage {
  private bridgeMesh!: THREE.Group;
  private bridgeRise = -1;
  private reinforced = false;

  constructor(host: StageHost) {
    super(host, 'mage');
    this.viewWidth = 10.5;
    this.camLead = 4.5;
    this.atmosphere = {
      bg: 0x2a1736,
      fogNear: 24,
      fogFar: 58,
      sky: 0xffd8c0,
      ground: 0x3a2850,
      hemi: 1.5,
      sun: 0xffb080,
      sunI: 1.6,
    };
  }

  build(): void {
    const r = this.root;
    const stone = 0x6a6680;
    // rampart (near) + keep courtyard (far); the chasm in between has no floor
    floor(r, 0, 6, 16, 6, 0x7d7a92, 2, 0x737088);
    floor(r, 0, -8.5, 16, 9, 0x6a6680, 2, 0x625e78);
    this.obstacles.push(
      castleWall(r, -8.4, 6, 1, 6.6, 1.6, stone),
      castleWall(r, 8.4, 6, 1, 6.6, 1.6, stone),
      castleWall(r, 0, 9.3, 17.8, 1, 0.5, stone),
      castleWall(r, -8.4, -8.5, 1, 9.6, 2.4, stone),
      castleWall(r, 8.4, -8.5, 1, 9.6, 2.4, stone),
      castleWall(r, 0, -13.4, 17.8, 1, 2.8, stone),
      tower(r, -8, -13, 1.3, 4.2, stone),
      tower(r, 8, -13, 1.3, 4.2, stone),
    );
    this.pits.push(PIT);
    this.bridges.push({ box: BRIDGE, active: false });

    // the chasm: deep void with dark-magic mist
    const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 7), new THREE.MeshBasicMaterial({ color: 0x0c0618 }));
    voidPlane.rotation.x = -Math.PI / 2;
    voidPlane.position.set(0, -5, -0.5);
    r.add(voidPlane);
    for (let i = 0; i < 14; i++) {
      const mist = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.8, 10, 8), glow(i % 2 ? 0x5a2fb0 : 0x7845d8, 0.25));
      mist.position.set(-8 + Math.random() * 16, -2.5 - Math.random() * 2, -3.5 + Math.random() * 6);
      r.add(mist);
    }
    // cut-stone chasm edges
    for (const z of [3, -4]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 0.6), toon(0x4a4660));
      edge.position.set(0, -2.2, z + (z > 0 ? 0.3 : -0.3));
      r.add(edge);
    }

    // drawbridge, sunk in the chasm until the keep is cleared
    this.bridgeMesh = new THREE.Group();
    // planks span exactly cliff edge (z=-4) to cliff edge (z=3), a hair below the
    // floor top so they never z-fight with the floor tiles
    const SPAN_MIN = -4;
    const SPAN_MAX = 3;
    const n = 7;
    const step = (SPAN_MAX - SPAN_MIN) / n;
    for (let i = 0; i < n; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, step - 0.06), toon(i % 2 ? 0x8a5a3a : 0x7a4b32));
      plank.position.set(0, -0.17, SPAN_MIN + step * (i + 0.5));
      this.bridgeMesh.add(plank);
    }
    for (const x of [-1.25, 1.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, SPAN_MAX - SPAN_MIN), glow(0xf58324));
      rail.position.set(x, 0.5, (SPAN_MIN + SPAN_MAX) / 2);
      this.bridgeMesh.add(rail);
      for (const z of [SPAN_MIN + 0.1, SPAN_MAX - 0.1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), toon(0x5a3a24));
        post.position.set(x, 0.25, z);
        this.bridgeMesh.add(post);
      }
    }
    this.bridgeMesh.position.y = -6;
    this.bridgeMesh.visible = false;
    r.add(this.bridgeMesh);

    // banners and torches: orange = the mage's side, purple = the dark keep
    banner(r, -6.5, 8.6, 0xf58324);
    banner(r, 5.5, 8.6, 0xf58324);
    banner(r, -5, -12.7, 0x5a2fb0, 2.4);
    banner(r, 3.6, -12.7, 0x5a2fb0, 2.4);
    for (const [x, z] of [
      [-7.4, 3.8],
      [7.4, 3.8],
      [-7.4, -5],
      [7.4, -5],
    ]) {
      this.torches.push(torch(r, x, z));
    }
    this.sightBlockers = this.obstacles;
    this.spawnPoint.set(0, 0, 6.5);

    // the keep's defenders: dark mages in two ranks + their warlock
    for (const [x, z] of [
      [-5, -6],
      [-1.8, -5.6],
      [1.8, -5.6],
      [5, -6],
      [-3.4, -8.8],
      [3.4, -8.8],
    ]) {
      this.keepEnemy('caster', x, z);
    }
    this.keepEnemy('warlock', 0, -10.2);

    this.exit = new Portal(r, new THREE.Vector3(0, 0, -10.6));
  }

  private keepEnemy(kind: 'caster' | 'warlock', x: number, z: number): Enemy {
    const e = this.addEnemy(kind, x, z, 0);
    e.leash = KEEP_LEASH;
    return e;
  }

  objective(): string {
    if (this.exit?.isOpen) return 'Cross the bridge to the portal';
    if (this.bridgeRise >= 0) return 'The bridge is rising…';
    return `Burn the dark mages across the chasm (${this.aliveEnemies} left)`;
  }

  protected onEnemyKilled(): void {
    const left = this.aliveEnemies;
    if (!this.reinforced && left <= 3) {
      // a last rank of dark mages rises for the finale
      this.reinforced = true;
      this.sched.after(0.6, () => {
        this.host.banner('Dark reinforcements!');
        for (const x of [-4.2, 0, 4.2]) {
          const e = this.keepEnemy('caster', x, -7.4);
          e.castTimer = 1.5 + Math.random();
          this.fx.ring(e.pos, 0x8a3cff, 2);
          this.fx.burst(e.pos, 0x8a3cff, 10, 2, { y: 0.4 });
        }
      });
    }
    if (left === 0 && this.reinforced && this.bridgeRise < 0) {
      this.sched.after(0.5, () => this.raiseBridge());
    }
  }

  private raiseBridge(): void {
    if (this.aliveEnemies > 0 || this.bridgeRise >= 0) return;
    this.bridgeRise = 0;
    this.bridgeMesh.visible = true;
    this.host.audio.play('bridge');
    this.host.banner('Keep cleared!', 'The drawbridge rises');
    this.fx.shake = 0.4;
  }

  protected tick(dt: number): void {
    if (this.bridgeRise >= 0 && this.bridgeRise < 1) {
      this.bridgeRise = Math.min(this.bridgeRise + dt / 1.4, 1);
      const k = 1 - Math.pow(1 - this.bridgeRise, 3);
      this.bridgeMesh.position.y = -6 * (1 - k);
      if (this.bridgeRise >= 1) {
        this.bridges[0].active = true;
        this.openExit();
      }
    }
  }
}
