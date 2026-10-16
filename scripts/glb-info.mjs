// Dev helper: prints what's inside a .glb (size, meshes, skins, animations, textures)
// usage: node scripts/glb-info.mjs path/to/file.glb [...more]
import { readFileSync, statSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const anims = (json.animations ?? []).map((a) => a.name);
  console.log(`\n${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  console.log(`  meshes ${json.meshes?.length ?? 0}, skins ${json.skins?.length ?? 0}, joints ${json.skins?.[0]?.joints.length ?? 0}, nodes ${json.nodes?.length ?? 0}`);
  console.log(`  images ${(json.images ?? []).map((i) => i.name ?? i.mimeType).join(', ') || '-'}`);
  console.log(`  materials ${(json.materials ?? []).map((m) => m.name).join(', ')}`);
  console.log(`  mesh nodes: ${json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name).join(', ')}`);
  console.log(`  animations (${anims.length}): ${anims.join(', ')}`);
}
