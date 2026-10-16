import * as THREE from 'three';
import type { Enemy } from '../game/Enemy';
import { BaseStage, type StageHost } from './BaseStage';
import { campfire, crates, floor, palisade, Portal, rock, tent, torch } from './env';

/**
 * Stage 4: Orc War Camp (night).
 * Three fast, heavy brutes patrol lanes between rows of crates and carts.
 * They see in a cone (shown on the ground) that cover blocks.
 * - Get behind one and strike: instant takedown.
 * - Strike from the front, or get caught: one hit and the rogue is down.
 * - Vanish turns the rogue invisible for a few seconds and shakes off a chase.
 */
export class RogueStage extends BaseStage {
  constructor(host: StageHost) {
    super(host, 'rogue');
    this.viewWidth = 11.5;
    this.camLead = 2.5;
    // moonlit night: cool light, so the yellow vision cones and campfires pop
    this.atmosphere = {
      bg: 0x0b0d1e,
      fogNear: 20,
      fogFar: 46,
      sky: 0x9aa8ff,
      ground: 0x1a1530,
      hemi: 1.2,
      sun: 0xb0c0ff,
      sunI: 1.0,
    };
  }

  build(): void {
    const r = this.root;
    floor(r, 0, -2, 14, 22, 0x5e5048, 2, 0x56493f);
    this.obstacles.push(
      palisade(r, 0, 9.4, 15, 0.5, 0.7),
      palisade(r, 0, -13.4, 15, 0.5),
      palisade(r, -7.4, -2, 0.5, 22),
      palisade(r, 7.4, -2, 0.5, 22),
    );
    const walls = [...this.obstacles];

    // three rows of cover between the patrol lanes
    const cover = [
      crates(r, -3.7, 4.6, 2.8, 0.5, 41),
      crates(r, 3.7, 4.6, 2.8, 0.5, 42),
      crates(r, -5.1, -0.5, 2.2, 0.5, 43),
      crates(r, 0, -0.5, 2.8, 0.5, 44),
      crates(r, 5.1, -0.5, 2.2, 0.5, 45),
      crates(r, -2.7, -5.6, 2.8, 0.5, 46),
      crates(r, 3.1, -5.6, 2.8, 0.5, 47),
      // side crates for hiding inside lanes
      crates(r, -6.5, 2, 0.6, 1.4, 48),
      crates(r, 6.5, -3, 0.6, 1.4, 49),
      crates(r, -6.5, -8.4, 0.6, 1.4, 50),
    ];
    this.obstacles.push(...cover);
    this.sightBlockers = [...walls, ...cover];

    // tents and campfires around the edges (outside the patrol lanes)
    this.obstacles.push(tent(r, 5.4, 7.3, 0x7a4b32, 0.9), tent(r, -5.6, -11.7, 0x6b5a3a, 0.9), tent(r, 5.6, -11.7, 0x7a4b32, 0.9));
    for (const [x, z] of [
      [-5.7, 6.9],
      [5.8, -6.9],
    ]) {
      const fire = campfire(r, x, z);
      this.torches.push(fire.obj);
      this.obstacles.push(fire.box);
    }
    for (const [x, z] of [
      [-6.6, -3],
      [6.6, 1.6],
      [0, -12.6],
    ]) {
      this.torches.push(torch(r, x, z, 1.6));
    }
    rock(r, -2, 7.6, 0.4, 0x4a4658);
    rock(r, 2.6, 7.9, 0.3, 0x4a4658);

    this.spawnPoint.set(0, 0, 7.2);

    // patrol lanes: z = 2, -3, -8.6
    this.brute([new THREE.Vector3(-5.2, 0, 2), new THREE.Vector3(5.2, 0, 2)], 0.3);
    this.brute([new THREE.Vector3(5.2, 0, -3), new THREE.Vector3(-5.2, 0, -3)], 0.6);
    this.brute(
      [new THREE.Vector3(-4.6, 0, -8.6), new THREE.Vector3(0, 0, -10.6), new THREE.Vector3(4.6, 0, -8.6), new THREE.Vector3(0, 0, -10.6)],
      0,
    );

    this.exit = new Portal(r, new THREE.Vector3(0, 0, -11.2));
  }

  private brute(route: THREE.Vector3[], startT: number): Enemy {
    const a = route[0];
    const b = route[1];
    const e = this.addEnemy('brute', a.x + (b.x - a.x) * startT, a.z + (b.z - a.z) * startT);
    e.route = route;
    e.routeIdx = 1;
    e.facing = Math.atan2(b.x - a.x, b.z - a.z);
    return e;
  }

  objective(): string {
    if (this.exit?.isOpen) return 'Slip into the portal';
    const left = this.enemies.filter((e) => e.alive && e.kind === 'brute').length;
    const hint = this.hero.invisible ? 'Vanished: they can’t see you' : 'Strike from behind';
    return `Take down the brutes (${left} left). ${hint}`;
  }

  onAlert(e: Enemy): void {
    super.onAlert(e);
    this.host.floatText(e.pos, 'Spotted!', 'bad');
  }

  protected onEnemyKilled(): void {
    if (this.enemies.every((e) => !e.alive || e.kind !== 'brute')) {
      this.sched.after(0.6, () => this.openExit());
    }
  }

  protected onHeroRespawn(): void {
    // survivors forget the rogue and go back to their rounds
    for (const e of this.enemies) {
      if (e.alive && e.state !== 'patrol' && e.state !== 'idle') e.setState('patrol');
    }
  }
}
