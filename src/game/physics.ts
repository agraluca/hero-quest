import * as THREE from 'three';

/** Axis-aligned rectangle on the ground plane (XZ). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function box(cx: number, cz: number, w: number, d: number): Box {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

export function inBox(x: number, z: number, b: Box, pad = 0): boolean {
  return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
}

/** Push a circle out of every box it overlaps. Mutates `p`. */
export function resolveCircle(p: THREE.Vector3, r: number, boxes: readonly Box[]): boolean {
  let hit = false;
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      // centre inside the box: push out along the shallowest axis
      const left = p.x - b.minX;
      const right = b.maxX - p.x;
      const top = p.z - b.minZ;
      const bottom = b.maxZ - p.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = b.minX - r;
      else if (m === right) p.x = b.maxX + r;
      else if (m === top) p.z = b.minZ - r;
      else p.z = b.maxZ + r;
    }
  }
  return hit;
}

/** Segment (a→b) vs AABB, slab method. */
export function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: Box): boolean {
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [o, d, lo, hi] of [
    [ax, dx, b.minX, b.maxX],
    [az, dz, b.minZ, b.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function lineOfSight(ax: number, az: number, bx: number, bz: number, boxes: readonly Box[]): boolean {
  for (const b of boxes) if (segmentHitsBox(ax, az, bx, bz, b)) return false;
  return true;
}

/** Signed smallest difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Facing angle (rotation.y) for a direction on the XZ plane. */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function approachAngle(cur: number, target: number, maxStep: number): number {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
