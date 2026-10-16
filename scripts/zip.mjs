// Packages the production ZIP:
//   /index.html, /assets/*, /fox.webp   <- the runnable build (from dist/)
//   /README.md                           <- run instructions + handoff notes
//   /concept-art/                        <- hero concept art + notes
//   /source/...                          <- readable source to rebuild it
// Fails if the ZIP is larger than the brief's 5,000,000-byte budget.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const ROOT = process.cwd();
const LIMIT = 5_000_000;
const OUT_DIR = join(ROOT, 'release');
const OUT = join(OUT_DIR, 'scrambly-hero-quest.zip');

const SOURCE_ITEMS = ['src', 'public', 'scripts', 'test', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/index.html missing: run `npm run build` first (or `npm run release`).');
  process.exit(1);
}

const files = {};
const add = (zipPath, abs) => {
  files[zipPath] = [readFileSync(abs), { level: 9 }];
};

for (const f of walk(join(ROOT, 'dist'))) add(relative(join(ROOT, 'dist'), f), f);
add('README.md', join(ROOT, 'README.md'));
// art direction: hero turnaround sheets (compressed JPEGs) + notes
for (const f of walk(join(ROOT, 'concept-art'))) add(relative(ROOT, f), f);
for (const item of SOURCE_ITEMS) {
  const abs = join(ROOT, item);
  if (!existsSync(abs)) continue;
  // public/models are build outputs already shipped at /models; don't store them twice
  if (statSync(abs).isDirectory()) {
    for (const f of walk(abs)) if (!relative(ROOT, f).startsWith(join('public', 'models'))) add(join('source', relative(ROOT, f)), f);
  }
  else add(join('source', item), abs);
}

const zip = zipSync(files);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, zip);

const size = zip.byteLength;
const pct = ((size / LIMIT) * 100).toFixed(1);
console.log(`\n${Object.keys(files).length} files -> ${relative(ROOT, OUT)}`);
console.log(`ZIP size: ${size.toLocaleString('en-US')} bytes (${pct}% of the ${LIMIT.toLocaleString('en-US')}-byte budget)`);
if (!files['index.html']) {
  console.error('FAIL: index.html is not at the ZIP root');
  process.exit(1);
}
if (size > LIMIT) {
  console.error('FAIL: ZIP exceeds the 5 MB budget');
  process.exit(1);
}
console.log('OK: index.html at root, within budget');
