import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist');
const target = path.join(root, 'vercel-build');

await mkdir(target, { recursive: true });

for (const relative of ['sermons', 'bulletins']) {
  await cp(path.join(source, relative), path.join(target, relative), { recursive: true });
}

for (const relative of ['content.css', 'robots.txt', 'sitemap.xml']) {
  await cp(path.join(source, relative), path.join(target, relative));
}

await mkdir(path.join(target, 'assets'), { recursive: true });
for (const relative of ['assets/paju-flower-logo-transparent.png', 'assets/paju-flower-logo.png']) {
  await cp(path.join(source, relative), path.join(target, relative));
}

console.log('Copied generated static content to vercel-build.');
