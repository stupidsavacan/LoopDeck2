import { readFile, writeFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'android/app/src/main/assets/loopdeck');
const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const assets = {};

async function collectImages(directory, prefix) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = join(directory, entry.name);
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collectImages(file, path);
    else if (entry.isFile() && mimeTypes[extname(entry.name).toLowerCase()]) {
      assets[path] = `data:${mimeTypes[extname(entry.name).toLowerCase()]};base64,${(await readFile(file)).toString('base64')}`;
    }
  }
}

const indexPath = join(root, 'index.html');
let html = await readFile(indexPath, 'utf8');
if (!html.includes('</head>')) throw new Error('Android web assets must contain an index.html head.');
await collectImages(join(root, 'images'), 'images');
const assetScript = 'loopdeck-image-assets.js';
const scriptTag = `<script src="./${assetScript}"></script>`;
await writeFile(
  join(root, assetScript),
  `globalThis.__LOOPDECK_EMBEDDED_ASSETS__ = Object.freeze(${JSON.stringify(assets).replace(/</g, '\\u003c')});\n`
);
if (!html.includes(scriptTag)) html = html.replace('</head>', `${scriptTag}\n</head>`);
await writeFile(indexPath, html);
console.log(`Embedded ${Object.keys(assets).length} Android image assets for byte-preserving offline export.`);
