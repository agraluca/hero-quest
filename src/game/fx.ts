import * as THREE from 'three';
import { markShared } from './materials';

const partGeo = new THREE.OctahedronGeometry(0.09, 0);
const ringGeo = new THREE.RingGeometry(0.8, 1, 32);

interface Particle {
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  size: number;
}

/** Pooled particle bursts and ground shockwave rings. */
export class Fx {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  /** camera shake amount, decays each frame */
  shake = 0;

  constructor() {
    for (let i = 0; i < 160; i++) {
      const mesh = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.parts.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, gravity: 0 });
    }
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, size: 1 });
    }
  }

  burst(pos: THREE.Vector3, color: number, count = 12, speed = 4, opts: { up?: number; gravity?: number; life?: number; y?: number } = {}): void {
    let n = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.life = p.max = (opts.life ?? 0.5) * (0.7 + Math.random() * 0.6);
      p.gravity = opts.gravity ?? 9;
      p.mesh.visible = true;
      p.mesh.position.set(pos.x, opts.y ?? pos.y + 0.8, pos.z);
      p.mesh.material.color.set(color);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vel.set(Math.cos(a) * s, (opts.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * s);
      if (++n >= count) break;
    }
  }

  ring(pos: THREE.Vector3, color: number, size = 2, life = 0.4): void {
    const r = this.rings.find((x) => x.life <= 0);
    if (!r) return;
    r.life = r.max = life;
    r.size = size;
    r.mesh.visible = true;
    r.mesh.position.set(pos.x, 0.06, pos.z);
    r.mesh.material.color.set(color);
  }

  update(dt: number): void {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      const k = p.life / p.max;
      p.mesh.material.opacity = k;
      p.mesh.scale.setScalar(0.5 + k);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      r.mesh.material.opacity = 1 - k;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  clear(): void {
    for (const p of this.parts) {
      p.life = 0;
      p.mesh.visible = false;
    }
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
    this.shake = 0;
  }
}

// ---------------------------------------------------------------- coins

const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16);
const coinMat = new THREE.MeshBasicMaterial({ color: 0xffa640 });
const coinRimMat = new THREE.MeshBasicMaterial({ color: 0xd9661a });
markShared(partGeo, ringGeo, coinGeo, coinMat, coinRimMat);

interface Coin {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  age: number;
  value: number;
}

/** Demo coins: pop out of defeated enemies, then home in on the hero. */
export class Coins {
  readonly group = new THREE.Group();
  private list: Coin[] = [];

  spawn(pos: THREE.Vector3, n: number, value: number): void {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const face = new THREE.Mesh(coinGeo, coinMat);
      face.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(coinGeo, coinRimMat);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(1.15, 0.6, 1.15);
      g.add(rim, face);
      g.position.set(pos.x, 0.8, pos.z);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2;
      this.group.add(g);
      this.list.push({ mesh: g, vel: new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 2, Math.sin(a) * s), age: 0, value });
    }
  }

  /** Returns the total value collected this frame. */
  update(dt: number, target: THREE.Vector3): number {
    let got = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.age += dt;
      const p = c.mesh.position;
      c.mesh.rotation.y += dt * 6;
      if (c.age < 0.45) {
        c.vel.y -= 14 * dt;
        p.addScaledVector(c.vel, dt);
        if (p.y < 0.3) {
          p.y = 0.3;
          c.vel.y = Math.abs(c.vel.y) * 0.4;
        }
      } else {
        const tx = target.x - p.x;
        const ty = target.y + 0.9 - p.y;
        const tz = target.z - p.z;
        const d = Math.hypot(tx, ty, tz);
        const sp = 6 + (c.age - 0.45) * 30;
        if (d < 0.45 || d < sp * dt) {
          got += c.value;
          this.group.remove(c.mesh);
          this.list.splice(i, 1);
          continue;
        }
        p.x += (tx / d) * sp * dt;
        p.y += (ty / d) * sp * dt;
        p.z += (tz / d) * sp * dt;
      }
    }
    return got;
  }

  /** Collect everything left (e.g. at stage clear); returns the value. */
  flush(): number {
    const v = this.list.reduce((s, c) => s + c.value, 0);
    for (const c of this.list) this.group.remove(c.mesh);
    this.list.length = 0;
    return v;
  }
}
