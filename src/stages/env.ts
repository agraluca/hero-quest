import * as THREE from 'three';
import { glow, markShared, toon } from '../game/materials';
import { box, type Box } from '../game/physics';

/** Low-poly scenery helpers. Each one adds meshes to `parent` and returns its collision box where relevant. */

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  torus: new THREE.TorusGeometry(1, 0.12, 10, 32),
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

export function wall(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, h = 1.6, color = 0x4a3a6e): Box {
  const m = new THREE.Mesh(geo.box, toon(color));
  m.scale.set(w, h, d);
  m.position.set(cx, h / 2, cz);
  parent.add(m);
  const cap = new THREE.Mesh(geo.box, toon(new THREE.Color(color).offsetHSL(0, 0, 0.08).getHex()));
  cap.scale.set(w + 0.1, 0.15, d + 0.1);
  cap.position.set(cx, h + 0.07, cz);
  parent.add(cap);
  return box(cx, cz, w, d);
}

export function pillar(parent: THREE.Object3D, x: number, z: number, r = 0.45, h = 2.4, color = 0x5a4a80): Box {
  const m = new THREE.Mesh(geo.cyl, toon(color));
  m.scale.set(r, h, r);
  m.position.set(x, h / 2, z);
  parent.add(m);
  const top = new THREE.Mesh(geo.box, toon(new THREE.Color(color).offsetHSL(0, 0, 0.1).getHex()));
  top.scale.set(r * 2.4, 0.25, r * 2.4);
  top.position.set(x, h, z);
  parent.add(top);
  return box(x, z, r * 2, r * 2);
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

export function barricade(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number): Box {
  const g = new THREE.Group();
  const horizontal = w >= d;
  const len = horizontal ? w : d;
  const n = Math.max(2, Math.round(len / 0.55));
  for (let i = 0; i < n; i++) {
    const plank = new THREE.Mesh(geo.box, toon(i % 2 ? 0x8a5a3a : 0x7a4b32));
    const off = -len / 2 + (len / n) * (i + 0.5);
    plank.scale.set(horizontal ? len / n - 0.05 : 0.35, 1.5 + (i % 3) * 0.12, horizontal ? 0.35 : len / n - 0.05);
    plank.position.set(horizontal ? off : 0, plank.scale.y / 2, horizontal ? 0 : off);
    g.add(plank);
  }
  const beam = new THREE.Mesh(geo.box, toon(0x5a3a2a));
  beam.scale.set(horizontal ? len : 0.45, 0.18, horizontal ? 0.45 : len);
  beam.position.y = 1.0;
  g.add(beam);
  g.position.set(cx, 0, cz);
  parent.add(g);
  return box(cx, cz, w, d);
}

export function rock(parent: THREE.Object3D, x: number, z: number, s = 0.6, color = 0x5a4a80): void {
  const m = new THREE.Mesh(geo.sphere, toon(color));
  m.scale.set(s * 1.2, s * 0.7, s);
  m.position.set(x, s * 0.25, z);
  m.rotation.y = x * 3.1 + z;
  parent.add(m);
}

/** Exit portal: hidden until open(); the stage checks reached(). */
export class Portal {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  private t = 0;
  isOpen = false;

  constructor(parent: THREE.Object3D, readonly pos: THREE.Vector3) {
    this.ring = new THREE.Mesh(geo.torus, glow(0xf58324));
    this.ring.scale.setScalar(1.0);
    this.ring.position.y = 1.2;
    this.disc = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({ color: 0x9a6cff, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }));
    this.disc.position.y = 1.2;
    const base = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({ color: 0xf58324, transparent: true, opacity: 0.35, depthWrite: false }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.04;
    base.scale.setScalar(1.3);
    this.group.add(this.ring, this.disc, base);
    this.group.position.copy(pos);
    this.group.visible = false;
    this.group.scale.setScalar(0.01);
    parent.add(this.group);
  }

  open(): void {
    this.isOpen = true;
    this.group.visible = true;
  }

  update(dt: number): void {
    if (!this.isOpen) return;
    this.t += dt;
    const s = Math.min(this.group.scale.x + dt * 2.5, 1);
    this.group.scale.setScalar(s);
    this.ring.rotation.z += dt * 1.5;
    this.disc.scale.setScalar(0.85 + Math.sin(this.t * 4) * 0.05);
  }

  reached(p: THREE.Vector3): boolean {
    return this.isOpen && this.group.scale.x > 0.9 && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.2;
  }
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

// ---------------------------------------------------------------- castle

/** Stone wall with crenellations along its long side. */
export function castleWall(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, h = 2.2, color = 0x6a6680): Box {
  const b = wall(parent, cx, cz, w, d, h, color);
  const horizontal = w >= d;
  const len = horizontal ? w : d;
  const n = Math.floor(len / 0.9);
  const mat = toon(new THREE.Color(color).offsetHSL(0, 0, 0.06).getHex());
  for (let i = 0; i < n; i += 2) {
    const m = new THREE.Mesh(geo.box, mat);
    const off = -len / 2 + 0.45 + i * 0.9;
    m.scale.set(horizontal ? 0.6 : d + 0.1, 0.45, horizontal ? d + 0.1 : 0.6);
    m.position.set(horizontal ? cx + off : cx, h + 0.35, horizontal ? cz : cz + off);
    parent.add(m);
  }
  return b;
}

export function tower(parent: THREE.Object3D, x: number, z: number, r = 1.1, h = 3.4, color = 0x6a6680, roof = 0x8a1f30): Box {
  const body = new THREE.Mesh(geo.cyl, toon(color));
  body.scale.set(r, h, r);
  body.position.set(x, h / 2, z);
  const cap = new THREE.Mesh(geo.cone, toon(roof));
  cap.scale.set(r * 1.25, 1.6, r * 1.25);
  cap.position.set(x, h + 0.8, z);
  const window = new THREE.Mesh(geo.box, glow(0xffb057));
  window.scale.set(0.22, 0.4, 0.05);
  window.position.set(x, h * 0.7, z + r);
  parent.add(body, cap, window);
  return box(x, z, r * 2, r * 2);
}

export function banner(parent: THREE.Object3D, x: number, z: number, color = 0xf58324, h = 2.0): void {
  const pole = new THREE.Mesh(geo.cyl, toon(0x3a2a20));
  pole.scale.set(0.05, h + 0.6, 0.05);
  pole.position.set(x, (h + 0.6) / 2, z);
  const cloth = new THREE.Mesh(geo.box, toon(color));
  cloth.scale.set(0.7, 1.1, 0.04);
  cloth.position.set(x + 0.38, h - 0.1, z);
  const trim = new THREE.Mesh(geo.box, toon(0xd9a441));
  trim.scale.set(0.72, 0.08, 0.05);
  trim.position.set(x + 0.38, h - 0.62, z);
  parent.add(pole, cloth, trim);
}

// ---------------------------------------------------------------- forest

export function tree(parent: THREE.Object3D, x: number, z: number, s = 1, seed = 7): Box {
  const r = rnd(seed);
  const trunk = new THREE.Mesh(geo.cyl, toon(0x6b4428));
  trunk.scale.set(0.22 * s, 1.4 * s, 0.22 * s);
  trunk.position.set(x, 0.7 * s, z);
  parent.add(trunk);
  const greens = [0x3f7a3a, 0x356b33, 0x4a8a42];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(geo.cone, toon(greens[Math.floor(r() * 3)]));
    const k = (1.25 - i * 0.28) * s;
    c.scale.set(k, 1.25 * s, k);
    c.position.set(x, (1.5 + i * 0.75) * s, z);
    c.rotation.y = r() * Math.PI;
    parent.add(c);
  }
  return box(x, z, 0.6 * s, 0.6 * s);
}

/** Dense row of trees acting as a wall (collider = the box). */
export function treeLine(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, seed = 11): Box {
  const r = rnd(seed);
  const horizontal = w >= d;
  const len = horizontal ? w : d;
  const n = Math.ceil(len / 1.3);
  for (let i = 0; i < n; i++) {
    const off = -len / 2 + (len / n) * (i + 0.5) + (r() - 0.5) * 0.4;
    const side = (r() - 0.5) * (horizontal ? d : w) * 0.6;
    tree(parent, horizontal ? cx + off : cx + side, horizontal ? cz + side : cz + off, 0.9 + r() * 0.45, Math.floor(r() * 1e6));
  }
  return box(cx, cz, w, d);
}

export function bush(parent: THREE.Object3D, x: number, z: number, s = 0.6): void {
  for (const [dx, dz, k] of [
    [0, 0, 1],
    [0.35, 0.1, 0.75],
    [-0.3, 0.15, 0.7],
  ]) {
    const m = new THREE.Mesh(geo.sphere, toon(k === 1 ? 0x4a8a42 : 0x3f7a3a));
    m.scale.set(s * k, s * k * 0.8, s * k);
    m.position.set(x + dx * s * 1.4, s * k * 0.45, z + dz * s * 1.4);
    parent.add(m);
  }
}

export function mushroom(parent: THREE.Object3D, x: number, z: number): void {
  const stem = new THREE.Mesh(geo.cyl, toon(0xfff6e8));
  stem.scale.set(0.06, 0.25, 0.06);
  stem.position.set(x, 0.12, z);
  const cap = new THREE.Mesh(geo.sphere, toon(0xf58324));
  cap.scale.set(0.16, 0.09, 0.16);
  cap.position.set(x, 0.26, z);
  parent.add(stem, cap);
}

/** Mossy standing stones framing a gate. */
export function standingStone(parent: THREE.Object3D, x: number, z: number, h = 2.6): Box {
  const m = new THREE.Mesh(geo.box, toon(0x77778a));
  m.scale.set(0.9, h, 0.8);
  m.position.set(x, h / 2, z);
  m.rotation.y = 0.08;
  const moss = new THREE.Mesh(geo.box, toon(0x4a8a42));
  moss.scale.set(0.95, 0.25, 0.85);
  moss.position.set(x, h - 0.05, z);
  parent.add(m, moss);
  return box(x, z, 0.9, 0.8);
}

// ---------------------------------------------------------------- night camp

/** Wooden palisade of pointed logs (collider = the box). */
export function palisade(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, h = 2.2): Box {
  const horizontal = w >= d;
  const len = horizontal ? w : d;
  const n = Math.ceil(len / 0.42);
  for (let i = 0; i < n; i++) {
    const off = -len / 2 + (len / n) * (i + 0.5);
    const hh = h * (0.9 + ((i * 7) % 5) * 0.04);
    const log = new THREE.Mesh(geo.cyl, toon(i % 2 ? 0x6b4428 : 0x5a3a24));
    log.scale.set(0.21, hh, 0.21);
    const px = horizontal ? cx + off : cx;
    const pz = horizontal ? cz : cz + off;
    log.position.set(px, hh / 2, pz);
    const tip = new THREE.Mesh(geo.cone, toon(0x7a5032));
    tip.scale.set(0.21, 0.35, 0.21);
    tip.position.set(px, hh + 0.17, pz);
    parent.add(log, tip);
  }
  return box(cx, cz, w, d);
}

/** Cover made of stacked crates and barrels (collider = the box). */
export function crates(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, seed = 5): Box {
  const r = rnd(seed);
  const horizontal = w >= d;
  const len = horizontal ? w : d;
  const n = Math.max(2, Math.round(len / 0.75));
  for (let i = 0; i < n; i++) {
    const off = -len / 2 + (len / n) * (i + 0.5);
    const px = horizontal ? cx + off : cx;
    const pz = horizontal ? cz : cz + off;
    if (r() < 0.3) {
      const barrel = new THREE.Mesh(geo.cyl, toon(0x7a4b32));
      barrel.scale.set(0.32, 1.0, 0.32);
      barrel.position.set(px, 0.5, pz);
      const hoop = new THREE.Mesh(geo.cyl, toon(0x3a3440));
      hoop.scale.set(0.34, 0.08, 0.34);
      hoop.position.set(px, 0.75, pz);
      parent.add(barrel, hoop);
    } else {
      const s = 0.62 + r() * 0.1;
      const crate = new THREE.Mesh(geo.box, toon(r() < 0.5 ? 0x9a6a40 : 0x8a5a36));
      crate.scale.setScalar(s);
      crate.position.set(px, s / 2, pz);
      crate.rotation.y = (r() - 0.5) * 0.3;
      parent.add(crate);
      if (r() < 0.55) {
        const top = new THREE.Mesh(geo.box, toon(0x9a6a40));
        top.scale.setScalar(s * 0.85);
        top.position.set(px, s + (s * 0.85) / 2, pz);
        top.rotation.y = (r() - 0.5) * 0.6;
        parent.add(top);
      }
    }
  }
  return box(cx, cz, w, d);
}

export function tent(parent: THREE.Object3D, x: number, z: number, color = 0x7a4b32, s = 1): Box {
  const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), toon(color));
  m.scale.set(1.3 * s, 1.8 * s, 1.3 * s);
  m.position.set(x, 0.9 * s, z);
  m.rotation.y = Math.PI / 4;
  const flap = new THREE.Mesh(geo.box, toon(0x201338));
  flap.scale.set(0.5 * s, 0.9 * s, 0.05);
  flap.position.set(x, 0.45 * s, z + 0.93 * s);
  parent.add(m, flap);
  return box(x, z, 1.8 * s, 1.8 * s);
}

/** Campfire: glowing flame (flickers via the stage torch list) + log ring. */
export function campfire(parent: THREE.Object3D, x: number, z: number): { obj: THREE.Object3D; box: Box } {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stone = new THREE.Mesh(geo.sphere, toon(0x5a566a));
    stone.scale.set(0.16, 0.12, 0.16);
    stone.position.set(Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5);
    g.add(stone);
  }
  const flame = new THREE.Mesh(geo.cone, glow(0xffb057));
  flame.scale.set(0.16, 0.4, 0.16);
  flame.position.y = 0.35;
  const glowDisc = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({ color: 0xf58324, transparent: true, opacity: 0.22, depthWrite: false }));
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.03;
  glowDisc.scale.setScalar(2.2);
  g.add(flame, glowDisc);
  g.userData.flame = flame;
  g.position.set(x, 0, z);
  parent.add(g);
  return { obj: g, box: box(x, z, 1, 1) };
}
