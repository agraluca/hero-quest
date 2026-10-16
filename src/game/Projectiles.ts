import * as THREE from 'three';
import { markShared } from './materials';
import { inBox, type Box } from './physics';

export type ProjectileKind = 'fireball' | 'inferno' | 'arrow' | 'ice' | 'orb';

export interface Projectile {
  kind: ProjectileKind;
  fromHero: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  radius: number;
  damage: number;
  mesh: THREE.Object3D;
  dead: boolean;
}

const SPECS: Record<ProjectileKind, { speed: number; life: number; radius: number; damage: number; y: number }> = {
  fireball: { speed: 14, life: 1.6, radius: 0.4, damage: 2, y: 1.0 },
  inferno: { speed: 10, life: 2.2, radius: 0.85, damage: 4, y: 1.1 },
  arrow: { speed: 22, life: 1.0, radius: 0.3, damage: 1, y: 1.0 },
  ice: { speed: 20, life: 1.1, radius: 0.4, damage: 0, y: 1.0 },
  orb: { speed: 5.2, life: 3.4, radius: 0.35, damage: 1, y: 1.0 },
};

// Shared geometry/materials: projectiles are spawned often, never allocate per shot.
const R = {
  fireCore: new THREE.SphereGeometry(0.22, 12, 10),
  fireHalo: new THREE.SphereGeometry(0.4, 12, 10),
  orbCore: new THREE.SphereGeometry(0.2, 12, 10),
  orbHalo: new THREE.SphereGeometry(0.36, 12, 10),
  shaft: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).rotateX(Math.PI / 2),
  tip: new THREE.ConeGeometry(0.07, 0.18, 6).rotateX(Math.PI / 2).translate(0, 0, 0.45),
  mFireCore: new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
  mFireHalo: new THREE.MeshBasicMaterial({ color: 0xf58324, transparent: true, opacity: 0.55, depthWrite: false }),
  // dark magic: near-black violet core, purple aura
  mOrbCore: new THREE.MeshBasicMaterial({ color: 0x2a0b45 }),
  mOrbHalo: new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.55, depthWrite: false }),
  mInfernoHalo: new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.45, depthWrite: false }),
  mShaft: new THREE.MeshBasicMaterial({ color: 0xfff6e8 }),
  mTip: new THREE.MeshBasicMaterial({ color: 0xf58324 }),
  mIceShaft: new THREE.MeshBasicMaterial({ color: 0xd8f6ff }),
  mIceTip: new THREE.MeshBasicMaterial({ color: 0x5ad8ff }),
  mIceHalo: new THREE.MeshBasicMaterial({ color: 0x8ae6ff, transparent: true, opacity: 0.45, depthWrite: false }),
};

markShared(...Object.values(R));

function makeMesh(kind: ProjectileKind): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'fireball':
      g.add(new THREE.Mesh(R.fireCore, R.mFireCore), new THREE.Mesh(R.fireHalo, R.mFireHalo));
      break;
    case 'inferno': {
      const core = new THREE.Mesh(R.fireCore, R.mFireCore);
      core.scale.setScalar(2.2);
      const halo = new THREE.Mesh(R.fireHalo, R.mFireHalo);
      halo.scale.setScalar(2.1);
      const outer = new THREE.Mesh(R.fireHalo, R.mInfernoHalo);
      outer.scale.setScalar(2.8);
      g.add(core, halo, outer);
      break;
    }
    case 'arrow':
      g.add(new THREE.Mesh(R.shaft, R.mShaft), new THREE.Mesh(R.tip, R.mTip));
      break;
    case 'ice': {
      const halo = new THREE.Mesh(R.orbHalo, R.mIceHalo);
      halo.scale.set(0.7, 0.7, 1.6);
      halo.position.z = 0.2;
      g.add(new THREE.Mesh(R.shaft, R.mIceShaft), new THREE.Mesh(R.tip, R.mIceTip), halo);
      break;
    }
    case 'orb':
      g.add(new THREE.Mesh(R.orbCore, R.mOrbCore), new THREE.Mesh(R.orbHalo, R.mOrbHalo));
      break;
  }
  return g;
}

/** Owns projectile meshes and motion. Hit resolution lives in the stage. */
export class Projectiles {
  readonly group = new THREE.Group();
  readonly list: Projectile[] = [];

  spawn(kind: ProjectileKind, from: THREE.Vector3, dir: THREE.Vector3, fromHero: boolean): Projectile {
    const s = SPECS[kind];
    const mesh = makeMesh(kind);
    const d = dir.clone().setY(0).normalize();
    const p: Projectile = {
      kind,
      fromHero,
      pos: new THREE.Vector3(from.x + d.x * 0.6, s.y, from.z + d.z * 0.6),
      vel: d.multiplyScalar(s.speed),
      life: s.life,
      radius: s.radius,
      damage: s.damage,
      mesh,
      dead: false,
    };
    mesh.position.copy(p.pos);
    mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
    this.group.add(mesh);
    this.list.push(p);
    return p;
  }

  /**
   * Moves projectiles; `onWall` fires when one hits a blocking box or expires.
   * Returns nothing: the stage checks hits against characters afterwards.
   */
  update(dt: number, walls: readonly Box[], onEnd: (p: Projectile, hitWall: boolean) => void): void {
    for (const p of this.list) {
      if (p.dead) continue;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      p.mesh.position.copy(p.pos);
      if (p.kind !== 'arrow' && p.kind !== 'ice') {
        const s = 1 + Math.sin(p.life * 30) * 0.12;
        p.mesh.scale.setScalar(s);
      }
      let wall = false;
      for (const b of walls) {
        if (inBox(p.pos.x, p.pos.z, b)) {
          wall = true;
          break;
        }
      }
      if (wall || p.life <= 0) {
        p.dead = true;
        onEnd(p, wall);
      }
    }
    this.sweep();
  }

  kill(p: Projectile): void {
    p.dead = true;
  }

  sweep(): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) {
        this.group.remove(this.list[i].mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list.length = 0;
  }
}
