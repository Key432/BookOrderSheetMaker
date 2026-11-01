import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'core.mjs', 'sheet.mjs', 'favicon.svg', '.nojekyll']) {
  await copyFile(new URL(file, root), new URL(file, dist));
}
await cp(new URL('vendor/', root), new URL('vendor/', dist), { recursive: true });
console.log(`Static site built: ${fileURLToPath(dist)}`);
