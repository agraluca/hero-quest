import * as THREE from 'three';

/** Geometries/materials reused across stages; never disposed. */
const shared = new WeakSet<object>();

/** 3-step toon ramp shared by every material: soft, rounded "warm toy" look. */
export const ramp = (() => {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared (cached) toon material, for static scenery only. */
export function toon(color: number, emissive = 0, emissiveIntensity = 1): THREE.MeshToonMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, emissive, emissiveIntensity });
    cache.set(key, m);
    shared.add(m);
  }
  return m;
}

/** Fresh toon material, for characters that flash or fade on their own. */
export function toonUnique(color: number, emissive = 0): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp, emissive });
}

export function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

// ---------------------------------------------------------------- disposal

export function markShared(...items: object[]): void {
  for (const i of items) shared.add(i);
}

/** Free GPU resources of a removed subtree (skips shared resources). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (mat && !shared.has(mat)) mat.dispose();
  });
}
