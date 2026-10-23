import * as THREE from 'three';
import { glow, markShared, toon } from '../game/materials';
import { box, type Box } from '../game/physics';

/** Low-poly scenery helpers. Each one adds meshes to `parent` and returns its collision box where relevant. */

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  disc: new THREE.CircleGeometry(1, 32),
};
markShared(...Object.values(geo));

export function floor(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, color: number, tile = 2, alt?: number): void {
  const g = new THREE.Group();
  // solid base under the tiles so the grout gaps never show the void
  const base = new THREE.Mesh(geo.box, toon(new THREE.Color(color).multiplyScalar(0.7).getHex()));
  base.scale.set(w, 0.38, d);
  base.position.set(cx, -0.22, cz);
  g.add(base);
  const nx = Math.round(w / tile);
  const nz = Math.round(d / tile);
  const a = toon(color);
  const b = toon(alt ?? new THREE.Color(color).multiplyScalar(0.92).getHex());
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const m = new THREE.Mesh(geo.box, (i + j) % 2 ? a : b);
      m.scale.set(tile * 0.97, 0.4, tile * 0.97);
      m.position.set(cx - w / 2 + tile * (i + 0.5), -0.2, cz - d / 2 + tile * (j + 0.5));
      g.add(m);
    }
  }
  parent.add(g);
}

export function torch(parent: THREE.Object3D, x: number, z: number, h = 1.8): THREE.Object3D {
  const g = new THREE.Group();
  const post = new THREE.Mesh(geo.cyl, toon(0x5a3a2a));
  post.scale.set(0.08, h, 0.08);
  post.position.y = h / 2;
  const bowl = new THREE.Mesh(geo.cyl, toon(0x3a2a20));
  bowl.scale.set(0.2, 0.15, 0.2);
  bowl.position.y = h;
  const flame = new THREE.Mesh(geo.cone, glow(0xffb057));
  flame.scale.set(0.16, 0.4, 0.16);
  flame.position.y = h + 0.25;
  const core = new THREE.Mesh(geo.cone, glow(0xfff1c8));
  core.scale.set(0.08, 0.22, 0.08);
  core.position.y = h + 0.18;
  g.add(post, bowl, flame, core);
  g.position.set(x, 0, z);
  g.userData.flame = flame;
  parent.add(g);
  return g;
}

export function rock(parent: THREE.Object3D, x: number, z: number, s = 0.6, color = 0x5a4a80): void {
  const m = new THREE.Mesh(geo.sphere, toon(color));
  m.scale.set(s * 1.2, s * 0.7, s);
  m.position.set(x, s * 0.25, z);
  m.rotation.y = x * 3.1 + z;
  parent.add(m);
}

/** Flicker torch flames (cheap, no lights). */
export function flickerTorches(torches: readonly THREE.Object3D[], time: number): void {
  for (const o of torches) {
    const f = o.userData.flame as THREE.Object3D;
    const k = 1 + Math.sin(time * 17 + o.position.x * 3) * 0.12 + Math.sin(time * 23 + o.position.z) * 0.08;
    f.scale.set(0.16 * k, 0.4 * k, 0.16 * k);
  }
}

// ================================================================ themed kits
// Deterministic pseudo-random so layouts look the same every run.
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- cavern

/** Lumpy rock wall: overlapping boulders filling the box (collider = the box). */
export function rockWall(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, h = 2.2, color = 0x3d3550, seed = 1): Box {
  const r = rnd(seed);
  const n = Math.max(3, Math.round((w * d) / 1.6));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo.sphere, toon(r() < 0.5 ? color : new THREE.Color(color).multiplyScalar(0.85).getHex()));
    const s = 0.7 + r() * 0.8;
    m.scale.set(s * (1 + r() * 0.5), h * (0.5 + r() * 0.6), s);
    m.position.set(cx + (r() - 0.5) * w, h * 0.3, cz + (r() - 0.5) * d);
    m.rotation.y = r() * Math.PI;
    parent.add(m);
  }
  return box(cx, cz, w, d);
}

export function stalagmite(parent: THREE.Object3D, x: number, z: number, h = 1.8, color = 0x51476a): Box {
  const m = new THREE.Mesh(geo.cone, toon(color));
  m.scale.set(0.45, h, 0.45);
  m.position.set(x, h / 2, z);
  const m2 = new THREE.Mesh(geo.cone, toon(new THREE.Color(color).multiplyScalar(0.85).getHex()));
  m2.scale.set(0.28, h * 0.55, 0.28);
  m2.position.set(x + 0.35, h * 0.27, z + 0.15);
  parent.add(m, m2);
  return box(x, z, 0.9, 0.9);
}

/** Glowing crystal cluster (light-free glow, reads in the dark). */
export function crystals(parent: THREE.Object3D, x: number, z: number, color = 0x9a6cff, seed = 3): void {
  const r = rnd(seed);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geo.cone, glow(color));
    const h = 0.4 + r() * 0.7;
    m.scale.set(0.1 + r() * 0.08, h, 0.1 + r() * 0.08);
    m.position.set(x + (r() - 0.5) * 0.6, h / 2, z + (r() - 0.5) * 0.6);
    m.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
    parent.add(m);
  }
  const pool = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, 0.03, z);
  pool.scale.setScalar(1.3);
  parent.add(pool);
}
