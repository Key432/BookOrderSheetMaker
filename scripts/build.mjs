import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'core.mjs', 'favicon.svg', '.nojekyll']) {
  await copyFile(new URL(file, root), new URL(file, dist));
}
console.log(`Static site built: ${fileURLToPath(dist)}`);
