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
