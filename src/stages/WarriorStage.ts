import * as THREE from 'three';
import type { EnemyKind } from '../game/rigs';
import { BaseStage, type StageHost } from './BaseStage';
import { crystals, floor, rock, rockWall, stalagmite, torch } from './env';

/**
 * Stage 1: Bone Cavern.
 * Three escalating waves of skeletons pour out of the cave mouths, fast,
 * so standing still gets you surrounded. Clearing the last wave wins the run.
 */
const WAVES: EnemyKind[][] = [
  Array(8).fill('skeleton'),
  ['captain', ...Array(11).fill('skeleton')],
  ['captain', 'captain', ...Array(14).fill('skeleton')],
];
/** seconds between skeletons of the same wave */
const SPAWN_GAP = 0.18;
/** pause between waves */
const WAVE_GAP = 0.8;

/** cave mouths around the arena edge */
const SPAWNS = [
  new THREE.Vector3(-6.5, 0, -6.5),
  new THREE.Vector3(6.5, 0, -6.5),
  new THREE.Vector3(-7, 0, 1),
  new THREE.Vector3(7, 0, 1),
  new THREE.Vector3(0, 0, -7.2),
  new THREE.Vector3(-5, 0, 6.5),
  new THREE.Vector3(5, 0, 6.5),
];

export class WarriorStage extends BaseStage {
  private wave = -1;
  private waveCleared = true;
  private spawned = 0;
  private spawnedWave = -1;

  constructor(host: StageHost) {
    super(host, 'warrior');
    this.viewWidth = 9.5;
    this.atmosphere = {
      bg: 0x110b1c,
      fogNear: 16,
      fogFar: 42,
      sky: 0xc8b8ff,
      ground: 0x2a2040,
      hemi: 1.25,
      sun: 0xffd2a8,
      sunI: 1.35,
    };
  }

  build(): void {
    const r = this.root;
    floor(r, 0, 0, 18, 18, 0x4a4060, 2, 0x433a58);
    const H = 9;
    this.obstacles.push(
      rockWall(r, 0, -H - 0.2, 19, 1.6, 2.6, 0x3d3550, 1),
      rockWall(r, -H - 0.2, 0, 1.6, 19, 2.6, 0x3d3550, 2),
      rockWall(r, H + 0.2, 0, 1.6, 19, 2.6, 0x3d3550, 3),
      // camera side: only a line of small rocks, so nothing big sits in front of the camera
      { minX: -9.5, maxX: 9.5, minZ: H - 0.3, maxZ: H + 1 },
    );
    for (let x = -8.5; x <= 8.5; x += 1.1) rock(r, x + Math.sin(x * 3) * 0.2, H + 0.1, 0.35 + Math.abs(Math.sin(x * 7)) * 0.2, 0x3d3550);
    for (const [x, z, h] of [
      [-3.6, -2.2, 2],
      [3.6, -2.2, 1.7],
      [-3.4, 3.6, 1.5],
      [3.8, 3.4, 2.1],
    ]) {
      this.obstacles.push(stalagmite(r, x, z, h));
    }
    crystals(r, -7.6, -7.4, 0x9a6cff, 5);
    crystals(r, 7.5, -7.6, 0xf58324, 6);
    crystals(r, -7.6, 4.5, 0x9a6cff, 7);
    crystals(r, 7.4, 5.5, 0x9a6cff, 8);
    crystals(r, 0.8, -7.6, 0xf58324, 9);
    for (const [x, z] of [
      [-7.4, -2.5],
      [7.4, -2.5],
      [-2.4, -7.6],
      [2.6, -7.6],
    ]) {
      this.torches.push(torch(r, x, z, 1.4));
    }
    rock(r, -5.8, 5.6, 0.45, 0x5a506e);
    rock(r, 6.2, -4, 0.35, 0x5a506e);
    rock(r, -1.6, 7, 0.3, 0x5a506e);
    rock(r, 1.8, -4.8, 0.3, 0x5a506e);
    for (const s of SPAWNS) {
      // dark cave-mouth decal at each spawn point
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 18),
        new THREE.MeshBasicMaterial({ color: 0x0a0612, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(s.x, 0.02, s.z);
      r.add(hole);
    }
    this.sightBlockers = this.obstacles;
    this.spawnPoint.set(0, 0, 4.5);
    this.sched.after(1.0, () => this.nextWave());
  }

  objective(): string {
    if (this.wave < 0) return 'Get ready…';
    const left = this.aliveEnemies + WAVES[this.wave].length - this.spawnedThisWave();
    return `Wave ${this.wave + 1}/${WAVES.length}: defeat the skeletons (${left} left)`;
  }

  failSummary(): string {
    return `You reached wave ${Math.max(this.wave + 1, 1)} of ${WAVES.length}`;
  }

  private nextWave(): void {
    this.wave++;
    this.waveCleared = false;
    const list = WAVES[this.wave];
    const last = this.wave === WAVES.length - 1;
    this.host.banner(`Wave ${this.wave + 1}`, last ? 'The captains arrive!' : this.wave === 0 ? 'Skeletons rising!' : 'More of them!');
    list.forEach((kind, i) => {
      const s = SPAWNS[(i + this.wave * 3) % SPAWNS.length];
      // staggered so the wave pours in "in order"
      this.sched.after(i * SPAWN_GAP, () => {
        const e = this.addEnemy(kind, s.x + (Math.random() - 0.5) * 1.2, s.z + (Math.random() - 0.5) * 1.2);
        e.facing = Math.atan2(this.hero.pos.x - e.pos.x, this.hero.pos.z - e.pos.z);
        this.fx.ring(e.pos, 0x9a6cff, 2);
        this.fx.burst(e.pos, 0x9a6cff, 8, 2, { y: 0.2 });
      });
    });
  }

  protected tick(): void {
    if (this.waveCleared || this.wave < 0) return;
    const pending = WAVES[this.wave].length - this.spawnedThisWave();
    if (pending > 0 || this.aliveEnemies > 0) return;
    this.waveCleared = true;
    if (this.wave < WAVES.length - 1) {
      this.host.banner('Wave cleared!');
      this.sched.after(WAVE_GAP, () => this.nextWave());
    } else {
      this.finish();
    }
  }

  private spawnedThisWave(): number {
    return this.spawnedWave === this.wave ? this.spawned : 0;
  }

  addEnemy(kind: EnemyKind, x: number, z: number, facing = 0) {
    if (this.spawnedWave !== this.wave) {
      this.spawnedWave = this.wave;
      this.spawned = 0;
    }
    this.spawned++;
    return super.addEnemy(kind, x, z, facing);
  }
}
